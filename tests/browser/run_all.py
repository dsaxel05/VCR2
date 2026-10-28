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
import http.server, os, pathlib, re, socket, subprocess, sys, tempfile, threading, functools, time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SUITES = ['logo_test.py', 'dash_test.py', 'autosave_test.py', 'sim_refresh_test.py', 'clarity_test.py', 'ai_rule_test.py', 'studio_test.py', 'owner_test.py', 'privacy_test.py', 'security2_test.py', 'xss_sweep_test.py', 'csp_test.py', 'live_check_test.py', 'motion_test.py', 'demo_video_test.py', 'studio2_test.py', 'sim_worker_test.py', 'v43_test.py', 'v42_test.py', 'xl_test.py', 'test_all.py', 'edge.py', 'comfort_test.py', 'a11y_test.py', 'sidebar_test.py']


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


SUITE_LIMIT = int(os.environ.get('VCR2_SUITE_LIMIT', '300'))   # seconds; the slowest suite takes about 60
LOG = pathlib.Path(tempfile.gettempdir()) / 'vcr2-run_all.log'


def run_suite(name, env):
    """Run one suite with its output in a file, not a pipe: a browser process left behind by a stuck suite could otherwise hold
    a pipe open and keep this runner waiting for ever. A suite over the limit is killed with every process it started and
    reported as a failure. Returns (exit code or None when it timed out, output)."""
    with open(LOG, 'a', encoding='utf-8') as lg: lg.write(f'{time.strftime("%H:%M:%S")} start {name}\n')
    with tempfile.TemporaryFile(mode='w+', encoding='utf-8', errors='replace') as f:
        kw = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt' else {'start_new_session': True}
        pr = subprocess.Popen([sys.executable, str(HERE / name)], cwd=str(HERE), env=env, stdout=f, stderr=subprocess.STDOUT, **kw)
        try:
            code = pr.wait(timeout=SUITE_LIMIT)
        except subprocess.TimeoutExpired:
            if os.name == 'nt':
                subprocess.run(['taskkill', '/F', '/T', '/PID', str(pr.pid)], capture_output=True)
            else:
                import signal
                try: os.killpg(pr.pid, signal.SIGKILL)
                except Exception: pr.kill()
            pr.wait(); code = None
        f.seek(0); out = f.read()
    with open(LOG, 'a', encoding='utf-8') as lg: lg.write(f'{time.strftime("%H:%M:%S")} end   {name} code={code}\n')
    return code, out


def main():
    wanted = [a if a.endswith('.py') else a + '.py' for a in sys.argv[1:]] or SUITES
    httpd, port = serve()
    env = dict(os.environ, VCR2_BASE=f'http://127.0.0.1:{port}/index.html', PYTHONUTF8='1', PYTHONIOENCODING='utf-8')
    failed, total_pass, total = [], 0, 0
    for name in wanted:
        t0 = time.time()
        code, out = run_suite(name, env)
        m = re.findall(r'^(\d+)/(\d+) passed\s*$', out, re.M)
        if code is None:
            ok, summary = False, f'TIMED OUT after {SUITE_LIMIT} s'
            out += f'\nFAIL {name} was stopped after {SUITE_LIMIT} s (it and its browsers were killed)'
        elif m:
            p, n = map(int, m[-1]); total_pass += p; total += n
            ok = code == 0 and p == n
            summary = f'{p}/{n} passed'
        else:
            ok = code == 0 and 'no console errors' in out
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
