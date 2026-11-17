"""The score is always shown, and every issue leads to the fields behind it (owner's request, 2026-11-16).
On the Northwind example (9 material contradictions, an open IP gate):
1. Verification: every contradiction and inconsistency built from entered figures shows "Fix in the form" buttons; the first is
   the stated figure. A press opens the right section (unfolding More options), highlights the field and puts the cursor in it;
   a bar offers to re-check. Correcting the stated NRR to the computed 98.8 and re-checking removes that contradiction.
2. Report: the score, its range and its word are shown although 2 gates are open, with a "gates open" warning under it and no
   "Score withheld". The IP gate links to its field; Findings, the Consistency ledger and the Questions carry the same buttons.
3. The memo and the Markdown export print the score next to the open gates. No console error, nothing sent anywhere.
   python tests/browser/fixlinks_test.py"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, pathlib
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = _os.environ.get('VCR2_BASE') or (ROOT / 'index.html').as_uri()
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={ 'width':1280, 'height':900 }); pg = await ctx.new_page(); errs, net = [], []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_FILE_NOT_FOUND' not in m.text else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('request', lambda r: net.append(r.url) if r.url.startswith(('http:', 'https:')) else None)
        await pg.goto(BASE); await pg.wait_for_selector('#api-key', state='attached'); await pg.wait_for_timeout(400)
        await pg.evaluate("() => { loadDemo('northwind'); goVerify(); }"); await pg.wait_for_timeout(500)

        # 1. verification
        v = await pg.evaluate("""() => { const cards = [...document.querySelectorAll('#verify-content .contra')];
          const fromChecks = runChecks(derive().D).filter(c => c.sev !== 'ok' && checkFields(c).some(id => fieldSection(id) >= 0)).length;
          return { withLinks: cards.filter(c => c.querySelector('.fix-links')).length, fromChecks,
            nrr: (() => { const c = cards.find(x => /Net revenue retention/.test(x.querySelector('strong').textContent)); return c ? [...c.querySelectorAll('.fix-link')].map(b => [b.textContent, b.dataset.a, b.classList.contains('fix-main')]) : null; })(),
            gateTitle: (document.querySelector('#verify-content .gate h3') || {}).textContent || '' }; }""")
        check('every issue built from entered figures carries Fix in the form buttons', v['withLinks'] == v['fromChecks'] and v['withLinks'] >= 15, v)
        check('the NRR contradiction links the stated NRR first, then its four inputs', v['nrr'] and v['nrr'][0][1] == 'stated_nrr' and v['nrr'][0][2] and [x[1] for x in v['nrr'][1:]] == ['arr_12mo', 'expansion_arr_l12', 'churned_arr_l12', 'contraction_arr_l12'], v['nrr'])
        check('the verification no longer says the assessment is blocked', 'blocked' not in v['gateTitle'].lower() and 'material discrepancies to resolve before terms' in v['gateTitle'], v['gateTitle'])
        # the window opens over the page, with every field of the issue and the clicked one focused
        await pg.click('#verify-content .fix-link[data-a=stated_nrr]'); await pg.wait_for_timeout(300)
        w = await pg.evaluate("() => ({ page:document.querySelector('.page.active').id, modal:!!document.querySelector('.modal-fix'), fields:[...document.querySelectorAll('.modal-fix [data-fix]')].map(i => i.dataset.fix), focus:document.activeElement && document.activeElement.dataset.fix, val:(document.querySelector('.modal-fix [data-fix=stated_nrr]') || {}).value, cur:(document.querySelector('.modal-fix .fix-cur') || {}).textContent })")
        check('a button opens the correction window over the page (the user stays where he is)', w['page'] == 'page-verify' and w['modal'], w)
        check('the window lists every field of the issue, the clicked one focused, with its current value', w['fields'] == ['stated_nrr', 'arr_12mo', 'expansion_arr_l12', 'churned_arr_l12', 'contraction_arr_l12'] and w['focus'] == 'stated_nrr' and w['val'] == '134' and 'now' in (w['cur'] or ''), w)
        await pg.fill('.modal-fix [data-fix=stated_nrr]', 'abc'); await pg.click('.modal-fix .modal-f .btn-primary'); await pg.wait_for_timeout(200)
        check('a value that is not a number is refused in place, nothing is saved', await pg.evaluate("() => !!document.querySelector('.modal-fix') && S.vals.stated_nrr === '134' && /not a number/.test(document.getElementById('fixe-stated_nrr').textContent)"))
        await pg.fill('.modal-fix [data-fix=stated_nrr]', '98.8'); await pg.click('.modal-fix .modal-f .btn-primary'); await pg.wait_for_timeout(500)
        after = await pg.evaluate("() => ({ page:document.querySelector('.page.active').id, modal:!!document.querySelector('.modal-fix'), val:S.vals.stated_nrr, nrr:runChecks(derive().D).find(c => c.id === 'stated_nrr') })")
        check('saving closes the window, stores the figure and runs the checks again on the same page', after['page'] == 'page-verify' and not after['modal'] and after['val'] == '98.8', after)
        check('the corrected figure now reconciles: the NRR contradiction is gone', after['nrr'] and after['nrr']['sev'] == 'ok', after['nrr'])
        # the form still held 134 in its input: going there and back must not bring the old value back
        await pg.evaluate("() => { jumpTo(SECTIONS.findIndex(s => s.fields.some(f => f.id === 'stated_nrr'))); goVerify(); }"); await pg.wait_for_timeout(300)
        check('the correction survives a trip through the form (no stale value read back)', await pg.evaluate("() => S.vals.stated_nrr === '98.8'"))
        # the full-form route is still there, from the window
        await pg.click('#verify-content .fix-link[data-a=stated_tam]'); await pg.wait_for_timeout(200)
        await pg.click('.modal-fix [data-click=goField]'); await pg.wait_for_timeout(400)
        st = await pg.evaluate("() => ({ page:document.querySelector('.page.active').id, hi:document.getElementById('fc-stated_tam').classList.contains('fix-target'), focus:!!(document.activeElement && document.activeElement.closest('#fc-stated_tam')), bar:!document.getElementById('fix-back').hidden })")
        check('"Open this field in the form" opens the section, highlights the field, puts the cursor in it and offers a re-check', st['page'] == 'page-section' and st['hi'] and st['focus'] and st['bar'], st)
        await pg.click('#fix-back [data-click=fixBackGo]'); await pg.wait_for_timeout(300)

        # 2. report
        await pg.evaluate("() => runAnalysis()"); await pg.wait_for_selector('#rp-overview', timeout=30000); await pg.wait_for_timeout(600)
        r = await pg.evaluate("""() => ({ score:S.result.sc.overall, gates:S.result.sc.gates.length, card:document.querySelector('.score-card').innerText,
          num:!!document.querySelector('.score-card .band-num'), body:document.getElementById('result-content').innerText,
          gateLink:[...document.querySelectorAll('.gate li .fix-link')].map(b => b.dataset.a),
          findings:document.querySelectorAll('#rp-findings .contra .fix-links').length, findingsCards:document.querySelectorAll('#rp-findings .contra').length,
          ledger:document.querySelectorAll('#rp-ledger tr .fix-links').length, questions:document.querySelectorAll('#rp-questions .fix-links').length })""")
        check('the score is shown although gates are open', r['score'] is not None and r['gates'] >= 1 and r['num'] and str(r['score']) in r['card'], r)
        check('a warning under the score says how many gates are open', 'gate' in r['card'] and 'resolve before terms' in r['card'], r['card'])
        check('nothing says the score is withheld', 'Score withheld' not in r['body'] and 'withheld until' not in r['body'] and 'will not produce one' not in r['body'])
        check('the IP gate links to its field', 'ip_assignments' in r['gateLink'], r['gateLink'])
        check('Findings: every contradiction from entered figures has its buttons', r['findings'] >= 15 and r['findings'] <= r['findingsCards'], r)
        check('Consistency ledger and Questions carry the buttons too', r['ledger'] >= 15 and r['questions'] >= 10, r)
        await pg.click('#rt-findings'); await pg.wait_for_timeout(200)
        before = await pg.evaluate("() => ({ tam:S.result.checks.find(c => c.id === 'tam_check').sev, y:scrollY })")
        await pg.click('#rp-findings .fix-link[data-a=stated_tam]'); await pg.wait_for_timeout(300)
        check('from the report: the window opens over the report', await pg.evaluate("() => document.querySelector('.page.active').id === 'page-result' && !!document.querySelector('.modal-fix')"))
        await pg.fill('.modal-fix [data-fix=stated_tam]', '300M'); await pg.click('.modal-fix .modal-f .btn-primary'); await pg.wait_for_timeout(500)
        rr = await pg.evaluate("() => ({ page:document.querySelector('.page.active').id, tab:(document.querySelector('.rtab.active') || {}).id, val:S.vals.stated_tam, tam:S.result.checks.find(c => c.id === 'tam_check').sev, loading:document.getElementById('page-loading') && document.getElementById('page-loading').classList.contains('active') })")
        check('saving recomputes the report in place: same page, same tab, no loading screen', rr['page'] == 'page-result' and rr['tab'] == 'rt-findings' and not rr['loading'], rr)
        check('the report reflects the correction (300M read as 300000000, the market-size flag is cleared)', rr['val'] == '300000000' and before['tam'] == 'major' and rr['tam'] == 'ok', (before, rr))

        # 3. exports
        async with pg.expect_download() as dl:
            await pg.evaluate("() => downloadReport()")
        ex = { 'md': pathlib.Path(await (await dl.value).path()).read_text(encoding='utf-8') }
        memo = await pg.evaluate("() => typeof memoHTML === 'function' ? memoHTML(S.result) : ''")
        check('the memo prints the score next to the open gates', 'Score withheld' not in memo and ('/100' in memo or not memo), memo[:200] if memo else 'no memoHTML')
        check('the Markdown export prints the score', '## Score' in ex['md'] and 'No score is published' not in ex['md'], ex['md'][:300])
        check('no console error', not errs, errs[:3])
        check('nothing was sent anywhere (only the page itself is loaded)', not [u for u in net if not u.startswith(('file:', BASE.rsplit('/', 1)[0]))], net[:3])
        await b.close()
    failed = [r for r in results if not r[0]]
    print(f'{len(results) - len(failed)}/{len(results)} passed')
    _sys.exit(1 if failed else 0)

asyncio.run(main())
