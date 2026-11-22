import os
import numpy as np, json, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dog
D = np.load('dog_v2.npz')
HP = dog.HP
chunks, meta, off = [], {"parts": {}}, 0


def add(arr, name, store):
    global off
    b = np.ascontiguousarray(arr).tobytes()
    pad = (-off) % 4
    if pad:
        chunks.append(b'\0' * pad); off += pad
    store[name] = [off, str(arr.dtype), list(arr.shape)]
    chunks.append(b); off += len(b)


RS = 0.6
for part in ('body', 'head', 'ear'):
    m = {}
    v, n, f = D[f'{part}_v'].copy(), D[f'{part}_n'], D[f'{part}_f']
    g, u = D[f'{part}_g'].copy(), D[f'{part}_u'].copy()
    if part == 'head':
        v -= HP; g -= HP; u -= HP
    add(np.round(v / RS * 32767).astype('<i2'), 'v', m)
    add(np.round(n * 127).astype('i1'), 'n', m)
    add(f.astype('<u2'), 'f', m)
    add(np.round(D[f'{part}_vc'] * 255).astype('u1'), 'vc', m)
    for kk in ('vk', 'gk', 'uk'): add(np.round(np.clip(D[f'{part}_{kk}'], 0, 1) * 255).astype('u1'), kk, m)
    for kk in ('vao', 'gao', 'uao'): add(np.round(np.clip(D[f'{part}_{kk}'], 0, 1) * 255).astype('u1'), kk, m)
    add(np.round(np.clip(D[f'{part}_vl'] / 2, 0, 1) * 255).astype('u1'), 'vl', m)
    for key, arr in (('g', g), ('u', u)):
        d = arr[:, 1:] - arr[:, :1]
        os_ = float(np.abs(d).max()) * 1.001
        m[key + 'os'] = os_
        add(np.round(arr[:, 0] / RS * 32767).astype('<i2'), key + 'r', m)
        add(np.round(d / os_ * 127).astype('i1'), key + 'd', m)
    add(np.round(D[f'{part}_gc'] * 255).astype('u1'), 'gc', m)
    add(np.round(D[f'{part}_uc'] * 255).astype('u1'), 'uc', m)
    add(np.round(np.clip(D[f'{part}_us'] / 3, 0, 1) * 255).astype('u1'), 'us', m)
    add(np.round(np.clip(D[f'{part}_gs'] / 3, 0, 1) * 255).astype('u1'), 'gs', m)
    add(np.round(np.clip(D[f'{part}_ul'], 0, 1) * 255).astype('u1'), 'ul', m)
    meta['parts'][part] = m
wh = D['whisk'] - HP
add(wh.astype('<f4'), 'whisk', meta)
meta['nose'] = (dog.NOSE - HP).tolist(); meta['mouthRim'] = (dog.MOUTH_RIM - HP).tolist(); meta['mouthUp'] = (dog.MOUTH_UP - HP).tolist(); meta['mouthLo'] = (dog.MOUTH_LO - HP).tolist(); meta['mouthC'] = (dog.MOUTH_C - HP).tolist(); meta['mouthR'] = dog.MOUTH_R.tolist(); meta['philtrum'] = (dog.PHILTRUM - HP).tolist(); meta['earRot'] = list(dog.EAR_ROT); meta['eyes'] = [(e - HP).tolist() for e in dog.EYES]; meta['eyeDir'] = [e.tolist() for e in dog.EYE_DIR]; meta['eyeR'] = dog.EYE_R; meta['rs'] = RS; meta['pts'] = 8; meta['vol'] = float(D['vols'].sum()); meta['hp'] = HP.tolist(); meta['hpos'] = (HP + dog.HEAD_OFF).tolist(); meta['ear'] = dog.EAR_BASE.tolist()
data = b''.join(chunks)
open('dog.bin', 'wb').write(data)
json.dump(meta, open('dog.json', 'w'))
print(len(data))
