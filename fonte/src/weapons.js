// FRAG v4 - arsenal. Unidades: ms, metros, m/s. spread = desvio maximo (radianos aprox.) somado a direcao.
// move: imprecisao extra correndo (escala com a velocidade acima de 30% da maxima; parar = precisao total, como no CS)
// pattern: recuo fixo por bala (aprendivel) em multiplos de kick (vertical) e kickYaw (horizontal)
// falloff: [inicio, fim, multiplicador no fim] do dano por distancia
// ads: mira no botao direito (fov = fracao do fov normal; scope = fov fixo da luneta em graus)

const AR_PAT = { v: [1, 1.1, 1.3, 1.5, 1.6, 1.6, 1.5, 1.3, 1.1, 0.9, 0.7, 0.6, 0.5, 0.5, 0.45, 0.4, 0.4, 0.35, 0.35, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
  h: [0, 0.2, -0.1, 0.3, 0.5, 0.2, -0.4, -0.9, -1.2, -1, -0.6, 0.4, 1.1, 1.4, 1.2, 0.8, 0.2, -0.5, -1, -1.2, -0.8, 0, 0.8, 1.2, 1, 0.4, -0.3, -0.8, -0.9, -0.5] };
const AK_PAT = { v: [1, 1.2, 1.5, 1.8, 2, 2, 1.9, 1.6, 1.2, 0.9, 0.6, 0.5, 0.45, 0.4, 0.4, 0.35, 0.35, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
  h: [0, 0.3, 0.1, -0.3, -0.6, -0.4, 0.3, 1.2, 1.8, 2, 1.6, 0.6, -0.8, -1.8, -2.2, -1.9, -1, 0.2, 1.2, 1.8, 1.5, 0.6, -0.5, -1.4, -1.8, -1.2, -0.2, 0.8, 1.3, 1] };
const SMG_PAT = { v: [1, 1, 1.1, 1.2, 1.2, 1.1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.45, 0.4, 0.4, 0.4, 0.35, 0.35, 0.35, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
  h: [0, 0.2, 0.4, 0.2, -0.3, -0.7, -0.8, -0.4, 0.3, 0.9, 1, 0.6, -0.1, -0.8, -1, -0.6, 0.1, 0.8, 1, 0.5, -0.2, -0.8, -0.9, -0.3, 0.4, 0.9, 0.7, 0, -0.6, -0.7] };

export const WEAPONS = {
  // ---------------- primarias
  rifle: { name: 'Carabina', short: 'M4', slot: 1, mag: 30, fireMs: 90, reloadMs: 2150, dmg: { h: 100, b: 33, l: 25 }, speed: 5.9, auto: true, kind: 'gun', anim: 'rifle',
    spread: { hip: 0.006, move: 0.026, air: 0.07 }, kick: 0.0085, kickYaw: 0.0045, recoilK: 0.0035, pattern: AR_PAT, falloff: [30, 70, 0.8],
    ads: { fov: 0.78, spread: 0.55, move: 0.75, kick: 0.8, speed: 0.8, sens: 0.8 }, desc: 'Controlável, 30 tiros, red dot', stats: [7, 7, 8, 7] },
  ak: { name: 'Fuzil', short: 'AK', slot: 1, mag: 30, fireMs: 100, reloadMs: 2450, dmg: { h: 143, b: 36, l: 27 }, speed: 5.6, auto: true, kind: 'gun', anim: 'rifle',
    spread: { hip: 0.008, move: 0.034, air: 0.08 }, kick: 0.0105, kickYaw: 0.0055, recoilK: 0.0045, pattern: AK_PAT, falloff: [30, 70, 0.8],
    ads: { fov: 0.8, spread: 0.6, move: 0.8, kick: 0.85, speed: 0.8, sens: 0.82 }, desc: 'Um tiro na cabeça mata. Coice forte', stats: [9, 6, 5, 6] },
  smg: { name: 'SMG', short: 'SMG', slot: 1, mag: 32, fireMs: 68, reloadMs: 1950, dmg: { h: 70, b: 25, l: 19 }, speed: 6.3, auto: true, kind: 'gun', anim: 'smg',
    spread: { hip: 0.009, move: 0.012, air: 0.05 }, kick: 0.006, kickYaw: 0.004, recoilK: 0.0035, pattern: SMG_PAT, falloff: [12, 32, 0.62],
    ads: { fov: 0.82, spread: 0.6, move: 0.85, kick: 0.85, speed: 0.85, sens: 0.85 }, desc: 'Rápida, atira correndo, fraca de longe', stats: [5, 10, 9, 4] },
  shotgun: { name: 'Escopeta', short: 'Escopeta', slot: 1, mag: 7, fireMs: 880, reloadMs: 520, reloadStart: 380, shellByShell: true, dmg: { h: 30, b: 21, l: 16 }, pellets: 9, cone: 0.05,
    speed: 5.8, auto: false, kind: 'gun', anim: 'shotgun', spread: { hip: 0, move: 0.01, air: 0.02 }, kick: 0.05, kickYaw: 0.012, falloff: [6, 22, 0.25],
    ads: { fov: 0.88, spread: 0.8, move: 0.9, kick: 0.9, speed: 0.85, sens: 0.9 }, desc: 'Nove chumbos. Colado, apaga', stats: [10, 2, 7, 2] },
  dmr: { name: 'DMR', short: 'DMR', slot: 1, mag: 10, fireMs: 250, reloadMs: 2500, dmg: { h: 190, b: 62, l: 46 }, speed: 5.3, auto: false, kind: 'gun', anim: 'dmr',
    spread: { scoped: 0.0022, hip: 0.035, move: 0.045, air: 0.08 }, kick: 0.022, kickYaw: 0.006, scope: 34, desc: 'Semi-automático com luneta 2,5x. Dois no peito', stats: [8, 4, 5, 9] },
  sniper: { name: 'Sniper', short: 'Sniper', slot: 1, mag: 5, fireMs: 1450, reloadMs: 3300, dmg: { h: 250, b: 115, l: 85 }, speed: 5, auto: false, kind: 'gun', anim: 'sniper',
    spread: { scoped: 0.0012, hip: 0.06, move: 0.05, air: 0.08 }, kick: 0.05, kickYaw: 0.01, scope: 22, desc: 'Um tiro, uma vida', stats: [10, 1, 3, 10] },
  // ---------------- secundarias
  pistol: { name: 'Pistola', short: 'Pistola', slot: 2, mag: 12, fireMs: 140, reloadMs: 1700, dmg: { h: 100, b: 30, l: 21 }, speed: 6.4, auto: false, kind: 'gun', anim: 'pistol',
    spread: { hip: 0.007, move: 0.028, air: 0.06 }, kick: 0.012, kickYaw: 0.004, recoilK: 0.004, falloff: [20, 50, 0.75],
    ads: { fov: 0.88, spread: 0.6, move: 0.8, kick: 0.85, speed: 0.85, sens: 0.9 }, desc: '12 tiros, rápida de sacar', stats: [5, 6, 9, 6] },
  deagle: { name: 'Magnum', short: 'Magnum', slot: 2, mag: 7, fireMs: 270, reloadMs: 2150, dmg: { h: 170, b: 55, l: 40 }, speed: 6.1, auto: false, kind: 'gun', anim: 'pistol',
    spread: { hip: 0.009, move: 0.06, air: 0.1 }, kick: 0.032, kickYaw: 0.008, recoilK: 0.009, falloff: [25, 60, 0.8],
    ads: { fov: 0.86, spread: 0.55, move: 0.85, kick: 0.9, speed: 0.85, sens: 0.88 }, desc: 'Parado, um tiro na cabeça. Andando, reza', stats: [9, 2, 7, 7] },
  // ---------------- faca e granada
  knife: { name: 'Faca', slot: 3, speed: 6.9, kind: 'melee', slash: { dmg: 40, ms: 420, range: 1.75 }, stab: { dmg: 65, ms: 950, range: 1.55 }, backstab: 3 },
  nade: { name: 'Granada', slot: 4, speed: 6.4, kind: 'nade', fuse: 1800, radius: 7, dmg: 105, throwV: 16, lobV: 8 },
};
export const PRIMARIES = ['rifle', 'ak', 'smg', 'shotgun', 'dmr', 'sniper'];
export const SECONDARIES = ['pistol', 'deagle'];
export const STAT_NAMES = ['Dano', 'Cadência', 'Mobilidade', 'Alcance'];
// classes antigas -> primaria
export const CLASSES = { ar: { name: 'AR', primary: 'rifle' }, sniper: { name: 'Sniper', primary: 'sniper' } };
export const KNIFE_NAMES = { default: 'Padrão', karambit: 'Karambit', butterfly: 'Butterfly' };
export const SCOPE_FOV = 22;
// dano com queda por distancia (usado pelo anfitriao)
export function falloff(w, dist) {
  const f = w.falloff; if (!f) return 1;
  if (dist <= f[0]) return 1;
  if (dist >= f[1]) return f[2];
  return 1 + (f[2] - 1) * (dist - f[0]) / (f[1] - f[0]);
}
