// FRAG - mapas. A COLISAO (caixas e spawns) e identica ao v2, transcrita das mesmas funcoes;
// o campo c agora e um estilo visual e r o papel da caixa (para o construtor saber o que desenhar).
function B(x, y, z, w, h, d, c, r = '') { return { x, y, z, w, h, d, c, r }; }
const STEP_H = 0.28, STEP_D = 0.5;

function perimeter(out, size, h, c) {
  const s = size / 2, t = 1;
  out.push(B(0, 0, -s - t / 2, size + 2 * t, h, t, c, 'perim'), B(0, 0, s + t / 2, size + 2 * t, h, t, c, 'perim'));
  out.push(B(-s - t / 2, 0, 0, t, h, size, c, 'perim'), B(s + t / 2, 0, 0, t, h, size, c, 'perim'));
}
const mirror4 = (out, list) => { for (const b of list) for (const sx of [1, -1]) for (const sz of [1, -1]) out.push({ ...b, x: b.x * sx, z: b.z * sz }); };
const mirrorZ = (out, list) => { for (const b of list) for (const sz of [1, -1]) out.push({ ...b, z: b.z * sz }); };
const mirrorX = (out, list) => { for (const b of list) for (const sx of [1, -1]) out.push({ ...b, x: b.x * sx }); };
function stairs(x, z, dir, n, w, c, base = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = i * STEP_D, h = base + (i + 1) * STEP_H;
    const px = dir === '+x' ? x + o : dir === '-x' ? x - o : x;
    const pz = dir === '+z' ? z + o : dir === '-z' ? z - o : z;
    const bw = dir === '+x' || dir === '-x' ? STEP_D : w;
    const bd = dir === '+z' || dir === '-z' ? STEP_D : w;
    out.push({ ...B(px, 0, pz, bw, h, bd, c, 'step'), dir, i, n });
  }
  return out;
}
function tower(x, z, w, d, h, top, leg, th = 0.35) {
  const out = [B(x, h, z, w, th, d, top, 'slab')];
  const lx = w / 2 - 0.35, lz = d / 2 - 0.35;
  for (const sx of [1, -1]) for (const sz of [1, -1]) out.push(B(x + sx * lx, 0, z + sz * lz, 0.5, h, 0.5, leg, 'leg'));
  return out;
}
const ledge = (x, z, w, d, y, c) => [B(x, y, z, w, 0.9, d, c, 'parapet')];

