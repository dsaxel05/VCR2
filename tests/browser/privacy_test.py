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

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        csp = []
        external = []
        ctx = await b.new_context(viewport={ 'width':1360, 'height':900 })
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: csp.append(m.text) if 'Content Security Policy' in m.text or 'Refused to' in m.text else None)
        def on_request(r):
            u = r.url
            if not (u.startswith(_paths.ORIGIN) or u.startswith('data:') or u.startswith('blob:')): external.append(u)
        pg.on('request', on_request)
        await pg.route('https://api.github.com/**', lambda r: r.fulfill(status=404, json={}))
        await pg.goto(BASE); await pg.wait_for_selector('#api-key', state='attached')
        meta = await pg.evaluate("() => (document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]') || {}).content || ''")
        check('a Content-Security-Policy is set', "default-src 'none'" in meta and "connect-src 'self' https://api.github.com" in meta, meta[:120])
        check('and a no-referrer policy', await pg.evaluate("() => (document.querySelector('meta[name=referrer]') || {}).content") == 'no-referrer')

        # AI key: this tab only, unless asked
        KEY = 'sk-ant-api03-' + 'Z' * 40
        await pg.click('.sb-ai > summary')   # the AI assist block sits behind a disclosure in the sidebar
        await pg.select_option('#api-provider', 'anthropic')
        await pg.fill('#api-key', KEY)
        st = await pg.evaluate("() => [sessionStorage.getItem('vcr3-key'), localStorage.getItem('vcr3-key')]")
        check('the key is kept in this tab only by default', st[0] == KEY and st[1] is None, st)
        check('the remember box is off by default', not await pg.is_checked('#api-remember'))
        await pg.reload(); await pg.wait_for_selector('#api-key', state='attached')
        check('it survives a reload of the same tab', await pg.input_value('#api-key') == KEY)
        # not in a deal, a draft, an export or the library
        await pg.evaluate("() => { loadHalcyon(); S.result = assessAll(); saveDraft(); saveRunToLibrary(); }")
        dump = await pg.evaluate("() => JSON.stringify({ ls:Object.assign({}, localStorage), exp: (function(){ try { return JSON.stringify(draftPayload()); } catch (e) { return ''; } })() })")
        check('the key is in no draft, export or library entry', KEY not in dump)
        await pg.check('#api-remember'); await pg.wait_for_timeout(100)
        check('remembering writes it to this computer', await pg.evaluate("() => localStorage.getItem('vcr3-key')") == KEY)
        await pg.uncheck('#api-remember'); await pg.wait_for_timeout(100)
        check('and unticking removes it again', await pg.evaluate("() => localStorage.getItem('vcr3-key')") is None)
        await pg.click('#api-forget'); await pg.wait_for_timeout(100)
        check('forget clears the field and both stores', await pg.input_value('#api-key') == '' and await pg.evaluate("() => [sessionStorage.getItem('vcr3-key'), localStorage.getItem('vcr3-key')]") == [None, None])
        # a key saved by an earlier version shows as remembered, so it can be removed
        await pg.evaluate("() => { localStorage.setItem('vcr3-key', 'sk-old-' + 'Q'.repeat(30)); localStorage.removeItem('vcr3-remember'); sessionStorage.clear(); }")
        await pg.reload(); await pg.wait_for_selector('#api-key', state='attached')
        check('an older saved key is shown as remembered', await pg.is_checked('#api-remember') and (await pg.input_value('#api-key')).startswith('sk-old-'))
        await pg.uncheck('#api-remember'); await pg.click('#api-forget')

        # a whole tour under the policy: nothing blocked, nothing third-party
        await pg.evaluate("() => { loadNorthwind(); }")
        await pg.evaluate("() => { S.result = assessAll(); showPage('result'); renderResult(S.result); }")
        await pg.wait_for_timeout(300)
        for tab in ['findings', 'forensics', 'runway', 'deal', 'bench', 'scoring', 'questions', 'metrics', 'ledger', 'checklist']:
            await pg.evaluate("(t) => goTab(t)", tab)
        await pg.evaluate("() => { goLibrary(); }"); await pg.wait_for_timeout(200)
        check('no request left this origin', not external, external)
        check('the policy blocked nothing the app needs', not csp, csp)
        check('no page errors anywhere', not errs, errs)
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'{chr(10)}{len(results) - len(bad)}/{len(results)} passed')

if __name__ == '__main__':
    asyncio.run(main())
