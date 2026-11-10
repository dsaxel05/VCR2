// Smart fill resolution, cross-checks, apply and undo (E7 to E9).
//   node tests/smartfill-resolve.test.mjs
import { appSource, installStubs } from './_harness.mjs';

installStubs();
(0, eval)(appSource() + '\n;globalThis.__r = { sfReadFile, sfExtract, sfResolveAll, sfApply, sfUndo, sfWhyEmpty, restorePayload, draftPayload, blankState, get S() { return S; }, set S(v) { S = v; } };');
const R = globalThis.__r, results = [], ok = (name, cond, got) => results.push({ name, ok:!!cond, got });
const sheet = (file, sheetName, rows) => ({ ok:true, file, doc:{ file, kind:'xlsx', notes:[], blocks:[{ type:'table', rows, loc:sheetName, hints:{ sheet:sheetName } }] } });
const lines = (file, text, kind) => ({ ok:true, file, doc:{ file, kind:kind || 'md', notes:[], blocks:text.split('\n').map((l, i) => { const m = /^(.+?): (.+)$/.exec(l); return m ? { type:'kv', text:l, rows:[[m[1], m[2]]], loc:`line ${i + 1}`, hints:{} } : { type:'para', text:l, loc:`line ${i + 1}`, hints:{} }; }) } });
const X = (...docs) => docs.map(d => R.sfExtract(d, { model:'saas' }));
const row = (res, id) => res.rows.find(r => r.field === id);

/* ── priority, conflicts, agreement, age ── */
const model = sheet('financial-model.xlsx', 'P&L', [['Metric', 'LTM 2026-09-30 (actual)'], ['Cash and equivalents (closing)', '4,200,000'], ['Net burn (monthly average)', '310,000'], ['Gross burn (monthly average)', '520,000']]);
const bank = lines('bank-statement.pdf', 'Business checking: account statement\nStatement period: 2026-09-01 to 2026-09-30\nAvailable balance (excluding restricted cash): 3,950,000.00', 'pdf');
let res = R.sfResolveAll(X(model, bank), 'saas');
ok('the bank record wins over the model for cash', row(res, 'cash_on_hand') && row(res, 'cash_on_hand').value === 3950000 && row(res, 'cash_on_hand').file === 'bank-statement.pdf', row(res, 'cash_on_hand'));
ok('and the row says another value exists', /other value/.test((row(res, 'cash_on_hand').why || []).join(' ')), row(res, 'cash_on_hand').why);
const model2 = sheet('model-v2.xlsx', 'P&L', [['Metric', 'LTM 2026-09-30 (actual)'], ['Cash and equivalents (closing)', '3,100,000']]);
res = R.sfResolveAll(X(model, model2), 'saas');
ok('two confident sources of the same standing that disagree make a Conflict and fill nothing', res.conflicts.some(c => c.field === 'cash_on_hand') && !row(res, 'cash_on_hand'), [res.conflicts.map(c => c.field), row(res, 'cash_on_hand')]);
ok('the Conflict shows both sources', res.conflicts.find(c => c.field === 'cash_on_hand').sources.map(s => s.file).sort().join() === 'financial-model.xlsx,model-v2.xlsx');
const upd = lines('investor-update.md', 'Hi all\nCash as of 2026-09-30: $4,200,000\nNet burn: $310k per month');
res = R.sfResolveAll(X(upd), 'saas');
ok('alone, cash from an investor update is Medium', row(res, 'cash_on_hand').tier === 'Medium', row(res, 'cash_on_hand').tier);
res = R.sfResolveAll(X(upd, lines('cfo-reply.md', 'Dear investors\nCash as of 2026-09-30: $4,200,000')), 'saas');
ok('two documents that agree raise it to High, and say so', row(res, 'cash_on_hand').tier === 'High' && /documents agree/.test(row(res, 'cash_on_hand').why.join(' ')), row(res, 'cash_on_hand'));
const old = sheet('model-2024.xlsx', 'P&L', [['Metric', 'FY2024 (actual)'], ['Gross margin', '61%']]), cur = lines('update.md', 'Hi all\nStatement period: 2026-09\nNPS: 41');
res = R.sfResolveAll(X(old, cur), 'saas');
ok('a document much older than the newest one only suggests (Low)', row(res, 'gross_margin') && row(res, 'gross_margin').tier === 'Low' && /older document/.test(row(res, 'gross_margin').why.join(' ')), row(res, 'gross_margin'));
const shuffled = X(bank, model, upd), straight = X(model, upd, bank);
ok('the drop order never changes the result', JSON.stringify(R.sfResolveAll(shuffled, 'saas').rows.map(r => [r.field, r.value, r.tier, r.file])) === JSON.stringify(R.sfResolveAll(straight, 'saas').rows.map(r => [r.field, r.value, r.tier, r.file])));

