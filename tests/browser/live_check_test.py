"""tools/live_check.py, offline: a local copy of the site stands in for the live one.

The check passes when every file is served as the repository holds it, and fails when the page, the configuration or a
logo is changed, or a file is missing. No outside address is contacted.
"""
import os, sys, shutil, subprocess, tempfile, threading, pathlib, functools, http.server, socketserver
ROOT = pathlib.Path(__file__).resolve().parents[2]
TOOL = ROOT / 'tools' / 'live_check.py'
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[-600:]}'))

def copy_site(dst):
    for f in ['index.html', 'site.json', 'radar-config.json']:
        if (ROOT / f).exists(): shutil.copyfile(ROOT / f, dst / f)
    for d in ['assets/logo/svg', 'assets/logo/png', 'assets/fonts', 'assets/video']:
        shutil.copytree(ROOT / d, dst / d)
    shutil.copyfile(ROOT / 'assets' / 'social-preview.png', dst / 'assets' / 'social-preview.png')

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def main():
    with tempfile.TemporaryDirectory() as repo, tempfile.TemporaryDirectory() as served:
        repo, served = pathlib.Path(repo), pathlib.Path(served)
        copy_site(repo); copy_site(served)
        httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(served)))
        port = httpd.server_address[1]
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        def run():
            r = subprocess.run([sys.executable, str(TOOL), '--root', str(repo), '--url', f'http://127.0.0.1:{port}/', '--allow-http', '--once', '--no-http'],
                               capture_output=True, text=True, timeout=120)
            return r.returncode, r.stdout + r.stderr
        code, out = run()
        check('the same files: the check passes', code == 0 and 'OK: every file' in out, out)
        check('it compares the page, the configuration, the logos, the favicon, the preview picture and the fonts', int(out.split('(')[1].split(' ')[0]) >= 15, out[:200])
        (served / 'index.html').write_bytes((served / 'index.html').read_bytes().replace(b'</body>', b'<script>steal()</script></body>'))
        code, out = run()
        check('a changed page: the check fails and names index.html', code == 1 and 'index.html: served' in out, out)
        shutil.copyfile(repo / 'index.html', served / 'index.html')
        if (served / 'radar-config.json').exists():
            (served / 'radar-config.json').write_text('{"version":1,"settings":{"blockAfter":99}}', encoding='utf-8')
            code, out = run()
            check('a changed configuration: the check fails', code == 1 and 'radar-config.json' in out, out)
            shutil.copyfile(repo / 'radar-config.json', served / 'radar-config.json')
        (served / 'assets' / 'logo' / 'svg' / 'seal-compact.svg').unlink()
        code, out = run()
        check('a missing logo: the check fails with HTTP 404', code == 1 and 'seal-compact.svg: HTTP 404' in out, out)
        r = subprocess.run([sys.executable, str(TOOL), '--root', str(repo), '--url', 'http://example.invalid/', '--once'], capture_output=True, text=True, timeout=60)
        check('a plain http:// address is refused unless a test asks for it', r.returncode == 1 and 'https://' in r.stdout, r.stdout)
        httpd.shutdown()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')
    sys.exit(1 if bad else 0)

main()
