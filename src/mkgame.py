import base64, re
src = open('dog_template.html', encoding='utf-8').read().split('\n')
head_js = '\n'.join(src[36:355])          # 37行目〜355行目：見た目の部分（そのまま使う）
tail = open('game_tail.js', encoding='utf-8').read()

def sub(s, a, b, n=1):
    assert s.count(a) >= 1, a[:60]
    return s.replace(a, b) if n == 0 else s.replace(a, b, n)

j = head_js
# 生きている毛だけ描く（抜いた毛は消す）
j = sub(j, "attribute vec4 aTan; attribute vec4 aNrm; attribute float aTS; attribute float aRT; attribute float aK;", "attribute vec4 aTan; attribute vec4 aNrm; attribute float aTS; attribute float aRT; attribute float aK; attribute float aAlive;")
j = sub(j, "  gl_Position = projectionMatrix * viewMatrix * wp;\n}`;", "  gl_Position = aAlive < 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * wp;\n}`;")
j = sub(j, "  g.setIndex(new THREE.BufferAttribute(idx, 1));\n  g.userData.N = N;", "  g.setAttribute('aAlive', new THREE.BufferAttribute(new Uint8Array(nv).fill(255), 1, true));\n  g.setIndex(new THREE.BufferAttribute(idx, 1));\n  g.userData.N = N; g.userData.pos = pos;")
# 地の毛：抜いたところは薄く短く
j = sub(j, "attribute float aCream; attribute float aLen; attribute float aAO; attribute float aK;\nuniform float uH, uShellL;\nvarying vec3 vB, vN, vV; varying float vC, vH, vY, vA, vK;",
        "attribute float aCream; attribute float aLen; attribute float aAO; attribute float aK; attribute float aDens;\nuniform float uH, uShellL;\nvarying vec3 vB, vN, vV; varying float vC, vH, vY, vA, vK, vD;")
j = sub(j, "  vec3 p = position + normal * uH * uShellL * aLen;", "  vec3 p = position + normal * uH * uShellL * aLen * mix(0.45, 1.0, aDens); vD = aDens;")
j = sub(j, "varying vec3 vB, vN, vV; varying float vC, vH, vY, vA, vK;\nfloat h31", "varying vec3 vB, vN, vV; varying float vC, vH, vY, vA, vK, vD;\nfloat h31")
j = sub(j, "  a *= uShellA * (1.0 - vH * 0.6)", "  a *= vD * uShellA * (1.0 - vH * 0.6)")
j = sub(j, "  g.setAttribute('aAO', new THREE.BufferAttribute(vaf, 1));", "  g.setAttribute('aAO', new THREE.BufferAttribute(vaf, 1));\n  g.setAttribute('aDens', new THREE.BufferAttribute(new Float32Array(vaf.length).fill(1), 1));")
# 毛ごとの「痛さ」「抜けやすさ」「色」を持たせる
j = sub(j, "  const um = new THREE.Mesh(ug, strandMat())", "  ug.userData.cream = arr(m.uc); gg.userData.cream = arr(m.gc); ug.userData.sens = arr(m.us); gg.userData.sens = arr(m.gs); ug.userData.loose = arr(m.ul);\n  const um = new THREE.Mesh(ug, strandMat())")
j = sub(j, "headP.add(eg); buildPart('ear', eg, earMat); ears.push(eg);", "headP.add(eg); earParts.push(buildPart('ear', eg, earMat)); ears.push(eg);")
j = sub(j, "const ears = [];", "const ears = [], earParts = [];")
# 白目（怒りかけると、目をそらして白目が見える）
j = sub(j, "uSun: { value: P.sun } };", "uSun: { value: P.sun }, uWhale: { value: 0 } };")
j = sub(j, "    float fwd = clamp(vL.x, 0.0, 1.0);", "    float ca = cos(uWhale * 0.8), sa = sin(uWhale * 0.8); float fwd = clamp(dot(vL, normalize(vec3(ca, 0.3 * sa, sa))), 0.0, 1.0);")
j = sub(j, "  fragmentShader: `uniform vec3 uL, uF; varying vec3 vN, vW, vL; void main(){", "  fragmentShader: `uniform vec3 uL, uF; uniform float uWhale; varying vec3 vN, vW, vL; void main(){")
j = sub(j, "    float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0); c += vec3(0.25,0.2,0.18) * fr;",
        "    float scl = uWhale * smoothstep(0.55, 0.75, normalize(vL).x) * (1.0 - smoothstep(0.28, 0.45, fwd)); c = mix(c, vec3(0.86, 0.82, 0.76), scl);\n    float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0); c += vec3(0.25,0.2,0.18) * fr;")
