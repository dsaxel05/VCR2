"""Smart fill end to end (test plan 7.9): the built index.html opened from file://, 12 files dropped (one of them a zip),
read, reviewed, accepted; the form compared with the gold; undo leaves the form empty again. Keyboard only; phone; dark;
no console error; zero network requests; the longest main-thread block while reading is measured (target 100 ms)."""
import os as _os, sys as _sys, base64, io, json, pathlib, zipfile
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
FX = ROOT / 'tests' / 'fixtures' / 'smartfill'
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))
EXP = json.loads((FX / 'expect.json').read_text(encoding='utf-8'))
FILES = ['deck-pptx.pptx', 'model-openpyxl.xlsx', 'update-eml.eml', 'termsheet-chromium.pdf', 'security-md.md', 'bank-reportlab.pdf', 'deck-html.html', 'crm-tsv.tsv', 'json-json.json', 'update-rtf.rtf', 'model-ods.ods']
def zipped():
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in ['update-docx.docx', 'market-txt.txt', 'captable-xlsm.xlsm']: z.write(FX / f, f'data-room/{f}')
    return b.getvalue()
ADD = "(d) => sfAddFiles(Object.entries(d).map(([n, b]) => new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], n)))"

async def run(b, vp, theme, label):
    ctx = await b.new_context(viewport=vp, color_scheme=theme); pg = await ctx.new_page(); errs, net = [], []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_FILE_NOT_FOUND' not in m.text else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('request', lambda r: net.append(r.url) if r.url.startswith(('http:', 'https:')) else None)
    await pg.goto((ROOT / 'index.html').as_uri()); await pg.wait_for_selector('#api-key', state='attached')
    await pg.evaluate("() => { window.__long = 0; try { new PerformanceObserver(l => l.getEntries().forEach(e => { window.__long = Math.max(window.__long, e.duration); })).observe({ entryTypes:['longtask'] }); } catch (e) {} }")
    await pg.evaluate("() => { CFG.settings.smartfill = { enabled:true }; _sfDict = null; showPage('intake'); renderIntakeStatus(); }")
    data = {f: base64.b64encode((FX / f).read_bytes()).decode() for f in FILES}; data['data-room.zip'] = base64.b64encode(zipped()).decode()
    await pg.evaluate(ADD, data)
    check(f'{label}: 12 files listed (one is a zip)', await pg.evaluate("() => SFS.files.length") == 12)
    if label == 'desktop':   # keyboard only: Tab reaches "Read my documents", Enter starts it
        await pg.evaluate("() => document.activeElement && document.activeElement.blur()")
        for _ in range(200):
            await pg.keyboard.press('Tab')
            if await pg.evaluate("() => document.activeElement && document.activeElement.id === 'sf-read'"): break
        check('keyboard: Tab reaches Read my documents', await pg.evaluate("() => document.activeElement.id") == 'sf-read')
        await pg.keyboard.press('Enter')
    else:
        await pg.click('#sf-read')
    await pg.wait_for_selector('#page-sfreview.active', timeout=60000); await pg.wait_for_timeout(300)
    zipc = await pg.evaluate("() => (SFS.files.find(f => /zip$/.test(f.name)) || {}).children")
    check(f'{label}: the zip expanded into its 3 documents', isinstance(zipc, list) and len(zipc) == 3, zipc and len(zipc))
    long = await pg.evaluate("() => window.__long")
    check(f'{label}: longest main-thread block while reading: ' + (f'{round(long)} ms' if long else 'no task over 50 ms (the long-task floor)') + ' (target 100 ms)', long <= 100, long)
    if label == 'desktop':   # keyboard: the first proposal's box can be unticked with Space, Accept ticked with Enter
        await pg.focus('#sfreview-content input[data-change=sfTickRow]')
        state = "() => sfRowAt(document.activeElement.dataset.a.slice(1)).ticked"
        was = await pg.evaluate(state); await pg.keyboard.press('Space')
        check('keyboard: Space ticks or unticks the focused proposal', await pg.evaluate(state) is (not was), was)
        await pg.keyboard.press('Space')
        await pg.focus('button[data-click=sfAccept][data-a=ticked]'); await pg.keyboard.press('Enter')
    else:
        await pg.click('button[data-click=sfAccept][data-a=ticked] >> nth=0')
    await pg.wait_for_timeout(300)
    rows = await pg.evaluate("() => Object.keys(S.prov).filter(k => S.prov[k].src === 'smartfill').map(k => [k, S.vals[k] ?? S.sel[k] ?? S.bools[k], S.prov[k].file])")
    gold = {}
    for d in EXP['docs']:
        if d['file'] in FILES or d['file'] in ('update-docx.docx', 'market-txt.txt', 'captable-xlsm.xlsm'): gold.setdefault(d['file'], d['fields'])
    def same(v, g):
        try: return abs(float(v) - float(g)) <= max(abs(float(g)) * 0.006, 0.051)
        except (TypeError, ValueError): return str(v).lower() == str(g).lower()
    agree = sum(1 for k, v, f in rows if f in gold and k in gold[f] and same(v, gold[f][k]['value'])); known = sum(1 for k, v, f in rows if f in gold and k in gold[f])
    check(f'{label}: accepted values match the gold ({agree}/{known} of those the gold covers)', known >= 15 and agree / known >= 0.98, [r for r in rows if r[2] in gold and r[0] in gold[r[2]] and not same(r[1], gold[r[2]][r[0]]['value'])][:5])
    await pg.evaluate("() => { showPage('intake'); renderIntakeStatus(); }")
    await pg.click('button[data-click=sfUndoClick]'); await pg.wait_for_timeout(200)
    check(f'{label}: undo leaves the form as it was (empty)', await pg.evaluate("() => Object.keys(S.vals).length + Object.keys(S.sel).length + Object.keys(S.bools).length") == 0)
    check(f'{label}: no console error', not errs, errs[:3])
    check(f'{label}: zero network requests', not net, net[:3])
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await run(b, {'width': 1280, 'height': 900}, 'light', 'desktop')
        await run(b, {'width': 390, 'height': 844}, 'dark', 'phone, dark')
        await b.close()
    n = sum(1 for r in results if r[0]); print(f'{n}/{len(results)} passed')
    _sys.exit(0 if n == len(results) else 1)

asyncio.run(main())
