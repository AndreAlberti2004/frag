// FRAG - texturas PBR procedurais (albedo sRGB + normal + ORM: oclusao/rugosidade/metal).
// A estrutura (relevo, mascaras) e calculada uma vez por tipo e resolucao; a cor e aplicada por cima.
import * as THREE from 'three';

// ------------------------------------------------------------------ ruido tileavel
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, p, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
// fbm tileavel em [0,1)^2 -> array res*res
function fbm(res, base, oct, seed, gain = 0.5, warp = 0) {
  const out = new Float32Array(res * res);
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    let u = x / res, v = y / res;
    if (warp) { u += warp * vnoise(u * 4, v * 4, 4, seed + 91) * 0.25; v += warp * vnoise(u * 4 + 7, v * 4, 4, seed + 92) * 0.25; }
    let f = base, a = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) { sum += a * vnoise(u * f, v * f, f, seed + o * 17); norm += a; a *= gain; f *= 2; }
    out[y * res + x] = sum / norm;
  }
  return out;
}
// voronoi tileavel: F1, F2 e id da celula
function voronoi(res, n, seed, jitter = 0.85) {
  const d1 = new Float32Array(res * res), d2 = new Float32Array(res * res), id = new Float32Array(res * res);
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    const u = x / res * n, v = y / res * n, cx = Math.floor(u), cy = Math.floor(v);
    let b1 = 9, b2 = 9, bid = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j, wx = ((gx % n) + n) % n, wy = ((gy % n) + n) % n;
      const px = gx + 0.5 + (hash(wx, wy, seed) - 0.5) * jitter, py = gy + 0.5 + (hash(wx, wy, seed + 5) - 0.5) * jitter;
      const d = Math.hypot(px - u, py - v);
      if (d < b1) { b2 = b1; b1 = d; bid = hash(wx, wy, seed + 9); } else if (d < b2) b2 = d;
    }
    const k = y * res + x; d1[k] = b1; d2[k] = b2; id[k] = bid;
  }
  return { d1, d2, id };
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ estruturas (relevo + mascaras)
// cada uma devolve { h: altura, c: variacao de cor [-1,1], r: rugosidade [0,1], ao: cavidade, m: metal, tint: array opcional de 3 canais }
const STRUCT = {
  sandstone(R) {
    const n = fbm(R, 4, 5, 11), f = fbm(R, 16, 3, 12), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R);
    const rows = 4, cols = 2, mort = 0.022;
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const u = x / R, v = y / R, row = Math.floor(v * rows), off = (row % 2) * 0.5;
      const bu = (u * cols + off) % 1, bv = (v * rows) % 1, col = Math.floor(u * cols + off);
      const e = Math.min(bu, 1 - bu) / cols * 2, g = Math.min(bv, 1 - bv) / rows * 2;
      const edge = Math.min(e * 2, g);
      const k = y * R + x, id = hash(col % cols, row, 3);
      const m = sstep(mort * 0.6, mort * 1.6, edge);
      h[k] = m * (0.7 + 0.3 * n[k]) + 0.05 * f[k] - (1 - sstep(0, 0.05, edge + n[k] * 0.02)) * 0.1;
      c[k] = (id - 0.5) * 0.2 + n[k] * 0.22 + f[k] * 0.12 - (1 - m) * 0.28;
      r[k] = 0.82 + f[k] * 0.1; ao[k] = 0.55 + 0.45 * m;
    }
    return { h, c, r, ao, hs: 3.2 };
  },
  stone(R) {
    const vo = voronoi(R, 6, 21, 0.9), n = fbm(R, 8, 4, 22), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R);
    for (let k = 0; k < R * R; k++) {
      const e = vo.d2[k] - vo.d1[k], m = sstep(0.02, 0.09, e);
      h[k] = m * (0.8 + 0.2 * n[k]); c[k] = (vo.id[k] - 0.5) * 0.4 + n[k] * 0.2 - (1 - m) * 0.4;
      r[k] = 0.72 + 0.15 * n[k] + (1 - m) * 0.15; ao[k] = 0.5 + 0.5 * m;
    }
    return { h, c, r, ao, hs: 3 };
  },
  sand(R) {
    const n = fbm(R, 3, 4, 31, 0.5, 1), g = fbm(R, 64, 2, 32), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R);
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const k = y * R + x, u = x / R, v = y / R;
      const rip = Math.sin((v * 9 + n[k] * 1.2 + u * 1) * Math.PI * 2);
      h[k] = rip * 0.35 + n[k] * 0.6 + g[k] * 0.12;
      c[k] = n[k] * 0.3 + g[k] * 0.18 + rip * 0.06; r[k] = 0.95; ao[k] = 0.85 + 0.15 * rip;
    }
    return { h, c, r, ao, hs: 1.4 };
  },
  plaster(R) {
    const n = fbm(R, 3, 6, 41, 0.55), s = fbm(R, 24, 2, 42), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R);
    for (let k = 0; k < R * R; k++) { h[k] = n[k] * 0.35 + s[k] * 0.12; c[k] = n[k] * 0.28 + s[k] * 0.06; r[k] = 0.86 + n[k] * 0.08; ao[k] = 1; }
    return { h, c, r, ao, hs: 1.5 };
  },
  wood(R) {
    const n = fbm(R, 4, 4, 51), gr = new Float32Array(R * R), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R);
    const planks = 5;
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const k = y * R + x, u = x / R, v = y / R, p = Math.floor(v * planks), pv = (v * planks) % 1;
      const id = hash(p, 0, 7), grain = vnoise(u * 3 + id * 10, v * 60 + n[k] * 3, 60, 53 + p) * 0.5 + vnoise(u * 12, v * 180 + n[k] * 6, 180, 54 + p) * 0.35;
      const gap = sstep(0, 0.05, Math.min(pv, 1 - pv));
      h[k] = gap * (0.6 + 0.15 * grain); c[k] = (id - 0.5) * 0.45 + grain * 0.35 + n[k] * 0.1 - (1 - gap) * 0.5;
      r[k] = 0.68 + grain * 0.12; ao[k] = 0.4 + 0.6 * gap; gr[k] = grain;
    }
    return { h, c, r, ao, hs: 2.2 };
  },
  metal(R) {
    const n = fbm(R, 6, 5, 61), s = fbm(R, 3, 3, 62), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R), m = new Float32Array(R * R);
    // riscos
    const scr = new Float32Array(R * R); let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 90; i++) {
      let x = rnd() * R, y = rnd() * R; const a = rnd() * 6.28, L = 10 + rnd() * R * 0.25;
      for (let t = 0; t < L; t++) { const xi = ((Math.floor(x) % R) + R) % R, yi = ((Math.floor(y) % R) + R) % R; scr[yi * R + xi] = 1; x += Math.cos(a); y += Math.sin(a); }
    }
    for (let k = 0; k < R * R; k++) {
      const sc = scr[k];
      h[k] = n[k] * 0.08 - sc * 0.15; c[k] = s[k] * 0.18 + n[k] * 0.06 + sc * 0.35;
      r[k] = 0.5 + s[k] * 0.12 + n[k] * 0.05 - sc * 0.2; ao[k] = 1; m[k] = 0.25 + sc * 0.6;
    }
    return { h, c, r, ao, m, hs: 1 };
  },
  steel(R) {
    const h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R), m = new Float32Array(R * R);
    const s = fbm(R, 4, 3, 71);
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const k = y * R + x, st = vnoise(x / R * 2, y / R * 256, 256, 72) * 0.6 + vnoise(x / R * 4, y / R * 64, 64, 73) * 0.4;
      h[k] = st * 0.05; c[k] = st * 0.08 + s[k] * 0.06; r[k] = 0.32 + st * 0.08 + s[k] * 0.06; ao[k] = 1; m[k] = 1;
    }
    return { h, c, r, ao, m, hs: 1 };
  },
  concrete(R) {
    const n = fbm(R, 4, 6, 81, 0.55), p = fbm(R, 48, 2, 82), st = fbm(R, 2, 3, 83), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R);
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const k = y * R + x, u = x / R, v = y / R;
      const seam = Math.min(sstep(0, 0.006, Math.min(u, 1 - u)), sstep(0, 0.006, Math.min(v, 0.5 - Math.abs(v - 0.5)) + 0.006));
      const hx = ((u * 4) % 1) - 0.5, hy = ((v * 2) % 1) - 0.5, hole = sstep(0.018, 0.028, Math.hypot(hx * 0.25, hy * 0.5));
      const pore = p[k] > 0.62 ? 0 : 1;
      h[k] = n[k] * 0.2 + seam * 0.4 + hole * 0.3 - (1 - pore) * 0.1;
      c[k] = n[k] * 0.2 + st[k] * 0.25 - (1 - seam) * 0.25 - (1 - hole) * 0.4 - (1 - pore) * 0.15;
      r[k] = 0.84 + n[k] * 0.08; ao[k] = Math.min(seam, hole) * 0.5 + 0.5;
    }
    return { h, c, r, ao, hs: 2 };
  },
  asphalt(R) {
    const n = fbm(R, 3, 5, 91, 0.55, 1), g = fbm(R, 96, 2, 92), pud = fbm(R, 2, 4, 93, 0.5, 1.5), cr = voronoi(R, 5, 94, 1);
    const h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R);
    for (let k = 0; k < R * R; k++) {
      const crack = 1 - sstep(0.0, 0.015, cr.d2[k] - cr.d1[k]) * (n[k] > 0.1 ? 1 : 0);
      const wet = sstep(0.05, 0.18, pud[k]);
      h[k] = g[k] * 0.35 * (1 - wet) + n[k] * 0.15 - crack * 0.3;
      c[k] = g[k] * 0.25 + n[k] * 0.2 - wet * 0.25 - crack * 0.3;
      r[k] = 0.62 - wet * 0.55 + g[k] * 0.08; ao[k] = 1 - crack * 0.4;
    }
    return { h, c, r, ao, hs: 1.2, wet: true };
  },
  panel(R) {
    const n = fbm(R, 5, 4, 101), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R), m = new Float32Array(R * R);
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const k = y * R + x, u = x / R, v = y / R;
      const pu = (u * 2) % 1, pv = (v * 2) % 1, id = hash(Math.floor(u * 2), Math.floor(v * 2), 5);
      const e = Math.min(pu, 1 - pu, pv, 1 - pv);
      const bevel = sstep(0.004, 0.03, e);
      const bolt = [[0.07, 0.07], [0.93, 0.07], [0.07, 0.93], [0.93, 0.93]].some(([bx, by]) => Math.hypot(pu - bx, pv - by) < 0.02);
      const vent = id > 0.7 && pu > 0.3 && pu < 0.7 && pv > 0.35 && pv < 0.65 ? (Math.sin(pv * 180) > 0.3 ? 0 : 1) : 1;
      h[k] = bevel * 0.8 + n[k] * 0.04 + (bolt ? 0.3 : 0) - (1 - vent) * 0.3;
      c[k] = (id - 0.5) * 0.15 + n[k] * 0.08 - (1 - bevel) * 0.4 + (bolt ? 0.3 : 0) - (1 - vent) * 0.4;
      r[k] = 0.45 + n[k] * 0.1 + (1 - bevel) * 0.2; ao[k] = 0.35 + 0.65 * bevel * vent; m[k] = bolt ? 1 : 0.55;
    }
    return { h, c, r, ao, m, hs: 3 };
  },
  terrazzo(R) {
    const n = fbm(R, 4, 4, 111), ch = voronoi(R, 40, 112, 1), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R), tint = new Float32Array(R * R * 3);
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const k = y * R + x, u = x / R, v = y / R;
      const chip = ch.d1[k] < 0.18 + ch.id[k] * 0.12 ? 1 : 0;
      const seam = sstep(0, 0.004, Math.min(u, 1 - u, v, 1 - v));
      h[k] = seam * 0.3; c[k] = n[k] * 0.08 - (1 - seam) * 0.3 + chip * (ch.id[k] - 0.5) * 0.9;
      r[k] = 0.16 + n[k] * 0.06 + (1 - seam) * 0.3; ao[k] = 0.6 + 0.4 * seam;
    }
    return { h, c, r, ao, hs: 1.5 };
  },
  carpet(R) {
    const f = fbm(R, 96, 2, 121), n = fbm(R, 4, 3, 122), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R);
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const k = y * R + x, u = x / R, v = y / R, tu = Math.floor(u * 2), tv = Math.floor(v * 2);
      const dir = (tu + tv) % 2, tex = dir ? Math.sin(u * R * 0.9) : Math.sin(v * R * 0.9);
      const seam = sstep(0, 0.01, Math.min((u * 2) % 1, 1 - (u * 2) % 1, (v * 2) % 1, 1 - (v * 2) % 1));
      h[k] = f[k] * 0.4 + tex * 0.15 + seam * 0.2; c[k] = f[k] * 0.2 + tex * 0.05 + n[k] * 0.12 + (hash(tu, tv, 3) - 0.5) * 0.1 - (1 - seam) * 0.15;
      r[k] = 1; ao[k] = 0.8 + 0.2 * f[k];
    }
    return { h, c, r, ao, hs: 1.2 };
  },
  fabric(R) {
    const n = fbm(R, 4, 3, 131), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R);
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const k = y * R + x, w = Math.sin(x * Math.PI * 0.5) * Math.sin(y * Math.PI * 0.5);
      h[k] = w * 0.3 + n[k] * 0.1; c[k] = w * 0.08 + n[k] * 0.1; r[k] = 1; ao[k] = 0.85 + 0.15 * w;
    }
    return { h, c, r, ao, hs: 0.8 };
  },
  tiles(R) {
    const n = fbm(R, 6, 3, 141), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R);
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const k = y * R + x, u = (x / R * 2) % 1, v = (y / R * 2) % 1, id = hash(Math.floor(x / R * 2), Math.floor(y / R * 2), 9);
      const g = sstep(0.005, 0.02, Math.min(u, 1 - u, v, 1 - v));
      h[k] = g * 0.6; c[k] = (id - 0.5) * 0.08 + n[k] * 0.05 - (1 - g) * 0.4; r[k] = 0.25 + (1 - g) * 0.6 + n[k] * 0.05; ao[k] = 0.6 + 0.4 * g;
    }
    return { h, c, r, ao, hs: 1.5 };
  },
  // chapa ondulada de container (nervuras verticais), com ferrugem e tinta gasta
  corrugated(R) {
    const n = fbm(R, 6, 5, 161), rust = fbm(R, 3, 4, 162, 0.55, 1), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R), m = new Float32Array(R * R);
    const ribs = 8;
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const k = y * R + x, u = (x / R) * ribs % 1;
      const prof = u < 0.15 ? u / 0.15 : u < 0.5 ? 1 : u < 0.65 ? 1 - (u - 0.5) / 0.15 : 0;
      const rs = sstep(0.62, 0.8, rust[k] + (1 - y / R) * 0.12);
      h[k] = prof * 0.9 + n[k] * 0.05; c[k] = n[k] * 0.12 - rs * 0.35 + (prof > 0.5 ? 0.04 : -0.04);
      r[k] = 0.55 + n[k] * 0.1 + rs * 0.3; ao[k] = 0.75 + 0.25 * prof; m[k] = 0.35 * (1 - rs);
    }
    return { h, c, r, ao, m, hs: 4 };
  },
  snow(R) {
    const n = fbm(R, 3, 5, 171, 0.5, 1), g = fbm(R, 64, 2, 172), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R);
    for (let k = 0; k < R * R; k++) { h[k] = n[k] * 0.6 + g[k] * 0.15; c[k] = n[k] * 0.06 + (g[k] > 0.72 ? 0.08 : 0); r[k] = 0.7 + g[k] * 0.2; ao[k] = 0.9 + 0.1 * n[k]; }
    return { h, c, r, ao, hs: 1.3 };
  },
  // telhas de barro em fileiras
  rooftile(R) {
    const n = fbm(R, 5, 4, 181), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R);
    const rows = 6, cols = 5;
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const k = y * R + x, v = y / R * rows, row = Math.floor(v), fv = v % 1, u = (x / R * cols + (row % 2) * 0.5) % 1, id = hash(Math.floor(x / R * cols + (row % 2) * 0.5), row, 4);
      const arc = Math.sin(u * Math.PI);
      h[k] = arc * 0.7 * (0.4 + 0.6 * fv) + n[k] * 0.05; c[k] = (id - 0.5) * 0.3 + n[k] * 0.12 - (1 - fv) * 0.25 - (1 - arc) * 0.2;
      r[k] = 0.62 + n[k] * 0.1; ao[k] = 0.5 + 0.5 * arc * fv;
    }
    return { h, c, r, ao, hs: 3 };
  },
  water(R) {
    const a = fbm(R, 4, 4, 151, 0.5, 1), h = new Float32Array(R * R), c = new Float32Array(R * R), r = new Float32Array(R * R), ao = new Float32Array(R * R);
    for (let k = 0; k < R * R; k++) { h[k] = a[k]; r[k] = 0.02; ao[k] = 1; }
    return { h, c, r, ao, hs: 1.6 };
  },
};

