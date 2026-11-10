// Smart fill test runner: regenerates the corpus when it is missing, runs the readers and the engine on every document
// (HTML in Chromium, the rest under Node) and scores them against the gold.
//   node tests/smartfill/run.mjs                    dev set (seed 7)
//   node tests/smartfill/run.mjs --baseline         what the app filled BEFORE Smart fill (no AI, only today's paths)
//   node tests/smartfill/run.mjs --set heldout --seed 1009
// Prints a compact table and writes its section of docs/smartfill/RESULTS.md.
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
let commit = ''; try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd:root }).toString().trim(); } catch (e) {}
const today = new Date().toISOString().slice(0, 10), pc = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : 'n/a';

installStubs();
globalThis.__bytes = f => new Uint8Array(readFileSync(join(dir, f)));
globalThis.__sheetCSV = f => execFileSync('python', ['-c', 'import csv,sys,openpyxl;ws=openpyxl.load_workbook(sys.argv[1],data_only=True).worksheets[0];w=csv.writer(sys.stdout,lineterminator="\\n");[w.writerow(["" if v is None else v for v in r]) for r in ws.iter_rows(values_only=True)]', join(dir, f)]).toString();
(0, eval)(appSource() + '\n;' + String.raw`
globalThis.__app = { sfReadFile, sfExtract, ALL_FIELDS, SECTIONS };
globalThis.__baseline = async (docs) => {
  /* Today's app without AI: only the customer ledger writes form fields (applyLedgerToForm); the narrative drop zone only keeps text for the AI. */
  const NARRATIVE = /\.(csv|txt|md|tsv|xlsx|xlsm)$/i, out = [];
  for (const d of docs) {
    const r = { file:d.file, type:d.type, filled:{}, accepted:NARRATIVE.test(d.file) };
    if (d.type === 'ledger') {
      try {
        const text = /\.xls[xm]$/i.test(d.file) ? (typeof DOMParser !== 'undefined' ? rowsToCSV(pickSheet(await readWorkbook(__bytes(d.file).buffer), 'ledger').rows) : __sheetCSV(d.file)) : new TextDecoder().decode(__bytes(d.file));
        const p = parseLedger(text, 'mrr');
        if (p.ok) { const P = ledgerPrimitives(ledgerAnalytics(p.ledger)); Object.keys(P).forEach(k => { if (P[k] != null) r.filled[k] = P[k]; }); }
      } catch (e) { r.error = String(e && e.message || e); }
    }
    out.push(r);
  }
  return out;
};`);
const A = globalThis.__app;

function writeSection(name, md) {
  const p = join(root, 'docs', 'smartfill', 'RESULTS.md'), start = `<!-- ${name} -->`, end = `<!-- /${name} -->`;
  let s = existsSync(p) ? readFileSync(p, 'utf8') : '# Smart fill results\n';
  const block = `${start}\n${md.trim()}\n${end}`;
  s = s.includes(start) ? s.slice(0, s.indexOf(start)) + block + s.slice(s.indexOf(end) + end.length) : s.trimEnd() + '\n\n' + block + '\n';
  writeFileSync(p, s);
}

if (BASELINE) {
  const res = await globalThis.__baseline(gold.docs), rows = {}, tot = { docs:0, gold:0, filled:0, accepted:0 };
  res.forEach((r, i) => {
    const d = gold.docs[i], g = d.type === 'ledger' ? Object.keys(r.filled).length || 12 : Object.keys(d.fields).length;
    const filled = d.type === 'ledger' ? Object.keys(r.filled).length : Object.keys(r.filled).filter(k => d.fields[k]).length;
    const t = rows[d.type] ||= { docs:0, gold:0, filled:0, accepted:0 };
    for (const o of [t, tot]) { o.docs++; o.gold += g; o.filled += filled; o.accepted += r.accepted ? 1 : 0; }
  });
  const L = ['| Document type | Documents | Gold fields | Filled by today\'s app (no AI) | Accepted by today\'s drop zone |', '|---|---|---|---|---|'];
  Object.entries(rows).sort((a, b) => b[1].gold - a[1].gold).forEach(([k, t]) => L.push(`| ${k} | ${t.docs} | ${t.gold} | ${t.filled} (${pc(t.filled, t.gold)}) | ${t.accepted} |`));
  L.push(`| **All** | **${tot.docs}** | **${tot.gold}** | **${tot.filled} (${pc(tot.filled, tot.gold)})** | **${tot.accepted}** |`);
  writeSection(`baseline-${SET}`, `## Baseline (before Smart fill), ${today}, commit ${commit}, set ${SET} (seed ${SEED})\n\nWithout AI, today's app fills form fields only from the customer ledger.\n\n` + L.join('\n'));
  console.log(L.join('\n'));
  process.exit(0);
}

