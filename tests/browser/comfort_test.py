"""The comfortable look (owner's three points of 2026-10-13): ivory page and sidebar, light by default, large type with minimums,
text-size setting, one-column form with 52 px fields, "More options", "Show details", frames only where intended.
No external request, no token. python tests/browser/comfort_test.py   (or through run_all.py)"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys
from playwright.async_api import async_playwright
import fontroute
BASE = _paths.BASE
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))

IVORY = 'rgb(246, 239, 223)'   # --surface-page, golden warmth (#F6EFDF)
LOAD = "() => { S.name = 'Halcyon Labs'; loadHalcyon(); }"
FORM = "(i) => { S.section = i; renderSection(i); showPage('section'); }"

async def settle(pg):
    await pg.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    await pg.wait_for_timeout(250)

async def small_text(pg, limit):
    """Visible text elements whose own text is smaller than `limit` px (the legal footer is exempt)."""
    return await pg.evaluate("""(limit) => {
      const out = [];
      for (const e of document.querySelectorAll('body *')) {
        if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') continue;
        if (e.closest('.p-foot, #print-root, script, style')) continue;
        const own = Array.from(e.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (fs < limit - 0.01) out.push([e.tagName, (e.className && e.className.baseVal === undefined) ? e.className : '', fs, e.textContent.trim().slice(0, 30)]);
      }
      return out.slice(0, 8);
    }""", limit)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # a visitor whose device prefers the dark theme still gets the light page
        ctx = await b.new_context(viewport={'width': 1360, 'height': 900}, color_scheme='dark')
        pg = await ctx.new_page(); await fontroute.install(pg)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        ext = []; pg.on('request', lambda r: ext.append(r.url) if not r.url.startswith(('http://127.0.0.1', 'file:', 'data:', 'blob:')) else None)
        await pg.goto(BASE); await pg.wait_for_timeout(400)
        await pg.evaluate("() => { localStorage.clear(); applyLook(); }"); await pg.reload(); await pg.wait_for_timeout(400)
        a = await pg.evaluate("() => [document.documentElement.getAttribute('data-theme'), document.documentElement.getAttribute('data-text'), getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.getElementById('sidebar')).backgroundColor, getComputedStyle(document.body).backgroundColor, getComputedStyle(document.getElementById('sidebar')).backdropFilter]")
        check('the default theme is light even when the device prefers dark', a[0] == 'light', a)
        # Golden warmth (5.0.4): the ivory sits on <html> so the glow and the pastel lights show through a transparent body;
        # the sidebar is frosted ivory over it, never a green panel.
        check('the page background is the ivory of the template', a[2] == IVORY and a[4] == 'rgba(0, 0, 0, 0)', [a[2], a[4]])
        check('the sidebar is frosted ivory (no green panel)', a[3] == 'rgba(255, 250, 240, 0.8)' and 'blur' in (a[5] or ''), [a[3], a[5]])
        check('the default text size is Normal (body 16 px)', a[1] == 'normal', a[1])

        # "follow the device" is an owner option
        d = await pg.evaluate("() => { CFG.look = { theme: 'auto' }; applyLook(); const t = document.documentElement.getAttribute('data-theme'); CFG.look = {}; applyLook(); return [t, document.documentElement.getAttribute('data-theme')]; }")
        check('"follow the device" still works when the owner chooses it', d == ['dark', 'light'], d)

        # text size: the visitor button and the owner default
        r = await pg.evaluate("() => { const out = {}; for (const t of ['normal', 'large', 'xlarge']) { setTextPref(t); out[t] = [parseFloat(getComputedStyle(document.documentElement).fontSize), parseFloat(getComputedStyle(document.body).fontSize)]; } setTextPref(null); return out; }")
        check('Normal is a 16 px root and a 16 px body', r['normal'] == [16, 16], r['normal'])
        check('Large is 1.125 times (18 px body) and Extra large 1.25 times (20 px)', abs(r['large'][1] - 18) < 0.1 and abs(r['xlarge'][1] - 20) < 0.1, r)
        c = await pg.evaluate("() => { setTextPref(null); document.getElementById('text-toggle').click(); const a = document.documentElement.getAttribute('data-text'); const s = localStorage.getItem('vcr2-text'); setTextPref(null); return [a, s, document.documentElement.getAttribute('data-text')]; }")
        check('the Aa button changes the size, remembers it, and the choice can be cleared', c == ['large', 'large', 'normal'], c)
        o = await pg.evaluate("() => { CFG.look = { text: 'large' }; applyLook(); const a = document.documentElement.getAttribute('data-text'); CFG.look = {}; applyLook(); return a; }")
        check("the owner's default text size applies", o == 'large', o)

        # the browser-tab title is a setting
        tt = await pg.evaluate("() => { const a = document.title; CFG.branding = { pageTitle: 'Acme Diligence Radar' }; applyBranding(); const b = document.title; CFG.branding = {}; applyBranding(); return [a, b, document.title]; }")
        check('the browser-tab title follows the setting and comes back', tt[1] == 'Acme Diligence Radar' and tt[2] == tt[0] and 'VCR2' in tt[0], tt)
        # page scale: 75 % is built in; 90 and 100 zoom the whole page
        z = await pg.evaluate("() => { const out = []; for (const v of [undefined, '90', '100']) { CFG.look = v ? { page: v } : {}; applyLook(); out.push([document.documentElement.getAttribute('data-page'), getComputedStyle(document.documentElement).zoom]); } CFG.look = {}; applyLook(); return out; }")
        check('page scale: 75 % built in, 90 % zooms 1.2, 100 % zooms 1.33', z[0][0] is None and float(z[0][1]) == 1 and abs(float(z[1][1]) - 1.2) < 0.01 and abs(float(z[2][1]) - 1.3333) < 0.01, z)
        # type minimums at Normal, on the form, the report and the landing page
        await pg.evaluate("() => setTextPref('normal')")
        await pg.evaluate(LOAD); await pg.evaluate(FORM, 0); await settle(pg)
        s = await small_text(pg, 13)
        check('nothing on the form is smaller than 13 px', not s, s)
        m = await pg.evaluate("""() => { const f = sel => { const e = document.querySelector(sel); return e ? parseFloat(getComputedStyle(e).fontSize) : null; };
          return { body: f('body'), label: f('.field-lbl'), help: f('.field-hint'), btn: f('.btn-primary'), input: f('.field-inp'), lh: parseFloat(getComputedStyle(document.body).lineHeight) / parseFloat(getComputedStyle(document.body).fontSize) }; }""")
        check('body 16, labels 14, help 13, buttons 14 at Normal', m['body'] >= 16 and m['label'] >= 14 and m['help'] >= 13 and m['btn'] >= 14, m)
        check('line height 1.6', abs(m['lh'] - 1.6) < 0.01, m['lh'])

        # one column, 52 px fields, 28 px between fields
        g = await pg.evaluate("""() => { const cards = [...document.querySelectorAll('.field-group:first-of-type .field-card')].slice(0, 3);
          const r = cards.map(c => c.getBoundingClientRect()); const inp = document.querySelector('.field-inp').getBoundingClientRect();
          return { n: cards.length, x: r.map(b => Math.round(b.left)), gap: r.length > 1 ? Math.round(r[1].top - r[0].bottom) : null, h: Math.round(inp.height) }; }""")
        check('one column', g['n'] >= 2 and len(set(g['x'])) == 1, g)
        check('21 px between fields (28 px less 25 %)', g['gap'] == 21, g)
        check('fields are at least 39 px tall (52 px less 25 %)', g['h'] >= 39, g)

        # progress line and the "More options" disclosure
        pl = await pg.inner_text('#sec-field-count')
        check('a quiet progress line ("n of m filled")', ' of ' in pl and pl.endswith('filled'), pl)
        mo = await pg.evaluate("() => { const d = document.querySelector('.more-options'); return d ? [d.open, d.querySelector('summary').textContent.trim(), document.querySelectorAll('.more-options .field-card').length] : null; }")
        check('secondary fields sit behind "More options", closed by default', mo is not None and mo[0] is False and mo[2] > 0 and 'More options' in mo[1], mo)
        vis = await pg.evaluate("() => [...document.querySelectorAll('.more-options .field-card')].every(c => !c.checkVisibility())")
        check('the fields in it are not shown until it is opened', vis)
        await pg.click('.more-options > summary'); await settle(pg)
        vis2 = await pg.evaluate("() => [...document.querySelectorAll('.more-options .field-card')].every(c => c.checkVisibility())")
        check('opening it shows them', vis2)
        ph = await pg.evaluate("() => { S.vals = {}; S.sel = {}; renderSection(0); const e = document.querySelector('.field-inp'); return e.placeholder; }")
        check('an empty field shows an example', ph.startswith('e.g.'), ph)

        # frames and dividers only on the landing page, the report header and the memo
        fr = await pg.evaluate("""() => { const has = sel => { const e = document.querySelector(sel); return e ? getComputedStyle(e, '::before').content : 'missing'; };
          return { modal: has('.modal'), gate: has('.studio-gate') }; }""")
        check('no inner frame on dialogs or the Studio gate', fr['modal'] in ('none', 'normal', 'missing') and fr['gate'] in ('none', 'normal', 'missing'), fr)
        await pg.evaluate(LOAD); await pg.evaluate("() => { runAnalysis(); }")
        await pg.wait_for_function("() => document.getElementById('page-result').classList.contains('active')", timeout=20000); await settle(pg)
        hero = await pg.evaluate("() => [getComputedStyle(document.querySelector('.res-hero')).boxShadow, !!document.querySelector('.res-hero .rule-d'), document.querySelectorAll('#page-result .rule-d').length, getComputedStyle(document.querySelector('.res-hero')).borderTopWidth]")
        # the double frame is now the gold hairline plus a second gold ring outside it (two spread shadows)
        check('the report header keeps its double frame and one diamond divider', hero[0].count(' 0px 0px 0px ') >= 2 and hero[3] == '1px' and hero[1] and hero[2] == 1, hero)
        h = await pg.inner_text('.res-meta + .res-meta')
        import re
        check('the run ID is 16 hex digits', re.search(r'run [0-9A-F]{16}\b', h) is not None, h)
        s = await small_text(pg, 13)
        check('nothing on the report is smaller than 13 px', not s, s)

        # report views and wide tables
        mv = await pg.evaluate("() => [document.querySelectorAll('.rtabs')[0].querySelectorAll('.rtab').length, !!document.querySelector('.rtabs-more'), document.querySelector('.rtabs-more').open]")
        check('four report views in sight, the rest behind "More views"', mv[0] == 4 and mv[1] and mv[2] is False, mv)
        await pg.evaluate("() => goTab('metrics')"); await settle(pg)
        t = await pg.evaluate("""() => { const w = document.querySelector('#rp-metrics .tbl-wrap'); const cols = () => [...w.querySelectorAll('thead th')].filter(th => th.offsetParent !== null).length;
          const before = cols(); document.querySelector('#rp-metrics .detail-toggle').click(); const after = cols();
          return { before, after, open: document.querySelector('.rtabs-more').open }; }""")
        check('a wide table shows its main columns, and all of them after "Show details"', t['before'] == 3 and t['after'] == 6 and t['open'], t)

        # letter-spacing never above .06em
        ls = await pg.evaluate("""() => { const bad = [];
          for (const e of document.querySelectorAll('body *')) { if (!e.offsetParent) continue; const cs = getComputedStyle(e); const fs = parseFloat(cs.fontSize);
            const sp = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing); if (sp / fs > 0.0605 && e.textContent.trim()) bad.push([e.tagName, e.className, (sp / fs).toFixed(3)]); }
          return bad.slice(0, 6); }""")
        check('tracking is at most 0.06em everywhere', not ls, ls)
        check('no uncaught errors, no outside request', not errs and not ext, [errs[:2], ext[:2]])
        await ctx.close()

        # phone: no sideways scroll on the form and the report
        mctx = await b.new_context(viewport={'width': 390, 'height': 844}, color_scheme='dark')
        mp = await mctx.new_page(); await fontroute.install(mp)
        await mp.goto(BASE); await mp.wait_for_timeout(400)
        await mp.evaluate(LOAD); await mp.evaluate(FORM, 0); await settle(mp)
        w1 = await mp.evaluate("() => [document.documentElement.scrollWidth, getComputedStyle(document.documentElement).backgroundColor]")
        check('the form fits a phone and is ivory', w1[0] <= 392 and w1[1] == IVORY, w1)
        s = await small_text(mp, 13)
        check('nothing on the phone form is smaller than 13 px', not s, s)
        await mp.evaluate("() => runAnalysis()")
        await mp.wait_for_function("() => document.getElementById('page-result').classList.contains('active')", timeout=20000); await settle(mp)
        w2 = await mp.evaluate("() => document.documentElement.scrollWidth")
        check('the report fits a phone', w2 <= 392, w2)
        # shape and size, chosen in the Studio (fake token, mocked GitHub)
        TOKEN = 'github_pat_' + 'A' * 60
        async def gh(route):
            url = route.request.url
            if url.endswith('/user'): return await route.fulfill(status=200, json={'login': 'dsaxel05'})
            if url.endswith('/repos/dsaxel05/VCR2'): return await route.fulfill(status=200, json={'full_name': 'dsaxel05/VCR2', 'permissions': {'push': True, 'pull': True}})
            return await route.fulfill(status=404, json={'message': 'Not Found'})
        sctx = await b.new_context(viewport={'width': 1360, 'height': 900})
        sp = await sctx.new_page(); await fontroute.install(sp)
        await sp.route('https://api.github.com/**', gh)
        await sp.route(_paths.ORIGIN + '/radar-config.json*', lambda r: r.fulfill(status=404, json={'message': 'Not Found'}))
        await sp.goto(BASE + '#studio'); await sp.wait_for_selector('#gh-token')
        await sp.fill('#gh-token', TOKEN); await sp.click('#gh-signin'); await sp.wait_for_timeout(600)
        await sp.evaluate("() => studioTab('look')"); await sp.wait_for_timeout(200)
        txt = await sp.inner_text('#studio-pane')
        check('Look & feel offers corners, three sizes and the report views', all(w in txt for w in ['Shape and size', 'Corners', 'Titles and headings', 'Figures', 'Questions', 'Report views in sight']), txt[:120])
        await sp.check('#st-preview'); await sp.wait_for_timeout(150)
        base_px = await sp.evaluate("() => [getComputedStyle(document.querySelector('.btn')).borderTopLeftRadius, parseFloat(getComputedStyle(document.querySelector('.block-title')).fontSize)]")
        await sp.click('label.look-pill:has(input[name="st-corners"][value="square"])'); await sp.wait_for_timeout(200)
        await sp.click('label.look-pill:has(input[name="st-sizeTitle"][value="xlarge"])'); await sp.wait_for_timeout(200)
        after = await sp.evaluate("() => [getComputedStyle(document.querySelector('.btn')).borderTopLeftRadius, parseFloat(getComputedStyle(document.querySelector('.block-title')).fontSize), document.documentElement.getAttribute('data-corners'), document.documentElement.getAttribute('data-sz-t')]")
        check('round (pill) buttons are the built-in shape', base_px[0] == '999px', base_px)
        check('square corners apply to buttons', after[2] == 'square' and after[0] == '0px', after)
        check('the largest title size multiplies the heading size by 1.3', abs(after[1] / base_px[1] - 1.3) < 0.02, [base_px, after])
        await sp.evaluate("() => { setLookView('revenue', false); setLookView('deal', true); }"); await sp.wait_for_timeout(200)
        v = await sp.evaluate("() => ST.draft.look.views")
        check('the views in sight follow the ticks, in order', v == ['overview', 'findings', 'questions', 'deal'], v)
        await sp.evaluate("() => { leaveStudio(); S.name = 'Halcyon Labs'; loadHalcyon(); runAnalysis(); }")
        await sp.wait_for_function("() => document.getElementById('page-result').classList.contains('active')", timeout=20000)
        main = await sp.evaluate("() => [...document.querySelectorAll('.rtabs')[0].querySelectorAll('.rtab')].map(b => b.id)")
        check('the report shows the chosen views in sight', main == ['rt-overview', 'rt-findings', 'rt-questions', 'rt-deal'], main)
        await sp.evaluate("() => { goStudio(); }"); await sp.wait_for_timeout(300)
        await sp.evaluate("() => studioTab('look')"); await sp.wait_for_timeout(200)
        await sp.click('label.look-pill:has(input[name="st-corners"][value="round"])'); await sp.click('label.look-pill:has(input[name="st-sizeTitle"][value="normal"])'); await sp.wait_for_timeout(200)
        await sp.evaluate("() => setLook('views', '')"); await sp.wait_for_timeout(200)
        gone = await sp.evaluate("() => [JSON.stringify(ST.draft.look || {}), document.documentElement.hasAttribute('data-corners'), document.documentElement.hasAttribute('data-sz-t')]")
        check('choosing the built-in values again removes the settings', gone[0] == '{}' and gone[1] is False and gone[2] is False, gone)
        # metrics measured together, chosen in the Studio
        await sp.evaluate("() => studioTab('scoring')"); await sp.wait_for_timeout(200)
        txt = await sp.inner_text('#studio-pane')
        check('the scoring tab offers "Metrics measured together"', 'Metrics measured together' in txt, txt[:100])
        await sp.evaluate("() => { document.querySelector('#studio-pane details.paste').open = true; }")
        await sp.select_option('select[aria-label="Group of Net revenue retention"]', '')
        await sp.wait_for_timeout(200)
        g = await sp.evaluate("() => ST.draft.settings.correlationGroups")
        check('taking a metric out of its group is a draft setting', g is not None and 'nrr' not in sum(g.values(), []) and 'grr' in g['retention'], g)
        await sp.evaluate("() => addCorrGroup('Unit economics')"); await sp.wait_for_timeout(150)
        g2 = await sp.evaluate("() => Object.keys(ST.draft.settings.correlationGroups)")
        check('a new group can be added', 'unit_economics' in g2, g2)
        await sp.evaluate("() => corrSave(JSON.parse(JSON.stringify(CORR_GROUPS)))"); await sp.wait_for_timeout(150)
        g3 = await sp.evaluate("() => ST.draft.settings.correlationGroups")
        check('"back to the built-in groups" removes the setting', g3 is None, g3)
        await sctx.close()
        await b.close()
    ok = sum(1 for r in results if r[0])
    print(f'\n{ok}/{len(results)} passed')
    sys.exit(0 if ok == len(results) else 1)

asyncio.run(main())
