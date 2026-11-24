#!/usr/bin/env python3
"""Fake deal flow for the workspace tests: 56 fictional companies (every name, person, address and figure is invented).

    python tests/workspaces/make_corpus.py      (needs reportlab, python-pptx, pillow; writes tests/fixtures/workspaces/)

Formats: text PDF, PowerPoint, image-only PDF (a scan), PNG screenshots, e-mails (.eml) with the deck attached, incomplete decks
(no geography, no round), duplicates (the same file twice, the same company under another file name, the same web domain),
folders with a deck and a metrics export (so the engine has evidence, not only claims), a company spreadsheet for the
backfill, and a fake master sheet (sheet.json: headers, formula columns, dropdowns, rows the team already filled)."""
import json, random, pathlib, io, base64, datetime
from reportlab.lib.pagesizes import landscape, A4
from reportlab.pdfgen import canvas
from pptx import Presentation
from pptx.util import Inches, Pt
from PIL import Image, ImageDraw, ImageFont

OUT = pathlib.Path(__file__).resolve().parents[1] / 'fixtures' / 'workspaces'
R = random.Random(20261123)
SECT = {
  'fintech': ('payments and treasury for mid-market finance teams', 'B2B payments platform'),
  'health': ('clinical workflow software for hospitals and clinicians', 'digital health for patients'),
  'climate': ('carbon accounting and decarbonization for manufacturers', 'renewable energy storage analytics'),
  'ai': ('generative AI agents built on a large language model for support teams', 'machine learning for demand forecasting'),
  'edtech': ('learning platform for teachers and students', 'upskilling platform for employees'),
  'devtools': ('developer observability API and SDK', 'open source database infrastructure for developers'),
  'security': ('cybersecurity threat detection for SMBs', 'zero trust identity and access'),
  'logistics': ('freight and last-mile logistics software', 'supply chain procurement'),
  'crypto': ('crypto custody and DeFi wallet', 'blockchain token payments'),
  'hr': ('payroll and hiring software for SMBs', 'recruiting workflow'),
}
CITY = {'fr': ('Paris', 'France'), 'de': ('Berlin', 'Germany'), 'uk': ('London', 'United Kingdom'), 'es': ('Madrid', 'Spain'), 'nl': ('Amsterdam', 'Netherlands'),
        'us': ('San Francisco', 'United States'), 'us2': ('Boston', 'United States'), 'ca': ('Toronto', 'Canada'), 'in': ('Bangalore', 'India'), 'se': ('Stockholm', 'Sweden')}
SYL = ['nor', 'vel', 'tra', 'qua', 'lum', 'zen', 'bri', 'cor', 'fal', 'mir', 'sol', 'ver', 'tal', 'gri', 'pax', 'ori', 'kel', 'dun', 'ari', 'hex']
FIRST = ['Lena', 'Marc', 'Sofia', 'Omar', 'Clara', 'Jonas', 'Priya', 'Hugo', 'Elena', 'Tariq', 'Maya', 'Felix', 'Inès', 'Lucas', 'Nora', 'Ravi', 'Amélie', 'Theo', 'Zoe', 'Karim']
LAST = ['Varga', 'Lindqvist', 'Moreau', 'Haddad', 'Okafor', 'Brandt', 'Iyer', 'Costa', 'Novak', 'Fischer', 'Duval', 'Sato', 'Keller', 'Romero', 'Adeyemi', 'Weiss']

