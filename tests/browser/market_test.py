"""Market data in a real browser (v5.8). The page is served over http so the weekly data file can be answered by the test.
1. Set-up page: a market chooser (United States / Europe); choosing Europe puts the form in euros and is saved.
2. Report: the header names the market and the data date; the Benchmarks tab lists every market figure with its source link,
   date and use; under the returns, the exit multiple used and the risk-free rate with their sources.
3. Tier 2: a newer data file published with the site is read and used (its exit multiple feeds a blank exit multiple).
4. A malformed data file is refused: the built-in snapshot is used. Nothing is requested from any other host. No console error.
   python tests/browser/market_test.py"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, pathlib, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

NEWER = { 'updated':'2099-01-02', 'version':'2099-01-02', 'items':{
  'exit_multiple':{ 'us':{ 'value':6.3, 'date':'2099-01-01', 'src':'Clouded Judgement (test file)', 'kind':'vc', 'url':'https://cloudedjudgement.substack.com/test' } },
  'risk_free_10y':{ 'us':{ 'value':4.0, 'date':'2099-01-01', 'src':'US Treasury (test file)', 'kind':'official', 'url':'https://home.treasury.gov/test' } } } }
BROKEN = { 'updated':'2099-01-02', 'items':{ 'exit_multiple':{ 'us':{ 'value':'lots', 'date':'x', 'src':'?', 'kind':'blog', 'url':'javascript:1' } } } }

async def page(b, base, data):
    ctx = await b.new_context(viewport={ 'width':1280, 'height':900 }); pg = await ctx.new_page(); errs, off = [], []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    async def other(route): off.append(route.request.url); await route.abort()
    await ctx.route(lambda u: u.startswith(('http:', 'https:')) and not u.startswith(base), other)
    async def md(route):
        if data is None: await route.fulfill(status=404, body='')
        else: await route.fulfill(status=200, content_type='application/json', body=json.dumps(data))
    await ctx.route(lambda u: u.startswith(base) and '/data/market.json' in u, md)
    await pg.goto(base + 'index.html'); await pg.wait_for_selector('#api-key', state='attached')
    await pg.evaluate("() => Promise.all([CFG_READY, MD_READY])"); await pg.wait_for_timeout(200)
    return ctx, pg, errs, off

async def main():
    srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); base = f'http://127.0.0.1:{srv.server_address[1]}/'
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # 1-2. no data file on the site: built-in snapshot, US then Europe
        ctx, pg, errs, off = await page(b, base, None)
        check('without a data file the built-in snapshot is used', await pg.evaluate("() => MARKET_SRC === 'built-in'"))
        await pg.evaluate("() => { goSetup(); }"); await pg.wait_for_timeout(200)
        cards = await pg.locator('#market-grid .market-card').all_text_contents()
        check('the set-up page offers United States and Europe', len(cards) == 2 and 'United States' in cards[0] and 'Europe' in cards[1], cards)
        check('United States is chosen by default', await pg.get_attribute('#market-grid .market-card:first-child', 'aria-pressed') == 'true')
        await pg.click('#market-grid .market-card:nth-child(2)')
        check('choosing Europe is recorded and saved with the analysis', await pg.evaluate("() => S.market === 'eu' && draftPayload().market === 'eu'"))
        await pg.evaluate("() => { loadDemo('northwind'); S.market = 'eu'; jumpTo(0); }"); await pg.wait_for_timeout(300)
        check('Europe: amounts in the form are in euros', '(€)' in await pg.inner_text('#fc-arr_now .field-lbl'))
        await pg.evaluate("() => runAnalysis()"); await pg.wait_for_selector('#rp-overview .kpi-v', timeout=30000); await pg.wait_for_timeout(400)
        head = await pg.inner_text('.res-hero')
        check('Europe: the report header names the market and the data date', 'Europe (€)' in head and 'market data 2026-11-18' in head, head[:300])
        check('Europe: report figures are in euros', '€3.94M' in await pg.inner_text('#rp-overview'))
        md = await pg.evaluate("() => [...document.querySelectorAll('#rp-bench .md-tbl tbody tr')].map(r => [r.cells[0].textContent, r.cells[2].querySelector('a') ? r.cells[2].querySelector('a').href : '', r.cells[3].textContent, r.cells[4].textContent])")
        check('Benchmarks: every market figure is listed with its source, link, date and use', len(md) >= 6 and all(r[3] for r in md), md[:3])
        fx = next((r for r in md if r[0].startswith('Exchange rate')), None)
        check('Europe: the ECB exchange rate is listed with its link and date, and feeds the results', fx and 'ecb.europa.eu' in fx[1] and fx[2] == '2026-11-18' and 'feeds the results' in fx[3], fx)
        ex = next((r for r in md if r[0].startswith('Exit multiple')), None)
        check('Europe: no verified European multiple, said plainly (built-in value used)', ex and 'built-in value used' in ex[3] and ex[1] == '', ex)
        note = await pg.inner_text('#rp-deal .md-deal')
        check('under the returns: the exit multiple used and the risk-free rate with its source', '8x, your assumption' in note and 'Risk-free rate: 3.42%' in note and 'ECB' in note, note)
        check('no console error, nothing sent anywhere', not errs and not off, (errs[:3], off[:3]))
        await ctx.close()

        # 3. a newer data file on the site: read, and its multiple feeds a blank exit multiple
        ctx, pg, errs, off = await page(b, base, NEWER)
        check('a newer data file published with the site is used', await pg.evaluate("() => MARKET_SRC === 'live' && MARKET_DATA.updated === '2099-01-02'"))
        await pg.evaluate("() => { loadDemo('northwind'); delete S.vals.exit_multiple_assumption; runAnalysis(); }"); await pg.wait_for_selector('#rp-overview .kpi-v', timeout=30000); await pg.wait_for_timeout(400)
        r = await pg.evaluate("() => ({ mult:S.result.deal.I.exitMult, note:document.querySelector('#rp-deal .md-deal').innerText, head:document.querySelector('.res-hero').innerText })")
        check('left blank, the exit multiple comes from the data file, with its source named', r['mult'] == 6.3 and '6.3x, because the field is blank' in r['note'] and 'test file' in r['note'], r)
        check('the header shows the data file date', 'market data 2099-01-02' in r['head'], r['head'][:200])
        check('items the file does not carry keep their built-in value', await pg.evaluate("() => mdGet('firms_mid', 'eu').value === 250765"))
        check('no console error, nothing sent anywhere', not errs and not off, (errs[:3], off[:3]))
        await ctx.close()

        # 4. a malformed file is refused
        ctx, pg, errs, off = await page(b, base, BROKEN)
        check('a malformed data file is refused: the built-in snapshot stays', await pg.evaluate("() => MARKET_SRC === 'built-in' && defaultExitMultiple() === 4.7"))
        check('no console error, nothing sent anywhere', not errs and not off, (errs[:3], off[:3]))
        await ctx.close()
        await b.close()
    srv.shutdown()
    failed = [r for r in results if not r[0]]
    print(f'{len(results) - len(failed)}/{len(results)} passed')
    _sys.exit(1 if failed else 0)

asyncio.run(main())
