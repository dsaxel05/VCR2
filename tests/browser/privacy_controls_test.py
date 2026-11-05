"""v5.0.15 controls in a real browser: the "Use for calibration" checkbox (native, labelled, keyboard), the flagged counter,
the "Evidence levels came from the imported file" banner, the two-step "Erase everything" button (no browser dialog, no vcr*
storage left, also after the reload), translate="no" on the form and the report, the 7-day remember line, no console error and
no request to any other site."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, json
from playwright.async_api import async_playwright
BASE = _paths.BASE
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))

LIB = [{'id': f'c{i}', 'company': f'Comp {i}', 'stage': 'a', 'model': 'saas', 'metrics': {'nrr': 100 + i, 'arr': 3e6}, 'source': 'csv', 'calibrate': i < 6} for i in range(9)] + \
      [{'id': 'syn1', 'company': 'Synthetic Series A 01', 'stage': 'a', 'model': 'saas', 'metrics': {'nrr': 90}, 'source': 'synthetic'}]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        pg = await ctx.new_page(); errs, hosts, dialogs = [], set(), []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: (dialogs.append(d.message), asyncio.ensure_future(d.dismiss())))
        pg.on('request', lambda r: hosts.add(r.url.split('/')[2].split(':')[0]) if r.url.startswith('http') else None)
        await pg.goto(BASE); await pg.wait_for_selector('#api-key', state='attached')

        # translate="no" on everything that shows deal content
        tr = await pg.evaluate("() => ['page-intake', 'page-section', 'page-verify', 'page-result', 'page-library'].map(id => document.getElementById(id).getAttribute('translate'))")
        check('the form, verification, report and library pages are never machine translated', tr == ['no'] * 5, tr)
        rem = await pg.evaluate("() => document.getElementById('api-remember').closest('label').textContent + ' ' + document.getElementById('api-remember-hint').textContent")
        check('the remember box says 7 days and own computer only', '7 days' in rem and 'only on your own computer' in rem, rem)

        # library: checkbox, counter
        await pg.evaluate("(l) => { localStorage.setItem(LIB_KEY, JSON.stringify(l)); _calCache = null; goLibrary(); }", LIB)
        boxes = await pg.evaluate("() => Array.from(document.querySelectorAll('#lib-table input[type=checkbox][data-change=libSetFlag]')).map(c => [c.getAttribute('aria-label'), c.checked])")
        check('one native checkbox per real company, labelled with its name', len(boxes) == 9 and all(l == f'Use Comp {int(l.split()[2])} for calibration' for l, _ in boxes), boxes)
        check('the column header says Use for calibration', await pg.locator('#lib-table th', has_text='Use for calibration').count() == 1)
        check('a synthetic company has no checkbox', await pg.evaluate("() => !document.querySelector('[data-a=\"syn1\"][data-change=libSetFlag]')"))
        cnt = await pg.text_content('#cal-count')
        check('the counter says 6 of 8 flagged at Series A', '6 of 8 flagged at Series A' in cnt, cnt)
        st = await pg.text_content('.calib-card')
        check('the calibration text says only flagged companies are used', 'Uses only companies you flag' in st and 'Not active yet' in st, st[:300])
        # keyboard: focus the box for Comp 7 and press Space twice (flag, then the counter moves)
        sel = '[data-change="libSetFlag"][data-a="c7"]'
        await pg.focus(sel); await pg.keyboard.press('Space'); await pg.wait_for_timeout(150)
        flags = await pg.evaluate("() => libLoad().filter(x => x.calibrate).length")
        check('Space on the focused checkbox flags the company', flags == 7, flags)
        check('focus stays on the same checkbox after the redraw', await pg.evaluate("(s) => document.activeElement === document.querySelector(s)", sel))
        await pg.keyboard.press('Shift+Tab'); await pg.keyboard.press('Tab')
        check('and the checkbox is reachable with Tab', await pg.evaluate("(s) => document.activeElement === document.querySelector(s)", sel))
        check('the counter follows', '7 of 8 flagged at Series A' in await pg.text_content('#cal-count'))
        await pg.click('[data-change="libSetFlag"][data-a="c8"]'); await pg.wait_for_timeout(150)
        check('eight flagged: the counter shows 8 flagged and calibration becomes available', '8 flagged at Series A' in await pg.text_content('#cal-count') and await pg.evaluate("() => calibrationStatus().used.length > 0"))
        await pg.click('button:has-text("Unflag all shown")'); await pg.wait_for_timeout(150)
        check('Unflag all shown clears every flag', await pg.evaluate("() => libLoad().every(x => !x.calibrate)"))
        await pg.fill('#lib-filter', 'Comp 1'); await pg.wait_for_timeout(100)
        await pg.click('button:has-text("Flag all shown")'); await pg.wait_for_timeout(150)
        check('Flag all shown flags only the rows the filter shows', await pg.evaluate("() => libLoad().filter(x => x.calibrate).map(x => x.id)") == ['c1'])

        # imported deal file with evidence marks: kept, and a banner says where they came from
        await pg.evaluate("""() => { restorePayload({ name:'Shared Co', stage:'a', vals:{ arr_now:'4200000', arr_12mo:'2000000' }, evid:{ arr_now:'audited' } });
                                     markImported(); goVerify(); showPage('verify'); }""")
        v = await pg.text_content('#verify-content')
        check('verification page: banner after an imported file with evidence marks', 'Evidence levels came from the imported file' in v)
        check('and the marks are kept', await pg.evaluate("() => S.evid.arr_now") == 'audited')
        await pg.evaluate("() => { S.result = assessAll(); renderResult(S.result); showPage('result'); }")
        check('report: the same banner', 'Evidence levels came from the imported file' in await pg.text_content('#result-content'))
        await pg.evaluate("() => { restorePayload({ name:'Own Co', vals:{ arr_now:'4200000' } }); markImported(); goVerify(); }")
        check('no banner for a file without marks', 'Evidence levels came from' not in await pg.text_content('#verify-content'))

        # erase everything: two steps, inline, no browser dialog
        await pg.evaluate("() => { saveDraft(); sessionStorage.setItem('vcr3-key', 'sk-ant-' + 'A'.repeat(40)); localStorage.setItem('vcr3-provider', 'anthropic'); toggleSidebar && toggleSidebar(true); }")
        before = await pg.evaluate("() => Object.keys(localStorage).filter(k => /^vcr/i.test(k)).length")
        check('there is something to erase', before >= 3, before)
        btn = pg.locator('#erase-btn')
        check('the erase button is labelled plainly', (await btn.text_content()).strip() == 'Erase everything VCR2 stored in this browser')
        await btn.click(); await pg.wait_for_timeout(100)
        box = await pg.evaluate("() => [getComputedStyle(document.getElementById('erase-box')).display, document.getElementById('erase-btn').getAttribute('aria-expanded'), document.getElementById('erase-box').textContent]")
        check('first click only opens an inline confirmation', box[0] != 'none' and box[1] == 'true' and before == await pg.evaluate("() => Object.keys(localStorage).filter(k => /^vcr/i.test(k)).length"), box[:2])
        check('it warns that the Library goes too and suggests a backup', 'deletes your Library' in box[2] and 'Export a library backup first' in box[2], box[2])
        await pg.click('#erase-box button:has-text("Cancel")'); await pg.wait_for_timeout(100)
        check('Cancel closes it and erases nothing', await pg.evaluate("() => getComputedStyle(document.getElementById('erase-box')).display") == 'none' and before == await pg.evaluate("() => Object.keys(localStorage).filter(k => /^vcr/i.test(k)).length"))
        await btn.click(); await pg.wait_for_timeout(100)
        async with pg.expect_navigation():
            await pg.click('#erase-box button:has-text("Erase now")')
        await pg.wait_for_selector('#api-key', state='attached'); await pg.wait_for_timeout(300)
        left = await pg.evaluate("() => [Object.keys(localStorage).filter(k => /^vcr/i.test(k)), Object.keys(sessionStorage).filter(k => /^vcr/i.test(k))]")
        check('after Erase now and the reload: no vcr* key in localStorage or sessionStorage', left == [[], []], left)
        check('the key box, the deal and the library are empty', await pg.evaluate("() => [$id('api-key').value, S.name, libLoad().length]") == ['', '', 0])
        check('no browser dialog was used', not dialogs, dialogs)

        check('no console error', not errs, errs)
        check('no request to any other site', hosts <= {'127.0.0.1', 'localhost'}, hosts)
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')
    _sys.exit(1 if bad else 0)

asyncio.run(main())
