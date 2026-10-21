#!/usr/bin/env python3
"""Writes the readable end-to-end report from the JSON that tests/e2e/run.py and tests/e2e/studio_scenarios.py produce.

    python tools/e2e_report.py RESULTS.json [STUDIO.json] --out REPORT.md [--only invented|real]
For each test: inputs, expected result, actual result, pass or fail, screenshot path."""
import argparse, json, pathlib


def f(v, nd=1):
    if v is None: return 'n/a'
    return ('%.*f' % (nd, v)) if isinstance(v, (int, float)) else str(v)


def money(v):
    return 'n/a' if v is None else ('%.2fM' % (v / 1e6) if abs(v) >= 1e6 else '%.0f' % v)


def company_block(r):
    a = r.get('actual') or {}
    D = a.get('D') or {}
    inp = r.get('inputs', {})
    vals = ', '.join(f'{k}={v}' for k, v in list(inp.get('vals', {}).items())[:14])
    ex = r.get('expected', {})
    exp = ex.get('why', '')
    rng = ex.get('score')
    if rng: exp += f' Expected score {rng[0]}-{rng[1]}.'
    if ex.get('withheld') is True: exp += ' Expected: score withheld.'
    act = (f"score {a.get('score')} (range {a.get('band')}), confidence {a.get('confidence')}, coverage {f(a.get('coverage'), 2)}; "
           f"growth {f(D.get('growth_yoy'))}%, NRR {f(D.get('nrr'))}%, GRR {f(D.get('grr'))}%, burn multiple {f(D.get('burn_multiple'))}, runway {f(D.get('runway'))} mo, GM {f(D.get('gross_margin'))}%.") if a else 'no report'
    chk = ', '.join(f'{c[0]} ({c[1]})' for c in a.get('checks', [])[:6]) or 'none'
    pat = '; '.join(f'{p[0]}: {p[1]}' for p in a.get('patterns', [])[:5]) or 'none'
    gates = '; '.join(a.get('gates', [])) or 'none'
    led = a.get('ledger')
    ledtxt = f" Ledger read: {led['customers']} customers, {led['months']} months, {led['first']} to {led['last']}, ARR {money(r['log'].get('ledger_arr'))}." if led else ''
    L = [f"### {r['id']}: {r['title']}", '',
         f"- **Label:** {r.get('label', '')}",
         f"- **Setup:** stage {r['stage']}, model {r['model']}, {r['view']}; typed: {vals}{' ...' if len(inp.get('vals', {})) > 14 else ''}"
         + (f"; ledger {inp['ledger_rows']} rows" if inp.get('ledger_rows') else '') + (f"; financials {inp['series_rows']} rows" if inp.get('series_rows') else ''),
         f"- **Expected:** {exp}",
         f"- **Actual:** {act}{ledtxt}",
         f"- **Deal-breakers / checks / patterns:** gates: {gates}; checks: {chk}; patterns: {pat}",
         f"- **Result:** {'PASS' if r['passed'] else 'FAIL'}" + ('' if r['passed'] else ' (' + ' | '.join(r['fails']) + ')'),
         f"- **Screenshot:** `{r.get('screenshot')}`"]
    if r.get('notes'): L.append('- **Notes:** ' + ' | '.join(r['notes']))
    return '\n'.join(L) + '\n'


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('files', nargs='+'); ap.add_argument('--out', required=True); ap.add_argument('--only', choices=['invented', 'real'])
    ap.add_argument('--title', default='End-to-end company tests')
    a = ap.parse_args()
    comp, studio = [], []
    for fn in a.files:
        data = json.loads(pathlib.Path(fn).read_text(encoding='utf-8'))
        for r in data:
            (comp if 'stage' in r else studio).append(r)
    if a.only == 'invented': comp = [r for r in comp if r['id'].startswith('t')]
    if a.only == 'real': comp = [r for r in comp if r['id'].startswith('r')]
    n = len(comp) + len(studio); ok = sum(1 for r in comp + studio if r['passed'])
    out = [f'# {a.title}', '', f'{ok} of {n} tests pass. Every test is driven through the real interface in a headless browser (typing, clicking, file choosers); '
           'the report is then read for plausibility, not only for crashes.', '']
    out.append('| # | Test | Score | Result |'); out.append('|---|---|---|---|')
    for r in comp:
        out.append(f"| {r['id'].split('-')[0]} | {r['title']} | {(r.get('actual') or {}).get('score')} | {'pass' if r['passed'] else 'FAIL'} |")
    for r in studio:
        out.append(f"| {r['id']} | {r['title']} | | {'pass' if r['passed'] else 'FAIL'} |")
    out.append('')
    if comp:
        out.append('## Companies'); out.append('')
        out += [company_block(r) for r in comp]
    if studio:
        out.append('## Studio scenarios'); out.append('')
        for r in studio:
            out.append(f"### {r['id']}: {r['title']}\n\n- **Input:** {r['inputs']}\n- **Expected:** {r['expected']}\n- **Actual:** {r['actual']}\n- **Result:** {'PASS' if r['passed'] else 'FAIL'}\n"
                       + (f"- **Screenshot:** `{r['screenshot']}`\n" if r.get('screenshot') else ''))
    pathlib.Path(a.out).write_text('\n'.join(out), encoding='utf-8')
    print('written', a.out, f'({ok}/{n})')


if __name__ == '__main__':
    main()
