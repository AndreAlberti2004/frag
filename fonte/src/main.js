// FRAG - interface (configuracoes, lobby) e inicializacao. Fluxo identico ao v2.
import qrcode from 'qrcode-generator';
import {
  q, S, Net, send, hooks, uiState, toast, esc, lsGet, lsSet, cleanCode, shareUrl, showScreen, saveSettings, resetSettings, keyName,
  refreshClassButtons, styleCrosshair, BIND_LABELS, QUALITY_KEYS, LOCAL, RELAY, HOST_PARAM, params, DBG, TEAM_NAMES,
} from './core.js';
import { WEAPONS, CLASSES, PRIMARIES, SECONDARIES, STAT_NAMES } from './weapons.js';
import { MAPS, MAP_ORDER } from './maps.js';
import { PRESETS, detectQuality } from './render.js';
import { Host, Join } from './net.js';
import { Game } from './game.js';
import { Audio } from './audio.js';

// ------------------------------------------------------------------ configuracoes
if (!S.quality || !PRESETS[S.quality]) S.quality = detectQuality();
const XH_COLORS = ['#7CFF6B', '#FFFFFF', '#00E5FF', '#FF4DD8', '#FFE14D', '#FF4D4D'];
function renderSettings() {
  q('sSens').value = S.sens; if (document.activeElement !== q('nSens')) q('nSens').value = Number(S.sens).toFixed(2);
  q('vSensEq').textContent = '= ' + (S.sens / 3.181818).toFixed(3) + ' no Valorant';
  q('sLowLat').checked = !!S.lowLat; q('sFull').checked = S.full !== false;
  q('sSway').value = S.sway ?? 0.5; q('vSway').textContent = Math.round((S.sway ?? 0.5) * 100) + '%';
  const x = S.xh;
  q('sXhColor').innerHTML = XH_COLORS.map((c) => '<button type="button" data-v="' + c + '" class="' + (x.color === c ? 'on' : '') + '" style="background:' + c + '"></button>').join('');
  q('sXhSize').value = x.size; q('vXhSize').textContent = x.size; q('sXhGap').value = x.gap; q('vXhGap').textContent = x.gap; q('sXhThick').value = x.thick; q('vXhThick').textContent = x.thick;
  q('sXhDot').checked = !!x.dot; q('sXhOl').checked = x.outline !== false; q('sXhDyn').checked = x.dyn !== false;
  styleCrosshair(q('xhP'), x.gap); styleCrosshair(q('xh'));
  q('sFov').value = S.fov; q('vFov').textContent = S.fov + '°';
  q('sVol').value = S.vol; q('vVol').textContent = Math.round(S.vol * 100) + '%';
  q('sScale').value = S.scale; q('vScale').textContent = Math.round(S.scale * 100) + '%';
  q('sAdsSens').value = S.adsSens; q('vAdsSens').textContent = Number(S.adsSens).toFixed(2);
  q('sInv').checked = !!S.inv; q('sFps').checked = !!S.fps;
  for (const b of q('sKnife').querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === S.knife);
  for (const b of q('sAdsMode').querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === S.adsMode);
  for (const b of q('sQuality').querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === S.quality);
  const P = PRESETS[S.quality]; q('vQuality').textContent = P ? P.desc : '';
  q('binds').innerHTML = Object.keys(BIND_LABELS).map((k) => '<div class="bind"><span>' + BIND_LABELS[k] + '</span><button data-k="' + k + '" class="' + (uiState.listen === k ? 'listen' : '') + '">' +
    (uiState.listen === k ? 'pressione…' : esc(keyName(S.binds[k]))) + '</button></div>').join('');
}
q('sQuality').innerHTML = QUALITY_KEYS.map((k) => '<button data-v="' + k + '">' + PRESETS[k].name + '</button>').join('');
const slider = (id, key, parse) => q(id).addEventListener('input', () => { S[key] = parse(q(id).value); saveSettings(); renderSettings(); });
slider('sSens', 'sens', parseFloat); slider('sFov', 'fov', (v) => parseInt(v, 10)); slider('sSway', 'sway', parseFloat);
q('nSens').addEventListener('change', () => { const v = parseFloat(q('nSens').value); if (v > 0) { S.sens = Math.min(20, Math.max(0.05, v)); saveSettings(); renderSettings(); } });
q('sLowLat').addEventListener('change', () => { S.lowLat = q('sLowLat').checked; saveSettings(); });
q('sFull').addEventListener('change', () => { S.full = q('sFull').checked; saveSettings(); });
const xhSlider = (id, key) => q(id).addEventListener('input', () => { S.xh[key] = parseInt(q(id).value, 10); saveSettings(); renderSettings(); });
xhSlider('sXhSize', 'size'); xhSlider('sXhGap', 'gap'); xhSlider('sXhThick', 'thick');
for (const [id, key] of [['sXhDot', 'dot'], ['sXhOl', 'outline'], ['sXhDyn', 'dyn']]) q(id).addEventListener('change', () => { S.xh[key] = q(id).checked; saveSettings(); renderSettings(); });
q('sXhColor').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.xh.color = b.dataset.v; saveSettings(); renderSettings(); }); slider('sVol', 'vol', parseFloat); slider('sScale', 'scale', parseFloat); slider('sAdsSens', 'adsSens', parseFloat);
q('sInv').addEventListener('change', () => { S.inv = q('sInv').checked; saveSettings(); });
q('sFps').addEventListener('change', () => { S.fps = q('sFps').checked; saveSettings(); });
const seg = (id, key, after) => q(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S[key] = b.dataset.v; saveSettings(); renderSettings(); if (after) after(); });
seg('sKnife', 'knife', () => hooks.rebuildKnife());
seg('sAdsMode', 'adsMode');
seg('sQuality', 'quality');
q('binds').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { uiState.listen = b.dataset.k; renderSettings(); } });
window.addEventListener('keydown', (e) => {
  if (!uiState.listen) return;
  e.preventDefault(); e.stopPropagation();
  if (e.code !== 'Escape') S.binds[uiState.listen] = e.code;
  uiState.listen = null; saveSettings(); renderSettings();
}, true);
window.addEventListener('mousedown', (e) => {
  if (!uiState.listen || e.button === 0) return;
  e.preventDefault(); S.binds[uiState.listen] = 'Mouse' + e.button; uiState.listen = null; saveSettings(); renderSettings();
}, true);
window.addEventListener('wheel', (e) => {
  if (!uiState.listen) return;
  e.preventDefault(); S.binds[uiState.listen] = e.deltaY < 0 ? 'WheelUp' : 'WheelDown'; uiState.listen = null; saveSettings(); renderSettings();
}, { capture: true, passive: false });
q('btnSettingsReset').addEventListener('click', () => { const ql = S.quality; resetSettings(); S.quality = ql; saveSettings(); renderSettings(); hooks.rebuildKnife(); refreshClassButtons(); });
let settingsBack = null;
hooks.openSettings = (cb) => { settingsBack = cb; uiState.listen = null; renderSettings(); q('settings').hidden = false; };
q('btnSettingsClose').addEventListener('click', () => { q('settings').hidden = true; uiState.listen = null; if (settingsBack) settingsBack(); });
q('btnSettingsLobby').addEventListener('click', () => hooks.openSettings(null));

