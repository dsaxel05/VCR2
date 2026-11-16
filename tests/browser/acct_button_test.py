"""The Sign in button and the sign-in dialog, with the configuration the owner publishes from the Studio.
The page is served over http (the published configuration is not read from a file: address), radar-config.json is answered by
the test, and every other host is aborted, so nothing here can reach a backend.
1. The button appears on its own once the configuration has loaded, and stays hidden with no method switched on.
2. The dialog: one full-width "Continue with ..." button per provider with its mark; Sign in and Create account are two modes,
   never two buttons side by side; the password can be shown and hidden; the rules for a new password are listed before
   typing and ticked while typing; Enter in a field presses the main button; a storage region is already chosen.
3. On a phone (375 px) in the dark theme: no sideways scroll, 44 px tall buttons, text at 4.5:1 contrast at least.
No console error anywhere.
   python tests/browser/acct_button_test.py"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, pathlib, re, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:300]}'))

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

def lum(c):
    v = [int(x) / 255 for x in re.findall(r'\d+', c)[:3]]
    v = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in v]
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
def ratio(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)

ALL = { 'google':{ 'enabled':True }, 'microsoft':{ 'enabled':True }, 'yahoo':{ 'enabled':True }, 'email_link':{ 'enabled':True }, 'email_password':{ 'enabled':True } }
CONTRAST = r"""() => {
  const rgba = s => { const m = s.match(/[\d.]+/g) || [0, 0, 0, 0]; return [+m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3]]; };
  const under = n => {   /* the colour actually behind n: translucent layers blended over the first opaque one */
    const layers = []; let e = n;
    while (e) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } e = e.parentElement; }
    let out = [255, 255, 255];
    for (const c of layers.reverse()) out = out.map((v, i) => c[i] * c[3] + v * (1 - c[3]));
    return 'rgb(' + out.map(Math.round).join(', ') + ')';
  };
  return [...document.querySelectorAll('.acct-lead, .acct-trust p, .acct-field label, .acct-link, .acct-prov span:last-child, .acct-rules li, .acct-or span, .acct-keep')]
    .map(n => [n.className || n.tagName, getComputedStyle(n).color, under(n)]); }"""

async def page(b, base, providers, **kw):
    ctx = await b.new_context(**kw); pg = await ctx.new_page(); errs, offsite = [], []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    async def other(route): offsite.append(route.request.url); await route.abort()
    await ctx.route(lambda u: u.startswith(('http:', 'https:')) and not u.startswith(base), other)
    cfg = { 'settings':{ 'accounts':{ 'providers':providers } } }
    async def config(route): await route.fulfill(status=200, content_type='application/json', body=json.dumps(cfg))
    await ctx.route(lambda u: u.startswith(base) and '/radar-config.json' in u, config)
    await pg.goto(base + 'index.html'); await pg.wait_for_selector('#api-key', state='attached')
    await pg.wait_for_function('() => typeof CFG_READY !== "undefined"'); await pg.evaluate('() => CFG_READY'); await pg.wait_for_timeout(300)
    return ctx, pg, errs, offsite

async def main():
    srv = serve(); base = f'http://127.0.0.1:{srv.server_address[1]}/'
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # 1. the button follows the published configuration
        ctx, pg, errs, off = await page(b, base, { 'email_link':{ 'enabled':True }, 'email_password':{ 'enabled':True } })
        st = await pg.evaluate("() => ({ hidden:document.getElementById('sb-acct').hidden, on:acctProviders().filter(p => p.enabled).map(p => p.id) })")
        check('the published configuration switches on the two email methods', st['on'] == ['email_link', 'email_password'], st)
        check('the Sign in button appears on its own once the configuration has loaded', st['hidden'] is False, st)
        check('no console error, no request leaves this computer', not errs and not off, (errs[:3], off[:3]))
        await ctx.close()
        ctx, pg, errs, _ = await page(b, base, {})
        check('with no method switched on, the Sign in button stays hidden', await pg.evaluate("() => document.getElementById('sb-acct').hidden") is True)
        await ctx.close()

        # 2. the dialog
        ctx, pg, errs, off = await page(b, base, ALL, viewport={ 'width':1280, 'height':900 }, timezone_id='Europe/Paris')
        await pg.evaluate("() => { toggleSidebar(true); }"); await pg.click('#sb-acct-btn'); await pg.wait_for_selector('.modal-auth')
        labels = [t.strip() for t in await pg.locator('.acct-prov > span:last-child').all_text_contents()]
        check('one full-width "Continue with" button per provider, Google first', labels == ['Continue with Google', 'Continue with Microsoft', 'Continue with Yahoo'], labels)
        check('each provider button carries its mark', await pg.locator('.acct-prov .acct-mark svg').count() == 3)
        widths = await pg.evaluate("() => { const b = document.querySelector('.acct-provs').getBoundingClientRect().width; return [...document.querySelectorAll('.acct-prov')].map(x => Math.round(x.getBoundingClientRect().width / b * 100)); }")
        check('provider buttons span the dialog width', widths and min(widths) >= 99, widths)
        check('sign-in mode: one main button, "Sign in", and no Create account button', await pg.locator('.acct-go').all_text_contents() == ['Sign in'] and await pg.locator('[data-click=acctSignUpGo]').count() == 0)
        check('a Forgot password? link sits next to the password label', await pg.locator('.acct-label-row [data-click=acctLinkGo]').text_content() == 'Forgot password?')
        check('a storage region is already chosen from the time zone (Europe for Paris)', await pg.evaluate("() => document.getElementById('acct-region').value") == 'eu')
        check('Keep me signed in is ticked by default', await pg.is_checked('#acct-keep'))
        trust = await pg.locator('.acct-trust').text_content() or ''
        check('the dialog says what is never saved, that it is free, and links the terms', all(x in trust for x in ['Never your uploaded documents', 'no ads and no tracking', 'Terms and privacy']), trust)
        await pg.fill('#acct-pass', 'Secret1234')
        await pg.click('.acct-eye')
        st = await pg.evaluate("() => [document.getElementById('acct-pass').type, document.querySelector('.acct-eye').getAttribute('aria-pressed'), document.querySelector('.acct-eye').getAttribute('aria-label')]")
        check('the eye button shows the password and says so', st == ['text', 'true', 'Hide password'], st)
        await pg.click('.acct-eye')
        st = await pg.evaluate("() => [document.getElementById('acct-pass').type, document.querySelector('.acct-eye').getAttribute('aria-label')]")
        check('a second press hides it again', st == ['password', 'Show password'], st)
        await pg.evaluate("() => { window.__go = 0; document.querySelector('.acct-go').addEventListener('click', e => { window.__go++; e.stopImmediatePropagation(); }, true); }")
        await pg.focus('#acct-pass'); await pg.keyboard.press('Enter')
        check('Enter in the password field presses the main button', await pg.evaluate("() => window.__go") == 1)
        await pg.fill('#acct-email', 'someone@example.test')
        await pg.click('[data-click=acctMode][data-a=signup]'); await pg.wait_for_selector('.acct-rules')
        check('Create a free account switches to the sign-up mode and keeps the email', await pg.evaluate("() => [document.querySelector('.modal-h h3').textContent, document.getElementById('acct-email').value]") == ['Create your VCR2 account', 'someone@example.test'])
        check('sign-up mode: one main button, "Create account", and a link back to Sign in', await pg.locator('.acct-go').all_text_contents() == ['Create account'] and await pg.locator('[data-click=acctMode][data-a=signin]').count() == 1)
        check('the new-password rules are listed before typing, none ticked', await pg.locator('.acct-rules li').count() == 3 and await pg.locator('.acct-rules li.ok').count() == 0)
        await pg.type('#acct-pass', 'abcDEF')
        check('typing ticks the rules already met (letters), not the others', await pg.evaluate("() => [...document.querySelectorAll('.acct-rules li.ok')].map(l => l.dataset.rule)") == ['case'])
        await pg.type('#acct-pass', '1234')
        check('a password meeting all three rules ticks all three', await pg.locator('.acct-rules li.ok').count() == 3)
        check('the new password field asks the browser for a new password, not a saved one', await pg.get_attribute('#acct-pass', 'autocomplete') == 'new-password')
        cols = await pg.evaluate(CONTRAST)
        low = [(c[0], round(ratio(c[1], c[2]), 2)) for c in cols if ratio(c[1], c[2]) < 4.5]
        check('light theme: every text in the dialog has at least 4.5:1 contrast', cols and not low, low)
        check('no console error, no request leaves this computer', not errs and not off, (errs[:3], off[:3]))
        await ctx.close()

        # 3. phone, dark theme
        ctx, pg, errs, off = await page(b, base, ALL, viewport={ 'width':375, 'height':812 }, color_scheme='dark', timezone_id='America/New_York')
        await pg.evaluate("() => { toggleSidebar(true); }"); await pg.wait_for_timeout(400); await pg.click('#sb-acct-btn'); await pg.wait_for_selector('.modal-auth')
        sw = await pg.evaluate("() => [document.documentElement.scrollWidth, innerWidth]")
        hs = await pg.evaluate("() => [...document.querySelectorAll('.acct-prov, .acct-go')].map(b => b.getBoundingClientRect().height)")
        check('phone (375 px): no sideways scroll, buttons at least 44 px tall', sw[0] <= sw[1] and hs and min(hs) >= 44, (sw, hs))
        check('a visitor in New York gets the United States region', await pg.evaluate("() => document.getElementById('acct-region').value") == 'us')
        cols = await pg.evaluate(CONTRAST)
        low = [(c[0], round(ratio(c[1], c[2]), 2)) for c in cols if ratio(c[1], c[2]) < 4.5]
        check('dark theme: every text in the dialog has at least 4.5:1 contrast', cols and not low, low)
        check('phone and dark: no console error, no request leaves this computer', not errs and not off, (errs[:3], off[:3]))
        await ctx.close()
        await b.close()
    srv.shutdown()
    failed = [r for r in results if not r[0]]
    print(f'{len(results) - len(failed)}/{len(results)} passed')
    _sys.exit(1 if failed else 0)

asyncio.run(main())
