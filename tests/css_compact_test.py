"""tools/jsstrip.compact_css must change how the stylesheet is written, never what it means.

1. A few small cases (strings, calc(), media queries, descendant selectors, decimals).
2. The real stylesheet of the application: parsed by Chromium once as written (comments removed only) and once compacted;
   every rule must serialise to exactly the same text, rule for rule.

    python tests/css_compact_test.py"""
import pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
from jsstrip import compact_css, strip_css

bad = 0
def check(name, ok, detail=''):
    global bad
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else '\n   ' + detail)); bad += not ok

CASES = [
    ('declaration spacing', ".a { color : red ; margin : 0 }", ".a{color:red;margin:0}"),
    ('descendant selector keeps its space', ".a   .b { x: y; }", ".a .b{x:y}"),
    ('calc operators keep their spaces', "a { width: calc(100% - 2rem + 0.5px); }", "a{width:calc(100% - 2rem + .5px)}"),
    ('strings are untouched', "a::before { content: '  a ; b { c } '; }", "a::before{content:'  a ; b { c } '}"),
    ('media query', "@media (max-width: 760px) and (min-width: 400px) { .x .y { top: 0; } }", "@media (max-width:760px) and (min-width:400px){.x .y{top:0}}"),
    ('leading zero only on decimals', "a { margin: 0 0.5rem 10.5px 0.25em; }", "a{margin:0 .5rem 10.5px .25em}"),
    ('important keeps its space', "a { color: red !important; }", "a{color:red !important}"),
    ('custom property', ":root { --a: #F6F1E6; --b: var(--a); }", ":root{--a:#F6F1E6;--b:var(--a)}"),
]
for name, src, exp in CASES:
    got = compact_css(src).replace('\n', '')
    check('compact: ' + name, got == exp, f'got {got!r}\n   exp {exp!r}')

# the whole stylesheet, rule for rule, in a real browser
names = ['style-tokens.css', 'style.css', 'style-v4.css', 'style-studio.css', 'style-identity.css']
css = '\n'.join((ROOT / 'src' / n).read_text(encoding='utf-8') for n in names)
plain, compact = strip_css(css), compact_css(css)
check('compact is smaller', len(compact) < len(plain) * 0.9, f'{len(compact)} vs {len(plain)}')
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('SKIP browser comparison (Playwright is not installed)'); sys.exit(1 if bad else 0)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.set_content('<html><body></body></html>')
    res = pg.evaluate(r"""([a, c]) => {
      /* Selectors must be identical. Values are compared with spaces around commas and runs of spaces folded, and 0.5 = .5,
         because the browser keeps the written form of functions and custom properties it does not interpret. */
      const norm = v => v.replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ').replace(/(^|[^\d.])0\.(\d)/g, '$1.$2').trim();
      const ser = rules => Array.from(rules).map(r => {
        if (r.conditionText !== undefined && r.cssRules) return '@media ' + norm(r.conditionText) + '{' + ser(r.cssRules).join('') + '}';
        if (r.style && r.selectorText !== undefined) {
          const props = [];
          for (let i = 0; i < r.style.length; i++) { const n = r.style[i]; props.push(n + ':' + norm(r.style.getPropertyValue(n)) + r.style.getPropertyPriority(n)); }
          return r.selectorText + '{' + props.join(';') + '}';
        }
        return norm(r.cssText);
      });
      const sheet = t => { const s = new CSSStyleSheet(); s.replaceSync(t); return ser(s.cssRules); };
      const x = sheet(a), y = sheet(c), diff = [];
      for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) diff.push([i, x[i], y[i]]);
      return { n: x.length, m: y.length, diff: diff.slice(0, 3), nd: diff.length };
    }""", [plain, compact])
    b.close()
check(f"same {res['n']} rules, same text", res['n'] == res['m'] and res['nd'] == 0, str(res['diff']))
print('FAILED' if bad else 'OK')
sys.exit(1 if bad else 0)
