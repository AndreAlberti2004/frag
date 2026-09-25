// FRAG - armas e maos em primeira pessoa (geometria procedural em escala real, metros).
// Convencao do modelo: X direita, Y cima, cano para -Z, origem no punho (onde a mao direita segura).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------ materiais
const std = (o) => new THREE.MeshStandardMaterial(o);
export const MAT = {
  metal: std({ color: '#34373d', metalness: 0.8, roughness: 0.34 }),
  metal2: std({ color: '#3a3d43', metalness: 0.8, roughness: 0.3 }),
  steel: std({ color: '#9aa0a8', metalness: 1, roughness: 0.22 }),
  polymer: std({ color: '#1c1d20', metalness: 0.05, roughness: 0.62 }),
  tan: std({ color: '#8b7556', metalness: 0.05, roughness: 0.66 }),
  olive: std({ color: '#4d5436', metalness: 0.05, roughness: 0.7 }),
  rubber: std({ color: '#111214', metalness: 0, roughness: 0.9 }),
  brass: std({ color: '#c9a24a', metalness: 1, roughness: 0.3 }),
  blade: std({ color: '#c3c8cf', metalness: 1, roughness: 0.18 }),
  bladeDark: std({ color: '#2d3036', metalness: 0.9, roughness: 0.32 }),
  wood: std({ color: '#6a4a2e', metalness: 0, roughness: 0.55 }),
  glove: std({ color: '#6a5d49', metalness: 0, roughness: 0.8 }),
  glovePad: std({ color: '#3a3830', metalness: 0, roughness: 0.7 }),
  sleeve: std({ color: '#4e5541', metalness: 0, roughness: 0.92 }),
  sleeveDark: std({ color: '#353a2c', metalness: 0, roughness: 0.95 }),
  watch: std({ color: '#141516', metalness: 0.6, roughness: 0.3 }),
  glass: std({ color: '#a8d4e6', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 2.2 }),
  lensFront: std({ color: '#2a1f4a', metalness: 0.4, roughness: 0.04, envMapIntensity: 2.5 }),
  lensRear: std({ color: '#050608', metalness: 0.2, roughness: 0.05, envMapIntensity: 1.6 }),
  white: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2) }),
  tritium: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 4, 0.8) }),
  dark: std({ color: '#060607', metalness: 0.2, roughness: 0.8 }),
  akWood: std({ color: '#7a3f1c', metalness: 0, roughness: 0.42 }),
  akMag: std({ color: '#6e3a18', metalness: 0.05, roughness: 0.45 }),
  blued: std({ color: '#1f2226', metalness: 0.85, roughness: 0.28 }),
  chrome: std({ color: '#c9ccd1', metalness: 1, roughness: 0.14 }),
  sand: std({ color: '#b59a6e', metalness: 0.05, roughness: 0.62 }),
  green: std({ color: '#3f4a33', metalness: 0.05, roughness: 0.66 }),
  redShell: std({ color: '#9b1d17', metalness: 0.05, roughness: 0.45 }),
  nadeBody: std({ color: '#4a5236', metalness: 0.2, roughness: 0.55 }),
  orange: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.2, 0.2) }),
};

// ------------------------------------------------------------------ montador: junta pecas por material num unico mesh por no
class Kit {
  constructor() { this.m = new Map(); }
  add(mat, g) { if (!this.m.has(mat)) this.m.set(mat, []); this.m.get(mat).push(g); return this; }
  // caixa arredondada (w,h,d) centrada em p, rotacao r (XYZ)
  box(mat, w, h, d, p, r = [0, 0, 0], rad) {
    const rr = rad ?? Math.min(w, h, d) * 0.18;
    const g = rr > 0.0008 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d);
    return this.add(mat, xf(g, p, r));
  }
  // cilindro ao longo de Z (por padrao), raios r0 (frente, -z) e r1 (tras)
  cyl(mat, r0, r1, len, p, r = [Math.PI / 2, 0, 0], seg = 14) { return this.add(mat, xf(new THREE.CylinderGeometry(r1, r0, len, seg, 1), p, r)); }
  sph(mat, rad, p, s = [1, 1, 1]) { const g = new THREE.SphereGeometry(rad, 12, 8); g.scale(...s); return this.add(mat, xf(g, p)); }
  // capsula entre dois pontos
  cap(mat, rad, a, b) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    const g = new THREE.CapsuleGeometry(rad, Math.max(0.001, len), 3, 8);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(A.clone().lerp(B, 0.5), q, new THREE.Vector3(1, 1, 1)));
    return this.add(mat, clean(g));
  }
  geo(mat, g, p = [0, 0, 0], r = [0, 0, 0]) { return this.add(mat, xf(g, p, r)); }
  build(node) {
    for (const [mat, list] of this.m) {
      const g = mergeGeometries(list, false); list.forEach((x) => x.dispose());
      const mesh = new THREE.Mesh(g, mat); mesh.castShadow = false; mesh.receiveShadow = false;
      if (mat.transparent) mesh.renderOrder = 3;
      node.add(mesh);
    }
    this.m.clear();
    return node;
  }
}
function clean(g) {
  let n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  if (n !== g) g.dispose();
  return n;
}
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function xf(g, p = [0, 0, 0], r = [0, 0, 0]) {
  const n = clean(g);
  _e.set(r[0], r[1], r[2]); _q.setFromEuler(_e); _m.compose(_p.set(p[0], p[1], p[2]), _q, _s);
  n.applyMatrix4(_m); return n;
}
const node = (name, p = [0, 0, 0]) => { const o = new THREE.Group(); o.name = name; o.position.set(...p); return o; };

// ------------------------------------------------------------------ retícula holografica projetada no infinito
// desenha no vidro a direcao do eixo da mira: o ponto fica onde a arma aponta, nao onde o vidro esta
export function reticleMaterial(color, kind) {
  const u = { uFwd: { value: new THREE.Vector3(0, 0, -1) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uColor: { value: new THREE.Color(color) }, uBright: { value: 3.2 } };
  return new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vV = mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `
      uniform vec3 uFwd, uUp, uRight, uColor; uniform float uBright; varying vec3 vV;
      void main(){
        vec3 d = normalize(vV); float f = dot(d, uFwd);
        vec2 a = vec2(dot(d, uRight), dot(d, uUp)) / max(f, 1e-3);
        float r = length(a), px = max(fwidth(r), 1e-5);
        float v = 1.0 - smoothstep(0.0021, 0.0021 + px * 1.5, r);
        ${kind === 'holo' ? `
        v += (1.0 - smoothstep(0.0006, 0.0006 + px * 1.5, abs(r - 0.0135))) * 0.9;
        float tick = step(abs(a.x), 0.0006 + px) * step(0.0135, abs(a.y)) * step(abs(a.y), 0.0185)
                   + step(abs(a.y), 0.0006 + px) * step(0.0135, abs(a.x)) * step(abs(a.x), 0.0185) * step(a.y, 0.0);
        v += tick * 0.9;` : ''}
        gl_FragColor = vec4(uColor * uBright * clamp(v, 0.0, 1.0), 1.0);
      }`,
  });
}