// ------------------------------------------------------------------ Patio (deserto)
function patio() {
  const n = [];
  const W = 'wall', CR = 'crate', CR2 = 'crate2', ST = 'stone', PO = 'post';
  perimeter(n, 48, 8, W);
  n.push(...tower(0, 0, 8, 8, 2.8, ST, PO));
  n.push(B(0, 3.15, 0, 2, 1, 2, CR2, 'crate'));
  mirrorZ(n, stairs(0, 8.75, '-z', 10, 3, ST));
  mirrorX(n, ledge(3.85, 0, 0.3, 8, 3.15, PO));
  const q = [];
  q.push(...tower(20.9, 20.9, 6.2, 6.2, 3.9, ST, PO));
  q.push(...stairs(19, 10.5, '+z', 14, 2.4, ST));
  q.push(B(17.95, 4.25, 21.4, 0.3, 0.9, 5.2, CR, 'rail'));
  q.push(B(6, 0, 6, 2, 2, 2, CR, 'crate'));
  q.push(B(12, 0, 3, 1, 3, 8, W, 'wall'));
  q.push(B(3, 0, 12, 8, 3, 1, W, 'wall'));
  q.push(B(8, 0, 20, 2, 2, 2, CR, 'crate'), B(8, 2, 20, 2, 1, 2, CR2, 'crate'));
  q.push(B(20, 0, 6, 2, 2, 2, CR, 'crate'), B(20, 2, 6, 2, 1, 2, CR2, 'crate'));
  q.push(B(15, 0, 0, 2, 1, 2, CR2, 'crate'));
  q.push(B(0, 0, 15, 2, 1, 2, CR2, 'crate'));
  q.push(B(13, 0, 13, 1.2, 1, 1.2, CR2, 'crate'));
  mirror4(n, q);
  return {
    key: 'patio', name: 'Pátio', desc: 'Deserto: laje central, torres nos cantos', boxes: n, size: 48,
    spawns: [[20, 0], [-20, 0], [0, 20], [0, -20], [14, 5], [-14, -5], [5, -14], [-5, 14], [22, 13], [-22, -13], [13, -22], [-13, 22]],
    swatch: 'linear-gradient(135deg,#F3C58C,#CDA363 60%,#8C6236)',
    styles: {
      wall: { tex: 'sandstone', color: '#D2B287', trim: '#E8D3AE' },
      crate: { tex: 'wood', color: '#7B5230' }, crate2: { tex: 'wood', color: '#A0723F' },
      stone: { tex: 'stone', color: '#D6BE93' }, post: { tex: 'plaster', color: '#C7A77A' },
    },
    ground: { tex: 'sand', color: '#D9AE6E', surface: 'sand' },
    surfaces: { wall: 'concrete', crate: 'wood', crate2: 'wood', stone: 'concrete', post: 'concrete' },
    impacts: { wall: 'concrete', crate: 'wood', crate2: 'wood', stone: 'concrete', post: 'concrete', ground: 'sand' },
    atmo: {
      skyTop: '#2F74C8', skyHorizon: '#F2CFA0', skyBottom: '#C79A5E', sunColor: '#FFE2B0', sunSize: 0.022, clouds: 0.35, stars: 0,
      fog: '#EAC08E', fogNear: 45, fogFar: 170, hemi: ['#FFE3BC', '#9A6E3E', 0.55], sun: ['#FFE9C8', 3.2, [34, 26, 18]],
      exposure: 1.0, envInt: 0.7, bloom: 0.35, bloomThr: 0.95, grade: [1.04, 1.0, 0.94], sat: 1.08, contrast: 1.06,
      reflY: 0.03, particles: 'dust',
    },
    props: [
      { t: 'pool', x: 8, z: 0, w: 6, d: 1.8 }, { t: 'pool', x: -8, z: 0, w: 6, d: 1.8 },
      { t: 'plaza', x: 0, z: 0, w: 11, d: 11 },
      { t: 'dunes' }, { t: 'palms' }, { t: 'lanterns' }, { t: 'flags' },
    ],
  };
}

