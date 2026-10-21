"""Shared paths for the legacy browser suites (made portable from the original sandbox).

BASE: the app URL. Start a local server first from the repo root, e.g.
      node tools/dev_server.mjs --port 8765        (or: python -m http.server 8765)
      Override with the VCR2_BASE environment variable.
FILE_URL: some suites opened index.html directly; they now use BASE as well.
SHOTS: screenshots written by the suites (a temp folder unless VCR2_SHOTS is set).
XL: Excel fixtures that ship with these tests.
"""
import os, pathlib, tempfile
HERE = pathlib.Path(__file__).resolve().parent
BASE = os.environ.get('VCR2_BASE', 'http://127.0.0.1:8765/index.html')
ORIGIN = BASE.rsplit('/', 1)[0]
FILE_URL = BASE
SHOTS = os.environ.get('VCR2_SHOTS', os.path.join(tempfile.gettempdir(), 'vcr2-legacy-shots')) + os.sep
os.makedirs(SHOTS, exist_ok=True)
XL = str(HERE / 'xl') + os.sep
