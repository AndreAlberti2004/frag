// FRAG - animacao da arma em primeira pessoa.
// Camadas: pose de quadril <-> mira (ADS) + molas (balanco do mouse, passo, inclinacao lateral, pulo/aterrissagem, recuo, respiracao)
// + clipes com keyframes (Catmull-Rom) para sacar, recarregar, ferrolho, inspecionar, golpes de faca, com eventos de som no tempo certo.
import * as THREE from 'three';
import { buildWeapon, makeHand, makeForearm, shellGeo, MAT } from './models.js';

// ------------------------------------------------------------------ utilitarios
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => t * t * (3 - 2 * t);
// amostra uma trilha [[t, ...valores]] com Hermite cubico monotono (t normalizado 0..1):
// suave como Catmull-Rom, mas sem "passar do ponto" em pausas e giros (tangente zera em extremos e segmentos parados)
function sample(track, t, out) {
  const n = track[0].length - 1;
  if (t <= track[0][0]) { for (let i = 0; i < n; i++) out[i] = track[0][i + 1]; return out; }
  const L = track.length - 1;
  if (t >= track[L][0]) { for (let i = 0; i < n; i++) out[i] = track[L][i + 1]; return out; }
  let k = 0; while (k < L - 1 && track[k + 1][0] <= t) k++;
  const a = track[Math.max(0, k - 1)], b = track[k], c = track[k + 1], d = track[Math.min(L, k + 2)];
  const dt = Math.max(1e-6, c[0] - b[0]), u = (t - b[0]) / dt;
  const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  for (let i = 1; i <= n; i++) {
    const pa = a[i], pb = b[i], pc = c[i], pd = d[i], D = pc - pb;
    let mb = 0, mc = 0;
    if (D !== 0) {
      if (a === b) mb = 0; else if ((pb - pa) * D > 0) mb = (pc - pa) / Math.max(1e-6, c[0] - a[0]) * dt;
      if (d === c) mc = 0; else if ((pd - pc) * D > 0) mc = (pd - pb) / Math.max(1e-6, d[0] - b[0]) * dt;
      const lim = 3 * Math.abs(D);
      if (Math.abs(mb) > lim) mb = Math.sign(mb) * lim; if (Math.abs(mc) > lim) mc = Math.sign(mc) * lim;
    }
    out[i - 1] = h00 * pb + h10 * mb + h01 * pc + h11 * mc;
  }
  return out;
}
const Z6 = [0, 0, 0, 0, 0, 0];
const K = (t, p = [0, 0, 0], r = [0, 0, 0]) => [t, ...p, ...r];

// mola amortecida (semi-implicita, com subpassos)
class Spring {
  constructor(n, k, d) { this.x = new Float32Array(n); this.v = new Float32Array(n); this.t = new Float32Array(n); this.k = k; this.d = d; }
  step(dt) {
    const s = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / s;
    for (let j = 0; j < s; j++) for (let i = 0; i < this.x.length; i++) {
      this.v[i] += ((this.t[i] - this.x[i]) * this.k - this.v[i] * this.d) * h;
      this.x[i] += this.v[i] * h;
    }
  }
  kick(i, v) { this.v[i] += v; }
}