j = sub(j, "  const ball = new THREE.Mesh(new THREE.SphereGeometry(META.eyeR, 32, 24), eyeMat);", "  const ball = new THREE.Mesh(new THREE.SphereGeometry(META.eyeR, 32, 24), eyeMat); eyeBalls.push(ball);")
j = sub(j, "const lidMat = ", "const eyeBalls = [];\nconst lidMat = ")
# 舌を外から動かせるように
j = sub(j, "  const tongue = new THREE.Mesh(", "  tongue = new THREE.Mesh(")
j = sub(j, "// 鼻\n{", "// 鼻\nlet tongue;\n{")

# ---- 怒った顔（眉間と鼻すじのしわ、上くちびるがめくれる）
ANG = """uniform float uAngry, uHead;
float wrk(vec3 p){
  float m = 0.0, az = abs(p.z);
  float yb = smoothstep(0.05, 0.06, p.y) * (1.0 - smoothstep(0.075, 0.088, p.y)) * smoothstep(0.112, 0.132, p.x);
  float t = (p.y - 0.058) / 0.03;
  m += yb * 0.8 * exp(-pow((az - (0.0055 - 0.003 * t)) / 0.0026, 2.0));
  m += yb * 0.45 * exp(-pow((az - (0.0135 - 0.005 * t)) / 0.0026, 2.0));
  float nb = (1.0 - smoothstep(0.016, 0.028, az)) * smoothstep(0.02, 0.03, p.y) * smoothstep(0.163, 0.173, p.x) * (1.0 - smoothstep(0.216, 0.225, p.x));
  for (int i = 0; i < 4; i++) { float xi = 0.176 + float(i) * 0.012; m += nb * 0.9 * exp(-pow((p.x - xi - 10.0 * p.z * p.z) / 0.0017, 2.0)); }
  return clamp(m, 0.0, 1.0) * uAngry * uHead;
}
vec3 adisp(vec3 p){
  float lm = exp(-pow((p.y + 0.012) / 0.011, 2.0)) * smoothstep(0.195, 0.232, p.x) * (1.0 - smoothstep(0.028, 0.042, abs(p.z)));
  return vec3(-0.002, 0.0048, 0.0) * lm * uAngry * uHead;
}
"""
j = sub(j, "uniform float uPx, uMinPx, uW0;\nvarying vec3 vT, vN, vV; varying float vt, vCov, vRnd, vType, vCream, vY, vAO, vDist, vK;", "uniform float uPx, uMinPx, uW0;\n" + ANG + "varying vec3 vT, vN, vV, vLP; varying float vt, vCov, vRnd, vType, vCream, vY, vAO, vDist, vK;")
j = sub(j, "  vec4 wp = modelMatrix * vec4(position, 1.0);", "  vLP = position; vec4 wp = modelMatrix * vec4(position + adisp(position), 1.0);")
j = sub(j, "uniform vec3 uL, uF; uniform float uSpec, uBack, uOpac, uSun;\nvarying vec3 vT, vN, vV; varying float", "uniform vec3 uL, uF; uniform float uSpec, uBack, uOpac, uSun;\n" + ANG + "varying vec3 vT, vN, vV, vLP; varying float")
j = sub(j, "  gl_FragColor = vec4(c, a);\n}`;\nconst strandMat", "  c *= 1.0 - 0.45 * wrk(vLP);\n  gl_FragColor = vec4(c, a);\n}`;\nconst strandMat")
# 地の色
j = sub(j, "vertexShader: `attribute float aCream; attribute float aAO; attribute float aK; varying float vC, vA, vK; varying vec3 vN; void main(){", "vertexShader: `" + ANG.replace('\n', ' ') + " attribute float aCream; attribute float aAO; attribute float aK; varying float vC, vA, vK; varying vec3 vN, vLP; void main(){ vLP = position;")
j = sub(j, "gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }`,", "gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position + adisp(position),1.0); }`,")
j = sub(j, "fragmentShader: `uniform vec3 uL, uF; varying float vC, vA, vK; varying vec3 vN; void main(){", "fragmentShader: `uniform vec3 uL, uF; " + ANG.replace('uniform float uAngry, uHead;', 'uniform float uAngry, uHead;').replace('\n', ' ') + " varying float vC, vA, vK; varying vec3 vN, vLP; void main(){")
j = sub(j, "vec3(0.06,0.045,0.04)*(0.7+0.6*l), vK), 1.0); }` });", "vec3(0.06,0.045,0.04)*(0.7+0.6*l), vK) * (1.0 - 0.45 * wrk(vLP)), 1.0); }` });")
# 地の毛
j = sub(j, "uniform float uH, uShellL;\nvarying vec3 vB, vN, vV;", "uniform float uH, uShellL;\n" + ANG + "varying vec3 vB, vN, vV;")
j = sub(j, "vD = aDens;", "vD = aDens; p += adisp(position);")
j = sub(j, "uniform vec3 uL, uF; uniform float uSun, uShellF, uShellA;\n", "uniform vec3 uL, uF; uniform float uSun, uShellF, uShellA;\n" + ANG)
j = sub(j, "  gl_FragColor = vec4(oc, a);", "  oc *= 1.0 - 0.45 * wrk(vB);\n  gl_FragColor = vec4(oc, a);")
j = sub(j, "uWhale: { value: 0 } };", "uWhale: { value: 0 }, uAngry: { value: 0 }, uHead: { value: 0 } };")
# 頭の材質だけ uHead = 1
j = sub(j, "const head = buildPart('head', headP);", """const head = buildPart('head', headP);
for (const m of headP.children) if (m.isMesh && m.material.isShaderMaterial) {
  if (m.material.uniforms === U) { const o = m.material; m.material = new THREE.ShaderMaterial({ uniforms: Object.assign({}, U, { uHead: { value: 1 } }), vertexShader: o.vertexShader, fragmentShader: o.fragmentShader, transparent: o.transparent, depthWrite: o.depthWrite, side: o.side }); }
  else m.material.uniforms.uHead = { value: 1 };
}""")

