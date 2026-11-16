"""The sidebar on a short screen (1100 x 670): the evidence sections get the free height and scroll on their own, the footer stays
compact (Library, About, AI assist, Reset or erase), opening AI assist never squeezes the sections below 8rem, and a wheel over the
sidebar never scrolls the page behind it. No console error.
   python tests/browser/sidebar_scroll_test.py"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, pathlib
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = _os.environ.get('VCR2_BASE') or (ROOT / 'index.html').as_uri()
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))
FIRE = "([sel, dy]) => { const el = document.querySelector(sel); const e = new WheelEvent('wheel', { deltaY:dy, bubbles:true, cancelable:true }); el.dispatchEvent(e); return e.defaultPrevented; }"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={ 'width':1100, 'height':670 })).new_page(); errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_FILE_NOT_FOUND' not in m.text else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_selector('#api-key', state='attached'); await pg.wait_for_timeout(500)
        await pg.evaluate("() => loadDemo('northwind')"); await pg.wait_for_timeout(800)
        h = await pg.evaluate("() => { const r = id => Math.round(document.getElementById(id).getBoundingClientRect().height); const f = document.getElementById('sb-footer'); return { nav:r('sb-nav'), foot:r('sb-footer'), footScroll:f.scrollHeight > f.clientHeight + 1, items:document.querySelectorAll('#sb-nav .nav-item').length }; }")
        check('the evidence sections get more height than the footer (at least 240 px of 670, with or without the Sign in button)', h['nav'] > h['foot'] and h['nav'] >= 240, h)
        check('closed, the footer shows all its entries without scrolling', not h['footScroll'], h)
        foot = await pg.inner_text('#sb-footer')
        check('the footer holds Library, About, AI assist and Reset or erase, plus the Alt + M hint', all(x in foot for x in ['Library', 'About', 'AI assist', 'Reset or erase', 'Alt + M']), foot)
        await pg.evaluate("() => { document.querySelector('.sb-ai').open = true; }"); await pg.wait_for_timeout(150)
        h2 = await pg.evaluate("() => { const f = document.getElementById('sb-footer'); return { nav:Math.round(document.getElementById('sb-nav').getBoundingClientRect().height), footScroll:f.scrollHeight > f.clientHeight + 1 }; }")
        check('AI assist open: the footer scrolls inside its cap and the sections keep at least 8rem', h2['footScroll'] and h2['nav'] >= 128, h2)
        await pg.evaluate("() => { document.querySelector('.sb-ai').open = false; document.getElementById('sb-nav').scrollTop = 0; }")
        check('a wheel over the sidebar header is absorbed (the page does not move)', await pg.evaluate(FIRE, ['.sb-progress', 100]))
        check('a wheel down over the sections scrolls the sections', not await pg.evaluate(FIRE, ['#sb-nav .nav-item', 100]))
        check('a wheel up at the top of the sections is absorbed', await pg.evaluate(FIRE, ['#sb-nav .nav-item', -100]))
        await pg.evaluate("() => { const n = document.getElementById('sb-nav'); n.scrollTop = n.scrollHeight; }")
        check('a wheel down at the end of the sections is absorbed', await pg.evaluate(FIRE, ['#sb-nav .nav-item', 100]))
        check('a wheel over the page still scrolls the page', not await pg.evaluate(FIRE, ['.main', 100]))
        await pg.mouse.move(80, 300); y0 = await pg.evaluate("() => scrollY"); await pg.mouse.wheel(0, 600); await pg.wait_for_timeout(300)
        check('a real wheel over the sidebar leaves the page where it was', await pg.evaluate("() => scrollY") == y0)
        await pg.mouse.move(700, 300); await pg.mouse.wheel(0, 400); await pg.wait_for_timeout(300)
        check('a real wheel over the page scrolls it', await pg.evaluate("() => scrollY") > y0)
        check('no console error', not errs, errs[:3])
        await b.close()
    failed = [r for r in results if not r[0]]
    print(f'{len(results) - len(failed)}/{len(results)} passed')
    _sys.exit(1 if failed else 0)

asyncio.run(main())
