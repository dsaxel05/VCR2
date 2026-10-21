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
    if '/commits?' in url and m == 'GET':
        return await route.fulfill(status=200, json=[{ 'sha':h['sha'], 'commit':{ 'message':h['message'], 'author':{ 'date':'2026-10-11T10:00:00Z' } } } for h in reversed(GH.get('history', []))])
    if '/contents/radar-config.json?ref=' in url and m == 'GET' and url.split('ref=')[1] != 'main':
        sha = url.split('ref=')[1]
        for h in GH.get('history', []):
            if h['sha'] == sha:
                return await route.fulfill(status=200, json={ 'sha':sha, 'content':base64.b64encode(h['content'].encode('utf-8')).decode('ascii') })
        return await route.fulfill(status=404, json={})
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
        GH.setdefault('history', []).append({ 'sha':GH['sha'], 'message':body.get('message', ''), 'content':GH['published'] })
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
        await pg.goto(BASE + '#studio'); await pg.wait_for_selector('#gh-token')
        await pg.fill('#gh-token', TOKEN); await pg.click('#gh-signin'); await pg.wait_for_timeout(500)

        # ── Texts: the Studio pane and click-to-edit mode ──
        await pg.evaluate("() => studioTab('anytext')")
        t = await pg.inner_text('#studio-pane')
        check('Edit any text pane is there', 'Edit texts on the site' in t and 'No text changed yet' in t, t[:200])
        await pg.click('button:has-text("Edit texts on the site")'); await pg.wait_for_timeout(400)
        check('edit mode shows a banner and previews the draft', await pg.is_visible('#te-banner') and await pg.evaluate("() => previewOn()"))
        await pg.click('.intro-h1'); await pg.wait_for_selector('#te-from')
        original = await pg.input_value('#te-from')
        check('clicking a text opens it for editing', 'numbers' in original.lower() or len(original) > 3, original)
        await pg.fill('#te-from', 'Check whether the numbers'); await pg.fill('#te-to', 'Prove that the numbers')
        await pg.click('.modal-f .btn-primary'); await pg.wait_for_timeout(300)
        h1 = await pg.inner_text('.intro-h1')
        check('the page changes at once', h1.startswith('Prove that the numbers'), h1)
        check('the change is in the draft', await pg.evaluate("() => JSON.parse(localStorage.getItem('vcr2-studio-draft')).texts.length") == 1)
        # a visitor-facing second text: the button label
        btn = await pg.evaluate("() => (document.querySelector('.hero .btn-primary, .hero button') || {}).textContent || ''")
        check('the hero has a button to edit too', len(btn.strip()) > 2, btn)
        await pg.click('#te-banner >> text=Leave edit mode'); await pg.wait_for_timeout(200)
        check('edit mode ends', not await pg.is_visible('#te-banner'))
        check('replacement stays in preview', (await pg.inner_text('.intro-h1')).startswith('Prove that the numbers'))

        # ── Publish, then a fresh visitor sees it ──
        await pg.goto(BASE + '#studio'); await pg.wait_for_selector('#studio-pane'); await pg.wait_for_timeout(300)
        GH['put_status'] = 201
        await publish_now(pg, 700)
        cfg = json.loads(GH['published'])
        check('published config carries the replacement', cfg.get('texts') == [{'from':'Check whether the numbers', 'to':'Prove that the numbers'}], cfg.get('texts'))
        vctx, v = await new_page(b, errs, 'visitor')
        await v.goto(BASE); await v.wait_for_function("() => CFG.texts.length === 1", timeout=5000)
        vh = await v.inner_text('.intro-h1')
        check('a visitor sees the owner’s words', vh.startswith('Prove that the numbers'), vh)
        # the same words reach the markdown report and the founder email
        r = await v.evaluate("() => { loadHalcyon(); S.result = assessAll(); return [trText('Check whether the numbers reconcile'), typeof trHTML] }")
        check('exports use the same replacement', r[0] == 'Prove that the numbers reconcile' and r[1] == 'function', r)
        # Reset: back to built-in
        await pg.evaluate("() => { studioTab('anytext'); }")
        await pg.click('text=Back to built-in'); await pg.wait_for_timeout(200)
        check('removing the replacement restores the built-in words', (await pg.evaluate("() => ST.draft.texts.length")) == 0)
        await pg.goto(BASE + '#studio'); await pg.wait_for_timeout(400)
        await pg.evaluate("() => leaveStudio()"); await pg.wait_for_timeout(200)
        check('and the page', (await pg.inner_text('.intro-h1')).startswith('Check whether the numbers'), await pg.inner_text('.intro-h1'))

        # ── Safety: constants, undo / redo, what differs, review, advanced JSON, history ──
        await pg.goto(BASE + '#studio'); await pg.wait_for_selector('#studio-pane'); await pg.wait_for_timeout(300)
        await pg.evaluate("() => studioTab('constants')")
        inp = await pg.query_selector('input[aria-label^="Most a dimension can move"]')
        await inp.fill('9'); await inp.press('Tab'); await pg.wait_for_timeout(200)
        check('a scoring constant is saved in the draft', await pg.evaluate("() => ST.draft.settings.boolCap") == 9)
        check('and the pane shows the built-in value beside it', 'Built-in: 15' in await pg.inner_text('#studio-pane'))
        await pg.click('#st-undo'); await pg.wait_for_timeout(200)
        check('undo puts it back', await pg.evaluate("() => ST.draft.settings.boolCap") is None)
        await pg.click('#st-redo'); await pg.wait_for_timeout(200)
        check('redo brings it again', await pg.evaluate("() => ST.draft.settings.boolCap") == 9)
        await pg.evaluate("() => studioTab('differs')")
        dt = await pg.inner_text('#studio-pane')
        check('what differs lists the change', 'Scoring rule: boolCap' in dt and '1 setting' in dt, dt[:300])
        await pg.click('button:has-text("Back to built-in")'); await pg.wait_for_timeout(200)
        check('and has a way back for each', await pg.evaluate("() => ST.draft.settings.boolCap") is None)
        # advanced JSON
        await pg.evaluate("() => studioTab('advanced')")
        await pg.fill('#adv-json', '{ not json'); await pg.wait_for_timeout(400)
        check('invalid JSON is explained and cannot be applied', 'not valid JSON' in await pg.inner_text('#adv-status') and await pg.is_disabled('#adv-apply'))
        good = json.dumps({ 'settings': { 'boolCap': 8, 'invented': 1 }, 'madeUpKey': { 'a': 1 }, 'labels': { 'metrics': { 'nrr': 'Net dollar retention' } } })
        await pg.fill('#adv-json', good); await pg.wait_for_timeout(400)
        st = await pg.inner_text('#adv-status'); dr = await pg.inner_text('#adv-drops')
        check('valid JSON is accepted and unknown keys are listed', 'Valid' in st and 'madeUpKey' in dr and 'invented' in dr, [st, dr])
        await pg.click('#adv-apply'); await pg.wait_for_timeout(300)
        check('applied to the draft, unknown keys left out', await pg.evaluate("() => [ST.draft.settings.boolCap, ST.draft.labels.metrics.nrr, 'madeUpKey' in ST.draft, ST.draft.settings.invented]") == [8, 'Net dollar retention', False, None])
        # review and publish
        await pg.click('text=Publish to the live site'); await pg.wait_for_selector('#rv-publish')
        rv = await pg.inner_text('.modal')
        check('the review lists the changes and the impact on both examples', 'Northwind' in rv and 'Halcyon' in rv and 'change' in rv, rv[:400])
        await pg.click('#rv-publish'); await pg.wait_for_timeout(700)
        tt = await pg.inner_text('#toast')
        cfg2 = json.loads(GH['published'])
        check('published with the new settings', cfg2['settings'].get('boolCap') == 8 and cfg2['labels']['metrics'].get('nrr') == 'Net dollar retention', [tt, cfg2['settings']])
        # a reader of a report is told the site differs from built-in
        vctx2, v2 = await new_page(b, errs, 'visitor2')
        await v2.goto(BASE); await v2.wait_for_function("() => CFG.settings.boolCap === 8", timeout=5000)
        note = await v2.evaluate("() => { loadHalcyon(); return customisationNote(); }")
        check('every report carries the “differs from built-in” sentence', note.startswith('1 setting of this site differs'), note)
        # history and revert
        await pg.evaluate("() => openHistory()"); await pg.wait_for_selector('button:has-text("Load into my draft")')
        n_hist = await pg.locator('button:has-text("Load into my draft")').count()
        check('publish history lists the published versions', n_hist >= 2, n_hist)
        await pg.locator('button:has-text("Load into my draft")').last.click(); await pg.wait_for_timeout(500)
        check('an older version can be loaded into the draft', await pg.evaluate("() => ST.draft.settings.boolCap") is None and await pg.evaluate("() => ST.draft.texts.length") == 1, await pg.evaluate("() => JSON.stringify(ST.draft.settings)"))
        # reset everything
        await pg.evaluate("() => { ST.draft.metricWeights.nrr = 3; saveStudioDraft(); }")
        await pg.evaluate("() => resetEverything()"); await pg.wait_for_timeout(300)
        check('reset everything puts the whole draft back to built-in', await pg.evaluate("() => settingsDiff(ST.draft).length") == 0)
        await pg.click('#st-undo'); await pg.wait_for_timeout(200)
        check('and can be undone', await pg.evaluate("() => settingsDiff(ST.draft).length") > 0)
        check('no page errors anywhere', not errs, errs)
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'{chr(10)}{len(results) - len(bad)}/{len(results)} passed')

if __name__ == '__main__':
    asyncio.run(main())
