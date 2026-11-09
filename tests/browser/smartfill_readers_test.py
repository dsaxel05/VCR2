"""Smart fill readers in a real browser: HTML is parsed with DOMParser only (a script inside never runs, hidden elements are
dropped), and every fixture reads in Chromium as it does under Node, with no console error and no request to any other site."""
import os as _os, sys as _sys, json, base64, pathlib
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio
from playwright.async_api import async_playwright
BASE = _paths.BASE
FX = pathlib.Path(__file__).resolve().parents[1] / 'fixtures' / 'smartfill'
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))

READ = """async ([b64, name]) => { const u8 = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const r = await sfReadFile(u8, name);
  const text = r.doc ? r.doc.blocks.map(b => b.text || (b.rows || []).map(x => x.join(' | ')).join('\\n')).join('\\n') : '';
  return { ok:r.ok, kind:r.kind, code:r.code || '', n:r.doc ? r.doc.blocks.length : 0, text, types:r.doc ? [...new Set(r.doc.blocks.map(b => b.type))] : [] }; }"""

async def main():
    exp = json.loads((FX / 'expect.json').read_text(encoding='utf-8'))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(); errs, hosts = [], set()
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('request', lambda r: hosts.add(r.url.split('/')[2].split(':')[0]) if r.url.startswith('http') else None)
        await pg.goto(BASE); await pg.wait_for_selector('#api-key', state='attached')
        title = await pg.title()
        rd = lambda f: pg.evaluate(READ, [base64.b64encode((FX / f).read_bytes()).decode(), f])
        h = await rd('deck-html.html')
        check('an HTML deck is read with DOMParser: headings, label and value pairs, text', h['ok'] and h['kind'] == 'html' and 'heading' in h['types'] and h['n'] >= 5, h)
        s = await rd('adv-script-and-hidden.html')
        check('a script inside a dropped HTML file never runs', await pg.title() == title and await pg.evaluate("document.title") == title)
        check('hidden elements are dropped (the 999 million decoy is not read)', s['ok'] and '999' not in s['text'].replace(',', ''), s['text'][:200])
        check('script and style text are not read as content', 'script ran' not in s['text'] and 'font-size' not in s['text'])
        for d in exp['docs']:
            r = await rd(d['file'])
            check(f"{d['file']}: reads in Chromium", r['ok'] and r['n'] >= 1, r)
        for a in exp['adversarial']:
            r = await rd(a['file'])
            want = 'read' if a['expect'] == 'read' else a['reason']
            check(f"hostile {a['file'][4:44]}: {want}", (r['ok'] and want == 'read') or r['code'] == want, r['code'] or r['kind'])
        check('no console error', not errs, errs[:3])
        check('no request to any other site', hosts <= {'127.0.0.1', 'localhost'}, hosts)
        await b.close()
    n = sum(1 for r in results if r[0]); print(f'{n}/{len(results)} passed')
    _sys.exit(0 if n == len(results) else 1)

asyncio.run(main())