// ------------------------------------------------------------------ Neon (noite)
function neon() {
  const n = [];
  const PA = 'panelA', PB = 'panelB', PC = 'grate', PR = 'perim';
  perimeter(n, 48, 8, PR);
  const r = [];
  r.push(...tower(17, 0, 5, 5, 5, PB, PA));
  r.push(...stairs(17, 11.25, '-z', 18, 2.6, PC));
  r.push(B(17, 5.35, -2.35, 5, 0.9, 0.3, PC, 'rail'), B(19.35, 5.35, 0, 0.3, 0.9, 5, PC, 'rail'));
  mirrorX(n, r);
  n.push(B(0, 5, 0, 29, 0.3, 2.2, PB, 'bridge'));
  n.push(B(0, 5.3, 1.25, 29, 0.6, 0.12, PC, 'rail'), B(0, 5.3, -1.25, 29, 0.6, 0.12, PC, 'rail'));
  n.push(B(0, 0, 0, 1.2, 5, 1.2, PA, 'leg'));
  n.push(B(0, 0, 0, 6, 0.5, 6, PB, 'plinth'));
  mirror4(n, [B(9, 0, 0, 1.2, 5, 1.2, PA, 'leg'), B(0, 0, 9, 1.2, 6, 1.2, PA, 'pylon'), B(10, 0, 10, 4, 1, 4, PB, 'block'), B(10, 1, 10, 2, 1, 2, PA, 'block'),
    B(6, 0, 18, 10, 3.5, 1, PA, 'wall'), B(16, 0, 16, 2, 2, 2, PB, 'block'), B(5, 0, 5, 1.5, 1, 1.5, PB, 'block'), B(20, 0, 20, 3, 0.5, 3, PB, 'plinth'), B(4, 0, 13, 1, 2.5, 1, PA, 'block')]);
  return {
    key: 'neon', name: 'Neon', desc: 'Noite: torres e passarela sobre o centro', boxes: n, size: 48,
    spawns: [[0, 21], [0, -21], [22.5, 22.5], [-22.5, -22.5], [22.5, -22.5], [-22.5, 22.5], [14, 6], [-14, -6], [-6, 14], [6, -14], [22, 12], [-22, -12]],
    swatch: 'linear-gradient(135deg,#0B0A18,#1B1840 55%,#00E5FF)',
    styles: {
      panelA: { tex: 'panel', color: '#2A2B3A' }, panelB: { tex: 'panel', color: '#34303F' },
      grate: { tex: 'metal', color: '#3A3B45' }, perim: { tex: 'concrete', color: '#2B2A33' },
    },
    ground: { tex: 'asphalt', color: '#26262C', surface: 'wet' },
    surfaces: { panelA: 'metal', panelB: 'metal', grate: 'metal', perim: 'concrete' },
    impacts: { panelA: 'metal', panelB: 'metal', grate: 'metal', perim: 'concrete', ground: 'concrete' },
    neon: ['#00E5FF', '#FF2BD6', '#7CFF4F', '#FFE45C'],
    atmo: {
      skyTop: '#020208', skyHorizon: '#1C1238', skyBottom: '#05040C', sunColor: '#6C7CFF', sunSize: 0.012, clouds: 0.5, stars: 1,
      fog: '#120E26', fogNear: 22, fogFar: 125, hemi: ['#7C78D8', '#1A1730', 0.8], sun: ['#8FA7FF', 0.9, [-20, 40, 30]],
      exposure: 1.3, envInt: 1.2, bloom: 0.42, bloomThr: 1.2, grade: [0.96, 0.98, 1.08], sat: 1.12, contrast: 1.08,
      reflY: 0.0, particles: 'rain',
    },
    props: [{ t: 'skyline', night: true }, { t: 'signs' }, { t: 'neonLights' }, { t: 'vents' }],
  };
}

