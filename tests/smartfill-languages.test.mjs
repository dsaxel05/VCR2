// Smart fill in other languages: the Quillstone data room translated into Spanish, German, Italian, Portuguese, Dutch and
// French (tests/fixtures/quillstone-intl), local number formats and month names, same answers as the English original.
//   node tests/smartfill-languages.test.mjs
// Per language: at least 85% of the gold fields proposed correctly, none wrong at High, no decoy filled (forecasts, the
// August column), the ledger recognised by Smart fill and read with the same totals, the monthly financials read with the
// same form values. Plus the number grammar and month names on their own.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { appSource, installStubs, root } from './_harness.mjs';

installStubs();
(0, eval)(appSource() + '\n;globalThis.__q = { sfReadFile, sfExtract, sfNumbers, sfLang, parseMonth, parseLedger, ledgerAnalytics, ledgerPrimitives, parseSeries, seriesPrimitives };');
const q = globalThis.__q, results = [], ok = (name, cond, got) => results.push({ name, ok:!!cond, got });
const eqv = (a, b) => typeof b === 'number' ? typeof a === 'number' && Math.abs(a - b) <= Math.max(Math.abs(b) * 0.006, 0.051) : a === b;
const G = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'quillstone', 'gold.json'), 'utf8'));
const EN = join(root, 'tests', 'fixtures', 'quillstone'), INTL = join(root, 'tests', 'fixtures', 'quillstone-intl');
const enLed = q.ledgerPrimitives(q.ledgerAnalytics(q.parseLedger(readFileSync(join(EN, '04-customer-ledger.csv'), 'utf8'), 'mrr').ledger));
const enSer = q.seriesPrimitives(q.parseSeries(readFileSync(join(EN, '05-monthly-financials.csv'), 'utf8')).series);
const LANGS = { es:'es', de:'de', it:'it', pt:'pt', nl:'nl', fr:'fr' }, table = [];

for (const lang of Object.keys(LANGS).filter(l => !process.env.SF_LANGS || process.env.SF_LANGS.split(',').includes(l))) {
  const dir = join(INTL, lang), files = readdirSync(dir).sort(), pick = p => files.find(f => f.startsWith(p));
  let gold = 0, right = 0, wrongHigh = 0; const misses = [], decoys = [];
  for (const [i, d] of G.docs.slice(0, 3).entries()) {
    const file = pick('0' + (i + 1) + '-'), r = await q.sfReadFile(new Uint8Array(readFileSync(join(dir, file))), file);
    const e = q.sfExtract(r, { model:'saas' });
    if (i === 0) ok(`${lang}: the document language is detected`, q.sfLang(readFileSync(join(dir, file), 'utf8')) === LANGS[lang], q.sfLang(readFileSync(join(dir, file), 'utf8')));
    for (const [k, v] of Object.entries(d.fields)) {
      gold++; const p = e.proposals.find(x => x.field === k);
      if (p && eqv(p.value, v) && p.tier !== 'Low') right++; else misses.push(`${file} ${k}: want ${v}, got ${p ? `${p.value} (${p.tier})` : 'nothing'}`);
      if (p && !eqv(p.value, v) && p.tier === 'High') wrongHigh++;
    }
    for (const p of e.proposals) if (p.tier !== 'Low' && (d.must_not_fill.includes(p.field) || d.must_not_value.some(v => eqv(p.value, v)))) decoys.push(`${file} ${p.field} = ${p.value}`);
  }
  table.push([lang, right, gold]); if (misses.length) console.log(`  ${lang} misses: ` + misses.join('; '));
  ok(`${lang}: at least 85% of the gold fields proposed correctly (${right}/${gold})`, right / gold >= 0.85, misses);
  ok(`${lang}: none wrong at High`, wrongHigh === 0, misses);
  ok(`${lang}: no decoy filled (forecasts, the August column)`, !decoys.length, decoys);
  /* the customer ledger: Smart fill recognises it, and the ledger box reads the same totals as the English file */
  const lf = pick('04-'), lr = await q.sfReadFile(new Uint8Array(readFileSync(join(dir, lf))), lf);
  ok(`${lang}: Smart fill recognises the ledger (month headers in ${lang})`, q.sfExtract(lr, { model:'saas' }).ledger, q.sfExtract(lr, { model:'saas' }).cls);
  const L = q.parseLedger(readFileSync(join(dir, lf), 'utf8'), 'mrr');
  const P = L.ok ? q.ledgerPrimitives(q.ledgerAnalytics(L.ledger)) : {};
  ok(`${lang}: the ledger gives the same form values as the English one`, L.ok && Object.keys(enLed).every(k => eqv(P[k], enLed[k])), L.ok ? P : L.error);
  /* the monthly financials: headers and months in the language, the same form values */
  const sf = pick('05-'), S2 = q.parseSeries(readFileSync(join(dir, sf), 'utf8'));
  const SP = S2.ok ? q.seriesPrimitives(S2.series) : {};
  ok(`${lang}: the monthly financials give the same form values (${Object.keys(enSer).length})`, S2.ok && Object.keys(enSer).every(k => eqv(SP[k], enSer[k])), S2.ok ? SP : S2.error);
}

