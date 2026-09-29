#!/usr/bin/env python3
"""Inline the source files into a single self-contained index.html (GitHub Pages friendly).
Works with the sources in src/ or sitting next to this script."""
import re, pathlib
root = pathlib.Path(__file__).parent
src = root/'src' if (root/'src'/'shell.html').exists() else root
shell = (src/'shell.html').read_text(encoding='utf-8')
css_files = ['style.css', 'style-v4.css', 'style-studio.css']
js_files = ['core.js', 'util.js', 'ledger.js', 'series.js', 'deal.js', 'sim.js', 'patterns.js', 'checklist.js',
            'library.js', 'config.js', 'charts.js', 'report.js', 'exports.js', 'xlsx.js', 'studio.js', 'demo.js', 'boot.js']
css = '\n'.join((src/f).read_text(encoding='utf-8') for f in css_files if (src/f).exists())
js = '\n'.join((src/f).read_text(encoding='utf-8') for f in js_files if (src/f).exists())
assert '</script' not in js.lower().replace('<\\/script', ''), 'raw </script> inside JS'
out = shell.replace('/*@@CSS@@*/', css).replace('/*@@JS@@*/', js)
(root/'index.html').write_text(out, encoding='utf-8')
print('built index.html', len(out.splitlines()), 'lines', len(out.encode())//1024, 'KB')
