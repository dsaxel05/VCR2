"""The demo video on the home page.

Files: the MP4 is H.264 and AAC, built for streaming (the index comes before the data), within the size budget; the captions are
a valid WebVTT file; the poster is 1280 by 720. Page: the video is only fetched after play is pressed (preload none, no autoplay,
nothing downloaded on load), it has a poster, a captions track and an accessible name; a big play button and a "Watch the demo"
button start it; a video that cannot be loaded is reported in plain words and the play button comes back; the layout fits a
phone. Playback: in a browser that can decode H.264 the video really plays and the captions show at the right moments (the
test browser that ships with Playwright cannot decode H.264, so there those checks are skipped and a NOTE says so; to run them
use an installed Edge or Chrome: set VCR2_BROWSER_CHANNEL=msedge). No request leaves the site.
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys, re, struct, pathlib, os
from playwright.async_api import async_playwright
import fontroute
BASE = _paths.BASE
ORIGIN = _paths.ORIGIN
ROOT = pathlib.Path(__file__).resolve().parents[2]
V = ROOT / 'assets' / 'video'
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:500]}'))

def mp4_boxes(b):
    i, out = 0, []
    while i + 8 <= len(b):
        size, typ = struct.unpack('>I4s', b[i:i + 8])
        hdr = 8
        if size == 1: size = struct.unpack('>Q', b[i + 8:i + 16])[0]; hdr = 16
        if size == 0: size = len(b) - i
        out.append((typ.decode('latin1'), i, size))
        if size < hdr: break
        i += size
    return out

def static_checks():
    mp4, vtt, jpg = V / 'vcr2-demo-en.mp4', V / 'vcr2-demo-en.vtt', V / 'vcr2-demo-poster.jpg'
    check('the demo files are in assets/video', mp4.exists() and vtt.exists() and jpg.exists(), [p.name for p in V.glob('*')])
    b = mp4.read_bytes()
    boxes = mp4_boxes(b)
    names = [x[0] for x in boxes]
    check('the video is an MP4 built for streaming (the index comes before the data)', names[0] == 'ftyp' and 'moov' in names and 'mdat' in names and names.index('moov') < names.index('mdat'), names)
    moov = next(x for x in boxes if x[0] == 'moov'); mb = b[moov[1]:moov[1] + moov[2]]
    check('it is H.264 video with AAC audio (plays in every browser)', b'avc1' in mb and b'mp4a' in mb and b'hvc1' not in mb and b'vp09' not in mb)
    check('it is within the size budget for the video folder (30 MB)', sum(p.stat().st_size for p in V.glob('*')) <= 30720 * 1024, sum(p.stat().st_size for p in V.glob('*')))
    t = vtt.read_text(encoding='utf-8')
    cues = re.findall(r'(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})', t)
    sec = lambda s: int(s[:2]) * 3600 + int(s[3:5]) * 60 + float(s[6:])
    check('the captions are a WebVTT file with 25 or more cues, in order, each ending after it starts', t.startswith('WEBVTT') and len(cues) >= 25 and all(sec(a) < sec(e) for a, e in cues) and [sec(a) for a, _ in cues] == sorted(sec(a) for a, _ in cues), len(cues))
    check('and no cue holds a dash used as punctuation', not re.search(r'[\u2013\u2014]| - ', t))
    head = jpg.read_bytes()[:3]
    from struct import unpack
    d = jpg.read_bytes(); i = 2; size = None
    while i < len(d):
        if d[i] != 0xFF: break
        m = d[i + 1]; ln = unpack('>H', d[i + 2:i + 4])[0]
        if m in (0xC0, 0xC1, 0xC2): size = unpack('>HH', d[i + 5:i + 9])[::-1]; break
        i += 2 + ln
    check('the poster is a 1280 by 720 JPEG under 200 KB', head == b'\xff\xd8\xff' and size == (1280, 720) and len(d) < 200 * 1024, [size, len(d)])

async def launch(p):
    chan = os.environ.get('VCR2_BROWSER_CHANNEL')
    if chan:
        try: return await p.chromium.launch(channel=chan, args=['--autoplay-policy=no-user-gesture-required'])
        except Exception as e: print('NOTE: could not start', chan, '-', str(e)[:80])
    return await p.chromium.launch()

async def main():
    static_checks()
    async with async_playwright() as p:
        b = await launch(p)
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
        await ctx.add_init_script("window.__plays = 0; const o = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__plays++; return o.apply(this, arguments); };")
        pg = await ctx.new_page(); errs, reqs, outside = [], [], []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('request', lambda r: (reqs.append(r.url), outside.append(r.url) if not (r.url.startswith(ORIGIN) or r.url.startswith(('data:', 'blob:', 'about:'))) else None))
        await fontroute.install(pg)
        data = (V / 'vcr2-demo-en.mp4').read_bytes()
        async def serve_mp4(route):     # like real hosting: honours "send me this part" (Range) requests, so seeking works
            rg = re.match(r'bytes=(\d+)-(\d*)', route.request.headers.get('range', ''))
            if rg:
                a = int(rg.group(1)); e = min(int(rg.group(2)) if rg.group(2) else len(data) - 1, len(data) - 1)
                return await route.fulfill(status=206, headers={'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': f'bytes {a}-{e}/{len(data)}'}, body=data[a:e + 1])
            await route.fulfill(status=200, headers={'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes'}, body=data)
        await pg.route('**/vcr2-demo-en.mp4', serve_mp4)
        await pg.goto(BASE); await pg.wait_for_selector('#demo-video', state='attached'); await pg.wait_for_timeout(1500)
        info = await pg.evaluate("""() => { const v = document.getElementById('demo-video'), t = v.querySelector('track'), s = v.querySelector('source');
          return { controls: v.controls, preload: v.getAttribute('preload'), autoplay: v.hasAttribute('autoplay'), loop: v.hasAttribute('loop'), muted: v.hasAttribute('muted'),
                   poster: v.getAttribute('poster'), label: v.getAttribute('aria-label'), kind: t && t.kind, lang: t && t.srclang, src: s && s.getAttribute('src'), type: s && s.type,
                   section: !!document.querySelector('#page-intro .demo'), h2: (document.querySelector('.demo h2') || {}).textContent }; }""")
        check('the home page has a demo section with a heading', info['section'] and info['h2'], info)
        check('the video has controls, no autoplay, no loop, no hidden sound-off', info['controls'] and not info['autoplay'] and not info['loop'] and not info['muted'], info)
        check('it fetches nothing until play is pressed (preload none) and has a poster', info['preload'] == 'none' and (info['poster'] or '').endswith('vcr2-demo-poster.jpg'), info)
        check('it has an accessible name, an English captions track and an MP4 source on this site', 'demo video' in (info['label'] or '') and info['kind'] == 'captions' and info['lang'] == 'en' and (info['src'] or '').startswith('assets/video/') and info['type'] == 'video/mp4', info)
        check('nothing was downloaded from the video before play (not the MP4, not the captions)', not [u for u in reqs if u.endswith(('.mp4', '.vtt'))], [u for u in reqs if u.endswith(('.mp4', '.vtt'))])
        check('the poster loaded', any(u.endswith('vcr2-demo-poster.jpg') for u in reqs))
        play = await pg.evaluate("() => { const b = document.getElementById('demo-play'); const r = b.getBoundingClientRect(); const v = document.getElementById('demo-video').getBoundingClientRect(); return { name: b.getAttribute('aria-label'), shown: r.width > 0, inside: r.top >= v.top && r.bottom <= v.bottom, w: Math.round(v.width), h: Math.round(v.height) }; }")
        check('a play button with a name sits on the poster, and the video is 16:9 and no wider than 62 rem', play['shown'] and play['inside'] and 'Play the demo video' in play['name'] and abs(play['h'] - play['w'] * 9 / 16) <= 2 and play['w'] <= 62 * 16 + 2, play)
        order = await pg.evaluate("() => { const h = document.querySelector('#page-intro .hero').getBoundingClientRect(), d = document.querySelector('#page-intro .demo').getBoundingClientRect(), s = document.querySelector('#page-intro .intro-stats').getBoundingClientRect(); return [h.bottom <= d.top + 1, d.bottom <= s.top + 1]; }")
        check('the section sits between the hero and the figures row', order == [True, True], order)
        await pg.focus('#demo-play'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
        plays = await pg.evaluate("() => window.__plays")
        check('the play button works from the keyboard (Enter)', plays >= 1, plays)
        reqs_after = [u for u in reqs if u.endswith('.mp4')]
        check('after play the video is requested from this site', bool(reqs_after) and all(u.startswith(ORIGIN) for u in reqs_after), reqs_after)

        # the hero button scrolls to the video and plays it
        await pg.evaluate("() => { document.getElementById('demo-video').pause(); window.scrollTo(0, 0); }"); await pg.wait_for_timeout(300)
        n0 = await pg.evaluate("() => window.__plays")
        await pg.click('button[onclick="watchDemo()"]'); await pg.wait_for_timeout(600)
        st = await pg.evaluate("() => { const r = document.getElementById('demo-video').getBoundingClientRect(); return { plays: window.__plays, inView: r.top >= 0 && r.bottom <= innerHeight + 2 || (r.top < innerHeight && r.bottom > 0 && r.height > innerHeight * 0.5) }; }")
        check('"Watch the demo" scrolls to the video and starts it', st['plays'] > n0 and st['inView'], [n0, st])

        # playback and captions, where the browser can decode H.264
        can = await pg.evaluate("() => document.createElement('video').canPlayType('video/mp4; codecs=\"avc1.64001F, mp4a.40.2\"')")
        if can:
            await pg.evaluate("() => { const v = document.getElementById('demo-video'); v.currentTime = 0; v.play(); }")
            try:
                await pg.wait_for_function("() => { const v = document.getElementById('demo-video'); return !v.paused && v.currentTime > 1.0 && v.videoWidth === 1920; }", timeout=20000); ok = True
            except Exception: ok = False
            check('it really plays: 1920 by 1080, time moves on', ok, await pg.evaluate("() => { const v = document.getElementById('demo-video'); return [v.paused, v.currentTime, v.videoWidth, v.error && v.error.code]; }"))
            check('the big play button hides while it plays', not await pg.evaluate("() => getComputedStyle(document.getElementById('demo-play')).display !== 'none'"))
            dur = await pg.evaluate("() => document.getElementById('demo-video').duration")
            check('its length is 2 min 43 s, as the page says', abs(dur - 162.97) < 0.5, dur)
            await pg.evaluate("() => { const v = document.getElementById('demo-video'); v.pause(); v.textTracks[0].mode = 'hidden'; }")
            try: await pg.wait_for_function("() => document.getElementById('demo-video').textTracks[0].cues && document.getElementById('demo-video').textTracks[0].cues.length >= 25", timeout=10000); ok = True
            except Exception: ok = False
            check('the captions load (25 or more cues)', ok)
            for t, word in [(2, 'startup deck'), (32, '98.8%'), (160, 'vcr2.app')]:
                await pg.evaluate("t => { const v = document.getElementById('demo-video'); v.currentTime = t; }", t)
                try:
                    await pg.wait_for_function("w => { const c = document.getElementById('demo-video').textTracks[0].activeCues; return c && Array.from(c).some(x => x.text.includes(w)); }", arg=word, timeout=8000); ok = True
                except Exception: ok = False
                check(f'at {t} s the caption on screen says "{word}"', ok)
        else:
            print('NOTE: this browser cannot decode H.264, so playback and caption timing were not run here (run with VCR2_BROWSER_CHANNEL=msedge or chrome)')
        check('no request left the site and no page errors', not outside and not errs, [outside, errs])
        await ctx.close()

        # a video that cannot be loaded is reported, and the play button comes back
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        pg = await ctx.new_page(); await fontroute.install(pg)
        await pg.route('**/vcr2-demo-en.mp4', lambda r: r.fulfill(status=404, body='not found'))
        await pg.goto(BASE); await pg.wait_for_selector('#demo-play'); await pg.wait_for_timeout(600)
        await pg.click('#demo-play')
        try: await pg.wait_for_function("() => /could not be loaded/.test(document.getElementById('toast').textContent)", timeout=10000); ok = True
        except Exception: ok = False
        back = await pg.evaluate("() => [document.querySelector('.demo-frame').classList.contains('is-started'), getComputedStyle(document.getElementById('demo-play')).display, document.getElementById('toast').className]")
        check('a missing video is reported in plain words (with the way to download it)', ok and 'err' in back[2], back)
        check('and the play button is back so the visitor can try again', back[0] is False and back[1] != 'none', back)
        await ctx.close()

        # phone: nothing sideways, the video fills the width, the button is smaller
        ctx = await b.new_context(viewport={'width': 390, 'height': 800})
        pg = await ctx.new_page(); await fontroute.install(pg)
        await pg.goto(BASE); await pg.wait_for_selector('#demo-play'); await pg.wait_for_timeout(800)
        ph = await pg.evaluate("() => { const v = document.getElementById('demo-video').getBoundingClientRect(), b = document.querySelector('#demo-play span').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, vw: Math.round(v.width), vh: Math.round(v.height), btn: Math.round(b.width) }; }")
        check('phone: no sideways scroll, the video fills the width at 16:9, the play button is 60 px', ph['sw'] <= 392 and ph['vw'] >= 340 and abs(ph['vh'] - ph['vw'] * 9 / 16) <= 2 and ph['btn'] == 60, ph)
        await ctx.close(); await b.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')
    sys.exit(1 if bad else 0)

asyncio.run(main())
