"""Accessibility regressions found by the axe-core scan of 2026-10-14 (tools/axe_scan.py), as checks that need no outside tool:
names for controls, one h1 and no skipped heading level on every page, labelled landmarks, focusable scrollable tables, text contrast
where the colour is computed (heatmap) or was dimmed by opacity.   python tests/browser/a11y_test.py"""
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

TOKEN = 'github_pat_' + 'A' * 60

NAMELESS = """() => {
  const out = [];
  const named = e => e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title') || (e.id && document.querySelector('label[for="' + e.id + '"]')) || e.closest('label');
  for (const e of document.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea')) {
    if (!e.checkVisibility || !e.checkVisibility({ checkOpacity: false, checkVisibilityCSS: false }) && e.type !== 'checkbox') continue;
    if (!named(e)) out.push((e.tagName + '.' + e.className + '[' + (e.type || '') + ']').slice(0, 60));
  }
  return out.slice(0, 6);
}"""

HEADINGS = """() => {
  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(h => h.checkVisibility && h.checkVisibility());
  const levels = hs.map(h => +h.tagName[1]);
  const ones = levels.filter(l => l === 1).length;
  let skip = null;
  for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) { skip = [levels[i - 1], levels[i], hs[i].textContent.trim().slice(0, 30)]; break; }
  return { ones, skip, first: levels[0] };
}"""

NAVS = """() => [...document.querySelectorAll('nav')].filter(n => n.checkVisibility()).map(n => n.getAttribute('aria-label') || n.getAttribute('aria-labelledby') || '')"""

SCROLLERS = """() => [...document.querySelectorAll('.tbl-wrap')].filter(w => w.checkVisibility() && w.scrollWidth > w.clientWidth + 1)
  .filter(w => !(w.tabIndex >= 0 && w.getAttribute('role') === 'region' && w.getAttribute('aria-label'))).map(w => w.className + ' ' + w.scrollWidth + '>' + w.clientWidth).slice(0, 5)"""

EMPTYTH = """() => [...document.querySelectorAll('th')].filter(t => t.checkVisibility() && !t.textContent.trim()).length"""

# a scrolling strip of tabs must hold something focusable, and region labels must be unique (axe: scrollable-region-focusable, landmark-unique)
TABSTRIPS = """() => [...document.querySelectorAll('.rtabs')].filter(w => w.checkVisibility())
  .filter(w => !w.querySelector('[tabindex="0"], button:not([tabindex]), a[href]')).map(w => w.getAttribute('aria-label')).slice(0, 4)"""
REGIONS = """() => { const l = [...document.querySelectorAll('[role=region][aria-label]')].filter(w => w.checkVisibility()).map(w => w.getAttribute('aria-label'));
  return l.filter((x, i) => l.indexOf(x) !== i).slice(0, 4); }"""

CONTRAST = """(sels) => {
  const parse = c => {
    let m = c.match(/color\(srgb ([^)]+)\)/);
    if (m) { const p = m[1].split(/[ \/]+/).filter(Boolean).map(Number); return { r:p[0] * 255, g:p[1] * 255, b:p[2] * 255, a:p.length > 3 ? p[3] : 1 }; }
    m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r:p[0], g:p[1], b:p[2], a:p.length > 3 ? p[3] : 1 };
  };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = e => { let layers = []; for (let n = e; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a === 1) break; } }
    let base = { r:255, g:255, b:255, a:1 }; for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base); return base; };
  const opac = e => { let o = 1; for (let n = e; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  const out = [];
  for (const sel of sels) for (const e of document.querySelectorAll(sel)) {
    if (!e.checkVisibility() || !e.textContent.trim()) continue;
    const fg = parse(getComputedStyle(e).color), bg = bgOf(e); if (!fg) continue;
    const o = opac(e); const f = blend({ r:fg.r, g:fg.g, b:fg.b, a:fg.a * o }, bg);
    const l1 = lum(f), l2 = lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (ratio < 4.5) out.push([sel, Math.round(ratio * 100) / 100, e.textContent.trim().slice(0, 20)]);
  }
  return out.slice(0, 6);
}"""