// ------------------------------------------------------------------ lobby
function renderTop() {
  const n = Net.roster.filter((p) => p.online).length;
  q('topLobby').innerHTML = Net.code ? '<span class="pill"><span class="dot' + (Net.connected ? '' : ' off') + '"></span>' + (LOCAL ? 'rede local' : 'sala <b>' + esc(Net.code) + '</b>') + (n ? ' · ' + n + (n === 1 ? ' jogador' : ' jogadores') : '') + '</span>' : '';
}
let qrFor = '';
function renderLobby() {
  q('lobbyCode').textContent = LOCAL ? '' : Net.code; q('lobbyCode').hidden = LOCAL;
  const url = shareUrl(Net.code);
  q('lobbyLink').value = url;
  const file = location.protocol === 'file:';
  q('linkHint').textContent = file ? 'Aberto direto do arquivo: o link não serve para os outros. Use o jogar.py ou publique o arquivo em um link.'
    : LOCAL ? 'Quem abrir esse link na rede do escritório entra direto na sua sala.' : 'Mande o link (já leva o código). Precisa de mouse e teclado.';
  if (qrFor !== url) {
    try { const qr = qrcode(0, 'M'); qr.addData(url); qr.make(); q('qr').innerHTML = qr.createSvgTag({ scalable: true, margin: 0 }); qrFor = url; } catch { q('qr').innerHTML = ''; }
  }
  q('qr').hidden = file;
  const r = Net.roster;
  q('lobbyCount').textContent = r.filter((p) => p.online).length + ' na sala';
  q('lobbyList').innerHTML = r.map((p) => '<li class="' + (p.online ? '' : 'off') + '"><span class="sw" style="background:' + p.color + '"></span><span class="nm">' + esc(p.name) + '</span>' +
    (Net.cfg.mode === 'tdm' ? '<span class="tag">' + TEAM_NAMES[p.team].toUpperCase() + '</span>' : '') + (p.id === Net.me ? '<span class="tag">VOCÊ</span>' : '') + (p.id === 1 ? '<span class="tag">ANFITRIÃO</span>' : '') + '</li>').join('');
  q('btnStart').hidden = !Net.isHost; q('lobbyWait').hidden = Net.isHost;
  q('opts').style.pointerEvents = Net.isHost ? '' : 'none'; q('opts').style.opacity = Net.isHost ? '' : '.6';
  const c = Net.cfg;
  q('optMap').innerHTML = MAP_ORDER.map((k) => { const m = MAPS[k]; return '<button data-v="' + k + '" class="' + (c.map === k ? 'on' : '') + '"><span class="sw" style="background:' + m.swatch + '"></span><span class="t">' + m.name + '</span><span class="s">' + m.desc + '</span></button>'; }).join('');
  for (const [id, key] of [['optMode', 'mode'], ['optKills', 'kills'], ['optTime', 'time']]) for (const b of q(id).querySelectorAll('button')) b.classList.toggle('on', String(c[key]) === b.dataset.v);
  const n = r.filter((p) => p.online).length;
  q('btnStart').textContent = n < 2 ? 'Começar (só você por enquanto)' : 'Começar com ' + n + ' jogadores';
}
hooks.renderTop = renderTop; hooks.renderLobby = renderLobby;
for (const [id, key, num] of [['optMap', 'map', false], ['optMode', 'mode', false], ['optKills', 'kills', true], ['optTime', 'time', true]])
  q(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || !Net.isHost) return; send({ t: 'cfg', cfg: { [key]: num ? parseInt(b.dataset.v, 10) : b.dataset.v } }); });
