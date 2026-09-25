// FRAG - monta o mundo de um mapa: atmosfera, chao, objetos por caixa de colisao, cenario distante,
// oclusao ambiente assada, superficies reflexivas e luzes. Q = preset de qualidade (render.js).
import * as THREE from 'three';
import { box, bx, bc, prim, tint, Batch, makeGrid } from './geo.js';
import { pbrMaterial, getTextures, glassMaterial, windowsTex, screenTex, signTex, canvasTex } from './textures.js';
import {
  rng, shade, innerFace, longFaces, faceBox, facePoint, facePlane, faceYaw, edgeBeams, beam, aabbOf, makeSky,
  frondTex, leafTex, bannerTex, artTex, waveMaterial, TAU,
} from './world.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const EPS = [0, 0.003, 0.006];

export function buildWorld(map, Q) {
  const a = map.atmo;
  const group = new THREE.Group();
  const batch = new Batch();
  const R = Q.tex, A = Q.aniso, seg = Q.seg;
  const M = (kind, color, opts) => pbrMaterial(kind, color, R, A, opts);
  const T = (m) => ({ tile: m.userData.tile || 2, seg });
  const boxes = map.boxes.map((b) => ({ ...aabbOf(b), glass: b.c === 'glass', c: b.c, r: b.r, surf: (map.surfaces || {})[b.c] || 'concrete', imp: (map.impacts || {})[b.c] || 'concrete' }));
  const W = {
    map, Q, group, boxes, updaters: [], lights: [], emitters: [], reflect: null, probe: V(0, 2, 14), pools: [], mats: [],
    time: 0, sun: null, hemi: null, sky: null,
  };
  const ctx = {
    map, Q, M, T, batch, group, W, rnd: rng(1234 + map.key.length * 77),
    add(mat, geo, owner = -1, o = {}) { batch.add(mat, geo, { owner, cast: o.cast !== false, ao: o.ao !== false }); },
    step: (b) => stepInfo(map.boxes, b),
  };

  // ---------------- atmosfera
  const sky = makeSky(a); group.add(sky.mesh); W.sky = sky;
  W.updaters.push((t) => { sky.u.time.value = t; });
  const hemi = new THREE.HemisphereLight(a.hemi[0], a.hemi[1], a.hemi[2]); group.add(hemi); W.hemi = hemi;
  const sunDir = V(...a.sun[2]).normalize();
  const sun = new THREE.DirectionalLight(a.sun[0], a.sun[1]);
  sun.position.copy(sunDir).multiplyScalar(60); sun.target.position.set(0, 0, 0);
  sun.castShadow = Q.shadows > 0;
  if (Q.shadows) {
    sun.shadow.mapSize.set(Q.shadows, Q.shadows);
    const c = sun.shadow.camera, ext = map.size * 0.72; c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext; c.near = 1; c.far = 160; c.updateProjectionMatrix();
    sun.shadow.bias = -0.00025; sun.shadow.normalBias = Q.shadows >= 4096 ? 0.02 : 0.035; sun.shadow.radius = Q.shadowRadius || 1;
  }
  group.add(sun, sun.target); W.sun = sun;

  // ---------------- chao
  const gm = M(map.ground.tex, map.ground.color);
  const half = map.size / 2 + 1;
  ctx.add(gm, bx(-half, -0.2, -half, half, 0, half, { skip: new Set([0, 1, 3, 4, 5]), tile: gm.userData.tile, seg: Math.max(seg, 0.5) }), -1, { cast: false });
  W.groundMat = gm;

  // ---------------- caixas
  const B = BUILD[map.key];
  map.boxes.forEach((b, i) => {
    if (B.box && B.box(ctx, b, i)) return;
    const st = map.styles[b.c]; const m = M(st.tex, st.color); const e = EPS[i % 3];
    ctx.add(m, bc(b.x, b.y - e, b.z, b.w + 2 * e, b.h + 2 * e, b.d + 2 * e, T(m)), i);
  });
  if (B.props) B.props(ctx);
  if (map.snowCaps && B.snow) B.snow(ctx);

  // ---------------- AO assada e lotes
  const G = makeGrid(boxes, 3);
  batch.bake(G, { radius: 1.3, strength: 0.72 });
  W.meshes = batch.build(group);
  for (const f of W.mats) if (f.userData.time) W.updaters.push((t) => { f.userData.time.value = t; });
  return W;
}

// degrau: para que lado sobe (procura o vizinho mais alto) -> vetor unitario no chao
function stepInfo(all, b) {
  let dx = 0, dz = 0;
  for (const o of all) {
    if (o.r !== 'step' || o === b) continue;
    const ddx = o.x - b.x, ddz = o.z - b.z;
    if (Math.abs(Math.hypot(ddx, ddz) - 0.5) > 0.02 || Math.abs(o.w - b.w) > 0.01 || Math.abs(o.d - b.d) > 0.01) continue;
    const s = o.h > b.h ? 1 : -1; dx = Math.sign(ddx) * s; dz = Math.sign(ddz) * s; break;
  }
  return { dx, dz };
}
// frisos de degrau: filete no bocel (face do espelho, oposta ao sentido de subida)
function nosing(ctx, b, i, mat, t = 0.05, over = 0.015) {
  const { dx, dz } = ctx.step(b);
  const top = b.y + b.h, x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
  if (dz) {
    const zf = dz > 0 ? z0 : z1, zo = zf - dz * over, zi = zf + dz * 0.06;
    ctx.add(mat, bx(x0 + 0.02, top - t, Math.min(zo, zi), x1 - 0.02, top + 0.002, Math.max(zo, zi), { tile: 1 }), i, { ao: false });
  } else if (dx) {
    const xf = dx > 0 ? x0 : x1, xo = xf - dx * over, xi = xf + dx * 0.06;
    ctx.add(mat, bx(Math.min(xo, xi), top - t, z0 + 0.02, Math.max(xo, xi), top + 0.002, z1 - 0.02, { tile: 1 }), i, { ao: false });
  }
}

