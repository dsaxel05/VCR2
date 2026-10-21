import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from playwright.async_api import async_playwright
import fontroute
results = []
def check(name, ok, info=''):
    results.append(ok); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':1360,'height':900}, accept_downloads=True)
        pg = await ctx.new_page(); await fontroute.install(pg)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(_paths.FILE_URL); await pg.wait_for_timeout(300)
        # the new form sections render
        await pg.evaluate("() => { loadDemo('northwind'); jumpTo(SECTIONS.findIndex(s => s.id === 'exits')); }")
        t = await pg.inner_text('#section-content')
        check('Exit scenarios section renders', 'target annual return' in t.lower() and 'first chicago' in t.lower(), t[:200])
        await pg.evaluate("() => jumpTo(SECTIONS.findIndex(s => s.id === 'deal'))")
        await pg.click('.more-options > summary')   # secondary fields sit behind "More options"
        t = (await pg.inner_text('#section-content')).lower()
        check('Term sheet group renders', 'anti-dilution' in t and 'participation cap' in t and 'note valuation cap' in t, t[:300])
        await pg.evaluate("() => jumpTo(SECTIONS.findIndex(s => s.id === 'market'))")
        await pg.click('.more-options > summary')   # secondary fields sit behind "More options"
        t = (await pg.inner_text('#section-content')).lower()
        check('PMF and moat fields render', 'very disappointed' in t and 'net promoter score' in t and 'why now' in t)
        # full run through the UI pipeline
        await pg.evaluate("() => goVerify()"); await pg.wait_for_timeout(200)
        await pg.evaluate("() => runAnalysis()"); await pg.wait_for_function("() => document.getElementById('page-result').classList.contains('active')", timeout=15000)
        ov = await pg.inner_text('#rp-overview')
        check('risk map on the overview', 'RISK MAP' in ov.upper() and 'Financial & reporting' in ov and 'Deal & structure' in ov, ov[:200])
        await pg.evaluate("() => goTab('deal')")
        dl = await pg.inner_text('#rp-deal')
        check('returns block', 'VC METHOD' in dl.upper() and 'Probability-weighted' in dl and 'First Chicago' in dl)
        check('term-sheet review', 'TERM-SHEET REVIEW' in dl.upper() and 'Broad-based weighted average' in dl)
        await pg.evaluate("() => goTab('checklist')")
        before = await pg.inner_text('#cl-progress')
        await pg.select_option('tr[data-cl="fin_model"] select', 'received')
        after = await pg.inner_text('#cl-progress')
        st = await pg.evaluate("() => S.checklist.fin_model")
        check('checklist status saved and progress updates', st == 'received' and before != after, [before, after, st])
        await pg.select_option('tr[data-cl="ref_checks"] select', 'issue')
        rowcls = await pg.evaluate("() => document.querySelector('tr[data-cl=\"ref_checks\"]').className")
        check('issue status styles the row', rowcls == 'cl-issue', rowcls)
        n0 = await pg.evaluate("() => document.querySelectorAll('.cl-tbl tbody tr').length")
        await pg.check('#rp-checklist input[type=checkbox]')
        n1 = await pg.evaluate("() => document.querySelectorAll('.cl-tbl tbody tr').length")
        check('later-stage items can be shown', n1 > n0, [n0, n1])
        await pg.evaluate("() => copyChecklistRequest()")
        # memo and markdown
        memo = await pg.evaluate("() => memoHTML(S.result)")
        check('memo: risks, returns, terms, checklist', all(x in memo for x in ['Risks by type', 'Returns: VC Method and First Chicago', 'Diligence checklist', 'Issues found']), [x for x in ['Risks by type','Returns: VC Method and First Chicago','Diligence checklist','Issues found'] if x not in memo])
        async with pg.expect_download() as dlw:
            await pg.evaluate("() => downloadReport()")
        md = open(await (await dlw.value).path()).read()
        check('markdown: returns, terms, risks, checklist', all(x in md for x in ['### Returns', '### Term-sheet review', '## Risks by type', '## Diligence checklist', '[x]']))
        # export / import keeps the checklist
        async with pg.expect_download() as dlw:
            await pg.evaluate("() => exportAssessment()")
        js = json.loads(open(await (await dlw.value).path()).read())
        check('JSON export carries the checklist', js['payload']['checklist'].get('fin_model') == 'received' and js['payload']['checklist'].get('ref_checks') == 'issue')
        await pg.evaluate("(t) => { S = blankState(); restorePayload(JSON.parse(t).payload); }", json.dumps(js))
        check('import restores the checklist', await pg.evaluate("() => S.checklist.ref_checks") == 'issue')
        # custom checklist item from the owner config, escaped
        await pg.evaluate("""() => { applyConfig({ checklist:[{ id:'cl_x', text:'<img src=x onerror="window.__x=1">Signed LOIs', category:'Customers & market', from:'preseed' }], hidden:{ checklist:['demo'] } });
          S.result = assessAll(); renderResult(S.result); goTab('checklist'); }""")
        cl = await pg.inner_text('#rp-checklist')
        check('owner checklist item appears, escaped; hidden item gone', 'Signed LOIs' in cl and 'Product demo and roadmap' not in cl and await pg.evaluate("() => !window.__x && !document.querySelector('#rp-checklist img')"))
        await pg.evaluate("() => applyConfig(EMPTY_CONFIG())")
        # halcyon: clean example still reconciles and scores
        R = await pg.evaluate("() => { loadDemo('halcyon'); const R = assessAll(); return { s:R.sc.overall, bad:R.checks.filter(c => c.sev !== 'ok').map(c => c.id), pmf:R.D.pmf_score, g:R.sc.gates.length }; }")
        check('clean example still clean and scored', R['s'] >= 70 and not R['bad'] and R['g'] == 0, R)
        check('no page errors', not errs, errs)
        await b.close()
    print(f'\n{sum(results)}/{len(results)} passed')
asyncio.run(main())
