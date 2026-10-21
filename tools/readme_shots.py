#!/usr/bin/env python3
"""Regenerates the README screenshots and the demo GIF in docs/img from the built index.html (file://).

    python tools/readme_shots.py            # writes docs/img/*.png and docs/img/demo.gif
Needs Playwright (python -m playwright install chromium) and Pillow. Fictional sample companies only; the Studio is signed in with the
fake token against a mocked GitHub API, so nothing is sent anywhere."""
import io, pathlib
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'img'
URL = (ROOT / 'index.html').as_uri()
TOKEN = 'github_pat_' + 'A' * 60
W, H = 1360, 880


def gh(route):
    u = route.request.url
    if u.endswith('/user'): return route.fulfill(status=200, json={'login': 'dsaxel05'})
    if u.endswith('/repos/dsaxel05/VCR2'): return route.fulfill(status=200, json={'full_name': 'dsaxel05/VCR2', 'permissions': {'push': True, 'pull': True}})
    return route.fulfill(status=404, json={'message': 'Not Found'})


def settle(pg, ms=350):
    pg.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))")
    pg.wait_for_timeout(ms)


def save(png, name, colors=160):
    im = Image.open(io.BytesIO(png)).convert('RGB')
    q = im.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    q.save(OUT / name, optimize=True)
    return im


def report(pg, tab=None, scroll_to=None):
    pg.evaluate("() => { S.name = 'Halcyon Labs'; loadHalcyon(); S.result = assessAll(); renderResult(S.result); showPage('result'); }")
    if tab: pg.evaluate("t => goTab(t)", tab)
    if scroll_to:
        pg.evaluate("t => { const e = [...document.querySelectorAll('.block-title')].find(x => x.textContent.toLowerCase().includes(t)); if (e) window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY - 80, behavior: 'instant' }); }", scroll_to)
    if tab and not scroll_to:
        pg.evaluate("() => { const e = document.querySelector('.rpane.active'); if (e) window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY - 90, behavior: 'instant' }); }")
    settle(pg)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    frames = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': W, 'height': H}); pg = ctx.new_page()
        pg.route('https://api.github.com/**', gh)
        pg.goto(URL); pg.wait_for_timeout(500)
        pg.evaluate("() => { localStorage.setItem('vcr2-theme', 'light'); localStorage.setItem('vcr2-text', 'large'); applyLook(); }")
        settle(pg)
        frames.append(save(pg.screenshot(), 'screenshot-intro.png'))
        pg.evaluate("() => { S.name = 'Halcyon Labs'; loadHalcyon(); S.section = 0; renderSection(0); showPage('section'); }"); settle(pg)
        frames.append(save(pg.screenshot(), 'screenshot-inputs.png'))
        pg.evaluate("() => { S.name = 'Halcyon Labs'; loadHalcyon(); goVerify(); }"); settle(pg)
        save(pg.screenshot(), 'screenshot-verification.png')
        report(pg); frames.append(save(pg.screenshot(), 'screenshot-overview.png'))
        report(pg, 'findings'); frames.append(save(pg.screenshot(), 'screenshot-riskmap.png'))
        report(pg, 'revenue'); save(pg.screenshot(), 'screenshot-revenue.png')
        report(pg, 'forensics'); save(pg.screenshot(), 'screenshot-forensics.png')
        report(pg, 'runway'); save(pg.screenshot(), 'screenshot-runway.png')
        report(pg, 'deal'); frames.append(save(pg.screenshot(), 'screenshot-deal.png'))
        report(pg, 'deal', 'returns'); save(pg.screenshot(), 'screenshot-returns.png')
        report(pg, 'scoring'); save(pg.screenshot(), 'screenshot-scored.png')
        # the Studio, signed in with the fake token
        pg.goto(URL + '#studio'); pg.wait_for_selector('#gh-token'); pg.fill('#gh-token', TOKEN); pg.click('#gh-signin'); pg.wait_for_timeout(700)
        settle(pg); save(pg.screenshot(), 'screenshot-studio-start.png')
        pg.evaluate("() => { studioTab('metrics'); window.scrollTo({ top: 0, behavior: 'instant' }); }"); settle(pg)
        frames.append(save(pg.screenshot(), 'screenshot-studio.png'))
        ctx.close(); b.close()
    # the demo GIF: six frames, narrower
    small = [f.resize((900, int(900 * f.height / f.width)), Image.LANCZOS).quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames[:7]]
    small[0].save(OUT / 'demo.gif', save_all=True, append_images=small[1:], duration=1800, loop=0, optimize=True)
    for f in sorted(OUT.glob('*')):
        print(f'{f.name:34s} {f.stat().st_size / 1024:7.0f} KB')


main()