// ------------------------------------------------------------------ montagem das texturas
const structCache = new Map();
const texCache = new Map();
function getStruct(kind, R) {
  const key = kind + '|' + R;
  if (!structCache.has(key)) structCache.set(key, (STRUCT[kind] || STRUCT.concrete)(R));
  return structCache.get(key);
}
function srgbToLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function linToSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

function dataTex(data, R, srgb, aniso) {
  const t = new THREE.DataTexture(data, R, R, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
function normalFrom(h, R, strength) {
  const d = new Uint8Array(R * R * 4);
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const xl = (x - 1 + R) % R, xr = (x + 1) % R, yd = (y - 1 + R) % R, yu = (y + 1) % R;
    let nx = (h[y * R + xl] - h[y * R + xr]) * strength, ny = (h[yd * R + x] - h[yu * R + x]) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const k = (y * R + x) * 4; d[k] = (nx * 0.5 + 0.5) * 255; d[k + 1] = (ny * 0.5 + 0.5) * 255; d[k + 2] = (nz * 0.5 + 0.5) * 255; d[k + 3] = 255;
  }
  return d;
}
export const TILE = { sandstone: 2.4, stone: 3, sand: 5, plaster: 3, wood: 1.2, metal: 1.6, steel: 0.6, concrete: 2.4, asphalt: 5, panel: 2, terrazzo: 2.5, carpet: 1.5, fabric: 0.6, tiles: 1.2, water: 3, corrugated: 2.4, snow: 4, rooftile: 1.6 };

// variacao de cor: amp = quanto a estrutura mexe no brilho
export function getTextures(kind, colorHex, R, aniso = 8) {
  const key = kind + '|' + colorHex + '|' + R;
  if (texCache.has(key)) return texCache.get(key);
  const s = getStruct(kind, R);
  const base = new THREE.Color(colorHex);
  const bl = [base.r, base.g, base.b]; // linear
  const alb = new Uint8Array(R * R * 4), orm = new Uint8Array(R * R * 4);
  for (let k = 0; k < R * R; k++) {
    const f = Math.max(0.05, 1 + s.c[k]);
    for (let ch = 0; ch < 3; ch++) alb[k * 4 + ch] = Math.round(clamp01(linToSrgb(clamp01(bl[ch] * f))) * 255);
    alb[k * 4 + 3] = 255;
    orm[k * 4] = Math.round(clamp01(s.ao[k]) * 255);
    orm[k * 4 + 1] = Math.round(clamp01(s.r[k]) * 255);
    orm[k * 4 + 2] = Math.round(clamp01(s.m ? s.m[k] : 0) * 255);
    orm[k * 4 + 3] = 255;
  }
  const out = {
    map: dataTex(alb, R, true, aniso),
    normalMap: dataTex(normalFrom(s.h, R, s.hs * R / 256), R, false, aniso),
    orm: dataTex(orm, R, false, aniso),
    tile: TILE[kind] || 2, hasMetal: !!s.m, wet: !!s.wet,
  };
  texCache.set(key, out);
  return out;
}

const matCache = new Map();
// material PBR com as tres texturas; opts: { rough, metal, normalScale, emissive, envInt }
export function pbrMaterial(kind, colorHex, R, aniso, opts = {}) {
  const key = [kind, colorHex, R, JSON.stringify(opts)].join('|');
  if (matCache.has(key)) return matCache.get(key);
  const t = getTextures(kind, colorHex, R, aniso);
  const m = new THREE.MeshStandardMaterial({
    map: t.map, normalMap: t.normalMap, roughnessMap: t.orm, aoMap: t.orm, aoMapIntensity: 0.9,
    metalnessMap: t.hasMetal ? t.orm : null,
    roughness: opts.rough ?? 1, metalness: opts.metal ?? (t.hasMetal ? 1 : 0),
    normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1),
    vertexColors: true,
  });
  if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
  m.userData.tile = t.tile;
  matCache.set(key, m);
  return m;
}
export function clearMaterialCache() { for (const m of matCache.values()) m.dispose(); matCache.clear(); }

