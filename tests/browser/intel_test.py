"""Market intel (live) in a real browser, with the provider simulated (a fake key, the Anthropic web-search answer shape served by
the test, every other host blocked): the invitation on the overview, the three steps, the exact text sent, consent before any
request, the results with their sources, the invented source left out, the key never stored by this feature, results kept
after a reload, and the key-safety panel listing the addresses the page's own policy allows. No console error.
   python tests/browser/intel_test.py"""
import os as _os, sys as _sys, json, pathlib
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = _os.environ.get('VCR2_BASE') or (ROOT / 'index.html').as_uri()
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))
KEY = 'sk-' + 'ant-api03-' + 'TESTKEYabcdefghijklmnopqrstuvwxyz0123456789'
ANSWER = json.dumps({ 'headline':'Two funded competitors.', 'rows':[{ 'cells':['Cohere Health', 'direct', '$106M', 'Series B 2024', 'Payer side'], 'src':[1] }, { 'cells':['Ghost Co', 'direct', '$1B', '', ''], 'src':[9] }],
  'facts':[{ 'text':'Cohere raised a Series B.', 'src':[1] }], 'numbers':[{ 'what':'Cohere', 'value':106000000, 'unit':'usd', 'src':[1] }], 'ask':'How do you win against Cohere?', 'confidence':'medium',
  'sources':[{ 'n':1, 'url':'https://cohere-health.example/news/series-b', 'title':'Cohere Series B', 'date':'2024-05' }, { 'n':9, 'url':'https://made-up.example/ghost', 'title':'Invented' }] })
