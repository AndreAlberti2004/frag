// Rede: anfitriao autoritativo (na aba de quem cria), relay WebSocket do server.py e PeerJS como plano B.
// Logica portada do v2 sem mudanca de regra; acrescimos: flag de mira (a) no estado e evento de recarga (rl).
import Peer from 'peerjs';
import { WEAPONS, falloff } from './weapons.js';
import {
  q, Net, link, send, hooks, token, makeCode, clamp, toast, showScreen, peerOpts, RELAY, LOCAL, PEER_PREFIX,
  COLORS, TEAM_COLORS, RESPAWN_MS, WEAPON_ORDER,
} from './core.js';
import { Game } from './game.js';
import { MAPS } from './maps.js';

// ------------------------------------------------------------------ relay (server.py)
export const Relay = {
  ws: null,
  conns: new Map(),
  url() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'; },
  keepalive(ws) {
    const t = setInterval(() => { ws.readyState === 1 ? ws.send(JSON.stringify({ t: 'ping' })) : clearInterval(t); }, 20000);
  },
  host(code) {
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'host', code })); this.keepalive(ws); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'hosted') { this.v = m.v || 1; Net.connected = true; Host.code = m.code || code; Net.code = Host.code; hooks.renderTop(); hooks.renderLobby(); return; }
      if (m.t === 'taken') { ws.onclose = null; ws.close(); Host.code = makeCode(); this.host(Host.code); return; }
      if (m.t === 'join') { const c = this.fake(m.id); this.conns.set(m.id, c); Host.onConn(c); return; }
      if (m.t === 'from') { const c = this.conns.get(m.id); if (c) c.emit('data', m.m); return; }
      if (m.t === 'left') { const c = this.conns.get(m.id); if (c) { c.open = false; c.emit('close'); this.conns.delete(m.id); } }
    };
    ws.onclose = () => {
      Net.connected = false; hooks.renderTop();
      for (const c of this.conns.values()) { c.open = false; c.emit('close'); }
      this.conns.clear();
      setTimeout(() => this.host(Host.code), 2000);
    };
    ws.onerror = () => {};
  },
  // um envio para todos os convidados (servidor v4+); devolve false se o servidor for antigo
  all(m) { if (this.v >= 4 && this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify({ t: 'all', m })); return true; } return false; },
  fake(id) {
    const handlers = {};
    return {
      id, open: true,
      relay: true,
      send: (m) => { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'to', id, m })); },
      on: (ev, fn) => { (handlers[ev] || (handlers[ev] = [])).push(fn); },
      emit: (ev, arg) => { for (const fn of handlers[ev] || []) fn(arg); },
    };
  },
  join(code, cb) {
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'join', code })); this.keepalive(ws); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'joined') cb.open((msg) => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'm', m: msg })); });
      else if (m.t === 'm') cb.data(m.m);
      else if (m.t === 'noroom') { cb.noroom(); ws.onclose = null; ws.close(); }
      else if (m.t === 'closed') cb.close();
    };
    ws.onclose = () => cb.close();
    ws.onerror = () => {};
  },
};

