// Importer findings FV-09 to FV-12, FV-14 and FV-17 of the independent review
//   node tests/importers-verify2.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
const LF = String.fromCharCode(10);
const csv = rows => rows.join(LF);

/* FV-09: cells that cannot be read are counted and named, not dropped silently */
const w1 = parseLedger(csv(['customer,2025-01,2025-02,2025-03,2025-04', "Alpha,1'200,1'300,1'350,1'400", 'Beta,200,TBD,220,230', 'Gamma,50,50,60,60', 'Delta,10,10,10,10']));
ok('FV-09 the file still opens', w1.ok, w1.error);
ok('FV-09 and the unreadable cells are counted with examples', w1.warnings.some(w => /could not be read as a number/.test(w) && /TBD|1'200/.test(w)), w1.warnings);

/* FV-12: repeated month columns and repeated customers are said, not silently added */
const w2 = parseLedger(csv(['customer,2025-01,2025-02,2025-02,2025-03,2025-04', 'Alpha,100,110,5,120,130', 'Beta,200,210,5,220,230', 'Gamma,50,50,5,60,60']));
ok('FV-12 a month that appears in two columns is reported', w2.ok && w2.warnings.some(w => /more than one column/.test(w) && /2025-02/.test(w)), w2.warnings);
const w3 = parseLedger(csv(['customer,2025-01,2025-02,2025-03,2025-04', 'Alpha,100,110,120,130', 'Alpha,10,10,10,10', 'Beta,200,210,220,230', 'Gamma,50,50,60,60']));
ok('FV-12 a customer on two rows is reported', w3.ok && w3.warnings.some(w => /more than one row/.test(w)), w3.warnings);

/* FV-10: an invoice-number column is not the month column, and the net amount is the revenue */
const rows = ['invoice number,customer,month,gross amount,net amount'];
['Alpha', 'Beta', 'Gamma'].forEach((c, i) => ['2025-01', '2025-02', '2025-03', '2025-04'].forEach((m, k) => rows.push('INV-' + (1000 + i * 10 + k) + ',' + c + ',' + m + ',' + (1200 + i * 100) + ',' + (1000 + i * 100))));
const l1 = parseLedger(csv(rows));
ok('FV-10 it opens', l1.ok, l1.error);
eq('FV-10 months come from the month column', l1.ok ? l1.ledger.months : null, ['2025-01', '2025-02', '2025-03', '2025-04']);
eq('FV-10 the net amount is used', l1.ok ? l1.ledger.customers.find(c => c.name === 'Alpha').mrr : null, [1000, 1000, 1000, 1000]);
ok('FV-10 and the choice is said', l1.ok && l1.warnings.some(w => /More than one amount column/.test(w) && /net amount/.test(w)), l1.warnings);

/* FV-11: quarterly invoices are spread over their quarter */
const mon = k => monthAdd('2024-01', k);
const q = ['customer,month,amount'];
for (let i = 0; i < 30; i++) for (let k = i % 3; k < 18; k += 3) q.push('C' + i + ',' + mon(k) + ',' + (3 * (1000 + i * 10)));
const q1 = parseLedger(csv(q));
ok('FV-11 quarterly billing is recognised', q1.ok && q1.ledger.invoiceMode === true && q1.warnings.some(w => /every quarter/.test(w)), q1.warnings);
const A = q1.ok ? ledgerAnalytics(q1.ledger) : null;
ok('FV-11 customers are not counted as coming and going', A && A.active[A.e] === 30, A && A.active[A.e]);
ok('FV-11 MRR is the true monthly figure', A && Math.abs(A.mrr[A.e] - 30 * 1000 - 10 * (29 * 30 / 2)) < 1, A && A.mrr[A.e]);
const mth = ['customer,month,amount'];
for (let i = 0; i < 30; i++) for (let k = 0; k < 13; k++) mth.push('C' + i + ',' + mon(k) + ',' + (1000 + i * 10));
const m1 = parseLedger(csv(mth));
ok('FV-11 an ordinary monthly ledger is not taken for invoices', m1.ok && !m1.ledger.invoiceMode, m1.ok && m1.ledger.invoiceMode);

/* FV-17: a header that mixes day-first and month-first dates is reported */
const w4 = parseLedger(csv(['customer,25/01/2025,02/25/2025,03/01/2025,04/01/2025', 'Alpha,100,110,120,130', 'Beta,200,210,220,230', 'Gamma,50,50,60,60']));
ok('FV-17 mixed date forms are reported', w4.ok && w4.warnings.some(w => /mix day-first and month-first/.test(w)), w4.warnings || w4.error);
`;

runSuite('Importer findings, second round', TESTS);