PAGES = {
  'landing': "() => showPage('intro')",
  'setup': "() => goSetup()",
  'intake': "() => { S.name = 'Northwind'; loadDemo('northwind'); showPage('intake'); renderIntakeStatus(); }",
  'form': "() => { S.name = 'Halcyon'; loadHalcyon(); S.section = 0; renderSection(0); showPage('section'); }",
  'report': "() => { S.name = 'Halcyon'; loadHalcyon(); S.result = assessAll(); renderResult(S.result); showPage('result'); }",
  'library': "() => goLibrary()",
}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for theme in ('light', 'dark'):
            ctx = await b.new_context(viewport={'width': 1360, 'height': 860}, reduced_motion='reduce')
            pg = await ctx.new_page(); await fontroute.install(pg)
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(BASE); await pg.wait_for_timeout(400)
            await pg.evaluate("t => { localStorage.setItem('vcr2-theme', t); applyLook(); }", theme)
            for name, js in PAGES.items():
                await pg.evaluate(js); await pg.wait_for_timeout(250)
                nl = await pg.evaluate(NAMELESS)
                check(f'{theme} {name}: every field has a name', not nl, nl)
                h = await pg.evaluate(HEADINGS)
                check(f'{theme} {name}: exactly one h1 and no skipped heading level', h['ones'] == 1 and h['skip'] is None, h)
                nv = await pg.evaluate(NAVS)
                check(f'{theme} {name}: every navigation landmark has its own name', all(nv) and len(set(nv)) == len(nv), nv)
                sc = await pg.evaluate(SCROLLERS)
                check(f'{theme} {name}: scrollable tables can be reached by keyboard', not sc, sc)
                et = await pg.evaluate(EMPTYTH)
                check(f'{theme} {name}: no empty table header', et == 0, et)
            # report tabs (the report page again: the loop above ended on the library)
            await pg.evaluate(PAGES['report']); await pg.wait_for_timeout(250)
            for tab in ['findings', 'revenue', 'forensics', 'runway', 'deal', 'bench', 'scoring', 'questions', 'metrics', 'ledger', 'checklist']:
                await pg.evaluate("t => goTab(t)", tab); await pg.wait_for_timeout(150)
                sc = await pg.evaluate(SCROLLERS); et = await pg.evaluate(EMPTYTH); nl = await pg.evaluate(NAMELESS); h = await pg.evaluate(HEADINGS)
                check(f'{theme} report/{tab}: tables reachable, headers named, fields named, headings in order', not sc and et == 0 and not nl and h['skip'] is None, [sc, et, nl, h])
            # a company with deal-breakers shows the gate block: heading order must still hold, on the overview and the other views
            await pg.evaluate("() => { S.name = 'Northwind'; loadDemo('northwind'); S.result = assessAll(); renderResult(S.result); showPage('result'); }"); await pg.wait_for_timeout(250)
            for tab in ['overview', 'findings', 'revenue', 'forensics', 'scoring', 'questions']:
                await pg.evaluate("t => goTab(t)", tab); await pg.wait_for_timeout(120)
                h = await pg.evaluate(HEADINGS); rg = await pg.evaluate(REGIONS)
                check(f'{theme} northwind/{tab}: one h1, no skipped heading level, unique region names', h['ones'] == 1 and h['skip'] is None and not rg, [h, rg])
            await pg.evaluate(PAGES['report']); await pg.wait_for_timeout(250)
            # the cohort heatmap and the dimmed forensic rows keep readable text
            await pg.evaluate("() => goTab('revenue')"); await pg.wait_for_timeout(200)
            c = await pg.evaluate(CONTRAST, ['.heatmap td', '.heatmap td.m'])
            check(f'{theme}: heatmap cells read at 4.5:1', not c, c)
            await pg.evaluate("() => goTab('forensics')"); await pg.wait_for_timeout(200)
            c = await pg.evaluate(CONTRAST, ['.fx .fx-st', '.fx summary', '.fx p', '.field-hint', '.contra-h .sev'])
            check(f'{theme}: forensic notes read at 4.5:1', not c, c)
            await pg.evaluate("() => goTab('runway')"); await pg.wait_for_timeout(200)
            c = await pg.evaluate(CONTRAST, ['.da-v', '.da p', '.pill'])
            check(f'{theme}: default-alive block reads at 4.5:1', not c, c)
            await pg.evaluate("() => goTab('findings')"); await pg.wait_for_timeout(200)
            c = await pg.evaluate(CONTRAST, ['.sev', '.pat-sev', '.field-group-hint'])
            check(f'{theme}: findings labels read at 4.5:1', not c, c)
            check(f'{theme}: no uncaught errors', not errs, errs)
            await ctx.close()
        # phone width: the strips of report tabs scroll sideways and must be reachable by keyboard, also when the current view is under "More views"
        ctx = await b.new_context(viewport={'width': 390, 'height': 800}, reduced_motion='reduce')
        ph = await ctx.new_page(); await fontroute.install(ph)
        await ph.goto(BASE); await ph.wait_for_timeout(400)
        await ph.evaluate(PAGES['report']); await ph.wait_for_timeout(250)
        for tab in ['overview', 'scoring', 'forensics', 'deal', 'bench']:
            await ph.evaluate("t => { goTab(t); document.querySelectorAll('.rtabs-more').forEach(d => d.open = true); }", tab); await ph.wait_for_timeout(150)
            ts = await ph.evaluate(TABSTRIPS); rg = await ph.evaluate(REGIONS); sc = await ph.evaluate(SCROLLERS)
            check(f'phone report/{tab}: tab strips reachable by keyboard, region names unique, tables reachable', not ts and not rg and not sc, [ts, rg, sc])
        await ctx.close()
        # the Studio, signed in
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
        for tab in ['home', 'metrics', 'standards', 'look', 'scoring', 'constants', 'fields', 'questions', 'texts', 'differs', 'advanced']:
            await sp.evaluate("t => studioTab(t)", tab); await sp.wait_for_timeout(150)
            nl = await sp.evaluate(NAMELESS); h = await sp.evaluate(HEADINGS); nv = await sp.evaluate(NAVS); sc = await sp.evaluate(SCROLLERS)
            check(f'studio/{tab}: fields named, one h1, landmarks named, tables reachable', not nl and h['ones'] == 1 and h['skip'] is None and all(nv) and len(set(nv)) == len(nv) and not sc, [nl, h, nv, sc])
        # the Studio on a phone: a hidden header name must not push the page wider than the screen
        await ctx.close()
        ctx = await b.new_context(viewport={'width': 390, 'height': 800}, reduced_motion='reduce')
        sp = await ctx.new_page(); await fontroute.install(sp); await sp.route('https://api.github.com/**', gh)
        await sp.route(_paths.ORIGIN + '/radar-config.json*', lambda r: r.fulfill(status=404, json={'message': 'Not Found'}))
        await sp.goto(BASE + '#studio'); await sp.wait_for_selector('#gh-token')
        await sp.fill('#gh-token', TOKEN); await sp.click('#gh-signin'); await sp.wait_for_timeout(600)
        for tab in ['standards', 'scoring', 'metrics', 'look']:
            await sp.evaluate("t => studioTab(t)", tab); await sp.wait_for_timeout(250)
            w = await sp.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            check(f'phone studio/{tab}: the page does not scroll sideways', w[0] <= w[1] + 1, w)
        await b.close()
    ok = sum(1 for r in results if r[0])
    print(f'\n{ok}/{len(results)} passed')
    sys.exit(0 if ok == len(results) else 1)

asyncio.run(main())
