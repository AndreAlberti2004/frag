// FRAG v4 - mapas novos: Porto, Nevasca, Vila e Duelo (x1). Mesmas regras de colisao dos antigos:
// degraus de 0,28 m x 0,5 m, pulo alcanca ~1,13 m (1,46 m agachando no ar), subida automatica ate 0,6 m.
function B(x, y, z, w, h, d, c, r = '') { return { x, y, z, w, h, d, c, r }; }
const STEP_H = 0.28, STEP_D = 0.5;
function perimeter(out, size, h, c) {
  const s = size / 2, t = 1;
  out.push(B(0, 0, -s - t / 2, size + 2 * t, h, t, c, 'perim'), B(0, 0, s + t / 2, size + 2 * t, h, t, c, 'perim'));
  out.push(B(-s - t / 2, 0, 0, t, h, size, c, 'perim'), B(s + t / 2, 0, 0, t, h, size, c, 'perim'));
}
function stairs(x, z, dir, n, w, c, base = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = i * STEP_D, h = base + (i + 1) * STEP_H;
    const px = dir === '+x' ? x + o : dir === '-x' ? x - o : x;
    const pz = dir === '+z' ? z + o : dir === '-z' ? z - o : z;
    const bw = dir === '+x' || dir === '-x' ? STEP_D : w, bd = dir === '+z' || dir === '-z' ? STEP_D : w;
    out.push({ ...B(px, 0, pz, bw, h, bd, c, 'step'), dir, i, n });
  }
  return out;
}
const mirror4 = (out, list) => { for (const b of list) for (const sx of [1, -1]) for (const sz of [1, -1]) out.push({ ...b, x: b.x * sx, z: b.z * sz }); };
const mirrorX = (out, list) => { for (const b of list) for (const sx of [1, -1]) out.push({ ...b, x: b.x * sx }); };
const mirrorZ = (out, list) => { for (const b of list) for (const sz of [1, -1]) out.push({ ...b, z: b.z * sz }); };
// simetria por rotacao de 180 graus (os dois lados do mapa sao iguais, girados)
const rot2 = (out, list) => { for (const b of list) { out.push(b); out.push({ ...b, x: -b.x, z: -b.z }); } };
const C20 = [6.1, 2.6, 2.44], C40 = [12.2, 2.6, 2.44];
// container: along = 'x' | 'z'
const cont = (x, y, z, along, L, col) => along === 'x' ? B(x, y, z, L[0], L[1], L[2], col, 'container') : B(x, y, z, L[2], L[1], L[0], col, 'container');

