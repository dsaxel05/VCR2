"""Render an abstract document (see docs.py) to a real file. Two producers per family where it matters:
openpyxl and hand-built XML for xlsx, python-docx and hand-built XML for docx, reportlab and Chromium print for PDF."""
import csv, io, json, zipfile, html as H, email.message, email.policy, email.utils
from xml.sax.saxutils import escape as X


# ── flatten to text lines (md, txt, eml, rtf, pdf, docx) ──
def text_blocks(doc):
    if 'slides' in doc:
        out = []
        for n, s in enumerate(doc['slides']): out += [('slide', n + 1)] + s
        return out
    if 'sheets' in doc:
        out = []
        for sh in doc['sheets']:
            if sh.get('hidden'): continue
            out += [('h', sh['name']), ('table', [[str(x) for x in r] for r in sh['rows']], {})]
        return out
    if 'json' in doc: return [('p', json.dumps(doc['json'], indent=1))]
    return doc['blocks']


def md(doc, variant=0):
    L = []
    for b in text_blocks(doc):
        k = b[0]
        if k == 'slide': L.append(f'\n---\n<!-- slide {b[1]} -->')
        elif k == 'h': L.append(f'\n## {b[1]}\n')
        elif k == 'p': L.append(b[1] + '\n')
        elif k == 'kv': L.append((f'- **{b[1]}**: {b[2]}' if variant % 2 == 0 else f'{b[1]}: {b[2]}'))
        elif k == 'tile': L.append(f'**{b[2]}**  \n{b[1]}\n')
        elif k in ('note', 'foot'): L.append(f'<sub>{b[1]}</sub>\n')
        elif k == 'table':
            rows = b[1]; L.append('| ' + ' | '.join(str(x) for x in rows[0]) + ' |'); L.append('|' + '---|' * len(rows[0]))
            L += ['| ' + ' | '.join(str(x) for x in r) + ' |' for r in rows[1:]]; L.append('')
    return ('\n'.join(L).strip() + '\n').encode('utf-8')


def txt(doc, variant=0):
    L = []
    for b in text_blocks(doc):
        k = b[0]
        if k == 'slide': L.append(f'\n=== Slide {b[1]} ===')
        elif k == 'h': L += ['', b[1].upper(), '']
        elif k == 'p': L.append(b[1])
        elif k == 'kv': L.append(f'{b[1]:.<48} {b[2]}' if variant % 2 == 0 else f'{b[1]} - {b[2]}')
        elif k == 'tile': L += [b[2], b[1], '']
        elif k in ('note', 'foot'): L.append(b[1])
        elif k == 'table':
            rows = [[str(x) for x in r] for r in b[1]]; w = [max(len(r[i]) if i < len(r) else 0 for r in rows) for i in range(max(map(len, rows)))]
            L += ['  '.join(c.ljust(w[i]) for i, c in enumerate(r)).rstrip() for r in rows]; L.append('')
    return ('\n'.join(L).strip() + '\n').encode('utf-8')


def html(doc, variant=0, hidden_decoy=None):
    P = ['<!doctype html><html><head><meta charset="utf-8"><title>' + X(doc['title']) + '</title><style>.k{font-size:32px;font-weight:700}</style></head><body>']
    for b in text_blocks(doc):
        k = b[0]
        if k == 'slide': P.append(f'<section data-slide="{b[1]}">')
        elif k == 'h': P.append(f'<h2>{X(b[1])}</h2>')
        elif k == 'p': P.append(f'<p>{X(b[1])}</p>')
        elif k == 'kv': P.append(f'<dl><dt>{X(b[1])}</dt><dd>{X(b[2])}</dd></dl>' if variant % 2 == 0 else f'<p><b>{X(b[1])}:</b> {X(b[2])}</p>')
        elif k == 'tile': P.append(f'<div class="tile"><div class="k">{X(b[2])}</div><div>{X(b[1])}</div></div>')
        elif k in ('note', 'foot'): P.append(f'<p><small>{X(b[1])}</small></p>')
        elif k == 'table':
            P.append('<table>' + ''.join('<tr>' + ''.join(f'<{"th" if i == 0 else "td"}>{X(str(c))}</{"th" if i == 0 else "td"}>' for c in r) + '</tr>' for i, r in enumerate(b[1])) + '</table>')
    if hidden_decoy: P.append(f'<div style="display:none">{X(hidden_decoy)}</div><p hidden>{X(hidden_decoy)}</p>')
    P.append('<script>document.title="script ran"</script></body></html>')
    return '\n'.join(P).encode('utf-8')


