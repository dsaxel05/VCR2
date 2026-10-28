#!/usr/bin/env python3
"""Fail when the shipped page grows past its budget (Python standard library only).

    python tools/size_check.py

Budgets are in tools/size_budget.json (raw and gzip KB for index.html, and KB for every file in
assets/fonts/ together and in assets/video/ together). Raise a budget only on purpose, in the same pull request as the feature
that needs it, and say why in the pull request.
"""
import gzip, json, pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
budget = json.loads((root / 'tools' / 'size_budget.json').read_text(encoding='utf-8'))
page = (root / 'index.html').read_bytes()
raw, gz = len(page) / 1024, len(gzip.compress(page, 9)) / 1024
fonts_dir = root / 'assets' / 'fonts'
fonts = sum(p.stat().st_size for p in fonts_dir.glob('*') if p.is_file()) / 1024 if fonts_dir.exists() else 0
video_dir = root / 'assets' / 'video'
video = sum(p.stat().st_size for p in video_dir.glob('*') if p.is_file()) / 1024 if video_dir.exists() else 0
rows = [('index.html raw', raw, budget['index_raw_kb']), ('index.html gzip', gz, budget['index_gzip_kb']), ('fonts', fonts, budget['fonts_kb']), ('video', video, budget.get('video_kb', 30720))]
bad = False
for name, val, lim in rows:
    ok = val <= lim
    bad |= not ok
    print(f"{'ok  ' if ok else 'OVER'} {name:<16} {val:8.1f} KB  (budget {lim} KB)")
sys.exit(1 if bad else 0)
