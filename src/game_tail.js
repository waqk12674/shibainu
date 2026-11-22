const SND_SRC = __SND__;
// ================= ゲーム =================
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const G = { angerK: 0.8, decay: 0.10, irrit: 0.006, radius: 0.03, fluff: 5, slowSp: 400, moveK: 0.33, holdK: 0.1, time: 60, flEvery: 4.5, flLife: 8, flMax: 2, bonusU: 90, showMeter: false, noAnger: false };
// 引く速さ（画面の px/秒）→ 痛さの倍率。100px/秒で約0.55、300で約1.05、650で約1.9、1480以上で4
const spFactor = sp => Math.min(4, 0.3 + sp / G.slowSp);
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cv = $('c');

// ---- つかめる部位（体・頭・耳）
const PARTS = [{ p: body, parent: dog, name: 'body' }, { p: head, parent: headP, name: 'head' }, ...ears.map((eg, i) => ({ p: earParts[i], parent: eg, name: 'ear' }))];
for (const P_ of PARTS) {
  const g = P_.p.base.geometry, pos = g.attributes.position.array, nr = g.attributes.normal.array, L = g.attributes.aLen.array, q = new Float32Array(pos.length);
  for (let v = 0; v < pos.length / 3; v++) { const off = 0.004 + 0.011 * L[v]; for (let c = 0; c < 3; c++) q[v * 3 + c] = pos[v * 3 + c] + nr[v * 3 + c] * off; }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(q, 3)); pg.setIndex(g.index); pg.computeBoundingSphere();
  P_.pick = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })); P_.pick.userData.part = P_; P_.parent.add(P_.pick);
}
// ---- しっぽを立てる（怒りのサイン）：体の面・層・毛に「しっぽらしさ」aTW を持たせ、体の材質だけ uTailW = 1
// ponytail: つかむ判定（pick）は動かさない。立てている間はしっぽの見た目とつかむ所が少しずれる（怒りかけで抜く場面は少ないため）
{
  const m = META.parts.body, vt = arr(m.vt);
  body.base.geometry.setAttribute('aTW', new THREE.BufferAttribute(Float32Array.from(vt, x => x / 255), 1));
  for (const [g, k] of [[body.ug, 'ut'], [body.gg, 'gt']]) {
    const w = arr(m[k]), N = g.userData.N, a = new Float32Array(N * PTS * 2);
    for (let s = 0; s < N; s++) a.fill(w[s] / 255, s * PTS * 2, (s + 1) * PTS * 2);
    g.setAttribute('aTW', new THREE.BufferAttribute(a, 1));
  }
  const geos = new Set([body.base.geometry, body.ug, body.gg]);
  for (const ms of dog.children) if (ms.isMesh && geos.has(ms.geometry) && ms.material.isShaderMaterial) {
    if (ms.material.uniforms === U) { const o = ms.material; ms.material = new THREE.ShaderMaterial({ uniforms: Object.assign({}, U, { uTailW: { value: 1 } }), vertexShader: o.vertexShader, fragmentShader: o.fragmentShader, transparent: o.transparent, depthWrite: o.depthWrite, side: o.side }); }
    else ms.material.uniforms.uTailW = { value: 1 };
  }
}
let totalUnits = 0;
for (const P_ of PARTS) totalUnits += P_.p.ug.userData.N + 0.3 * P_.p.gg.userData.N;

// ---- 引いている房（抜く毛をそのまま引っぱって見せる）
let pull = null;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function setAlive(geo, list, val) { const a = geo.attributes.aAlive.array; for (const s of list) a.fill(val, s * PTS * 2, (s + 1) * PTS * 2); geo.attributes.aAlive.needsUpdate = true; }
function pointerWorld(cx, cy, depthPoint) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
  const p = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera), dir = p.sub(camera.position).normalize();
  const n = camera.getWorldDirection(new THREE.Vector3()), d = n.dot(depthPoint.clone().sub(camera.position)) / n.dot(dir);
  return camera.position.clone().addScaledVector(dir, d);
}
function toScreen(v) { const p = v.clone().project(camera); return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 }; }
function pick(e) {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const h = ray.intersectObjects(PARTS.map(p => p.pick))[0]; return h;
}
function gather(geo, center, R, prob, list, info, cap = 700) {
  const pos = geo.userData.pos, N = geo.userData.N, alive = geo.attributes.aAlive.array, sens = geo.userData.sens, loose = geo.userData.loose;
  for (let s = 0; s < N; s++) {
    const b = s * PTS * 3, dx = pos[b] - center.x, dy = pos[b + 1] - center.y, dz = pos[b + 2] - center.z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > R * R * 2.2) continue;
    const w = Math.exp(-d2 / (R * R) * 1.0);
    info.tot = (info.tot || 0) + w; if (alive[s * PTS * 2] === 0) continue; info.al = (info.al || 0) + w;
    if (Math.random() > w * prob) continue;
    list.push(s); info.sens += sens ? sens[s] / 255 * 3 : 1; info.loose += loose ? loose[s] / 255 : 0; info.n++;
    if (list.length > cap) return;
  }
}
// ---- ピンチでズーム（スマホ）。2本目の指が触れたら抜くのをやめ、指を全部離すまで抜けない
const touches = new Map(); let pinch = null, orbit = null;
document.addEventListener('gesturechange', e => e.preventDefault());   // iPhone の Safari でページごと拡大しない
const tDist = () => { const [a, b] = touches.values(); return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
cv.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });   // タッチは押した要素に自動で捕まる
  if (touches.size === 2 && state === 'play') { if (pull) endPull({ pointerId: pull.id }); orbit = null; pinch = { d0: tDist(), z0: zoomU }; }
});
cv.addEventListener('pointermove', e => {
  const t = touches.get(e.pointerId); if (!t) return;
  t.x = e.clientX; t.y = e.clientY;
  if (pinch && touches.size >= 2) zoomU = Math.max(0.45, Math.min(1.2, pinch.z0 * pinch.d0 / tDist()));
});
const endTouch = e => { touches.delete(e.pointerId); if (touches.size === 0) pinch = null; };
cv.addEventListener('pointerup', endTouch); cv.addEventListener('pointercancel', endTouch);
cv.addEventListener('pointerdown', e => {
  if (state !== 'play' || pull || pinch || touches.size > 1) return;
  const h = pick(e), fs = floaterAt(e.clientX, e.clientY);
  if (!h && !fs) { orbit = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (er) {} return; }   // 柴犬以外を押したら、ドラッグで回す
  const P_ = fs ? fs.P : h.object.userData.part, local = fs ? fs.c.clone() : P_.parent.worldToLocal(h.point.clone());
  // 毛の根元へ寄せる（つかんだ点から面へ）。浮き毛は、浮いた先を押しても根元ごとつかむ
  const flo = fs || (P_.name === 'body' ? floaters.find(f => !f.grab && f.c.distanceTo(local) < f.r * 1.3) : null);
  if (flo) { flo.grab = true; flo.tuft.mesh.visible = false; setAlive(P_.p.ug, flo.uL, 255); setAlive(P_.p.gg, flo.gL, 255); local.copy(flo.c); }
  const R = flo ? flo.r : G.radius * (P_.name === 'ear' ? 0.5 : P_.name === 'head' ? 0.7 : 1);
  const ui = { sens: 0, loose: 0, n: 0 }, gi = { sens: 0, loose: 0, n: 0 };
  const uL = [], gL = [];
  gather(P_.p.ug, local, R, 1.0, uL, ui, flo ? 3000 : 700);
  gather(P_.p.gg, local, R, flo ? 0.6 : 0.35, gL, gi, flo ? 3000 : 700);
  const n = ui.n + gi.n;
  // 部位（顔・耳は痛い）と、まわりの毛の残り具合（薄いほど痛い）で敏感さが上がる
  const left = Math.min(1, ((ui.al || 0) + (gi.al || 0)) / Math.max(1e-6, (ui.tot || 0) + (gi.tot || 0)));
  const partK = P_.name === 'ear' ? 1.8 : P_.name === 'head' ? 1.5 : 1;
  const sens = (n ? (ui.sens + gi.sens) / n : 1.5) * partK * (1 + 2.5 * Math.pow(1 - left, 1.5)) * (flo ? 0.5 : 1);
  const tight = flo ? 0.05 : ui.n > 8 ? 1 - ui.loose / ui.n : 0.85;   // 浮き毛はするっと抜ける
  // 引く房をつくる
  const tuft = makeTuft(P_, uL, gL);
  pull = { id: e.pointerId, P: P_, local, uL, gL, n, sens, tight, left, tuft, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, sp: 0, req: 30 + 105 * Math.pow(tight, 1.3), floater: flo };
  setAlive(P_.p.ug, uL, 0); setAlive(P_.p.gg, gL, 0);
  cv.setPointerCapture(e.pointerId); idleT = 0; audioInit();
});
cv.addEventListener('pointermove', e => {
  if (pull && e.pointerId === pull.id) { pull.x = e.clientX; pull.y = e.clientY; }
  if (orbit && e.pointerId === orbit.id && !pinch) {   // つかんだ床ごと回す向き。画面の幅いっぱいで約半周
    az += (e.clientX - orbit.x) * Math.PI / innerWidth; el = Math.max(0.15, Math.min(1.1, el + (e.clientY - orbit.y) * 1.6 / innerHeight));
    orbit.x = e.clientX; orbit.y = e.clientY;
  }
});
const endPull = e => {
  if (!pull || e.pointerId !== pull.id) return;
  setAlive(pull.P.p.ug, pull.uL, 255); setAlive(pull.P.p.gg, pull.gL, 255);   // 抜けなかった毛は元に戻る
  const fl = pull.floater; if (fl) { fl.grab = false; fl.tuft.mesh.visible = true; setAlive(pull.P.p.ug, fl.uL, 0); setAlive(pull.P.p.gg, fl.gL, 0); }
  pull.P.parent.remove(pull.tuft.mesh); pull.tuft.mesh.geometry.dispose(); pull.tuft.mesh.material.dispose(); pull = null;
};
cv.addEventListener('pointerup', endPull); cv.addEventListener('pointercancel', endPull);
const endOrbit = e => { if (orbit && e.pointerId === orbit.id) orbit = null; };
cv.addEventListener('pointerup', endOrbit); cv.addEventListener('pointercancel', endOrbit);

