"""tools/jsstrip.py must remove comments and indentation and nothing else. Run: python tests/jsstrip_test.py"""
import pathlib, subprocess, sys, tempfile, os
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / 'tools'))
from jsstrip import strip_js, strip_css

CASES = [
    # (name, source, expected); expected None means "check the property below"
    ('line comment and indentation', "  var a = 1; // note\n    var b = 2;\n", "var a = 1;\nvar b = 2;"),
    ('block comments', "var a = /* x */ 1;\n/* whole\n   line */\nvar b;\n", "var a =  1;\nvar b;"),
    ('url in a string', "var u = 'https://example.com/a//b'; // c\n", "var u = 'https://example.com/a//b';"),
    ('comment markers in a template literal', "var t = `a // b /* c */ ${x // not a comment in a string\n} d`;\n", None),
    ('regular expression with quotes and slashes', "var r = /[\"'`]\\/\\/x/g.test(s); // c\n", "var r = /[\"'`]\\/\\/x/g.test(s);"),
    ('regex after return', "function f(s) {\n  return /\\/\\*/.test(s);\n}\n", "function f(s) {\nreturn /\\/\\*/.test(s);\n}"),
    ('division is not a regex', "var q = (a + b) / 2 / c; // done\n", "var q = (a + b) / 2 / c;"),
    ('newline kept for ASI', "var a = 1\n// c\nvar b = 2\n", "var a = 1\nvar b = 2"),
    ('nested template', "var t = `x ${ y ? `n ${z}` : '' } w`;\n", "var t = `x ${ y ? `n ${z}` : '' } w`;"),
    ('template indentation is kept', "var h = `\n    <div>\n      a\n    </div>`;\n", "var h = `\n    <div>\n      a\n    </div>`;"),
    ('escaped quote', "var s = 'it\\'s // fine'; // c\n", "var s = 'it\\'s // fine';"),
]
bad = 0
for name, src, exp in CASES:
    got = strip_js(src)
    ok = ('// b /* c */' in got and got.startswith('var t = `')) if exp is None else got == exp
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'\n   got: {got!r}\n   exp: {exp!r}'))
    bad += not ok

css = strip_css("/* head */\n  .a { color: red; } /* x */\n\n  .b { content: 'a'; }\n")
ok = css == ".a { color: red; }\n.b { content: 'a'; }"
print(('PASS ' if ok else 'FAIL ') + 'css comments and indentation' + ('' if ok else f'\n   got: {css!r}'))
bad += not ok

# html=True: the indentation inside HTML templates goes, nothing else (the build uses it; the default above is unchanged)
NL = chr(10)
H = [
    ('html template loses its indentation', 'var h = `' + NL + '    <div>' + NL + '      a' + NL + '    </div>`;', 'var h = `' + NL + '<div>' + NL + 'a' + NL + '</div>`;'),
    ('nested html template inside an expression', 'var h = `' + NL + '  <p>${x ? `' + NL + '    <b>b</b>' + NL + '  ` : ""}</p>`;', 'var h = `' + NL + '<p>${x ? `' + NL + '<b>b</b>' + NL + '` : ""}</p>`;'),
    ('text that is not html keeps its indentation', 'var m = `' + NL + '  line one' + NL + '    line two`;', 'var m = `' + NL + '  line one' + NL + '    line two`;'),
    ('a tagged template is left alone', 'var r = String.raw`' + NL + '   <i>' + NL + '    x</i>`;', 'var r = String.raw`' + NL + '   <i>' + NL + '    x</i>`;'),
    ('a textarea or pre keeps its text', 'var h = `<textarea>' + NL + '    keep</textarea>`;', 'var h = `<textarea>' + NL + '    keep</textarea>`;'),
]
for name, src, exp in H:
    got = strip_js(src, html=True)
    ok = got == exp
    print(('PASS ' if ok else 'FAIL ') + 'html: ' + name + ('' if ok else ' got ' + repr(got) + ' expected ' + repr(exp)))
    bad += not ok
