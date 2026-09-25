// FRAG - efeitos: particulas na GPU (faiscas, fumaca, poeira, sangue), tracantes que viajam, marcas de tiro,
// lascas que quicam, chuva, poeira no ar e vapor.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TONE = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';

// ------------------------------------------------------------------ pool de particulas (THREE.Points)
class Pool {
  constructor(n, additive) {
    this.n = n; this.count = 0; this.add = additive;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n); this.drag = new Float32Array(n); this.grav = new Float32Array(n); this.rgb = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aSize', this.aSize);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.u = { uScale: { value: 500 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute vec4 aCol; attribute float aSize; varying vec4 vCol; uniform float uScale;\nvoid main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(256.0, aSize * uScale / max(0.05, -mv.z)); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 vCol;\nvoid main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c); float a = 1.0 - smoothstep(' + (additive ? '0.1, 0.5' : '0.2, 0.5') + ', r); if (a <= 0.004) discard; gl_FragColor = vec4(vCol.rgb, vCol.a * a);' + TONE + '}',
    });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.userData.noAO = true; this.pts.renderOrder = 6;
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag = 0, grav = 0) {
    if (this.count >= this.n) return;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a; this.drag[i] = drag; this.grav[i] = grav;
    this.rgb[i * 3] = r; this.rgb[i * 3 + 1] = g; this.rgb[i * 3 + 2] = b;
  }
  kill(i) {
    const j = --this.count; if (i === j) return;
    const c3 = (A) => { A[i * 3] = A[j * 3]; A[i * 3 + 1] = A[j * 3 + 1]; A[i * 3 + 2] = A[j * 3 + 2]; };
    c3(this.pos); c3(this.vel); c3(this.rgb);
    for (const A of [this.life, this.max, this.s0, this.s1, this.a0, this.drag, this.grav]) A[i] = A[j];
  }
  update(dt) {
    for (let i = this.count - 1; i >= 0; i--) { this.life[i] -= dt; if (this.life[i] <= 0) this.kill(i); }
    for (let i = 0; i < this.count; i++) {
      const k = i * 3, d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= d; this.vel[k + 1] = this.vel[k + 1] * d - this.grav[i] * dt; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.01 && this.grav[i] > 0) { this.pos[k + 1] = 0.01; this.vel[k + 1] *= -0.3; this.vel[k] *= 0.6; this.vel[k + 2] *= 0.6; }
      const t = 1 - this.life[i] / this.max[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const a = this.add ? Math.pow(1 - t, 1.4) : Math.min(1, t * 6) * (1 - t);
      this.col[i * 4] = this.rgb[k]; this.col[i * 4 + 1] = this.rgb[k + 1]; this.col[i * 4 + 2] = this.rgb[k + 2]; this.col[i * 4 + 3] = this.a0[i] * a;
    }
    this.pts.geometry.setDrawRange(0, this.count);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
}

function holeTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(8,6,5,1)'); gr.addColorStop(0.22, 'rgba(18,15,12,.95)'); gr.addColorStop(0.42, 'rgba(60,54,48,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(20,16,12,.5)'; g.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28, l = 12 + Math.random() * 16; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * l, 32 + Math.sin(a) * l); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const IMPACT = {
  concrete: { dust: [0.62, 0.6, 0.56], deb: '#8a8680', sparks: 3, size: 0.1 },
  sand: { dust: [0.78, 0.64, 0.44], deb: '#c9a26a', sparks: 0, size: 0.13 },
  metal: { dust: [0.4, 0.4, 0.42], deb: '#555960', sparks: 12, size: 0.07 },
  wood: { dust: [0.52, 0.4, 0.28], deb: '#7a5634', sparks: 0, size: 0.09 },
  glass: { dust: [0.8, 0.88, 0.95], deb: '#bfe0f0', sparks: 5, size: 0.08 },
  snow: { dust: [0.92, 0.94, 0.98], deb: '#eef2f8', sparks: 0, size: 0.14 },
};

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _c = new THREE.Color();