USED = set()
def company(i):
    while True:
        base = (R.choice(SYL) + R.choice(SYL)); name = base.capitalize() + R.choice(['', ' Labs', 'io', 'ly', ' Systems', 'a'])
        key = name.lower().replace(' labs', '').replace(' systems', '').replace(' ', '')
        if key not in USED and base not in USED: USED.add(key); USED.add(base); break
    sec = R.choice(list(SECT)); geo = R.choice(list(CITY)); stage = R.choice(['Pre-seed', 'Seed', 'Seed', 'Series A', 'Series A', 'Series B'])
    arr = {'Pre-seed': R.randint(0, 200), 'Seed': R.randint(300, 1800), 'Series A': R.randint(2200, 8000), 'Series B': R.randint(11000, 30000)}[stage] * 1000
    raise_ = {'Pre-seed': R.choice([0.5, 0.8, 1.2]), 'Seed': R.choice([1.5, 2.5, 3.5]), 'Series A': R.choice([6, 9, 12]), 'Series B': R.choice([20, 30, 45])}[stage]
    f1, l1 = R.choice(FIRST), R.choice(LAST); f2, l2 = R.choice(FIRST), R.choice(LAST)
    dom = name.lower().replace(' ', '') + R.choice(['.com', '.io', '.ai', '.co'])
    return dict(i=i, name=name, sector=sec, geo=geo, stage=stage, arr=arr, raise_m=raise_, growth=R.randint(40, 260), gm=R.randint(48, 86), nrr=R.randint(88, 140),
                customers=max(3, arr // R.randint(8000, 40000)), burn=R.randint(60, 600) * 1000, founders=[(f1, l1, 'CEO & Co-founder'), (f2, l2, 'CTO & Co-founder')],
                domain=dom, email=f'{f1.lower().replace("è","e").replace("é","e").replace("ï","i").replace("ç","c").replace("î","i").replace("é","e")}@{dom}', tagline=R.choice(SECT[sec]))

def slides(c, incomplete=False):
    city, country = CITY[c['geo']]
    s = [[c['name'], c['tagline'].capitalize() + '.', 'Investor presentation, confidential']]
    s.append(['The problem', f"Teams lose weeks on manual work. {c['name']} automates it with {c['tagline']}.", 'B2B, sold to companies on annual contracts (SaaS subscription).'])
    if not incomplete:
        s.append(['Company', f'Headquartered in {city}, {country}.', f"Founded 2022. {len(c['founders'])} founders."])
    s.append(['Traction', f"ARR: ${c['arr']:,}", f"YoY growth: {c['growth']}%", f"Gross margin: {c['gm']}%", f"Net revenue retention: {c['nrr']}%", f"Customers: {c['customers']}"])
    s.append(['Team'] + [f'{f} {l} – {r}' for f, l, r in c['founders']] + [f"Contact: {c['email']}", f"www.{c['domain']}"])
    if not incomplete:
        s.append(['The round', f"We are raising ${c['raise_m']}M ({c['stage']} round).", f"Monthly burn: ${c['burn']:,}"])
    return s

def pdf(c, path, incomplete=False):
    cv = canvas.Canvas(str(path), pagesize=landscape(A4))
    for sl in slides(c, incomplete):
        cv.setFont('Helvetica-Bold', 30); cv.drawString(60, 500, sl[0]); cv.setFont('Helvetica', 18)
        for k, line in enumerate(sl[1:]): cv.drawString(60, 440 - k * 34, line)
        cv.showPage()
    cv.save()

def pptx(c, path, incomplete=False):
    p = Presentation(); p.slide_width, p.slide_height = Inches(13.33), Inches(7.5)
    for sl in slides(c, incomplete):
        s = p.slides.add_slide(p.slide_layouts[1]); s.shapes.title.text = sl[0]
        tf = s.placeholders[1].text_frame; tf.text = sl[1]
        for line in sl[2:]: tf.add_paragraph().text = line
    p.save(str(path))

def font(sz):
    for f in ['arial.ttf', 'DejaVuSans.ttf', 'C:/Windows/Fonts/arial.ttf']:
        try: return ImageFont.truetype(f, sz)
        except Exception: pass
    return ImageFont.load_default()

def page_images(c, incomplete=False):
    out = []
    for sl in slides(c, incomplete):
        im = Image.new('RGB', (1600, 900), 'white'); d = ImageDraw.Draw(im)
        d.text((70, 60), sl[0], fill='black', font=font(64))
        for k, line in enumerate(sl[1:]): d.text((70, 200 + k * 70), line, fill='black', font=font(40))
        out.append(im)
    return out

def scan_pdf(c, path):
    ims = page_images(c); ims[0].save(str(path), 'PDF', resolution=150, save_all=True, append_images=ims[1:])

def png(c, path):
    ims = page_images(c); W, H = 1600, 900 * len(ims); big = Image.new('RGB', (W, H), 'white')
    for k, im in enumerate(ims): big.paste(im, (0, k * 900))
    big = big.resize((1000, H * 1000 // 1600)); big.save(str(path), 'PNG', optimize=True)

def eml(c, path, attach_path, kind='pdf'):
    b = base64.encodebytes(attach_path.read_bytes()).decode('ascii')
    f, l, _ = c['founders'][0]
    body = (f"---------- Forwarded message ---------\nFrom: {f} {l} <{c['email']}>\nSubject: {c['name']}: {c['stage']} round\n\n"
            f"Hi, I'm {f}, CEO of {c['name']}. We are raising ${c['raise_m']}M. Deck attached.\nBest, {f}\n")
    mime = 'application/pdf' if kind == 'pdf' else 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    msg = (f"From: Partner <partner@fund.example>\r\nTo: inbox@vcr2.test\r\nSubject: Fwd: {c['name']} deck\r\nDate: Mon, 16 Nov 2026 09:00:00 +0000\r\nMIME-Version: 1.0\r\n"
           f"Content-Type: multipart/mixed; boundary=\"b1\"\r\n\r\n--b1\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{body}\r\n--b1\r\nContent-Type: {mime}; name=\"{attach_path.name}\"\r\n"
           f"Content-Disposition: attachment; filename=\"{attach_path.name}\"\r\nContent-Transfer-Encoding: base64\r\n\r\n{b}\r\n--b1--\r\n")
    path.write_bytes(msg.encode('utf-8'))

def metrics_csv(c, path):
    a12 = int(c['arr'] / (1 + c['growth'] / 100)); new = int((c['arr'] - a12) * 1.25); churn = int(a12 * 0.08); exp = c['arr'] - a12 - new + churn
    rows = [('Metric', 'Value'), ('ARR today', c['arr']), ('ARR 12 months ago', a12), ('New ARR (last 12 months)', new), ('Expansion ARR (last 12 months)', max(0, exp)),
            ('Churned ARR (last 12 months)', churn), ('Contraction ARR (last 12 months)', 0), ('Gross margin', f"{c['gm']}%"), ('Net burn (monthly)', c['burn']),
            ('Cash on hand', c['burn'] * R.randint(10, 24)), ('Sales and marketing spend (last 12 months)', int(new * R.uniform(0.6, 1.8))), ('New customers (last 12 months)', max(1, c['customers'] // 2)),
            ('Customers today', c['customers']), ('Customers 12 months ago', max(1, c['customers'] // 2)), ('Headcount', max(4, c['arr'] // 150000))]
    path.write_text('\n'.join(f'{a},{b}' for a, b in rows) + '\n', encoding='utf-8')

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for p in OUT.rglob('*'):
        if p.is_file(): p.unlink()
    decks = OUT / 'decks'; decks.mkdir(exist_ok=True); mail = OUT / 'email'; mail.mkdir(exist_ok=True)
    cos = [company(i) for i in range(56)]
    plan = []
    for c in cos:
        i = c['i']; fmt = ['pdf', 'pptx', 'pdf', 'pptx', 'pdf', 'folder', 'pdf', 'pptx'][i % 8]
        if i in (7, 23): fmt = 'scan'
        if i in (15,): fmt = 'png'
        if i in (9, 31, 44): fmt = 'incomplete'
        if i in (3, 19, 27, 38, 50): fmt = 'email'
        slug = c['name'].lower().replace(' ', '-')
        if fmt == 'folder':
            d = decks / slug; d.mkdir(exist_ok=True); pdf(c, d / f'{slug}-deck.pdf'); metrics_csv(c, d / 'metrics-export.csv'); files = [f'decks/{slug}/{slug}-deck.pdf', f'decks/{slug}/metrics-export.csv']
        elif fmt == 'pptx': pptx(c, decks / f'{slug}-pitch.pptx'); files = [f'decks/{slug}-pitch.pptx']
        elif fmt == 'scan': scan_pdf(c, decks / f'{slug}-scan.pdf'); files = [f'decks/{slug}-scan.pdf']
        elif fmt == 'png': png(c, decks / f'{slug}-deck.png'); files = [f'decks/{slug}-deck.png']
        elif fmt == 'incomplete': pdf(c, decks / f'{slug}-deck.pdf', incomplete=True); files = [f'decks/{slug}-deck.pdf']
        elif fmt == 'email':
            tmp = mail / f'{slug}-deck.pdf'; pdf(c, tmp); eml(c, mail / f'{slug}.eml', tmp); tmp.unlink(); files = [f'email/{slug}.eml']
        else: pdf(c, decks / f'{slug}-deck.pdf'); files = [f'decks/{slug}-deck.pdf']
        plan.append({'i': i, 'name': c['name'], 'format': fmt, 'files': files, 'sector': c['sector'], 'geo': c['geo'], 'stage': c['stage'], 'raise_m': c['raise_m'], 'arr': c['arr'], 'domain': c['domain'], 'email': c['email']})
    # duplicates: the same file again, the same company under another name, a later deck from the same web domain
    dup = OUT / 'duplicates'; dup.mkdir(exist_ok=True)
    (dup / pathlib.Path(plan[0]['files'][0]).name).write_bytes((OUT / plan[0]['files'][0]).read_bytes())
    pdf(cos[1], dup / f"{cos[1]['name'].lower().replace(' ', '-')}-v2-final.pdf")
    c2 = dict(cos[2]); c2['arr'] = int(c2['arr'] * 1.2); pptx(c2, dup / 'update-q4.pptx')
    plan.append({'i': 100, 'name': cos[0]['name'], 'format': 'dup-same-file', 'files': ['duplicates/' + pathlib.Path(plan[0]['files'][0]).name]})
    plan.append({'i': 101, 'name': cos[1]['name'], 'format': 'dup-same-company', 'files': [f"duplicates/{cos[1]['name'].lower().replace(' ', '-')}-v2-final.pdf"]})
    plan.append({'i': 102, 'name': cos[2]['name'], 'format': 'dup-same-domain', 'files': ['duplicates/update-q4.pptx']})
    # a founder e-mail and a call transcript to add as evidence to company 5
    c5 = cos[5]
    (OUT / 'transcript.txt').write_text(f"Call with {c5['founders'][0][0]} {c5['founders'][0][1]} ({c5['name']}), 18 Nov 2026\n\nNet burn: ${c5['burn']:,} per month.\nCash on hand: ${c5['burn'] * 14:,}.\nHeadcount: 22.\nNPS: 54.\nThe founders have worked together for 6 years.\n", encoding='utf-8')
    # the investor's existing company spreadsheet (backfill): 12 rows, some with decks in decks/, one company not in the decks
    rows = [['Company', 'Website', 'Founder', 'Email', 'Stage', 'Sector', 'Status', 'Date received', 'Referral source']]
    for c in cos[:11]: rows.append([c['name'], 'https://' + c['domain'], f"{c['founders'][0][0]} {c['founders'][0][1]}", c['email'], c['stage'], c['sector'], 'Screened', '2026-10-0' + str(1 + c['i'] % 9), R.choice(['Angel intro', 'Conference', 'Cold inbound'])])
    rows.append(['Quietfield', 'https://quietfield.example', 'Ada Lind', 'ada@quietfield.example', 'Seed', 'climate', 'Inbound', '2026-11-02', 'Partner network'])
    (OUT / 'companies.csv').write_text('\n'.join(','.join(f'"{x}"' for x in r) for r in rows) + '\n', encoding='utf-8')
    # the fake master sheet: the column groups of a "Founder Relationship Database", formula and dropdown columns, 8 rows the team already filled
    headers = ['Company Name', 'Founder(s)', 'LinkedIn', 'Deck', 'Website', 'Sector', 'Stage', 'Geography', 'Lead Partner', 'Referral Source', 'Status', 'Last Contact Date', 'Next Action', 'Follow-up Owner',
               'Team & Execution', '10-Year Profitability & Unit Economics', 'M&A Durability & Exit Moat', 'Market Size & Timing', 'Product Differentiation', 'Total Weighted Score', 'Priority Tier',
               'Executive Summary', 'Gemini Summary', 'Diligence Gaps', 'Memo Link']
    lists = {5: ['FinTech', 'HealthTech', 'Climate', 'AI / ML', 'EdTech', 'DevTools', 'Cybersecurity', 'Logistics', 'HR Tech', 'Other'], 6: ['Pre-Seed', 'Seed', 'Series A', 'Series B+'],
             10: ['Inbound', 'Screened', 'Diligence', 'IC', 'Passed']}
    srows = []
    for k, c in enumerate(cos[:8]):
        r = [''] * len(headers)
        r[0] = c['name']; r[1] = f"{c['founders'][0][0]} {c['founders'][0][1]}"; r[4] = 'https://' + c['domain'] if k % 2 == 0 else ''; r[8] = R.choice(['A. Partner', 'B. Partner']); r[9] = 'Angel intro'
        r[10] = ['Diligence', 'Screened', 'IC', 'Inbound', 'Passed', 'Screened', 'Diligence', 'Inbound'][k]; r[11] = '2026-11-1' + str(k % 9); r[12] = 'Send data room request' if k % 3 == 0 else ''; r[13] = 'A. Partner' if k % 2 else ''
        r[14] = '4' if k == 0 else ''; r[22] = f'Team note from their own summary tool #{k}'
        srows.append(r)
    sheet = {'title': 'Founder Relationship Database (fake)', 'tab': 'Pipeline', 'headers': headers, 'rows': srows, 'formulaCols': [19, 20],
             'formulas': {19: '=IFERROR(SUMPRODUCT(O{r}:S{r},{{0.25,0.25,0.2,0.15,0.15}}),"")', 20: '=IF(T{r}="","",IF(T{r}>=4,"Tier 1",IF(T{r}>=3.25,"Tier 2","Tier 3")))'}, 'validations': {str(k): v for k, v in lists.items()}}
    (OUT / 'sheet.json').write_text(json.dumps(sheet, indent=1), encoding='utf-8')
    investors = {
      'a': {'name': 'Investor A (fake): European B2B fund', 'scorecard': 'profit_durability', 'pipeline': 'committee', 'storage': 'google',
            'thesis': {'stages': ['seed', 'a'], 'sectors': ['fintech', 'ai', 'devtools', 'security', 'b2b_software'], 'geos': ['europe'], 'models': ['saas', 'ai_app', 'fintech'],
                       'roundMin': 1000000, 'roundMax': 12000000, 'exclusions': ['crypto', 'gambling'], 'musts': [{'kind': 'keyword', 'text': 'B2B'}]}},
      'b': {'name': 'Investor B (fake): North American angel syndicate', 'scorecard': 'seed_basics', 'pipeline': 'intake', 'storage': 'microsoft (later: stored in VCR2 only)',
            'thesis': {'stages': ['preseed', 'seed'], 'sectors': ['health', 'climate', 'edtech', 'ai'], 'geos': ['north_america'], 'roundMin': 250000, 'roundMax': 3000000, 'exclusions': ['defence', 'crypto'], 'musts': [{'kind': 'metric', 'metric': 'arr', 'op': '>=', 'value': 100000}]}},
    }
    (OUT / 'investors.json').write_text(json.dumps(investors, indent=1), encoding='utf-8')
    (OUT / 'plan.json').write_text(json.dumps(plan, indent=1), encoding='utf-8')
    (OUT / 'README.md').write_text('Fake deal flow for tests/workspaces.test.mjs and tests/browser/workspaces_test.py. Every company, person, address and figure is invented. Regenerate with python tests/workspaces/make_corpus.py.\n', encoding='utf-8')
    print(len(plan), 'items,', sum(1 for p in plan if p['format'] == 'email'), 'e-mails')

if __name__ == '__main__':
    main()
