#!/usr/bin/env python3
"""Automated accessibility scan (axe-core, WCAG 2.2 A/AA rules) of every screen of the tour, light and night, desktop and phone.

    python tools/axe_scan.py --axe PATH/TO/axe.min.js [--out result.json]

axe-core is a dev-only tool and is NOT part of the project: install it somewhere outside the repository (npm install axe-core) and give the path.
Opens the built index.html from disk with the Studio on a mocked GitHub API and the fake token. Nothing is sent anywhere.
Exit code 1 if any serious or critical violation is found."""
import os, argparse, json, pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'index.html').as_uri()
TOUR = json.loads((ROOT / 'tools' / 'tour.json').read_text(encoding='utf-8'))
TOKEN = 'github_pat_' + 'A' * 60
TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']


def gh(route):
    u = route.request.url
    if u.endswith('/user'): return route.fulfill(status=200, json={'login': 'dsaxel05'})
    if u.endswith('/repos/dsaxel05/VCR2'): return route.fulfill(status=200, json={'full_name': 'dsaxel05/VCR2', 'permissions': {'push': True, 'pull': True}})
    return route.fulfill(status=404, json={'message': 'Not Found'})


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--axe', required=True); ap.add_argument('--out')
    a = ap.parse_args()
    axe = pathlib.Path(a.axe).read_text(encoding='utf-8')
    found = {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        for scheme in ('light', 'dark'):
            for vname, vp in (('desktop', {'width': 1360, 'height': 860}), ('phone', {'width': 390, 'height': 844})):
                ctx = b.new_context(viewport=vp, reduced_motion='reduce', bypass_csp=True); pg = ctx.new_page()   # axe is injected as a script block, which the page's policy refuses; pg.route('https://api.github.com/**', gh)
                pg.goto(URL); pg.wait_for_timeout(400)
                pg.evaluate("t => { localStorage.setItem('vcr2-theme', t); applyLook(); }", scheme)
                if os.environ.get('SCAN_SIDEBAR'): pg.evaluate("s => { localStorage.setItem('vcr2-sidebar', s); applyLook(); }", os.environ['SCAN_SIDEBAR'])
                pg.add_script_tag(content=axe)
                states = [s for s in TOUR if not (s.get('studio') or s['name'].startswith('studio'))]
                for st in states:
                    if st.get('js'): pg.evaluate("() => { " + st['js'] + " }")
                    pg.wait_for_timeout(150)
                    run(pg, f"{st['name']} / {scheme} / {vname}", found)
                pg.goto(URL + '#studio'); pg.wait_for_selector('#gh-token'); pg.fill('#gh-token', TOKEN); pg.click('#gh-signin'); pg.wait_for_timeout(600)
                pg.evaluate("t => { localStorage.setItem('vcr2-theme', t); applyLook(); }", scheme)
                pg.add_script_tag(content=axe)
                for tab in ['home', 'metrics', 'standards', 'look', 'scoring', 'fields', 'questions', 'texts', 'differs', 'advanced']:
                    pg.evaluate("t => studioTab(t)", tab); pg.wait_for_timeout(150)
                    run(pg, f"studio-{tab} / {scheme} / {vname}", found)
                ctx.close()
        b.close()
    serious = {k: v for k, v in found.items() if v['impact'] in ('serious', 'critical')}
    print(f'{len(found)} distinct rule violations, {len(serious)} serious or critical')
    for k, v in sorted(found.items(), key=lambda kv: (kv[1]['impact'] not in ('critical', 'serious'), kv[0])):
        print(f"  [{v['impact']}] {v['id']}: {v['help']} — {v['count']} node(s) on {len(v['screens'])} screen(s); e.g. {v['screens'][0]}; {v['sample'][:120]}")
    if a.out: pathlib.Path(a.out).write_text(json.dumps(found, indent=1), encoding='utf-8')
    sys.exit(1 if serious else 0)


def run(pg, name, found):
    r = pg.evaluate("tags => axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }).then(x => x.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ') + ' | ' + (n.failureSummary || '').split(String.fromCharCode(10)).slice(0, 2).join(' ')), n: v.nodes.length })))", TAGS)
    for v in r:
        f = found.setdefault(v['id'], dict(id=v['id'], impact=v['impact'], help=v['help'], count=0, screens=[], sample=''))
        f['count'] += v['n']
        if name not in f['screens']: f['screens'].append(name)
        if not f['sample']: f['sample'] = '; '.join(v['nodes'][:1])


main()