// ------------------------------------------------------------------ luvas
// mao "segurando": objeto (cabo) ao longo do eixo Y local, a palma do lado +X; side = 1 direita, -1 esquerda (espelha X)
export function makeHand(side = 1, open = 0) {
  const k = new Kit(), s = side;
  k.box(MAT.glove, 0.026, 0.088, 0.066, [0.03 * s, -0.004, 0.012], [0, 0, 0], 0.011);
  k.box(MAT.glovePad, 0.008, 0.07, 0.05, [0.044 * s, 0, 0.01], [0, 0, 0], 0.003);
  const ys = [0.03, 0.01, -0.01, -0.03];
  ys.forEach((y, i) => {
    const w = i === 3 ? 0.0078 : 0.0092, c = 1 - open;
    k.cap(MAT.glove, w, [0.03 * s, y, -0.018], [0.004 * s, y + 0.002, -0.034 + 0.012 * open]);
    k.cap(MAT.glove, w * 0.95, [0.004 * s, y + 0.002, -0.034 + 0.012 * open], [(-0.022 * c + 0.01 * open) * s, y + 0.003, (-0.018 * c - 0.04 * open)]);
    k.box(MAT.glovePad, 0.012, 0.012, 0.01, [0.033 * s, y, -0.02], [0, 0, 0], 0.003);
  });
  k.cap(MAT.glove, 0.0105, [0.022 * s, 0.035, 0.03], [0.0 * s, 0.05, 0.004]);
  k.cap(MAT.glove, 0.0098, [0.0 * s, 0.05, 0.004], [-0.022 * s, 0.047, -0.012]);
  const g = new THREE.Group(); k.build(g);
  g.userData.wrist = new THREE.Vector3(0.036 * s, -0.045, 0.05);
  return g;
}
// antebraco (manga + punho da luva); comprimento ajustado em runtime (escala Y)
export function makeForearm(withWatch) {
  const k = new Kit();
  k.cyl(MAT.sleeve, 0.036, 0.05, 1, [0, 0.5, 0], [0, 0, 0], 12);
  k.cyl(MAT.sleeveDark, 0.052, 0.053, 0.05, [0, 0.98, 0], [0, 0, 0], 12);
  const g = new THREE.Group(); k.build(g);
  const cuff = new Kit(); cuff.cyl(MAT.glove, 0.034, 0.037, 0.05, [0, 0.03, 0], [0, 0, 0], 12);
  if (withWatch) { cuff.cyl(MAT.watch, 0.039, 0.039, 0.024, [0, 0.085, 0], [0, 0, 0], 16); cuff.box(MAT.watch, 0.026, 0.01, 0.03, [0, 0.085, 0.036], [0, 0, 0], 0.003); }
  const c = new THREE.Group(); cuff.build(c);
  return { sleeve: g, cuff: c };
}

// ------------------------------------------------------------------ rifle (estilo M4 bicolor com mira holografica)
function rifle(tp) {
  const root = node('rifle'), k = new Kit();
  const Y = 0.07;
  k.box(MAT.metal, 0.052, 0.05, 0.27, [0, Y, -0.07], [0, 0, 0], 0.005);
  k.box(MAT.metal, 0.024, 0.012, 0.27, [0, Y + 0.031, -0.07], [0, 0, 0], 0.002);
  for (let z = -0.195; z <= 0.06; z += 0.018) k.box(MAT.metal2, 0.027, 0.006, 0.008, [0, Y + 0.039, z], [0, 0, 0], 0);
  k.box(MAT.metal, 0.047, 0.05, 0.19, [0, 0.022, -0.045], [0, 0, 0], 0.006);
  k.box(MAT.metal, 0.05, 0.05, 0.085, [0, -0.012, -0.112], [0, 0, 0], 0.005);
  k.box(MAT.polymer, 0.032, 0.105, 0.046, [0, -0.045, 0.028], [-0.32, 0, 0], 0.01);
  k.box(MAT.metal, 0.008, 0.006, 0.07, [0, -0.013, -0.045], [0, 0, 0], 0.002);
  k.box(MAT.metal2, 0.006, 0.024, 0.006, [0, -0.002, -0.036], [0.35, 0, 0], 0.002);
  k.cyl(MAT.metal, 0.0165, 0.0165, 0.17, [0, 0.066, 0.16]);
  k.box(MAT.tan, 0.042, 0.07, 0.15, [0, 0.05, 0.255], [0, 0, 0], 0.012);
  k.box(MAT.tan, 0.036, 0.04, 0.12, [0, 0.004, 0.25], [0.12, 0, 0], 0.01);
  k.box(MAT.rubber, 0.044, 0.105, 0.022, [0, 0.035, 0.335], [0.1, 0, 0], 0.008);
  k.cyl(MAT.tan, 0.029, 0.029, 0.34, [0, Y, -0.385], [Math.PI / 2, Math.PI / 8, 0], 8);
  for (const zz of [-0.28, -0.34, -0.40, -0.46, -0.52]) for (const sx of [1, -1]) k.box(MAT.dark, 0.004, 0.009, 0.034, [sx * 0.0275, Y, zz], [0, 0, 0], 0.002);
  k.box(MAT.metal, 0.02, 0.01, 0.34, [0, Y + 0.031, -0.385], [0, 0, 0], 0.002);
  k.cyl(MAT.metal, 0.0095, 0.0095, 0.15, [0, Y, -0.625]);
  k.cyl(MAT.metal2, 0.0132, 0.0132, 0.058, [0, Y, -0.725], undefined, 10);
  for (const zz of [-0.71, -0.735]) k.box(MAT.dark, 0.028, 0.004, 0.008, [0, Y + 0.005, zz], [0, 0, 0], 0);
  k.box(MAT.polymer, 0.03, 0.028, 0.08, [0, Y - 0.04, -0.37], [0.4, 0, 0], 0.008);
  k.cyl(MAT.metal2, 0.0065, 0.0065, 0.02, [0.03, Y + 0.004, 0.02], [0, 0, Math.PI / 2]);
  k.box(MAT.dark, 0.003, 0.018, 0.05, [0.0262, Y, -0.045], [0, 0, 0], 0);
  // mira holografica
  const H = Y + 0.043;
  k.box(MAT.metal, 0.044, 0.016, 0.1, [0, H + 0.008, -0.03], [0, 0, 0], 0.004);
  k.box(MAT.metal, 0.007, 0.05, 0.075, [-0.0225, H + 0.04, -0.035], [0, 0, 0], 0.003);
  k.box(MAT.metal, 0.007, 0.05, 0.075, [0.0225, H + 0.04, -0.035], [0, 0, 0], 0.003);
  k.box(MAT.metal, 0.052, 0.007, 0.08, [0, H + 0.066, -0.035], [0, 0, 0], 0.003);
  k.box(MAT.polymer, 0.006, 0.012, 0.012, [0.028, H + 0.028, -0.02], [0, 0, 0], 0.002);
  k.box(MAT.polymer, 0.006, 0.012, 0.012, [0.028, H + 0.028, -0.04], [0, 0, 0], 0.002);
  k.build(root);
  const sight = new THREE.Vector3(0, H + 0.04, -0.035);
  if (!tp) {
    for (const z of [0.001, -0.071]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.048), MAT.glass); g.position.set(0, sight.y, z); g.renderOrder = 3; root.add(g); }
    const ret = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.048), reticleMaterial(new THREE.Color(1, 0.08, 0.05), 'holo'));
    ret.position.set(0, sight.y, 0.0012); ret.renderOrder = 4; root.add(ret); root.userData.reticle = ret;
  }
  // pecas moveis
  const mag = node('mag', [0, -0.03, -0.112]), mk = new Kit();
  mk.box(MAT.polymer, 0.03, 0.085, 0.076, [0, -0.03, 0], [0, 0, 0], 0.005);
  mk.box(MAT.polymer, 0.03, 0.075, 0.074, [0, -0.1, -0.012], [-0.14, 0, 0], 0.005);
  mk.box(MAT.polymer, 0.03, 0.06, 0.072, [0, -0.16, -0.032], [-0.26, 0, 0], 0.005);
  mk.box(MAT.polymer, 0.036, 0.012, 0.082, [0, -0.192, -0.045], [-0.3, 0, 0], 0.004);
  mk.cyl(MAT.brass, 0.0045, 0.0045, 0.03, [0, 0.014, -0.005], undefined, 8);
  mk.build(mag); root.add(mag);
  const bolt = node('bolt', [0.0262, Y, -0.045]); const bk = new Kit();
  bk.box(MAT.steel, 0.003, 0.012, 0.045, [0, 0, 0], [0, 0, 0], 0); bk.build(bolt); root.add(bolt);
  const charge = node('charge', [0, Y + 0.02, 0.075]); const ck = new Kit();
  ck.box(MAT.metal2, 0.05, 0.009, 0.012, [0, 0, 0.012], [0, 0, 0], 0.003); ck.box(MAT.metal2, 0.012, 0.008, 0.03, [0, 0, -0.005], [0, 0, 0], 0.002);
  ck.build(charge); root.add(charge);
  root.userData = {
    ...root.userData, kind: 'rifle', parts: { mag, bolt, charge }, sight, adsDist: 0.25,
    muzzle: new THREE.Vector3(0, Y, -0.76), eject: new THREE.Vector3(0.03, Y, -0.045), support: new THREE.Vector3(0, Y - 0.05, -0.37),
    hip: { p: [0.155, -0.172, -0.35], r: [0.015, 0.1, -0.03] }, flash: 0.14,
  };
  return root;
}

