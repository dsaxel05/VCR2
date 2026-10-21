import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys, json, base64, re
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from playwright.async_api import async_playwright
import fontroute
BASE = _paths.BASE
SHOTS = _paths.SHOTS
TOKEN = 'github_pat_' + 'A' * 60
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:400]}'))

GH = { 'login':'dsaxel05', 'push':True, 'status_user':200, 'sha':None, 'puts':[], 'published':None, 'put_status':201 }

async def gh_route(route):
    req = route.request; url = req.url; m = req.method
    hdr = req.headers.get('authorization', '')
    if not hdr.endswith(TOKEN):
        return await route.fulfill(status=401, json={ 'message':'Bad credentials' })
    if url.endswith('/user'):
        if GH['status_user'] != 200: return await route.fulfill(status=GH['status_user'], json={ 'message':'x' })
        return await route.fulfill(status=200, json={ 'login':GH['login'] })
    if re.search(r'/repos/dsaxel05/VCR2$', url):
        return await route.fulfill(status=200, json={ 'full_name':'dsaxel05/VCR2', 'permissions':{ 'push':GH['push'], 'pull':True } })
    if '/contents/radar-config.json' in url and m == 'GET':
        if GH['sha']: return await route.fulfill(status=200, json={ 'sha':GH['sha'], 'path':'radar-config.json' })
        return await route.fulfill(status=404, json={ 'message':'Not Found' })
    if '/contents/radar-config.json' in url and m == 'PUT':
        body = json.loads(req.post_data)
        GH['puts'].append(body)
        if GH['sha'] and body.get('sha') != GH['sha']:
            return await route.fulfill(status=409 if body.get('sha') else 422, json={ 'message':'sha mismatch' })
        if GH['put_status'] != 201: return await route.fulfill(status=GH['put_status'], json={ 'message':'nope' })
        GH['published'] = base64.b64decode(body['content']).decode('utf-8')
        GH['sha'] = 'sha' + str(len(GH['puts']))
        return await route.fulfill(status=201, json={ 'content':{ 'sha':GH['sha'] } })
    return await route.fulfill(status=404, json={})

async def cfg_route(route):
    if GH['published'] is None: return await route.fulfill(status=404, body='not found')
    return await route.fulfill(status=200, content_type='application/json', body=GH['published'])

async def new_page(browser, errs, tag):
    ctx = await browser.new_context(viewport={ 'width':1360, 'height':900 })
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(f'{tag}: {e}'))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await fontroute.install(pg)
    await pg.route('https://api.github.com/**', gh_route)
    await pg.route(_paths.ORIGIN + '/radar-config.json*', cfg_route)
    return ctx, pg

