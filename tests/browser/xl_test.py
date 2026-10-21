import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from playwright.async_api import async_playwright
import fontroute
URL = _paths.BASE
XL = _paths.XL
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {info}'))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await fontroute.install(pg)
        await pg.goto(URL); await pg.wait_for_timeout(400)
        await pg.evaluate("() => { S.name='XL test'; showPage('intake'); renderIntakeStatus(); }")
        # 1. wide ledger with date headers via the file chooser
        async with pg.expect_file_chooser() as fc:
            await pg.click('#ledger-drop')
        await (await fc.value).set_files(XL + 'ledger_dates.xlsx')
        await pg.wait_for_function('() => !!S.ledger', timeout=5000)
        led = await pg.evaluate("() => ({ n:S.ledger.customers.length, m0:S.ledger.months[0], m1:S.ledger.months[S.ledger.months.length-1], file:S.ledger.file, acme:S.ledger.customers.some(c => c.name.includes('Acme')) })")
        check('xlsx ledger: 30 customers', led['n'] == 30, led)
        check('xlsx ledger: date header → 2025-01', led['m0'] == '2025-01', led)
        check('xlsx ledger: last month 2026-02', led['m1'] == '2026-02', led)
        check('xlsx ledger: picks the MRR sheet, skips hidden', 'MRR by customer' in led['file'], led)
        check('xlsx ledger: quoted name with comma survives', led['acme'], led)
        # 2. series with 1904 dates via drop event (DataTransfer)
        data = open(XL + 'series_1904.xlsx', 'rb').read()
        await pg.evaluate("""async (bytes) => {
          const f = new File([new Uint8Array(bytes)], 'series_1904.xlsx');
          const dt = new DataTransfer(); dt.items.add(f);
          document.getElementById('series-drop').dispatchEvent(new DragEvent('drop', { dataTransfer:dt, bubbles:true, cancelable:true }));
        }""", list(data))
        await pg.wait_for_function('() => !!S.series', timeout=5000)
        ser = await pg.evaluate("() => ({ n:S.series.months.length, m0:S.series.months[0], cash0:S.series.cash[0], hc:S.series.headcount[11] })")
        check('xlsx series (1904 dates): 12 months from 2025-01', ser['n'] == 12 and ser['m0'] == '2025-01', ser)
        check('xlsx series: values', ser['cash0'] == 6400000 and ser['hc'] == 41, ser)
        # 3. formulas with cached values
        r = await pg.evaluate("""async (bytes) => { const x = await sheetFileToCSV(new File([new Uint8Array(bytes)], 'f.xlsx'), 'series'); return x.csv; }""", list(open(XL + 'f.xlsx', 'rb').read()))
        check('xlsx formulas: cached values read', '110000' in r and '4750000' in r, r)
        # 4. inline strings + percent format stays numeric
        r = await pg.evaluate("""async (bytes) => { const x = await sheetFileToCSV(new File([new Uint8Array(bytes)], 'inline.xlsx'), 'library'); return x.csv; }""", list(open(XL + 'inline.xlsx', 'rb').read()))
        rp = await pg.evaluate("""async (bytes) => { const x = await sheetFileToCSV(new File([new Uint8Array(bytes)], 'pct.xlsx'), 'library'); return x.csv; }""", list(open(XL + 'pct.xlsx', 'rb').read()))
        check('xlsx percent cells read as shown (150%)', '150%' in rp and '115%' in rp and '1.5,' not in rp, rp)
        check('xlsx inline strings', r.startswith('company,stage,arr') and 'Alpha AI' in r and '1.15' in r, r)
        # 5. legacy .xls is refused politely
        async with pg.expect_file_chooser() as fc:
            await pg.click('#ledger-drop')
        await (await fc.value).set_files(XL + 'ledger.xls')
        await pg.wait_for_timeout(300)
        t = await pg.evaluate("() => document.getElementById('toast').textContent")
        check('legacy .xls explained', 'Save As' in t, t)
        # 6. a non-xlsx file renamed .xlsx
        r = await pg.evaluate("""async () => { try { await sheetFileToCSV(new File(['hello,world'], 'bad.xlsx'), 'ledger'); return 'no error'; } catch (e) { return e.message; } }""")
        check('garbage .xlsx gives a clear error', 'not a valid' in r, r)
        check('no page errors', not errs, errs)
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')

asyncio.run(main())