// ------------------------------------------------------------------ equipamento (primaria + secundaria)
function loadBtn(w, slot, mini) {
  const W = WEAPONS[w], on = S[slot] === w;
  const bars = mini ? '' : '<span class="bars">' + W.stats.map((v, i) => '<span>' + STAT_NAMES[i] + '</span><i style="--p:' + v * 10 + '%"></i>').join('') + '</span>';
  return '<button type="button" data-w="' + w + '" data-slot="' + slot + '" class="' + (on ? 'on' : '') + '"><b>' + W.name + '</b><small>' + W.desc + '</small>' + bars + '</button>';
}
function renderLoadout() {
  q('optPrim').innerHTML = PRIMARIES.map((w) => loadBtn(w, 'prim')).join('');
  q('optSec').innerHTML = SECONDARIES.map((w) => loadBtn(w, 'sec')).join('');
  q('menuPrim').innerHTML = PRIMARIES.map((w) => loadBtn(w, 'prim', true)).join('');
  q('menuSec').innerHTML = SECONDARIES.map((w) => loadBtn(w, 'sec', true)).join('');
}
hooks.renderLoadout = renderLoadout; hooks.renderMenu = renderLoadout;
for (const id of ['optPrim', 'optSec', 'menuPrim', 'menuSec']) q(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.w) { Game.setLoadout(b.dataset.slot, b.dataset.w); renderLoadout(); } });
renderLoadout();
q('btnStart').addEventListener('click', () => { Audio.ensure(); send({ t: 'start' }); });
q('btnAgain').addEventListener('click', () => send({ t: 'lobby' }));
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Link copiado'); } catch { toast('Não deu para copiar automaticamente: selecione e use Ctrl+C'); } }
q('btnCopy').addEventListener('click', () => copy(q('lobbyLink').value));
q('btnCopyName').addEventListener('click', () => copy(q('nameLinkTxt').textContent));

// ------------------------------------------------------------------ inicio
q('inName').value = lsGet('frag.name') || '';
let creating = false, joinCode = '';
q('btnCreate').addEventListener('click', () => askName('', true));
q('formJoinCode').addEventListener('submit', (e) => {
  e.preventDefault();
  const c = cleanCode(q('inCode').value);
  if (c.length !== 4) { q('homeErr').hidden = false; q('homeErr').textContent = 'O código tem 4 letras.'; return; }
  askName(c, false);
});
function askName(code, create) {
  creating = create; joinCode = code; showScreen('name'); q('nameErr').hidden = true;
  q('nameCode').textContent = LOCAL ? (create ? 'local' : 'do escritório') : create ? 'nova' : code;
  q('btnJoin').textContent = create ? 'Criar sala' : 'Entrar';
  q('nameLink').hidden = !(LOCAL && create);
  if (LOCAL && create) q('nameLinkTxt').textContent = shareUrl('');
  q('namePrompt').textContent = LOCAL && create ? 'O servidor está no ar. Mande o link acima para a galera e escolha seu nome:' : 'Como quer aparecer no placar?';
  q('inName').focus();
}
q('formName').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = q('inName').value.trim().slice(0, 14);
  if (!name) { q('nameErr').hidden = false; q('nameErr').textContent = 'Coloca um nome, vai.'; return; }
  lsSet('frag.name', name); q('nameErr').hidden = true; Audio.ensure();
  if (creating) {
    Host.create(name); showScreen('lobby'); renderLobby();
    try { const u = new URL(location.href); u.searchParams.delete('sala'); u.searchParams.delete('host'); history.replaceState(null, '', u.toString()); } catch {}
  } else Join.join(joinCode, name);
});
// pergunta antes de sair no meio da partida (protege do Ctrl+W acidental: agachar + andar)
window.addEventListener('beforeunload', (e) => { if ((Net.isHost && Net.roster.length > 1) || Game.running) { e.preventDefault(); e.returnValue = ''; } });
if (LOCAL) askName('', HOST_PARAM);
else { const c = cleanCode(params.get('sala')); c.length === 4 ? askName(c, false) : showScreen('home'); }
if (DBG) window.__frag = { Game, Client: Net, Host, S, WEAPONS, get settings() { return S; } };
void RELAY; void CLASSES; void refreshClassButtons;
