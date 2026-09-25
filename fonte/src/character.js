// FRAG - jogador remoto: boneco articulado com animacao procedural (andar, lateral, agachar, pulo, mira, tiro, recarga, morte).
// As hitboxes do jogo nao mudam (cabeca em y+1.55 ou +0.98 agachado); o boneco foi desenhado em cima delas.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildWeapon } from './models.js';
import { WEAPON_ORDER } from './core.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const S = {
  suit: new THREE.MeshStandardMaterial({ color: '#3d4236', roughness: 0.9 }),
  suit2: new THREE.MeshStandardMaterial({ color: '#2f332a', roughness: 0.92 }),
  boot: new THREE.MeshStandardMaterial({ color: '#1b1a18', roughness: 0.7 }),
  glove: new THREE.MeshStandardMaterial({ color: '#6a5d49', roughness: 0.8 }),
  gear: new THREE.MeshStandardMaterial({ color: '#23262a', roughness: 0.6, metalness: 0.3 }),
  skin: new THREE.MeshStandardMaterial({ color: '#b98a6c', roughness: 0.7 }),
  visor: new THREE.MeshStandardMaterial({ color: '#0a0e16', roughness: 0.08, metalness: 0.7, envMapIntensity: 2 }),
};
const rb = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r ?? Math.min(w, h, d) * 0.25);
function mesh(g, m, p = [0, 0, 0], r = [0, 0, 0], parent) {
  const o = new THREE.Mesh(g, m); o.position.set(...p); o.rotation.set(...r); o.castShadow = false; o.receiveShadow = true;
  if (parent) parent.add(o); return o;
}
const joint = (parent, p) => { const j = new THREE.Group(); j.position.set(...p); parent.add(j); return j; };
// membro (capsula) pendurado para baixo a partir da junta
const limb = (parent, rad, len, m) => mesh(new THREE.CapsuleGeometry(rad, len, 3, 8), m, [0, -len / 2, 0], [0, 0, 0], parent);

function nameTag(name, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(240, g.measureText(name).width + 28);
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(128 - w / 2, 8, w, 48);
  g.fillStyle = color; g.fillRect(128 - w / 2, 8, 6, 48);
  g.fillStyle = '#fff'; g.fillText(name, 131, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: true, fog: false }));
  s.scale.set(1.6, 0.4, 1); s.userData.noAO = true;
  return s;
}