# ---- しっぽを立てる（怒りのサイン。顔が見えない向きでもわかるように）。aTW＝しっぽらしさ、uTailW＝体の材質だけ1
TAILV = "attribute float aTW; uniform float uTail, uTailW; float tk(){ return 0.45 * uTail * uTailW * aTW; } vec3 tpos(vec3 p){ return vec3(p.x, 0.2 + (p.y - 0.2) * (1.0 + tk()), p.z); } vec3 ttan(vec3 v){ return vec3(v.x, v.y * (1.0 + tk()), v.z); } vec3 tnrm(vec3 v){ return vec3(v.x, v.y / (1.0 + tk()), v.z); }\n"
j = sub(j, "uAngry: { value: 0 }, uHead: { value: 0 } };", "uAngry: { value: 0 }, uHead: { value: 0 }, uTail: { value: 0 }, uTailW: { value: 0 } };")
# 毛（1本ずつ）
j = sub(j, "void main(){\n  float side = sign(aTS);", TAILV + "void main(){\n  float side = sign(aTS);")
j = sub(j, "  vec3 T = normalize(mat3(modelMatrix) * aTan.xyz);\n  vec3 N = normalize(mat3(modelMatrix) * aNrm.xyz);", "  vec3 T = normalize(mat3(modelMatrix) * ttan(aTan.xyz));\n  vec3 N = normalize(mat3(modelMatrix) * tnrm(aNrm.xyz));")
j = sub(j, "vLP = position; vec4 wp = modelMatrix * vec4(position + adisp(position), 1.0);", "vLP = position; vec4 wp = modelMatrix * vec4(tpos(position) + adisp(position), 1.0);")
# 地の色（体の面）
j = sub(j, "vertexShader: `uniform float uAngry, uHead; float wrk", "vertexShader: `" + TAILV.strip() + " uniform float uAngry, uHead; float wrk")
j = sub(j, "vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position + adisp(position),1.0); }`,", "vN = normalize(mat3(modelMatrix)*tnrm(normal)); gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(tpos(position) + adisp(position),1.0); }`,")
# 地の毛（層）
j = sub(j, "vD;\nvoid main(){\n  vec3 p = position", "vD;\n" + TAILV + "void main(){\n  vec3 p = position")
j = sub(j, "vD = aDens; p += adisp(position);", "vD = aDens; p = tpos(p) + adisp(position);")
j = sub(j, "vB = position; vN = normalize(mat3(modelMatrix) * normal);", "vB = position; vN = normalize(mat3(modelMatrix) * tnrm(normal));")

# つかむ判定用に両面
html = open('game_shell.html', encoding='utf-8').read()
html = html.replace('__JS__', j + '\n' + tail)
meta = open('dog.json', encoding='utf-8').read()
snd = '{' + ','.join(f'"{k}":"' + base64.b64encode(open(f'../snd/{k}.mp3','rb').read()).decode() + '"' for k in ['bark','yelp','growl','pant']) + '}'
out = html.replace('__SND__', snd).replace('__BIN__', base64.b64encode(open('dog.bin', 'rb').read()).decode()).replace('__META__', meta)
open('../index.html', 'w', encoding='utf-8', newline='').write(out)
js = out.split('<script>\n{')[1].rsplit('</script>', 1)[0]; open('game.js', 'w', encoding='utf-8').write('{' + js)
print(len(out))
