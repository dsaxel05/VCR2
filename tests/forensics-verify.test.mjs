// Importer findings FV-03 to FV-07 of the independent review (key-2 forensics check).
// Hand-built files with known answers.
//   node tests/forensics-verify.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
const names = r => r.ledger.customers.map(c => c.name);

/* FV-03: a totals row in other wording is dropped when it equals the column sum, and a customer called "Total ..." is kept. */
const base = 'customer,2025-01,2025-02,2025-03,2025-04\nAlpha,100,110,120,130\nBeta,200,210,220,230\nGamma,50,50,60,60\n';
const tg = parseLedger(base + 'Total général,350,370,400,420\n');
ok('FV-03 parses', tg.ok, tg.error);
eq('FV-03 "Total général" is not a customer', tg.ok ? names(tg) : null, ['Alpha', 'Beta', 'Gamma']);
ok('FV-03 and the file says so', tg.ok && tg.warnings.some(w => /Total général/.test(w) && /sum of the other rows/.test(w)), tg.warnings);
const tu = parseLedger(base + 'TOTAL USD,350,370,400,420\n');
eq('FV-03 "TOTAL USD" is not a customer', tu.ok ? names(tu) : null, ['Alpha', 'Beta', 'Gamma']);
const tl = parseLedger(base + 'Total Logistics,40,45,45,50\n');
eq('FV-03 a customer named "Total Logistics" stays', tl.ok ? names(tl) : null, ['Alpha', 'Beta', 'Gamma', 'Total Logistics']);

/* FV-04: dot thousands in an integers-only tab file. */
const dt = parseLedger('customer\t2025-01\t2025-02\t2025-03\nAlpha\t1.200\t1.300\t1.350\nBeta\t15.000\t15.500\t16.000\nGamma\t980\t990\t1.010\n');
ok('FV-04 parses', dt.ok, dt.error);
eq('FV-04 "1.200" and "15.000" are thousands', dt.ok ? dt.ledger.customers.find(c => c.name === 'Beta').mrr : null, [15000, 15500, 16000]);
ok('FV-04 with a warning', dt.ok && dt.warnings.some(w => /European/.test(w)), dt.warnings);
const dd = parseLedger('customer,2025-01,2025-02,2025-03\nAlpha,1.2,1.3,1.35\nBeta,0.98,0.99,1.01\nGamma,0.5,0.52,0.54\n');
eq('FV-04 real decimals are not thousands', dd.ok ? dd.ledger.customers[0].mrr : null, [1.2, 1.3, 1.35]);

/* FV-07: one decimal comma in a side column does not turn a US file European. */
const us = parseLedger('customer,rating,2025-01,2025-02,2025-03\nAlpha,"4,5","1,234","1,300","1,350"\nBeta,"3,8","2,100","2,200","2,300"\nGamma,"4,1","1,500","1,550","1,600"\nDelta,"4,0","900","950","1,000"\n');
ok('FV-07 parses', us.ok, us.error);
eq('FV-07 "1,234" is 1234 in a US file', us.ok ? us.ledger.customers.find(c => c.name === 'Alpha').mrr : null, [1234, 1300, 1350]);