def csv_bytes(doc, variant=0):
    s = io.StringIO(); w = csv.writer(s, delimiter=';' if variant % 3 == 2 else ',', lineterminator='\r\n' if variant % 2 else '\n')
    if 'sheets' in doc:
        for n, sh in enumerate(x for x in doc['sheets'] if not x.get('hidden')):
            if n: w.writerow([])
            for r in sh['rows']: w.writerow(r)
    else:
        for b in text_blocks(doc):
            if b[0] == 'table':
                for r in b[1]: w.writerow(r)
            elif b[0] == 'kv': w.writerow([b[1], b[2]])
            elif b[0] in ('h', 'p'): w.writerow([b[1]])
    return s.getvalue().encode('utf-8-sig' if variant % 4 == 1 else 'utf-8')


def json_bytes(doc, variant=0): return json.dumps(doc['json'], indent=2 if variant % 2 else None).encode('utf-8')


# ── xlsx: openpyxl ──
def xlsx_openpyxl(doc, variant=0):
    import openpyxl
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    for sh in doc['sheets']:
        ws = wb.create_sheet(sh['name'][:31])
        for r in sh['rows']: ws.append([_num(x) for x in r])
        if sh.get('hidden'): ws.sheet_state = 'hidden'
        if len(sh['rows'][0]) > 1 and len(sh['rows'][0]) == 1: ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=3)
        for row in ws.iter_rows():
            for cell in row:
                if isinstance(cell.value, (int, float)) and abs(cell.value) >= 1000: cell.number_format = '#,##0'
    if variant % 2: wb.create_sheet('Notes').append(['Prepared by finance. Figures unaudited.'])
    b = io.BytesIO(); wb.save(b); return b.getvalue()


def _num(x):
    if isinstance(x, (int, float)): return x
    s = str(x)
    try: return int(s.replace(',', '')) if s.replace(',', '').lstrip('-').isdigit() else s
    except ValueError: return s


# ── xlsx: hand-built (shared strings, cached formula values, optional 1904 dates) ──
def col(n):
    s = ''
    while n: n, r = divmod(n - 1, 26); s = chr(65 + r) + s
    return s