// ------------------------------------------------------------------ clipes
// trilhas: gun (deslocamento em espaco de camera + rotacao), lh/rh (mao esquerda/direita, relativo a ancora, espaco da arma),
// mag (relativo ao encaixe), magVis (0/1), charge, slide (m para tras), bolt (rotacao, recuo), ha/hb (cabos da butterfly)
function gunClips(kind, empty, variant = kind) {
  const C = {};
  C.draw = { gun: [K(0, [0.02, -0.22, 0.05], [-1.0, 0.35, 0.3]), K(0.55, [0, 0.008, 0], [0.06, -0.02, -0.03]), K(0.8, [0, -0.003, 0], [-0.015, 0, 0.01]), K(1)], ev: [[0.02, 'draw']] };
  if (kind === 'rifle') {
    // onde fica a alavanca de manejo de cada variante (relativo a mao esquerda) e quanto ela corre
    const CH = { rifle: [0.02, 0.12, 0.43], ak: [0.05, 0.07, 0.3], smg: [-0.03, 0.1, 0.0], dmr: [0.035, 0.06, 0.31] }[variant] || [0.02, 0.12, 0.43];
    const CHB = { rifle: 0.07, ak: 0.07, smg: 0.045, dmr: 0.0 }[variant] ?? 0.07;
    C.reload = {
      gun: [K(0), K(0.1, [0.01, -0.02, 0.02], [0.08, 0.22, 0.38]), K(0.3, [0.015, -0.028, 0.02], [0.1, 0.24, 0.42]), K(0.45, [0.012, -0.022, 0.02], [0.09, 0.22, 0.4]),
        K(0.56, [0.005, -0.03, 0.02], [0.17, 0.2, 0.34]), K(0.6, [0.008, -0.018, 0.02], [0.1, 0.2, 0.33]), ...(empty ? [K(0.72, [0.0, -0.01, 0.03], [0.02, 0.12, 0.2]), K(0.78, [0.0, -0.016, 0.05], [0.08, 0.1, 0.18])] : []), K(0.88, [0, -0.004, 0], [0.01, 0.02, 0.04]), K(1)],
      lh: [K(0), K(0.1, [0.0, -0.02, 0.2]), K(0.16, [0.0, -0.07, 0.25]), K(0.26, [0.02, -0.28, 0.25]), K(0.38, [0.06, -0.42, 0.2]), K(0.46, [0.01, -0.2, 0.25]), K(0.53, [0.0, -0.07, 0.25]), K(0.58, [0, -0.05, 0.26]),
        ...(empty ? [K(0.66, [CH[0] + 0.01, CH[1] - 0.04, CH[2] - 0.09]), K(0.72, CH), K(0.76, [CH[0], CH[1], CH[2] + CHB]), K(0.82, [0.0, 0.02, 0.2])] : [K(0.7, [0, -0.02, 0.12])]), K(0.9), K(1)],
      mag: [K(0), K(0.15), K(0.2, [0, -0.04, 0.005]), K(0.3, [0.02, -0.26, 0.01], [0.3, 0, 0.4]), K(0.44, [0.05, -0.34, 0.0], [0.2, 0, 0.2]), K(0.5, [0, -0.07, 0.0], [0.05, 0, 0]), K(0.55, [0, -0.005, 0]), K(0.58, [0, 0.004, 0]), K(0.6), K(1)],
      magVis: [[0, 1], [0.23, 1], [0.231, 0], [0.4, 0], [0.401, 1], [1, 1]],
      charge: empty ? [[0, 0], [0.72, 0], [0.76, CHB], [0.775, CHB], [0.79, 0], [1, 0]] : [[0, 0], [1, 0]],
      ev: [[0.16, 'magout'], [0.22, 'magdrop'], [0.53, 'magin'], [0.59, 'magtap'], ...(empty ? [[0.74, 'chargepull'], [0.785, 'chargerel']] : [])],
    };
    C.inspect = {
      gun: [K(0), K(0.14, [-0.08, 0.035, 0.04], [0.18, 0.95, 0.55]), K(0.3, [-0.085, 0.04, 0.04], [0.14, 1.0, 0.6]), K(0.42, [-0.08, 0.035, 0.035], [0.2, 0.92, 0.5]),
        K(0.58, [0.02, 0.03, 0.03], [-0.12, -0.45, -0.5]), K(0.72, [0.025, 0.035, 0.025], [-0.08, -0.5, -0.55]), K(0.84, [0.01, 0.01, 0.01], [0.05, -0.1, -0.08]), K(1)],
      lh: [K(0), K(0.14, [0.01, 0.01, 0.02]), K(0.45, [0.01, 0.01, 0.02]), K(0.6, [0.0, 0.0, 0.0]), K(1)],
      charge: [[0, 0], [0.7, 0], [0.74, 0.03], [0.78, 0], [1, 0]],
      ev: [[0.04, 'adsin'], [0.47, 'adsout'], [0.74, 'chargepull']],
    };
  } else if (kind === 'pistol') {
    C.reload = {
      gun: [K(0), K(0.12, [0.0, -0.01, 0.02], [0.22, 0.15, 0.5]), K(0.36, [0.005, -0.015, 0.02], [0.25, 0.14, 0.52]), K(0.55, [0.0, -0.02, 0.02], [0.3, 0.12, 0.45]),
        K(0.62, [0, -0.01, 0.02], [0.2, 0.1, 0.4]), ...(empty ? [K(0.76, [0, -0.005, 0.02], [0.1, 0.08, 0.25]), K(0.8, [0, 0.01, 0.03], [0.02, 0.06, 0.2])] : []), K(0.9, [0, -0.002, 0], [0.02, 0.01, 0.03]), K(1)],
      lh: [K(0), K(0.1, [-0.05, -0.08, 0.1]), K(0.25, [-0.1, -0.35, 0.12]), K(0.4, [-0.04, -0.2, 0.08]), K(0.5, [0.0, -0.1, 0.04]), K(0.58, [0.0, -0.06, 0.02]), K(0.66, [-0.02, -0.08, 0.05]), K(0.85), K(1)],
      mag: [K(0), K(0.14), K(0.26, [0, -0.2, 0.06], [0.4, 0, 0.3]), K(0.4, [0, -0.2, 0.05]), K(0.5, [0, -0.06, 0.02]), K(0.56, [0, 0.002, 0]), K(0.6), K(1)],
      magVis: [[0, 1], [0.24, 1], [0.241, 0], [0.4, 0], [0.401, 1], [1, 1]],
      slide: empty ? [[0, 0.036], [0.76, 0.036], [0.79, 0], [1, 0]] : [[0, 0], [1, 0]],
      ev: [[0.15, 'magout'], [0.24, 'magdrop'], [0.55, 'magin'], ...(empty ? [[0.785, 'sliderel']] : [[0.6, 'magtap']])],
    };
    C.inspect = {
      gun: [K(0), K(0.16, [-0.04, 0.03, 0.03], [0.12, 0.8, 0.45]), K(0.34, [-0.045, 0.035, 0.03], [0.1, 0.86, 0.5]), K(0.5, [0.0, 0.03, 0.02], [0.05, 0.1, 0.05]),
        K(0.62, [0.0, 0.028, 0.02], [0.05, 0.12, 0.06]), K(0.76, [0.03, 0.02, 0.02], [-0.1, -0.6, -0.5]), K(0.9, [0.01, 0.005, 0.005], [0, -0.1, -0.08]), K(1)],
      lh: [K(0), K(0.12, [-0.06, -0.1, 0.06]), K(0.44, [-0.06, -0.1, 0.06]), K(0.5, [0.0, 0.08, -0.05]), K(0.56, [0.0, 0.08, 0.0]), K(0.62, [0.0, 0.08, -0.05]), K(0.7, [-0.06, -0.1, 0.06]), K(0.9), K(1)],
      slide: [[0, 0], [0.52, 0], [0.56, 0.018], [0.6, 0.018], [0.63, 0], [1, 0]],
      ev: [[0.05, 'adsin'], [0.555, 'slideback'], [0.63, 'sliderel']],
    };
  } else {
    // sniper: ferrolho usa a mao direita
    const boltSeq = (t0, t1) => [[0, 0, 0], [t0, 0, 0], [t0 + (t1 - t0) * 0.18, 1.15, 0], [t0 + (t1 - t0) * 0.36, 1.15, 0.085], [t0 + (t1 - t0) * 0.62, 1.15, 0.085], [t0 + (t1 - t0) * 0.8, 1.15, 0], [t1, 0, 0], [1, 0, 0]];
    C.bolt = {
      gun: [K(0), K(0.12, [0.0, -0.012, 0.01], [0.04, 0.05, 0.22]), K(0.4, [0.005, -0.02, 0.02], [0.05, 0.06, 0.26]), K(0.62, [0.0, -0.01, 0.0], [0.07, 0.05, 0.2]), K(0.8, [0, -0.004, 0], [0.02, 0.01, 0.06]), K(1)],
      rh: [K(0), K(0.1, [0.05, 0.08, -0.02], [0, 0, -0.6]), K(0.18, [0.058, 0.082, -0.02], [0, 0, -0.6]), K(0.25, [0.05, 0.12, -0.02], [0, 0, -0.6]), K(0.4, [0.05, 0.12, 0.066], [0, 0, -0.6]),
        K(0.58, [0.05, 0.12, 0.066], [0, 0, -0.6]), K(0.68, [0.05, 0.12, -0.02], [0, 0, -0.6]), K(0.76, [0.058, 0.082, -0.02], [0, 0, -0.6]), K(0.9), K(1)],
      bolt: [[0, 0, 0], [0.16, 0, 0], [0.26, 1.15, 0], [0.38, 1.15, 0.085], [0.56, 1.15, 0.085], [0.68, 1.15, 0], [0.76, 0, 0], [1, 0, 0]],
      ev: [[0.2, 'boltup'], [0.33, 'boltback'], [0.36, 'shell'], [0.62, 'boltfwd'], [0.75, 'boltdown']],
    };
    const bs = boltSeq(0.02, 0.2);
    C.reload = {
      gun: [K(0), K(0.08, [0, -0.01, 0.02], [0.06, 0.08, 0.3]), K(0.3, [0, -0.02, 0.02], [0.12, 0.12, 0.35]), K(0.58, [0, -0.03, 0.02], [0.18, 0.1, 0.32]), K(0.64, [0, -0.02, 0.02], [0.1, 0.1, 0.3]), K(0.8, [0, -0.01, 0.01], [0.05, 0.06, 0.25]), K(0.92), K(1)],
      rh: [K(0), K(0.04, [0.058, 0.12, 0.066], [0, 0, -0.6]), K(0.72, [0.058, 0.12, 0.066], [0, 0, -0.6]), K(0.78, [0.05, 0.12, -0.02], [0, 0, -0.6]), K(0.84, [0.058, 0.082, -0.02], [0, 0, -0.6]), K(0.94), K(1)],
      bolt: [[0, 0, 0], [0.03, 1.15, 0], [0.07, 1.15, 0.085], [0.74, 1.15, 0.085], [0.8, 1.15, 0], [0.85, 0, 0], [1, 0, 0]],
      lh: [K(0), K(0.2, [0.02, -0.02, 0.1]), K(0.26, [0.02, -0.06, 0.16]), K(0.36, [0.05, -0.35, 0.16]), K(0.48, [0.02, -0.2, 0.16]), K(0.56, [0.0, -0.06, 0.16]), K(0.62, [0.0, -0.03, 0.16]), K(0.74, [0, -0.01, 0.06]), K(1)],
      mag: [K(0), K(0.26), K(0.34, [0, -0.2, 0.02], [0.3, 0, 0.2]), K(0.46, [0, -0.25, 0]), K(0.55, [0, -0.04, 0]), K(0.6), K(1)],
      magVis: [[0, 1], [0.33, 1], [0.331, 0], [0.46, 0], [0.461, 1], [1, 1]],
      ev: [[0.03, 'boltup'], [0.07, 'boltback'], [0.27, 'magout'], [0.34, 'magdrop'], [0.58, 'magin'], [0.78, 'boltfwd'], [0.84, 'boltdown']],
    };
    void bs;
    C.inspect = {
      gun: [K(0), K(0.18, [-0.06, 0.05, 0.05], [0.2, 0.7, 0.35]), K(0.42, [-0.065, 0.055, 0.05], [0.16, 0.75, 0.4]), K(0.62, [0.02, 0.04, 0.03], [-0.1, -0.4, -0.35]), K(0.8, [0.02, 0.04, 0.03], [-0.06, -0.45, -0.38]), K(0.92, [0, 0.005, 0], [0, -0.05, -0.04]), K(1)],
      lh: [K(0), K(0.18, [0.0, 0.01, 0.04]), K(0.8, [0.0, 0.01, 0.04]), K(1)],
      ev: [[0.05, 'adsin'], [0.55, 'adsout']],
    };
  }
  return C;
}
// facas: "gun" = pulso/braco (mao + faca juntas); "kn" = a faca girando NA mao em torno do pivo real
// (padrao: meio do cabo; karambit: o anel no dedo; butterfly: bl = lamina e ha = cabo solto girando no pino)
const TAU = Math.PI * 2;
function knifeClips(kind) {
  const C = {};
  C.draw = { gun: [K(0, [0.08, -0.26, 0.0], [-1.5, 0.4, 0.5]), K(0.5, [0, 0.01, 0], [0.15, -0.05, -0.1]), K(0.75, [0, -0.004, 0], [-0.03, 0.01, 0.02]), K(1)], ev: [[0.05, 'knifedraw']] };
  C.slash = { gun: [K(0), K(0.14, [0.07, 0.06, 0.05], [0.3, 0.4, -1.0]), K(0.38, [-0.24, -0.11, -0.12], [-0.35, -0.7, 1.0]), K(0.52, [-0.26, -0.13, -0.08], [-0.3, -0.75, 1.1]), K(0.8, [-0.02, -0.03, 0.0], [0.0, -0.1, 0.1]), K(1)], ev: [[0.16, 'swing']] };
  C.stab = { gun: [K(0), K(0.22, [0.04, 0.05, 0.13], [0.7, 0.15, 0.0]), K(0.34, [0.04, 0.05, 0.14], [0.75, 0.15, 0.0]), K(0.44, [-0.03, -0.01, -0.2], [-0.15, 0.0, 0.0]), K(0.58, [-0.03, -0.015, -0.18], [-0.12, 0.0, 0.0]), K(0.85, [0, -0.01, 0.02], [0.05, 0, 0]), K(1)], ev: [[0.36, 'swingheavy']] };
  if (kind === 'karambit') {
    // sacar girando no dedo
    C.draw = { gun: [K(0, [0.06, -0.24, 0.02], [-1.1, 0.3, 0.4]), K(0.45, [0, 0.012, 0], [0.12, -0.04, -0.08]), K(0.75, [0, -0.003, 0], [-0.02, 0.01, 0.02]), K(1)],
      kn: [K(0, [0, 0, 0], [-TAU, 0, 0]), K(0.1, [0, 0, 0], [-TAU, 0, 0]), K(0.55, [0, 0, 0], [0, 0, 0]), K(1)], ev: [[0.05, 'knifedraw'], [0.3, 'swing']] };
    // inspecionar: vira o pulso, dois giros no anel, mostra a lamina dos dois lados, um giro de volta
    C.inspect = {
      gun: [K(0), K(0.1, [-0.045, 0.045, 0.02], [0.25, 0.35, 0.25]), K(0.34, [-0.05, 0.05, 0.02], [0.22, 0.38, 0.3]),
        K(0.44, [-0.06, 0.055, 0.03], [0.35, 1.05, 0.55]), K(0.56, [-0.06, 0.055, 0.03], [0.3, 1.1, 0.6]),
        K(0.64, [-0.02, 0.05, 0.02], [0.2, -0.35, -0.9]), K(0.74, [-0.02, 0.05, 0.02], [0.18, -0.4, -0.95]),
        K(0.8, [-0.03, 0.045, 0.02], [0.25, 0.3, 0.2]), K(0.94, [0, 0.005, 0], [0.02, 0.02, 0.02]), K(1)],
      kn: [K(0), K(0.12), K(0.33, [0, 0, 0], [TAU * 2, 0, 0]), K(0.8, [0, 0, 0], [TAU * 2, 0, 0]), K(0.93, [0, 0, 0], [TAU * 3, 0, 0]), K(1, [0, 0, 0], [TAU * 3, 0, 0])],
      ev: [[0.15, 'swing'], [0.26, 'swing'], [0.45, 'adsin'], [0.64, 'adsout'], [0.84, 'swing']],
    };
  } else if (kind === 'butterfly') {
    // sacar: abre com o cabo solto dando a volta inteira no pino
    C.draw = { gun: [K(0, [0.06, -0.24, 0.02], [-1.2, 0.3, 0.4]), K(0.4, [0, 0.015, 0], [0.1, -0.05, -0.1]), K(0.8, [0, -0.003, 0], [-0.02, 0.01, 0.02]), K(1)],
      bl: [[0, Math.PI], [0.12, Math.PI], [0.55, 0], [1, 0]], ha: [[0, 0], [0.1, 0], [0.34, -Math.PI * 1.1], [0.55, -TAU], [1, -TAU]], ev: [[0.08, 'knifedraw'], [0.3, 'flip'], [0.54, 'flipclose']] };
    // inspecionar: fecha, abre, fecha e abre de novo (rollovers), com o pulso acompanhando
    const flipsBl = [], flipsHa = [];
    let bl = 0, ha = 0;
    const seq = [[0.12, 0.26, 1], [0.3, 0.44, 0], [0.5, 0.64, 1], [0.7, 0.86, 0]];
    flipsBl.push([0, 0]); flipsHa.push([0, 0]);
    for (const [a, b, close] of seq) {
      flipsBl.push([a, bl]); flipsHa.push([a, ha]);
      bl = close ? Math.PI : 0; ha += close ? TAU : -TAU;
      flipsBl.push([a + (b - a) * 0.75, bl]); flipsHa.push([a + (b - a) * 0.55, ha - (close ? 0.5 : -0.5)]); flipsHa.push([b, ha]); flipsBl.push([b, bl]);
    }
    flipsBl.push([1, 0]); flipsHa.push([1, ha]);
    C.inspect = {
      gun: [K(0), K(0.1, [-0.04, 0.045, 0.02], [0.3, 0.35, 0.35]), K(0.28, [-0.035, 0.055, 0.02], [0.45, 0.2, 0.2]), K(0.46, [-0.04, 0.05, 0.02], [0.3, 0.45, 0.45]),
        K(0.66, [-0.035, 0.055, 0.02], [0.45, 0.15, 0.15]), K(0.88, [-0.04, 0.045, 0.02], [0.28, 0.5, 0.5]), K(0.95, [0, 0.005, 0], [0.02, 0.02, 0.02]), K(1)],
      bl: flipsBl, ha: flipsHa,
      ev: seq.flatMap(([a, b, c]) => [[a + (b - a) * 0.4, 'flip'], [b - 0.01, c ? 'flipclose' : 'flipopen']]),
    };
  } else {
    // padrao: mostra um lado, vira para o outro, joga a faca girando na mao e pega
    C.inspect = {
      gun: [K(0), K(0.13, [-0.05, 0.05, 0.03], [0.25, 0.9, 0.85]), K(0.36, [-0.055, 0.055, 0.03], [0.2, 1.0, 0.95]),
        K(0.5, [-0.075, 0.045, 0.03], [0.4, -0.55, -0.85]), K(0.62, [-0.08, 0.05, 0.03], [0.36, -0.6, -0.9]),
        K(0.66, [-0.03, 0.02, 0.02], [0.15, 0.05, -0.2]), K(0.72, [-0.03, 0.06, 0.02], [0.1, 0.05, -0.15]), K(0.84, [-0.03, 0.03, 0.02], [0.15, 0.05, -0.15]),
        K(0.94, [0, 0.005, 0], [0.03, 0, -0.03]), K(1)],
      kn: [K(0), K(0.66), K(0.72, [0, 0.05, 0], [TAU * 0.35, 0, 0]), K(0.78, [0, 0.06, 0], [TAU * 0.7, 0, 0]), K(0.84, [0, 0, 0], [TAU, 0, 0]), K(1, [0, 0, 0], [TAU, 0, 0])],
      ev: [[0.08, 'adsin'], [0.46, 'swing'], [0.67, 'swing'], [0.84, 'knifecatch']],
    };
  }
  return C;
}
// granada
function nadeClips() {
  return {
    draw: { gun: [K(0, [0.02, -0.2, 0.04], [-0.9, 0.3, 0.3]), K(0.55, [0, 0.01, 0], [0.08, -0.02, -0.03]), K(1)], ev: [[0.05, 'draw']] },
    // puxa o pino (mao esquerda), leva para tras, arremessa; lob = mais baixo e curto
    throw: { gun: [K(0), K(0.2, [-0.04, 0.02, 0.02], [0.2, 0.2, 0.1]), K(0.38, [0.05, 0.1, 0.05], [-0.45, 0.15, -0.25]), K(0.47, [-0.03, 0.07, -0.25], [0.7, -0.1, 0.1]), K(0.6, [-0.02, -0.25, -0.15], [1.2, 0, 0]), K(1, [0, -0.3, 0], [1.2, 0, 0])],
      lh: [K(0), K(0.12, [0.05, 0.08, -0.02]), K(0.25, [0.05, 0.1, 0.02]), K(0.35, [-0.08, 0.02, 0.1]), K(0.6, [-0.1, -0.2, 0.1]), K(1, [-0.1, -0.3, 0.1])],
      pinOut: 0.24, vis: [[0, 1], [0.47, 0]], ev: [[0.16, 'nadepin'], [0.44, 'swing']] },
  };
}
// escopeta: cartucho a cartucho (rlstart -> shell x N -> rlend) e bomba
function shotgunClips() {
  const T = [0.01, 0.01, 0.02], TR = [0.2, 0.25, 0.55];
  const LP = [0.03, -0.08, 0.3]; // mao esquerda na janela de carga (relativo a pose no guarda-mao)
  return {
    draw: { gun: [K(0, [0.02, -0.22, 0.05], [-1.0, 0.35, 0.3]), K(0.55, [0, 0.008, 0], [0.06, -0.02, -0.03]), K(0.8, [0, -0.003, 0], [-0.015, 0, 0.01]), K(1)], ev: [[0.02, 'draw']] },
    rlstart: { gun: [K(0), K(1, T, TR)], lh: [K(0), K(0.5, [0.02, -0.1, 0.18]), K(1, LP)] },
    shell: { gun: [K(0, T, TR), K(0.62, T, TR), K(0.7, [T[0], T[1] + 0.006, T[2] - 0.004], [TR[0] + 0.03, TR[1], TR[2]]), K(1, T, TR)],
      lh: [K(0, LP), K(0.3, [LP[0] + 0.02, LP[1] - 0.14, LP[2] + 0.06]), K(0.45, [LP[0] + 0.01, LP[1] - 0.06, LP[2] + 0.04]), K(0.66, [LP[0], LP[1] + 0.012, LP[2] - 0.02]), K(1, LP)],
      shell: [[0, 0, -0.14, 0.06], [0.3, 0, -0.14, 0.06], [0.45, 0, -0.06, 0.04], [0.66, 0, 0.0, -0.02], [1, 0, 0.0, -0.02]], shellVis: [[0, 0], [0.3, 1], [0.68, 0]],
      ev: [[0.66, 'shellin']] },
    rlend: { gun: [K(0, T, TR), K(1)], lh: [K(0, LP), K(1)] },
    pump: { gun: [K(0), K(0.2, [0, 0.006, 0.01], [0.06, 0.02, 0.05]), K(0.5, [0, 0.004, 0.006], [0.03, 0.01, 0.03]), K(1)],
      pump: [[0, 0], [0.12, 0], [0.38, 0.085], [0.46, 0.085], [0.72, 0], [1, 0]], lh: [K(0), K(0.12), K(0.38, [0, 0, 0.085]), K(0.46, [0, 0, 0.085]), K(0.72), K(1)],
      ev: [[0.2, 'pumpback'], [0.66, 'pumpfwd']] },
    inspect: { gun: [K(0), K(0.16, [-0.07, 0.035, 0.04], [0.16, 0.9, 0.5]), K(0.42, [-0.075, 0.04, 0.04], [0.12, 0.95, 0.55]), K(0.6, [0.02, 0.03, 0.03], [-0.1, -0.45, -0.5]), K(0.78, [0.02, 0.035, 0.025], [-0.08, -0.5, -0.55]), K(0.9, [0, 0.01, 0.01], [0.02, -0.05, -0.05]), K(1)],
      pump: [[0, 0], [0.62, 0], [0.68, 0.04], [0.74, 0], [1, 0]], lh: [K(0), K(0.62), K(0.68, [0, 0, 0.04]), K(0.74), K(1)], ev: [[0.05, 'adsin'], [0.64, 'pumpback'], [0.73, 'pumpfwd']] },
  };
}

