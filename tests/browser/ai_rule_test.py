"""The AI resource rule: the site never uses the owner's key, account or money.

AI extraction, AI import and the AI memo are off by default and work only with the visitor's own key, which goes only to the
provider the visitor chose, only after the visitor clicks the button, and is never stored in a deal, an export, the library or the
published configuration. Every network call here is mocked and every key is fake: no real provider is ever contacted.
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys, json, re
from playwright.async_api import async_playwright
import fontroute
BASE = _paths.BASE
ORIGIN = _paths.ORIGIN
FAKE_KEY = 'sk-' + 'A' * 40
FAKE_TOKEN = 'github_pat_' + 'A' * 60
LINE = 'Uses your own key and your own account. Nothing is billed to the site owner.'
AI_HOSTS = ['api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com', 'api.groq.com', 'openrouter.ai']
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:400]}'))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={ 'width': 1360, 'height': 900 })
        pg = await ctx.new_page()
        errs, outside, provider_calls, github_calls = [], [], [], []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        def on_request(r):
            u = r.url
            if u.startswith(ORIGIN) or u.startswith('data:') or u.startswith('blob:'): return
            outside.append(u)
            if any(h in u for h in AI_HOSTS): provider_calls.append({ 'url': u, 'headers': dict(r.headers), 'body': r.post_data or '' })
            if 'api.github.com' in u: github_calls.append({ 'url': u, 'method': r.method })
        pg.on('request', on_request)
        async def mock_provider(route):
            await route.fulfill(status=200, json={ 'content': [{ 'type': 'text', 'text': '{}' }], 'choices': [{ 'message': { 'content': '{}' } }] })
        for h in AI_HOSTS: await pg.route(f'https://{h}/**', mock_provider)
        await pg.route('https://api.github.com/**', lambda r: r.fulfill(status=404, json={}))
        await fontroute.install(pg)
        await pg.goto(BASE); await pg.wait_for_selector('#api-key', state='attached')

        # 1. Off by default, and the sentence is next to every AI button
        check('AI is off by default (deterministic provider, no key)', await pg.evaluate("() => [$id('api-provider').value, $id('api-key').value]") == ['local', ''])
        near = await pg.evaluate("() => { const b = $id('extract-btn'); const w = b.closest('.page'); return w ? w.textContent : ''; }")
        check('the sentence is on the page of "Extract figures with AI"', LINE in re.sub(r'\s+', ' ', near), near[-200:])
        side = await pg.evaluate("() => $id('sidebar').textContent")
        check('and in the sidebar next to the key and the memo option', LINE in re.sub(r'\s+', ' ', side))
        await pg.evaluate("() => libOpenAIPaste()")
        modal = await pg.evaluate("() => (document.querySelector('.modal') || document.body).textContent")
        check('and in the library AI import', LINE in re.sub(r'\s+', ' ', modal))
        await pg.evaluate("() => closeModal()")

        # 2. With no key the button explains, in plain words, and sends nothing
        await pg.evaluate("() => { $id('intake-deck').value = 'ARR is 4.2 million dollars and net revenue retention is 112 percent for the last year.'; }")
        before = len(outside)
        await pg.evaluate("() => runExtraction()")
        t = re.sub(r'\s+', ' ', await pg.evaluate("() => $id('toast').textContent"))
        check('no key: extraction says it needs the visitor\'s own key and that nothing is billed to the owner', 'own' in t and 'billed' in t and 'site owner' in t, t)
        check('no key: nothing was sent anywhere', len(outside) == before, outside)
        await pg.click('.sb-ai > summary')   # the AI assist block sits behind a disclosure in the sidebar
        await pg.select_option('#api-provider', 'anthropic')
        await pg.evaluate("() => runExtraction()")
        t2 = re.sub(r'\s+', ' ', await pg.evaluate("() => $id('toast').textContent"))
        check('a provider chosen but no key: the same explanation, still nothing sent', 'own' in t2 and 'billed' in t2 and len(outside) == before, t2)
        await pg.evaluate("() => libOpenAIPaste()")
        w = re.sub(r'\s+', ' ', await pg.evaluate("() => (document.querySelector('.modal .warnstrip') || {}).textContent || ''"))
        check('library AI import without a key explains the same way', 'own' in w and 'billed' in w, w)
        await pg.evaluate("() => closeModal()")

        # 3. A whole analysis, memo option off, key present: still nothing leaves
        await pg.fill('#api-key', FAKE_KEY)
        await pg.evaluate("() => { loadHalcyon(); }")
        await pg.evaluate("async () => { $id('memo-toggle').checked = false; await runAnalysis(); }")
        await pg.wait_for_timeout(400)
        check('key present, memo option off: running the analysis contacts no provider', not provider_calls, provider_calls)
        check('no request at all left this origin before a click on an AI button', not outside, outside)

        # 4. The click is the opt-in: one request, to the chosen provider only, with the visitor's key
        await pg.evaluate("() => runExtraction()")
        await pg.wait_for_timeout(500)
        hosts = sorted({ re.sub(r'^https://([^/]+)/.*$', r'\1', c['url']) for c in provider_calls })
        check('after the click: exactly one request, to the chosen provider only', len(provider_calls) == 1 and hosts == ['api.anthropic.com'], hosts)
        sent = (provider_calls[0]['headers'].get('x-api-key') if provider_calls else None)
        check('it carries the visitor\'s own key, and nothing else left the page', sent == FAKE_KEY and len(outside) == 1, [sent, len(outside)])
        check('the key is not in the body of the request', not provider_calls or FAKE_KEY not in provider_calls[0]['body'])
        # the memo is a second, separate opt-in
        provider_calls.clear()
        await pg.evaluate("async () => { $id('memo-toggle').checked = true; await runAnalysis(); $id('memo-toggle').checked = false; }")
        await pg.wait_for_timeout(400)
        check('the AI memo calls the provider only when its own box is ticked', len(provider_calls) == 1 and 'api.anthropic.com' in provider_calls[0]['url'], provider_calls)

        # 5. The key is in no deal, export, library backup or draft
        await pg.evaluate("() => { window.__out = []; window.downloadFile = (n, c) => window.__out.push(String(c)); }")
        dump = await pg.evaluate("""() => {
            const o = [];
            try { saveDraft(); } catch (e) {}
            try { S.result = assessAll(); saveRunToLibrary(); } catch (e) {}
            try { exportAssessment(); } catch (e) {}
            try { libExport(); } catch (e) {}
            try { downloadReport(); } catch (e) {}
            try { o.push(memoHTML(S.result)); } catch (e) {}
            try { o.push(JSON.stringify(draftPayload())); } catch (e) {}
            return JSON.stringify({ files: window.__out.concat(o), ls: Object.assign({}, localStorage), url: location.href }); }""")
        check('exports were produced (the check is not vacuous)', len(dump) > 5000, len(dump))
        check('the key is in no export, library backup, memo, draft or address', FAKE_KEY not in dump)
        check('and it stays in this tab only, not in localStorage', await pg.evaluate("() => localStorage.getItem('vcr3-key')") is None)

        # 6. The published configuration can never carry a key or a token
        norm = await pg.evaluate("(k) => { const c = normalizeConfig({ settings: { aiModels: { openai: k, anthropic: 'claude-sonnet-5-5' } } }); return c.settings.aiModels || null; }", FAKE_KEY)
        check('a key typed in the model-name setting is dropped', norm == { 'anthropic': 'claude-sonnet-5-5' }, norm)
        github_calls.clear()
        res = await pg.evaluate("""async (k) => {
            try { ST.token = 'x'; ST.draft = normalizeConfig({ branding: { appName: k } }); } catch (e) { return 'setup: ' + e.message; }
            await publishDraft();
            return $id('toast').textContent; }""", FAKE_TOKEN)
        check('publishing a configuration that contains a token is refused, with nothing written to GitHub',
              'key or token' in res and not [c for c in github_calls if c['method'] != 'GET'], [res, github_calls])
        await pg.evaluate("() => { window.__out = []; }")
        res2 = await pg.evaluate("""(k) => { ST.draft = normalizeConfig({ branding: { appName: k } }); downloadDraft(); return [window.__out.length, $id('toast').textContent]; }""", FAKE_KEY)
        check('and saving such a configuration to a file is refused too', res2[0] == 0 and 'key or token' in res2[1], res2)

        check('no page errors', not errs, errs)
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')
    sys.exit(1 if bad else 0)

asyncio.run(main())