/* ── the engine on every document ── */
const html = gold.docs.filter(d => /^html?$/.test(d.format)).map(d => d.file);
let fromBrowser = {};
if (html.length) {
  try { fromBrowser = JSON.parse(execFileSync('python', [join(here, 'browser_read.py'), dir, ...html], { maxBuffer:1 << 28 }).toString()); }
  catch (e) { console.log('HTML documents could not be read in Chromium (is Playwright installed?):', String(e.message).slice(0, 200)); }
}
/* the traps each document type carries (docs.py): forecast and plan columns, prior-year columns, targets, competitor and market figures, ... */
const SF_TRAPS = { deck:['target or goal', 'competitor or market figure', 'footnote that changes a definition', 'rounding ($15.6M)'], model:['forecast or plan columns', 'prior-year column', 'net new versus new-logo ARR', 'gross versus net burn', 'margin with and without customer success', 'hidden stale sheet', 'negatives in parentheses', 'thousands scale row'],
  update:['target or goal', 'prior-year figure in a sentence', 'gross versus net burn'], bank:['restricted cash', 'opening balance'], receivables:['ageing buckets'], captable:['granted versus unallocated pool'], termsheet:['including clauses'], security:['negation'], market:['industry benchmark'], audited:['older period'] };
const SEC = {}; A.SECTIONS.forEach(s => s.fields.forEach(f => { SEC[f.id] = s.id; }));
const eqv = (a, b) => typeof b === 'number' ? typeof a === 'number' && Math.abs(a - b) <= Math.max(Math.abs(b) * 0.006, 0.051) : String(a).toLowerCase() === String(b).toLowerCase();
const T = { High:{ n:0, ok:0 }, Medium:{ n:0, ok:0 }, Low:{ n:0, ok:0 } }, rel = {}, fails = [], R = {};
const by = { format:{}, type:{}, family:{}, via:{}, mutation:{}, trap:{} }, bump = (k, key, f) => { const o = by[k][key] ||= { gold:0, found:0, props:0, wrong:0 }; f(o); };
let goldN = 0, found = 0, decoys = 0, ledgerOk = 0, ledgerN = 0, htmlNet = fromBrowser.__network__ || [];
const times = [], proposalsAll = {};
for (const d of gold.docs) {
  const t0 = performance.now();
  const res = /^html?$/.test(d.format) ? fromBrowser[d.file] || { ok:false, code:'unread' } : await A.sfReadFile(__bytes(d.file), d.file.split('/').pop());
  if (!res.ok) { fails.push(['R5', d.file, 'reader', res.code]); continue; }
  const e = A.sfExtract(res, { model:d.model }); times.push(performance.now() - t0);
  proposalsAll[d.file] = e.proposals.map(p => [p.field, p.value, p.tier, p.loc]);
  if (d.type === 'ledger') { ledgerN++; if (e.ledger) ledgerOk++; else fails.push(['R6', d.file, 'ledger', 'not recognised as a ledger: ' + e.cls.type]); continue; }
  const gf = d.fields; goldN += Object.keys(gf).length;
  const traps = SF_TRAPS[d.type] || [];
  for (const [k, g] of Object.entries(gf)) { bump('mutation', d.mutation || 'base', o => o.gold++); traps.forEach(t => bump('trap', t, o => o.gold++)); bump('format', d.format, o => o.gold++); bump('type', d.type, o => o.gold++); bump('family', SEC[k] || '?', o => o.gold++); }
  for (const p of e.proposals) {
    const g = gf[p.field], ok = g && eqv(p.value, g.value); T[p.tier].n++; if (ok) T[p.tier].ok++;
    const exp = g ? g.tier : 'none', rr = rel[p.tier] ||= { n:0, ok:0, expHigh:0 }; rr.n++; if (ok) rr.ok++; if (exp === 'High') rr.expHigh++;
    bump('via', p.via || '?', o => { o.props++; if (!ok && p.tier !== 'Low') o.wrong++; });
    if (p.tier !== 'Low' && !ok && (d.must_not_value || []).some(v => typeof p.value === 'number' && Math.abs(p.value - v) <= Math.abs(v) * 0.006)) { decoys++; fails.push(['R3', d.file, p.field, `decoy value ${p.value} filled`]); }
    if (!ok && p.tier !== 'Low') {
      bump('mutation', d.mutation || 'base', o => o.wrong++); traps.forEach(t => bump('trap', t, o => o.wrong++));
      bump('format', d.format, o => o.wrong++); bump('type', d.type, o => o.wrong++); bump('family', SEC[p.field] || '?', o => o.wrong++);
      const code = d.must_not_fill.includes(p.field) ? 'R3' : !g ? 'R6' : (typeof g.value === 'number' && [1000, 100, 0.01, 0.001, 30, 1 / 30].some(k => Math.abs(p.value / g.value - k) < 0.02)) ? 'R4' : 'R2';
      if (d.must_not_fill.includes(p.field)) decoys++;
      fails.push([code, d.file, p.field, `${p.tier}: proposed ${JSON.stringify(p.value)}, gold ${g ? JSON.stringify(g.value) : '(nothing)'}. "${p.snippet.slice(0, 80)}"`]);
    }
  }
  for (const [k, g] of Object.entries(gf)) {
    const p = e.proposals.find(x => x.field === k);
    if (p && eqv(p.value, g.value) && (p.tier !== 'Low' || g.tier === 'Low')) { found++; bump('mutation', d.mutation || 'base', o => o.found++); traps.forEach(t => bump('trap', t, o => o.found++)); bump('format', d.format, o => o.found++); bump('type', d.type, o => o.found++); bump('family', SEC[k] || '?', o => o.found++); }
    else if (!p) fails.push(['R1', d.file, k, `not proposed (gold ${JSON.stringify(g.value)}, ${g.tier}, at ${g.loc})`]);
    else if (eqv(p.value, g.value)) fails.push(['R7', d.file, k, `right value but only Low (gold ${g.tier}): ${p.why.join(', ')}`]);
  }
}
fails.forEach(f => { R[f[0]] = (R[f[0]] || 0) + 1; });
writeFileSync(join(dir, 'failures.json'), JSON.stringify(fails, null, 1));   /* every failure, next to the corpus (not committed) */
times.sort((a, b) => a - b); const q = p => times.length ? times[Math.min(times.length - 1, Math.floor(p * times.length))].toFixed(0) : 'n/a';
/* determinism: the same documents in the reverse order give the same proposals */
const again = {};
for (const d of [...gold.docs].reverse()) { if (/^html?$/.test(d.format)) { again[d.file] = proposalsAll[d.file]; continue; } const res = await A.sfReadFile(__bytes(d.file), d.file.split('/').pop()); if (res.ok) again[d.file] = A.sfExtract(res, { model:d.model }).proposals.map(p => [p.field, p.value, p.tier, p.loc]); }
const det = Object.keys(proposalsAll).every(k => JSON.stringify(proposalsAll[k]) === JSON.stringify(again[k]));
const table = (k, title) => [`| ${title} | Gold fields | Found | Wrong at High or Medium |`, '|---|---|---|---|', ...Object.entries(by[k]).filter(([, o]) => o.gold).sort().map(([n, o]) => `| ${n} | ${o.gold} | ${o.found} (${pc(o.found, o.gold)}) | ${o.wrong} |`)].join('\n');
const head = `| Measure | Measured | Target (dev) |\n|---|---|---|\n| High-tier precision | ${T.High.ok}/${T.High.n} (${pc(T.High.ok, T.High.n)}) | 98% or better |\n| Medium-tier precision | ${T.Medium.ok}/${T.Medium.n} (${pc(T.Medium.ok, T.Medium.n)}) | 90% or better |\n`
  + `| Recall (High and Medium, plus Low where the gold is Low) | ${found}/${goldN} (${pc(found, goldN)}) | 92% clean, 75% messy |\n| Decoys filled (must_not_fill) | ${decoys} of ${props()} proposals | 0.5% or less |\n`
  + `| Wrong values per 100 High fields | ${((T.High.n - T.High.ok) / Math.max(1, T.High.n) * 100).toFixed(1)} | 1 or less |\n| Ledgers recognised | ${ledgerOk}/${ledgerN} | all |\n| Same proposals in reverse order | ${det ? 'yes' : 'NO'} | yes |\n`
  + `| Time per document (read and extract) | median ${q(0.5)} ms, 95th percentile ${q(0.95)} ms | 400 ms, 1.5 s |\n| Requests to any other site (HTML in Chromium) | ${htmlNet.length} | 0 |`;