/* FV-05: the monthly financials file reads day-first dates once per column. */
const rowsDmy = [];
for (let m = 1; m <= 6; m++) rowsDmy.push('01/' + String(m).padStart(2, '0') + '/2025,' + (10000 + m * 500) + ',' + (200000 - m * 15000) + ',15000');
const sd = parseSeries('month,revenue,cash,burn\n' + rowsDmy.join('\n'));
ok('FV-05 parses', sd.ok, sd.error);
eq('FV-05 six distinct months, not one', sd.ok ? sd.series.months : null, ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06']);
const collapsed = parseSeries('month,revenue,burn\n01/01/2025,10000,5000\n01/01/2025,11000,5000\n01/01/2025,12000,5000\n01/01/2025,13000,5000\n');
ok('FV-05 dates that all read as one month are refused', !collapsed.ok && /three different months/.test(collapsed.error), collapsed);

/* FV-06: a cash-flow column that is positive every month is a company that makes cash, not one that burns. */
const cf = parseSeries('month,revenue,net cash flow\n2025-01,50000,20000\n2025-02,52000,22000\n2025-03,55000,25000\n2025-04,57000,28000\n');
ok('FV-06 parses', cf.ok, cf.error);
ok('FV-06 burn is negative every month', cf.ok && cf.series.burn.every(v => v != null && v < 0), cf.ok ? cf.series.burn : cf.error);
const cf2 = parseSeries('month,revenue,net cash flow\n2025-01,50000,-20000\n2025-02,52000,-22000\n2025-03,55000,-25000\n');
ok('FV-06 outflows are still burn', cf2.ok && cf2.series.burn.every(v => v > 0), cf2.ok ? cf2.series.burn : cf2.error);
const bn = parseSeries('month,revenue,burn\n2025-01,50000,-20000\n2025-02,52000,-22000\n2025-03,55000,-25000\n');
ok('FV-06 a burn column written with minus signs is still read as outflows, with a note', bn.ok && bn.series.burn.every(v => v > 0) && bn.warnings.some(w => /all negative/.test(w)), bn);

/* FV-02: 13 months of annual invoices cannot show last year's ARR, growth or retention. */
const inv = (months, n) => { const out = ['customer,month,amount']; for (let i = 0; i < n; i++) for (let k = i % 12; k < months; k += 12) out.push('C' + i + ',' + monthAdd('2024-01', k) + ',' + (12000 + i * 100)); return out.join(String.fromCharCode(10)); };
const i13 = parseLedger(inv(13, 30));
ok('FV-02 13 months of invoices parse', i13.ok, i13.error);
const A13 = i13.ok ? ledgerAnalytics(i13.ledger) : null;
ok('FV-02 opening is flagged unknown', A13 && A13.openingKnown === false && A13.nrrCohort == null && A13.grrCohort == null, A13 && [A13.openingKnown, A13.nrrCohort]);
const P13 = A13 ? ledgerPrimitives(A13) : {};
ok('FV-02 no prior-year figure is exported to the form', P13.arr_12mo == null && P13.customers_12mo == null && P13.new_arr_l12 == null && P13.churned_arr_l12 == null, P13);
ok('FV-02 today and concentration still are', P13.arr_now > 0 && P13.customers_now > 0 && P13.top1_pct > 0, P13);
const i25 = parseLedger(inv(25, 30));
const A25 = i25.ok ? ledgerAnalytics(i25.ledger) : null;
ok('FV-02 25 months of invoices keep the opening', A25 && A25.openingKnown === true && ledgerPrimitives(A25).arr_12mo > 0, A25 && A25.openingKnown);

/* FV-08: numbered accounts of an anonymised export are not duplicates; a real near-duplicate still is. */
const nl = String.fromCharCode(10);
const numbered = ['customer,2025-01,2025-02,2025-03,2025-04'];
for (let i = 1; i <= 30; i++) numbered.push('Customer ' + String(i).padStart(4, '0') + ',' + (1000 + i * 10) + ',' + (1000 + i * 10) + ',' + (1100 + i * 10) + ',' + (1100 + i * 10));
const dn = ledgerAnalytics(parseLedger(numbered.join(nl)).ledger).forensics.find(f => f.id === 'dupes');
ok('FV-08 numbered customers are not duplicates', dn.status === 'pass', dn);
const real = numbered.concat(['Acme Industries,5000,5000,5000,5000', 'Acme Industriez,5000,5000,5000,5000']);
const dr = ledgerAnalytics(parseLedger(real.join(nl)).ledger).forensics.find(f => f.id === 'dupes');
ok('FV-08 a one-letter typo billed in the same months is still found', dr.status === 'warn', dr);

/* FV-18: the Benford test applies only to 300+ distinct values over 1.3 orders of magnitude; the earlier generators never reached
   it, so its false-alarm rate was never measured. 600 clean customers with a wide lognormal price spread, 40 seeds. */
let bfNa = 0, bfWarn = 0;
for (let s = 1; s <= 40; s++) {
  const rand = mulberry32(500 + s), months = Array.from({ length:24 }, (_, k) => monthAdd('2024-09', k)), rows = [];
  for (let i = 0; i < 600; i++) { const p = Math.max(10, Math.round(Math.exp(Math.log(1500) + 1.3 * gauss(rand)) / 10) * 10); rows.push('C' + i + ',' + months.map((m, k) => k < 2 + (i % 5) ? 0 : p).join(',')); }
  const f = ledgerAnalytics(parseLedger('customer,' + months.join(',') + nl + rows.join(nl)).ledger).forensics.find(x => x.id === 'benford');
  if (!f || f.status === 'na') bfNa++; else if (f.status === 'warn' || f.status === 'fail') bfWarn++;
}
ok('FV-18 the Benford test is actually applied to wide-spread clean ledgers', bfNa <= 4, bfNa);
ok('FV-18 and flags at most 10 % of them', bfWarn <= 4, bfWarn);
`;

runSuite('Forensics key-2 importer findings', TESTS);
