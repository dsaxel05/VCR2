#!/usr/bin/env python3
"""Screenshot tour + runtime health check for VCR2 (Playwright for Python).

Serves the repository root on a free local port, opens each state listed in a tour file, and
saves full-page screenshots at every width and colour scheme requested. While it runs it records:
  - JavaScript errors (pageerror) and console errors,
  - every request to a host other than the local server (the privacy promise: should be none,
    except the GitHub API inside the Studio, which the tour mocks),
  - failed local requests (missing files).
External requests are blocked by default (and still reported), so the tour works offline.

Setup (once):  pip install playwright   then   python -m playwright install chromium
Usage:
  python tools/shots.py --out shots/baseline
  python tools/shots.py --tour tools/tour.json --widths 1440,768,390 --schemes light,dark
  python tools/shots.py --only northwind-overview,studio-start --out /tmp/shots
  python tools/shots.py --setup-js "document.documentElement.dataset.direction='ember'" --out shots/ember

Exit code 1 when a page error, console error, failed local request or unexpected external
request is seen (use --lenient to only report).

The tour file is JSON: a list of states. Each state has a "name" and either:
  "js":   JavaScript run in the page after load (use the app's own functions), or
  "hash": a URL hash to open (e.g. "#studio"),
plus optional "studio": true (sign in to the Studio with a fake token against a mocked GitHub
API first), "wait": milliseconds to wait (default 350), "selector": wait for this selector,
"clip": CSS selector of one element to capture instead of the full page.
When the app's functions or selectors change, update tour.json — not this script.
"""
import argparse, base64, contextlib, functools, http.server, json, os, pathlib, re, socket, sys, threading

HERE = pathlib.Path(__file__).resolve().parent
FAKE_TOKEN = 'github_pat_' + 'A' * 60   # never a real token
OWNER, REPO = 'dsaxel05', 'VCR2'


def find_root(start):
    p = pathlib.Path(start).resolve()
    for q in [p, *p.parents]:
        if (q / 'build.py').exists() and (q / 'index.html').exists():
            return q
    sys.exit('Could not find the repo root (a folder with build.py and index.html). Run from inside the repo or pass --root.')


def free_port():
    with contextlib.closing(socket.socket()) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a, **k):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def serve(root, port):
    handler = functools.partial(QuietHandler, directory=str(root))
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def make_github_mock(state):
    async def gh_route(route):
        req = route.request
        url, method = req.url, req.method
        if not req.headers.get('authorization', '').endswith(FAKE_TOKEN):
            return await route.fulfill(status=401, json={'message': 'Bad credentials'})
        if url.endswith('/user'):
            return await route.fulfill(status=200, json={'login': OWNER})
        if re.search(rf'/repos/{OWNER}/{REPO}$', url):
            return await route.fulfill(status=200, json={'full_name': f'{OWNER}/{REPO}', 'permissions': {'push': True, 'pull': True}})
        if '/contents/' in url and method == 'GET':
            if state.get('sha'):
                return await route.fulfill(status=200, json={'sha': state['sha']})
            return await route.fulfill(status=404, json={'message': 'Not Found'})
        if '/contents/' in url and method == 'PUT':
            body = json.loads(req.post_data or '{}')
            state['published'] = base64.b64decode(body.get('content', '')).decode('utf-8', 'replace')
            state['sha'] = 'sha-mock'
            return await route.fulfill(status=201, json={'content': {'sha': state['sha']}})
        return await route.fulfill(status=404, json={})
    return gh_route


async def shoot_state(page, st, base, out, tag, args, report):
    """Open one tour state in a fresh page load and capture it."""
    name = st['name']
    url = base + st.get('hash', '')
    await page.goto('about:blank')          # force a real reload, even when only the hash differs
    await page.goto(url)
    await page.wait_for_load_state('networkidle')
    await page.add_style_tag(content='.toast,#toast,.toasts{display:none!important}')
    if args.setup_js:                       # e.g. pick a design direction before every state
        await page.evaluate('() => { ' + args.setup_js + ' }')
    if st.get('studio'):
        tok = st.get('token_input', '#gh-token')
        btn = st.get('signin_button', '#gh-signin')
        ready = st.get('studio_ready', '#studio-pane')
        if '#studio' not in url:
            await page.goto(base + '#studio')
        await page.wait_for_selector(f'{tok}, {ready}', timeout=15000)
        if await page.is_visible(tok):     # not signed in yet in this browser context
            await page.fill(tok, FAKE_TOKEN)
            await page.click(btn)
            await page.wait_for_selector(ready, timeout=15000)
    if st.get('js'):
        await page.evaluate('() => { ' + st['js'] + ' }')
    if st.get('selector'):
        await page.wait_for_selector(st['selector'], timeout=15000)
    await page.wait_for_timeout(int(st.get('wait', 350)))
    path = out / f'{name}--{tag}.png'
    if st.get('clip'):
        el = await page.query_selector(st['clip'])
        if not el:
            raise RuntimeError(f"clip selector not found: {st['clip']}")
        await el.screenshot(path=str(path))
    else:
        await page.screenshot(path=str(path), full_page=not args.viewport_only)
    report['states'].append(str(path))