// ------------------------------------------------------------------ o rig
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const ELBOW_R = new THREE.Vector3(0.23, -0.44, 0.14), ELBOW_L = new THREE.Vector3(-0.2, -0.46, 0.04);
const RIFLE_R = { p: [0, -0.03, 0.03], r: [-0.32, 0, 0] };
const HAND_POSE = {
  rifle: { r: RIFLE_R, l: { p: [0, 0.02, -0.37], r: [0.4, 0, 0.0] } },
  ak: { r: RIFLE_R, l: { p: [0, 0.004, -0.33], r: [0.4, 0, 0.0] } },
  dmr: { r: RIFLE_R, l: { p: [0, 0.02, -0.36], r: [0.4, 0, 0.0] } },
  smg: { r: { p: [0, -0.028, 0.026], r: [-0.28, 0, 0] }, l: { p: [0, -0.03, -0.19], r: [0.25, 0, 0.0] } },
  shotgun: { r: RIFLE_R, l: { p: [0, -0.012, -0.36], r: [0.4, 0, 0.0] } },
  pistol: { r: { p: [0, -0.042, 0.018], r: [-0.3, 0, 0] }, l: { p: [-0.012, -0.052, 0.01], r: [-0.3, -0.25, 0.1] } },
  deagle: { r: { p: [0, -0.05, 0.02], r: [-0.26, 0, 0] }, l: { p: [-0.013, -0.062, 0.012], r: [-0.26, -0.25, 0.1] } },
  sniper: { r: { p: [0, -0.03, 0.026], r: [-0.35, 0, 0] }, l: { p: [0, 0.0, -0.3], r: [-1.25, 0, 0.0] } },
  knife: { r: { p: [0, -0.002, 0.025], r: [-1.5708, 0, 0] }, l: null },
  nade: { r: { p: [0.0, -0.028, 0.02], r: [-0.25, 0, 0] }, l: { p: [-0.06, -0.08, 0.06], r: [0.2, 0, 0.3] } },
};
// familia de animacao de cada arma
const FAMILY = { rifle: 'rifle', ak: 'rifle', dmr: 'rifle', smg: 'rifle', pistol: 'pistol', deagle: 'pistol', sniper: 'sniper', shotgun: 'shotgun', nade: 'nade', knife: 'knife' };
// recuo visual por arma: [z (para tras), rot x, rot y aleatoria, rot z aleatoria, subida]
const KICK = { rifle: [0.9, 2.2, 0.9, 1.2, 0.15], ak: [1.1, 2.8, 1.1, 1.5, 0.2], smg: [0.7, 1.6, 0.8, 1.0, 0.1], dmr: [1.6, 3.6, 1, 0.8, 0.3],
  pistol: [1.1, 4.5, 1.1, 0.9, 0.3], deagle: [1.8, 7.5, 1.4, 1.2, 0.6], sniper: [2.4, 6, 1.4, 0, 0.5], shotgun: [2.6, 6.5, 1.2, 1, 0.6] };

