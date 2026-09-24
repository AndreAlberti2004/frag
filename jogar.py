#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FRAG - servidor de um clique.
Sobe o jogo (frag.html) na rede local, faz o relay entre os jogadores e abre o navegador
já com o link que você manda para a galera. Só precisa do Python (sem instalar nada).

    python jogar.py             -> sobe na rede local e abre o navegador
    python jogar.py --tunel     -> cria um link público (funciona fora do escritório / Wi-Fi bloqueado)
    python jogar.py --ip 192.168.0.10   -> força o IP do link
    python jogar.py --porta 9000
    python jogar.py --sem-navegador

Se o link da rede local dá timeout para os outros: 1) o script tenta abrir o firewall do Windows sozinho
(pede permissão de administrador uma vez); 2) confira se o IP impresso é o da rede do escritório (o script
lista todos); 3) se a rede isola os computadores (comum em Wi-Fi corporativo), use --tunel.
"""
import argparse, os, platform, re, socket, subprocess, sys, threading, time, webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
HTML_PATH = os.path.join(HERE, 'frag.html')

# ------------------------------------------------------------------ util
def all_ips():
    """Todos os IPv4 da máquina, do mais provável (rede do escritório) ao menos provável."""
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.append(info[4][0])
    except Exception:
        pass
    if platform.system() == 'Windows':
        try:  # ipconfig pega adaptadores que o gethostname às vezes esconde
            out = subprocess.run(['ipconfig'], capture_output=True, text=True, timeout=5).stdout
            ips += re.findall(r'IPv4[^:]*:\s*([0-9.]+)', out)
        except Exception:
            pass
    seen, uniq = set(), []
    for ip in ips:
        if ip in seen or ip.startswith('127.') or ip.startswith('169.254.'):
            continue
        seen.add(ip); uniq.append(ip)
    def score(ip):
        a, b = ip.split('.')[0], ip.split('.')[1]
        if a == '192' and b == '168': return 0
        if a == '10': return 1
        if a == '172' and 16 <= int(b) <= 31: return 2
        return 3
    uniq.sort(key=score)
    return uniq or ['127.0.0.1']

def open_firewall(port):
    """Windows: cria uma regra de entrada para a porta em todos os perfis (privado E público).
    O prompt padrão do Windows só libera rede privada; escritório costuma ser 'pública'."""
    if platform.system() != 'Windows':
        return 'n/a'
    name = 'FRAG %d' % port
    try:
        chk = subprocess.run(['netsh', 'advfirewall', 'firewall', 'show', 'rule', 'name=' + name], capture_output=True, text=True, timeout=8)
        if chk.returncode == 0 and name in chk.stdout:
            return 'ok'
    except Exception:
        pass
    args = 'advfirewall firewall add rule name="%s" dir=in action=allow protocol=TCP localport=%d profile=any' % (name, port)
    try:
        import ctypes
        if ctypes.windll.shell32.IsUserAnAdmin():
            r = subprocess.run('netsh ' + args, shell=True, capture_output=True, text=True, timeout=10)
            return 'ok' if r.returncode == 0 else 'falhou'
        # pede elevação só para o netsh (aparece o UAC uma vez)
        rc = ctypes.windll.shell32.ShellExecuteW(None, 'runas', 'netsh', args, None, 0)
        return 'ok' if rc > 32 else 'negado'
    except Exception:
        return 'falhou'

def start_tunnel(port):
    """Túnel público via cloudflared (sem conta). Baixa o binário na primeira vez."""
    sysname, mach = platform.system(), platform.machine().lower()
    exe = None
    for cand in ['cloudflared', os.path.join(HERE, 'cloudflared.exe'), os.path.join(HERE, 'cloudflared')]:
        try:
            subprocess.run([cand, '--version'], capture_output=True, timeout=8)
            exe = cand; break
        except Exception:
            continue
    if exe is None:
        if sysname == 'Windows':
            url, dest = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe', os.path.join(HERE, 'cloudflared.exe')
        elif sysname == 'Darwin':
            url, dest = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz', None
        else:
            url, dest = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-' + ('arm64' if 'arm' in mach or 'aarch' in mach else 'amd64'), os.path.join(HERE, 'cloudflared')
        if dest is None:
            print('  No macOS instale com: brew install cloudflared'); return None
        print('  Baixando o cloudflared (uma vez, ~60 MB)...', flush=True)
        try:
            import urllib.request
            urllib.request.urlretrieve(url, dest)
            if sysname != 'Windows':
                os.chmod(dest, 0o755)
            exe = dest
        except Exception as e:
            print('  Nao consegui baixar o cloudflared (%s). Baixe manualmente de github.com/cloudflare/cloudflared e deixe na pasta do jogo.' % e)
            return None
    proc = subprocess.Popen([exe, 'tunnel', '--url', 'http://127.0.0.1:%d' % port, '--no-autoupdate'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    url = None
    deadline = time.time() + 40
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            break
        m = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', line)
        if m:
            url = m.group(0); break
    if not url:
        print('  O tunel nao respondeu (rede bloqueando?).'); proc.terminate(); return None
    threading.Thread(target=lambda: [None for _ in iter(proc.stdout.readline, '')], daemon=True).start()
    return url

import server as relay

def log(msg):
    try:
        print('  ' + msg, flush=True)
    except Exception:
        pass

# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description='Sobe o FRAG na rede local.')
    ap.add_argument('--porta', type=int, default=8000)
    ap.add_argument('--sem-navegador', action='store_true')
    ap.add_argument('--tunel', action='store_true', help='cria um link publico via cloudflared')
    ap.add_argument('--ip', default=None, help='forca o IP usado no link da rede local')
    args = ap.parse_args()
    if not os.path.exists(HTML_PATH):
        print('Nao achei o frag.html na mesma pasta do jogar.py:', HTML_PATH)
        sys.exit(1)
    if not os.path.exists(os.path.join(HERE, 'server.py')):
        print('Falta o server.py na mesma pasta do jogar.py.')
        sys.exit(1)
    srv = None
    port = args.porta
    for p in range(args.porta, args.porta + 20):
        try:
            srv = relay.make_server(p, public=False)
            port = p
            break
        except OSError:
            continue
    if srv is None:
        print('Nenhuma porta livre a partir de', args.porta)
        sys.exit(1)
    ips = all_ips()
    ip = args.ip or ips[0]
    fw = open_firewall(port)
    bar = '=' * 66
    print(bar)
    print('  FRAG no ar.')
    print()
    link = None
    if args.tunel:
        print('  Abrindo tunel publico...', flush=True)
        link = start_tunnel(port)
        if link:
            print('  LINK PUBLICO (funciona de qualquer lugar):   %s' % link)
    if not link:
        link = 'http://%s:%d/' % (ip, port)
        print('  LINK PARA MANDAR PARA A GALERA (mesma rede):   %s' % link)
        if len(ips) > 1:
            print('  Outros IPs desta maquina: %s   (se o link nao abrir, tente com --ip)' % ', '.join(ips[1:]))
        if fw == 'ok':
            print('  Firewall do Windows: porta %d liberada (privado e publico).' % port)
        elif fw in ('negado', 'falhou'):
            print('  Firewall: nao consegui liberar a porta sozinho. Rode este script como administrador uma vez,')
            print('  ou no PowerShell (admin): netsh advfirewall firewall add rule name="FRAG" dir=in action=allow protocol=TCP localport=%d' % port)
        print('  Se mesmo assim der timeout, a rede isola os PCs: rode  python jogar.py --tunel')
    print()
    print('  Sua aba (anfitriao) abre sozinha. Deixe esta janela e a aba abertas. Ctrl+C encerra.')
    print(bar, flush=True)
    if not args.sem_navegador:
        threading.Timer(0.6, lambda: webbrowser.open(link + '?host=1')).start()
    try:
        srv.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print('\n  Encerrado.')
    finally:
        srv.server_close()

if __name__ == '__main__':
    main()
