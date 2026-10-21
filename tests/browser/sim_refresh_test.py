"""The simulation must always reach the report.

Regression for a lost answer: the report is built while the Monte Carlo simulation runs in a background worker. When the worker
answered before the report had been stored, nothing refreshed afterwards and "Odds of next-stage bar" stayed at "simulating in
the background…" for good. Here the worker is wrapped so that its answer arrives after 0, 300, 1,200 and 3,000 ms, and never;
the report is generated through the real "Generate report" handler (with and without the AI memo, which is mocked), on http and
on file://, and the Overview tile and the Runway tab must both end up with the numbers.
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys, pathlib, re, json
from playwright.async_api import async_playwright
import fontroute
BASE = _paths.BASE
FILE_URL = (pathlib.Path(__file__).resolve().parents[2] / 'index.html').as_uri()
FAKE_KEY = 'sk-' + 'A' * 40
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))

INIT = """
(() => {
  const Real = window.Worker; if (!Real) return;
  window.__workers = 0;
  window.Worker = class {
    constructor(u) {
      window.__workers++;
      this._w = new Real(u); this.onmessage = null; this.onerror = null;
      this._w.onmessage = e => {
        const d = window.__simDelay;
        if (d === Infinity) return;                       /* a worker that never answers */
        setTimeout(() => { if (this.onmessage) this.onmessage(e); }, d || 0);
      };
      this._w.onerror = e => { if (this.onerror) this.onerror(e); };
    }
    postMessage(m) { this._w.postMessage(m); }
    terminate() { this._w.terminate(); }
  };
})();
"""

STATE = """() => { const p = $id('page-result'); const t = p ? p.textContent : '';
  return { active: !!p && p.classList.contains('active'), waiting: /simulating in the background/.test(t), pending: !!(S.result && S.result.proj && S.result.proj.simPending),
           hasSim: !!(S.result && S.result.proj && S.result.proj.sim), odds: /Odds of next-stage bar/.test(t) }; }"""

async def new_page(b, url, delay, errs, provider_bodies=None):
    ctx = await b.new_context(viewport={'width': 1360, 'height': 900})
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script(INIT)
    await pg.add_init_script(f"window.__simDelay = {'Infinity' if delay is None else delay};")
    if url.startswith('http'): await fontroute.install(pg)
    if provider_bodies is not None:
        async def mock(route):
            provider_bodies.append(route.request.post_data or '')
            await route.fulfill(status=200, json={'content': [{'type': 'text', 'text': 'Paragraph one.\n\nParagraph two.'}]})
        await pg.route('https://api.anthropic.com/**', mock)
    await pg.goto(url); await pg.wait_for_selector('#api-key', state='attached')
    return ctx, pg

async def run_case(b, label, url, delay, memo=False, limit=15000):
    errs, bodies = [], [] if memo else None
    ctx, pg = await new_page(b, url, delay, errs, bodies)
    await pg.evaluate("() => { loadHalcyon(); }")
    if memo:
        await pg.evaluate("""(k) => { const s = $id('api-provider'); s.value = 'anthropic'; s.dispatchEvent(new Event('change'));
                                      const i = $id('api-key'); i.value = k; i.dispatchEvent(new Event('input'));
                                      $id('memo-toggle').checked = true; }""", FAKE_KEY)
    await pg.evaluate("() => { window.__go = runAnalysis(); }")
    # the report page shows up once the handler is done; then give the simulation up to `limit` ms
    waited = 0; st = None
    while waited < limit:
        await pg.wait_for_timeout(250); waited += 250
        st = await pg.evaluate(STATE)
        if st['active'] and not st['waiting'] and st['hasSim']: break
    check(f'{label}: the report is shown', st and st['active'], st)
    check(f'{label}: "Odds of next-stage bar" has its number (took about {waited / 1000:.1f} s)', st and st['hasSim'] and not st['waiting'] and st['odds'], st)
    await pg.evaluate("() => goTab('runway')"); await pg.wait_for_timeout(200)
    run = await pg.evaluate("() => { const t = $id('page-result').textContent; return { running: /simulated paths in the background|fills in/.test(t), fan: /P\\(|median|Median|runway/i.test(t) }; }")
    check(f'{label}: the Runway tab shows the simulation, not the waiting note', not run['running'] and run['fan'], run)
    if memo:
        check(f'{label}: the memo prompt carried the simulation figures', bodies and any('Monte Carlo' in x for x in bodies), [x[:80] for x in (bodies or [])])
        mem = await pg.evaluate("() => !!(S.result && S.result.memo)")
        check(f'{label}: the memo was kept through the refresh', mem)
    check(f'{label}: no page errors', not errs, errs)
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for url_label, url in [('http', BASE), ('file://', FILE_URL)]:
            for d in (0, 150, 300, 500, 1200, 3000):
                await run_case(b, f'{url_label}, worker answers after {d} ms', url, d)
        await run_case(b, 'http, AI memo on, worker answers after 300 ms', BASE, 300, memo=True)
        await run_case(b, 'file://, AI memo on, worker answers after 1,200 ms', FILE_URL, 1200, memo=True)
        await run_case(b, 'http, a worker that never answers (watchdog after 10 s)', BASE, None, limit=16000)
        # a second report in the same page (change an input and run again) must not be stuck either
        errs = []
        ctx, pg = await new_page(b, BASE, 300, errs)
        await pg.evaluate("() => { loadHalcyon(); window.__go = runAnalysis(); }")
        await pg.wait_for_function("() => { const p = $id('page-result'); return p && p.classList.contains('active') && !/simulating in the background/.test(p.textContent) && S.result.proj.sim; }", timeout=15000)
        await pg.evaluate("() => { resetAssumptions(); }")      # a second simulation started from the report itself
        await pg.wait_for_timeout(2500)
        st = await pg.evaluate(STATE)
        check('a second run in the same page also ends with its numbers', st['hasSim'] and not st['waiting'], st)
        check('no page errors in the second run', not errs, errs)
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')
    sys.exit(1 if bad else 0)

asyncio.run(main())
