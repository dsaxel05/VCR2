"""The Sign in button follows the published configuration, which arrives after start-up.
The page is served over http (the published configuration is not read from a file: address), radar-config.json is answered by
the test with the sign-in methods the owner switched on in the Studio, and every other host is aborted. The button must appear
on its own, without any call from the test; with no method switched on it must stay hidden. No console error.
   python tests/browser/acct_button_test.py"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, pathlib, threading, functools
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

async def run(b, base, providers):
    ctx = await b.new_context(); pg = await ctx.new_page(); errs, offsite = [], []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    async def other(route): offsite.append(route.request.url); await route.abort()
    await ctx.route(lambda u: u.startswith(('http:', 'https:')) and not u.startswith(base), other)
    cfg = { 'settings':{ 'accounts':{ 'providers':providers } } }
    async def config(route): await route.fulfill(status=200, content_type='application/json', body=json.dumps(cfg))
    await ctx.route(lambda u: u.startswith(base) and '/radar-config.json' in u, config)
    await pg.goto(base + 'index.html'); await pg.wait_for_selector('#api-key', state='attached')
    await pg.wait_for_function('() => typeof CFG_READY !== "undefined"'); await pg.evaluate('() => CFG_READY'); await pg.wait_for_timeout(300)
    state = await pg.evaluate("() => ({ hidden:document.getElementById('sb-acct').hidden, on:acctProviders().filter(p => p.enabled).map(p => p.id) })")
    await ctx.close()
    return state, errs, offsite

async def main():
    srv = serve(); base = f'http://127.0.0.1:{srv.server_address[1]}/'
    async with async_playwright() as p:
        b = await p.chromium.launch()
        on = { 'email_link':{ 'enabled':True }, 'email_password':{ 'enabled':True } }
        st, errs, off = await run(b, base, on)
        check('the published configuration switches on the two email methods', st['on'] == ['email_link', 'email_password'], st)
        check('the Sign in button appears on its own once the configuration has loaded', st['hidden'] is False, st)
        check('no console error', not errs, errs[:3])
        check('no request leaves this computer', not off, off[:3])
        st, errs, _ = await run(b, base, {})
        check('with no method switched on, the Sign in button stays hidden', st['hidden'] is True and st['on'] == [], st)
        check('no console error with no method', not errs, errs[:3])
        await b.close()
    srv.shutdown()
    failed = [r for r in results if not r[0]]
    print(f'{len(results) - len(failed)}/{len(results)} passed')
    _sys.exit(1 if failed else 0)

asyncio.run(main())