// ------------------------------------------------------------------ pistola (polimero com massa de mira tritio)
function pistol(tp) {
  const root = node('pistol'), k = new Kit();
  k.box(MAT.polymer, 0.03, 0.028, 0.17, [0, 0.005, -0.055], [0, 0, 0], 0.006);
  k.box(MAT.polymer, 0.029, 0.1, 0.05, [0, -0.05, 0.014], [-0.3, 0, 0], 0.01);
  k.box(MAT.polymer, 0.026, 0.02, 0.03, [0, 0.0, 0.035], [0.2, 0, 0], 0.008);
  k.box(MAT.polymer, 0.006, 0.005, 0.045, [0, -0.019, -0.04], [0, 0, 0], 0.002);
  k.box(MAT.metal2, 0.006, 0.022, 0.006, [0, -0.006, -0.032], [0.3, 0, 0], 0.002);
  for (let z = -0.12; z < -0.07; z += 0.012) k.box(MAT.dark, 0.031, 0.004, 0.006, [0, -0.009, z], [0, 0, 0], 0);
  k.build(root);
  const slide = node('slide', [0, 0.033, -0.055]), sk = new Kit();
  sk.box(MAT.metal, 0.029, 0.03, 0.188, [0, 0, 0], [0, 0, 0], 0.004);
  for (let z = 0.058; z < 0.09; z += 0.0065) sk.box(MAT.dark, 0.0302, 0.02, 0.0025, [0, -0.002, z], [0, 0, 0], 0);
  sk.box(MAT.steel, 0.016, 0.006, 0.036, [0, 0.0128, -0.018], [0, 0, 0], 0.002);
  sk.cyl(MAT.dark, 0.0055, 0.0055, 0.004, [0, 0.0, -0.0945], undefined, 12);
  sk.box(MAT.metal, 0.0065, 0.009, 0.008, [-0.0075, 0.019, 0.083], [0, 0, 0], 0.0015);
  sk.box(MAT.metal, 0.0065, 0.009, 0.008, [0.0075, 0.019, 0.083], [0, 0, 0], 0.0015);
  sk.box(MAT.white, 0.0025, 0.0025, 0.001, [-0.0075, 0.02, 0.0875], [0, 0, 0], 0);
  sk.box(MAT.white, 0.0025, 0.0025, 0.001, [0.0075, 0.02, 0.0875], [0, 0, 0], 0);
  sk.box(MAT.metal, 0.0042, 0.009, 0.006, [0, 0.019, -0.088], [0, 0, 0], 0.0012);
  sk.box(MAT.tritium, 0.0026, 0.0026, 0.001, [0, 0.0205, -0.0848], [0, 0, 0], 0);
  sk.build(slide); root.add(slide);
  const mag = node('mag', [0, -0.02, 0.012]), mk = new Kit();
  mk.box(MAT.metal, 0.022, 0.085, 0.04, [0, -0.035, 0.005], [-0.3, 0, 0], 0.004);
  mk.box(MAT.polymer, 0.031, 0.012, 0.054, [0, -0.083, 0.022], [-0.3, 0, 0], 0.004);
  mk.cyl(MAT.brass, 0.004, 0.004, 0.018, [0, 0.006, -0.006], undefined, 8);
  mk.build(mag); root.add(mag);
  root.userData = {
    kind: 'pistol', parts: { slide, mag }, sight: new THREE.Vector3(0, 0.033 + 0.0205, -0.143), adsDist: 0.32,
    muzzle: new THREE.Vector3(0, 0.033, -0.155), eject: new THREE.Vector3(0.01, 0.048, -0.075), support: new THREE.Vector3(-0.02, -0.055, 0.0),
    hip: { p: [0.125, -0.135, -0.33], r: [0.03, 0.1, 0.0] }, flash: 0.1,
  };
  return root;
}