def xlsx_raw(doc, variant=0, date1904=False, formulas_cached=True):
    sst, idx = [], {}
    def si(t):
        if t not in idx: idx[t] = len(sst); sst.append(t)
        return idx[t]
    sheets_xml = []
    for sh in doc['sheets']:
        rows = []
        for ri, r in enumerate(sh['rows'], 1):
            cells = []
            for ci, v in enumerate(r, 1):
                ref = f'{col(ci)}{ri}'; v2 = _num(v)
                if v2 == '' or v2 is None: continue
                if isinstance(v2, (int, float)): cells.append(f'<c r="{ref}"><v>{v2}</v></c>')
                else: cells.append(f'<c r="{ref}" t="s"><v>{si(str(v2))}</v></c>')
            rows.append(f'<row r="{ri}">' + ''.join(cells) + '</row>')
        if sh is doc['sheets'][0] and len(sh['rows']) > 2:   # a formula row: SUM of column C with (or without) its cached value
            n = len(sh['rows']) + 1
            nums = [_num(r[2]) for r in sh['rows'][1:] if len(r) > 2 and isinstance(_num(r[2]), (int, float))]
            cached = f'<v>{sum(nums)}</v>' if formulas_cached else ''
            rows.append(f'<row r="{n}"><c r="A{n}" t="s"><v>{si("Check sum (formula)")}</v></c><c r="C{n}"><f>SUM(C2:C{n - 1})</f>{cached}</c></row>')
        sheets_xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + ''.join(rows) + '</sheetData></worksheet>')
    z = io.BytesIO()
    with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as f:
        f.writestr('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                   + ''.join(f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(len(sheets_xml)))
                   + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>')
        f.writestr('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        f.writestr('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                   + (f'<workbookPr date1904="1"/>' if date1904 else '') + '<sheets>'
                   + ''.join(f'<sheet name="{X(sh["name"][:31])}" sheetId="{i + 1}" r:id="rId{i + 1}"{" state=\"hidden\"" if sh.get("hidden") else ""}/>' for i, sh in enumerate(doc['sheets']))
                   + '</sheets><definedNames><definedName name="ClosingARR">\'ARR bridge\'!$C$8</definedName></definedNames></workbook>')
        f.writestr('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   + ''.join(f'<Relationship Id="rId{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i + 1}.xml"/>' for i in range(len(sheets_xml)))
                   + f'<Relationship Id="rId{len(sheets_xml) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>')
        for i, s in enumerate(sheets_xml): f.writestr(f'xl/worksheets/sheet{i + 1}.xml', s)
        f.writestr('xl/sharedStrings.xml', f'<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(sst)}" uniqueCount="{len(sst)}">' + ''.join(f'<si><t xml:space="preserve">{X(t)}</t></si>' for t in sst) + '</sst>')
    return z.getvalue()


def ods_raw(doc, variant=0):
    body = []
    for sh in doc['sheets']:
        rows = ''.join('<table:table-row>' + ''.join((f'<table:table-cell office:value-type="float" office:value="{v}"><text:p>{v}</text:p></table:table-cell>' if isinstance(_num(v), (int, float)) and v != ''
                                                      else f'<table:table-cell office:value-type="string"><text:p>{X(str(v))}</text:p></table:table-cell>') for v in r) + '</table:table-row>' for r in sh['rows'])
        body.append(f'<table:table table:name="{X(sh["name"])}"{" table:display=\"false\"" if sh.get("hidden") else ""}>{rows}</table:table>')
    content = ('<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:spreadsheet>'
               + ''.join(body) + '</office:spreadsheet></office:body></office:document-content>')
    return _odf('application/vnd.oasis.opendocument.spreadsheet', content)


def _odf(mime, content):
    z = io.BytesIO()
    with zipfile.ZipFile(z, 'w') as f:
        f.writestr(zipfile.ZipInfo('mimetype'), mime)   # stored, first, as the format requires
        f.writestr('content.xml', content, zipfile.ZIP_DEFLATED)
        f.writestr('META-INF/manifest.xml', f'<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="{mime}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>', zipfile.ZIP_DEFLATED)
    return z.getvalue()


def odt_raw(doc, variant=0):
    parts = []
    for b in text_blocks(doc):
        if b[0] == 'h': parts.append(f'<text:h text:outline-level="2">{X(b[1])}</text:h>')
        elif b[0] in ('p', 'note', 'foot'): parts.append(f'<text:p>{X(b[1])}</text:p>')
        elif b[0] == 'kv': parts.append(f'<text:p>{X(b[1])}: {X(b[2])}</text:p>')
        elif b[0] == 'tile': parts.append(f'<text:p>{X(b[2])}</text:p><text:p>{X(b[1])}</text:p>')
        elif b[0] == 'table': parts.append('<table:table>' + ''.join('<table:table-row>' + ''.join(f'<table:table-cell><text:p>{X(str(c))}</text:p></table:table-cell>' for c in r) + '</table:table-row>' for r in b[1]) + '</table:table>')
    content = ('<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:text>'
               + ''.join(parts) + '</office:text></office:body></office:document-content>')
    return _odf('application/vnd.oasis.opendocument.text', content)


# ── docx: python-docx, and hand-built with tracked changes ──
def docx_lib(doc, variant=0):
    import docx
    d = docx.Document()
    for b in text_blocks(doc):
        if b[0] == 'h': d.add_heading(b[1], level=2)
        elif b[0] in ('p', 'note', 'foot'): d.add_paragraph(b[1])
        elif b[0] == 'kv':
            if variant % 2: t = d.add_table(rows=1, cols=2); t.rows[0].cells[0].text = b[1]; t.rows[0].cells[1].text = b[2]
            else: p = d.add_paragraph(); p.add_run(b[1] + ': ').bold = True; p.add_run(b[2])
        elif b[0] == 'tile': d.add_paragraph(b[2]).runs[0].bold = True; d.add_paragraph(b[1])
        elif b[0] == 'table':
            rows = b[1]; t = d.add_table(rows=len(rows), cols=max(map(len, rows)))
            for i, r in enumerate(rows):
                for j, c in enumerate(r): t.cell(i, j).text = str(c)
    d.sections[0].footer.paragraphs[0].text = 'Confidential. Page 1 of 1. Version 2026.3'
    b = io.BytesIO(); d.save(b); return b.getvalue()


def docx_raw(doc, variant=0, tracked=True):
    paras = []
    for b in text_blocks(doc):
        t = b[1] if b[0] in ('h', 'p', 'note', 'foot') else (f'{b[1]}: {b[2]}' if b[0] == 'kv' else (f'{b[2]} {b[1]}' if b[0] == 'tile' else None))
        if t is None and b[0] == 'table': t = ' | '.join(' ; '.join(str(c) for c in r) for r in b[1])
        if t is None: continue
        run = f'<w:r><w:t xml:space="preserve">{X(t)}</w:t></w:r>'
        if tracked and b[0] == 'kv':   # the old value was deleted and the new one inserted: only the inserted text counts
            run = f'<w:r><w:t xml:space="preserve">{X(b[1])}: </w:t></w:r><w:del w:id="1" w:author="CFO"><w:r><w:delText>999,999,999</w:delText></w:r></w:del><w:ins w:id="2" w:author="CFO"><w:r><w:t>{X(b[2])}</w:t></w:r></w:ins>'
        paras.append(f'<w:p>{run}</w:p>')
    z = io.BytesIO()
    with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as f:
        f.writestr('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        f.writestr('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        f.writestr('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + ''.join(paras) + '</w:body></w:document>')
    return z.getvalue()


# ── pptx: python-pptx (KPI tiles as value-above-label boxes, speaker notes, an optional chart with cached values) ──
def pptx_lib(doc, variant=0, extra_slides=0):
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.chart.data import CategoryChartData
    from pptx.enum.chart import XL_CHART_TYPE
    prs = Presentation(); blank = prs.slide_layouts[5]
    slides = doc.get('slides') or [text_blocks(doc)]
    for si, s in enumerate(slides):
        sl = prs.slides.add_slide(blank); x = 0.5; y = 1.6
        for b in s:
            if b[0] == 'h': sl.shapes.title.text = b[1]
            elif b[0] == 'tile':
                tb = sl.shapes.add_textbox(Inches(x), Inches(2.0), Inches(2.2), Inches(1.4)); tf = tb.text_frame
                tf.text = b[2]; tf.paragraphs[0].runs[0].font.size = Pt(32); tf.paragraphs[0].runs[0].font.bold = True
                p = tf.add_paragraph(); p.text = b[1]; p.runs[0].font.size = Pt(12); x += 2.3
            elif b[0] == 'foot':
                tb = sl.shapes.add_textbox(Inches(0.5), Inches(6.8), Inches(9), Inches(0.4)); tb.text_frame.text = b[1]; tb.text_frame.paragraphs[0].runs[0].font.size = Pt(9)
            elif b[0] in ('p', 'kv', 'note'):
                tb = sl.shapes.add_textbox(Inches(0.5), Inches(y), Inches(9), Inches(0.6)); tb.text_frame.text = b[1] if b[0] != 'kv' else f'{b[1]}: {b[2]}'; y += 0.7
        if si == 1 and variant % 2 == 0:   # chart data cache: the ARR history as a column chart
            cd = CategoryChartData(); cd.categories = ['Q1', 'Q2', 'Q3', 'Q4']; cd.add_series('ARR ($M)', (1.1, 1.6, 2.2, 3.0))
            sl.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(1), Inches(3.8), Inches(6), Inches(2.6), cd)
        sl.notes_slide.notes_text_frame.text = 'Speaker notes: walk through the numbers; do not share the forecast.'
    for k in range(extra_slides):
        sl = prs.slides.add_slide(blank); sl.shapes.title.text = f'Appendix {k + 1}'
    b = io.BytesIO(); prs.save(b); return b.getvalue()


# ── PDF: reportlab (WinAnsi standard fonts, header and footer on every page) ──
def pdf_reportlab(doc, variant=0, pages=None, encrypt=None):
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    b = io.BytesIO()
    kw = {}
    if encrypt:
        from reportlab.lib import pdfencrypt
        kw['encrypt'] = pdfencrypt.StandardEncryption(encrypt, canPrint=0)
    cv = canvas.Canvas(b, pagesize=letter, **kw); W, Hh = letter
    lines = []
    for bl in text_blocks(doc):
        if bl[0] == 'slide': lines.append(('break', ''))
        elif bl[0] == 'h': lines.append(('h', bl[1]))
        elif bl[0] in ('p', 'note', 'foot'):
            t = bl[1]
            while len(t) > 95: cut = t.rfind(' ', 0, 95); lines.append(('p', t[:cut])); t = t[cut + 1:]
            lines.append(('p', t))
        elif bl[0] == 'kv': lines.append(('kv', bl[1], bl[2]))
        elif bl[0] == 'tile': lines.append(('tile', bl[1], bl[2]))
        elif bl[0] == 'table': lines += [('row', [str(c) for c in r]) for r in bl[1]] + [('p', '')]
    page = 1; y = Hh - 72
    def furniture():
        cv.setFont('Helvetica', 8); cv.drawString(72, Hh - 40, f'{doc["title"]}  |  Confidential  |  2026'); cv.drawRightString(W - 72, 30, f'Page {page}')
    furniture()
    for ln in lines * (pages or 1):
        if ln[0] == 'break' or y < 80:
            cv.showPage(); page += 1; y = Hh - 72; furniture()
            if ln[0] == 'break': continue
        if ln[0] == 'h': cv.setFont('Helvetica-Bold', 14); cv.drawString(72, y, ln[1]); y -= 24
        elif ln[0] == 'p': cv.setFont('Helvetica', 10); cv.drawString(72, y, ln[1]); y -= 14
        elif ln[0] == 'kv': cv.setFont('Helvetica', 10); cv.drawString(72, y, ln[1]); cv.drawRightString(W - 72, y, ln[2]); y -= 16
        elif ln[0] == 'tile': cv.setFont('Helvetica-Bold', 24); cv.drawString(72, y, ln[2]); cv.setFont('Helvetica', 10); cv.drawString(72, y - 16, ln[1]); y -= 44
        elif ln[0] == 'row':
            cv.setFont('Helvetica', 9); xs = [72] + [72 + 200 + 90 * i for i in range(len(ln[1]) - 1)]
            for x0, c in zip(xs, ln[1]): (cv.drawString if x0 == 72 else cv.drawRightString)(x0 if x0 == 72 else x0 + 80, y, c[:40])
            y -= 13
    cv.save(); return b.getvalue()


def pdf_chromium(doc, variant=0, browser=None):
    """Second PDF producer: Chromium prints the HTML rendering (CID fonts with ToUnicode, ligatures, kerning)."""
    if browser is None: return None
    pg = browser.new_page(); pg.set_content(html(doc, variant).decode('utf-8').replace('<script>document.title="script ran"</script>', ''))
    data = pg.pdf(format='Letter', print_background=True); pg.close(); return data


def eml(doc, variant=0, enc='qp'):
    m = email.message.EmailMessage(policy=email.policy.SMTP)
    m['From'] = 'CEO <ceo@example.com>'; m['To'] = 'investors@example.com'; m['Subject'] = doc['title']; m['Date'] = email.utils.format_datetime(email.utils.parsedate_to_datetime('Wed, 30 Sep 2026 09:00:00 +0000'))
    body = txt(doc, variant).decode('utf-8')
    m.set_content(body, cte='quoted-printable' if enc == 'qp' else 'base64')
    if variant % 2: m.add_alternative(html(doc, variant).decode('utf-8').replace('<script>document.title="script ran"</script>', ''), subtype='html')
    return m.as_bytes()


def rtf(doc, variant=0):
    def esc(t): return ''.join(c if ord(c) < 128 and c not in '\\{}' else ('\\' + c if c in '\\{}' else f'\\u{ord(c)}?') for c in t)
    out = [r'{\rtf1\ansi\deff0{\fonttbl{\f0 Helvetica;}}\f0\fs22 ']
    for b in text_blocks(doc):
        if b[0] == 'h': out.append(r'{\b ' + esc(b[1]) + r'}\par ')
        elif b[0] in ('p', 'note', 'foot'): out.append(esc(b[1]) + r'\par ')
        elif b[0] == 'kv': out.append(esc(b[1]) + ': ' + esc(b[2]) + r'\par ')
        elif b[0] == 'tile': out.append(esc(b[2]) + r'\par ' + esc(b[1]) + r'\par ')
        elif b[0] == 'table':
            for r in b[1]: out.append(r'\trowd ' + ''.join(rf'\cellx{2000 * (i + 1)}' for i in range(len(r))) + ''.join(esc(str(c)) + r'\cell ' for c in r) + r'\row ')
    out.append('}')
    return ''.join(out).encode('ascii')


def tsv(doc, variant=0):
    s = io.StringIO(); w = csv.writer(s, delimiter='\t', lineterminator='\n')
    for sh in (x for x in doc.get('sheets', []) if not x.get('hidden')):
        for r in sh['rows']: w.writerow(r)
        w.writerow([])
    return s.getvalue().encode('utf-8')


WRITERS = {'tsv': tsv, 'xlsm': xlsx_raw, 'htm': html, 'md': md, 'txt': txt, 'html': html, 'csv': csv_bytes, 'json': json_bytes, 'xlsx': xlsx_openpyxl, 'xlsx_raw': xlsx_raw, 'ods': ods_raw, 'odt': odt_raw,
           'docx': docx_lib, 'docx_raw': docx_raw, 'pptx': pptx_lib, 'pdf': pdf_reportlab, 'pdf_chrome': pdf_chromium, 'eml': eml, 'rtf': rtf}
EXT = {'xlsx_raw': 'xlsx', 'docx_raw': 'docx', 'pdf_chrome': 'pdf'}
PRODUCER = {'tsv': 'python-csv', 'xlsm': 'hand-built', 'htm': 'template', 'xlsx': 'openpyxl', 'xlsx_raw': 'hand-built', 'docx': 'python-docx', 'docx_raw': 'hand-built', 'pdf': 'reportlab', 'pdf_chrome': 'chromium',
            'pptx': 'python-pptx', 'ods': 'hand-built', 'odt': 'hand-built', 'eml': 'python-email', 'rtf': 'hand-built', 'md': 'template', 'txt': 'template',
            'html': 'template', 'csv': 'python-csv', 'json': 'python-json'}
