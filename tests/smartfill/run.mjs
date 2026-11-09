// Smart fill test runner: regenerates the corpus when it is missing and scores the app against the gold.
//   node tests/smartfill/run.mjs                 (dev set, generated with seed 7 if missing)
//   node tests/smartfill/run.mjs --baseline      (what the app filled BEFORE Smart fill: no AI, only today's paths)
//   node tests/smartfill/run.mjs --set heldout --seed 1009
// Writes docs/smartfill/RESULTS.md. Prints a compact table only.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { appSource, root, installStubs } from '../_harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SET = arg('--set', 'dev'), SEED = arg('--seed', SET === 'dev' ? '7' : '1009'), BASELINE = process.argv.includes('--baseline');
const dir = join(here, 'corpus', SET);
if (!existsSync(join(dir, 'gold.json'))) execFileSync('python', [join(here, 'generate.py'), '--seed', SEED, '--set', SET], { stdio:'inherit' });
const gold = JSON.parse(readFileSync(join(dir, 'gold.json'), 'utf8'));

// the app, in one global scope, with the same stubs as the other suites
installStubs();
globalThis.__bytes = f => new Uint8Array(readFileSync(join(dir, f)));
globalThis.__sheetCSV = f => execFileSync('python', ['-c', 'import csv,sys,openpyxl;ws=openpyxl.load_workbook(sys.argv[1],data_only=True).worksheets[0];w=csv.writer(sys.stdout,lineterminator="\\n");[w.writerow(["" if v is None else v for v in r]) for r in ws.iter_rows(values_only=True)]', join(dir, f)]).toString();
(0, eval)(appSource() + '\n;' + String.raw`
globalThis.__baseline = async (docs) => {
  /* Today's app without AI: only the customer ledger and the monthly financials boxes read files, and only the ledger writes
     form fields (applyLedgerToForm). The narrative drop zone accepts .csv .txt .md .tsv .xlsx .xlsm and only stores text for the AI. */
  const NARRATIVE = /\.(csv|txt|md|tsv|xlsx|xlsm)$/i, out = [];
  for (const d of docs) {
    const r = { file:d.file, type:d.type, format:d.format, filled:{}, accepted:NARRATIVE.test(d.file) };
    if (d.type === 'ledger') {
      let text;
      try {
        /* Node has no DOMParser, which the app's workbook reader uses: the first sheet is passed as CSV (what the browser reads) */
        if (/\.xls[xm]$/i.test(d.file)) text = typeof DOMParser !== 'undefined' ? rowsToCSV(pickSheet(await readWorkbook(__bytes(d.file).buffer), 'ledger').rows) : __sheetCSV(d.file);
        else text = new TextDecoder().decode(__bytes(d.file));
        const p = parseLedger(text, 'mrr');
        if (p.ok) { const P = ledgerPrimitives(ledgerAnalytics(p.ledger)); Object.keys(P).forEach(k => { if (P[k] != null) r.filled[k] = P[k]; }); }
        else r.error = p.error;
      } catch (e) { r.error = String(e && e.message || e); }
    }
    out.push(r);
  }
  return out;
};`);

const docs = gold.docs;
const res = await globalThis.__baseline(docs);
const rows = {}, tot = { docs:0, gold:0, filled:0, accepted:0 };
res.forEach((r, i) => {
  const d = docs[i], g = d.type === 'ledger' ? Object.keys(r.filled).length || 12 : Object.keys(d.fields).length;
  const filled = d.type === 'ledger' ? Object.keys(r.filled).length : Object.keys(r.filled).filter(k => d.fields[k]).length;
  const t = rows[d.type] ||= { docs:0, gold:0, filled:0, accepted:0 };
  for (const o of [t, tot]) { o.docs++; o.gold += g; o.filled += filled; o.accepted += r.accepted ? 1 : 0; }
});
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : 'n/a';
const lines = ['| Document type | Documents | Gold fields | Filled by today\'s app (no AI) | Accepted by today\'s drop zone |', '|---|---|---|---|---|'];
Object.entries(rows).sort((a, b) => b[1].gold - a[1].gold).forEach(([k, t]) => lines.push(`| ${k} | ${t.docs} | ${t.gold} | ${t.filled} (${pct(t.filled, t.gold)}) | ${t.accepted} |`));
lines.push(`| **All** | **${tot.docs}** | **${tot.gold}** | **${tot.filled} (${pct(tot.filled, tot.gold)})** | **${tot.accepted}** |`);
const fmts = {}; docs.forEach(d => { fmts[d.format] = (fmts[d.format] || 0) + 1; });
let commit = ''; try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd:root }).toString().trim(); } catch (e) {}
const md = `# Smart fill results\n\n## Baseline (before Smart fill), ${new Date().toISOString().slice(0, 10)}, commit ${commit}, set ${SET} (seed ${SEED})\n\n`
  + `Measured by \`node tests/smartfill/run.mjs --baseline\`: the corpus is ${docs.length} documents (${Object.entries(fmts).map(([f, n]) => `${f} ${n}`).join(', ')}) and ${gold.adversarial.length} adversarial files. `
  + `Without AI, today's app fills form fields only from the customer ledger. The narrative drop zone accepts ${tot.accepted} of the ${tot.docs} files but only keeps their text for the optional AI extraction.\n\n`
  + lines.join('\n') + '\n';
writeFileSync(join(root, 'docs', 'smartfill', 'RESULTS.md'), md);
console.log(lines.join('\n'));
if (!BASELINE) console.log('\n(Smart fill is not built yet: only the baseline is measured. Run with --baseline.)');
