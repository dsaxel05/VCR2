// File importers: the six data-integrity bugs found by the 2026-10-04 forensics audit
//, plus parser sanity.
// Each case is built by hand so the expected result is known without running the engine.
//   node tests/importers.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
const ledger = (csv, unit) => { const r = parseLedger(csv, unit); return r; };
const row = (r, name) => r.ledger.customers.find(c => c.name === name).mrr;

/* FOR-02: European number formats. A lone "." followed by exactly three digits is a thousands separator
   when the file uses ";" as delimiter or decimal commas elsewhere. */
const eu = ledger('customer;2025-01;2025-02;2025-03\nAlpha;1.200;1.300;1.350\nBeta;980;990;1.010\nGamma;500;520;540\n');
ok('FOR-02 parses', eu.ok, eu.error);
eq('FOR-02 "1.200" in a semicolon file is 1,200', eu.ok ? row(eu, 'Alpha') : null, [1200, 1300, 1350]);
eq('FOR-02 "1.010" in the same file is 1,010', eu.ok ? row(eu, 'Beta') : null, [980, 990, 1010]);
const eu2 = ledger('customer;2025-01;2025-02;2025-03\nAlpha;1234,50;1300,25;1350,00\nBeta;980,10;990,20;1010,30\nGamma;500;520;540\n');
eq('FOR-02 decimal commas are kept', eu2.ok ? row(eu2, 'Alpha') : null, [1234.5, 1300.25, 1350]);
const us = ledger('customer,2025-01,2025-02,2025-03\nAlpha,"1,200","1,300","1,350"\nBeta,980,990,1010\nGamma,500,520,540\n');
eq('FOR-02 US thousands separators still work', us.ok ? row(us, 'Alpha') : null, [1200, 1300, 1350]);
const en = ledger('customer,2025-01,2025-02,2025-03\nAlpha,1.2,1.3,1.35\nBeta,0.98,0.99,1.01\nGamma,0.5,0.52,0.54\n');
eq('FOR-02 a comma file with decimal points is not read as thousands', en.ok ? row(en, 'Alpha') : null, [1.2, 1.3, 1.35]);

/* FOR-03: day-first dates, decided once per column. */
const long = (dates, name) => dates.map((d, i) => name + ',' + d + ',1000').join('\n');
const dayFirst = ledger('customer,month,mrr\n' + ['15/01/2025','05/02/2025','05/03/2025','15/04/2025','05/05/2025'].map(d => 'A,' + d + ',1000').join('\n')
  + '\n' + ['10/01/2025','10/02/2025','10/03/2025','10/04/2025','10/05/2025'].map(d => 'B,' + d + ',500').join('\n')
  + '\n' + ['20/01/2025','20/02/2025','20/03/2025','20/04/2025','20/05/2025'].map(d => 'C,' + d + ',200').join('\n'));
ok('FOR-03 parses', dayFirst.ok, dayFirst.error);
eq('FOR-03 five months, not a scrambled set', dayFirst.ok ? dayFirst.ledger.months : null, ['2025-01','2025-02','2025-03','2025-04','2025-05']);
eq('FOR-03 customer A has 1000 in every month', dayFirst.ok ? row(dayFirst, 'A') : null, [1000, 1000, 1000, 1000, 1000]);
const monthFirst = ledger('customer,month,mrr\nA,01/15/2025,1000\nA,02/05/2025,1000\nA,03/05/2025,1000\nB,01/10/2025,500\nB,02/10/2025,500\nB,03/10/2025,500\nC,01/20/2025,200\nC,02/20/2025,200\nC,03/20/2025,200\n');
eq('FOR-03 month-first columns are still month-first', monthFirst.ok ? monthFirst.ledger.months : null, ['2025-01','2025-02','2025-03']);
const ambiguous = ledger('customer,month,mrr\nA,01/02/2025,1000\nA,01/03/2025,1000\nA,01/04/2025,1000\nB,01/02/2025,500\nB,01/03/2025,500\nB,01/04/2025,500\nC,01/02/2025,200\nC,01/03/2025,200\nC,01/04/2025,200\n');
ok('FOR-03 an ambiguous date column carries a warning', ambiguous.ok && (ambiguous.warnings || []).some(w => /day|month|order/i.test(w)), ambiguous.warnings);

/* FOR-04: French abbreviated months, accents folded. */
const fr = ledger('client;janv. 2025;févr. 2025;mars 2025;avr. 2025;mai 2025;juin 2025;juil. 2025;août 2025;sept. 2025;oct. 2025;nov. 2025;déc. 2025\n'
  + 'Alpha;100;100;100;100;100;100;100;100;100;100;100;100\nBeta;50;50;50;50;50;50;50;50;50;50;50;50\nGamma;20;20;20;20;20;20;20;20;20;20;20;20\n');
