"""Accounts end to end in a real browser (Part B, B6), on a TEST build pointed at the LOCAL Supabase stack, served at
http://127.0.0.1:8765 (github.com and every other host are blocked). Keyboard-only sign-in and terms; phone viewport; dark
theme contrast; optional axe-core scan (VCR2_AXE=path to axe.min.js, a dev tool kept outside the repository); a Vault round
trip where a wrong passphrase fails safely, with the database inspected to prove it holds ciphertext only; account deletion.
   python tests/browser/accounts_e2e_test.py      (needs: node tools/accounts_stack.mjs start)"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, pathlib, re, subprocess, tempfile, threading, urllib.request, uuid, secrets, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
PORT = 8765
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))

def stack():
    js = "import('./tools/accounts_stack.mjs').then(m => process.stdout.write(JSON.stringify(m.stackEnv())))"
    try: return json.loads(subprocess.run(['node', '-e', js], cwd=ROOT, capture_output=True, text=True, timeout=120).stdout.strip().splitlines()[-1])
    except Exception: return None

def admin(env, path, method='GET', body=None):
    req = urllib.request.Request(env['url'] + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={'apikey': env['service'], 'authorization': 'Bearer ' + env['service'], 'content-type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r: t = r.read(); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e: return e.code, None

def serve(folder):
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=folder))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); return srv

ENABLE = "() => { CFG.settings.accounts = { providers:{ google:{ enabled:true }, email_password:{ enabled:true } } }; acctRenderButton(); }"
def lum(c):
    v = [int(x) / 255 for x in re.findall(r'\d+', c)[:3]]
    v = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in v]
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
def ratio(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)

async def new_page(b, **kw):
    ctx = await b.new_context(**kw); pg = await ctx.new_page(); st = {'hosts': set(), 'blocked': [], 'errs': []}
    pg.on('requestfinished', lambda r: st['hosts'].add(urllib.parse.urlsplit(r.url).netloc) if r.url.startswith(('http:', 'https:')) else None)
    pg.on('console', lambda m: st['errs'].append(m.text) if m.type == 'error' and '404' not in m.text else None); pg.on('pageerror', lambda e: st['errs'].append(str(e)))
    async def offsite(route): st['blocked'].append(route.request.url); await route.abort()
    await ctx.route(lambda url: url.startswith(('http:', 'https:')) and not url.startswith('http://127.0.0.1:'), offsite)
    return ctx, pg, st

async def open_site(pg):
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_selector('#api-key', state='attached'); await pg.evaluate(ENABLE)

async def axe(pg, label):
    path = _os.environ.get('VCR2_AXE')
    if not path: return
    await pg.wait_for_timeout(1500)   # let the page's fade-in finish: mid-animation colours are not the real ones
    # the page's CSP and Trusted Types refuse a new <script> (as they should): axe is evaluated through the test driver instead
    await pg.evaluate('() => {' + pathlib.Path(path).read_text(encoding='utf-8') + '\n}')
    r = await pg.evaluate("async () => (await axe.run(document, { runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] })).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' (' + v.nodes.length + '): ' + v.nodes.slice(0, 4).map(n => n.target.join(' ') + ' ' + (n.any[0] && n.any[0].data ? JSON.stringify([n.any[0].data.fgColor, n.any[0].data.bgColor, n.any[0].data.contrastRatio]) : '')).join(' | '))")
    check(f'axe-core: no serious or critical violation on {label}', not r, r)

async def main():
    env = stack()
    if not env: print('local stack not running: SKIPPED'); print('0/0 passed'); return
    tmp = tempfile.mkdtemp(prefix='vcr2-acct-e2e-')
    e = dict(_os.environ, VCR2_TEST_ACCOUNTS=json.dumps([{'id': 'eu', 'label': 'Local', 'url': env['url'], 'anonKey': env['anon']}]), VCR2_BUILD_OUT=str(pathlib.Path(tmp) / 'index.html'))
    subprocess.run([_sys.executable, 'build.py'], cwd=ROOT, env=e, check=True, capture_output=True)
    if _os.name == 'nt': subprocess.run(['cmd', '/c', 'mklink', '/J', str(pathlib.Path(tmp) / 'assets'), str(ROOT / 'assets')], capture_output=True)
    else: _os.symlink(ROOT / 'assets', pathlib.Path(tmp) / 'assets', target_is_directory=True)
    email, pw, passp = f'e2e-{uuid.uuid4().hex[:8]}@example.test', 'Aa1' + secrets.token_urlsafe(18), 'a long vault passphrase 2026'
    s, u = admin(env, '/auth/v1/admin/users', 'POST', {'email': email, 'password': pw, 'email_confirm': True}); uid = u['id']
    srv = serve(tmp)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            # 1. keyboard only: Sign in, More options, email, password, sign in, terms
            ctx, pg, st = await new_page(b); await open_site(pg)
            await pg.evaluate("() => document.activeElement && document.activeElement.blur()")
            for _ in range(60):
                await pg.keyboard.press('Tab')
                if await pg.evaluate("() => document.activeElement.id === 'sb-acct-btn'"): break
            check('keyboard: Tab reaches Sign in', await pg.evaluate("() => document.activeElement.id") == 'sb-acct-btn')
            await pg.keyboard.press('Enter')
            async def tab_to(sel, n=40):
                for _ in range(n):
                    await pg.keyboard.press('Tab')
                    if await pg.evaluate(f"() => document.activeElement.matches({json.dumps(sel)})"): return True
                return False
            await tab_to('details.acct-more summary'); await pg.keyboard.press('Enter')
            await tab_to('#acct-email'); await pg.keyboard.type(email)
            await tab_to('#acct-pass'); await pg.keyboard.type(pw)
            ok_btn = await tab_to('button[data-click=acctPassGo]'); await pg.keyboard.press('Enter')
            await pg.wait_for_selector('.modal[aria-label="Before your first save"]', timeout=10000)
            await tab_to('#acct-terms'); await pg.keyboard.press('Space')
            await tab_to('.modal-f button[data-mi="0"]'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(600)
            check('keyboard only: email, password, sign in and the terms, without the mouse', ok_btn and await pg.evaluate("() => !!acctSession() && _acctTermsOk"))
            await pg.evaluate("() => { acctDelay = 150; S.name = 'Keyboard Co'; saveDraft(); }"); await pg.wait_for_timeout(1200)
            await pg.click('#sb-acct-btn'); await pg.click('.modal-f button:has-text("My analyses")'); await pg.wait_for_selector('.mine-tbl tbody tr', timeout=10000)
            await axe(pg, 'My analyses')
            # 2. Vault on, recovery key shown
            await pg.click('#sb-acct-btn'); await pg.click('.modal-f button:has-text("Vault mode")')
            await pg.fill('#v-p1', passp); await pg.fill('#v-p2', passp); await pg.click('.modal-f button:has-text("Turn on Vault")')
            await pg.wait_for_selector('.acct-rec', timeout=60000)
            rec = (await pg.inner_text('.acct-rec')).strip()
            check('Vault on: the recovery key is shown once (43 characters) with a download button', len(rec) == 43 and await pg.locator('.modal-f button:has-text("Download the recovery key")').count() == 1)
            await pg.keyboard.press('Escape')
            # 3. reload: locked; wrong passphrase fails safely; right one unlocks; the database holds ciphertext only
            await open_site(pg); await pg.wait_for_timeout(1500)
            await pg.click('#sb-acct-btn')
            check('after a reload the Vault is locked and the menu offers "Unlock Vault"', await pg.locator('.modal-f button:has-text("Unlock Vault")').count() == 1)
            await pg.click('.modal-f button:has-text("Unlock Vault")'); await pg.fill('#v-u', 'not the passphrase at all'); await pg.click('.modal-f button:has-text("Unlock")')
            await pg.wait_for_timeout(4000)
            check('a wrong passphrase fails safely: still locked, message shown, nothing changed', await pg.evaluate("() => vaultLocked()") and 'Wrong passphrase' in await pg.inner_text('body'))
            await pg.fill('#v-u', passp); await pg.click('.modal-f button:has-text("Unlock")'); await pg.wait_for_timeout(4000)
            check('the right passphrase unlocks the Vault', await pg.evaluate("() => !vaultLocked() && vaultOn()"))
            await pg.evaluate("() => { acctDelay = 150; S.notes = 'browser secret note'; saveDraft(); }"); await pg.wait_for_timeout(1500)
            s, rows = admin(env, f'/rest/v1/analyses?select=*&owner=eq.{uid}')
            check('inspecting the database: the analysis is ciphertext only (no notes, no company)', bool(rows) and all(r['vault'] and r['payload'] is None and r['company'] is None and 'browser secret' not in r['cipher'] for r in rows), rows and [r['title'] for r in rows])
            # 4. delete the account
            await pg.click('#sb-acct-btn'); await pg.click('.modal-f button:has-text("Delete my account")')
            await pg.fill('#acct-del', 'delete'); await pg.click('.modal-f button:has-text("Delete my account and all my data")'); await pg.wait_for_timeout(500)
            check('delete: lower-case "delete" is refused, the account stays', admin(env, f'/auth/v1/admin/users/{uid}')[0] == 200)
            await pg.fill('#acct-del', 'DELETE'); await pg.click('.modal-f button:has-text("Delete my account and all my data")'); await pg.wait_for_timeout(1500)
            check('delete: DELETE removes the account, confirmed on screen', admin(env, f'/auth/v1/admin/users/{uid}')[0] == 404 and await pg.locator('.modal[aria-label="Account deleted"]').count() == 1)
            check('desktop journey: every request stayed on 127.0.0.1, no console error', all(h.startswith('127.0.0.1') for h in st['hosts']) and not st['blocked'] and not st['errs'], (sorted(st['hosts']), st['blocked'][:2], st['errs'][:3]))
            await ctx.close()
            # 5. phone and dark theme
            ctx, pg, st = await new_page(b, viewport={'width': 375, 'height': 812}, color_scheme='dark'); await open_site(pg)
            await pg.evaluate("() => toggleSidebar(true)"); await pg.wait_for_timeout(400)   # on a phone the sidebar opens from the menu button
            await pg.click('#sb-acct-btn')
            await pg.wait_for_selector('.modal[role=dialog]')
            sw = await pg.evaluate("() => [document.documentElement.scrollWidth, innerWidth]")
            hs = await pg.evaluate("() => [...document.querySelectorAll('.acct-prov')].map(b => b.getBoundingClientRect().height)")
            check('phone (375 px): the sign-in dialog has no sideways scroll and 44 px tall provider buttons', sw[0] <= sw[1] and hs and min(hs) >= 44, (sw, hs))
            cols = await pg.evaluate("() => { const n = document.querySelector('.acct-note'); let e = n, bg = 'rgba(0, 0, 0, 0)'; while (e && /rgba\\(0, 0, 0, 0\\)|transparent/.test(bg)) { bg = getComputedStyle(e).backgroundColor; e = e.parentElement; } return [getComputedStyle(n).color, bg, matchMedia('(prefers-color-scheme: dark)').matches]; }")
            check('dark theme: the dialog text has at least 4.5:1 contrast', cols[2] and ratio(cols[0], cols[1]) >= 4.5, (cols, round(ratio(cols[0], cols[1]), 2)))
            await axe(pg, 'the sign-in dialog (phone, dark)')
            check('phone and dark: no console error, nothing sent anywhere before a click', not st['errs'] and not any(h.endswith(':54321') for h in st['hosts']), (st['errs'][:2], sorted(st['hosts'])))
            await ctx.close(); await b.close()
    finally:
        srv.shutdown()
        admin(env, f'/auth/v1/admin/users/{uid}', 'DELETE')
    bad = [r for r in results if not r[0]]
    print(f'{len(results) - len(bad)}/{len(results)} passed')
    _sys.exit(1 if bad else 0)

asyncio.run(main())