// ======================================================================== PATIO
const PATIO = {
  box(ctx, b, i) {
    const { M, T, add } = ctx; const st = ctx.map.styles[b.c]; const e = EPS[i % 3];
    const body = M(st.tex, st.color);
    const trim = M('plaster', ctx.map.styles.wall.trim), stoneDark = M('stone', '#B59A70');
    if (b.r === 'perim') {
      add(body, bc(b.x, b.y, b.z, b.w, b.h, b.d, T(body)), i);
      const P = innerFace(b), s = 24;
      add(stoneDark, faceBox(P, -s, s, 0, 0.62, 0.1, 0.02, T(stoneDark)), i);                  // soco de pedra
      add(trim, faceBox(P, -s, s, 7.35, 7.5, 0.1, 0.02, T(trim)), i);                         // friso
      add(trim, faceBox(P, -s, s, 7.5, 7.78, 0.16, 0.02, T(trim)), i);                        // cornija
      for (let a0 = -21; a0 <= 21; a0 += 6) add(trim, faceBox(P, a0 - 0.36, a0 + 0.36, 0.62, 7.35, 0.1, 0.02, T(trim)), i); // pilastras
      // ameias sobre o muro
      const along = P.axis === 'z' ? 'x' : 'z';
      for (let t = -25; t < 25; t += 1.7) {
        const g = along === 'x' ? bx(t, 8, b.z - b.d / 2, t + 0.95, 8.62, b.z + b.d / 2, T(body)) : bx(b.x - b.w / 2, 8, t, b.x + b.w / 2, 8.62, t + 0.95, T(body));
        add(body, g, i);
      }
      return true;
    }
    if (b.r === 'wall') {
      add(body, bc(b.x, b.y - e, b.z, b.w + 2 * e, b.h + 2 * e, b.d + 2 * e, T(body)), i);
      add(stoneDark, bc(b.x, 0, b.z, b.w + 0.1, 0.4, b.d + 0.1, T(stoneDark)), i);
      add(trim, bc(b.x, b.h - 0.14, b.z, b.w + 0.1, 0.14 + e, b.d + 0.1, T(trim)), i);
      return true;
    }
    if (b.c === 'crate' || b.c === 'crate2') {
      const dark = M('wood', shade(st.color, 0.62)), mn = [b.x - b.w / 2, b.y, b.z - b.d / 2], mx = [b.x + b.w / 2, b.y + b.h, b.z + b.d / 2];
      add(body, bc(b.x, b.y - e, b.z, b.w + 2 * e, b.h + 2 * e, b.d + 2 * e, T(body)), i);
      const t = b.h >= 1.5 ? 0.12 : 0.09;
      for (const g of edgeBeams(mn, mx, t, 0.018, T(dark))) add(dark, g, i, { ao: true });
      if (b.r === 'crate' && b.h >= 1.9) {
        // travessas em X nas quatro faces verticais
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const fx = b.x + nx * (b.w / 2 + 0.012), fz = b.z + nz * (b.d / 2 + 0.012), hw = (nz ? b.w : b.d) / 2 - t;
          const px = nz ? 1 : 0, pz = nx ? 1 : 0;
          add(dark, beam(V(fx - px * hw, b.y + t, fz - pz * hw), V(fx + px * hw, b.y + b.h - t, fz + pz * hw), 0.075), i);
        }
      } else if (b.r === 'rail') {
        return true;
      } else {
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const fx = b.x + nx * (b.w / 2 + 0.01), fz = b.z + nz * (b.d / 2 + 0.01), hw = (nz ? b.w : b.d) / 2 - t;
          add(dark, nz ? bx(fx - hw, b.y + b.h / 2 - 0.04, fz - 0.02, fx + hw, b.y + b.h / 2 + 0.04, fz + 0.02, T(dark)) : bx(fx - 0.02, b.y + b.h / 2 - 0.04, fz - hw, fx + 0.02, b.y + b.h / 2 + 0.04, fz + hw, T(dark)), i);
        }
      }
      return true;
    }
    if (b.r === 'leg') { // coluna de pedra: base, fuste, capitel
      add(body, bc(b.x, b.y, b.z, b.w, b.h, b.d, T(body)), i);
      add(stoneDark, bc(b.x, 0, b.z, b.w + 0.16, 0.32, b.d + 0.16, T(stoneDark)), i);
      add(stoneDark, bc(b.x, 0.32, b.z, b.w + 0.08, 0.08, b.d + 0.08, T(stoneDark)), i);
      add(trim, bc(b.x, b.y + b.h - 0.3, b.z, b.w + 0.14, 0.3, b.d + 0.14, T(trim)), i);
      return true;
    }
    if (b.r === 'slab') {
      add(body, bc(b.x, b.y - e, b.z, b.w + 2 * e, b.h + 2 * e, b.d + 2 * e, T(body)), i);
      add(stoneDark, bc(b.x, b.y - 0.06, b.z, b.w + 0.05, 0.09, b.d + 0.05, T(stoneDark)), i);
      return true;
    }
    if (b.r === 'parapet') {
      add(body, bc(b.x, b.y - e, b.z, b.w + 2 * e, b.h - 0.08, b.d + 2 * e, T(body)), i);
      add(stoneDark, bc(b.x, b.y + b.h - 0.08, b.z, b.w + 0.08, 0.08, b.d + 0.08, T(stoneDark)), i);
      return true;
    }
    if (b.r === 'step') {
      add(body, bc(b.x, b.y - e, b.z, b.w + 2 * e, b.h + 2 * e, b.d + 2 * e, T(body)), i);
      nosing(ctx, b, i, stoneDark, 0.06, 0.012);
      return true;
    }
    return false;
  },
  props(ctx) {
    const { M, T, add, W, rnd, group, Q } = ctx;
    // espelhos d'agua (reflexo planar em y = .035)
    const waterTex = getTextures('water', '#2a5a60', Math.min(512, Q.tex), Q.aniso);
    const nrm = waterTex.normalMap.clone(); nrm.needsUpdate = true; nrm.repeat.set(1.5, 0.5);
    const water = new THREE.MeshStandardMaterial({ color: '#173c43', roughness: 0.05, metalness: 0, normalMap: nrm, normalScale: new THREE.Vector2(0.18, 0.18), envMapIntensity: 1.1 });
    const rim = M('stone', '#CDB58C');
    for (const p of ctx.map.props.filter((x) => x.t === 'pool')) {
      const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2, r = 0.28, h = 0.075;
      add(rim, bx(x0 - r, 0, z0 - r, x1 + r, h, z0, T(rim)), -1); add(rim, bx(x0 - r, 0, z1, x1 + r, h, z1 + r, T(rim)), -1);
      add(rim, bx(x0 - r, 0, z0, x0, h, z1, T(rim)), -1); add(rim, bx(x1, 0, z0, x1 + r, h, z1, T(rim)), -1);
      const wm = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), water);
      wm.rotation.x = -Math.PI / 2; wm.position.set(p.x, 0.035, p.z); wm.receiveShadow = true; group.add(wm);
      W.pools.push({ x0, x1, z0, z1 });
    }
    W.updaters.push((t) => { nrm.offset.set(t * 0.02, t * 0.013); });
    W.reflect = { y: 0.035, entries: [{ mat: water, strength: 1 }], only: true };
    W.probe = V(0, 2.2, 14.5);
    // praca central com lajotas e faixa
    const pl = ctx.map.props.find((x) => x.t === 'plaza');
    const paving = M('stone', '#DCC9A4', { po: 1 }); paving.polygonOffset = true; paving.polygonOffsetFactor = -2; paving.polygonOffsetUnits = -2;
    const band = M('sandstone', '#B98B55', { po: 1 }); band.polygonOffset = true; band.polygonOffsetFactor = -2; band.polygonOffsetUnits = -2;
    const top = new Set([0, 1, 3, 4, 5]);
    add(paving, bx(-pl.w / 2, -0.1, -pl.d / 2, pl.w / 2, 0.004, pl.d / 2, { skip: top, tile: paving.userData.tile, seg: Math.max(Q.seg, 0.5) }), -1, { cast: false });
    for (const s of [-1, 1]) {
      add(band, bx(-pl.w / 2 - 0.35, -0.1, s * pl.d / 2 - 0.175, pl.w / 2 + 0.35, 0.005, s * pl.d / 2 + 0.175, { skip: top, tile: 2.4, seg: 1 }), -1, { cast: false });
      add(band, bx(s * pl.w / 2 - 0.175, -0.1, -pl.d / 2, s * pl.w / 2 + 0.175, 0.005, pl.d / 2, { skip: top, tile: 2.4, seg: 1 }), -1, { cast: false });
    }
    // estandartes pendurados nos muros (tecido ondulando) e lanternas
    const bm = waveMaterial(new THREE.MeshStandardMaterial({ map: bannerTex('#8E2B22', 3), roughness: 0.9, side: THREE.DoubleSide, vertexColors: true }), 'banner'); W.mats.push(bm);
    const bm2 = waveMaterial(new THREE.MeshStandardMaterial({ map: bannerTex('#1F4A6B', 5), roughness: 0.9, side: THREE.DoubleSide, vertexColors: true }), 'banner'); W.mats.push(bm2);
    const iron = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.55, metalness: 0.8, vertexColors: true });
    const glow = new THREE.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ff9c3a', emissiveIntensity: 2.4, roughness: 0.3, vertexColors: true });
    let wi = 0;
    for (const b of ctx.map.boxes) {
      if (b.r !== 'perim') continue;
      const P = innerFace(b);
      for (const a0 of [-12, 12]) {
        const g = prim(new THREE.PlaneGeometry(1.5, 4.4, 1, 10), { p: facePoint(P, a0, 5.25, 0.2).toArray(), r: [0, faceYaw(P), 0] });
        add(wi % 2 ? bm2 : bm, g, -1, { ao: false });
        const rod = facePoint(P, a0, 7.47, 0.2); add(iron, bc(rod.x, rod.y, rod.z, P.axis === 'z' ? 1.8 : 0.05, 0.05, P.axis === 'z' ? 0.05 : 1.8), -1, { ao: false });
      }
      if (ctx.Q.decor >= 1) for (const a0 of [-18, -6, 6, 18]) {
        const c = facePoint(P, a0, 3.1, 0.34);
        add(iron, faceBox(P, a0 - 0.03, a0 + 0.03, 3.42, 3.48, 0.36, 0), -1, { ao: false });
        add(iron, bc(c.x, 3.08, c.z, 0.26, 0.05, 0.26), -1, { ao: false }); add(iron, bc(c.x, 3.5, c.z, 0.3, 0.06, 0.3), -1, { ao: false });
        add(glow, bc(c.x, 3.13, c.z, 0.2, 0.37, 0.2), -1, { ao: false, cast: false });
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(iron, bc(c.x + sx * 0.11, 3.1, c.z + sz * 0.11, 0.03, 0.42, 0.03), -1, { ao: false });
      }
      wi++;
    }
    // terreno do deserto fora dos muros (anel quadrado -> circulo) com dunas e mesas ao fundo
    const sand = M('sand', '#CFA064');
    {
      const NA = Q.decor >= 2 ? 128 : 72, NR = Q.decor >= 2 ? 36 : 22, pos = [], idx = [], uv = [];
      const hn = (x, z) => Math.sin(x * 0.045 + Math.sin(z * 0.03) * 2) * Math.cos(z * 0.05 + x * 0.01) + Math.sin(x * 0.11 + z * 0.07) * 0.35;
      for (let j = 0; j <= NR; j++) for (let k = 0; k < NA; k++) {
        const th = k / NA * TAU, c = Math.cos(th), s = Math.sin(th);
        const r0 = 25.05 / Math.max(Math.abs(c), Math.abs(s)), t = j / NR, r = r0 + (260 - r0) * Math.pow(t, 1.8);
        const x = c * r, z = s * r, far = THREE.MathUtils.smoothstep(r, r0 + 6, 70);
        const y = j === 0 ? 0 : far * (2.5 + 4.5 * hn(x, z)) + THREE.MathUtils.smoothstep(r, 90, 240) * 10;
        pos.push(x, Math.max(0, y), z); uv.push(x / 5, z / 5);
      }
      for (let j = 0; j < NR; j++) for (let k = 0; k < NA; k++) {
        const k1 = (k + 1) % NA, p = j * NA + k, q = j * NA + k1, r = (j + 1) * NA + k, s = (j + 1) * NA + k1;
        idx.push(p, q, r, q, s, r);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      add(sand, prim(g), -1, { cast: false, ao: false });
    }
    const mesaMat = M('stone', '#B0754A');
    const nm = Q.decor >= 1 ? 9 : 5;
    for (let k = 0; k < nm; k++) {
      const th = k / nm * TAU + rnd() * 0.5, r = 110 + rnd() * 110, h = 22 + rnd() * 30, rad = 14 + rnd() * 22;
      const g = new THREE.CylinderGeometry(rad * (0.8 + rnd() * 0.15), rad * 1.25, h, 16, 5);
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const x = p.getX(v), y = p.getY(v), z = p.getZ(v), ang = Math.atan2(z, x);
        const f = 1 + 0.08 * Math.sin(ang * 5 + k) + 0.05 * Math.sin(ang * 11 + y * 0.3) + (y < h / 2 - 0.1 ? 0.06 * Math.sin(y * 0.8 + ang * 3) : 0);
        p.setXYZ(v, x * f, y, z * f);
      }
      g.computeVertexNormals();
      add(mesaMat, prim(g, { p: [Math.cos(th) * r, h / 2 - 1, Math.sin(th) * r] }, 0.2), -1, { cast: false, ao: false });
    }
    // palmeiras atras dos muros (aparecem acima da muralha)
    const trunk = M('wood', '#6F5A3F');
    const fr = waveMaterial(new THREE.MeshStandardMaterial({ map: frondTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, vertexColors: true }), 'palm'); W.mats.push(fr);
    const spots = [];
    for (const s of [-1, 1]) for (const t of [-16, -2, 12]) { spots.push([t + rnd() * 3, s * (28.5 + rnd() * 4)]); spots.push([s * (28.5 + rnd() * 4), t + rnd() * 3]); }
    for (const s of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) spots.push([s[0] * 29, s[1] * 29]);
    for (const [px, pz] of spots) {
      const H = 10 + rnd() * 5, lean = (rnd() - 0.5) * 0.5, lz = (rnd() - 0.5) * 0.5, n = 9;
      let prev = V(px, -0.2, pz);
      for (let k = 1; k <= n; k++) {
        const t = k / n, p = V(px + lean * H * t * t, H * t, pz + lz * H * t * t);
        const g = new THREE.CylinderGeometry(0.2 - 0.05 * t, 0.26 - 0.05 * t, prev.distanceTo(p) + 0.05, 9, 1);
        const m4 = new THREE.Matrix4().lookAt(prev, p, V(0, 0, 1)); m4.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)); m4.setPosition(prev.clone().add(p).multiplyScalar(0.5));
        add(trunk, prim(g, m4, 0.5), -1, { ao: false });
        prev = p;
      }
      const nf = 11;
      for (let f = 0; f < nf; f++) {
        const yaw = f / nf * TAU + rnd() * 0.4, L = 4.2 + rnd() * 1.4, g = new THREE.PlaneGeometry(1.25, L, 1, 8);
        const pp = g.attributes.position;
        for (let v = 0; v < pp.count; v++) { const y = pp.getY(v) + L / 2; pp.setXYZ(v, pp.getX(v), 0, -y); pp.setY(v, 0.35 * y - 0.13 * y * y); }
        g.computeVertexNormals();
        add(fr, prim(g, { p: prev.toArray(), r: [(rnd() - 0.3) * 0.3, yaw, 0], o: 'YXZ' }), -1, { ao: false });
      }
    }
  },
};

