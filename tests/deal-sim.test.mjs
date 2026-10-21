// Runway simulator and deal maths: regression tests for the issues found by the 2026-10-04
// independent audit plus invariants.
//   node tests/deal-sim.test.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from './_harness.mjs';

const FIX = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8'));
const resolve = n => { const c = FIX.companies[n]; const b = c.extends ? resolve(c.extends) : { vals:{}, bools:{}, sel:{} };
  return { stage:c.stage || b.stage, model:c.model || b.model, vals:{ ...b.vals, ...c.vals }, bools:{ ...b.bools, ...c.bools }, sel:{ ...b.sel, ...c.sel } }; };

const TESTS = String.raw`
const A = { assumptions:{ paths:2000, horizon:36, decay:3, buffer:6 } };
const run = (o) => simulate(Object.assign({ rev0:100000, exp0:200000, cash0:4000000, g:3, eg:0, sd:30, milestone:2000000, A:A.assumptions }, o), 'seed-1');

/* DEAL-01: a path that reaches the bar can still run out of cash later. */
const fl = Radar.assess(Object.assign({ name:'fl' }, ARCH.fintech_losses));
const sim = fl.projections.simulation;
ok('fintech_losses: simulation runs', !!sim);
ok('fintech_losses: median runway is not "36+" when the median cash path is far below zero', sim && sim.runway.p50 <= 24, sim && sim.runway);
ok('fintech_losses: cash-out within the horizon is likely', sim && sim.pCashOut > 0.5, sim && sim.pCashOut);
const s1 = run({});
ok('cash-out before the bar never exceeds cash-out at any time', s1.pDeath <= s1.pCashOut + 1e-12, [s1.pDeath, s1.pCashOut]);
ok('reaching the bar plus cash-out before it never exceed 100%', s1.pMilestone + s1.pDeath <= 1 + 1e-12, [s1.pMilestone, s1.pDeath]);
/* Same seed means the same random draws, so more starting cash can only delay or prevent a cash-out. */
const lessCash = run({ cash0:3000000 }), moreCash = run({ cash0:6000000 });
ok('more starting cash never makes cash-out more likely', moreCash.pCashOut <= lessCash.pCashOut && moreCash.runway.p50 >= lessCash.runway.p50, [lessCash.pCashOut, moreCash.pCashOut]);

/* Already above the bar: the bar is not a test, and runway still comes from the cash. */
const above = run({ rev0:250000, exp0:900000, cash0:5000000, milestone:2000000 });
ok('ARR already above the bar is flagged', above.atBar === true);
ok('above the bar with 8 months of cash: cash-out is near certain', above.pCashOut > 0.9 && above.runway.p50 <= 12, [above.pCashOut, above.runway]);

/* Determinism and speed. */
const d1 = run({}), d2 = run({});
eq('same seed, same result', [d1.pMilestone, d1.pCashOut, d1.runway], [d2.pMilestone, d2.pCashOut, d2.runway]);
const t0 = Date.now(); simulate({ rev0:100000, exp0:200000, cash0:4000000, g:3, eg:0, sd:30, milestone:2000000, A:{ paths:4000, horizon:36, decay:3, buffer:6 } }, 'speed'); const ms = Date.now() - t0;
ok('4,000 paths x 36 months under 400 ms', ms < 400, ms + ' ms');
`;

runSuite('Simulator and deal maths', TESTS, 'const ARCH = ' + JSON.stringify({ fintech_losses: resolve('fintech_losses') }) + ';');