async def run(args):
    from playwright.async_api import async_playwright
    root = pathlib.Path(args.root).resolve() if args.root else find_root(os.getcwd())
    tour = json.loads(pathlib.Path(args.tour).read_text(encoding='utf-8'))
    if args.only:
        keep = set(args.only.split(','))
        tour = [s for s in tour if s['name'] in keep]
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    port = free_port()
    httpd = serve(root, port)
    base = f'http://127.0.0.1:{port}/index.html'
    widths = [int(w) for w in args.widths.split(',')]
    schemes = args.schemes.split(',')
    report = {'base': base, 'states': [], 'external_requests': [], 'errors': [], 'failed_local': []}
    gh_state = {}

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for scheme in schemes:
            for width in widths:
                height = 900 if width >= 768 else 844
                ctx = await browser.new_context(viewport={'width': width, 'height': height},
                                                color_scheme=scheme, device_scale_factor=args.scale)
                page = await ctx.new_page()
                tag = f'{scheme}-{width}'
                page.on('pageerror', lambda e, t=tag: report['errors'].append(f'[{t}] pageerror: {e}'))
                # Resource failures are reported through the request/response hooks below, so they are
                # not double-counted here (blocked external requests also log "Failed to load resource").
                page.on('console', lambda m, t=tag: m.type == 'error' and not m.text.startswith('Failed to load resource')
                        and report['errors'].append(f'[{t}] console: {m.text}'))
                page.on('response', lambda r, t=tag: r.url.startswith('http://127.0.0.1') and r.status >= 400
                        and '/radar-config.json' not in r.url
                        and report['failed_local'].append(f'[{t}] HTTP {r.status} {r.url}'))
                page.on('dialog', lambda d: __import__('asyncio').ensure_future(d.dismiss()))

                async def on_route(route, t=tag):
                    url = route.request.url
                    host = re.sub(r'^https?://([^/]+).*$', r'\1', url)
                    if host.startswith('127.0.0.1') or host.startswith('localhost') or url.startswith('data:') or url.startswith('blob:'):
                        return await route.continue_()
                    if host == 'api.github.com':
                        return await make_github_mock(gh_state)(route)
                    report['external_requests'].append(f'[{t}] {route.request.method} {url}')
                    if args.allow_external:
                        return await route.continue_()
                    return await route.abort()
                await page.route('**/*', on_route)
                page.on('requestfailed', lambda r, t=tag: ('127.0.0.1' in r.url) and report['failed_local'].append(f'[{t}] {r.url} {r.failure}'))

                for st in tour:
                    name = st['name']
                    try:
                        await shoot_state(page, st, base, out, tag, args, report)
                    except Exception as e:
                        report['errors'].append(f'[{tag}] state {name}: {type(e).__name__}: {str(e).splitlines()[0]}')
                await ctx.close()
        await browser.close()
    httpd.shutdown()

    (out / 'report.json').write_text(json.dumps(report, indent=1), encoding='utf-8')
    print(f"Saved {len(report['states'])} screenshots to {out}")
    ext = sorted(set(re.sub(r'^\[[^\]]+\] ', '', x) for x in report['external_requests']))
    allowed = {h.strip() for h in args.allow_host.split(',') if h.strip()}
    host_of = lambda line: re.sub(r'^\S+ https?://([^/]+).*$', r'\1', line)
    tolerated = [x for x in ext if host_of(x) in allowed]
    ext = [x for x in ext if host_of(x) not in allowed]
    print(f"External requests: {len(ext)}" + ('' if not ext else ' (blocked unless --allow-external)'))
    for x in ext[:20]:
        print('  ', x)
    if tolerated:
        print(f"Tolerated by --allow-host (temporary exception, fix before release): {len(tolerated)}")
        for x in tolerated[:10]:
            print('  ', x)
    print(f"Errors: {len(report['errors'])}")
    for x in report['errors'][:20]:
        print('  ', x)
    if report['failed_local']:
        print(f"Failed local requests: {len(report['failed_local'])}")
        for x in report['failed_local'][:10]:
            print('  ', x)
    bad = bool(report['errors'] or report['failed_local'] or ext)
    return 1 if (bad and not args.lenient) else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--root', help='repo root (default: found from the current folder)')
    ap.add_argument('--tour', default=str(HERE / 'tour.json'))
    ap.add_argument('--out', default='shots/latest')
    ap.add_argument('--widths', default='1440,390')
    ap.add_argument('--schemes', default='light,dark', help='prefers-color-scheme values to emulate')
    ap.add_argument('--scale', type=float, default=1.0, help='device scale factor (2 for crisp README images)')
    ap.add_argument('--only', help='comma-separated state names')
    ap.add_argument('--setup-js', default='', help="JavaScript run after each page load, before the state (e.g. \"document.documentElement.dataset.direction='ember'\")")
    ap.add_argument('--viewport-only', action='store_true', help='capture the viewport instead of the full page')
    ap.add_argument('--allow-external', action='store_true', help='let external requests through (still reported)')
    ap.add_argument('--allow-host', default='', help='comma-separated hosts reported but not counted as failures '
                    '(temporary, documented exceptions only, e.g. fonts.googleapis.com,fonts.gstatic.com)')
    ap.add_argument('--lenient', action='store_true', help='report problems but exit 0')
    args = ap.parse_args()
    try:
        import playwright  # noqa: F401
    except ImportError:
        sys.exit('Playwright is not installed: pip install playwright && python -m playwright install chromium')
    import asyncio
    sys.exit(asyncio.run(run(args)))


if __name__ == '__main__':
    main()
