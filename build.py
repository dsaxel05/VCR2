#!/usr/bin/env python3
"""Inline the source files into a single self-contained index.html (GitHub Pages friendly).
Works with the sources in src/ or sitting next to this script."""
import re, pathlib, sys, json
root = pathlib.Path(__file__).parent
sys.path.insert(0, str(root/'tools'))
from jsstrip import strip_js, compact_css as strip_css   # JS: comments and indentation (and the indentation inside HTML templates); CSS: also whitespace (tests/css_compact_test.py)
src = root/'src' if (root/'src'/'shell.html').exists() else root
shell = (src/'shell.html').read_text(encoding='utf-8')
css_files = ['style-tokens.css', 'style.css', 'style-v4.css', 'style-studio.css', 'style-identity.css']
js_files = ['core.js', 'provenance.js', 'util.js', 'ledger.js', 'series.js', 'deal.js', 'sim.js', 'sim-async.js', 'patterns.js', 'checklist.js',
            'library.js', 'config.js', 'account.js', 'account-sync.js', 'account-vault.js', 'account-ui.js', 'account-lib.js', 'owner.js', 'owner-settings.js', 'owner-diff.js', 'theme.js', 'icons.js', 'charts.js', 'report.js', 'exports.js', 'sfw-begin', 'xlsx.js', 'smartfill-io.js', 'smartfill-pdf.js', 'smartfill-readers.js', 'smartfill-lang.js', 'smartfill-dict.js', 'smartfill-engine.js', 'smartfill-resolve.js', 'sfw-end', 'smartfill-worker.js', 'smartfill-ui.js', 'studio.js', 'studio2.js', 'studio-details.js', 'studio-safety.js', 'studio-smartfill.js', 'studio-accounts.js', 'demo.js', 'motion.js', 'actions.js', 'boot.js']
css = '\n'.join((src/f).read_text(encoding='utf-8') for f in css_files if (src/f).exists())
# the Smart fill reader and engine also run in a background thread, built at run time from the text between these two markers
SFW = {'sfw-begin': "void 'SFW{';", 'sfw-end': "void '}SFW';"}
js = '\n'.join(SFW[f] if f in SFW else (src/f).read_text(encoding='utf-8') for f in js_files if f in SFW or (src/f).exists())
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
# Accounts (Part B): the backend projects from site.json. Public values only (project URL, public anon key). They go into the page
# and into connect-src, the only hosts the account code may reach. No project listed: the page is exactly the guest-only page.
regions = []
if (root/'site.json').exists():
    for r in (json.loads((root/'site.json').read_text(encoding='utf-8')).get('accounts') or {}).get('regions') or []:
        if not (isinstance(r, dict) and r.get('url') and r.get('anonKey')): continue
        assert re.fullmatch(r'[a-z]{2,8}', str(r.get('id'))), 'site.json accounts: a region id is 2 to 8 lower-case letters'
        assert re.fullmatch(r'https://[a-z0-9-]{3,63}\.supabase\.co', r['url']), 'site.json accounts: a region url looks like https://<project>.supabase.co'
        assert re.fullmatch(r'[A-Za-z0-9._-]{20,1000}', r['anonKey']), 'site.json accounts: anonKey is the public anon key'
        regions.append({'id': r['id'], 'label': str(r.get('label') or r['id'])[:40], 'url': r['url'], 'anonKey': r['anonKey']})
# Test builds only (tests/browser/accounts_test.py): VCR2_TEST_ACCOUNTS lists LOCAL projects (http://127.0.0.1:<port>) and the page is
# written to VCR2_BUILD_OUT, never to index.html, so a local address can never reach the published page.
import os
test_out = None
if os.environ.get('VCR2_TEST_ACCOUNTS'):
    test_out = pathlib.Path(os.environ.get('VCR2_BUILD_OUT', ''))
    assert test_out.name and test_out.resolve() != (root/'index.html').resolve(), 'a test build needs VCR2_BUILD_OUT, not index.html'
    regions = []
    for r in json.loads(os.environ['VCR2_TEST_ACCOUNTS']):
        assert re.fullmatch(r'http://127\.0\.0\.1:\d{2,5}', r['url']) and re.fullmatch(r'[a-z]{2,8}', r['id']), 'test regions are local only'
        regions.append({'id': r['id'], 'label': str(r.get('label') or r['id'])[:40], 'url': r['url'], 'anonKey': r['anonKey']})
assert "'@@ACCOUNT_REGIONS@@'" in out, 'account.js needs its @@ACCOUNT_REGIONS@@ slot'
out = out.replace("'@@ACCOUNT_REGIONS@@'", json.dumps(json.dumps(regions)))
if regions:
    out = out.replace("connect-src 'self' ", "connect-src 'self' " + ' '.join(r['url'] for r in regions) + ' ', 1)
# Script blocks run only if they are the page's own: the Content-Security-Policy lists the SHA-256 of each inline <script> of this build,
# so a <script> element or a javascript: link that ever got into the page would be refused by the browser (tests/browser/csp_test.py).
import hashlib, base64
blocks = re.findall(r'<script>(.*?)</script>', out, flags=re.S)
assert blocks and '@@SCRIPT_HASHES@@' in out, 'the shell needs its inline scripts and the @@SCRIPT_HASHES@@ slot in the policy'
assert not re.search(r'<script\s+[^>]', out), 'a <script> with attributes would not be covered by the hashes'
hashes = ' '.join("'sha256-" + base64.b64encode(hashlib.sha256(b.encode('utf-8')).digest()).decode('ascii') + "'" for b in blocks)
out = out.replace('@@SCRIPT_HASHES@@', hashes)   # fills script-src and script-src-elem
if test_out:
    test_out.write_text(out, encoding='utf-8', newline='\n'); print('built TEST page', test_out); sys.exit(0)
(root/'index.html').write_text(out, encoding='utf-8', newline='\n')  # LF everywhere: CI compares builds byte for byte
print('built index.html', len(out.splitlines()), 'lines', len(out.encode())//1024, 'KB')
