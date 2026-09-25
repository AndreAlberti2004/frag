// FRAG v4 - o jogo no cliente.
// Movimento reescrito para ser seco e preciso: fisica em subpassos fixos (~240 Hz), aceleracao e frenagem rapidas
// (counter-strafe de verdade), precisao pela velocidade real, buffer de pulo, coyote time, crouch-jump e escada suave.
// Mira: entrada crua (pointerrawupdate quando disponivel), sensibilidade na escala do CS2, recuo com padrao fixo.
import * as THREE from 'three';
import {
  q, S, Net, send, mySelf, clamp, esc, toast, saveSettings, refreshClassButtons, hooks, uiState, DBG, params, styleCrosshair,
  RESPAWN_MS, PLAYER_R, STAND_H, CROUCH_H, EYE, EYE_CROUCH, STEP, WEAPON_ORDER, TEAM_COLORS, TUCK, YAW_PER_COUNT,
} from './core.js';
import { WEAPONS, PRIMARIES, SECONDARIES, KNIFE_NAMES } from './weapons.js';
import { MAPS } from './maps.js';
import { buildWorld } from './level.js';
import { Pipeline, PRESETS, detectQuality } from './render.js';
import { Viewmodel } from './anim.js';
import { Character, flashTexture } from './character.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Nades } from './nades.js';

const V3 = THREE.Vector3;
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const VM_FOV = 62, VM_FOV_ADS = 50;
// ---- constantes de movimento (m, s)
const ACC = 78, DEC = 92, AIR_ACC = 12, AIR_CAP = 0.8, GRAV = 17, JUMP_V = 6.2, JUMP_BUF = 130, COYOTE = 90, SUB = 1 / 240;
// no ar so sobe quinas bem pequenas: pulo normal alcanca ~1,17 m; agachando no ar ~1,42 m (caixote de 1,2 so com crouch-jump)
const AIR_STEP = 0.05;
const WALK_K = 0.52, CROUCH_K = 0.5;

const validPrim = () => (PRIMARIES.includes(S.prim) ? S.prim : 'rifle');
const validSec = () => (SECONDARIES.includes(S.sec) ? S.sec : 'pistol');
const tanHalf = (deg) => Math.tan(deg * Math.PI / 360);

