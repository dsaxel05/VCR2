"""Hostile .xlsx files (red team 2026-11): each is built here and must be refused with a plain message, or read
within a time budget. The CSV/JSON limits are in tests/security/parsers.test.mjs."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, base64, io, zipfile
from playwright.async_api import async_playwright
import fontroute
URL = _paths.BASE
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {info}'))

NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
def col(i):
    s = ''
    i += 1
    while i: i, r = divmod(i - 1, 26); s = chr(65 + r) + s
    return s
def workbook(shared='<si><t>x</t></si>', sheet='', sheet_prefix=''):
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>')
        z.writestr('xl/workbook.xml', f'<?xml version="1.0"?><workbook {NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>')
        z.writestr('xl/sharedStrings.xml', f'<?xml version="1.0"?><sst {NS}>{shared}</sst>')
        z.writestr('xl/worksheets/sheet1.xml', f'<?xml version="1.0"?>{sheet_prefix}<worksheet {NS}><sheetData>{sheet}</sheetData></worksheet>')
    return base64.b64encode(b.getvalue()).decode()

JS = r"""async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const t0 = performance.now(); let out;
  try { const x = await sheetFileToCSV(new File([u8], 'x.xlsx'), 'ledger'); const lines = x.csv.split('\n'); out = { ok:true, len:x.csv.length, maxCell:Math.max(...lines.map(l => l.length)) }; }
  catch (e) { out = { ok:false, msg:String(e && e.message || e) }; }
  out.ms = performance.now() - t0; return out; }"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        await fontroute.install(pg)
        await pg.goto(URL); await pg.wait_for_timeout(400)
        BUDGET = 3000
        # 4. internal entity expansion (DOCTYPE)
        dt = '<!DOCTYPE s [<!ENTITY a "' + 'A' * 1000000 + '">]>'
        rows = ''.join(f'<row r="{r}"><c r="A{r}" t="inlineStr"><is><t>&a;</t></is></c></row>' for r in range(1, 2001))
        r = await pg.evaluate(JS, workbook(sheet=rows, sheet_prefix=dt))
        check('entity bomb is refused with a plain message', r['ok'] is False and 'DOCTYPE' in r['msg'] or 'declaration' in r.get('msg', ''), r)
        check(f"entity bomb is refused fast ({r['ms']:.0f} ms)", r['ms'] < BUDGET, r)
        r = await pg.evaluate(JS, workbook(shared='<si><t>x</t></si>', sheet='<row r="1"><c r="A1"><v>1</v></c></row>', sheet_prefix='<!DOCTYPE s [<!ENTITY a "b">]>'))
        check('any DOCTYPE or ENTITY is refused', r['ok'] is False, r)
        # 5. one shared string reused in many cells
        refs = ''.join(f'<row r="{n}"><c r="A{n}" t="s"><v>0</v></c></row>' for n in range(1, 41))
        r = await pg.evaluate(JS, workbook(shared='<si><t>' + 'a' * 3000000 + '</t></si>', sheet=refs))
        check('long shared string reused 40 times is cut to one cell limit each', r['ok'] and r['maxCell'] <= 32767 + 2, r)
        check(f"... and reads fast ({r['ms']:.0f} ms)", r['ms'] < BUDGET, r)
        refs = ''.join(f'<row r="{n}"><c r="A{n}" t="s"><v>0</v></c></row>' for n in range(1, 1001))
        r = await pg.evaluate(JS, workbook(shared='<si><t>' + 'a' * 100000 + '</t></si>', sheet=refs))
        check('a workbook whose text would exceed 12 MB of CSV is refused', r['ok'] is False and '12 MB' in r['msg'], r)
        check(f"... fast ({r['ms']:.0f} ms)", r['ms'] < BUDGET, r)
        # 6. 900k cells (was under the old 2M cap)
        rows = ''.join(f'<row r="{n}">' + ''.join(f'<c r="{col(c)}{n}"><v>1</v></c>' for c in range(20)) + '</row>' for n in range(1, 45001))
        r = await pg.evaluate(JS, workbook(sheet=rows))
        check('900,000 cells are refused with a plain message', r['ok'] is False and 'far more cells' in r['msg'], r)
        check(f"... fast ({r['ms']:.0f} ms)", r['ms'] < BUDGET, r)
        # a large but real workbook still opens: 150,000 numeric cells
        rows = ''.join(f'<row r="{n}">' + ''.join(f'<c r="{col(c)}{n}"><v>{n}</v></c>' for c in range(10)) + '</row>' for n in range(1, 15001))
        r = await pg.evaluate(JS, workbook(sheet=rows))
        check('a real-size workbook (150,000 cells) still opens', r['ok'], r)
        check(f"... in time ({r['ms']:.0f} ms)", r['ms'] < 8000, r)
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')
    _sys.exit(1 if bad else 0)

asyncio.run(main())