const tuftU = Object.assign({}, U, { uW0: { value: P.w0 * 5 }, uSun: { value: 0.7 }, uSpec: { value: 0.3 }, uOpac: { value: 0.85 } });
function makeTuft(P_, uL, gL, creamAll) {
  // 見た目は1本を4本に増やして、つまんだ束らしく見せる（量の計算は元の本数）
  const src = [...uL.map(s => [P_.p.ug, s, 1]), ...gL.map(s => [P_.p.gg, s, 0])], K = 4;
  const N = src.length * K, pos = new Float32Array(N * PTS * 3), cream = new Uint8Array(N), typ = new Uint8Array(N);
  let i = 0;
  for (const [g, s, t] of src) {
    const o = g.userData.pos.subarray(s * PTS * 3, (s + 1) * PTS * 3), cr = g.userData.cream ? g.userData.cream[s] : 0;
    for (let k = 0; k < K; k++, i++) {
      const jx = k ? (Math.random() - 0.5) * 0.008 : 0, jy = k ? (Math.random() - 0.5) * 0.008 : 0, jz = k ? (Math.random() - 0.5) * 0.008 : 0, ls = k ? 0.8 + Math.random() * 0.35 : 1;
      for (let p = 0; p < PTS; p++) { const b = i * PTS * 3 + p * 3; for (let c = 0; c < 3; c++) pos[b + c] = o[c] + (o[p * 3 + c] - o[c]) * ls + (c === 0 ? jx : c === 1 ? jy : jz); }
      cream[i] = creamAll == null ? cr : creamAll; typ[i] = t;
    }
  }
  const geo = ribbon(pos, N, 1, cream, null, null);
  const rt = geo.attributes.aRT.array; for (let s = 0; s < N; s++) if (!typ[s]) for (let v = s * PTS * 2; v < (s + 1) * PTS * 2; v++) rt[v] -= 2;
  const mat = new THREE.ShaderMaterial({ uniforms: tuftU, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 13; mesh.frustumCulled = false; P_.parent.add(mesh);
  const off = new Float32Array(N * 3); for (let j = 0; j < N * 3; j++) off[j] = (Math.random() - 0.5) * 0.014;
  return { mesh, orig: pos.slice(), N, off };
}
const _v = new THREE.Vector3();
function updateTuft(q, pinchL, stretch) {
  const T = q.tuft, P3 = T.mesh.geometry.attributes.position.array, TA = T.mesh.geometry.attributes.aTan.array, O = T.orig;
  const b = Math.min(1, stretch);
  for (let s = 0; s < T.N; s++) {
    const r0 = s * PTS * 3, rx = O[r0], ry = O[r0 + 1], rz = O[r0 + 2];
    const px = pinchL.x + T.off[s * 3] * (1 - 0.5 * b), py = pinchL.y + T.off[s * 3 + 1] * (1 - 0.5 * b), pz = pinchL.z + T.off[s * 3 + 2] * (1 - 0.5 * b);
    const ex = O[r0 + (PTS - 1) * 3], ey = O[r0 + (PTS - 1) * 3 + 1], ez = O[r0 + (PTS - 1) * 3 + 2];
    const cx = rx + (ex - rx) * 0.5, cy = ry + (ey - ry) * 0.5, cz = rz + (ez - rz) * 0.5;
    let lx = rx, ly = ry, lz = rz;
    for (let i = 0; i < PTS; i++) {
      const t = i / (PTS - 1), k = r0 + i * 3;
      const qx = (1 - t) * (1 - t) * rx + 2 * t * (1 - t) * cx + t * t * px, qy = (1 - t) * (1 - t) * ry + 2 * t * (1 - t) * cy + t * t * py, qz = (1 - t) * (1 - t) * rz + 2 * t * (1 - t) * cz + t * t * pz;
      const w = b * Math.min(1, t * 2.5);
      const x = O[k] + (qx - O[k]) * w, y = O[k + 1] + (qy - O[k + 1]) * w, z = O[k + 2] + (qz - O[k + 2]) * w;
      for (let sd = 0; sd < 2; sd++) { const v = (s * PTS + i) * 2 + sd; P3[v * 3] = x; P3[v * 3 + 1] = y; P3[v * 3 + 2] = z; }
      if (i > 0) { let tx = x - lx, ty = y - ly, tz = z - lz; const l = Math.hypot(tx, ty, tz) || 1; for (const ii of [i - 1, i]) for (let sd = 0; sd < 2; sd++) { const v = (s * PTS + ii) * 2 + sd; TA[v * 4] = tx / l * 127; TA[v * 4 + 1] = ty / l * 127; TA[v * 4 + 2] = tz / l * 127; } }
      lx = x; ly = y; lz = z;
    }
  }
  T.mesh.geometry.attributes.position.needsUpdate = true; T.mesh.geometry.attributes.aTan.needsUpdate = true;
}
function pullUpdate(dt) {
  if (!pull) return;
  const q = pull, mx = q.x - q.lx, my = q.y - q.ly, moved = Math.hypot(mx, my), inst = moved / Math.max(dt, 1e-3);
  q.sp += (inst - q.sp) * Math.min(1, dt * 15); q.lx = q.x; q.ly = q.y;
  const dx = q.x - q.x0, dy = q.y - q.y0, dist = Math.hypot(dx, dy), stretch = dist / q.req;
  // ゆっくり引くほど気づかれにくい：怒りは「指を動かした分 × 速さ」でたまる（時間ではない）。止めて引っぱったままだと少しずつ
  // 引く向き（毛の流れ）では痛さを変えない（わかりにくいため。2026-11-22 運営者）
  q.spF = spFactor(q.sp);
  const pain = q.sens * (0.1 + 0.9 * q.tight * q.tight);
  if (!G.noAnger) anger += pain * 0.16 * G.angerK * (G.moveK * (moved / q.req) * q.spF + G.holdK * dt * Math.min(1.2, stretch));
  const rootW = q.P.parent.localToWorld(q.local.clone());
  const pinchW = pointerWorld(q.x, q.y, rootW), pinchL = q.P.parent.worldToLocal(pinchW.clone());
  updateTuft(q, pinchL, Math.min(1, stretch * 1.15));
  if (dist >= q.req) pop(q, pinchW);
}
const flying = [];
function pop(q, pinchW) {
  const units = q.uL.length + 0.3 * q.gL.length, frac = units / totalUnits;
  if (!G.noAnger) { anger += (0.03 * q.sens * q.tight + 0.01) * G.angerK * Math.min(1.6, 0.5 + 0.5 * (q.spF || 1)); irrit += G.irrit * q.sens * G.angerK; }
  plucks++;
  // 地の毛（層）も薄くする
  const bg = q.P.p.base.geometry, bp = bg.attributes.position.array, bd = bg.attributes.aDens.array, R = G.radius * (q.P.name === 'head' ? 0.7 : 1);
  for (let v = 0; v < bd.length; v++) { const dx = bp[v * 3] - q.local.x, dy = bp[v * 3 + 1] - q.local.y, dz = bp[v * 3 + 2] - q.local.z, d2 = dx * dx + dy * dy + dz * dz; if (d2 < R * R * 2) bd[v] = Math.max(0.15, bd[v] - 0.55 * Math.exp(-d2 / (R * R) * 2)); }
  bg.attributes.aDens.needsUpdate = true;
  const mesh = q.tuft.mesh; mesh.updateMatrixWorld(); const geo = mesh.geometry;
  const N = q.tuft.N, from = new Float32Array(N * PTS * 3), P3 = geo.attributes.position.array, v3 = new THREE.Vector3();
  for (let s = 0; s < N; s++) for (let i = 0; i < PTS; i++) { v3.fromArray(P3, ((s * PTS + i) * 2) * 3).applyMatrix4(mesh.matrixWorld); v3.toArray(from, (s * PTS + i) * 3); }
  scene.add(mesh); mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);
  const addV = frac * G.fluff * META.vol * (q.floater ? 1.5 : 1); pileV += addV;
  const cs = clumpShape(from, N, addV);
  flying.push({ mesh, t: 0, from, to: cs.to, c: cs.c, rc: cs.rc, cur: new Float32Array(from.length), addV });
  for (let i = 0; i < 6 + Math.min(20, q.n / 15); i++) spawn({ kind: 'mote', p: pinchW.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.02 + Math.random() * 0.05, (Math.random() - 0.5) * 0.08), age: 0, life: 2.5 + Math.random() * 2.5, size: 0.003 + Math.random() * 0.004, col: [1, 0.95, 0.85], a: 0.8 });
  pull = null;
  if (q.n < 6) { sfx.empty(); flash('もう抜ける毛がない'); } else { sfx.pluck(frac > 0.002); }
  if (q.sens > 2.6) { flash('キャン…'); sfx.yelp(); } else if (q.left < 0.45) flash('そこはもう毛が薄い…');
  if (q.floater) {
    removeFloater(q.floater, false);
    const b = Math.max(0, Math.min(6, Math.round(units / G.bonusU) - 3));
    if (b) { timeLeft += b; sfx.bonus(); $('timer').animate([{ transform: 'scale(1.35)', color: '#c4501d' }, { transform: 'scale(1)' }], { duration: 600, easing: 'ease-out' }); }
    flash(b ? `ごっそり！ ＋${b}秒` : 'ごっそり！');
  }
}
// ---- 浮き毛：白っぽく浮いた房がときどき出る。数秒で寝てしまう。大きい塊を抜くと時間がのびる
const floaters = []; let flT = 0;
function spawnFloater() {
  const P_ = PARTS[0], ug = P_.p.ug, gg = P_.p.gg, N = ug.userData.N, pos = ug.userData.pos, sens = ug.userData.sens, alive = ug.attributes.aAlive.array;
  for (let tries = 0; tries < 60; tries++) {
    const s = Math.floor(Math.random() * N), b = s * PTS * 3;
    if (sens[s] / 255 * 3 > 1.15 || alive[s * PTS * 2] === 0 || ug.userData.cream[s] > 90) continue;   // 背中・首・太ももの赤い毛の所だけ（痛くなく、白い房が目立つ所）
    const c = new THREE.Vector3(pos[b], pos[b + 1], pos[b + 2]);
    if (floaters.some(f => f.c.distanceTo(c) < f.r + 0.1)) continue;
    const r = 0.042 + Math.random() * 0.036, uL = [], gL = [], info = { sens: 0, loose: 0, n: 0 };
    gather(ug, c, r * 0.9, 0.8, uL, info, 3000); gather(gg, c, r * 0.9, 0.4, gL, info, 3000);
    if (uL.length < 30) continue;
    setAlive(ug, uL, 0); setAlive(gg, gL, 0);
    const n = new THREE.Vector3(pos[b + 3] - pos[b], pos[b + 4] - pos[b + 1], pos[b + 5] - pos[b + 2]).normalize().add(new THREE.Vector3(0, 0.6, 0)).normalize();
    const tuft = makeTuft(P_, uL, gL, 255); for (let j = 0; j < tuft.off.length; j++) tuft.off[j] *= r / 0.009;   // 先をふわっと広げる
    floaters.push({ P: P_, c, r, n, uL, gL, tuft, age: 0, ph: Math.random() * 6.28, mt: 0, grab: false });
    return;
  }
}
// 画面で、浮き毛の根元から先までの線に指が近いか（体からはみ出た先を押したときも取れるように）
function floaterAt(x, y) {
  for (const f of floaters) {
    if (f.grab || !f.tip) continue;
    const bw = f.P.parent.localToWorld(f.c.clone()), bd = bw.distanceTo(camera.position);   // 体の裏側（見えない所）の浮き毛は取らない
    ray.set(camera.position, bw.clone().sub(camera.position).normalize());
    const hit = ray.intersectObjects(PARTS.map(p => p.pick))[0]; if (hit && hit.distance < bd - 0.05) continue;
    const a = toScreen(bw), b = toScreen(f.P.parent.localToWorld(f.tip.clone()));
    const vx = b.x - a.x, vy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy || 1)));
    if (Math.hypot(x - a.x - vx * t, y - a.y - vy * t) < Math.max(28, Math.hypot(vx, vy) * 0.6)) return f;
  }
  return null;
}
function removeFloater(f, restore) {
  floaters.splice(floaters.indexOf(f), 1);
  f.P.parent.remove(f.tuft.mesh); f.tuft.mesh.geometry.dispose(); f.tuft.mesh.material.dispose();
  if (restore) { setAlive(f.P.p.ug, f.uL, 255); setAlive(f.P.p.gg, f.gL, 255); }
}
function updateFloaters(dt) {
  if (state === 'play') { flT -= dt; if (flT <= 0) { if (floaters.length < G.flMax) spawnFloater(); flT = G.flEvery * (0.7 + Math.random() * 0.6); } }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; if (f.grab) continue;
    f.age += dt;
    if (f.age >= G.flLife || state !== 'play') { removeFloater(f, true); continue; }
    const k = sm(0, 0.6, f.age) * sm(G.flLife, G.flLife - 0.9, f.age), w = Math.sin(tNow * 2.1 + f.ph) * 0.006;
    const tip = f.c.clone().addScaledVector(f.n, 0.035 + 0.45 * f.r).add(new THREE.Vector3(w, 0, w * 0.7));
    updateTuft(f, tip, 0.85 * k); f.tip = f.c.clone().lerp(tip, 0.85 * k);
    if ((f.mt -= dt) <= 0 && k > 0.5) { f.mt = 0.25; spawn({ kind: 'mote', p: f.P.parent.localToWorld(tip.clone()), v: new THREE.Vector3((Math.random() - 0.5) * 0.03, 0.02 + Math.random() * 0.03, (Math.random() - 0.5) * 0.03), age: 0, life: 1.6, size: 0.0035, col: [1, 0.97, 0.9], a: 0.8 }); }
  }
}
function setStrands(geo, pts, N) {
  const P3 = geo.attributes.position.array, TA = geo.attributes.aTan.array;
  for (let s = 0; s < N; s++) for (let i = 0; i < PTS; i++) {
    const k = (s * PTS + i) * 3, a = (s * PTS + Math.max(0, i - 1)) * 3, b = (s * PTS + Math.min(PTS - 1, i + 1)) * 3;
    let tx = pts[b] - pts[a], ty = pts[b + 1] - pts[a + 1], tz = pts[b + 2] - pts[a + 2]; const l = Math.hypot(tx, ty, tz) || 1;
    for (let sd = 0; sd < 2; sd++) { const v = (s * PTS + i) * 2 + sd; P3[v * 3] = pts[k]; P3[v * 3 + 1] = pts[k + 1]; P3[v * 3 + 2] = pts[k + 2]; TA[v * 4] = tx / l * 127; TA[v * 4 + 1] = ty / l * 127; TA[v * 4 + 2] = tz / l * 127; }
  }
  geo.attributes.position.needsUpdate = true; geo.attributes.aTan.needsUpdate = true;
}
// 抜いた房を、細く縮れた綿のような塊にして、毛の山（地面に座ったこんもりした形）に積む
function clumpShape(from, N, addV) {
  const R = Math.max(0.012, Math.cbrt(3 * pileV / (4 * Math.PI))), C = ballPos(R);
  const rc = Math.max(0.012, Math.cbrt(3 * addV / (4 * Math.PI)) * 0.85);
  // 毛玉は丸く：球の表面のどこか（床に埋まる真下は除く）に付けていく
  let u; do { u = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1); } while (u.lengthSq() > 1 || u.lengthSq() < 0.05 || u.y < -0.5 * Math.sqrt(u.lengthSq()));
  u.normalize(); const c = C.clone().addScaledVector(u, Math.max(0, R - rc * 0.45)); c.y = Math.max(rc * 0.6, c.y);
  const to = new Float32Array(from.length);
  for (let s = 0; s < N; s++) {
    const b = s * PTS * 3;
    let u; do { u = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1); } while (u.lengthSq() > 1 || u.lengthSq() < 0.1);
    u.normalize(); const p = c.clone().addScaledVector(u, rc * (0.75 + 0.5 * Math.random()));
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), seg = rc * (0.08 + 0.1 * Math.random());
    for (let i = 0; i < PTS; i++) {
      to[b + i * 3] = p.x; to[b + i * 3 + 1] = p.y; to[b + i * 3 + 2] = p.z;
      dir.x += (Math.random() - 0.5) * 2.2; dir.y += (Math.random() - 0.5) * 2.2; dir.z += (Math.random() - 0.5) * 2.2;   // よく縮れる
      const off = p.clone().sub(c), ol = off.length(); off.normalize();
      if (ol > rc * 1.5) dir.addScaledVector(off, -1.2); else if (ol < rc * 0.7) dir.addScaledVector(off, 1.2);
      dir.normalize(); p.addScaledVector(dir, seg); if (p.y < 0.003) p.y = 0.003;
    }
  }
  return { to, c, rc };
}
// 綿の塊：詰まった中身と、ふちが透けてやわらかい外側
const blobGeo = new THREE.IcosahedronGeometry(1, 3);
const cottonVS = `uniform float uSeed; varying vec3 vN, vW, vP; 
float hh(vec3 p){ p=fract(p*0.3183+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float nz(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f); return mix(mix(mix(hh(i),hh(i+vec3(1,0,0)),f.x),mix(hh(i+vec3(0,1,0)),hh(i+vec3(1,1,0)),f.x),f.y),mix(mix(hh(i+vec3(0,0,1)),hh(i+vec3(1,0,1)),f.x),mix(hh(i+vec3(0,1,1)),hh(i+vec3(1,1,1)),f.x),f.y),f.z); }
void main(){ vec3 q = position * 1.6 + uSeed; float d = (nz(q) - 0.5) * 0.45 + (nz(q * 2.7) - 0.5) * 0.3 + (nz(q * 6.0) - 0.5) * 0.15; vec3 p = position * (1.0 + d);
  vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; vP = p; gl_Position = projectionMatrix * viewMatrix * w; }`;