// ------------------------------------------------------------------ Porto (docas ao por do sol)
export function porto() {
  const n = [];
  perimeter(n, 56, 6, 'perim');
  // centro: dois containers lado a lado viram uma plataforma com escada dos dois lados
  n.push(cont(-1.22, 0, 0, 'z', C20, 'cBlue'), cont(1.22, 0, 0, 'z', C20, 'cRed'));
  n.push(B(0.2, 2.6, -0.6, 1.2, 1.1, 1.2, 'crate', 'crate'));
  const h = [];
  h.push(...stairs(0, 7.3, '-z', 9, 2.4, 'steel'));
  h.push(cont(-6, 0, 11, 'x', C40, 'cOrange'));
  h.push(cont(8, 0, 8, 'z', C20, 'cGreen'));
  h.push(cont(16, 0, 14, 'x', C20, 'cGray'), cont(16, 2.6, 14, 'x', C20, 'cBlue'));
  h.push(cont(15, 0, 2, 'x', C20, 'cRed'));
  // poleiro leste: container com escada
  h.push(cont(21, 0, -3, 'z', C20, 'cOrange'));
  h.push(...stairs(21, 4.3, '-z', 9, 2.2, 'steel'));
  // cais de carga junto ao muro norte
  h.push(B(0, 0, 25.5, 16, 1.1, 3, 'dock', 'dock'));
  h.push(...stairs(9.75, 25.5, '-x', 4, 2.6, 'steel'));
  h.push(B(-4, 1.1, 25.6, 1.2, 1.2, 1.2, 'crate', 'crate'), B(3, 1.1, 26, 2.2, 1.0, 1.3, 'crate2', 'crate'));
  // guindaste (pernas; a viga e so cenario)
  h.push(B(10, 0, 21, 0.9, 13, 0.9, 'crane', 'crane'), B(-10, 0, 21, 0.9, 13, 0.9, 'crane', 'crane'));
  // tambores, caixotes, empilhadeira
  h.push(B(12, 0, -6, 0.7, 1.0, 0.7, 'barrel', 'barrel'), B(12.8, 0, -6.4, 0.7, 1.0, 0.7, 'barrel2', 'barrel'), B(12.3, 0, -7.2, 0.7, 1.0, 0.7, 'barrel', 'barrel'));
  h.push(B(4, 0, 17, 1.4, 1.4, 1.4, 'crate', 'crate'), B(-14, 0, 17, 2, 2, 2, 'crate2', 'crate'), B(-14, 2, 17, 1.2, 1.0, 1.2, 'crate', 'crate'));
  h.push(B(-18, 0, 8, 1.2, 1.2, 1.2, 'crate', 'crate'), B(-9, 0, 4, 1.5, 2.0, 2.6, 'machine', 'forklift'));
  h.push(B(-22, 0, 22, 2.4, 1.0, 1.2, 'crate2', 'crate'), B(24, 0, 24, 1.3, 1.3, 1.3, 'crate', 'crate'));
  h.push(B(-25.6, 0, 12, 1.2, 1.0, 1.2, 'crate', 'crate'));
  rot2(n, h);
  return {
    key: 'porto', name: 'Porto', desc: 'Containers e guindaste no pôr do sol', boxes: n, size: 56,
    spawns: [[0, 20], [0, -20], [25, 18], [-25, -18], [24, -12], [-24, 12], [-6, 16], [6, -16], [18, 7], [-18, -7], [6, 3], [-6, -3]],
    swatch: 'linear-gradient(135deg,#FF9A4D,#C4553A 55%,#2B4A6B)',
    styles: {
      perim: { tex: 'concrete', color: '#9C9A94' }, steel: { tex: 'metal', color: '#6b6f75' }, crate: { tex: 'wood', color: '#8a6238' }, crate2: { tex: 'wood', color: '#6e4d2c' },
      dock: { tex: 'concrete', color: '#8e8c86' }, crane: { tex: 'metal', color: '#E0A526' }, barrel: { tex: 'metal', color: '#2f5f8a' }, barrel2: { tex: 'metal', color: '#9b2d22' },
      machine: { tex: 'metal', color: '#D9A21E' },
      cBlue: { tex: 'corrugated', color: '#2E5E8C' }, cRed: { tex: 'corrugated', color: '#9E3326' }, cOrange: { tex: 'corrugated', color: '#C9652A' },
      cGreen: { tex: 'corrugated', color: '#3E6B45' }, cGray: { tex: 'corrugated', color: '#7C8286' },
    },
    ground: { tex: 'concrete', color: '#8a8782', surface: 'concrete' },
    surfaces: { steel: 'metal', crate: 'wood', crate2: 'wood', crane: 'metal', barrel: 'metal', barrel2: 'metal', machine: 'metal', cBlue: 'metal', cRed: 'metal', cOrange: 'metal', cGreen: 'metal', cGray: 'metal' },
    impacts: { steel: 'metal', crate: 'wood', crate2: 'wood', crane: 'metal', barrel: 'metal', barrel2: 'metal', machine: 'metal', cBlue: 'metal', cRed: 'metal', cOrange: 'metal', cGreen: 'metal', cGray: 'metal', ground: 'concrete' },
    atmo: {
      skyTop: '#3A5C8E', skyHorizon: '#FFB070', skyBottom: '#6E4A3A', sunColor: '#FFB36B', sunSize: 0.03, clouds: 0.55, stars: 0,
      fog: '#E4A277', fogNear: 45, fogFar: 190, hemi: ['#FFD2A8', '#4F4A55', 0.55], sun: ['#FFB27A', 3.0, [-40, 14, 22]],
      exposure: 1.0, envInt: 0.8, bloom: 0.4, bloomThr: 0.95, grade: [1.06, 0.99, 0.92], sat: 1.1, contrast: 1.07, particles: 'dust',
    },
    props: [{ t: 'sea' }, { t: 'craneTop' }, { t: 'lamps' }, { t: 'lines' }],
  };
}

