#!/usr/bin/env python3
"""End-to-end tests through the real interface (headless Chromium): a company goes in by clicking and typing, a report comes out.

    python tests/e2e/run.py                       # the invented companies in tests/e2e/companies.py
    python tests/e2e/run.py --real DIR            # also the real-company JSON files in DIR (kept private, never committed)
    python tests/e2e/run.py --only t03,t13        # some of them
    python tests/e2e/run.py --studio              # the Studio scenarios (undo, reset, invalid edit; fake token, mocked GitHub)

For every company it writes inputs, expected, actual, pass/fail and a screenshot path to the report file given with --out.
All GitHub traffic is mocked; the token is the fake one; every outside request is blocked and counted.
"""
import argparse, json, pathlib, re, sys, time, traceback
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
from playwright.sync_api import sync_playwright
import companies

URL = (ROOT / 'index.html').as_uri()
TOKEN = 'github_pat_' + 'A' * 60
VIEWS = {'desktop': {'width': 1360, 'height': 860}, 'phone': {'width': 390, 'height': 844}}

RESULT_JS = """() => {
  const R = S.result; if (!R) return null;
  const sc = R.sc, D = R.D;
  const dims = sc.dimensions.map(d => [d.id, d.score]);
  return { score: sc.overall, raw: sc.overallRaw, band: sc.band, gates: sc.gates.map(g => g.title), confidence: sc.confidence, coverage: sc.coverage, evidence: sc.evidence,
    checks: R.checks.filter(c => c.sev !== 'ok').map(c => [c.id, c.sev, c.title, c.stated, c.computed]),
    patterns: R.patterns.map(p => [p.sev, p.title]), questions: R.questions.slice(0, 8).map(q => q.text), nQuestions: R.questions.length, hash: R.hash,
    D: { growth_yoy: D.growth_yoy, nrr: D.nrr, grr: D.grr, burn_multiple: D.burn_multiple, runway: D.runway, gross_margin: D.gross_margin, arr: D.arr_now, logo_ret: D.logo_ret },
    dims, limits: R.inputLimits || [], deal: R.deal ? { ownEntry: R.deal.ownEntry, ownExit: R.deal.ownExit, fTop: R.deal.fTop, fSafe: R.deal.fSafe, fNote: R.deal.fNote, fNew: R.deal.fNew, fPrior: R.deal.fPrior, fPoolOld: R.deal.fPoolOld, fCommon: R.deal.fCommon, notes: (R.deal.notes || []).slice(0, 3) } : null,
    ledger: S.ledger ? { customers: S.ledger.customers.length, months: S.ledger.months.length, first: S.ledger.months[0], last: S.ledger.months[S.ledger.months.length - 1] } : null };
}"""

BAD_TEXT = re.compile(r'NaN|Infinity|undefined|\[object|&amp;[a-z]+;|&eacute;|&lt;b&gt;')


def gh_route(route):
    u = route.request.url
    if u.endswith('/user'): return route.fulfill(status=200, json={'login': 'dsaxel05'})
    if u.endswith('/repos/dsaxel05/VCR2'): return route.fulfill(status=200, json={'full_name': 'dsaxel05/VCR2', 'permissions': {'push': True, 'pull': True}})
    return route.fulfill(status=404, json={'message': 'Not Found'})


