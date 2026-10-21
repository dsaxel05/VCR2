"""The retractable sidebar: one labelled toggle in the top bar, an Alt + M shortcut, a coverage chip and a Sections menu while it is
hidden, a drawer on phone and tablet, state kept in this browser only, a Studio default, reduced motion.   python tests/browser/sidebar_test.py"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, json, sys
from playwright.async_api import async_playwright
import fontroute
BASE = _paths.BASE
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))

TOKEN = 'github_pat_' + 'A' * 60
FORM = "() => { S.name = 'Halcyon'; loadHalcyon(); S.section = 0; renderSection(0); showPage('section'); }"
REPORT = "() => { S.name = 'Halcyon'; loadHalcyon(); S.result = assessAll(); renderResult(S.result); showPage('result'); }"

VISIBLE = "(sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.right > 1 && r.left < innerWidth - 1; }"
STATE = """() => { const t = document.getElementById('sb-toggle'), s = document.getElementById('sidebar'), m = document.querySelector('.main');
  return { attr: document.documentElement.getAttribute('data-sidebar'), expanded: t && t.getAttribute('aria-expanded'), controls: t && t.getAttribute('aria-controls'),
           label: t && t.textContent.trim(), inert: !!(s && s.inert), open: s && s.classList.contains('open'), marginLeft: m ? parseFloat(getComputedStyle(m).marginLeft) : null,
           active: document.activeElement && (document.activeElement.id || document.activeElement.tagName) }; }"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---- desktop
        ctx = await b.new_context(viewport={'width': 1360, 'height': 860}, reduced_motion='reduce')
        pg = await ctx.new_page(); await fontroute.install(pg)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_timeout(400)
        await pg.evaluate("() => { try { localStorage.removeItem('vcr2-sidebar'); } catch (e) {} }")
        await pg.evaluate(FORM); await pg.wait_for_timeout(250)
        s0 = await pg.evaluate(STATE)
        check('desktop: the toggle is in the top bar, with a visible word, and points at the sidebar', bool(s0['label']) and s0['controls'] == 'sidebar' and s0['expanded'] == 'true', s0)
        check('desktop: the sidebar is open at the start', await pg.evaluate(VISIBLE, '#sidebar') and s0['attr'] in (None, 'open'), s0)
        tip = await pg.evaluate("() => { const t = document.getElementById('sb-toggle'); return [t.title, t.getAttribute('aria-keyshortcuts')]; }")
        check('desktop: the shortcut is written in the app (tooltip and in the sidebar)', 'Alt + M' in tip[0] and tip[1] == 'Alt+M' and 'Alt + M' in await pg.inner_text('#sidebar'), tip)
        pct = (await pg.inner_text('#pct-val')).strip()
        await pg.click('#sb-toggle'); await pg.wait_for_timeout(250)
        s1 = await pg.evaluate(STATE)
        check('desktop: the toggle hides the sidebar and the main area takes the width', s1['attr'] == 'hidden' and s1['expanded'] == 'false' and not await pg.evaluate(VISIBLE, '#sidebar') and s1['marginLeft'] == 0, s1)
        check('desktop: a hidden sidebar cannot be reached with the Tab key', s1['inert'] is True, s1)
        w = await pg.evaluate("() => { const f = document.querySelector('.field-grid'); return f ? f.getBoundingClientRect().width : 0; }")
        check('desktop: the form keeps a comfortable line length (at most 42 rem)', 0 < w <= 42 * 16 * 1.01 * 0.75 * 1.4 and w < 700 * 1.4, w)
        chip = await pg.evaluate("() => { const c = document.getElementById('tb-cov'); return c ? [c.textContent.trim(), c.getBoundingClientRect().width > 0] : null; }")
        check('desktop: the coverage percentage stays in the top bar', chip and chip[1] and pct in chip[0], [chip, pct])
        sec = await pg.evaluate("() => { const b = document.getElementById('tb-sections'); return b ? [b.tagName, b.getAttribute('aria-label'), b.options.length, b.getBoundingClientRect().width > 0] : null; }")
        check('desktop: a Sections list is in the top bar while the sidebar is hidden', sec and sec[0] == 'SELECT' and sec[3] and sec[2] >= 5 and sec[1], sec)
        before = await pg.evaluate("() => document.getElementById('tb-section').textContent")
        await pg.select_option('#tb-sections', index=2); await pg.wait_for_timeout(250)
        after = await pg.evaluate("() => [document.getElementById('tb-section').textContent, document.activeElement.id, document.getElementById('tb-sections').selectedIndex]")
        check('desktop: choosing a section jumps to it and keeps focus on the list', after[0] != before and after[1] == 'tb-sections' and after[2] == 2, [before, after])
        nav = await pg.evaluate("() => [...document.querySelectorAll('.sec-nav button')].map(b => b.textContent.trim())")
        check('desktop: Previous and Next stay at the bottom of the section', any(x in ('Previous', 'Back') for x in nav) and any('Next' in x or 'verification' in x for x in nav), nav)
        ls = await pg.evaluate("() => localStorage.getItem('vcr2-sidebar')")
        check('desktop: the choice is kept in this browser', ls == 'hidden', ls)
        await pg.reload(); await pg.wait_for_timeout(400)
        first = await pg.evaluate("() => document.documentElement.getAttribute('data-sidebar')")
        check('desktop: it is still hidden after a reload', first == 'hidden', first)
        await pg.evaluate(FORM); await pg.wait_for_timeout(200)
        await pg.keyboard.press('Alt+m'); await pg.wait_for_timeout(250)
        s2 = await pg.evaluate(STATE)
        check('desktop: Alt + M brings it back', s2['attr'] == 'open' and await pg.evaluate(VISIBLE, '#sidebar') and not s2['inert'], s2)
        # the choice never travels with a deal
        keys = await pg.evaluate("() => { saveDraft && saveDraft(); return Object.keys(localStorage).filter(k => /vcr2-(draft|lib)|vcr3|deal/.test(k)).map(k => localStorage.getItem(k)).join('|'); }")
        exp_js = await pg.evaluate("() => JSON.stringify(S).includes('sidebar')")
        check('desktop: the choice is in no deal, draft or export', 'sidebar' not in keys and not exp_js, [exp_js])
        # the owner's default applies when the visitor has not chosen
        d = await pg.evaluate("""() => { localStorage.removeItem('vcr2-sidebar'); applyConfig(normalizeConfig({ look:{ sidebar:'hidden' } }));
            const a = [document.documentElement.getAttribute('data-sidebar'), resolvedSidebar()];
            localStorage.setItem('vcr2-sidebar', 'open'); applyLook();
            const b = [document.documentElement.getAttribute('data-sidebar'), resolvedSidebar()];
            localStorage.removeItem('vcr2-sidebar'); applyConfig(EMPTY_CONFIG()); return [a, b, document.documentElement.getAttribute('data-sidebar')]; }""")
        check('desktop: the owner default applies, and the visitor choice wins over it', d[0] == ['hidden', 'hidden'] and d[1] == ['open', 'open'] and d[2] == 'open', d)
        # reduced motion: no transition on the sidebar
        tr = await pg.evaluate("() => [getComputedStyle(document.getElementById('sidebar')).transitionDuration, getComputedStyle(document.querySelector('.main')).transitionDuration]")
        check('desktop: with reduced motion nothing slides', all(x.replace('s', '').replace('0', '').replace('.', '').replace(',', '').strip() == '' for x in tr), tr)
        # the report page: same behaviour
        await pg.evaluate(REPORT); await pg.wait_for_timeout(300)
        await pg.click('#sb-toggle'); await pg.wait_for_timeout(200)
        rep = await pg.evaluate("() => [document.documentElement.getAttribute('data-sidebar'), document.documentElement.scrollWidth <= document.documentElement.clientWidth]")
        check('desktop: the report page works with the sidebar hidden, no sideways scroll', rep == ['hidden', True], rep)
        check('desktop: no uncaught error', not errs, errs)
        await ctx.close()
        # ---- phone and tablet: a drawer
        for name, vw, vh in (('phone', 390, 800), ('tablet', 768, 1024)):
            ctx = await b.new_context(viewport={'width': vw, 'height': vh}, reduced_motion='reduce')
            pg = await ctx.new_page(); await fontroute.install(pg)
            await pg.goto(BASE); await pg.wait_for_timeout(400)
            await pg.evaluate("() => { try { localStorage.removeItem('vcr2-sidebar'); } catch (e) {} }")
            await pg.evaluate(FORM); await pg.wait_for_timeout(250)
            s = await pg.evaluate(STATE)
            check(f'{name}: the sidebar is closed at the start and cannot be tabbed into', not await pg.evaluate(VISIBLE, '#sidebar') and s['inert'] is True and s['expanded'] == 'false' and s['marginLeft'] == 0, s)
            check(f'{name}: the toggle has a visible word', bool(s['label']), s)
            vis = await pg.evaluate(VISIBLE, '#sb-toggle')
            chip = await pg.evaluate("() => { const c = document.getElementById('tb-cov'); return c ? c.getBoundingClientRect().width > 0 : false; }")
            check(f'{name}: the coverage chip is in the top bar', vis and chip, [vis, chip])
            await pg.click('#sb-toggle'); await pg.wait_for_timeout(250)
            s = await pg.evaluate(STATE)
            check(f'{name}: the toggle opens the drawer over the page', s['open'] and s['expanded'] == 'true' and not s['inert'] and await pg.evaluate(VISIBLE, '#sidebar'), s)
            inside = await pg.evaluate("() => document.getElementById('sidebar').contains(document.activeElement)")
            check(f'{name}: focus moves into the drawer', inside, s['active'])
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(250)
            s = await pg.evaluate(STATE)
            check(f'{name}: Escape closes it and focus returns to the toggle', not s['open'] and s['active'] == 'sb-toggle' and s['expanded'] == 'false', s)
            await pg.click('#sb-toggle'); await pg.wait_for_timeout(200)
            before = await pg.evaluate("() => document.getElementById('tb-section').textContent")
            await pg.click('#sb-nav .nav-item:nth-of-type(3)'); await pg.wait_for_timeout(300)
            s = await pg.evaluate(STATE)
            after = await pg.evaluate("() => document.getElementById('tb-section').textContent")
            check(f'{name}: picking a section closes the drawer and returns focus to the toggle', not s['open'] and s['active'] == 'sb-toggle' and after != before, [before, after, s])
            await pg.click('#sb-toggle'); await pg.wait_for_timeout(150)
            await pg.click('#sidebar-overlay', position={'x': vw - 10, 'y': 200}); await pg.wait_for_timeout(200)
            s = await pg.evaluate(STATE)
            check(f'{name}: a tap outside closes the drawer', not s['open'] and s['active'] == 'sb-toggle', s)
            sw = await pg.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            check(f'{name}: the page does not scroll sideways', sw[0] <= sw[1] + 1, sw)
            await ctx.close()
        # ---- the Studio control
        async def gh(route):
            u = route.request.url
            if u.endswith('/user'): return await route.fulfill(status=200, json={'login': 'dsaxel05'})
            if u.endswith('/repos/dsaxel05/VCR2'): return await route.fulfill(status=200, json={'full_name': 'dsaxel05/VCR2', 'permissions': {'push': True, 'pull': True}})
            return await route.fulfill(status=404, json={'message': 'Not Found'})
        ctx = await b.new_context(viewport={'width': 1360, 'height': 860}, reduced_motion='reduce')
        sp = await ctx.new_page(); await fontroute.install(sp); await sp.route('https://api.github.com/**', gh)
        await sp.route(_paths.ORIGIN + '/radar-config.json*', lambda r: r.fulfill(status=404, json={'message': 'Not Found'}))
        await sp.goto(BASE + '#studio'); await sp.wait_for_selector('#gh-token')
        await sp.fill('#gh-token', TOKEN); await sp.click('#gh-signin'); await sp.wait_for_timeout(600)
        await sp.evaluate("() => studioTab('look')"); await sp.wait_for_timeout(200)
        has = await sp.evaluate("() => !!document.querySelector('[role=radiogroup][aria-label=\"Sidebar on start\"]')")
        check('studio: Look & feel has "Sidebar on start"', has, has)
        await sp.click('label.look-pill:has(input[name="st-sidebar"][value="hidden"])'); await sp.wait_for_timeout(200)
        v = await sp.evaluate("() => ST.draft.look.sidebar")
        check('studio: choosing "hidden" goes into the draft', v == 'hidden', v)
        reset = await sp.query_selector('button:has-text("Reset the sidebar to open")')
        if reset: await reset.click(); await sp.wait_for_timeout(200)
        v2 = await sp.evaluate("() => ST.draft.look.sidebar")
        check('studio: Reset to built-in puts it back to open', reset is not None and v2 is None, [bool(reset), v2])
        await b.close()
    ok = sum(1 for r in results if r[0])
    print(f'\n{ok}/{len(results)} passed')
    sys.exit(0 if ok == len(results) else 1)

asyncio.run(main())
