// SAFE, convertible-note and option-pool conventions, with worked examples computed by hand.
// Findings DEAL-02 (post-money SAFEs are diluted by the pool top-up, as in YC's document), DEAL-03
// (note discount), DEAL-04 (what a pre-money note cap is measured on) and DEAL-05 (no silent clamp)
// of the independent review
//   node tests/deal-conventions.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
const M = 1e6;
function run(over, cfg) {
  applyConfig(EMPTY_CONFIG()); if (cfg) applyConfig(cfg);
  S = blankState(); S.stage = 'a'; S.model = 'saas';
  S.vals = Object.assign({ round_size:String(5 * M), round_pre_money:String(20 * M), pool_target_post:'0', option_pool:'0', prior_investor_pct:'30', our_check:String(1 * M), total_raised:String(4 * M) }, over);
  const X = dealMath({});
  applyConfig(EMPTY_CONFIG());
  return X;
}
const near = (name, got, exp, tol) => eq(name, got, exp, tol == null ? 1e-6 : tol);
const sumFr = X => X.fNew + X.fSafe + X.fNote + X.fTop + X.fPrior + X.fPoolOld + X.fCommon;

/* A. Post-money SAFE, no pool top-up: SAFE owns amount / cap of the pre-round capitalisation. */
let X = run({ safes_outstanding:String(2 * M), safe_cap:String(10 * M) });
near('A: SAFE stake is 0.2 x 0.8 = 16 % of the post-money', X.fSafe, 0.16);
near('A: effective pre-money is 20 - 0.16 x 25 = $16M', X.effPre, 16 * M, 1);
near('A: shares add up to 100 %', sumFr(X), 1, 1e-9);

/* B. The same SAFE with a pool top-up to 10 %: the SAFE is diluted by the top-up (YC: the increase to the
      unissued pool in the financing is excluded from Company Capitalization, so SAFE holders are diluted by it). */
X = run({ safes_outstanding:String(2 * M), safe_cap:String(10 * M), option_pool:'5', pool_target_post:'10' });
near('B: SAFE stake 14.5833 %', X.fSafe, 0.145833333, 1e-6);
near('B: pool top-up 7.0833 %', X.fTop, 0.070833333, 1e-6);
near('B: effective pre-money $14.5833M', X.effPre, 14583333.33, 1);
near('B: the pool reaches exactly 10 % after the round', X.fPoolOld + X.fTop, 0.10, 1e-9);
near('B: shares add up to 100 %', sumFr(X), 1, 1e-9);

/* C. Note with a 20 % discount (DEAL-03): accrued / ((1 - d) x post-money fraction), 1M / 0.8 / 25M = 5.00 %. */
X = run({ notes_principal:String(1 * M), notes_rate:'0', notes_months:'0', notes_discount:'20' });
near('C: note stake 5.00 %', X.fNote, 0.05, 1e-9);
near('C: effective pre-money $18.75M', X.effPre, 18.75 * M, 1);

/* D. Note with a cap only (nothing else in the stack): the two cap readings agree. */
X = run({ notes_principal:String(1 * M), notes_rate:'0', notes_months:'0', notes_cap:String(8 * M) });
near('D: note stake = 1/9 of the pre-money block = 8.89 %', X.fNote, 0.08888889, 1e-6);

/* E. Mixed stack (DEAL-04). Default reading: the note cap is a valuation of the EXISTING shares, so SAFE
      shares and the pool do not dilute the note price. */
const mixed = { safes_outstanding:String(2 * M), safe_cap:String(10 * M), notes_principal:String(1 * M), notes_rate:'0', notes_months:'0', notes_cap:String(8 * M) };
X = run(mixed);
near('E: SAFE stake 16 %', X.fSafe, 0.16, 1e-9);
near('E: note stake 7.11 % (cap on the existing shares)', X.fNote, 0.0711111, 1e-6);
near('E: shares add up to 100 %', sumFr(X), 1, 1e-9);
X = run(mixed, { settings:{ noteCapBasis:'block' } });
near('E (owner setting "block"): note stake 8.89 % (cap on the whole pre-money block)', X.fNote, 0.0888889, 1e-6);
near('E (block): SAFE stake still 16 %', X.fSafe, 0.16, 1e-9);

/* F. A heavy SAFE is not clamped (DEAL-05): $8M at a $10M post-money cap owns 80 % of the pre-round capitalisation. */
X = run({ safes_outstanding:String(8 * M), safe_cap:String(10 * M) });
near('F: SAFE stake 64 % of the post-money', X.fSafe, 0.64, 1e-9);
near('F: effective pre-money $4M', X.effPre, 4 * M, 1);