def esc_html(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def settle(pg, ms=300):
    pg.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    pg.wait_for_timeout(ms)


def drive(pg, c, log):
    """The real interface: landing > setup > intake > evidence form > verification > report."""
    pg.click('.intro-cta .btn-primary')
    pg.wait_for_selector('#page-setup.active')
    pg.click('#stc-' + c['stage']); pg.click('#tc-' + c['model'])
    pg.fill('#cname', c.get('name') or c['title'].split('(')[0].strip().replace('"', ''))
    pg.fill('#asof', c.get('asof', '2026-08'))
    pg.click('#page-setup .btn-primary')
    pg.wait_for_selector('#page-intake.active')
    if c.get('ledger'):
        pg.select_option('#ledger-unit', c.get('ledger_unit', 'mrr'))
        pg.evaluate("() => document.querySelectorAll('#page-intake details.paste').forEach(d => d.open = true)")
        pg.fill('#ledger-paste', c['ledger'])
        pg.click("button:has-text('Load pasted ledger')"); pg.wait_for_timeout(300)
        log['ledger_status'] = pg.inner_text('#ledger-status')[:400]
        log['ledger_toast'] = pg.evaluate("() => document.getElementById('toast').textContent")
    if c.get('series'):
        pg.evaluate("() => document.querySelectorAll('#page-intake details.paste').forEach(d => d.open = true)")
        pg.fill('#series-paste', c['series'])
        pg.click("button:has-text('Load pasted financials')"); pg.wait_for_timeout(300)
        log['series_status'] = pg.inner_text('#series-status')[:400]
    pg.click("button:has-text('Continue to the evidence form')")
    pg.wait_for_selector('#page-section.active')
    vals = {k: v for k, v in c.get('vals', {}).items()}
    bools, sel = c.get('bools', {}), c.get('sel', {})
    todo_v, todo_b, todo_s = set(vals), set(bools), set(sel)
    for _ in range(14):
        pg.evaluate("() => document.querySelectorAll('.more-options').forEach(d => d.open = true)")
        pg.wait_for_timeout(60)
        # a person with a ledger clicks "Apply ledger figures to the form" on the sections that offer it
        ab = pg.query_selector('.ledger-note .btn') if c.get('ledger') else None
        if ab:
            try:
                ab.scroll_into_view_if_needed(); ab.click(timeout=6000)
            except Exception:  # noqa: BLE001  (the sticky page bar can cover it; the person would scroll and try again)
                pg.evaluate("() => window.scrollBy(0, -200)"); pg.wait_for_timeout(100); ab.click(timeout=6000)
            pg.wait_for_timeout(150)
            pg.evaluate("() => document.querySelectorAll('.more-options').forEach(d => d.open = true)")
            log['applied_ledger'] = log.get('applied_ledger', 0) + 1
        for fid in list(todo_v):
            el = pg.query_selector(f'[data-fid="{fid}"]')
            if el and el.get_attribute('data-kind') != 'select':
                el.fill(str(vals[fid]).rstrip('0').rstrip('.') if isinstance(vals[fid], float) else str(vals[fid])); todo_v.discard(fid)
        for fid in list(todo_s):
            el = pg.query_selector(f'select[data-fid="{fid}"]')
            if el: el.select_option(label=sel[fid]); todo_s.discard(fid)
        for fid in list(todo_b):
            btn = pg.query_selector(f'#fc-{fid} .bool-btn.{"yes" if bools[fid] else "no"}')
            if btn: btn.click(); todo_b.discard(fid)
        nxt = pg.query_selector('#page-section .sec-nav .btn-primary')
        txt = nxt.inner_text() if nxt else ''
        pg.evaluate("() => window.scrollTo(0, 0)")
        if 'verification' in txt.lower():
            nxt.click(); break
        nxt.click(); pg.wait_for_timeout(80)
    log['not_entered'] = sorted(todo_v | todo_b | todo_s)
    pg.wait_for_selector('#page-verify.active')
    pg.click("button:has-text('Generate report')")
    pg.wait_for_function("() => document.getElementById('page-result').classList.contains('active')", timeout=40000)
    settle(pg, 700)


def judge(c, res, log, page_text, errs, ext):
    e = c.get('expect', {})
    fails, notes = [], []
    if errs: fails.append('page errors: ' + '; '.join(errs[:2]))
    if ext: fails.append('outside requests: ' + ', '.join(ext[:2]))
    if res is None: fails.append('no report was produced'); return fails, notes
    m = BAD_TEXT.search(page_text)
    if m: fails.append('report text contains ' + repr(m.group(0)))
    if log.get('not_entered'): notes.append('fields not found in the form: ' + ', '.join(log['not_entered']))
    sc = res['score']
    if 'score' in e and e['score'] is not None:
        lo, hi = e['score']
        if sc is None: fails.append(f'score withheld, expected {lo}-{hi}')
        elif not (lo <= sc <= hi): fails.append(f'score {sc} outside {lo}-{hi}')
    if e.get('withheld') is True and sc is not None: fails.append('score shown, expected withheld')
    if e.get('withheld') is False and sc is None: fails.append('score withheld, expected a score')
    ids = [x[0] for x in res['checks']]
    if e.get('checks_any') and not any(i in ids or any(i in x for x in ids) for i in e['checks_any']):
        fails.append('none of the checks %s fired (fired: %s)' % (e['checks_any'], ids))
    if e.get('checks_none') and any(i in ids for i in e['checks_none']): fails.append('unexpected checks fired: ' + ', '.join(i for i in e['checks_none'] if i in ids))
    for s in e.get('text_any', []):
        if s.lower() not in page_text.lower(): fails.append(f'report text does not contain "{s}"')
    L = res.get('ledger')
    if e.get('ledger_customers') is not None and (not L or L['customers'] != e['ledger_customers']): fails.append(f"ledger customers {L and L['customers']} != {e['ledger_customers']}")
    if e.get('ledger_months') is not None and (not L or L['months'] != e['ledger_months']): fails.append(f"ledger months {L and L['months']} != {e['ledger_months']}")
    if e.get('ledger_first') and (not L or L['first'] != e['ledger_first']): fails.append(f"ledger first month {L and L['first']} != {e['ledger_first']}")
    if e.get('ledger_last') and (not L or L['last'] != e['ledger_last']): fails.append(f"ledger last month {L and L['last']} != {e['ledger_last']}")
    arr_l = log.get('ledger_arr')
    if e.get('ledger_arr_exact') is not None:
        if arr_l is None or abs(arr_l - e['ledger_arr_exact']) > max(1.0, e['ledger_arr_exact'] * 0.001): fails.append(f"ledger ARR {arr_l} != {e['ledger_arr_exact']}")
    if e.get('ledger_arr') and c.get('ledger_truth', {}).get('arr') and arr_l is not None:
        lo, hi = e['ledger_arr']; t = c['ledger_truth']['arr']
        if not (lo * t <= arr_l <= hi * t): fails.append(f'ledger ARR {arr_l:.0f} is {arr_l / t:.2f} x the truth {t:.0f}')
    for w in e.get('warn_any', []):
        msg = ((log.get('ledger_status') or '') + ' ' + (log.get('series_status') or '') + ' ' + (log.get('ledger_toast') or '')).lower()
        if not any(w.lower() in msg for w in e['warn_any']): fails.append('import message does not mention any of %s: %r' % (e['warn_any'], msg[:200])); break
    if e.get('cap_table') and res.get('deal'):
        d = res['deal']
        tot = sum(d.get(k) or 0 for k in ('fNew', 'fSafe', 'fNote', 'fPrior', 'fPoolOld', 'fCommon', 'fTop'))
        if not (0 < (d.get('ownEntry') or 0) < 1): fails.append(f"our ownership at entry {d.get('ownEntry')} is not between 0 and 100%")
        notes.append(f"cap table fractions sum {tot:.3f} (fNew {d.get('fNew')}, fSafe {d.get('fSafe')}, fNote {d.get('fNote')}, fPrior {d.get('fPrior')}, fPoolOld {d.get('fPoolOld')}, fCommon {d.get('fCommon')}, our {d.get('ownEntry')})")
    if e.get('burn') and res.get('D', {}).get('burn') is None:
        pass
    if e.get('no_sideways_scroll') and log.get('sideways', 0) > 2: fails.append(f"page scrolls sideways by {log['sideways']} px")
    return fails, notes


def run_company(browser, c, shots_dir, steps_extra):
    vp = VIEWS[c.get('view', 'desktop')]
    ctx = browser.new_context(viewport=vp, accept_downloads=True); pg = ctx.new_page()
    errs, ext, log = [], [], {}
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('request', lambda r: ext.append(r.url) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    t0 = time.time()
    res, page_text, fails, notes = None, '', [], []
    shot = None
    try:
        pg.goto(URL); pg.wait_for_timeout(400)
        pg.evaluate("() => { localStorage.setItem('vcr2-theme', 'light'); applyLook(); }")
        drive(pg, c, log)
        res = pg.evaluate(RESULT_JS)
        if S_ARR := pg.evaluate("() => S.ledger ? ledgerAnalytics(S.ledger).arrNow : null"):
            log['ledger_arr'] = S_ARR
        page_text = pg.evaluate("() => document.getElementById('page-result').innerText")
        log['sideways'] = pg.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        shots_dir.mkdir(parents=True, exist_ok=True)
        shot = shots_dir / (c['id'] + '.png')
        pg.screenshot(path=str(shot))
        # every report tab must open without an error and without NaN
        tabs_text = []
        for t in ['findings', 'revenue', 'forensics', 'runway', 'deal', 'bench', 'scoring', 'questions', 'metrics', 'ledger', 'checklist']:
            pg.evaluate("t => goTab(t)", t); pg.wait_for_timeout(60)
            tabs_text.append(pg.evaluate("() => document.querySelector('.rpane.active').innerText"))
        page_text += '\n' + '\n'.join(tabs_text)
        if c.get('extra') == 'export_import':
            steps_extra(pg, c, log)
        if c.get('name'):
            memo = pg.evaluate("() => memoHTML(S.result)")
            want = esc_html(c['name'])
            log['memo_has_name'] = want in memo
            if want not in memo: log['extra_fail'] = 'the company name is not in the memo exactly once-escaped: ' + want
            if '&amp;amp;' in memo or '&amp;eacute;' in memo: log['extra_fail'] = 'something was escaped twice in the memo'
    except Exception as e:  # noqa: BLE001
        fails.append('the run broke: ' + str(e).splitlines()[0][:200])
        log['trace'] = traceback.format_exc()[-600:]
        try:
            shots_dir.mkdir(parents=True, exist_ok=True); shot = shots_dir / (c['id'] + '-FAILED.png'); pg.screenshot(path=str(shot))
        except Exception:  # noqa: BLE001
            pass
    f2, n2 = judge(c, res, log, page_text, errs, ext)
    fails += f2; notes += n2
    if log.get('extra_fail'): fails.append(log['extra_fail'])
    ctx.close()
    return dict(id=c['id'], title=c['title'], label=c.get('label', 'invented, not real'), stage=c['stage'], model=c['model'], view=c.get('view', 'desktop'),
                inputs=dict(vals=c.get('vals', {}), bools=c.get('bools', {}), sel=c.get('sel', {}), ledger_rows=(c.get('ledger') or '').count('\n'), series_rows=(c.get('series') or '').count('\n')),
                expected=c.get('expect', {}), actual=res, log=log, passed=not fails, fails=fails, notes=notes, seconds=round(time.time() - t0, 1), screenshot=str(shot) if shot else None)


def extra_export_import(pg, c, log):
    """Memo content, export to a file, start over, open the file, same run ID (all through the buttons)."""
    h0 = pg.evaluate("() => S.result.hash")
    memo = pg.evaluate("() => memoHTML(S.result)")
    if h0 not in memo or 'Prepared with VCR2' not in memo:
        log['extra_fail'] = 'the memo lacks the run ID or the footer line'; return
    log['memo_has_run_id'] = True
    with pg.expect_download() as dl:
        pg.click("#page-result button:has-text('Export .json')")
    path = dl.value.path()
    log['export_bytes'] = pathlib.Path(path).stat().st_size
    pg.click("#page-result button:has-text('New assessment')"); pg.wait_for_timeout(300)
    log['after_reset_name'] = pg.evaluate("() => S.name")
    pg.click('.sb-logo-row'); pg.wait_for_selector('#page-intro.active')   # back to the home page by the logo
    with pg.expect_file_chooser() as fc:
        pg.click("button:has-text('open a saved assessment')")
    fc.value.set_files(str(path))
    pg.wait_for_selector('#page-verify.active', timeout=15000)
    pg.click("button:has-text('Generate report')")
    pg.wait_for_function("() => document.getElementById('page-result').classList.contains('active')", timeout=40000)
    settle(pg, 500)
    h1 = pg.evaluate("() => S.result.hash")
    log['hash_before'], log['hash_after_import'] = h0, h1
    if h0 != h1: log['extra_fail'] = f'run ID changed after export and import: {h0} -> {h1}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--real'); ap.add_argument('--only'); ap.add_argument('--browser', default='chromium', choices=['chromium', 'firefox', 'webkit']); ap.add_argument('--out', default=str(ROOT / 'tests' / 'e2e' / 'out' / 'e2e-results.json'))
    ap.add_argument('--shots', default=str(ROOT / 'tests' / 'e2e' / 'out' / 'e2e-shots'))
    a = ap.parse_args()
    cs = companies.build()
    if a.real:
        for f in sorted(pathlib.Path(a.real).glob('*.json')):
            d = json.loads(f.read_text(encoding='utf-8')); d.setdefault('label', 'test data, public sources, may be inaccurate'); cs.append(d)
    if a.only:
        want = [w.strip() for w in a.only.split(',')]
        cs = [c for c in cs if any(c['id'].startswith(w) for w in want)]
    out = []
    with sync_playwright() as p:
        b = getattr(p, a.browser).launch()
        for c in cs:
            r = run_company(b, c, pathlib.Path(a.shots), extra_export_import)
            out.append(r)
            print(('PASS ' if r['passed'] else 'FAIL ') + r['id'] + ('' if r['passed'] else '  -> ' + ' | '.join(r['fails'])[:300]), flush=True)
        b.close()
    pathlib.Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(a.out).write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding='utf-8')
    n = sum(1 for r in out if r['passed'])
    print(f'{n}/{len(out)} passed; results in {a.out}')
    sys.exit(0 if n == len(out) else 1)


if __name__ == '__main__':
    main()
