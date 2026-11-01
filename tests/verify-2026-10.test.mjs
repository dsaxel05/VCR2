// Full verification of 2026-10-31: engine regressions
//   node tests/verify-2026-10.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
{
/* A value below a limit with no upper end is reported in words, never as "outside 0 to Infinity". */
S = blankState(); S.stage = 'a'; S.model = 'saas';
S.vals = { safes_outstanding:'-5', debt_outstanding:'-1', round_size:'5000000', round_pre_money:'20000000' };
const fx = dealInputs().fixes;
ok('a negative SAFE amount is reported as below 0', fx.some(x => /SAFEs outstanding was -5, below 0; 0 was used\./.test(x)), fx);
ok('no limit note mentions Infinity', fx.every(x => !/Infinity/.test(x)), fx);
S.vals = { round_size:'5000000', round_pre_money:'20000000', new_pref_multiple:'40' };
const fx2 = dealInputs().fixes;
ok('a value above a real upper limit still names the range', fx2.every(x => !/Infinity/.test(x)), fx2);

/* The shared reader that typed figures now go through. */
[['98,8', 98.8], ['98.8', 98.8], ['1 200 000', 1200000], ['1 200 000', 1200000], ['12%', 12], ['75 %', 75], ['4,200,000', 4200000],
 ['-5', -5], ['(5)', -5], ['1.2M', 1200000], ['250k', 250000], ['0,125', 0.125], ['1e15', 1e15]].forEach(([t, v]) => eq('read ' + JSON.stringify(t), parseNum(t), v));
ok('"1,200" is ambiguous and is not guessed', numberAmbiguity('1,200') && numberAmbiguity('1.200'));
eq('a leading zero group is a decimal in every convention', [parseNum('0,125'), parseNum('0.125', 'eu'), parseNum('€0.125'), numberAmbiguity('0,125')], [0.125, 0.125, 0.125, false]);
eq('thousands groups are still read as thousands', [parseNum('1,234,567'), parseNum('1.234.567'), parseNum('1.200', 'eu'), parseNum('€1.200')], [1234567, 1234567, 1200, 1200]);
/* A ledger in two currencies is not summed silently. */
const hdr = 'customer,' + Array.from({ length:13 }, (_, k) => monthAdd('2025-01', k)).join(',') + '\n';
const row = (n, v) => n + ',' + Array(13).fill(v).join(',');
const mixed = parseLedger(hdr + [row('A', '$100'), row('B', '€200'), row('C', '$300')].join('\n'), 'mrr');
ok('mixed $ and € amounts: a warning says they were added without conversion', mixed.ok && mixed.warnings.some(w => /more than one currency \(\$ €\)/.test(w)), mixed.warnings);
const one = parseLedger(hdr + [row('A', '$100'), row('B', 'USD 200'), row('C', '$300')].join('\n'), 'mrr');
ok('one currency written two ways gives no currency warning', one.ok && !one.warnings.some(w => /currency/.test(w)), one.warnings);
const named = parseLedger(hdr + [row('Cash $ Co', '100'), row('B', '200'), row('€uro Ltd', '300')].join('\n'), 'mrr');
ok('a currency sign in a customer name is not mistaken for an amount', named.ok && !named.warnings.some(w => /currency/.test(w)), named.warnings);
const xl = parseLedger('customer,' + Array.from({ length:13 }, (_, k) => 45658 + k * 31).join(',') + '\n' + [row('A', 100), row('B', 200), row('C', 300)].join('\n'), 'mrr');
ok('Excel serial dates as month headers are read', xl.ok && xl.ledger.months.length >= 12, xl.error || xl.ledger.months);
['abc', '12..5', '--3', '1,2,3,4'].forEach(t => eq('not a number: ' + t, parseNum(t), null));
}
`;

runSuite('Verification 2026-10-31: limit wording and typed numbers', TESTS);