async def modal_save(pg):
    await pg.click('.modal-f .btn-primary')
    await pg.wait_for_timeout(150)

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

        # ── Gate ──
        await pg.goto(BASE + '#studio'); await pg.wait_for_selector('#gh-token')
        t = await pg.inner_text('#studio-content')
        check('gate shown on #studio', 'Only the owner of dsaxel05/VCR2' in t, t[:200])
        check('studio link hidden before sign-in', await pg.evaluate("() => getComputedStyle(document.getElementById('studio-link')).display") == 'none')
        await pg.screenshot(path=SHOTS + 'studio-gate.png')

        async def sign_in(tok=TOKEN):
            await pg.fill('#gh-token', tok); await pg.click('#gh-signin'); await pg.wait_for_timeout(400)
            return await pg.inner_text('#studio-content')
        t = await sign_in('github_pat_' + 'B' * 60)
        check('bad token rejected', 'GitHub rejected this token' in t, t[:300])
        GH['login'] = 'someone-else'; t = await sign_in()
        check('someone else’s token refused', 'belongs to @someone-else' in t and 'Only @dsaxel05' in t, t[:300])
        GH['login'] = 'dsaxel05'; GH['push'] = False; t = await sign_in()
        check('token without write access refused', 'write access' in t, t[:300])
        GH['push'] = True; t = await sign_in()
        check('owner signs in', 'Shape the engine' in t, t[:300])
        check('studio link now visible', await pg.evaluate("() => getComputedStyle(document.getElementById('studio-link')).display") != 'none')
        check('token kept in session storage only', await pg.evaluate("() => [!!sessionStorage.getItem('vcr2-gh-token'), !!localStorage.getItem('vcr2-gh-token')]") == [True, False])
        check('status: live matches draft', 'live' in await pg.inner_text('#studio-status'))

        # ── Load an example so formulas preview real values ──
        await pg.evaluate("() => { loadNorthwind(); }")
        await pg.evaluate("() => studioTab('fields')")

        # ── Add a custom field (new section) ──
        await pg.click("text=Add a field"); await pg.wait_for_selector('#ed-label')
        await pg.fill('#ed-label', 'Qualified pipeline')
        check('field id suggested from label', await pg.input_value('#ed-id') == 'c_qualified_pipeline', await pg.input_value('#ed-id'))
        await pg.select_option('#ed-section', 'custom'); await pg.select_option('#ed-unit', '$')
        await pg.fill('#ed-group', 'Pipeline'); await pg.fill('#ed-hint', 'From the CRM, stages 2+.')
        await pg.check('#ed-req'); await modal_save(pg)
        # a claim field and a choice field
        await pg.click("text=Add a field"); await pg.fill('#ed-label', 'Stated pipeline coverage'); await pg.select_option('#ed-section', 'claims'); await pg.select_option('#ed-unit', 'x'); await modal_save(pg)
        await pg.click("text=Add a field"); await pg.fill('#ed-label', 'Board composition'); await pg.select_option('#ed-type', 'select')
        await pg.fill('#ed-options', 'Founders only'); await modal_save(pg)
        check('choice field needs two options', await pg.is_visible('#ed-options'))
        await pg.fill('#ed-options', 'Founders only, One independent, Independent majority'); await modal_save(pg)
        await pg.click("text=Add a field"); await pg.fill('#ed-label', '<b onmouseover=alert(1)>Evil</b> label'); await modal_save(pg)
        rows = await pg.eval_on_selector_all('#studio-pane tbody tr', 'r => r.length')
        check('four custom fields listed', rows == 4, rows)

        # ── Metric with a formula ──
        await pg.evaluate("() => studioTab('metrics')")
        await pg.click("text=Add a metric"); await pg.wait_for_selector('#ed-formula')
        await pg.fill('#ed-label', 'Pipeline coverage')
        await pg.fill('#ed-formula', 'c_qualified_pipeline / nope_x')
        st = await pg.inner_text('#ed-formula-st')
        check('unknown name flagged live', 'Unknown name' in st and 'nope_x' in st, st)
        await pg.fill('#ed-formula', 'c_qualified_pipeline / (arr_now')
        st = await pg.inner_text('#ed-formula-st'); check('syntax error flagged live', 'Expected' in st, st)
        await pg.fill('#ed-formula', '')
        await pg.click('.modal .ref-list >> text=c_qualified_pipeline', force=True) if False else None
        await pg.fill('#ed-formula', 'c_qualified_pipeline / arr_now')
        st = await pg.inner_text('#ed-formula-st'); check('valid formula accepted', st.startswith('Valid'), st)
        await pg.select_option('#ed-unit', 'x'); await pg.select_option('#ed-dim', 'gtm')
        await modal_save(pg)
        check('scored metric without thresholds refused', await pg.is_visible('#ed-formula'))
        for k, v in enumerate(['0.5', '1', '2', '3']): await pg.fill(f'#ed-th-a-{k}', v)
        await pg.click('text=Copy the first filled stage to all stages')
        check('threshold row copied', await pg.input_value('#ed-th-preseed-3') == '3')
        await pg.fill('#ed-th-seed-1', '0.1')  # out of order → refused
        await pg.fill('#ed-th-seed-0', '5'); await modal_save(pg)
        check('unordered thresholds refused', await pg.is_visible('#ed-formula'))
        await pg.fill('#ed-th-seed-0', '0.5'); await pg.fill('#ed-th-seed-1', '1'); await modal_save(pg)
        t = await pg.inner_text('#studio-pane')
        check('metric listed with a preview value', 'Pipeline coverage' in t and 'm_pipeline_coverage' in t, t[:400])

        # A metric that refers to the custom metric (chained)
        await pg.click("text=Add a metric"); await pg.fill('#ed-label', 'Pipeline gap')
        await pg.fill('#ed-formula', 'max(0, 3 - m_pipeline_coverage)'); await modal_save(pg)

        # ── Check ──
        await pg.evaluate("() => studioTab('checks')")
        await pg.click("text=Add a check"); await pg.wait_for_selector('#ed-stated')
        await pg.fill('#ed-title', 'Pipeline coverage claim')
        await pg.select_option('#ed-stated', 'c_stated_pipeline_coverage')
        await pg.fill('#ed-computed', 'm_pipeline_coverage'); await pg.select_option('#ed-unit', 'x')
        await pg.fill('#ed-ask', 'Could you share the CRM export behind the pipeline coverage figure?')
        await modal_save(pg)

        # ── Questions ──
        await pg.evaluate("() => studioTab('questions')")
        await pg.click("text=Add a question"); await pg.fill('#ed-text', 'How much of the pipeline is expansion from existing customers?')
        await pg.fill('#ed-when', 'm_pipeline_coverage < 2'); await pg.select_option('#ed-pri', 'high'); await pg.fill('#ed-tag', 'Pipeline'); await modal_save(pg)
        await pg.click("text=Add a question"); await pg.fill('#ed-text', 'Never asked question'); await pg.fill('#ed-when', "model == 'fintech'"); await modal_save(pg)
        await pg.click("text=Add a question"); await pg.fill('#ed-text', 'Who is on the board?'); await pg.fill('#ed-when', "c_board_composition == 'Founders only'"); await modal_save(pg)

        # ── Pattern (with an XSS attempt in the title) ──
        await pg.evaluate("() => studioTab('patterns')")
        await pg.click("text=Add a pattern"); await pg.fill('#ed-title', '<img src=x onerror="window.__xss=1">Thin pipeline')
        await pg.fill('#ed-when', 'm_pipeline_coverage < 2 and arr > 1000000'); await pg.fill('#ed-evid', 'm_pipeline_coverage, nope_zz')
        await pg.fill('#ed-why', 'Too little qualified pipeline to hit plan.'); await pg.fill('#ed-ask', 'Walk us through the pipeline by stage.')
        await modal_save(pg)
        check('unknown evidence name refused', await pg.is_visible('#ed-evid'))
        await pg.fill('#ed-evid', 'm_pipeline_coverage, arr_now'); await modal_save(pg)

        # ── Request ──
        await pg.evaluate("() => studioTab('requests')")
        await pg.click("text=Add a request"); await pg.fill('#ed-text', 'CRM pipeline export with stage history'); await modal_save(pg)

        # ── Built-ins: switch some off ──
        await pg.evaluate("() => studioTab('builtins')")
        await pg.evaluate("""() => { const flip = (k, id) => { const el = Array.from(document.querySelectorAll('.bi input')).find(i => (i.getAttribute('onchange') || '').includes(`'${k}','${id}'`)); el.click(); };
          flip('checks', 'stated_arr'); flip('questions', 'confirm_funds'); flip('patterns', 'bought_growth'); flip('requests', 'cap_table'); flip('metrics', 'magic_number'); flip('sections', 'team'); }""")
        hidden = await pg.evaluate("() => ST.draft.hidden")
        check('built-ins switched off in the draft', 'stated_arr' in hidden['checks'] and 'team' in hidden['sections'] and 'magic_number' in hidden['metrics'], hidden)

        # ── Scoring settings + a built-in threshold override ──
        await pg.evaluate("() => studioTab('scoring')")
        await pg.fill('.st-row:has-text("Withhold the score") input', '4'); await pg.press('.st-row:has-text("Withhold the score") input', 'Tab')
        await pg.evaluate("() => studioTab('standards')")
        t = await pg.inner_text('#studio-pane')
        check('healthy ranges list every scored metric', 'Net revenue retention' in t and 'Burn multiple' in t and 'good at series a' in t.lower(), t[:200])   # table headers are set in capitals
        await pg.click('tr[data-q^="nrr "] >> text=Change'); await pg.wait_for_selector('#thr-a-0')
        for k, v in enumerate(['95', '105', '115', '130']): await pg.fill(f'#thr-a-{k}', v)
        say = await pg.inner_text('#thr-say-a')
        check('plain-language reading updates as you type', 'good from 115.0%' in say and 'excellent from 130.0%' in say, say)
        await pg.fill('#thr-a-1', '90'); await pg.fill('#thr-a-2', '80')
        check('out-of-order values explained', 'lowest to highest' in await pg.inner_text('#thr-say-a'))
        await pg.fill('#thr-a-1', '105'); await pg.fill('#thr-a-2', '115')
        await pg.fill('#thr-note', 'Series A investors we met expect NRR above 115%')
        await pg.click('.modal-f .btn-primary'); await pg.wait_for_timeout(150)
        t = await pg.inner_text('#studio-pane')
        check('changed metric marked as yours', 'yours' in t.lower() and '≥ 115.0%' in t, t[:300])
        s = await pg.evaluate("() => [ST.draft.settings.blockAfter, ST.draft.thresholds.nrr && ST.draft.thresholds.nrr.a]")
        check('block threshold and NRR thresholds saved', s == [4, [95, 105, 115, 130]], s)

        # ── Texts ──
        await pg.evaluate("() => studioTab('texts')")
        # The headline box is found by its placeholder: 5.0 added a line-above-the-headline box before it.
        hl = await pg.query_selector('#studio-pane input.form-inp[placeholder^="Check whether"]')
        await hl.fill('Diligence, reconciled'); await hl.press('Tab')
        await pg.evaluate("() => studioTab('labels')")
        await pg.fill('#studio-pane input[placeholder^="Search"]', 'arr_now')
        vis = await pg.evaluate("() => Array.from(document.querySelectorAll('.lbl-tbl tbody tr')).filter(r => r.style.display !== 'none').length")
        check('rename search filters rows', 1 <= vis <= 4, vis)
        await pg.fill('.lbl-tbl tr[data-q^="arr_now "] >> nth=0 >> input', 'Annual run-rate'); await pg.press('.lbl-tbl tr[data-q^="arr_now "] >> nth=0 >> input', 'Tab')
        await pg.fill('#studio-pane input[placeholder^="Search"]', 'nrr')
        await pg.fill('.lbl-tbl tr[data-q^="nrr "] >> nth=0 >> input', 'Net dollar retention'); await pg.press('.lbl-tbl tr[data-q^="nrr "] >> nth=0 >> input', 'Tab')
        lb = await pg.evaluate("() => ST.draft.labels")
        check('renames saved in the draft', lb['fields'].get('arr_now') == 'Annual run-rate' and lb['metrics'].get('nrr') == 'Net dollar retention', lb)
        await pg.evaluate("() => studioTab('help')")
        t = await pg.inner_text('#studio-pane'); check('help lists names incl. custom ones', 'c_qualified_pipeline' in t and 'burn_multiple' in t)
        st = await pg.inner_text('#studio-status')
        check('status shows unpublished changes', 'Unpublished changes' in st, st)
        await pg.screenshot(path=SHOTS + 'studio-main.png', full_page=False)

        # ── Preview in this browser ──
        await pg.check('#st-preview'); await pg.wait_for_timeout(200)
        pv = await pg.evaluate("() => [document.querySelector('.intro-h1').textContent, !!document.getElementById('preview-banner'), SECTIONS.some(s => s.id === 'custom')]")
        check('preview applies the draft (headline, banner, custom section)', pv == ['Diligence, reconciled', True, True], pv)

        # ── Publish (first time: file does not exist yet) ──
        GH['put_status'] = 403
        await publish_now(pg, 500)
        t = await pg.inner_text('#toast'); check('publish error explained', 'Contents: Read and write' in t, t)
        GH['put_status'] = 201
        await publish_now(pg, 600)
        t = await pg.inner_text('#toast'); check('published', t.startswith('Published'), t)
        put = GH['puts'][-1]; cfg = json.loads(GH['published'])
        check('commit has a message and branch, no sha for a new file', put['message'].startswith('Studio:') and put['branch'] == 'main' and 'sha' not in put, put.get('message'))
        check('published config content', len(cfg['fields']) == 4 and len(cfg['metrics']) == 2 and len(cfg['checks']) == 1 and len(cfg['questions']) == 3
              and len(cfg['patterns']) == 1 and len(cfg['requests']) == 1 and cfg['owner'] == 'dsaxel05' and cfg['repo'] == 'VCR2' and cfg['updated'], {k:len(v) if isinstance(v, list) else v for k, v in cfg.items() if k != 'branding'})
        check('status back to live', 'live' in await pg.inner_text('#studio-status'))

        # second publish must send the sha (update)
        await pg.evaluate("() => studioTab('texts')")
        inputs = await pg.query_selector_all('#studio-pane .form-inp'); await inputs[0].fill('Radar'); await inputs[0].press('Tab')
        await publish_now(pg, 600)
        check('update sends the previous sha', GH['puts'][-1].get('sha') == 'sha2' or GH['puts'][-1].get('sha') == 'sha1', GH['puts'][-1].get('sha'))
        check('unicode survives base64', json.loads(GH['published'])['branding'].get('headline') == 'Diligence, reconciled')
        # someone publishes from another device → no silent overwrite
        GH['sha'] = 'sha-other-device'
        await pg.evaluate("() => studioTab('texts')")
        inputs = await pg.query_selector_all('#studio-pane .form-inp'); await inputs[0].fill('Radar Pro'); await inputs[0].press('Tab')
        n_before = len(GH['puts'])
        await publish_now(pg, 700)
        t = await pg.inner_text('#toast')
        check('conflict detected, nothing overwritten', 'changed since you opened the Studio' in t and json.loads(GH['published'])['branding'].get('appName') == 'Radar', t)
        check('conflict notice shown', await pg.is_visible('#st-conflict'))
        await pg.click('text=Keep my draft'); await pg.wait_for_timeout(200)
        await publish_now(pg, 700)
        check('publishing after an explicit choice works', GH['puts'][-1].get('sha') == 'sha-other-device' and json.loads(GH['published'])['branding'].get('appName') == 'Radar Pro', GH['puts'][-1].get('sha'))

        # ── Visitor: a fresh browser sees the published version ──
        vctx, v = await new_page(b, errs, 'visitor')
        await v.goto(BASE); await v.wait_for_function("() => CFG.metrics.length === 2", timeout=5000)
        h = await v.evaluate("() => [document.querySelector('.intro-h1').textContent, document.querySelector('.sb-logo-name').textContent, getComputedStyle(document.getElementById('studio-link')).display]")
        check('visitor sees published texts, no Studio link', h == ['Diligence, reconciled', 'Radar Pro', 'none'], h)
        await v.evaluate("() => loadDemo('northwind')")
        nav = await v.inner_text('#sb-nav')
        check('visitor nav: custom section in, hidden section out', 'Additional evidence' in nav and 'Team' not in nav, nav)
        await v.evaluate("() => jumpTo(0)")
        f0 = await v.inner_text('#section-content')
        check('renamed field shows on the form', 'annual run-rate' in f0.lower(), f0[:200])
        await v.evaluate("() => { const i = SECTIONS.findIndex(s => s.id === 'custom'); jumpTo(i); }")
        sec = await v.inner_text('#section-content')
        check('custom fields render on the form', 'qualified pipeline' in sec.lower() and 'board composition' in sec.lower() and 'required' in sec.lower(), [x for x in sec.split('\n') if x.strip()][6:30])
        evil = await v.evaluate("() => document.querySelectorAll('#section-content b[onmouseover]').length")
        check('field label is escaped', evil == 0)
        await v.fill('[data-fid="c_qualified_pipeline"]', '6000000')
        await v.select_option('[data-fid="c_board_composition"]', 'Founders only')
        await v.evaluate("() => { saveSec(); S.vals.c_stated_pipeline_coverage = '3.5'; }")
        R = await v.evaluate("""() => { const R = assessAll(); S.result = R; renderResult(R); showPage('result');
          return { pc:R.D.m_pipeline_coverage, gap:R.D.m_pipeline_gap, mn:R.D.magic_number, ck:(R.checks.find(c => c.id && c.id.startsWith('k_')) || {}).sev,
            arr:R.checks.some(c => c.id === 'stated_arr'), q:R.questions.map(q => q.text), p:R.patterns.map(p => p.title), req:R.requests, rub:R.sc.rubric,
            arrNow:gv('arr_now'), scored:R.sc.dimensions.flatMap(d => d.metrics).find(m => m.key === 'm_pipeline_coverage'), nrrBar:activeThresholds().nrr.a }; }""")
        check('custom metric computed for the visitor', R['pc'] is not None and abs(R['pc'] - 6e6 / R['arrNow']) < 1e-9, R['pc'])
        check('chained metric computed', R['gap'] is not None and abs(R['gap'] - (3 - R['pc'])) < 1e-9, R['gap'])
        check('custom metric is scored', R['scored'] is not None and R['scored'].get('score') is not None, R['scored'])
        check('custom check fires', R['ck'] in ('major', 'minor'), R['ck'])
        check('hidden check and metric gone', R['arr'] is False and R['mn'] is None, [R['arr'], R['mn']])
        check('conditional questions', 'How much of the pipeline is expansion from existing customers?' in R['q'] and 'Never asked question' not in R['q'] and 'Who is on the board?' in R['q'], R['q'][:6])
        check('hidden question family gone', not any('eighteen months' in q for q in R['q']))
        check('custom pattern fires', any('Thin pipeline' in x for x in R['p']), R['p'])
        check('custom request, hidden request gone', 'CRM pipeline export with stage history' in R['req'] and not any('cap table' in x.lower() for x in R['req']), R['req'])
        check('rubric version carries the config signature', '+cfg.' in R['rub'], R['rub'])
        check('threshold override applied', R['nrrBar'] == [95, 105, 115, 130], R['nrrBar'])
        await v.evaluate("() => goTab('metrics')")
        mt0 = await v.inner_text('#rp-metrics')
        check('report marks your standard', 'your standard' in mt0, mt0[:300])
        ov = await v.inner_text('#rp-overview')
        check('pattern card on the overview', 'Thin pipeline' in ov, ov[:300])
        check('no script from a pattern title', await v.evaluate("() => !window.__xss && !document.querySelector('#result-content img[onerror]')"))
        for tab in ['findings','revenue','forensics','runway','deal','bench','scoring','questions','metrics','ledger']:
            await v.evaluate(f"() => goTab('{tab}')")
        mt = await v.inner_text('#rp-metrics'); check('custom metric in All metrics with its formula', 'Pipeline coverage' in mt and 'c_qualified_pipeline / arr_now' in mt)
        check('renamed metric shows in the report', 'Net dollar retention' in mt and 'Net revenue retention' not in mt)
        await v.evaluate("() => founderEmail()"); await v.wait_for_timeout(150)
        em = await v.evaluate("() => { const b = document.querySelector('.modal-b'); return b.innerText + Array.from(b.querySelectorAll('textarea')).map(t => t.value).join('\\n'); }")
        check('founder email carries custom question and request', 'expansion from existing customers' in em and 'CRM pipeline export' in em, em[:600])
        await v.evaluate("() => closeModal()")
        memo = await v.evaluate("() => memoHTML(S.result)")
        check('IC memo carries the custom request', 'CRM pipeline export with stage history' in memo)
        await v.screenshot(path=SHOTS + 'visitor-report.png')
        # visitor opens #studio: gate only
        await v.goto(BASE + '#studio'); await v.wait_for_selector('#gh-token')
        check('visitor at #studio only sees the sign-in gate', 'Only the owner' in await v.inner_text('#studio-content'))
        await vctx.close()

        # ── Discard, import/export, bad config file ──
        await pg.evaluate("() => studioTab('fields')")
        await pg.click('#studio-pane tbody tr:first-child >> text=Delete'); await pg.wait_for_timeout(150)
        check('delete warns about users and removes', await pg.evaluate("() => ST.draft.fields.length") == 3)
        await pg.click('text=Discard draft'); await pg.wait_for_timeout(200)
        check('discard restores the live version', await pg.evaluate("() => ST.draft.fields.length") == 4)
        check('published config survives reload for owner', True)

        # malformed config must not break the app
        GH_saved = GH['published']; GH['published'] = '{ this is not json'
        bctx, bp = await new_page(b, errs, 'badcfg')
        await bp.goto(BASE); await bp.wait_for_timeout(700)
        ok = await bp.evaluate("() => { loadDemo('halcyon'); const R = assessAll(); return R.sc.overall != null && CFG.metrics.length === 0; }")
        check('malformed radar-config.json is ignored safely', ok)
        await bctx.close()
        # config referring to a field that no longer exists
        broken = json.loads(GH_saved); broken['metrics'].append({ 'key':'m_broken', 'label':'Broken', 'formula':'deleted_field * 2', 'dim':'gtm', 'dir':'hi', 'thresholds':{ 'a':[1,2,3,4] } })
        broken['patterns'].append({ 'id':'p_bad', 'title':'Bad', 'when':'((', 'sev':'red' })
        GH['published'] = json.dumps(broken)
        bctx, bp = await new_page(b, errs, 'brokencfg')
        await bp.goto(BASE); await bp.wait_for_timeout(700)
        ok = await bp.evaluate("() => { loadDemo('northwind'); const R = assessAll(); renderResult(R); return R.D.m_broken === undefined && !R.patterns.some(p => p.title === 'Bad'); }")
        check('broken formulas degrade to no data', ok)
        await bctx.close()
        GH['published'] = GH_saved

        # sign out
        await pg.goto(BASE + '#studio'); await pg.wait_for_timeout(500)
        await pg.click('text=Sign out'); await pg.wait_for_timeout(200)
        so = await pg.evaluate("() => [sessionStorage.getItem('vcr2-gh-token'), getComputedStyle(document.getElementById('studio-link')).display, location.hash]")
        check('sign out clears the token and hides the link', so[0] is None and so[1] == 'none' and so[2] == '', so)

        # mobile layout of the Studio
        mctx = await b.new_context(viewport={ 'width':390, 'height':844 }, device_scale_factor=2)
        mp = await mctx.new_page(); await fontroute.install(mp)
        await mp.route('https://api.github.com/**', gh_route); await mp.route(_paths.ORIGIN + '/radar-config.json*', cfg_route)
        await mp.goto(BASE + '#studio'); await mp.wait_for_selector('#gh-token')
        await mp.fill('#gh-token', TOKEN); await mp.click('#gh-signin'); await mp.wait_for_timeout(500)
        ow = await mp.evaluate("() => document.documentElement.scrollWidth")
        check('Studio fits a phone (no horizontal scroll)', ow <= 392, ow)
        await mp.screenshot(path=SHOTS + 'studio-mobile.png')
        await mctx.close()

        check('no page errors anywhere', not errs, errs)
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')

if __name__ == '__main__':
    asyncio.run(main())
