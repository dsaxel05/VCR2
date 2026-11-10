"""Smart fill in a background thread, in a real Chromium from file://: files are read in the thread (HTML on the page),
the proposals are the same as when everything is read on the page, big files no longer block the page (target: no
main-thread task over 100 ms), "Forget documents" stops the thread, no console error, zero network requests."""
import os as _os, sys as _sys, base64, io, pathlib, zipfile
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
FX = ROOT / 'tests' / 'fixtures' / 'smartfill'
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))
FILES = ['deck-pptx.pptx', 'model-openpyxl.xlsx', 'update-eml.eml', 'termsheet-chromium.pdf', 'security-md.md', 'bank-reportlab.pdf', 'deck-html.html', 'crm-tsv.tsv', 'json-json.json', 'update-rtf.rtf', 'model-ods.ods']
def zipped():
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in ['update-docx.docx', 'market-txt.txt', 'captable-xlsm.xlsm']: z.write(FX / f, f'data-room/{f}')
    return b.getvalue()
ADD = "(d) => sfAddFiles(Object.entries(d).map(([n, b]) => new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], n)))"
# two big files made in the page: a 150,000-row export and a 60,000-line text (each blocked the page for 0.4 to 1.5 s before)
BIG = """() => {
  const a = ['Date,Description,Amount']; for (let i = 0; i < 150000; i++) a.push(`2026-${String(i % 12 + 1).padStart(2, '0')}-${String(i % 28 + 1).padStart(2, '0')},Card payment ${i % 977},${(i % 5000) + 0.5}`);
  const t = []; for (let i = 0; i < 60000; i++) t.push(`Note ${i}: the team met ${i % 97} prospects in region ${i % 13}; review ${i % 7} is planned.`);
  sfAddFiles([new File([a.join('\\n')], 'export-big.csv'), new File([t.join('\\n')], 'notes-big.txt')]);
}"""
CANON = """() => JSON.stringify([SFS.resolved ? SFS.resolved.rows.map(r => [r.field, r.value, r.tier, r.file, r.loc]).sort((a, b) => a[0] < b[0] ? -1 : 1) : null,
  SFS.resolved ? SFS.resolved.conflicts.map(c => c.field).sort() : null, SFS.unmapped.map(u => [u.label, u.raw, u.file])])"""

async def read(pg):
    await pg.wait_for_timeout(300)   # tasks before the click (building the files) are not counted
    await pg.evaluate("() => { window.__long = 0; window.__t0 = performance.now(); }")
    await pg.click('#sf-read'); await pg.wait_for_selector('#page-sfreview.active', timeout=120000); await pg.wait_for_timeout(300)
    return await pg.evaluate("() => window.__long")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1280, 'height': 900}); pg = await ctx.new_page(); errs, net = [], []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_FILE_NOT_FOUND' not in m.text else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('request', lambda r: net.append(r.url) if r.url.startswith(('http:', 'https:')) else None)
        await pg.goto((ROOT / 'index.html').as_uri()); await pg.wait_for_selector('#api-key', state='attached')
        await pg.evaluate("() => { window.__long = 0; new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.startTime >= (window.__t0 || 0)) window.__long = Math.max(window.__long, e.duration); })).observe({ entryTypes:['longtask'] }); }")
        check('Smart fill is on by default (no owner setting), and the owner switch hides it', await pg.evaluate("() => { const d = sfEnabled(); CFG.settings.smartfill = { enabled:false }; const off = !sfEnabled(); delete CFG.settings.smartfill; return d && off; }"))
        start = "() => { CFG.settings.smartfill = { enabled:true }; _sfDict = null; showPage('intake'); renderIntakeStatus(); }"
        data = {f: base64.b64encode((FX / f).read_bytes()).decode() for f in FILES}; data['data-room.zip'] = base64.b64encode(zipped()).decode()

        # 1. twelve files with the thread
        await pg.evaluate(start); await pg.evaluate(ADD, data); await read(pg)
        where = await pg.evaluate("() => SFS.files.map(f => [f.name, !!f.inWorker])")
        check('the thread started from a Blob URL (the policy allows worker-src blob:)', await pg.evaluate("() => !!_sfW && !_sfWBroken"))
        check('every file but the HTML page was read in the thread', all(w == (not n.endswith('.html')) for n, w in where), where)
        with_thread = await pg.evaluate(CANON)
        check('values were proposed', with_thread.count('"') > 200, len(with_thread))
        await pg.evaluate("() => sfForget()")
        check('Forget documents stops the thread (everything it read is dropped)', await pg.evaluate("() => _sfW === null && SFS.files.length === 0"))

        # 2. the same twelve files with everything read on the page: the same proposals
        await pg.evaluate("() => { _sfWBroken = true; }"); await pg.evaluate(start); await pg.evaluate(ADD, data); await read(pg)
        check('read on the page instead (a thread that cannot start): every file still read', await pg.evaluate("() => SFS.files.every(f => !f.inWorker && f.res)"))
        check('the thread and the page give the same proposals, conflicts and unmatched numbers', await pg.evaluate(CANON) == with_thread)

        # 3. two big files: on the page, then in the thread
        await pg.evaluate("() => sfForget()"); await pg.evaluate(start); await pg.evaluate(BIG)
        on_page = await read(pg); page_canon = await pg.evaluate(CANON)
        await pg.evaluate("() => { sfForget(); _sfWBroken = false; }"); await pg.evaluate(start); await pg.evaluate(BIG)
        in_thread = await read(pg)
        check(f'big files: longest main-thread block {round(in_thread)} ms with the thread (on the page: {round(on_page)} ms; target 100 ms)', in_thread <= 100, [in_thread, on_page])
        check('big files: the same result in the thread as on the page', await pg.evaluate(CANON) == page_canon)
        check('big files were read in the thread', await pg.evaluate("() => SFS.files.every(f => f.inWorker)"))

        check('no console error', not errs, errs[:3])
        check('zero network requests', not net, net[:3])
        await b.close()
    n = sum(1 for r in results if r[0]); print(f'{n}/{len(results)} passed')
    _sys.exit(0 if n == len(results) else 1)

asyncio.run(main())