export const Game = {
  running: false, ready: false, pipe: null, scene: null, camera: null, vmScene: null, vmCamera: null,
  map: null, mapKey: '', W: null, boxes: [], grid: null, L: null, remotes: new Map(), keys: new Set(),
  mouseDown: false, firePressed: false, altPressed: false, altHeld: false, locked: false, jumpQ: 0,
  cur: 'rifle', prev: 'pistol', kit: ['rifle', 'pistol', 'knife', 'nade'], nades: 1, anim: null, readyAt: 0, ammo: {},
  reloading: 0, scoped: false, adsOn: false, lastSend: 0, lastFrame: 0, deathAt: 0, fpsN: 0, fpsT: 0, sbFull: false,
  sway: [0, 0], rp: 0, ry: 0, shotI: 0, lastShot: 0, camKick: 0, eyeH: EYE, stepOff: 0, hudT: 0, muzzleT: 0, qKey: '', stepAcc: 0,
  dmgFx: 0, deathFx: 0, shadeK: 1, shadeT: 0, lastGround: 0, xhGap: -1, manual: DBG && params.get('manual') === '1', throwT: 0,

  init() {
    if (this.pipe) return;
    if (!S.quality || !PRESETS[S.quality]) { S.quality = detectQuality(); saveSettings(); }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(S.fov, 1, 0.05, 400); this.camera.rotation.order = 'YXZ'; this.scene.add(this.camera);
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(VM_FOV, 1, 0.01, 10);
    this.vmHemi = new THREE.HemisphereLight('#ffffff', '#40444c', 1.2); this.vmScene.add(this.vmHemi);
    this.vmSun = new THREE.DirectionalLight('#ffffff', 2); this.vmScene.add(this.vmSun, this.vmSun.target);
    this.vmFill = new THREE.DirectionalLight('#9fb8ff', 0.5); this.vmFill.position.set(-1, 0.3, 0.6); this.vmScene.add(this.vmFill);
    this.vmFlashLight = new THREE.PointLight('#ffc27a', 0, 1.2, 2); this.vmScene.add(this.vmFlashLight);
    this.vm = new Viewmodel(this.vmScene);
    this.vm.onEvent = (name) => Audio.play(name, { vol: /^(bolt|mag|pump|shell)/.test(name) ? 0.85 : 0.6, send: 0.12 });
    const ft = flashTexture();
    const fm = new THREE.MeshBasicMaterial({ map: ft, color: new THREE.Color(4, 3, 1.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flash = new THREE.Group();
    for (const r of [0, Math.PI / 2]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.2), fm); p.rotation.set(Math.PI / 2, r, 0); p.position.z = -0.8; this.flash.add(p); }
    this.flash.add(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), fm));
    this.flash.visible = false; this.vmScene.add(this.flash);
    this.mlight = new THREE.PointLight('#ffb866', 0, 9, 2); this.scene.add(this.mlight);
    this.rlight = new THREE.PointLight('#ffb866', 0, 9, 2); this.scene.add(this.rlight);
    this.fx = new FX(this.scene);
    this.nadeSys = new Nades(this);
    this.pipe = new Pipeline();
    this.applyRender(true);
    window.addEventListener('resize', () => this.pipe && this.pipe.resize());
    this.bindInput();
  },
  applyRender(first) {
    if (!this.pipe) return;
    const key = PRESETS[S.quality] ? S.quality : 'bal', Q = PRESETS[key];
    if (first || key !== this.qKey || this.pipe.lowLat !== !!S.lowLat) {
      const prev = this.qKey; this.qKey = key;
      this.pipe.setup(Q, S.scale, this.scene, this.camera, this.vmScene, this.vmCamera, !!S.lowLat);
      this.fx.setQuality(Q); Audio.hrtf = !!Q.hrtf;
      if (!first && prev && this.mapKey) this.loadMap(this.mapKey);
    } else if (this.pipe.scale !== S.scale) { this.pipe.scale = S.scale; this.pipe.resize(); }
    q('fps').hidden = !S.fps;
    Audio.setVolume(S.vol);
    this.applyCrosshair();
  },
  applyCrosshair() { styleCrosshair(q('xh')); this.xhGap = -1; },
  rebuildKnife() { if (this.vm) { this.vm.setKnife(S.knife); if (this.cur === 'knife') this.vm.equip('knife'); } },

  // ---------------------------------------------------------------- mapa
  loadMap(key) {
    this.ready = false; this.mapKey = key; this.map = MAPS[key];
    q('loading').hidden = false;
    setTimeout(() => {
      if (this.W) { this.scene.remove(this.W.group); this.W.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      const Q = PRESETS[this.qKey];
      const W = buildWorld(this.map, Q);
      this.W = W; this.boxes = W.boxes; this.grid = makeGrid(W.boxes);
      this.scene.add(W.group);
      const a = this.map.atmo;
      this.scene.fog = new THREE.Fog(a.fog, a.fogNear, a.fogFar);
      this.scene.background = new THREE.Color(a.fog);
      this.pipe.setWorld(W);
      this.vmHemi.color.set(a.hemi[0]); this.vmHemi.groundColor.set(a.hemi[1]); this.vmHemi.intensity = a.hemi[2] * 1.3 + 0.2;
      this.vmSun.color.set(a.sun[0]); this.sunDir = new V3(...a.sun[2]).normalize(); this.sunI = a.sun[1];
      this.fx.clear(); this.fx.setWorld(W, key); this.nadeSys.clear();
      Audio.setMap(key);
      q('loading').hidden = true; this.ready = true;
    }, 30);
  },
  // ---------------------------------------------------------------- armas
  play(type, dur) { this.anim = { type, t0: performance.now(), dur }; },
  animBusy() {
    const a = this.anim;
    return !!a && performance.now() < a.t0 + a.dur && (a.type === 'draw' || a.type === 'reload' || a.type === 'bolt' || a.type === 'pump' || a.type === 'slash' || a.type === 'stab' || a.type === 'throw');
  },
  switchTo(w) {
    if (w === this.cur || !this.L || !this.L.alive || !this.kit.includes(w)) return;
    if (w === 'nade' && this.nades <= 0) return;
    if (this.throwT) return; // granada saindo da mao
    this.prev = this.cur; this.cur = w; this.reloading = 0; this.setAds(false);
    const d = w === 'knife' ? 480 : w === 'nade' ? 420 : w === 'sniper' || w === 'shotgun' ? 460 : 380;
    this.play('draw', d); this.readyAt = performance.now() + (w === 'knife' ? 330 : d);
    this.vm.equip(w, this.ammo[w] === 0); this.vm.play('draw', d);
    this.renderHud();
  },
  setAds(on) {
    if (on === this.adsOn) return;
    this.adsOn = on;
    this.scoped = on && !!WEAPONS[this.cur].scope;
    Audio.play(on ? 'adsin' : 'adsout', { vol: 0.45 });
  },
  canAds() { const W = WEAPONS[this.cur]; return W.kind === 'gun' && (!this.reloading || W.shellByShell) && !this.animBusy(); },
  reload() {
    const w = WEAPONS[this.cur], now = performance.now();
    if (!this.L || !this.L.alive || w.kind !== 'gun' || this.reloading || this.ammo[this.cur] >= w.mag || this.animBusy()) return;
    this.setAds(false);
    if (w.shellByShell) {
      this.reloading = now + w.reloadStart + w.reloadMs; this.rlEmpty = this.ammo[this.cur] === 0;
      this.vm.play('rlstart', w.reloadStart); this.shellNext = now + w.reloadStart;
    } else {
      this.reloading = now + w.reloadMs;
      this.play('reload', w.reloadMs); this.vm.play('reload', w.reloadMs, { empty: this.ammo[this.cur] === 0 });
    }
    send({ t: 'rl', w: this.cur });
    this.renderHud();
  },
  // recarga da escopeta: um cartucho por vez; atirar interrompe
  tickShells(now) {
    const w = WEAPONS[this.cur];
    if (this.shellNext && now >= this.shellNext && this.ammo[this.cur] < w.mag) { this.vm.play('shell', w.reloadMs); this.shellNext = 0; }
    if (now < this.reloading) return;
    this.ammo[this.cur] = Math.min(w.mag, this.ammo[this.cur] + 1);
    if (this.ammo[this.cur] < w.mag) { this.reloading = now + w.reloadMs; this.vm.play('shell', w.reloadMs); }
    else this.finishShells(now);
    this.renderHud();
  },
  finishShells(now) {
    this.reloading = 0; this.shellNext = 0;
    if (this.rlEmpty) { this.vm.play('pump', 620); this.play('pump', 620); this.readyAt = Math.max(this.readyAt, now + 560); }
    else this.vm.play('rlend', 260);
    this.rlEmpty = false;
  },
  inspect() {
    if (!this.L || !this.L.alive || this.animBusy() || this.reloading || this.cur === 'nade') return;
    this.setAds(false);
    const d = this.cur === 'knife' ? (S.knife === 'butterfly' ? 3600 : 3200) : 3000;
    this.play('inspect', d); this.vm.play('inspect', d);
  },
  // ---------------------------------------------------------------- jogadores remotos
  syncRemotes() {
    const seen = new Set();
    for (const p of Net.roster) {
      if (p.id === Net.me) continue;
      seen.add(p.id);
      let r = this.remotes.get(p.id);
      if (!r || r.color !== p.color || r.name !== p.name) { if (r) r.dispose(); r = new Character(p, this.scene); this.remotes.set(p.id, r); }
      r.team = p.team; r.online = p.online;
      if (!p.online || !p.alive) { r.alive = false; r.setVisible(false); }
    }
    for (const [id, r] of this.remotes) if (!seen.has(id)) { r.dispose(); this.remotes.delete(id); }
  },
  start(cfg) {
    this.init();
    this.L = { pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, grounded: false, alive: false, hp: 100, crouch: false, tuck: 0 };
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear(); this.syncRemotes();
    if (this.mapKey !== cfg.map || !this.W) this.loadMap(cfg.map); else { this.fx.clear(); this.nadeSys.clear(); }
    q('end').hidden = true; q('death').hidden = true; q('menu').hidden = true; q('feed').innerHTML = ''; q('clickToPlay').hidden = this.locked;
    this.deathAt = 0; this.setAds(false); this.deathFx = 0; this.dmgFx = 0;
    if (!this.running) { this.running = true; this.lastFrame = performance.now(); requestAnimationFrame((t) => this.frame(t)); }
    this.renderHud();
  },
  stop() {
    this.running = false; q('end').hidden = true; q('death').hidden = true; q('menu').hidden = true; this.setAds(false);
    Audio.stopAmbience();
    if (document.pointerLockElement) document.exitPointerLock();
  },
  end() {
    const list = [...Net.roster].sort((a, b) => b.k - a.k || a.d - b.d);
    let title;
    if (Net.cfg.mode === 'tdm') {
      let a = 0, b = 0;
      for (const p of Net.roster) p.team === 'a' ? (a += p.k) : (b += p.k);
      title = a === b ? 'Empate: ' + a + ' a ' + b : (a > b ? 'Time Azul' : 'Time Vermelho') + ' venceu, ' + Math.max(a, b) + ' a ' + Math.min(a, b);
      q('endTitle').innerHTML = esc(title) + '<small>' + esc(MAPS[Net.cfg.map].name) + ' · time contra time</small>';
    } else {
      const t = list[0];
      title = t ? (t.k > 0 && list[1] && list[1].k === t.k ? 'Empate no topo' : esc(t.name) + ' venceu') : 'Fim';
      q('endTitle').innerHTML = title + '<small>' + esc(MAPS[Net.cfg.map].name) + ' · free for all</small>';
    }
    q('endTable').innerHTML = '<thead><tr><th>#</th><th>Jogador</th><th class="r">K</th><th class="r">D</th><th class="r">K/D</th><th class="r">HS%</th></tr></thead><tbody>' + list.map((p, i) =>
      '<tr><td class="r">' + (i + 1) + '</td><td><span class="sw" style="background:' + p.color + '"></span>' + esc(p.name) + (p.id === Net.me ? ' <span class="hint">(você)</span>' : '') +
      '</td><td class="r">' + p.k + '</td><td class="r">' + p.d + '</td><td class="r">' + (p.d ? (p.k / p.d).toFixed(2) : p.k.toFixed(2)) + '</td><td class="r">' + (p.k ? Math.round((p.hs || 0) * 100 / p.k) : 0) + '%</td></tr>').join('') + '</tbody>';
    q('btnAgain').hidden = !Net.isHost; q('endWait').hidden = Net.isHost;
    q('death').hidden = true; q('menu').hidden = true; q('clickToPlay').hidden = true; q('end').hidden = false;
    this.setAds(false);
    if (this.L) this.L.alive = false;
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onRoster() {
    if (!this.running) return;
    this.syncRemotes();
    const me = mySelf();
    if (me && this.L && !me.alive && this.L.alive) this.L.alive = false;
    this.renderHud();
  },
  onSnap(m) {
    if (!this.running) return;
    const now = performance.now();
    for (const s of m.ps) {
      const [id, x, y, z, yaw, pitch, hp, alive, c, w, a, qt] = s;
      if (id === Net.me) { if (this.L) { this.L.hp = hp; if (!alive && this.L.alive) this.L.alive = false; } continue; }
      const r = this.remotes.get(id);
      if (!r) continue;
      r.hp = hp; r.alive = !!alive; if (!r.alive) r.setVisible(false); else if (!r.root.visible && r.buf.length) r.setVisible(true);
      r.crouch = c ? 1 : 0; r.setWeapon(w | 0); r.ads = a ? 1 : 0; r.quiet = !!qt;
      r.buf.push({ t: now, x, y, z, yaw, pitch }); if (r.buf.length > 24) r.buf.shift();
    }
    // intervalo medio entre snapshots -> atraso de interpolacao adaptativo (2 intervalos + folga)
    if (this.lastSnapT) { const gap = now - this.lastSnapT; this.snapGap = this.snapGap ? this.snapGap * 0.9 + gap * 0.1 : gap; }
    this.lastSnapT = now;
    if (now - this.hudT > 120) { this.hudT = now; this.renderHud(); }
  },
  onEvent(m) {
    if (!this.running) return;
    const now = performance.now();
    if (m.k === 'spawn') {
      if (m.id === Net.me) {
        const L = this.L;
        L.pos.set(m.p[0], m.p[1], m.p[2]); L.vel.set(0, 0, 0); L.yaw = m.yaw; L.pitch = 0; L.alive = true; L.hp = 100; L.crouch = false; L.tuck = 0; L.grounded = true;
        this.eyeH = EYE; this.stepOff = 0; this.rp = this.ry = 0; this.shotI = 0;
        this.kit = [validPrim(), validSec(), 'knife', 'nade']; this.nades = 1;
        this.ammo = {}; for (const k of this.kit) if (WEAPONS[k].mag) this.ammo[k] = WEAPONS[k].mag;
        this.reloading = 0; this.shellNext = 0; this.throwT = 0; this.cur = this.kit[0]; this.prev = this.kit[1]; this.setAds(false);
        this.vm.equip(this.cur); this.vm.play('draw', 380);
        this.play('draw', 380); this.readyAt = now + 380; q('death').hidden = true; this.deathAt = 0; this.renderHud();
      } else {
        const r = this.remotes.get(m.id);
        if (r) { r.alive = true; r.buf = [{ t: now, x: m.p[0], y: m.p[1], z: m.p[2], yaw: m.yaw, pitch: 0 }]; r.pos.set(m.p[0], m.p[1], m.p[2]); r.prev.copy(r.pos); r.vel.set(0, 0, 0); r.yaw = m.yaw; r.setVisible(true); }
      }
      return;
    }
    if (m.k === 'fire') {
      if (m.id === Net.me) return;
      const r = this.remotes.get(m.id);
      const d = r && this.L ? r.pos.distanceTo(this.L.pos) : 30;
      if (m.w === 'knife') { if (d < 12 && r) Audio.play(m.mode === 'stab' ? 'swingheavy' : 'swing', { pos: _a.copy(r.pos).setY(r.pos.y + 1.2), ref: 2 }); return; }
      const o = new V3(...m.o), ends = (m.es && m.es.length ? m.es : [m.e]).map((e) => new V3(...e));
      let from = o;
      if (r && r.root.visible) { r.fire(now); from = r.muzzleWorld(new V3()); this.rlight.position.copy(from); this.rlight.intensity = m.w === 'sniper' || m.w === 'shotgun' ? 50 : 25; }
      for (const e of ends) this.fx.tracer(from, e, m.w);
      if (!m.v && !(m.hits && m.hits.length)) for (const e of ends.slice(0, 3)) {
        const dir = _d.copy(e).sub(o).normalize(), h = this.wallHit(o, dir, o.distanceTo(e) + 0.05);
        if (h.n) { const k = this.impactKind(h.box, e); this.fx.impact(e, h.n, k); Audio.play('imp_' + k, { pos: e, ref: 2, vol: 0.6 }); }
      }
      const loud = m.w === 'smg' ? 0.9 : 1;
      Audio.play(m.w, { pos: from, ref: 7, vol: loud, send: clamp(0.3 + d / 50, 0.3, 0.9), lp: d > 20 ? Math.max(2500, 16000 - d * 170) : 20000 });
      if (this.L && this.L.alive) {
        const e = ends[0], dir = _d.copy(e).sub(o).normalize(), eye = this.eye(), len = o.distanceTo(e);
        const t = clamp(_b.copy(eye).sub(o).dot(dir), 0, len), cp = _c.copy(o).addScaledVector(dir, t);
        if (cp.distanceTo(eye) < 2.2 && t < len - 0.5 && t > 1.5) Audio.play(m.w === 'sniper' || m.w === 'dmr' ? 'flycrack' : 'flyby', { pos: cp, ref: 1.5, vol: 0.9 });
      }
      return;
    }
    if (m.k === 'nade') { this.nadeSys.spawn(m, m.id === Net.me); if (m.id !== Net.me) { const r = this.remotes.get(m.id); if (r) r.fire(now, true); } return; }
    if (m.k === 'boom') { this.nadeSys.boom(m); return; }
    if (m.k === 'dmg') {
      if (m.id === Net.me) {
        this.flashDamage(m.from); Audio.play('hurt', { vol: 0.8 });
        // tagging: tomar tiro freia um pouco (menos que no CS; sem travar)
        if (this.L && m.w !== 'nade') { this.L.vel.x *= 0.72; this.L.vel.z *= 0.72; }
      } else if (this.L && m.from && Math.hypot(m.from[0] - this.L.pos.x, m.from[2] - this.L.pos.z) > 0.6) {
        const r = this.remotes.get(m.id); if (r && r.root.visible) this.fx.blood(_a.copy(r.pos).setY(r.pos.y + (r.crouch ? 0.8 : 1.25)), _b.set(0, 0.3, 0), m.hs);
      }
      return;
    }
    if (m.k === 'rl') {
      const r = this.remotes.get(m.id);
      if (r && m.id !== Net.me) {
        const W = WEAPONS[m.w] || WEAPONS.rifle, ms = W.shellByShell ? W.reloadStart + W.reloadMs * 3 : W.reloadMs || 2000;
        r.reload(now, ms);
        const p = _a.copy(r.pos).setY(r.pos.y + 1.1);
        if (W.shellByShell) Audio.play('shellin', { pos: p, ref: 2, vol: 0.7, delay: 0.4 });
        else { Audio.play('magout', { pos: p, ref: 2, vol: 0.7 }); Audio.play('magin', { pos: p, ref: 2, vol: 0.7, delay: ms * 0.00055 }); }
      }
      return;
    }
    if (m.k === 'kill') {
      const killer = Net.roster.find((p) => p.id === m.killer), victim = Net.roster.find((p) => p.id === m.victim);
      this.addFeed(killer, victim, m.hs, m.w);
      if (m.killer === Net.me && m.victim !== Net.me) { Audio.play('kill', { vol: 0.9 }); if (m.hs) Audio.play('dink', { vol: 0.6, delay: 0.05 }); }
      const vr = this.remotes.get(m.victim); if (vr && vr.root.visible) vr.die(now);
      if (m.victim === Net.me) {
        this.L.alive = false; this.deathAt = now; this.killerName = killer ? killer.name : '?'; this.killerColor = killer ? killer.color : '#fff';
        this.killerHs = m.hs; this.killerW = m.w; this.killerSelf = m.killer === Net.me; this.setAds(false); this.throwT = 0;
      }
    }
  },
  addFeed(k, v, hs, w) {
    const el = document.createElement('div');
    const W = WEAPONS[w];
    const how = w === 'knife' ? (hs ? '🔪 pelas costas' : '🔪') : w === 'nade' ? (k && v && k.id === v.id ? '💥 se explodiu' : '💥 granada') : (W ? W.short || W.name : '?') + (hs ? ' ☠' : '');
    el.innerHTML = '<b style="color:' + (k ? k.color : '#fff') + '">' + esc(k ? k.name : '?') + '</b> <span style="color:#8A93A6">' + esc(how) + '</span> ' + (k && v && k.id === v.id ? '' : '<b style="color:' + (v ? v.color : '#fff') + '">' + esc(v ? v.name : '?') + '</b>');
    q('feed').prepend(el);
    while (q('feed').children.length > 5) q('feed').lastChild.remove();
    setTimeout(() => el.remove(), 6000);
  },
  flashDamage(from) {
    const el = q('dmg'); el.classList.add('on'); clearTimeout(this.dmgT); this.dmgT = setTimeout(() => el.classList.remove('on'), 60);
    this.dmgFx = 1;
    if (from && this.L) {
      const ang = Math.atan2(from[0] - this.L.pos.x, from[2] - this.L.pos.z);
      const rel = ang - Math.atan2(-Math.sin(this.L.yaw), -Math.cos(this.L.yaw));
      const arc = document.createElement('i');
      arc.style.transform = 'translate(-50%,-50%) rotate(' + (-rel * 180 / Math.PI) + 'deg)';
      q('dmgdir').appendChild(arc); setTimeout(() => arc.remove(), 1100);
    }
  },
  // ---------------------------------------------------------------- entrada
  bindInput() {
    const tryLock = () => { if (!this.running || !q('end').hidden || !q('settings').hidden) return; Audio.ensure(); this.lock(); };
    q('game').addEventListener('click', (e) => { if (e.target.closest('.box') && !e.target.closest('#clickToPlay')) return; tryLock(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === q('cv');
      if (this.locked) { q('clickToPlay').hidden = true; q('menu').hidden = true; }
      else if (this.running && q('end').hidden && q('settings').hidden) { this.keys.clear(); this.mouseDown = false; this.altHeld = false; q('menu').hidden = false; hooks.renderMenu && hooks.renderMenu(); }
    });
    document.addEventListener('pointerlockerror', () => { if (DBG) { this.locked = true; q('clickToPlay').hidden = true; } else toast('Não consegui prender o mouse. Clique de novo.'); });
    // mouse cru: pointerrawupdate entrega o movimento assim que chega (sem esperar o quadro); cai para mousemove se nao houver
    const look = (e) => {
      if (!this.locked || !this.running || !this.L) return;
      const mx = e.movementX, my = e.movementY;
      if (!mx && !my) return;
      const W = WEAPONS[this.cur];
      let k = YAW_PER_COUNT * S.sens;
      if (this.scoped) k *= (tanHalf(W.scope) / tanHalf(S.fov)) * (S.adsSens || 1);
      else if (this.adsOn && W.ads) k *= W.ads.sens * (S.adsSens || 1);
      this.L.yaw -= mx * k; this.L.pitch -= my * k * (S.inv ? -1 : 1);
      this.L.pitch = clamp(this.L.pitch, -1.55, 1.55);
      this.sway[0] += mx; this.sway[1] += my;
    };
    if ('onpointerrawupdate' in window) document.addEventListener('pointerrawupdate', look); else document.addEventListener('mousemove', look);
    document.addEventListener('mousedown', (e) => {
      if (!this.locked || uiState.listen) return;
      if (e.button === 0) { this.mouseDown = true; this.firePressed = true; }
      else if (e.button === 2) { this.altPressed = true; this.altHeld = true; }
      else this.keyEvent('Mouse' + e.button, true);
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      else if (e.button === 2) { this.altHeld = false; if (S.adsMode === 'hold' && WEAPONS[this.cur].kind === 'gun') this.setAds(false); }
      else this.keyEvent('Mouse' + e.button, false);
    });
    document.addEventListener('wheel', (e) => { if (!this.locked || uiState.listen) return; this.keyEvent(e.deltaY < 0 ? 'WheelUp' : 'WheelDown', true); this.keyEvent(e.deltaY < 0 ? 'WheelUp' : 'WheelDown', false); }, { passive: true });
    document.addEventListener('contextmenu', (e) => { if (this.running) e.preventDefault(); });
    document.addEventListener('keydown', (e) => {
      if (uiState.listen) return;
      if (e.code === 'Escape' && this.locked) { document.exitPointerLock(); return; }
      if (this.running && this.locked && (e.code === 'Tab' || e.code === 'Space' || e.ctrlKey)) e.preventDefault();
      if (!e.repeat) this.keyEvent(e.code, true);
    });
    document.addEventListener('keyup', (e) => this.keyEvent(e.code, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; this.altHeld = false; });
    q('btnResume').addEventListener('click', () => this.lock());
    q('btnSettings').addEventListener('click', () => { q('menu').hidden = true; hooks.openSettings(() => { if (this.running && q('end').hidden) q('menu').hidden = false; }); });
    q('btnLeave').addEventListener('click', () => { location.href = location.pathname; });
  },
  lock() {
    const cv = q('cv'); q('menu').hidden = true;
    // tela cheia + trava do teclado: Ctrl+W (agachar + frente) nao fecha a aba; Esc continua abrindo o menu
    if (S.full !== false && !DBG && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { navigator.keyboard && navigator.keyboard.lock && navigator.keyboard.lock(); } catch {} }).catch(() => {});
    }
    try { const p = cv.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => { try { cv.requestPointerLock(); } catch {} }); }
    catch { try { cv.requestPointerLock(); } catch {} }
  },
  keyEvent(code, down) {
    if (!this.running) return;
    down ? this.keys.add(code) : this.keys.delete(code);
    const b = S.binds;
    if (code === b.scoreboard) { this.sbFull = down; q('sb').classList.toggle('full', down); }
    if (!down) return;
    if (code === b.jump) this.jumpQ = performance.now();
    if (this.L && !this.L.alive && this.deathAt) {
      const n = /^Digit([1-8])$/.exec(code);
      if (n) { const i = +n[1] - 1; if (i < PRIMARIES.length) this.setLoadout('prim', PRIMARIES[i]); else this.setLoadout('sec', SECONDARIES[i - PRIMARIES.length]); }
      return;
    }
    if (code === b.reload) this.reload();
    else if (code === b.slot1) this.switchTo(this.kit[0]);
    else if (code === b.slot2) this.switchTo(this.kit[1]);
    else if (code === b.slot3) this.switchTo('knife');
    else if (code === b.slot4) this.switchTo('nade');
    else if (code === b.last) this.switchTo(this.prev);
    else if (code === b.inspect) this.inspect();
    else if (code === 'WheelUp' || code === 'WheelDown') {
      const l = this.kit.filter((w) => w !== 'nade' || this.nades > 0), i = Math.max(0, l.indexOf(this.cur));
      this.switchTo(l[(i + (code === 'WheelDown' ? 1 : l.length - 1)) % l.length]);
    }
  },
  act(n) { return this.keys.has(S.binds[n]); },
  setLoadout(slot, w) {
    if (S[slot] === w) return;
    S[slot] = w; S.cls = w === 'sniper' ? 'sniper' : 'ar'; saveSettings();
    toast(WEAPONS[w].name + ' na próxima vida'); refreshClassButtons();
  },
  setClass(c) { this.setLoadout('prim', c === 'sniper' ? 'sniper' : 'rifle'); },

  // ---------------------------------------------------------------- fisica
  height() { return this.L.crouch ? CROUCH_H : STAND_H; },
  // caixas perto de um retangulo (grade espacial)
  near(x0, x1, z0, z1) { return queryGrid(this.grid, x0, x1, z0, z1); },
  overlaps(p, h) {
    const x0 = p.x - PLAYER_R, x1 = p.x + PLAYER_R, y0 = p.y, y1 = p.y + h, z0 = p.z - PLAYER_R, z1 = p.z + PLAYER_R;
    const list = this.near(x0, x1, z0, z1);
    for (let i = 0; i < list.n; i++) { const b = list.a[i]; if (x1 > b.minx && x0 < b.maxx && y1 > b.miny && y0 < b.maxy && z1 > b.minz && z0 < b.maxz) return b; }
    return null;
  },
  highestTop(p, h) {
    let top = -1;
    const x0 = p.x - PLAYER_R, x1 = p.x + PLAYER_R, y0 = p.y, y1 = p.y + h, z0 = p.z - PLAYER_R, z1 = p.z + PLAYER_R;
    const list = this.near(x0, x1, z0, z1);
    for (let i = 0; i < list.n; i++) { const b = list.a[i]; if (x1 > b.minx && x0 < b.maxx && y1 > b.miny && y0 < b.maxy && z1 > b.minz && z0 < b.maxz && b.maxy > top) top = b.maxy; }
    return top;
  },
  maxSpeed() {
    const L = this.L, W = WEAPONS[this.cur];
    let m = W.speed * (L.crouch && L.grounded ? CROUCH_K : 1);
    if (this.act('walk') && !(L.crouch && L.grounded)) m *= WALK_K;
    if (this.scoped) m *= 0.7; else if (this.adsOn && W.ads) m *= W.ads.speed;
    return m;
  },
  movePlayer(dt, now) {
    const L = this.L;
    if (!L || !L.alive) return;
    // agachar: no chao encolhe por cima; no ar encolhe as pernas (crouch-jump) e a camera nao pula
    const wantC = this.act('crouch');
    if (wantC && !L.crouch) {
      L.crouch = true;
      if (!L.grounded) { const py = L.pos.y; L.pos.y += TUCK; if (this.overlaps(L.pos, CROUCH_H)) L.pos.y = py; else { L.tuck = TUCK; this.stepOff -= TUCK; } }
    } else if (!wantC && L.crouch) {
      if (L.tuck && !L.grounded) { const py = L.pos.y; L.pos.y -= L.tuck; if (L.pos.y < 0 || this.overlaps(L.pos, STAND_H)) L.pos.y = py; else { L.crouch = false; this.stepOff += L.tuck; L.tuck = 0; } }
      else if (!this.overlaps(L.pos, STAND_H)) { L.crouch = false; L.tuck = 0; }
    }
    // direcao desejada (uma vez por quadro)
    const f = (this.act('forward') ? 1 : 0) - (this.act('back') ? 1 : 0), s = (this.act('right') ? 1 : 0) - (this.act('left') ? 1 : 0);
    const sy = Math.sin(L.yaw), cy = Math.cos(L.yaw);
    let wx = -sy * f + cy * s, wz = -cy * f - sy * s;
    const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }
    const max = this.maxSpeed();
    const wasGround = L.grounded;
    let fallV = 0, landed = false;
    const n = Math.max(1, Math.ceil(dt / SUB)), h = dt / n;
    for (let k = 0; k < n; k++) {
      // pulo: buffer (apertou um pouco antes de tocar o chao) + coyote (acabou de sair da borda)
      const canJump = L.grounded || (now - this.lastGround < COYOTE && L.vel.y <= 0 && !this.jumped);
      if (this.jumpQ && now - this.jumpQ < JUMP_BUF && canJump) {
        L.vel.y = JUMP_V; L.grounded = false; this.jumpQ = 0; this.jumped = true; this.onJump();
      }
      if (L.grounded) {
        // chao: aproxima a velocidade do alvo com taxa fixa (seco). Freia mais forte do que acelera.
        const tx = wx * max, tz = wz * max, dx = tx - L.vel.x, dz = tz - L.vel.z, dl = Math.hypot(dx, dz);
        if (dl > 1e-6) {
          const opp = wl === 0 || L.vel.x * tx + L.vel.z * tz < 0 || Math.hypot(L.vel.x, L.vel.z) > max + 0.05;
          const stp = Math.min(dl, (opp ? DEC : ACC) * h);
          L.vel.x += dx / dl * stp; L.vel.z += dz / dl * stp;
        }
      } else if (wl > 0) {
        // ar: controle estilo CS (da para curvar no ar, ganho limitado)
        const cur = L.vel.x * wx + L.vel.z * wz, add = Math.min(AIR_ACC * max * h, AIR_CAP - cur);
        if (add > 0) { L.vel.x += wx * add; L.vel.z += wz * add; }
        const hs = Math.hypot(L.vel.x, L.vel.z), cap = max * 1.35;
        if (hs > cap) { L.vel.x *= cap / hs; L.vel.z *= cap / hs; }
      }
      L.vel.y -= GRAV * h;
      if (L.vel.y < fallV) fallV = L.vel.y;
      const g0 = L.grounded, hh = this.height();
      for (let ax = 0; ax < 2; ax++) {
        const key = ax ? 'z' : 'x', v = L.vel[key]; if (!v) continue;
        const old = L.pos[key];
        L.pos[key] += v * h;
        if (!this.overlaps(L.pos, hh)) continue;
        let stepped = false;
        if (L.grounded || L.vel.y <= 0.01) {
          const top = this.highestTop(L.pos, hh), dh = top - L.pos.y;
          if (dh > 0 && dh <= (L.grounded ? STEP : AIR_STEP)) { const py = L.pos.y; L.pos.y = top + 0.001; if (this.overlaps(L.pos, hh)) L.pos.y = py; else { stepped = true; L.grounded = true; L.vel.y = 0; this.stepOff -= dh; } }
        }
        if (!stepped) { L.pos[key] = old; L.vel[key] = 0; }
      }
      L.pos.y += L.vel.y * h;
      L.grounded = false;
      const hit = this.overlaps(L.pos, hh);
      if (hit) { if (L.vel.y <= 0) { L.pos.y = this.highestTop(L.pos, hh); L.grounded = true; } else L.pos.y = hit.miny - hh - 0.001; L.vel.y = 0; }
      if (L.pos.y <= 0) { L.pos.y = 0; L.vel.y = 0; L.grounded = true; }
      // descer degrau/rampa sem "voar": gruda no chao se a queda for de ate um degrau
      if (g0 && !L.grounded && L.vel.y <= 0 && !this.jumped) {
        const p = _a.copy(L.pos); p.y -= STEP;
        const top = this.highestTop(p, hh);
        if (top >= 0 && top <= L.pos.y + 0.001 && top >= L.pos.y - STEP) { this.stepOff += L.pos.y - top; L.pos.y = top; L.grounded = true; L.vel.y = 0; }
        else if (L.pos.y <= STEP) { this.stepOff += L.pos.y; L.pos.y = 0; L.grounded = true; L.vel.y = 0; }
      }
      if (L.grounded) { this.lastGround = now; if (!g0) { landed = true; this.jumped = false; if (L.tuck) L.tuck = 0; } }
      else if (g0 && L.vel.y > 0) this.jumped = true;
    }
    const lim = this.map.size / 2 - PLAYER_R - 0.02;
    L.pos.x = clamp(L.pos.x, -lim, lim); L.pos.z = clamp(L.pos.z, -lim, lim);
    if (!wasGround && landed && fallV < -3) this.onLand(-fallV);
    // passos (andando com Shift ou agachado nao faz barulho para os outros; para voce, bem baixinho)
    const hs = Math.hypot(L.vel.x, L.vel.z), quiet = L.crouch || this.act('walk');
    if (L.grounded && hs > 1) {
      this.stepAcc += hs * dt;
      const every = quiet ? 1.6 : 2.15;
      if (this.stepAcc > every) { this.stepAcc = 0; Audio.play('step_' + this.surfaceAt(L.pos), { vol: quiet ? 0.1 : 0.42, send: 0.08 }); }
    } else this.stepAcc = Math.min(this.stepAcc, 1.2);
  },
  onJump() { Audio.play('jump', { vol: 0.5 }); this.vm.impulse('jump', 0.6); },
  onLand(v) { Audio.play('land_' + this.surfaceAt(this.L.pos), { vol: clamp(v / 9, 0.3, 1) }); this.vm.impulse('land', clamp(v / 6, 0.4, 1.6)); },
  surfaceAt(p) {
    const W = this.W; if (!W) return 'concrete';
    if (p.y > 0.02) {
      const list = this.near(p.x - 0.3, p.x + 0.3, p.z - 0.3, p.z + 0.3);
      for (let i = 0; i < list.n; i++) { const b = list.a[i]; if (Math.abs(b.maxy - p.y) < 0.06 && p.x > b.minx - 0.3 && p.x < b.maxx + 0.3 && p.z > b.minz - 0.3 && p.z < b.maxz + 0.3) return b.surf || 'concrete'; }
      return 'concrete';
    }
    for (const r of W.pools || []) if (p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1) return 'wet';
    return this.map.ground.surface || 'concrete';
  },
  impactKind(box, p) {
    if (!box) return this.map.impacts.ground || 'concrete';
    if (this.mapKey === 'escritorio' && box.r === 'perim' && p && p.y > 3.35 && p.y < 7.3) return 'glass';
    return box.imp || 'concrete';
  },
  // ---------------------------------------------------------------- raios e hitboxes
  rayBox(o, d, b) {
    let t0 = 0, t1 = Infinity;
    const O = [o.x, o.y, o.z], D = [d.x, d.y, d.z], mn = [b.minx, b.miny, b.minz], mx = [b.maxx, b.maxy, b.maxz];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(D[i]) < 1e-9) { if (O[i] < mn[i] || O[i] > mx[i]) return Infinity; continue; }
      let a = (mn[i] - O[i]) / D[i], c = (mx[i] - O[i]) / D[i];
      if (a > c) { const t = a; a = c; c = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) return Infinity;
    }
    return t0;
  },
  raySphere(o, d, c, r) {
    const x = c.x - o.x, y = c.y - o.y, z = c.z - o.z, t = x * d.x + y * d.y + z * d.z;
    if (t < 0) return Infinity;
    const d2 = x * x + y * y + z * z - t * t;
    return d2 > r * r ? Infinity : t - Math.sqrt(r * r - d2);
  },
  wallT(o, d, max) {
    let t = max;
    for (const b of this.boxes) { if (b.glass) continue; const h = this.rayBox(o, d, b); if (h < t) t = h; }
    if (d.y < 0) { const g = -o.y / d.y; if (g < t) t = g; }
    return t;
  },
  wallHit(o, d, max) {
    let t = max, box = null;
    for (const b of this.boxes) { if (b.glass) continue; const h = this.rayBox(o, d, b); if (h < t) { t = h; box = b; } }
    let n = null;
    if (d.y < 0) { const g = -o.y / d.y; if (g < t) { t = g; box = null; n = new V3(0, 1, 0); } }
    if (box) {
      const p = o.clone().addScaledVector(d, t), e = 0.001;
      n = new V3();
      if (Math.abs(p.x - box.minx) < e) n.x = -1; else if (Math.abs(p.x - box.maxx) < e) n.x = 1;
      else if (Math.abs(p.y - box.miny) < e) n.y = -1; else if (Math.abs(p.y - box.maxy) < e) n.y = 1;
      else if (Math.abs(p.z - box.minz) < e) n.z = -1; else n.z = 1;
    }
    return { t, n, box };
  },
  eye() { const L = this.L; return new V3(L.pos.x, L.pos.y + this.eyeH, L.pos.z); },
  // direcao da mira = olhar + recuo acumulado; spread aleatorio uniforme num disco
  aimDir(spread) {
    const L = this.L, d = new V3(0, 0, -1).applyEuler(_e.set(L.pitch + this.rp, L.yaw + this.ry, 0, 'YXZ'));
    if (spread) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      _b.set(1, 0, 0).applyEuler(_e); _c.set(0, 1, 0).applyEuler(_e);
      d.addScaledVector(_b, Math.cos(a) * r).addScaledVector(_c, Math.sin(a) * r).normalize();
    }
    return d;
  },
  hitboxes(r) {
    const p = r.pos, c = r.crouch;
    return {
      head: [new V3(p.x, p.y + (c ? 0.98 : 1.55), p.z), 0.24],
      body: { minx: p.x - 0.32, maxx: p.x + 0.32, miny: p.y + (c ? 0.36 : 0.55), maxy: p.y + (c ? 0.86 : 1.36), minz: p.z - 0.32, maxz: p.z + 0.32 },
      legs: { minx: p.x - 0.27, maxx: p.x + 0.27, miny: p.y, maxy: p.y + (c ? 0.36 : 0.55), minz: p.z - 0.27, maxz: p.z + 0.27 },
    };
  },
  enemy(r) { return r.alive && r.root.visible && !(Net.cfg.mode === 'tdm' && r.team === (mySelf() || {}).team); },
  vmToWorld(pv, out) {
    _a.copy(pv).project(this.vmCamera); _a.z = 0.5; _a.unproject(this.camera);
    this.camera.getWorldPosition(_b);
    return out.copy(_a).sub(_b).normalize().multiplyScalar(Math.max(0.3, pv.length())).add(_b);
  },
  // imprecisao atual (tambem alimenta a mira dinamica)
  curSpread() {
    const L = this.L, W = WEAPONS[this.cur];
    if (!L || W.kind !== 'gun') return 0;
    const ads = this.adsOn && W.ads ? W.ads : null;
    const hs = Math.hypot(L.vel.x, L.vel.z), mv = clamp((hs - W.speed * 0.3) / (W.speed * 0.45), 0, 1);
    let s = this.scoped ? W.spread.scoped : W.spread.hip;
    s += W.spread.move * mv * (ads ? ads.move : 1);
    s += Math.min(this.shotI, 12) * (W.recoilK || 0);
    if (ads) s *= ads.spread;
    if (!L.grounded) s += W.spread.air;
    if (L.crouch && L.grounded) s *= 0.8;
    return s;
  },
  fireGun(now) {
    const L = this.L, W = WEAPONS[this.cur], ads = this.adsOn && W.ads ? W.ads : null;
    this.ammo[this.cur]--;
    if (this.reloading && W.shellByShell) { this.reloading = 0; this.shellNext = 0; this.rlEmpty = false; }
    // recuo: o indice do padrao volta se voce solta o gatilho
    if (now - this.lastShot > W.fireMs * 1.6) this.shotI = Math.max(0, this.shotI - (now - this.lastShot) / 110);
    const s = this.curSpread();
    const eye = this.eye();
    const pellets = W.pellets || 1, hits = new Map(), ends = [];
    let firstVid = 0, firstPart = '', firstEnd = null, anyWall = null;
    for (let p = 0; p < pellets; p++) {
      let dir;
      if (pellets > 1) dir = this.aimDir(W.cone * (ads ? ads.spread : 1) * (p === 0 ? 0.2 : 1) + s);
      else dir = this.aimDir(s);
      const wh = this.wallHit(eye, dir, 250);
      let t = wh.t, vid = 0, part = '';
      for (const r of this.remotes.values()) {
        if (!this.enemy(r)) continue;
        const hb = this.hitboxes(r);
        let hh = this.raySphere(eye, dir, hb.head[0], hb.head[1]); if (hh < t) { t = hh; vid = r.id; part = 'h'; }
        hh = this.rayBox(eye, dir, hb.body); if (hh < t) { t = hh; vid = r.id; part = 'b'; }
        hh = this.rayBox(eye, dir, hb.legs); if (hh < t) { t = hh; vid = r.id; part = 'l'; }
      }
      const end = eye.clone().addScaledVector(dir, t);
      ends.push(end);
      if (p === 0) { firstVid = vid; firstPart = part; firstEnd = end; }
      if (vid) {
        const key = vid + part; hits.set(key, [vid, part, (hits.get(key) || [0, 0, 0])[2] + 1]);
        if (p < 3 || part === 'h') this.fx.blood(end, dir, part === 'h');
      } else if (wh.n && (p < 4 || Math.random() < 0.5)) {
        const k = this.impactKind(wh.box, end);
        this.fx.impact(end, wh.n, k); anyWall = anyWall || [end, k];
      }
    }
    // chute da camera (padrao fixo + um pouco de ruido)
    const kick = ads ? ads.kick : 1, pat = W.pattern, i = Math.min(Math.floor(this.shotI), 29);
    const kv = pat ? pat.v[i] : 1 + Math.random() * 0.5, kh = pat ? pat.h[i] : (Math.random() - 0.5) * 2;
    this.rp += W.kick * kv * kick * (L.crouch ? 0.85 : 1); this.ry -= W.kickYaw * kh * kick * 0.5 + (Math.random() - 0.5) * W.kickYaw * 0.15;
    this.shotI += 1; this.lastShot = now; this.camKick = 1;
    // som, clarao, fumaca, tracantes
    Audio.play(this.cur, { vol: this.cur === 'smg' ? 0.85 : 1, send: 0.32, jitter: 0.05 });
    this.vm.cancel('inspect');
    this.vm.fire(this.adsOn, this.ammo[this.cur] <= 0 && (this.cur === 'pistol' || this.cur === 'deagle'));
    const big = this.cur === 'sniper' || this.cur === 'shotgun' || this.cur === 'deagle';
    this.muzzleT = now + (big ? 55 : 32);
    this.flash.visible = true; this.flash.rotation.z = Math.random() * 6.28;
    this.flash.scale.setScalar((this.vm.cur.userData.flash || 0.12) * (0.85 + Math.random() * 0.3));
    const mv = this.vm.muzzle(new V3()); const mw = mv ? this.vmToWorld(mv, new V3()) : eye.clone();
    this.mlight.position.copy(mw); this.mlight.intensity = big ? 60 : 30;
    this.vmFlashLight.intensity = 3;
    for (let k = 0; k < ends.length; k++) if (k < 5) this.fx.tracer(mw, ends[k], this.cur);
    this.fx.muzzleSmoke(mw, ends[0].clone().sub(mw).normalize(), this.cur);
    if (hits.size) {
      let head = false; for (const h of hits.values()) if (h[1] === 'h') head = true;
      this.hitmark(head); Audio.play(head ? 'dink' : 'hit', { vol: 0.7 });
    } else if (anyWall) Audio.play('imp_' + anyWall[1], { pos: anyWall[0], ref: 2.5, vol: 0.8 });
    const surf = this.surfaceAt(L.pos);
    if (this.cur !== 'sniper' && this.cur !== 'shotgun') Audio.play('shells_' + surf, { vol: 0.22, delay: 0.35 + Math.random() * 0.1 });
    const r3 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
    const msg = { t: 'fire', w: this.cur, o: r3(eye), e: r3(firstEnd), v: firstVid, part: firstPart };
    if (pellets > 1) { msg.hits = [...hits.values()]; msg.es = ends.slice(0, 6).map(r3); msg.v = 0; }
    send(msg);
    this.play('fire', big ? 160 : 110);
    this.readyAt = now + W.fireMs;
    if (this.cur === 'sniper') {
      this.setAds(false);
      setTimeout(() => {
        if (this.cur === 'sniper' && this.L && this.L.alive && !this.reloading) { this.play('bolt', 1100); this.vm.play('bolt', 1100); setTimeout(() => Audio.play('shells_' + this.surfaceAt(this.L.pos), { vol: 0.3 }), 700); }
      }, 200);
    } else if (this.cur === 'shotgun' && this.ammo.shotgun > 0) {
      setTimeout(() => { if (this.cur === 'shotgun' && this.L && this.L.alive && !this.reloading) { this.play('pump', 560); this.vm.play('pump', 560); setTimeout(() => Audio.play('shells_' + this.surfaceAt(this.L.pos), { vol: 0.3 }), 380); } }, 170);
    }
    if (this.ammo[this.cur] <= 0) setTimeout(() => this.reload(), this.cur === 'sniper' ? 1350 : this.cur === 'shotgun' ? 300 : 150);
    this.renderHud();
  },
  melee(mode, now) {
    const L = this.L, K = WEAPONS.knife[mode];
    this.play(mode, K.ms); this.readyAt = now + K.ms; this.vm.play(mode, K.ms);
    setTimeout(() => {
      if (!this.L || !this.L.alive || this.cur !== 'knife') return;
      const eye = this.eye(), dir = this.aimDir(0);
      let vid = 0, best = 1e9, back = false;
      for (const r of this.remotes.values()) {
        if (!this.enemy(r)) continue;
        const to = new V3(r.pos.x, r.pos.y + (r.crouch ? 0.6 : 0.95), r.pos.z).sub(eye), d = to.length();
        if (d > K.range + 0.4) continue;
        to.normalize();
        if (to.dot(dir) < 0.5 || this.wallT(eye, to, d) < d - 0.3 || d >= best) continue;
        best = d; vid = r.id;
        const fx = -Math.sin(r.yaw), fz = -Math.cos(r.yaw), dx = L.pos.x - r.pos.x, dz = L.pos.z - r.pos.z, dd = Math.hypot(dx, dz) || 1;
        back = (fx * dx + fz * dz) / dd < -0.35;
      }
      if (vid) {
        this.hitmark(back); Audio.play('stabhit', { vol: 0.9 });
        const r = this.remotes.get(vid); if (r) this.fx.blood(_a.copy(r.pos).setY(r.pos.y + (r.crouch ? 0.7 : 1.1)), dir, back);
      } else {
        // bateu na parede?
        const wh = this.wallHit(eye, dir, K.range);
        if (wh.n && wh.t < K.range) { const e = eye.clone().addScaledVector(dir, wh.t), k = this.impactKind(wh.box, e); this.fx.impact(e, wh.n, k); Audio.play('imp_' + k, { pos: e, ref: 2, vol: 0.7 }); }
      }
      send({ t: 'fire', w: 'knife', mode, v: vid });
    }, K.ms * 0.35);
  },
  // granada: esquerdo = arremesso longo, direito = lob curto (como no CS)
  throwNade(lob, now) {
    if (this.nades <= 0 || this.throwT) return;
    this.throwT = now + 330; this.throwLob = lob;
    this.play('throw', 700); this.vm.play('throw', 700, { lob });
    this.readyAt = now + 700;
  },
  releaseNade() {
    const L = this.L, N = WEAPONS.nade; this.throwT = 0;
    if (!L || !L.alive) return;
    this.nades--;
    const dir = this.aimDir(0), eye = this.eye();
    _a.set(1, 0, 0).applyEuler(_e.set(L.pitch, L.yaw, 0, 'YXZ'));
    const o = eye.clone().addScaledVector(dir, 0.35).addScaledVector(_a, 0.12); o.y -= 0.08;
    const sp = this.throwLob ? N.lobV : N.throwV;
    const v = dir.clone().multiplyScalar(sp); v.y += this.throwLob ? 2.2 : 1.6; v.x += L.vel.x * 0.9; v.z += L.vel.z * 0.9; v.y += Math.max(0, L.vel.y) * 0.5;
    const r3 = (x) => [+x.x.toFixed(3), +x.y.toFixed(3), +x.z.toFixed(3)];
    const seed = (Math.random() * 1e9) | 0;
    const m = { t: 'nade', o: r3(o), v: r3(v), s: seed };
    send(m); this.nadeSys.spawn({ ...m, id: Net.me }, true);
    Audio.play('nadethrow', { vol: 0.6 });
    setTimeout(() => { if (this.L && this.L.alive && this.cur === 'nade') { const back = this.prev && this.prev !== 'nade' ? this.prev : this.kit[0]; this.prev = 'nade'; this.cur = 'nade'; this.switchTo(back); } }, 280);
    this.renderHud();
  },
  hitmark(hs) { const el = q('hm'); el.classList.remove('hit'); void el.offsetWidth; el.classList.toggle('hs', hs); el.classList.add('hit'); },

  // ---------------------------------------------------------------- quadro
  frame(tms) {
    if (!this.running) return;
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, Math.max(0, (tms - this.lastFrame) / 1000));
    this.lastFrame = tms;
    if (!this.ready) return;
    this.simulate(dt, performance.now());
    this.draw(dt, performance.now(), !this.manual);
  },
  simulate(dt, now) {
    const L = this.L, active = this.locked && q('settings').hidden;
    if (active) this.movePlayer(dt, now);
    if (L && L.alive && active) {
      const W = WEAPONS[this.cur];
      if (this.altPressed) {
        this.altPressed = false;
        if (this.cur === 'knife') { if (now >= this.readyAt && !this.animBusy()) this.melee('stab', now); }
        else if (this.cur === 'nade') { if (now >= this.readyAt && !this.animBusy()) this.throwNade(true, now); }
        else if (this.canAds()) { if (S.adsMode === 'hold') this.setAds(true); else this.setAds(!this.adsOn); }
      }
      if (S.adsMode === 'hold' && this.altHeld && !this.adsOn && W.kind === 'gun' && this.canAds() && !(this.cur === 'sniper' && now < this.readyAt)) this.setAds(true);
      if (W.kind === 'gun') {
        const shellOk = W.shellByShell && this.reloading && this.ammo[this.cur] > 0;
        if ((W.auto ? this.mouseDown : this.firePressed) && (!this.reloading || shellOk) && (!this.animBusy() || shellOk) && now >= this.readyAt) {
          if (this.ammo[this.cur] > 0) this.fireGun(now);
          else if (this.firePressed || W.auto) { if (this.firePressed) Audio.play('dry', { vol: 0.6 }); this.reload(); }
        }
      } else if (W.kind === 'nade') {
        if (this.firePressed && now >= this.readyAt && !this.animBusy()) this.throwNade(false, now);
      } else if (this.mouseDown && now >= this.readyAt && !this.animBusy()) this.melee('slash', now);
      if (this.throwT && now >= this.throwT) this.releaseNade();
    }
    this.firePressed = false; this.altPressed = false;
    if (this.reloading && L && L.alive) {
      const W = WEAPONS[this.cur];
      if (W.shellByShell) this.tickShells(now);
      else if (now >= this.reloading) { this.reloading = 0; this.ammo[this.cur] = W.mag; this.renderHud(); }
    }
    // recuo volta sozinho depois de parar de atirar
    const since = now - this.lastShot;
    if (since > 90) { const k = Math.exp(-dt * (since > 250 ? 11 : 6)); this.rp *= k; this.ry *= k; }
    this.camKick *= Math.pow(0.002, dt);
    this.stepOff *= Math.exp(-dt * 16); if (Math.abs(this.stepOff) < 1e-4) this.stepOff = 0;
    // remotos: interpolacao com atraso adaptativo (~2 snapshots)
    const delay = clamp((this.snapGap || 33) * 2 + 8, 50, 140), rt = now - delay;
    for (const r of this.remotes.values()) {
      if (r.alive && r.buf.length) {
        const b = r.buf; let i = b.length - 1;
        while (i > 0 && b[i - 1].t > rt) i--;
        const B = b[i], A = b[i - 1] || B, span = B.t - A.t, k = span > 0 ? clamp((rt - A.t) / span, 0, 1.25) : 1;
        r.pos.set(A.x + (B.x - A.x) * k, A.y + (B.y - A.y) * k, A.z + (B.z - A.z) * k);
        let dy = B.yaw - A.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        r.yaw = A.yaw + dy * k; r.pitch = (A.pitch || 0) + ((B.pitch || 0) - (A.pitch || 0)) * clamp(k, 0, 1);
        const hs = Math.hypot(r.vel.x, r.vel.z);
        if (hs > 1.5 && !r.crouch && !r.quiet && Math.abs(r.vel.y) < 1) { r.stepAcc = (r.stepAcc || 0) + hs * dt; if (r.stepAcc > 2.15) { r.stepAcc = 0; if (L && r.pos.distanceTo(L.pos) < 32) Audio.play('step_' + this.surfaceAt(r.pos), { pos: _a.copy(r.pos), ref: 2.5, vol: 0.6 }); } }
      }
      r.update(dt, now);
    }
    this.nadeSys.update(dt, now);
    if (L && now - this.lastSend > 33) {
      this.lastSend = now;
      send({ t: 's', p: [+L.pos.x.toFixed(3), +L.pos.y.toFixed(3), +L.pos.z.toFixed(3)], y: +L.yaw.toFixed(3), pi: +(L.pitch + this.rp).toFixed(3), c: L.crouch ? 1 : 0, w: WEAPON_ORDER.indexOf(this.cur), a: this.adsOn ? 1 : 0, q: L.crouch || this.act('walk') ? 1 : 0 });
    }
    if (L && !L.alive && this.deathAt && q('end').hidden) this.renderDeath(now);
  },
  renderDeath(now) {
    q('death').hidden = false;
    const left = Math.max(0, Math.ceil((this.deathAt + RESPAWN_MS - now) / 1000));
    const key = left + '|' + S.prim + '|' + S.sec;
    if (this.deathKey === key) return; this.deathKey = key;
    q('deathTxt').innerHTML = this.killerSelf ? 'Você se matou' : 'Morto por <span>' + esc(this.killerName) + '</span>' + (this.killerHs ? ' <span style="color:#FF4D4D">(' + (this.killerW === 'knife' ? 'pelas costas' : 'na cabeça') + ')</span>' : '');
    q('deathTxt').style.setProperty('--c', this.killerColor || '#fff');
    const chip = (w, n, on) => '<span class="kbd' + (on ? ' on' : '') + '">' + n + ' ' + WEAPONS[w].name + '</span>';
    q('deathSub').innerHTML = (left > 0 ? 'Volta em ' + left + '…' : 'Voltando…') + '<br><span class="dl">Primária</span>' + PRIMARIES.map((w, i) => chip(w, i + 1, S.prim === w)).join(' ') +
      '<br><span class="dl">Secundária</span>' + SECONDARIES.map((w, i) => chip(w, PRIMARIES.length + i + 1, S.sec === w)).join(' ');
  },
  draw(dt, now, render = true) {
    const L = this.L, cam = this.camera;
    if (L) {
      const target = L.crouch ? EYE_CROUCH : EYE;
      this.eyeH += (target - this.eyeH) * Math.min(1, dt * 16);
      const co = this.vm.camOffset();
      let y = L.pos.y + this.eyeH + this.stepOff + co[1] * 0.02, roll = co[2] * 0.004;
      if (!L.alive && this.deathAt) { const k = clamp((now - this.deathAt) / 700, 0, 1); y = L.pos.y + this.eyeH * (1 - 0.72 * k * k); roll += 0.35 * k; }
      cam.position.set(L.pos.x, y, L.pos.z);
      cam.rotation.set(L.pitch + this.rp + co[0] * 0.006, L.yaw + this.ry, roll);
      const Wd = WEAPONS[this.cur];
      const f = this.scoped ? Wd.scope : this.adsOn && Wd.ads ? S.fov * Wd.ads.fov : S.fov;
      if (Math.abs(cam.fov - f) > 0.01) { cam.fov += (f - cam.fov) * Math.min(1, dt * (this.scoped ? 20 : 16)); if (Math.abs(cam.fov - f) < 0.05) cam.fov = f; cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld();
    }
    const sw = this.sway; const mdx = sw[0], mdy = sw[1]; sw[0] = 0; sw[1] = 0;
    const lat = L ? (L.vel.x * Math.cos(L.yaw) - L.vel.z * Math.sin(L.yaw)) / 6 : 0;
    const alive = !!(L && L.alive);
    this.vm.update({ dt, now, adsOn: this.adsOn && alive, speed: L ? Math.hypot(L.vel.x, L.vel.z) : 0, strafe: lat, grounded: L ? L.grounded : true, crouch: L ? L.crouch : false, swayK: S.sway ?? 0.5,
      mdx: mdx / Math.max(dt, 0.008) * 0.016, mdy: mdy / Math.max(dt, 0.008) * 0.016, hidden: !alive || (this.scoped && this.vm.ads > 0.92) });
    const vf = VM_FOV + (VM_FOV_ADS - VM_FOV) * this.vm.ads * (WEAPONS[this.cur].scope ? 0 : 1);
    if (Math.abs(this.vmCamera.fov - vf) > 0.01) { this.vmCamera.fov = vf; this.vmCamera.updateProjectionMatrix(); }
    if (this.sunDir && L) {
      if (now > this.shadeT) {
        this.shadeT = now + 90;
        const e = this.eye(); this.shadeTarget = this.wallT(e, this.sunDir, 120) < 119 ? 0.28 : 1;
      }
      this.shadeK += ((this.shadeTarget ?? 1) - this.shadeK) * Math.min(1, dt * 6);
      _q.copy(cam.quaternion).invert();
      this.vmSun.position.copy(this.sunDir).applyQuaternion(_q); this.vmSun.intensity = this.sunI * 0.85 * this.shadeK;
    }
    if (this.flash.visible) { const m = this.vm.muzzle(_c); if (m) this.flash.position.copy(m); this.vmFlashLight.position.copy(this.flash.position); if (now > this.muzzleT) this.flash.visible = false; }
    this.vmFlashLight.intensity = Math.max(0, this.vmFlashLight.intensity - dt * 60);
    if (this.mlight.intensity > 0) this.mlight.intensity = Math.max(0, this.mlight.intensity - dt * 900);
    if (this.rlight.intensity > 0) this.rlight.intensity = Math.max(0, this.rlight.intensity - dt * 900);
    this.W.update ? this.W.update(dt, now / 1000, cam.position) : this.W.updaters.forEach((u) => u(now / 1000));
    const pr = this.pipe.renderer.getPixelRatio();
    this.fx.update(dt, now / 1000, cam, window.innerHeight * pr);
    if (Audio.ctx) { const fw = _a.set(0, 0, -1).applyQuaternion(cam.quaternion), up = _b.set(0, 1, 0).applyQuaternion(cam.quaternion); Audio.setListener(cam.position, fw, up); }
    // HUD de mira
    const scopeVis = this.scoped && this.vm.ads > 0.85;
    q('scope').hidden = !scopeVis;
    const Wc = WEAPONS[this.cur];
    q('xh').hidden = this.scoped || (this.adsOn && this.vm.ads > 0.5) || (Wc.scope && !this.adsOn && false);
    if (S.xh && S.xh.dyn !== false) {
      const px = window.innerHeight / 2 / tanHalf(cam.fov), g = Math.round((S.xh.gap ?? 4) + clamp(this.curSpread() * px * 0.6, 0, 60));
      if (g !== this.xhGap) { this.xhGap = g; q('xh').style.setProperty('--xg', g + 'px'); }
    } else if (this.xhGap !== (S.xh ? S.xh.gap ?? 4 : 4)) { this.xhGap = S.xh ? S.xh.gap ?? 4 : 4; q('xh').style.setProperty('--xg', this.xhGap + 'px'); }
    this.dmgFx = Math.max(0, this.dmgFx - dt * 2.2);
    this.deathFx += ((L && !L.alive && this.deathAt ? 1 : 0) - this.deathFx) * Math.min(1, dt * 3);
    const fx = this.pipe.fx; fx.dmg = this.dmgFx; fx.death = this.deathFx; fx.scope = scopeVis ? 1 : 0; fx.flash = this.nadeSys.flash;
    this.pipe.vmVisible = alive && !scopeVis;
    if (render) this.pipe.render(dt, now / 1000);
    this.fpsN++;
    if (now - this.fpsT > 500) { if (S.fps) q('fps').textContent = Math.round(this.fpsN * 1000 / (now - this.fpsT)) + ' fps'; this.fpsN = 0; this.fpsT = now; }
  },
  renderHud() {
    if (!this.running) return;
    const L = this.L, hp = L ? Math.max(0, Math.round(L.hp)) : 0;
    q('hp').textContent = hp; q('hp').classList.toggle('low', hp <= 30); q('hpbar').firstElementChild.style.width = hp + '%';
    const W = WEAPONS[this.cur];
    q('ammo').innerHTML = '<span class="wn">' + (this.cur === 'knife' ? KNIFE_NAMES[S.knife].toUpperCase() : W.name.toUpperCase()) + '</span>' +
      (W.kind === 'gun' ? (this.reloading && !W.shellByShell ? '<span class="rl">recarregando</span>' : this.ammo[this.cur] + ' <small>/ ' + W.mag + '</small>' + (this.reloading ? '<span class="rl">recarregando</span>' : '')) : W.kind === 'nade' ? this.nades + ' <small>granada</small>' : '<small>-</small>');
    q('slots').innerHTML = this.kit.map((w, i) => '<span class="' + (w === this.cur ? 'on' : '') + (w === 'nade' && this.nades <= 0 ? ' off' : '') + '">' + (i + 1) + ' ' + (w === 'knife' ? 'FACA' : (WEAPONS[w].short || WEAPONS[w].name).toUpperCase()) + (w === 'nade' ? ' ×' + this.nades : '') + '</span>').join('');
    const c = Net.cfg, t = Net.tm, mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
    q('mode').innerHTML = (c.mode === 'tdm' ? 'TIME CONTRA TIME' : 'FREE FOR ALL') + ' · ' + c.kills + ' KILLS · ' + esc(MAPS[c.map].name).toUpperCase() + '<b>' + mm + ':' + ss + '</b>';
    const list = [...Net.roster].filter((p) => p.online).sort((a, b) => b.k - a.k || a.d - b.d);
    const row = (p) => '<tr class="' + (p.id === Net.me ? 'me' : '') + (p.alive ? '' : ' dead') + '"><td class="n"><span class="sw" style="background:' + p.color + '"></span>' + esc(p.name) + '</td><td class="r">' + p.k + '</td><td class="r" style="color:#8A93A6">' + p.d + '</td></tr>';
    let h = '<div class="h"><span>' + (c.mode === 'tdm' ? 'TDM' : 'FFA') + '</span><span>K &nbsp;D</span></div>';
    if (c.mode === 'tdm') {
      let a = 0, b = 0;
      for (const p of Net.roster) p.team === 'a' ? (a += p.k) : (b += p.k);
      h += '<div class="teams"><span style="color:' + TEAM_COLORS.a + '">' + a + '</span><span style="color:#5A6275">·</span><span style="color:' + TEAM_COLORS.b + '">' + b + '</span></div>';
      h += '<table>' + list.filter((p) => p.team === 'a').map(row).join('') + '<tr><td colspan="3" style="height:4px"></td></tr>' + list.filter((p) => p.team === 'b').map(row).join('') + '</table>';
    } else h += '<table>' + list.map(row).join('') + '</table>';
    q('sb').innerHTML = h;
  },
};