export class FX {
  constructor(scene) {
    this.scene = scene; this.k = 1;
    this.add = new Pool(1600, true); this.alpha = new Pool(1400, false);
    scene.add(this.add.pts, this.alpha.pts);
    // tracantes
    this.tracers = [];
    const tg = new THREE.BoxGeometry(1, 1, 1); tg.translate(0, 0, -0.5);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.6, 1.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false; m.userData.noAO = true; scene.add(m);
      this.tracers.push({ m, a: new THREE.Vector3(), b: new THREE.Vector3(), t0: 0, dur: 0, len: 4, w: 0.012 });
    }
    this.ti = 0;
    // marcas de tiro
    const dm = new THREE.MeshStandardMaterial({ map: holeTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.9 });
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dm, 180);
    this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _m.makeScale(0, 0, 0); for (let i = 0; i < 180; i++) { this.decals.setMatrixAt(i, _m); this.decals.setColorAt(i, _c.set(1, 1, 1)); }
    this.decals.frustumCulled = false; this.decals.userData.noAO = true; this.decals.receiveShadow = true; this.di = 0;
    scene.add(this.decals);
    // lascas
    this.deb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }), 96);
    this.deb.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.deb.frustumCulled = false; this.deb.castShadow = false; this.deb.userData.noAO = true;
    for (let i = 0; i < 96; i++) { this.deb.setMatrixAt(i, _m); this.deb.setColorAt(i, _c.set(1, 1, 1)); }
    this.debs = []; this.dbi = 0; scene.add(this.deb);
    this.amb = []; this.vents = []; this.rainOn = false; this.ventT = 0; this.splashT = 0;
  }
  setQuality(Q) { this.k = Q.fx; }
  // ---------------------------------------------------------------- ambiente do mapa
  setWorld(W, key) {
    for (const o of this.amb) { this.scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
    this.amb = []; this.vents = (W.emitters || []).filter((e) => e.kind === 'steam').map((e) => e.p);
    const kind = (W.map.atmo && W.map.atmo.particles) || 'dust';
    this.rainOn = kind === 'rain';
    if (kind === 'rain') this.amb.push(this.makeRain(Math.round(2600 * this.k)));
    else if (kind === 'snow') this.amb.push(this.makeSnow(Math.round(2200 * Math.max(0.4, this.k))));
    else this.amb.push(this.makeMotes(Math.round(260 * this.k), key === 'patio' || key === 'vila' ? [1.0, 0.86, 0.62] : [1, 1, 0.95]));
    for (const o of this.amb) this.scene.add(o);
  }
  makeRain(n) {
    const g = new THREE.BufferGeometry(), off = new Float32Array(n * 2 * 3), end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const x = Math.random(), y = Math.random(), z = Math.random(); for (let e = 0; e < 2; e++) { off.set([x, y, z], (i * 2 + e) * 3); end[i * 2 + e] = e; } }
    g.setAttribute('position', new THREE.BufferAttribute(off, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aEnd; uniform float uTime; uniform vec3 uCam; varying float vA;
        void main(){ vec3 box = vec3(36.0, 22.0, 36.0); vec3 p = position * box;
          p.y = mod(p.y - uTime * 17.0, box.y);
          vec3 w = vec3(uCam.x + mod(p.x - uCam.x + box.x * 0.5, box.x) - box.x * 0.5, p.y, uCam.z + mod(p.z - uCam.z + box.z * 0.5, box.z) - box.z * 0.5);
          w += aEnd * vec3(0.05, -0.55, 0.02);
          vA = (1.0 - aEnd * 0.7);
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(vec3(0.55, 0.62, 0.8) * vA * 0.55, 1.0);' + TONE + '}',
    });
    const l = new THREE.LineSegments(g, m); l.frustumCulled = false; l.userData.noAO = true; l.userData.u = m.uniforms;
    return l;
  }
  // neve caindo com vento (flocos em pontos, caixa que segue a camera)
  makeSnow(n) {
    const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) p[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uScale: { value: 500 } }, transparent: true, depthWrite: false,
      vertexShader: `uniform float uTime, uScale; uniform vec3 uCam; varying float vA;
        void main(){ vec3 box = vec3(40.0, 20.0, 40.0); vec3 p = position * box;
          p.y = mod(p.y - uTime * (1.2 + position.x * 0.8), box.y);
          p.x += uTime * 2.6 + sin(uTime * 0.9 + position.z * 30.0) * 0.8; p.z += sin(uTime * 0.7 + position.x * 25.0) * 0.6 + uTime * 0.8;
          vec3 w = vec3(uCam.x + mod(p.x - uCam.x + box.x * 0.5, box.x) - box.x * 0.5, p.y, uCam.z + mod(p.z - uCam.z + box.z * 0.5, box.z) - box.z * 0.5);
          vec4 mv = viewMatrix * vec4(w, 1.0); vA = smoothstep(26.0, 6.0, -mv.z) * smoothstep(0.1, 0.8, -mv.z);
          gl_PointSize = (0.035 + position.y * 0.03) * uScale / max(0.3, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); float a = (1.0 - smoothstep(0.2, 0.5, r)) * vA * 0.85; if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.95, 0.97, 1.0), a);' + TONE + '}',
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.userData.noAO = true; pts.userData.u = m.uniforms;
    return pts;
  }
  // explosao de granada: clarao, bola de fogo, fumaca, faiscas, estilhacos e marca no chao
  explosion(p) {
    const k = Math.max(0.5, this.k);
    for (let i = 0; i < 40 * k; i++) {
      const a = Math.random() * 6.28, e = Math.random() * 1.2, s = 3 + Math.random() * 9;
      this.add.spawn(p.x, p.y + 0.2, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 2, Math.sin(a) * Math.cos(e) * s, 0.12 + Math.random() * 0.25, 0.3 + Math.random() * 0.4, 1.2 + Math.random() * 0.8, 6, 2.6 + Math.random(), 0.7, 1, 3, 1);
    }
    for (let i = 0; i < 60 * k; i++) {
      const a = Math.random() * 6.28, e = Math.random() * 1.4, s = 8 + Math.random() * 14;
      this.add.spawn(p.x, p.y + 0.15, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s, 0.3 + Math.random() * 0.6, 0.03, 0.015, 5, 3, 1.2, 1, 1.2, 9);
    }
    for (let i = 0; i < 26 * k; i++) {
      const a = Math.random() * 6.28, s = 0.8 + Math.random() * 2.6;
      this.alpha.spawn(p.x + (Math.random() - 0.5) * 0.8, p.y + 0.3 + Math.random() * 0.6, p.z + (Math.random() - 0.5) * 0.8, Math.cos(a) * s, 0.8 + Math.random() * 2.2, Math.sin(a) * s,
        2.5 + Math.random() * 2.5, 0.8, 3.4 + Math.random() * 1.6, 0.16, 0.15, 0.14, 0.55, 1.1, -0.25);
    }
    for (let i = 0; i < 16 * k; i++) this.chunk(p, (Math.random() - 0.5) * 2, 0.6 + Math.random(), (Math.random() - 0.5) * 2, '#3a3834', 0.03);
    // marca de queimado no chao
    const i = this.di++ % 180;
    _q.setFromUnitVectors(_z, _v.set(0, 1, 0)); _q2.setFromAxisAngle(_z, Math.random() * 6.28); _q.multiply(_q2);
    _m.compose(_v.set(p.x, Math.max(0.006, p.y - 0.06), p.z), _q, _s.set(2.6, 2.6, 2.6));
    this.decals.setMatrixAt(i, _m); this.decals.setColorAt(i, _c.set('#555')); this.decals.instanceMatrix.needsUpdate = true; this.decals.instanceColor.needsUpdate = true;
  }
  makeMotes(n, rgb) {
    const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) p[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uCol: { value: new THREE.Vector3(...rgb) }, uScale: { value: 500 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime, uScale; uniform vec3 uCam; varying float vA;
        void main(){ vec3 box = vec3(24.0, 7.0, 24.0); vec3 p = position * box + vec3(sin(uTime * 0.13 + position.y * 40.0), sin(uTime * 0.21 + position.x * 30.0) * 0.4, cos(uTime * 0.11 + position.z * 50.0)) * 1.3;
          vec3 w = uCam + mod(p - uCam, box) - box * 0.5; w.y = mod(p.y, box.y) + 0.2;
          vec4 mv = viewMatrix * vec4(w, 1.0); vA = (0.5 + 0.5 * sin(uTime * 1.7 + position.x * 90.0)) * smoothstep(12.0, 3.0, -mv.z);
          gl_PointSize = 0.018 * uScale / max(0.2, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uCol * vA * 0.5 * (1.0 - smoothstep(0.1, 0.5, r)), 1.0);' + TONE + '}',
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.userData.noAO = true; pts.userData.u = m.uniforms;
    return pts;
  }
  // ---------------------------------------------------------------- disparos
  tracer(a, b, kind) {
    const T = this.tracers[this.ti++ % this.tracers.length];
    T.a.copy(a); T.b.copy(b); T.t0 = performance.now();
    const d = a.distanceTo(b);
    const heavy = kind === 'sniper' || kind === 'dmr';
    T.dur = clamp(d / (heavy ? 700 : kind === 'shotgun' ? 300 : 420), 0.03, 0.3) * 1000;
    T.len = Math.min(d, heavy ? 9 : kind === 'shotgun' ? 2.5 : 5); T.w = heavy ? 0.02 : kind === 'shotgun' ? 0.008 : 0.012;
    T.m.material.color.setRGB(5, kind === 'sniper' ? 4.2 : 3.4, kind === 'sniper' ? 3 : 1.6);
    T.m.visible = true;
  }
  muzzleSmoke(p, dir, kind) {
    const big = kind === 'sniper' || kind === 'shotgun';
    const n = Math.round((big ? 7 : 3) * this.k);
    for (let i = 0; i < n; i++) {
      const s = 0.4 + Math.random() * 0.8;
      this.alpha.spawn(p.x, p.y, p.z, dir.x * s + (Math.random() - 0.5) * 0.3, dir.y * s + 0.25, dir.z * s + (Math.random() - 0.5) * 0.3, 0.7 + Math.random() * 0.6, 0.05, big ? 0.6 : 0.35, 0.7, 0.7, 0.7, 0.22, 1.6, -0.15);
    }
    for (let i = 0; i < 4 * this.k; i++) this.add.spawn(p.x, p.y, p.z, dir.x * 6 + (Math.random() - 0.5) * 2, dir.y * 6 + (Math.random() - 0.5) * 2, dir.z * 6 + (Math.random() - 0.5) * 2, 0.08 + Math.random() * 0.06, 0.02, 0.01, 4, 2.6, 1.1, 1, 3, 2);
  }
  impact(p, n, kind) {
    const I = IMPACT[kind] || IMPACT.concrete, k = this.k;
    const nx = n ? n.x : 0, ny = n ? n.y : 1, nz = n ? n.z : 0;
    for (let i = 0; i < I.sparks * k; i++) {
      const s = 3 + Math.random() * 5;
      this.add.spawn(p.x, p.y, p.z, (nx + (Math.random() - 0.5) * 1.6) * s, (ny + Math.random() * 0.9) * s, (nz + (Math.random() - 0.5) * 1.6) * s, 0.15 + Math.random() * 0.25, 0.025, 0.012, 5, kind === 'glass' ? 5 : 3.2, kind === 'glass' ? 5.5 : 1.3, 1, 1.5, 9);
    }
    const nd = Math.round((kind === 'metal' ? 3 : 7) * k);
    for (let i = 0; i < nd; i++) {
      const s = 0.4 + Math.random() * (kind === 'sand' ? 2.4 : 1.2);
      this.alpha.spawn(p.x + nx * 0.05, p.y + ny * 0.05, p.z + nz * 0.05, (nx + (Math.random() - 0.5)) * s, (ny + Math.random() * 0.6) * s + 0.2, (nz + (Math.random() - 0.5)) * s,
        0.5 + Math.random() * 0.9, I.size, I.size * 5, I.dust[0], I.dust[1], I.dust[2], kind === 'sand' ? 0.5 : 0.38, 2.2, kind === 'sand' ? 2.5 : 0.2);
    }
    const nb = Math.round((kind === 'wood' ? 6 : kind === 'metal' ? 1 : 4) * k);
    for (let i = 0; i < nb; i++) this.chunk(p, nx, ny, nz, I.deb, kind === 'wood' ? 0.035 : 0.022);
    if (n && kind !== 'sand') this.decal(p, n, kind);
  }
  chunk(p, nx, ny, nz, color, size) {
    const i = this.dbi++ % 96;
    const s = 2 + Math.random() * 3;
    this.debs[i] = { p: p.clone().add(_v.set(nx, ny, nz).multiplyScalar(0.03)), v: new THREE.Vector3((nx + (Math.random() - 0.5) * 1.4) * s, (ny + Math.random()) * s, (nz + (Math.random() - 0.5) * 1.4) * s), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), w: Math.random() * 20, life: 1.2 + Math.random() * 0.6, max: 1.8, s: size * (0.6 + Math.random() * 0.8) };
    this.deb.setColorAt(i, _c.set(color).multiplyScalar(0.8 + Math.random() * 0.4)); this.deb.instanceColor.needsUpdate = true;
  }
  decal(p, n, kind) {
    const i = this.di++ % 180;
    _q.setFromUnitVectors(_z, _v.copy(n).normalize()); _q2.setFromAxisAngle(_z, Math.random() * 6.28); _q.multiply(_q2);
    const s = (kind === 'wood' ? 0.1 : kind === 'metal' ? 0.07 : 0.09) * (0.8 + Math.random() * 0.4);
    _m.compose(_v.copy(p).addScaledVector(n, 0.004), _q, _s.set(s, s, s));
    this.decals.setMatrixAt(i, _m);
    this.decals.setColorAt(i, _c.set(kind === 'metal' ? '#9aa0a8' : kind === 'wood' ? '#d8c0a0' : kind === 'glass' ? '#e8f4ff' : '#ffffff'));
    this.decals.instanceMatrix.needsUpdate = true; this.decals.instanceColor.needsUpdate = true;
  }
  blood(p, dir, head) {
    const n = Math.round((head ? 22 : 12) * this.k);
    for (let i = 0; i < n; i++) {
      const s = 1 + Math.random() * 3;
      this.alpha.spawn(p.x, p.y, p.z, (dir.x + (Math.random() - 0.5) * 0.9) * s, (dir.y + Math.random() * 0.6) * s, (dir.z + (Math.random() - 0.5) * 0.9) * s, 0.25 + Math.random() * 0.35, 0.03, 0.06, 0.45, 0.02, 0.02, 0.9, 1.5, 9);
    }
    for (let i = 0; i < (head ? 6 : 3) * this.k; i++) this.alpha.spawn(p.x, p.y, p.z, dir.x * 0.8, dir.y * 0.8 + 0.2, dir.z * 0.8, 0.5 + Math.random() * 0.4, 0.1, 0.5, 0.38, 0.03, 0.03, 0.35, 2.5, 0.3);
  }
  // ---------------------------------------------------------------- quadro
  update(dt, t, camera, pxHeight) {
    const sc = pxHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.add.u.uScale.value = this.alpha.u.uScale.value = sc;
    for (const o of this.amb) { o.userData.u.uTime.value = t; o.userData.u.uCam.value.copy(camera.position); if (o.userData.u.uScale) o.userData.u.uScale.value = sc; }
    // vapor
    this.ventT += dt;
    if (this.ventT > 0.12) {
      this.ventT = 0;
      for (const v of this.vents) for (let i = 0; i < Math.max(1, 2 * this.k); i++)
        this.alpha.spawn(v.x + (Math.random() - 0.5) * 0.8, 0.05, v.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3, 2.2 + Math.random(), 0.3, 1.9, 0.55, 0.52, 0.66, 0.13, 0.4, -0.05);
    }
    // respingos de chuva perto da camera
    if (this.rainOn) {
      this.splashT += dt * 70 * this.k;
      while (this.splashT > 1) {
        this.splashT--;
        const a = Math.random() * 6.28, r = 1 + Math.random() * 14;
        this.add.spawn(camera.position.x + Math.cos(a) * r, 0.02, camera.position.z + Math.sin(a) * r, 0, 0.6, 0, 0.12, 0.02, 0.05, 0.6, 0.7, 0.9, 0.7, 0, 4);
      }
    }
    this.add.update(dt); this.alpha.update(dt);
    // tracantes
    const now = performance.now();
    for (const T of this.tracers) {
      if (!T.m.visible) continue;
      const f = (now - T.t0) / T.dur;
      if (f >= 1) { T.m.visible = false; continue; }
      const d = T.a.distanceTo(T.b), head = Math.min(d, f * (d + T.len)), tail = Math.max(0, head - T.len);
      _v.copy(T.b).sub(T.a).normalize();
      T.m.position.copy(T.a).addScaledVector(_v, head);
      T.m.lookAt(_s.copy(T.a).addScaledVector(_v, tail));
      T.m.rotateY(Math.PI);
      T.m.scale.set(T.w, T.w, Math.max(0.01, head - tail));
      T.m.material.opacity = 0.9 * (1 - f * 0.4);
    }
    // lascas
    let any = false;
    for (let i = 0; i < 96; i++) {
      const D = this.debs[i]; if (!D) continue;
      any = true; D.life -= dt;
      if (D.life <= 0) { this.debs[i] = null; _m.makeScale(0, 0, 0); this.deb.setMatrixAt(i, _m); continue; }
      D.v.y -= 9.8 * dt; D.p.addScaledVector(D.v, dt);
      if (D.p.y < 0.01) { D.p.y = 0.01; D.v.y *= -0.35; D.v.x *= 0.5; D.v.z *= 0.5; D.w *= 0.5; }
      D.r.x += D.w * dt; D.r.y += D.w * 0.7 * dt;
      const s = D.s * Math.min(1, D.life / 0.3);
      _q.setFromEuler(D.r); _m.compose(D.p, _q, _s.set(s, s * 0.6, s * 1.4));
      this.deb.setMatrixAt(i, _m);
    }
    if (any) this.deb.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.add.count = 0; this.alpha.count = 0;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < 180; i++) this.decals.setMatrixAt(i, _m);
    this.decals.instanceMatrix.needsUpdate = true;
    for (const T of this.tracers) T.m.visible = false;
  }
}
