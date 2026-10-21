// Output tests for the scoring constants added after the independent Studio re-measurement:
// each one changes the report, and clearing it restores the built-in result.
//   node tests/owner-constants.test.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from './_harness.mjs';
const FIX = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8'));

const TESTS = String.raw`
const A = ARCH.companies;
const resolveC = n => { const c = A[n], b = c.extends ? resolveC(c.extends) : { vals:{}, bools:{}, sel:{} }; return { stage:c.stage || b.stage, model:c.model || b.model, vals:Object.assign({}, b.vals, c.vals), bools:Object.assign({}, b.bools, c.bools), sel:Object.assign({}, b.sel, c.sel) }; };
const asm = (n, over) => { const c = resolveC(n); return Radar.assess({ name:n, stage:c.stage, model:c.model, vals:Object.assign({}, c.vals, over || {}), bools:c.bools, sel:c.sel, evid:{} }); };
const withS = (s, f) => { applyConfig(Object.assign(EMPTY_CONFIG(), { settings:s })); try { return f(); } finally { applyConfig(EMPTY_CONFIG()); } };

/* boundary caps */
const notBurning = { net_burn:'-100000', gross_burn:'600000' };
eq('runwayCap: built-in 120 months for a company that is not burning', asm('typical_a', notBurning).derived.runway, 120);
eq('runwayCap: the owner’s cap is shown and scored', withS({ runwayCap:60 }, () => asm('typical_a', notBurning).derived.runway), 60);
eq('runwayCap: and is back', asm('typical_a', notBurning).derived.runway, 120);
const noGrowth = { new_arr_l12:'0', expansion_arr_l12:'0', churned_arr_l12:'0', contraction_arr_l12:'0', arr_now:String(resolveC('typical_a').vals.arr_12mo) };
eq('burnMultipleCap: built-in 99', asm('typical_a', noGrowth).derived.burn_multiple, 99);
eq('burnMultipleCap: the owner’s value', withS({ burnMultipleCap:40 }, () => asm('typical_a', noGrowth).derived.burn_multiple), 40);
eq('paybackCap: built-in 120 months at a gross margin of zero', asm('typical_a', { gross_margin:'0', cogs_hosting:'', cogs_support:'' }).derived.cac_payback, 120);
eq('paybackCap: the owner’s value', withS({ paybackCap:72 }, () => asm('typical_a', { gross_margin:'0', cogs_hosting:'', cogs_support:'' }).derived.cac_payback), 72);
const noChurn = { churned_arr_l12:'0', contraction_arr_l12:'0', arr_now:String(resolveC('typical_a').vals.arr_12mo + resolveC('typical_a').vals.new_arr_l12 + resolveC('typical_a').vals.expansion_arr_l12) };
eq('quickRatioCap: built-in 10', asm('typical_a', noChurn).derived.quick_ratio, 10);
eq('quickRatioCap: the owner’s value', withS({ quickRatioCap:6 }, () => asm('typical_a', noChurn).derived.quick_ratio), 6);

/* evidence */
const tagged = () => { const c = resolveC('typical_a'); return Radar.assess({ name:'x', stage:c.stage, model:c.model, vals:c.vals, bools:c.bools, sel:c.sel, evid:{ arr_now:'verbal', net_burn:'verbal' } }).scoring.overallRaw; };
const e0 = tagged(), e1 = withS({ evidencePivot:30 }, tagged);
ok('evidencePivot: a lower pivot pulls more of a good score down', e1 < e0, [e0, e1]);
eq('evidencePivot: and is back', tagged(), e0);

/* money */
eq('currency: built-in dollar', money(1500000), '$1.50M');
eq('currency: the owner’s symbol', withS({ currency:'€' }, () => money(1500000)), '€1.50M');
eq('currency: a markup character is refused', withS({ currency:'<' }, () => money(1500000)), '$1.50M');
eq('currency: and the dollar is back', money(1500000), '$1.50M');

/* loaded cost when the field is blank */
const he = over => asm('typical_a', Object.assign({ avg_loaded_comp:'' }, over || {})).derived.headcount_eff;
const h0 = he();
ok('defaultLoadedCost: a higher cost lowers headcount efficiency', withS({ defaultLoadedCost:330000 }, () => he()) < h0, [h0, withS({ defaultLoadedCost:330000 }, () => he())]);

/* confidence rule */
const cont = () => asm('contradictions').scoring;
const c0 = cont();
ok('confHighMajor: the contradictions archetype is not HIGH by default', c0.confidence !== 'HIGH', c0.confidence);
const c1 = withS({ confMediumMajor:10, confMediumCoverage:0, confMediumEvidence:0 }, () => cont().confidence);
eq('confMediumMajor: tolerant owner gets MEDIUM', c1, 'MEDIUM');

/* question list */
const nq = () => asm('zombie').questions.filter(q => /Weak dimension/.test(q.tag)).length;
const q0 = nq();
ok('questionWeakDim: a higher bar asks about more dimensions', withS({ questionWeakDim:90 }, () => nq()) >= q0 && withS({ questionWeakDim:90 }, () => nq()) > 0, [q0, withS({ questionWeakDim:90 }, () => nq())]);

/* library calibration minimum */
eq('calMin: built-in 8', CAL_MIN, 8);
eq('calMin: the owner’s value', withS({ calMin:20 }, () => CAL_MIN), 20);
eq('calMin: and is back', CAL_MIN, 8);

/* the reconcile deal-breaker */
const rec = (cfg) => { applyConfig(Object.assign(EMPTY_CONFIG(), cfg || {})); try { return asm('contradictions').scoring.gates.find(g => g.id === 'reconcile'); } finally { applyConfig(EMPTY_CONFIG()); } };
ok('reconcile: fires on the contradictions archetype', !!rec(), '');
eq('reconcile: its title can be changed', rec({ labels:{ gates:{ reconcile:'Too many mismatches' } } }).title, 'Too many mismatches');
eq('reconcile: and its explanation', rec({ meta:{ gates:{ reconcile:{ why:'Fix the pack first.' } } } }).why, 'Fix the pack first.');

/* question caps and the library percentile map */
const nWeak = () => asm('zombie').questions.filter(q => /Weak dimension/.test(q.tag)).length;
const w0 = nWeak();
ok('questionMaxWeakDims: the built-in cap is 3 or fewer', w0 <= 3, w0);
eq('questionMaxWeakDims: a cap of 1 gives at most one', withS({ questionMaxWeakDims:1 }, () => nWeak()) <= 1, true);
eq('calPercentilesHi: built-in', JSON.stringify(sx('calPercentilesHi')), '[0.15,0.45,0.72,0.92]');
eq('calPercentilesHi: the owner’s map is used', JSON.stringify(withS({ calPercentilesHi:[0.1, 0.3, 0.6, 0.9] }, () => sx('calPercentilesHi'))), '[0.1,0.3,0.6,0.9]');
eq('calPercentilesHi: a map that does not ascend is refused', JSON.stringify(withS({ calPercentilesHi:[0.5, 0.3, 0.6, 0.9] }, () => sx('calPercentilesHi'))), '[0.15,0.45,0.72,0.92]');
`;

runSuite('Owner control: constants added after the re-measurement', TESTS, 'const ARCH = ' + JSON.stringify(FIX) + ';');
