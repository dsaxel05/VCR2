"""Autosave never loses progress, an example never replaces a draft, and "Reset all inputs" clears everything it says it clears.

Covers: (1) fill the form, reload, the data is still there; (2) open an example while a real draft exists, leave it, the real
draft is intact; (3) Reset all inputs, reload, everything is blank and no Continue card appears; (4) the library, the theme and
the text size (and the AI key) are untouched by a reset. A running simulation must not bring a report back after a reset.
All keys are fake and nothing leaves the page.
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, sys, re, json
from playwright.async_api import async_playwright
import fontroute
BASE = _paths.BASE
FAKE_KEY = 'sk-' + 'A' * 40
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:360]}'))

INIT = """
(() => {
  const Real = window.Worker; if (!Real) return;
  window.Worker = class {
    constructor(u) { this._w = new Real(u); this.onmessage = null; this.onerror = null;
      this._w.onmessage = e => { if (window.__simDelay === Infinity) return; setTimeout(() => { if (this.onmessage) this.onmessage(e); }, window.__simDelay || 0); };
      this._w.onerror = e => { if (this.onerror) this.onerror(e); }; }
    postMessage(m) { this._w.postMessage(m); } terminate() { this._w.terminate(); }
  };
})();
"""

async def fresh(b, dialogs=None):
    ctx = await b.new_context(viewport={'width': 1360, 'height': 900})
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def on_dialog(d):
        if dialogs is not None: dialogs.append(d.message)
        asyncio.ensure_future(d.accept())
    pg.on('dialog', on_dialog)
    await pg.add_init_script(INIT)
    await fontroute.install(pg)
    await pg.goto(BASE); await pg.wait_for_selector('#sidebar', state='attached')
    return ctx, pg, errs

async def type_a_draft(pg):
    await pg.evaluate("() => { showPage('setup'); }")
    await pg.fill('#cname', 'Acme Test Co')
    await pg.evaluate("() => { startSections(); }")
    await pg.wait_for_selector('#section-content .field-inp')
    ins = await pg.query_selector_all('#section-content .field-inp')
    await ins[0].fill('1200000'); await ins[1].fill('45')
    await pg.wait_for_timeout(400)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()

        # 1. fill the form, reload, it is still there; the home page offers Continue and does not jump
        ctx, pg, errs = await fresh(b)
        await type_a_draft(pg)
        before = await pg.evaluate("() => ({ draft: localStorage.getItem('vcr3-draft'), name: S.name, vals: Object.assign({}, S.vals) })")
        await pg.reload(); await pg.wait_for_selector('#sidebar', state='attached'); await pg.wait_for_timeout(300)
        after = await pg.evaluate("() => ({ name: S.name, vals: Object.assign({}, S.vals), page: document.querySelector('.page.active').id, saved: ($id('tb-saved') || {}).textContent || '' })")
        check('typed data survives a reload', after['name'] == 'Acme Test Co' and after['vals'] == before['vals'] and len(after['vals']) >= 2, [before['vals'], after])
        check('the home page is shown after the reload, with no automatic jump', after['page'] == 'page-intro', after['page'])
        card = re.sub(r'\s+', ' ', await pg.evaluate("() => ($id('resume-card') || {}).textContent || ''"))
        vis = await pg.evaluate("() => { const c = $id('resume-card'); return !!c && !c.hidden && c.getBoundingClientRect().height > 0; }")
        check('a "Continue your assessment" card shows the company name, how much is filled and when it was last edited',
              vis and 'Continue your assessment' in card and 'Acme Test Co' in card and re.search(r'\d+% of the form filled', card) and 'last edited' in card.lower(), card)
        check('the card is the primary action and has "Reset all inputs" next to it',
              await pg.evaluate("() => { const c = $id('resume-card'); return !!c && !!c.querySelector('.btn-primary') && /Reset all inputs/.test(c.textContent); }"))
        await ctx.close()

        # 2. an example never touches the saved draft
        ctx, pg, errs = await fresh(b)
        await type_a_draft(pg)
        draft0 = await pg.evaluate("() => localStorage.getItem('vcr3-draft')")
        meta0 = await pg.evaluate("() => localStorage.getItem('vcr3-draft-meta')")
        await pg.evaluate("() => showPage('intro')")
        await pg.click("text=Open the Series A example"); await pg.wait_for_timeout(500)
        st = await pg.evaluate("() => ({ name: S.name, draft: localStorage.getItem('vcr3-draft'), meta: localStorage.getItem('vcr3-draft-meta'), note: ($id('example-note') || {}).textContent || '', noteVisible: !!$id('example-note') && !$id('example-note').hidden, saved: ($id('tb-saved') || {}).textContent || '' })")
        check('opening an example leaves the saved draft byte for byte as it was', st['draft'] == draft0 and st['meta'] == meta0, [st['draft'] == draft0, st['meta'] == meta0])
        check('the example is open, with a clear "Example data, not saved" note', st['name'] == 'Northwind Data' and st['noteVisible'] and 'Example data, not saved' in st['note'], st)
        ins = await pg.query_selector_all('#section-content .field-inp')
        await ins[0].fill('999'); await pg.wait_for_timeout(300)
        draft1 = await pg.evaluate("() => localStorage.getItem('vcr3-draft')")
        check('editing the example does not write the draft either', draft1 == draft0)
        await pg.reload(); await pg.wait_for_selector('#sidebar', state='attached'); await pg.wait_for_timeout(300)
        st2 = await pg.evaluate("() => ({ name: S.name, note: !!$id('example-note') && !$id('example-note').hidden })")
        check('after a reload the example is gone and the real draft is back', st2['name'] == 'Acme Test Co' and not st2['note'], st2)
        # leave the example by going home, without reloading
        await pg.click("text=Open the Series A example"); await pg.wait_for_timeout(300)
        await pg.click('#sidebar .sb-logo-row'); await pg.wait_for_timeout(300)
        st3 = await pg.evaluate("() => ({ name: S.name, example: !!S.example, note: !!$id('example-note') && !$id('example-note').hidden, page: document.querySelector('.page.active').id, card: ($id('resume-card') || {}).textContent || '' })")
        check('leaving the example restores the real draft in the app', st3['name'] == 'Acme Test Co' and not st3['example'] and not st3['note'] and st3['page'] == 'page-intro', st3)
        check('and the Continue card names it', 'Acme Test Co' in re.sub(r'\s+', ' ', st3['card']))
        await pg.click('#resume-card .btn-primary'); await pg.wait_for_timeout(400)
        st4 = await pg.evaluate("() => ({ page: document.querySelector('.page.active').id, v: Object.keys(S.vals).length, first: ($id('section-content').querySelector('.field-inp') || {}).value })")
        check('Continue opens the form with the typed values', st4['page'] == 'page-section' and st4['v'] >= 2 and st4['first'] == '1200000', st4)
        await ctx.close()

        # 2b. an example with no draft saves nothing at all
        ctx, pg, errs = await fresh(b)
        await pg.click("text=Open the Series A example"); await pg.wait_for_timeout(400)
        keys = await pg.evaluate("() => Object.keys(localStorage).filter(k => /^vcr3-draft/.test(k))")
        check('an example with no draft writes no draft', keys == [], keys)
        await ctx.close()

        # 3. Reset all inputs from the home page
        dialogs = []
        ctx, pg, errs = await fresh(b, dialogs)
        await type_a_draft(pg)
        await pg.evaluate("""(k) => { localStorage.setItem('vcr4-memo', '1'); sessionStorage.setItem('vcr3-key', k); }""", FAKE_KEY)
        await pg.evaluate("() => { S.notes = 'a note'; S.assume = { growth: 0.5 }; S.files.push({ name: 'deck.txt', text: 'x' }); renderFileList(); saveDraft(); }")
        await pg.evaluate("() => showPage('intro')"); await pg.wait_for_timeout(200)
        await pg.click('#resume-card >> text=Reset all inputs'); await pg.wait_for_timeout(500)
        msg = re.sub(r'\s+', ' ', dialogs[-1] if dialogs else '')
        need = ['all inputs', 'uploaded ledger and financials', 'notes', 'assumptions', 'report in progress', 'saved draft', 'library', 'Studio settings', 'theme', 'text size', 'AI key']
        check('the confirmation names exactly what is deleted and what is not touched', all(n in msg for n in need), [n for n in need if n not in msg])
        blank = await pg.evaluate("""() => ({ name: S.name, vals: Object.keys(S.vals).length, notes: S.notes, assume: Object.keys(S.assume).length, files: S.files.length, result: S.result, ledger: S.ledger, series: S.series,
            ls: Object.keys(localStorage).filter(k => /^(vcr3-draft|vcr4-memo)/.test(k)), cname: $id('cname').value, asof: $id('asof').value,
            ta: Array.from(document.querySelectorAll('#page-intake textarea, #page-setup input')).filter(e => e.type !== 'file' && e.value !== '').length,
            filelist: $id('file-list').textContent.trim(), pct: $id('pct-val').textContent, company: $id('tb-company').textContent, card: !!$id('resume-card') && !$id('resume-card').hidden,
            page: document.querySelector('.page.active').id, saved: ($id('tb-saved') || {}).textContent || '', simJobs: _simJobs.size, section: S.section, navActive: document.querySelectorAll('#sb-nav .nav-item.active').length })""")
        check('state is blank after the reset', blank['name'] == '' and blank['vals'] == 0 and blank['notes'] == '' and blank['assume'] == 0 and blank['files'] == 0 and blank['result'] is None and blank['ledger'] is None and blank['series'] is None, blank)
        check('the draft keys are gone from this browser', blank['ls'] == [], blank['ls'])
        check('form fields, file list, progress bar and top bar are blank', blank['cname'] == '' and blank['asof'] == '' and blank['ta'] == 0 and blank['filelist'] == '' and blank['pct'] == '0%' and blank['company'] == 'New assessment', blank)
        check('the Continue card is hidden and the home page is shown', not blank['card'] and blank['page'] == 'page-intro', blank)
        check('nothing is running: no simulation job is left', blank['simJobs'] == 0, blank['simJobs'])
        key = await pg.evaluate("() => sessionStorage.getItem('vcr3-key')")
        check('the AI key is not touched', key == FAKE_KEY)
        await pg.reload(); await pg.wait_for_selector('#sidebar', state='attached'); await pg.wait_for_timeout(300)
        rl = await pg.evaluate("() => ({ name: S.name, vals: Object.keys(S.vals).length, card: !!$id('resume-card') && !$id('resume-card').hidden, resume: !!$id('resume-btn') && $id('resume-btn').style.display !== 'none', pct: $id('pct-val').textContent })")
        check('after a reload everything is still blank and no Continue card appears', rl['name'] == '' and rl['vals'] == 0 and not rl['card'] and not rl['resume'] and rl['pct'] == '0%', rl)
        await ctx.close()

        # 3b. Reset from inside the assessment (sidebar) with a report and a running simulation
        dialogs = []
        ctx, pg, errs = await fresh(b, dialogs)
        await pg.evaluate("() => { window.__simDelay = Infinity; }")
        await pg.click("text=Open the Series A example"); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { loadHalcyon(); S.example = false; buildNav(); window.__go = runAnalysis(); }")
        await pg.wait_for_timeout(900)           # past the loading steps; the worker never answers
        pending = await pg.evaluate("() => _simJobs.size")
        await pg.click('#sidebar >> text=Reset all inputs'); await pg.wait_for_timeout(300)
        await pg.wait_for_timeout(2500)
        after = await pg.evaluate("() => ({ result: S.result, jobs: _simJobs.size, page: document.querySelector('.page.active').id, name: S.name, report: ($id('page-result').textContent || '').trim().length })")
        check('a simulation was running when the sidebar reset was used', pending >= 1, pending)
        check('after the reset no report comes back, and no job or worker is left', after['result'] is None and after['jobs'] == 0 and after['page'] == 'page-intro' and after['name'] == '' and after['report'] < 40, after)
        nav = await pg.evaluate("() => ({ active: document.querySelector('#sb-nav .nav-item.active') && document.querySelector('#sb-nav .nav-item.active').id, scroll: $id('sidebar').scrollTop })")
        check('the sidebar goes back to the top', nav['scroll'] == 0, nav)
        check('no page errors', not errs, errs)
        await ctx.close()

        # 2c. a ledger too large for browser storage: say plainly what was saved and what was not
        ctx, pg, errs = await fresh(b)
        await pg.evaluate("""() => { const real = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'vcr3-draft' && String(v).indexOf('"ledger":{"csv"') >= 0) throw new DOMException('full', 'QuotaExceededError'); return real.call(this, k, v); }; }""")
        await pg.evaluate("() => { loadHalcyon(); S.example = false; S.name = 'Big Ledger Co'; saveDraft(); }")
        await pg.wait_for_timeout(300)
        r = await pg.evaluate("() => ({ toast: $id('toast').textContent, saved: ($id('tb-saved') || {}).textContent || '', draft: JSON.parse(localStorage.getItem('vcr3-draft') || 'null') })")
        tt = re.sub(r'\s+', ' ', r['toast'])
        check('too-large ledger: the message says what was saved, what was not, and that Export keeps everything',
              'Saved in this browser: your answers, notes and assumptions' in tt and 'Not saved: the uploaded ledger' in tt and 'Export .json' in tt and 'keep everything' in tt, tt)
        check('and the rest of the draft was saved without the ledger', r['draft'] and r['draft']['name'] == 'Big Ledger Co' and r['draft']['ledger'] is None and 'except the ledger' in r['saved'], r)
        await ctx.close()

        # 4. library, theme, text size are untouched
        ctx, pg, errs = await fresh(b)
        await pg.evaluate("() => { loadHalcyon(); S.result = assessAll(); saveRunToLibrary(); cycleTheme(); cycleTextSize(); }")
        keep = await pg.evaluate("() => ({ libCount: String(libLoad().length), libRaw: localStorage.getItem('vcr2-library'), theme: document.documentElement.getAttribute('data-theme'), text: document.documentElement.getAttribute('data-text'), ls: JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => /lib|theme|text|look|sidebar/i.test(k)))) })")
        await pg.evaluate("() => { showPage('intro'); }")
        pg.on('dialog', lambda d: None)
        await pg.evaluate("() => { resetApp(); }"); await pg.wait_for_timeout(400)
        keep2 = await pg.evaluate("() => ({ libCount: String(libLoad().length), libRaw: localStorage.getItem('vcr2-library'), theme: document.documentElement.getAttribute('data-theme'), text: document.documentElement.getAttribute('data-text'), ls: JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => /lib|theme|text|look|sidebar/i.test(k)))) })")
        check('the library entry is still there after a reset, byte for byte', keep['libCount'] == keep2['libCount'] and keep['libCount'] not in ('0', '') and keep['libRaw'] == keep2['libRaw'], [keep['libCount'], keep2['libCount']])
        check('theme and text size are unchanged', keep['theme'] == keep2['theme'] and keep['text'] == keep2['text'] and keep['text'] in ('large', 'xlarge', 'normal'), [keep, keep2])
        check('their stored settings are byte for byte the same', keep['ls'] == keep2['ls'], [keep['ls'][:120], keep2['ls'][:120]])
        check('no page errors', not errs, errs)
        await ctx.close()
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')
    sys.exit(1 if bad else 0)

asyncio.run(main())
