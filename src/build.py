import os
import numpy as np, json, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dog

PTS = 8
rng0 = np.random.default_rng(42)


def tri_sampler(v, f):
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    area = np.linalg.norm(np.cross(b - a, c - a), axis=1) * 0.5
    cdf = np.cumsum(area) / area.sum()
    return a, b, c, cdf, area.sum()


def sample_surface(v, nrm, f, N, rng):
    a, b, c, cdf, _ = tri_sampler(v, f)
    ti = np.minimum(np.searchsorted(cdf, rng.random(N)), len(cdf) - 1)
    u, w = rng.random(N), rng.random(N)
    m = u + w > 1
    u[m], w[m] = 1 - u[m], 1 - w[m]
    p = a[ti] + (b[ti] - a[ti]) * u[:, None] + (c[ti] - a[ti]) * w[:, None]
    n = nrm[f[ti, 0]] * (1 - u - w)[:, None] + nrm[f[ti, 1]] * u[:, None] + nrm[f[ti, 2]] * w[:, None]
    n /= np.linalg.norm(n, axis=1, keepdims=True)
    return p, n


def noise3(p, s, seed):
    r = np.random.default_rng(seed)
    out = np.zeros(len(p))
    for k in range(5):
        w = r.normal(size=3) * s * (1.8 ** k)
        out += np.sin(p @ w + r.random() * 6.28) / (1.7 ** k)
    return out / 1.6


def grow(p, n, A, L0, Lvar, dnK, dfK, bendf, bendg, frizz, wave, clumpN, clumpK, rng, Lextra=None, gdir=np.array([0, -1.0, 0])):
    N = len(p)
    f = A['flow']
    L = L0 * A['L'] * (1 + Lvar * (rng.random(N) * 2 - 1))
    if Lextra is not None:
        L = L * Lextra
    dn = A['dn'] * dnK
    d0 = n * dn[:, None] + f * dfK
    d0 /= np.linalg.norm(d0, axis=1, keepdims=True)
    t = np.linspace(0, 1, PTS)
    pos = np.zeros((N, PTS, 3)); pos[:, 0] = p
    seg = L / (PTS - 1)
    d = d0.copy()
    side = np.cross(n, f); side /= np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-6)
    ph = rng.random(N) * 6.28; wf = 1.0 + rng.random(N) * 1.2
    for k in range(1, PTS):
        d = d + f * bendf + gdir * bendg
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        pos[:, k] = pos[:, k - 1] + d * seg[:, None]
    if wave:
        for k in range(1, PTS):
            tk = t[k]
            pos[:, k] += side * (np.sin(ph + tk * 6.28 * wf) * wave * tk)[:, None] + n * (np.cos(ph * 1.3 + tk * 6.28 * wf) * wave * 0.4 * tk)[:, None]
    if clumpN and N > clumpN:
        from scipy.spatial import cKDTree
        ci = rng.choice(N, clumpN, replace=False)
        tree = cKDTree(p[ci])
        dd, best = tree.query(p, k=1, distance_upper_bound=0.012)
        has = np.isfinite(dd)
        cpos = pos[ci[best[has]]]
        shape = cpos - cpos[:, :1] + pos[has][:, :1]
        w1 = (0.6 * t)[None, :, None]; w2 = (clumpK * t ** 1.6)[None, :, None]
        q = pos[has] * (1 - w1) + shape * w1
        pos[has] = q * (1 - w2) + cpos * w2
        pos[has, 0] = p[has]
    pos += rng.normal(size=pos.shape) * frizz * (t ** 1.3)[None, :, None]
    pos[:, 0] = p
    return pos.astype(np.float32)


t0 = time.time()
# ---------- 形
bv, bn, bf, bvol = dog.mesh_from_sdf(dog.sd_body, [-0.36, -0.01, -0.23], [0.46, 0.40, 0.23], 0.006)
hv, hn, hf, hvol = dog.mesh_from_sdf(dog.sd_head, [0.19, 0.15, -0.14], [0.57, 0.40, 0.14], 0.004)
ev, en, ef, _ = dog.mesh_from_sdf(dog.sd_ear, [-0.03, -0.012, -0.04], [0.03, 0.08, 0.04], 0.0025)
print('mesh', len(bv), len(hv), len(ev), round(time.time() - t0, 1))

