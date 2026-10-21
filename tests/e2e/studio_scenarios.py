#!/usr/bin/env python3
"""Studio scenarios through the real interface (fake token, mocked GitHub): undo and redo, reset, discard, a custom metric,
and invalid edits that must not break the site.   python tests/e2e/studio_scenarios.py [--out FILE]"""
import argparse, json, pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
URL = (ROOT / 'index.html').as_uri()
TOKEN = 'github_pat_' + 'A' * 60
rows = []


def gh(route):
    u = route.request.url
    if u.endswith('/user'): return route.fulfill(status=200, json={'login': 'dsaxel05'})
    if u.endswith('/repos/dsaxel05/VCR2'): return route.fulfill(status=200, json={'full_name': 'dsaxel05/VCR2', 'permissions': {'push': True, 'pull': True}})
    return route.fulfill(status=404, json={'message': 'Not Found'})


def rec(sid, title, inputs, expected, actual, ok, shot=None):
    rows.append(dict(id=sid, title=title, inputs=inputs, expected=expected, actual=actual, passed=bool(ok), screenshot=shot))
    print(('PASS ' if ok else 'FAIL ') + sid + ' ' + title + ('' if ok else '  -> ' + str(actual)[:200]), flush=True)


def tab(pg, label):
    pg.click(f'.studio-nav .rtab:has-text("{label}")'); pg.wait_for_timeout(150)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', default=str(ROOT / 'tests' / 'e2e' / 'out' / 'e2e-studio.json'))
    ap.add_argument('--shots', default=str(ROOT / 'tests' / 'e2e' / 'out' / 'e2e-shots'))
    a = ap.parse_args()
    shots = pathlib.Path(a.shots); shots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1360, 'height': 860}, reduced_motion='reduce'); pg = ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: d.accept())
        ext = []; pg.on('request', lambda r: ext.append(r.url) if not r.url.startswith(('file:', 'data:', 'blob:', 'https://api.github.com')) else None)
        pg.route('https://api.github.com/**', gh)
        pg.goto(URL + '#studio'); pg.wait_for_selector('#gh-token'); pg.fill('#gh-token', TOKEN); pg.click('#gh-signin'); pg.wait_for_timeout(700)
        look = lambda: pg.evaluate("() => JSON.stringify(ST.draft.look || {})")

        # S1: a look change, undo, redo
        tab(pg, 'Look & feel')
        pg.click('label.look-pill:has(input[name="st-corners"][value="round"])'); pg.wait_for_timeout(200)
        a1 = look()
        pg.click('#st-undo'); pg.wait_for_timeout(200); a2 = look()
        pg.click('#st-redo'); pg.wait_for_timeout(200); a3 = look()
        rec('s1', 'Look & feel: choose round corners, undo, redo', 'click Round; Undo; Redo', 'round, then nothing, then round again', [a1, a2, a3],
            '"round"' in a1 and a2 == '{}' and '"round"' in a3)

        # S2: a custom metric through the form, then it appears in the list
        tab(pg, 'Metrics')
        pg.click('button:has-text("Add a metric")'); pg.wait_for_selector('#ed-label')
        pg.fill('#ed-label', 'New ARR per sales head'); pg.fill('#ed-formula', 'new_arr_l12 / headcount_sales')
        pg.click('button:has-text("Save metric")'); pg.wait_for_timeout(300)
        n = pg.evaluate("() => (ST.draft.metrics || []).map(m => [m.key, m.formula])")
        rec('s2', 'Add a custom metric with a valid formula', 'label "New ARR per sales head", formula new_arr_l12 / headcount_sales', 'the metric is in the draft', n, len(n) == 1 and n[0][1] == 'new_arr_l12 / headcount_sales')

        # S3: invalid formulas are refused and change nothing
        before = pg.evaluate("() => JSON.stringify(ST.draft)")
        for name, formula in [('syntax error', 'arr_now /'), ('unknown field', 'no_such_field * 2'), ('empty parentheses', '( )')]:
            pg.click('button:has-text("Add a metric")'); pg.wait_for_selector('#ed-label')
            pg.fill('#ed-label', 'Broken ' + name); pg.fill('#ed-formula', formula)
            pg.click('button:has-text("Save metric")'); pg.wait_for_timeout(250)
            toast = pg.evaluate("() => document.getElementById('toast').textContent")
            still = pg.evaluate("() => (ST.draft.metrics || []).length")
            opened = pg.query_selector('#ed-label') is not None
            if opened: pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
            if pg.query_selector('#ed-label'): pg.evaluate("() => closeModal()")
            rec('s3-' + name.replace(' ', '-'), f'Invalid formula ({name}) is refused', f'formula {formula!r}', 'a message, nothing saved', [toast[:80], still], still == 1 and bool(toast))
        after = pg.evaluate("() => JSON.stringify(ST.draft)")
        rec('s3-draft', 'The draft is unchanged by the refused edits', '', 'same draft', 'same' if before == after else 'changed', before == after)

        # S4: undo the metric, then Reset everything
        pg.click('#st-undo'); pg.wait_for_timeout(200)
        pg.click('#st-undo'); pg.wait_for_timeout(200)
        left = pg.evaluate("() => [(ST.draft.metrics || []).length, JSON.stringify(ST.draft.look || {})]")
        rec('s4', 'Undo twice removes the metric and the corners', 'Undo, Undo', 'metrics 0, look {}', left, left == [0, '{}'])
        tab(pg, 'Look & feel'); pg.click('label.look-pill:has(input[name="st-theme"][value="dark"])'); pg.wait_for_timeout(150)
        tab(pg, 'What differs from built-in')
        txt_before = pg.inner_text('#studio-pane')
        btn = pg.query_selector('button:has-text("Reset everything")')
        if btn: btn.click(); pg.wait_for_timeout(300)
        rec('s5', 'Reset everything puts the draft back to built-in', 'dark theme chosen, then Reset everything',
            'look {} afterwards', [look(), 'Reset everything' in txt_before], look() == '{}' and btn is not None)

        # S6: the Advanced editor refuses broken JSON; hostile but valid JSON is cleaned and cannot break the report
        tab(pg, 'Advanced (JSON)')
        pg.fill('#adv-json', '{ "metrics": [ { "key": "x", ')
        pg.wait_for_timeout(700)
        st = pg.inner_text('#adv-status'); dis = pg.evaluate("() => document.getElementById('adv-apply').disabled")
        rec('s6', 'Advanced: broken JSON is refused', 'a half-written JSON object', 'a message and a disabled Apply button', [st[:90], dis], 'valid JSON' in st and dis)
        hostile = json.dumps({'settings': {'correlationCap': 'abc', 'blockAfter': -5, 'minN': {'retention': 'many'}}, 'look': {'brand': '#777777', 'corners': 'spiky', 'views': ['nope']},
                              'metrics': [{'key': 'm_bad', 'label': 'Bad', 'formula': 'arr_now /', 'dim': 'revenue', 'thresholds': {'a': [1, 2, 3, 4]}}], 'texts': [{'from': 'Overview', 'to': '<img src=x onerror=alert(1)>'}]})
        pg.fill('#adv-json', hostile); pg.wait_for_timeout(700)
        st2 = pg.inner_text('#adv-status'); dis2 = pg.evaluate("() => document.getElementById('adv-apply').disabled")
        rec('s7', 'Advanced: hostile JSON with a bad formula cannot be applied', 'nonsense numbers, an unreadable brand colour, a broken formula, an HTML text',
            'Apply is disabled or the formula is reported', [st2[:120], dis2], dis2 or 'formula' in st2.lower())
        pg.evaluate("() => document.getElementById('adv-json').value = JSON.stringify({ settings: { correlationCap: 'abc', blockAfter: -5 }, look: { brand: '#777777', corners: 'spiky' }, texts: [{ from: 'Overview', to: '<img src=x onerror=alert(1)>' }] })")
        pg.evaluate("() => advCheck()"); pg.wait_for_timeout(700)
        dis3 = pg.evaluate("() => document.getElementById('adv-apply').disabled")
        if not dis3: pg.click('#adv-apply'); pg.wait_for_timeout(300)
        clean = pg.evaluate("() => JSON.stringify({ s: ST.draft.settings, l: ST.draft.look, t: ST.draft.texts })")
        rec('s8', 'Advanced: nonsense values are cleaned when applied', 'correlationCap "abc", blockAfter -5, corners "spiky", brand #777777',
            'no nonsense value survives', clean[:200], '"abc"' not in clean and '-5' not in clean and 'spiky' not in clean)

        # S9: the live site still works: preview on, run an example, open every report tab
        pg.evaluate("() => { setPreview(true); }"); pg.wait_for_timeout(200)
        pg.evaluate("() => { leaveStudio(); loadDemo('northwind'); S.result = assessAll(); renderResult(S.result); showPage('result'); }"); pg.wait_for_timeout(500)
        tabs_ok = True; detail = []
        for t in ['findings', 'revenue', 'forensics', 'runway', 'deal', 'bench', 'scoring', 'questions', 'metrics', 'ledger', 'checklist']:
            pg.evaluate("t => goTab(t)", t); pg.wait_for_timeout(60)
            tx = pg.evaluate("() => document.querySelector('.rpane.active').innerText")
            if len(tx) < 40 or 'NaN' in tx or 'undefined' in tx: tabs_ok = False; detail.append(t)
        shot = shots / 's9-report-after-invalid-edits.png'; pg.screenshot(path=str(shot))
        rec('s9', 'After invalid edits the report and every tab still open', 'preview on, Northwind example', 'every tab has content, no NaN', detail or 'all tabs fine', tabs_ok, str(shot))
        rec('s10', 'No uncaught error and no outside request during all Studio scenarios', '', 'none', [errs[:2], ext[:2]], not errs and not ext)
        b.close()
    pathlib.Path(a.out).write_text(json.dumps(rows, indent=1, ensure_ascii=False), encoding='utf-8')
    n = sum(1 for r in rows if r['passed'])
    print(f'{n}/{len(rows)} passed; results in {a.out}')
    sys.exit(0 if n == len(rows) else 1)


if __name__ == '__main__':
    main()
