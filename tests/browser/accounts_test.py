"""Accounts (Part B) in a real browser.
1. The published page (index.html, no backend listed): no Sign in button, zero network requests, no account storage.
2. A TEST build pointed at the LOCAL Supabase stack, served at http://127.0.0.1:8765: keyboard opens the dialog, GitHub goes
   through the local sign-in server with PKCE (github.com itself is blocked, never reached), a real email-and-password sign-up is
   confirmed through the local inbox and signs in, every request stays on 127.0.0.1, no console error (CSP and Trusted Types on).
   python tests/browser/accounts_test.py     (part 2 needs: node tools/accounts_stack.mjs start)"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, pathlib, re, subprocess, tempfile, threading, urllib.request, urllib.parse, uuid, secrets, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))

def stack():
    js = "import('./tools/accounts_stack.mjs').then(m => process.stdout.write(JSON.stringify(m.stackEnv())))"
    try: out = subprocess.run(['node', '-e', js], cwd=ROOT, capture_output=True, text=True, timeout=120).stdout
    except Exception: return None
    try: return json.loads(out.strip().splitlines()[-1])
    except Exception: return None

def mail_link(env, to):
    import time
    for _ in range(40):
        q = urllib.parse.quote(f'to:"{to}"')
        r = json.loads(urllib.request.urlopen(f"{env['inbucket']}/api/v1/search?query={q}").read())
        if r.get('messages'):
            m = json.loads(urllib.request.urlopen(f"{env['inbucket']}/api/v1/message/{r['messages'][0]['ID']}").read())
            hit = re.search(r'https?://[^\s)\]]+/auth/v1/verify\?[^\s)\]]+', m.get('Text', ''))
            return hit and hit.group(0)
        time.sleep(0.25)

async def guest(b):
    ctx = await b.new_context(); pg = await ctx.new_page(); net, errs = [], []
    pg.on('request', lambda r: net.append(r.url) if r.url.startswith(('http:', 'https:')) else None)
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_FILE_NOT_FOUND' not in m.text else None)
    await pg.goto((ROOT / 'index.html').as_uri()); await pg.wait_for_selector('#api-key', state='attached'); await pg.wait_for_timeout(500)
    await pg.evaluate("() => { showPage('intake'); renderIntakeStatus(); }"); await pg.wait_for_timeout(300)
    check('published page: no Sign in button (no backend in the build)', await pg.evaluate("() => document.getElementById('sb-acct').hidden") is True)
    check('published page: zero network requests for a guest', not net, net[:3])
    check('published page: no account storage written', await pg.evaluate("() => Object.keys(localStorage).concat(Object.keys(sessionStorage)).filter(k => k.startsWith('vcr2-acct')).length") == 0)
    check('published page: the connect-src policy lists no account host', await pg.evaluate("() => !/supabase|127\\.0\\.0\\.1/.test(document.querySelector('meta[http-equiv=Content-Security-Policy]').content)"))
    check('published page: no console error', not errs, errs[:3])
    await ctx.close()

ENABLE = "() => { CFG.settings.accounts = { providers:{ google:{ enabled:true }, github:{ enabled:true }, email_link:{ enabled:true }, email_password:{ enabled:true } } }; acctRenderButton(); }"

async def live(b, env, port):
    site = f'http://127.0.0.1:{port}/'
    ctx = await b.new_context(); pg = await ctx.new_page(); hosts, errs, gh, blocked = set(), [], [], []
    pg.on('requestfinished', lambda r: hosts.add(urllib.parse.urlsplit(r.url).netloc) if r.url.startswith(('http:', 'https:')) else None)
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    # Safety net: nothing may leave this computer. Any other host is aborted before the request is sent.
    async def offsite(route): blocked.append(route.request.url); await route.abort()
    await ctx.route(lambda url: url.startswith(('http:', 'https:')) and not url.startswith('http://127.0.0.1:'), offsite)
    # The sign-in server's answer to /authorize is read here WITHOUT following it, so the provider is never contacted.
    async def authz(route):
        r = await route.fetch(max_redirects=0)
        gh.append({'status': r.status, 'location': r.headers.get('location', '')})
        await route.fulfill(status=200, content_type='text/html', body='<p>Stopped before the provider (test).</p>')
    await ctx.route(re.compile(r'^http://127\.0\.0\.1:\d+/auth/v1/authorize\?.*'), authz)
    await pg.goto(site); await pg.wait_for_selector('#api-key', state='attached'); await pg.wait_for_timeout(400)
    check('test build: before any click, no request to the accounts backend', not any(h.endswith(':54321') for h in hosts), hosts)
    await pg.evaluate(ENABLE)
    check('test build: the Sign in button shows once a backend and a provider are set', await pg.evaluate("() => !document.getElementById('sb-acct').hidden"))
    await pg.focus('#sb-acct-btn'); await pg.keyboard.press('Enter')
    check('keyboard: Enter on Sign in opens the dialog', await pg.locator('.modal[role=dialog]').count() == 1)
    labels = [t.strip() for t in await pg.locator('.acct-prov').all_text_contents()]
    check('dialog: Google first, more options below (GitHub)', labels[:1] == ['Google'] and 'GitHub' in labels, labels)
    check('dialog: one plain sentence says what is and is not saved', 'Never your uploaded documents' in (await pg.locator('.acct-note').text_content() or ''))
    await pg.keyboard.press('Escape')
    check('keyboard: Escape closes the dialog', await pg.locator('.modal[role=dialog]').count() == 0)
    # GitHub: through the local sign-in server, PKCE accepted, then github.com (blocked here)
    await pg.click('#sb-acct-btn'); await pg.click('details.acct-more summary'); await pg.click('.acct-prov[data-a=github]')
    for _ in range(40):
        if gh: break
        await pg.wait_for_timeout(100)
    u = urllib.parse.urlsplit(gh[0]['location']) if gh else None; q = urllib.parse.parse_qs(u.query) if u else {}
    check('GitHub button: the local sign-in server accepted PKCE and answered with a redirect to GitHub carrying its own state (not followed)',
          bool(u) and gh[0]['status'] == 302 and u.netloc == 'github.com' and q.get('client_id') == ['vcr2-local-test-client'] and len((q.get('state') or [''])[0]) > 20, gh[:1])
    # email and password: real sign-up, confirmation through the local inbox, back to the page
    await pg.goto(site); await pg.wait_for_selector('#api-key', state='attached'); await pg.evaluate(ENABLE)
    email, pw = f'ui-{uuid.uuid4().hex[:8]}@example.test', 'Aa1' + secrets.token_urlsafe(18)
    await pg.click('#sb-acct-btn'); await pg.click('details.acct-more summary')
    await pg.fill('#acct-email', email); await pg.fill('#acct-pass', pw); await pg.click('button[data-click=acctSignUpGo]')
    await pg.wait_for_timeout(800)
    link = mail_link(env, email)
    check('sign up: a confirmation email arrives in the local inbox', bool(link))
    if link:
        await pg.goto(link); await pg.wait_for_selector('#api-key', state='attached')
        for _ in range(50):
            if await pg.evaluate("() => !!acctSession()"): break
            await pg.wait_for_timeout(100)
        check('confirmation link: back on VCR2 and signed in', await pg.evaluate("() => (acctSession() || {user:{}}).user.email") == email)
        await pg.wait_for_selector('.modal[aria-label="Before your first save"]', timeout=10000)
        await pg.click('.modal-f button:has-text("Accept and continue")'); await pg.wait_for_timeout(200)
        check('first sign-in: the terms must be ticked before anything is saved', await pg.locator('.modal[aria-label="Before your first save"]').count() == 1)
        await pg.check('#acct-terms'); await pg.click('.modal-f button:has-text("Accept and continue")'); await pg.wait_for_timeout(400)
        check('terms accepted: the dialog closes', await pg.locator('.modal[aria-label="Before your first save"]').count() == 0)
        await pg.evaluate(ENABLE)
        check('signed in: the sidebar button shows the email', (await pg.inner_text('#sb-acct-btn')).strip() == email)
        check('signed in: the code is wiped from the address bar', not re.search(r'[?&](code|acct)=', pg.url), pg.url)
        # B3: autosave to the account, My analyses, search, escaping, versions, delete with undo
        await pg.evaluate("() => { acctDelay = 150; S.name = 'Browser Co <img src=x onerror=window.__xss=1>'; saveDraft(); }")
        for _ in range(50):
            if (await pg.inner_text('#tb-saved')).startswith('Saved to your account'): break
            await pg.wait_for_timeout(100)
        check('autosave: the top bar says "Saved to your account"', (await pg.inner_text('#tb-saved')).startswith('Saved to your account'), await pg.inner_text('#tb-saved'))
        await pg.click('#sb-acct-btn'); await pg.click('.modal-f button:has-text("My analyses")')
        await pg.wait_for_selector('.mine-tbl tbody tr', timeout=10000)
        check('My analyses lists the analysis, its name shown as text (no element injected)', await pg.locator('.mine-tbl tbody tr').count() == 1
              and 'Browser Co <img' in await pg.inner_text('.mine-tbl tbody th') and await pg.locator('#mine-content img').count() == 0
              and await pg.evaluate("() => !window.__xss"))
        check('My analyses shows the quota meter', 'of 100 analyses' in await pg.inner_text('#mine-content'))
        await pg.fill('#mine-q', 'no such deal'); await pg.wait_for_timeout(200)
        check('search: no match says so', 'No analysis matches.' in await pg.inner_text('#mine-content'))
        await pg.fill('#mine-q', ''); await pg.wait_for_timeout(200)
        await pg.click('button[data-click=acctMineHistory]')
        await pg.wait_for_selector('.modal[aria-label="Saved versions"]', timeout=10000)
        check('Versions opens the version history', await pg.locator('.modal[aria-label="Saved versions"]').count() == 1)
        await pg.keyboard.press('Escape')
        await pg.click('button[data-click=acctMineDelete]'); await pg.wait_for_timeout(200)
        check('delete: the row goes at once and an Undo is offered', await pg.locator('.mine-tbl tbody tr').count() == 0 and await pg.locator('button[data-click=acctMineUndo]').count() == 1)
        await pg.click('button[data-click=acctMineUndo]'); await pg.wait_for_timeout(200)
        check('undo: the row is back and nothing was deleted', await pg.locator('.mine-tbl tbody tr').count() == 1)
        await pg.click('#sb-acct-btn'); await pg.click('.modal-f button:has-text("Sign out")'); await pg.wait_for_timeout(500)
        check('sign out: back to "Sign in", no session kept', (await pg.inner_text('#sb-acct-btn')).strip() == 'Sign in' and await pg.evaluate("() => !acctSession()"))
    check('every completed request stayed on this computer, and the page never even tried another host',
          all(h.startswith('127.0.0.1') for h in hosts) and not blocked, (sorted(hosts), blocked[:3]))
    check('test build: no console error (CSP and Trusted Types on)', not errs, errs[:3])
    await ctx.close()
    return email

def serve(folder, port):
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Quiet, directory=folder)
    srv = ThreadingHTTPServer(('127.0.0.1', port), h); threading.Thread(target=srv.serve_forever, daemon=True).start(); return srv

async def main():
    env = stack()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await guest(b)
        if not env: print('local stack not running: the live part is SKIPPED')
        else:
            tmp = tempfile.mkdtemp(prefix='vcr2-acct-')
            e = dict(_os.environ, VCR2_TEST_ACCOUNTS=json.dumps([{'id': 'eu', 'label': 'Local', 'url': env['url'], 'anonKey': env['anon']}]), VCR2_BUILD_OUT=str(pathlib.Path(tmp) / 'index.html'))
            subprocess.run([_sys.executable, 'build.py'], cwd=ROOT, env=e, check=True, capture_output=True)
            for d in ('assets',):
                src = ROOT / d
                if src.exists(): _os.symlink(src, pathlib.Path(tmp) / d, target_is_directory=True) if _os.name != 'nt' else subprocess.run(['cmd', '/c', 'mklink', '/J', str(pathlib.Path(tmp) / d), str(src)], capture_output=True)
            srv = serve(tmp, 8765)
            try: email = await live(b, env, 8765)
            finally: srv.shutdown()
            # tidy up the test user
            req = urllib.request.Request(f"{env['url']}/auth/v1/admin/users?per_page=200", headers={'apikey': env['service'], 'authorization': 'Bearer ' + env['service']})
            for u in json.loads(urllib.request.urlopen(req).read()).get('users', []):
                if u.get('email') == email:
                    urllib.request.urlopen(urllib.request.Request(f"{env['url']}/auth/v1/admin/users/{u['id']}", method='DELETE', headers={'apikey': env['service'], 'authorization': 'Bearer ' + env['service']}))
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'{len(results) - len(bad)}/{len(results)} passed')
    _sys.exit(1 if bad else 0)

asyncio.run(main())