// ------------------------------------------------------------------ Nevasca (base no gelo)
export function nevasca() {
  const n = [];
  perimeter(n, 48, 5, 'perim');
  // bunker central com teto acessivel por escadas dos dois lados (x)
  n.push(B(0, 0, 0, 7, 3, 7, 'bunker', 'bunker'));
  mirrorZ(n, [B(0, 3, 3.35, 7, 0.9, 0.3, 'bunker', 'parapet')]);
  mirror4(n, [B(3.35, 3, 2.35, 0.3, 0.9, 2.3, 'bunker', 'parapet')]);
  n.push(...stairs(8.75, 0, '-x', 11, 2.2, 'conc'), ...stairs(-8.75, 0, '+x', 11, 2.2, 'conc'));
  // barreiras de concreto nos eixos
  mirrorZ(n, [B(0, 0, 13, 3.2, 1.05, 0.7, 'conc', 'jersey')]);
  mirrorX(n, [B(15, 0, 0, 0.7, 1.05, 3.2, 'conc', 'jersey')]);
  const q = [];
  q.push(B(13, 0, 13, 5, 3.2, 4, 'hut', 'hut'));
  q.push(B(6, 0, 11, 4, 1.1, 0.9, 'bags', 'sandbag'), B(11, 0, 6, 0.9, 1.1, 4, 'bags', 'sandbag'));
  // torre de vigia com escada
  q.push(B(19, 3.6, 19, 4, 0.35, 4, 'wood', 'slab'));
  for (const sx of [1, -1]) for (const sz of [1, -1]) q.push(B(19 + sx * 1.65, 0, 19 + sz * 1.65, 0.4, 3.6, 0.4, 'wood', 'leg'));
  q.push(B(19, 3.95, 20.85, 4, 1.0, 0.3, 'wood', 'rail'), B(20.85, 3.95, 19, 0.3, 1.0, 3.4, 'wood', 'rail'), B(19, 3.95, 17.15, 4, 1.0, 0.3, 'wood', 'rail'));
  q.push(...stairs(10.25, 19, '+x', 14, 1.4, 'wood'));
  q.push(B(20.5, 0, 8, 2.2, 2.4, 4.5, 'tank', 'tank'));
  q.push(B(7, 0, 19.5, 1.3, 1.3, 1.3, 'crate', 'crate'), B(5.5, 0, 20.2, 1.1, 1.1, 1.1, 'crate', 'crate'));
  q.push(B(22.3, 0, 14, 1.2, 1.2, 1.2, 'crate', 'crate'));
  mirror4(n, q);
  return {
    key: 'nevasca', name: 'Nevasca', desc: 'Base no gelo: bunker, torres e trincheiras', boxes: n, size: 48,
    spawns: [[0, 21], [0, -21], [21, 0], [-21, 0], [9, 16], [-9, -16], [16, -9], [-16, 9], [4.5, 8], [-4.5, -8], [22, 4], [-22, -4]],
    swatch: 'linear-gradient(135deg,#F4F8FC,#B8C8DA 55%,#51627A)',
    styles: {
      perim: { tex: 'concrete', color: '#8f969e' }, bunker: { tex: 'concrete', color: '#9aa1a6' }, conc: { tex: 'concrete', color: '#a8adb1' },
      metal: { tex: 'metal', color: '#59606a' }, hut: { tex: 'wood', color: '#6b4a32' }, bags: { tex: 'fabric', color: '#8c8466' },
      wood: { tex: 'wood', color: '#5e4431' }, tank: { tex: 'metal', color: '#b7bec4' }, crate: { tex: 'wood', color: '#6f6a3c' },
    },
    ground: { tex: 'snow', color: '#E9EEF4', surface: 'snow' },
    surfaces: { metal: 'metal', hut: 'wood', wood: 'wood', tank: 'metal', crate: 'wood', bags: 'sand' },
    impacts: { metal: 'metal', hut: 'wood', wood: 'wood', tank: 'metal', crate: 'wood', bags: 'sand', ground: 'snow' },
    atmo: {
      skyTop: '#8FA6BF', skyHorizon: '#DCE5EE', skyBottom: '#C9D3DD', sunColor: '#F2F5FF', sunSize: 0.02, clouds: 0.85, stars: 0,
      fog: '#D5DEE8', fogNear: 18, fogFar: 105, hemi: ['#E8F0FA', '#8A96A6', 0.8], sun: ['#EEF3FF', 1.6, [20, 30, -26]],
      exposure: 0.92, envInt: 0.9, bloom: 0.3, bloomThr: 1.0, grade: [0.97, 1.0, 1.06], sat: 0.92, contrast: 1.04, particles: 'snow',
    },
    snowCaps: true,
    props: [{ t: 'snowfield' }, { t: 'pines' }, { t: 'mast' }, { t: 'floods' }],
  };
}