// ------------------------------------------------------------------ pecas compartilhadas
const tubeCache = new Map();
function tubeMat(hex, k = 4) {
  const key = hex + k;
  if (!tubeCache.has(key)) { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k * 0.6) }); m.userData.tube = hex; tubeCache.set(key, m); }
  return tubeCache.get(key);
}
// tubos de neon nas 4 arestas do topo de uma caixa (rentes ao topo, saltando 3 cm)
function topTubes(ctx, b, i, mat, t = 0.05, o = 0.03, y = null) {
  const top = y ?? b.y + b.h, x0 = b.x - b.w / 2 - o, x1 = b.x + b.w / 2 + o, z0 = b.z - b.d / 2 - o, z1 = b.z + b.d / 2 + o;
  ctx.add(mat, bx(x0, top - t, z0, x1, top, z0 + t), i, { ao: false, cast: false }); ctx.add(mat, bx(x0, top - t, z1 - t, x1, top, z1), i, { ao: false, cast: false });
  ctx.add(mat, bx(x0, top - t, z0 + t, x0 + t, top, z1 - t), i, { ao: false, cast: false }); ctx.add(mat, bx(x1 - t, top - t, z0 + t, x1, top, z1 - t), i, { ao: false, cast: false });
}
// guarda-corpo: montantes, corrimao, rodape e painel (vidro ou chapa)
function railing(ctx, b, i, frame, panel, o = {}) {
  const alongX = b.w >= b.d, L = alongX ? b.w : b.d, th = alongX ? b.d : b.w, y0 = b.y, y1 = b.y + b.h;
  const n = Math.max(2, Math.round(L / (o.spacing || 1.25)) + 1);
  const P = (a0, a1, ya, yb, t) => alongX ? bx(b.x + a0, ya, b.z - t / 2, b.x + a1, yb, b.z + t / 2) : bx(b.x - t / 2, ya, b.z + a0, b.x + t / 2, yb, b.z + a1);
  const pw = o.post || 0.05;
  for (let k = 0; k < n; k++) { const a = -L / 2 + (L - pw) * k / (n - 1); ctx.add(frame, P(a, a + pw, y0, y1 - 0.02, Math.min(th, pw)), i); }
  ctx.add(frame, P(-L / 2, L / 2, y1 - 0.055, y1, Math.min(th, o.cap || 0.07)), i);
  ctx.add(frame, P(-L / 2, L / 2, y0, y0 + 0.06, Math.min(th, 0.05)), i);
  if (panel) ctx.add(panel, P(-L / 2 + 0.03, L / 2 - 0.03, y0 + 0.08, y1 - 0.08, 0.018), i, { ao: false, cast: !panel.transparent });
}