function props() { return T.High.n + T.Medium.n + T.Low.n; }
const relT = ['| Predicted tier | Proposals | Correct | Observed precision |', '|---|---|---|---|', ...['High', 'Medium', 'Low'].map(t => `| ${t} | ${(rel[t] || { n:0 }).n} | ${(rel[t] || { ok:0 }).ok} | ${pc((rel[t] || { ok:0 }).ok, (rel[t] || { n:0 }).n)} |`)].join('\n');
const worst = fails.filter(f => f[0] !== 'R1').concat(fails.filter(f => f[0] === 'R1')).slice(0, 20).map(f => `| ${f[0]} | ${f[1]} | ${f[2]} | ${f[3].replace(/\|/g, '/')} |`);
const md = `## Engine, set ${SET} (seed ${SEED}), ${today}, commit ${commit}\n\n${gold.docs.length} documents (${html.length} HTML read in Chromium). Codes: R1 unknown label or not found, R2 wrong period or value, R3 decoy filled, R4 unit or scale, R5 reader failure, R6 structure or extra field, R7 right value at too low a tier.\n\n${head}\n\nFailures by code: ${JSON.stringify(R)}\n\n### Tier reliability\n\n${relT}\n\n### By format\n\n${table('format', 'Format')}\n\n### By document type\n\n${table('type', 'Type')}\n\n### By field family (form section)\n\n${table('family', 'Section')}\n\n### By mutation (fuzz set: shuffle and decoys, European numbers, unseen synonyms)\n\n${table('mutation', 'Mutation')}\n\n### By trap\n\n${table('trap', 'Trap (documents that carry it)')}\n\n### By layout (where the value was found)\n\n| Layout | Proposals | Wrong at High or Medium |\n|---|---|---|\n${Object.entries(by.via).sort().map(([n, o]) => `| ${n} | ${o.props} | ${o.wrong} |`).join('\n')}\n\n### The 20 worst failures\n\n| Code | File | Field | Detail |\n|---|---|---|---|\n${worst.join('\n')}\n`;
writeSection(`engine-${SET}`, md);
console.log(head.split('\n').slice(2).map(l => l.replace(/^\| |\|$/g, '').replace(/ \| /g, ': ').replace(/: ([^:]*)$/, '  (target $1)')).join('\n'));
console.log('failures by code', R);
process.exitCode = T.High.n && T.High.ok / T.High.n < 0.98 ? 1 : 0;
