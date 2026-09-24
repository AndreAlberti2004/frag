#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FRAG - servidor (site + relay das partidas). Só biblioteca padrão do Python.

  Na nuvem (Render, Koyeb, Railway...):  python server.py        -> usa a porta da variável PORT, salas por código
  Na rede local (via jogar.py):          import server; server.serve(porta, public=False)

Cada sala tem um anfitrião (a aba de quem criou) e convidados; o servidor só encaminha mensagens.
"""
import base64, hashlib, json, os, socketserver, struct, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
HTML_PATH = os.path.join(HERE, 'frag.html')
PUBLIC = True          # True: salas por código (nuvem). False: sala única 'LOCAL' (jogar.py)
_html_cache = {'t': 0, 'body': b''}

def load_html():
    try:
        mt = os.path.getmtime(HTML_PATH)
    except OSError:
        return b'<h1>frag.html nao encontrado ao lado do server.py</h1>'
    if _html_cache['t'] != mt:
        with open(HTML_PATH, 'r', encoding='utf-8') as f:
            html = f.read()
        flag = '<head><script>window.__RELAY=%d</script>' % (2 if PUBLIC else 1)
        _html_cache['body'] = html.replace('<head>', flag, 1).encode('utf-8')
        _html_cache['t'] = mt
    return _html_cache['body']

# ------------------------------------------------------------------ salas
class Room:
    def __init__(self, code):
        self.code = code
        self.host = None
        self.guests = {}
        self.next_id = 1
        self.created = time.time()

ROOMS = {}
ROOMS_LOCK = threading.Lock()

class Conn:
    def __init__(self, sock, addr):
        self.sock = sock
        self.addr = addr
        self.wlock = threading.Lock()
        self.alive = True
        self.role = None      # 'host' | 'guest'
        self.room = None
        self.gid = 0

    def send(self, obj):
        data = json.dumps(obj, separators=(',', ':')).encode('utf-8')
        n = len(data)
        if n < 126:
            head = struct.pack('!BB', 0x81, n)
        elif n < 65536:
            head = struct.pack('!BBH', 0x81, 126, n)
        else:
            head = struct.pack('!BBQ', 0x81, 127, n)
        try:
            with self.wlock:
                self.sock.sendall(head + data)
        except Exception:
            self.alive = False

    def close(self):
        self.alive = False
        try:
            with self.wlock:
                self.sock.sendall(struct.pack('!BB', 0x88, 0))
        except Exception:
            pass
        try:
            self.sock.close()
        except Exception:
            pass

# ------------------------------------------------------------------ HTTP + WebSocket
class Handler(socketserver.BaseRequestHandler):
    def recv_exact(self, n):
        buf = b''
        while len(buf) < n:
            chunk = self.request.recv(n - len(buf))
            if not chunk:
                raise ConnectionError
            buf += chunk
        return buf

    def handle(self):
        self.request.settimeout(20)
        head = b''
        try:
            while b'\r\n\r\n' not in head:
                chunk = self.request.recv(4096)
                if not chunk:
                    return
                head += chunk
                if len(head) > 65536:
                    return
        except Exception:
            return
        try:
            req, _, _ = head.partition(b'\r\n\r\n')
            lines = req.decode('latin-1').split('\r\n')
            method, path, _ = lines[0].split(' ', 2)
            headers = {}
            for ln in lines[1:]:
                if ':' in ln:
                    k, v = ln.split(':', 1)
                    headers[k.strip().lower()] = v.strip()
        except Exception:
            return
        path = path.split('?', 1)[0]
        if path == '/ws' and 'websocket' in headers.get('upgrade', '').lower():
            self.websocket(headers)
        else:
            self.http(method, path)

    def http(self, method, path):
        if path in ('/', '/index.html', '/frag.html'):
            body = load_html()
            hdr = ('HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: %d\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n' % len(body)).encode()
            self.request.sendall(hdr + (b'' if method == 'HEAD' else body))
        elif path == '/status':
            with ROOMS_LOCK:
                body = json.dumps({'salas': len(ROOMS), 'jogadores': sum(len(r.guests) + (1 if r.host else 0) for r in ROOMS.values())}).encode()
            self.request.sendall(('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n' % len(body)).encode() + body)
        else:
            body = b'404'
            self.request.sendall(('HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: %d\r\nConnection: close\r\n\r\n' % len(body)).encode() + body)

    def websocket(self, headers):
        key = headers.get('sec-websocket-key', '')
        accept = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
        self.request.sendall(('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n' % accept).encode())
        self.request.settimeout(None)
        conn = Conn(self.request, self.client_address[0])
        try:
            while conn.alive:
                b1, b2 = struct.unpack('!BB', self.recv_exact(2))
                opcode = b1 & 0x0F
                masked = b2 & 0x80
                n = b2 & 0x7F
                if n == 126:
                    n = struct.unpack('!H', self.recv_exact(2))[0]
                elif n == 127:
                    n = struct.unpack('!Q', self.recv_exact(8))[0]
                mask = self.recv_exact(4) if masked else b''
                payload = self.recv_exact(n) if n else b''
                if masked:
                    payload = bytes(payload[i] ^ mask[i % 4] for i in range(n))
                if opcode == 0x8:
                    break
                if opcode == 0x9:
                    with conn.wlock:
                        self.request.sendall(struct.pack('!BB', 0x8A, len(payload)) + payload)
                    continue
                if opcode != 0x1:
                    continue
                try:
                    msg = json.loads(payload.decode('utf-8'))
                except Exception:
                    continue
                self.dispatch(conn, msg)
        except Exception:
            pass
        finally:
            self.leave(conn)
            conn.close()

    def dispatch(self, conn, m):
        t = m.get('t')
        if t == 'ping':
            conn.send({'t': 'pong'})
        elif t == 'host':
            code = str(m.get('code') or 'LOCAL').upper()[:8]
            if not PUBLIC:
                code = 'LOCAL'
            with ROOMS_LOCK:
                room = ROOMS.get(code)
                if room is None:
                    room = ROOMS[code] = Room(code)
                if room.host is not None and room.host.alive and room.host is not conn and PUBLIC and code != 'LOCAL':
                    conn.send({'t': 'taken'})   # código em uso por outra sala ativa
                    return
                old = room.host
                room.host = conn
                conn.role = 'host'
                conn.room = room
                guests = list(room.guests.values())
                room.guests = {}
            if old is not None and old is not conn:
                old.close()
            for g in guests:  # anfitrião recriou a sala (F5): convidados reconectam sozinhos
                g.send({'t': 'closed'})
                g.close()
            conn.send({'t': 'hosted', 'code': code})
            log('sala %s: anfitriao %s' % (code, conn.addr))
        elif t == 'join':
            code = str(m.get('code') or 'LOCAL').upper()[:8]
            if not PUBLIC:
                code = 'LOCAL'
            with ROOMS_LOCK:
                room = ROOMS.get(code)
                if room is None or room.host is None or not room.host.alive:
                    conn.send({'t': 'noroom'})
                    return
                gid = room.next_id
                room.next_id += 1
                conn.role = 'guest'
                conn.room = room
                conn.gid = gid
                room.guests[gid] = conn
                host = room.host
            conn.send({'t': 'joined', 'id': gid})
            host.send({'t': 'join', 'id': gid})
            log('sala %s: jogador %d entrou (%s)' % (code, gid, conn.addr))
        elif t == 'm' and conn.role == 'guest' and conn.room is not None:
            host = conn.room.host
            if host is not None:
                host.send({'t': 'from', 'id': conn.gid, 'm': m.get('m')})
        elif t == 'to' and conn.role == 'host' and conn.room is not None:
            g = conn.room.guests.get(m.get('id'))
            if g is not None:
                g.send({'t': 'm', 'm': m.get('m')})

    def leave(self, conn):
        room = conn.room
        if room is None:
            return
        if conn.role == 'guest':
            with ROOMS_LOCK:
                room.guests.pop(conn.gid, None)
                host = room.host
            if host is not None:
                host.send({'t': 'left', 'id': conn.gid})
            log('sala %s: jogador %d saiu' % (room.code, conn.gid))
        elif conn.role == 'host':
            with ROOMS_LOCK:
                if room.host is conn:
                    room.host = None
                    guests = list(room.guests.values())
                    room.guests = {}
                    if PUBLIC:
                        ROOMS.pop(room.code, None)
                else:
                    guests = []
            for g in guests:
                g.send({'t': 'closed'})
            log('sala %s: anfitriao saiu' % room.code)

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

def log(msg):
    try:
        print('  ' + msg, flush=True)
    except Exception:
        pass

def make_server(port, public=True):
    global PUBLIC
    PUBLIC = public
    return Server(('0.0.0.0', port), Handler)

def serve(port, public=True):
    srv = make_server(port, public)
    try:
        srv.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8000'))
    print('FRAG server na porta %d (salas por codigo)' % port, flush=True)
    serve(port, public=True)
