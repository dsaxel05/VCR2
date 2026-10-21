#!/usr/bin/env python3
"""Layout scan: opens every screen of the tour at phone, tablet and desktop widths, at Normal and Extra large text, and reports
horizontal scrolling and anything that sticks out of the viewport or is smaller than 13 px. Read-only; nothing is sent anywhere.

    python tools/overflow_scan.py            # exit code 1 if anything is found
Needs Playwright. The Studio screens use the fake token against a mocked GitHub API."""
import json, pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'index.html').as_uri()
TOUR = json.loads((ROOT / 'tools' / 'tour.json').read_text(encoding='utf-8'))
TOKEN = 'github_pat_' + 'A' * 60
import os
WIDTHS = [int(x) for x in os.environ.get('SCAN_WIDTHS', '390,768,1360').split(',')]
SIZES = os.environ.get('SCAN_SIZES', 'normal,xlarge').split(',')
ONLY = [x for x in os.environ.get('SCAN_ONLY', '').split(',') if x]


def gh(route):
    u = route.request.url
    if u.endswith('/user'): return route.fulfill(status=200, json={'login': 'dsaxel05'})
    if u.endswith('/repos/dsaxel05/VCR2'): return route.fulfill(status=200, json={'full_name': 'dsaxel05/VCR2', 'permissions': {'push': True, 'pull': True}})
    return route.fulfill(status=404, json={'message': 'Not Found'})


SCAN = """(w) => {
  const bad = [];
  const inScroller = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
  for (const e of document.querySelectorAll('body *')) {
    if (!e.checkVisibility || !e.checkVisibility()) continue;
    if (e.closest('#print-root, .p-foot, script, style, .toast, .modal-wrap')) continue;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (r.right > w + 2 && !inScroller(e)) bad.push(['sticks out', e.tagName + '.' + (typeof e.className === 'string' ? e.className : ''), Math.round(r.right)]);
    const own = Array.from(e.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
    if (own && parseFloat(getComputedStyle(e).fontSize) < 12.99) bad.push(['under 13 px', e.tagName + '.' + (typeof e.className === 'string' ? e.className : ''), parseFloat(getComputedStyle(e).fontSize)]);
  }
  return { sw: document.documentElement.scrollWidth, bad: bad.slice(0, 6) };
}"""


def main():
    problems = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for size in SIZES:
            for w in WIDTHS:
                ctx = b.new_context(viewport={'width': w, 'height': 900}); pg = ctx.new_page()
                pg.route('https://api.github.com/**', gh)
                pg.goto(URL); pg.wait_for_timeout(400)
                pg.evaluate("s => { localStorage.setItem('vcr2-text', s); localStorage.setItem('vcr2-theme', 'light'); applyLook(); }", size)
                if os.environ.get('SCAN_SIDEBAR'): pg.evaluate("s => { localStorage.setItem('vcr2-sidebar', s); applyLook(); }", os.environ['SCAN_SIDEBAR'])
                for st in TOUR:
                    name = st['name']
                    if ONLY and name not in ONLY: continue
                    if st.get('studio') or str(st.get('hash', '')).startswith('#studio') or name.startswith('studio'):
                        continue
                    try:
                        if st.get('js'): pg.evaluate("() => { " + st['js'] + " }")
                        pg.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"); pg.wait_for_timeout(120)
                        r = pg.evaluate(SCAN, w)
                    except Exception as e:
                        problems.append((size, w, name, 'could not open', str(e)[:80])); continue
                    if r['sw'] > w + 2: problems.append((size, w, name, 'scrolls sideways', r['sw']))
                    for x in r['bad']: problems.append((size, w, name) + tuple(x))
                # the Studio, signed in
                pg.goto(URL + '#studio'); pg.wait_for_selector('#gh-token'); pg.fill('#gh-token', TOKEN); pg.click('#gh-signin'); pg.wait_for_timeout(600)
                for tab in ['home', 'metrics', 'standards', 'look', 'scoring', 'fields', 'questions', 'texts']:
                    pg.evaluate("t => studioTab(t)", tab); pg.wait_for_timeout(150)
                    r = pg.evaluate(SCAN, w)
                    if r['sw'] > w + 2: problems.append((size, w, 'studio-' + tab, 'scrolls sideways', r['sw']))
                    for x in r['bad']: problems.append((size, w, 'studio-' + tab) + tuple(x))
                ctx.close()
        b.close()
    seen = set()
    for pr in problems:
        key = pr[3:]
        print(' | '.join(str(x) for x in pr))
    print(f'{len(problems)} findings')
    sys.exit(1 if problems else 0)


main()
