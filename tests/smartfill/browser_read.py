"""Reads documents with the app's own readers inside Chromium (HTML needs the browser's DOMParser) and prints the
Document models as JSON. Used by tests/smartfill/run.mjs; opens the built index.html from disk, sends nothing anywhere.

    python tests/smartfill/browser_read.py <corpus dir> <file> [<file> ...]"""
import sys, json, base64, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
base, files = pathlib.Path(sys.argv[1]), sys.argv[2:]
out = {}
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    hosts = set(); pg.on('request', lambda r: hosts.add(r.url.split('/')[2]) if r.url.startswith('http') else None)
    pg.goto((ROOT / 'index.html').as_uri()); pg.wait_for_selector('#api-key', state='attached')
    for f in files:
        data = base64.b64encode((base / f).read_bytes()).decode()
        out[f] = pg.evaluate("""async ([b64, name]) => { const u8 = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const r = await sfReadFile(u8, name); return r; }""", [data, f.split('/')[-1]])
    b.close()
if hosts: out['__network__'] = sorted(hosts)
sys.stdout.write(json.dumps(out))