// ------------------------------------------------------------------ sniper (ferrolho, coronha verde-oliva, luneta)
function sniper(tp) {
  const root = node('sniper'), k = new Kit(), Y = 0.075;
  k.box(MAT.olive, 0.05, 0.07, 0.4, [0, 0.022, 0.13], [0, 0, 0], 0.012);
  k.box(MAT.olive, 0.048, 0.13, 0.05, [0, 0.02, 0.345], [0, 0, 0], 0.012);
  k.box(MAT.rubber, 0.05, 0.135, 0.018, [0, 0.02, 0.376], [0, 0, 0], 0.006);
  k.box(MAT.olive, 0.044, 0.03, 0.17, [0, 0.07, 0.2], [0, 0, 0], 0.01);
  k.box(MAT.olive, 0.032, 0.1, 0.046, [0, -0.04, 0.022], [-0.35, 0, 0], 0.01);
  k.box(MAT.olive, 0.054, 0.05, 0.38, [0, 0.036, -0.25], [0, 0, 0], 0.012);
  k.box(MAT.metal, 0.008, 0.006, 0.06, [0, -0.012, -0.03], [0, 0, 0], 0.002);
  k.box(MAT.metal2, 0.006, 0.022, 0.006, [0, -0.002, -0.022], [0.3, 0, 0], 0.002);
  k.cyl(MAT.metal, 0.019, 0.019, 0.22, [0, Y, -0.1]);
  k.cyl(MAT.metal, 0.0105, 0.0135, 0.52, [0, Y, -0.47]);
  k.box(MAT.metal2, 0.034, 0.026, 0.07, [0, Y, -0.765], [0, 0, 0], 0.005);
  for (const zz of [-0.75, -0.77, -0.79]) for (const sx of [1, -1]) k.box(MAT.dark, 0.002, 0.014, 0.007, [sx * 0.017, Y, zz], [0, 0, 0], 0);
  k.cyl(MAT.metal, 0.004, 0.004, 0.2, [0.012, 0.0, -0.3]); k.cyl(MAT.metal, 0.004, 0.004, 0.2, [-0.012, 0.0, -0.3]);
  // luneta
  const S = 0.14;
  k.cyl(MAT.metal, 0.0155, 0.0155, 0.27, [0, S, -0.1]);
  k.cyl(MAT.metal, 0.027, 0.0165, 0.075, [0, S, -0.27]);
  k.cyl(MAT.metal2, 0.028, 0.028, 0.016, [0, S, -0.31]);
  k.cyl(MAT.metal, 0.0195, 0.0165, 0.07, [0, S, 0.05]);
  k.cyl(MAT.metal2, 0.021, 0.021, 0.018, [0, S, 0.085]);
  k.cyl(MAT.metal2, 0.011, 0.011, 0.026, [0, S + 0.025, -0.1], [0, 0, 0]);
  k.cyl(MAT.metal2, 0.011, 0.011, 0.026, [0.025, S, -0.1], [0, 0, Math.PI / 2]);
  for (const zz of [-0.03, -0.17]) k.box(MAT.metal, 0.036, 0.05, 0.022, [0, (S + Y) / 2 + 0.005, zz], [0, 0, 0], 0.004);
  k.geo(MAT.lensFront, new THREE.CircleGeometry(0.023, 24), [0, S, -0.3185], [0, Math.PI, 0]);
  k.geo(MAT.lensRear, new THREE.CircleGeometry(0.017, 24), [0, S, 0.0945]);
  k.build(root);
  const mag = node('mag', [0, 0.02, -0.14]), mk = new Kit();
  mk.box(MAT.metal, 0.03, 0.06, 0.08, [0, -0.02, 0], [0, 0, 0], 0.004); mk.build(mag); root.add(mag);
  const bolt = node('bolt', [0.0, Y, 0.0]), bk = new Kit();
  bk.cyl(MAT.steel, 0.009, 0.009, 0.1, [0, 0, -0.02]);
  bk.cyl(MAT.steel, 0.0042, 0.0042, 0.04, [0.026, -0.004, 0.02], [0, 0, Math.PI / 2 + 0.25]);
  bk.sph(MAT.metal, 0.009, [0.046, -0.01, 0.02]);
  bk.build(bolt); root.add(bolt);
  root.userData = {
    kind: 'sniper', parts: { mag, bolt }, sight: new THREE.Vector3(0, S, 0.095), adsDist: 0.09,
    muzzle: new THREE.Vector3(0, Y, -0.8), eject: new THREE.Vector3(0.025, Y + 0.01, -0.06), support: new THREE.Vector3(0, -0.005, -0.3),
    hip: { p: [0.16, -0.18, -0.36], r: [0.01, 0.09, -0.02] }, flash: 0.2,
  };
  return root;
}

// ------------------------------------------------------------------ facas
function bladeGeo(pts, thick, bevel = 0.0014) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) sh.quadraticCurveTo(p[0], p[1], p[2], p[3]); else sh.lineTo(p[0], p[1]);
  }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -thick / 2);
  // shape no plano XY (x = ao longo da lamina) -> gira para a lamina apontar para -Z, fio para baixo
  g.rotateY(Math.PI / 2);
  return g;
}
function knife(kind) {
  // raiz = pegada da mao (a mao e presa aqui pelo rig); "spin" = a faca em si, girando em torno de um pivo real
  const root = node('knife'), parts = {};
  const spin = node('spin'); root.add(spin); parts.spin = spin;
  const k = new Kit();
  let pivot = [0, 0, 0];
  if (kind === 'karambit') {
    pivot = [0, -0.012, 0.075]; // centro do anel (o dedo passa por aqui)
    const P = (x, y, z) => [x - pivot[0], y - pivot[1], z - pivot[2]];
    k.box(MAT.polymer, 0.024, 0.03, 0.1, P(0, 0, 0.01), [0.25, 0, 0], 0.01);
    for (let i = 0; i < 4; i++) k.box(MAT.glovePad, 0.025, 0.004, 0.012, P(0, -0.012 + i * 0.002, -0.02 + i * 0.022), [0.25, 0, 0], 0.002);
    k.geo(MAT.metal, new THREE.TorusGeometry(0.019, 0.0055, 8, 20), P(0, -0.012, 0.075), [0, Math.PI / 2, 0]);
    k.geo(MAT.blade, bladeGeo([[0, 0], [0.05, -0.004], [0.1, 0.012, 0.13, 0.05], [0.118, 0.04], [0.08, 0.018, 0.02, 0.018], [0, 0.016]], 0.0035), P(0, 0.016, -0.036), [0.35, 0, 0]);
    k.build(spin);
    root.userData = { kind: 'karambit', parts, pivot, hip: { p: [0.12, -0.14, -0.25], r: [0.4, 0.3, -0.25] } };
  } else if (kind === 'butterfly') {
    pivot = [0, 0, -0.045]; // pino
    const ha = node('handleA'), hb = node('handleB'), bl = node('blade');
    const ka = new Kit(); ka.box(MAT.metal2, 0.009, 0.02, 0.12, [0.0065, 0, 0.06], [0, 0, 0], 0.003);
    for (let i = 0; i < 4; i++) ka.box(MAT.dark, 0.0092, 0.008, 0.012, [0.0065, 0, 0.025 + i * 0.022], [0, 0, 0], 0.001);
    ka.box(MAT.steel, 0.006, 0.02, 0.01, [0.0065, 0, 0.004], [0, 0, 0], 0.002);
    ka.build(ha);
    const kb = new Kit(); kb.box(MAT.metal2, 0.009, 0.02, 0.12, [-0.0065, 0, 0.06], [0, 0, 0], 0.003);
    for (let i = 0; i < 4; i++) kb.box(MAT.dark, 0.0092, 0.008, 0.012, [-0.0065, 0, 0.025 + i * 0.022], [0, 0, 0], 0.001);
    kb.box(MAT.steel, 0.006, 0.02, 0.01, [-0.0065, 0, 0.004], [0, 0, 0], 0.002);
    kb.box(MAT.steel, 0.02, 0.006, 0.006, [-0.003, 0.0, 0.118], [0, 0, 0], 0.002); // trava
    kb.build(hb);
    const kl = new Kit();
    kl.geo(MAT.blade, bladeGeo([[0, -0.01], [0.095, -0.008], [0.118, 0.004], [0.1, 0.008], [0, 0.009]], 0.003), [0, 0, 0], [0, 0, 0]);
    kl.box(MAT.bladeDark, 0.0034, 0.006, 0.06, [0, 0.004, -0.05], [0, 0, 0], 0.001);
    kl.cyl(MAT.steel, 0.004, 0.004, 0.022, [0, 0, 0], [0, 0, Math.PI / 2], 10);
    kl.build(bl);
    spin.add(ha, hb, bl);
    parts.ha = ha; parts.hb = hb; parts.bl = bl;
    root.userData = { kind: 'butterfly', parts, pivot, hip: { p: [0.12, -0.135, -0.25], r: [0.35, 0.3, -0.2] } };
  } else {
    pivot = [0, 0, 0.012]; // meio do cabo
    const P = (x, y, z) => [x - pivot[0], y - pivot[1], z - pivot[2]];
    k.box(MAT.rubber, 0.026, 0.031, 0.11, P(0, 0, 0.018), [0, 0, 0], 0.011);
    for (let i = 0; i < 5; i++) k.box(MAT.polymer, 0.027, 0.032, 0.006, P(0, 0, -0.022 + i * 0.02), [0, 0, 0], 0.003);
    k.box(MAT.metal, 0.052, 0.012, 0.012, P(0, 0, -0.042), [0, 0, 0], 0.003);
    k.box(MAT.metal, 0.03, 0.034, 0.016, P(0, 0, 0.078), [0, 0, 0], 0.006);
    k.geo(MAT.blade, bladeGeo([[0, -0.014], [0.12, -0.014], [0.17, 0.0, 0.2, 0.012], [0.13, 0.016], [0.07, 0.016], [0, 0.015]], 0.0045, 0.0018), P(0, 0, -0.048), [0, 0, 0]);
    k.box(MAT.bladeDark, 0.0052, 0.004, 0.09, P(0, 0.009, -0.1), [0, 0, 0], 0.001);
    k.build(spin);
    root.userData = { kind: 'default', parts, pivot, hip: { p: [0.12, -0.14, -0.26], r: [0.35, 0.28, -0.15] } };
  }
  spin.position.set(...pivot);
  root.userData.sight = new THREE.Vector3(0, 0, -0.1); root.userData.adsDist = 0.3;
  return root;
}

