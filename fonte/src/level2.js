// FRAG v4 - visual dos mapas novos (Porto, Nevasca, Vila, Duelo). Mesma regra dos antigos:
// o que se ve fica dentro do volume de colisao (ou salta poucos cm); o que fica fora do volume e so cenario longe do jogador.
import * as THREE from 'three';
import { bx, bc, prim } from './geo.js';
import { getTextures, glassMaterial, canvasTex } from './textures.js';
import { rng, shade, innerFace, faceBox, facePoint, facePlane, faceYaw, edgeBeams, beam, TAU } from './world.js';
import { nosing, railing, skyline, tubeMat } from './level.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const EPS = [0, 0.003, 0.006];
const TOP = new Set([0, 1, 3, 4, 5]); // so a face de cima
const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

// ------------------------------------------------------------------ pecas genericas
function crate(ctx, b, i) {
  const { M, T, add } = ctx, st = ctx.map.styles[b.c], e = EPS[i % 3];
  const body = M(st.tex, st.color), dark = M('wood', shade(st.color, 0.6));
  add(body, bc(b.x, b.y - e, b.z, b.w + 2 * e, b.h + 2 * e, b.d + 2 * e, T(body)), i);
  const t = Math.min(0.11, b.h * 0.08);
  for (const g of edgeBeams([b.x - b.w / 2, b.y, b.z - b.d / 2], [b.x + b.w / 2, b.y + b.h, b.z + b.d / 2], t, 0.016, T(dark))) add(dark, g, i);
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const fx = b.x + nx * (b.w / 2 + 0.011), fz = b.z + nz * (b.d / 2 + 0.011), hw = (nz ? b.w : b.d) / 2 - t, px = nz ? 1 : 0, pz = nx ? 1 : 0;
    add(dark, beam(V(fx - px * hw, b.y + t, fz - pz * hw), V(fx + px * hw, b.y + b.h - t, fz + pz * hw), 0.06), i);
  }
}
function barrel(ctx, b, i) {
  const { M, add } = ctx, st = ctx.map.styles[b.c];
  const m = M(st.tex, st.color), ring = M('metal', shade(st.color, 0.55)), r = Math.min(b.w, b.d) / 2 - 0.01;
  add(m, prim(new THREE.CylinderGeometry(r, r, b.h - 0.02, 20, 1), { p: [b.x, b.y + b.h / 2, b.z] }, 0.6), i);
  for (const y of [0.04, b.h * 0.33, b.h * 0.66, b.h - 0.05]) add(ring, prim(new THREE.TorusGeometry(r, 0.014, 5, 22), { p: [b.x, b.y + y, b.z], r: [Math.PI / 2, 0, 0] }), i, { ao: false });
  add(ring, prim(new THREE.CircleGeometry(r * 0.96, 20), { p: [b.x, b.y + b.h - 0.015, b.z], r: [-Math.PI / 2, 0, 0] }), i, { ao: false });
}
// degrau metalico ou de pedra
function stepBox(ctx, b, i, noseMat) {
  const { M, T, add } = ctx, st = ctx.map.styles[b.c], e = EPS[i % 3], body = M(st.tex, st.color);
  add(body, bc(b.x, b.y - e, b.z, b.w + 2 * e, b.h + 2 * e, b.d + 2 * e, T(body)), i);
  nosing(ctx, b, i, noseMat || M('metal', '#2d2f33'), 0.04, 0.01);
}
function plain(ctx, b, i) {
  const { M, T, add } = ctx, st = ctx.map.styles[b.c], e = EPS[i % 3], m = M(st.tex, st.color);
  add(m, bc(b.x, b.y - e, b.z, b.w + 2 * e, b.h + 2 * e, b.d + 2 * e, T(m)), i);
}
// terreno em anel (do muro ate longe), altura h(x,z)
function terrain(ctx, mat, size, far, hfn, NA = 96, NR = 28) {
  const pos = [], idx = [], uv = [];
  for (let j = 0; j <= NR; j++) for (let k = 0; k < NA; k++) {
    const th = k / NA * TAU, c = Math.cos(th), s = Math.sin(th);
    const r0 = (size / 2 + 1.05) / Math.max(Math.abs(c), Math.abs(s)), t = j / NR, r = r0 + (far - r0) * Math.pow(t, 1.8);
    const x = c * r, z = s * r;
    pos.push(x, j === 0 ? 0 : hfn(x, z, r - r0), z); uv.push(x / 5, z / 5);
  }
  for (let j = 0; j < NR; j++) for (let k = 0; k < NA; k++) {
    const k1 = (k + 1) % NA, p = j * NA + k, q = j * NA + k1, r = (j + 1) * NA + k, s = (j + 1) * NA + k1;
    idx.push(p, q, r, q, s, r);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  ctx.add(mat, prim(g), -1, { cast: false, ao: false });
}
// letreiro pintado (texto num plano)
function paintTex(text, color, sub, w = 512, h = 128) {
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color; g.font = '900 ' + Math.round(h * 0.52) + 'px Arial Black, Arial, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(text, 16, h * 0.42);
    if (sub) { g.font = '700 ' + Math.round(h * 0.2) + 'px monospace'; g.fillText(sub, 18, h * 0.82); }
  });
}

