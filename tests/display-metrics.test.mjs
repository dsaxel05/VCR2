// Display-only metrics (5.0.8): sales efficiency, churn mix, and the next round's ARR against projected ARR.
// They are never scored: same scores and same run IDs whatever the owner's thresholds and multiple.
//   node tests/display-metrics.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
{
const near = (name, got, exp, tol) => eq(name, got, exp, tol == null ? 1e-9 : tol);
const run = (ex, cfg) => {
  applyConfig(EMPTY_CONFIG()); if (cfg) applyConfig(Object.assign(EMPTY_CONFIG(), cfg));
  S = blankState(); S.example = true; if (ex === 'halcyon') loadHalcyon(); else if (ex === 'northwind') loadNorthwind(); else ex();
  const { D, F } = derive(), a = assessAll(), hash = runHash();
  applyConfig(EMPTY_CONFIG());
  return { D, F, a, hash };
};
const KEYS = ['sales_eff', 'churn_mix', 'round_arr_need', 'round_arr_at6'];

for (const ex of ['northwind', 'halcyon']) {
  const R = run(ex), D = R.D, v = k => parseFloat(S.vals[k]);
  /* recomputed here from the inputs and the other derived figures */
  near(ex + ': sales efficiency = net new ARR ÷ S&M (last 12 months)', D.sales_eff, (v('new_arr_l12') + v('expansion_arr_l12') - v('churned_arr_l12') - v('contraction_arr_l12')) / v('sm_spend_l12'));
  near(ex + ': churn mix = logo churn ÷ (100 − GRR)', D.churn_mix, (100 - D.logo_ret) / (100 - D.grr));
  near(ex + ': ARR the next round needs = post-money ÷ 10', D.round_arr_need, (v('round_pre_money') + v('round_size')) / 10);
  near(ex + ': projected ARR at 6 months of runway', D.round_arr_at6, v('arr_now') * Math.pow(1 + D.cmgr12 / 100, D.runway - 6), 1e-6);
  ok(ex + ': labels and units exist for all four', KEYS.every(k => DLABEL[k] && DUNIT[k] != null), KEYS.filter(k => !DLABEL[k]));
  const scored = R.a.sc.dimensions.flatMap(d => d.metrics.map(m => m.key || m.id));
  ok(ex + ': none of them is scored', KEYS.every(k => !scored.includes(k)), scored.filter(k => KEYS.includes(k)));
}
const NW = run('northwind'), HC = run('halcyon');
eq('Northwind values', [NW.D.sales_eff, NW.D.churn_mix, NW.D.round_arr_need, Math.round(NW.D.round_arr_at6)].map(x => Math.round(x * 100) / 100), [0.47, 1.04, 7500000, 6818238]);
eq('Halcyon values', [HC.D.sales_eff, HC.D.churn_mix, HC.D.round_arr_need, Math.round(HC.D.round_arr_at6)].map(x => Math.round(x * 100) / 100), [1.33, 0.79, 4000000, 10772857]);
ok('Northwind: sales efficiency flagged below 0.5', /flagged: below your 0\.5/.test(NW.F.sales_eff), NW.F.sales_eff);
ok('Northwind: churn mix not flagged', !/flagged/.test(NW.F.churn_mix), NW.F.churn_mix);
ok('Northwind: projected ARR falls short, down-round risk', /down-round risk/.test(NW.F.round_arr_at6), NW.F.round_arr_at6);
ok('Halcyon: churn mix flagged below 0.8', /flagged: below your 0\.8/.test(HC.F.churn_mix), HC.F.churn_mix);
ok('Halcyon: sales efficiency not flagged', !/flagged/.test(HC.F.sales_eff), HC.F.sales_eff);
ok('Halcyon: projected ARR covers the next round', /covers what the next round needs/.test(HC.F.round_arr_at6), HC.F.round_arr_at6);
eq('run IDs unchanged', [NW.hash, HC.hash], ['784855EB817F5577', '4451404D531EBB1F']);

/* The owner's assumptions move the metrics and their flags, never a score or a run ID. */
const own = { settings:{ salesEffFlag:0.3, churnMixFlag:1.2, nextRoundMultiple:20 } };
const NW2 = run('northwind', own);
ok('a lower sales-efficiency threshold removes the flag', !/flagged/.test(NW2.F.sales_eff), NW2.F.sales_eff);
ok('a higher churn-mix threshold adds the flag', /flagged: below your 1\.2/.test(NW2.F.churn_mix), NW2.F.churn_mix);
eq('a 20x multiple halves the ARR the next round needs', NW2.D.round_arr_need, 3750000);
ok('and the projection then covers it', /covers/.test(NW2.F.round_arr_at6), NW2.F.round_arr_at6);
eq('same score and run ID with the owner’s assumptions', [NW2.a.sc.overall, NW2.hash], [NW.a.sc.overall, NW.hash]);
const bad = normalizeConfig({ settings:{ nextRoundMultiple:0, churnMixFlag:-3, salesEffFlag:'x' } }).settings;
ok('out-of-range assumptions are refused or limited on load', !(bad.nextRoundMultiple < 1) && !(bad.churnMixFlag < 0) && typeof bad.salesEffFlag !== 'string', bad);

/* Missing inputs give no figure rather than a wrong one. */
const blank = run(() => { S.stage = 'a'; S.model = 'saas'; S.vals = { arr_now:'1000000', cash_on_hand:'600000', net_burn:'200000', round_pre_money:'9000000', round_size:'1000000', arr_12mo:'500000' }; });
ok('no S&M spend: no sales efficiency; no retention: no churn mix', blank.D.sales_eff == null && blank.D.churn_mix == null);
eq('runway under 6 months: the projection is today’s ARR', blank.D.round_arr_at6, 1000000);
const noRound = run(() => { S.stage = 'a'; S.model = 'saas'; S.vals = { arr_now:'1000000', arr_12mo:'500000', cash_on_hand:'6000000', net_burn:'100000' }; });
ok('no proposed round: neither round figure', noRound.D.round_arr_need == null && noRound.D.round_arr_at6 == null);
const notBurning = run(() => { S.stage = 'a'; S.model = 'saas'; S.vals = { arr_now:'1000000', arr_12mo:'500000', cash_on_hand:'600000', net_burn:'-10000', round_pre_money:'9000000', round_size:'1000000' }; });
ok('not burning: no runway date to project to', notBurning.D.round_arr_need === 1000000 && notBurning.D.round_arr_at6 == null);
const zeroChurn = run(() => { S.stage = 'a'; S.model = 'saas'; S.vals = { arr_12mo:'1000000', churned_arr_l12:'0', contraction_arr_l12:'0', expansion_arr_l12:'100000', customers_12mo:'10', logos_lost_l12:'0' }; });
ok('no revenue churn: churn mix is left out, not divided by zero', zeroChurn.D.churn_mix == null);
}
`;
runSuite('Display-only metrics: sales efficiency, churn mix, next-round ARR', TESTS);