/* G. Inputs that cannot work are reported, not silently changed. */
X = run({ safes_outstanding:String(1 * M), safe_cap:String(10 * M), safe_discount:'100' });
ok('G: a 100 % discount is reported', X.notes.some(n => /discount/i.test(n)), X.notes);
X = run({ safes_outstanding:String(9.9 * M), safe_cap:String(10 * M) });
ok('G: SAFEs that would own over 98 % are reported', X.notes.some(n => /98/.test(n)), X.notes);

/* I. Heavy overhang (found by the key-2 deal verifier): a $9.5M SAFE at a $10M post-money cap owns 95 % of the
      pre-round capitalisation = 0.95 x 0.8 = 76 % of the post-money; the old iteration gave up and returned 0. */
X = run({ safes_outstanding:String(9.5 * M), safe_cap:String(10 * M) });
near('I: a $9.5M SAFE at a $10M cap owns 76 % of the post-money', X.fSafe, 0.76, 1e-9);
near('I: effective pre-money $1M', X.effPre, 1 * M, 1);
X = run({ safes_outstanding:String(9 * M), safe_cap:String(10 * M), option_pool:'5', pool_target_post:'10', notes_principal:String(0.5 * M), notes_rate:'0', notes_months:'0', notes_cap:String(8 * M) });
ok('I: SAFE + note + pool with a 90 % overhang still resolves, fractions add up to 1', Math.abs(sumFr(X) - 1) < 1e-9 && X.fSafe > 0.5 && X.fNote > 0 && X.fTop >= 0, [X.fSafe, X.fNote, X.fTop, sumFr(X)]);
/* Infeasible stacks are reported, not zeroed silently: SAFE at 98 % plus a note that converts at the round price owns more than the company. */
X = run({ safes_outstanding:String(9.8 * M), safe_cap:String(10 * M), notes_principal:String(0.5 * M), notes_rate:'0', notes_months:'0', notes_cap:String(8 * M), pool_target_post:'10', option_pool:'5' });
ok('I: an infeasible stack says so', X.notes.some(n => /no consistent conversion/i.test(n)), X.notes);
X = run({ safes_outstanding:String(12 * M), safe_cap:String(10 * M) });
ok('I: a SAFE above its own cap is limited at 98 % and reported', X.notes.some(n => /98/.test(n)) && X.fSafe < 0.8 && X.fSafe > 0.7, [X.fSafe, X.notes]);
/* J. A pool target that cannot fit in the pre-money is capped and reported, not silently distorted. */
X = run({ pool_target_post:'85' });
ok('J: an impossible pool target is capped with a message', X.notes.some(n => /cannot fit/i.test(n)) && X.fPoolOld + X.fTop <= 0.8, [X.fTop, X.notes]);
near('J: fractions still add up to 1', sumFr(X), 1, 1e-9);


/* K. DEAL-07: unallocated options receive nothing at an exit; the owner can choose the earlier convention. */
const exitAt = (mode, x) => {
  const cfg = mode === 'paid' ? { settings:{ waterfallPool:'paid' } } : null;
  const Y = run({ option_pool:'10', pool_target_post:'0' }, cfg);
  const r = Y.wf(x);
  return { r, Y, total:Object.values(r.byId).reduce((a, b) => a + b, 0) + r.common + r.debt };
};
const KX = 200 * M;
const ex = exitAt('excluded', KX), pd = exitAt('paid', KX);
near('K: payouts add up to the exit value (pool not paid)', ex.total, KX, 1);
near('K: and when the pool is paid as common', pd.total, KX, 1);
ok('K: the new money gets more when the unallocated pool is not paid', ex.r.byId.new > pd.r.byId.new, [ex.r.byId.new, pd.r.byId.new]);
near('K: by exactly the pool’s share, redistributed pro rata', ex.r.byId.new / pd.r.byId.new, 1 / (1 - ex.Y.fPoolOld - ex.Y.fTop), 1e-6);
ok('K: the deal says so', ex.Y.notes.some(n => /unallocated option pool/i.test(n)), ex.Y.notes);
ok('K: nothing is said when there is no pool', run({ option_pool:'0' }).notes.every(n => !/unallocated option pool/i.test(n)), '');