const cottonFS = `precision highp float; uniform vec3 uL, uF, uPileC; uniform float uPileR, uSoft; varying vec3 vN, vW, vP;
float hh(vec3 p){ p=fract(p*0.3183+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float nz(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f); return mix(mix(mix(hh(i),hh(i+vec3(1,0,0)),f.x),mix(hh(i+vec3(0,1,0)),hh(i+vec3(1,1,0)),f.x),f.y),mix(mix(hh(i+vec3(0,0,1)),hh(i+vec3(1,0,1)),f.x),mix(hh(i+vec3(0,1,1)),hh(i+vec3(1,1,1)),f.x),f.y),f.z); }
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  if (dot(N, V) < 0.0) N = -N;
  float fib = nz(vW * 900.0) * 0.5 + nz(vW * vec3(2300.0, 700.0, 1900.0)) * 0.35 + nz(vW * 240.0) * 0.4;
  vec3 col = vec3(0.86, 0.75, 0.59) * (0.86 + 0.22 * fib) * mix(vec3(1.0), vec3(1.04, 1.0, 0.95), nz(vW * 60.0));
  vec3 out_ = normalize(vW - uPileC); float crev = smoothstep(-0.4, 0.6, dot(N, out_));
  float depth = smoothstep(0.35, 1.0, length(vW - uPileC) / max(uPileR, 0.01));
  float ao = mix(0.76, 1.0, crev * 0.3 + depth * 0.7) * mix(0.72, 1.0, smoothstep(0.0, 0.06, vW.y));
  float l = 0.62 + 0.3 * clamp(dot(N, uL) * 0.5 + 0.5, 0.0, 1.0) + 0.18 * clamp(dot(N, uF) * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = col * l * ao * 1.12;
  float a = 1.0;
  if (uSoft > 0.5) { float ed = abs(dot(N, V)); a = smoothstep(0.0, 0.9, ed) * smoothstep(0.25, 0.95, fib) * 0.9; c *= 1.04; if (a < 0.02) discard; }
  gl_FragColor = vec4(c, a);
}`;
const pileU = { uPileC: { value: new THREE.Vector3() }, uPileR: { value: 0.05 } };
function cottonMat(soft, seed) { return new THREE.ShaderMaterial({ uniforms: Object.assign({ uSeed: { value: seed }, uSoft: { value: soft } }, pileU, U), vertexShader: cottonVS, fragmentShader: cottonFS, transparent: !!soft, depthWrite: !soft, side: soft ? THREE.FrontSide : THREE.FrontSide }); }
function addCotton(c, rc) {
  const seed = Math.random() * 50, out = [];
  for (let j = 0; j < 2; j++) {
    const o = j ? new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.3 - 0.1, Math.random() - 0.5).multiplyScalar(rc * 0.8) : new THREE.Vector3(), sc = rc * (j ? 0.6 + Math.random() * 0.2 : 0.95);
    const inner = new THREE.Mesh(blobGeo, cottonMat(0, seed + j * 7)); inner.position.copy(c).add(o); inner.scale.set(sc * (0.9 + 0.5 * Math.random()), sc * (0.75 + 0.3 * Math.random()), sc * (0.9 + 0.5 * Math.random())); inner.rotation.y = Math.random() * 6.28; inner.renderOrder = 1;
    const soft = new THREE.Mesh(blobGeo, cottonMat(1, seed + j * 7)); soft.position.copy(inner.position); soft.scale.copy(inner.scale).multiplyScalar(1.35); soft.rotation.copy(inner.rotation); soft.renderOrder = 8;
    scene.add(inner, soft); out.push(inner, soft);
  }
  return out;
}
function updateFlying(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i]; f.t += dt / 0.65; const t = Math.min(1, f.t), e = t * t * (3 - 2 * t), hop = Math.sin(t * Math.PI) * 0.1;
    for (let j = 0; j < f.cur.length; j++) f.cur[j] = f.from[j] + (f.to[j] - f.from[j]) * e + (j % 3 === 1 ? hop : 0);
    setStrands(f.mesh.geometry, f.cur, f.mesh.geometry.userData.N);
    if (t >= 1) {
      const g = f.mesh.geometry; setStrands(g, f.to, g.userData.N);
      const TA = g.attributes.aTan.array, RT = g.attributes.aRT.array;
      for (let s = 0; s < g.userData.N; s++) { const cr = Math.round((0.32 + Math.random() * 0.3) * 127); for (let v = s * PTS * 2; v < (s + 1) * PTS * 2; v++) { TA[v * 4 + 3] = cr; RT[v] = 2 + (RT[v] % 1); } }
      g.attributes.aRT.needsUpdate = true;
      f.mesh.renderOrder = 9; f.mesh.material.dispose(); f.mesh.material = pileMat; pile.push(f.mesh, ...addCotton(f.c, f.rc)); flying.splice(i, 1); ballVolTarget += f.addV; sfx.puff(); }
  }
}