// ======================================================================== NEON
const NEON = {
  box(ctx, b, i) {
    const { M, T, add, map } = ctx; const st = map.styles[b.c]; const e = EPS[i % 3];
    const body = M(st.tex, st.color), metal = M('metal', '#4a4c56'), dark = M('panel', '#1c1c24');
    const col = map.neon[i % map.neon.length], tm = tubeMat(col);
    if (b.r === 'perim') {
      add(body, bc(b.x, b.y, b.z, b.w, b.h, b.d, T(body)), i);
      const P = innerFace(b), s = 24, wi = Math.round((P.axis === 'z' ? (P.n > 0 ? 0 : 1) : (P.n > 0 ? 2 : 3)));
      add(dark, faceBox(P, -s, s, 0, 0.35, 0.06, 0.02, T(dark)), i);
      add(metal, faceBox(P, -s, s, 7.6, 8, 0.12, 0.02, T(metal)), i);
      for (let a0 = -20; a0 <= 20; a0 += 4) add(metal, faceBox(P, a0 - 0.2, a0 + 0.2, 0.35, 7.6, 0.1, 0.02, T(metal)), i);
      add(tubeMat(map.neon[wi % 4], 3.2), faceBox(P, -s, s, 2.86, 2.92, 0.13, 0), i, { ao: false, cast: false });
      add(tubeMat(map.neon[(wi + 1) % 4], 2.4), faceBox(P, -s, s, 7.52, 7.56, 0.14, 0), i, { ao: false, cast: false });
      return true;
    }
    if (b.r === 'rail') { railing(ctx, b, i, metal, M('metal', '#2b2d35'), { spacing: 1 }); add(tm, bc(b.x, b.y + b.h - 0.004, b.z, b.w + 0.01, 0.012, b.d + 0.01), i, { ao: false, cast: false }); return true; }
    add(body, bc(b.x, b.y - e, b.z, b.w + 2 * e, b.h + 2 * e, b.d + 2 * e, T(body)), i);
    if (b.r === 'step') { nosing(ctx, b, i, tubeMat('#00E5FF', 2.2), 0.03, 0.01); return true; }
    if (b.r === 'block' || b.r === 'plinth' || b.r === 'wall') { topTubes(ctx, b, i, tm); if (b.y === 0) add(dark, bc(b.x, 0, b.z, b.w + 0.04, 0.12, b.d + 0.04, T(dark)), i); return true; }
    if (b.r === 'leg' || b.r === 'pylon') {
      const x0 = b.x - b.w / 2 - 0.02, x1 = b.x + b.w / 2 + 0.02, z0 = b.z - b.d / 2 - 0.02, z1 = b.z + b.d / 2 + 0.02;
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) add(tm, bx(x - 0.025, 0.4, z - 0.025, x + 0.025, b.h - 0.3, z + 0.025), i, { ao: false, cast: false });
      add(dark, bc(b.x, 0, b.z, b.w + 0.12, 0.4, b.d + 0.12, T(dark)), i);
      if (b.r === 'pylon') topTubes(ctx, b, i, tm, 0.06, 0.04);
      return true;
    }
    if (b.r === 'slab' || b.r === 'bridge') {
      const y = b.y + 0.05, x0 = b.x - b.w / 2 - 0.02, x1 = b.x + b.w / 2 + 0.02, z0 = b.z - b.d / 2 - 0.02, z1 = b.z + b.d / 2 + 0.02;
      if (b.r === 'bridge') for (const z of [z0, z1 - 0.04]) add(tm, bx(x0, y - 0.05, z, x1, y, z + 0.04), i, { ao: false, cast: false });
      else topTubes(ctx, b, i, tm, 0.05, 0.02, b.y + 0.05);
      return true;
    }
    return true;
  },
  props(ctx) {
    const { M, T, add, W, rnd, group, Q, map } = ctx;
    W.reflect = { y: 0, entries: [{ mat: W.groundMat, strength: 1 }] };
    W.probe = V(0, 2, 13.5);
    // bueiros com vapor
    const grate = M('metal', '#34363d');
    for (const [x, z] of [[-22, 8], [22, -8], [8, -22], [-8, 22], [13.5, 13.5], [-13.5, -13.5]]) {
      add(grate, bx(x - 0.45, 0, z - 0.3, x + 0.45, 0.018, z + 0.3), -1, { ao: false, cast: false });
      W.emitters.push({ kind: 'steam', p: V(x, 0.05, z) });
    }
    // letreiros nos muros
    const texts = [['FRAG', 'arena noturna'], ['HOTEL', null], ['RAMEN', 'aberto'], ['ARCADE', null], ['BAR 24H', null], ['CYBER', 'lan house'], ['NEON', null], ['LOJA', '24 horas']];
    let si = 0;
    for (const b of map.boxes) {
      if (b.r !== 'perim') continue;
      const P = innerFace(b);
      for (const a0 of [-10, 10]) {
        const [tx, sub] = texts[si % texts.length], c = map.neon[si % 4];
        const sm = new THREE.MeshBasicMaterial({ map: signTex(tx, c, sub), color: new THREE.Color(1.7, 1.7, 1.7) });
        add(sm, facePlane(P, a0, 5.3, 4.2, 1.05, 0.14), -1, { ao: false, cast: false });
        add(M('metal', '#22232a'), faceBox(P, a0 - 2.2, a0 + 2.2, 4.72, 5.88, 0.12, 0), -1, { ao: false });
        si++;
      }
    }
    // cidade ao fundo: predios instanciados com janelas acesas
    const N = Q.decor >= 2 ? 96 : Q.decor >= 1 ? 64 : 40;
    W.skyline = skyline(ctx, N, true);
    // luzes pontuais coloridas
    const spots = [[0, 4.4, 0, 0], [9, 3.2, 0, 1], [-9, 3.2, 0, 1], [0, 3.6, 9, 2], [0, 3.6, -9, 2], [17, 4.2, 0, 3], [-17, 4.2, 0, 3], [10, 2.3, 10, 0], [-10, 2.3, -10, 1], [10, 2.3, -10, 2], [-10, 2.3, 10, 3], [0, 2.6, 20, 0]];
    for (let k = 0; k < Math.min(Q.lights, spots.length); k++) {
      const [x, y, z, c] = spots[k];
      const l = new THREE.PointLight(map.neon[c], 9, 13, 2); l.position.set(x, y, z); group.add(l); W.lights.push(l);
    }
    // um tubo que pisca
    const flick = tubeMat(map.neon[1]); const base = flick.color.clone();
    W.updaters.push((t) => { const f = Math.sin(t * 23) > 0.93 || (t % 7 < 0.18) ? 0.25 : 1; flick.color.copy(base).multiplyScalar(f); });
  },
};