const GUN_OF = WEAPON_ORDER;
// modelos de terceira pessoa: construidos uma vez, clonados (geometria compartilhada) por jogador
const TP = {};
function tpGun(k) {
  if (!TP[k]) {
    const g = buildWeapon(k, { tp: true, knife: 'default' });
    const muzzle = g.userData.muzzle ? g.userData.muzzle.clone() : null;
    g.traverse((o) => { o.userData = {}; if (o.isMesh) o.castShadow = false; });
    TP[k] = { g, muzzle };
  }
  const c = TP[k].g.clone(true); c.userData = { muzzle: TP[k].muzzle }; return c;
}
const POSE = { knife: 'knife', pistol: 'pistol', deagle: 'pistol', nade: 'nade' };
// sombra de contato (as sombras do cenario sao estaticas)
let _blobTex = null;
function blobMat() {
  if (!_blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    _blobTex = new THREE.CanvasTexture(c);
  }
  return new THREE.MeshBasicMaterial({ map: _blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: true });
}
export class Character {
  constructor(p, scene) {
    this.scene = scene; this.id = p.id; this.name = p.name; this.color = p.color; this.team = p.team;
    const col = new THREE.Color(p.color);
    this.mVest = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.55), roughness: 0.75 });
    this.mAcc = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.6, roughness: 0.4 });
    const root = this.root = new THREE.Group();
    // quadril e pernas
    const pelvis = this.pelvis = joint(root, [0, 0.95, 0]);
    mesh(rb(0.34, 0.2, 0.22), S.suit2, [0, 0.02, 0], [0, 0, 0], pelvis);
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hip = joint(pelvis, [0.1 * sx, -0.04, 0]);
      limb(hip, 0.085, 0.3, S.suit);
      mesh(rb(0.12, 0.12, 0.05), S.gear, [0.02 * sx, -0.2, -0.08], [0, 0, 0], hip);
      const knee = joint(hip, [0, -0.43, 0]);
      mesh(rb(0.11, 0.1, 0.06), S.gear, [0, 0.0, -0.075], [0, 0, 0], knee);
      limb(knee, 0.07, 0.3, S.suit);
      const ankle = joint(knee, [0, -0.41, 0]);
      mesh(rb(0.12, 0.1, 0.27), S.boot, [0, -0.04, -0.05], [0, 0, 0], ankle);
      this.legs.push({ hip, knee, ankle, sx });
    }
    // tronco
    const spine = this.spine = joint(pelvis, [0, 0.08, 0]);
    mesh(rb(0.4, 0.46, 0.24, 0.07), S.suit, [0, 0.24, 0], [0, 0, 0], spine);
    mesh(rb(0.43, 0.36, 0.3, 0.05), this.mVest, [0, 0.27, 0], [0, 0, 0], spine);
    for (const x of [-0.12, 0, 0.12]) mesh(rb(0.1, 0.12, 0.06), S.gear, [x, 0.17, -0.17], [0, 0, 0], spine);
    mesh(rb(0.32, 0.36, 0.14), S.gear, [0, 0.28, 0.2], [0, 0, 0], spine);
    mesh(new THREE.BoxGeometry(0.44, 0.03, 0.31), this.mAcc, [0, 0.44, 0], [0, 0, 0], spine);
    // cabeca
    const neck = this.neck = joint(spine, [0, 0.5, 0]);
    mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), S.skin, [0, 0.03, 0], [0, 0, 0], neck);
    const head = this.head = joint(neck, [0, 0.12, 0]);
    mesh(new THREE.SphereGeometry(0.115, 16, 12), S.skin, [0, 0, 0], [0, 0, 0], head);
    mesh(new THREE.SphereGeometry(0.14, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), S.gear, [0, 0.02, 0.005], [0, 0, 0], head);
    mesh(rb(0.2, 0.075, 0.08, 0.03), S.visor, [0, 0.0, -0.1], [0, 0, 0], head);
    mesh(new THREE.BoxGeometry(0.03, 0.02, 0.26), this.mAcc, [0, 0.155, 0.0], [0, 0, 0], head);
    // bracos (ombro -> cotovelo -> punho)
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = joint(spine, [0.24 * sx, 0.42, 0]);
      mesh(rb(0.14, 0.1, 0.16), this.mVest, [0.02 * sx, 0.02, 0], [0, 0, 0], sh);
      limb(sh, 0.058, 0.2, S.suit);
      if (sx < 0) mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.05, 10), this.mAcc, [0, -0.16, 0], [0, 0, 0], sh);
      const el = joint(sh, [0, -0.3, 0]);
      limb(el, 0.05, 0.2, S.suit);
      mesh(rb(0.075, 0.1, 0.09), S.glove, [0, -0.3, 0], [0, 0, 0], el);
      this.arms.push({ sh, el, sx });
    }
    // armas em terceira pessoa (presas ao tronco)
    this.gunMount = joint(spine, [0.13, 0.33, -0.34]);
    this.guns = GUN_OF.map((k) => {
      const g = tpGun(k);
      g.visible = false; this.gunMount.add(g); return g;
    });
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), color: new THREE.Color(5, 3.6, 2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.visible = false; this.flash.userData.noAO = true; scene.add(this.flash);
    this.tag = nameTag(p.name, p.color); this.tag.position.y = 2.05; root.add(this.tag);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), blobMat()); this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.015; this.blob.renderOrder = 2; root.add(this.blob);
    root.visible = false; scene.add(root);
    // estado
    this.buf = []; this.alive = false; this.hp = 100; this.pos = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.crouch = 0; this.w = 1; this.ads = 0; this.online = true;
    this.cr = 0; this.phase = 0; this.vel = new THREE.Vector3(); this.prev = new THREE.Vector3(); this.legYaw = 0; this.kick = 0; this.flashT = 0; this.reloadT = 0; this.air = 0; this.corpses = [];
  }
  get grp() { return this.root; }
  setVisible(v) { this.root.visible = v; }
  setWeapon(i) { if (i >= 0 && i < GUN_OF.length) this.w = i; }
  fire(now, nade) {
    this.kick = 1;
    if (nade) { this.throwT = now; return; }
    this.flashT = now + 45;
    const g = this.guns[this.w];
    if (g && g.userData.muzzle) {
      g.updateMatrixWorld(true);
      this.flash.position.copy(g.userData.muzzle).applyMatrix4(g.matrixWorld);
      const k = GUN_OF[this.w];
      this.flash.scale.setScalar(k === 'sniper' || k === 'shotgun' ? 0.55 : k === 'pistol' || k === 'smg' ? 0.3 : 0.42);
      this.flash.material.rotation = Math.random() * 6.28; this.flash.visible = true;
    }
  }
  muzzleWorld(out) {
    const g = this.guns[this.w];
    if (!g || !g.userData.muzzle) return out.copy(this.pos).setY(this.pos.y + 1.35);
    g.updateMatrixWorld(true); return out.copy(g.userData.muzzle).applyMatrix4(g.matrixWorld);
  }
  reload(now, ms) { this.reloadT = now; this.reloadMs = ms || 2000; }
  // corpo que cai: copia do boneco (mesma geometria), animada e depois afundada no chao
  die(now) {
    const c = this.root.clone(true);
    c.remove(c.children.find((o) => o.isSprite)); c.remove(c.children.find((o) => o.geometry && o.geometry.type === 'PlaneGeometry'));
    this.scene.add(c);
    const dir = Math.random() > 0.5 ? 1 : -1;
    this.corpses.push({ o: c, t0: now, dir, side: (Math.random() - 0.5) * 0.6, pelvis: c.children[0] });
    this.root.visible = false; this.flash.visible = false;
  }
  update(dt, now) {
    // corpos
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const k = this.corpses[i], t = (now - k.t0) / 1000;
      const f = clamp(t / 0.6, 0, 1), fall = f * f;
      k.o.rotation.x = -1.45 * fall * k.dir; k.o.rotation.z = k.side * fall;
      k.pelvis.position.y = lerp(0.95, 0.3, fall);
      if (t > 3.2) k.o.position.y = -(t - 3.2) * 0.5;
      if (t > 4.5) { this.scene.remove(k.o); this.corpses.splice(i, 1); }
    }
    this.flash.visible = this.flash.visible && now < this.flashT;
    if (!this.root.visible) return;
    const r = this.root;
    r.position.copy(this.pos); r.rotation.y = this.yaw;
    // velocidade (das posicoes interpoladas)
    if (dt > 0) { const v = this.prev.clone().sub(this.pos).multiplyScalar(-1 / dt); this.vel.lerp(v, clamp(dt * 12, 0, 1)); }
    this.prev.copy(this.pos);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.air = lerp(this.air, Math.abs(this.vel.y) > 1.2 ? 1 : 0, clamp(dt * 10, 0, 1));
    this.cr = lerp(this.cr, this.crouch, clamp(dt * 12, 0, 1));
    // direcao do movimento relativa ao olhar
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const vf = this.vel.x * fx + this.vel.z * fz, vr = this.vel.x * rx + this.vel.z * rz;
    let rel = sp > 0.3 ? Math.atan2(vr, vf) : 0, back = 1;
    if (Math.abs(rel) > 1.9) { rel = rel - Math.sign(rel) * Math.PI; back = -1; }
    this.legYaw = lerp(this.legYaw, clamp(-rel, -1.1, 1.1), clamp(dt * 8, 0, 1));
    const amp = clamp(sp / 5.5, 0, 1.2) * (1 - this.air);
    this.phase += dt * (sp > 0.3 ? (this.cr > 0.5 ? 6.5 : 9) * clamp(sp / 5.5, 0.5, 1.3) : 0) * back;
    const ph = this.phase, cr = this.cr;
    this.pelvis.position.y = lerp(0.95, 0.42, cr) - Math.abs(Math.sin(ph)) * 0.035 * amp + this.air * 0.05;
    this.pelvis.rotation.y = this.legYaw * 0.8;
    this.spine.rotation.y = -this.legYaw * 0.8;
    for (const L of this.legs) {
      const s = Math.sin(ph + (L.sx > 0 ? 0 : Math.PI));
      const swing = s * 0.55 * amp;
      L.hip.rotation.x = swing + cr * 1.35 + this.air * 0.55;
      L.knee.rotation.x = -(Math.max(0, -Math.cos(ph + (L.sx > 0 ? 0 : Math.PI))) * 0.9 * amp + cr * 2.1 + this.air * 0.9);
      L.ankle.rotation.x = -swing * 0.3 + cr * 0.75;
      L.hip.rotation.z = -L.sx * (0.04 + cr * 0.12);
    }
    // tronco: inclinacao ao agachar e mira (pitch dividido entre tronco e cabeca)
    this.kick = Math.max(0, this.kick - dt * 9);
    this.spine.rotation.x = this.pitch * 0.45 - cr * 0.45 + this.kick * 0.06;
    this.neck.rotation.x = this.pitch * 0.4 + cr * 0.4;
    this.spine.rotation.z = Math.sin(ph) * 0.03 * amp;
    // braços conforme a arma
    this.blob.material.opacity = 1 - this.air * 0.7; this.blob.scale.setScalar(1 - this.cr * 0.1);
    const w = this.w, pose = POSE[GUN_OF[w]] || 'rifle', reload = this.reloadT && now - this.reloadT < this.reloadMs ? Math.sin(Math.PI * clamp((now - this.reloadT) / this.reloadMs, 0, 1)) : 0;
    const [R, Lf] = [this.arms[1], this.arms[0]];
    if (pose === 'nade') {
      const th = this.throwT ? clamp((now - this.throwT) / 450, 0, 1) : 1, sw = th < 1 ? Math.sin(th * Math.PI) : 0;
      R.sh.rotation.set(1.2 - sw * 2.4, 0, -0.2); R.el.rotation.set(1.3 - sw * 1.1, 0, 0);
      Lf.sh.rotation.set(0.9, 0, 0.3); Lf.el.rotation.set(0.6, 0, 0);
      this.gunMount.position.set(0.22, 0.42 + sw * 0.25, -0.18 + sw * 0.1); this.gunMount.rotation.set(0, 0, 0);
    } else if (pose === 'knife') { // faca
      R.sh.rotation.set(0.9, 0, -0.1); R.el.rotation.set(0.6, 0, 0);
      Lf.sh.rotation.set(0.3, 0, 0.15); Lf.el.rotation.set(0.5, 0, 0);
      this.gunMount.position.set(0.2, 0.18, -0.36); this.gunMount.rotation.set(-0.3, 0, 0);
    } else if (pose === 'pistol') { // pistola
      R.sh.rotation.set(1.45, 0, 0.18); R.el.rotation.set(0.1, 0, 0);
      Lf.sh.rotation.set(1.4 - reload * 0.8, 0, -0.35); Lf.el.rotation.set(0.3 + reload * 0.6, 0, 0);
      this.gunMount.position.set(0.02, 0.4, -0.52); this.gunMount.rotation.set(0, 0, 0);
    } else {
      R.sh.rotation.set(0.75, 0, 0.35); R.el.rotation.set(1.15, 0, 0);
      Lf.sh.rotation.set(1.25 - reload * 0.9, 0, -0.55 + reload * 0.3); Lf.el.rotation.set(0.35 + reload * 0.7, 0, 0);
      this.gunMount.position.set(0.12, 0.33, -0.3 + this.kick * 0.04); this.gunMount.rotation.set(0, 0.04, 0);
    }
    for (let i = 0; i < this.guns.length; i++) this.guns[i].visible = i === w;
  }
  dispose() {
    this.scene.remove(this.root); this.scene.remove(this.flash);
    for (const k of this.corpses) this.scene.remove(k.o);
    this.mVest.dispose(); this.mAcc.dispose(); this.tag.material.map.dispose(); this.tag.material.dispose();
  }
}

let _flashTex = null;
export function flashTexture() {
  if (_flashTex) return _flashTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 1, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,225,150,.95)'); gr.addColorStop(1, 'rgba(255,150,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,235,190,.85)'; g.lineWidth = 3;
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31); g.stroke(); }
  _flashTex = new THREE.CanvasTexture(c);
  return _flashTex;
}