/* ── cross-checks before writing: a failed check lowers the tier and says why ── */
const bad = sheet('kpis.xlsx', 'KPIs', [['Metric', 'Actual'], ['Largest customer share', '30%'], ['Top 5 customers share', '25%'], ['Top 10 customers share', '40%'], ['Net burn', '600,000'], ['Gross burn', '400,000'],
  ['Engineering headcount', '30'], ['Sales headcount', '20'], ['Headcount', '40']]);
res = R.sfResolveAll(X(bad), 'saas');
ok('top 1 above top 5 is flagged', (row(res, 'top1_pct').inconsistent || []).length && row(res, 'top1_pct').tier !== 'High', row(res, 'top1_pct'));
ok('net burn above gross burn is flagged', (row(res, 'net_burn').inconsistent || []).length > 0, row(res, 'net_burn'));
ok('engineering plus sales above the whole team is flagged', (row(res, 'headcount_now').inconsistent || []).length > 0, row(res, 'headcount_now'));
const wf = sheet('bridge.xlsx', 'ARR bridge', [['Metric', 'LTM (actual)'], ['Opening ARR', '1,000,000'], ['New-logo ARR', '500,000'], ['Expansion ARR', '200,000'], ['Churned ARR', '(100,000)'], ['Contraction ARR', '(50,000)'], ['Closing ARR', '1,550,000']]);
res = R.sfResolveAll(X(wf), 'saas');
ok('an ARR bridge that adds up passes', !row(res, 'arr_now').inconsistent && row(res, 'arr_now').tier === 'High', row(res, 'arr_now'));
const wf2 = sheet('bridge.xlsx', 'ARR bridge', [['Metric', 'LTM (actual)'], ['Opening ARR', '1,000,000'], ['New-logo ARR', '500,000'], ['Expansion ARR', '200,000'], ['Churned ARR', '(100,000)'], ['Contraction ARR', '(50,000)'], ['Closing ARR', '1,900,000']]);
res = R.sfResolveAll(X(wf2), 'saas');
ok('an ARR bridge that does not add up is flagged on every line', ['arr_now', 'new_arr_l12', 'churned_arr_l12'].every(id => (row(res, id).inconsistent || []).some(w => /do not add up/.test(w))), row(res, 'arr_now'));
const claim = R.sfResolveAll(X(lines('pitch-deck.md', 'Traction\nARR: $15.6M'), sheet('model.xlsx', 'ARR bridge', [['Metric', 'LTM (actual)'], ['Closing ARR', '12,100,000']])), 'saas');
ok('a claim that differs from the evidence is kept on both fields (that difference is the point)', row(claim, 'stated_arr').value === 15.6e6 && row(claim, 'arr_now').value === 12.1e6 && !row(claim, 'arr_now').inconsistent, [row(claim, 'stated_arr'), row(claim, 'arr_now')]);

/* ── why an empty field stayed empty ── */
const trap = lines('deck.md', 'Market\nArcwell, our closest competitor, reports $40M ARR.\nTarget: 2,000 customers by 2028.');
const tx = X(trap); res = R.sfResolveAll(tx, 'saas');
ok('empty field: a target or competitor figure is named as the reason', /target, forecast, competitor or market/.test(R.sfWhyEmpty('customers_now', res, tx, 'saas')) || /target, forecast, competitor or market/.test(R.sfWhyEmpty('stated_customers', res, tx, 'saas')), R.sfWhyEmpty('stated_customers', res, tx, 'saas'));
ok('empty field: a field of another business model says so', /business model/.test(R.sfWhyEmpty('gmv_now', res, tx, 'saas')));
ok('empty field: the investor\'s own assumptions are never filled from documents', /assumption/.test(R.sfWhyEmpty('target_irr', res, tx, 'saas')));
ok('empty field: nothing found', /no candidate/.test(R.sfWhyEmpty('patents', res, tx, 'saas')));

