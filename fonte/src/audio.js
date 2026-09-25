// FRAG - som. Tudo sintetizado em DSP no navegador (sem arquivos): tiros em camadas
// (estalo supersonico, explosao em bandas, corpo grave, mecanica), foley modal (carregador,
// ferrolho, slide), passos por superficie, capsulas, zunido de bala, ambiencias em loop e
// reverb de convolucao por mapa. Reproducao 3D com PannerNode e abafamento atras de parede.
import { S } from './core.js';

// ------------------------------------------------------------------ DSP basico
let SR = 48000;
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const buf = (sec) => new Float32Array(Math.max(1, Math.ceil(sec * SR)));
function coefs(type, f, Q = 0.707, gdb = 0) {
  f = Math.min(f, SR * 0.45);
  const w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else { const A = Math.pow(10, gdb / 40); b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function filt(x, type, f, Q, g) {
  const [b0, b1, b2, a1, a2] = coefs(type, f, Q, g);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
  return x;
}
// filtro com frequencia variando no tempo: fAt(t) em Hz
function sweep(x, type, fAt, Q) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, k = null;
  for (let i = 0; i < x.length; i++) {
    if ((i & 31) === 0) k = coefs(type, Math.max(30, fAt(i / SR)), Q);
    const v = x[i], y = k[0] * v + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
function noise(sec, r) { const a = buf(sec); for (let i = 0; i < a.length; i++) a[i] = r() * 2 - 1; return a; }
function env(x, atk, tau, delay = 0) {
  for (let i = 0; i < x.length; i++) {
    const t = i / SR - delay;
    x[i] *= t < 0 ? 0 : (t < atk ? t / atk : Math.exp(-(t - atk) / tau));
  }
  return x;
}
function bell(x, t0, t1, pow = 2) { // envelope sin^pow entre t0 e t1
  for (let i = 0; i < x.length; i++) { const t = i / SR; const u = (t - t0) / (t1 - t0); x[i] *= u <= 0 || u >= 1 ? 0 : Math.pow(Math.sin(Math.PI * u), pow); }
  return x;
}
function mix(dst, src, g = 1, at = 0) { const o = Math.floor(at * SR); for (let i = 0; i < src.length && i + o < dst.length; i++) if (i + o >= 0) dst[i + o] += src[i] * g; return dst; }
function sine(dst, f0, f1, tau, amp, at = 0, sweepTau = 0.05) {
  const o = Math.floor(at * SR); let ph = 0;
  for (let i = 0; o + i < dst.length; i++) {
    const t = i / SR, f = f1 + (f0 - f1) * Math.exp(-t / sweepTau);
    ph += 2 * Math.PI * f / SR;
    const e = Math.exp(-t / tau) * Math.min(1, t / 0.0008);
    if (e < 1e-4 && t > 0.01) break;
    dst[o + i] += Math.sin(ph) * e * amp;
  }
  return dst;
}
function modal(dst, modes, at = 0, r = Math.random, detune = 0) {
  const o = Math.floor(at * SR);
  for (const [f0, tau, amp] of modes) {
    const f = f0 * (1 + (r() - 0.5) * detune), ph0 = r() * 6.28;
    for (let i = 0; o + i < dst.length; i++) {
      const t = i / SR, e = Math.exp(-t / tau);
      if (e < 1e-4) break;
      dst[o + i] += Math.sin(ph0 + 2 * Math.PI * f * t) * e * amp * Math.min(1, t / 0.0003);
    }
  }
  return dst;
}
function click(dst, at, amp, r, f = 3500, Q = 1.2) { const n = env(noise(0.012, r), 0.0002, 0.0018); filt(n, 'bp', f, Q); return mix(dst, n, amp * 3, at); }
function friction(dst, at, dur, f, amp, r, Q = 0.8) { const n = noise(dur, r); filt(n, 'bp', f, Q); for (let i = 0; i < n.length; i++) n[i] *= 0.6 + 0.4 * r(); bell(n, 0, dur, 0.7); return mix(dst, n, amp, at); }
function sat(x, d) { const k = Math.tanh(d); for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * d) / k; return x; }
function norm(x, peak = 0.9) { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m; return x; }
function fadeOut(x, sec) { const n = Math.min(x.length, Math.floor(sec * SR)); for (let i = 0; i < n; i++) x[x.length - 1 - i] *= i / n; return x; }

// ------------------------------------------------------------------ receitas
function gunshot(kind, seed) {
  const r = rng(seed);
  const P = {
    rifle: { len: 0.6, crack: 0.8, bright: 0.018, floor: 1100, fast: 0.007, slow: 0.045, body: [320, 0.03, 0.9], thump: [150, 60, 0.022, 0.35], drive: 1.7, tail: [700, 0.11, 0.16], mech: 0.034 },
    pistol: { len: 0.45, crack: 0, bright: 0.012, floor: 1300, fast: 0.005, slow: 0.03, body: [420, 0.022, 0.8], thump: [190, 80, 0.016, 0.3], drive: 1.6, tail: [800, 0.08, 0.13], mech: 0.011 },
    sniper: { len: 1.2, crack: 1.0, bright: 0.03, floor: 700, fast: 0.01, slow: 0.075, body: [240, 0.06, 1.1], thump: [110, 40, 0.045, 0.45], drive: 1.9, tail: [450, 0.26, 0.22], mech: 0 },
    ak: { len: 0.7, crack: 0.9, bright: 0.021, floor: 850, fast: 0.008, slow: 0.052, body: [270, 0.036, 1.05], thump: [125, 48, 0.028, 0.45], drive: 1.95, tail: [600, 0.13, 0.19], mech: 0.036 },
    smg: { len: 0.38, crack: 0, bright: 0.008, floor: 1500, fast: 0.004, slow: 0.02, body: [520, 0.014, 0.55], thump: [220, 95, 0.011, 0.24], drive: 1.35, tail: [1000, 0.055, 0.1], mech: 0.018 },
    shotgun: { len: 1.05, crack: 0.45, bright: 0.032, floor: 560, fast: 0.013, slow: 0.075, body: [190, 0.075, 1.35], thump: [85, 36, 0.065, 0.62], drive: 2.15, tail: [380, 0.24, 0.26], mech: 0 },
    dmr: { len: 0.95, crack: 1.0, bright: 0.026, floor: 780, fast: 0.009, slow: 0.062, body: [255, 0.046, 1.05], thump: [118, 44, 0.036, 0.44], drive: 1.88, tail: [520, 0.19, 0.2], mech: 0.04 },
    deagle: { len: 0.65, crack: 0.35, bright: 0.02, floor: 950, fast: 0.008, slow: 0.048, body: [290, 0.042, 1.15], thump: [135, 52, 0.032, 0.48], drive: 1.95, tail: [640, 0.13, 0.19], mech: 0.013 },
  }[kind];
  const out = buf(P.len);
  // explosao: ruido com envelope de dois estagios e passa-baixa que fecha com o tempo (o agudo morre primeiro)
  const n = noise(P.len, r);
  for (let i = 0; i < n.length; i++) { const t = i / SR; n[i] *= Math.min(1, t / 0.0003) * (0.72 * Math.exp(-t / P.fast) + 0.28 * Math.exp(-t / P.slow)); }
  sweep(n, 'lp', (t) => P.floor + 14000 * Math.exp(-t / P.bright), 0.6);
  mix(out, n, 1.5);
  // corpo: ruido grave (pressao), mais um pouco de tom varrido bem curto
  const body = filt(noise(P.len, r), 'lp', P.body[0], 0.8); env(body, 0.0008, P.body[1]); mix(out, body, P.body[2] * 2.2);
  sine(out, P.thump[0], P.thump[1], P.thump[2], P.thump[3], 0.0004, 0.012);
  // estalo supersonico (onda N)
  if (P.crack) { const L = Math.floor(0.0004 * SR); for (let i = 0; i < L; i++) out[i] += P.crack * 1.4 * (1 - 2 * i / L); }
  sat(out, P.drive);
  // cauda curta de ar/reflexao proxima (o reverb do mapa vem por cima)
  const tail = filt(noise(P.len, r), 'lp', P.tail[0], 0.6);
  for (let i = 0; i < tail.length; i++) { const t = i / SR; tail[i] *= t < 0.006 ? 0 : Math.min(1, (t - 0.006) / 0.01) * Math.exp(-(t - 0.006) / P.tail[1]); }
  mix(out, tail, P.tail[2]);
  if (P.mech) {
    modal(out, [[3100, 0.016, 0.07], [5200, 0.009, 0.05], [1750, 0.025, 0.06]], P.mech, r, 0.08);
    click(out, P.mech, 0.07, r, 4200);
    if (kind === 'pistol' || kind === 'deagle') { modal(out, [[2500, 0.014, 0.06], [4300, 0.008, 0.04]], 0.048, r, 0.08); click(out, 0.048, 0.06, r, 3800); }
  }
  fadeOut(out, 0.06);
  return norm(out, 0.95);
}
function dryFire(seed) { const r = rng(seed), o = buf(0.12); click(o, 0, 0.5, r, 4200, 2); modal(o, [[4100, 0.008, 0.3], [6900, 0.005, 0.2]], 0, r, 0.05); return norm(o, 0.5); }
function magOut(seed) { const r = rng(seed), o = buf(0.35); click(o, 0, 0.5, r, 3800, 2); modal(o, [[3500, 0.01, 0.25], [5200, 0.007, 0.15]], 0, r, 0.1); friction(o, 0.02, 0.09, 1800, 0.35, r); modal(o, [[900, 0.03, 0.2], [1700, 0.02, 0.15]], 0.1, r, 0.1); return norm(o, 0.6); }
function magIn(seed) {
  const r = rng(seed), o = buf(0.4); friction(o, 0, 0.06, 1500, 0.3, r);
  modal(o, [[880, 0.035, 0.6], [1580, 0.028, 0.45], [2850, 0.02, 0.35], [4250, 0.012, 0.25]], 0.06, r, 0.06); click(o, 0.06, 0.8, r, 2600);
  click(o, 0.085, 0.25, r, 4800); click(o, 0.1, 0.15, r, 5200);
  const th = filt(env(noise(0.1, r), 0.001, 0.02), 'lp', 400); mix(o, th, 0.6, 0.06);
  return norm(o, 0.75);
}
function magTap(seed) { const r = rng(seed), o = buf(0.2); const th = filt(env(noise(0.1, r), 0.001, 0.018), 'lp', 500); mix(o, th, 1); modal(o, [[1200, 0.02, 0.3], [2600, 0.012, 0.2]], 0.002, r, 0.1); click(o, 0.002, 0.3, r, 3000); return norm(o, 0.55); }
function chargePull(seed) { const r = rng(seed), o = buf(0.3); click(o, 0, 0.4, r, 3200); friction(o, 0.01, 0.11, 2100, 0.4, r, 1.2); modal(o, [[2200, 0.02, 0.2]], 0.12, r); return norm(o, 0.55); }
function chargeRelease(seed) {
  const r = rng(seed), o = buf(0.45);
  modal(o, [[1150, 0.05, 0.7], [2350, 0.04, 0.45], [3900, 0.03, 0.3], [6200, 0.05, 0.18]], 0, r, 0.05); click(o, 0, 0.9, r, 2800);
  modal(o, [[2450, 0.12, 0.08], [3700, 0.09, 0.06]], 0.002, r); // mola
  return norm(o, 0.8);
}
function slideRelease(seed) { const r = rng(seed), o = buf(0.3); modal(o, [[1350, 0.035, 0.6], [2650, 0.025, 0.45], [4900, 0.015, 0.3]], 0, r, 0.05); click(o, 0, 0.9, r, 3000); return norm(o, 0.75); }
function slideBack(seed) { const r = rng(seed), o = buf(0.25); friction(o, 0, 0.08, 2400, 0.35, r, 1.3); click(o, 0.08, 0.4, r, 3600); modal(o, [[2900, 0.015, 0.2]], 0.08, r); return norm(o, 0.5); }
function boltUp(seed) { const r = rng(seed), o = buf(0.18); click(o, 0, 0.6, r, 3000, 1.6); modal(o, [[2600, 0.018, 0.3], [4100, 0.01, 0.2]], 0, r, 0.1); return norm(o, 0.55); }
function boltBack(seed) { const r = rng(seed), o = buf(0.3); friction(o, 0, 0.1, 1900, 0.5, r, 1); modal(o, [[1500, 0.03, 0.5], [3300, 0.02, 0.35]], 0.1, r, 0.08); click(o, 0.1, 0.6, r, 2500); return norm(o, 0.7); }
function boltFwd(seed) { const r = rng(seed), o = buf(0.3); friction(o, 0, 0.08, 2200, 0.45, r, 1); modal(o, [[1250, 0.035, 0.55], [2950, 0.025, 0.4], [5100, 0.015, 0.25]], 0.08, r, 0.08); click(o, 0.08, 0.7, r, 2700); return norm(o, 0.75); }
function drawSnd(seed) {
  const r = rng(seed), o = buf(0.35); friction(o, 0, 0.18, 950, 0.5, r, 0.6);
  for (let i = 0; i < 3; i++) { const t = 0.05 + r() * 0.2; modal(o, [[2000 + r() * 3000, 0.01, 0.15]], t, r); click(o, t, 0.12, r, 4000); }
  return norm(o, 0.45);
}
function cloth(seed, dur = 0.14, f = 1100, amp = 0.5) { const r = rng(seed), o = buf(dur + 0.02); friction(o, 0, dur, f, amp, r, 0.5); return norm(o, amp); }
function knifeDraw(seed) { const r = rng(seed), o = buf(0.5); friction(o, 0, 0.3, 5200, 0.35, r, 2); modal(o, [[5600, 0.12, 0.08], [8300, 0.1, 0.05]], 0.25, r); return norm(o, 0.5); }
function swing(seed, heavy) {
  const r = rng(seed), d = heavy ? 0.3 : 0.22, o = noise(d, r);
  sweep(o, 'bp', (t) => { const u = t / d; return heavy ? 500 + 1900 * Math.sin(Math.PI * u) : 700 + 2600 * Math.sin(Math.PI * Math.min(1, u * 1.1)); }, 1.3);
  bell(o, 0, d, 1.6);
  return norm(o, heavy ? 0.6 : 0.5);
}
function stabHit(seed) {
  const r = rng(seed), o = buf(0.35); sine(o, 130, 60, 0.03, 0.6, 0, 0.015);
  const w = filt(env(noise(0.2, r), 0.001, 0.04), 'lp', 1500); mix(o, w, 0.7);
  const sq = filt(env(noise(0.25, r), 0.01, 0.06), 'bp', 650, 2); mix(o, sq, 0.5, 0.01);
  return norm(sat(o, 1.2), 0.85);
}
function hitTick(seed) { const r = rng(seed), o = buf(0.08); click(o, 0, 1, r, 3300, 3); modal(o, [[2950, 0.012, 0.5], [4700, 0.008, 0.3]], 0, r); return norm(o, 0.55); }
function headDink(seed) {
  const r = rng(seed), o = buf(0.55); click(o, 0, 0.7, r, 5000, 1.5);
  modal(o, [[2350, 0.24, 0.6], [3870, 0.16, 0.45], [5420, 0.1, 0.32], [7620, 0.06, 0.2], [9800, 0.035, 0.12]], 0, r, 0.02);
  return norm(o, 0.7);
}
function killConfirm(seed) {
  const r = rng(seed), o = buf(0.5); sine(o, 90, 50, 0.05, 0.7, 0, 0.03);
  const th = filt(env(noise(0.2, r), 0.001, 0.03), 'lp', 260); mix(o, th, 0.9);
  click(o, 0, 0.35, r, 2400); modal(o, [[1760, 0.14, 0.14], [2640, 0.1, 0.1], [3520, 0.07, 0.05]], 0.03, r);
  return norm(o, 0.75);
}
function hurt(seed) {
  const r = rng(seed), o = buf(0.4); const th = filt(env(noise(0.3, r), 0.001, 0.05), 'lp', 380); mix(o, th, 1.2);
  sine(o, 95, 55, 0.035, 0.5, 0, 0.02); modal(o, [[3100, 0.03, 0.05]], 0.005, r);
  return norm(sat(o, 1.2), 0.8);
}
function step(surface, seed) {
  const r = rng(seed), o = buf(0.3);
  const heel = (f, tau, a) => { const t = filt(env(noise(0.12, r), 0.001, tau), 'lp', f); mix(o, t, a); };
  if (surface === 'sand') {
    heel(220, 0.025, 0.5);
    const g = buf(0.16); for (let i = 0; i < 70; i++) { const at = Math.floor(Math.pow(r(), 1.4) * g.length * 0.9); g[at] += (r() - 0.5) * 2.5; }
    filt(g, 'bp', 2800, 0.5); env(g, 0.004, 0.05); fadeOut(g, 0.03); mix(o, g, 0.9, 0.004);
  } else if (surface === 'metal') {
    heel(260, 0.02, 0.8); click(o, 0.003, 0.35, r, 2500);
    modal(o, [[380 + r() * 40, 0.12, 0.28], [910, 0.08, 0.22], [1520, 0.05, 0.16], [2750, 0.03, 0.1]], 0.002, r, 0.08);
  } else if (surface === 'wood') {
    heel(240, 0.03, 0.9); const res = filt(env(noise(0.2, r), 0.001, 0.05), 'bp', 190 + r() * 40, 4); mix(o, res, 1.2, 0.002); click(o, 0.004, 0.2, r, 2000);
  } else if (surface === 'carpet') {
    heel(240, 0.022, 0.9); friction(o, 0.01, 0.06, 700, 0.12, r, 0.6);
  } else if (surface === 'tile') {
    heel(300, 0.015, 0.7); click(o, 0.002, 0.7, r, 3400, 1.4); modal(o, [[2200, 0.012, 0.12]], 0.002, r, 0.1); friction(o, 0.03, 0.05, 2500, 0.06, r);
  } else if (surface === 'wet') {
    heel(320, 0.018, 0.7); click(o, 0.002, 0.3, r, 2800);
    const sp = filt(env(noise(0.2, r), 0.003, 0.05), 'bp', 2400, 0.7); mix(o, sp, 0.55, 0.004);
    for (let i = 0; i < 4; i++) modal(o, [[3000 + r() * 3500, 0.012, 0.05]], 0.02 + r() * 0.12, r);
  } else if (surface === 'snow') {
    heel(200, 0.03, 0.7);
    const g = buf(0.18); for (let i = 0; i < 120; i++) { const at = Math.floor(Math.pow(r(), 1.2) * g.length * 0.85); g[at] += (r() - 0.5) * 2; }
    filt(g, 'bp', 1600, 0.6); env(g, 0.006, 0.06); fadeOut(g, 0.03); mix(o, g, 1.1, 0.004);
    friction(o, 0.01, 0.09, 900, 0.15, r, 0.7);
  } else { // concreto
    heel(330, 0.02, 0.8); click(o, 0.002, 0.45, r, 2600, 1.2); friction(o, 0.018, 0.05, 1500, 0.1, r);
  }
  return norm(o, 0.6);
}
function shells(surface, seed) {
  const r = rng(seed), o = buf(0.5);
  const soft = surface === 'sand' || surface === 'carpet' || surface === 'snow';
  const times = [0, 0.1 + r() * 0.03, 0.17 + r() * 0.04, 0.22 + r() * 0.03], amps = [0.6, 0.35, 0.2, 0.1];
  for (let i = 0; i < times.length; i++) {
    const k = soft ? 0.25 : 1;
    modal(o, [[4200, 0.05 * k, amps[i]], [6750, 0.035 * k, amps[i] * 0.7], [9100, 0.025 * k, amps[i] * 0.4]], times[i], r, 0.06);
    click(o, times[i], amps[i] * 0.3, r, 6000);
  }
  return norm(o, soft ? 0.25 : 0.4);
}
function flyby(seed, crack) {
  const r = rng(seed), d = 0.22, o = noise(d, r);
  sweep(o, 'bp', (t) => 2600 - 1500 * (t / d), 2.2);
  for (let i = 0; i < o.length; i++) { const u = i / o.length; o[i] *= Math.exp(-Math.pow((u - 0.45) / 0.16, 2)); }
  if (crack) { const L = Math.floor(0.0004 * SR), at = Math.floor(0.09 * SR); for (let i = 0; i < L; i++) o[at + i] += 1.2 * (1 - 2 * i / L); }
  return norm(o, 0.7);
}
function land(surface, seed) { const r = rng(seed), o = buf(0.4); const th = filt(env(noise(0.2, r), 0.001, 0.035), 'lp', 200); mix(o, th, 1.4); mix(o, step(surface, seed + 3), 0.8); mix(o, step(surface, seed + 7), 0.6, 0.035); friction(o, 0, 0.1, 1200, 0.15, r, 0.6); return norm(o, 0.75); }
function impactSnd(kind, seed) {
  const r = rng(seed), o = buf(0.3);
  if (kind === 'metal') { click(o, 0, 0.7, r, 4000); modal(o, [[2100 + r() * 400, 0.06, 0.35], [3400, 0.04, 0.25], [5600, 0.03, 0.2], [880, 0.08, 0.15]], 0, r, 0.1); }
  else if (kind === 'wood') { click(o, 0, 0.5, r, 1800); const b = filt(env(noise(0.15, r), 0.001, 0.03), 'bp', 420, 2); mix(o, b, 1); }
  else if (kind === 'sand' || kind === 'snow') { const b = filt(env(noise(0.2, r), 0.002, 0.04), 'lp', 1500); mix(o, b, 0.8); const g = filt(env(noise(0.2, r), 0.002, 0.06), 'hp', 3000); mix(o, g, 0.3); }
  else if (kind === 'glass') { click(o, 0, 0.6, r, 5000); modal(o, [[3400, 0.08, 0.2], [5900, 0.06, 0.15], [8200, 0.04, 0.1]], 0, r, 0.2); }
  else { click(o, 0, 0.8, r, 2600); const b = filt(env(noise(0.2, r), 0.001, 0.03), 'bp', 900, 0.9); mix(o, b, 0.8); const d = filt(env(noise(0.25, r), 0.01, 0.07), 'hp', 2500); mix(o, d, 0.12, 0.01); }
  return norm(o, 0.5);
}
// granada: explosao grave com estilhacos, quique metalico, pino
function explosion(seed) {
  const r = rng(seed), L = 2.6, o = buf(L);
  const n = noise(L, r);
  for (let i = 0; i < n.length; i++) { const t = i / SR; n[i] *= Math.min(1, t / 0.002) * (0.6 * Math.exp(-t / 0.05) + 0.4 * Math.exp(-t / 0.5)); }
  sweep(n, 'lp', (t) => 180 + 7000 * Math.exp(-t / 0.05), 0.7); mix(o, n, 2.2);
  sine(o, 70, 28, 0.35, 1.1, 0, 0.08); sine(o, 45, 22, 0.6, 0.7, 0.01, 0.2);
  const deb = buf(L); for (let i = 0; i < 140; i++) { const at = 0.05 + Math.pow(r(), 1.6) * 1.8; click(deb, at, 0.08 + r() * 0.12 * Math.exp(-at), r, 1500 + r() * 4000, 1.5); }
  mix(o, deb, 0.7);
  const rum = filt(noise(L, r), 'lp', 120, 0.7); for (let i = 0; i < rum.length; i++) { const t = i / SR; rum[i] *= Math.min(1, t / 0.05) * Math.exp(-t / 0.9); } mix(o, rum, 2.4);
  sat(o, 2.2); fadeOut(o, 0.3);
  return norm(o, 0.98);
}
function nadeBounce(seed) { const r = rng(seed), o = buf(0.25); click(o, 0, 0.6, r, 2200); modal(o, [[1900 + r() * 300, 0.05, 0.3], [3300, 0.03, 0.2], [5100, 0.02, 0.1]], 0, r, 0.1); const th = filt(env(noise(0.1, r), 0.001, 0.015), 'lp', 600); mix(o, th, 0.6); return norm(o, 0.55); }
function nadePin(seed) { const r = rng(seed), o = buf(0.35); friction(o, 0, 0.08, 3500, 0.3, r, 1.5); modal(o, [[5200, 0.12, 0.25], [7800, 0.08, 0.15]], 0.08, r); click(o, 0.08, 0.4, r, 4500); return norm(o, 0.5); }
// butterfly / facas
function flipSnd(seed) { const r = rng(seed), o = buf(0.2); friction(o, 0, 0.07, 4200, 0.25, r, 2); modal(o, [[4600 + r() * 600, 0.03, 0.15]], 0.06, r); return norm(o, 0.35); }
function latch(seed, open) { const r = rng(seed), o = buf(0.25); click(o, 0, 0.8, r, open ? 3800 : 3200, 2); modal(o, [[open ? 3700 : 3100, 0.04, 0.4], [6200, 0.025, 0.25], [9100, 0.015, 0.1]], 0, r, 0.05); click(o, 0.035, 0.4, r, 4200); modal(o, [[2900, 0.03, 0.2]], 0.035, r); return norm(o, 0.55); }
function knifeCatch(seed) { const r = rng(seed), o = buf(0.25); const th = filt(env(noise(0.1, r), 0.001, 0.02), 'lp', 700); mix(o, th, 0.8); modal(o, [[4800, 0.08, 0.12], [7100, 0.05, 0.08]], 0.004, r); return norm(o, 0.45); }
// escopeta
function shellIn(seed) { const r = rng(seed), o = buf(0.3); friction(o, 0, 0.07, 1400, 0.35, r, 0.9); click(o, 0.07, 0.7, r, 2300, 1.6); modal(o, [[1300, 0.03, 0.4], [2600, 0.02, 0.25]], 0.07, r, 0.1); return norm(o, 0.6); }
function pump(seed, fwd) { const r = rng(seed), o = buf(0.3); friction(o, 0, 0.09, fwd ? 1700 : 1300, 0.45, r, 0.8); click(o, 0.09, 0.9, r, fwd ? 2600 : 2000, 1.4); modal(o, [[fwd ? 1150 : 900, 0.04, 0.55], [fwd ? 2500 : 2100, 0.03, 0.35], [4200, 0.02, 0.2]], 0.09, r, 0.08); const th = filt(env(noise(0.1, r), 0.001, 0.02), 'lp', 450); mix(o, th, 0.5, 0.09); return norm(o, 0.8); }
function loopify(ch, fade) { const n = Math.floor(fade * SR), L = ch.length - n; const out = new Float32Array(L); for (let i = 0; i < L; i++) out[i] = ch[i]; for (let i = 0; i < n; i++) { const u = i / n; out[i] = ch[i] * Math.sin(u * Math.PI / 2) + ch[L + i] * Math.cos(u * Math.PI / 2); } return out; }
function ambience(kind, seed) {
  const r = rng(seed), dur = 9, chans = [];
  for (let c = 0; c < 2; c++) {
    const o = buf(dur + 1);
    if (kind === 'wind') {
      const n = filt(noise(dur + 1, r), 'lp', 420, 0.6); const g = filt(noise(dur + 1, r), 'bp', 1400, 0.5);
      const ph = r() * 6;
      for (let i = 0; i < o.length; i++) { const t = i / SR, m = 0.55 + 0.45 * Math.sin(t * 0.7 + ph) * Math.sin(t * 0.23 + ph * 2); o[i] = n[i] * m + g[i] * 0.12 * m * m; }
    } else if (kind === 'city') {
      const n = filt(noise(dur + 1, r), 'lp', 160, 0.6); mix(o, n, 1.4);
      const rain = filt(noise(dur + 1, r), 'hp', 2500, 0.6); for (let i = 0; i < rain.length; i++) rain[i] *= 0.35 + 0.65 * r(); filt(rain, 'lp', 7000); mix(o, rain, 0.35);
      for (let i = 0; i < 260; i++) modal(o, [[2500 + r() * 5000, 0.006, 0.05 + r() * 0.08]], r() * dur, r);
      for (let h = 1; h <= 4; h++) sine(o, 60 * h, 60 * h, 60, 0.012 / h, 0, 1);
    } else if (kind === 'harbor') {
      const n = filt(noise(dur + 1, r), 'lp', 300, 0.6); const ph = r() * 6;
      for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = n[i] * (0.5 + 0.3 * Math.sin(t * 0.5 + ph)); }
      // agua batendo no cais
      for (let k = 0; k < 14; k++) { const at = r() * dur, w = filt(env(noise(0.6, r), 0.08, 0.22), 'bp', 500 + r() * 400, 0.7); mix(o, w, 0.5, at); }
      for (let k = 0; k < 3; k++) { const at = r() * dur; for (let j = 0; j < 3; j++) sine(o, 2300 + r() * 500, 1500, 0.08, 0.03, at + j * 0.18, 0.1); }
    } else if (kind === 'blizzard') {
      const n = filt(noise(dur + 1, r), 'lp', 600, 0.6), hi = filt(noise(dur + 1, r), 'bp', 1800, 0.8); const ph = r() * 6;
      for (let i = 0; i < o.length; i++) { const t = i / SR, m = 0.55 + 0.45 * Math.sin(t * 0.9 + ph) * Math.sin(t * 0.37 + ph * 2); o[i] = n[i] * m * 1.2 + hi[i] * 0.25 * m * m; }
      for (let h = 0; h < 2; h++) sine(o, 330 + h * 90, 300 + h * 80, 3, 0.012, r() * 4, 2);
    } else if (kind === 'village') {
      const n = filt(noise(dur + 1, r), 'lp', 380, 0.6); mix(o, n, 0.8);
      const ci = filt(noise(dur + 1, r), 'bp', 5200, 3); for (let i = 0; i < ci.length; i++) { const t = i / SR; ci[i] *= 0.5 + 0.5 * Math.sin(t * 38) * (0.6 + 0.4 * Math.sin(t * 0.7)); } mix(o, ci, 0.14);
      for (let k = 0; k < 10; k++) { const at = r() * dur, f = 2600 + r() * 1800; for (let j = 0; j < 2 + (r() * 3 | 0); j++) sine(o, f * 1.2, f, 0.05, 0.035, at + j * 0.11, 0.03); }
    } else { // escritorio / arena
      const n = filt(noise(dur + 1, r), 'lp', 260, 0.6); mix(o, n, 1);
      const hv = filt(noise(dur + 1, r), 'bp', 900, 0.4); mix(o, hv, 0.12);
      for (let h = 1; h <= 3; h++) sine(o, 60 * h, 60 * h, 60, 0.01 / h, 0, 1);
    }
    chans.push(norm(loopify(o, 1), 0.5));
  }
  return chans;
}
function makeIR(kind) {
  const P = { patio: { len: 2.0, rt: 1.3, early: [[0.021, 0.5], [0.047, 0.35], [0.083, 0.3], [0.13, 0.22], [0.21, 0.12]], damp: 2200, lvl: 0.55 },
    neon: { len: 2.6, rt: 1.9, early: [[0.03, 0.45], [0.12, 0.4], [0.26, 0.28], [0.41, 0.15]], damp: 3000, lvl: 0.6 },
    escritorio: { len: 2.0, rt: 1.35, early: [[0.012, 0.6], [0.019, 0.5], [0.031, 0.45], [0.044, 0.35], [0.061, 0.3]], damp: 4200, lvl: 0.7 },
    porto: { len: 2.2, rt: 1.5, early: [[0.018, 0.55], [0.03, 0.5], [0.052, 0.4], [0.09, 0.3], [0.16, 0.2]], damp: 2600, lvl: 0.6 },
    nevasca: { len: 1.6, rt: 0.9, early: [[0.02, 0.4], [0.05, 0.3], [0.11, 0.2]], damp: 1800, lvl: 0.45 },
    vila: { len: 1.9, rt: 1.2, early: [[0.01, 0.6], [0.022, 0.5], [0.04, 0.4], [0.07, 0.3], [0.12, 0.2]], damp: 3200, lvl: 0.6 },
    duelo: { len: 2.4, rt: 1.7, early: [[0.015, 0.5], [0.028, 0.45], [0.05, 0.35], [0.08, 0.3]], damp: 3600, lvl: 0.65 } }[kind] || { len: 1.5, rt: 1, early: [], damp: 3000, lvl: 0.5 };
  const chans = [];
  for (let c = 0; c < 2; c++) {
    const r = rng(77 + c * 13), o = noise(P.len, r);
    const lo = filt(o.slice(), 'lp', 500), hi = filt(o.slice(), 'hp', 500);
    for (let i = 0; i < o.length; i++) {
      const t = i / SR;
      o[i] = lo[i] * Math.exp(-6.9 * t / (P.rt * 1.25)) + hi[i] * Math.exp(-6.9 * t / (P.rt * 0.6));
      o[i] *= Math.min(1, t / 0.012);
    }
    filt(o, 'lp', P.damp);
    for (const [t, a] of P.early) { const at = Math.floor((t * (1 + (c ? 0.07 : -0.05))) * SR); if (at < o.length) o[at] += a * (r() > 0.5 ? 1 : -1) * 2; }
    chans.push(norm(o, P.lvl));
  }
  return chans;
}

// ------------------------------------------------------------------ banco de sons
const RECIPES = {
  rifle: (i) => gunshot('rifle', 100 + i), pistol: (i) => gunshot('pistol', 200 + i), sniper: (i) => gunshot('sniper', 300 + i),
  dry: (i) => dryFire(400 + i), magout: (i) => magOut(410 + i), magin: (i) => magIn(420 + i), magtap: (i) => magTap(430 + i),
  chargepull: (i) => chargePull(440 + i), chargerel: (i) => chargeRelease(450 + i), sliderel: (i) => slideRelease(460 + i), slideback: (i) => slideBack(465 + i),
  boltup: (i) => boltUp(470 + i), boltback: (i) => boltBack(480 + i), boltfwd: (i) => boltFwd(490 + i), boltdown: (i) => boltUp(495 + i),
  draw: (i) => drawSnd(500 + i), knifedraw: (i) => knifeDraw(510 + i), adsin: (i) => cloth(520 + i, 0.1, 1300, 0.35), adsout: (i) => cloth(530 + i, 0.09, 1000, 0.28),
  swing: (i) => swing(540 + i, false), swingheavy: (i) => swing(550 + i, true), stabhit: (i) => stabHit(560 + i),
  hit: (i) => hitTick(570 + i), dink: (i) => headDink(580 + i), kill: (i) => killConfirm(590 + i), hurt: (i) => hurt(600 + i),
  jump: (i) => cloth(610 + i, 0.16, 900, 0.4), flyby: (i) => flyby(620 + i, false), flycrack: (i) => flyby(630 + i, true),
  ak: (i) => gunshot('ak', 1100 + i), smg: (i) => gunshot('smg', 1200 + i), shotgun: (i) => gunshot('shotgun', 1300 + i), dmr: (i) => gunshot('dmr', 1400 + i), deagle: (i) => gunshot('deagle', 1500 + i),
  explode: (i) => explosion(1600 + i), nadebounce: (i) => nadeBounce(1610 + i), nadepin: (i) => nadePin(1620 + i), nadethrow: (i) => swing(1630 + i, true),
  flip: (i) => flipSnd(1640 + i), flipclose: (i) => latch(1650 + i, false), flipopen: (i) => latch(1660 + i, true), knifecatch: (i) => knifeCatch(1670 + i),
  shellin: (i) => shellIn(1680 + i), pumpback: (i) => pump(1690 + i, false), pumpfwd: (i) => pump(1700 + i, true),
};
const VARIANTS = { rifle: 4, pistol: 3, sniper: 2, ak: 4, smg: 4, shotgun: 2, dmr: 3, deagle: 3, explode: 2, nadebounce: 3, flip: 3, shellin: 2, swing: 3, hit: 2, dink: 2, magin: 2, draw: 2, flyby: 3, flycrack: 2, jump: 2 };
for (const s of ['concrete', 'sand', 'metal', 'wood', 'carpet', 'tile', 'wet', 'snow']) {
  RECIPES['step_' + s] = (i) => step(s, 700 + i * 11 + s.length * 97);
  RECIPES['land_' + s] = (i) => land(s, 800 + i * 7 + s.length * 31);
  VARIANTS['step_' + s] = 4;
}
for (const s of ['concrete', 'sand', 'metal', 'carpet', 'tile', 'wet', 'wood', 'snow']) { RECIPES['shells_' + s] = (i) => shells(s, 900 + i + s.length * 13); VARIANTS['shells_' + s] = 2; }
for (const s of ['concrete', 'metal', 'wood', 'sand', 'glass', 'snow']) { RECIPES['imp_' + s] = (i) => impactSnd(s, 1000 + i + s.length * 17); VARIANTS['imp_' + s] = 3; }

// ------------------------------------------------------------------ motor
export const Audio = {
  ctx: null, master: null, comp: null, sfx: null, send: null, conv: null, amb: null, ambSrc: null,
  bank: {}, pending: [], ready: false, map: '', hrtf: false, voices: [],
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); } catch { return null; }
      const c = this.ctx; SR = c.sampleRate;
      this.master = c.createGain(); this.master.gain.value = S.vol;
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 5; this.comp.attack.value = 0.002; this.comp.release.value = 0.2;
      this.master.connect(this.comp); this.comp.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.connect(this.master);
      this.send = c.createGain(); this.send.gain.value = 1;
      this.conv = c.createConvolver(); this.send.connect(this.conv); this.conv.connect(this.master);
      this.amb = c.createGain(); this.amb.gain.value = 0.22; this.amb.connect(this.master);
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  // gera o banco em fatias para nao travar a pagina
  build() {
    const jobs = [];
    const first = ['rifle', 'ak', 'smg', 'shotgun', 'dmr', 'deagle', 'pistol', 'sniper', 'hit', 'dink', 'kill', 'hurt', 'draw', 'swing', 'step_concrete', 'explode'];
    const names = [...first, ...Object.keys(RECIPES).filter((n) => !first.includes(n))];
    for (const n of names) for (let i = 0; i < (VARIANTS[n] || 1); i++) jobs.push([n, i]);
    const run = () => {
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < 5) {
        const [n, i] = jobs.shift();
        try { (this.bank[n] || (this.bank[n] = [])).push(this.toBuffer([RECIPES[n](i)])); } catch (e) { console.warn('som', n, e); }
      }
      if (jobs.length) setTimeout(run, 0);
      else { this.ready = true; if (this.map) this.setMap(this.map); }
    };
    run();
  },
  toBuffer(chans) {
    const b = this.ctx.createBuffer(chans.length, chans[0].length, SR);
    chans.forEach((ch, i) => b.copyToChannel(ch, i));
    return b;
  },
  setVolume(v) { if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); },
  setMap(key) {
    this.map = key;
    if (!this.ctx || !this.ready) return;
    clearTimeout(this._mapT);
    this._mapT = setTimeout(() => this._applyMap(key), 60);
  },
  _applyMap(key) {
    if (key !== this.map) return;
    this.conv.buffer = this.toBuffer(makeIR(key));
    if (this.ambSrc) { try { this.ambSrc.stop(); } catch {} this.ambSrc = null; }
    const kind = { patio: 'wind', neon: 'city', porto: 'harbor', nevasca: 'blizzard', vila: 'village' }[key] || 'office';
    const src = this.ctx.createBufferSource();
    src.buffer = this.toBuffer(ambience(kind, 5)); src.loop = true;
    src.connect(this.amb); src.start();
    this.ambSrc = src;
    this.amb.gain.value = kind === 'city' ? 0.3 : kind === 'blizzard' ? 0.32 : 0.2;
  },
  stopAmbience() { if (this.ambSrc) { try { this.ambSrc.stop(); } catch {} this.ambSrc = null; } },
  setListener(pos, fwd, up) {
    const l = this.ctx && this.ctx.listener; if (!l) return;
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(fwd.x, t); l.forwardY.setValueAtTime(fwd.y, t); l.forwardZ.setValueAtTime(fwd.z, t);
      l.upX.setValueAtTime(up.x, t); l.upY.setValueAtTime(up.y, t); l.upZ.setValueAtTime(up.z, t);
    } else { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  },
  // o = { vol, rate, pos, send, lp, delay, ref }
  play(name, o = {}) {
    const c = this.ctx; if (!c || S.vol <= 0) return null;
    const list = this.bank[name]; if (!list || !list.length) return null;
    const t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * (o.jitter ?? 0.06));
    const g = c.createGain(); g.gain.value = o.vol ?? 1;
    let node = src;
    node.connect(g); node = g;
    if (o.lp && o.lp < 18000) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.5; node.connect(f); node = f; }
    if (o.pos) {
      const p = c.createPanner();
      p.panningModel = this.hrtf ? 'HRTF' : 'equalpower'; p.distanceModel = 'inverse';
      p.refDistance = o.ref || 3; p.rolloffFactor = 1; p.maxDistance = 200;
      if (p.positionX) { p.positionX.value = o.pos.x; p.positionY.value = o.pos.y; p.positionZ.value = o.pos.z; } else p.setPosition(o.pos.x, o.pos.y, o.pos.z);
      node.connect(p); node = p;
    }
    node.connect(this.sfx);
    if (o.send) { const s = c.createGain(); s.gain.value = o.send; node.connect(s); s.connect(this.send); }
    src.start(t);
    this.voices.push(src);
    src.onended = () => { const i = this.voices.indexOf(src); if (i >= 0) this.voices.splice(i, 1); };
    if (this.voices.length > 56) { const v = this.voices.shift(); try { v.stop(); } catch {} }
    return src;
  },
};
