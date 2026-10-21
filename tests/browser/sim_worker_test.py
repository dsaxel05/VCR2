import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, json
from playwright.async_api import async_playwright
BASE = _paths.BASE
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:400]}'))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        pg = await (await b.new_context(viewport={ 'width':1360, 'height':900 })).new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('https://api.github.com/**', lambda r: r.fulfill(status=404, json={}))
        await pg.goto(BASE); await pg.wait_for_selector('.hero', state='attached')
        # same numbers from the worker and from the main thread
        r = await pg.evaluate("""async () => {
          loadHalcyon();
          const sync = assessAll().proj.sim;                 // main thread, fills the cache
          SIM_CACHE.clear();
          SIM_ASYNC = true; const first = assessAll(); SIM_ASYNC = false;
          const pending = first.proj.simPending === true && first.proj.sim === null;
          await new Promise(res => { const t = setInterval(() => { if (SIM_CACHE.size) { clearInterval(t); res(); } }, 20); setTimeout(res, 5000); });
          const after = assessAll().proj.sim;
          return { pending, same: JSON.stringify(sync) === JSON.stringify(after), p: after && after.pMilestone, n: after && after.N };
        }""")
        check('the first answer says the simulation is running', r['pending'])
        check('the worker gives exactly the main-thread numbers', r['same'], r)
        # the report redraws itself when the worker finishes
        r2 = await pg.evaluate("""async () => {
          SIM_CACHE.clear(); loadHalcyon(); S.result = assessUI(); showPage('result'); renderResult(S.result);
          const before = document.getElementById('result-content').innerText.includes('simulating in the background');
          await new Promise(res => { const t = setInterval(() => { if (SIM_CACHE.size) { clearInterval(t); setTimeout(res, 50); } }, 20); setTimeout(res, 5000); });
          const after = document.getElementById('result-content').innerText.includes('simulating in the background');
          return { before, after, hasSim: !!S.result.proj.sim };
        }""")
        check('the report shows a note while it runs', r2['before'], r2)
        check('and fills in when it finishes', not r2['after'] and r2['hasSim'], r2)
        # the main thread is not blocked: a long task check around the simulation
        r3 = await pg.evaluate("""async () => {
          SIM_CACHE.clear(); loadNorthwind();
          const longs = []; const po = new PerformanceObserver(l => l.getEntries().forEach(e => longs.push(Math.round(e.duration)))); po.observe({ type:'longtask', buffered:false });
          S.result = assessUI();
          await new Promise(res => setTimeout(res, 600)); po.disconnect();
          return { longs };
        }""")
        check('no long task around an assessment', max(r3['longs'] or [0]) < 100, r3)
        check('no page errors', not errs, errs)
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'{chr(10)}{len(results) - len(bad)}/{len(results)} passed')

if __name__ == '__main__':
    asyncio.run(main())
