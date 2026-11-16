"""My analyses, laid out for people: one card per analysis with its name and one line of facts (stage and model by name, when
saved, the score), Open as the main button, Versions next to it, and the rarer actions (Duplicate, Rename, Tags, Archive,
Delete) under a More menu that closes on a click elsewhere or on Escape, one open at a time. Compare stays off until exactly
two are ticked. On a phone (375 px) nothing scrolls sideways. The list is drawn from rows the test provides (no backend), and
a hostile name stays text. No console error.
   python tests/browser/mine_layout_test.py"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, pathlib
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = _os.environ.get('VCR2_BASE') or (ROOT / 'index.html').as_uri()
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))
ROWS = """() => { showPage('mine');
  _mine.rows = [
    { id:'a1', title:'Mantis', stage:'seed', model:'saas', updated_at:new Date().toISOString(), score:null, tags:[] },
    { id:'a2', title:'Northwind Data', stage:'a', model:'saas', updated_at:new Date(Date.now() - 3 * 864e5).toISOString(), score:58, band:'watch', tags:['fintech'] },
    { id:'a3', title:'Evil <img src=x>', stage:'seed', model:'marketplace', updated_at:new Date(Date.now() - 20 * 864e5).toISOString(), score:71, tags:[] } ];
  _mine.usage = { analyses:3, max_analyses:100, bytes:220000, max_bytes:5242880 }; _mine.tick = new Set(); acctRenderMine(); }"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        for vw in (1100, 375):
            pg = await (await b.new_context(viewport={ 'width':vw, 'height':800 })).new_page()
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_FILE_NOT_FOUND' not in m.text else None); pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(BASE); await pg.wait_for_selector('#api-key', state='attached'); await pg.wait_for_timeout(400)
            await pg.evaluate(ROWS); await pg.wait_for_timeout(300)
            if vw == 375:
                sw = await pg.evaluate("() => [document.documentElement.scrollWidth, innerWidth]")
                check('phone (375 px): no sideways scroll', sw[0] <= sw[1], sw)
                hs = await pg.evaluate("() => [...document.querySelectorAll('.mine-acts .btn')].map(x => x.getBoundingClientRect().height)")
                check('phone: the card buttons stay tappable (32 px or more)', hs and min(hs) >= 32, hs)
                await pg.close(); continue
            check('one card per analysis', await pg.locator('.mine-item').count() == 3)
            meta = await pg.locator('.mine-item').nth(1).locator('.mine-meta').inner_text()
            check('the facts line names the stage and the model, with the score and its band', 'Series A' in meta and 'B2B SaaS' in meta and 'score 58 (watch)' in meta, meta)
            check('a card with no score says so plainly', 'no score yet' in await pg.locator('.mine-item').nth(0).locator('.mine-meta').inner_text())
            check('a hostile name stays text, nothing is injected', 'Evil <img src=x>' in await pg.locator('.mine-item').nth(2).locator('.mine-name').inner_text() and await pg.locator('#mine-content img').count() == 0)
            first = await pg.evaluate("() => [...document.querySelectorAll('.mine-item')[0].querySelectorAll('.mine-acts > .btn')].map(x => [x.textContent.trim(), x.classList.contains('btn-primary')])")
            check('Open is the main button, Versions beside it', first == [['Open', True], ['Versions', False]], first)
            check('the rarer actions sit in the More menu, hidden until asked', await pg.locator('.mine-item').nth(0).locator('.mine-menu').is_hidden())
            await pg.locator('.mine-item').nth(0).locator('.mine-more > summary').click()
            items = [x.strip() for x in await pg.locator('.mine-item').nth(0).locator('.mine-menu button').all_text_contents()]
            check('More shows Duplicate, Rename, Tags, Archive and Delete, Delete last', items == ['Duplicate', 'Rename', 'Tags', 'Archive', 'Delete'], items)
            await pg.locator('.mine-item').nth(1).locator('.mine-more > summary').dispatch_event('click')   # the open menu covers this button, as any drop-down would
            check('opening another More closes the first (one open at a time)', await pg.evaluate("() => document.querySelectorAll('.mine-more[open]').length") == 1)
            await pg.click('.mine-head h2')
            check('a click elsewhere closes it', await pg.evaluate("() => document.querySelectorAll('.mine-more[open]').length") == 0)
            await pg.locator('.mine-item').nth(1).locator('.mine-more > summary').click(); await pg.keyboard.press('Escape')
            check('Escape closes it and puts the focus back on More', await pg.evaluate("() => document.querySelectorAll('.mine-more[open]').length === 0 && document.activeElement.matches('.mine-more > summary')"))
            check('Compare is off with nothing ticked', await pg.is_disabled('[data-click=acctMineCompare]'))
            await pg.locator('.mine-item').nth(0).locator('.mine-tick').check(); await pg.locator('.mine-item').nth(1).locator('.mine-tick').check()
            check('two ticked: Compare turns on and the count says 2 ticked', not await pg.is_disabled('[data-click=acctMineCompare]') and '2 ticked' in await pg.inner_text('.mine-count'))
            check('Save a version shows only when an analysis is open from the account', await pg.locator('[data-click=acctSaveVersionGo]').count() == 0)
            check('Preferences are folded away', await pg.evaluate("() => !document.querySelector('.mine-prefs').open"))
            await pg.close()
        check('no console error', not errs, errs[:3])
        await b.close()
    failed = [r for r in results if not r[0]]
    print(f'{len(results) - len(failed)}/{len(results)} passed')
    _sys.exit(1 if failed else 0)

asyncio.run(main())
