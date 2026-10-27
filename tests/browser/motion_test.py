"""Golden warmth: the moving parts are visual only.

Count-up: while a headline figure counts, the element's text is the exact final value at every moment (the counting digits are
an overlay), the count ends on that value, runs once per figure per page view and not again when the page re-renders, starts
from 134 on the home page example, and never runs under reduced motion; in print the overlay is hidden. The page cascade adds
and then removes its class. The marked headline word gets its shimmer copy. Only transform and opacity are animated.
Static: no hard-coded colour or pixel radius outside the token file and the print palette.
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys, re, pathlib
from playwright.async_api import async_playwright
import fontroute
BASE = _paths.BASE
ROOT = pathlib.Path(__file__).resolve().parents[2]
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:500]}'))

FIGS = "() => Array.from(document.querySelectorAll('#rp-overview .kpi-v')).map(k => [k.textContent, (k.querySelector('.cu-run') || {}).dataset ? (k.querySelector('.cu-run') || { dataset:{} }).dataset.cu || null : null])"

def static_checks():
    css = {f: (ROOT / 'src' / f).read_text(encoding='utf-8') for f in ['style.css', 'style-v4.css', 'style-studio.css', 'style-identity.css']}
    hexes, radii = [], []
    for f, t in css.items():
        t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
        t = re.sub(r'url\("data:[^"]*"\)', '', t)
        hexes += [f'{f}: {h}' for h in re.findall(r'#[0-9a-fA-F]{3,8}\b', t)]
        radii += [f'{f}: {r}' for r in re.findall(r'border-radius:\s*([^;}]*\d(?:px|rem)[^;}]*)', t) if 'var(--radius' not in r]
    check('no hard-coded colour in the component stylesheets (all from tokens)', not hexes, hexes[:10])
    check('no hard-coded pixel radius in the component stylesheets (all from the radius tokens)', not radii, radii[:10])
    js = (ROOT / 'src' / 'motion.js').read_text(encoding='utf-8')
    check('motion.js sets no inline handler or script (the page fingerprints stay valid)', not re.search(r'\bon[a-z]+\s*=|innerHTML|<script', js))
    ident = re.sub(r'/\*.*?\*/', '', css['style-identity.css'], flags=re.S)
    frames = re.findall(r'@keyframes\s+[\w-]+\s*\{(.*?\})\s*\}', ident, flags=re.S)
    props = set(re.findall(r'([a-z-]+)\s*:', ' '.join(frames)))
    check('keyframes animate only transform and opacity', props and props <= {'transform', 'opacity'}, props)

async def main():
    static_checks()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await fontroute.install(pg)
        await pg.goto(BASE)
        try: await pg.wait_for_function("() => document.querySelector('.spec-v.proven .ev-mark .cu-run')", timeout=4000)   # starts at first paint
        except Exception: pass
        home = await pg.evaluate("() => { const e = document.querySelector('.spec-v.proven .ev-mark'), r = e.querySelector('.cu-run'); return [e.textContent, r ? r.dataset.cu : null]; }")
        check('home example: the text is 98.8% while the overlay counts down from about 134', home[0] == '98.8%' and home[1] and 98.8 < float(home[1].rstrip('%')) <= 134.0, home)
        word = await pg.evaluate("() => { const m = document.querySelector('.intro-h1 .mark'); return [m.dataset.word, m.textContent, getComputedStyle(m, '::after').content]; }")
        check('the marked headline word carries its shimmer copy', word[0] == word[1] == 'reconcile' and 'reconcile' in word[2], word)

        await pg.evaluate("() => { loadDemo('northwind'); runAnalysis(); }")
        await pg.wait_for_function("() => document.querySelector('#rp-overview .kpi-v')", timeout=20000)
        final = None; seen_overlay = False; text_stable = True; frames = []
        for i in range(14):
            f = await pg.evaluate(FIGS)
            frames.append(f)
            if final is None: final = [x[0] for x in f]
            text_stable = text_stable and [x[0] for x in f] == final
            seen_overlay = seen_overlay or any(x[1] for x in f)
            await pg.wait_for_timeout(150)
        check('report tiles: an overlay counts while the page text stays the exact value at every sample', seen_overlay and text_stable, frames[:4])
        await pg.wait_for_timeout(600)
        end = await pg.evaluate("() => [document.querySelectorAll('.cu-run').length, document.querySelectorAll('[data-cu]').length]")
        check('after about 1.5 s every count has ended and its overlay is gone', end == [0, 0], end)
        same = await pg.evaluate("() => Array.from(document.querySelectorAll('#rp-overview .kpi-v')).map(k => k.textContent)")
        check('the final values are exactly the computed ones', same == final and same[0] == '$4.20M', same)
        await pg.evaluate("() => renderResult(S.result)"); await pg.wait_for_timeout(250)
        again = await pg.evaluate("() => document.querySelectorAll('#rp-overview .cu-run').length")
        check('a re-render of the same page view does not count again', again == 0, again)
        await pg.evaluate("() => { showPage('intro'); showPage('result'); }"); await pg.wait_for_timeout(300)
        reopen = await pg.evaluate("() => document.querySelectorAll('#rp-overview .cu-run').length")
        check('opening the page again is a new page view: the figures count again', reopen >= 4, reopen)
        casc = await pg.evaluate("() => document.querySelectorAll('#page-result .fu').length")
        check('the page fades up in a cascade when it opens', casc >= 3, casc)
        await pg.wait_for_timeout(2600)
        casc2 = await pg.evaluate("() => document.querySelectorAll('.fu').length")
        check('and the cascade class is removed once it has played', casc2 == 0, casc2)
        await pg.evaluate("() => { showPage('intro'); showPage('result'); }"); await pg.wait_for_timeout(250)
        await pg.emulate_media(media='print')
        pr = await pg.evaluate("() => { const r = document.querySelector('.cu-run'); return r ? [getComputedStyle(r, '::after').display, getComputedStyle(r).color] : null; }")
        check('in print the overlay is hidden and the real figure shows', pr and pr[0] == 'none' and pr[1] != 'rgba(0, 0, 0, 0)', pr)
        lights = await pg.evaluate("() => [getComputedStyle(document.documentElement, '::before').display, getComputedStyle(document.body, '::after').display]")
        check('in print the page lights are gone', lights == ['none', 'none'], lights)
        await pg.emulate_media(media='screen')
        side = await pg.evaluate("() => document.getElementById('pct-val').textContent")
        check('the sidebar "Form filled" text is the computed value', side == str(await pg.evaluate("() => allProgress().pct")) + '%', side)
        check('no page errors', not errs, errs)
        await ctx.close()

        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
        pg = await ctx.new_page(); await fontroute.install(pg)
        await pg.goto(BASE); await pg.wait_for_timeout(200)
        await pg.evaluate("() => { loadDemo('northwind'); runAnalysis(); }")
        await pg.wait_for_function("() => document.querySelector('#rp-overview .kpi-v')", timeout=20000)
        n = []
        for i in range(5):
            n.append(await pg.evaluate("() => document.querySelectorAll('.cu-run, .fu').length")); await pg.wait_for_timeout(120)
        check('reduced motion: nothing counts and nothing fades, every figure simply shows', n == [0] * 5, n)
        anim = await pg.evaluate("() => [getComputedStyle(document.querySelector('.btn-primary'), '::after').animationName, getComputedStyle(document.body, '::before').animationName]")
        check('reduced motion: no sheen and no drifting light', all(a == 'none' for a in anim), anim)
        await ctx.close()

        ctx = await b.new_context(viewport={'width': 390, 'height': 800})
        pg = await ctx.new_page(); await fontroute.install(pg)
        await pg.goto(BASE); await pg.wait_for_timeout(200)
        ph = await pg.evaluate("() => [getComputedStyle(document.body, '::before').animationName, getComputedStyle(document.querySelector('.topbar')).backdropFilter, document.documentElement.scrollWidth]")
        check('phone: the lights stand still, no blur, no sideways scroll', ph[0] == 'none' and ph[1] in ('none', '') and ph[2] <= 392, ph)
        await ctx.close(); await b.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')
    sys.exit(1 if bad else 0)

asyncio.run(main())
