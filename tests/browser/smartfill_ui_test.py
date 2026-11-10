"""Smart fill screens in a real browser: hidden until switched on; drop, read, review, accept, badges, report line, undo,
forget; every control labelled; no sideways scroll on a phone; dark theme; the Studio section; no console error and no
request to any other site."""
import os as _os, sys as _sys, base64, pathlib
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio
from playwright.async_api import async_playwright
BASE = _paths.BASE
FX = pathlib.Path(__file__).resolve().parents[1] / 'fixtures' / 'smartfill'
FILES = ['deck-pptx.pptx', 'model-openpyxl.xlsx', 'update-eml.eml', 'termsheet-chromium.pdf', 'security-md.md', 'bank-reportlab.pdf', 'deck-html.html']
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))
ADD = "(d) => sfAddFiles(Object.entries(d).map(([n, b]) => new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], n)))"

async def run(b, vp, theme, label):
    ctx = await b.new_context(viewport=vp, color_scheme=theme); pg = await ctx.new_page(); errs, hosts = [], set()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('request', lambda r: hosts.add(r.url.split('/')[2].split(':')[0]) if r.url.startswith('http') else None)
    await pg.goto(BASE); await pg.wait_for_selector('#api-key', state='attached')
    await pg.evaluate("() => { showPage('intake'); renderIntakeStatus(); }")
    if label == 'desktop':
        check('on by default (S2): the drop zone is on the source material page', await pg.evaluate("() => !!$id('sf-drop')"))
        await pg.evaluate("() => { CFG.settings.smartfill = { enabled:false }; showPage('intake'); renderIntakeStatus(); }")
        check('the owner switch hides it completely: nothing on the source material page', await pg.evaluate("() => $id('sf-intake').innerHTML") == '')
    await pg.evaluate("() => { CFG.settings.smartfill = { enabled:true }; _sfDict = null; showPage('intake'); renderIntakeStatus(); }")
    dz = await pg.evaluate("() => { const d = $id('sf-drop'); return d && [d.getAttribute('role'), d.tabIndex, !!d.getAttribute('aria-describedby'), $id('sf-read').disabled]; }")
    check(f'{label}: the drop zone is a keyboard button with a description; Read is disabled until files are added', dz == ['button', 0, True, True], dz)
    data = {f: base64.b64encode((FX / f).read_bytes()).decode() for f in FILES}
    await pg.evaluate(ADD, data)
    check(f'{label}: one chip per file', await pg.evaluate("() => document.querySelectorAll('.sf-chip').length") == len(FILES))
    await pg.click('#sf-read'); await pg.wait_for_selector('#page-sfreview.active', timeout=30000); await pg.wait_for_timeout(300)
    info = await pg.evaluate("""() => ({ rows:SFS.resolved.rows.length, high:SFS.resolved.rows.filter(r => r.tier === 'High').length,
      ticked:document.querySelectorAll('#sfreview-content input[data-change=sfTickRow]:checked').length,
      medTicked:SFS.resolved.rows.filter(r => r.tier !== 'High' && r.ticked).length,
      unlabelled:[...document.querySelectorAll('#sfreview-content input, #sfreview-content select')].filter(e => !e.labels.length && !e.getAttribute('aria-label')).length,
      sideways:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 })""")
    check(f'{label}: the review lists the proposals; High rows ticked, Medium and Low never', info['rows'] >= 30 and info['ticked'] > 10 and info['medTicked'] == 0, info)
    check(f'{label}: every control on the review page has a label', info['unlabelled'] == 0, info)
    check(f'{label}: no sideways scroll', not info['sideways'], info)
    await pg.select_option('select[data-change=sfView][data-a=tier]', 'High')
    check(f'{label}: the confidence filter works', await pg.evaluate("() => [...document.querySelectorAll('#sfreview-content .sf-row .pill')].every(p => p.textContent === 'High')"))
    await pg.select_option('select[data-change=sfView][data-a=tier]', '')
    await pg.click('button[data-click=sfAccept][data-a=ticked] >> nth=0'); await pg.wait_for_timeout(300)
    after = await pg.evaluate("() => ({ n:Object.keys(S.prov).filter(k => S.prov[k].src === 'smartfill').length, page:document.querySelector('.page.active').id, draft:localStorage.getItem('vcr3-draft') || '' })")
    check(f'{label}: accepting fills the form and goes back to the source material page', after['n'] >= 10 and after['page'] == 'page-intake', {k: v for k, v in after.items() if k != 'draft'})
    check(f'{label}: the draft keeps the source of each value but no document text', 'smartfill' in after['draft'] and 'Summary of Terms' not in after['draft'] and 'Speaker notes' not in after['draft'])
    badge = await pg.evaluate("() => { const id = Object.keys(S.prov).find(k => S.prov[k].src === 'smartfill'); return provBadge(id); }")
    check(f'{label}: a filled field shows a Smart fill badge with its source', 'Smart fill' in badge and '›' in badge, badge)
    if label == 'desktop':
        line = await pg.evaluate("() => { S.vals.arr_now = '1'; return sfReportLine(); }")
        check('the report line counts the filled fields, the documents and the edits', 'filled by Smart fill from' in line and '1 was edited' in line, line)
        await pg.evaluate("() => { S.name = 'Test Co'; S.result = assessAll(); renderResult(S.result); }")
        check('the report shows that line', 'filled by Smart fill from' in await pg.evaluate("() => $id('result-content').textContent"))
        await pg.evaluate("() => { showPage('intake'); renderIntakeStatus(); }")
    await pg.click('button[data-click=sfUndoClick]'); await pg.wait_for_timeout(200)
    check(f'{label}: undo removes every Smart fill value', await pg.evaluate("() => Object.keys(S.prov).filter(k => S.prov[k].src === 'smartfill').length") == 0)
    await pg.click('button[data-click=sfForget]'); await pg.wait_for_timeout(200)
    check(f'{label}: Forget documents drops them from memory', await pg.evaluate("() => SFS.files.length + SFS.extracts.length") == 0)
    if label == 'desktop':
        st = await pg.evaluate("""() => { ST.draft = normalizeConfig({}); const h = paneStSmartfill(); _sfStLabel = 'ARR per employee'; const t = sfStTester(); _sfStLabel = 'Net dollar retention'; const t2 = sfStTester();
          sfStList('arr_now', 'syn', 'annual run rate\\nARR (company definition)'); return [h.includes('Show Smart fill'), h.includes('Label tester'), t, t2, JSON.stringify(ST.draft.settings.smartfill)]; }""")
        check('Studio: the Smart fill section has the master switch and the label tester', st[0] and st[1], st[:2])
        check('Studio: the label tester explains a match and a veto', 'NRR as stated' in st[3] and 'Ruled out' in st[2], st[2:4])
        check('Studio: a label added for a field goes into the draft', 'annual run rate' in st[4], st[4])
    check(f'{label}: no console error', not errs, errs[:3])
    check(f'{label}: no request to any other site', hosts <= {'127.0.0.1', 'localhost'}, hosts)
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
