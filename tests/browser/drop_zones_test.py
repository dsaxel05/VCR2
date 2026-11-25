"""Every drop zone on the source material page, with real drag-and-drop events: the customer ledger, the monthly financials,
the narrative files and Smart fill. A file dropped on a zone reaches it; a file dropped anywhere else on the page never makes
the browser open it and leave VCR2; no console error."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio
from playwright.async_api import async_playwright
BASE = _paths.BASE
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))

LEDGER = 'customer_id,month,mrr\n' + '\n'.join(f'c{c},2026-{m:02d},{1000 + 10 * c + 5 * m}' for c in range(1, 9) for m in range(1, 13))
SERIES = 'month,revenue,cash,burn,expenses,headcount\n2026-01,210000,6400000,290000,500000,31\n2026-02,221000,6120000,280000,501000,32\n2026-03,236000,5830000,290000,526000,33\n'
DROP = """([sel, name, text]) => { const dt = new DataTransfer(); dt.items.add(new File([text], name, { type:'text/plain' }));
  const el = document.querySelector(sel); const over = new DragEvent('dragover', { dataTransfer:dt, bubbles:true, cancelable:true }); el.dispatchEvent(over);
  const drop = new DragEvent('drop', { dataTransfer:dt, bubbles:true, cancelable:true }); el.dispatchEvent(drop); return [over.defaultPrevented, drop.defaultPrevented]; }"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(); errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_selector('#api-key', state='attached')
        await pg.evaluate("() => { showPage('intake'); renderIntakeStatus(); }")
        r = await pg.evaluate(DROP, ['#ledger-drop', 'ledger.csv', LEDGER]); await pg.wait_for_timeout(600)
        check('customer ledger zone: a dropped CSV is loaded', all(r) and await pg.evaluate("() => !!S.ledger"), r)
        r = await pg.evaluate(DROP, ['#series-drop', 'monthly.csv', SERIES]); await pg.wait_for_timeout(600)
        check('monthly financials zone: a dropped CSV is loaded', all(r) and await pg.evaluate("() => !!S.series"), r)
        r = await pg.evaluate(DROP, ['#dropzone', 'notes.md', 'ARR is $2.4M']); await pg.wait_for_timeout(600)
        check('narrative files zone: a dropped file is listed', all(r) and await pg.evaluate("() => S.files.some(f => f.name === 'notes.md')"), r)
        r = await pg.evaluate(DROP, ['#sf-drop', 'deck.txt', 'ARR $1.2M']); await pg.wait_for_timeout(300)
        check('Smart fill zone: a dropped file is added', all(r) and await pg.evaluate("() => SFS.files.some(f => f.name === 'deck.txt')"), r)
        r = await pg.evaluate(DROP, ['#sf-guide', 'model.csv', 'ARR,1']); await pg.wait_for_timeout(300)
        check('Smart fill block: a file dropped beside the zone is added too', r[1] and await pg.evaluate("() => SFS.files.some(f => f.name === 'model.csv')"), r)
        for sel in ['body', 'header, .topbar, #topbar', 'h1, h2']:
            r = await pg.evaluate(DROP.replace('document.querySelector(sel)', 'document.querySelector(sel) || document.body'), [sel, 'stray.pdf', 'x'])
            check(f'a file dropped on "{sel}" does not make the browser leave VCR2', r == [True, True], r)
        check('the page did not navigate away', pg.url.startswith(BASE.split('#')[0].rsplit('/', 1)[0]), pg.url)
        check('no console error', not errs, errs)
        await b.close()

asyncio.run(main())
fails = [r for r in results if not r[0]]
print(f'{len(results) - len(fails)}/{len(results)} passed')
_sys.exit(1 if fails else 0)