// ---- 毛玉：抜いた房をそのまま積み重ねてふくらませる
const pileMat = new THREE.ShaderMaterial({ uniforms: Object.assign({}, U, { uW0: { value: P.w0 * 2.2 }, uSun: { value: 0.7 }, uSpec: { value: 0.1 }, uOpac: { value: 1.1 } }), vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
const pile = []; let pileV = 0, ballVolShown = 0, ballVolTarget = 0, ballR = 0.006;
const ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false })); ballShadow.rotation.x = -Math.PI / 2; scene.add(ballShadow);
function ballPos(r) { return new THREE.Vector3(-0.08 - r * 0.3, r, -0.36 - r * 1.2); }
function updateBall(dt) {
  ballVolShown += (ballVolTarget - ballVolShown) * Math.min(1, dt * 6);
  ballR = Math.max(0.006, Math.cbrt(3 * ballVolShown / (4 * Math.PI)));
  const bp = ballPos(ballR); pileU.uPileC.value.copy(bp); pileU.uPileR.value = ballR * 1.15;
  ballShadow.position.set(bp.x, 0.005, bp.z); ballShadow.scale.set(ballR * 3, ballR * 3, 1); ballShadow.visible = ballVolShown > 1e-7;
}

// ---- 舞う毛の粒
const MAXP = 500, pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(MAXP * 3), pSize = new Float32Array(MAXP), pAlpha = new Float32Array(MAXP), pCol = new Float32Array(MAXP * 3);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1)); pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1)); pGeo.setAttribute('aCol', new THREE.BufferAttribute(pCol, 3));
const pMat = new THREE.ShaderMaterial({ uniforms: { uPxS: { value: 500 } }, transparent: true, depthWrite: false,
  vertexShader: `attribute float aSize, aAlpha; attribute vec3 aCol; uniform float uPxS; varying float vA; varying vec3 vC; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=max(1.0,aSize*uPxS/-mv.z); gl_Position=projectionMatrix*mv; vA=aAlpha; vC=aCol; }`,
  fragmentShader: `varying float vA; varying vec3 vC; void main(){ vec2 d=gl_PointCoord-0.5; float a=smoothstep(0.5,0.05,length(d))*vA; if(a<0.01) discard; gl_FragColor=vec4(vC,a); }` });