/* numbers and dates on their own */
const one = (t, lang) => { const n = q.sfNumbers(t, { locale:'eu', lang }); return n.length === 1 ? n[0].value : n.map(x => x.value); };
const cases = [
  ['15,6 millones de dólares', 'es', 15.6e6], ['500 mil €', 'es', 500e3], ['R$ 12 mi', 'pt', 12e6], ['US$ 15,6 milhões', 'pt', 15.6e6],
  ['15,6 Mio. $', 'de', 15.6e6], ['1,2 Mrd. €', 'de', 1.2e9], ['250 Tsd. €', 'de', 250e3], ['15,6 mln $', 'it', 15.6e6], ['2 miliardi', 'it', 2e9],
  ['$15,6 mln', 'nl', 15.6e6], ['3 miljoen', 'nl', 3e6], ['15,6 M€', 'fr', 15.6e6], ['9 meses', 'es', 9], ['etwa 12 Monate', 'de', 12],
];
for (const [t, lang, want] of cases) ok(`number: "${t}" is ${want}`, eqv(one(t, lang), want), one(t, lang));
for (const t of ['30 de septiembre de 2026', '30. September 2026', '30 settembre 2026', '30 de setembro de 2026', '30 september 2026', '1er octobre 2026', 'T3 2026'])
  ok(`date: "${t}" holds no figure`, q.sfNumbers(t, { locale:'eu' }).length === 0, q.sfNumbers(t, { locale:'eu' }).map(x => x.raw));
const months = [['dic-25', '2025-12'], ['Mär 25', '2025-03'], ['mag-26', '2026-05'], ['out/24', '2024-10'], ['mrt-25', '2025-03'], ['févr. 26', '2026-02'], ['ene-25', '2025-01'], ['Okt 24', '2024-10'], ['set-25', '2025-09'], ['mei-25', '2025-05']];
for (const [h, want] of months) ok(`month: "${h}" is ${want}`, q.parseMonth(h) === want, q.parseMonth(h));

/* second set: a monthly management report per language (other company, other wording, a budget column and a target as
   decoys). First measured at 5 to 10 of 10 with wrong values (dot thousands read as decimals, "30 de junio" read as 30,
   "ventas y marketing" cut at "y", a sentence's full stop taken by a scale word); those causes were fixed in the rules, so
   this set is now a regression check, not a blind one. A field counts under its own name or as the company's claim. */