/* L. DEAL-08: impossible inputs are kept inside what a deal can be, and the report says so. */
const bad = run({ new_liq_pref:'-1', debt_outstanding:String(-5 * M), option_pool:'100', prior_investor_pct:'150', pool_target_post:'100', future_rounds:'-2', dilution_per_round:'120' });
ok('L: every ownership fraction is a share between 0 and 1', [bad.fNew, bad.fSafe, bad.fNote, bad.fTop, bad.fPrior, bad.fPoolOld, bad.fCommon].every(v => v >= -1e-12 && v <= 1 + 1e-12), [bad.fNew, bad.fPrior, bad.fPoolOld, bad.fCommon]);
near('L: and they add up to 1', sumFr(bad), 1, 1e-9);
ok('L: the effective pre-money is not negative', bad.effPre >= 0, bad.effPre);
ok('L: nobody receives a negative amount at an exit of zero', (() => { const r = bad.wf(0); return Object.values(r.byId).every(v => v >= 0) && r.common >= 0 && r.debt >= 0; })(), '');
ok('L: ownership at exit is not above ownership at entry', bad.ownExit == null || bad.ownExit <= bad.ownEntry + 1e-12, [bad.ownEntry, bad.ownExit]);
ok('L: every correction is named', ['preference multiple', 'Debt', 'option pool', 'prior investors', 'Further rounds', 'Dilution'].every(w => bad.notes.some(n => n.includes(w))), bad.notes);
ok('L: a sensible deal gets no correction note', run({}).notes.every(n => !/was .*, outside/.test(n)), run({}).notes);

/* M. DEAL-09: the default-alive test holds expenses flat (Paul Graham), unless the owner chooses the trend. */
const da = (cfg) => { applyConfig(Object.assign(EMPTY_CONFIG(), cfg || {})); const r = defaultAlive({ rev0:100000, exp0:200000, cash0:4 * M, g:3, eg:2 }); applyConfig(EMPTY_CONFIG()); return r; };
ok('M: with expenses flat, revenue growing 3 % a month catches up before the cash runs out', da().alive === true, da());
ok('M: with expenses growing 2 % a month the same company is default dead', da({ settings:{ defaultAliveExpenses:'trend' } }).alive === false, da({ settings:{ defaultAliveExpenses:'trend' } }));


/* N. DV-02: a list of SAFEs, each converting at its own price. */
const LFc = String.fromCharCode(10);
const one = run({ safes_outstanding:String(2 * M), safe_cap:String(10 * M), safe_discount:'20' });
const oneL = run({ safe_list:'2000000, 10000000, 20' });
near('N: a list of one SAFE gives the same stake as the three boxes', oneL.fSafe, one.fSafe, 1e-9);
near('N: and the same effective pre-money', oneL.effPre, one.effPre, 1);
const mixed2 = run({ safe_list:'1000000, 5000000, 0' + LFc + '1000000, , 20' });
ok('N: two SAFEs on different terms are solved exactly (fractions add up to 1)', Math.abs(sumFr(mixed2) - 1) < 1e-9 && mixed2.fSafe > 0, [mixed2.fSafe, sumFr(mixed2)]);
const rev = run({ safe_list:'1000000, , 20' + LFc + '1000000, 5000000, 0' });
near('N: the order of the lines does not matter', rev.fSafe, mixed2.fSafe, 1e-9);
const ignoresBoxes = run({ safe_list:'2000000, 10000000, 20', safes_outstanding:String(9 * M), safe_cap:String(1 * M) });
near('N: the list replaces the three boxes', ignoresBoxes.fSafe, oneL.fSafe, 1e-9);
ok('N: the deal says it used the list', mixed2.notes.some(n => /2 SAFEs from your list/.test(n)), mixed2.notes);
const agg = run({ safes_outstanding:String(2 * M), safe_cap:String(2 * M / (1 / 5 + 0)), safe_discount:'20' });
ok('N: a mixed list differs from the single-SAFE approximation (so the list is worth entering)', Math.abs(mixed2.fSafe - agg.fSafe) > 1e-4, [mixed2.fSafe, agg.fSafe]);
ok('N: lines that cannot be read are skipped', run({ safe_list:'not a number' + LFc + '1000000, 8000000, 0' }).fSafe > 0, '');
/* O. An unreadable SAFE line is never dropped silently (e2e finding: "250000 @ 8000000 cap" was ignored and the SAFE stake showed 0 %). */
const unread = run({ safe_list:'250000 @ 8000000 cap' + LFc + '1000000, 8000000, 0' });
ok('O: the unreadable line is named in the deal notes', unread.notes.some(n => /could not be read/i.test(n) && n.includes('250000 @ 8000000 cap')), JSON.stringify(unread.notes));
ok('O: the readable line still converts', unread.fSafe > 0, '');
const allBad = run({ safe_list:'250000 @ 8000000 cap; 500000 @ 12000000 cap' });
ok('O: when nothing can be read the SAFE stake is zero and the notes say why', allBad.fSafe === 0 && allBad.notes.some(n => /could not be read/i.test(n)), JSON.stringify(allBad.notes));


/* H. Without any SAFE, note or top-up the maths is unchanged from 4.3. */
X = run({ pool_target_post:'0' });
near('H: new money 20 %', X.fNew, 0.2, 1e-9);
near('H: effective pre-money equals the headline pre-money', X.effPre, 20 * M, 1);
`;

runSuite('SAFE, note and pool conventions', TESTS);