const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; points.renderOrder = 50; scene.add(points);
const parts = [];
function spawn(o) { if (parts.length >= MAXP) parts.shift(); parts.push(o); }
for (let i = 0; i < 40; i++) spawn({ kind: 'dust', p: new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 0.8, (Math.random() - 0.5) * 1.6), v: new THREE.Vector3(), life: 1e9, age: Math.random() * 10, size: 0.003 + Math.random() * 0.003, col: [1, 0.97, 0.9], a: 0.3 });
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.age += dt;
    if (q.kind === 'dust') { q.p.x += Math.sin(q.age * 0.3 + i) * dt * 0.01; q.p.y += Math.sin(q.age * 0.21 + i * 2) * dt * 0.008; q.p.z += Math.cos(q.age * 0.27 + i) * dt * 0.01; }
    else { q.v.y += (0.006 - q.v.y) * dt; q.v.x += Math.sin(q.age * 2 + i) * dt * 0.02; q.p.addScaledVector(q.v, dt); if (q.age > q.life) { parts.splice(i, 1); continue; } }
  }
  pGeo.setDrawRange(0, parts.length);
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i]; pPos[i * 3] = q.p.x; pPos[i * 3 + 1] = q.p.y; pPos[i * 3 + 2] = q.p.z; pSize[i] = q.size;
    let a = q.a; if (q.kind === 'mote') a *= Math.min(1, q.age * 3) * Math.max(0, 1 - q.age / q.life); else a *= 0.6 + 0.4 * Math.sin(q.age * 0.8 + i);
    pAlpha[i] = a; pCol[i * 3] = q.col[0]; pCol[i * 3 + 1] = q.col[1]; pCol[i * 3 + 2] = q.col[2];
  }
  for (const k of ['position', 'aSize', 'aAlpha', 'aCol']) pGeo.attributes[k].needsUpdate = true;
}