ok = strip_js(H[0][1]) == 'var h = `' + NL + '    <div>' + NL + '      a' + NL + '    </div>`;'
print(('PASS ' if ok else 'FAIL ') + 'html: the default still keeps template indentation'); bad += not ok

# tight=True (the build uses it): spaces after commas and around "=" and "=>" go, in code only
TIGHT = [
    ('commas and assignments', "var a = 1, b = 2;", "var a=1,b=2;"),
    ('arrow function', "var f = (a, b) => a + b;", "var f=(a,b)=>a+b;"),
    ('a string is left alone', "var s = 'a, b = c => d';", "var s='a, b = c => d';"),
    ('a double-quoted string is left alone', 'var s = "a, b = c";', 'var s="a, b = c";'),
    ('a template literal is left alone', "var t = `a, b = c ${x, y = 1}`;", "var t=`a, b = c ${x, y = 1}`;"),
    ('a regular expression is left alone', "var r = /a, b = c/g;", "var r=/a, b = c/g;"),
    ('comparisons, logic and compound assignments lose their spaces', "if (a == b || c === d || e != f || g <= h) x += 1, y -= 2;", "if (a==b||c===d||e!=f||g<=h) x+=1,y-=2;"),
    ('a ternary and brackets lose their spaces', "var v = ok ? [ a, b ] : { c: 1 };", "var v=ok?[a,b]:{c: 1};"),
    ('"+" and "-" next to another "+" or "-" keep their space', "x = a + +b; y = a - -b; z = a + ++b; w = c-- - d;", "x=a + +b;y=a - -b;z=a + ++b;w=c-- - d;"),
    ('optional chaining and words are left alone', "var r = typeof a?.b === 'x' && c instanceof D;", "var r=typeof a?.b==='x'&&c instanceof D;"),
    ('comparisons with < and > lose their spaces', "var s = a < b && c > d;", "var s=a<b&&c>d;"),
    ('a division after an assignment is not a regex', "var q = a / 2, w = b / 3;", "var q=a / 2,w=b / 3;"),
    ('a comment is still removed', "var a = 1; // x, y = z" + chr(10) + "var b = 2;", "var a=1;" + chr(10) + "var b=2;"),
]
for name, src, exp in TIGHT:
    got = strip_js(src, tight=True)
    ok = got == exp
    print(('PASS ' if ok else 'FAIL ') + 'tight: ' + name + ('' if ok else ' got ' + repr(got) + ' expected ' + repr(exp)))
    bad += not ok
ok = strip_js("var a = 1, b = 2;") == "var a = 1, b = 2;"
print(('PASS ' if ok else 'FAIL ') + 'tight: the default is unchanged'); bad += not ok

# the stripped copy of the whole application must parse and be smaller
root = pathlib.Path(__file__).resolve().parent.parent
names = [n.strip().strip("'\"") for n in
         ' '.join(l for l in (root / 'build.py').read_text(encoding='utf-8').split('\n') if l.lstrip().startswith(("js_files", "'"))).split('[', 1)[1].split(']')[0].split(',')]
src = '\n'.join((root / 'src' / f).read_text(encoding='utf-8') for f in names if f.endswith('.js'))
out = strip_js(src, html=True, tight=True)
with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as fh:
    fh.write(out); tmp = fh.name
r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
os.unlink(tmp)
ok = r.returncode == 0
print(('PASS ' if ok else 'FAIL ') + 'the stripped application parses' + ('' if ok else '\n' + r.stderr[:400]))
bad += not ok
ok = len(out) < 0.92 * len(src)
print(('PASS ' if ok else 'FAIL ') + f'and is smaller ({len(src) // 1024} KB -> {len(out) // 1024} KB)')
bad += not ok
built = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'index.html'), encoding='utf-8').read()
ok = '© 2026 Axel De Sousa. All rights reserved.' in built and '<footer class="p-foot">' in built
print(('PASS ' if ok else 'FAIL ') + 'the built page carries the copyright notice and the footer')
bad += not ok
total = len(CASES) + 4 + len(TIGHT) + 1
print(f'\n{total - bad}/{total} passed')
sys.exit(1 if bad else 0)