// ------------------------------------------------------------------ Vila (vila litoranea, telhados e becos)
export function vila() {
  const n = [];
  perimeter(n, 50, 5.5, 'perim');
  n.push(B(0, 0, 0, 3.2, 0.8, 3.2, 'stone', 'fountain'), B(0, 0, 0, 0.5, 1.9, 0.5, 'stone', 'fountainCol'));
  const h = [];
  h.push(B(-9, 0, 8, 6, 4, 5, 'hA', 'house'));
  h.push(...stairs(-5.4, 3.5, '+z', 14, 1.2, 'stone'));
  h.push(B(-9, 4, 5.65, 6, 0.7, 0.3, 'hA', 'parapet'), B(-11.85, 4, 8, 0.3, 0.7, 5, 'hA', 'parapet'));
  h.push(B(-16, 0, 17, 7, 5, 6, 'hB', 'house'));
  h.push(B(4, 0, 15, 6, 3.5, 6, 'hC', 'house'));
  h.push(...stairs(0.4, 20, '-z', 12, 1.2, 'stone'));
  h.push(B(4, 3.5, 12.15, 6, 0.7, 0.3, 'hC', 'parapet'), B(6.85, 3.5, 15, 0.3, 0.7, 6, 'hC', 'parapet'));
  h.push(B(15.5, 0, 8, 5, 4.5, 8, 'hD', 'house'));
  h.push(B(21, 0, 17, 6, 3.2, 5, 'hE', 'house'));
  // arco de passagem
  h.push(B(10, 0, 20.5, 0.8, 3, 0.8, 'stone', 'pillar'), B(14, 0, 20.5, 0.8, 3, 0.8, 'stone', 'pillar'), B(12, 3, 20.5, 4.8, 0.8, 0.8, 'stone', 'lintel'));
  h.push(B(-2.2, 0, 6.5, 2.4, 1.0, 1.1, 'stall', 'stall'), B(3.5, 0, 5, 3, 0.9, 0.6, 'stone', 'planter'));
  h.push(B(-3, 0, 20.5, 1.8, 1.4, 4, 'car', 'car'));
  h.push(B(-21.5, 0, 6, 1.2, 1.2, 1.2, 'crate', 'crate'), B(21, 0, 1, 1.5, 0.9, 3, 'stone', 'planter'));
  h.push(B(-22, 0, 22, 3.2, 11, 3.2, 'tower', 'belltower'));
  rot2(n, h);
  return {
    key: 'vila', name: 'Vila', desc: 'Casinhas coloridas, becos e telhados', boxes: n, size: 50,
    spawns: [[0, 23], [0, -23], [-8.5, 15], [8.5, -15], [22, 10], [-22, -10], [10, 2], [-10, -2], [-14, 1], [14, -1], [18, 23], [-18, -23]],
    swatch: 'linear-gradient(135deg,#F7E3B5,#E08A5A 50%,#3F7FB3)',
    styles: {
      perim: { tex: 'plaster', color: '#E9DCC4' }, stone: { tex: 'stone', color: '#CDBFA6' }, stall: { tex: 'wood', color: '#8a5a34' },
      hA: { tex: 'plaster', color: '#E7B8A0' }, hB: { tex: 'plaster', color: '#F0DA9A' }, hC: { tex: 'plaster', color: '#A7C9D9' }, hD: { tex: 'plaster', color: '#F2EDE2' },
      hE: { tex: 'plaster', color: '#C9D8A6' }, car: { tex: 'metal', color: '#3a86b8' }, crate: { tex: 'wood', color: '#8a6238' }, tower: { tex: 'plaster', color: '#F4EFE6' },
    },
    ground: { tex: 'stone', color: '#BBAE98', surface: 'concrete' },
    surfaces: { stall: 'wood', crate: 'wood', car: 'metal' },
    impacts: { stall: 'wood', crate: 'wood', car: 'metal', ground: 'concrete' },
    atmo: {
      skyTop: '#2F7BD0', skyHorizon: '#CFE6F7', skyBottom: '#A7B7C2', sunColor: '#FFF1D6', sunSize: 0.02, clouds: 0.3, stars: 0,
      fog: '#D9E6EE', fogNear: 55, fogFar: 200, hemi: ['#EAF3FF', '#8C7A62', 0.6], sun: ['#FFF0D8', 3.0, [26, 34, 14]],
      exposure: 1.0, envInt: 0.75, bloom: 0.3, bloomThr: 1.0, grade: [1.03, 1.0, 0.97], sat: 1.12, contrast: 1.05, particles: 'dust',
    },
    props: [{ t: 'hills' }, { t: 'cypress' }, { t: 'lines' }, { t: 'pots' }],
  };
}

