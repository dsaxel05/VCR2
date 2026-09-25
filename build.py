#!/usr/bin/env python3
"""Inline src/ into a single self-contained index.html (GitHub Pages friendly)."""
import re, pathlib
root = pathlib.Path(__file__).parent
shell = (root/'src/shell.html').read_text(encoding='utf-8')
css_files = ['style.css', 'style-v4.css', 'style-studio.css']
js_files = ['core.js', 'util.js', 'ledger.js', 'series.js', 'deal.js', 'sim.js', 'patterns.js', 'checklist.js',
            'library.js', 'config.js', 'charts.js', 'report.js', 'exports.js', 'xlsx.js', 'studio.js', 'demo.js', 'boot.js']
css = '\n'.join((root/'src'/f).read_text(encoding='utf-8') for f in css_files if (root/'src'/f).exists())
js = '\n'.join((root/'src'/f).read_text(encoding='utf-8') for f in js_files if (root/'src'/f).exists())
assert '</script' not in js.lower().replace('<\\/script', ''), 'raw </script> inside JS'
out = shell.replace('/*@@CSS@@*/', css).replace('/*@@JS@@*/', js)
(root/'index.html').write_text(out, encoding='utf-8')
print('built index.html', len(out.splitlines()), 'lines', len(out.encode())//1024, 'KB')