// predios distantes instanciados; night = janelas emissivas
function skyline(ctx, N, night) {
  const { W, rnd, group } = ctx;
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const wt = windowsTex(night, night ? 7 : 11); wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
  const mat = night
    ? new THREE.MeshStandardMaterial({ color: '#0a0b12', roughness: 0.6, metalness: 0.4, emissive: '#ffffff', emissiveMap: wt, emissiveIntensity: 0.42 })
    : new THREE.MeshStandardMaterial({ color: '#ffffff', map: wt, roughness: 0.25, metalness: 0.55 });
  const which = night ? 'vEmissiveMapUv' : 'vMapUv';
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
    #ifdef USE_INSTANCING
      vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      float fw = abs(normal.x) > 0.5 ? isc.z : isc.x;
      ${which} = uv * vec2(fw / 28.0, isc.y / 56.0) + vec2(float(gl_InstanceID) * 0.37, float(gl_InstanceID) * 0.61);
      if (abs(normal.y) > 0.5) ${which} = vec2(0.004, 0.004);
    #endif`);
  };
  mat.customProgramCacheKey = () => 'skyline' + night;
  const im = new THREE.InstancedMesh(geo, mat, N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const tops = [];
  for (let k = 0; k < N; k++) {
    const th = (k / N) * TAU + rnd() * 0.08, r = 44 + rnd() * 110, h = 22 + rnd() * 70 + (r > 90 ? 25 : 0), w = 9 + rnd() * 14, d = 9 + rnd() * 14;
    p.set(Math.cos(th) * r, -1, Math.sin(th) * r); q.setFromAxisAngle(V(0, 1, 0), rnd() * 0.6 - 0.3 + th); sc.set(w, h, d);
    m4.compose(p, q, sc); im.setMatrixAt(k, m4);
    if (h > 60) tops.push(V(p.x, h - 1, p.z));
  }
  im.frustumCulled = false; group.add(im);
  if (night) {
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 0.3) });
    for (const t of tops) ctx.add(red, bc(t.x, t.y + 1, t.z, 0.8, 0.8, 0.8), -1, { ao: false, cast: false });
    W.updaters.push((t) => { red.color.setRGB(6 * (Math.sin(t * 3) > 0.2 ? 1 : 0.08), 0.4, 0.3); });
  }
  return im;
}

