// Regressions for the bugs found by the end-to-end company tests of 2026-10-14 (tests/e2e/run.py, the independent review
// Each was written to fail first.   node tests/e2e-findings.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
const withS = (stage, model, vals, f) => { S = blankState(); S.stage = stage; S.model = model; S.vals = vals; return f(); };

/* E2E-01  A company that is not burning and has no revenue and no cash has no runway to speak of (it scored 81, Strong). */
const zero = withS('preseed', 'saas', { arr_now:'0', arr_12mo:'0', cash_on_hand:'0', net_burn:'0', headcount_now:'1' }, () => {
  const D = derive().D; const r = Radar.assess({ name:'x', stage:'preseed', model:'saas', vals:S.vals, bools:{}, sel:{}, evid:{} });
  return { runway:D.runway, notBurning:D._notBurning, overall:r.scoring.overall };
});
ok('E2E-01: zero revenue, zero cash and zero burn gives no runway', zero.runway == null && !zero.notBurning, JSON.stringify(zero));
ok('E2E-01: and cannot score as a strong company', zero.overall == null || zero.overall < 60, String(zero.overall));
/* ...while a company with revenue that really is not burning keeps its "not burning" runway */
const profitable = withS('a', 'saas', { arr_now:'3000000', arr_12mo:'2000000', cash_on_hand:'1000000', net_burn:'-20000' }, () => derive().D);
ok('E2E-01: a profitable company still has the "not burning" runway', profitable.runway >= 120 && profitable._notBurning === true, String(profitable.runway));

/* E2E-02  The overview tiles say "no growth" and "not burning", not the numbers 99.00 and 120.0 that stand in for them. */
const tilesNoGrowth = withS('seed', 'saas', { arr_now:'0', arr_12mo:'0', cash_on_hand:'18000000', net_burn:'1100000', headcount_now:'35' }, () => paneOverview(assessAll()));
ok('E2E-02: a company burning with no new ARR does not show a burn multiple of 99.00', !/>\s*99\.00\s*</.test(tilesNoGrowth) && /no growth/i.test(tilesNoGrowth), tilesNoGrowth.match(/Burn multiple[\s\S]{0,160}/)?.[0]);
const tilesNotBurning = withS('a', 'saas', { arr_now:'3000000', arr_12mo:'2000000', cash_on_hand:'1000000', net_burn:'-20000' }, () => paneOverview(assessAll()));
ok('E2E-02: a company that is not burning does not show a 120-month runway', !/120(\.0)?\s*mo/.test(tilesNotBurning) && /not burning/i.test(tilesNotBurning), tilesNotBurning.match(/Runway[\s\S]{0,160}/)?.[0]);

/* E2E-03  A list of annual invoices on two billing dates (every customer renews on 1 January) is a ledger, not "fewer than three months". */
const inv = ['customer,invoice date,amount'];
for (let i = 1; i <= 12; i++) { inv.push('C' + i + ',2025-01-01,' + (1200 * i)); inv.push('C' + i + ',2026-01-01,' + (1500 * i)); }
const parsed = parseLedger(inv.join(String.fromCharCode(10)), 'rev');
ok('E2E-03: invoices on two annual dates are read', parsed.ok === true, parsed.error);
ok('E2E-03: they are read as a list of invoices spread over twelve months', parsed.ok && /list of invoices/.test(parsed.warnings.join(' ')), parsed.ok ? parsed.warnings.join(' | ') : '');
const lastMrr = parsed.ok ? parsed.ledger.customers.reduce((a, c) => a + c.mrr[c.mrr.length - 1], 0) : null;
near2 = (a, b) => Math.abs(a - b) < 1;
ok('E2E-03: the last month holds one twelfth of the 2026 invoices', parsed.ok && near2(lastMrr, 1500 * 78 / 12), String(lastMrr));

/* E2E-04  A score built on a tenth of the rubric was announced as "Strong" (a ledger and a gross margin alone gave 77). Below the cut-off it is an early read. */
const scLow = { overall:77, band:[50, 100], confidence:'LOW', coverage:0.1, evidence:0.5, dimensions:[], gates:[] };
const scOk = Object.assign({}, scLow, { coverage:0.6, confidence:'MEDIUM' });
ok('E2E-04: a score on 10% of the rubric is called an early read, not Strong', /Early read/.test(bandHTML(scLow)) && !/>Strong</.test(bandHTML(scLow)) && /first read/i.test(bandHTML(scLow)), bandHTML(scLow).slice(0, 300));
ok('E2E-04: a score on 60% of the rubric keeps its word', />Strong</.test(bandHTML(scOk)) && !/Early read/.test(bandHTML(scOk)), bandHTML(scOk).slice(0, 200));
applyConfig(Object.assign(EMPTY_CONFIG(), { settings:{ earlyReadBelow:5 } }));
ok('E2E-04: the cut-off is a setting', />Strong</.test(bandHTML(scLow)), '');
applyConfig(EMPTY_CONFIG());
`;

runSuite('End-to-end findings of 2026-10-14', TESTS);
