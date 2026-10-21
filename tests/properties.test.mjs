// Property and metamorphic tests for the scoring engine: monotone score curves, bounded scores,
// stage weights that sum to one, determinism, invariance to input order, model applicability and
// input monotonicity on a typical company. Random companies come from a seeded generator, so a
// failure always reproduces.
//   node tests/properties.test.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from './_harness.mjs';

const arch = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8')).companies.typical_a;

const TESTS = String.raw`
const company = (over) => {
  const c = { name:'Typical', stage:TYP.stage, model:TYP.model, vals:Object.assign({}, TYP.vals), bools:Object.assign({}, TYP.bools), sel:Object.assign({}, TYP.sel), evid:{} };
  if (over) Object.assign(c.vals, over);
  return c;
};
const metricScore = (r, key) => { for (const d of r.scoring.dimensions) { const m = d.metrics.find(x => x.key === key); if (m) return m.score; } return null; };

/* 1. Score curves are monotone in the better direction and bounded. */
let curveBad = [];
Object.entries(RUBRIC.thresholds).forEach(([key, cfg]) => ['preseed','seed','a','b'].forEach(stg => {
  const a = cfg[stg]; if (!Array.isArray(a)) return;
  const span = (a[3] - a[0]) || Math.abs(a[0]) || 1, lo = a[0] - span, hi = a[3] + span;
  let prev = null;
  for (let i = 0; i <= 400; i++) {
    const v = lo + (hi - lo) * i / 400, s = bandScore(v, a, cfg.dir);
    if (!(s >= 0 && s <= 100)) curveBad.push(key + '/' + stg + ' out of range at ' + v);
    if (prev != null && (cfg.dir === 'hi' ? s < prev - 1e-9 : s > prev + 1e-9)) { curveBad.push(key + '/' + stg + ' not monotone at ' + v); break; }
    prev = s;
  }
}));
ok('every anchor curve is monotone and within [0, 100]', curveBad.length === 0, curveBad.slice(0, 5));
let bandBad = [];
Object.entries(RUBRIC.thresholds).filter(([, c]) => c.dir === 'band').forEach(([key, c]) => {
  for (let v = c.hard[0] - 10; v <= c.hard[1] + 10; v += 0.25) { const s = bandedIdeal(v, c.ideal, c.hard); if (!(s >= 0 && s <= 100)) bandBad.push(key + ' ' + v); }
});
ok('healthy-range metrics stay within [0, 100]', bandBad.length === 0, bandBad.slice(0, 5));

/* 2. Stage weights sum to one. */
Object.entries(RUBRIC.weights).forEach(([stg, w]) => eq('stage weights sum to 1 at ' + stg, Object.values(w).reduce((x, y) => x + y, 0), 1, 1e-9));

/* 3. Determinism and invariance to the order of inputs. */
const r1 = Radar.assess(company()), r2 = Radar.assess(company());
eq('same inputs, same hash and score', [r1.hash, r1.scoring.overallRaw, r1.scoring.band], [r2.hash, r2.scoring.overallRaw, r2.scoring.band]);
const rev = company(); rev.vals = Object.fromEntries(Object.entries(rev.vals).reverse()); rev.bools = Object.fromEntries(Object.entries(rev.bools).reverse());
const r3 = Radar.assess(rev);
eq('input order does not matter', [r3.hash, r3.scoring.overallRaw], [r1.hash, r1.scoring.overallRaw]);

/* 4. Model applicability: marketplace and fintech inputs never move a SaaS score. */
const r4 = Radar.assess(company({ gmv_now:9e6, gmv_12mo:1e6, incentives_pct:40, contrib_margin:-30, repeat_gmv_pct:5, loss_rate:9, volume_now:5e8, volume_12mo:1e8 }));
eq('other models’ inputs do not change a SaaS score', r4.scoring.overallRaw, r1.scoring.overallRaw, 1e-9);

/* 5. Input monotonicity: improving one input never lowers its metric's score or the overall
      (holding the rest fixed, without crossing a sample-size floor or a stage band). */
const MOVES = [
  ['gross_margin', +4, 'gross_margin'], ['cash_on_hand', +1500000, 'runway'], ['logos_lost_l12', -3, 'logo_ret'],
  ['top5_pct', -6, 'top5_conc'], ['win_rate', +6, 'win_rate'], ['uptime_90d', +0.05, 'uptime'], ['eng_departures_l12', -1, 'eng_turnover'],
  ['nps', +15, 'nps'], ['founder_domain_years', +3, 'domain_years'], ['pct_paid', -10, 'pct_paid'], ['services_pct', -3, 'services_pct'],
  ['churned_arr_l12', -100000, 'grr'], ['expansion_arr_l12', +150000, 'nrr'], ['sm_spend_l12', -400000, 'cac_payback'],
];
MOVES.forEach(([field, d, key]) => {
  const better = Radar.assess(company({ [field]:TYP.vals[field] + d }));
  ok('improving ' + field + ' does not lower ' + key, metricScore(better, key) >= metricScore(r1, key), [metricScore(better, key), metricScore(r1, key)]);
  ok('improving ' + field + ' does not lower the overall', better.scoring.overallRaw >= r1.scoring.overallRaw - 1e-9, [better.scoring.overallRaw, r1.scoring.overallRaw]);
});

/* 6. Suppression: below the retention floor NRR is shown but not scored. */
const small = Radar.assess(company({ customers_12mo:10 }));
const nrrM = small.scoring.dimensions.flatMap(d => d.metrics).find(m => m.key === 'nrr');
ok('NRR is flagged withheld below the retention floor and shrunk towards 50 by the share of the sample reached (default)', nrrM && nrrM.withheld === true && nrrM.credibility === 0.5 && small.scoring.suppressed.nrr != null, nrrM);
applyConfig(Object.assign(EMPTY_CONFIG(), { settings:{ withheldMode:'neutral' } }));
const smallNeutral = Radar.assess(company({ customers_12mo:10 }));
ok('NRR counts at a neutral 50 when the owner chooses that', metricScore(smallNeutral, 'nrr') === 50);
applyConfig(Object.assign(EMPTY_CONFIG(), { settings:{ withheldMode:'drop' } }));
const smallDrop = Radar.assess(company({ customers_12mo:10 }));
ok('NRR is not scored below the retention floor when the owner leaves withheld metrics out', metricScore(smallDrop, 'nrr') == null && smallDrop.scoring.suppressed.nrr != null);
applyConfig(EMPTY_CONFIG());

/* 6b. Boundaries (audit MET-03): a metric that becomes extreme must not vanish and lift the score. */
const ov = over => Radar.assess(company(over)).scoring.overallRaw;
const nnarr = d => ({ new_arr_l12:TYP.vals.churned_arr_l12 + TYP.vals.contraction_arr_l12 - TYP.vals.expansion_arr_l12 + d, arr_now:TYP.vals.arr_12mo + d });
ok('growing by $10k scores at least as well as shrinking by $10k', ov(nnarr(10000)) >= ov(nnarr(-10000)), [ov(nnarr(10000)), ov(nnarr(-10000))]);
ok('5% gross margin scores at least as well as 0%', ov({ gross_margin:5 }) >= ov({ gross_margin:0 }), [ov({ gross_margin:5 }), ov({ gross_margin:0 })]);
ok('a cash-generative company scores at least as well as one burning a little', ov({ net_burn:-10000 }) >= ov({ net_burn:10000 }), [ov({ net_burn:-10000 }), ov({ net_burn:10000 })]);
ok('no logos lost scores at least as well as one lost', ov({ logos_lost_l12:0 }) >= ov({ logos_lost_l12:1 }), [ov({ logos_lost_l12:0 }), ov({ logos_lost_l12:1 })]);
ok('no churn or contraction scores at least as well as a little', ov({ churned_arr_l12:0, contraction_arr_l12:0 }) >= ov({ churned_arr_l12:1000, contraction_arr_l12:0 }));
/* Mirrored lower-is-better curve (MET-04) and a continuous healthy range (MET-16). */
eq('lower-is-better: second anchor scores 72 (good)', bandScore(2, [1, 2, 3.5, 6], 'lo'), 72, 1e-9);
eq('lower-is-better: third anchor scores 45 (acceptable)', bandScore(3.5, [1, 2, 3.5, 6], 'lo'), 45, 1e-9);
eq('the "good" bar shown for a lower-is-better metric is the second anchor', goodValue({ dir:'lo' }, [1, 2, 3.5, 6]), 2);
ok('option pool score has no jump at the edge of the healthy range', Math.abs(bandedIdeal(20.01, [9, 20], [3, 30]) - bandedIdeal(20, [9, 20], [3, 30])) < 1);
/* Evidence (MET-01): good news needs evidence, bad news does not. */
const tagged = ev => { const c = company(); Object.keys(c.vals).forEach(k => c.evid[k] = ev); return Radar.assess(c).scoring; };
ok('the same figures score higher when backed by bank records than when untagged', tagged('bank').overallRaw > Radar.assess(company()).scoring.overallRaw);
const weakNrr = s => s.dimensions.find(d => d.id === 'revenue').metrics.find(m => m.key === 'grr');
const badCo = company({ churned_arr_l12:900000 });
ok('a poor metric keeps its score whatever the evidence', weakNrr(Radar.assess(badCo).scoring).score === weakNrr(Radar.assess(badCo).scoring).rawScore);
/* Contested inputs (MET-02): a material waterfall gap makes the growth score count as barely evidenced. */
const gap = Radar.assess(company({ arr_now:TYP.vals.arr_now * 1.15 })).scoring;
const gm = gap.dimensions.find(d => d.id === 'revenue').metrics.find(m => m.key === 'growth_yoy');
ok('figures behind a failed waterfall check are marked contested', gm && gm.contested && gm.evidence <= 0.1, gm && [gm.contested, gm.evidence]);
/* Explainability: contributions add up to the headline. */
const sc0 = Radar.assess(company()).scoring;
eq('metric and adjustment contributions add up to the overall score', sc0.contributions.reduce((a, c) => a + c.points, 0), sc0.overallRaw, 0.6);

/* 6c. Provenance: every default bar carries a source and date or is labelled a calibration (honest numbers). */
const missing = [], badRef = [];
Object.keys(RUBRIC.thresholds).forEach(k => {
  const pr = provenanceOf(k);
  if (pr.status !== 'CALIBRATION') missing.push(k);
  pr.refs.forEach(r => { if (!r.src || !r.asOf || !r.pop || !r.status || !r.url || r.val == null) badRef.push(k + ':' + (r.src || '?')); });
});
ok('every default bar has a status (calibration unless a source is listed)', missing.length === 0, missing);
ok('every reference point has source, date, population, status, URL and a value', badRef.length === 0, badRef);
ok('a reference value scores through the bars in force', refScore('nrr', 101, 'a') > 40 && refScore('nrr', 101, 'a') < 60, refScore('nrr', 101, 'a'));
ok('no unconfirmed figure is presented as verified', Object.keys(PROVENANCE).every(k => provenanceOf(k).refs.every(r => r.status !== 'VERIFIED' || r.asOf !== 'not verified')));

/* 7. Random companies (seeded): every score stays in range and nothing throws. */
const rnd = mulberry32(20261004);
const pick = (lo, hi) => lo + (hi - lo) * rnd();
let fuzzBad = [];
for (let i = 0; i < 150; i++) {
  const stage = ['preseed','seed','a','b'][i % 4], model = ['saas','ai_app','marketplace','fintech'][(i >> 2) % 4];
  const v = {};
  Object.keys(TYP.vals).forEach(k => { if (rnd() < 0.8) v[k] = TYP.vals[k] * pick(0, 3) * (rnd() < 0.05 ? -1 : 1); });
  let r; try { r = Radar.assess({ name:'R' + i, stage, model, vals:v, bools:TYP.bools, sel:TYP.sel, evid:{} }); } catch (e) { fuzzBad.push(i + ': ' + e.message); continue; }
  const s = r.scoring;
  if (s.overall != null && !(s.overall >= 0 && s.overall <= 100)) fuzzBad.push(i + ': overall ' + s.overall);
  s.dimensions.forEach(dd => { if (dd.score != null && !(dd.score >= 0 && dd.score <= 100)) fuzzBad.push(i + ': ' + dd.id + ' ' + dd.score); });
  if (s.band && !(s.band[0] <= s.overall && s.overall <= s.band[1])) fuzzBad.push(i + ': band ' + JSON.stringify(s.band));
}
ok('150 random companies: scores in range, band contains the score, no errors', fuzzBad.length === 0, fuzzBad.slice(0, 5));
`;

runSuite('Scoring properties', TESTS, 'const TYP = ' + JSON.stringify(arch) + ';');