// ------------------------------------------------------------------ texturas de canvas (emissivas e fachadas)
export function canvasTex(w, h, draw, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// janelas de predio (acesas aleatoriamente); night=true para neon
export function windowsTex(night, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = night ? '#07080f' : '#5d6f82'; g.fillRect(0, 0, w, h);
    for (let y = 8; y < h; y += 16) for (let x = 6; x < w; x += 14) {
      const lit = rnd();
      if (night) g.fillStyle = lit > 0.62 ? ['#ffd79a', '#9fd8ff', '#ffe9c4', '#c9b3ff'][Math.floor(rnd() * 4)] : '#0d1020';
      else g.fillStyle = lit > 0.5 ? '#8fb2d0' : lit > 0.2 ? '#6f8ea9' : '#b9d3e6';
      g.globalAlpha = night ? (lit > 0.62 ? 0.75 + rnd() * 0.25 : 1) : 1;
      g.fillRect(x, y, 10, 11);
    }
    g.globalAlpha = 1;
  });
}
export function screenTex(seed) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return canvasTex(128, 80, (g, w, h) => {
    g.fillStyle = '#0c1422'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b6fd6'; g.fillRect(0, 0, w, 9);
    const kind = Math.floor(rnd() * 3);
    if (kind === 0) { for (let i = 0; i < 9; i++) { g.fillStyle = rnd() > 0.7 ? '#2fa84f' : '#cfd8e6'; g.fillRect(8, 16 + i * 7, 20 + rnd() * 90, 3); } }
    else if (kind === 1) { g.strokeStyle = '#46d18a'; g.lineWidth = 2; g.beginPath(); let y = 60; g.moveTo(6, y); for (let x = 6; x < w - 6; x += 8) { y += (rnd() - 0.45) * 12; y = Math.max(16, Math.min(74, y)); g.lineTo(x, y); } g.stroke(); g.fillStyle = '#26324a'; for (let i = 0; i < 4; i++) g.fillRect(6 + i * 30, 12, 26, 3); }
    else { for (let i = 0; i < 12; i++) { g.fillStyle = ['#e0663a', '#3a8fe0', '#e0c23a', '#6adb8e'][i % 4]; g.fillRect(10 + i * 9, 74 - (10 + rnd() * 50), 6, 60); } }
  });
}
export function signTex(text, color, sub) {
  return canvasTex(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(4,4,10,0.85)'; g.fillRect(0, 0, w, h);
    g.font = 'bold 78px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 18; g.fillStyle = color; g.fillText(text, w / 2, sub ? 52 : 66);
    g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.globalAlpha = 0.9; g.fillText(text, w / 2, sub ? 52 : 66);
    if (sub) { g.globalAlpha = 1; g.font = 'bold 26px Arial, sans-serif'; g.fillStyle = color; g.fillText(sub, w / 2, 106); }
  });
}
export function radialTex(stops, size = 64) {
  return canvasTex(size, size, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, false);
}

// ------------------------------------------------------------------ vidro: difuso pre-multiplicado pela opacidade, reflexo especular inteiro
// (no material padrao do three o reflexo tambem some junto com a opacidade; aqui o vidro continua refletindo)
export function glassMaterial(color, opacity = 0.14, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color, roughness: opts.rough ?? 0.04, metalness: 0, transparent: true, opacity, depthWrite: false,
    side: opts.side ?? THREE.FrontSide, envMapIntensity: opts.env ?? 1.2, vertexColors: !!opts.vc,
  });
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight = totalDiffuse * diffuseColor.a + totalSpecular + totalEmissiveRadiance;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'glassPremul';
  m.userData.glass = true;
  return m;
}
