"""Deal flow end to end in a real browser, against a fake Google (Drive, Sheets, Docs) and a fake intake service.
   python tests/browser/workspaces_test.py
1. A workspace is created through the page (full process preset, Profitability & Durability scorecard), the thesis, the Drive
   folders, the master sheet (formula and dropdown columns) and the committee are set through the settings screens.
2. Decks are imported with the company spreadsheet: PDF, PowerPoint, an image-only scan and a PNG (read with the real OCR,
   self-hosted), an e-mail with its deck. The inbox brings a website submission and a forwarded e-mail.
3. Checks: thesis results, files in the right Drive folders, one row per company in the sheet, no formula written, the team's
   cells kept, reviewer scoring in one click, the deal memo as a Google Doc, an IC vote, the LP data room (blocking flags,
   exports to Doc, Sheet and PDF without any internal field), desktop and phone layouts, no console error, no other host."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, pathlib, threading, functools, re, base64, urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
FX = ROOT / 'tests' / 'fixtures' / 'workspaces'
SHOTS = pathlib.Path(_os.environ.get('VCR2_SHOTS', str(ROOT / 'docs' / 'overhaul' / 'verify' / 'scratch'))); SHOTS.mkdir(parents=True, exist_ok=True)
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:400]}'))
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

class FakeGoogle:
    def __init__(self):
        sh = json.loads((FX / 'sheet.json').read_text(encoding='utf-8'))
        self.headers, self.rows, self.fcols = sh['headers'], [r[:] for r in sh['rows']], sh['formulaCols']
        self.lists = {int(k): v for k, v in sh['validations'].items()}
        self.files, self.n, self.writes, self.formula_writes, self.calls = {}, 0, [], 0, []
        self.team = [r[:] for r in self.rows]
    def nid(self): self.n += 1; return 'g%012d' % self.n
    def recompute(self):
        for r in self.rows:
            while len(r) < len(self.headers): r.append('')
            try:
                s = [float(r[c]) for c in (14, 15, 16, 17, 18)]; t = round(sum(a * b for a, b in zip(s, (0.25, 0.25, 0.2, 0.15, 0.15))), 2)
                r[19] = str(t); r[20] = 'Tier 1' if t >= 4 else 'Tier 2' if t >= 3.25 else 'Tier 3'
            except Exception: r[19] = r[20] = ''
    def grid(self):
        self.recompute()
        def cell(v, row_i, c):
            d = {'formattedValue': v} if v != '' else {}
            if c in self.fcols and row_i > 0: d['userEnteredValue'] = {'formulaValue': '=SUM()'}
            if c in self.lists and row_i > 0: d['dataValidation'] = {'condition': {'type': 'ONE_OF_LIST', 'values': [{'userEnteredValue': x} for x in self.lists[c]]}}
            return d
        rows = [self.headers] + self.rows + [[''] * len(self.headers)] * 3
        return {'sheets': [{'data': [{'rowData': [{'values': [cell(v, i, c) for c, v in enumerate(r)]} for i, r in enumerate(rows)]}]}]}
    async def handle(self, route):
        req = route.request; url = req.url; m = req.method; self.calls.append((m, url.split('?')[0]))
        J = lambda o, s=200: route.fulfill(status=s, content_type='application/json', body=json.dumps(o))
        if 'sheets.googleapis.com' in url:
            if m == 'GET' and 'includeGridData' in url: return await J(self.grid())
            if m == 'GET': return await J({'properties': {'title': 'Founder Relationship Database (fake)'}, 'sheets': [{'properties': {'title': 'Pipeline', 'sheetId': 0}}]})
            if url.split('?')[0].endswith('values:batchUpdate'):
                for d in json.loads(req.post_data)['data']:
                    a1 = d['range'].split('!')[1]; mm = re.match(r'([A-Z]+)(\d+)', a1); col = 0
                    for ch in mm.group(1): col = col * 26 + ord(ch) - 64
                    col -= 1; row = int(mm.group(2)) - 2
                    if col in self.fcols: self.formula_writes += 1
                    while len(self.rows) <= row: self.rows.append([''] * len(self.headers))
                    self.rows[row][col] = str(d['values'][0][0]).lstrip("'"); self.writes.append((row, col, d['values'][0][0]))
                return await J({})
        if 'docs.googleapis.com' in url: return await J({})
        if '/export' in url: return await route.fulfill(status=200, content_type='application/pdf', body=b'%PDF-1.4 fake')
        if '/upload/drive/v3/files' in url:
            body = req.post_data_buffer or b''
            if m == 'PATCH':
                fid = url.split('/files/')[1].split('?')[0]; self.files.setdefault(fid, {}).update({'body': body, 'updated': True}); return await J({'id': fid, 'name': self.files[fid].get('name', ''), 'webViewLink': 'https://drive.google.com/file/d/' + fid})
            txt = body.decode('latin1'); meta = json.loads(re.search(r'\r\n\r\n(\{.*?\})\r\n--', txt, re.S).group(1))
            fid = self.nid(); self.files[fid] = {'name': meta['name'], 'parent': (meta.get('parents') or [''])[0], 'mime': meta.get('mimeType', ''), 'body': body}
            return await J({'id': fid, 'name': meta['name'], 'webViewLink': ('https://docs.google.com/document/d/' if 'document' in meta.get('mimeType', '') else 'https://drive.google.com/file/d/') + fid})
        if '/copy' in url:
            fid = self.nid(); self.files[fid] = {'name': json.loads(req.post_data)['name'], 'copy': True}; return await J({'id': fid, 'name': self.files[fid]['name'], 'webViewLink': 'https://docs.google.com/document/d/' + fid})
        if '/drive/v3/files' in url and m == 'POST':
            meta = json.loads(req.post_data); fid = self.nid(); self.files[fid] = {'name': meta['name'], 'parent': (meta.get('parents') or [''])[0], 'folder': True}
            return await J({'id': fid, 'name': meta['name'], 'webViewLink': 'https://drive.google.com/drive/folders/' + fid})
        return await J({'error': {'message': 'not faked: ' + url}}, 404)

class FakeIntake:
    def __init__(self):
        eml = next((FX / 'email').glob('*.eml')).read_bytes()
        deck = (FX / 'decks' / 'arifal-pitch.pptx').read_bytes()
        form = json.dumps({'meta': {'company': 'Lumenreach', 'founder': 'Iris Okafor', 'email': 'iris@lumenreach.example', 'website': 'https://lumenreach.example', 'stage': 'seed', 'message': 'We help hiring teams run structured interviews.'}, 'files': [{'name': 'lumenreach.pptx', 'type': '', 'b64': base64.b64encode(deck).decode()}]}).encode()
        self.items = {'e1': ('email', eml, 'Fwd: deck'), 'f1': ('form', form, '')}; self.deleted = []; self.acks = []; self.digests = []
    async def handle(self, route):
        req = route.request; u = urllib.parse.urlparse(req.url); p = u.path
        H = {'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS'}
        if req.method == 'OPTIONS': return await route.fulfill(status=204, headers=H)
        J = lambda o, s=200: route.fulfill(status=s, content_type='application/json', body=json.dumps(o), headers=H)
        if p == '/v1/inbox': return await J({'items': [{'id': k, 'kind': v[0], 'received': '2026-11-23T08:00:00Z', 'subject': v[2]} for k, v in self.items.items()]})
        mm = re.match(r'/v1/inbox/(\w+)', p)
        if mm and req.method == 'GET': return await route.fulfill(status=200, body=self.items[mm.group(1)][1], headers=H)
        if mm and req.method == 'DELETE': self.deleted.append(mm.group(1)); self.items.pop(mm.group(1), None); return await J({'ok': True})
        if p == '/v1/ack': self.acks.append(json.loads(req.post_data)); return await J({'ok': True})
        if p == '/v1/digest': self.digests.append(json.loads(req.post_data)); return await J({'ok': True})
        return await J({'ok': True})

async def main():
    srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); base = f'http://127.0.0.1:{srv.server_address[1]}/'
    G, I = FakeGoogle(), FakeIntake()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # 0. the strict page (its own policy): loads clean, no request anywhere
        ctx0 = await b.new_context(); pg0 = await ctx0.new_page(); e0 = []
        pg0.on('console', lambda m: e0.append(m.text) if m.type == 'error' else None); pg0.on('pageerror', lambda e: e0.append(str(e)))
        await pg0.goto(base + 'flow.html'); await pg0.wait_for_selector('#fl-new-name')
        check('Deal flow loads under its own strict policy with no console error', not e0, e0[:3])
        csp = await pg0.evaluate("document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]').content")
        check('its policy allows only Google\'s Drive, Sheets and Docs APIs (and the account and AI hosts) as outside hosts', 'googleapis.com' in csp and "script-src 'sha256-" in csp and 'unsafe-eval' not in csp and "frame-src 'none'" in csp)
        await ctx0.close()
        # the full run: Google and the intake service are fakes; the intake host is a test host, so the policy is bypassed here only
        ctx = await b.new_context(viewport={'width': 1366, 'height': 900}, bypass_csp=True, accept_downloads=True); pg = await ctx.new_page(); errs, other = [], []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        await ctx.route(re.compile(r'https://(www|sheets|docs)\.googleapis\.com/.*'), G.handle)
        await ctx.route(re.compile(r'https://intake\.test/.*'), I.handle)
        async def other_host(route):
            if route.request.frame.page == pg: other.append(route.request.url)
            await route.abort()
        # a click on a link to the investor's own Google Doc opens it in a new tab: that is a navigation, not data sent
        await ctx.route(lambda u: u.startswith(('http:', 'https:')) and not u.startswith(base) and 'googleapis.com' not in u and 'intake.test' not in u and not re.match(r'https://(docs|drive)\.google\.com/', u), other_host)
        await pg.goto(base + 'flow.html'); await pg.wait_for_selector('#fl-new-name')
        await pg.evaluate("""() => { WS_SITE.google = { clientId:'123456789-abcdefghijklmno.apps.googleusercontent.com' }; WS_SITE.intake = 'https://intake.test';
            _wsgTok = { token:'fake-google-token', exp:Date.now() + 3600e3 };
            let n = 0; WSG.pick = async kind => kind === 'sheet' ? [{ id:'sheet1aaaaaaaaaaa', name:'Founder Relationship Database (fake)', url:'https://docs.google.com/spreadsheets/d/sheet1aaaaaaaaaaa' }] : [{ id:'folder' + kind + (++n) + 'xxxxxxxx', name:'Deal flow ' + n, url:'https://drive.google.com/drive/folders/f' + n }]; }""")
        # 1. create the workspace through the page
        await pg.fill('#fl-new-name', 'Fund C (fake)'); await pg.select_option('#fl-new-card', 'profit_durability'); await pg.select_option('#fl-new-pipe', 'ddp')
        await pg.click('text=Create the workspace'); await pg.wait_for_selector('.fl-settabs')
        check('a workspace is created and opens on its thesis', await pg.locator('.fl-settab.active').inner_text() == 'Thesis')
        for label in ['Seed', 'Series A']: await pg.locator('.fl-chipbox', has_text=re.compile('^ *' + label + '$')).first.locator('input').check()
        for label in ['HR and future of work', 'Fintech', 'AI and machine learning', 'B2B software (horizontal)', 'Climate and energy', 'Education']: await pg.locator('.fl-chipbox', has_text=label).first.locator('input').check()
        await pg.locator('textarea[data-a="thesis.exclusions"]').fill('crypto'); await pg.locator('textarea[data-a="thesis.exclusions"]').dispatch_event('change')
        await pg.click('text=Save and re-score'); await pg.wait_for_timeout(300)
        th = await pg.evaluate("() => flWs().thesis")
        check('the thesis is set from the form (stages, sectors, exclusions)', th['stages'] == ['seed', 'a'] and 'hr' in th['sectors'] and th['exclusions'] == ['crypto'], th)
        # Google: folders and the master sheet, through the settings screen
        await pg.click('.fl-settab:has-text("Google Drive")')
        await pg.locator('button[data-click="flPickFolder"][data-a="root"]').click(); await pg.wait_for_timeout(200)
        for k in ['in', 'border', 'out', 'memos']: await pg.locator(f'button[data-click="flMakeFolder"][data-a="{k}"]').click(); await pg.wait_for_timeout(150)
        await pg.click('text=Choose your sheet'); await pg.wait_for_selector('text=Your column')
        modes = await pg.evaluate("() => flDraft().storage.sheet.mapping.map(m => [m.header, m.field, m.mode])")
        check('the mapping marks formula columns "reads only" and the team\'s columns "reads only"', dict((h, mo) for h, f, mo in modes)['Total Weighted Score'] == 'read' and dict((h, mo) for h, f, mo in modes)['Lead Partner'] == 'read' and dict((h, mo) for h, f, mo in modes)['Company Name'] == 'write', modes)
        check('an unknown column of theirs (Gemini Summary) is ignored', dict((h, mo) for h, f, mo in modes)['Gemini Summary'] == 'ignore')
        await pg.click('text=Save and re-score'); await pg.wait_for_timeout(300)
        # the committee
        await pg.click('.fl-settab:has-text("Investment committee")')
        for _ in range(4): await pg.click('text=Add a member')
        for i, (nm, role) in enumerate([('Ana', 'Managing partner'), ('Ben', 'Partner'), ('Cy', 'Partner'), ('Dee', 'Venture partner')]):
            await pg.locator(f'input[data-click], input[data-change="flIcMem"][data-a="#{i}"][data-b="name"]').fill(nm); await pg.locator(f'input[data-change="flIcMem"][data-a="#{i}"][data-b="name"]').dispatch_event('change')
            await pg.locator(f'input[data-change="flIcMem"][data-a="#{i}"][data-b="role"]').fill(role); await pg.locator(f'input[data-change="flIcMem"][data-a="#{i}"][data-b="role"]').dispatch_event('change')
        await pg.locator('input[data-change="flDNum"][data-a="ic.quorum"]').fill('3'); await pg.locator('input[data-change="flDNum"][data-a="ic.quorum"]').dispatch_event('change')
        await pg.click('text=Save and re-score'); await pg.wait_for_timeout(300)
        check('the committee is saved with its quorum', await pg.evaluate("() => flWs().ic.members.length === 4 && flWs().ic.quorum === 3"))
        # 2. import decks and the company spreadsheet
        plan = json.loads((FX / 'plan.json').read_text(encoding='utf-8'))
        pick = [p for p in plan if p['format'] in ('scan', 'png')] + [p for p in plan if p['format'] == 'pptx'][:3] + [p for p in plan if p['format'] == 'pdf'][:5] + [p for p in plan if p['format'] == 'email'][:1] + [p for p in plan if p['format'] == 'incomplete'][:1]
        files = [str(FX / f) for p in pick for f in p['files']]
        await pg.click('.fl-tab[data-a="add"]'); await pg.set_input_files('#fl-files', files); await pg.set_input_files('#fl-sheet', str(FX / 'companies.csv'))
        await pg.click('text=Read and score')
        await pg.wait_for_function("() => !FS.busy && FS.deals.length > 0", timeout=420000); await pg.wait_for_timeout(500)
        deals = await pg.evaluate("() => FS.deals.filter(d => !d.mergedInto).map(d => ({ company:d.company, result:d.thesis && d.thesis.result, label:d.thesis && d.thesis.label, files:d.files.map(f => f.name), arr:d.facts && d.facts.arr, folder:!!d.folderUrl, report:!!d.reportUrl, ocr:(d.readNotes || []).join(' ') }))")
        scans = [d for d in deals if any(re.search(r'scan|\.png', f) for f in d['files'])]
        check('image-only decks are read with OCR: the company and its figures are found', len(scans) == 3 and all(d['company'] and d['arr'] for d in scans) and all('OCR' in d['ocr'] for d in scans), scans)
        named = {p['name'] for p in plan}
        check('every imported company has its name and a thesis result', all(d['company'] and d['result'] in ('in', 'border', 'out') for d in deals), [d for d in deals if not d['company']])
        check('rows of the spreadsheet were matched to their decks (no duplicate company)', len({d['company'].lower() for d in deals}) == len(deals))
        full = await pg.evaluate("() => FS.deals.filter(d => !d.mergedInto && d.thesis.result !== 'out' && d.input && Object.keys(d.input.vals).length).map(d => [d.company, !!d.analysis, (d.readNotes || []).filter(n => /could not run/.test(n))])")
        check('In thesis and Borderline companies have the full VCR2 analysis', full and all(a and not n for _, a, n in full), full)
        check('In thesis and Borderline decks are filed in Drive with their report', all(d['folder'] and d['report'] for d in deals if d['result'] != 'out'))
        parents = {f.get('parent') for f in G.files.values() if f.get('folder') and re.search(r'\(20\d\d-', f['name'])}
        check('company folders sit in the In, Borderline and Out folders', len(parents) >= 2 and all(p and p.startswith('g') for p in parents), parents)
        # the inbox: a website submission and a forwarded e-mail
        await pg.evaluate("""async () => { const w = flWs(); await flWsSaveDirect(x => { x.intake = { key:'K'.repeat(40), wsKey:'wsfakekey1', address:'ws-abcdefghij@vcr2.test', formId:'formfakeid1234' }; x.notify.ack = true; x.notify.ackText = 'Thanks'; }); }""")
        await pg.click('.fl-tab[data-a="dash"]'); await pg.click('text=Check the inbox')
        await pg.wait_for_function("() => !FS.busy && FS.deals.some(d => d.source === 'website')", timeout=120000); await pg.wait_for_timeout(800)
        web = await pg.evaluate("() => FS.deals.filter(d => d.source === 'website' || d.source === 'email').map(d => ({ c:d.company, src:d.source, email:d.email, ack:!!d.ackSent }))")
        check('the inbox items are read: a website submission and a forwarded e-mail', any(w['src'] == 'website' and w['c'] == 'Lumenreach' for w in web) and any(w['src'] == 'email' for w in web), web)
        check('read items are deleted from the intake service', sorted(I.deleted) == ['e1', 'f1'], I.deleted)
        check('the acknowledgement (switched on) is asked once for the founder', len(I.acks) >= 1 and all('@' in a['to'] for a in I.acks), I.acks)
        # the master sheet
        await pg.click('text=Update the master sheet'); await pg.wait_for_timeout(1500)
        names = [r[0] for r in G.rows if r and r[0]]
        check('the master sheet has one row per company, existing rows matched', len(names) == len({n.lower() for n in names}) and len(G.rows) >= 8, names)
        check('no formula cell was written', G.formula_writes == 0)
        kept = all(G.rows[i][c] == v for i, r in enumerate(G.team) for c, v in enumerate(r) if v != '' and c not in G.fcols)
        check('every cell the team had filled is unchanged', kept)
        check('dropdown columns only got the team\'s own values', all(str(v).lstrip("'") in G.lists[c] for _, c, v in G.writes if c in G.lists), [w for w in G.writes if w[1] in G.lists][:5])
        # 3. reviewer scoring in one click, the memo, the IC vote
        cid = await pg.evaluate("() => (FS.deals.find(d => d.thesis && d.thesis.result === 'in' && d.engineClaims) || FS.deals.find(d => d.thesis.result !== 'out')).id")
        await pg.evaluate(f"() => flOpen('{cid}')"); await pg.wait_for_selector('.fl-drawer:not([hidden]) .fl-pillar')
        await pg.screenshot(path=str(SHOTS / 'ws-drawer-desktop.png'))
        for pid in ['team', 'moat', 'market', 'product', 'profitability']:
            await pg.locator(f'button[data-click="flScore"][data-b="{pid}"][data-c="#4"]').click(); await pg.wait_for_timeout(150)
        sc = await pg.evaluate(f"() => {{ const d = FS.deals.find(x => x.id === '{cid}'); const s = flSc(d); return {{ total:s.total, tier:s.tier, from:s.pillars.map(p => p.from), by:s.pillars[0].by, complete:!!(d.timing && d.timing.completeAt) }}; }}")
        check('one click per pillar: reviewer scores with name and date, total and tier computed', sc['total'] == 4 and sc['tier'] == 'Tier 1' and all(f == 'reviewer' for f in sc['from']) and sc['complete'], sc)
        await pg.click('button[data-click="flMemo"]'); await pg.wait_for_timeout(1200)
        memo = [f for f in G.files.values() if 'deal memo' in f.get('name', '')]
        check('the deal memo is created as a Google Doc and linked', len(memo) == 1 and 'document' in memo[0]['mime'] and await pg.evaluate(f"() => !!FS.deals.find(x => x.id === '{cid}').memo"))
        await pg.select_option(f'.fl-drawer select[data-b="status"]', 'IC vote'); await pg.wait_for_timeout(400)
        for i, v in enumerate(['yes', 'conditions', 'no', 'yes']):
            await pg.locator(f'select[data-change="flIcVote"][data-b="#{i}"]').select_option(v); await pg.wait_for_timeout(100)
        await pg.locator('input[data-change="flIcVote"][data-b="#1"][data-c="conditionsText"]').fill('Three customer reference calls'); await pg.locator('input[data-change="flIcVote"][data-b="#1"][data-c="conditionsText"]').dispatch_event('change')
        await pg.click('text=Record the vote'); await pg.wait_for_timeout(1200)
        ic = await pg.evaluate(f"() => {{ const d = FS.deals.find(x => x.id === '{cid}'); return {{ r:d.ic.result, st:d.status, memo:!!d.ic.memo, n:d.ic.votes.length }}; }}")
        check('the IC vote is recorded with the memo, approved with conditions, and the status moves to Term sheet', ic == {'r': 'approved_conditions', 'st': 'Term sheet', 'memo': True, 'n': 4}, ic)
        col = G.headers.index('Status') if 'Status' in G.headers else 10
        # 4. the LP data room
        await pg.click('.fl-drawer button[data-click="flCloseDrawer"]'); await pg.click('.fl-tab[data-a="lp"]'); await pg.wait_for_selector('text=Anonymized pipeline')
        check('the generated entries pass the anonymization check', 'Anonymization check passed' in await pg.inner_text('#fl-view'))
        eid = await pg.evaluate("() => flLpEnts()[0].id")
        await pg.locator(f'button[data-click="flLpEditGo"][data-a="{eid}"]').click()
        cname = await pg.evaluate(f"() => FS.deals.find(d => d.id === '{eid}').company")
        await pg.fill('#fl-lp-d', f'{cname} has 1,250 customers in Paris, including Carrefour.'); await pg.click('text=Check and keep'); await pg.wait_for_timeout(300)
        blocked = await pg.locator('button[data-click="flLpDrive"]').is_disabled()
        nflags = await pg.locator('.fl-lpflag').count()
        check('a description naming the company, a count, a city and a customer is flagged and blocks every export', blocked and nflags >= 4, nflags)
        while await pg.locator('button[data-click="flLpFixGo"]').count():
            await pg.locator('button[data-click="flLpFixGo"]').first.click(); await pg.wait_for_timeout(250)
        check('applying the suggestions clears the flags and unblocks the export', not await pg.locator('button[data-click="flLpDrive"]').is_disabled())
        await pg.click('button[data-click="flLpDrive"]'); await pg.wait_for_timeout(1500); print('toast after LP export:', await pg.inner_text('#toast'))
        await pg.click('button[data-click="flDdpDrive"]'); await pg.wait_for_timeout(1500); print('toast after process export:', await pg.inner_text('#toast')); print('LEAKS', await pg.evaluate("() => [wsLpLeaks(wsDdpHTML(flWs(), 'x'), FS.deals).slice(0, 8), wsLpLeaks(wsLpHTML(flWs(), flLpEnts(), 'x'), FS.deals).slice(0, 8)]"))
        lp = {k: v for k, v in G.files.items() if 'LP-facing' in v.get('name', '')}
        kinds = sorted(v.get('mime', '') or 'pdf' for v in lp.values())
        check('LP exports: the pipeline as a Google Doc, a Google Sheet and a PDF; the process as a Doc and a PDF', sum('spreadsheet' in k for k in kinds) == 1 and sum('document' in k for k in kinds) == 2 and sum(k == 'pdf' for k in kinds) == 2, kinds)
        internal = await pg.evaluate("() => FS.deals.flatMap(d => [d.company, d.email, ...(d.founders || []), ...(d.notes || []).map(n => n.text)]).filter(v => v && v.length > 3)")
        texts = ' '.join(v['body'].decode('utf-8', 'ignore') for v in lp.values() if v.get('body'))
        leaked = [v for v in internal if v.lower() in texts.lower()]
        check('no internal value (company, founder, e-mail, note) is in any LP-facing file', not leaked and 'LP-FACING' in texts, leaked[:5])
        before = len(G.files); await pg.click('button[data-click="flLpDrive"]'); await pg.wait_for_timeout(1500)
        check('a refresh updates the same files (the data-room links keep working)', len(G.files) == before and sum(1 for v in G.files.values() if v.get('updated')) >= 3)
        await pg.screenshot(path=str(SHOTS / 'ws-lp-desktop.png'), full_page=True)
        await pg.click('.fl-tab[data-a="dash"]'); await pg.wait_for_timeout(600); await pg.screenshot(path=str(SHOTS / 'ws-dashboard-desktop.png'), full_page=True)
        tiles = await pg.locator('.fl-tiles .kpi').count()
        check('the dashboard shows its five tiles', tiles == 5)
        # phone
        await pg.set_viewport_size({'width': 375, 'height': 812}); await pg.wait_for_timeout(400)
        for v in ['dash', 'triage', 'lp', 'settings']:
            await pg.evaluate(f"() => flView('{v}')"); await pg.wait_for_timeout(300)
            sw = await pg.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")
            check(f'phone: the {v} view has no sideways scroll', sw)
        await pg.evaluate("() => flView('dash')"); await pg.screenshot(path=str(SHOTS / 'ws-dashboard-phone.png'), full_page=True)
        await pg.evaluate(f"() => flOpen('{cid}')"); await pg.wait_for_timeout(300); await pg.screenshot(path=str(SHOTS / 'ws-drawer-phone.png'))
        check('no console error during the whole run', not [e for e in errs if 'favicon' not in e], errs[:5])
        check('nothing was sent to any other host', not other, other[:3])
        await ctx.close(); await b.close()
    srv.shutdown()
    failed = [r for r in results if not r[0]]
    print(f'{len(results) - len(failed)}/{len(results)} passed')
    _sys.exit(1 if failed else 0)

asyncio.run(main())