// ======================================================================== PORTO
const CONT_NAMES = ['ATLÂNTICA', 'SUESTE LINE', 'TROPICAL', 'MARÉ ALTA', 'CABO FRIO'];
const PORTO = {
  box(ctx, b, i) {
    const { M, T, add, map } = ctx, st = map.styles[b.c], e = EPS[i % 3];
    if (b.r === 'perim') {
      const conc = M('concrete', '#9C9A94'), post = M('steel', '#8e949b');
      add(conc, bc(b.x, 0, b.z, b.w, 3.4, b.d, T(conc)), i);
      add(M('concrete', '#7d7b76'), bc(b.x, 3.4, b.z, b.w + 0.06, 0.12, b.d + 0.06, { tile: 2 }), i);
      // alambrado ate o topo da colisao (da para ver o mar e o guindaste)
      const P = innerFace(b), s = 29;
      const fence = once('fence', () => {
        const t = canvasTex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(190,196,204,1)'; g.lineWidth = 3; for (let k = -w; k < w * 2; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); g.beginPath(); g.moveTo(k + h, 0); g.lineTo(k, h); g.stroke(); } }, false);
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1);
        return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide, vertexColors: true });
      });
      const L = P.axis === 'z' ? b.w : b.d;
      const g = new THREE.PlaneGeometry(L, 2.55); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * L / 0.8, uv.getY(k) * 2.55 / 0.8);
      const c = facePoint(P, P.axis === 'z' ? b.x : b.z, 4.75, -0.35);
      add(fence, prim(g, { p: [c.x, c.y, c.z], r: [0, faceYaw(P), 0] }), -1, { ao: false, cast: false });
      for (let a = -s; a <= s; a += 3) add(post, faceBox(P, a - 0.04, a + 0.04, 3.5, 6, -0.3, 0.4, { tile: 1 }), i, { ao: false });
      add(post, faceBox(P, -s, s, 5.94, 6, -0.3, 0.4, { tile: 1 }), i, { ao: false });
      return true;
    }
    if (b.r === 'container') return PORTO.container(ctx, b, i), true;
    if (b.r === 'crate') return crate(ctx, b, i), true;
    if (b.r === 'barrel') return barrel(ctx, b, i), true;
    if (b.r === 'step') { stepBox(ctx, b, i, M('metal', '#E0A526')); return true; }
    if (b.r === 'dock') {
      const conc = M('concrete', '#8e8c86'), hz = PORTO.hazard(ctx), rub = M('panel', '#1c1c1e');
      add(conc, bc(b.x, b.y - e, b.z, b.w, b.h + e, b.d, T(conc)), i);
      const fz = b.z - b.d / 2;
      add(hz, bx(b.x - b.w / 2, b.h - 0.12, fz - 0.012, b.x + b.w / 2, b.h + 0.002, fz + 0.02, { tile: 1 }), i, { ao: false });
      for (let x = b.x - b.w / 2 + 1.2; x < b.x + b.w / 2; x += 2.4) add(rub, bx(x - 0.25, 0.25, fz - 0.03, x + 0.25, 0.85, fz + 0.01, { tile: 1 }), i);
      return true;
    }
    if (b.r === 'crane') {
      const y = M('metal', '#E0A526');
      add(y, bc(b.x, 0, b.z, b.w, b.h, b.d, T(y)), i);
      add(M('concrete', '#6f6d69'), bc(b.x, 0, b.z, b.w + 0.5, 0.35, b.d + 0.5, { tile: 2 }), i);
      const hz = PORTO.hazard(ctx); add(hz, bc(b.x, 0.35, b.z, b.w + 0.02, 1.2, b.d + 0.02, { tile: 1 }), i, { ao: false });
      return true;
    }
    if (b.r === 'forklift') {
      const y = M('metal', '#D9A21E'), dk = M('metal', '#26282c'), tire = M('panel', '#141414');
      add(y, bc(b.x, 0.35, b.z + 0.2, b.w, 0.9, b.d - 0.6, T(y)), i);
      add(dk, bc(b.x, 1.25, b.z + 0.55, b.w - 0.1, 0.4, 0.9, T(dk)), i);
      for (const sx of [-1, 1]) {
        add(dk, bc(b.x + sx * (b.w / 2 - 0.06), 1.25, b.z - 0.05, 0.06, b.h - 1.25, 0.06), i);
        add(dk, bc(b.x + sx * (b.w / 2 - 0.06), 1.25, b.z + 0.95, 0.06, b.h - 1.25, 0.06), i);
        add(dk, bc(b.x + sx * 0.4, 0, b.z - b.d / 2 + 0.3, 0.1, b.h, 0.1), i);
        add(dk, bc(b.x + sx * 0.3, 0.05, b.z - b.d / 2 + 0.03, 0.12, 0.05, 0.9), i);
        for (const z of [b.z - 0.6, b.z + 0.8]) add(tire, prim(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 16), { p: [b.x + sx * (b.w / 2 - 0.12), 0.33, z], r: [0, 0, Math.PI / 2] }), i);
      }
      add(dk, bc(b.x, b.h - 0.06, b.z + 0.45, b.w - 0.04, 0.06, 1.1), i);
      return true;
    }
    return false;
  },
  hazard(ctx) {
    return once('hz' + ctx.Q.tex, () => {
      const t = canvasTex(256, 32, (g, w, h) => { g.fillStyle = '#E8B21E'; g.fillRect(0, 0, w, h); g.fillStyle = '#161616'; for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill(); } });
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, vertexColors: true });
    });
  },
  container(ctx, b, i) {
    const { M, T, add, map } = ctx, st = map.styles[b.c], e = EPS[i % 3];
    const body = M('corrugated', st.color), frame = M('metal', shade(st.color, 0.62)), dk = M('metal', '#2a2c30');
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, y0 = b.y, y1 = b.y + b.h, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    add(body, bx(x0 + 0.03, y0 + 0.02, z0 + 0.03, x1 - 0.03, y1 - 0.02, z1 - 0.03, T(body)), i);
    for (const g of edgeBeams([x0, y0, z0], [x1, y1, z1], 0.14, 0.0, { tile: 1 })) add(frame, g, i);
    const alongX = b.w > b.d, L = alongX ? b.w : b.d;
    // portas na ponta (lado + do eixo), barras de trava
    const endP = alongX ? { axis: 'x', F: x1, n: 1 } : { axis: 'z', F: z1, n: 1 };
    const across = alongX ? [z0, z1] : [x0, x1];
    const mid = (across[0] + across[1]) / 2;
    const face = (a0, a1, ya, yb, out) => endP.axis === 'x' ? bx(endP.F - 0.03, ya, a0, endP.F + out, yb, a1) : bx(a0, ya, endP.F - 0.03, a1, yb, endP.F + out);
    add(frame, face(mid - 0.012, mid + 0.012, y0 + 0.14, y1 - 0.14, 0.012), i, { ao: false });
    for (const a of [across[0] + 0.3, mid - 0.25, mid + 0.25, across[1] - 0.3]) {
      add(dk, face(a - 0.018, a + 0.018, y0 + 0.16, y1 - 0.16, 0.035), i, { ao: false });
      add(dk, face(a - 0.05, a + 0.05, y0 + 1.05, y0 + 1.13, 0.05), i, { ao: false });
    }
    // castings nos cantos
    for (const cx of [x0, x1]) for (const cy of [y0, y1 - 0.12]) for (const cz of [z0, z1]) add(dk, bx(cx - (cx === x0 ? 0.012 : 0.17), cy, cz - (cz === z0 ? 0.012 : 0.17), cx + (cx === x0 ? 0.17 : 0.012), cy + 0.12, cz + (cz === z0 ? 0.17 : 0.012)), i, { ao: false });
    // nome pintado nos lados longos
    if (b.y === 0 && L > 5) {
      const k = (i * 7) % CONT_NAMES.length;
      const tm = once('cn' + k, () => new THREE.MeshStandardMaterial({ map: paintTex(CONT_NAMES[k], 'rgba(245,245,240,.88)', 'FRGU ' + (204517 + k * 3131) + ' 3'), transparent: true, depthWrite: false, roughness: 0.8, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2 }));
      for (const s of [-1, 1]) {
        const p = alongX ? [b.x, y0 + 1.75, b.z + s * (b.d / 2 + 0.004)] : [b.x + s * (b.w / 2 + 0.004), y0 + 1.75, b.z];
        const yaw = alongX ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
        add(tm, prim(new THREE.PlaneGeometry(Math.min(4.2, L * 0.62), 1.05), { p, r: [0, yaw, 0] }), -1, { ao: false, cast: false });
      }
    }
  },
  props(ctx) {
    const { M, add, W, rnd, group, Q, map } = ctx;
    // mar em volta (reflete o por do sol)
    const wt = getTextures('water', '#1d3f55', Math.min(512, Q.tex), Q.aniso);
    const nrm = wt.normalMap.clone(); nrm.needsUpdate = true; nrm.repeat.set(60, 60);
    const sea = new THREE.MeshStandardMaterial({ color: '#10324a', roughness: 0.08, metalness: 0.1, normalMap: nrm, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.4 });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), sea); sm.rotation.x = -Math.PI / 2; sm.position.y = -1.6; group.add(sm);
    W.updaters.push((t) => { nrm.offset.set(t * 0.004, t * 0.003); });
    // cais de concreto do lado de fora dos muros (anel ate a agua)
    const quay = M('concrete', '#85837e');
    const S = map.size / 2 + 1;
    for (const [a0, a1, b0, b1] of [[-S - 9, S + 9, S, S + 9], [-S - 9, S + 9, -S - 9, -S], [S, S + 9, -S, S], [-S - 9, -S, -S, S]]) add(quay, bx(a0, -1.6, b0, a1, 0, b1, { skip: new Set([1, 3]), tile: 2.4, seg: 4 }), -1, { cast: false, ao: false });
    const bol = M('metal', '#2b2d30');
    for (let a = -S; a <= S; a += 8) for (const [x, z] of [[a, S + 8.3], [a, -S - 8.3], [S + 8.3, a], [-S - 8.3, a]]) add(bol, prim(new THREE.CylinderGeometry(0.18, 0.24, 0.5, 10), { p: [x, 0.25, z] }), -1, { ao: false });
    // guindaste: vigas no topo das pernas e lanca sobre o mar
    const y = M('metal', '#E0A526'), dk = M('metal', '#2c2f33');
    for (const sz of [1, -1]) {
      const z = 21 * sz;
      add(y, bx(-10.6, 13, z - 0.6, 10.6, 14.2, z + 0.6, { tile: 2 }), -1);
      add(y, bx(-10.45, 13, -z * 0 + z - 0.45, -9.55, 14.2, z + 0.45), -1);
      add(y, bx(-4, 14.2, z - 0.8, 4, 15.8, z + 0.8, { tile: 2 }), -1); // cabine/carro
      add(glassMaterial('#9fc4d8', 0.35), bx(-3.2, 14.6, z - 0.82, -1.2, 15.4, z - 0.79), -1, { ao: false, cast: false });
      add(y, bx(-0.5, 13.4, z, 0.5, 14.2, z + sz * 30), -1);
      for (let k = 1; k < 10; k++) add(dk, beam(V(-0.45, 13.4, z + sz * (k * 3 - 1.5)), V(0.45, 14.2, z + sz * k * 3), 0.05), -1, { ao: false });
      add(dk, bc(0, 5, z + sz * 20, 0.04, 8.4, 0.04), -1, { ao: false, cast: false });
      PORTO.container(ctx, { x: 0, y: 2.4, z: z + sz * 20, w: 6.1, h: 2.6, d: 2.44, c: sz > 0 ? 'cGreen' : 'cBlue', r: 'container' }, -1);
      for (const x of [-10, 10]) for (let k = 0; k < 6; k++) add(dk, beam(V(x - 0.45, k * 2.1 + 0.4, z - 0.45), V(x + 0.45, k * 2.1 + 2.3, z + 0.45), 0.045), -1, { ao: false });
    }
    // postes de luz
    const pole = M('steel', '#7d838a'), lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.3, 2.4) });
    const spots = [[-26.5, -26.5], [26.5, 26.5], [-26.5, 26.5], [26.5, -26.5]];
    spots.forEach(([x, z], k) => {
      add(pole, prim(new THREE.CylinderGeometry(0.08, 0.12, 8, 10), { p: [x, 4, z] }), -1);
      add(pole, bx(x - 0.8 * Math.sign(x), 7.9, z - 0.1, x, 8.02, z + 0.1), -1);
      add(lamp, bx(x - 0.75 * Math.sign(x), 7.84, z - 0.12, x - 0.25 * Math.sign(x), 7.9, z + 0.12), -1, { ao: false, cast: false });
      if (k < Q.lights) { const l = new THREE.PointLight('#FFC98A', 14, 20, 2); l.position.set(x - 0.5 * Math.sign(x), 7.4, z); group.add(l); W.lights.push(l); }
    });
    // faixas pintadas no chao
    const paint = new THREE.MeshStandardMaterial({ color: '#E3B62C', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, vertexColors: true });
    const white = new THREE.MeshStandardMaterial({ color: '#d8d8d2', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, vertexColors: true });
    for (const s of [-1, 1]) {
      add(paint, bx(-26, -0.1, s * 19.5 - 0.08, 26, 0.005, s * 19.5 + 0.08, { skip: TOP, tile: 4 }), -1, { cast: false, ao: false });
      add(paint, bx(s * 25 - 0.08, -0.1, -26, s * 25 + 0.08, 0.005, 26, { skip: TOP, tile: 4 }), -1, { cast: false, ao: false });
      for (let z = -12; z <= 12; z += 3) add(white, bx(s * 5 - 0.06, -0.1, z - 0.8, s * 5 + 0.06, 0.005, z + 0.8, { skip: TOP, tile: 4 }), -1, { cast: false, ao: false });
    }
    // cidade e morros ao longe
    // cidade do outro lado da baia (longe: escala as posicoes para 115..400 m)
    W.skyline = skyline(ctx, Q.decor >= 2 ? 44 : 26, false);
    W.skyline.position.y = -2; W.skyline.scale.set(2.8, 0.42, 2.8);
    const hill = M('stone', '#5d5a57');
    terrainFar(ctx, hill, 190, 330, 22, rnd);
    W.probe = V(0, 3.2, 14);
    W.reflect = null;
  },
};
// morros distantes (so silhueta)
function terrainFar(ctx, mat, r0, r1, H, rnd) {
  const NA = 64, pos = [], idx = [];
  for (let k = 0; k < NA; k++) {
    const th = k / NA * TAU, h = H * (0.4 + 0.6 * Math.abs(Math.sin(th * 3 + 1) * Math.cos(th * 5)));
    pos.push(Math.cos(th) * r0, -2, Math.sin(th) * r0, Math.cos(th) * r1, h, Math.sin(th) * r1);
  }
  for (let k = 0; k < NA; k++) { const a = k * 2, b = ((k + 1) % NA) * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  ctx.add(mat, prim(g), -1, { cast: false, ao: false });
}

// ======================================================================== NEVASCA
const NEVE = {
  box(ctx, b, i) {
    const { M, T, add, map } = ctx, st = map.styles[b.c], e = EPS[i % 3];
    if (b.r === 'perim') {
      const conc = M('concrete', '#8f969e'), P = innerFace(b), s = 24, dk = M('steel', '#3d4248');
      add(conc, bc(b.x, 0, b.z, b.w, b.h, b.d, T(conc)), i);
      for (let a = -21; a <= 21; a += 6) add(M('concrete', '#80878f'), faceBox(P, a - 0.3, a + 0.3, 0, b.h, 0.18, 0.02, { tile: 2 }), i);
      add(dk, faceBox(P, -s, s, 0, 0.3, 0.05, 0.02, { tile: 1 }), i);
      return true;
    }
    if (b.r === 'bunker') {
      const conc = M('concrete', '#9aa1a6'), dk = M('panel', '#1d2024'), steel = M('metal', '#4b525a');
      add(conc, bc(b.x, b.y - e, b.z, b.w, b.h + e, b.d, T(conc)), i);
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const P = nx ? { axis: 'x', F: b.x + nx * b.w / 2, n: nx } : { axis: 'z', F: b.z + nz * b.d / 2, n: nz };
        add(dk, faceBox(P, -2.4, 2.4, 1.9, 2.15, 0.01, 0.0), i, { ao: false });
        add(conc, faceBox(P, -2.6, 2.6, 2.15, 2.3, 0.08, 0.0), i);
        if (nz) add(steel, faceBox(P, -0.55, 0.55, 0, 1.95, 0.03, 0.0, { tile: 1 }), i);
      }
      add(M('metal', '#3a3f45'), bc(b.x + 2.4, 3, b.z - 2.4, 0.08, 1.8, 0.08), i, { ao: false });
      return true;
    }
    if (b.r === 'parapet' || b.r === 'jersey') {
      const conc = M('concrete', b.r === 'jersey' ? '#a8adb1' : '#9aa1a6');
      if (b.r === 'jersey') {
        const alongX = b.w > b.d, t = alongX ? b.d : b.w;
        add(conc, alongX ? bc(b.x, 0, b.z, b.w, 0.3, t) : bc(b.x, 0, b.z, t, 0.3, b.d), i);
        add(conc, alongX ? bc(b.x, 0.3, b.z, b.w, b.h - 0.3, t * 0.55) : bc(b.x, 0.3, b.z, t * 0.55, b.h - 0.3, b.d), i);
        const stripe = once('jstripe', () => new THREE.MeshStandardMaterial({ color: '#c8402c', roughness: 0.6, vertexColors: true }));
        add(stripe, alongX ? bc(b.x, b.h - 0.22, b.z, b.w + 0.004, 0.1, t * 0.55 + 0.004) : bc(b.x, b.h - 0.22, b.z, t * 0.55 + 0.004, 0.1, b.d + 0.004), i, { ao: false });
      } else add(conc, bc(b.x, b.y - e, b.z, b.w + 2 * e, b.h + 2 * e, b.d + 2 * e, T(conc)), i);
      return true;
    }
    if (b.r === 'hut') {
      const wood = M('wood', '#6b4a32'), trim = M('wood', '#3f2b1d'), win = once('hutwin', () => new THREE.MeshStandardMaterial({ color: '#211a12', emissive: '#FFB45C', emissiveIntensity: 1.6, roughness: 0.3, vertexColors: true }));
      const wh = b.h - 0.8;
      add(wood, bc(b.x, 0, b.z, b.w, wh, b.d, T(wood)), i);
      for (const g of edgeBeams([b.x - b.w / 2, 0, b.z - b.d / 2], [b.x + b.w / 2, wh, b.z + b.d / 2], 0.12, 0.01, { tile: 1 })) add(trim, g, i);
      // telhado de duas aguas dentro do volume
      const roof = M('metal', '#4a3a30'), alongX = b.w >= b.d, L = alongX ? b.w : b.d, D = alongX ? b.d : b.w;
      const shape = new THREE.Shape(); shape.moveTo(-D / 2, 0); shape.lineTo(D / 2, 0); shape.lineTo(0, 0.8); shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false }); g.translate(0, 0, -L / 2);
      if (alongX) g.rotateY(Math.PI / 2);
      add(roof, prim(g, { p: [b.x, wh, b.z] }), i);
      for (const s of [-1, 1]) {
        const P = alongX ? { axis: 'z', F: b.z + s * b.d / 2, n: s } : { axis: 'x', F: b.x + s * b.w / 2, n: s };
        const c = alongX ? b.x : b.z;
        add(win, faceBox(P, c - 1.4, c - 0.5, 1.1, 1.8, 0.012, 0), i, { ao: false });
        add(trim, faceBox(P, c - 1.48, c - 0.42, 1.02, 1.1, 0.05, 0), i, { ao: false });
        add(trim, faceBox(P, c + 0.4, c + 1.4, 0, 2.05, 0.02, 0), i);
      }
      return true;
    }
    if (b.r === 'sandbag') {
      const bag = M('fabric', '#8c8466'), alongX = b.w >= b.d, L = alongX ? b.w : b.d, T0 = alongX ? b.d : b.w;
      const rows = 4, rh = b.h / rows;
      for (let r = 0; r < rows; r++) {
        const n = Math.floor(L / 0.62), off = (r % 2) * 0.31, w = L / n;
        for (let k = 0; k < n; k++) {
          const a = -L / 2 + w * (k + 0.5) + (r % 2 ? 0 : 0), aa = Math.min(L / 2 - w / 2, a + off - (r % 2 ? 0.31 : 0));
          const g = new THREE.SphereGeometry(0.5, 10, 6); g.scale(alongX ? w * 0.98 : T0 * 0.95, rh * 1.05, alongX ? T0 * 0.95 : w * 0.98);
          add(bag, prim(g, { p: alongX ? [b.x + aa, rh * (r + 0.5), b.z] : [b.x, rh * (r + 0.5), b.z + aa] }, 0.3), i);
        }
      }
      return true;
    }
    if (b.r === 'tank') {
      const m = M('metal', '#b7bec4'), dk = M('metal', '#4d545c'), r = Math.min(b.w, b.h) / 2 - 0.05;
      add(m, prim(new THREE.CylinderGeometry(r, r, b.d - 0.2, 24, 1), { p: [b.x, b.h - r, b.z], r: [Math.PI / 2, 0, 0] }, 0.5), i);
      for (const s of [-1, 1]) add(m, prim(new THREE.SphereGeometry(r, 20, 8, 0, TAU, 0, Math.PI / 2), { p: [b.x, b.h - r, b.z + s * (b.d / 2 - 0.1)], r: [s * Math.PI / 2, 0, 0], s: [1, 0.18 / r * 1.0, 1] }), i);
      for (const z of [b.z - b.d / 3, b.z + b.d / 3]) add(dk, bc(b.x, 0, z, b.w - 0.2, b.h - 2 * r + 0.3, 0.3), i);
      add(dk, bc(b.x, b.h - 0.08, b.z, 0.5, 0.08, 0.5), i, { ao: false });
      const hz = once('tankstripe', () => new THREE.MeshStandardMaterial({ color: '#c8402c', roughness: 0.5, vertexColors: true }));
      add(hz, prim(new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.25, 24, 1, true), { p: [b.x, b.h - r, b.z], r: [Math.PI / 2, 0, 0] }), i, { ao: false });
      return true;
    }
    if (b.r === 'crate') return crate(ctx, b, i), true;
    if (b.r === 'step') { stepBox(ctx, b, i, M('metal', '#2d3035')); return true; }
    if (b.r === 'rail') { railing(ctx, b, i, M('wood', '#4e3827'), null, { spacing: 1 }); return true; }
    if (b.r === 'leg' || b.r === 'slab') { plain(ctx, b, i); return true; }
    return false;
  },
  // neve em cima de tudo (so visual, rente ao topo)
  snow(ctx) {
    const { M, add, map } = ctx, sn = M('snow', '#F4F7FB');
    map.boxes.forEach((b, i) => {
      if (b.r === 'rail' || b.r === 'leg' || b.r === 'tank') return;
      if (b.r === 'hut') { NEVE.hutSnow(ctx, b, i, sn); return; }
      const top = b.y + b.h, o = b.r === 'perim' ? 0 : 0.02;
      const g = new THREE.BoxGeometry(b.w + o * 2, 0.08, b.d + o * 2, Math.max(1, Math.round(b.w / 1.2)), 1, Math.max(1, Math.round(b.d / 1.2)));
      const p = g.attributes.position, r = rng(i * 31 + 7);
      for (let k = 0; k < p.count; k++) if (p.getY(k) > 0) p.setY(k, 0.04 + (Math.abs(p.getX(k)) < b.w / 2 - 0.05 && Math.abs(p.getZ(k)) < b.d / 2 - 0.05 ? 0.03 + r() * 0.05 : -0.02));
      g.computeVertexNormals();
      add(sn, prim(g, { p: [b.x, top + 0.0, b.z] }, 0.5), i, { ao: false });
    });
    // montes de neve ao pe dos muros (baixinhos)
    const s = map.size / 2;
    for (const [x, z, w, d] of [[0, s - 0.5, map.size, 1.2], [0, -s + 0.5, map.size, 1.2], [s - 0.5, 0, 1.2, map.size], [-s + 0.5, 0, 1.2, map.size]]) {
      const g = new THREE.BoxGeometry(w, 0.3, d, Math.round(w / 1.5), 1, 2); const p = g.attributes.position, r = rng(Math.round(x * 7 + z * 13 + 99));
      for (let k = 0; k < p.count; k++) { const y = p.getY(k); if (y > 0) p.setY(k, 0.05 + r() * 0.2); else p.setY(k, -0.1); }
      g.computeVertexNormals();
      add(sn, prim(g, { p: [x, 0, z] }, 0.5), -1, { cast: false, ao: false });
    }
  },
  // neve nas duas aguas do telhado da cabana
  hutSnow(ctx, b, i, sn) {
    const alongX = b.w >= b.d, L = alongX ? b.w : b.d, D = alongX ? b.d : b.w, wh = b.h - 0.8, slope = Math.atan2(0.8, D / 2), len = Math.hypot(0.8, D / 2);
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(L + 0.1, 0.07, len + 0.06);
      const off = s * D / 4;
      const p = alongX ? [b.x, wh + 0.43, b.z + off] : [b.x + off, wh + 0.43, b.z];
      const r = alongX ? [s * slope, 0, 0] : [0, Math.PI / 2, -s * slope];
      ctx.add(sn, prim(g, { p, r: alongX ? r : [s * slope, Math.PI / 2, 0], o: alongX ? 'XYZ' : 'YXZ' }, 0.5), i, { ao: false });
    }
  },
  props(ctx) {
    const { M, add, W, rnd, group, Q, map } = ctx;
    // campo de neve e montanhas
    terrain(ctx, M('snow', '#EEF2F7'), map.size, 300, (x, z, d) => {
      const f = THREE.MathUtils.smoothstep(d, 4, 40);
      return f * (3 + 5 * Math.sin(x * 0.05) * Math.cos(z * 0.045)) + THREE.MathUtils.smoothstep(d, 70, 250) * 55 * (0.5 + 0.5 * Math.sin(Math.atan2(z, x) * 5 + 1));
    }, Q.decor >= 2 ? 120 : 72, Q.decor >= 2 ? 30 : 20);
    // pinheiros fora do muro
    const pine = M('plaster', '#24402f'), bark = M('wood', '#3b2a1e'), cap = M('snow', '#F4F7FB');
    const N = Q.decor >= 2 ? 70 : Q.decor >= 1 ? 44 : 24;
    for (let k = 0; k < N; k++) {
      const th = rnd() * TAU, r = 28 + rnd() * 46, x = Math.cos(th) * r, z = Math.sin(th) * r, hh = 7 + rnd() * 7, y0 = 1 + THREE.MathUtils.smoothstep(r - 25, 4, 40) * 3;
      add(bark, prim(new THREE.CylinderGeometry(0.15, 0.22, 2, 6), { p: [x, y0 + 0.6, z] }), -1, { ao: false });
      for (let l = 0; l < 3; l++) {
        const rr = (1 - l * 0.28) * hh * 0.28, y = y0 + 1.2 + l * hh * 0.24;
        add(pine, prim(new THREE.ConeGeometry(rr, hh * 0.42, 9), { p: [x, y + hh * 0.21, z] }), -1, { ao: false });
        add(cap, prim(new THREE.ConeGeometry(rr * 0.62, hh * 0.16, 9), { p: [x, y + hh * 0.36, z] }), -1, { ao: false, cast: false });
      }
    }
    // mastro de radio com luz piscando
    const mast = M('steel', '#b33a2a'), mastW = M('steel', '#e5e5e5');
    for (let k = 0; k < 10; k++) add(k % 2 ? mastW : mast, bc(-31, k * 3, 18, 0.35, 3, 0.35), -1, { ao: false });
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 0.3) });
    add(red, bc(-31, 30, 18, 0.4, 0.4, 0.4), -1, { ao: false, cast: false });
    W.updaters.push((t) => { red.color.setRGB(Math.sin(t * 2.5) > 0 ? 6 : 0.2, 0.3, 0.25); });
    // holofotes
    const pole = M('steel', '#5a6168'), lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 4.5, 4.2) });
    [[-22.5, 22.5], [22.5, -22.5], [22.5, 22.5], [-22.5, -22.5]].forEach(([x, z], k) => {
      add(pole, prim(new THREE.CylinderGeometry(0.07, 0.1, 6.5, 8), { p: [x, 3.25, z] }), -1);
      add(pole, bc(x, 6.4, z, 0.5, 0.35, 0.3), -1);
      add(lamp, bc(x - Math.sign(x) * 0.26, 6.42, z, 0.02, 0.28, 0.24), -1, { ao: false, cast: false });
      if (k < Q.lights) { const l = new THREE.PointLight('#E8F0FF', 10, 18, 2); l.position.set(x - Math.sign(x) * 0.8, 6.2, z - Math.sign(z) * 0.8); group.add(l); W.lights.push(l); }
    });
    W.probe = V(0, 4.2, 10);
  },
};

