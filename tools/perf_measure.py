#!/usr/bin/env python3
"""Measure VCR2's load and interaction performance in a real browser and print JSON.

    python tools/perf_measure.py [--label before] [--out perf-before.json] [--cpu 4] [--runs 5]

What it does
- serves the repository root over HTTP with gzip (like GitHub Pages) and a cold cache for every run;
- throttles the CPU (default 4x, a mid-range laptop) and the network (default 10 Mbit/s down, 40 ms RTT);
- records First Contentful Paint, Largest Contentful Paint, long tasks (> 50 ms) and total blocking time while loading;
- times Radar.assess() on the two example companies (median of 15 runs, with the same CPU throttle);
- times the Monte Carlo runway simulation and whether it blocks the main thread;
- interacts (open the report, switch tabs, type in a field) and records the slowest event duration (an INP proxy).
Numbers are medians over --runs loads. Nothing here is estimated: every figure comes from the browser.
"""
import argparse, asyncio, functools, gzip, http.server, io, json, os, pathlib, socket, statistics, threading, time
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent


class GzipHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        path = self.translate_path(self.path.split('?')[0].split('#')[0])
        if os.path.isdir(path):
            path = os.path.join(path, 'index.html')
        if not os.path.isfile(path):
            self.send_error(404); return
        data = open(path, 'rb').read()
        ctype = self.guess_type(path)
        enc = self.headers.get('Accept-Encoding', '')
        textual = ctype.startswith('text/') or 'javascript' in ctype or 'json' in ctype or 'svg' in ctype
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control', 'no-store')
        if textual and 'gzip' in enc:
            data = gzip.compress(data, 6)
            self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(GzipHandler, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


OBSERVE = """
(() => {
  window.__perf = { lcp: 0, fcp: 0, longTasks: [], events: [], shifts: 0 };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.lcp = Math.max(window.__perf.lcp, e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.longTasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.events.push([e.name, Math.round(e.duration)]); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.shifts += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
})();
"""


async def one_load(browser, url, cpu, down, rtt):
    ctx = await browser.new_context(viewport={'width': 1366, 'height': 768})
    pg = await ctx.new_page()
    cdp = await ctx.new_cdp_session(pg)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': rtt, 'downloadThroughput': int(down * 125000), 'uploadThroughput': int(down * 125000 / 4)})
    await cdp.send('Emulation.setCPUThrottlingRate', {'rate': cpu})
    await pg.add_init_script(OBSERVE)
    t0 = time.time()
    await pg.goto(url, wait_until='load')
    await pg.wait_for_timeout(1500)
    nav = await pg.evaluate("""() => { const n = performance.getEntriesByType('navigation')[0]; const r = performance.getEntriesByType('resource');
      return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, transfer: n.transferSize, decoded: n.decodedBodySize, requests: r.length + 1,
               resBytes: r.reduce((a, x) => a + (x.transferSize || 0), 0) }; }""")
    perf = await pg.evaluate("() => window.__perf")
    tbt = sum(max(0, d - 50) for s, d in perf['longTasks'] if s < 5000)
    out = {'fcp': round(perf['fcp']), 'lcp': round(perf['lcp']), 'dcl': round(nav['dcl']), 'load': round(nav['load']), 'transfer_kb': round((nav['transfer'] + nav['resBytes']) / 1024),
           'requests': nav['requests'], 'long_tasks': len(perf['longTasks']), 'longest_task': max([d for s, d in perf['longTasks']] or [0]), 'tbt': round(tbt), 'cls': round(perf['shifts'], 3)}
    await ctx.close()
    return out


async def engine_timings(browser, url, cpu):
    ctx = await browser.new_context(viewport={'width': 1366, 'height': 768})
    pg = await ctx.new_page()
    await pg.goto(url, wait_until='load'); await pg.wait_for_timeout(500)
    cdp = await ctx.new_cdp_session(pg)
    await cdp.send('Emulation.setCPUThrottlingRate', {'rate': cpu})
    res = await pg.evaluate("""() => {
      const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
      const time = (f, n) => { const t = []; f(); for (let i = 0; i < n; i++) { const a = performance.now(); f(); t.push(performance.now() - a); } return { median: Math.round(med(t) * 10) / 10, max: Math.round(Math.max(...t) * 10) / 10 }; };
      const out = {};
      loadNorthwind(); out.northwind_assess = time(() => { _ledgerCache.clear(); assessAll(); }, 15);
      out.northwind_assess_warm = time(() => assessAll(), 15);
      loadHalcyon(); out.halcyon_assess = time(() => { _ledgerCache.clear(); assessAll(); }, 15);
      out.halcyon_assess_warm = time(() => assessAll(), 15);
      const D = derive().D; const run = () => runProjections(D, 'perf');
      out.runway_projection = time(run, 5);
      return out; }""")
    await ctx.close()
    return res


async def interaction(browser, url, cpu):
    ctx = await browser.new_context(viewport={'width': 1366, 'height': 768})
    pg = await ctx.new_page()
    await pg.add_init_script(OBSERVE)
    await pg.goto(url, wait_until='load'); await pg.wait_for_timeout(500)
    cdp = await ctx.new_cdp_session(pg)
    await cdp.send('Emulation.setCPUThrottlingRate', {'rate': cpu})
    await pg.evaluate("() => { loadNorthwind(); S.result = assessAll(); showPage('result'); renderResult(S.result); }")
    await pg.wait_for_timeout(600)
    for tab in ['findings', 'forensics', 'runway', 'deal', 'scoring', 'metrics', 'ledger']:
        b = pg.locator(f'#rt-{tab}')
        if await b.count():
            more = pg.locator('.rtabs-more > summary')   # secondary report views sit behind "More views"
            if not await b.is_visible() and await more.count():
                await more.click()
            await b.click(); await pg.wait_for_timeout(250)
    await pg.evaluate("() => { showPage('intake'); }"); await pg.wait_for_timeout(300)
    inp = pg.locator('input[type=text], input[type=number]').first
    if await inp.count():
        try:
            await inp.click(timeout=2000); await inp.type('123456', delay=20); await pg.wait_for_timeout(400)
        except Exception:
            pass
    await pg.wait_for_timeout(500)
    perf = await pg.evaluate("() => window.__perf")
    ev = perf['events']
    worst = max([d for n, d in ev] or [0])
    await ctx.close()
    return {'events': len(ev), 'worst_event_ms': worst, 'long_tasks_after_load': len(perf['longTasks'])}


def med(xs):
    return statistics.median(xs) if xs else None


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--label', default='run'); ap.add_argument('--out'); ap.add_argument('--cpu', type=float, default=4)
    ap.add_argument('--check', action='store_true'); ap.add_argument('--down', type=float, default=10); ap.add_argument('--rtt', type=int, default=40); ap.add_argument('--runs', type=int, default=5)
    a = ap.parse_args()
    httpd, port = serve()
    url = f'http://127.0.0.1:{port}/index.html'
    async with async_playwright() as p:
        b = await p.chromium.launch()
        loads = [await one_load(b, url, a.cpu, a.down, a.rtt) for _ in range(a.runs)]
        eng = await engine_timings(b, url, a.cpu)
        inter = await interaction(b, url, a.cpu)
        await b.close()
    keys = ['fcp', 'lcp', 'dcl', 'load', 'transfer_kb', 'requests', 'long_tasks', 'longest_task', 'tbt', 'cls']
    out = {'label': a.label, 'conditions': {'cpu_slowdown': a.cpu, 'down_mbit': a.down, 'rtt_ms': a.rtt, 'runs': a.runs, 'gzip': True},
           'load_median': {k: med([l[k] for l in loads]) for k in keys}, 'load_all': loads, 'engine_ms': eng, 'interaction': inter,
           'file_kb': {'index_raw': round((ROOT / 'index.html').stat().st_size / 1024, 1), 'index_gzip': round(len(gzip.compress((ROOT / 'index.html').read_bytes(), 6)) / 1024, 1)}}
    bad = []
    bj = ROOT / 'tools' / 'perf_budget.json'
    if a.check and bj.exists():
        B = json.loads(bj.read_text(encoding='utf-8'))
        key = 'unthrottled' if a.cpu <= 1 else 'throttled'
        lm, eng = out['load_median'], out['engine_ms']
        worst_assess = max(eng[k]['median'] for k in ('northwind_assess', 'halcyon_assess', 'northwind_assess_warm', 'halcyon_assess_warm'))
        limits = B[key]
        pairs = [('lcp_ms', lm['lcp']), ('fcp_ms', lm['fcp']), ('transfer_kb', lm['transfer_kb']), ('longest_task_ms', lm['longest_task']),
                 ('worst_event_ms', out['interaction']['worst_event_ms']), ('assess_ms', worst_assess)]
        for name, val in pairs:
            if name in limits and val is not None and val > limits[name]:
                bad.append(f'{name}: {val} > {limits[name]}')
        out['check'] = {'conditions': key, 'failed': bad}
    text = json.dumps(out, indent=1)
    if a.out:
        pathlib.Path(a.out).write_text(text + '\n', encoding='utf-8')
    print(text)
    if bad:
        print('BUDGET EXCEEDED: ' + '; '.join(bad)); raise SystemExit(1)


if __name__ == '__main__':
    asyncio.run(main())
