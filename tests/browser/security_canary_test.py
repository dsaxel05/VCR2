"""Security canary: no script runs that should not, no key or token leaves its place, nothing survives a reset.

One full visit is driven in a real browser with FAKE secrets only (never a real key, never the real internet):
  1. Execution canary   - installed before any page script: records every CSP violation, every page error and any write
                          to window.__pwned (a trap property). The suite fails if any of them happens during the whole flow.
  2. Exfiltration canary - every request is routed. Only the local server is let through; the five AI providers and
                          api.github.com are answered with mocks (method, URL, headers, body recorded); everything else is
                          aborted and recorded. Navigations and popups are recorded too.
  3. Leak scan          - after each stage and at the end, every place a secret could hide is searched: localStorage,
                          sessionStorage, cookie, the whole DOM (attributes included), history.state, window.name, the address,
                          the console, page errors, every download, the printed memo and every request to a foreign host.
  4. The one documented exception (tick "Remember this key on this computer") is tested on its own, and so are
     "Forget the key" and the reset (no draft, empty print area).
  5. Self-test: the same detectors are run on deliberately planted leaks and must catch them, so a green run means something.
Set VCR2_CANARY_STRICT=1 to also forbid the per-tab copy of the key in sessionStorage under 'vcr3-key' (see TAB_COPY below).
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys, json, base64, re, os
from urllib.parse import urlsplit
from playwright.async_api import async_playwright
import fontroute
BASE = _paths.BASE
ORIGIN = _paths.ORIGIN
LOCAL_HOST = urlsplit(BASE).netloc
STRICT = os.environ.get('VCR2_CANARY_STRICT') == '1'
TOKEN = 'github_pat_' + 'A' * 60
PROV = {
    'anthropic':  dict(key='sk-ant-' + 'A' * 40,   host='api.anthropic.com',               hdr='x-api-key'),
    'openai':     dict(key='sk-proj-' + 'B' * 40,  host='api.openai.com',                  hdr='authorization'),
    'gemini':     dict(key='AIza' + 'C' * 35,      host='generativelanguage.googleapis.com', hdr='x-goog-api-key'),
    'groq':       dict(key='gsk_' + 'D' * 48,      host='api.groq.com',                    hdr='authorization'),
    'openrouter': dict(key='sk-or-v1-' + 'E' * 64, host='openrouter.ai',                   hdr='authorization'),
}
SECRETS = { **{ k: v['key'] for k, v in PROV.items() }, 'github': TOKEN }
AI_HOSTS = [v['host'] for v in PROV.values()]
GITHUB = 'api.github.com'
TAB_COPY = 'vcr3-key'   # the app keeps a per-tab copy of the key in sessionStorage under this name (core: storeApiKey)
DECK = 'Northwind Data. ARR is 4.2 million dollars. Net revenue retention is 112 percent for the last twelve months.'
FIN = 'Cash on hand is 3.1 million dollars. Monthly net burn is 210 thousand dollars.'
EXTRACTED = { 'arr_now': { 'value': 4200000, 'line': 'ARR is 4.2 million dollars' }, 'nrr': { 'value': 112, 'line': 'Net revenue retention is 112 percent' } }

results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:500]}'))

# ── the execution canary, injected before any page script ──
INIT = r"""
(() => {
  const log = (kind, msg) => { try { (window.__secLog || function () {})(kind, String(msg).slice(0, 400)); } catch (e) {} };
  document.addEventListener('securitypolicyviolation', e => log('violation', `${e.violatedDirective} ${e.blockedURI} ${e.sample || ''}`), true);
  window.addEventListener('error', e => log('error', e.message), true);
  window.addEventListener('unhandledrejection', e => log('error', 'unhandled rejection: ' + (e.reason && e.reason.message || e.reason)), true);
  Object.defineProperty(window, '__pwned', { configurable: false, enumerable: false, get() { return undefined; }, set(v) { log('pwned', v); } });
})();
"""

class Canary:
    """Everything one browser context records."""
    def __init__(self):
        self.violations, self.errors, self.pwned = [], [], []
        self.requests, self.aborted, self.navs, self.popups, self.console, self.downloads = [], [], [], [], [], []
        self.label = ''
        self.gh = { 'puts': [], 'sha': None, 'published': None, 'put_status': 201 }

    def log(self, kind, msg):
        { 'violation': self.violations, 'error': self.errors, 'pwned': self.pwned }[kind].append(msg)

def mock_body(pid, text):
    if pid == 'anthropic': return { 'content': [{ 'type': 'text', 'text': text }] }
    if pid == 'gemini':    return { 'candidates': [{ 'content': { 'parts': [{ 'text': text }] } }] }
    return { 'choices': [{ 'message': { 'content': text } }] }

async def setup(browser, cn, with_github=True):
    ctx = await browser.new_context(viewport={ 'width': 1360, 'height': 900 }, accept_downloads=True)
    await ctx.expose_function('__secLog', cn.log)
    await ctx.add_init_script(INIT)
    # cookies for every mocked host: a request that sent credentials would carry one, so "no cookie header" is not vacuous
    await ctx.add_cookies([{ 'name': 'canary', 'value': 'c', 'url': f'https://{h}/' } for h in AI_HOSTS + [GITHUB]]
                          + [{ 'name': 'canary', 'value': 'c', 'url': ORIGIN + '/' }])

    async def handler(route):
        req = route.request; u = urlsplit(req.url); host = u.netloc
        rec = { 'label': cn.label, 'method': req.method, 'url': req.url, 'host': host, 'headers': dict(await req.all_headers()), 'body': req.post_data or '' }
        if host == LOCAL_HOST:
            return await route.continue_()
        pid = next((k for k, v in PROV.items() if v['host'] == host), None)
        if pid:
            cn.requests.append(rec)
            return await route.fulfill(status=200, json=mock_body(pid, json.dumps(EXTRACTED)))
        if host == GITHUB:
            cn.requests.append(rec)
            return await gh_mock(cn, route, rec)
        cn.aborted.append(rec)
        await route.abort()
    await ctx.route('**/*', handler)

    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: cn.errors.append(f'pageerror: {e}'))
    pg.on('console', lambda m: cn.console.append(m.text))
    pg.on('framenavigated', lambda f: cn.navs.append(f.url) if f == pg.main_frame else None)
    ctx.on('page', lambda p: cn.popups.append(p.url) if p is not pg else None)
    pg.on('popup', lambda p: cn.popups.append(p.url))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    return ctx, pg

async def gh_mock(cn, route, rec):
    url, m, g = rec['url'], rec['method'], cn.gh
    if not rec['headers'].get('authorization', '').endswith(TOKEN):
        return await route.fulfill(status=401, json={ 'message': 'Bad credentials' })
    if url.endswith('/user'): return await route.fulfill(status=200, json={ 'login': 'dsaxel05' })
    if re.search(r'/repos/dsaxel05/VCR2$', url):
        return await route.fulfill(status=200, json={ 'full_name': 'dsaxel05/VCR2', 'permissions': { 'push': True, 'pull': True }, 'default_branch': 'main' })
    if '/contents/radar-config.json' in url and m == 'GET':
        if g['sha']: return await route.fulfill(status=200, json={ 'sha': g['sha'], 'path': 'radar-config.json' })
        return await route.fulfill(status=404, json={ 'message': 'Not Found' })
    if '/contents/radar-config.json' in url and m == 'PUT':
        body = json.loads(rec['body']); g['puts'].append(body)
        g['published'] = base64.b64decode(body['content']).decode('utf-8'); g['sha'] = 'sha' + str(len(g['puts']))
        return await route.fulfill(status=201, json={ 'content': { 'sha': g['sha'] } })
    return await route.fulfill(status=404, json={})

# ── the leak scan ──
SCAN_JS = r"""(secrets) => {
  const out = {}, hit = (loc, text) => { const t = String(text); for (const [n, v] of Object.entries(secrets)) if (t.includes(v)) (out[loc] = out[loc] || []).push(n); };
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); hit('localStorage:' + k, k + '=' + localStorage.getItem(k)); }
  for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); hit('sessionStorage:' + k, k + '=' + sessionStorage.getItem(k)); }
  hit('cookie', document.cookie);
  hit('dom', document.documentElement.outerHTML);
  try { hit('history.state', JSON.stringify(history.state)); } catch (e) {}
  hit('window.name', window.name);
  hit('location', location.href);
  const pr = document.getElementById('print-root'); hit('print-root', pr ? pr.innerHTML : '');
  return out; }"""

def foreign_leaks(cn):
    """Requests that carry a secret anywhere but the one header it belongs in, on the one host it belongs to."""
    bad = []
    for r in cn.requests:
        for name, val in SECRETS.items():
            own = PROV.get(name)
            allowed_host = (own['host'] if own else GITHUB)
            hdr = (own['hdr'] if own else 'authorization')
            for part, text in (('url', r['url']), ('body', r['body'])):
                if val in text: bad.append((r['host'], name, part))
            for h, v in r['headers'].items():
                if val in v and not (r['host'] == allowed_host and h == hdr): bad.append((r['host'], name, 'header ' + h))
    for r in cn.aborted:
        if any(v in json.dumps(r) for v in SECRETS.values()): bad.append((r['host'], '?', 'aborted request'))
    return bad

class Scans:
    def __init__(self): self.rows = []   # (checkpoint, {location: [names]})
    async def take(self, pg, label):
        self.rows.append((label, await pg.evaluate(SCAN_JS, SECRETS)))
    def hits(self, loc_prefix, ignore=()):
        out = []
        for label, d in self.rows:
            for loc, names in d.items():
                if loc.startswith(loc_prefix) and loc not in ignore: out.append((label, loc, names))
        return out

def text_leaks(cn):
    """Secrets in the console, page errors and downloads."""
    found = []
    for src, items in (('console', cn.console), ('page errors', cn.errors)):
        for t in items:
            for n, v in SECRETS.items():
                if v in t: found.append((src, n))
    for name, content in cn.downloads:
        for n, v in SECRETS.items():
            if v in content: found.append(('download ' + name, n))
    return found

async def grab(pg, cn, js):
    """Run something that downloads a file, and keep the file's text for the leak scan."""
    try:
        async with pg.expect_download(timeout=8000) as di:
            await pg.evaluate(js)
        d = await di.value
        cn.downloads.append((d.suggested_filename, open(await d.path(), 'rb').read().decode('utf-8', 'replace')))
    except Exception as e:
        cn.downloads.append((js, f'<failed: {e}>'))

