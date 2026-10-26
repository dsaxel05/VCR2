"""The VCR2 seal logo and the vcr2.app address.

Files present and clean (no outside address, no script), the sidebar mark loads from the site itself, the favicon links resolve,
the link-preview image is the 1280 x 640 one at the address in site.json (https://vcr2.app/), the README opens with the logo,
no document still names the old github.io address, and the logo folders are on the publish allowlist (the deliverables folder and
the CNAME file are not). No request leaves the site.
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys, re, json, pathlib, struct
from playwright.async_api import async_playwright
import fontroute
BASE = _paths.BASE
ROOT = pathlib.Path(__file__).resolve().parents[2]
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:420]}'))

def png_size(p):
    b = p.read_bytes()[:24]
    return struct.unpack('>II', b[16:24]) if b[:8] == b'\x89PNG\r\n\x1a\n' else None

async def main():
    L = ROOT / 'assets' / 'logo'
    svgs = ['seal-compact', 'seal-favicon', 'seal-full', 'logo-light', 'logo-dark', 'social-preview']
    pngs = ['favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'favicon-180.png', 'favicon-512.png', 'favicon.ico', 'seal-compact-256.png', 'seal-full-512.png', 'seal-full-2048.png', 'social-preview-1280x640.png']
    missing = [f'svg/{n}.svg' for n in svgs if not (L / 'svg' / f'{n}.svg').exists()] + [f'png/{n}' for n in pngs if not (L / 'png' / n).exists()]
    check('the logo pack is in assets/logo/svg and assets/logo/png', not missing, missing)
    check('the preview picture from the zip root is not in the project', not list(L.glob('*.png')) and not list(L.glob('VCR2-seal-preview*')), list(L.glob('*')))
    bad = []
    for f in sorted((L / 'svg').glob('*.svg')):
        t = f.read_text(encoding='utf-8')
        urls = [u for u in re.findall(r'(?:href|src)="([^"]+)"|url\(([^)]+)\)', t) for u in u if u and not u.startswith('#') and not u.startswith("'#") and not u.startswith('"#')]
        if re.search(r'<script|<image|@import|<foreignObject', t, re.I) or any(re.match(r'(https?:)?//', u) for u in urls): bad.append(f.name)
    check('the SVG files have no script, embedded image or outside address', not bad, bad)

    sp = ROOT / 'assets' / 'social-preview.png'
    check('assets/social-preview.png is the 1280 x 640 picture from the pack', png_size(sp) == (1280, 640) and sp.read_bytes() == (L / 'png' / 'social-preview-1280x640.png').read_bytes(), png_size(sp))

    site = json.loads((ROOT / 'site.json').read_text(encoding='utf-8'))
    check('site.json says https://vcr2.app/', site.get('url') == 'https://vcr2.app/', site.get('url'))
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    imgs = re.findall(r'<meta (?:property="og:image"|name="twitter:image") content="([^"]+)"', html)
    check('og:image and twitter:image point at vcr2.app', len(imgs) == 2 and all(i == 'https://vcr2.app/assets/social-preview.png' for i in imgs), imgs)
    check('the page names the seal favicons and no data: favicon', 'assets/logo/svg/seal-favicon.svg' in html and 'assets/logo/png/favicon.ico' in html and 'assets/logo/png/favicon-180.png' in html and 'rel="icon" href="data:' not in html)

    old = []
    for f in ['README.md', 'SECURITY.md', 'CHANGELOG.md', 'site.json', 'build.py', 'src/shell.html', 'src/studio.js', 'index.html', 'tools/ship.py'] + [str(p.relative_to(ROOT)).replace('\\', '/') for p in (ROOT / 'docs').glob('*.md')]:
        if (ROOT / f).exists() and 'dsaxel05.github.io' in (ROOT / f).read_text(encoding='utf-8'): old.append(f)   # tools/ship.py is owner-only: not in the public clone
    check('no public file still names dsaxel05.github.io', not old, old)

    readme = (ROOT / 'README.md').read_text(encoding='utf-8').split('\n')
    head = '\n'.join(readme[:8])
    check('the README opens with the logo (light, with the dark variant for dark pages)', 'assets/logo/svg/logo-light.svg' in head and 'assets/logo/svg/logo-dark.svg' in head, head[:200])
    check('and its https://vcr2.app/ link is there', 'https://vcr2.app/' in '\n'.join(readme[:30]))

    if (ROOT / 'tools' / 'public_files.txt').exists():   # the allowlist is an owner-only file: checked in the dev folder, not in the public clone
        al = (ROOT / 'tools' / 'public_files.txt').read_text(encoding='utf-8')
        lines = [l.split('#')[0].strip() for l in al.split('\n')]
        check('the logo folders are on the publish allowlist', 'assets/logo/svg/' in lines and 'assets/logo/png/' in lines, lines[:40])
        check('the deliverables folder and the CNAME file are not', not any(l.startswith('deliverables') or l == 'CNAME' for l in lines))

    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1360, 'height': 900})
        pg = await ctx.new_page()
        errs, outside = [], []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('request', lambda r: outside.append(r.url) if not (r.url.startswith(_paths.ORIGIN) or r.url.startswith(('data:', 'blob:'))) else None)
        await fontroute.install(pg)
        await pg.goto(BASE); await pg.wait_for_selector('#sidebar', state='attached'); await pg.wait_for_timeout(500)
        m = await pg.evaluate("""() => { const i = document.querySelector('.sb-logo-icon img'); return i ? { src: i.getAttribute('src'), w: i.naturalWidth, shown: Math.round(i.getBoundingClientRect().width), alt: i.getAttribute('alt') } : null; }""")
        check('the sidebar mark is the seal, loaded from the site, at a readable size', bool(m) and m['src'].endswith('assets/logo/svg/seal-compact.svg') and m['w'] > 0 and m['shown'] >= 28, m)
        links = await pg.evaluate("() => Array.from(document.querySelectorAll('link[rel=icon], link[rel=apple-touch-icon]')).map(l => l.getAttribute('href'))")
        codes = []
        for h in links:
            codes.append((await ctx.request.get(BASE.rsplit('/', 1)[0] + '/' + h)).status)   # the browser's own favicon loader may hold the .ico, so ask the server directly
        check('every favicon link answers 200 from the site', len(links) >= 3 and all(c == 200 for c in codes), list(zip(links, codes)))
        check('no request left the site and no page errors', not outside and not errs, [outside, errs])
        await ctx.close(); await b.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')
    sys.exit(1 if bad else 0)

asyncio.run(main())