// ------------------------------------------------------------------ anfitriao
export const Host = {
  peer: null, code: '', players: new Map(), nextId: 1, phase: 'lobby',
  cfg: { map: 'patio', mode: 'ffa', kills: 20, time: 5 },
  endAt: 0, tick: null, rosterT: 0, lastSpawn: new Map(),
  create(name) {
    this.code = LOCAL ? 'LOCAL' : makeCode();
    const me = this.add(name, token(), null);
    Net.me = me.id; Net.isHost = true;
    link.cur = { send: (m) => Host.handle(me.id, m) };
    RELAY ? Relay.host(this.code) : this.openPeer(0);
    this.tick = setInterval(() => this.loop(), 33);
    this.sendRoster();
  },
  openPeer(attempt) {
    const p = new Peer(PEER_PREFIX + this.code, peerOpts());
    this.peer = p;
    p.on('open', () => { Net.connected = true; hooks.renderTop(); });
    p.on('connection', (c) => this.onConn(c));
    p.on('disconnected', () => { Net.connected = false; hooks.renderTop(); try { p.reconnect(); } catch {} });
    p.on('error', (e) => {
      if (e.type === 'unavailable-id' && attempt < 3) { this.code = makeCode(); this.openPeer(attempt + 1); this.sendRoster(); return; }
      Net.connected = false; hooks.renderTop();
    });
  },
  onConn(conn) {
    let pid = 0;
    conn.on('data', (m) => {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hello') {
        const name = String(m.name || 'Alguém').slice(0, 14).trim() || 'Alguém';
        const pl = this.add(name, String(m.token || ''), conn);
        pid = pl.id;
        conn.send({ t: 'welcome', id: pid });
        this.sendRoster();
        if (this.phase === 'play') this.spawn(pl);
        return;
      }
      if (pid) this.handle(pid, m);
    });
    const gone = () => {
      const pl = pid && this.players.get(pid);
      if (pl && pl.conn === conn) { pl.conn = null; pl.online = false; pl.alive = false; this.sendRoster(); }
    };
    conn.on('close', gone); conn.on('error', gone);
  },
  add(name, tok, conn) {
    for (const p of this.players.values()) if (tok && p.token === tok) { p.conn = conn; p.online = true; if (name) p.name = name; return p; }
    const id = this.nextId++;
    const p = { id, name, token: tok, conn, online: true, k: 0, d: 0, hs: 0, hp: 100, alive: false, p: [0, 0, 0], yaw: 0, pitch: 0, c: 0, w: 0, a: 0, q: 0, team: 'a', respawnAt: 0 };
    this.players.set(id, p);
    let na = 0, nb = 0;
    for (const x of this.players.values()) x.team === 'a' ? na++ : nb++;
    if (na - nb > 1) p.team = 'b';
    return p;
  },
  colorOf(p) { return this.cfg.mode === 'tdm' ? TEAM_COLORS[p.team] : COLORS[(p.id - 1) % COLORS.length]; },
  handle(pid, m) {
    const p = this.players.get(pid);
    if (!p) return;
    if (m.t === 's') {
      if (Array.isArray(m.p) && m.p.length === 3) { p.p = m.p; p.yaw = +m.y || 0; p.pitch = +m.pi || 0; p.c = m.c ? 1 : 0; p.w = clamp(m.w | 0, 0, WEAPON_ORDER.length - 1); p.a = m.a ? 1 : 0; p.q = m.q ? 1 : 0; }
      return;
    }
    if (m.t === 'fire') return this.fire(p, m);
    if (m.t === 'nade') {
      if (this.phase === 'play' && p.alive && Array.isArray(m.o) && Array.isArray(m.v)) this.broadcast({ t: 'ev', k: 'nade', id: p.id, o: m.o, v: m.v, s: m.s | 0 });
      return;
    }
    if (m.t === 'boom') return this.boom(p, m);
    if (m.t === 'rl') { if (this.phase === 'play' && p.alive) this.broadcast({ t: 'ev', k: 'rl', id: p.id, w: String(m.w || '') }); return; }
    if (pid === Net.me) {
      if (m.t === 'cfg') { this.cfg = { ...this.cfg, ...m.cfg }; this.sendRoster(); }
      else if (m.t === 'start') this.startMatch();
      else if (m.t === 'lobby') { this.phase = 'lobby'; for (const x of this.players.values()) x.alive = false; this.sendRoster(); }
    }
  },
  // aplica dano e trata a morte (tambem suicidio de granada)
  hurt(p, v, dmg, w, hs) {
    if (!v.alive || dmg <= 0) return;
    v.hp -= dmg;
    this.broadcast({ t: 'ev', k: 'dmg', id: v.id, from: p.p, hs, w });
    if (v.hp <= 0) {
      v.hp = 0; v.alive = false; v.d++; v.respawnAt = Date.now() + RESPAWN_MS;
      if (v.id !== p.id) { p.k++; if (hs) p.hs++; }
      this.broadcast({ t: 'ev', k: 'kill', killer: p.id, victim: v.id, hs, w });
      this.sendRoster(); this.checkWin();
    }
  },
  foe(p, v) { return v && v.alive && v.id !== p.id && !(this.cfg.mode === 'tdm' && v.team === p.team); },
  fire(p, m) {
    if (this.phase !== 'play' || !p.alive) return;
    const w = WEAPONS[m.w] && WEAPONS[m.w].kind !== 'nade' ? m.w : 'pistol', W = WEAPONS[w];
    if (w === 'knife') {
      const v = m.v ? this.players.get(m.v) : null;
      if (this.foe(p, v)) {
        const mode = m.mode === 'stab' ? 'stab' : 'slash';
        let dmg = W[mode].dmg, hs = false;
        const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
        const dx = p.p[0] - v.p[0], dz = p.p[2] - v.p[2];
        const dist = Math.hypot(dx, dz) || 1;
        if ((fx * dx + fz * dz) / dist < -0.35) { dmg *= W.backstab; hs = true; }
        if (dist > 3.2) dmg = 0;
        this.hurt(p, v, dmg, w, hs);
      }
      this.broadcast({ t: 'ev', k: 'fire', id: p.id, w, mode: m.mode });
      return;
    }
    // tiros: lista de acertos [vitima, parte, quantos chumbos] (escopeta) ou um acerto so (v, part)
    const list = Array.isArray(m.hits) ? m.hits.slice(0, 16) : m.v ? [[m.v, m.part, 1]] : [];
    const per = new Map();
    for (const h of list) {
      const v = this.players.get(h[0] | 0); if (!this.foe(p, v)) continue;
      const part = h[1] === 'h' || h[1] === 'l' ? h[1] : 'b', n = clamp(h[2] | 0, 1, W.pellets || 1);
      const dist = Math.hypot(v.p[0] - p.p[0], v.p[1] - p.p[1], v.p[2] - p.p[2]);
      const e = per.get(v.id) || { v, dmg: 0, hs: false };
      e.dmg += (W.dmg[part] || W.dmg.b) * n * falloff(W, dist); e.hs = e.hs || part === 'h';
      per.set(v.id, e);
    }
    for (const e of per.values()) this.hurt(p, e.v, Math.round(e.dmg), w, e.hs);
    if (Array.isArray(m.o) && Array.isArray(m.e)) this.broadcast({ t: 'ev', k: 'fire', id: p.id, o: m.o, e: m.e, es: Array.isArray(m.es) ? m.es.slice(0, 6) : undefined, w, v: per.size ? 1 : 0 });
  },
  boom(p, m) {
    if (this.phase !== 'play' || !Array.isArray(m.p)) return;
    this.broadcast({ t: 'ev', k: 'boom', id: p.id, s: m.s | 0, p: m.p });
    for (const h of Array.isArray(m.hits) ? m.hits.slice(0, 16) : []) {
      const v = this.players.get(h[0] | 0);
      if (!v || !v.alive) continue;
      if (v.id !== p.id && this.cfg.mode === 'tdm' && v.team === p.team) continue;
      this.hurt(p, v, clamp(+h[1] || 0, 0, WEAPONS.nade.dmg + 15), 'nade', false);
    }
  },
  startMatch() {
    if (this.phase === 'play') return;
    this.phase = 'play'; this.endAt = Date.now() + this.cfg.time * 60000; this.lastSpawn.clear();
    for (const p of this.players.values()) { p.k = 0; p.d = 0; p.hs = 0; p.hp = 100; p.alive = false; p.respawnAt = 0; }
    this.sendRoster();
    for (const p of this.players.values()) if (p.online) this.spawn(p);
  },
  pickSpawn(pl) {
    const map = MAPS[this.cfg.map];
    const now = Date.now();
    const foes = [...this.players.values()].filter((x) => x.alive && x.id !== pl.id && !(this.cfg.mode === 'tdm' && x.team === pl.team));
    let best = 0, bestD = -1;
    const order = map.spawns.map((_, i) => i).sort(() => Math.random() - 0.5);
    for (const i of order) {
      const s = map.spawns[i];
      let d = 1e9;
      for (const f of foes) d = Math.min(d, Math.hypot(f.p[0] - s[0], f.p[2] - s[1]));
      if ((this.lastSpawn.get(i) || 0) > now - 2500) d -= 100;
      if (d > bestD) { bestD = d; best = i; }
    }
    this.lastSpawn.set(best, now);
    return map.spawns[best];
  },
  spawn(pl) {
    const s = this.pickSpawn(pl);
    pl.alive = true; pl.hp = 100; pl.p = [s[0], 0, s[1]]; pl.respawnAt = 0;
    this.broadcast({ t: 'ev', k: 'spawn', id: pl.id, p: pl.p, yaw: Math.atan2(s[0], s[1]) });
  },
  checkWin() {
    let over = false;
    if (this.cfg.mode === 'tdm') {
      let a = 0, b = 0;
      for (const p of this.players.values()) p.team === 'a' ? (a += p.k) : (b += p.k);
      over = a >= this.cfg.kills || b >= this.cfg.kills;
    } else for (const p of this.players.values()) if (p.k >= this.cfg.kills) over = true;
    if (Date.now() >= this.endAt) over = true;
    if (over) { this.phase = 'end'; for (const p of this.players.values()) p.alive = false; this.sendRoster(); }
  },
  loop() {
    if (this.phase !== 'play') return;
    const now = Date.now();
    for (const p of this.players.values()) if (!p.alive && p.online && p.respawnAt && now >= p.respawnAt) this.spawn(p);
    this.checkWin();
    if (this.phase !== 'play') return;
    const ps = [];
    for (const p of this.players.values()) if (p.online) ps.push([p.id, p.p[0], p.p[1], p.p[2], p.yaw, p.pitch, p.hp, p.alive ? 1 : 0, p.c, p.w, p.a, p.q]);
    this.broadcast({ t: 'snap', ps });
    if (now - this.rosterT > 1000) this.sendRoster();
  },
  roster() {
    return {
      t: 'roster', phase: this.phase, cfg: this.cfg, code: this.code,
      tm: this.phase === 'play' ? Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000)) : this.cfg.time * 60,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, color: this.colorOf(p), k: p.k, d: p.d, hs: p.hs, online: p.online, alive: p.alive })),
    };
  },
  sendRoster() { this.rosterT = Date.now(); this.broadcast(this.roster()); },
  broadcast(m) {
    const viaAll = RELAY && Relay.all(m);
    for (const p of this.players.values()) if (p.conn && p.conn.open && !(viaAll && p.conn.relay)) { try { p.conn.send(m); } catch {} }
    Net.onMsg(m);
  },
};

