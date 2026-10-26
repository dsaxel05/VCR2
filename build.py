#!/usr/bin/env python3
"""Inline the source files into a single self-contained index.html (GitHub Pages friendly).
Works with the sources in src/ or sitting next to this script."""
import re, pathlib, sys
root = pathlib.Path(__file__).parent
sys.path.insert(0, str(root/'tools'))
from jsstrip import strip_js, compact_css as strip_css   # JS: comments and indentation (and the indentation inside HTML templates); CSS: also whitespace (tests/css_compact_test.py)
src = root/'src' if (root/'src'/'shell.html').exists() else root
shell = (src/'shell.html').read_text(encoding='utf-8')
css_files = ['style-tokens.css', 'style.css', 'style-v4.css', 'style-studio.css', 'style-identity.css']
js_files = ['core.js', 'provenance.js', 'util.js', 'ledger.js', 'series.js', 'deal.js', 'sim.js', 'sim-async.js', 'patterns.js', 'checklist.js',
            'library.js', 'config.js', 'owner.js', 'owner-settings.js', 'owner-diff.js', 'theme.js', 'icons.js', 'charts.js', 'report.js', 'exports.js', 'xlsx.js', 'studio.js', 'studio2.js', 'studio-details.js', 'studio-safety.js', 'demo.js', 'boot.js']
css = '\n'.join((src/f).read_text(encoding='utf-8') for f in css_files if (src/f).exists())
js = '\n'.join((src/f).read_text(encoding='utf-8') for f in js_files if (src/f).exists())
if not (len(sys.argv) > 1 and sys.argv[1] == '--readable'):
    css = strip_css(css); js = strip_js(js, html=True, tight=True)
    # The copyright notice is a comment, so stripping would drop it from the shipped page: put it back.
    js = '/* © 2026 Axel De Sousa. All rights reserved. Proprietary licence (see LICENSE) · github.com/dsaxel05/VCR2 */\n' + js
assert '</script' not in js.lower().replace('<\\/script', ''), 'raw </script> inside JS'
icons = dict(re.findall(r"^\s*([a-z]+):'(.*?)',?$", (src/'icons.js').read_text(encoding='utf-8'), re.M)) if (src/'icons.js').exists() else {}
def _icon(m):
    if m.group(1) not in icons: raise SystemExit(f'unknown icon {m.group(1)} in shell.html')
    return ('<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + icons[m.group(1)] + '</svg>')
shell = re.sub(r'ICON:([a-z]+)', _icon, shell)
if not (len(sys.argv) > 1 and sys.argv[1] == '--readable'):
    # HTML comments and the indentation of the shell carry no meaning for a browser: the page ships without them.
    shell = re.sub(r'<!--.*?-->', '', shell, flags=re.S)
    shell = re.sub(r'(?m)^[ 	]+', '', shell)
site = 'https://vcr2.app/'
if (root/'site.json').exists():
    import json
    site = str(json.loads((root/'site.json').read_text(encoding='utf-8')).get('url') or site)
site = site.rstrip('/') + '/'
out = shell.replace('/*@@CSS@@*/', css).replace('/*@@JS@@*/', js).replace('@@SITE_URL@@', site)
# Script blocks run only if they are the page's own: the Content-Security-Policy lists the SHA-256 of each inline <script> of this build,
# so a <script> element or a javascript: link that ever got into the page would be refused by the browser (tests/browser/csp_test.py).
import hashlib, base64
blocks = re.findall(r'<script>(.*?)</script>', out, flags=re.S)
assert blocks and '@@SCRIPT_HASHES@@' in out, 'the shell needs its inline scripts and the @@SCRIPT_HASHES@@ slot in the policy'
assert not re.search(r'<script\s+[^>]', out), 'a <script> with attributes would not be covered by the hashes'
hashes = ' '.join("'sha256-" + base64.b64encode(hashlib.sha256(b.encode('utf-8')).digest()).decode('ascii') + "'" for b in blocks)
out = out.replace('@@SCRIPT_HASHES@@', hashes)
(root/'index.html').write_text(out, encoding='utf-8', newline='\n')  # LF everywhere: CI compares builds byte for byte
print('built index.html', len(out.splitlines()), 'lines', len(out.encode())//1024, 'KB')