/* ── apply and undo ── */
R.S = R.blankState();
R.S.vals.net_burn = '999';   /* typed by the user */
R.S.vals.customers_now = '300'; R.S.prov.customers_now = { src:'ledger', line:'from the ledger' };
res = R.sfResolveAll(X(model, bank, sheet('kpi.xlsx', 'KPIs', [['Metric', 'Actual'], ['Customers', '280'], ['Win rate', '24%']]), lines('security.md', 'SOC 2: Type II report issued in March 2026.\nThere is no pending litigation against the Company.')), 'saas');
const pick = res.rows.filter(r => r.tier !== 'Low');
let out = R.sfApply(pick);
ok('apply: values written with their source', R.S.vals.cash_on_hand === '3950000' && R.S.prov.cash_on_hand.src === 'smartfill' && R.S.prov.cash_on_hand.file === 'bank-statement.pdf' && R.S.prov.cash_on_hand.line.length <= 160, [R.S.vals.cash_on_hand, R.S.prov.cash_on_hand]);
ok('apply: the evidence tag follows the document (bank record)', R.S.evid.cash_on_hand === 'bank', R.S.evid.cash_on_hand);
ok('apply: yes/no and choice fields', R.S.sel.soc2 === 'Type II' && R.S.bools.litigation === false, [R.S.sel.soc2, R.S.bools.litigation]);
ok('apply: a value the user typed is kept', R.S.vals.net_burn === '999' && out.skipped.some(s => s[0] === 'net_burn'), out.skipped);
ok('apply: a value from the ledger is never replaced', R.S.vals.customers_now === '300' && R.S.prov.customers_now.src === 'ledger', R.S.vals.customers_now);
const again = R.sfResolveAll(X(model), 'saas').rows.filter(r => r.field === 'net_burn').map(r => Object.assign(r, { overwrite:true }));
R.sfApply(again);
ok('apply: "overwrite" replaces a typed value when the user ticks it', R.S.vals.net_burn === '310000', R.S.vals.net_burn);
const saved = JSON.parse(JSON.stringify(R.draftPayload())); R.restorePayload(saved);
ok('the Smart fill source survives the draft (file, location, snippet only)', R.S.prov.cash_on_hand && R.S.prov.cash_on_hand.src === 'smartfill' && !('text' in R.S.prov.cash_on_hand), R.S.prov.cash_on_hand);
ok('no document text is stored in the draft', !JSON.stringify(saved).includes('Business checking'), '');
R.S = R.blankState(); R.S.vals.net_burn = '999';
R.sfApply(R.sfResolveAll(X(model, bank), 'saas').rows);
const n = R.sfUndo();
ok('undo: everything Smart fill wrote is gone, the typed value is back', n > 0 && R.S.vals.cash_on_hand == null && R.S.prov.cash_on_hand == null && R.S.vals.net_burn === '999', [n, R.S.vals]);
ok('undo twice does nothing', R.sfUndo() === 0);

/* ── determinism (test plan): every fixture read, extracted and resolved in three shuffled orders gives the same result ── */
{
  const { readFileSync, readdirSync } = await import('node:fs'), { join } = await import('node:path'), { root } = await import('./_harness.mjs');
  const D = join(root, 'tests', 'fixtures', 'smartfill'), ex = [];
  for (const f of readdirSync(D).filter(f => !/\.json$|^adv-|html?$/.test(f)).sort()) { const r = await R.sfReadFile(new Uint8Array(readFileSync(join(D, f))), f); if (r.ok && !r.children) ex.push(R.sfExtract(r, { model:'saas' })); }
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const canon = res => JSON.stringify(res.rows.map(r => [r.field, r.value, r.tier, r.file, r.loc]).sort((a, b) => a[0] < b[0] ? -1 : 1)) + JSON.stringify(res.conflicts.map(c => c.field).sort());
  const base = canon(R.sfResolveAll(ex, 'saas')), outs = [1, 2, 3].map(() => canon(R.sfResolveAll(shuffle(ex), 'saas')));
  ok(`determinism: ${ex.length} documents in 3 shuffled orders give the same fields, values, tiers and sources`, ex.length >= 15 && outs.every(o => o === base), outs.map(o => o === base));
}

let failed = 0;
console.log('Smart fill resolution, checks, apply and undo');
for (const t of results) { if (t.ok) console.log('  ✓', t.name); else { failed++; console.log('  ✗', t.name, '— got', JSON.stringify(t.got)); } }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