// ------------------------------------------------------------------ fuzil estilo AK (madeira, carregador curvo, alca e massa)
function ak(tp) {
  const root = node('ak'), k = new Kit(), Y = 0.066;
  k.box(MAT.blued, 0.046, 0.05, 0.25, [0, Y - 0.004, -0.06], [0, 0, 0], 0.004);            // caixa da culatra
  k.box(MAT.blued, 0.044, 0.02, 0.24, [0, Y + 0.026, -0.055], [0, 0, 0], 0.008);           // tampa
  k.box(MAT.blued, 0.03, 0.012, 0.03, [0, Y + 0.034, 0.066], [0, 0, 0], 0.003);
  for (let z = 0.02; z < 0.07; z += 0.008) k.box(MAT.dark, 0.045, 0.002, 0.003, [0, Y + 0.037, z], [0, 0, 0], 0);
  k.box(MAT.blued, 0.044, 0.03, 0.2, [0, 0.024, -0.05], [0, 0, 0], 0.004);
  k.box(MAT.akWood, 0.033, 0.1, 0.045, [0, -0.043, 0.028], [-0.34, 0, 0], 0.01);          // punho
  k.box(MAT.blued, 0.008, 0.006, 0.07, [0, -0.012, -0.04], [0, 0, 0], 0.002);              // guarda-mato
  k.box(MAT.metal2, 0.006, 0.022, 0.006, [0, -0.002, -0.033], [0.35, 0, 0], 0.002);
  k.box(MAT.blued, 0.004, 0.028, 0.07, [0.024, Y - 0.006, -0.08], [0, 0, 0], 0.001);       // seletor
  // coronha de madeira caindo
  k.box(MAT.akWood, 0.04, 0.06, 0.2, [0, 0.03, 0.18], [0.12, 0, 0], 0.012);
  k.box(MAT.akWood, 0.036, 0.1, 0.07, [0, 0.0, 0.27], [0.12, 0, 0], 0.012);
  k.box(MAT.blued, 0.04, 0.105, 0.012, [0, -0.005, 0.31], [0.12, 0, 0], 0.004);
  // guarda-mao de madeira, tubo de gas e cano
  k.box(MAT.akWood, 0.046, 0.042, 0.2, [0, Y - 0.018, -0.32], [0, 0, 0], 0.012);
  for (const z of [-0.26, -0.31, -0.36]) k.box(MAT.dark, 0.047, 0.004, 0.02, [0, Y - 0.018, z], [0, 0, 0], 0.001);
  k.box(MAT.blued, 0.05, 0.016, 0.02, [0, Y - 0.018, -0.21], [0, 0, 0], 0.004);
  k.box(MAT.blued, 0.05, 0.016, 0.02, [0, Y - 0.018, -0.43], [0, 0, 0], 0.004);
  k.cyl(MAT.akWood, 0.016, 0.017, 0.2, [0, Y + 0.024, -0.33], undefined, 10);
  k.cyl(MAT.blued, 0.0095, 0.0095, 0.36, [0, Y - 0.012, -0.58]);
  k.box(MAT.blued, 0.024, 0.028, 0.03, [0, Y + 0.002, -0.58], [0, 0, 0], 0.004);           // bloco de gas
  k.box(MAT.blued, 0.02, 0.05, 0.022, [0, Y + 0.012, -0.665], [0, 0, 0], 0.003);           // base da massa
  k.box(MAT.blued, 0.004, 0.02, 0.004, [0, Y + 0.046, -0.665], [0, 0, 0], 0.001);          // massa de mira
  k.box(MAT.blued, 0.004, 0.02, 0.018, [-0.009, Y + 0.044, -0.665], [0, 0, 0], 0.001);
  k.box(MAT.blued, 0.004, 0.02, 0.018, [0.009, Y + 0.044, -0.665], [0, 0, 0], 0.001);
  k.cyl(MAT.blued, 0.013, 0.012, 0.05, [0, Y - 0.012, -0.78], undefined, 10);             // freio de boca
  for (const z of [-0.768, -0.788]) k.box(MAT.dark, 0.027, 0.004, 0.006, [0, Y, z], [0, 0, 0], 0);
  // alca de mira (tangente) em cima do guarda-mao
  k.box(MAT.blued, 0.03, 0.012, 0.05, [0, Y + 0.036, -0.2], [0, 0, 0], 0.003);
  for (const sx of [-1, 1]) k.box(MAT.blued, 0.011, 0.014, 0.008, [sx * 0.0075, Y + 0.048, -0.182], [0, 0, 0], 0.001); // alca com entalhe
  k.build(root);
  const sightY = Y + 0.054;
  const mag = node('mag', [0, -0.018, -0.105]), mk = new Kit();
  for (let i = 0; i < 6; i++) { const a = -0.1 - i * 0.085; mk.box(MAT.akMag, 0.024, 0.036, 0.058 - i * 0.002, [0, -0.018 - i * 0.031, -0.01 - i * i * 0.0032 - i * 0.005], [a, 0, 0], 0.004); }
  for (let i = 0; i < 5; i++) mk.box(MAT.dark, 0.0245, 0.003, 0.046, [0, -0.034 - i * 0.031, -0.012 - i * i * 0.0032 - i * 0.005], [-0.14 - i * 0.085, 0, 0], 0);
  mk.cyl(MAT.brass, 0.0048, 0.0048, 0.03, [0, 0.004, -0.004], undefined, 8);
  mk.build(mag); root.add(mag);
  const bolt = node('bolt', [0.03, Y + 0.004, -0.02]); const bk = new Kit();
  bk.box(MAT.steel, 0.008, 0.01, 0.03, [0, 0, 0], [0, 0, 0], 0.002); bk.cyl(MAT.steel, 0.006, 0.006, 0.02, [0.012, 0, -0.01], [0, 0, Math.PI / 2], 8);
  bk.build(bolt); root.add(bolt);
  root.userData = {
    kind: 'ak', parts: { mag, bolt, charge: bolt }, sight: new THREE.Vector3(0, sightY, -0.182), adsDist: 0.25, boltRest: -0.02, boltTravel: 0.045,
    muzzle: new THREE.Vector3(0, Y - 0.012, -0.81), eject: new THREE.Vector3(0.03, Y, -0.06),
    hip: { p: [0.155, -0.17, -0.34], r: [0.015, 0.1, -0.03] }, flash: 0.15,
  };
  return root;
}

