"""Regressions from the full verification of 2026-10-31.
Typed figures: a number field reads what the person typed with the app's own rules, the same in every browser and language
(Chromium turned "98,8" into 988, Firefox dropped it, WebKit in French read "4,200,000" as 4.2). Text that cannot be read, or reads
two ways, is not used and the field says so. Also: plain http is moved to https, and the page names its canonical address,
with robots.txt and sitemap.xml next to it. VCR2_ENGINES=chromium,firefox,webkit runs the typing checks in more engines."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, pathlib, re
from playwright.async_api import async_playwright
BASE = _paths.BASE
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))

CASES = [('98,8', '98.8'), ('98.8', '98.8'), ('1 200 000', '1200000'), ('12%', '12'), ('4,200,000', '4200000'), ('-5', '-5'),
         ('0,125', '0.125'), ('1.2M', '1200000'), ('(5)', '-5')]

async def fresh(b, locale):
    ctx = await b.new_context(locale=locale); pg = await ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(300)
    await pg.evaluate("goSetup()"); await pg.fill('#cname', 'Typing'); await pg.evaluate("S.name = 'Typing'; goIntake(); startSections()")
    return ctx, pg, errs

async def typed(pg, text):
    await pg.click('#fi-arr_now', click_count=3); await pg.keyboard.press('Backspace')
    if text: await pg.keyboard.type(text)
    await pg.keyboard.press('Tab')
    return await pg.evaluate("""() => { const e = document.getElementById('fi-arr_now'), m = document.getElementById('fe-arr_now');
        return { saved: S.vals.arr_now === undefined ? null : S.vals.arr_now, msg: m ? m.textContent : null, inv: e.getAttribute('aria-invalid'),
                 shown: m ? getComputedStyle(m).display !== 'none' : false, desc: e.getAttribute('aria-describedby'), type: e.type }; }""")

async def main():
    engines = (_os.environ.get('VCR2_ENGINES') or 'chromium').split(',')
    async with async_playwright() as p:
        for eng in engines:
            b = await getattr(p, eng).launch()
            for loc in ['en-US', 'fr-FR']:
                ctx, pg, errs = await fresh(b, loc)
                tag = f'{eng} {loc}'
                for text, want in CASES:
                    r = await typed(pg, text)
                    check(f'{tag}: typing {text!r} keeps {want}', r['saved'] == want and r['inv'] == 'false' and not r['shown'], r)
                r = await typed(pg, '1,200')
                check(f'{tag}: "1,200" (1200 or 1.2) is not guessed, the field says how to write it', r['saved'] is None and r['inv'] == 'true' and r['shown'] and '1200' in r['msg'] and '1.2' in r['msg'], r)
                r = await typed(pg, 'about two million')
                check(f'{tag}: text that is not a number is not used, and the field says so', r['saved'] is None and r['inv'] == 'true' and 'not a number' in r['msg'], r)
                check(f'{tag}: the message is tied to the field for screen readers, and the field is plain text', r['desc'] == 'fe-arr_now' and r['type'] == 'text', r)
                r = await typed(pg, '')
                check(f'{tag}: clearing the field clears the value and the message', r['saved'] is None and r['inv'] == 'false' and not r['shown'], r)
                await typed(pg, '98,8')
                await pg.evaluate("saveSec()"); await pg.reload(); await pg.wait_for_timeout(400)
                await pg.evaluate("continueDraft()"); await pg.wait_for_timeout(200)
                v = await pg.evaluate("[S.vals.arr_now, document.getElementById('fi-arr_now') && document.getElementById('fi-arr_now').value]")
                check(f'{tag}: after a reload the draft holds 98.8 and the field shows it', v == ['98.8', '98.8'], v)
                check(f'{tag}: no console errors or warnings', not errs, errs[:4])
                await ctx.close()
            await b.close()

        b = await p.chromium.launch(); ctx = await b.new_context(); pg = await ctx.new_page()
        html = (ROOT / 'index.html').read_text(encoding='utf-8')
        hits = []
        async def site(route):
            hits.append(route.request.url)
            await route.fulfill(status=200, content_type='text/html', body=html if route.request.url.split('?')[0].split('#')[0].endswith(('/', '.html')) else '')
        await pg.route('http://vcr2.example/**', site); await pg.route('https://vcr2.example/**', site)
        await pg.goto('http://vcr2.example/?x=1#studio'); await pg.wait_for_timeout(800)
        check('plain http on a real host is moved to https, keeping the path, query and hash', pg.url == 'https://vcr2.example/?x=1#studio', [pg.url, hits])
        await pg.goto(BASE); await pg.wait_for_timeout(300)
        check('a local test server on http is left alone', pg.url.startswith('http://127.0.0.1'), pg.url)
        note = await pg.evaluate("""() => { showPage('intake'); const n = document.querySelector('#page-intake .ai-sent'), b = document.getElementById('extract-btn');
            return n ? { text: n.innerText, shown: n.getClientRects().length > 0, before: !!(n.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) } : null; }""")
        check('next to "Extract figures with AI", a plain notice says what is sent, to whom, and how the key is kept',
              note and note['shown'] and note['before'] and all(k in note['text'] for k in ['sends only the text', 'AI provider you chose', 'forgotten when you close it', 'never saved']), note)
        await pg.evaluate("showPage('intro')")
        canon = await pg.evaluate("(document.querySelector('link[rel=canonical]') || {}).href")
        check('the page names its canonical address (site.json)', canon == 'https://vcr2.app/', canon)
        await b.close()

    robots = (ROOT / 'robots.txt').read_text(encoding='utf-8'); smap = (ROOT / 'sitemap.xml').read_text(encoding='utf-8')
    check('robots.txt allows everything and points to the sitemap', 'Allow: /' in robots and 'Sitemap: https://vcr2.app/sitemap.xml' in robots, robots)
    check('sitemap.xml lists the home page', '<loc>https://vcr2.app/</loc>' in smap, smap)
    allow = ROOT / 'tools' / 'public_files.txt'   # the publish list lives in the dev folder only, not in the published repository
    if allow.exists():
        pub = allow.read_text(encoding='utf-8').split()
        check('robots.txt and sitemap.xml are on the publish list', 'robots.txt' in pub and 'sitemap.xml' in pub)
    n = sum(1 for r in results if r[0]); print(f'{n}/{len(results)} passed')
    _sys.exit(0 if n == len(results) else 1)

asyncio.run(main())
