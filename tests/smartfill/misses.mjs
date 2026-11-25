// Shows, for every recall failure of a set, the document line that carries the missed value (dev tool, not a test).
//   node tests/smartfill/misses.mjs heldout [field]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appSource, installStubs } from '../_harness.mjs';
const here = dirname(fileURLToPath(import.meta.url)), SET = process.argv[2] || 'heldout', ONLY = process.argv[3] || '';
const dir = join(here, 'corpus', SET), fails = JSON.parse(readFileSync(join(dir, 'failures.json'), 'utf8')), gold = JSON.parse(readFileSync(join(dir, 'gold.json'), 'utf8'));
installStubs();
(0, eval)(appSource() + '\n;globalThis.__a = { sfReadFile };');
const fmts = v => { const a = Math.abs(v), s = [String(v)]; if (a >= 1e3) s.push(v.toLocaleString('en-US')); for (const [d, u] of [[1e9, ['B', 'bn', 'billion']], [1e6, ['M', 'm', 'million', 'MM', 'mn']], [1e3, ['K', 'k', 'thousand']]]) if (a >= d) { const x = +(v / d).toFixed(2); s.push(String(x), String(x).replace('.', ',')); } return s; };
const seen = {};
for (const [code, file, field, detail] of fails) {
  if (ONLY && field !== ONLY) continue;
  if (code !== 'R1') continue;
  const g = gold.docs.find(d => d.file === file), gv = g && g.fields[field] && g.fields[field].value;
  const r = await globalThis.__a.sfReadFile(new Uint8Array(readFileSync(join(dir, file))), file.split('/').pop());
  const text = (r.doc && (r.doc.blocks || r.doc.lines || []).map(b => typeof b === 'string' ? b : (b.text || (b.cells || []).join(' | ') || '')).join('\n')) || JSON.stringify(r.doc || {}).slice(0, 20000);
  const keys = typeof gv === 'number' ? fmts(gv) : [String(gv)];
  const lines = text.split('\n').filter(l => keys.some(k => k.length > 1 && l.includes(k))).slice(0, 2).map(l => l.trim().slice(0, 160));
  const k = field + ' | ' + (lines[0] || '?').replace(/[\d.,$€£%]+/g, '#');
  if (seen[k]) { seen[k]++; continue; } seen[k] = 1;
  console.log(`${field} [${g.format}/${g.lang}/${g.mutation || '-'}] want ${gv}: ${lines.join('  //  ') || '(value not found in text: ' + detail + ')'}`);
}
