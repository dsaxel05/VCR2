"""XSS sweep: hostile text in every place outside data enters the page, then every view is opened.

Planted in: a shared deal file (company name, every text and choice answer, notes, ledger customer names, a financials
column), a ledger file name and a broken ledger, the resume card, a library backup, a library CSV, AI replies (figure
extraction, memo narrative, library import), the published configuration (every label, text, custom item and wording
replacement), a configuration imported into the Studio, and the Studio's publish history (commit messages).
Opened: every report view, the verification page, the founder email, the printed memo, the library, every Studio tab
and editor. A planted handler that runs calls __x(tag); the sweep fails on any call, on any dialog, and on any live
event handler, script, frame or javascript: link carrying the payload anywhere in the page. All network calls are
mocked and every key and token is fake.
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys, json, re, base64, pathlib
from playwright.async_api import async_playwright
import fontroute
BASE = _paths.BASE
ORIGIN = _paths.ORIGIN
ROOT = pathlib.Path(__file__).resolve().parents[2]
FAKE_KEY = 'sk-' + 'A' * 40
TOKEN = 'github_pat_' + 'A' * 60
AI_HOSTS = ['api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com', 'api.groq.com', 'openrouter.ai']
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:600]}'))

def P(t):
    """One payload that breaks out of text, double- and single-quoted attributes, JS strings in handlers, and raw-text elements."""
    return (f"<img src=x onerror=__x('{t}')>\"><img src=x onerror=__x('{t}')>'><svg onload=__x('{t}')>');__x('{t}');//"
            f"</textarea></title></style></script><script>__x('{t}')</script><a href=\"javascript:__x('{t}')\">l</a>"
            f"<iframe srcdoc=\"<script>parent.__x('{t}')</script>\"></iframe><details open ontoggle=__x('{t}')>")

INIT = "window.__hits = []; window.__x = t => window.__hits.push(String(t)); window.print = () => {};"
JS_P ="const P = t => " + json.dumps(P('@@')) + ".split('@@').join(t);"

SCAN = """() => {
  const bad = [];
  const walk = root => root.querySelectorAll('*').forEach(el => {
    const tag = el.tagName;
    if (['SCRIPT','IFRAME','OBJECT','EMBED','FRAME'].includes(tag) && ((el.textContent || '') + (el.getAttribute('srcdoc') || '')).includes('__x(')) bad.push(tag + ' with payload');
    for (const a of el.attributes) {
      if (/^on/i.test(a.name) && a.value.includes('__x(')) bad.push(tag + '@' + a.name + ': ' + a.value.slice(0, 50));
      if (/^(href|src|xlink:href|action|formaction|srcdoc|data)$/i.test(a.name) && (/^\\s*javascript:/i.test(a.value) || a.value.includes('__x('))) bad.push(tag + '@' + a.name + ': ' + a.value.slice(0, 50));
    }
    if (el.shadowRoot) walk(el.shadowRoot);
  });
  walk(document);
  return bad;
}"""

def deep_fill(o, path=''):
    """Replace every human-readable text in a config with a payload; ids, formulas and conditions stay valid."""
    KEEP = {'id', 'key', 'formula', 'when', 'stated', 'computed', 'mode', 'good', 'dir', 'dim', 'section', 'type', 'unit', 'metric', 'stage',
            'like', 'sev', 'risk', 'priority', 'from', 'owner', 'repo', 'branch', 'path', 'updated', 'accent', 'frame', 'divider', 'theme',
            'brand', 'brandDark', 'highlight', 'direction', 'evidenceMode', 'withheldMode', 'waterfallPool', 'defaultAliveExpenses', 'year', 'currency'}
    if isinstance(o, dict):
        return {k: (v if k in KEEP and not isinstance(v, (dict, list)) else deep_fill(v, path + '.' + k)) for k, v in o.items()}
    if isinstance(o, list):
        return [deep_fill(v, path) for v in o]
    if isinstance(o, str):
        return P('cfg' + path)
    return o

def hostile_config():
    cfg = {}
    for f in ['v4.1-owner-standards.json', 'v4.2-full.json', 'v5.0-full.json']:
        j = json.loads((ROOT / 'tests' / 'fixtures' / 'configs' / f).read_text(encoding='utf-8'))
        for k, v in j.items():
            if isinstance(v, dict) and isinstance(cfg.get(k), dict): cfg[k].update(v)
            elif isinstance(v, list) and isinstance(cfg.get(k), list) and v: cfg[k] = cfg[k] + v
            elif k not in cfg or v: cfg[k] = v
    cfg['fields'] = cfg.get('fields', []) + [
        {'id': 'f_txt', 'label': 'x', 'section': 'capital', 'type': 'txt', 'hint': 'x'},
        {'id': 'f_sel', 'label': 'x', 'section': 'capital', 'type': 'select', 'options': ['x', 'y']}]
    cfg['requests'] = [{'id': 'r_x', 'text': 'x', 'why': 'x'}]
    cfg['checklist'] = cfg.get('checklist', []) + [{'id': 'cl_x', 'text': 'x', 'category': 'x', 'from': 'preseed'}]
    cfg['branding'].update({'kicker': 'x', 'customSectionLabel': 'x', 'pageTitle': 'x', 'subtitle': 'x'})
    cfg['labels'] = {'fields': {'arr_now': 'x'}, 'hints': {'arr_now': 'x'}, 'metrics': {'nrr': 'x'}, 'sections': {'team': 'x'}, 'dims': {'market': 'x'},
                     'patterns': {'new_team': 'x'}, 'gates': {'ip_assignments': 'x'}, 'checklist': {'cl_refs': 'x'}, 'units': {'burn_multiple': 'x'},
                     'stages': {'seed': 'x'}, 'models': {'saas': 'x'}, 'evidence': {'audited': 'x'}, 'calib': {'nrr': 'x'}, 'sdescs': {'seed': 'x'}, 'checks': {'arr_sum': 'x'}}
    cfg = deep_fill(cfg)
    cfg['texts'] = [{'from': 'Seed', 'to': P('cfg.texts.seed')}, {'from': 'Generate report', 'to': P('cfg.texts.btn')}, {'from': 'Library', 'to': P('cfg.texts.lib')}]
    cfg['look'] = {'accent': 'garnet', 'theme': 'light', 'views': ['overview', 'findings', 'revenue', 'questions']}
    return cfg

GH = {'published': None, 'history': []}
async def gh_route(route):
    req = route.request; url = req.url
    if not req.headers.get('authorization', '').endswith(TOKEN): return await route.fulfill(status=401, json={'message': 'Bad credentials'})
    if url.endswith('/user'): return await route.fulfill(status=200, json={'login': 'dsaxel05'})
    if re.search(r'/repos/dsaxel05/VCR2$', url): return await route.fulfill(status=200, json={'full_name': 'dsaxel05/VCR2', 'permissions': {'push': True, 'pull': True}})
    if '/commits?' in url: return await route.fulfill(status=200, json=[{'sha': h['sha'], 'commit': {'message': h['message'], 'author': {'date': '2026-10-11T10:00:00Z', 'name': h['message']}}} for h in GH['history']])
    if '/contents/radar-config.json?ref=' in url and url.split('ref=')[1] != 'main':
        for h in GH['history']:
            if h['sha'] == url.split('ref=')[1]: return await route.fulfill(status=200, json={'sha': h['sha'], 'content': base64.b64encode(h['content'].encode()).decode()})
        return await route.fulfill(status=404, json={})
    if '/contents/radar-config.json' in url and req.method == 'GET':
        return await route.fulfill(status=200, json={'sha': 'sha0', 'path': 'radar-config.json'}) if GH['published'] else await route.fulfill(status=404, json={})
    return await route.fulfill(status=404, json={})

async def ai_route(route):
    body = route.request.post_data or ''
    if 'one row per company' in body:
        text = json.dumps([{'company': P('ai.lib.company'), 'stage': P('ai.lib.stage'), 'model': P('ai.lib.model'), 'nrr': 110, 'arr': 1200000,
                            'outcome': P('ai.lib.outcome'), 'quote': P('ai.lib.quote'), 'source': P('ai.lib.source'), 'notes': P('ai.lib.notes')}])
    elif 'Extract values for the fields' in body:
        ids = re.findall(r'(?m)^([a-z][a-z0-9_]{1,63}): ', json.loads(body).get('messages', [{}])[0].get('content', '') if body.startswith('{') else body)
        obj = {}
        for i, f in enumerate(ids):
            obj[f] = {'value': (P('ai.x.' + f) if i % 3 == 0 else 1000 + i if i % 3 == 1 else True), 'line': P('ai.x.line.' + f)}
        obj[P('ai.x.key')] = {'value': 1, 'line': P('ai.x.badkey')}
        text = json.dumps(obj)
    else:
        text = P('ai.memo') + '\n\n## ' + P('ai.memo.h') + '\n\n- ' + P('ai.memo.li') + ' **' + P('ai.memo.b') + '** [x](javascript:__x(1))'
    await route.fulfill(status=200, json={'content': [{'type': 'text', 'text': text}], 'choices': [{'message': {'content': text}}]})

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs, outside, dialogs = [], [], []

        async def new_page(config=None):
            ctx = await b.new_context(viewport={'width': 1360, 'height': 900})
            await ctx.add_init_script(INIT)
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('dialog', lambda d: (dialogs.append(d.type + ': ' + d.message[:80]), asyncio.ensure_future(d.accept())))
            pg.on('request', lambda r: outside.append(r.url) if not (r.url.startswith(ORIGIN) or r.url.startswith(('data:', 'blob:', 'about:'))) and not any(h in r.url for h in AI_HOSTS + ['api.github.com']) else None)
            await fontroute.install(pg)
            for h in AI_HOSTS: await pg.route(f'https://{h}/**', ai_route)
            await pg.route('https://api.github.com/**', gh_route)
            if config is not None:
                await pg.route(ORIGIN + '/radar-config.json*', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(config)))
            await pg.goto(BASE); await pg.wait_for_selector('#sidebar', state='attached'); await pg.wait_for_timeout(600)
            return ctx, pg

        async def verdict(pg, where):
            await pg.wait_for_timeout(250)
            hits = await pg.evaluate('() => window.__hits.splice(0)')   # each step reports only what ran since the last one
            live = await pg.evaluate(SCAN)
            check(f'{where}: no planted code ran', not hits, sorted(set(hits))[:12])
            check(f'{where}: no live handler, script, frame or javascript: link carries the payload', not live, live[:12])
            return hits, live

        async def deal_flow(pg, where):
            # A shared deal file: hostile company name, every text and choice answer, notes, ledger customer names, a financials column
            prep = await pg.evaluate("() => { " + JS_P + """
              DEMO_NAMES.forEach((_, i) => DEMO_NAMES[i] = P('deal.customer') + ' #' + i);
              loadHalcyon(); S.example = false;
              const kinds = {};
              ALL_FIELDS().forEach(f => { kinds[f.t] = (kinds[f.t] || 0) + 1; if (f.t === 'txt') S.vals[f.id] = P('deal.val.' + f.id); if (f.t === 'select') S.sel[f.id] = P('deal.sel.' + f.id); });
              S.name = P('deal.name'); S.notes = P('deal.notes');
              const pay = draftPayload();
              if (pay.series && pay.series.csv) { const L = pay.series.csv.split('\\n'); L[0] += ',' + JSON.stringify(P('deal.serieshdr')); for (let i = 1; i < L.length; i++) if (L[i].trim()) L[i] += ',1'; pay.series.csv = L.join('\\n'); }
              pay.vals.arr_now = P('deal.num');   /* a number field holding markup is refused, and the refusal is shown */
              window.__dealFile = JSON.stringify({ kind:'vcr2-assessment', v:4, payload:pay });
              S = blankState(); return kinds; }""")
            check(f'{where}: the form has text and choice fields to attack', prep.get('txt', 0) >= 1 and prep.get('select', 0) >= 1, prep)
            await pg.evaluate("() => { window.pickFile = (a, cb) => cb(window.__dealFile); importAssessment(); }")
            await pg.wait_for_timeout(300)
            imported = await pg.evaluate("() => S.name")
            check(f'{where}: the hostile deal file was imported', '__x(' in imported, imported[:60])
            await pg.evaluate("() => { showPage('intake'); try { startSections(); } catch (e) {} }")
            for i in range(12):
                await pg.evaluate(f"() => {{ try {{ jumpTo({i}); }} catch (e) {{}} }}")
            await pg.evaluate("() => { try { goVerify(); showPage('verify'); } catch (e) {} }")
            await pg.evaluate("async () => { const m = $id('memo-toggle'); if (m) m.checked = false; await runAnalysis(); }")
            await pg.wait_for_function("() => S.result && document.querySelector('#rp-overview')", timeout=20000)
            await pg.evaluate("""() => { document.querySelectorAll('.rtabs-more').forEach(d => d.open = true);
              REPORT_VIEWS.forEach(([id]) => { const b = $id('rt-' + id); if (b) b.click(); });
              document.querySelectorAll('details').forEach(d => d.open = true); }""")
            await pg.evaluate("() => { founderEmail(); }"); await pg.wait_for_timeout(150)
            await verdict(pg, where + ', report, every view and the founder email')
            await pg.evaluate("() => { closeModal(); printMemo(); }"); await pg.wait_for_timeout(200)
            await verdict(pg, where + ', printed memo')
            await pg.evaluate("() => { saveRunToLibrary(); goLibrary(); }"); await pg.wait_for_timeout(300)
            await verdict(pg, where + ', library with the saved deal')

        # ---------- 1. visitor surfaces with the built-in configuration ----------
        ctx, pg = await new_page()
        await deal_flow(pg, 'Shared deal file')

        # ledger and financials files: hostile file names, hostile headers, a broken ledger whose error is shown
        await pg.evaluate("() => { " + JS_P + """
          S = blankState(); showPage('intake');
          loadLedgerText('customer,month,mrr\\n' + JSON.stringify(P('led.cust')) + ',2026-01,100\\n' + JSON.stringify(P('led.cust2')) + ',2026-02,200\\nb,2026-03,300\\n', P('led.fname'));
          loadLedgerText(JSON.stringify(P('led.badhdr')) + ',' + JSON.stringify(P('led.badhdr2')) + '\\n' + JSON.stringify(P('led.badrow')) + ',x\\n1,2\\n', P('led.badname'));
          loadSeriesText('month,' + JSON.stringify(P('ser.hdr')) + ',revenue\\n' + JSON.stringify(P('ser.month')) + ',1,2\\n2026-01,1,2\\n', P('ser.fname'));
          S.files = [{ name:P('file.name'), text:'x', size:1 }]; renderFileList(); renderIntakeStatus(); }""")
        await pg.wait_for_timeout(200)
        await verdict(pg, 'Ledger and financials files')

        # the resume card reads the saved draft's name
        await pg.evaluate("() => { " + JS_P + " localStorage.setItem('vcr3-draft-meta', JSON.stringify({ t:Date.now(), name:P('resume.name'), pct:P('resume.pct') })); localStorage.setItem('vcr3-draft', JSON.stringify({ name:P('resume.draft'), vals:{} })); showPage('intro'); }")
        await verdict(pg, 'Resume card')

        # library: a hostile backup and a hostile CSV
        await pg.evaluate("() => { " + JS_P + """
          const e = k => ({ id:'x' + k, company:P('lib.company' + k), stage:P('lib.stage'), model:P('lib.model'), date:P('lib.date'), outcome:P('lib.outcome'),
            notes:P('lib.notes'), metrics:{ nrr:110, arr:1e6, [P('lib.mkey')]:1 }, stated:{ stated_arr:P('lib.stated') }, source:P('lib.source') });
          window.pickFile = (a, cb) => cb(JSON.stringify({ entries:[e(1), e(2)] })); libImportJSON(); goLibrary(); }""")
        await pg.wait_for_timeout(300)
        await verdict(pg, 'Library backup')
        await pg.evaluate("() => { " + JS_P + """
          const csv = 'company,stage,model,nrr,arr,outcome\\n' + [1, 2].map(i => [P('libcsv.company' + i), P('libcsv.stage'), P('libcsv.model'), '110', '1000000', P('libcsv.outcome')].map(v => JSON.stringify(v)).join(',')).join('\\n');
          window.pickFile = (a, cb) => cb(csv); libImportCSV(); }""")
        await pg.wait_for_timeout(300)
        await verdict(pg, 'Library CSV import review')
        await pg.evaluate("() => { const b = document.querySelector('.modal-f .btn-primary'); if (b) b.click(); goLibrary(); }")
        await pg.wait_for_timeout(200)
        await verdict(pg, 'Library after the CSV import')
        await ctx.close()

        # ---------- 2. AI replies (mocked, fake key) ----------
        ctx, pg = await new_page()
        await pg.evaluate("() => { $id('api-provider').value = 'anthropic'; $id('api-provider').dispatchEvent(new Event('change')); }")
        await pg.fill('#api-key', FAKE_KEY)
        await pg.evaluate("() => { $id('intake-deck').value = 'ARR is 4.2 million dollars and net revenue retention is 112 percent. Gross margin 71 percent.'; }")
        await pg.evaluate("async () => { await runExtraction(); }"); await pg.wait_for_timeout(400)
        await pg.evaluate("() => { showPage('intake'); try { startSections(); } catch (e) {} for (let i = 0; i < 12; i++) try { jumpTo(i); } catch (e) {} try { goVerify(); showPage('verify'); } catch (e) {} }")
        await verdict(pg, 'AI figure extraction')
        await pg.evaluate("async () => { loadHalcyon(); S.example = false; const m = $id('memo-toggle'); if (m) { m.checked = true; m.dispatchEvent(new Event('change')); } await runAnalysis(); }")
        await pg.wait_for_function("() => S.result && document.querySelector('#rp-overview')", timeout=20000); await pg.wait_for_timeout(800)
        memo = await pg.evaluate("() => JSON.stringify((S.result && S.result.memo) || null).slice(0, 80)")
        check('AI memo: the mocked narrative reached the report', '__x(' in memo, memo)
        await pg.evaluate("() => { document.querySelectorAll('.rtabs-more').forEach(d => d.open = true); REPORT_VIEWS.forEach(([id]) => { const b = $id('rt-' + id); if (b) b.click(); }); }")
        await verdict(pg, 'AI memo narrative in the report')
        await pg.evaluate("() => printMemo()"); await pg.wait_for_timeout(200)
        await verdict(pg, 'AI memo narrative in the printed memo')
        await pg.evaluate("async () => { const rows = await libAIParse('Acme Corp has 110 percent NRR and 1.2 million ARR as of last month, said the CFO.'); reviewImport(rows, 'AI'); }")
        await pg.wait_for_timeout(300)
        await verdict(pg, 'AI library import review')
        await ctx.close()

        # ---------- 3. a hostile published configuration ----------
        cfg = hostile_config()
        ctx, pg = await new_page(cfg)
        applied = await pg.evaluate("() => [CFG.fields.length, CFG.texts.length, Object.keys(CFG.labels.metrics).length, CFG.questions.length]")
        check('Hostile configuration: it was loaded (custom fields, wording, labels, questions)', applied[0] >= 2 and applied[1] >= 1 and applied[2] >= 1 and applied[3] >= 1, applied)
        await verdict(pg, 'Hostile configuration, start page')
        await deal_flow(pg, 'Hostile configuration with a hostile deal')
        await ctx.close()

        # ---------- 4. the Studio: hostile imported draft, hostile history ----------
        GH['history'] = [{'sha': 'h1', 'message': P('gh.commit'), 'content': json.dumps(cfg)}]
        GH['published'] = json.dumps(cfg)
        ctx, pg = await new_page(cfg)
        await pg.goto(BASE + '#studio'); await pg.wait_for_selector('#gh-token')
        await pg.fill('#gh-token', TOKEN); await pg.click('#gh-signin'); await pg.wait_for_timeout(700)
        signed = await pg.evaluate("() => !!document.querySelector('.studio-tabs')")
        check('Studio: signed in with the fake token (GitHub mocked)', signed)
        await pg.evaluate("(c) => { window.pickFile = (a, cb) => cb(c); importDraft(); }", json.dumps(cfg)); await pg.wait_for_timeout(300)
        tabs = await pg.evaluate("() => STUDIO_GROUPS.flatMap(g => g[1].map(t => t[0]))")
        for t in tabs:
            await pg.evaluate("(t) => { try { studioTab(t); } catch (e) { window.__tabErr = (window.__tabErr || []).concat(t + ': ' + e.message); } }", t)
            await pg.wait_for_timeout(60)
            await pg.evaluate("() => document.querySelectorAll('#page-studio details').forEach(d => d.open = true)")
        await verdict(pg, f'Studio, all {len(tabs)} tabs with a hostile imported draft')
        kinds = ['fields', 'metrics', 'checks', 'gates', 'questions', 'patterns', 'requests', 'checklist', 'benchmarks', 'models', 'dimensions', 'stages']
        opened = 0
        for k in kinds:
            ok = await pg.evaluate("(k) => { try { const n = (ST.draft[k] || []).length; if (!n) return false; studioTab(k); editItem(k, 0); return !!document.querySelector('.modal'); } catch (e) { return false; } }", k)
            opened += 1 if ok else 0
            await pg.wait_for_timeout(80)
            await verdict(pg, f'Studio editor for {k}') if ok else None
            await pg.evaluate("() => { try { closeModal(); } catch (e) {} }")
        check('Studio: editors opened for the hostile items', opened >= 6, opened)
        await pg.evaluate("async () => { try { await openHistory(); } catch (e) {} }"); await pg.wait_for_timeout(500)
        await verdict(pg, 'Studio publish history with a hostile commit message')
        tab_errs = await pg.evaluate("() => window.__tabErr || []")
        check('Studio: every tab rendered without an error', not tab_errs, tab_errs)
        await ctx.close()

        check('no dialog was opened by planted code', not [d for d in dialogs if not d.startswith('confirm')], dialogs)
        check('no request left the site except the mocked GitHub and AI hosts', not outside, outside[:8])
        check('no page errors', not errs, errs[:6])
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')
    sys.exit(1 if bad else 0)

asyncio.run(main())
