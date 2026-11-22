"""柴犬の形（three.js 座標：y が上、+x が頭、z が横）と、全身の毛を作る。"""
import numpy as np
from skimage.measure import marching_cubes

HP = np.array([0.27, 0.25, 0.0])  # 首の回転の中心


def ell(p, c, r):
    q = (p - c) / r
    k0 = np.linalg.norm(q, axis=-1)
    k1 = np.linalg.norm(q / r, axis=-1)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)


def cap(p, a, b, ra, rb):
    a, b = np.asarray(a, float), np.asarray(b, float)
    pa, ba = p - a, b - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return np.linalg.norm(pa - h[..., None] * ba, axis=-1) - (ra + (rb - ra) * h)


def smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def absz(p):
    q = p.copy()
    q[..., 2] = np.abs(q[..., 2])
    return q


HEAD_OFF = np.array([-0.035, 0.085, 0.0])   # 頭を上げる（首を起こす）


def body_parts(p):
    """伏せの体の部品ごとの距離（ゆるくつなぐ前）"""
    pz = absz(p)
    P = {}
    P['torso'] = smin(ell(p, [-0.04, 0.122, 0], [0.20, 0.098, 0.112]), ell(p, [0.10, 0.15, 0], [0.11, 0.125, 0.108]), 0.07)
    P['chest'] = ell(p, [0.19, 0.15, 0], [0.088, 0.152, 0.125])                              # 首の下から床までの胸
    P['neck'] = smin(cap(p, [0.15, 0.20, 0], [0.235, 0.335, 0], 0.10, 0.088), ell(p, [0.185, 0.315, 0], [0.07, 0.06, 0.08]), 0.04)
    P['butt'] = ell(p, [-0.20, 0.125, 0], [0.075, 0.09, 0.095])
    P['thigh'] = ell(pz, [-0.15, 0.112, 0.082], [0.118, 0.10, 0.072])
    P['hpaw'] = smin(cap(pz, [-0.12, 0.028, 0.125], [-0.02, 0.022, 0.125], 0.027, 0.022), ell(pz, [-0.005, 0.021, 0.124], [0.03, 0.02, 0.026]), 0.015)
    P['uarm'] = cap(pz, [0.17, 0.15, 0.08], [0.16, 0.048, 0.076], 0.044, 0.031)
    P['farm'] = cap(pz, [0.16, 0.03, 0.074], [0.38, 0.024, 0.074], 0.025, 0.019)
    P['fpaw'] = smin(ell(pz, [0.405, 0.022, 0.074], [0.032, 0.021, 0.029]), np.minimum(np.minimum(ell(pz, [0.428, 0.03, 0.064], [0.013, 0.017, 0.0095]), ell(pz, [0.43, 0.03, 0.08], [0.013, 0.017, 0.0095])), np.minimum(ell(pz, [0.421, 0.028, 0.05], [0.012, 0.015, 0.009]), ell(pz, [0.423, 0.028, 0.095], [0.012, 0.015, 0.009]))), 0.004)
    P['tail'] = smin(smin(cap(p, [-0.215, 0.18, 0], [-0.235, 0.27, 0.025], 0.058, 0.06), cap(p, [-0.235, 0.27, 0.025], [-0.15, 0.30, 0.07], 0.06, 0.052), 0.03),
                     cap(p, [-0.15, 0.30, 0.07], [-0.09, 0.255, 0.095], 0.052, 0.035), 0.03)
    return P


def sd_body(p):
    P = body_parts(p)
    d = P['torso']
    d = smin(d, P['chest'], 0.06)
    d = smin(d, P['neck'], 0.05)
    d = smin(d, P['butt'], 0.05)
    d = smin(d, P['thigh'], 0.045)
    d = smin(d, P['uarm'], 0.04)
    d = smin(d, P['farm'], 0.02)
    d = smin(d, P['fpaw'], 0.015)
    d = smin(d, P['hpaw'], 0.02)
    d = smin(d, P['tail'], 0.035)
    return np.maximum(d, 0.004 - p[..., 1])


def body_label(p):
    P = body_parts(p)
    keys = list(P)
    D = np.stack([P[k] for k in keys], 0)
    return np.array(keys)[np.argmin(D, 0)]


MOUTH_C = np.array([0.484, 0.217, 0.0])
MOUTH_R = np.array([0.044, 0.021, 0.038])


