#!/usr/bin/env python3
"""Smart fill test corpus: 24 fictional companies with 5 to 9 documents each, in real file formats, plus hostile files.

    python tests/smartfill/generate.py --seed 7 --set dev          (writes tests/smartfill/corpus/dev/, gitignored)

Writes real files through real libraries (openpyxl, python-docx, python-pptx, reportlab, Chromium print to PDF) and
hand-built bytes, and a gold file: corpus/<set>/gold.json with, for every document, the fields it should fill, the
expected tier and must_not_fill. Seeded: the same seed gives the same files (Chromium PDFs carry a creation date,
so their bytes can differ; their text does not). Every company and number is invented."""
import argparse, json, pathlib, random, sys, collections, shutil
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from gen import companies as CO, docs as D, writers as W, adversarial as A

FORMATS = {'deck': ['pptx', 'pdf', 'pdf_chrome', 'md', 'pptx_raw', 'txt', 'html', 'htm', 'md_b', 'html_b', 'pptx', 'txt_b'], 'model': ['xlsx', 'xlsx_raw', 'csv', 'pdf', 'ods', 'xlsx', 'pdf_chrome', 'ods_b'],
           'update': ['eml', 'md', 'txt', 'docx', 'eml_raw', 'odt', 'docx_raw', 'eml', 'rtf', 'pdf', 'odt_b', 'eml_raw', 'md_b', 'rtf'], 'captable': ['xlsx', 'csv', 'xlsm', 'ods', 'tsv'],
           'termsheet': ['docx', 'pdf', 'rtf', 'md', 'txt', 'odt', 'pdf_chrome', 'rtf'], 'bank': ['pdf', 'csv', 'pdf_chrome'], 'receivables': ['xlsm', 'csv', 'pdf'],
           'crm': ['csv', 'tsv', 'xlsx'], 'headcount': ['tsv', 'xlsm', 'ods'], 'security': ['pdf', 'docx', 'odt', 'md', 'html', 'eml', 'rtf', 'odt_b', 'html_b'], 'market': ['md', 'docx', 'pdf', 'odt', 'txt'],
           'json': ['json', 'json_b'], 'audited': ['pdf', 'xlsx_raw'], 'ledger': ['csv', 'xlsx', 'csv']}
FILENAMES = {'deck': ['pitch-deck', 'Investor_Presentation', 'deck-final-v7', 'company-overview'], 'model': ['financial-model', 'FinModel_LTM', 'p-and-l-arr-bridge'],
             'update': ['investor-update', 'Monthly_Update', 'cfo-reply'], 'captable': ['cap-table', 'Capitalization'], 'termsheet': ['term-sheet', 'Series_Term_Sheet'],
             'bank': ['bank-statement', 'Account_Statement'], 'receivables': ['ar-aging', 'Receivables_Report'], 'crm': ['pipeline-export', 'CRM_Opportunities'],
             'headcount': ['headcount-by-function', 'Team_Plan'], 'security': ['security-legal-summary', 'Compliance_Overview'], 'market': ['market-notes', 'Customer_Research'],
             'json': ['metrics-export'], 'audited': ['audited-financials'], 'ledger': ['customer-ledger', 'MRR_by_customer']}


