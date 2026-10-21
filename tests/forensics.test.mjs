// Forensic false alarms: seeded clean ledgers (nothing planted) must almost never raise a flag, and
// planted problems must still be caught. Numbers come from the 2026-10-04 forensics audit
//.
//   node tests/forensics.test.mjs          (add --measure to print the false-alarm rates)
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
/* A clean ledger: 150 customers at the start, lognormal prices, 1.3 % monthly churn, occasional upsell.
   growth = net monthly logo growth (0 = flat, 0.04 = growing). Nothing is planted. */
function genLedger(seed, growth, T) {
  T = T || 24;
  const rand = mulberry32(seed);
  const pois = lam => { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= rand(); } while (p > L); return k - 1; };
  const price = () => Math.round(Math.exp(Math.log(1500) + 0.6 * gauss(rand)) / 10) * 10;
  const months = Array.from({ length:T }, (_, k) => monthAdd('2024-09', k));
  const all = []; let id = 0;
  for (let i = 0; i < 150; i++) all.push({ id:'C' + (id++), p:price(), rows:Array(T).fill(0), alive:true });
  for (let t = 0; t < T; t++) {
    if (t > 0) {
      all.forEach(c => { if (c.alive) { if (rand() < 0.013) c.alive = false; else if (rand() < 0.02) c.p = Math.round(c.p * 1.15); } });
      const n = all.filter(c => c.alive).length, k = pois(n * (0.013 + growth));
      for (let j = 0; j < k; j++) all.push({ id:'C' + (id++), p:price(), rows:Array(T).fill(0), alive:true });
    }
    all.forEach(c => { if (c.alive) c.rows[t] = c.p; });
  }
  return 'customer,' + months.join(',') + '\n' + all.map(c => c.id + ',' + c.rows.join(',')).join('\n');
}
function flags(csv) {
  /* The honest founder states the cohort NRR the ledger gives; without a stated NRR the nrr_definition test could never fire (FV-18). */
  const nrr = ledgerAnalytics(parseLedger(csv).ledger).nrrCohort;
  const r = Radar.assess({ name:'g', stage:'a', model:'saas', vals:{ arr_now:'3000000', arr_12mo:'2400000', customers_now:'150', months_since_round:'14', stated_nrr:String(Math.round(nrr * 10) / 10) }, ledgerCSV:csv });
  const fx = id => (r.forensics.find(f => f.id === id) || {}).status;
  const pat = id => r.patterns.some(p => p.id === id && p.sev !== 'green');
  return { spike: fx('final_spike') === 'warn' || fx('final_spike') === 'fail', oneOffs: fx('one_offs') === 'warn', quarter: fx('quarter_end') === 'warn',
    react: fx('reactivation') === 'warn', dupes: fx('dupes') === 'warn', benford: fx('benford') === 'warn' || fx('benford') === 'fail',
    windowDressing: pat('window_dressing'), cohortDecay: pat('cohort_decay'), nrrDef: pat('nrr_definition') };
}
const N = 40;
const rate = (g, key) => { let n = 0; for (let s = 1; s <= N; s++) if (flags(genLedger(1000 + s, g))[key]) n++; return n / N; };
const KEYS = ['spike', 'oneOffs', 'quarter', 'react', 'dupes', 'benford', 'windowDressing', 'cohortDecay', 'nrrDef'];
const R = { flat:{}, growing:{} };
KEYS.forEach(k => { R.flat[k] = rate(0, k); R.growing[k] = rate(0.04, k); });
globalThis.__rates = R;

ok('the generator produces a valid ledger', parseLedger(genLedger(7, 0)).ok);

/* Maximum tolerated false-alarm rate on clean ledgers (nothing planted). */
const LIMIT = { spike:0.10, oneOffs:0.10, quarter:0.10, react:0.05, dupes:0.05, benford:0.10, windowDressing:0.10, cohortDecay:0.10, nrrDef:0.10 };
/* FV-01 (key-2 forensics check): fast-growing honest companies must not be flagged as window dressing. 7 %, 10 % and
   14 % net monthly logo growth fired the two-month test on 18 %, 43 % and 95 % of clean ledgers before it was
   measured against the MRR at the start of each month. */
[0.07, 0.10, 0.14].forEach(g => {
  const r = rate(g, 'spike');
  ok('clean ledgers growing ' + Math.round(g * 100) + ' % a month: final-spike false-alarm rate <= 10 %', r <= 0.10, r);
});
KEYS.forEach(k => {
  ok('clean flat ledgers: ' + k + ' false-alarm rate <= ' + LIMIT[k] * 100 + ' %', R.flat[k] <= LIMIT[k], R.flat[k]);
  ok('clean growing ledgers: ' + k + ' false-alarm rate <= ' + LIMIT[k] * 100 + ' %', R.growing[k] <= LIMIT[k], R.growing[k]);
});

/* Detection still works: a planted pull-forward (3.2 x the usual new MRR, split over the last two months) and one month. */
function planted(seed, split) {
  /* The last month (one-month case) carries 3.2 x the usual new MRR; in the two-month case each of the last two months brings its own new customers, 1.6 x the usual new MRR each. */
  const base = genLedger(seed, 0.04), lines = base.split('\n'), T = lines[0].split(',').length - 1;
  const A = ledgerAnalytics(parseLedger(base).ledger), prior = A.bridge.slice(-7, -1).map(b => b.nw + b.react);
  const usual = prior.reduce((a, b) => a + b, 0) / prior.length;
  const perMonth = split ? 0.6 * usual : 2.2 * usual, price = 2600, count = Math.max(1, Math.round(perMonth / price));
  const extra = [];
  for (let j = 0; j < count; j++) { const r = Array(T + 1).fill(0); r[0] = 'PF' + j; r[T] = price; extra.push(r.join(',')); if (split) { const q = Array(T + 1).fill(0); q[0] = 'PG' + j; q[T - 1] = price; q[T] = price; extra.push(q.join(',')); } }
  return lines.concat(extra).join('\n');
}
let caughtOne = 0, caughtTwo = 0;
for (let s = 1; s <= 20; s++) { if (flags(planted(2000 + s, false)).spike) caughtOne++; if (flags(planted(2000 + s, true)).spike) caughtTwo++; }
ok('a one-month pull-forward is caught in at least 18 of 20 ledgers', caughtOne >= 18, caughtOne);
/* The hardest case: 1.6 x the usual new MRR in each of two months is within the month-to-month noise of a small ledger.
   Before the 2026-10-04 fix it was caught in 0 of 20; the threshold trades detection against the 7.5 % false-alarm rate above. */
ok('a two-month pull-forward is caught in at least 8 of 20 ledgers', caughtTwo >= 8, caughtTwo);
`;

const out = runSuite('Forensic false alarms', TESTS);
if (process.argv.includes('--measure')) console.log(JSON.stringify(globalThis.__rates, null, 1));
