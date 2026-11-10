// Real-world regression (test plan 7.6): the Quillstone Health practice data room, read and filled by Smart fill.
//   node tests/smartfill-quillstone.test.mjs
// Targets: at least 85% of the gold fields proposed correctly, none wrong at High, no decoy filled, the ledger recognised,
// and the deck's NRR (128%) only in "NRR as stated". Every miss is listed with what was proposed instead.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appSource, installStubs, root } from './_harness.mjs';

installStubs();
(0, eval)(appSource() + '\n;globalThis.__q = { sfReadFile, sfExtract, sfResolveAll };');
const Q = join(root, 'tests', 'fixtures', 'quillstone'), G = JSON.parse(readFileSync(join(Q, 'gold.json'), 'utf8'));
const results = [], ok = (name, cond, got) => results.push({ name, ok:!!cond, got });
const eqv = (a, b) => typeof b === 'number' ? typeof a === 'number' && Math.abs(a - b) <= Math.max(Math.abs(b) * 0.006, 0.051) : a === b;
let gold = 0, right = 0, wrongHigh = 0; const misses = [], decoys = [], ex = [];
for (const d of G.docs) {
  const r = await globalThis.__q.sfReadFile(new Uint8Array(readFileSync(join(Q, d.file))), d.file);
  ok(`${d.file}: read`, r.ok, r.code);
  const e = globalThis.__q.sfExtract(r, { model:'saas' }); ex.push(e);
  if (d.ledger) { ok(`${d.file}: recognised as a customer ledger`, e.ledger, e.cls.type); continue; }
  if (d.series) continue;
  for (const [k, v] of Object.entries(d.fields)) {
    gold++; const p = e.proposals.find(x => x.field === k);
    if (p && eqv(p.value, v) && p.tier !== 'Low') right++; else misses.push(`${d.file} ${k}: want ${v}, got ${p ? `${p.value} (${p.tier})` : 'nothing'}`);
    if (p && !eqv(p.value, v) && p.tier === 'High') wrongHigh++;
  }
  for (const p of e.proposals) if (p.tier !== 'Low' && (d.must_not_fill.includes(p.field) || d.must_not_value.some(v => eqv(p.value, v)))) decoys.push(`${d.file} ${p.field} = ${p.value}`);
}
ok(`at least 85% of the gold fields proposed correctly (${right}/${gold})`, right / gold >= 0.85, misses);
ok('none wrong at High', wrongHigh === 0, wrongHigh);
ok('no decoy filled (forecasts, the August column, assumptions)', !decoys.length, decoys);
const deck = ex[0];
ok('the deck\'s NRR of 128% lands in "NRR as stated" only', deck.proposals.some(p => p.field === 'stated_nrr' && p.value === 128) && !deck.proposals.some(p => p.value === 128 && p.field !== 'stated_nrr'), deck.proposals.filter(p => p.value === 128).map(p => p.field));
const res = globalThis.__q.sfResolveAll(ex.filter((e, i) => !G.docs[i].ledger && !G.docs[i].series), 'saas');
ok('across the room: cash is the model\'s $9.4M at September 30', (res.rows.find(r => r.field === 'cash_on_hand') || {}).value === 9400000, (res.rows.find(r => r.field === 'cash_on_hand') || {}).value);

let failed = 0;
console.log('Smart fill on the Quillstone data room');
for (const t of results) { if (t.ok) console.log('  ✓', t.name); else { failed++; console.log('  ✗', t.name, '— got', JSON.stringify(t.got)); } }
if (misses.length) console.log('  misses: ' + misses.join('; '));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