def plan(i):
    t = ['deck', 'model']
    if i < 16: t.append('update')
    t.append('captable' if i % 2 == 0 else 'termsheet')
    if i % 4 == 0: t.append('bank')
    if i % 6 == 1: t.append('receivables')
    if i % 5 == 2: t.append('crm')
    if i % 5 == 3: t.append('headcount')
    if i % 3 == 0 or i == 1: t.append('security')
    if i % 4 == 3 or i == 2: t.append('market')
    if i % 4 == 1: t.append('ledger')
    if i % 6 == 4 or i % 5 == 4: t.append('json')
    if i in (3, 10, 20): t.append('audited')
    for extra in ('security', 'market', 'termsheet', 'captable'):
        if len(t) >= 5: break
        if extra not in t: t.append(extra)
    return t[:9]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--seed', type=int, default=7); ap.add_argument('--set', default='dev'); ap.add_argument('--no-chrome', action='store_true')
    a = ap.parse_args()
    out = pathlib.Path(__file__).resolve().parent / 'corpus' / a.set
    if out.exists(): shutil.rmtree(out)
    (out / 'adversarial').mkdir(parents=True)
    browser = pw = None
    if not a.no_chrome:
        try:
            from playwright.sync_api import sync_playwright
            pw = sync_playwright().start(); browser = pw.chromium.launch()
        except Exception as e: print('Chromium not available, its PDFs are replaced by reportlab ones:', e)
    used = collections.Counter(); gold = {'set': a.set, 'seed': a.seed, 'docs': [], 'adversarial': []}
    cos = CO.companies(a.seed)
    for c in cos:
        cdir = out / f'c{c["i"]:02d}-{c["name"].lower().replace(" ", "-")}'; cdir.mkdir()
        rnd = random.Random(a.seed * 1000 + c['i'])
        for t in plan(c['i']):
            doc, g, must = D.TEMPLATES[t](c, rnd)
            fmt = FORMATS[t][used[t] % len(FORMATS[t])]; used[t] += 1
            if fmt == 'pdf_chrome' and browser is None: fmt = 'pdf'
            if 'sheets' not in doc and fmt in ('xlsx', 'xlsx_raw', 'xlsm', 'ods', 'csv', 'tsv') and t != 'json': fmt = 'md'
            if 'json' in doc and not fmt.startswith('json'): fmt = 'json'
            fn = W.WRITERS[fmt]
            data = fn(doc, used[t], browser=browser) if fmt == 'pdf_chrome' else fn(doc, used[t])
            name = f'{rnd.choice(FILENAMES[t])}.{W.EXT.get(fmt, fmt)}'
            (cdir / name).write_bytes(data)
            gold['docs'].append({'file': f'{cdir.name}/{name}', 'company': c['i'], 'model': c['model'], 'stage': c['stage'], 'ccy': c['ccy'], 'lang': 'fr' if c['french'] and t in ('deck', 'update') else 'en',
                                 'type': t, 'role': doc['role'], 'format': W.EXT.get(fmt, fmt), 'producer': W.PRODUCER[fmt],
                                 'fields': {k: {'value': v, 'tier': tier, 'loc': loc} for k, (v, tier, loc) in g.items()}, 'must_not_fill': must})
    sample = random.Random(a.seed)
    c0 = cos[0]
    for name, data, meta in A.files([D.deck(c0, sample)[0], D.model_doc(c0, sample)[0], D.update(c0, sample)[0]]):
        (out / 'adversarial' / name).write_bytes(data); gold['adversarial'].append(dict(file='adversarial/' + name, size=len(data), **meta))
    if browser: browser.close(); pw.stop()
    (out / 'gold.json').write_text(json.dumps(gold, indent=1, ensure_ascii=False), encoding='utf-8')
    by_t, by_f = collections.Counter(d['type'] for d in gold['docs']), collections.Counter(d['format'] for d in gold['docs'])
    prod = collections.defaultdict(set)
    for d in gold['docs']: prod[d['format']].add(d['producer'])
    per_co = collections.Counter(d['company'] for d in gold['docs'])
    print(f'{a.set}: {len(gold["docs"])} documents for {len(cos)} companies ({min(per_co.values())} to {max(per_co.values())} each), {len(gold["adversarial"])} adversarial files, '
          f'{sum(len(d["fields"]) for d in gold["docs"])} gold fields, {sum(1 for d in gold["docs"] if d["lang"] == "fr")} French documents, {sum(1 for d in gold["docs"] if d["ccy"] != "USD")} non-USD')
    print('by type:', dict(by_t)); print('by format:', {f: f'{n} ({"+".join(sorted(prod[f]))})' for f, n in by_f.items()})


if __name__ == '__main__':
    main()