def sd_head(p):
    pz = absz(p)
    d = ell(p, [0.325, 0.296, 0], [0.085, 0.070, 0.088])                       # 頭（てっぺんを平らに）
    d = smin(d, ell(pz, [0.355, 0.262, 0.054], [0.064, 0.056, 0.060]), 0.045)  # ほっぺ（幅広く）
    d = smin(d, ell(p, [0.442, 0.257, 0], [0.066, 0.037, 0.046]), 0.035)       # 口吻
    d = smin(d, ell(p, [0.474, 0.252, 0], [0.032, 0.031, 0.036]), 0.02)        # 口吻の先を太く丸く
    d = smin(d, cap(p, [0.392, 0.282, 0], [0.486, 0.270, 0], 0.028, 0.022), 0.03)  # 鼻すじ
    d = smin(d, ell(pz, [0.468, 0.243, 0.021], [0.04, 0.021, 0.03]), 0.02)   # 上くちびる（丸く張る）
    d = smin(d, ell(p, [0.432, 0.192, 0], [0.054, 0.021, 0.037]), 0.025)       # 下あご（厚く、大きく開けて下げる）
    d = smin(d, ell(p, [0.375, 0.205, 0], [0.075, 0.034, 0.05]), 0.035)        # 下あごの付け根（喉と頬へつなぐ）
    d = smin(d, ell(p, [0.29, 0.27, 0], [0.065, 0.07, 0.075]), 0.04)           # 首へつなぐ
    # 口を開ける：上くちびると下あごの間をくり抜く（口角は少し上がる）
    q = p.copy(); q[..., 1] = q[..., 1] - 6.0 * q[..., 2] ** 2
    d = np.maximum(d, -ell(q, MOUTH_C, MOUTH_R))
    return d


def front_x(y, z, x0=0.56, x1=0.30):
    xs = np.linspace(x0, x1, 5201)
    pp = np.stack([xs, np.full_like(xs, y), np.full_like(xs, z)], -1)
    return float(xs[np.argmax(sd_head(pp) < 0)])


def sdf_normal(f, q, e=1e-4):
    q = np.asarray(q, float)[None]
    g = np.array([f(q + [e, 0, 0]) - f(q - [e, 0, 0]), f(q + [0, e, 0]) - f(q - [0, e, 0]), f(q + [0, 0, e]) - f(q - [0, 0, e])])[:, 0]
    return g / np.linalg.norm(g)


EAR_BASE = np.array([0.300, 0.356, 0.052])
EAR_ROT = (0.32, 0.0, -0.32)
EYE_R = 0.0106
EYES, EYE_DIR = [], []
for _s in (1, -1):
    _fx = front_x(0.303, 0.032 * _s)
    _c = np.array([_fx - 0.0048, 0.303, 0.032 * _s])
    _n = sdf_normal(sd_head, [_fx, 0.303, 0.032 * _s])
    _d = 0.4 * _n + 0.6 * np.array([1.0, 0.02, 0.3 * _s]); _d /= np.linalg.norm(_d)
    EYES.append(_c); EYE_DIR.append(_d)
NOSE = np.array([front_x(0.264, 0.0) - 0.004, 0.264, 0.0])


def _on_surface(pts):
    out = []
    for q in pts:
        dirn = np.array([1.0, 0.0, 2.2 * q[2]]); dirn /= np.linalg.norm(dirn)
        ts = np.linspace(0.12, -0.05, 3401)
        pp = np.asarray(q) + ts[:, None] * dirn
        k = np.argmax(sd_head(pp) < 0)
        out.append(pp[k] + dirn * 0.0012)
    return np.array(out)


def _lip(sign):
    out = []
    for z in np.linspace(-0.033, 0.033, 23):
        k = np.sqrt(max(0.0, 1 - (z / MOUTH_R[2]) ** 2))
        y = MOUTH_C[1] + 6.0 * z ** 2 + sign * MOUTH_R[1] * k * 0.95
        out.append([0.40, y, z])
    return _on_surface(out)


def _rim():
    out = []
    for th in np.linspace(0, 2 * np.pi, 41)[:-1]:
        z = MOUTH_R[2] * 0.97 * np.cos(th)
        y = MOUTH_C[1] + 6.0 * z ** 2 + MOUTH_R[1] * 0.97 * np.sin(th)
        xs = np.linspace(0.56, 0.38, 3601)
        f = 0.97
        for _ in range(12):
            yy = MOUTH_C[1] + 6.0 * (z * f / 0.97) ** 2 + MOUTH_R[1] * f * np.sin(th)
            pp = np.stack([xs, np.full_like(xs, yy), np.full_like(xs, z * f / 0.97)], -1)
            ins = sd_head(pp) < 0
            if ins.any():
                break
            f *= 0.92
        k = np.argmax(ins)
        out.append([xs[k] + 0.0008, yy, z * f / 0.97])
    return np.array(out)


MOUTH_RIM = _rim()
MOUTH_RIM = MOUTH_RIM[MOUTH_RIM[:, 0] > 0.43]
MOUTH_UP = MOUTH_RIM[:21]
MOUTH_LO = MOUTH_RIM[20:]
MOUTH = MOUTH_UP
PHILTRUM = _on_surface([[0.48, 0.254, 0.0], [0.48, 0.247, 0.0], [0.49, MOUTH_C[1] + MOUTH_R[1] * 0.95 + 0.001, 0.0]])