REPLY = json.dumps({ 'content':[{ 'type':'server_tool_use', 'id':'s1', 'name':'web_search', 'input':{ 'query':'q' } },
  { 'type':'web_search_tool_result', 'tool_use_id':'s1', 'content':[{ 'type':'web_search_result', 'url':'https://cohere-health.example/news/series-b', 'title':'Cohere Series B' }] },
  { 'type':'text', 'text':ANSWER }], 'usage':{ 'server_tool_use':{ 'web_search_requests':2 } } })

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={ 'width':1280, 'height':900 }); pg = await ctx.new_page()
        errs, sent, other = [], [], []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_FILE_NOT_FOUND' not in m.text else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            u = r.request.url
            if u.startswith('https://api.anthropic.com/'):
                sent.append({ 'body':r.request.post_data or '', 'key':r.request.headers.get('x-api-key', '') })
                await r.fulfill(status=200, content_type='application/json', headers={ 'access-control-allow-origin':'*' }, body=REPLY); return
            if u.startswith(('http://', 'https://')) and not u.startswith(BASE.rsplit('/', 1)[0]): other.append(u); await r.abort(); return
            await r.continue_()
        await ctx.route('**/*', route)
        await pg.goto(BASE); await pg.wait_for_selector('#api-key', state='attached'); await pg.wait_for_timeout(500)
        await pg.evaluate("() => { loadDemo('northwind'); }"); await pg.wait_for_timeout(800)
        await pg.evaluate("() => { goVerify(); }"); await pg.wait_for_timeout(800)
        await pg.evaluate("() => { runAnalysis(); }"); await pg.wait_for_selector('#rp-overview', timeout=20000); await pg.wait_for_timeout(800)
        inv = await pg.inner_text('#rp-overview')
        check('the overview invites to the live market data, said to be optional and never scored', 'Go further: live market data' in inv and 'Never scored' in inv)
        await pg.click('#rp-overview .intel-invite button'); await pg.wait_for_timeout(400)
        check('the button opens the Market intel tab', await pg.evaluate("() => document.querySelector('#rp-intel').classList.contains('active')"))
        t = await pg.inner_text('#rp-intel')
        check('three steps: the key, the company profile, what to research', all(x in t for x in ['Your AI key', 'The company profile', 'What to research']), t[:300])
        check('without a provider, the run button is off and the supported providers are named', await pg.is_disabled('#rp-intel button[data-click=intelRun]') and 'Anthropic' in t and 'OpenRouter' in t)
        # a provider with web search and a (fake) key, typed in the sidebar as a visitor would
        await pg.evaluate(f"() => {{ toggleSidebar(true); document.querySelector('.sb-ai').open = true; const s = $id('api-provider'); s.value = 'anthropic'; s.dispatchEvent(new Event('change', {{ bubbles:true }})); const k = $id('api-key'); k.value = '{KEY}'; k.dispatchEvent(new Event('input', {{ bubbles:true }})); toggleSidebar(false); intelRedraw(); }}")
        await pg.wait_for_timeout(300); t = await pg.inner_text('#rp-intel')
        check('the cost is shown before anything runs, billed by the provider', 'web searches on your Anthropic account' in t and '$' in t and 'never by VCR2' in t, t[t.find('web searches') - 40:t.find('web searches') + 160] if 'web searches' in t else t[:200])
        check('consent is required: the run button stays off until the box is ticked', await pg.is_disabled('#rp-intel button[data-click=intelRun]'))
        await pg.click('#rp-intel summary:has-text("Exactly what will be sent")')
        pre = await pg.inner_text('#rp-intel .intel-send pre')
        check('the exact text sent is shown: the profile, not the figures', 'Northwind Data' in pre and '4200000' not in pre and '4.20' not in pre, pre[:200])
        await pg.fill('#rp-intel textarea[data-a=what]', 'Analytics software for logistics companies')
        # only two sections, to keep the test short
        for sid in ['market', 'exits', 'team', 'traction', 'risks', 'whynow', 'snapshot']:
            await pg.click(f'#rp-intel input[data-change=intelPick][data-a={sid}]')
        await pg.click('#rp-intel input[data-change=intelConsent]')
        check('after consent the run button is on', not await pg.is_disabled('#rp-intel button[data-click=intelRun]'))
        await pg.click('#rp-intel button[data-click=intelRun]'); await pg.wait_for_function("() => document.querySelectorAll('#rp-intel .intel-card').length >= 2", timeout=20000)
        check('one request per ticked section, to the provider only, with the key in its own header', len(sent) == 2 and all(s['key'] == KEY for s in sent) and not other, [len(sent), other[:3]])
        check('the request asks for web search and carries the edited profile', all('web_search' in s['body'] and 'Analytics software for logistics' in s['body'] for s in sent))
        check('nothing from the evidence form or the ledger is in a request', not any(x in s['body'] for s in sent for x in ['Acme Logistics', '4200000', '310000', 'arr_now']))
        r = await pg.inner_text('#rp-intel')
        check('results: at a glance, then a card per section with its table and the question to ask', 'At a glance' in r and 'Cohere Health' in r and 'How do you win against Cohere?' in r)
        check('the invented source and its row are left out, and the card says so', 'Ghost Co' not in r and 'left out' in r)
        links = await pg.evaluate("() => [...document.querySelectorAll('#rp-intel .intel-src a')].map(a => [a.href, a.target, a.rel])")
        check('each source is a link that opens apart, without sharing this page', bool(links) and all(h.startswith('https://') and tg == '_blank' and 'noopener' in rl and 'noreferrer' in rl for h, tg, rl in links), links[:2])
        check('this feature never stores the key (it stays where the sidebar keeps it)', not await pg.evaluate(f"() => Object.keys(localStorage).some(k => (localStorage.getItem(k) || '').includes('{KEY[:20]}'))"))
        hosts = await pg.evaluate("() => document.querySelector('#rp-intel .intel-hosts').textContent")
        check('the safety panel lists the addresses the page may contact, read from its own policy', 'api.anthropic.com' in hosts and 'this site' in hosts, hosts)
        await pg.reload(); await pg.wait_for_selector('#api-key', state='attached'); await pg.wait_for_timeout(400)
        kept = await pg.evaluate("() => { const r = intelGet('Northwind Data'); return r ? Object.keys(r.results).length : 0; }")
        check('the results are kept in this browser after a reload', kept == 2, kept)
        check('no console error', not errs, errs[:3])
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'{len(results) - len(bad)}/{len(results)} passed')
    _sys.exit(1 if bad else 0)

asyncio.run(main())