// ------------------------------------------------------------------ Duelo (arena pequena para x1 / 2x2)
export function duelo() {
  const n = [];
  perimeter(n, 30, 6, 'perim');
  n.push(B(0, 0, 0, 1.2, 2.3, 4, 'block', 'block'));
  mirrorZ(n, [B(0, 0, 11.5, 8, 1.6, 3, 'deck', 'deck'), B(-2.6, 1.6, 10.15, 2.8, 0.9, 0.3, 'deck', 'parapet'), B(2.6, 1.6, 10.15, 2.8, 0.9, 0.3, 'deck', 'parapet')]);
  mirror4(n, [...stairs(6.75, 11.5, '-x', 6, 2.2, 'deck')]);
  mirror4(n, [B(6, 0, 3.5, 2, 1.2, 2, 'crateA', 'crate'), B(3.4, 0, 6.8, 2.4, 1.6, 0.8, 'block', 'block'), B(11.5, 0, 7.5, 1.4, 1.4, 1.4, 'crateB', 'crate')]);
  mirrorX(n, [B(9.5, 0, 0, 1.2, 2.6, 3, 'block', 'block')]);
  return {
    key: 'duelo', name: 'Duelo', desc: 'Arena pequena para x1 e 2x2', boxes: n, size: 30,
    spawns: [[0, 13.8], [0, -13.8], [8, 13.5], [-8, -13.5], [-8, 13.5], [8, -13.5]],
    swatch: 'linear-gradient(135deg,#1c2230,#FF6A3D 50%,#3DA8FF)',
    styles: {
      perim: { tex: 'panel', color: '#3a3f4a' }, block: { tex: 'concrete', color: '#b5b8bc' }, deck: { tex: 'metal', color: '#5a6069' },
      crateA: { tex: 'wood', color: '#9a6a38' }, crateB: { tex: 'wood', color: '#7a5230' },
    },
    ground: { tex: 'tiles', color: '#8d9197', surface: 'tile' },
    surfaces: { deck: 'metal', crateA: 'wood', crateB: 'wood', perim: 'metal' },
    impacts: { deck: 'metal', crateA: 'wood', crateB: 'wood', perim: 'metal', ground: 'concrete' },
    atmo: {
      skyTop: '#101522', skyHorizon: '#2A3246', skyBottom: '#0D1018', sunColor: '#AFC6FF', sunSize: 0.01, clouds: 0.2, stars: 1,
      fog: '#1A2030', fogNear: 30, fogFar: 120, hemi: ['#B8C6E8', '#2A2F3A', 0.9], sun: ['#DDE6FF', 1.6, [12, 40, 18]],
      exposure: 1.15, envInt: 1.0, bloom: 0.45, bloomThr: 1.1, grade: [1.0, 1.0, 1.04], sat: 1.08, contrast: 1.08, particles: 'dust',
    },
    props: [{ t: 'arena' }],
  };
}