// ---- 音（すべて合成）
let AC = null, muted = LS.get('shiba_muted', false), growl = null;
function audioInit() {
  if (AC) { AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  const master = AC.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(AC.destination); AC.master = master;
  const nb = AC.createBuffer(1, AC.sampleRate, AC.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; AC.noise = nb;
  const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 72;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
  const g = AC.createGain(); g.gain.value = 0; const lfo = AC.createOscillator(); lfo.frequency.value = 11; const lg = AC.createGain(); lg.gain.value = 0;
  lfo.connect(lg); lg.connect(g.gain); o.connect(lp); lp.connect(g); g.connect(master); o.start(); lfo.start(); growl = { g, lg, o };
  for (const [k, b64] of Object.entries(SND_SRC)) {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
    AC.decodeAudioData(bin).then(buf => { SND[k] = buf; if (k === 'growl' || k === 'pant') startLoop(k); }).catch(() => {});
  }
}
const SND = {}, LOOP = {};
function startLoop(k) {
  const s = AC.createBufferSource(); s.buffer = SND[k]; s.loop = true; if (k === 'growl') { s.loopStart = 0.4; s.loopEnd = SND[k].duration; }
  const g = AC.createGain(); g.gain.value = 0; s.connect(g); g.connect(AC.master); s.start(0, k === 'growl' ? 0.4 : 0); LOOP[k] = g;
}
function playS(k, vol = 1, rate = 1) {
  if (!AC || !SND[k]) return false;
  const s = AC.createBufferSource(); s.buffer = SND[k]; s.playbackRate.value = rate; const g = AC.createGain(); g.gain.value = vol; s.connect(g); g.connect(AC.master); s.start(); return true;
}
function noiseHit(freq, q, dur, vol, type = 'bandpass', t0 = 0) {
  if (!AC) return; const t = AC.currentTime + t0, s = AC.createBufferSource(); s.buffer = AC.noise;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = AC.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.012, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f); f.connect(g); g.connect(AC.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function tone(f0, f1, dur, vol, type = 'sine', t0 = 0) {
  if (!AC) return; const t = AC.currentTime + t0, o = AC.createOscillator(), g = AC.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(AC.master); o.start(t); o.stop(t + dur + 0.05);
}
// 息のような雑音：なだらかに立ち上がり、フィルターを f0→f1 へ動かす（毛がこすれて抜ける音）
function swish(t0, dur, vol, f0, f1, type, q, att) {
  if (!AC) return; const t = AC.currentTime + t0, s = AC.createBufferSource(); s.buffer = AC.noise;
  const f = AC.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f); f.connect(g); g.connect(AC.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
const sfx = {
  // ファサッ：「ファ」はやわらかく立ち上がる息、「サッ」は高い音で短く切れる。細かいこすれを散らす
  pluck(big) {
    const v = big ? 1 : 0.7, r = 0.9 + Math.random() * 0.2;
    swish(0, 0.2, 0.2 * v, 1600 * r, 3800 * r, 'bandpass', 0.7, 0.08);
    swish(0.09, 0.15, 0.16 * v, 5200 * r, 7500 * r, 'highpass', 0.7, 0.025);
    for (let i = 0; i < 6; i++) noiseHit(3500 + Math.random() * 4000, 2.5, 0.025, 0.04 * v, 'bandpass', 0.02 + Math.random() * 0.17);
  },
  // 毛玉に着いたとき：小さくやわらかい「ふわっ」（急に立ち上がると打撃の音に聞こえる）
  puff() { swish(0, 0.3, 0.045, 2200, 1100, 'bandpass', 0.6, 0.08); },
  yelp() { playS('yelp', 0.9, 0.95 + Math.random() * 0.15); },
  bark() { if (playS('bark', 1.0)) return; noiseHit(700, 1.5, 0.22, 0.6); tone(420, 180, 0.2, 0.45, 'square'); tone(260, 120, 0.25, 0.3, 'sawtooth', 0.02); },
  empty() { tone(500, 420, 0.08, 0.08); },
  bonus() { tone(880, 1175, 0.18, 0.05); tone(1175, 1568, 0.22, 0.05, 'sine', 0.09); }
};

// ---- 状態
let state = 'title', endBy = 'gau', timeLeft = 0, anger = 0, irrit = 0, idleT = 0, plucks = 0, gauT = 0, tNow = 0, shake = 0, flashT = 0;
let az = -0.72, el = 0.48, zoom = 1, zoomU = 1, headYaw = 0, headPitch = 0;
function flash(t) { const m = $('msg'); m.textContent = t; m.style.opacity = 1; flashT = 1.2; }

const keys = {}; addEventListener('keydown', e => { keys[e.key] = true; }); addEventListener('keyup', e => { keys[e.key] = false; });

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, P.dpr); renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  U.uPx.value = 2 * Math.tan(camera.fov * Math.PI / 360) / (innerHeight * dpr);
  pMat.uniforms.uPxS.value = innerHeight * dpr * 0.5 * camera.projectionMatrix.elements[5];
}
addEventListener('resize', resize); resize();
const camD = { d: 2.4, tgt: new THREE.Vector3(0.1, 0.16, 0) };
function fitView(az, el, tanV, tanH) {
  const ce = Math.cos(el), f = new THREE.Vector3(-ce * Math.cos(az), -Math.sin(el), -ce * Math.sin(az));
  const rt = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(rt, f);
  const pts = [];
  for (const x of [-0.42, 0.52]) for (const y of [0, 0.42]) for (const z of [-0.16, 0.16]) pts.push(new THREE.Vector3(x, y, z));
  if (ballVolShown > 1e-6) { const bp = ballPos(ballR); for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) pts.push(bp.clone().add(new THREE.Vector3(dx, dy, dz).multiplyScalar(ballR * 1.15))); }
  const tgt = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
  let d = 0.5;
  for (const p of pts) { const q = p.clone().sub(tgt), a = q.dot(rt), b = q.dot(up), c = q.dot(f); d = Math.max(d, Math.abs(a) / tanH - c, Math.abs(b) / tanV - c); }
  return { tgt, d, ce };
}
function camUpdate(dt) {
  // 犬と毛玉が画面に収まる距離を、いまの向きで求める
  const tv = Math.tan(camera.fov * Math.PI / 360), { tgt, d, ce } = fitView(az, el, tv * 0.78, tv * camera.aspect * 0.9);
  zoom += ((pull ? 0.92 : 1) * zoomU - zoom) * Math.min(1, dt * (pinch ? 15 : 4));   // ピンチ中は指に付いてくる
  camD.d += (d - camD.d) * Math.min(1, dt * 3); camD.tgt.lerp(tgt, Math.min(1, dt * 3));
  const D = camD.d * zoom, T = camD.tgt;
  camera.position.set(T.x + ce * Math.cos(az) * D, T.y + Math.sin(el) * D, T.z + ce * Math.sin(az) * D);
  if (shake > 0) { shake -= dt; camera.position.x += (Math.random() - 0.5) * shake * 0.08; camera.position.y += (Math.random() - 0.5) * shake * 0.08; }
  camera.lookAt(T);
}
// ---- 怒る前のサイン
const tg0 = { p: tongue.position.clone(), s: tongue.scale.clone() };
// 怒った顔：目を細めて目じりを上げる、歯をむく
const eyeG = eyeBalls.map((b, i) => ({ g: b.parent, q: b.parent.quaternion.clone(), s: i === 0 ? -1 : 1 }));
const teeth = new THREE.Group(); headP.add(teeth); teeth.visible = false;
{
  const tm = new THREE.MeshPhongMaterial({ color: 0xe9e0cf, shininess: 30, specular: 0x222222 }), gum = new THREE.MeshPhongMaterial({ color: 0x3a1c1c, shininess: 10 });
  const rim = META.mouthRim, cy = META.mouthC[1];
  const near = (list, z) => list.reduce((b, q) => Math.abs(q[2] - z) < Math.abs(b[2] - z) ? q : b, list[0]);
  const up = rim.filter(q => q[1] >= cy - 0.004), lo = rim.filter(q => q[1] < cy - 0.004);
  for (const [list, sgn] of [[up, -1], [lo, 1]]) {
    for (let k = -3; k <= 3; k++) {
      const z = k * 0.0058, q = near(list, z), can = Math.abs(k) === 3;
      const m = can ? new THREE.Mesh(new THREE.ConeGeometry(0.0024, 0.0085, 8), tm) : new THREE.Mesh(new THREE.BoxGeometry(0.0018, 0.0036, 0.0044), tm);
      m.position.set(q[0] - 0.0028, q[1] + sgn * (can ? 0.004 : 0.0026), z * 0.96); if (can && sgn < 0) m.rotation.x = Math.PI;
      m.rotation.y = -z * 18; teeth.add(m);
    }
    const g = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0026, 6, 24, Math.PI), gum);
    const q0 = near(list, 0); g.position.set(q0[0] - 0.02, q0[1] - sgn * 0.0005, 0); g.rotation.set(Math.PI / 2, 0, 0); g.scale.set(0.95, 0.95, 0.6); teeth.add(g);
  }
}
let angry = 0;
function tells(dt) {
  const a = anger;
  const mad = state === 'gau' || (state === 'result' && endBy === 'gau');
  angry += ((mad ? 1 : 0) - angry) * Math.min(1, dt * 14);
  U.uAngry.value = angry; teeth.visible = angry > 0.02; teeth.scale.setScalar(0.6 + 0.4 * angry);
  for (const e of eyeG) { e.g.scale.y = 1 - 0.38 * angry; e.g.quaternion.copy(e.q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), e.s * 0.32 * angry)); }
  const tin = Math.max(sm(0.25, 0.48, a), angry);                                   // 1. 舌が引っこむ（笑顔が消える）
  tongue.scale.set(tg0.s.x * (1 - 0.85 * tin), tg0.s.y, tg0.s.z * (1 - 0.3 * tin)); tongue.position.copy(tg0.p).add(new THREE.Vector3(-0.022 * tin, 0.004 * tin, 0));
  const earB = sm(0.32, 0.58, a);                                   // 2. 耳が寝る
  for (const eg of ears) { const s = eg.scale.z; eg.rotation.set(s * (META.earRot[0] + earB * 0.35), META.earRot[1], META.earRot[2] + earB * 1.0); }
  const tailT = Math.max(sm(0.35, 0.65, a), angry);                 // しっぽが立つ（後ろからでも見えるサイン）
  U.uTail.value += (tailT - U.uTail.value) * Math.min(1, dt * 5);
  const whale = sm(0.45, 0.65, a);                                  // 3. 白目
  U.uWhale.value = whale;
  const camL = dog.worldToLocal(camera.position.clone()).sub(new THREE.Vector3().fromArray(META.hpos));
  const yawC = Math.max(-1.5, Math.min(1.5, Math.atan2(-camL.z, camL.x))), pitC = Math.max(-0.3, Math.min(0.5, Math.atan2(camL.y, Math.hypot(camL.x, camL.z))));
  let yT, pT;
  if (mad) { yT = yawC; pT = pitC - 0.12; }
  else {
    const turn = sm(0.6, 0.95, a);                                  // 4. 振り向く
    let iy = Math.sin(tNow * 0.23) * 0.15, ip = Math.sin(tNow * 0.31) * 0.04 - 0.03;
    if (pull) { const pw = pull.P.parent.localToWorld(pull.local.clone()); const pl = dog.worldToLocal(pw).sub(new THREE.Vector3().fromArray(META.hpos)); iy = Math.atan2(-pl.z, pl.x) * 0.45; }
    yT = iy * (1 - turn) + yawC * 0.7 * turn; pT = ip * (1 - turn) + pitC * 0.5 * turn;
  }
  const k = state === 'gau' ? 18 : state === 'result' ? 4 : 2.5;
  headYaw += (yT - headYaw) * Math.min(1, dt * k); headPitch += (pT - headPitch) * Math.min(1, dt * k);
  const gr = sm(0.74, 0.95, a);                                     // 5. 唸る（小刻みに震える）
  headP.rotation.set(gr * Math.sin(tNow * 70) * 0.006, headYaw, headPitch + gr * Math.sin(tNow * 53) * 0.006);
  if (AC && LOOP.pant) LOOP.pant.gain.setTargetAtTime((state === 'play' || state === 'title') ? (1 - tin) * 0.35 : 0, AC.currentTime, 0.2);
  const stiff = sm(0.55, 0.7, a);                                   // 体がこわばる（息が止まる）
  dog.scale.y = 1 + (1 - stiff) * 0.01 * Math.sin(tNow * 2.3);
  if (AC && LOOP.growl) { LOOP.growl.gain.setTargetAtTime(state === 'play' ? sm(0.7, 0.92, a) * 0.9 : 0, AC.currentTime, 0.12); growl.g.gain.setTargetAtTime(0, AC.currentTime, 0.05); growl.lg.gain.setTargetAtTime(0, AC.currentTime, 0.05); }
  else if (growl && AC) { const v = state === 'play' ? gr * 0.5 : 0; growl.g.gain.setTargetAtTime(v * 0.6, AC.currentTime, 0.08); growl.lg.gain.setTargetAtTime(v * 0.4, AC.currentTime, 0.08); growl.o.frequency.setTargetAtTime(70 + gr * 15, AC.currentTime, 0.1); }
}