// ------------------------------------------------------------------ submetralhadora compacta (polimero, red dot pequeno)
function smg(tp) {
  const root = node('smg'), k = new Kit(), Y = 0.06;
  k.box(MAT.polymer, 0.044, 0.056, 0.26, [0, Y - 0.005, -0.08], [0, 0, 0], 0.01);
  k.box(MAT.metal, 0.02, 0.01, 0.24, [0, Y + 0.028, -0.08], [0, 0, 0], 0.002);           // trilho
  for (let z = -0.19; z <= 0.03; z += 0.016) k.box(MAT.metal2, 0.024, 0.005, 0.006, [0, Y + 0.035, z], [0, 0, 0], 0);
  k.box(MAT.polymer, 0.032, 0.1, 0.044, [0, -0.043, 0.024], [-0.28, 0, 0], 0.01);
  k.box(MAT.polymer, 0.04, 0.03, 0.18, [0, 0.015, -0.04], [0, 0, 0], 0.008);
  k.box(MAT.polymer, 0.008, 0.006, 0.065, [0, -0.012, -0.035], [0, 0, 0], 0.002);
  k.box(MAT.metal2, 0.006, 0.02, 0.006, [0, -0.002, -0.028], [0.35, 0, 0], 0.002);
  k.box(MAT.polymer, 0.036, 0.06, 0.03, [0, Y - 0.05, -0.19], [0.25, 0, 0], 0.008);       // empunhadura frontal
  k.cyl(MAT.metal, 0.011, 0.011, 0.07, [0, Y - 0.004, -0.245]);
  k.cyl(MAT.polymer, 0.018, 0.018, 0.14, [0, Y - 0.004, -0.33], undefined, 14);             // supressor
  k.cyl(MAT.metal2, 0.0182, 0.0182, 0.01, [0, Y - 0.004, -0.27], undefined, 14);
  k.cyl(MAT.dark, 0.006, 0.006, 0.004, [0, Y - 0.004, -0.4], undefined, 10);
  // coronha retratil (hastes)
  for (const x of [-0.014, 0.014]) k.cyl(MAT.metal, 0.004, 0.004, 0.1, [x, Y - 0.002, 0.1]);
  k.box(MAT.polymer, 0.036, 0.07, 0.016, [0, Y - 0.018, 0.152], [0, 0, 0], 0.006);
  // mira reflex pequena
  const H = Y + 0.04;
  k.box(MAT.metal, 0.032, 0.012, 0.05, [0, H - 0.002, -0.06], [0, 0, 0], 0.003);
  for (const sx of [-1, 1]) k.box(MAT.metal, 0.005, 0.036, 0.012, [sx * 0.0155, H + 0.02, -0.08], [0, 0, 0], 0.0015);
  k.box(MAT.metal, 0.036, 0.005, 0.012, [0, H + 0.0355, -0.08], [0, 0, 0], 0.0015);
  k.box(MAT.metal, 0.036, 0.006, 0.012, [0, H + 0.004, -0.08], [0, 0, 0], 0.0015);
  k.build(root);
  const sight = new THREE.Vector3(0, H + 0.022, -0.075);
  if (!tp) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(0.026, 0.026), MAT.glass); g.position.set(0, sight.y, -0.0875); g.renderOrder = 3; root.add(g);
    const ret = new THREE.Mesh(new THREE.PlaneGeometry(0.026, 0.026), reticleMaterial(new THREE.Color(1, 0.12, 0.08), 'dot'));
    ret.position.set(0, sight.y, -0.086); ret.renderOrder = 4; root.add(ret); root.userData.reticle = ret;
  }
  const mag = node('mag', [0, -0.03, -0.1]), mk = new Kit();
  for (let i = 0; i < 4; i++) mk.box(MAT.polymer, 0.026, 0.05, 0.05, [0, -0.02 - i * 0.042, -0.003 - i * 0.008], [-0.1 - i * 0.03, 0, 0], 0.004);
  mk.cyl(MAT.brass, 0.0042, 0.0042, 0.02, [0, 0.008, 0], undefined, 8);
  mk.build(mag); root.add(mag);
  const charge = node('charge', [-0.026, Y + 0.012, -0.17]), ck = new Kit();
  ck.box(MAT.metal2, 0.01, 0.01, 0.03, [0, 0, 0], [0, 0, 0], 0.002); ck.build(charge); root.add(charge);
  const bolt = node('bolt', [0.023, Y, -0.06]), bk = new Kit(); bk.box(MAT.steel, 0.003, 0.012, 0.04, [0, 0, 0], [0, 0, 0], 0); bk.build(bolt); root.add(bolt);
  root.userData = {
    ...root.userData, kind: 'smg', parts: { mag, bolt, charge }, sight, adsDist: 0.22, boltRest: -0.06, boltTravel: 0.025, chargeRest: -0.17,
    muzzle: new THREE.Vector3(0, Y - 0.004, -0.41), eject: new THREE.Vector3(0.025, Y, -0.06),
    hip: { p: [0.14, -0.16, -0.32], r: [0.02, 0.1, -0.03] }, flash: 0.08,
  };
  return root;
}

