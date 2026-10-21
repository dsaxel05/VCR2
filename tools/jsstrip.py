"""Light size reduction for the generated index.html: comments and indentation only.

No renaming and no joining of lines, so behaviour and stack traces are unchanged. Strings, template literals and regular
expressions are copied byte for byte. src/ keeps the commented, readable code; index.html is generated from it.
"""
import re

_REGEX_AFTER = set('(,=:[!&|?{;+-*%<>~^')
_REGEX_WORDS = {'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'void', 'delete', 'throw', 'new', 'instanceof', 'yield', 'await'}


def _skip_string(s, i, q):
    """s[i] is the opening quote; returns the index just after the closing quote."""
    n = len(s); j = i + 1
    while j < n and s[j] != q:
        j += 2 if s[j] == '\\' else 1
    return j + 1


def _skip_template(s, i):
    """s[i] is a backtick; returns the index just after the matching backtick, honouring nested ${ } and templates."""
    n = len(s); j = i + 1
    while j < n:
        d = s[j]
        if d == '\\':
            j += 2; continue
        if d == '`':
            return j + 1
        if d == '$' and j + 1 < n and s[j + 1] == '{':
            j = _skip_braces(s, j + 2); continue
        j += 1
    return n


def _skip_braces(s, j):
    """j is just after '${'; returns the index just after the matching '}' (code inside may hold strings and templates)."""
    n = len(s); depth = 1
    while j < n and depth:
        e = s[j]
        if e in '"\'':
            j = _skip_string(s, j, e); continue
        if e == '`':
            j = _skip_template(s, j); continue
        if e == '/' and j + 1 < n and s[j + 1] == '/':
            while j < n and s[j] != '\n':
                j += 1
            continue
        if e == '/' and j + 1 < n and s[j + 1] == '*':
            k = s.find('*/', j + 2); j = n if k < 0 else k + 2; continue
        if e == '{':
            depth += 1
        elif e == '}':
            depth -= 1
        j += 1
    return j


_NO_COMPACT = re.compile(r'<pre|<textarea|white-space|<code|<script|<style', re.I)


def _compact_tpl(t):
    """t is a whole template literal (both backticks). When it is HTML (its text starts with a tag and holds nothing where whitespace
    shows), the indentation after each newline is removed: a browser collapses a newline plus spaces to the same single space as a
    newline alone, so the page is identical. Expressions inside ${ } are kept, apart from the templates nested in them."""
    n = len(t); parts = []; j = 1; start = 1
    while j < n - 1:
        c = t[j]
        if c == '\\':
            j += 2; continue
        if c == '$' and t[j + 1] == '{':
            parts.append(('lit', t[start:j])); k = _skip_braces(t, j + 2)
            parts.append(('expr', t[j + 2:k - 1])); j = k; start = k; continue
        j += 1
    parts.append(('lit', t[start:n - 1]))
    flat = ''.join(x for kind, x in parts if kind == 'lit').lstrip()
    eligible = flat.startswith('<') and not _NO_COMPACT.search(flat)
    out = ['`']
    for kind, x in parts:
        if kind == 'lit':
            out.append(re.sub(r'\n[ \t]+', '\n', x) if eligible else x)
        else:
            out.append('${' + _compact_expr(x) + '}')
    out.append('`')
    return ''.join(out)


def _compact_expr(x):
    """Code inside ${ }: nested templates are compacted; strings, comments and all other code are copied unchanged."""
    out = []; i = 0; n = len(x)
    while i < n:
        c = x[i]
        if c in '"\'':
            j = _skip_string(x, i, c); out.append(x[i:j]); i = j; continue
        if c == '`':
            j = _skip_template(x, i); out.append(_compact_tpl(x[i:j])); i = j; continue
        if c == '/' and i + 1 < n and x[i + 1] == '/':
            j = x.find('\n', i); j = n if j < 0 else j; out.append(x[i:j]); i = j; continue
        if c == '/' and i + 1 < n and x[i + 1] == '*':
            k = x.find('*/', i + 2); j = n if k < 0 else k + 2; out.append(x[i:j]); i = j; continue
        out.append(c); i += 1
    return ''.join(out)


def strip_js(s, html=False, tight=False):
    """html=True also removes the indentation inside HTML template literals (see _compact_tpl); the default leaves them byte for byte.
    tight=True also drops the space after a comma and around "=" and "=>" in code (never inside a string, template, regular
    expression or comment); the build uses it."""
    out = []; i = 0; n = len(s)
    last = ''          # last significant character (for deciding whether '/' starts a regular expression)
    word = ''          # identifier or keyword being read / just read
    at_line_start = True
    while i < n:
        c = s[i]
        if c in ' \t' and at_line_start:
            i += 1; continue
        if c == '/' and i + 1 < n and s[i + 1] == '/':
            while i < n and s[i] != '\n':
                i += 1
            continue
        if c == '/' and i + 1 < n and s[i + 1] == '*':
            j = s.find('*/', i + 2); j = n if j < 0 else j + 2
            had_newline = '\n' in s[i:j]
            i = j
            if had_newline:
                if out and out[-1] != '\n':
                    out.append('\n'); at_line_start = True
            elif out and out[-1] not in ' \t\n':
                out.append(' ')
            continue
        if c in '"\'':
            j = _skip_string(s, i, c)
            out.append(s[i:j]); i = j; last = c; word = ''; at_line_start = False; continue
        if c == '`':
            j = _skip_template(s, i)
            tagged = (last == 'a' and word not in _REGEX_WORDS)      # String.raw`...` and other tags: left alone
            out.append(_compact_tpl(s[i:j]) if html and not tagged else s[i:j]); i = j; last = '`'; word = ''; at_line_start = False; continue
        if c == '/' and (last == '' or last in _REGEX_AFTER or word in _REGEX_WORDS):
            j = i + 1; in_class = False
            while j < n:
                d = s[j]
                if d == '\\':
                    j += 2; continue
                if d == '[':
                    in_class = True
                elif d == ']':
                    in_class = False
                elif d == '/' and not in_class:
                    break
                elif d == '\n':
                    break
                j += 1
            j += 1
            while j < n and s[j].isalpha():
                j += 1
            out.append(s[i:j]); i = j; last = ')'; word = ''; at_line_start = False; continue
        if tight and c == ' ':
            if last == ',':
                i += 1; continue
            if s.startswith(' => ', i):
                out.append('=>'); last = '>'; word = ''; at_line_start = False; i += 4; continue
            if s.startswith(' = ', i):
                out.append('='); last = '='; word = ''; at_line_start = False; i += 3; continue
        # an ordinary character
        if c.isalnum() or c in '_$':
            word = word + c if (word or not c.isdigit()) else ''
            last = 'a'
        elif c == '\n':
            pass
        elif c not in ' \t\r':
            word = ''; last = c
        out.append(c); at_line_start = (c == '\n'); i += 1
    text = ''.join(out)
    return '\n'.join(l.rstrip() for l in text.split('\n') if l.strip())


def strip_css(s):
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    return '\n'.join(l.strip() for l in s.split('\n') if l.strip())


def compact_css(s):
    """strip_css plus whitespace compaction around braces, semicolons, commas and declaration colons, the last semicolon of
    a block, and leading zeros of decimals. Strings and the spaces that matter (descendant selectors, calc() operators,
    'and' in media queries) are kept. tests/css_compact_test.py checks in a browser that every rule means the same."""
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    out, i, n, q, paren = [], 0, len(s), None, 0
    stack = []                      # True for a declaration block, False for a container (@media ...)
    prelude_from = 0               # index in out where the current prelude starts
    def prelude():
        return ''.join(out[prelude_from:]).strip()
    while i < n:
        c = s[i]
        if q:
            out.append(c)
            if c == chr(92) and i + 1 < n: out.append(s[i + 1]); i += 2; continue
            if c == q: q = None
            i += 1; continue
        if c in '"\'':
            q = c; out.append(c); i += 1; continue
        if c.isspace():
            j = i
            while j < n and s[j].isspace(): j += 1
            prev = out[-1] if out else ''
            nxt = s[j] if j < n else ''
            in_decl = bool(stack) and stack[-1]
            drop = (not out or not nxt or prev in '{};,(' or nxt in '{};,)'
                    or ((prev == ':' or nxt == ':') and (paren > 0 or in_decl)))
            if not drop: out.append(' ')
            i = j; continue
        if c == '(': paren += 1
        elif c == ')': paren = max(0, paren - 1)
        elif c == '{':
            head = prelude()
            stack.append(not head.startswith(('@media', '@supports', '@keyframes', '@-webkit-keyframes', '@layer')))
            out.append(c); prelude_from = len(out); i += 1; continue
        elif c == '}':
            if out and out[-1] == ';': out.pop()
            if stack: stack.pop()
            out.append(c); prelude_from = len(out); i += 1; continue
        elif c == ';':
            out.append(c); prelude_from = len(out); i += 1; continue
        if c == '0' and i + 2 < n and s[i + 1] == '.' and s[i + 2].isdigit():
            prev = out[-1] if out else ''
            if not (prev.isalnum() or prev in '._#'):
                i += 1; continue    # drop the leading zero: 0.5 -> .5
        out.append(c); i += 1
    return ''.join(out).replace('}', '}\n')
