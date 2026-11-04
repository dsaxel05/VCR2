// Hostile-input limits for the parsers (red team 2026-11): each input is generated here and must be refused
// with a plain message, or finish inside a time budget. Excel cases need a browser: tests/browser/parser_limits_test.py.
//   node tests/security/parsers.test.mjs
import { runSuite } from '../_harness.mjs';

const TESTS = String.raw`
const LF = String.fromCharCode(10);
const timed = f => { const t = Date.now(); const r = f(); return { r, ms: Date.now() - t }; };
const BUDGET = 1500;

/* 1. A wide ledger full of rows named "Total n" was O(rows^2 x months). */
{
  let s = 'customer,2025-01,2025-02,2025-03' + LF;
  for (let i = 0; i < 12000; i++) s += 'Total ' + i + ',1,2,3' + LF;
  s += 'A,1,1,1' + LF + 'B,1,1,1' + LF + 'C,1,1,1' + LF;
  const { r, ms } = timed(() => parseLedger(s, 'mrr'));
  ok('P1-1 12,000 "Total" rows parse in under ' + BUDGET + ' ms (took ' + ms + ')', ms < BUDGET, ms);
  ok('P1-1 the real customers are still read', r.ok === true || /customers/.test(r.error), r.error);
}
{
  /* a real total row is still dropped */
  const r = parseLedger('customer,2025-01,2025-02,2025-03' + LF + 'A,10,10,10' + LF + 'B,20,20,20' + LF + 'C,30,30,30' + LF + 'Total général,60,60,60' + LF, 'mrr');
  ok('P1-1 a genuine total row is still dropped', r.ok && r.ledger.customers.length === 3, r.error);
}

/* 3. Ledgers with too many customers or cells are refused with a clear message. */
{
  let s = 'customer,month,mrr' + LF;
  for (let i = 0; i < 60000; i++) s += 'c' + i + ',2024-12,5' + LF;
  s += 'c0,2015-01,5' + LF + 'c1,2015-02,5' + LF + 'c2,2015-03,5' + LF;
  const { r, ms } = timed(() => parseLedger(s, 'mrr'));
  ok('P1-3 60,000 data rows are refused', r.ok === false && /rows|customers/i.test(r.error) && /50,000|20,000/.test(r.error), r.error);
  ok('P1-3 refusal is fast (' + ms + ' ms)', ms < BUDGET, ms);
}
{
  let s = 'customer,month,mrr' + LF;
  for (let i = 0; i < 25000; i++) s += 'c' + i + ',2024-12,5' + LF;
  s += 'c0,2015-01,5' + LF + 'c1,2015-02,5' + LF + 'c2,2015-03,5' + LF;
  const { r } = timed(() => parseLedger(s, 'mrr'));
  ok('P1-3 25,000 customers are refused', r.ok === false && /20,000/.test(r.error), r.error);
}
{
  let s = 'customer,month,mrr' + LF;
  for (let i = 0; i < 18000; i++) s += 'c' + i + ',2024-12,5' + LF;
  s += 'c0,2015-01,5' + LF + 'c1,2015-02,5' + LF + 'c2,2015-03,5' + LF;
  const { r } = timed(() => parseLedger(s, 'mrr'));
  ok('P1-3 18,000 customers x 120 months (over 2,000,000 cells) is refused', r.ok === false && /2,000,000/.test(r.error), r.error);
}
{
  let s = 'customer,' + Array.from({ length: 60 }, (_, k) => monthAdd('2021-01', k)).join(',') + LF;
  for (let i = 0; i < 2000; i++) s += 'cust' + i + ',' + Array.from({ length: 60 }, (_, k) => 100 + i % 7 + k).join(',') + LF;
  const { r, ms } = timed(() => parseLedger(s, 'mrr'));
  ok('P1-3 a realistic ledger (2,000 customers x 60 months) still loads', r.ok && r.ledger.customers.length === 2000, r.error);
  ok('P1-3 and loads in time (' + ms + ' ms)', ms < 3000, ms);
}

/* 2. Monthly financials: rows were looked up with find() once per month. */
{
  const dup = n => { let s = ['month,revenue,cash', '1990-01,1,1', '2099-12,1,1', '2025-01,1,1'].join(LF) + LF; for (let i = 0; i < n; i++) s += '2025-01,1,1' + LF; return s; };
  const big = timed(() => parseSeries(dup(80000)));
  ok('P1-2 80,000 rows are refused with a message', big.r.ok === false && /50,000/.test(big.r.error), big.r.error);
  ok('P1-2 refusal is fast (' + big.ms + ' ms)', big.ms < BUDGET, big.ms);
  const edge = timed(() => parseSeries(dup(45000)));
  ok('P1-2 45,000 rows across 1,320 months finish in under ' + BUDGET + ' ms (took ' + edge.ms + ')', edge.ms < BUDGET, edge.ms);
  const norm = parseSeries('month,revenue,cash' + LF + '2025-01,100,1000' + LF + '2025-02,110,900' + LF + '2025-03,120,800' + LF);
  ok('P1-2 a normal file still parses', norm.ok && norm.series.revenue.join() === '100,110,120', norm.error);
}

/* 7. JSON imports: deep nesting and huge payloads are refused before they are parsed. */
{
  const toasts = [];
  const realToast = toast, realPick = pickFile;
  toast = (m, t) => toasts.push(String(m));
  const run = (fn, text) => { pickFile = (acc, cb) => cb(text); toasts.length = 0; const t = Date.now(); try { fn(); } catch (e) { toasts.push('THROW ' + e); } return { ms: Date.now() - t, msg: toasts.join(' | ') }; };
  const deep = '['.repeat(2000000) + ']'.repeat(2000000);
  const lib = run(libImportJSON, '{"entries":[{"company":"A","metrics":{"arr":1},"payload":{"d":' + deep + '}}]}');
  ok('P1-7 library import with 2,000,000-deep JSON is refused plainly', /nested|deep/i.test(lib.msg), lib.msg);
  ok('P1-7 library refusal is fast (' + lib.ms + ' ms)', lib.ms < BUDGET, lib.ms);
  const asm = run(importAssessment, '{"payload":{"name":"x","vals":{},"junk":' + deep + '}}');
  ok('P1-7 assessment import with 2,000,000-deep JSON is refused plainly', /nested|deep/i.test(asm.msg), asm.msg);
  ok('P1-7 assessment refusal is fast (' + asm.ms + ' ms)', asm.ms < BUDGET, asm.ms);
  const huge = run(libImportJSON, '[' + ' '.repeat(31 * 1024 * 1024) + ']');
  ok('P1-7 a 31 MB JSON file is refused as too large', /too large|MB/i.test(huge.msg), huge.msg);
  const fine = run(libImportJSON, '{"entries":[{"company":"Acme","metrics":{"arr":1000000},"payload":{"a":{"b":{"c":[1,2,[3]]}}}}]}');
  ok('P1-7 an ordinary library file still imports', /1 entries restored/.test(fine.msg), fine.msg);
  toast = realToast; pickFile = realPick;
}
`;

runSuite('Parser limits (denial-of-service red team)', TESTS);
