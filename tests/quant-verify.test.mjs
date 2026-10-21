// Findings QV-02, QV-03 and QV-06 of the independent review (key-2 blind recompute).
//   node tests/quant-verify.test.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from './_harness.mjs';

const FIX = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8'));

const TESTS = String.raw`
const base = ARCH.companies.typical_a, seed = ARCH.companies.seed_ai_clean;
const run = (c, over, bover) => Radar.assess({ name:'q', stage:c.stage, model:c.model, vals:Object.assign({}, c.vals, over || {}), bools:Object.assign({}, c.bools, bover || {}), sel:c.sel || {}, evid:{} });
const metric = (r, k) => { for (const d of r.scoring.dimensions) { const m = d.metrics.find(x => x.key === k); if (m) return m; } return null; };

/* QV-02: customers won but no new-logo ARR is a result (never paid back), not "not entered". */
const n0 = run(base, { new_arr_l12:0, expansion_arr_l12:0 });
ok('QV-02: zero new-logo ARR is read as zero, not as the whole-base ACV', n0.derived.acv_new === 0, n0.derived.acv_new);
ok('QV-02: payback is at the cap', n0.derived.cac_payback === 120, n0.derived.cac_payback);
ok('QV-02: LTV:CAC is zero', n0.derived.ltv_cac === 0, n0.derived.ltv_cac);
const n1 = run(base, { new_arr_l12:1000, expansion_arr_l12:0 });
ok('QV-02: raising new-logo ARR from 0 to 1,000 does not lower the score', n1.scoring.overallRaw >= n0.scoring.overallRaw, [n0.scoring.overallRaw, n1.scoring.overallRaw]);
const nBlank = run(base, { new_arr_l12:'' });
ok('QV-02: a blank field still falls back to average ACV', nBlank.derived.acv_new == null && nBlank.derived.cac_payback != null, [nBlank.derived.acv_new, nBlank.derived.cac_payback]);

/* QV-03: LTV:CAC rests on logo churn, so it is withheld with logo retention below the 20-customer floor. */
const small = run(base, { customers_12mo:5, customers_now:20, logos_lost_l12:0 });
ok('QV-03: LTV:CAC is withheld with 5 customers a year ago (shrunk to a quarter of its weight, marked withheld)', metric(small, 'ltv_cac') && metric(small, 'ltv_cac').withheld === true && metric(small, 'ltv_cac').credibility === 0.25, metric(small, 'ltv_cac'));
applyConfig(Object.assign(EMPTY_CONFIG(), { settings:{ withheldMode:'drop' } }));
const smallDrop = run(base, { customers_12mo:5, customers_now:20, logos_lost_l12:0 });
ok('QV-03: and not scored at all when withheld metrics are left out', metric(smallDrop, 'ltv_cac') == null || metric(smallDrop, 'ltv_cac').score == null, metric(smallDrop, 'ltv_cac'));
applyConfig(EMPTY_CONFIG());
ok('QV-03: and the reason is given', /logo churn/.test(small.scoring.suppressed.ltv_cac || ''), small.scoring.suppressed);
const big = run(base, {});
ok('QV-03: LTV:CAC is scored with 95 customers a year ago', metric(big, 'ltv_cac') != null && metric(big, 'ltv_cac').score != null, metric(big, 'ltv_cac'));

/* QV-01: no cliff at the floor. A leaky company with 19 customers a year ago must not score much higher than with 20. */
const leaky = { churned_arr_l12:700000, logos_lost_l12:9, new_arr_l12:2900000 };
const l19 = run(base, Object.assign({}, leaky, { customers_12mo:19 })).scoring.overallRaw, l20 = run(base, Object.assign({}, leaky, { customers_12mo:20 })).scoring.overallRaw;
ok('QV-01: 19 to 20 customers moves a leaky company by under 2.5 points (was 5.4)', Math.abs(l19 - l20) < 2.5, [l19, l20]);
applyConfig(Object.assign(EMPTY_CONFIG(), { settings:{ withheldMode:'drop' } }));
const d19 = run(base, Object.assign({}, leaky, { customers_12mo:19 })).scoring.overallRaw;
applyConfig(EMPTY_CONFIG());
ok('QV-01: the cliff is what leaving withheld metrics out produces (owner setting)', Math.abs(d19 - l20) > 5, [d19, l20]);

/* QV-06: reported coverage is what was entered; the overlap cap lowers weight, not coverage. */
const cap2 = run(seed, {});
applyConfig(Object.assign(EMPTY_CONFIG(), { settings:{ correlationCap:0 } }));
const cap0 = run(seed, {});
applyConfig(EMPTY_CONFIG());
ok('QV-06: coverage does not change with the overlap cap', Math.abs(cap2.scoring.coverage - cap0.scoring.coverage) < 1e-9, [cap2.scoring.coverage, cap0.scoring.coverage]);
`;

runSuite('Quant verification findings', TESTS, 'const ARCH = ' + JSON.stringify(FIX) + ';');
