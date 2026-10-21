"""Clarity of words and small honesty items found by an outside review of rev5.

One name per concept (form filled vs scoring weight covered), counts that explain how they differ, plain sentences instead of
"1786% of the market", no stale rubric number in the static page, an unambiguous date in the Markdown export, a ledger error that
stays under the drop zone, no app error when radar-config.json is missing, and a social-preview address that is not typed into
the source.
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys, re, json, pathlib, shutil, subprocess, tempfile
from playwright.async_api import async_playwright
import fontroute
BASE = _paths.BASE
ROOT = pathlib.Path(__file__).resolve().parents[2]
FILE_URL = (ROOT / 'index.html').as_uri()
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:360]}'))

def build_with_site(url):
    """Build a copy of the app with another site address and return its index.html text."""
    tmp = pathlib.Path(tempfile.mkdtemp(prefix='vcr2-site-'))
    try:
        for f in ('build.py',): shutil.copy(ROOT / f, tmp / f)
        shutil.copytree(ROOT / 'src', tmp / 'src'); shutil.copytree(ROOT / 'tools', tmp / 'tools')
        (tmp / 'site.json').write_text(json.dumps({'url': url}), encoding='utf-8')
        r = subprocess.run([sys.executable, 'build.py'], cwd=str(tmp), capture_output=True, text=True, encoding='utf-8')
        return (tmp / 'index.html').read_text(encoding='utf-8') if r.returncode == 0 else 'BUILD FAILED ' + r.stderr[-300:]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1360, 'height': 900})
        pg = await ctx.new_page()
        errs, appconsole, resource = [], [], []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        def on_console(m):
            if m.type in ('error', 'warning'):
                (resource if m.text.startswith('Failed to load resource') else appconsole).append(m.text)
        pg.on('console', on_console)
        await fontroute.install(pg)
        await pg.goto(BASE); await pg.wait_for_selector('#sidebar', state='attached')

        # 1. one name per concept
        side = re.sub(r'\s+', ' ', await pg.evaluate("() => $id('sidebar').textContent + ' ' + $id('tb-cov').textContent"))
        check('the form-progress figure is called "Form filled" (sidebar and top bar)', side.count('Form filled') >= 2 and 'Input coverage' not in side and 'Coverage' not in side, side[:200])
        await pg.evaluate("() => { loadHalcyon(); S.result = assessAll(); showPage('result'); renderResult(S.result); }")
        await pg.wait_for_timeout(300)
        rep = re.sub(r'\s+', ' ', await pg.evaluate("() => $id('page-result').textContent"))
        check('the report calls the other figure "scoring weight covered"', 'scoring weight covered' in rep and 'of the rubric populated' not in rep, rep[:200])
        await pg.evaluate("() => goTab('scoring')")
        sco = re.sub(r'\s+', ' ', await pg.evaluate("() => $id('page-result').textContent"))
        check('and the Scoring table column is "Weight covered"', 'Weight covered' in sco, sco[:120])
        await pg.evaluate("() => { loadNorthwind(); S.result = assessAll(); showPage('result'); renderResult(S.result); }")
        await pg.wait_for_timeout(300)
        await pg.evaluate("() => goTab('findings')")
        fnd = re.sub(r'\s+', ' ', await pg.evaluate("() => $id('page-result').textContent"))
        m = re.search(r'(\d+) discrepancies in all: (\d+) material .* and (\d+) minor', fnd)
        check('Findings says how many discrepancies there are and how material and minor differ', bool(m) and int(m.group(1)) == int(m.group(2)) + int(m.group(3)), fnd[:300])
        tab = await pg.evaluate("() => (Array.from(document.querySelectorAll('.rtab')).find(b => /^Findings/.test(b.textContent)) || {}).textContent || ''")
        check('and the tab count is that total', bool(m) and f'({m.group(1)})' in tab, [tab, m and m.group(1)])
        check('the direction-of-errors line says which discrepancies it counts', 'that have a direction flatter the company' in fnd, fnd[:300])
        gates = await pg.evaluate("() => S.result.sc.gates.map(g => g.title)")
        check('the gate is titled with "material discrepancies", not "figures do not reconcile"', any('material discrepancies' in g for g in gates) and not any(re.match(r'^\d+ figures do not reconcile$', g) for g in gates), gates)
        await pg.evaluate("() => { goVerify(); }"); await pg.wait_for_timeout(300)
        ver = re.sub(r'\s+', ' ', await pg.evaluate("() => $id('verify-content').textContent"))
        check('the verification page uses the same two names', 'Form filled' in ver and 'Inputs filled' not in ver and 'material discrepancies' in ver, ver[:300])

        # 2. plain sentences for shares of a market
        om = await pg.evaluate("() => [ofMarket(1786, 'the whole market reachable in five years'), ofMarket(161, 'the bottom-up market (TAM)'), ofMarket(30, 'the bottom-up market (TAM)'), ofMarket(4.2, 'the market'), ofMarket(null, 'x')]")
        check('a share above 100% is said in times, below it in percent',
              om == ['18 times the whole market reachable in five years', '1.6 times the bottom-up market (TAM)', '30% of the bottom-up market (TAM)', '4.2% of the market', None], om)
        ev = await pg.evaluate("""() => { const out = []; ['loadNorthwind', 'loadHalcyon'].forEach(f => { window[f](); const R = assessAll();
            R.patterns.forEach(p => out.push(p.evidence.join(' | '))); const t = document.createElement('div'); t.innerHTML = paneDeal(R); out.push(t.textContent); }); return out.join(' || '); }""")
        check('no "NNN% of bottom-up TAM" or "% of the market reachable" is left in patterns or the deal pane', not re.search(r'\d{3,}% of (the )?(bottom-up|market)', ev) and 'of the market reachable' not in ev, ev[:300])

        # 3. the static page says nothing stale
        raw = await pg.evaluate("async () => (await fetch(location.href)).text()")
        m = re.search(r'id="sb-rubric">([^<]*)<', raw)
        check('the static page does not name an old rubric (blank, or 5.0.0)', bool(m) and ('4.3.0' not in m.group(1)) and (m.group(1).strip() == '' or '5.0.0' in m.group(1) or 'Evidence engine' == m.group(1).strip()), m and m.group(1))
        live = await pg.evaluate("() => $id('sb-rubric').textContent")
        check('once the script has run it names the real rubric', '5.0.0' in live, live)

        # 4. Markdown export date is unambiguous
        await pg.evaluate("() => { window.__md = []; window.downloadFile = (n, c) => window.__md.push(String(c)); loadHalcyon(); S.result = assessAll(); downloadReport(); }")
        md = (await pg.evaluate("() => window.__md.join('\\n')"))
        d = re.search(r'(?m)^[^\n]* · (\d{1,2} [A-Z][a-z]{2,8} \d{4}|\d{4}-\d{2}-\d{2})$', md)
        check('the Markdown export carries a date that cannot be read two ways', bool(d) and not re.search(r'\b\d{2}/\d{2}/\d{4}\b', md), md[:200])
        check('the Markdown export names "scoring weight covered"', 'scoring weight covered' in md and 'rubric coverage' not in md)

        # 5. a ledger error stays under the drop zone
        await pg.evaluate("() => { showPage('setup'); }")
        await pg.evaluate("() => loadLedgerText('customer,2026-01,2026-02,2026-03\\nAcme,100,100,100\\nBeta,200,200,200', 'two.csv')")
        await pg.wait_for_timeout(6500)       # longer than any toast
        st = re.sub(r'\s+', ' ', await pg.evaluate("() => $id('ledger-status').textContent"))
        check('the ledger error is still visible under the drop zone after the toast is gone', 'At least three customers with revenue are needed' in st, st)
        await pg.evaluate("() => loadLedgerText('customer,2026-01,2026-02,2026-03\\nA,100,100,100\\nB,200,200,200\\nC,50,50,60\\nD,10,10,10', 'ok.csv')")
        st2 = re.sub(r'\s+', ' ', await pg.evaluate("() => $id('ledger-status').textContent"))
        check('a good file clears the error', 'At least three' not in st2 and 'customers' in st2, st2)
        await pg.evaluate("() => loadSeriesText('month,revenue\\n2026-01,100', 'one.csv')")
        ss = re.sub(r'\s+', ' ', await pg.evaluate("() => $id('series-status').textContent"))
        check('a financials error stays visible too', 'not loaded' in ss.lower() or 'need' in ss.lower() or 'at least' in ss.lower(), ss)
        check('no page errors in the page itself', not errs, errs)
        await ctx.close()

        # 6. a missing radar-config.json: nothing from the app, on http and from disk
        for label, url, route in [('http', BASE, True), ('file://', FILE_URL, False)]:
            c2 = await b.new_context(); p2 = await c2.new_page()
            e2, a2, r2 = [], [], []
            p2.on('pageerror', lambda e: e2.append(str(e)))
            p2.on('console', lambda m: ((r2 if m.text.startswith('Failed to load resource') else a2).append(m.text) if m.type in ('error', 'warning') else None))
            if route:
                await fontroute.install(p2)
                await p2.route(_paths.ORIGIN + '/radar-config.json*', lambda r: r.fulfill(status=404, body='not found'))
            await p2.goto(url); await p2.wait_for_selector('#sidebar', state='attached'); await p2.wait_for_timeout(800)
            ok = await p2.evaluate("() => typeof CFG === 'object' && !!document.getElementById('sidebar')")
            check(f'{label}: with radar-config.json missing the app starts on the built-in rules and logs no error of its own', ok and not e2 and not a2, [e2, a2])
            await c2.close()

        # 7. the social-preview address is not typed into the source
        src = (ROOT / 'src' / 'shell.html').read_text(encoding='utf-8')
        check('src/shell.html has no hard-coded github.io address', 'github.io' not in src)
        out = build_with_site('https://example.org/vcr2/')
        imgs = re.findall(r'<meta (?:property="og:image"|name="twitter:image") content="([^"]+)"', out)
        check('a site address in site.json reaches og:image and twitter:image', len(imgs) == 2 and all(i == 'https://example.org/vcr2/assets/social-preview.png' for i in imgs), imgs)
        cur = re.findall(r'<meta (?:property="og:image"|name="twitter:image") content="([^"]+)"', (ROOT / 'index.html').read_text(encoding='utf-8'))
        check('the shipped build still points at the current site', len(cur) == 2 and all(c.endswith('/assets/social-preview.png') and c.startswith('https://') for c in cur), cur)
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')
    sys.exit(1 if bad else 0)

asyncio.run(main())
