"""No em dash, en dash or spaced hyphen used as a sentence dash in anything a visitor can read.

Two checks. (1) Source: every string in src/*.js (comments removed), the page shell and the documents (README, CHANGELOG, SECURITY,
docs/*.md). (2) Rendered: the text and the attributes (title, placeholder, aria-label, alt) of every screen, both examples, every
report tab, the memo, the Markdown export and the founder email. "No value" is written n/a, never a dash. Hyphens inside words,
minus signs, ISO dates, "Alt + M", code and regular expressions are fine. The small allowlist holds the places where the
program itself reads a dash that a user typed (parsers), which is code, not text. The built-in AI voice line must forbid dashes.
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..', 'tools'))
import _paths
import asyncio, sys, re, pathlib
from playwright.async_api import async_playwright
import fontroute
from jsstrip import strip_js
BASE = _paths.BASE
ROOT = pathlib.Path(__file__).resolve().parents[2]
EM, EN = '—', '–'
results = []
def check(name, ok, info=''):
    results.append((ok, name, info)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -> {str(info)[:700]}'))

# Lines where the program reads a dash typed into a file or a form (a regular expression or a comparison), not text it writes.
ALLOW_SOURCE = [
    r"/\[[^\]]*[–—][^\]]*\]",      # a character class in a regular expression, e.g. /[–—-]/
    r"replace\(/[^/]*[–—]",         # normalising a typed dash
    r"\.test\(",                             # a pattern test on user input
]
DASH_RX = re.compile('[' + EM + EN + ']')

def source_hits():
    hits = []
    for f in sorted((ROOT / 'src').glob('*.js')):
        code = strip_js(f.read_text(encoding='utf-8'))
        for i, line in enumerate(code.split('\n'), 1):
            if DASH_RX.search(line) and not any(re.search(a, line) for a in ALLOW_SOURCE):
                hits.append(f'{f.name}:{i}: ' + line.strip()[max(0, DASH_RX.search(line).start() - 40):][:100])
    shell = re.sub(r'<!--.*?-->', '', (ROOT / 'src' / 'shell.html').read_text(encoding='utf-8'), flags=re.S)
    for m in DASH_RX.finditer(shell): hits.append('shell.html: ' + shell[max(0, m.start() - 40):m.start() + 40].replace('\n', ' '))
    return hits

def doc_hits():
    hits = []
    files = [ROOT / 'README.md', ROOT / 'CHANGELOG.md', ROOT / 'SECURITY.md'] + sorted((ROOT / 'docs').glob('*.md'))
    for f in files:
        in_code = False
        for i, line in enumerate(f.read_text(encoding='utf-8').split('\n'), 1):
            if line.lstrip().startswith('```'): in_code = not in_code; continue
            if in_code:
                if DASH_RX.search(line): hits.append(f'{f.name}:{i}: ' + line.strip()[:100])
                continue
            if DASH_RX.search(line): hits.append(f'{f.name}:{i}: ' + line.strip()[max(0, DASH_RX.search(line).start() - 40):][:100])
            elif re.search(r'\S - \S', re.sub(r'`[^`]*`|\]\([^)]*\)|https?://\S+', '', line)): hits.append(f'{f.name}:{i}: spaced hyphen: ' + line.strip()[:100])
    return hits

TEXT_JS = """() => {
  const out = [], skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement && !skip.has(n.parentElement.tagName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  while (w.nextNode()) out.push(w.currentNode.nodeValue);
  document.querySelectorAll('[title],[placeholder],[aria-label],[alt]').forEach(e => ['title', 'placeholder', 'aria-label', 'alt'].forEach(a => { const v = e.getAttribute(a); if (v) out.push(v); }));
  return out.join('\\n');
}"""

def find_bad(text):
    bad = []
    for m in re.finditer('[' + EM + EN + ']', text): bad.append('dash: ' + text[max(0, m.start() - 40):m.start() + 40].replace('\n', ' '))
    for m in re.finditer(r'(?<=[A-Za-z0-9\)\]\.,%])[ \t]-[ \t](?=[A-Za-z0-9(\[$"\'])', text): bad.append('spaced hyphen: ' + text[max(0, m.start() - 40):m.start() + 40].replace('\n', ' '))
    return bad

async def main():
    check('the source has no em or en dash outside the parser allowlist', not source_hits(), source_hits()[:12])
    n_src = len(source_hits())
    check('README, CHANGELOG, SECURITY and docs/*.md have no em dash, en dash or spaced hyphen', not doc_hits(), doc_hits()[:12])
    src = (ROOT / 'src' / 'core.js').read_text(encoding='utf-8')
    m = re.search(r"const AI_VOICE_DEFAULT = '([^']*)'", src)
    check('the built-in AI voice line forbids em dashes and en dashes', bool(m) and 'em dashes or en dashes' in m.group(1), m and m.group(1))
    rules = re.search(r"const AI_RULES = \{(.*?)\n\};", src, re.S)
    check('the fixed safety rules were not touched by that', bool(rules) and 'em dashes' not in rules.group(1))

    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1360, 'height': 900})
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await fontroute.install(pg)
        await pg.goto(BASE); await pg.wait_for_selector('#sidebar', state='attached')
        screens = {}
        screens['home'] = await pg.evaluate(TEXT_JS)
        await pg.evaluate("() => { goSetup(); }"); screens['setup'] = await pg.evaluate(TEXT_JS)
        await pg.evaluate("() => { showPage('intake'); }"); screens['intake'] = await pg.evaluate(TEXT_JS)
        for ex in ('loadNorthwind', 'loadHalcyon'):
            await pg.evaluate(f"() => {{ {ex}(); S.example = true; buildStages(); buildTypes(); buildNav(); updateProgress(); renderIntakeStatus(); }}")
            n = await pg.evaluate("() => SECTIONS.length")
            for i in range(n):
                await pg.evaluate("(i) => { S.section = i; renderSection(i); showPage('section'); }", i)
                screens[f'{ex} section {i}'] = await pg.evaluate(TEXT_JS)
            await pg.evaluate("() => { goVerify(); }"); await pg.wait_for_timeout(200)
            screens[f'{ex} verify'] = await pg.evaluate(TEXT_JS)
            await pg.evaluate("() => { S.result = assessAll(); showPage('result'); renderResult(S.result); }"); await pg.wait_for_timeout(300)
            tabs = await pg.evaluate("() => Array.from(document.querySelectorAll('.rtab')).map(b => (b.getAttribute('onclick') || '').match(/rtab\\('([a-z]+)'/) ? RegExp.$1 : null).filter(Boolean)")
            for t in tabs:
                await pg.evaluate("(t) => goTab(t)", t); screens[f'{ex} report {t}'] = await pg.evaluate(TEXT_JS)
            screens[f'{ex} memo'] = await pg.evaluate("() => { const d = document.createElement('div'); d.innerHTML = memoHTML(S.result); return d.textContent + ' ' + d.innerHTML.replace(/<[^>]*>/g, ' '); }")
            screens[f'{ex} markdown'] = await pg.evaluate("() => { window.__md = []; window.downloadFile = (n, c) => window.__md.push(String(c)); downloadReport(); return window.__md.join('\\n'); }")
            screens[f'{ex} founder email'] = await pg.evaluate("() => { const f = founderEmailText(S.result); return typeof f === 'string' ? f : JSON.stringify(f); }")
        await pg.evaluate("() => { goLibrary(); }"); await pg.wait_for_timeout(200)
        screens['library'] = await pg.evaluate(TEXT_JS)
        await pg.evaluate("() => libOpenAIPaste()"); screens['library AI import'] = await pg.evaluate(TEXT_JS); await pg.evaluate("() => closeModal()")
        # a refused ledger and a toast
        await pg.evaluate("() => { goSetup(); loadLedgerText('customer,2026-01,2026-02,2026-03\\nA,1,1,1', 'x.csv'); }"); await pg.wait_for_timeout(300)
        screens['refused ledger'] = await pg.evaluate(TEXT_JS)
        bad_all = {k: find_bad(v) for k, v in screens.items() if find_bad(v)}
        total = sum(len(v) for v in bad_all.values())
        check(f'no dash in the text or attributes of {len(screens)} rendered screens, exports and the founder email', not bad_all,
              [f'{k}: {v[0]}' for k, v in list(bad_all.items())[:8]] + [f'({total} in all)'])
        empty = [k for k, v in screens.items() if len(v) < 20 and 'founder email' not in k]
        check('and every one of them actually had text (the check is not vacuous)', not empty, empty)
        check('no page errors', not errs, errs)
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')
    sys.exit(1 if bad else 0)

asyncio.run(main())
