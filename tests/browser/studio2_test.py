"""Browser checks for the Studio panes added in 5.0: look and feel, built-in details, dimensions, stages,
band editing, scoring constants, start-page cards. The GitHub API is mocked and the token is the fake one."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys
from playwright.async_api import async_playwright
import fontroute
BASE = _paths.BASE
TOKEN = 'github_pat_' + 'A' * 60
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))

async def gh_route(route):
    req = route.request; url = req.url
    if not req.headers.get('authorization', '').endswith(TOKEN):
        return await route.fulfill(status=401, json={ 'message':'Bad credentials' })
    if url.endswith('/user'): return await route.fulfill(status=200, json={ 'login':'dsaxel05' })
    if url.endswith('/repos/dsaxel05/VCR2'):
        return await route.fulfill(status=200, json={ 'full_name':'dsaxel05/VCR2', 'permissions':{ 'push':True, 'pull':True } })
    if '/contents/radar-config.json' in url and req.method == 'GET':
        return await route.fulfill(status=404, json={ 'message':'Not Found' })
    return await route.fulfill(status=404, json={})

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={ 'width':1360, 'height':900 })
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await fontroute.install(pg)
        await pg.route('https://api.github.com/**', gh_route)
        await pg.route(_paths.ORIGIN + '/radar-config.json*', lambda r: r.fulfill(status=404, body='not found'))
        await pg.goto(BASE + '#studio'); await pg.wait_for_selector('#gh-token')
        await pg.fill('#gh-token', TOKEN); await pg.click('#gh-signin'); await pg.wait_for_timeout(500)

        # start page: a card for every pane
        tabs = await pg.evaluate("() => Array.from(document.querySelectorAll('.st-card')).map(c => ((c.getAttribute('onclick') || '').split(\"'\")[1] || ''))")
        for t in ['look', 'anytext', 'constants', 'details', 'dimensions', 'stages', 'differs', 'advanced']:
            check(f'start page has a card for {t}', t in tabs, tabs)

        # Look & feel: accent, frame, divider, ink colour and the way back; the page follows the draft
        await pg.evaluate("() => studioTab('look')"); await pg.wait_for_timeout(100)
        await pg.click('label.look-card:has(input[value="garnet"])'); await pg.wait_for_timeout(100)
        await pg.click('label.look-pill:has(input[name="st-frame"][value="off"])'); await pg.wait_for_timeout(100)
        await pg.click('label.look-pill:has(input[name="st-divider"][value="plain"])'); await pg.wait_for_timeout(100)
        d = await pg.evaluate("() => ST.draft.look")
        check('Look: accent, frame and divider land in the draft', d.get('accent') == 'garnet' and d.get('frame') == 'off' and d.get('divider') == 'plain', d)
        await pg.evaluate("() => { applyConfig(normalizeConfig(ST.draft)); }"); await pg.wait_for_timeout(100)
        a = await pg.evaluate("() => [document.documentElement.dataset.accent, document.documentElement.dataset.frame, document.documentElement.dataset.divider, document.documentElement.dataset.direction]")
        check('Look: the page follows (garnet accent, no frame, plain divider, one identity)', a == ['garnet', 'off', 'plain', 'privatebank'], a)
        await pg.fill('input[aria-label="Ink and button colour, light theme as a hex code"]', '#112233'); await pg.keyboard.press('Tab'); await pg.wait_for_timeout(100)
        d = await pg.evaluate("() => ST.draft.look")
        check('Look: an ink colour lands in the draft', d.get('brand') == '#112233', d)
        await pg.click('text=Use the built-in colour >> nth=0'); await pg.wait_for_timeout(100)
        d = await pg.evaluate("() => ST.draft.look")
        check('Look: the way back clears it', 'brand' not in d, d)
        await pg.click('label.look-card:has(input[value="brass"])'); await pg.wait_for_timeout(100)
        await pg.click('label.look-pill:has(input[name="st-frame"][value="on"])'); await pg.wait_for_timeout(100)
        await pg.click('label.look-pill:has(input[name="st-divider"][value="diamond"])'); await pg.wait_for_timeout(100)
        d = await pg.evaluate("() => ST.draft.look")
        check('Look: the built-in choices are not stored as changes', not d, d)
        await pg.evaluate("() => { applyConfig(EMPTY_CONFIG()); }")

        # Built-in details: a deal-breaker explanation
        await pg.evaluate("() => studioTab('details')"); await pg.wait_for_timeout(100)
        await pg.fill('input[placeholder="Search…"]', 'ip_assign'); await pg.wait_for_timeout(100)
        row = pg.locator('.det-tbl tbody tr', has_text='ip_assignments').first
        inp = row.locator('input.lbl-inp').first
        await inp.fill('Own words about IP assignments.'); await inp.press('Tab'); await pg.wait_for_timeout(100)
        m = await pg.evaluate("() => ST.draft.meta.gates.ip_assignments")
        check('Details: a deal-breaker explanation lands in the draft', bool(m) and m.get('why') == 'Own words about IP assignments.', m)

        # Dimensions: add one
        await pg.evaluate("() => studioTab('dimensions')"); await pg.wait_for_timeout(100)
        await pg.click('button:has-text("Add a scoring dimension")'); await pg.wait_for_selector('#ed-name')
        await pg.fill('#ed-name', 'Regulatory exposure'); await pg.fill('#ed-desc', 'Licences and sector rules')
        await pg.click('.modal-f .btn-primary'); await pg.wait_for_timeout(150)
        d = await pg.evaluate("() => ST.draft.dimensions")
        check('Dimensions: a new dimension is in the draft', len(d) == 1 and d[0]['label'] == 'Regulatory exposure' and d[0]['id'].startswith('d_'), d)
        t = await pg.inner_text('#studio-pane')
        check('Dimensions: and listed', 'Regulatory exposure' in t, t[:200])

        # Stages: rename a built-in stage, add one
        await pg.evaluate("() => studioTab('stages')"); await pg.wait_for_timeout(100)
        inp = pg.locator('input[aria-label^="Name of"]').nth(1)
        await inp.fill('Early growth'); await inp.press('Tab'); await pg.wait_for_timeout(100)
        d = await pg.evaluate("() => ST.draft.labels.stages")
        check('Stages: a built-in stage can be renamed', d.get('seed') == 'Early growth', d)
        await pg.click('button:has-text("Add a stage")'); await pg.wait_for_selector('#ed-name')
        await pg.fill('#ed-name', 'Series C'); await pg.select_option('#ed-like', 'b'); await pg.fill('#ed-lo', '20000000')
        await pg.click('.modal-f .btn-primary'); await pg.wait_for_timeout(150)
        d = await pg.evaluate("() => ST.draft.stages")
        check('Stages: a new stage is in the draft', len(d) == 1 and d[0]['name'] == 'Series C' and d[0]['like'] == 'b' and d[0]['lo'] == 20000000, d)

        # Band editing
        key = await pg.evaluate("() => Object.keys(RUBRIC.thresholds).find(k => RUBRIC.thresholds[k].dir === 'band')")
        check('a banded metric exists', bool(key), key)
        if key:
            await pg.evaluate("(k) => { studioTab('standards'); editStandard(k); }", key); await pg.wait_for_selector('#band-i0')
            lo = await pg.input_value('#band-i0')
            await pg.fill('#band-i0', str(float(lo) + 1)); await pg.fill('#thr-note', 'Our own source')
            await pg.click('.modal-f .btn-primary'); await pg.wait_for_timeout(150)
            d = await pg.evaluate("(k) => ST.draft.thresholds[k]", key)
            check('Band: the healthy range and the reason are saved', bool(d) and bool(d.get('ideal')) and d['ideal'][0] == float(lo) + 1 and d.get('note') == 'Our own source', d)
            await pg.evaluate("(k) => { editStandard(k); }", key); await pg.wait_for_selector('#band-i0')
            await pg.click('text=Back to the built-in values'); await pg.wait_for_timeout(150)
            d = await pg.evaluate("(k) => ST.draft.thresholds[k] || null", key)
            check('Band: back to the built-in values clears it', d is None, d)

        # Scoring constants: a number and its way back
        await pg.evaluate("() => studioTab('constants')"); await pg.wait_for_timeout(100)
        box = pg.get_by_label('Runway shown and scored for a company that is not burning (months)')
        await box.fill('60'); await box.press('Tab'); await pg.wait_for_timeout(100)
        s = await pg.evaluate("() => ST.draft.settings.runwayCap")
        check('Constants: a number lands in the draft', s == 60, s)
        box = pg.get_by_label('Runway shown and scored for a company that is not burning (months)')
        await box.fill('120'); await box.press('Tab'); await pg.wait_for_timeout(100)
        s = await pg.evaluate("() => ST.draft.settings.runwayCap")
        check('Constants: the built-in value is not stored as a change', s is None, s)

        # A choice added in Built-in details can be scored in Scored answers
        await pg.evaluate("() => { ST.draft.meta.fields.soc2 = { addOptions:['Type III'] }; studioTab('answers'); }"); await pg.wait_for_timeout(150)
        t = await pg.inner_text('#studio-pane')
        check('Answers: an added choice is listed', 'Type III' in t and 'added by you' in t, t[:200])
        inp = pg.locator('input[data-cat="soc2"][data-opt="Type III"]')
        await inp.fill('80'); await inp.press('Tab'); await pg.wait_for_timeout(100)
        s = await pg.evaluate("() => (ST.draft.categorical.soc2 || {})['Type III']")
        check('Answers: and its score lands in the draft', s == 80, s)

        # The reconcile deal-breaker has its own rows in Rename and Built-in details
        await pg.evaluate("() => studioTab('labels')"); await pg.wait_for_timeout(100)
        t = await pg.evaluate("() => document.getElementById('studio-pane').textContent")
        check('Rename: the reconcile deal-breaker can be renamed', 'Figures do not reconcile' in t, t[:100])
        await pg.evaluate("() => studioTab('details')"); await pg.wait_for_timeout(100)
        await pg.fill('input[placeholder="Search…"]', 'reconcile'); await pg.wait_for_timeout(100)
        row = pg.locator('.det-tbl tbody tr', has_text='Figures do not reconcile').first
        inp = row.locator('input.lbl-inp').first
        await inp.fill('Fix the data pack first.'); await inp.press('Tab'); await pg.wait_for_timeout(100)
        m = await pg.evaluate("() => ST.draft.meta.gates.reconcile")
        check('Details: its explanation lands in the draft', bool(m) and m.get('why') == 'Fix the data pack first.', m)

        # The lever: what to do if a question stays unresolved
        await pg.evaluate("() => studioTab('details')"); await pg.wait_for_timeout(100)
        await pg.fill('input[placeholder="Search…"]', 'contradictions'); await pg.wait_for_timeout(100)
        row = pg.locator('.det-tbl tbody tr', has_text='Major contradictions').first
        inp = row.locator('input.lbl-inp').first
        await inp.fill('Walk away until the pack is corrected.'); await inp.press('Tab'); await pg.wait_for_timeout(100)
        m = await pg.evaluate("() => ST.draft.meta.families.contradictions")
        check('Lever: a family wording lands in the draft', bool(m) and m.get('lever') == 'Walk away until the pack is corrected.', m)
        await pg.evaluate("() => { studioTab('questions'); editItem('questions', -1); }"); await pg.wait_for_selector('#ed-lever')
        await pg.fill('#ed-text', 'Who owns the domain?'); await pg.fill('#ed-lever', 'Hold the signing until it is in the company name.')
        await pg.click('.modal-f .btn-primary'); await pg.wait_for_timeout(150)
        qd = await pg.evaluate("() => ST.draft.questions.map(q => q.lever)")
        check('Lever: your own question keeps its lever', qd == ['Hold the signing until it is in the company name.'], qd)

        # Section descriptions can be reworded in Rename; a stage's weights have their own way back
        await pg.evaluate("() => studioTab('labels')"); await pg.wait_for_timeout(100)
        await pg.click('summary:has-text("Evidence section descriptions")'); await pg.wait_for_timeout(100)
        inp = pg.locator('details:has(summary:has-text("Evidence section descriptions")) input.lbl-inp').first
        await inp.fill('Our own line under the title.'); await inp.press('Tab'); await pg.wait_for_timeout(100)
        sd = await pg.evaluate("() => Object.values(ST.draft.labels.sdescs || {})")
        check('Rename: a section description lands in the draft', sd == ['Our own line under the title.'], sd)
        await pg.evaluate("() => { studioTab('scoring'); setStageWeight('seed', 'team', '40'); renderStudioPane(); }"); await pg.wait_for_timeout(150)
        await pg.click('button:has-text("Back to built-in")'); await pg.wait_for_timeout(150)
        sw = await pg.evaluate("() => ST.draft.stageWeights.seed || null")
        check('Weights: a stage goes back to the built-in weights on its own', sw is None, sw)

        # Things the owner adds appear everywhere they belong: report, "What drove this score", markdown export, questions
        r = await pg.evaluate("""() => {
          applyConfig(normalizeConfig({
            fields:[{ id:'c_pipeline_pct', label:'Pipeline from referrals', type:'num', unit:'%', section:'custom' }],
            metrics:[{ key:'m_pipe_x', label:'Referral pipeline index', formula:'arr_now / 1000000 * 2', unit:'x', dim:'gtm', dir:'hi', weight:2, thresholds:{ seed:[0.5, 1, 2, 4], a:[0.5, 1, 2, 4], b:[0.5, 1, 2, 4], preseed:[0.5, 1, 2, 4] } }],
            checks:[{ id:'k_own', title:'Own ARR check', stated:'arr_now', computed:'arr_12mo * 3', tol:5, hard:10 }],
            questions:[{ id:'q_own', text:'Who owns the referral relationships?', priority:'high', lever:'Make the handover a condition.' }],
            patterns:[{ id:'p_own', title:'Own red flag', sev:'red', when:'arr_now > 0', evidence:'ARR is positive', why:'Because.', ask:'Why?' }],
          }));
          S.name = 'Export check'; loadNorthwind(); S.vals.c_pipeline_pct = '40'; runAnalysis();
          return true;
        }""")
        await pg.wait_for_function("() => document.getElementById('page-result').classList.contains('active')", timeout=20000)
        got = await pg.evaluate("""() => {
          const html = document.getElementById('page-result').innerHTML;
          let md = ''; const keep = window.downloadFile; window.downloadFile = (n, c) => { md = c; };
          try { downloadReport(); } finally { window.downloadFile = keep; }
          return { drove:/Referral pipeline index/.test(html.slice(html.indexOf('What drove this score'))), report:/Own ARR check/.test(html), pattern:/Own red flag/.test(html),
                   question:/Who owns the referral relationships/.test(html), lever:/Make the handover a condition/.test(html),
                   mdMetric:/Referral pipeline index/.test(md), mdQuestion:/Who owns the referral relationships/.test(md), mdLever:/Make the handover a condition/.test(md) };
        }""")
        check('Added metric appears in "What drove this score"', got['drove'], got)
        check('Added check, red flag, question and lever appear in the report', got['report'] and got['pattern'] and got['question'] and got['lever'], got)
        check('Added metric, question and lever appear in the markdown export', got['mdMetric'] and got['mdQuestion'] and got['mdLever'], got)
        await pg.evaluate("() => applyConfig(EMPTY_CONFIG())")

        # The list of what differs from the built-in site
        await pg.evaluate("() => studioTab('differs')"); await pg.wait_for_timeout(100)
        t = await pg.inner_text('#studio-pane')
        check('Differs: lists the draft changes', 'Regulatory exposure' in t or 'Series C' in t or 'Early growth' in t, t[:300])

        # A built-in choice can be reworded on the form without changing what is stored
        await pg.evaluate("() => { applyConfig(Object.assign(EMPTY_CONFIG(), { texts:[{ from:'Type II', to:'SOC 2 Type 2' }] })); S.name = 'X'; S.model = 'saas'; showPage('intake'); const i = SECTIONS.findIndex(s => s.fields.some(f => f.id === 'soc2')); if (typeof openSection === 'function') openSection(i); else renderSection(i); }")
        await pg.wait_for_timeout(300)
        r = await pg.evaluate("() => { const o = Array.from(document.querySelectorAll('option')).find(x => x.getAttribute('value') === 'Type II'); return o ? { text:o.textContent, value:o.value } : null; }")
        check('Choices: the shown wording follows the replacement, the value does not', r is not None and r['text'] == 'SOC 2 Type 2' and r['value'] == 'Type II', r)
        await pg.evaluate("() => applyConfig(EMPTY_CONFIG())")

        check('no uncaught errors', not errs, errs)
        await b.close()
    ok = sum(1 for r in results if r[0])
    print(f'\n{ok}/{len(results)} passed')
    sys.exit(0 if ok == len(results) else 1)

asyncio.run(main())
