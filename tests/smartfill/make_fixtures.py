#!/usr/bin/env python3
"""Copy a small, fixed set of Smart fill files from a generated corpus into tests/fixtures/smartfill/ (committed),
so the reader unit tests run anywhere, including GitHub, without the generator or its libraries.

    python tests/smartfill/make_fixtures.py          (after: python tests/smartfill/generate.py --seed 7 --set dev)"""
import json, pathlib, shutil
here = pathlib.Path(__file__).resolve().parent
src = here / 'corpus' / 'dev'; dst = here.parent / 'fixtures' / 'smartfill'
gold = json.loads((src / 'gold.json').read_text(encoding='utf-8'))
if dst.exists(): shutil.rmtree(dst)
dst.mkdir(parents=True)
WANT = [('deck', 'pptx', 'python-pptx'), ('deck', 'pdf', 'chromium'), ('deck', 'pdf', 'reportlab'), ('deck', 'md', None), ('deck', 'txt', None), ('deck', 'html', None),
        ('model', 'xlsx', 'openpyxl'), ('model', 'xlsx', 'hand-built'), ('model', 'ods', None), ('model', 'csv', None), ('update', 'eml', None), ('update', 'docx', 'python-docx'),
        ('update', 'docx', 'hand-built'), ('update', 'odt', None), ('update', 'rtf', None), ('termsheet', 'pdf', 'chromium'), ('bank', 'pdf', 'reportlab'), ('captable', 'xlsm', None),
        ('crm', 'tsv', None), ('json', 'json', None), ('security', 'md', None), ('market', 'txt', None)]
out = []
for t, f, p in WANT:
    d = next((d for d in gold['docs'] if d['type'] == t and d['format'] == f and (p is None or d['producer'] == p)), None)
    if not d: print('missing', t, f, p); continue
    name = f'{t}-{p or f}.{f}'.replace('python-', '')
    shutil.copy(src / d['file'], dst / name); out.append({'file': name, 'type': t, 'format': f, 'producer': d['producer'], 'fields': d['fields']})
adv = []
for a in gold['adversarial']:
    if a['size'] > 60_000 and not a['file'].endswith(('.pdf', '.pptx')): continue
    if a['size'] > 400_000: continue
    n = a['file'].split('/', 1)[1]
    if len(n) > 60: n = 'déck résumé (long name in the corpus).md'   # git on Windows refuses very long paths
    shutil.copy(src / a['file'], dst / ('adv-' + n)); adv.append(dict(a, file='adv-' + n))
(dst / 'expect.json').write_text(json.dumps({'docs': out, 'adversarial': adv}, indent=1, ensure_ascii=False), encoding='utf-8')
print(f'{len(out)} documents and {len(adv)} adversarial files, {sum(x.stat().st_size for x in dst.iterdir()) // 1024} KB')