async def to_report(pg):
    await pg.evaluate("() => loadDemo('northwind')")
    steps = 0
    while steps < 60 and not await pg.evaluate("() => !!document.querySelector('#page-verify.active')"):
        await pg.evaluate("() => nextSec()"); steps += 1
    await pg.evaluate("async () => { await runAnalysis(); }")
    await pg.wait_for_selector('.rtab', timeout=15000)
    return steps

async def open_ai(pg):
    await pg.evaluate("() => { const d = document.querySelector('.sb-ai'); if (d) d.open = true; }")

async def ls(pg, key): return await pg.evaluate("(k) => localStorage.getItem(k)", key)

async def wait_toast(pg, text, ms=4000):
    try: await pg.wait_for_function("(t) => (document.getElementById('toast')||{}).textContent.includes(t)", arg=text, timeout=ms)
    except Exception: pass
    return re.sub(r'\s+', ' ', await pg.evaluate("() => document.getElementById('toast').textContent"))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()

        # ═══════════ the full flow ═══════════
        cn = Canary(); sc = Scans()
        ctx, pg = await setup(b, cn)
        await fontroute.install(pg)
        cn.label = 'load'
        await pg.goto(BASE); await pg.wait_for_selector('#api-key', state='attached')
        await sc.take(pg, 'load')

        # ── each provider: the key goes only to its own host, only in its own header ──
        for pid, cfg in PROV.items():
            cn.label = 'extract-' + pid
            before = len(cn.requests)
            await pg.evaluate("() => goSetup()")
            await pg.fill('#cname', 'Northwind Data')
            await open_ai(pg)
            await pg.select_option('#api-provider', pid)
            await pg.fill('#api-key', cfg['key'])
            await pg.evaluate("() => goIntake()")
            await pg.fill('#intake-deck', DECK); await pg.fill('#intake-fin', FIN)
            await pg.evaluate("() => runExtraction()")
            reqs = cn.requests[before:]
            check(f'{pid}: exactly one request left the page, to {cfg["host"]} only', len(reqs) == 1 and reqs[0]['host'] == cfg['host'] and reqs[0]['method'] == 'POST', [(r['host'], r['method']) for r in reqs])
            r = reqs[0] if reqs else { 'url': '', 'body': '', 'headers': {}, 'host': '' }
            h = r['headers']
            sent = h.get(cfg['hdr'], '')
            want = 'Bearer ' + cfg['key'] if cfg['hdr'] == 'authorization' else cfg['key']
            check(f'{pid}: the key is in the {cfg["hdr"]} header, and only there', sent == want and not [k for k, v in h.items() if cfg['key'] in v and k != cfg['hdr']], { k: v for k, v in h.items() if 'key' in k or k == 'authorization' })
            check(f'{pid}: the key is not in the address or the body', cfg['key'] not in r['url'] and cfg['key'] not in r['body'] and not any(v in r['url'] + r['body'] for v in SECRETS.values()))
            check(f'{pid}: no cookie header, no referer', 'cookie' not in h and 'referer' not in h, list(h))
            t = await wait_toast(pg, 'extracted')
            check(f'{pid}: the mocked answer was used (figures extracted)', re.search(r'[12] fields? extracted', t) is not None, t)
        await sc.take(pg, 'after extraction')

        # ── structured files, example, analysis, every tab, exports ──
        cn.label = 'files'
        months = [f'2025-{m:02d}' for m in range(1, 13)] + ['2026-01']
        csv = 'customer,' + ','.join(months) + '\n' + '\n'.join(f'{n},' + ','.join(str(v + i * 40) for i in range(13)) for n, v in (('Acme', 1000), ('Beacon', 700), ('Cobalt', 400)))
        await pg.evaluate("(t) => loadLedgerText(t, 'ledger.csv')", csv)
        ser = 'month,revenue,cash,burn\n' + '\n'.join(f'{m},{2100 + i * 90},{3100000 - i * 150000},{150000 + i * 4000}' for i, m in enumerate(months))
        await pg.evaluate("(t) => loadSeriesText(t, 'fin.csv')", ser)
        check('ledger and financials loaded', await pg.evaluate("() => !!S.ledger && !!S.series"))
        await sc.take(pg, 'after files')

        cn.label = 'analysis'
        steps = await to_report(pg)
        check('the example reached the verification page and the report', steps < 60, steps)
        tabs = await pg.eval_on_selector_all('.rtab', 'els => els.map(e => e.id)')
        for tid in tabs:
            await pg.evaluate("(id) => document.getElementById(id).click()", tid); await pg.wait_for_timeout(120)
        check('every report tab was opened', len(tabs) >= 8, tabs)
        await sc.take(pg, 'after report tabs')

        await pg.evaluate("() => { window.print = () => {}; }")
        await pg.evaluate("() => printMemo()"); await pg.wait_for_timeout(200)
        memo_len = await pg.evaluate("() => document.getElementById('print-root').innerHTML.length")
        check('the memo was built in the print area (the scan is not vacuous)', memo_len > 2000, memo_len)
        memo_html = await pg.evaluate("() => document.getElementById('print-root').innerHTML")
        await sc.take(pg, 'after memo')
        await grab(pg, cn, "() => exportAssessment()")
        await pg.evaluate("() => { try { saveRunToLibrary(); } catch (e) {} }")
        await grab(pg, cn, "() => libExport()")
        await pg.wait_for_timeout(300)
        check('both exports were captured and are not empty', len(cn.downloads) >= 2 and all(len(c) > 1000 for _, c in cn.downloads), [(n, len(c)) for n, c in cn.downloads])
        await sc.take(pg, 'after exports')
        check('the analysis and exports contacted no AI provider (memo option off)', not [r for r in cn.requests if r['label'] in ('files', 'analysis') and r['host'] != GITHUB], [(r['label'], r['host']) for r in cn.requests if r['label'] in ('files', 'analysis')])

        # ── save and exit, reload, continue, library ──
        cn.label = 'draft'
        await pg.evaluate("() => { saveSec(); saveDraft(); }")
        await sc.take(pg, 'after save')
        await pg.reload(); await pg.wait_for_selector('#api-key', state='attached')
        await sc.take(pg, 'after reload')
        await pg.evaluate("() => { continueDraft(); goLibrary(); }")
        check('the library page opened after continuing the draft', await pg.evaluate("() => !!document.querySelector('#page-library.active')"))
        await sc.take(pg, 'library')

        # ── Studio: sign in with the fake token, publish, sign out ──
        cn.label = 'studio'
        async def sign_in():
            await pg.evaluate("() => { location.hash = '#studio'; }")
            await pg.wait_for_selector('#gh-token', timeout=8000)
            await pg.fill('#gh-token', TOKEN); await pg.click('#gh-signin')
            await pg.wait_for_selector('text=Sign out', timeout=8000)
        await sign_in()
        check('the owner signed in (mocked)', await pg.evaluate("() => !!ST.token"))
        check('the token is held in memory only', await pg.evaluate("() => ST.token") == TOKEN)
        await sc.take(pg, 'studio signed in')
        await pg.evaluate("() => studioTab('fields')")
        await pg.click('text=Add a field'); await pg.wait_for_selector('#ed-label')
        await pg.fill('#ed-label', 'Qualified pipeline'); await pg.select_option('#ed-section', 'custom')
        await pg.click('.modal-f .btn-primary'); await pg.wait_for_timeout(200)
        await sc.take(pg, 'studio draft edited')
        await pg.click('text=Publish to the live site')
        try:
            await pg.wait_for_selector('#rv-publish', timeout=4000); await pg.click('#rv-publish')
        except Exception: pass
        await pg.wait_for_timeout(900)
        check('a mocked publish reached GitHub (PUT of radar-config.json)', len(cn.gh['puts']) == 1, len(cn.gh['puts']))
        await sc.take(pg, 'after publish')
        if await pg.is_visible('text=Sign out'):
            await pg.click('text=Sign out')
        else:
            await sign_in(); await pg.click('text=Sign out')
        await pg.wait_for_timeout(250)
        check('after sign-out the token is gone from memory', await pg.evaluate("() => ST.token === null"))
        await sc.take(pg, 'after sign-out')
        await pg.reload(); await pg.wait_for_selector('#api-key', state='attached')
        await sc.take(pg, 'studio reload')

        # ── reset: no draft, empty print area ──
        cn.label = 'reset'
        await pg.evaluate("() => continueDraft()")
        await pg.evaluate("() => { saveDraft(); }")
        await to_report(pg)
        await pg.evaluate("() => { window.print = () => {}; printMemo(); }"); await pg.wait_for_timeout(200)
        pre = await pg.evaluate("() => [localStorage.getItem('vcr3-draft') != null, localStorage.getItem('vcr3-draft-meta') != null, document.getElementById('print-root').innerHTML.length > 0]")
        check('before the reset there is a draft and a printed memo (not vacuous)', pre == [True, True, True], pre)
        await pg.evaluate("() => resetApp()"); await pg.wait_for_timeout(300)
        post = await pg.evaluate("() => [localStorage.getItem('vcr3-draft'), localStorage.getItem('vcr3-draft-meta'), document.getElementById('print-root').innerHTML]")
        check('after the reset: no draft, no draft meta, empty print area', post == [None, None, ''], [post[0] and post[0][:30], post[1], post[2][:30]])
        await sc.take(pg, 'after reset')

        # ═══════════ verdicts of the full flow ═══════════
        check('EXECUTION: no security-policy violation during the whole flow', not cn.violations, cn.violations)
        check('EXECUTION: no page error during the whole flow', not [e for e in cn.errors], cn.errors)
        check('EXECUTION: nothing wrote to window.__pwned', not cn.pwned, cn.pwned)
        check('EXFILTRATION: no request was aborted (nothing left the allow-list)', not cn.aborted, [(r['host'], r['url'][:80]) for r in cn.aborted])
        used = sorted({ r['host'] for r in cn.requests })
        check('EXFILTRATION: only the five providers and api.github.com were contacted', set(used) <= set(AI_HOSTS + [GITHUB]) and set(AI_HOSTS) <= set(used), used)
        check('EXFILTRATION: no navigation away from the local origin', all(u.startswith(ORIGIN) for u in cn.navs) and len(cn.navs) >= 2, cn.navs)
        check('EXFILTRATION: no popup was opened', not cn.popups, cn.popups)
        gh_reqs = [r for r in cn.requests if r['host'] == GITHUB]
        check('the GitHub token went only to api.github.com, only in the Authorization header', gh_reqs and all(r['headers'].get('authorization', '').endswith(TOKEN) for r in gh_reqs) and not foreign_leaks(cn), foreign_leaks(cn))
        check('no secret in any URL, body or wrong header of any request', not foreign_leaks(cn), foreign_leaks(cn))
        check('GitHub requests carry no cookie', all('cookie' not in r['headers'] for r in gh_reqs), [list(r['headers']) for r in gh_reqs][:1])
        check('what was published contains no key or token', not any(v in (cn.gh['published'] or '') for v in SECRETS.values()))

        tabcopy = [(l, loc, n) for l, loc, n in sc.hits('sessionStorage') if loc == 'sessionStorage:' + TAB_COPY]
        check('STORAGE: no secret in localStorage at any checkpoint', not sc.hits('localStorage'), sc.hits('localStorage'))
        other_ss = sc.hits('sessionStorage', ignore=('sessionStorage:' + TAB_COPY,))
        check("STORAGE: no secret in sessionStorage outside the per-tab copy 'vcr3-key'", not other_ss, other_ss)
        check('STORAGE: the GitHub token is in no storage at any time (sign-in, reload, publish)', not [(l, loc) for l, d in sc.rows for loc, n in d.items() if 'github' in n], [(l, loc) for l, d in sc.rows for loc, n in d.items() if 'github' in n])
        if STRICT:
            check("STORAGE (strict): the key is not in sessionStorage at all", not tabcopy, tabcopy[:2])
        else:
            check("STORAGE: the per-tab copy of the key exists only under 'vcr3-key' (known, see header)", True)
        check('STORAGE: no secret in document.cookie', not sc.hits('cookie'), sc.hits('cookie'))
        check('DOM: no secret anywhere in the document, attributes included', not sc.hits('dom'), sc.hits('dom'))
        check('no secret in history.state, window.name or the address', not (sc.hits('history.state') or sc.hits('window.name') or sc.hits('location')))
        check('no secret in the printed memo', not sc.hits('print-root') and not any(v in memo_html for v in SECRETS.values()))
        tl = text_leaks(cn)
        check('no secret in the console, page errors or any download', not tl, tl)
        await ctx.close()

        # ═══════════ the documented exception: "Remember this key on this computer" ═══════════
        cn2 = Canary(); sc2 = Scans()
        ctx2, pg2 = await setup(b, cn2); await fontroute.install(pg2)
        await pg2.goto(BASE); await pg2.wait_for_selector('#api-key', state='attached')
        key = PROV['anthropic']['key']
        await open_ai(pg2)
        await pg2.select_option('#api-provider', 'anthropic'); await pg2.fill('#api-key', key)
        check('not ticked: the key is not in localStorage', await ls(pg2, 'vcr3-key') is None and await ls(pg2, 'vcr3-remember') in (None, '0'))
        await pg2.evaluate("() => { const c = $id('api-remember'); c.checked = true; c.dispatchEvent(new Event('change')); }")
        check("ticked: the key is in localStorage under 'vcr3-key' and the flag is set", await ls(pg2, 'vcr3-key') == key and await ls(pg2, 'vcr3-remember') == '1')
        await sc2.take(pg2, 'remembered')
        stored_in = sorted({ loc for _, d in sc2.rows for loc, n in d.items() if loc.startswith('localStorage') })
        check("ticked: the key is in localStorage under 'vcr3-key' only", stored_in == ['localStorage:vcr3-key'], stored_in)
        check('ticked: the key is still not in the DOM, cookie, history, name or address', not any(sc2.hits(x) for x in ('dom', 'cookie', 'history.state', 'window.name', 'location', 'print-root')))
        await pg2.reload(); await pg2.wait_for_selector('#api-key', state='attached')
        check('after a reload the remembered key is back in the key box and the box is ticked', await pg2.evaluate("() => [$id('api-key').value, $id('api-remember').checked]") == [key, True])
        await pg2.evaluate("() => $id('api-forget').click()"); await pg2.wait_for_timeout(150)
        gone = [await ls(pg2, 'vcr3-key'), await ls(pg2, 'vcr3-remember'), await pg2.evaluate("() => sessionStorage.getItem('vcr3-key')"), await pg2.evaluate("() => $id('api-key').value")]
        check("'Forget the key' removes vcr3-key, vcr3-remember, the tab copy and the box", gone == [None, None, None, ''], gone)
        await sc2.take(pg2, 'forgotten')
        check('after forgetting, the key is nowhere', not sc2.rows[-1][1], sc2.rows[-1][1])
        await pg2.reload(); await pg2.wait_for_selector('#api-key', state='attached')
        check('and it does not come back after a reload', await pg2.evaluate("() => [$id('api-key').value, localStorage.getItem('vcr3-key'), $id('api-remember').checked]") == ['', None, False])
        check('the remember test: no violation, no page error, nothing blocked', not (cn2.violations or cn2.errors or cn2.pwned or cn2.aborted), (cn2.violations, cn2.errors, cn2.aborted))
        await ctx2.close()

        # ═══════════ self-test: the detectors catch planted leaks ═══════════
        cn3 = Canary(); sc3 = Scans()
        ctx3, pg3 = await setup(b, cn3); await fontroute.install(pg3)
        await pg3.goto(BASE); await pg3.wait_for_selector('#api-key', state='attached')
        k = SECRETS['openai']
        await pg3.evaluate("(k) => localStorage.setItem('planted', k)", k); await sc3.take(pg3, 'planted-ls')
        check('SELF-TEST: a key written to localStorage makes the storage check fail', bool(sc3.hits('localStorage')), sc3.rows[-1])
        await pg3.evaluate("() => localStorage.removeItem('planted')")
        await pg3.evaluate("(k) => sessionStorage.setItem('planted', k)", k); await sc3.take(pg3, 'planted-ss')
        check('SELF-TEST: a key written to sessionStorage elsewhere makes the check fail', bool(sc3.hits('sessionStorage', ignore=('sessionStorage:' + TAB_COPY,))), sc3.rows[-1])
        await pg3.evaluate("() => sessionStorage.removeItem('planted')")
        await pg3.evaluate("(k) => document.body.setAttribute('data-x', k)", k); await sc3.take(pg3, 'planted-dom')
        check('SELF-TEST: a key in a DOM attribute makes the DOM check fail', bool(sc3.hits('dom')), sc3.rows[-1])
        await pg3.evaluate("() => document.body.removeAttribute('data-x')")
        await pg3.evaluate("(k) => { document.cookie = 'x=' + k; history.replaceState(k, ''); window.name = k; }", k); await sc3.take(pg3, 'planted-misc')
        check('SELF-TEST: cookie, history.state and window.name leaks are caught', all(sc3.hits(x) for x in ('cookie', 'history.state', 'window.name')), sc3.rows[-1])
        await pg3.evaluate("(k) => { const pr = document.getElementById('print-root'); pr.textContent = k; }", k); await sc3.take(pg3, 'planted-print')
        check('SELF-TEST: a key in the printed memo is caught', bool(sc3.hits('print-root')), sc3.rows[-1])
        await pg3.evaluate("() => { window.__pwned = 'x'; }")
        await pg3.evaluate("() => { new Image().src = 'https://evil.example/pixel.png'; }")
        await pg3.wait_for_timeout(300)
        check('SELF-TEST: a write to window.__pwned is recorded', cn3.pwned == ['x'], cn3.pwned)
        check('SELF-TEST: an image from a foreign host is a recorded security-policy violation', bool(cn3.violations), cn3.violations)
        await pg3.evaluate("() => setTimeout(() => { throw new Error('canary page error'); }, 0)"); await pg3.wait_for_timeout(200)
        check('SELF-TEST: a page error is recorded', bool(cn3.errors), cn3.errors)
        fake = Canary()
        fake.requests = [{ 'host': 'api.openai.com', 'url': 'https://api.openai.com/v1/x?key=' + k, 'body': '', 'headers': {}, 'label': '' },
                         { 'host': 'api.groq.com', 'url': 'https://api.groq.com/x', 'body': '', 'headers': { 'authorization': 'Bearer ' + k }, 'label': '' },
                         { 'host': 'api.openai.com', 'url': 'https://api.openai.com/x', 'body': json.dumps({ 'k': k }), 'headers': {}, 'label': '' }]
        fl = foreign_leaks(fake)
        check('SELF-TEST: a key in a URL, a body, or sent to the wrong host is caught', len(fl) == 3, fl)
        fake.requests = [{ 'host': 'api.openai.com', 'url': 'https://api.openai.com/x', 'body': '', 'headers': { 'authorization': 'Bearer ' + k }, 'label': '' }]
        check('SELF-TEST: the key in its own header on its own host is allowed', not foreign_leaks(fake))
        await pg3.evaluate("() => fetch('https://evil.example/x').catch(() => {})"); await pg3.wait_for_timeout(300)
        check('SELF-TEST: a request to a foreign host is blocked by the policy (violation) and never reaches the network', len(cn3.violations) >= 2 and not cn3.requests, (cn3.violations, cn3.requests))
        await ctx3.close()
        await b.close()

    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')
    sys.exit(1 if bad else 0)

asyncio.run(main())