def sd_ear(p):
    """耳：ローカル座標（根元が原点、y が耳先、x が前、z が外）。平たい三角すい。"""
    h = 0.062
    y = np.clip(p[..., 1] / h, 0, 1)
    r = 0.037 * (1 - y) ** 1.1 + 0.005
    q = np.stack([p[..., 0] / 0.68, p[..., 2]], -1)
    d2 = np.linalg.norm(q, axis=-1) - r
    return np.maximum(np.maximum(d2 * 0.45, -p[..., 1] - 0.01), p[..., 1] - h)


def mesh_from_sdf(sdf, b0, b1, s):
    b0, b1 = np.array(b0), np.array(b1)
    n = np.ceil((b1 - b0) / s).astype(int) + 1
    xs = [b0[i] + np.arange(n[i]) * s for i in range(3)]
    X, Y, Z = np.meshgrid(*xs, indexing='ij')
    pts = np.stack([X, Y, Z], -1)
    F = sdf(pts.reshape(-1, 3)).reshape(n)
    v, f, nr, _ = marching_cubes(F, 0.0, spacing=(s, s, s))
    v = v + b0
    # 法線は SDF の勾配から
    e = s * 0.5
    g = np.stack([sdf(v + [e, 0, 0]) - sdf(v - [e, 0, 0]), sdf(v + [0, e, 0]) - sdf(v - [0, e, 0]), sdf(v + [0, 0, e]) - sdf(v - [0, 0, e])], -1)
    g /= np.linalg.norm(g, axis=1, keepdims=True)
    # marching_cubes の向きを外向きにそろえる
    tri_n = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    if np.mean(np.sum(tri_n * g[f[:, 0]], 1)) < 0:
        f = f[:, ::-1]
    return v.astype(np.float32), g.astype(np.float32), f.astype(np.int32), float((F < 0).sum() * s ** 3)