// ------------------------------------------------------------------ convidado
export const Join = {
  peer: null, code: '', name: '', retryT: null, fails: 0, everConnected: false,
  join(code, name) {
    this.code = code; this.name = name; Net.code = code || 'LOCAL'; Net.isHost = false;
    showScreen('lobby');
    q('lobbyWait').hidden = false; q('btnStart').hidden = true;
    q('opts').style.pointerEvents = 'none'; q('opts').style.opacity = '.6';
    q('lobbyList').innerHTML = '<li><span class="waiting"><span class="spin"></span>Conectando à sala…</span></li>';
    this.connect();
  },
  connect() {
    if (RELAY) {
      Relay.join(LOCAL ? 'LOCAL' : this.code, {
        open: (sendFn) => {
          this.everConnected = true; this.fails = 0; Net.connected = true; hooks.renderTop();
          link.cur = { send: sendFn };
          sendFn({ t: 'hello', name: this.name, token: token() });
        },
        data: (m) => Net.onMsg(m),
        close: () => this.lost(),
        noroom: () => this.fail(LOCAL
          ? 'O anfitrião ainda não abriu a sala. Espere ele abrir e clique em Entrar de novo.'
          : 'Não achei a sala ' + this.code + '. O código está certo? A sala só existe enquanto a aba de quem criou estiver aberta.'),
      });
      return;
    }
    if (this.peer) { try { this.peer.destroy(); } catch {} }
    const p = new Peer(peerOpts());
    this.peer = p;
    p.on('open', () => {
      const c = p.connect(PEER_PREFIX + this.code, { reliable: true, serialization: 'json' });
      const to = setTimeout(() => { if (!c.open) this.fail('A sala ' + this.code + ' não respondeu. Confira o código; a sala só existe enquanto a aba do anfitrião estiver aberta.'); }, 9000);
      c.on('open', () => {
        clearTimeout(to); this.everConnected = true; this.fails = 0; Net.connected = true; hooks.renderTop();
        link.cur = { send: (m) => { if (c.open) c.send(m); } };
        c.send({ t: 'hello', name: this.name, token: token() });
      });
      c.on('data', (m) => { if (m && typeof m === 'object') Net.onMsg(m); });
      c.on('close', () => { clearTimeout(to); this.lost(); });
      c.on('error', () => { clearTimeout(to); this.lost(); });
    });
    p.on('error', (e) => {
      if (e.type === 'peer-unavailable') this.fail('Não achei a sala ' + this.code + '. O código está certo? A sala só existe enquanto a aba de quem criou estiver aberta.');
      else if (this.everConnected) this.lost();
      else this.fail('Não consegui conectar (' + e.type + '). Verifique a internet e tente de novo.');
    });
  },
  lost() {
    Net.connected = false; hooks.renderTop(); clearTimeout(this.retryT); this.fails++;
    if (this.fails > 6) { this.fail('A sala parece ter fechado (a aba do anfitrião foi fechada?).'); return; }
    if (this.fails === 1) toast('Conexão perdida. Tentando voltar…');
    this.retryT = setTimeout(() => this.connect(), 2500);
  },
  fail(msg) {
    clearTimeout(this.retryT);
    if (this.peer) { try { this.peer.destroy(); } catch {} this.peer = null; }
    this.fails = 0; this.everConnected = false;
    Game.stop(); showScreen('name');
    q('nameErr').hidden = false; q('nameErr').textContent = msg;
  },
};

// ------------------------------------------------------------------ mensagens para todos (inclusive o anfitriao)
Net.onMsg = function (m) {
  if (m.t === 'welcome') { this.me = m.id; return; }
  if (m.t === 'roster') {
    const prev = this.phase;
    this.phase = m.phase; this.cfg = m.cfg; this.tm = m.tm; this.roster = m.players;
    if (m.code) this.code = m.code;
    Game.onRoster();
    if (m.phase === 'lobby') { if (prev !== 'lobby') Game.stop(); showScreen('lobby'); hooks.renderLobby(); }
    else if (m.phase === 'play') { if (prev !== 'play') Game.start(m.cfg); showScreen('game'); Game.renderHud(); }
    else if (m.phase === 'end') { showScreen('game'); Game.end(); }
    hooks.renderTop();
    return;
  }
  if (m.t === 'snap') return Game.onSnap(m);
  if (m.t === 'ev') return Game.onEvent(m);
};

export { send };
