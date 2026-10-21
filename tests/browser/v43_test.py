import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from playwright.async_api import async_playwright
import studio_test as T
from studio_test import TOKEN, BASE, GH, check, results, new_page, modal_save
SHOTS = T.SHOTS

async def publish_now(pg, wait=600):
    """Publish goes through the review dialog (change list and impact preview); confirm it when it appears."""
    await pg.click('text=Publish to the live site')
    try:
        await pg.wait_for_selector('#rv-publish', timeout=4000)
        await pg.click('#rv-publish')
    except Exception:
        pass
    await pg.wait_for_timeout(wait)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        ctx, pg = await new_page(b, errs, 'owner')
        await pg.goto(BASE + '#studio'); await pg.wait_for_selector('#gh-token')
        await pg.fill('#gh-token', TOKEN); await pg.click('#gh-signin'); await pg.wait_for_timeout(500)
        t = await pg.inner_text('#studio-pane')
        check('Studio opens on the start page', 'an investor told you' in t.lower(), t[:200])
        n = await pg.eval_on_selector_all('.st-card', 'c => c.length')
        check('one card per kind of change', n == 26, n)
        await pg.click('.st-card >> text=…a different value is healthy'); await pg.wait_for_timeout(150)
        check('card opens its screen', await pg.evaluate("() => ST.tab") == 'standards')
        grp = await pg.eval_on_selector_all('.sn-group .sn-h', 'h => h.map(x => x.textContent)')
        check('grouped navigation', grp == ['Start', 'How companies are judged', 'Add your own', 'Built-in items', 'Site'], grp)
        await pg.evaluate("() => loadNorthwind()")

        # Scored answers
        await pg.evaluate("() => studioTab('answers')")
        await pg.fill('input[data-cat="soc2"][data-opt="Type I"]', '40'); await pg.press('input[data-cat="soc2"][data-opt="Type I"]', 'Tab'); await pg.wait_for_timeout(100)
        await pg.fill('input[data-bool="litigation:minus"]', '15'); await pg.press('input[data-bool="litigation:minus"]', 'Tab'); await pg.wait_for_timeout(100)
        d = await pg.evaluate("() => [ST.draft.categorical, ST.draft.booleans]")
        check('answer score and yes/no points saved', d == [{ 'soc2':{ 'Type I':40 } }, { 'litigation:minus':15 }], d)
        check('built-in value shown next to yours', 'built-in 70' in await pg.inner_text('#studio-pane'))

        # Defaults
        await pg.evaluate("() => studioTab('defaults')")
        await pg.fill("input[onchange=\"setDefault('exit.years.seed', this.value)\"]", '4'); await pg.press("input[onchange=\"setDefault('exit.years.seed', this.value)\"]", 'Tab')
        await pg.fill("input[onchange=\"setDefault('deal.exit_multiple', this.value)\"]", '6'); await pg.press("input[onchange=\"setDefault('deal.exit_multiple', this.value)\"]", 'Tab')
        await pg.fill("input[onchange=\"setDefault('evidence.verbal', this.value)\"]", '10'); await pg.press("input[onchange=\"setDefault('evidence.verbal', this.value)\"]", 'Tab')
        await pg.fill("input[onchange=\"setProb('seed', 0, this.value)\"]", '50'); await pg.press("input[onchange=\"setProb('seed', 0, this.value)\"]", 'Tab'); await pg.wait_for_timeout(100)
        d = await pg.evaluate("() => ST.draft.defaults")
        check('defaults saved', d == { 'exit':{ 'years':{ 'seed':4 }, 'probs':{ 'seed':[50, 28, 12] } }, 'deal':{ 'exit_multiple':6 }, 'evidence':{ 'verbal':0.1 } }, d)
        await pg.fill("input[onchange=\"setDefault('deal.exit_multiple', this.value)\"]", ''); await pg.press("input[onchange=\"setDefault('deal.exit_multiple', this.value)\"]", 'Tab'); await pg.wait_for_timeout(100)
        check('clearing a box goes back to the built-in', 'deal' not in await pg.evaluate("() => ST.draft.defaults"))
        sel = "input[onchange=\"setDefault('exit.years.a', this.value)\"]"
        await pg.fill(sel, '50'); await pg.press(sel, 'Tab'); await pg.wait_for_timeout(150)
        check('out-of-range default clamped and shown as used', await pg.input_value(sel) == '20' and 'allowed range' in await pg.inner_text('#toast'), [await pg.input_value(sel), await pg.inner_text('#toast')])
        await pg.fill(sel, ''); await pg.press(sel, 'Tab'); await pg.wait_for_timeout(100)
        sel = "input[onchange=\"setDefault('stageRange.seed.lo', this.value)\"]"
        await pg.fill(sel, '9000000'); await pg.press(sel, 'Tab'); await pg.wait_for_timeout(150)
        check('stage range From above To refused', 'stageRange' not in await pg.evaluate("() => ST.draft.defaults") and 'must be below' in await pg.inner_text('#toast'))

        # Red-flag triggers
        await pg.evaluate("() => studioTab('triggers')")
        await pg.fill('.trig-tbl ~ input, #studio-pane input.form-inp', 'runway'); await pg.wait_for_timeout(100)
        vis = await pg.eval_on_selector_all('.trig-tbl tbody tr', "r => r.filter(x => x.style.display !== 'none').length")
        check('trigger search narrows the list', 0 < vis < 6, vis)
        await pg.fill('input[data-pat="runway_cliff"][data-key="red"]', '12'); await pg.press('input[data-pat="runway_cliff"][data-key="red"]', 'Tab'); await pg.wait_for_timeout(100)
        await pg.fill('input[data-pat="terms"][data-key="pref"]', '1.5'); await pg.press('input[data-pat="terms"][data-key="pref"]', 'Tab'); await pg.wait_for_timeout(100)
        d = await pg.evaluate("() => ST.draft.patternParams")
        check('triggers saved (red flag and term-sheet norm)', d == { 'runway_cliff':{ 'red':12 }, 'terms':{ 'pref':1.5 } }, d)

        # Tolerances
        await pg.evaluate("() => studioTab('tolerances')")
        await pg.fill('input[data-chk="stated_arr"][data-k="tol"]', '9'); await pg.press('input[data-chk="stated_arr"][data-k="tol"]', 'Tab'); await pg.wait_for_timeout(150)
        check('minor above material refused', 'stated_arr' not in await pg.evaluate("() => ST.draft.checkTol") and 'cannot be larger' in await pg.inner_text('#toast'))
        await pg.fill('input[data-chk="stated_arr"][data-k="tol"]', '4'); await pg.press('input[data-chk="stated_arr"][data-k="tol"]', 'Tab'); await pg.wait_for_timeout(100)
        check('tolerance saved', await pg.evaluate("() => ST.draft.checkTol") == { 'stated_arr':{ 'tol':4 } })

        # Deal-breaker
        await pg.evaluate("() => studioTab('gates')")
        await pg.click('text=Add a deal-breaker'); await pg.wait_for_selector('#ed-when')
        await pg.fill('#ed-title', 'Founders own under 30%')
        await pg.fill('#ed-when', 'founder_pct <'); await pg.wait_for_timeout(100)
        await modal_save(pg)
        check('broken condition refused', await pg.is_visible('#ed-when'))
        ids = await pg.evaluate("() => [...knownIdentifiers(ST.draft).keys()].filter(k => /founder/.test(k))")
        cond = 'top1_pct > 40'
        await pg.fill('#ed-when', cond); await pg.wait_for_timeout(100)
        st = await pg.inner_text('#ed-when-st'); check('condition checked live', st.startswith('Valid'), st)
        await pg.fill('#ed-title', 'One customer is over 40% of revenue'); await pg.fill('#ed-ask', 'Who is the customer and when does their contract renew?')
        await pg.select_option('#ed-risk', 'market'); await modal_save(pg)
        g = await pg.evaluate("() => ST.draft.gates")
        check('deal-breaker saved', len(g) == 1 and g[0]['when'] == cond and g[0]['risk'] == 'market', g)

        # Benchmarks
        await pg.evaluate("() => studioTab('benchmarks')")
        await pg.click('text=Paste many rows at once'); await pg.wait_for_selector('#bm-paste')
        await pg.fill('#bm-paste', 'nrr, all, 100, 110, 120, Public SaaS survey, 2026\nGross margin, all, 65, 74, 80, Public SaaS survey, 2026\nnot_a_metric, A, 1, 2, 3\nburn_multiple, Series A, , 1.6, , Another report')
        await pg.click('.modal-f .btn-primary'); await pg.wait_for_timeout(200)
        bm = await pg.evaluate("() => ST.draft.benchmarks.map(b => [b.metric, b.stage, b.median])")
        check('pasted benchmarks: good rows in, bad row reported', bm == [['nrr','all',110], ['gross_margin','all',74], ['burn_multiple','a',1.6]] and 'line 3' in await pg.inner_text('#toast'), [bm, await pg.inner_text('#toast')])
        await pg.click('text=Add a benchmark'); await pg.wait_for_selector('#ed-med')
        await pg.fill('#ed-p25', '50'); await pg.fill('#ed-med', '40'); await modal_save(pg)
        check('quartiles out of order refused', await pg.is_visible('#ed-med'))
        await pg.evaluate("() => closeModal()")

        # Business model
        await pg.evaluate("() => studioTab('models')")
        await pg.click('text=Add a business model'); await pg.wait_for_selector('#ed-name')
        await pg.fill('#ed-name', 'Hardware'); await pg.fill('#ed-desc', 'Devices with recurring software'); await modal_save(pg)
        m = await pg.evaluate("() => ST.draft.models")
        check('business model saved with a safe id', len(m) == 1 and {k: m[0][k] for k in ('id', 'name', 'desc', 'emoji')} == { 'id':'x_hardware', 'name':'Hardware', 'desc':'Devices with recurring software', 'emoji':'🧩' } and m[0].get('from') == '', m)

        # Rename the rest
        await pg.evaluate("() => studioTab('labels')")
        await pg.evaluate("() => { setLabel('sections', 'team', 'Founders'); setLabel('dims', 'gtm', 'Sales engine'); setLabel('patterns', 'runway_cliff', 'Short runway'); setLabel('checklist', 'separate_accounts', 'Separate bank accounts'); renderStudioPane(); }")
        await pg.fill('#studio-pane input.form-inp', 'Short runway'); await pg.wait_for_timeout(100)
        check('search opens the collapsed rename tables', await pg.evaluate("() => [...document.querySelectorAll('#studio-pane details.paste')].every(d => d.open)"))

        st = await pg.inner_text('#studio-status')
        for w in ['scored answers', 'defaults', 'red-flag triggers', 'check tolerances', 'deal-breakers', 'benchmark data', 'business models', 'renamed items']:
            check('status lists ' + w, w in st, st)
        await pg.evaluate("() => studioTab('home')")
        check('start page counts your changes', '1 of yours' in await pg.inner_text('#studio-pane'))
        await pg.screenshot(path=SHOTS + 'v43-home.png')

        # Publish
        await publish_now(pg, 600)
        t = await pg.inner_text('#toast'); check('published', t.startswith('Published'), t)
        cfg = json.loads(GH['published'])
        check('everything reached the published file', all(cfg[k] for k in ['gates','benchmarks','models','categorical','booleans','checkTol','patternParams','defaults']) and cfg['labels']['sections'] == { 'team':'Founders' }, list(cfg.keys()))

        # Visitor
        vctx, v = await new_page(b, errs, 'visitor')
        await v.goto(BASE); await v.wait_for_function("() => CFG.gates.length === 1", timeout=5000)
        await v.evaluate("() => goSetup()")
        check('visitor is offered the new business model', await v.is_visible('#tc-x_hardware'))
        await v.click('#tc-x_hardware')
        note = await v.inner_text('#calib-note'); check('custom model has its own note', 'added by the owner' in note, note)
        await v.evaluate("() => loadDemo('northwind')")
        nav = await v.inner_text('#sb-nav'); check('renamed section in the visitor nav', 'Founders' in nav, nav)
        R = await v.evaluate("""() => { S.vals.top1_pct = '45'; S.sel.soc2 = 'Type I'; const R = assessAll(); S.result = R; renderResult(R); showPage('result');
          return { gates:R.sc.gates.map(g => g.title), soc:(R.sc.dimensions.find(d => d.id === 'govern').metrics.find(m => m.key === 'soc2') || {}).score,
            dims:R.sc.dimensions.map(d => d.label), q:R.questions.map(q => q.tag + ' ' + q.text), yrs:EXIT_DEFAULTS.years.seed, ev:EVIDENCE.find(e => e.id === 'verbal').w,
            tol:tolOf('stated_arr', 2, 6), rows:benchRows(R).map(r => r.b.metric) }; }""")
        check('custom deal-breaker blocks the visitor’s report', 'One customer is over 40% of revenue' in R['gates'], R['gates'])
        check('deal-breaker question reaches the founders', any('Who is the customer' in q for q in R['q']), R['q'][:4])
        check('answer score applies for the visitor', R['soc'] == 40, R['soc'])
        check('renamed dimension', 'Sales engine' in R['dims'], R['dims'])
        check('defaults apply for the visitor', R['yrs'] == 4 and R['ev'] == 0.1, [R['yrs'], R['ev']])
        check('tolerance applies for the visitor', R['tol'] == { 'tol':4, 'hard':6 }, R['tol'])
        check('benchmarks follow the stage', R['rows'] == ['nrr', 'gross_margin'] if await v.evaluate("() => S.stage") != 'a' else R['rows'] == ['nrr','gross_margin','burn_multiple'], [R['rows'], await v.evaluate("() => S.stage")])
        ov = await v.inner_text('#result-content')
        check('deal-breaker shown at the top of the report', 'One customer is over 40% of revenue' in ov, ov[:400])
        await v.evaluate("() => goTab('bench')")
        bt = await v.inner_text('#rp-bench'); check('published benchmarks in the report', 'published benchmarks' in bt.lower() and 'Public SaaS survey (2026)' in bt, bt[:300])
        await v.screenshot(path=SHOTS + 'v43-visitor-bench.png', full_page=False)
        await v.evaluate("() => goTab('checklist')")
        cl = await v.inner_text('#rp-checklist'); check('renamed checklist item', 'Separate bank accounts' in cl)
        memo = await v.evaluate("() => memoHTML(S.result)")
        check('memo carries the deal-breaker and benchmarks', 'One customer is over 40% of revenue' in memo and 'Public SaaS survey' in memo)
        await v.evaluate("() => founderEmail()"); await v.wait_for_timeout(150)
        em = await v.evaluate("() => { const b = document.querySelector('.modal-b'); return b.innerText + Array.from(b.querySelectorAll('textarea')).map(t => t.value).join('\\n'); }")
        check('founder email asks the deal-breaker question', 'Who is the customer and when does their contract renew?' in em, em[:500])
        await v.evaluate("() => closeModal()")
        # Excel and Markdown exports do not break
        md = await v.evaluate("() => typeof markdownReport === 'function' ? markdownReport(S.result) : 'n/a'")
        check('markdown export includes the deal-breaker', md == 'n/a' or 'One customer is over 40% of revenue' in md)
        check('no page errors', not errs, errs)
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')

asyncio.run(main())