// ------------------------------------------------------------------ Escritorio
function escritorio() {
  const n = [];
  const FA = 'fabric', WO = 'desk', SC = 'screen', CO = 'column', GL = 'glass', PL = 'plant', TI = 'mezz', ME = 'railing';
  perimeter(n, 48, 8, 'perim');
  function desk(x, z, flip) {
    const m = [B(x, 0, z, 1.6, 0.75, 0.8, WO, 'desk'), B(x + 0.3, 0.75, z - 0.15, 0.5, 0.35, 0.08, SC, 'monitor')];
    if (flip) m.push(B(x, 0, z - 0.55, 1.8, 1.5, 0.1, FA, 'partition'), B(x - 0.85, 0, z, 0.1, 1.5, 1.1, FA, 'partition'));
    else m.push(B(x, 0, z + 0.55, 1.8, 1.5, 0.1, FA, 'partition'), B(x + 0.85, 0, z, 0.1, 1.5, 1.1, FA, 'partition'));
    return m;
  }
  const u = [];
  u.push(B(0, 3, 20.5, 46, 0.3, 7, TI, 'mezz'));
  for (const x of [-18, -6, 6, 18]) u.push(B(x, 0, 20.5, 0.6, 3, 0.6, CO, 'leg'));
  u.push(B(-11, 3.3, 17.1, 12, 0.9, 0.15, ME, 'railing'), B(11, 3.3, 17.1, 12, 0.9, 0.15, ME, 'railing'));
  u.push(...stairs(21.5, 11.25, '+z', 11, 2.5, TI));
  u.push(...stairs(-21.5, 11.25, '+z', 11, 2.5, TI));
  u.push(B(0, 3.3, 20.5, 1.6, 0.75, 0.8, WO, 'desk'), B(8, 3.3, 21, 1.6, 0.75, 0.8, WO, 'desk'), B(-8, 3.3, 21, 1.6, 0.75, 0.8, WO, 'desk'));
  mirrorZ(n, u);
  const f = [];
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) f.push(...desk(7 + a * 2.2, 6 + b * 2.4, (a + b) % 2));
  f.push(B(17, 0, 9, 0.15, 3, 8, GL, 'glass'), B(13, 0, 13, 8, 3, 0.15, GL, 'glass'), B(11.5, 0, 5, 3, 3, 0.15, GL, 'glass'), B(16, 0, 5, 2, 3, 0.15, GL, 'glass'), B(15, 0, 9, 3, 0.75, 1.2, WO, 'table'));
  f.push(B(20, 0, 6, 0.8, 4, 0.8, CO, 'column'), B(6, 0, 14, 0.8, 4, 0.8, CO, 'column'));
  f.push(B(3, 0, 11, 0.6, 1.2, 0.6, PL, 'plant'), B(12, 0, 3, 0.6, 1.2, 0.6, PL, 'plant'));
  f.push(B(21, 0, 3, 1, 1.2, 4, FA, 'cabinet'));
  f.push(B(4, 0, 4, 1.2, 1.1, 1.2, WO, 'counter'));
  mirror4(n, f);
  n.push(B(0, 0, 0, 5, 1.1, 1.2, WO, 'counter'), B(0, 0, 0, 1.2, 1.1, 5, WO, 'counter'));
  return {
    key: 'escritorio', name: 'Escritório', desc: 'Baias, vidro e mezaninos', boxes: n, size: 48,
    spawns: [[19, 0], [-19, 0], [0, 14], [0, -14], [13, -1], [-13, 1], [2, 20], [-2, -20], [22, 9], [-22, -9], [-12, 9], [12, -9]],
    swatch: 'linear-gradient(135deg,#E9EEF3,#A9B2BD 60%,#4E9A5A)',
    styles: {
      fabric: { tex: 'fabric', color: '#5E6B7A' }, desk: { tex: 'wood', color: '#C9B290' }, screen: { tex: 'metal', color: '#1B1E24' },
      column: { tex: 'concrete', color: '#B9BDC2' }, glass: { tex: 'glass', color: '#BFD8EE' }, plant: { tex: 'plaster', color: '#E6E1D8' },
      mezz: { tex: 'terrazzo', color: '#C9CBC8' }, railing: { tex: 'steel', color: '#B8BEC6' }, perim: { tex: 'concrete', color: '#C3C6CA' },
    },
    ground: { tex: 'terrazzo', color: '#B7B5AE', surface: 'tile' },
    surfaces: { fabric: 'carpet', desk: 'wood', screen: 'metal', column: 'concrete', glass: 'tile', plant: 'concrete', mezz: 'tile', railing: 'metal', perim: 'concrete' },
    impacts: { fabric: 'wood', desk: 'wood', screen: 'metal', column: 'concrete', glass: 'glass', plant: 'concrete', mezz: 'concrete', railing: 'metal', perim: 'concrete', ground: 'concrete' },
    atmo: {
      skyTop: '#5E8FC4', skyHorizon: '#D7E3EE', skyBottom: '#9AA6B2', sunColor: '#FFF6E6', sunSize: 0.016, clouds: 0.5, stars: 0,
      fog: '#D4DEE8', fogNear: 55, fogFar: 190, hemi: ['#EAF1F8', '#6E6A62', 0.5], sun: ['#FFF3E0', 2.6, [16, 42, -22]],
      exposure: 0.95, envInt: 0.85, bloom: 0.25, bloomThr: 1.0, grade: [1.0, 1.0, 1.02], sat: 1.02, contrast: 1.05,
      reflY: 0.0, particles: 'dust',
    },
    props: [{ t: 'roof' }, { t: 'skyline', night: false }, { t: 'carpets' }, { t: 'officeDecor' }],
  };
}

import { porto, nevasca, vila, duelo } from './maps2.js';
export const MAPS = { patio: patio(), neon: neon(), escritorio: escritorio(), porto: porto(), nevasca: nevasca(), vila: vila(), duelo: duelo() };
export const MAP_ORDER = ['patio', 'neon', 'escritorio', 'porto', 'nevasca', 'vila', 'duelo'];
export { B, stairs, tower, perimeter, mirror4, mirrorX, mirrorZ };
