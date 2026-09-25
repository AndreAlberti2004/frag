// FRAG - nucleo compartilhado: DOM, constantes, configuracoes e estado do cliente.
// Portado do bundle minificado (v2) com os mesmos valores de jogo.

export const q = (id) => document.getElementById(id);
export const params = new URLSearchParams(location.search);
export const DBG = params.get('dbg') === '1';
export const RELAY = !!window.__RELAY;            // servido pelo server.py
export const RELAY_PUBLIC = window.__RELAY === 2; // nuvem: salas por codigo
export const LOCAL = RELAY && !RELAY_PUBLIC;      // jogar.py: sala unica
export const HOST_PARAM = params.get('host') === '1';
export const PEER_PREFIX = 'frag-v2-';
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const COLORS = ['#FF5D5D', '#FFB020', '#5BE37D', '#4DA3FF', '#FF6FD8', '#2ED3C8', '#F5E663', '#9B7BFF', '#FF8A3D', '#A3FF5B', '#7FDBFF', '#FF9DB5'];
export const TEAM_COLORS = { a: '#4DA3FF', b: '#FF5D5D' };
export const TEAM_NAMES = { a: 'Azul', b: 'Vermelho' };
export const RESPAWN_MS = 3000;
export const PLAYER_R = 0.3;
export const STAND_H = 1.7;
export const CROUCH_H = 1.1;
export const EYE = 1.55;
export const EYE_CROUCH = 0.95;
export const STEP = 0.6;
export const WEAPON_ORDER = ['sniper', 'rifle', 'pistol', 'knife', 'ak', 'smg', 'shotgun', 'dmr', 'deagle', 'nade'];
export const TUCK = 0.25; // quanto as pernas sobem ao agachar no ar (crouch-jump)
// sensibilidade na mesma escala do CS2 (0,022 grau por contagem do mouse); Valorant = CS / 3,18
export const YAW_PER_COUNT = 0.022 * Math.PI / 180;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const randInt = (n) => Math.floor(Math.random() * n);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

export function token() {
  let t = lsGet('frag.token');
  if (!t) { t = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); lsSet('frag.token', t); }
  return t;
}
export function makeCode() { let s = ''; for (let i = 0; i < 4; i++) s += CODE_CHARS[randInt(CODE_CHARS.length)]; return s; }
export function cleanCode(s) { return (s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); }

let toastT;
export function toast(msg) {
  const el = q('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1800);
}

export function shareUrl(code) {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  if (!LOCAL) { u.searchParams.set('sala', code); if (params.get('ps') && !RELAY) u.searchParams.set('ps', params.get('ps')); }
  if (DBG) u.searchParams.set('dbg', '1');
  return u.toString();
}

export function peerOpts() {
  const ps = params.get('ps');
  const o = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } };
  if (ps) { const [h, p] = ps.split(':'); o.host = h; o.port = parseInt(p || '9000', 10); o.path = '/'; o.secure = false; }
  return o;
}

export function showScreen(name) {
  for (const s of ['Home', 'Name', 'Lobby']) q('scr' + s).hidden = s.toLowerCase() !== name;
  q('game').hidden = name !== 'game';
}

// ------------------------------------------------------------------ configuracoes
export const BIND_LABELS = {
  forward: 'Frente', back: 'Trás', left: 'Esquerda', right: 'Direita', jump: 'Pular', crouch: 'Agachar (segurar)', walk: 'Andar devagar, sem barulho (segurar)',
  reload: 'Recarregar', slot1: 'Primária', slot2: 'Secundária', slot3: 'Faca', slot4: 'Granada', last: 'Última arma',
  inspect: 'Inspecionar', scoreboard: 'Placar completo (segurar)',
};

export const QUALITY_KEYS = ['pp', 'p', 'bal', 'alto', 'malto', 'ext'];

export const DEFAULTS = {
  sens: 2, fov: 85, vol: 0.6, inv: false, scale: 1, aa: true, fps: true, shadows: true, knife: 'default', cls: 'ar',
  prim: 'rifle', sec: 'pistol', quality: '', adsMode: 'toggle', adsSens: 1, lowLat: true, full: true, sway: 0.5, v: 4,
  xh: { color: '#7CFF6B', size: 7, gap: 4, thick: 2, dot: false, outline: true, dyn: true, alpha: 1 },
  binds: {
    forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', crouch: 'ControlLeft', walk: 'ShiftLeft', reload: 'KeyR',
    slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4', last: 'KeyQ', inspect: 'KeyF', scoreboard: 'Tab',
  },
};

export let S = JSON.parse(JSON.stringify(DEFAULTS));
try {
  const saved = JSON.parse(lsGet('frag.settings2') || 'null');
  if (saved) {
    S = { ...S, ...saved, binds: { ...S.binds, ...(saved.binds || {}) }, xh: { ...S.xh, ...(saved.xh || {}) } };
    // v3 -> v4: sensibilidade passa para a escala do CS2 (mesmo giro por contagem), classe vira loadout
    if (!saved.v || saved.v < 4) {
      S.sens = Math.max(0.1, Math.min(10, Math.round((saved.sens || 1) * (0.0022 / YAW_PER_COUNT) * 100) / 100));
      S.prim = saved.cls === 'sniper' ? 'sniper' : 'rifle'; S.v = 4;
    }
  }
} catch {}

export const hooks = { applyRender: () => {}, renderLobby: () => {}, renderTop: () => {}, rebuildKnife: () => {}, openSettings: () => {}, renderLoadout: () => {}, renderMenu: () => {} };
export const uiState = { listen: null }; // tecla sendo configurada (bloqueia os comandos do jogo)

export function saveSettings() { lsSet('frag.settings2', JSON.stringify(S)); hooks.applyRender(); }
export function resetSettings() {
  S = JSON.parse(JSON.stringify(DEFAULTS));
  saveSettings();
}

export function keyName(code) {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return ({
    Space: 'Espaço', ShiftLeft: 'Shift', ShiftRight: 'Shift D', ControlLeft: 'Ctrl', ControlRight: 'Ctrl D', AltLeft: 'Alt', Tab: 'Tab',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', CapsLock: 'Caps',
    Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', Mouse1: 'Mouse meio', WheelUp: 'Scroll ↑', WheelDown: 'Scroll ↓',
  })[code] || code;
}

// ------------------------------------------------------------------ estado do cliente (espelha o anfitriao)
export const Net = {
  me: 0, isHost: false, code: '', connected: true, phase: 'lobby',
  cfg: { map: 'patio', mode: 'ffa', kills: 20, time: 5 }, tm: 0, roster: [],
  onMsg: () => {},
};
export const link = { cur: null }; // canal para o anfitriao: { send(msg) }
export function send(m) { if (link.cur) link.cur.send(m); }
export function mySelf() { return Net.roster.find((p) => p.id === Net.me) || null; }

export function refreshClassButtons() { hooks.renderLoadout(); }
// aplica as variaveis da mira (jogo e previa)
export function styleCrosshair(el, gap) {
  const x = S.xh || {};
  el.style.setProperty('--xc', x.color || '#7CFF6B'); el.style.setProperty('--xs', (x.size ?? 7) + 'px');
  el.style.setProperty('--xt', (x.thick ?? 2) + 'px'); el.style.setProperty('--xa', x.alpha ?? 1);
  if (gap !== undefined) el.style.setProperty('--xg', gap + 'px');
  el.classList.toggle('dot', !!x.dot); el.classList.toggle('ol', x.outline !== false);
}