export class Viewmodel {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group(); scene.add(this.root);
    this.guns = {}; this.cur = null; this.kind = 'rifle'; this.knifeKind = 'default';
    this.rh = makeHand(1); this.lh = makeHand(-1);
    const fr = makeForearm(false), fl = makeForearm(true);
    this.armR = fr; this.armL = fl;
    scene.add(fr.sleeve, fr.cuff, fl.sleeve, fl.cuff);
    this.clip = null; this.clips = {};
    this.ads = 0; this.adsTarget = 0;
    // molas mais duras que antes: a arma acompanha a mira sem "arrastar"
    this.sway = new Spring(4, 320, 30); this.rec = new Spring(6, 300, 24); this.air = new Spring(2, 110, 13); this.tilt = new Spring(1, 90, 15);
    this.camK = new Spring(3, 190, 17);
    this.bob = 0; this.t = 0; this.onEvent = () => {};
    this.slideKick = 0; this.boltKick = 0; this.slideLocked = false;
    this.fxList = []; this.shellPool = [];
    this.visible = true; this.flash = null;
    this._tmp = new Float32Array(8); this._t6 = new Float32Array(6); this._l6 = new Float32Array(6); this._r6 = new Float32Array(6); this._k6 = new Float32Array(6);
    for (const k of ['rifle', 'pistol', 'sniper', 'ak', 'smg', 'shotgun', 'dmr', 'deagle', 'nade']) this.addGun(k, buildWeapon(k));
    this.setKnife('default');
  }
  addGun(k, g) {
    g.visible = false; this.root.add(g); this.guns[k] = g;
    g.userData.magRest = g.userData.parts.mag ? g.userData.parts.mag.position.clone() : null;
    g.userData.magRot = g.userData.parts.mag ? g.userData.parts.mag.rotation.clone() : null;
  }
  setKnife(kind) {
    if (this.guns.knife) { this.root.remove(this.guns.knife); }
    this.knifeKind = kind;
    const g = buildWeapon('knife', { knife: kind }); this.addGun('knife', g);
    if (this.kind === 'knife') this.equip('knife');
  }
  equip(kind, empty) {
    this.kind = kind; this.clip = null;
    for (const [k, g] of Object.entries(this.guns)) g.visible = k === kind;
    this.cur = this.guns[kind];
    const hp = HAND_POSE[kind];
    this.cur.add(this.rh); this.rh.position.set(...hp.r.p); this.rh.rotation.set(...hp.r.r);
    if (hp.l) { this.cur.add(this.lh); this.lh.position.set(...hp.l.p); this.lh.rotation.set(...hp.l.r); this.lh.visible = true; } else { this.lh.visible = false; if (this.lh.parent) this.lh.parent.remove(this.lh); }
    this.slideLocked = false;
    const P = this.cur.userData.parts;
    if (P.pin) P.pin.visible = true;
    this.resetParts();
    this.rebuildClips(empty);
  }
  resetParts() {
    const ud = this.cur.userData, P = ud.parts;
    if (P.spin) { P.spin.position.set(...ud.pivot); P.spin.rotation.set(0, 0, 0); }
    if (P.bl) P.bl.rotation.set(0, 0, 0);
    if (P.ha) P.ha.rotation.set(0, 0, 0);
    if (P.shell) P.shell.visible = false;
    if (P.pump) P.pump.position.z = ud.pumpRest;
  }
  rebuildClips(empty) {
    const f = FAMILY[this.kind];
    this.clips = f === 'knife' ? knifeClips(this.knifeKind) : f === 'nade' ? nadeClips() : f === 'shotgun' ? shotgunClips() : gunClips(f, !!empty, this.kind);
  }
  play(name, dur, opts = {}) {
    if (name === 'reload' && this.kind !== 'knife') this.rebuildClips(opts.empty);
    const c = this.clips[name];
    if (!c) { this.clip = null; return; }
    if (this.cur.userData.parts.pin) this.cur.userData.parts.pin.visible = true;
    this.clip = { name, c, t0: performance.now(), dur, fired: new Set() };
  }
  cancel(name) { if (this.clip && (!name || this.clip.name === name)) { this.clip = null; this.resetParts(); } }
  busyWith() { return this.clip ? this.clip.name : ''; }
  fire(ads, last) {
    const r = this.rec, k = this.kind, a = ads ? 0.45 : 1, K = KICK[k] || KICK.rifle;
    r.kick(2, K[0] * a); r.kick(3, K[1] * a); r.kick(4, (Math.random() - 0.5) * K[2] * a); r.kick(5, (Math.random() - 0.5) * K[3] * a); r.kick(1, K[4] * a);
    if (FAMILY[k] === 'pistol') { this.slideKick = 1; this.slideLocked = !!last; } else this.boltKick = 1;
    this.camK.kick(0, k === 'sniper' ? 1.4 : k === 'shotgun' || k === 'deagle' ? 1.1 : k === 'pistol' ? 0.55 : k === 'dmr' ? 0.8 : 0.35);
    this.camK.kick(2, (Math.random() - 0.5) * (k === 'sniper' || k === 'shotgun' ? 1.2 : 0.3));
    if (k !== 'sniper' && k !== 'shotgun') this.ejectShell();
  }
  impulse(which, v) { if (which === 'land') { this.air.kick(0, -v); this.camK.kick(1, -v * 0.5); } else if (which === 'jump') { this.air.kick(0, v); this.air.kick(1, v * 2); } }
  ejectShell() {
    const g = this.cur; if (!g || !g.userData.eject) return;
    let m = this.shellPool.find((s) => !s.visible);
    if (!m) { m = new THREE.Mesh(shellGeo(this.kind), MAT.brass); this.scene.add(m); this.shellPool.push(m); }
    else { m.geometry.dispose(); m.geometry = shellGeo(this.kind); }
    m.material = this.kind === 'shotgun' ? MAT.redShell : MAT.brass;
    g.updateMatrixWorld(true);
    m.position.copy(g.userData.eject).applyMatrix4(g.matrixWorld);
    m.quaternion.copy(g.getWorldQuaternion(_q)); m.visible = true; m.scale.setScalar(1);
    const right = _v.set(1, 0, 0).applyQuaternion(m.quaternion);
    m.userData = { v: right.multiplyScalar(1.3 + Math.random() * 0.5).add(_v2.set((Math.random() - 0.3) * 0.2, 0.9 + Math.random() * 0.4, 0.25)), w: new THREE.Vector3(Math.random() * 20, 18 + Math.random() * 10, Math.random() * 8), life: 0.75 };
    this.fxList.push(m);
  }
  dropMag() {
    const g = this.cur, mag = g && g.userData.parts.mag; if (!mag) return;
    const c = mag.clone(true); g.updateMatrixWorld(true);
    mag.getWorldPosition(c.position); mag.getWorldQuaternion(c.quaternion);
    this.scene.add(c);
    c.userData = { v: new THREE.Vector3(0.05, -0.6, 0.05), w: new THREE.Vector3(1.5, 0.3, 2.5), life: 0.8, mag: true };
    this.fxList.push(c);
  }
  updateFx(dt) {
    for (let i = this.fxList.length - 1; i >= 0; i--) {
      const m = this.fxList[i], u = m.userData;
      u.life -= dt; u.v.y -= 7.5 * dt;
      m.position.addScaledVector(u.v, dt);
      m.rotation.x += u.w.x * dt; m.rotation.y += u.w.y * dt; m.rotation.z += u.w.z * dt;
      if (u.life < 0.2 && !u.mag) m.scale.setScalar(Math.max(0.01, u.life / 0.2));
      if (u.life <= 0) { if (u.mag) { this.scene.remove(m); } else m.visible = false; this.fxList.splice(i, 1); }
    }
  }
  // s = { dt, now, adsOn, speed, strafe, grounded, crouch, mdx, mdy, hidden, swayK }
  update(s) {
    const dt = s.dt, g = this.cur; if (!g) return;
    this.t += dt;
    const ud = g.userData, fam = FAMILY[this.kind];
    const adsTime = this.kind === 'sniper' ? 0.2 : this.kind === 'dmr' ? 0.18 : fam === 'pistol' ? 0.13 : this.kind === 'smg' ? 0.14 : 0.17;
    this.adsTarget = s.adsOn ? 1 : 0;
    this.ads = clamp(this.ads + (this.adsTarget ? 1 : -1) * dt / adsTime, 0, 1);
    const A = ease(this.ads), damp = 1 - A * 0.85;
    const sk = s.swayK ?? 0.5;
    const sw = this.sway;
    sw.t[0] = clamp(-s.mdx * 0.0007 * sk, -0.035, 0.035); sw.t[1] = clamp(s.mdy * 0.0007 * sk, -0.035, 0.035);
    sw.t[2] = sw.t[0] * 0.8; sw.t[3] = 0;
    sw.step(dt); this.rec.step(dt); this.air.step(dt); this.camK.step(dt);
    this.tilt.t[0] = -clamp(s.strafe, -1, 1) * 0.05 * damp * (0.4 + sk); this.tilt.step(dt);
    const moving = s.speed > 0.4 && s.grounded;
    this.bob += dt * (moving ? (s.crouch ? 7 : 10.5) * clamp(s.speed / 5.5, 0.4, 1.2) : 0);
    const bobA = moving ? clamp(s.speed / 5.5, 0, 1.2) : 0;
    this.bobAmp = (this.bobAmp || 0) + (bobA - (this.bobAmp || 0)) * Math.min(1, dt * 10);
    const ba = this.bobAmp * damp * (0.5 + sk);
    const breathe = Math.sin(this.t * 1.6) * 0.0018 * (1 - A * 0.75);
    const hip = ud.hip, S = ud.sight, dist = ud.adsDist;
    const px = hip.p[0] + (-S.x - hip.p[0]) * A, py = hip.p[1] + (-S.y - hip.p[1]) * A, pz = hip.p[2] + (-dist - S.z - hip.p[2]) * A;
    let rx = hip.r[0] * (1 - A), ry = hip.r[1] * (1 - A), rz = hip.r[2] * (1 - A);
    let cp = Z6;
    let lhOff = null, rhOff = null;
    const parts = ud.parts;
    let vis = true;
    if (this.clip) {
      const c = this.clip, t = clamp((s.now - c.t0) / c.dur, 0, 1), C = c.c;
      for (const [et, name] of C.ev || []) if (t >= et && !c.fired.has(et)) { c.fired.add(et); if (name === 'magdrop') this.dropMag(); else if (name === 'shell') this.ejectShell(); else this.onEvent(name); }
      if (C.gun) cp = sample(C.gun, t, this._t6);
      if (C.lh) lhOff = sample(C.lh, t, this._l6);
      if (C.rh) rhOff = sample(C.rh, t, this._r6);
      if (parts.mag && ud.magRest) {
        if (C.mag) { const m = sample(C.mag, t, this._k6); parts.mag.position.set(ud.magRest.x + m[0], ud.magRest.y + m[1], ud.magRest.z + m[2]); parts.mag.rotation.set(ud.magRot.x + m[3], m[4], m[5]); }
        if (C.magVis) { let v = 1; for (const [tt, vv] of C.magVis) if (t >= tt) v = vv; parts.mag.visible = !!v; }
      }
      if (parts.charge && C.charge) parts.charge.position.z = (ud.chargeRest ?? (ud.kind === 'ak' ? ud.boltRest : 0.075)) + sample(C.charge, t, this._tmp)[0];
      if (parts.slide && C.slide) { parts.slide.position.z = (ud.slideRest ?? -0.055) + sample(C.slide, t, this._tmp)[0] * ((ud.slideTravel ?? 0.036) / 0.036); if (c.name === 'reload') this.slideLocked = false; }
      if (parts.bolt && C.bolt && this.kind === 'sniper') { const b = sample(C.bolt, t, this._tmp); parts.bolt.rotation.z = b[0]; parts.bolt.position.z = b[1]; }
      if (parts.pump && C.pump) parts.pump.position.z = ud.pumpRest + sample(C.pump, t, this._tmp)[0];
      if (parts.shell && C.shell) { const q = sample(C.shell, t, this._tmp); parts.shell.position.set(q[0], 0.062 - 0.06 + q[1], -0.06 + q[2]); let v = 0; for (const [tt, vv] of C.shellVis) if (t >= tt) v = vv; parts.shell.visible = !!v; }
      if (parts.spin) {
        if (C.kn) { const k = sample(C.kn, t, this._k6); parts.spin.position.set(ud.pivot[0] + k[0], ud.pivot[1] + k[1], ud.pivot[2] + k[2]); parts.spin.rotation.set(k[3], k[4], k[5]); }
        else { parts.spin.position.set(...ud.pivot); parts.spin.rotation.set(0, 0, 0); }
      }
      if (parts.bl) parts.bl.rotation.x = C.bl ? sample(C.bl, t, this._tmp)[0] : 0;
      if (parts.ha) parts.ha.rotation.x = C.ha ? sample(C.ha, t, this._tmp)[0] : 0;
      if (parts.pin && C.pinOut !== undefined) parts.pin.visible = t < C.pinOut;
      if (C.vis) { let v = 1; for (const [tt, vv] of C.vis) if (t >= tt) v = vv; vis = !!v; }
      if (t >= 1) {
        this.clip = null;
        if (parts.mag && ud.magRest) { parts.mag.position.copy(ud.magRest); parts.mag.rotation.copy(ud.magRot); parts.mag.visible = true; }
        if (!C.vis) this.resetParts(); else vis = false;
        if (C.vis) this.hiddenAfter = true;
      }
    } else {
      if (parts.mag && ud.magRest) parts.mag.visible = true;
      if (this.hiddenAfter) vis = false;
    }
    if (this.clip) this.hiddenAfter = false;
    // pecas do disparo
    this.slideKick = Math.max(0, this.slideKick - dt / 0.075); this.boltKick = Math.max(0, this.boltKick - dt / 0.06);
    const kc = (x) => Math.sin(Math.PI * (1 - x)) * (x > 0 ? 1 : 0);
    if (parts.slide && !(this.clip && this.clip.c.slide)) parts.slide.position.z = (ud.slideRest ?? -0.055) + (this.slideLocked ? (ud.slideTravel ?? 0.036) : kc(this.slideKick) * (ud.slideTravel ?? 0.034));
    if (parts.bolt && this.kind !== 'sniper' && !(this.clip && this.clip.c.charge && parts.charge === parts.bolt)) parts.bolt.position.z = (ud.boltRest ?? -0.045) + kc(this.boltKick) * (ud.boltTravel ?? 0.03);
    const R = this.rec.x, air = this.air.x;
    const bx = Math.cos(this.bob * 0.5) * 0.011 * ba, by = -Math.abs(Math.sin(this.bob * 0.5)) * 0.009 * ba;
    g.position.set(
      px + cp[0] - sw.x[0] * damp + bx + R[4] * 0.003,
      py + cp[1] + sw.x[1] * 0.7 * damp + by + breathe + air[0] * 0.012 * damp - (s.crouch ? 0.008 : 0) * damp - R[1] * 0.004,
      pz + cp[2] + R[2] * 0.012 + air[1] * 0.004,
    );
    g.rotation.set(rx + cp[3] - sw.x[1] * 0.9 * damp + R[3] * 0.012 + air[0] * 0.03 * damp, ry + cp[4] + sw.x[0] * 1.3 * damp + R[4] * 0.008 + Math.cos(this.bob * 0.5) * 0.008 * ba, rz + cp[5] + sw.x[2] * 0.8 * damp + this.tilt.x[0] + R[5] * 0.006, 'YXZ');
    g.visible = !s.hidden && vis;
    const hp = HAND_POSE[this.kind];
    this.rh.position.set(hp.r.p[0] + (rhOff ? rhOff[0] : 0), hp.r.p[1] + (rhOff ? rhOff[1] : 0), hp.r.p[2] + (rhOff ? rhOff[2] : 0));
    this.rh.rotation.set(hp.r.r[0] + (rhOff ? rhOff[3] : 0), hp.r.r[1] + (rhOff ? rhOff[4] : 0), hp.r.r[2] + (rhOff ? rhOff[5] : 0));
    if (hp.l) {
      this.lh.position.set(hp.l.p[0] + (lhOff ? lhOff[0] : 0), hp.l.p[1] + (lhOff ? lhOff[1] : 0), hp.l.p[2] + (lhOff ? lhOff[2] : 0));
      this.lh.rotation.set(hp.l.r[0] + (lhOff ? lhOff[3] : 0), hp.l.r[1] + (lhOff ? lhOff[4] : 0), hp.l.r[2] + (lhOff ? lhOff[5] : 0));
    }
    g.updateMatrixWorld(true);
    this.placeArm(this.armR, this.rh, ELBOW_R, !s.hidden && vis);
    this.placeArm(this.armL, this.lh, ELBOW_L, !s.hidden && vis && !!hp.l);
    if (ud.reticle) {
      g.getWorldQuaternion(_q);
      const u = ud.reticle.material.uniforms;
      u.uFwd.value.set(0, 0, -1).applyQuaternion(_q); u.uUp.value.set(0, 1, 0).applyQuaternion(_q); u.uRight.value.set(1, 0, 0).applyQuaternion(_q);
    }
    this.updateFx(dt);
  }
  placeArm(arm, hand, elbow, vis) {
    arm.sleeve.visible = arm.cuff.visible = vis;
    if (!vis) return;
    const w = hand.userData.wrist;
    _v.copy(w).applyMatrix4(hand.matrixWorld);
    _v2.copy(elbow).sub(_v); const len = _v2.length(); _v2.normalize();
    _q.setFromUnitVectors(UP, _v2);
    arm.sleeve.position.copy(_v); arm.sleeve.quaternion.copy(_q); arm.sleeve.scale.set(1, len, 1);
    arm.cuff.position.copy(_v); arm.cuff.quaternion.copy(_q);
  }
  muzzle(out) { const g = this.cur; if (!g || !g.userData.muzzle) return null; g.updateMatrixWorld(true); return out.copy(g.userData.muzzle).applyMatrix4(g.matrixWorld); }
  camOffset() { return this.camK.x; }
}