const HO = { arr_now:6480000, arr_12mo:3120000, gross_margin:76, customers_now:131, customers_12mo:84, headcount_now:37, headcount_12mo:22, cash_on_hand:4200000, net_burn:310000, sm_spend_l12:1900000 };
const HO_CLAIM = { arr_now:'stated_arr', customers_now:'stated_customers' }, HO_DECOY = [7000000, 78, 150, 40, 12000000];
const hoTable = [];
for (const file of readdirSync(join(INTL, 'heldout')).sort()) {
  const lang = file.slice(0, 2), r = await q.sfReadFile(new Uint8Array(readFileSync(join(INTL, 'heldout', file))), file), e = q.sfExtract(r, { model:'saas' });
  let right = 0, wrong = 0; const miss = [];
  for (const [k, v] of Object.entries(HO)) {
    const p = e.proposals.find(x => x.field === k || x.field === HO_CLAIM[k]);
    if (p && eqv(p.value, v) && p.tier !== 'Low') right++; else miss.push(`${k}: ${p ? p.value + ' (' + p.tier + ')' : 'nothing'}`);
    if (p && !eqv(p.value, v) && p.tier !== 'Low') wrong++;
  }
  const decoys = e.proposals.filter(p => p.tier !== 'Low' && HO_DECOY.some(v => eqv(p.value, v))).map(p => `${p.field}=${p.value}`);
  hoTable.push(`${lang} ${right}/${Object.keys(HO).length}`); if (miss.length) console.log(`  held-out ${lang} misses: ` + miss.join('; '));
  ok(`held out, ${lang}: at least 70% of the fields (${right}/${Object.keys(HO).length})`, right / Object.keys(HO).length >= 0.7, miss);
  ok(`held out, ${lang}: nothing wrong at High or Medium, no decoy`, !wrong && !decoys.length, { miss, decoys });
}

/* blind: investor-update e-mails per language (bullets, another company), written last and first measured with no change
   to the rules: 54/60 right, 0 wrong, 0 decoys (2026-11-12; the miss was "una ronda de 5 M$" in every language, added
   since). Kept as a regression check: at least 80% per language, nothing wrong, none of the four decoys. */
const BL = { arr_now:2400000, stated_growth:140, gross_margin:68, net_burn:180000, cash_on_hand:2900000, stated_runway:16, customers_now:57, stated_nrr:112, headcount_now:19, round_size:5000000 };
const BL_TWIN = { arr_now:'stated_arr', customers_now:'stated_customers' }, BL_DECOY = [2100000, 4000000, 25, 200000], blTable = [];
for (const file of readdirSync(join(INTL, 'blind')).sort()) {
  const lang = file.slice(0, 2), r = await q.sfReadFile(new Uint8Array(readFileSync(join(INTL, 'blind', file))), file), e = q.sfExtract(r, { model:'saas' });
  let right = 0, wrong = 0; const miss = [];
  for (const [k, v] of Object.entries(BL)) {
    const p = e.proposals.find(x => x.field === k || x.field === BL_TWIN[k]);
    if (p && eqv(p.value, v) && p.tier !== 'Low') right++; else miss.push(`${k}: ${p ? p.value + ' (' + p.tier + ')' : 'nothing'}`);
    if (p && !eqv(p.value, v) && p.tier !== 'Low') wrong++;
  }
  const decoys = e.proposals.filter(p => p.tier !== 'Low' && BL_DECOY.some(v => eqv(p.value, v))).map(p => `${p.field}=${p.value}`);
  blTable.push(`${lang} ${right}/10`);
  ok(`blind, ${lang}: at least 80% of the fields (${right}/10)`, right >= 8, miss);
  ok(`blind, ${lang}: nothing wrong, no decoy (last month, the year-end target, market growth, the budget)`, !wrong && !decoys.length, { miss, decoys });
}

let failed = 0;
console.log('Smart fill in six other languages (Quillstone, translated)');
for (const t of results) { if (t.ok) console.log('  ✓', t.name); else { failed++; console.log('  ✗', t.name, '— got', JSON.stringify(t.got).slice(0, 600)); } }
console.log('  per language, gold fields right: ' + table.map(([l, r, g]) => `${l} ${r}/${g}`).join(', '));
console.log('  second set (management reports), per language: ' + hoTable.join(', '));
console.log('  blind set (update e-mails), per language: ' + blTable.join(', '));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