// ------------------------------------------------------------------ escopeta de bombeamento
function shotgun(tp) {
  const root = node('shotgun'), k = new Kit(), Y = 0.062;
  k.box(MAT.blued, 0.046, 0.066, 0.2, [0, Y - 0.012, -0.07], [0, 0, 0], 0.008);            // receptor
  k.box(MAT.blued, 0.012, 0.006, 0.19, [0, Y + 0.024, -0.07], [0, 0, 0], 0.002);
  k.box(MAT.dark, 0.002, 0.03, 0.07, [0.0232, Y - 0.004, -0.06], [0, 0, 0], 0);           // janela de ejecao
  k.box(MAT.polymer, 0.033, 0.1, 0.046, [0, -0.043, 0.026], [-0.32, 0, 0], 0.01);
  k.box(MAT.blued, 0.008, 0.006, 0.07, [0, -0.02, -0.03], [0, 0, 0], 0.002);
  k.box(MAT.metal2, 0.006, 0.02, 0.006, [0, -0.008, -0.025], [0.35, 0, 0], 0.002);
  k.box(MAT.polymer, 0.042, 0.066, 0.2, [0, 0.03, 0.16], [0.1, 0, 0], 0.012);             // coronha
  k.box(MAT.polymer, 0.04, 0.11, 0.08, [0, 0.005, 0.26], [0.1, 0, 0], 0.012);
  k.box(MAT.rubber, 0.042, 0.12, 0.02, [0, 0.0, 0.305], [0.1, 0, 0], 0.006);
  k.cyl(MAT.blued, 0.0115, 0.0115, 0.58, [0, Y + 0.004, -0.46]);                           // cano
  k.cyl(MAT.blued, 0.0105, 0.0105, 0.44, [0, Y - 0.03, -0.39]);                            // tubo do carregador
  k.cyl(MAT.blued, 0.012, 0.012, 0.03, [0, Y - 0.03, -0.62], undefined, 10);
  k.box(MAT.blued, 0.014, 0.034, 0.018, [0, Y - 0.013, -0.62], [0, 0, 0], 0.003);
  k.box(MAT.blued, 0.006, 0.006, 0.54, [0, Y + 0.017, -0.46], [0, 0, 0], 0.001);          // fita ventilada
  k.sph(MAT.chrome, 0.0035, [0, Y + 0.023, -0.735]);                                        // mira de conta
  k.box(MAT.blued, 0.014, 0.012, 0.012, [-0.0, Y + 0.026, -0.02], [0, 0, 0], 0.002);       // mira traseira
  k.box(MAT.dark, 0.004, 0.006, 0.013, [0, Y + 0.031, -0.02], [0, 0, 0], 0);
  k.box(MAT.dark, 0.02, 0.004, 0.06, [0, Y - 0.046, -0.07], [0, 0, 0], 0.001);             // portinhola
  k.build(root);
  const pump = node('pump', [0, Y - 0.03, -0.36]), pk = new Kit();
  pk.box(MAT.polymer, 0.046, 0.04, 0.15, [0, -0.002, 0], [0, 0, 0], 0.012);
  for (let z = -0.06; z <= 0.06; z += 0.015) pk.box(MAT.dark, 0.047, 0.004, 0.006, [0, -0.004, z], [0, 0, 0], 0);
  pk.build(pump); root.add(pump);
  const shell = node('shell', [0, Y - 0.06, -0.06]), sk = new Kit();
  sk.cyl(MAT.redShell, 0.0095, 0.0095, 0.05, [0, 0, 0.008], undefined, 10); sk.cyl(MAT.brass, 0.0098, 0.0098, 0.014, [0, 0, 0.04], undefined, 10);
  sk.build(shell); shell.visible = false; root.add(shell);
  root.userData = {
    kind: 'shotgun', parts: { pump, shell }, sight: new THREE.Vector3(0, Y + 0.0255, -0.02), adsDist: 0.3, pumpRest: -0.36,
    muzzle: new THREE.Vector3(0, Y + 0.004, -0.76), eject: new THREE.Vector3(0.028, Y, -0.06),
    hip: { p: [0.15, -0.165, -0.34], r: [0.02, 0.1, -0.03] }, flash: 0.22,
  };
  return root;
}

// ------------------------------------------------------------------ DMR (semi-auto, luneta media)
function dmr(tp) {
  const root = node('dmr'), k = new Kit(), Y = 0.07;
  k.box(MAT.metal, 0.052, 0.052, 0.28, [0, Y, -0.07], [0, 0, 0], 0.006);
  k.box(MAT.metal, 0.048, 0.05, 0.2, [0, 0.022, -0.05], [0, 0, 0], 0.006);
  k.box(MAT.polymer, 0.032, 0.105, 0.046, [0, -0.045, 0.028], [-0.32, 0, 0], 0.01);
  k.box(MAT.metal, 0.008, 0.006, 0.07, [0, -0.013, -0.045], [0, 0, 0], 0.002);
  k.box(MAT.metal2, 0.006, 0.024, 0.006, [0, -0.002, -0.036], [0.35, 0, 0], 0.002);
  k.box(MAT.sand, 0.044, 0.058, 0.23, [0, Y, -0.34], [0, 0, 0], 0.008);                    // guarda-mao
  for (const z of [-0.26, -0.3, -0.34, -0.38, -0.42]) for (const sx of [1, -1]) k.box(MAT.dark, 0.004, 0.01, 0.025, [sx * 0.0222, Y, z], [0, 0, 0], 0.001);
  k.cyl(MAT.metal, 0.0105, 0.0105, 0.28, [0, Y, -0.6]);
  k.cyl(MAT.metal2, 0.016, 0.016, 0.07, [0, Y, -0.76], undefined, 12);
  for (const zz of [-0.74, -0.76, -0.78]) k.box(MAT.dark, 0.033, 0.004, 0.008, [0, Y, zz], [0, 0, 0], 0);
  // coronha ajustavel
  k.box(MAT.polymer, 0.04, 0.05, 0.16, [0, 0.055, 0.16], [0, 0, 0], 0.01);
  k.box(MAT.polymer, 0.044, 0.11, 0.07, [0, 0.03, 0.26], [0, 0, 0], 0.01);
  k.box(MAT.rubber, 0.046, 0.115, 0.02, [0, 0.03, 0.3], [0, 0, 0], 0.006);
  k.box(MAT.polymer, 0.03, 0.02, 0.09, [0, 0.092, 0.22], [0, 0, 0], 0.006);                // apoio de rosto
  // luneta
  const S = 0.135;
  k.cyl(MAT.metal, 0.0145, 0.0145, 0.2, [0, S, -0.08]);
  k.cyl(MAT.metal, 0.022, 0.015, 0.05, [0, S, -0.2]);
  k.cyl(MAT.metal2, 0.023, 0.023, 0.012, [0, S, -0.228]);
  k.cyl(MAT.metal, 0.018, 0.015, 0.05, [0, S, 0.035]);
  k.cyl(MAT.metal2, 0.0105, 0.0105, 0.02, [0, S + 0.022, -0.08], [0, 0, 0]);
  k.cyl(MAT.metal2, 0.0105, 0.0105, 0.02, [0.022, S, -0.08], [0, 0, Math.PI / 2]);
  for (const zz of [-0.02, -0.14]) k.box(MAT.metal, 0.034, S - Y - 0.02, 0.018, [0, (S + Y) / 2 + 0.004, zz], [0, 0, 0], 0.003);
  k.geo(MAT.lensFront, new THREE.CircleGeometry(0.019, 22), [0, S, -0.2345], [0, Math.PI, 0]);
  k.geo(MAT.lensRear, new THREE.CircleGeometry(0.015, 22), [0, S, 0.0605]);
  k.build(root);
  const mag = node('mag', [0, -0.005, -0.12]), mk = new Kit();
  mk.box(MAT.metal, 0.03, 0.09, 0.07, [0, -0.04, 0], [-0.05, 0, 0], 0.005);
  mk.box(MAT.polymer, 0.034, 0.012, 0.074, [0, -0.088, -0.003], [-0.05, 0, 0], 0.004);
  mk.cyl(MAT.brass, 0.0055, 0.0055, 0.035, [0, 0.004, 0], undefined, 8);
  mk.build(mag); root.add(mag);
  const bolt = node('bolt', [0.0272, Y, -0.045]); const bk = new Kit();
  bk.box(MAT.steel, 0.003, 0.014, 0.05, [0, 0, 0], [0, 0, 0], 0); bk.build(bolt); root.add(bolt);
  root.userData = {
    kind: 'dmr', parts: { mag, bolt }, sight: new THREE.Vector3(0, S, 0.06), adsDist: 0.09, boltRest: -0.045, boltTravel: 0.035,
    muzzle: new THREE.Vector3(0, Y, -0.8), eject: new THREE.Vector3(0.03, Y, -0.045),
    hip: { p: [0.16, -0.18, -0.36], r: [0.01, 0.09, -0.02] }, flash: 0.16,
  };
  return root;
}