// ------------------------------------------------------------------ grade espacial das caixas de colisao (celulas de 2 m)
function makeGrid(boxes, cell = 2) {
  const map = new Map();
  boxes.forEach((b) => {
    for (let x = Math.floor(b.minx / cell); x <= Math.floor(b.maxx / cell); x++)
      for (let z = Math.floor(b.minz / cell); z <= Math.floor(b.maxz / cell); z++) {
        const k = x * 4096 + z; let l = map.get(k); if (!l) map.set(k, (l = [])); l.push(b);
      }
  });
  return { map, cell, out: { a: new Array(256), n: 0 }, stamp: 1 };
}
const EMPTY = { a: [], n: 0 };
function queryGrid(G, x0, x1, z0, z1) {
  if (!G) return EMPTY;
  const o = G.out; o.n = 0;
  const c = G.cell, st = ++G.stamp;
  for (let x = Math.floor(x0 / c); x <= Math.floor(x1 / c); x++)
    for (let z = Math.floor(z0 / c); z <= Math.floor(z1 / c); z++) {
      const l = G.map.get(x * 4096 + z); if (!l) continue;
      for (const b of l) if (b._st !== st) { b._st = st; if (o.n < o.a.length) o.a[o.n++] = b; }
    }
  return o;
}

hooks.applyRender = () => Game.applyRender(false);
hooks.rebuildKnife = () => Game.rebuildKnife();
if (DBG) {
  // ganchos de teste (so com ?dbg=1)
  window.__fragDbg = {
    capture() { Game.draw(0, performance.now(), true); return Game.pipe.renderer.domElement.toDataURL('image/jpeg', 0.9); },
    clipAt(f) { const c = Game.vm.clip; if (c) { c.t0 = performance.now() - f * c.dur; c.fired = new Set(); } },
    settle(n = 40) { for (let i = 0; i < n; i++) Game.draw(0.016, performance.now(), false); },
    step(n = 1, dt = 1 / 60) { let t = performance.now(); for (let i = 0; i < n; i++) { t += dt * 1000; Game.simulate(dt, t); } },
  };
}
