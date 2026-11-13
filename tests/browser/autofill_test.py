"""Structured files fill the form by themselves (v5.3): the customer ledger and the monthly financials, loaded in their own
boxes or dropped into Smart fill (Spanish files, local month names and headers), fill the empty form fields; a figure typed
by hand stays; the financials card has its own fill button that overwrites on request. No console error, zero requests.
   python tests/browser/autofill_test.py"""
import os as _os, sys as _sys, base64, pathlib
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
Q, ES = ROOT / 'tests' / 'fixtures' / 'quillstone', ROOT / 'tests' / 'fixtures' / 'quillstone-intl' / 'es'
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))
near = lambda a, b: a is not None and abs(float(a) - b) <= max(abs(b) * 0.006, 1)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(); errs, net = [], []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_FILE_NOT_FOUND' not in m.text else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('request', lambda r: net.append(r.url) if r.url.startswith(('http:', 'https:')) else None)
        await pg.goto((ROOT / 'index.html').as_uri()); await pg.wait_for_selector('#api-key', state='attached'); await pg.wait_for_timeout(400)
        await pg.evaluate("() => { showPage('intake'); }")
        # 1. the ledger box: no button press needed any more
        await pg.evaluate("(t) => loadLedgerText(t, '04-customer-ledger.csv')", (Q / '04-customer-ledger.csv').read_text(encoding='utf-8'))
        led = await pg.evaluate("() => Object.keys(S.prov).filter(k => S.prov[k].src === 'ledger')")
        check('the ledger fills the empty form fields by itself (13)', len(led) == 13, led)
        check('ARR today from the ledger is $15.6M', near(await pg.evaluate("() => S.vals.arr_now"), 15600000), await pg.evaluate("() => S.vals.arr_now"))
        check('new customers in the last 12 months now come from the ledger too', await pg.evaluate("() => S.prov.new_customers_l12 && S.prov.new_customers_l12.src") == 'ledger')
        # 2. the financials box: a typed cash figure stays, the rest is filled, the card offers its own button
        await pg.evaluate("() => { S.vals.cash_on_hand = '9000000'; delete S.prov.cash_on_hand; }")
        await pg.evaluate("(t) => loadSeriesText(t, '05-monthly-financials.csv')", (Q / '05-monthly-financials.csv').read_text(encoding='utf-8'))
        ser = await pg.evaluate("() => Object.keys(S.prov).filter(k => S.prov[k].src === 'series').sort()")
        check('the monthly financials fill the other empty fields (4: net and gross burn, headcount now and a year ago)', ser == ['gross_burn', 'headcount_12mo', 'headcount_now', 'net_burn'], ser)
        check('a cash figure typed by hand is left alone', await pg.evaluate("() => S.vals.cash_on_hand") == '9000000')
        check('net burn is the last three months of the financials ($958K)', near(await pg.evaluate("() => S.vals.net_burn"), 958133), await pg.evaluate("() => S.vals.net_burn"))
        card = await pg.inner_text('#series-status')
        check('the financials card has "Fill the form from the financials" and says one field was filled another way', 'Fill the form from the financials' in card and 'already filled another way' in card, card[:300])
        await pg.click('#series-status button[data-click=fillSeries]'); await pg.wait_for_timeout(200)
        check('the button overwrites on request: cash is now the financials\' $9.4M', near(await pg.evaluate("() => S.vals.cash_on_hand"), 9400000), await pg.evaluate("() => S.vals.cash_on_hand"))
        check('figures from the financials count as a system export', await pg.evaluate("() => evidenceOf('net_burn')") == 'export')
        # 3. the same two files in Spanish, dropped into Smart fill instead of their boxes
        await pg.evaluate("() => { S.ledger = null; S.series = null; S.vals = {}; S.prov = {}; S.evid = {}; CFG.settings.smartfill = { enabled:true }; _sfDict = null; renderIntakeStatus(); }")
        data = {f: base64.b64encode((ES / f).read_bytes()).decode() for f in ['04-registro-clientes.csv', '05-financieros-mensuales.csv']}
        await pg.evaluate("(d) => sfAddFiles(Object.entries(d).map(([n, b]) => new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], n)))", data)
        await pg.click('#sf-read'); await pg.wait_for_timeout(2500)
        st = await pg.evaluate("() => ({ ledger:!!S.ledger, series:!!S.series, fromLedger:Object.keys(S.prov).filter(k => S.prov[k].src === 'ledger').length, fromSeries:Object.keys(S.prov).filter(k => S.prov[k].src === 'series').length, arr:S.vals.arr_now, cash:S.vals.cash_on_hand })")
        check('Spanish ledger dropped in Smart fill: loaded in the ledger box, 13 fields filled', st['ledger'] and st['fromLedger'] == 13, st)
        check('Spanish financials dropped in Smart fill: loaded, 5 fields filled (cash $9.4M)', st['series'] and st['fromSeries'] == 5 and near(st['cash'], 9400000), st)
        check('no console error', not errs, errs[:3])
        check('zero network requests', not net, net[:3])
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'{len(results) - len(bad)}/{len(results)} passed')
    _sys.exit(1 if bad else 0)

asyncio.run(main())
