"""The About page: reached from the main menu and from the #about address, one heading, the owner's text, contact links that
are correct (mailto with the address visible, GitHub and LinkedIn in a new tab without referrer), keyboard reachable, no request
to any other site, no console errors, no sideways scroll on a phone, and never in the printed memo."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio
from playwright.async_api import async_playwright
BASE = _paths.BASE
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))
EMAIL = 'ds.axel05@gmail.com'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900}); await ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
        pg = await ctx.new_page(); errs, hosts = [], set()
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('request', lambda r: hosts.add(r.url.split('/')[2].split(':')[0]) if r.url.startswith('http') else None)
        await pg.goto(BASE); await pg.wait_for_timeout(400)
        item = pg.locator('.sb-footer .nav-item', has_text='About')
        check('the main menu has an About item', await item.count() == 1)
        await pg.evaluate("toggleSidebar && toggleSidebar(true)")
        await item.click(); await pg.wait_for_timeout(300)
        check('the About item opens the About page', await pg.evaluate("!!document.querySelector('#page-about.active')"))
        info = await pg.evaluate("""() => { const pgA = document.getElementById('page-about'), vis = e => e && !e.hidden && e.getClientRects().length > 0;
            return { h1: Array.from(document.querySelectorAll('h1')).filter(vis).map(e => e.textContent.trim()), text: pgA.innerText,
                     links: Array.from(pgA.querySelectorAll('a')).map(a => [a.textContent.trim(), a.getAttribute('href'), a.target, a.rel]),
                     section: document.getElementById('tb-section').textContent, img: pgA.querySelectorAll('img, picture, svg image, video, iframe').length }; }""")
        check('exactly one visible heading, with the name', info['h1'] == ['Axel De Sousa'], info['h1'])
        check('the top bar says About', info['section'] == 'About', info['section'])
        t = info['text']
        for frag in ['Founder of VCR2', 'Numbers settled, so the conversation can be about the founder.', 'Finance and AI Analysis', 'I wanted to be in Silicon Valley',
                     'Startup World Cup hosted by Pegasus Tech Ventures', 'whether to back them or not', '(their story, their drive, their idea)',
                     'the attention goes to the person', 'France-US perspective', 'treasurer of the Menlo College Investment Club', 'I’d love to hear from you']:
            check(f'the text says "{frag}"', frag in t)
        lead = await pg.evaluate("(() => { const l = getComputedStyle(document.querySelector('.about-lead')), b = getComputedStyle(document.querySelector('.about-body p')); return [parseFloat(l.fontSize), parseFloat(b.fontSize)]; })()")
        check('the lead line is set larger than the paragraphs', lead[0] > lead[1] * 1.2, lead)
        cpl = await pg.evaluate("(() => { const p = document.querySelector('.about-body p'), c = document.createElement('span'); c.textContent = 'abcdefghijklmnopqrstuvwxyz'; p.appendChild(c); const w = c.getBoundingClientRect().width / 26; c.remove(); return Math.round(p.getBoundingClientRect().width / w); })()")
        check('paragraphs read at about 60 to 75 characters a line on a desktop', 55 <= cpl <= 78, cpl)
        check('no photo or embedded media', info['img'] == 0, info['img'])
        L = {x[0].replace(' (opens in a new tab)', ''): x for x in info['links']}
        check('the email button shows the address and opens a mail to it', f'Email {EMAIL}' in L and L[f'Email {EMAIL}'][1] == f'mailto:{EMAIL}', info['links'])
        check('GitHub links to github.com/dsaxel05 in a new tab, no opener, no referrer', L.get('GitHub', [0, 0, 0, ''])[1:] == ['https://github.com/dsaxel05', '_blank', 'noopener noreferrer'], L.get('GitHub'))
        check('LinkedIn links to the profile in a new tab, no opener, no referrer', L.get('LinkedIn', [0, 0, 0, ''])[1:] == ['https://www.linkedin.com/in/axeldesousa/', '_blank', 'noopener noreferrer'], L.get('LinkedIn'))
        check('new-tab links say so to screen readers', all('(opens in a new tab)' in x[0] for x in info['links'] if x[2] == '_blank'))
        check('no phone number and no postal address', not any(k in t.lower() for k in ['phone', '+1', 'street', 'avenue', 'tel:']))
        await pg.click('button:has-text("Copy the address")'); await pg.wait_for_timeout(300)
        clip = await pg.evaluate("navigator.clipboard.readText()")
        check('"Copy the address" copies the email address and says so', clip == EMAIL and EMAIL in await pg.evaluate("document.getElementById('toast').textContent"), clip)
        # keyboard: Tab from the top reaches the menu item; Enter opens About; the contact controls are reachable in order
        await pg.evaluate("showPage('intro')"); await pg.wait_for_timeout(200)
        await pg.evaluate("document.activeElement && document.activeElement.blur()")
        reached = False
        for _ in range(80):
            await pg.keyboard.press('Tab')
            if await pg.evaluate("document.activeElement && document.activeElement.textContent.trim() === 'About'"): reached = True; break
        check('the About item can be reached with Tab', reached)
        if reached:
            await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
            check('Enter on it opens the About page', await pg.evaluate("!!document.querySelector('#page-about.active')"))
        names = []
        await pg.focus('#page-about .about-contact a')
        for _ in range(4):
            names.append(await pg.evaluate("document.activeElement.textContent.trim()")); await pg.keyboard.press('Tab')
        check('the four contact controls follow each other with Tab', [n.replace(' (opens in a new tab)', '') for n in names] == [f'Email {EMAIL}', 'Copy the address', 'GitHub', 'LinkedIn'], names)
        ring = await pg.evaluate("(() => { const a = document.querySelector('#page-about .about-contact a'); a.focus(); const s = getComputedStyle(a); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none'; })()")
        check('a focused contact button shows a focus ring', ring)
        # the #about address opens it directly
        await pg.goto(BASE + '#about'); await pg.wait_for_timeout(500)
        check('the #about address opens the About page', await pg.evaluate("!!document.querySelector('#page-about.active')"))
        # print: the memo has none of it, and the page itself is hidden in print
        await pg.evaluate("loadDemo('northwind')")
        for _ in range(40):
            if await pg.evaluate("!!document.querySelector('#page-verify.active')"): break
            await pg.evaluate("nextSec()")
        await pg.evaluate("window.print = () => {}"); await pg.evaluate("runAnalysis()")
        await pg.wait_for_function("() => document.querySelector('#page-result.active')", timeout=30000); await pg.wait_for_timeout(500)
        await pg.evaluate("printMemo()"); await pg.wait_for_timeout(500)
        await pg.emulate_media(media='print')
        pr = await pg.evaluate("""() => ({ memo: document.getElementById('print-root').innerText, aboutShown: getComputedStyle(document.getElementById('page-about')).display !== 'none'
                                        || document.getElementById('page-about').getClientRects().length > 0 })""")
        check('the printed memo has no About text and no contact details', len(pr['memo']) > 1000 and 'Menlo' not in pr['memo'] and EMAIL not in pr['memo'] and 'linkedin' not in pr['memo'].lower(), len(pr['memo']))
        await pg.evaluate("showPage('about')"); await pg.wait_for_timeout(200)
        hidden = await pg.evaluate("Array.from(document.querySelectorAll('#page-about *')).every(e => e.getClientRects().length === 0)")
        check('printing while the About page is open shows none of it', hidden)
        await pg.emulate_media(media='screen')
        # phone width, both themes
        await pg.set_viewport_size({'width': 360, 'height': 780}); await pg.evaluate("showPage('about')"); await pg.wait_for_timeout(300)
        w = await pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
        check('no sideways scroll at 360 px', w[0] <= w[1] + 1, w)
        await pg.evaluate("cycleTheme()"); await pg.wait_for_timeout(200)
        check('no request to any other site', hosts <= {'127.0.0.1', 'localhost'}, hosts)
        check('no console errors or warnings', not errs, errs[:4])
        await b.close()
    n = sum(1 for r in results if r[0]); print(f'{n}/{len(results)} passed')
    _sys.exit(0 if n == len(results) else 1)

asyncio.run(main())
