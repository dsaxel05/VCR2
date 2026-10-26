#!/usr/bin/env python3
"""Run every browser suite in this folder against a local server and report one total.

    python tests/browser/run_all.py            # all suites
    python tests/browser/run_all.py studio_test # only the suites named

Serves the repository root on a free local port (Python standard library), points the suites at
it through VCR2_BASE, runs each suite, and reads its result: suites that print "N/M passed" must
have N == M; smoke suites must print "no console errors". Exit code 1 if anything fails.
Needs: pip install playwright pillow; python -m playwright install chromium.
The GitHub API is mocked inside the suites with a fake token. No real token is ever used.
"""
import http.server, os, pathlib, re, socket, subprocess, sys, threading, functools, time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SUITES = ['logo_test.py', 'dash_test.py', 'autosave_test.py', 'sim_refresh_test.py', 'clarity_test.py', 'ai_rule_test.py', 'studio_test.py', 'owner_test.py', 'privacy_test.py', 'security2_test.py', 'studio2_test.py', 'sim_worker_test.py', 'v43_test.py', 'v42_test.py', 'xl_test.py', 'test_all.py', 'edge.py', 'comfort_test.py', 'a11y_test.py', 'sidebar_test.py']


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


def main():
    wanted = [a if a.endswith('.py') else a + '.py' for a in sys.argv[1:]] or SUITES
    httpd, port = serve()
    env = dict(os.environ, VCR2_BASE=f'http://127.0.0.1:{port}/index.html', PYTHONUTF8='1', PYTHONIOENCODING='utf-8')
    failed, total_pass, total = [], 0, 0
    for name in wanted:
        t0 = time.time()
        r = subprocess.run([sys.executable, str(HERE / name)], cwd=str(HERE), env=env, capture_output=True, text=True,
                           encoding='utf-8', errors='replace', timeout=900)
        out = (r.stdout or '') + (r.stderr or '')
        m = re.findall(r'^(\d+)/(\d+) passed\s*$', out, re.M)
        if m:
            p, n = map(int, m[-1]); total_pass += p; total += n
            ok = r.returncode == 0 and p == n
            summary = f'{p}/{n} passed'
        else:
            ok = r.returncode == 0 and 'no console errors' in out
            summary = 'smoke ' + ('clean' if ok else 'FAILED')
        print(f"{'PASS' if ok else 'FAIL'}  {name:<16} {summary:<16} {time.time() - t0:5.1f}s")
        if not ok:
            failed.append(name)
            bad = [l for l in out.splitlines() if l.startswith('FAIL') or 'Error' in l or 'Traceback' in l]
            print('      ' + '\n      '.join((bad or out.splitlines())[-15:]))
    httpd.shutdown()
    print(f'\nBrowser suites: {len(wanted) - len(failed)}/{len(wanted)} passed; checks {total_pass}/{total}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
