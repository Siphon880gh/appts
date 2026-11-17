"""Shared helpers: start/stop php -S on a free port and talk to api.php with a cookie jar."""
import base64, http.cookiejar, json, os, pathlib, re, signal, socket, subprocess, time, urllib.error, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
AVOID = {8099, 8416, 8500, 8505, 8518, 8554}

def demo_password():
    # The demo-only password is public in the sign-in UI; read it, never print it.
    return re.search(r"DEMO_PASSWORD='([^']+)'", (ROOT / 'js/demoAccount.js').read_text()).group(1)

def free_port(start=8630):
    for port in range(start, start + 200):
        if port in AVOID: continue
        with socket.socket() as s:
            if s.connect_ex(('127.0.0.1', port)) != 0: return port
    raise RuntimeError('no free port')

class Server:
    def __init__(self, storage_dir, port=None):
        self.storage_dir, self.port = str(storage_dir), port or free_port()
        self.proc = None
    def start(self):
        env = dict(os.environ, APPTS_STORAGE_DIR=self.storage_dir, PHP_CLI_SERVER_WORKERS='4')
        self.proc = subprocess.Popen(['php', '-d', 'upload_max_filesize=20M', '-d', 'post_max_size=24M', '-S', f'127.0.0.1:{self.port}', '-t', str(ROOT)], cwd=ROOT, env=env,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        for _ in range(100):
            try:
                urllib.request.urlopen(self.url('api.php?action=session'), timeout=1); return self
            except Exception: time.sleep(0.1)
        raise RuntimeError('php -S did not start')
    def stop(self):
        if self.proc and self.proc.poll() is None:
            os.killpg(self.proc.pid, signal.SIGTERM); self.proc.wait(5)
    def url(self, path): return f'http://127.0.0.1:{self.port}/{path}'

class Client:
    def __init__(self, server):
        self.server = server
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def raw(self, path, method='GET', data=None, headers=None):
        req = urllib.request.Request(self.server.url(path), data=data, method=method, headers=headers or {})
        try:
            with self.opener.open(req, timeout=20) as r: return r.status, r.read(), dict(r.headers)
        except urllib.error.HTTPError as e: return e.code, e.read(), dict(e.headers)
    def api(self, action, body=None, method=None, header=True):
        method = method or ('POST' if body is not None else 'GET')
        headers = {'Content-Type': 'application/json'}
        if header: headers['X-Appts'] = '1'
        status, raw, _ = self.raw(f'api.php?action={action}', method, json.dumps(body).encode() if body is not None else None, headers)
        return status, json.loads(raw or b'{}')
    def login(self, username, password):
        return self.api('login', {'username': username, 'password': password})
    def upload(self, data, filename='x.png', mime='image/png', field='file'):
        b = 'ApptsBoundary'
        body = (f'--{b}\r\nContent-Disposition: form-data; name="{field}"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n').encode() + data + f'\r\n--{b}--\r\n'.encode()
        status, raw, _ = self.raw('api.php?action=upload', 'POST', body, {'Content-Type': f'multipart/form-data; boundary={b}', 'X-Appts': '1'})
        return status, json.loads(raw)

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZioAAAAASUVORK5CYII=')