def sm(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def region_attrs(part, p, n):
    """部位ごとの：毛の長さ倍率・クリーム（裏白）・流れの向き・痛がりやすさ・浮いた毛の倍率"""
    N = len(p)
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    az = np.abs(z)
    L = np.ones(N); cream = sm(-0.1, -0.45, n[:, 1]); sens = np.full(N, 0.6); loose = np.ones(N)
    flow = np.tile([-1.0, -0.5, 0.0], (N, 1)); dn = np.full(N, 0.32)
    if part == 'body':
        lab = body_label(p)
        tail, neck, chest = lab == 'tail', lab == 'neck', lab == 'chest'
        arm = np.isin(lab, ['uarm', 'farm']); paw = np.isin(lab, ['fpaw', 'hpaw'])
        thigh, butt = lab == 'thigh', lab == 'butt'
        L[:] = 0.6; dn[:] = 0.15
        # 体の横の白は下の2割だけ、境目はぼかす
        cream = sm(-0.35, -0.7, n[:, 1])
        L[neck] = 0.75; flow[neck] = [-0.4, -1, 0]; sens[neck] = 1.0
        cream = np.maximum(cream, np.where(neck, sm(0.0, 0.4, n[:, 0]) * sm(0.105, 0.065, az), 0))
        L[chest] = 0.75; flow[chest] = [0, -1, 0]; sens[chest] = 1.1
        cream = np.maximum(cream, np.where(chest, sm(0.15, 0.6, n[:, 0]) * sm(0.11, 0.06, az), 0))
        L[thigh] = 0.65; sens[thigh] = 0.8
        cream = np.maximum(cream, np.where(thigh, sm(-0.2, -0.6, n[:, 1]), 0))
        L[butt] = 1.0; sens[butt] = 1.9; loose[butt] = 0.8
        cream = np.maximum(cream, np.where(butt, sm(-0.3, -0.75, n[:, 0]), 0))  # 太ももの裏
        L[arm] = 0.3; sens[arm] = 2.1; loose[arm] = 0.15; flow[arm] = [0.6, -1, 0]
        # 前脚：前と外が赤、後ろと内側が白
        cream = np.maximum(cream, np.where(arm, np.maximum(sm(-0.1, -0.6, n[:, 0]), sm(-0.1, -0.6, n[:, 2] * np.sign(z))), 0))
        L[paw] = 0.22; sens[paw] = 2.2; loose[paw] = 0; flow[paw] = [1, -0.3, 0]
        cream[paw] = 0.95
        L[tail] = 1.15; dn[tail] = 0.4; sens[tail] = 2.4; loose[tail] = 0.5
        flow[tail] = [-0.3, 0.2, 0.6]
        cream = np.maximum(cream, np.where(tail & (n[:, 1] < -0.8), 0.8, 0))
    elif part == 'head':
        L[:] = 0.16; sens[:] = 2.8; loose[:] = 0.06; flow[:] = [-1, -0.15, 0]; dn[:] = 0.12
        cheek = (x > 0.31) & (y < 0.285)
        L[cheek] = 0.62 * (1 - sm(0.39, 0.45, x[cheek]) * 0.55) * (1 + 0.5 * sm(0.27, 0.245, y[cheek])); flow[cheek] = np.c_[-np.ones(cheek.sum()) * 0.7, -np.ones(cheek.sum()) * 0.5, np.sign(z[cheek]) * 0.6]
        muz = (x > 0.405) & (y < 0.292)
        L[muz] = 0.2 + 0.25 * (1 - sm(0.43, 0.49, x[muz])); flow[muz] = [-1, 0, 0]
        cream = np.maximum(cream, np.where(muz & ((az > 0.017 - 0.03 * np.clip(x - 0.455, 0, 1)) | (y < 0.256) | (x > 0.475)), 0.97, 0))
        yth = 0.281 + 0.4 * np.clip(az - 0.03, 0, 0.05)
        cream = np.maximum(cream, np.where(x > 0.33, sm(yth + 0.016, yth - 0.018, y) * sm(0.33, 0.37, x), 0))
        cream = np.maximum(cream, np.where((n[:, 1] < -0.2), 1.0, 0))
        # 目のまわりと鼻先は毛を短く
        for s in (1, -1):
            de = np.linalg.norm(p - EYES[0 if s > 0 else 1], axis=1)
            L *= np.clip((de - 0.011) / 0.012, 0.12, 1.0) * 0.5 + np.where(de > 0.023, 0.5, np.clip((de - 0.011) / 0.012, 0.12, 1.0) * 0.5)
        L = np.minimum(L, 0.16 + np.clip(0.515 - x, 0, 1) * 3.0)
        qm = p.copy(); qm[:, 1] -= 6.0 * qm[:, 2] ** 2
        inm = np.linalg.norm((qm - MOUTH_C) / (MOUTH_R + [0.006, 0.005, 0.005]), axis=1) < 1.0
        L[inm] = 0.02
        # 麻呂眉（目の上のクリームの点）
        for s in (1, -1):
            dd = np.linalg.norm(p - [EYES[0][0] - 0.006, 0.322, 0.026 * s], axis=1)
            cream = np.maximum(cream, sm(0.011, 0.002, dd) * 1.0)
    elif part == 'ear':
        L[:] = 0.28; sens[:] = 2.8; loose[:] = 0; flow[:] = [0, 1, 0]; dn[:] = 0.3
        cream = np.where(n[:, 0] > 0.35, 0.5, 0.0)  # 内側
    f = flow - n * np.sum(flow * n, 1, keepdims=True)
    f /= np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-6)
    return dict(L=L, cream=np.clip(cream, 0, 1), sens=sens, loose=loose, flow=f, dn=dn)


def _seg_dist(p, pts):
    best = np.full(len(p), 1e9)
    for a, b in zip(pts[:-1], pts[1:]):
        ab = b - a; t = np.clip(((p - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
        best = np.minimum(best, np.linalg.norm(p - (a + t[:, None] * ab), axis=1))
    return best


def lip_dark(p):
    """唇（開口部の縁）と鼻の下の溝の黒さ 0〜1。頭の座標（体の座標系）で。"""
    rim = np.vstack([MOUTH_RIM, MOUTH_RIM[:1]])
    cy = MOUTH_C[1]
    d = _seg_dist(p, rim)
    lower = p[:, 1] < cy - 0.004
    w = np.where(lower, 0.0068, 0.0075)          # 唇の黒い縁（写真に合わせて太め）
    # 口角は細くして消す
    corner = sm(MOUTH_R[2] * 0.8, MOUTH_R[2] * 1.08, np.abs(p[:, 2]))
    k = sm(w, w * 0.3, d) * (1 - corner * 0.7)
    # 鼻の下から上唇まで：中央の溝を太く黒く、その両脇もやや黒く
    ph = np.vstack([NOSE + [0.0, -0.007, 0.0], PHILTRUM[-1]])
    dph = _seg_dist(p, ph)
    k2 = sm(0.0045, 0.0008, dph)
    k3 = sm(0.02, 0.008, np.abs(p[:, 2])) * sm(0.006, 0.0, p[:, 1] - (NOSE[1] - 0.004)) * sm(0.45, 0.48, p[:, 0]) * sm(MOUTH_C[1] + 0.004, MOUTH_C[1] + 0.014, p[:, 1]) * 0.9
    return np.clip(np.maximum(np.maximum(k, k2), k3), 0, 1)