// ---- ループ
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; tNow += dt;
  if (state === 'play' || state === 'title') {
    let sx = 0, sy = 0;
    if (keys.ArrowLeft || keys.a) sx = -1; if (keys.ArrowRight || keys.d) sx = 1; if (keys.ArrowUp || keys.w) sy = -1; if (keys.ArrowDown || keys.s) sy = 1;
    if (state === 'title') sx = 0.06;
    az += sx * 2.0 * dt; el = Math.max(0.15, Math.min(1.1, el - sy * 0.9 * dt));
  }
  if (state === 'play') {
    pullUpdate(dt);
    timeLeft -= dt;
    if (anger >= 1) startGau();
    else if (timeLeft <= 0) startTimeUp();
    else if (pull) idleT = 0; else { idleT += dt; if (idleT > 0.6) anger = Math.max(irrit, anger - G.decay * dt); }
    anger = Math.max(anger, irrit);
    const dia = ballVolShown > 0 ? Math.cbrt(3 * ballVolShown / (4 * Math.PI)) * 200 : 0;
    const tl = Math.max(0, Math.ceil(timeLeft)); $('timer').textContent = `残り ${tl}秒`; $('timer').classList.toggle('low', tl <= 10);
    $('dia').textContent = `毛玉サイズ ${dia.toFixed(1)}cm`;
    if (G.showMeter) { $('meter').firstChild.style.width = Math.min(100, anger * 100) + '%'; $('mFloor').style.left = Math.min(100, irrit * 100) + '%'; }
  }
  if ((state === 'gau' || state === 'timeup') && performance.now() - gauT > 1600) showResult();
  if (flashT > 0) { flashT -= dt; if (flashT <= 0) $('msg').style.opacity = 0; }
  tells(dt); updateFloaters(dt); updateBall(dt); updateFlying(dt); updateParts(dt); camUpdate(dt);
  for (const g of strandGeos) g.setDrawRange(0, Math.floor(g.userData.N * P.strands) * (PTS - 1) * 6);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