// ======================================================================== VILA
const SHUTTER = ['#2f6f8f', '#6d8f3f', '#8f3f2f', '#3f5f8f', '#8f6f2f'];
const VILA = {
  box(ctx, b, i) {
    const { M, T, add, map } = ctx, st = map.styles[b.c], e = EPS[i % 3];
    if (b.r === 'perim') {
      const pl = M('plaster', '#E9DCC4'), cap = M('rooftile', '#B4552F'), base = M('stone', '#b5a78e'), P = innerFace(b), s = 25;
      add(pl, bc(b.x, 0, b.z, b.w, b.h - 0.25, b.d, T(pl)), i);
      add(cap, bc(b.x, b.h - 0.25, b.z, b.w + 0.1, 0.25, b.d + 0.16, { tile: 1.6 }), i);
      add(base, faceBox(P, -s, s, 0, 0.5, 0.06, 0.02, { tile: 3 }), i);
      return true;
    }
    if (b.r === 'house') return VILA.house(ctx, b, i), true;
    if (b.r === 'parapet') {
      const pl = M('plaster', st.color), cap = M('stone', '#d9ceb8');
      add(pl, bc(b.x, b.y - e, b.z, b.w, b.h - 0.06, b.d, T(pl)), i);
      add(cap, bc(b.x, b.y + b.h - 0.06, b.z, b.w + 0.06, 0.06, b.d + 0.06, { tile: 2 }), i);
      return true;
    }
    if (b.r === 'step') { stepBox(ctx, b, i, M('stone', '#a89a82')); return true; }
    if (b.r === 'fountain') {
      const st2 = M('stone', '#CDBFA6'), rim = M('stone', '#b8aa90');
      add(st2, bc(b.x, 0, b.z, b.w, 0.6, b.d, { tile: 3 }), i);
      add(rim, bc(b.x, 0.6, b.z, b.w, 0.2, b.d, { tile: 3 }), i);
      const water = once('vwater', () => new THREE.MeshStandardMaterial({ color: '#2d5f6e', roughness: 0.05, metalness: 0.1, envMapIntensity: 1.3, transparent: true, opacity: 0.85 }));
      add(water, bx(b.x - b.w / 2 + 0.25, 0.62, b.z - b.d / 2 + 0.25, b.x + b.w / 2 - 0.25, 0.66, b.z + b.d / 2 - 0.25, { skip: TOP }), -1, { ao: false, cast: false });
      return true;
    }
    if (b.r === 'fountainCol') {
      const st2 = M('stone', '#d8ccb4');
      add(st2, prim(new THREE.CylinderGeometry(0.2, 0.24, b.h - 0.3, 14), { p: [b.x, (b.h - 0.3) / 2, b.z] }), i);
      add(st2, prim(new THREE.CylinderGeometry(0.25, 0.12, 0.3, 14), { p: [b.x, b.h - 0.15, b.z] }), i);
      W_emit(ctx, b);
      return true;
    }
    if (b.r === 'stall') {
      const wood = M('wood', '#8a5a34'), pole = M('wood', '#5d3b22');
      add(wood, bc(b.x, 0, b.z, b.w, b.h, b.d, T(wood)), i);
      const aw = once('awning', () => {
        const t = canvasTex(64, 64, (g, w, h) => { for (let x = 0; x < w; x += 16) { g.fillStyle = '#e8e2d6'; g.fillRect(x, 0, 8, h); g.fillStyle = '#c0392b'; g.fillRect(x + 8, 0, 8, h); } });
        t.wrapS = t.wrapT = THREE.RepeatWrapping; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide, vertexColors: true });
      });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(pole, bc(b.x + sx * (b.w / 2 - 0.05), 0, b.z + sz * (b.d / 2 - 0.05), 0.06, 2.3, 0.06), i, { ao: false });
      add(aw, prim(new THREE.PlaneGeometry(b.w + 0.2, b.d + 0.5), { p: [b.x, 2.3, b.z], r: [-Math.PI / 2 + 0.2, 0, 0] }), -1, { ao: false });
      // frutas na banca
      const fr = [M('plaster', '#d9822b'), M('plaster', '#c0392b'), M('plaster', '#e6c12e')];
      const r = rng(i);
      for (let k = 0; k < 24; k++) add(fr[k % 3], prim(new THREE.SphereGeometry(0.06, 8, 6), { p: [b.x + (r() - 0.5) * (b.w - 0.3), b.h + 0.05, b.z + (r() - 0.5) * (b.d - 0.3)] }), -1, { ao: false, cast: false });
      return true;
    }
    if (b.r === 'planter') {
      const st2 = M('stone', '#CDBFA6'), soil = M('sand', '#3b2a1e'), leaf = VILA.leafMat();
      add(st2, bc(b.x, 0, b.z, b.w, b.h, b.d, { tile: 3 }), i);
      add(soil, bx(b.x - b.w / 2 + 0.08, b.h - 0.08, b.z - b.d / 2 + 0.08, b.x + b.w / 2 - 0.08, b.h - 0.02, b.z + b.d / 2 - 0.08), -1, { ao: false });
      const r = rng(i * 3);
      for (let k = 0; k < Math.round(b.w * b.d * 10); k++) { const s = 0.25 + r() * 0.2; add(leaf, prim(new THREE.PlaneGeometry(s, s), { p: [b.x + (r() - 0.5) * (b.w - 0.2), b.h + s / 2 - 0.05, b.z + (r() - 0.5) * (b.d - 0.2)], r: [(r() - 0.5) * 0.6, r() * TAU, 0], o: 'YXZ' }), -1, { ao: false }); }
      return true;
    }
    if (b.r === 'pillar' || b.r === 'lintel') {
      const st2 = M('stone', '#CDBFA6');
      add(st2, bc(b.x, b.y - e, b.z, b.w, b.h + e, b.d, { tile: 3 }), i);
      if (b.r === 'pillar') { add(M('stone', '#b8aa90'), bc(b.x, 0, b.z, b.w + 0.1, 0.3, b.d + 0.1), i); add(M('stone', '#b8aa90'), bc(b.x, b.h - 0.2, b.z, b.w + 0.1, 0.2, b.d + 0.1), i); }
      return true;
    }
    if (b.r === 'car') {
      const paint = M('metal', '#3a86b8'), chrome = M('steel', '#c9ccd1'), tire = M('panel', '#141414'), gl = glassMaterial('#20303a', 0.75, { rough: 0.05 });
      const alongZ = b.d > b.w;
      add(paint, bc(b.x, 0.3, b.z, b.w, 0.62, b.d, { tile: 2 }), i);
      add(paint, bc(b.x, 0.92, b.z + (alongZ ? 0.2 : 0), b.w - 0.12, 0.44, alongZ ? b.d * 0.5 : b.w), i);
      add(gl, bc(b.x, 0.95, b.z + (alongZ ? 0.2 : 0), b.w - 0.1, 0.38, alongZ ? b.d * 0.5 - 0.06 : b.w), -1, { ao: false, cast: false });
      add(chrome, bc(b.x, 0.28, b.z - b.d / 2 + 0.03, b.w + 0.04, 0.1, 0.06), i, { ao: false });
      add(chrome, bc(b.x, 0.28, b.z + b.d / 2 - 0.03, b.w + 0.04, 0.1, 0.06), i, { ao: false });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(tire, prim(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16), { p: [b.x + sx * (b.w / 2 - 0.1), 0.3, b.z + sz * (b.d / 2 - 0.7)], r: [0, 0, Math.PI / 2] }), i);
      const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.4, 2) });
      for (const sx of [-1, 1]) add(lamp, prim(new THREE.CircleGeometry(0.08, 12), { p: [b.x + sx * 0.6, 0.65, b.z - b.d / 2 - 0.002], r: [0, Math.PI, 0] }), -1, { ao: false, cast: false });
      return true;
    }
    if (b.r === 'crate') return crate(ctx, b, i), true;
    if (b.r === 'belltower') {
      const pl = M('plaster', '#F4EFE6'), stn = M('stone', '#c9bca4'), roof = M('rooftile', '#B4552F'), dk = M('panel', '#15161a');
      add(pl, bc(b.x, 0, b.z, b.w, b.h - 2.2, b.d, T(pl)), i);
      add(stn, bc(b.x, b.h - 4.6, b.z, b.w + 0.1, 0.25, b.d + 0.1, { tile: 2 }), i);
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const P = nx ? { axis: 'x', F: b.x + nx * b.w / 2, n: nx } : { axis: 'z', F: b.z + nz * b.d / 2, n: nz }, c = nx ? b.z : b.x;
        add(dk, faceBox(P, c - 0.55, c + 0.55, b.h - 4.2, b.h - 2.7, 0.005, 0), i, { ao: false });
        add(stn, faceBox(P, c - 0.7, c + 0.7, b.h - 4.3, b.h - 4.2, 0.05, 0), i);
      }
      const g = new THREE.ConeGeometry(b.w * 0.74, 2.2, 4, 1); g.rotateY(Math.PI / 4);
      add(roof, prim(g, { p: [b.x, b.h - 1.1, b.z] }, 0.4), i);
      add(M('steel', '#8a6a2a'), prim(new THREE.CylinderGeometry(0.28, 0.4, 0.55, 14, 1, true), { p: [b.x, b.h - 3.2, b.z] }), -1, { ao: false });
      return true;
    }
    return false;
  },
  leafMat() { return once('vleaf', () => new THREE.MeshStandardMaterial({ map: leafTexV(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, vertexColors: true })); },
  house(ctx, b, i) {
    const { M, T, add, map } = ctx, st = map.styles[b.c], e = EPS[i % 3];
    const flat = map.boxes.some((o) => o.r === 'parapet' && o.c === b.c && Math.abs(o.y - b.h) < 0.01 && Math.abs(o.x - b.x) < b.w && Math.abs(o.z - b.z) < b.d);
    const pl = M('plaster', st.color), base = M('stone', '#a89a82'), trim = M('plaster', shade(st.color, 0.86));
    const wh = flat ? b.h : b.h - 1.1;
    add(pl, bc(b.x, 0, b.z, b.w, wh, b.d, T(pl)), i);
    add(base, bc(b.x, 0, b.z, b.w + 0.04, 0.4, b.d + 0.04, { tile: 3 }), i);
    add(trim, bc(b.x, wh - 0.15, b.z, b.w + 0.06, 0.15, b.d + 0.06, { tile: 2 }), i);
    if (!flat) {
      // telhado de 4 aguas dentro do volume
      const roof = M('rooftile', '#B4552F');
      const g = new THREE.ConeGeometry(1, 1.1, 4, 1); g.rotateY(Math.PI / 4); g.scale(b.w * 0.72, 1, b.d * 0.72);
      add(roof, prim(g, { p: [b.x, wh + 0.55, b.z] }, 2.5), i);
    }
    const sh = M('wood', SHUTTER[i % SHUTTER.length]), dk = once('vwin', () => glassMaterial('#1a232b', 0.9, { rough: 0.08 })), sill = M('stone', '#d9ceb8'), door = M('wood', '#6a4128');
    const floors = wh > 3.8 ? 2 : 1;
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const P = nx ? { axis: 'x', F: b.x + nx * b.w / 2, n: nx } : { axis: 'z', F: b.z + nz * b.d / 2, n: nz };
      const L = nx ? b.d : b.w, c = nx ? b.z : b.x, nw = Math.max(1, Math.floor(L / 2.4));
      // encostado no muro do mapa? nao desenha janelas
      const face = nx ? b.x + nx * b.w / 2 : b.z + nz * b.d / 2;
      if (Math.abs(face) > map.size / 2 - 1.2) continue;
      for (let f = 0; f < floors; f++) for (let k = 0; k < nw; k++) {
        const a = c - L / 2 + L * (k + 0.5) / nw, y0 = f ? wh - 1.75 : 1.0;
        if (f === 0 && k === (i + nw) % nw && nw > 1 && (nz === 1 || nx === 1)) {
          add(door, faceBox(P, a - 0.5, a + 0.5, 0.02, 2.1, 0.01, 0), i, { ao: false });
          add(sill, faceBox(P, a - 0.62, a + 0.62, 2.1, 2.2, 0.04, 0), i, { ao: false });
          continue;
        }
        add(dk, faceBox(P, a - 0.38, a + 0.38, y0, y0 + 1.15, 0.004, 0), -1, { ao: false, cast: false });
        add(sill, faceBox(P, a - 0.48, a + 0.48, y0 - 0.08, y0, 0.05, 0), i, { ao: false });
        for (const s of [-1, 1]) add(sh, faceBox(P, a + s * 0.4 - (s > 0 ? 0 : 0.42) + (s > 0 ? 0 : 0), a + s * 0.4 + (s > 0 ? 0.42 : 0), y0 - 0.02, y0 + 1.17, 0.03, 0), i, { ao: false });
      }
    }
  },
  props(ctx) {
    const { M, add, W, rnd, group, Q, map } = ctx;
    // morro com casinhas ao fundo
    terrain(ctx, M('sand', '#9c8f6a'), map.size, 300, (x, z, d) => THREE.MathUtils.smoothstep(d, 2, 60) * (4 + 8 * (0.5 + 0.5 * Math.sin(x * 0.03 + 1) * Math.cos(z * 0.025))) + THREE.MathUtils.smoothstep(d, 60, 240) * 30, Q.decor >= 2 ? 110 : 64, Q.decor >= 2 ? 26 : 18);
    const cols = ['#E7B8A0', '#F0DA9A', '#A7C9D9', '#F2EDE2', '#C9D8A6', '#E9C6D6'];
    const N = Q.decor >= 2 ? 150 : Q.decor >= 1 ? 90 : 50;
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const im = new THREE.InstancedMesh(geo, mat, N), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.72, 0.5, 4, 1).rotateY(Math.PI / 4).translate(0, 0.25, 0), new THREE.MeshStandardMaterial({ color: '#B4552F', roughness: 0.8 }), N);
    for (let k = 0; k < N; k++) {
      const th = rnd() * TAU, r = 34 + rnd() * 70, d = r - 26, y = THREE.MathUtils.smoothstep(d, 2, 60) * (4 + 8 * (0.5 + 0.5 * Math.sin(Math.cos(th) * r * 0.03 + 1) * Math.cos(Math.sin(th) * r * 0.025))) - 0.5;
      const w = 3 + rnd() * 4, h = 3 + rnd() * 4, dd = 3 + rnd() * 4;
      p.set(Math.cos(th) * r, y, Math.sin(th) * r); q.setFromAxisAngle(V(0, 1, 0), rnd() * TAU); sc.set(w, h, dd);
      m4.compose(p, q, sc); im.setMatrixAt(k, m4); im.setColorAt(k, c.set(cols[k % cols.length]));
      m4.compose(p.setY(y + h), q, sc.set(w, 2.2 + rnd(), dd)); roofs.setMatrixAt(k, m4);
    }
    im.frustumCulled = false; roofs.frustumCulled = false; group.add(im, roofs);
    // ciprestes
    const cyp = M('plaster', '#2e4a2c');
    for (let k = 0; k < (Q.decor >= 1 ? 26 : 12); k++) {
      const th = rnd() * TAU, r = 28 + rnd() * 20, x = Math.cos(th) * r, z = Math.sin(th) * r, hh = 7 + rnd() * 5;
      const g = new THREE.SphereGeometry(1, 10, 8); g.scale(0.9, hh / 2, 0.9);
      add(cyp, prim(g, { p: [x, hh / 2 + 0.5, z] }), -1, { ao: false });
    }
    // varais entre as casas
    const cloth = [M('fabric', '#e8e2d6'), M('fabric', '#c0392b'), M('fabric', '#2f6f8f'), M('fabric', '#e6c12e')], wire = M('steel', '#555');
    const lines = [[-6, 4.3, 12.6, 1.2, 4.3, 12.6], [13, 4.1, 12.4, 13, 4.1, 14.4], [-12.4, 4.6, 11.6, -12.4, 4.6, 13.8]];
    for (const L of lines) for (const s of [1, -1]) {
      const a = V(L[0] * s, L[1], L[2] * s), bb = V(L[3] * s, L[4], L[5] * s);
      add(wire, beam(a, bb, 0.008), -1, { ao: false, cast: false });
      const n = Math.floor(a.distanceTo(bb) / 0.7);
      for (let k = 1; k < n; k++) { const pp = a.clone().lerp(bb, k / n); add(cloth[k % 4], prim(new THREE.PlaneGeometry(0.45, 0.6), { p: [pp.x, pp.y - 0.32, pp.z], r: [0, Math.atan2(bb.x - a.x, bb.z - a.z) + Math.PI / 2, 0] }), -1, { ao: false }); }
    }
    // vasos de flores nas platibandas
    const pot = M('plaster', '#b0643c'), fl = [M('plaster', '#d63a6a'), M('plaster', '#f2c14e'), M('plaster', '#e8e2d6')];
    let k = 0;
    for (const b of map.boxes) {
      if (b.r !== 'parapet') continue;
      const alongX = b.w > b.d, L = alongX ? b.w : b.d;
      for (let a = -L / 2 + 0.8; a < L / 2 - 0.5; a += 2.2) {
        const x = b.x + (alongX ? a : 0), z = b.z + (alongX ? 0 : a), y = b.y + b.h;
        add(pot, prim(new THREE.CylinderGeometry(0.13, 0.1, 0.2, 10), { p: [x, y + 0.1, z] }), -1, { ao: false, cast: false });
        for (let j = 0; j < 5; j++) add(fl[(k + j) % 3], prim(new THREE.SphereGeometry(0.05, 6, 5), { p: [x + (rnd() - 0.5) * 0.18, y + 0.24 + rnd() * 0.06, z + (rnd() - 0.5) * 0.18] }), -1, { ao: false, cast: false });
        k++;
      }
    }
    W.probe = V(0, 2.2, -9);
  },
};
function leafTexV() {
  return canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { g.fillStyle = ['#3d6b2e', '#4f8a38', '#2f5a24'][i % 3]; g.beginPath(); g.ellipse(8 + (i * 23) % 48, 10 + (i * 17) % 44, 9, 5, i, 0, TAU); g.fill(); }
    g.fillStyle = '#d63a6a'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(10 + (i * 29) % 44, 12 + (i * 19) % 40, 3.5, 0, TAU); g.fill(); }
  });
}
// agua da fonte: jatinho de particulas (usa o emissor de vapor com outra cor) -> so um brilho estatico simples
function W_emit(ctx, b) { ctx.W.emitters.push({ kind: 'fountain', p: V(b.x, b.h, b.z) }); }

