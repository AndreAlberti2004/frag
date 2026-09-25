// FRAG - granadas. Fisica em passo fixo (1/120 s): mesma trajetoria em todos os computadores a partir do mesmo arremesso.
// Quem jogou decide a explosao e o dano (como o tiro); os outros veem o voo e explodem quando chega o aviso.
import * as THREE from 'three';
import { Net, send, S } from './core.js';
import { WEAPONS } from './weapons.js';
import { buildWeapon } from './models.js';
import { Audio } from './audio.js';

const H = 1 / 120, R = 0.07, GRAV = 17, BOUNCE = 0.42, FRIC = 0.72;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Nades {
  constructor(game) { this.g = game; this.list = []; this.flash = 0; this.pool = []; this.seen = new Set(); }
  clear() { for (const n of this.list) this.release(n); this.list = []; }
  mesh() {
    let m = this.pool.pop();
    if (!m) { m = buildWeapon('nade', { tp: true }); m.scale.setScalar(1.15); m.traverse((o) => { if (o.isMesh) o.castShadow = false; }); }
    this.g.scene.add(m); m.visible = true; return m;
  }
  release(n) { if (n.m) { this.g.scene.remove(n.m); this.pool.push(n.m); n.m = null; } }
  // m = { id, o, v, s }
  spawn(m, mine) {
    const key = m.id + ':' + m.s;
    if (this.seen.has(key)) return; // o eco do proprio arremesso
    this.seen.add(key); if (this.seen.size > 200) this.seen.clear();
    const n = { id: m.id, s: m.s, p: new THREE.Vector3(...m.o), v: new THREE.Vector3(...m.v), t0: performance.now(), acc: 0, mine: m.id === Net.me, rest: false, spin: new THREE.Vector3(9, 4, 6), m: this.mesh() };
    n.m.position.copy(n.p);
    this.list.push(n);
  }
  // colisao do ponto (esfera pequena) contra as caixas
  hit(p) {
    const G = this.g, l = G.near(p.x - R, p.x + R, p.z - R, p.z + R);
    for (let i = 0; i < l.n; i++) { const b = l.a[i]; if (p.x + R > b.minx && p.x - R < b.maxx && p.y + R > b.miny && p.y - R < b.maxy && p.z + R > b.minz && p.z - R < b.maxz) return b; }
    return null;
  }
  stepOne(n) {
    const v = n.v, p = n.p, lim = this.g.map.size / 2 - R;
    if (n.rest) return;
    v.y -= GRAV * H;
    let bounced = 0;
    for (const ax of ['x', 'y', 'z']) {
      const old = p[ax]; p[ax] += v[ax] * H;
      const out = ax !== 'y' && Math.abs(p[ax]) > lim;
      if (this.hit(p) || out || (ax === 'y' && p.y < R)) {
        p[ax] = ax === 'y' && p.y < R && !this.hit(p) ? R : old;
        bounced = Math.max(bounced, Math.abs(v[ax]));
        v[ax] *= -BOUNCE;
        for (const o of ['x', 'y', 'z']) if (o !== ax) v[o] *= FRIC;
      }
    }
    if (bounced > 1.6) Audio.play('nadebounce', { pos: p, ref: 2, vol: Math.min(1, bounced / 8) });
    if (v.lengthSq() < 0.05 && (p.y <= R + 0.001 || this.hit(_v.copy(p).setY(p.y - 0.02)))) { n.rest = true; v.set(0, 0, 0); }
  }
  update(dt, now) {
    this.flash = Math.max(0, this.flash - dt * 3);
    const fuse = WEAPONS.nade.fuse;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      n.acc += dt;
      while (n.acc >= H) { n.acc -= H; this.stepOne(n); }
      if (n.m) {
        n.m.position.copy(n.p);
        if (!n.rest) { n.m.rotation.x += n.spin.x * dt; n.m.rotation.y += n.spin.y * dt; n.m.rotation.z += n.spin.z * dt; n.spin.multiplyScalar(Math.pow(0.6, dt)); }
      }
      const age = now - n.t0;
      if (n.mine && age >= fuse) { this.detonate(n); this.list.splice(i, 1); }
      else if (!n.mine && age > fuse + 1600) { this.release(n); this.list.splice(i, 1); }
    }
  }
  // quem jogou: calcula o dano e avisa todo mundo
  detonate(n) {
    const G = this.g, N = WEAPONS.nade, p = n.p.clone(); p.y = Math.max(p.y, 0.08);
    const hits = [];
    const me = G.L;
    const check = (id, pos, crouch, self) => {
      const c = _w.set(pos.x, pos.y + (crouch ? 0.6 : 0.9), pos.z), d = c.distanceTo(p);
      if (d > N.radius) return;
      // precisa de linha livre ate o tronco ou a cabeca
      const o = _v.copy(p); o.y += 0.1;
      const free = (tgt) => { const dir = tgt.clone().sub(o), L = dir.length(); dir.normalize(); return G.wallT(o, dir, L) >= L - 0.05; };
      const head = new THREE.Vector3(pos.x, pos.y + (crouch ? 1.0 : 1.55), pos.z);
      if (!free(c.clone()) && !free(head)) return;
      let dmg = N.dmg * Math.pow(1 - d / N.radius, 1.15) + (d < 1.2 ? 12 : 0);
      if (self) dmg *= 0.5;
      if (dmg >= 1) hits.push([id, Math.round(dmg)]);
    };
    for (const r of G.remotes.values()) if (r.alive && r.root.visible && !(Net.cfg.mode === 'tdm' && r.team === ((Net.roster.find((x) => x.id === Net.me) || {}).team))) check(r.id, r.pos, r.crouch, false);
    if (me && me.alive) check(Net.me, me.pos, me.crouch, true);
    send({ t: 'boom', s: n.s, p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], hits });
    this.explodeFx(p);
    this.release(n);
  }
  // aviso do anfitriao (todo mundo recebe; o dono ja explodiu)
  boom(m) {
    if (m.id === Net.me) return;
    const i = this.list.findIndex((n) => n.id === m.id && n.s === m.s);
    if (i >= 0) { this.release(this.list[i]); this.list.splice(i, 1); }
    this.explodeFx(new THREE.Vector3(...m.p));
  }
  explodeFx(p) {
    const G = this.g;
    G.fx.explosion(p);
    G.rlight.position.copy(p).setY(p.y + 0.6); G.rlight.intensity = 260;
    const d = G.L ? G.L.pos.distanceTo(p) : 30;
    Audio.play('explode', { pos: p, ref: 6, vol: 1, send: 0.6, lp: d > 25 ? 3000 : 20000 });
    if (d < 14) { G.vm.camK.kick(0, (14 - d) * 0.35); G.vm.camK.kick(2, (Math.random() - 0.5) * (14 - d) * 0.5); G.vm.camK.kick(1, -(14 - d) * 0.1); }
    if (d < 6 && S) this.flash = Math.max(this.flash, (6 - d) / 6 * 0.35);
  }
}
