// FRAG - utilitarios de geometria: caixas com UV de mundo e subdivisao, primitivas com cor de vertice,
// lotes por material (poucas chamadas de desenho) e oclusao ambiente assada nos vertices.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const FACES = [
  // normal, eixo u, eixo v (em coordenadas do mundo)
  { n: [1, 0, 0], u: 2, us: -1, v: 1 }, { n: [-1, 0, 0], u: 2, us: 1, v: 1 },
  { n: [0, 1, 0], u: 0, us: 1, v: 2, vs: -1 }, { n: [0, -1, 0], u: 0, us: 1, v: 2 },
  { n: [0, 0, 1], u: 0, us: 1, v: 1 }, { n: [0, 0, -1], u: 0, us: -1, v: 1 },
];
// caixa alinhada aos eixos; opts: { tile, seg, skip: Set de indices de face (0..5), uvOff }
export function box(min, max, opts = {}) {
  const tile = opts.tile || 2, seg = opts.seg || 1.5, off = opts.uvOff || [0, 0], tu = opts.tu || tile, tv = opts.tv || tile;
  const pos = [], nor = [], uv = [];
  FACES.forEach((f, fi) => {
    if (opts.skip && opts.skip.has(fi)) return;
    const axis = f.n[0] ? 0 : f.n[1] ? 1 : 2, side = f.n[axis] > 0 ? max[axis] : min[axis];
    const ua = f.u, va = f.v;
    const nu = Math.max(1, Math.ceil((max[ua] - min[ua]) / seg)), nv = Math.max(1, Math.ceil((max[va] - min[va]) / seg));
    const P = (i, j) => {
      const p = [0, 0, 0]; p[axis] = side;
      p[ua] = min[ua] + (max[ua] - min[ua]) * i / nu; p[va] = min[va] + (max[va] - min[va]) * j / nv;
      return p;
    };
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      // winding: garantir que a normal geometrica bata com f.n
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const flip = cr[0] * f.n[0] + cr[1] * f.n[1] + cr[2] * f.n[2] < 0;
      const quad = flip ? [a, d, c, a, c, b] : [a, b, c, a, c, d];
      for (const p of quad) {
        pos.push(p[0], p[1], p[2]); nor.push(f.n[0], f.n[1], f.n[2]);
        uv.push((p[ua] * (f.us || 1)) / (va === 1 ? tu : tile) + off[0], (p[va] * (f.vs || 1)) / (va === 1 ? tv : tile) + off[1]);
      }
    }
  });
  return finish(pos, nor, uv);
}
function finish(pos, nor, uv) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
  return g;
}
export const bx = (x0, y0, z0, x1, y1, z1, opts) => box([x0, y0, z0], [x1, y1, z1], opts);
// caixa por centro/tamanho (y = base)
export const bc = (x, y, z, w, h, d, opts) => box([x - w / 2, y, z - d / 2], [x + w / 2, y + h, z + d / 2], opts);

// primitiva three -> nao indexada com cor; m = Matrix4 ou {p:[x,y,z], r:[x,y,z], s:[x,y,z]}; uvScale escala a UV original
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function prim(geo, t = {}, uvScale = 1) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g === geo) g = geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (uvScale !== 1) { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * uvScale, a.getY(i) * uvScale); }
  if (t.isMatrix4) g.applyMatrix4(t);
  else {
    _e.set(...(t.r || [0, 0, 0]), t.o || 'XYZ'); _q.setFromEuler(_e);
    _m.compose(_v.set(...(t.p || [0, 0, 0])), _q, _s.set(...(t.s || [1, 1, 1])));
    g.applyMatrix4(_m);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  geo.dispose();
  return g;
}
export function tint(g, c) { const col = g.attributes.color; for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * c, col.getY(i) * c, col.getZ(i) * c); return g; }

// ------------------------------------------------------------------ lotes por material
export class Batch {
  constructor() { this.groups = new Map(); }
  add(mat, geo, info = {}) {
    if (!mat || !geo) return;
    const key = mat.uuid;
    if (!this.groups.has(key)) this.groups.set(key, { mat, list: [] });
    this.groups.get(key).list.push({ geo, owner: info.owner ?? -1, ao: info.ao !== false, cast: info.cast !== false, recv: info.recv !== false });
  }
  // coleta vertices para o bake de AO
  bake(aabbs, opts) { for (const g of this.groups.values()) for (const it of g.list) if (it.ao) bakeAO(it.geo, aabbs, it.owner, opts); }
  build(parent) {
    const meshes = [];
    for (const { mat, list } of this.groups.values()) {
      for (const cast of [true, false]) {
        const part = list.filter((x) => x.cast === cast);
        if (!part.length) continue;
        const merged = mergeGeometries(part.map((x) => x.geo), false);
        part.forEach((x) => x.geo.dispose());
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = cast && !mat.transparent; mesh.receiveShadow = true;
        if (mat.transparent) mesh.renderOrder = 5;
        parent.add(mesh); meshes.push(mesh);
      }
    }
    this.groups.clear();
    return meshes;
  }
}

// ------------------------------------------------------------------ oclusao ambiente por vertice
// grade espacial das caixas para consulta rapida
export function makeGrid(aabbs, cell = 3) {
  const grid = new Map();
  aabbs.forEach((b, i) => {
    for (let x = Math.floor(b.minx / cell); x <= Math.floor(b.maxx / cell); x++)
      for (let z = Math.floor(b.minz / cell); z <= Math.floor(b.maxz / cell); z++) {
        const k = x + ',' + z; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
      }
  });
  return { grid, cell, aabbs };
}
export function bakeAO(geo, G, owner, opts = {}) {
  const R = opts.radius || 1.3, strength = opts.strength || 0.75;
  const pos = geo.attributes.position, nor = geo.attributes.normal, col = geo.attributes.color;
  const seen = new Set();
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i), nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    const qx = px + nx * 0.03, qy = py + ny * 0.03, qz = pz + nz * 0.03;
    let occ = 0;
    if (qy < R && ny < 0.5) occ += Math.pow(1 - Math.max(0, qy) / R, 2) * 0.55;
    seen.clear();
    const c = G.cell;
    for (let gx = Math.floor((qx - R) / c); gx <= Math.floor((qx + R) / c); gx++)
      for (let gz = Math.floor((qz - R) / c); gz <= Math.floor((qz + R) / c); gz++) {
        const list = G.grid.get(gx + ',' + gz); if (!list) continue;
        for (const bi of list) {
          if (bi === owner || seen.has(bi)) continue; seen.add(bi);
          const b = G.aabbs[bi];
          const cx = Math.max(b.minx, Math.min(qx, b.maxx)), cy = Math.max(b.miny, Math.min(qy, b.maxy)), cz = Math.max(b.minz, Math.min(qz, b.maxz));
          const dx = cx - qx, dy = cy - qy, dz = cz - qz, d = Math.hypot(dx, dy, dz);
          if (d >= R) continue;
          const facing = d > 1e-4 ? Math.max(0, (dx * nx + dy * ny + dz * nz) / d) : 1;
          occ += Math.pow(1 - d / R, 2) * (0.25 + 0.75 * facing) * 0.8;
        }
      }
    const ao = 1 - Math.min(1, occ) * strength;
    col.setXYZ(i, col.getX(i) * ao, col.getY(i) * ao, col.getZ(i) * ao);
  }
}