// ======================================================================== DUELO
const DUELO = {
  box(ctx, b, i) {
    const { M, T, add, map } = ctx, st = map.styles[b.c], e = EPS[i % 3];
    const team = (z) => tubeMat(z > 0 ? '#FF6A3D' : '#3DA8FF', 3);
    if (b.r === 'perim') {
      const pan = M('panel', '#3a3f4a'), P = innerFace(b), s = 15;
      add(pan, bc(b.x, 0, b.z, b.w, b.h, b.d, T(pan)), i);
      const zc = P.axis === 'z' ? P.F : 0;
      if (P.axis === 'z') { add(team(zc), faceBox(P, -s, s, 0.6, 0.66, 0.03, 0), i, { ao: false, cast: false }); add(team(zc), faceBox(P, -s, s, 4.6, 4.66, 0.03, 0), i, { ao: false, cast: false }); }
      else for (const [a0, a1] of [[-15, 0], [0, 15]]) { const t = tubeMat(a0 < 0 ? '#3DA8FF' : '#FF6A3D', 3); add(t, faceBox(P, a0, a1, 0.6, 0.66, 0.03, 0), i, { ao: false, cast: false }); add(t, faceBox(P, a0, a1, 4.6, 4.66, 0.03, 0), i, { ao: false, cast: false }); }
      add(M('metal', '#22252c'), faceBox(P, -s, s, 5.7, 6, 0.1, 0), i);
      return true;
    }
    if (b.r === 'block') {
      plain(ctx, b, i);
      const t = team(b.z || 0.001), x0 = b.x - b.w / 2 - 0.01, x1 = b.x + b.w / 2 + 0.01, z0 = b.z - b.d / 2 - 0.01, z1 = b.z + b.d / 2 + 0.01, y = b.h;
      if (Math.abs(b.z) < 0.01) { add(tubeMat('#ffffff', 2.4), bx(x0, y - 0.04, z0, x1, y, z1), i, { ao: false, cast: false }); }
      else for (const [xa, xb, za, zb] of [[x0, x1, z0, z0 + 0.03], [x0, x1, z1 - 0.03, z1], [x0, x0 + 0.03, z0, z1], [x1 - 0.03, x1, z0, z1]]) add(t, bx(xa, y - 0.04, za, xb, y, zb), i, { ao: false, cast: false });
      return true;
    }
    if (b.r === 'deck' || b.r === 'parapet' || b.r === 'step') {
      plain(ctx, b, i);
      if (b.r === 'step') nosing(ctx, b, i, team(b.z), 0.03, 0.01);
      else if (b.r === 'deck') { const z = b.z - Math.sign(b.z) * b.d / 2; add(team(b.z), bx(b.x - b.w / 2, b.h - 0.05, Math.min(z, z + Math.sign(b.z) * 0.03) - 0.01, b.x + b.w / 2, b.h, Math.max(z, z + Math.sign(b.z) * 0.03)), i, { ao: false, cast: false }); }
      return true;
    }
    if (b.r === 'crate') return crate(ctx, b, i), true;
    return false;
  },
  props(ctx) {
    const { M, add, W, group, Q, map } = ctx;
    // chao dividido por time e linha central
    const half = (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, transparent: true, opacity: 0.18, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
    add(half('#FF6A3D'), bx(-15, -0.1, 0.1, 15, 0.004, 15, { skip: TOP }), -1, { cast: false, ao: false });
    add(half('#3DA8FF'), bx(-15, -0.1, -15, 15, 0.004, -0.1, { skip: TOP }), -1, { cast: false, ao: false });
    add(tubeMat('#ffffff', 2), bx(-15, -0.1, -0.05, 15, 0.006, 0.05, { skip: TOP }), -1, { cast: false, ao: false });
    // barras de luz no alto
    const bar = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.3, 3.6) }), frame = M('metal', '#1d2027');
    for (let x = -12; x <= 12; x += 6) { add(frame, bx(x - 0.15, 7.6, -15, x + 0.15, 7.9, 15), -1, { ao: false }); add(bar, bx(x - 0.1, 7.56, -14, x + 0.1, 7.6, 14), -1, { ao: false, cast: false }); }
    const cage = M('metal', '#2a2e36');
    for (let z = -15; z <= 15; z += 3) add(cage, bx(-15, 7.9, z - 0.05, 15, 8.0, z + 0.05), -1, { ao: false });
    // placar gigante nas pontas
    for (const s of [-1, 1]) {
      const tm = new THREE.MeshBasicMaterial({ map: paintTex('FRAG · DUELO', s > 0 ? '#FF8A5D' : '#6DC0FF', null, 1024, 128), transparent: true, color: new THREE.Color(1.6, 1.6, 1.6) });
      add(tm, prim(new THREE.PlaneGeometry(12, 1.5), { p: [0, 3.6, s * 14.94], r: [0, s > 0 ? Math.PI : 0, 0] }), -1, { ao: false, cast: false });
    }
    for (let k = 0; k < Math.min(Q.lights, 4); k++) { const l = new THREE.PointLight(k % 2 ? '#FF7A4D' : '#4DB0FF', 10, 16, 2); l.position.set(k < 2 ? -8 : 8, 4, k % 2 ? 9 : -9); group.add(l); W.lights.push(l); }
    W.reflect = { y: 0, entries: [{ mat: W.groundMat, strength: 0.6 }] };
    W.probe = V(0, 2, 6);
  },
};

export const BUILD2 = { porto: PORTO, nevasca: NEVE, vila: VILA, duelo: DUELO };