ok('FOR-04 parses', fr.ok, fr.error);
eq('FOR-04 twelve months, none lost', fr.ok ? fr.ledger.months.length : null, 12);
ok('FOR-04 no zero-filled months', fr.ok && !(fr.warnings || []).some(w => /no rows at all/.test(w)), fr.warnings);
for (const [s, m] of [['févr. 2025','2025-02'],['fev 2025','2025-02'],['avr. 2025','2025-04'],['juil. 2025','2025-07'],['déc. 2025','2025-12'],['dec 2025','2025-12'],['Août 2025','2025-08'],['SEPT 2025','2025-09']])
  eq('FOR-04 parseMonth ' + s, parseMonth(s), m);

/* FOR-05: quarterly columns are not months. */
const q = ledger('customer,2025 Q1,2025 Q2,2025 Q3,2025 Q4\nAlpha,3000,3000,3000,3000\nBeta,1500,1500,1500,1500\nGamma,600,600,600,600\n');
ok('FOR-05 quarterly file is handled', q.ok === false || (q.ok && q.ledger.months.length === 12 && (q.warnings || []).some(w => /quarter/i.test(w))), q.ok ? q.ledger.months : q.error);
if (q.ok) {
  eq('FOR-05 each quarter is spread over its three months', row(q, 'Alpha').slice(0, 3), [1000, 1000, 1000]);
  ok('FOR-05 no month between quarters is zero', row(q, 'Alpha').every(v => v > 0), row(q, 'Alpha'));
}

/* FOR-01: a ledger of annual invoices is detected and not read as monthly revenue. */
const inv = ['customer,' + Array.from({ length:24 }, (_, k) => monthAdd('2024-01', k)).join(',')];
for (let c = 0; c < 6; c++) { const r = [ 'Cust' + c ]; for (let k = 0; k < 24; k++) r.push(k % 12 === c % 12 ? 12000 + c * 1200 : 0); inv.push(r.join(',')); }
const inv1 = ledger(inv.join('\n'));
ok('FOR-01 annual-invoice ledger is flagged', inv1.ok && (inv1.warnings || []).some(w => /invoice|annual|billing|spread/i.test(w)), inv1.ok ? inv1.warnings : inv1.error);
if (inv1.ok) {
  const A = ledgerAnalytics(inv1.ledger);
  ok('FOR-01 after spreading, the final-month spike test does not fail', ledgerForensics(inv1.ledger, A).every(f => !(f.id === 'final_spike' && f.status === 'fail')), ledgerForensics(inv1.ledger, A).map(f => f.id + ':' + f.status));
  ok('FOR-01 cohort NRR is sane (0 to 500 %)', A.nrrCohort == null || (A.nrrCohort >= 0 && A.nrrCohort <= 500), A.nrrCohort);
}
const monthlyOk = ledger('customer,' + Array.from({ length:12 }, (_, k) => monthAdd('2025-01', k)).join(',') + '\nA,' + Array(12).fill(100).join(',') + '\nB,' + Array(12).fill(200).join(',') + '\nC,' + Array(12).fill(50).join(',') + '\n');
ok('FOR-01 a normal monthly ledger raises no invoice warning', monthlyOk.ok && !(monthlyOk.warnings || []).some(w => /invoice/i.test(w)), monthlyOk.warnings);

/* FOR-06: a net-cash-flow column is not burn once a fundraise month is in it. */
const sr = parseSeries('month,revenue,net cash flow,cash,headcount\n2025-01,100000,-200000,5000000,10\n2025-02,105000,-210000,4790000,10\n2025-03,110000,3000000,7790000,11\n2025-04,115000,-220000,7570000,11\n2025-05,120000,-225000,7345000,12\n2025-06,125000,-230000,7115000,12\n');
ok('FOR-06 parses', sr.ok, sr.error);
if (sr.ok) {
  const b = sr.series.burn;
  eq('FOR-06 burn is the negated cash flow', [b[0], b[1], b[3], b[4], b[5]], [200000, 210000, 220000, 225000, 230000]);
  ok('FOR-06 the fundraise month is not counted as burn', b[2] == null || b[2] <= 0, b[2]);
  ok('FOR-06 a warning names the fundraise', (sr.warnings || []).some(w => /financ|raise|round/i.test(w)), sr.warnings);
}
const sr2 = parseSeries('month,revenue,burn\n2025-01,100000,200000\n2025-02,105000,210000\n2025-03,110000,220000\n');
eq('FOR-06 a column literally named burn keeps its sign', sr2.ok ? sr2.series.burn : null, [200000, 210000, 220000]);
`;

runSuite('Importers', TESTS);
