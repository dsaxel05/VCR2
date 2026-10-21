"""Browser regressions for the red-team findings SV-01, SV-05, SV-12 and SV-02."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, io, json, zipfile
from playwright.async_api import async_playwright
BASE = _paths.BASE
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))

NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
def col(i):
    s = ''
    i += 1
    while i:
        i, r = divmod(i - 1, 26); s = chr(65 + r) + s
    return s
def workbook(shared, sheet):
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>')
        z.writestr('xl/workbook.xml', f'<?xml version="1.0"?><workbook {NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>')
        z.writestr('xl/sharedStrings.xml', f'<?xml version="1.0"?><sst {NS}>{shared}</sst>')
        z.writestr('xl/worksheets/sheet1.xml', f'<?xml version="1.0"?><worksheet {NS}><sheetData>{sheet}</sheetData></worksheet>')
    return list(b.getvalue())

PHONETIC = '<si>' + '<t/><rPh><t/></rPh>' * 16000 + '</si>'
SPARSE_ROWS = ''.join(f'<row r="{r}"><c r="{col(2000)}{r}"><v>1</v></c></row>' for r in range(1, 30001))
XL_JS = """async ([bytes, kind]) => {
  const t0 = performance.now();
  let out;
  try { const x = await sheetFileToCSV(new File([new Uint8Array(bytes)], 'x.xlsx'), kind); out = { ok:true, len:(x && x.csv || '').length }; }
  catch (e) { out = { ok:false, msg:String(e && e.message || e) }; }
  out.ms = performance.now() - t0; return out;
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_timeout(500)

        # SV-01: a small workbook cannot freeze the tab
        r = await pg.evaluate(XL_JS, [workbook(PHONETIC, '<row r="1"><c r="A1" t="s"><v>0</v></c></row>'), 'ledger'])
        check('SV-01: 16,000 phonetic runs open in under 3 s', r['ms'] < 3000, r)
        r = await pg.evaluate(XL_JS, [workbook('<si><t>x</t></si>', SPARSE_ROWS), 'ledger'])
        check('SV-01: a sparse sheet is refused or small, and quickly', r['ms'] < 5000 and ((not r['ok']) or r['len'] < 5_000_000), r)

        # SV-05: wording replacements never reach the Studio's own dialogs, but still reach a visitor's
        await pg.evaluate("""() => {
          applyConfig(Object.assign(EMPTY_CONFIG(), { texts:[{ from:'Review before publishing', to:'ALL GOOD' }] }));
          document.getElementById('page-studio').classList.add('active');
          openModal('Review before publishing', '<p>Review before publishing</p>', []);
        }""")
        await pg.wait_for_timeout(150)
        t = await pg.evaluate("() => document.querySelector('#modal-wrap .modal-b').textContent")
        check('SV-05: a Studio dialog keeps its own words', t.strip() == 'Review before publishing', t)
        await pg.evaluate("""() => { closeModal(); document.getElementById('page-studio').classList.remove('active'); openModal('Hello', '<p>Review before publishing</p>', []); }""")
        await pg.wait_for_timeout(150)
        t = await pg.evaluate("() => document.querySelector('#modal-wrap .modal-b').textContent")
        check('SV-05: a visitor dialog still takes the owner’s wording', t.strip() == 'ALL GOOD', t)
        await pg.evaluate("() => { closeModal(); applyConfig(EMPTY_CONFIG()); }")

        # SV-12: sending data to an AI provider is decided in each session
        await pg.evaluate("() => { document.getElementById('memo-toggle').checked = true; document.getElementById('memo-toggle').dispatchEvent(new Event('change')); }")
        await pg.reload(); await pg.wait_for_timeout(500)
        on = await pg.evaluate("() => document.getElementById('memo-toggle').checked")
        check('SV-12: the memo toggle starts unticked after a reload', on is False, on)
        lab = await pg.evaluate("() => document.getElementById('memo-toggle').parentElement.textContent")
        check('SV-12: the label names the company name too', 'company name' in lab, lab)

        # SV-02: a stray exponent shows a message, not a frozen page
        await pg.evaluate("""() => { S.name = 'X'; loadHalcyon(); S.vals.years_to_exit = '1e12'; S.vals.round_pre_money = '1e308'; runAnalysis(); }""")
        await pg.wait_for_function("() => document.getElementById('page-result').classList.contains('active')", timeout=15000)
        txt = await pg.evaluate("() => document.getElementById('page-result').textContent")
        check('SV-02: the report opens and says which inputs were limited', 'largest value the radar accepts' in txt, txt[:200])
        check('SV-02: no uncaught errors', not errs, errs)
        await b.close()
    ok = sum(1 for r in results if r[0])
    print(f'\n{ok}/{len(results)} passed')
    sys.exit(0 if ok == len(results) else 1)

import sys
asyncio.run(main())
