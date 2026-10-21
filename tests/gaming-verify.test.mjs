// Findings GM-03 and GM-05 of the independent review (key-2 attempt to game the scoring).
//   node tests/gaming-verify.test.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from './_harness.mjs';

const FIX = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8'));

const TESTS = String.raw`
const base = ARCH.companies.typical_a;
const run = over => Radar.assess({ name:'g', stage:base.stage, model:base.model, vals:Object.assign({}, base.vals, over || {}), bools:base.bools, sel:base.sel || {}, evid:{} });
const check = (r, id) => r.checks.find(c => c.id === id);

/* GM-05: the customer bridge. 95 a year ago + 54 won - 9 lost = 140 today (typical_a). */
const ok0 = run({});
ok('GM-05: the honest bridge closes', check(ok0, 'logo_bridge') && check(ok0, 'logo_bridge').sev === 'ok', check(ok0, 'logo_bridge'));
const small = run({ customers_12mo:19, logos_lost_l12:2 });
const br = check(small, 'logo_bridge');
ok('GM-05: entering 19 customers a year ago breaks the bridge, as a major finding', br && br.sev === 'major' && br.flatter === true, br);
ok('GM-05: and the entered base is marked contested', small.scoring.contested && small.scoring.contested.customers_12mo, small.scoring.contested);
const near = run({ customers_12mo:94 });
ok('GM-05: a one-customer difference is within tolerance', check(near, 'logo_bridge').sev === 'ok', check(near, 'logo_bridge'));

/* GM-03: inflate ARR consistently, state the real figure in the deck: the major check now contests the scored ARR. */
const inflated = { arr_now:Math.round(base.vals.arr_now * 1.15), new_arr_l12:base.vals.new_arr_l12 + Math.round(base.vals.arr_now * 0.15) };
const silent = run(inflated);
const told = run(Object.assign({}, inflated, { stated_arr:base.vals.arr_now }));
ok('GM-03: the deck figure now contradicts the scored one: major', check(told, 'stated_arr') && check(told, 'stated_arr').sev === 'major', check(told, 'stated_arr'));
ok('GM-03: arr_now is contested', told.scoring.contested && told.scoring.contested.arr_now, told.scoring.contested);
ok('GM-03: stating the real ARR does not raise the score', told.scoring.overallRaw <= silent.scoring.overallRaw, [told.scoring.overallRaw, silent.scoring.overallRaw]);
`;

runSuite('Gaming findings', TESTS, 'const ARCH = ' + JSON.stringify(FIX) + ';');