// ------------------------------------------------------------------ magnum (pistola grande, aco)
function deagle(tp) {
  const root = node('deagle'), k = new Kit();
  k.box(MAT.blued, 0.034, 0.03, 0.2, [0, 0.004, -0.06], [0, 0, 0], 0.006);                 // armacao
  k.box(MAT.rubber, 0.034, 0.112, 0.056, [0, -0.056, 0.016], [-0.26, 0, 0], 0.012);         // punho
  k.box(MAT.blued, 0.03, 0.022, 0.034, [0, 0.0, 0.04], [0.2, 0, 0], 0.008);
  k.box(MAT.blued, 0.007, 0.006, 0.05, [0, -0.021, -0.042], [0, 0, 0], 0.002);
  k.box(MAT.metal2, 0.006, 0.024, 0.007, [0, -0.007, -0.034], [0.3, 0, 0], 0.002);
  k.build(root);
  const slide = node('slide', [0, 0.036, -0.07]), sk = new Kit();
  sk.box(MAT.chrome, 0.034, 0.034, 0.23, [0, 0, 0], [0, 0, 0], 0.004);
  sk.box(MAT.chrome, 0.022, 0.012, 0.23, [0, 0.019, 0], [0, 0, 0], 0.003);                  // topo triangular
  for (let z = 0.07; z < 0.105; z += 0.007) sk.box(MAT.dark, 0.0345, 0.022, 0.003, [0, -0.002, z], [0, 0, 0], 0);
  sk.cyl(MAT.dark, 0.0075, 0.0075, 0.004, [0, 0.0, -0.1155], undefined, 12);
  sk.box(MAT.blued, 0.007, 0.01, 0.009, [-0.008, 0.029, 0.1], [0, 0, 0], 0.0015);
  sk.box(MAT.blued, 0.007, 0.01, 0.009, [0.008, 0.029, 0.1], [0, 0, 0], 0.0015);
  sk.box(MAT.blued, 0.004, 0.011, 0.008, [0, 0.03, -0.105], [0, 0, 0], 0.0012);
  sk.box(MAT.orange, 0.0026, 0.0026, 0.001, [0, 0.033, -0.1008], [0, 0, 0], 0);
  sk.build(slide); root.add(slide);
  const mag = node('mag', [0, -0.024, 0.012]), mk = new Kit();
  mk.box(MAT.metal, 0.024, 0.09, 0.044, [0, -0.036, 0.005], [-0.26, 0, 0], 0.004);
  mk.box(MAT.rubber, 0.035, 0.012, 0.06, [0, -0.086, 0.02], [-0.26, 0, 0], 0.004);
  mk.cyl(MAT.brass, 0.0052, 0.0052, 0.022, [0, 0.006, -0.006], undefined, 8);
  mk.build(mag); root.add(mag);
  root.userData = {
    kind: 'deagle', parts: { slide, mag }, sight: new THREE.Vector3(0, 0.036 + 0.034, -0.17), adsDist: 0.34, slideRest: -0.07, slideTravel: 0.04,
    muzzle: new THREE.Vector3(0, 0.036, -0.19), eject: new THREE.Vector3(0.012, 0.055, -0.09),
    hip: { p: [0.125, -0.14, -0.34], r: [0.03, 0.1, 0.0] }, flash: 0.16,
  };
  return root;
}

// ------------------------------------------------------------------ granada de fragmentacao
function nade(tp) {
  const root = node('nade'), k = new Kit();
  const body = new THREE.SphereGeometry(0.032, 18, 14); body.scale(1, 1.18, 1);
  k.geo(MAT.nadeBody, body, [0, 0, 0]);
  for (let i = 0; i < 5; i++) k.geo(MAT.nadeBody, new THREE.TorusGeometry(0.031 * Math.sin((i + 1) / 6 * Math.PI) + 0.001, 0.0018, 5, 20), [0, -0.03 + i * 0.013, 0], [Math.PI / 2, 0, 0]);
  k.cyl(MAT.metal, 0.012, 0.014, 0.018, [0, 0.043, 0], [0, 0, 0], 12);                     // espoleta
  k.box(MAT.metal2, 0.012, 0.064, 0.006, [0.0, 0.02, 0.028], [-0.12, 0, 0], 0.002);         // colher
  k.box(MAT.metal2, 0.012, 0.006, 0.02, [0, 0.052, 0.012], [0, 0, 0], 0.002);
  k.build(root);
  const pin = node('pin', [-0.016, 0.045, 0.0]), pk = new Kit();
  pk.geo(MAT.steel, new THREE.TorusGeometry(0.011, 0.0016, 6, 18), [-0.008, 0, 0], [0, Math.PI / 2, 0]);
  pk.cyl(MAT.steel, 0.0014, 0.0014, 0.02, [0.004, 0, 0], [0, 0, Math.PI / 2], 6);
  pk.build(pin); root.add(pin);
  root.userData = { kind: 'nade', parts: { pin }, sight: new THREE.Vector3(0, 0, -0.1), adsDist: 0.3, hip: { p: [0.15, -0.14, -0.3], r: [0.2, 0.2, -0.1] } };
  return root;
}

// ------------------------------------------------------------------ fabrica
export function buildWeapon(kind, opts = {}) {
  const tp = !!opts.tp;
  const B = { rifle, pistol, sniper, ak, smg, shotgun, dmr, deagle, nade };
  return B[kind] ? B[kind](tp) : knife(opts.knife || 'default');
}
// capsula de municao (para ejecao)
export function shellGeo(kind) {
  const big = kind === 'sniper' || kind === 'dmr', rif = kind === 'rifle' || kind === 'ak';
  const r = big ? 0.0062 : kind === 'shotgun' ? 0.0098 : 0.0048, len = big ? 0.065 : rif ? 0.045 : kind === 'shotgun' ? 0.064 : kind === 'deagle' ? 0.03 : 0.02;
  const g = new THREE.CylinderGeometry(r, r * 1.02, len, 8); g.rotateX(Math.PI / 2);
  return g;
}
