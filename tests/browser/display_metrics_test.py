"""Display-only metrics in the report (5.0.8): the "All metrics" tab lists sales efficiency, churn mix, the ARR the next round
needs and the projected ARR at 6 months of runway, with their formulas and flags, for the Northwind example; nothing is scored."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio
from playwright.async_api import async_playwright
BASE = _paths.BASE
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(); errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_timeout(300)
        await pg.evaluate("loadDemo('northwind')")
        for _ in range(40):
            if await pg.evaluate("!!document.querySelector('#page-verify.active')"): break
            await pg.evaluate("nextSec()")
        await pg.evaluate("runAnalysis()"); await pg.wait_for_function("() => document.querySelector('#page-result.active')", timeout=30000)
        await pg.evaluate("document.getElementById('rt-metrics').click()"); await pg.wait_for_timeout(300)
        rows = await pg.evaluate("""() => Object.fromEntries(Array.from(document.querySelectorAll('#rp-metrics tr')).map(r => Array.from(r.cells).map(c => c.innerText.trim())).filter(c => c.length === 3).map(c => [c[0], c.slice(1)]))""")
        want = {'Sales efficiency (net new ARR ÷ S&M)': ('0.47', 'flagged: below your 0.5'), 'Churn mix (logo ÷ revenue churn)': ('1.04', 'logo churn ÷ revenue churn'),
                'ARR the next round needs': ('7.50M', '10x ARR (your next-round multiple)'), 'Projected ARR at 6 months of runway': ('6.82M', 'down-round risk')}
        for label, (val, formula) in want.items():
            r = rows.get(label)
            check(f'"{label}" shows {val} with its formula', r is not None and val in r[0] and formula in r[1], r)
        scored = await pg.evaluate("Array.from(document.querySelectorAll('#rp-metrics table')[0].querySelectorAll('td:first-child')).map(t => t.innerText)")
        check('none of them is in the scored table', not any(any(k in s for k in ['Sales efficiency', 'Churn mix', 'next round', 'Projected ARR']) for s in scored), scored)
        txt = await pg.evaluate("document.getElementById('rp-metrics').innerText")
        check('no NaN, Infinity or undefined', not any(x in txt for x in ['NaN', 'Infinity', 'undefined']))
        check('no console errors or warnings', not errs, errs[:3])
        await b.close()
    n = sum(1 for r in results if r[0]); print(f'{n}/{len(results)} passed')
    _sys.exit(0 if n == len(results) else 1)

asyncio.run(main())