function startGau() {
  state = 'gau'; endBy = 'gau'; gauT = performance.now(); shake = 0.45; anger = 1;
  if (pull) endPull({ pointerId: pull.id });
  shellU.uShellL.value = P.shellL * 1.25;                           // 毛が逆立つ
  const g = $('gau'); g.textContent = 'ガウッ！'; g.style.opacity = 1; g.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.4 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: 380, easing: 'ease-out' });
  sfx.bark(); $('red').style.opacity = 1;
}
function startTimeUp() {
  state = 'timeup'; endBy = 'time'; gauT = performance.now(); anger = 0;   // 時間切れ：犬は落ち着いたまま
  if (pull) endPull({ pointerId: pull.id });
  const g = $('gau'); g.textContent = 'そこまで！'; g.style.opacity = 1;
  g.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: 380, easing: 'ease-out' });
  sfx.bonus();
}
const TITLES = [[0.1, '毛づくろい見習い'], [0.25, 'ブラッシング係'], [0.5, '抜け毛職人'], [0.8, '換毛期の達人'], [1.2, 'もう1匹できた人'], [99, '柴犬製造機']];
function showResult() {
  state = 'result'; $('gau').style.opacity = 0; ['arrows', 'hud', 'timer'].forEach(id => $(id).classList.add('hide')); $('red').style.opacity = 0;
  const v = ballVolTarget, dia = v > 0 ? Math.cbrt(3 * v / (4 * Math.PI)) * 200 : 0, hiki = v / META.vol;
  const ttl = TITLES.find(t => hiki < t[0])[1];
  $('rDia').textContent = `直径 ${dia.toFixed(1)}cm`; $('rHiki').textContent = `柴犬 ${hiki.toFixed(2)}匹分の毛玉`; $('rTtl').textContent = `称号「${ttl}」`;
  $('rWhy').textContent = endBy === 'time' ? '' : `ガウッ！と怒られた（残り${Math.max(0, Math.ceil(timeLeft))}秒）`;
  const text = `「柴犬（換毛期）」で 直径${dia.toFixed(1)}cm（柴犬${hiki.toFixed(2)}匹分）の毛玉ができた！`;
  $('shareX').href = 'https://x.com/intent/post?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent('https://waqk.jp/');
  const rk = LS.get('shiba_rank2', []); rk.push({ d: +dia.toFixed(1), h: +hiki.toFixed(2), t: Date.now() }); rk.sort((a, b) => b.d - a.d); LS.set('shiba_rank2', rk.slice(0, 10));
  $('rankList').innerHTML = rk.slice(0, 10).map(r => `<li><span>直径 ${r.d}cm</span><span>${r.h}匹分</span></li>`).join('');
  try { makeShot(dia, hiki, ttl); } catch (e) { console.warn(e); }
  $('res').classList.remove('hide');
}
function makeShot(dia, hiki, ttl) {
  const W = 1200, H = 630, rt = new THREE.WebGLRenderTarget(W, H), cam = new THREE.PerspectiveCamera(30, W / H, 0.02, 30);
  const tv = Math.tan(15 * Math.PI / 180), mad = endBy === 'gau';
  let a = -0.62, e = 0.3, d, tgt;
  if (mad) { a = -0.42; e = 0.16; d = 0.95; tgt = headP.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.06, 0)); }   // 怒った顔が見えるように、顔の正面寄りから寄る
  else { const fv = fitView(a, e, tv * 0.86, tv * W / H * 0.56); d = fv.d; tgt = fv.tgt; }
  cam.position.set(tgt.x + Math.cos(e) * Math.cos(a) * d, tgt.y + Math.sin(e) * d, tgt.z + Math.cos(e) * Math.sin(a) * d); cam.lookAt(tgt);
  cam.setViewOffset(W, H, W * 0.2, 0, W, H);
  // 頭を、この写真のカメラへ向ける（ゲームのカメラが後ろにあっても顔が写る）
  const keepRot = headP.rotation.clone(); dog.updateMatrixWorld();
  const cl = dog.worldToLocal(cam.position.clone()).sub(new THREE.Vector3().fromArray(META.hpos));
  headP.rotation.set(0, Math.max(-1.5, Math.min(1.5, Math.atan2(-cl.z, cl.x))) * (mad ? 1 : 0.8), Math.max(-0.3, Math.min(0.5, Math.atan2(cl.y, Math.hypot(cl.x, cl.z)))) - (mad ? 0.12 : 0.05));
  const keepPx = U.uPx.value; U.uPx.value = 2 * Math.tan(cam.fov * Math.PI / 360) / H;
  renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null); U.uPx.value = keepPx; headP.rotation.copy(keepRot);
  const buf = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf); rt.dispose();
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  g.putImageData(img, 0, 0);
  const grd = g.createLinearGradient(W * 0.52, 0, W, 0); grd.addColorStop(0, 'rgba(251,244,232,0)'); grd.addColorStop(0.25, 'rgba(251,244,232,.9)'); grd.addColorStop(1, 'rgba(251,244,232,.96)');
  g.fillStyle = grd; g.fillRect(W * 0.52, 0, W * 0.48, H); g.textAlign = 'right'; const X = W - 60;
  g.fillStyle = '#7a5a40'; g.font = "700 34px 'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif"; g.fillText('柴犬（換毛期）', X, 96);
  g.fillStyle = '#8a5a3a'; g.font = "700 30px system-ui,'Hiragino Sans','Noto Sans JP',sans-serif"; g.fillText('毛玉 直径', X, 200);
  g.fillStyle = '#c4501d'; g.font = "700 120px 'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif"; g.fillText(`${dia.toFixed(1)}cm`, X, 320);
  g.fillStyle = '#4a2a14'; g.font = "700 48px 'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif"; g.fillText(`柴犬 ${hiki.toFixed(2)}匹分`, X, 400);
  g.font = "700 28px system-ui,'Hiragino Sans','Noto Sans JP',sans-serif"; const tl = `称号「${ttl}」`, tw = g.measureText(tl).width;
  g.fillStyle = '#4a2a14'; g.beginPath(); g.roundRect ? g.roundRect(X - tw - 36, 440, tw + 36, 50, 25) : g.rect(X - tw - 36, 440, tw + 36, 50); g.fill();
  g.fillStyle = '#fbf4e8'; g.fillText(tl, X - 18, 475);
  g.fillStyle = '#9a7a60'; g.font = "500 24px system-ui,'Hiragino Sans','Noto Sans JP',sans-serif"; g.fillText('WAQK GAMES（ワックゲームズ）', X, H - 44);
  $('shot').src = c.toDataURL('image/jpeg', 0.88);
}
function reset() {
  for (const P_ of PARTS) {
    for (const g of [P_.p.ug, P_.p.gg]) { g.attributes.aAlive.array.fill(255); g.attributes.aAlive.needsUpdate = true; }
    const bd = P_.p.base.geometry.attributes.aDens.array; bd.fill(1); P_.p.base.geometry.attributes.aDens.needsUpdate = true;
  }
  for (const m of [...flying.map(f => f.mesh), ...pile]) { scene.remove(m); if (m.geometry !== blobGeo) m.geometry.dispose(); if (m.material !== pileMat) m.material.dispose(); if (m.geometry === blobGeo) {} } flying.length = 0; pile.length = 0; pileV = 0;
  shellU.uShellL.value = P.shellL; anger = 0; irrit = 0; plucks = 0; idleT = 0; ballVolTarget = 0; ballVolShown = 0; pull = null; timeLeft = G.time; flT = 2.5; endBy = 'gau'; headYaw = 0; headPitch = 0; zoomU = 1; angry = 0;
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].kind !== 'dust') parts.splice(i, 1);
  while (floaters.length) removeFloater(floaters[0], false);
}
function begin() {
  audioInit(); reset(); state = 'play'; az = -0.72; el = 0.48;
  ['start', 'res'].forEach(id => $(id).classList.add('hide')); ['arrows', 'hud', 'timer'].forEach(id => $(id).classList.remove('hide'));
  $('meter').classList.toggle('hide', !G.showMeter);
  flash('毛をつまんで、そっと引っぱってみよう');
}
$('go').onclick = begin; $('again').onclick = begin;
addEventListener('wheel', e => { zoomU = Math.max(0.45, Math.min(1.2, zoomU * (1 + e.deltaY * 0.001))); }, { passive: true });
$('rankBtn').onclick = () => $('rank').classList.toggle('hide');
$('snd').classList.toggle('off', muted);
$('snd').onclick = () => { muted = !muted; LS.set('shiba_muted', muted); $('snd').classList.toggle('off', muted); if (AC) AC.master.gain.value = muted ? 0 : 0.8; };
if (!/[?&]debug=1/.test(location.search)) $('adj').classList.add('hide');   // 調整パネルは ?debug=1 のときだけ
// ---- 調整（確認用）
const SPEC = [['angerK', '怒りやすさ', 0.2, 3, 0.05, G], ['decay', '休むと落ち着く速さ', 0, 0.4, 0.01, G], ['irrit', '1回ごとのうんざり', 0, 0.03, 0.001, G], ['slowSp', '速さの許し（大きいほど速く引いてもバレにくい）', 150, 1000, 10, G],['time', '制限時間（秒）', 20, 180, 5, G], ['flEvery', '浮き毛が出る間隔（秒）', 1, 15, 0.5, G], ['flLife', '浮き毛が残る時間（秒）', 3, 20, 0.5, G], ['bonusU', 'ボーナス1秒に要る毛の量', 30, 300, 10, G], ['radius', 'つかむ広さ（m）', 0.015, 0.06, 0.001, G], ['fluff', '毛玉のふくらみ', 1, 12, 0.5, G], ['strands', '毛の本数（割合）', 0.2, 1, 0.05, P], ['dpr', '解像度の上限', 0.75, 3, 0.25, P]];
$('panel').innerHTML = SPEC.map(([k, l, a, b, s, o]) => `<label>${l}：<b id="v_${k}">${o[k]}</b></label><input type="range" id="i_${k}" min="${a}" max="${b}" step="${s}" value="${o[k]}">`).join('') +
  `<label class="ck"><input type="checkbox" id="c_meter">怒りのメーターを出す</label><label class="ck"><input type="checkbox" id="c_no">怒らない（確認用）</label><button id="b_gau" style="height:32px;margin-top:6px">いま怒らせる</button><div id="info" style="margin-top:6px;color:#8a6a50"></div>`;
for (const [k, , , , , o] of SPEC) $('i_' + k).oninput = e => { o[k] = +e.target.value; $('v_' + k).textContent = o[k]; if (k === 'dpr') resize(); };
$('c_meter').onchange = e => { G.showMeter = e.target.checked; $('meter').classList.toggle('hide', !G.showMeter || state !== 'play'); };
$('c_no').onchange = e => { G.noAnger = e.target.checked; };
$('b_gau').onclick = () => { if (state === 'play') anger = 1; };
$('adj').onclick = () => { $('panel').classList.toggle('hide'); $('info').textContent = `抜いた回数 ${plucks}`; };
// 確認用の操作（自動テスト）
function autoPluck(n) {   // 確認用：体のあちこちから自動で抜く
  for (let k = 0; k < n; k++) {
    const P_ = PARTS[0], ug = P_.p.ug, s0 = Math.floor(Math.random() * ug.userData.N), pp = ug.userData.pos, local = new THREE.Vector3(pp[s0 * PTS * 3], pp[s0 * PTS * 3 + 1], pp[s0 * PTS * 3 + 2]);
    const uL = [], gL = [], ui = { sens: 0, loose: 0, n: 0 }, gi = { sens: 0, loose: 0, n: 0 };
    gather(ug, local, G.radius, 1, uL, ui); gather(P_.p.gg, local, G.radius, 0.35, gL, gi); setAlive(ug, uL, 0); setAlive(P_.p.gg, gL, 0);
    const q = { P: P_, local, uL, gL, n: uL.length + gL.length, sens: 1, tight: 0.5, tuft: makeTuft(P_, uL, gL) };
    const tip = local.clone().add(new THREE.Vector3(0, 0.06, 0)); updateTuft(q, tip, 1); pop(q, P_.parent.localToWorld(tip.clone()));
    flying[flying.length - 1].t = 0.999;
  }
}
window.__game = { P, G, begin, fl: () => floaters, cam3: () => camera, auto: autoPluck,  zoom: v => { zoomU = v; }, cam: (a, e) => { az = a; el = e; }, info: () => ({ plucks, irrit, pull: !!pull, ballR, timeLeft, floaters: floaters.map(f => ({ r: f.r, age: f.age, c: f.P.parent.localToWorld(f.c.clone()).toArray() })) }), state: () => state, anger: v => (v == null ? anger : (anger = v)), ball: () => ballVolTarget, pickAt: (x, y) => !!pick({ clientX: x, clientY: y }) };
$('load').remove(); requestAnimationFrame(loop);
const go = $('go'); go.disabled = false; go.textContent = 'はじめる';
{ const rk = LS.get('shiba_rank2', []); if (rk.length) $('best').textContent = `この端末の最高：毛玉 直径 ${rk[0].d}cm（柴犬${rk[0].h}匹分）`; }
}