// ======================================================================== ESCRITORIO
function monitorFacing(map, b) {
  let best = null, bd = 9;
  for (const o of map.boxes) {
    if (o.r !== 'partition' || o.w < 1.5) continue;
    const d = Math.abs(o.x - b.x) + Math.abs(o.z - b.z);
    if (d < bd && Math.abs(o.z - b.z) < 1 && Math.abs(o.x - b.x) < 1.3) { bd = d; best = o; }
  }
  return best ? -Math.sign(best.z - b.z) : -1;
}
const ESC = {
  box(ctx, b, i) {
    const { M, T, add, map, W } = ctx; const st = map.styles[b.c]; const e = EPS[i % 3];
    const body = M(st.tex, st.color);
    const steel = M('steel', '#9aa1aa'), darkSteel = M('steel', '#3a3f47'), wood = M('wood', '#C9B290'), woodDark = M('wood', '#8a7254');
    const glass = ESC.glass || (ESC.glass = glassMaterial('#cfe3f2', 0.1));
    if (b.r === 'perim') {
      const P = innerFace(b), s = 24.5;
      const lo = M('concrete', '#c9ccd0');
      add(lo, bc(b.x, 0, b.z, b.w, 3.4, b.d, T(lo)), i);
      add(lo, bc(b.x, 7.4, b.z, b.w, 0.6, b.d, T(lo)), i);
      add(darkSteel, faceBox(P, -s, s, 0, 0.12, 0.02, 0.02, T(darkSteel)), i);
      for (let a0 = -24; a0 <= 24; a0 += 2) add(darkSteel, faceBox(P, a0 - 0.05, a0 + 0.05, 3.4, 7.4, 0.06, 0.1, { tile: 1 }), i);
      add(darkSteel, faceBox(P, -s, s, 5.36, 5.44, 0.06, 0.1, { tile: 1 }), i);
      add(darkSteel, faceBox(P, -s, s, 3.4, 3.46, 0.08, 0.1, { tile: 1 }), i);
      add(glass, faceBox(P, -s, s, 3.4, 7.4, 0.01, 0.0), -1, { ao: false, cast: false });
      return true;
    }
    if (b.r === 'desk' || b.r === 'table') {
      const top = b.y + b.h, alongX = b.w >= b.d;
      add(wood, bc(b.x, top - 0.04, b.z, b.w, 0.04 + e, b.d, T(wood)), i);
      const ends = alongX ? [[b.x - b.w / 2 + 0.015, b.z], [b.x + b.w / 2 - 0.015, b.z]] : [[b.x, b.z - b.d / 2 + 0.015], [b.x, b.z + b.d / 2 - 0.015]];
      for (const [x, z] of ends) add(b.r === 'table' ? darkSteel : woodDark, bc(x, b.y, z, alongX ? 0.03 : b.w - 0.02, b.h - 0.04, alongX ? b.d - 0.02 : 0.03, T(woodDark)), i);
      add(woodDark, bc(b.x, b.y + 0.12, b.z, alongX ? b.w - 0.06 : 0.02, b.h - 0.16, alongX ? 0.02 : b.d - 0.06, T(woodDark)), i);
      return true;
    }
    if (b.r === 'monitor') {
      const f = monitorFacing(map, b), y = b.y, sx = 0.5, zc = b.z;
      const plastic = M('metal', '#1a1c21');
      add(plastic, bc(b.x, y, zc, 0.22, 0.015, 0.16), i, { ao: false });
      add(plastic, bc(b.x, y + 0.015, zc - f * 0.03, 0.04, 0.1, 0.025), i, { ao: false });
      add(plastic, bc(b.x, y + 0.07, zc, sx, 0.28, 0.03), i);
      const sm = ESC.screens || (ESC.screens = [0, 1, 2, 3].map((k) => new THREE.MeshBasicMaterial({ map: screenTex(k * 17 + 3), color: new THREE.Color(1.25, 1.25, 1.25) })));
      add(sm[i % 4], prim(new THREE.PlaneGeometry(sx - 0.03, 0.25), { p: [b.x, y + 0.21, zc + f * 0.0162], r: [0, f > 0 ? 0 : Math.PI, 0] }), -1, { ao: false, cast: false });
      return true;
    }
    if (b.r === 'partition') {
      const alongX = b.w >= b.d;
      add(body, bc(b.x, b.y, b.z, alongX ? b.w - 0.06 : b.w * 0.7, b.h - 0.03, alongX ? b.d * 0.7 : b.d - 0.06, T(body)), i);
      add(steel, bc(b.x, b.y + b.h - 0.035, b.z, b.w, 0.035 + e, b.d, { tile: 1 }), i);
      const ends = alongX ? [[b.x - b.w / 2 + 0.03, b.z], [b.x + b.w / 2 - 0.03, b.z]] : [[b.x, b.z - b.d / 2 + 0.03], [b.x, b.z + b.d / 2 - 0.03]];
      for (const [x, z] of ends) add(steel, bc(x, b.y, z, alongX ? 0.06 : b.w, b.h, alongX ? b.d : 0.06, { tile: 1 }), i);
      return true;
    }
    if (b.r === 'cabinet') {
      const paint = M('metal', '#6d7682'), sx = -Math.sign(b.x);
      add(paint, bc(b.x, b.y - e, b.z, b.w, b.h + e, b.d, T(paint)), i);
      const fx = b.x + sx * b.w / 2;
      for (let z = b.z - b.d / 2 + 0.5; z < b.z + b.d / 2; z += 1) for (let r = 0; r < 3; r++) {
        const y = 0.12 + r * 0.36;
        add(darkSteel, bx(Math.min(fx, fx + sx * 0.012), y, z - 0.47, Math.max(fx, fx + sx * 0.012), y + 0.33, z + 0.47, { tile: 1 }), i, { ao: false });
        add(steel, bx(Math.min(fx, fx + sx * 0.03), y + 0.24, z - 0.12, Math.max(fx, fx + sx * 0.03), y + 0.27, z + 0.12, { tile: 1 }), i, { ao: false });
      }
      return true;
    }
    if (b.r === 'counter') {
      const stone = M('terrazzo', '#E4E2DC');
      add(wood, bc(b.x, b.y + 0.1, b.z, b.w - 0.04, b.h - 0.15, b.d - 0.04, T(wood)), i);
      add(darkSteel, bc(b.x, b.y, b.z, b.w - 0.1, 0.1, b.d - 0.1, { tile: 1 }), i);
      add(stone, bc(b.x, b.y + b.h - 0.05, b.z, b.w, 0.05 + e, b.d, T(stone)), i);
      return true;
    }
    if (b.r === 'column' || b.r === 'leg') {
      add(body, bc(b.x, b.y, b.z, b.w, b.h, b.d, T(body)), i);
      add(darkSteel, bc(b.x, 0, b.z, b.w + 0.06, 0.1, b.d + 0.06, { tile: 1 }), i);
      if (b.r === 'column') add(steel, bc(b.x, b.h - 0.12, b.z, b.w + 0.04, 0.12, b.d + 0.04, { tile: 1 }), i);
      return true;
    }
    if (b.r === 'glass') {
      const alongX = b.w >= b.d, L = alongX ? b.w : b.d;
      const P = (a0, a1, y0, y1, t) => alongX ? bx(b.x + a0, y0, b.z - t / 2, b.x + a1, y1, b.z + t / 2) : bx(b.x - t / 2, y0, b.z + a0, b.x + t / 2, y1, b.z + a1);
      add(darkSteel, P(-L / 2, L / 2, 0, 0.08, 0.1), i); add(darkSteel, P(-L / 2, L / 2, b.h - 0.08, b.h, 0.1), i);
      const n = Math.max(1, Math.round(L / 1.5));
      for (let k = 0; k <= n; k++) { const a = -L / 2 + (L - 0.05) * k / n; add(darkSteel, P(a, a + 0.05, 0.08, b.h - 0.08, 0.08), i); }
      add(glass, P(-L / 2, L / 2, 0.08, b.h - 0.08, 0.02), -1, { ao: false, cast: false });
      const frost = ESC.frost || (ESC.frost = glassMaterial('#ffffff', 0.55, { rough: 0.6, env: 0.4 }));
      for (const s of [-1, 1]) add(frost, alongX ? bx(b.x - L / 2, 1.0, b.z + s * 0.012 - 0.002, b.x + L / 2, 1.35, b.z + s * 0.012 + 0.002) : bx(b.x + s * 0.012 - 0.002, 1.0, b.z - L / 2, b.x + s * 0.012 + 0.002, 1.35, b.z + L / 2), -1, { ao: false, cast: false });
      return true;
    }
    if (b.r === 'plant') {
      const pot = M('plaster', '#E6E1D8'), soil = M('sand', '#3b2a1e');
      add(pot, prim(new THREE.CylinderGeometry(0.27, 0.21, 0.5, 16, 1), { p: [b.x, 0.25, b.z] }, 0.5), i);
      add(soil, prim(new THREE.CircleGeometry(0.25, 14), { p: [b.x, 0.47, b.z], r: [-Math.PI / 2, 0, 0] }), i, { ao: false });
      const lm = ESC.leaf || (ESC.leaf = new THREE.MeshStandardMaterial({ map: leafTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, vertexColors: true }));
      const r = rng(i * 13 + 5);
      for (let k = 0; k < 16; k++) {
        const s = 0.35 + r() * 0.35, y = 0.45 + r() * 0.35;
        add(lm, prim(new THREE.PlaneGeometry(s, s), { p: [b.x + (r() - 0.5) * 0.2, y + s / 2, b.z + (r() - 0.5) * 0.2], r: [(r() - 0.5) * 0.9, r() * TAU, 0], o: 'YXZ' }), -1, { ao: false });
      }
      return true;
    }
    if (b.r === 'mezz') {
      add(body, bc(b.x, b.y, b.z, b.w, b.h, b.d, T(body)), i);
      const fz = b.z - Math.sign(b.z) * b.d / 2, n = -Math.sign(b.z);
      add(M('concrete', '#b6b9bd'), bx(b.x - b.w / 2, b.y - 0.02, Math.min(fz, fz + n * 0.06), b.x + b.w / 2, b.y + b.h + 0.002, Math.max(fz, fz + n * 0.06), { tile: 2 }), i);
      add(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.8) }), bx(b.x - b.w / 2, b.y + 0.02, Math.min(fz, fz + n * 0.07), b.x + b.w / 2, b.y + 0.05, Math.max(fz, fz + n * 0.07)), -1, { ao: false, cast: false });
      const dl = ESC.dl || (ESC.dl = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.1, 2.9) }));
      for (let x = -21; x <= 21; x += 3) add(dl, prim(new THREE.CircleGeometry(0.11, 12), { p: [x, b.y - 0.003, b.z], r: [Math.PI / 2, 0, 0] }), -1, { ao: false, cast: false });
      return true;
    }
    if (b.r === 'railing') { railing(ctx, b, i, steel, glass, { spacing: 1.5 }); return true; }
    if (b.r === 'step') {
      add(body, bc(b.x, b.y - e, b.z, b.w + 2 * e, b.h + 2 * e, b.d + 2 * e, T(body)), i);
      nosing(ctx, b, i, darkSteel, 0.04, 0.01);
      return true;
    }
    return false;
  },
  props(ctx) {
    const { M, T, add, W, rnd, group, Q, map } = ctx;
    W.reflect = { y: 0, entries: [{ mat: W.groundMat, strength: 0.8 }] };
    W.probe = V(0, 1.8, 13.5);
    // telhado de vidro com vigas (sombras listradas no chao)
    const beamM = M('steel', '#5d636b');
    for (let x = -24; x <= 24; x += 6) add(beamM, bx(x - 0.15, 8.1, -24.5, x + 0.15, 8.5, 24.5, { tile: 1 }), -1, { ao: false });
    for (let z = -21; z <= 21; z += 3) add(beamM, bx(-24.5, 8.35, z - 0.07, 24.5, 8.5, z + 0.07, { tile: 1 }), -1, { ao: false });
    add(glassMaterial('#dcecf6', 0.08, { side: THREE.DoubleSide }), bx(-24.5, 8.5, -24.5, 24.5, 8.52, 24.5), -1, { ao: false, cast: false });
    // chao da rua do lado de fora (visto do mezanino pelas janelas)
    const street = M('concrete', '#8f9398');
    add(street, bx(-230, -0.4, -230, 230, -0.03, 230, { skip: new Set([0, 1, 3, 4, 5]), tile: 2.4, seg: 60 }), -1, { cast: false, ao: false });
    W.skyline = skyline(ctx, Q.decor >= 2 ? 80 : Q.decor >= 1 ? 56 : 36, false);
    // carpetes sob as baias
    const carpet = M('carpet', '#4B5B70', { po: 1 }); carpet.polygonOffset = true; carpet.polygonOffsetFactor = -2; carpet.polygonOffsetUnits = -2;
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const x0 = Math.min(sx * 5.7, sx * 10.9), x1 = Math.max(sx * 5.7, sx * 10.9), z0 = Math.min(sz * 5.0, sz * 9.5), z1 = Math.max(sz * 5.0, sz * 9.5);
      add(carpet, bx(x0, -0.1, z0, x1, 0.006, z1, { skip: new Set([0, 1, 3, 4, 5]), tile: carpet.userData.tile, seg: 0.8 }), -1, { cast: false });
    }
    // quadros nas paredes
    let k = 0;
    for (const b of map.boxes) {
      if (b.r !== 'perim') continue;
      const P = innerFace(b);
      for (const a0 of [-10, 0, 10]) {
        if (P.axis === 'z' && Math.abs(a0) < 1) continue;
        const am = new THREE.MeshStandardMaterial({ map: artTex(k++), roughness: 0.5, vertexColors: true });
        add(am, facePlane(P, a0, 1.9, 1.8, 1.3, 0.035), -1, { ao: false, cast: false });
        add(M('wood', '#2a2420'), faceBox(P, a0 - 0.95, a0 + 0.95, 1.2, 2.6, 0.03, 0), -1, { ao: false });
      }
    }
    // pendentes sobre as baias
    if (Q.decor >= 1) {
      const shadeM = M('metal', '#22252b'), bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.6, 3) });
      for (const sx of [1, -1]) for (const sz of [1, -1]) for (const dx of [7, 9.4]) {
        const x = sx * dx, z = sz * 7.2;
        add(darkSteelLine(M), bc(x, 2.7, z, 0.012, 5.4, 0.012), -1, { ao: false, cast: false });
        add(shadeM, prim(new THREE.CylinderGeometry(0.08, 0.26, 0.22, 20, 1, true), { p: [x, 2.6, z] }), -1, { ao: false });
        add(bulb, prim(new THREE.CircleGeometry(0.22, 20), { p: [x, 2.492, z], r: [Math.PI / 2, 0, 0] }), -1, { ao: false, cast: false });
      }
    }
  },
};
function darkSteelLine(M) { return M('steel', '#2a2d33'); }

import { BUILD2 } from './level2.js';
export const BUILD = { patio: PATIO, neon: NEON, escritorio: ESC, ...BUILD2 };
export { EPS, nosing, V, railing, topTubes, tubeMat, skyline };