parts = {}
def area(v, f):
    return np.linalg.norm(np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]]), axis=1).sum() * 0.5

DENS_G, DENS_U = 23000, 17000   # 1 m² あたりではなく、体の面積に対する本数の基準
A_body = area(bv, bf)
for name, (v, nr, f, part) in {'body': (bv, bn, bf, 'body'), 'head': (hv, hn, hf, 'head'), 'ear': (ev, en, ef, 'ear')}.items():
    ar = area(v, f)
    k = ar / A_body
    if name == 'head': k *= 1.35     # 顔は細かく
    if name == 'ear': k *= 1.4
    NG, NU = int(42000 * k), int(26000 * k)
    rng = np.random.default_rng(hash(name) % 1000)
    pg, ng = sample_surface(v, nr, f, NG, rng)
    pu, nu = sample_surface(v, nr, f, NU, rng)
    if name == 'head':   # 口吻の先は短い毛を密に
        for _ in range(2):
            qg, qn = sample_surface(v, nr, f, NG, rng); mk_ = qg[:, 0] > 0.44
            pg = np.vstack([pg, qg[mk_]]); ng = np.vstack([ng, qn[mk_]])
            qg, qn = sample_surface(v, nr, f, NU, rng); mk_ = qg[:, 0] > 0.44
            pu = np.vstack([pu, qg[mk_]]); nu = np.vstack([nu, qn[mk_]])
        NG, NU = len(pg), len(pu)
    Ag = dog.region_attrs(part, pg, ng); Au = dog.region_attrs(part, pu, nu)
    if name == 'ear':
        Ag['flow'] = np.tile([0, 1.0, 0], (NG, 1)); Au['flow'] = np.tile([0, 1.0, 0], (NU, 1))
    g = grow(pg, ng, Ag, 0.036, 0.12, 1.0, 0.98, 0.07, 0.04, 0.00012, 0.00015, max(1, NG // 12), 0.3, rng)
    tuft = np.clip((noise3(pu, 14, 77) - 0.45) * 2.2, 0, 1) * Au['loose']
    u = grow(pu, nu, Au, 0.016, 0.25, 1.6, 0.75, 0.03, 0.03, 0.0003, 0.0006, 0, 0, rng, Lextra=1 + 1.5 * tuft)
    if name == 'head':
        # 口の中に入る毛は、そこで止める
        for arr_ in (g, u):
            qm = arr_.copy(); qm[..., 1] -= 6.0 * qm[..., 2] ** 2
            hit = np.linalg.norm((qm - dog.MOUTH_C) / (dog.MOUTH_R + [0.004, 0.003, 0.004]), axis=2) < 1.0
            hit[:, 0] = hit[:, 0] & False
            first = np.where(hit.any(1), np.maximum(hit.argmax(1), 1), arr_.shape[1])
            rootin = np.linalg.norm((qm[:, 0] - dog.MOUTH_C) / (dog.MOUTH_R + [0.006, 0.005, 0.005]), axis=1) < 1.0
            first[rootin] = 1
            for k in range(1, arr_.shape[1]):
                m_ = first <= k
                arr_[m_, k] = arr_[m_, k - 1]
        for E in dog.EYES:
            for arr_ in (g, u):
                Dd = dog.EYE_DIR[0] if E[2] > 0 else dog.EYE_DIR[1]
                v_ = arr_ - E; r_ = np.linalg.norm(v_, axis=2)
                front = np.sum(v_ * Dd, axis=2) / np.maximum(r_, 1e-6)
                hit = (r_ < dog.EYE_R + 0.006) & (front > -0.35)
                hit[:, 0] = False
                # 目にかかる点から先は、その手前の点で止める（毛が目を覆わない）
                first = np.where(hit.any(1), hit.argmax(1), arr_.shape[1])
                for k in range(1, arr_.shape[1]):
                    m_ = first <= k
                    arr_[m_, k] = arr_[m_, k - 1]
    def _ao(pts, nrm):
        off = dog.HEAD_OFF
        def W(q):
            if part == 'head':
                return np.minimum(dog.sd_head(q - off), q[:, 1] + 0.002)
            return np.minimum(np.minimum(dog.sd_body(q), dog.sd_head(q - off)), q[:, 1] + 0.002)
        base = pts + (off if part == 'head' else 0)
        occ = np.zeros(len(pts))
        for i_, dd in enumerate((0.01, 0.02, 0.035, 0.055, 0.08)):
            occ += np.maximum(0, dd - W(base + nrm * dd)) / dd * (0.6 ** i_)
        return np.clip(1 - (0.32 if part == 'head' else 0.5) * occ, 0.5 if part == 'head' else 0.4, 1.0)
    if part == 'ear':
        vao = np.where(nr[:, 0] > 0.2, 0.55 + 0.45 * np.clip(v[:, 1] / 0.06, 0, 1), 1.0)
        gao = np.where(ng[:, 0] > 0.2, 0.55 + 0.45 * np.clip(pg[:, 1] / 0.06, 0, 1), 1.0)
        uao = np.where(nu[:, 0] > 0.2, 0.55 + 0.45 * np.clip(pu[:, 1] / 0.06, 0, 1), 1.0)
    else:
        vao = _ao(v.astype(np.float64), nr.astype(np.float64)); gao = _ao(pg, ng); uao = _ao(pu, nu)
    if part == 'head':
        vk = dog.lip_dark(v.astype(np.float64)); gk = dog.lip_dark(g[:, 0].astype(np.float64)); uk = dog.lip_dark(u[:, 0].astype(np.float64))
        g[:] = g[:, :1] + (g - g[:, :1]) * (1 - 0.75 * gk)[:, None, None]
        u[:] = u[:, :1] + (u - u[:, :1]) * (1 - 0.75 * uk)[:, None, None]
    else:
        vk = np.zeros(len(v)); gk = np.zeros(len(g)); uk = np.zeros(len(u))
    _va = dog.region_attrs(part, v.astype(np.float64), nr.astype(np.float64))
    vc = _va['cream']; vl = _va['L']
    parts[name] = dict(vk=vk, gk=gk, uk=uk, vao=vao, gao=gao, uao=uao, vc=vc, vl=vl, v=v, n=nr, f=f, g=g, u=u, gc=Ag['cream'], uc=Au['cream'], gs=Ag['sens'], us=Au['sens'], ul=Au['loose'] * (0.3 + 0.7 * tuft), tuft=tuft)
    print(name, NG, NU, round(time.time() - t0, 1))

# ---------- ひげ（頭のローカル座標の前に、口吻の横から）
rng = np.random.default_rng(9)
wh = []
for s in (1, -1):
    for i in range(9):
        row, col_ = i % 3, i // 3
        rx, ry = 0.495 + col_ * 0.006 + rng.random() * 0.002, 0.243 + row * 0.005 + rng.random() * 0.002
        zs = np.linspace(0.08, 0.0, 1601); pp = np.stack([np.full_like(zs, rx), np.full_like(zs, ry), zs * s], -1)
        k_ = np.argmax(dog.sd_head(pp) < 0); root = pp[k_] + np.array([0, 0, 0.0015 * s])
        d = np.array([0.1 + rng.random() * 0.3, -0.1 + rng.random() * 0.2, s * 0.95])
        d /= np.linalg.norm(d); L = 0.055 + rng.random() * 0.03
        pts = [root]
        for k in range(1, PTS):
            d = d + np.array([0.04, -0.06, 0]); d /= np.linalg.norm(d)
            pts.append(pts[-1] + d * L / (PTS - 1))
        wh.append(pts)
    for i in range(4):  # 眉のひげ
        root = np.array([0.405 + rng.random() * 0.01, 0.325 + rng.random() * 0.01, s * (0.03 + rng.random() * 0.012)])
        d = np.array([0.6, 0.5, s * 0.6]); d /= np.linalg.norm(d); L = 0.035 + rng.random() * 0.015
        pts = [root]
        for k in range(1, PTS):
            d = d + np.array([0.05, -0.08, 0]); d /= np.linalg.norm(d)
            pts.append(pts[-1] + d * L / (PTS - 1))
        wh.append(pts)
wh = np.array(wh, np.float32)

np.savez_compressed('dog_v2.npz', **{f'{k}_{a}': parts[k][a] for k in parts for a in parts[k]}, whisk=wh, vols=np.array([bvol, hvol]))
print('done', round(time.time() - t0, 1), {k: (len(parts[k]['g']), len(parts[k]['u'])) for k in parts})
