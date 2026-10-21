
/* ═══════════════════════════════════════════════════════════════
   DEAL MATHS — ownership, dilution, fund economics, liquidation
   Standard venture conventions, stated explicitly:
   · pre-money includes the SAFE conversion and any option-pool top-up
     (the "pool shuffle"), so both are borne by existing holders;
   · post-money SAFEs convert at the lower of the cap price (cap ÷ Company Capitalization, which counts the
     existing pool, all SAFEs and notes but NOT the pool increase in this round, as in YC's document) and the
     discount price ((1 − discount) × the round price), so SAFE holders are diluted by the top-up;
   · convertible notes accrue simple interest and convert at the lower of the cap price and the discount price;
     the cap is measured on the existing fully diluted shares (owner setting noteCapBasis: 'block' measures it
     on the existing shares plus SAFE shares and the pool top-up (not the notes' own shares), which shields notes from SAFE and pool dilution);
   · conversions, the pool top-up and the round price are solved together (bisection), in share units;
   · all preferred series are modelled pari passu, non-participating
     unless flagged (participation can be capped); debt is senior to everything.
   ═══════════════════════════════════════════════════════════════ */
const DEAL_DEFAULTS = { fund_size:null, exit_multiple:8, future_rounds:{ preseed:4, seed:3, a:2, b:1 }, dilution:20, pool_target:10 };

function dealInputs() {
  const n = id => gv(id);
  const I = dealInputsRaw(n);
  /* One-keystroke typos must not produce impossible results: every input is kept inside what a deal can be, and the report says what was changed. */
  const fixes = [];
  const lim = (k, lo, hi, what) => { const v = I[k]; if (v == null || !isFinite(v)) return; const c = clamp(v, lo, hi); if (c !== v) { fixes.push(`${what} was ${v}, outside ${lo} to ${hi}; ${c} was used.`); I[k] = c; } };
  lim('newPref', 0, 10, 'The new round’s liquidation preference multiple'); lim('priorPref', 0, 10, 'The prior investors’ preference multiple');
  lim('newPartCap', 0, 20, 'The participation cap'); lim('debt', 0, Infinity, 'Debt outstanding'); lim('safe', 0, Infinity, 'SAFEs outstanding');
  lim('notes', 0, Infinity, 'Convertible notes'); lim('raised', 0, Infinity, 'Total raised');
  lim('poolNow', 0, 95, 'The unallocated option pool (%)'); lim('poolTarget', 0, 90, 'The option pool target (% of post-money)');
  lim('priorPct', 0, 99, 'The prior investors’ stake (%)'); lim('rounds', 0, 10, 'Further rounds'); lim('dil', 0, 95, 'Dilution per round (%)');
  if (I.priorPct != null && I.priorPct + I.poolNow > 100) { const c = Math.max(0, 100 - I.poolNow); fixes.push(`The prior investors’ stake (${I.priorPct}%) and the pool (${I.poolNow}%) add up to more than 100%; the stake was set to ${c}%.`); I.priorPct = c; }
  I.fixes = fixes;
  if (I.safeList.length) { I.safe = sum(I.safeList.map(x => x.amt)); }
  return I;
}
/* The SAFE list: one SAFE per line as amount, cap, discount. Lines that cannot be read are skipped. */
function parseSafeList() {
  const raw = String((S.vals && S.vals.safe_list) || '');
  const out = [], skipped = [];
  raw.split(String.fromCharCode(10)).forEach(line => {
    const parts = line.split(/[;,\t]/).map(x => x.trim());
    const amt = parseNum(parts[0]);
    if (!(amt > 0)) { if (line.trim()) skipped.push(line.trim().slice(0, 60)); return; }
    const cap = parseNum(parts[1]), disc = parseNum(parts[2]);
    out.push({ amt, cap:cap > 0 ? cap : null, disc:disc != null ? clamp(disc, 0, 95) : 0 });
  });
  const res = out.slice(0, 40);
  res.skipped = skipped;   /* named in the deal notes: a SAFE that is left out would understate the dilution */
  return res;
}
function dealInputsRaw(n) {
  return {
    round: n('round_size'), pre: n('round_pre_money'), check: n('our_check'),
    poolTarget: n('pool_target_post') != null ? n('pool_target_post') : DEAL_DEFAULTS.pool_target,
    poolNow: n('option_pool') != null ? n('option_pool') : 0,
    newPref: n('new_liq_pref') != null ? n('new_liq_pref') : 1,
    newPart: gb('new_participating') === true,
    priorPct: n('prior_investor_pct'),
    priorPref: n('liq_pref') != null ? n('liq_pref') : 1,
    priorPart: gb('participating') === true,
    raised: n('total_raised') || 0,
    safe: n('safes_outstanding') || 0, safeList: parseSafeList(), safeCap: n('safe_cap'), safeDisc: clamp(n('safe_discount') || 0, 0, 95), safeDiscRaw: n('safe_discount') || 0,
    notes: notesAccrued() || 0, notesPrincipal: n('notes_principal') || 0, notesCap: n('notes_cap'), notesDisc: clamp(n('notes_discount') || 0, 0, 95), notesDiscRaw: n('notes_discount') || 0,
    newPartCap: n('new_part_cap') > 0 ? n('new_part_cap') : null,
    debt: n('debt_outstanding') || 0,
    fund: n('fund_size'),
    exitMult: n('exit_multiple_assumption') != null ? n('exit_multiple_assumption') : DEAL_DEFAULTS.exit_multiple,
    rounds: n('future_rounds') != null ? n('future_rounds') : DEAL_DEFAULTS.future_rounds[stageKey()],
    dil: n('dilution_per_round') != null ? n('dilution_per_round') : DEAL_DEFAULTS.dilution,
    lastPre: n('pre_money'),
  };
}

/* Solve SAFE conversion, note conversion and the pool top-up together. Units: existing fully diluted shares = 1.
   The round price is pre ÷ (all shares in the pre-money block), because the headline pre-money includes the
   converting instruments and the top-up. Returns the stakes as fractions of the post-money. */
function solveConversions(I, P) {
  const E = 1, p = I.poolNow / 100, tgt = I.poolTarget / 100, k = P / I.pre, scale = I.pre / P;
  const basis = (typeof CFG !== 'undefined' && CFG.settings && CFG.settings.noteCapBasis) === 'block' ? 'block' : 'existing';
  const notes = [];
  if (I.safeDiscRaw > 95 || I.notesDiscRaw > 95) notes.push('A discount above 95% was treated as 95%.');
  /* The SAFE's cap price cannot make the SAFEs own more than 98% of the pre-round capitalization. */
  let safeCap = I.safeCap > 0 ? I.safeCap : null;
  if (I.safe > 0 && safeCap != null && safeCap < I.safe / 0.98) {
    safeCap = I.safe / 0.98;
    notes.push(`The SAFEs of ${money(I.safe)} against a ${money(I.safeCap)} cap would own more than 98% of the company before this round (limit applied at 98%). Check the SAFE amount and cap.`);
  }
  /* Each SAFE of an entered list converts at its own price; without a list the three boxes describe one SAFE. */
  const safes = (I.safeList && I.safeList.length ? I.safeList : (I.safe > 0 ? [{ amt:I.safe, cap:safeCap, disc:I.safeDisc }] : []))
    .map(x => {
      if (x.cap != null && x.cap < x.amt / 0.98) { notes.push(`A SAFE of ${money(x.amt)} at a ${money(x.cap)} cap would own more than 98% of the company before this round (limit applied at 98%).`); return Object.assign({}, x, { cap:x.amt / 0.98 }); }
      return x;
    });
  if (I.safeList && I.safeList.skipped && I.safeList.skipped.length)
    notes.push(`${I.safeList.skipped.length} line${I.safeList.skipped.length === 1 ? '' : 's'} of the SAFE list could not be read and ${I.safeList.skipped.length === 1 ? 'was' : 'were'} left out: “${I.safeList.skipped.slice(0, 3).join('”, “')}”. Write each SAFE on its own line as “amount, valuation cap, discount %”.`);
  if (I.safeList && I.safeList.length) notes.push(`${I.safeList.length} SAFE${I.safeList.length === 1 ? '' : 's'} from your list, each converting at its own price (the three SAFE boxes are not used).`);
  /* The pool target cannot exceed what fits in the pre-money block; cap it and say so. */
  let tgtEff = tgt;
  if (tgt * k > 0.98) { tgtEff = 0.98 / k; notes.push(`An option pool target of ${fmtPct(tgt * 100)} of the post-money cannot fit inside a ${money(I.pre)} pre-money; it is capped at ${fmtPct(tgtEff * 100)}.`); }
  /* Everything is a function of C, the Company Capitalization (existing + SAFE + note shares, excluding the new top-up):
     top-up T(C), round price, SAFE shares S(C) and note shares N(C). The answer is the C with E + S(C) + N(C) = C, found by
     bisection (exact for any overhang below 100 %; a fixed-point iteration stops converging as the overhang approaches 1). */
  const at = C => {
    const T = Math.max(0, (tgtEff * C * k - p) / (1 - tgtEff * k));
    const pps = I.pre / (C + T);
    let S = 0, N = 0, priceS = null, priceN = null;
    if (safes.length) { safes.forEach(x => { S += x.amt / Math.min(x.cap != null ? x.cap / C : Infinity, (1 - x.disc / 100) * pps); }); priceS = sum(safes.map(x => x.amt)) / S; }
    if (I.notes > 0) {
      const capBase = basis === 'block' ? (E + S + T) : E;
      priceN = Math.min(I.notesCap > 0 ? I.notesCap / capBase : Infinity, (1 - I.notesDisc / 100) * pps);
      N = I.notes / priceN;
    }
    return { S, N, T, priceS, priceN, res: E + S + N - C };
  };
  let lo = E, hi = 2 * E, r = at(hi), guard = 0;
  while (r.res > 0 && hi < 1e9 && guard++ < 60) { lo = hi; hi *= 2; r = at(hi); }
  let S = 0, N = 0, T = 0, priceS = null, priceN = null;
  if (r.res > 0 || !isFinite(r.res)) {
    notes.push('The SAFEs and notes would own the whole company before this round (their amounts are at or above the caps); no consistent conversion exists. Check the SAFE and note amounts and caps.');
  } else {
    for (let it = 0; it < 200; it++) { const mid = (lo + hi) / 2, m = at(mid); if (m.res > 0) lo = mid; else hi = mid; }
    ({ S, N, T, priceS, priceN } = at((lo + hi) / 2));
  }
  const B = E + S + N + T;
  return {
    fSafe: S / B * scale, fNote: N / B * scale, fTop: T / B * scale, base: E / B * scale,
    vEff: safes.length && priceS ? priceS * (E + S + N) : null,
    vNote: I.notes > 0 && priceN ? priceN * (basis === 'block' ? (E + S + T) : E) : null,
    notes,
  };
}

function dealMath(D) {
  const I = dealInputs();
  if (!(I.round > 0 && I.pre > 0)) return null;
  const P = I.pre + I.round;
  const notes = [];
  if (I.check > I.round) { notes.push(`Your cheque of ${money(I.check)} is larger than the ${money(I.round)} round; it is treated as the whole round.`); I.check = I.round; }
  /* A participation cap at or below the preference means no participation at all. */
  if (I.newPart && I.newPartCap != null && I.newPartCap <= I.newPref) { I.newPart = false; I.capAsNonPart = true; }
  if (!I.newPart) I.newPartCap = null;
  /* SAFEs, notes and the pool top-up are solved together (see solveConversions). */
  const conv = solveConversions(I, P);
  const { fSafe, fNote, fTop, base, vEff, vNote } = conv;
  conv.notes.forEach(x => notes.push(x));
  (I.fixes || []).forEach(x => notes.push(x));
  const p = I.poolNow / 100;
  let priorPct = I.priorPct, priorEstimated = false;
  if (priorPct == null) {
    const lastPost = I.lastPre ? I.lastPre + I.raised : null;
    priorPct = lastPost ? clamp(I.raised / lastPost * 100, 10, 70) : clamp(35, 10, 70);
    priorEstimated = true;
  }
  const fPrior = base * priorPct / 100, fPoolOld = base * p;
  const fCommon = Math.max(0, base - fPrior - fPoolOld);
  const fNew = I.round / P;
  const ownEntry = I.check > 0 ? I.check / P : null;
  const effPre = I.pre - (fTop + fSafe + fNote) * P;
  const retain = Math.pow(1 - I.dil / 100, I.rounds);
  const ownExit = ownEntry != null ? ownEntry * retain : null;
  const arr = gv('arr_now');
  const entryMult = arr > 0 ? P / arr : null;
  const growthAdj = entryMult != null && D.growth_yoy > 0 ? entryMult / (D.growth_yoy / 100) : null;
  const fundReturner = I.fund > 0 && ownExit > 0 ? I.fund / ownExit : null;
  const threeX = I.check > 0 && ownExit > 0 ? 3 * I.check / ownExit : null;
  const arrForFund = fundReturner != null && I.exitMult > 0 ? fundReturner / I.exitMult : null;
  const samShare = arrForFund != null && D.sam > 0 ? arrForFund / D.sam * 100 : null;
  const tamShare = arrForFund != null && D.tam_bottomup > 0 ? arrForFund / D.tam_bottomup * 100 : null;
  if (priorEstimated) notes.push(I.lastPre && I.raised
    ? `Prior investors’ stake was not entered; ${priorPct.toFixed(0)}% is estimated from total raised and the last pre-money. Enter it for an exact waterfall.`
    : `Prior investors’ stake was not entered; the waterfall uses a placeholder of ${priorPct.toFixed(0)}%. Enter it (Round & returns) for an exact waterfall.`);
  if (fTop > 0.001) notes.push(`The pool top-up of ${fmtPct(fTop * 100)} comes out of the pre-money: existing holders and converting SAFEs and notes bear it, new money does not.`);
  if (fNote > 0.001) notes.push(`Convertible notes of ${money(I.notesPrincipal)} have accrued to ${money(I.notes)} and convert at a ${money(vNote)} valuation into ${fmtPct(fNote * 100)} of the company — also out of the pre-money.`);

  const classes = [
    { id:'new', label:'This round', frac:fNew, pref:I.round * I.newPref, part:I.newPart, cap:I.newPart && I.newPartCap ? I.round * I.newPartCap : null },
    { id:'safe', label:'Converting SAFEs', frac:fSafe, pref:I.safe, part:false },
    { id:'notes', label:'Converting notes', frac:fNote, pref:I.notes, part:false },
    { id:'prior', label:'Prior investors', frac:fPrior, pref:I.raised * I.priorPref, part:I.priorPart },
  ].filter(c => c.frac > 0 || c.pref > 0);
  /* Unallocated options (the existing pool and the top-up) receive nothing at an exit unless the owner chooses otherwise. */
  const poolPaid = sx('waterfallPool') === 'paid';
  const commonFrac = fCommon + (poolPaid ? fPoolOld + fTop : 0);
  if (!poolPaid && fPoolOld + fTop > 0.001) notes.push(`The unallocated option pool (${fmtPct((fPoolOld + fTop) * 100)}) is not paid at an exit: its share goes pro rata to the shares actually issued. Payouts would be lower for every issued holder if the pool were treated as common (Studio, Scoring constants).`);
  const wf = x => liquidate(x, I.debt, classes, commonFrac);
  const ourShareOfNew = I.check > 0 ? I.check / I.round : 0;
  const ourAt = x => { const r = wf(x); return (r.byId.new || 0) * ourShareOfNew; };

  /* Payoff curve (log-spaced exits) and a table at round-number multiples of post-money. */
  const hiX = Math.max(P * 25, fundReturner ? fundReturner * 1.4 : 0);
  const loX = Math.max(1, P * 0.1);
  const curve = [];
  for (let k = 0; k <= 48; k++) {
    const x = loX * Math.pow(hiX / loX, k / 48);
    const r = wf(x);
    curve.push({ x, us:(r.byId.new || 0) * ourShareOfNew, common:r.common, prior:r.byId.prior || 0, safe:(r.byId.safe || 0) + (r.byId.notes || 0), newAll:r.byId.new || 0 });
  }
  const pts = [0.5, 1, 2, 5, 10].map(m => m * P);
  if (fundReturner) pts.push(fundReturner);
  const table = pts.map(x => { const r = wf(x); const us = (r.byId.new || 0) * ourShareOfNew;
    return { x, us, moic: I.check > 0 ? us / I.check : null, common:r.common, prior:r.byId.prior || 0, safe:(r.byId.safe || 0) + (r.byId.notes || 0), debt:r.debt }; });

  const out = { I, P, fNew, fSafe, fNote, vNote, fTop, fPrior, fPoolOld, fCommon, commonFrac, vEff, ownEntry, ownExit, retain, effPre,
           entryMult, growthAdj, fundReturner, threeX, arrForFund, samShare, tamShare, priorPct, priorEstimated,
           notes, classes, curve, table, ourAt, wf };
  out.terms = termReview(I, out);
  out.returns = exitScenarios(D, out);
  return out;
}
function notesAccrued() {
  const p = gv('notes_principal'); if (!(p > 0)) return null;
  const r = Math.max(0, gv('notes_rate') || 0), m = Math.max(0, gv('notes_months') || 0);
  return p * (1 + r / 100 * m / 12);
}

/* Pari passu waterfall. Each non-participating class — and each capped participating class —
   takes the better of its preference or converting to common; capped participants stop at their cap.
   Payouts are computed exactly for every candidate conversion, not approximated. */
function waterfallPayouts(rem, classes, commonFrac, conv) {
  const byId = {}; classes.forEach(c => byId[c.id] = 0);
  const takers = classes.filter(c => !conv.has(c.id));
  const prefTot = sum(takers.map(c => c.pref));
  if (rem <= prefTot) {
    takers.forEach(c => byId[c.id] = prefTot > 0 ? rem * c.pref / prefTot : 0);
    return { byId, common:0 };
  }
  takers.forEach(c => byId[c.id] = c.pref);
  let resid = rem - prefTot;
  const parts = [{ id:'__common', frac:commonFrac, room:Infinity }]
    .concat(classes.filter(c => conv.has(c.id)).map(c => ({ id:c.id, frac:c.frac, room:Infinity })))
    .concat(classes.filter(c => !conv.has(c.id) && c.part).map(c => ({ id:c.id, frac:c.frac, room:c.cap > 0 ? Math.max(0, c.cap - c.pref) : Infinity })));
  const got = {};
  for (let guard = 0; guard < parts.length + 2 && resid > 1e-9; guard++) {
    const active = parts.filter(p => p.frac > 0 && (got[p.id] || 0) < p.room - 1e-9);
    const F = sum(active.map(p => p.frac));
    if (F <= 0) break;
    let spent = 0, capped = false;
    active.forEach(p => {
      const want = resid * p.frac / F, room = p.room - (got[p.id] || 0), take = Math.min(want, room);
      got[p.id] = (got[p.id] || 0) + take; spent += take; if (want > room + 1e-9) capped = true;
    });
    resid -= spent;
    if (!capped) break;
  }
  classes.forEach(c => { byId[c.id] += got[c.id] || 0; });
  /* Anything left once every participant is capped belongs to common. */
  return { byId, common:(got.__common || 0) + (resid > 1e-9 ? resid : 0) };
}
function liquidate(x, debt, classes, commonFrac) {
  const debtPaid = Math.min(x, debt);
  const rem = Math.max(0, x - debtPaid);
  /* Every combination of conversions is evaluated exactly (at most 2^4 here). A combination is stable when
     no class can do better by switching on its own; among stable ones, the one that pays the preferred
     holders most is taken (ties: fewer conversions). */
  const opt = classes.filter(c => !(c.part && !(c.cap > 0)));
  const combos = [];
  for (let mask = 0; mask < (1 << opt.length); mask++) {
    const conv = new Set(opt.filter((c, i) => mask & (1 << i)).map(c => c.id));
    combos.push({ conv, res:waterfallPayouts(rem, classes, commonFrac, conv) });
  }
  const find = conv => combos.find(k => k.conv.size === conv.size && Array.from(conv).every(id => k.conv.has(id)));
  const stable = combos.filter(k => opt.every(c => {
    const flip = new Set(k.conv); if (flip.has(c.id)) flip.delete(c.id); else flip.add(c.id);
    return find(flip).res.byId[c.id] <= k.res.byId[c.id] + 1e-6;
  }));
  const pool = stable.length ? stable : combos;
  const prefTotal = k => sum(opt.map(c => k.res.byId[c.id]));
  pool.sort((a, b) => (prefTotal(b) - prefTotal(a)) || (a.conv.size - b.conv.size));
  const best = pool[0];
  return { byId:best.res.byId, common:best.res.common, debt:debtPaid, converted:Array.from(best.conv) };
}

/* ═══════════════════════════════════════════════════════════════
   TERM-SHEET REVIEW — each term against the market-standard version
   (NVCA model documents and the YC Series A template: 1x non-participating,
   broad-based weighted-average anti-dilution, non-cumulative dividends).
   ═══════════════════════════════════════════════════════════════ */
function termReview(I, X) {
  const out = [];
  const add = (term, value, norm, flag, note) => out.push({ term, value, norm, flag, note });
  const early = stageKey() === 'preseed' || stageKey() === 'seed';
  const xN = v => (Math.round(v * 100) / 100) + 'x';
  const prefTxt = `${xN(I.newPref)} ${I.newPart ? 'participating' + (I.newPartCap ? `, capped at ${xN(I.newPartCap)}` : ', uncapped') : I.capAsNonPart ? 'participating, capped at the preference (works as non-participating)' : 'non-participating'}`;
  const prefMax = pp('terms', 'pref'), seatAt = pp('terms', 'seat') / 100, poolMax = pp('terms', 'pool') / 100, convMax = pp('terms', 'conv') / 100;
  add('Liquidation preference', prefTxt, `${xN(prefMax)} non-participating`,
    I.newPref > prefMax || (I.newPart && !I.newPartCap) ? 'off' : I.newPart ? 'watch' : 'ok',
    I.newPref > prefMax ? `A multiple above ${xN(prefMax)} is usually a price concession in disguise, and later investors ask for the same.`
      : I.newPart && !I.newPartCap ? 'Uncapped participation takes the preference and a share of everything else: the investor “double-dips” at every exit.'
      : I.newPart ? 'Capped participation limits the double-dip; above the cap the investor converts.' : 'Market standard.');
  const ad = gs('anti_dilution');
  if (ad) add('Anti-dilution', ad, 'Broad-based weighted average',
    ad === 'Full ratchet' ? 'off' : ad === 'Narrow-based weighted average' ? 'watch' : ad === 'None' ? 'watch' : 'ok',
    ad === 'Full ratchet' ? 'In a down round the investor is repriced to the new, lower price in full — the dilution lands on founders and employees.'
      : ad === 'Narrow-based weighted average' ? 'Excludes options and warrants from the base, so the adjustment is larger than the broad-based version.'
      : ad === 'None' ? 'Unusual for a priced round; no protection in a down round.' : 'Market standard.');
  const cd = gb('cumulative_dividends');
  if (cd != null) add('Dividends', cd ? 'Cumulative' : 'Non-cumulative, when declared', 'Non-cumulative', cd ? 'off' : 'ok',
    cd ? 'Cumulative dividends accrue every year and are added to the preference, raising the bar for common in every exit.' : 'Market standard.');
  const rd = gb('redemption_rights');
  if (rd != null) add('Redemption', rd ? 'Investors can force a buy-back' : 'None', 'None at early stage', rd ? (early ? 'off' : 'watch') : 'ok',
    rd ? 'Rarely exercisable in practice, but it gives the holder leverage in a sideways outcome.' : 'Market standard.');
  const ptp = gb('pay_to_play');
  if (ptp != null) add('Pay-to-play', ptp ? 'Yes' : 'No', 'Usually no; common in down rounds', ptp ? 'watch' : 'ok',
    ptp ? 'Investors who do not take up their pro-rata in a down round lose preferences — good for the company, a commitment for us.' : 'Standard.');
  const bc = gs('board_after');
  if (bc) add('Board control', bc, early ? 'Founders control at seed' : 'Balanced, with an independent',
    bc === 'Investors control the board' ? (early ? 'off' : 'watch') : bc === 'Founders control the board' && !early ? 'watch' : 'ok',
    bc === 'Investors control the board' ? 'Investor control this early weakens founder motivation and is rarely market.'
      : bc === 'Founders control the board' && !early ? 'Common, but at this stage an independent director usually joins.' : 'In line with the stage.');
  const prr = gb('pro_rata_rights'), inf = gb('information_rights'), seat = gb('board_seat');
  if (prr != null) add('Pro-rata rights', prr ? 'Yes' : 'No', 'Yes, for major investors', prr ? 'ok' : 'watch',
    prr ? 'We can keep our ownership in the next round.' : 'No right to follow on: ownership shrinks with every round and the best companies are the hardest to get back into.');
  if (inf != null) add('Information rights', inf ? 'Yes' : 'No', 'Yes — quarterly and annual financials', inf ? 'ok' : 'watch',
    inf ? 'Standard.' : 'Without them, monitoring the investment depends on goodwill.');
  if (seat != null) add('Board or observer seat', seat ? 'Yes' : 'No', X.ownEntry != null && X.ownEntry >= seatAt ? `Usual for a lead with ${fmtPct(seatAt * 100, 0)}+` : `Not expected below ~${fmtPct(seatAt * 100, 0)}`,
    !seat && X.ownEntry != null && X.ownEntry >= seatAt ? 'watch' : 'ok',
    !seat && X.ownEntry != null && X.ownEntry >= seatAt ? `At ${fmtPct(X.ownEntry * 100, 1)} ownership a seat or observer right is normally part of the package.` : 'In line with the ownership.');
  if (X.fTop > 0.001) add('Option pool', `top-up of ${fmtPct(X.fTop * 100, 1)} in the pre-money`, 'Sized to the hiring plan', X.fTop > poolMax ? 'watch' : 'ok',
    `The pool shuffle lowers the effective pre-money to ${money(X.effPre)}. Check the pool against the 18-month hiring plan rather than a round number.`);
  const conv = X.fSafe + (X.fNote || 0);
  if (conv > 0.001) add('SAFE and note conversion', `${fmtPct(conv * 100, 1)} of the post-money`, 'Disclosed in the pre-money', conv > convMax ? 'watch' : 'ok',
    'Conversions come out of the pre-money, so the founders — not the new round — absorb them.');
  return out;
}

/* ═══════════════════════════════════════════════════════════════
   EXIT SCENARIOS — the VC Method (Sahlman) and the First Chicago Method.
   Base and upside: ownership after future dilution, as converted.
   Downside: the entry waterfall, where the preference does its work
   (later rounds' preferences, which would rank alongside, are not modelled).
   ═══════════════════════════════════════════════════════════════ */
const EXIT_DEFAULTS = {
  years:{ preseed:8, seed:7, a:6, b:5 }, irr:{ preseed:60, seed:50, a:40, b:30 }, fcRate:25,
  probs:{ preseed:[65,25,10], seed:[60,28,12], a:[45,40,15], b:[30,50,20] },
  keepBase:0.7, keepUp:0.85, floorBase:5, floorUp:10, downMultiple:1,
};
function projectArr(arr, g0, years, keep, floor) {
  let a = arr, g = Math.min(Math.max(g0, 0), 300);
  const whole = Math.floor(years), part = years - whole;
  for (let y = 0; y < whole; y++) { a *= 1 + Math.max(g, floor) / 100; g *= keep; }
  if (part > 0) a *= Math.pow(1 + Math.max(g, floor) / 100, part);
  return a;
}
function exitScenarios(D, X) {
  const I = X.I, n = id => gv(id);
  const years = n('years_to_exit') > 0 ? n('years_to_exit') : EXIT_DEFAULTS.years[stageKey()];
  const r = n('target_irr') > 0 ? n('target_irr') : EXIT_DEFAULTS.irr[stageKey()];
  const fc = n('fc_rate') > 0 ? n('fc_rate') : EXIT_DEFAULTS.fcRate;
  const arr = n('arr_now');
  const g = D.growth_yoy != null ? D.growth_yoy : D.cmgr12 != null ? (Math.pow(1 + D.cmgr12 / 100, 12) - 1) * 100 : null;
  const est = [];
  let arrBase = n('exit_arr_base'), arrUp = n('exit_arr_up'), evDown = n('exit_value_down');
  if (arrBase == null && arr > 0 && g != null) { arrBase = projectArr(arr, g, years, EXIT_DEFAULTS.keepBase, EXIT_DEFAULTS.floorBase); est.push('base'); }
  if (arrUp == null && arr > 0 && g != null) { arrUp = projectArr(arr, g, years, EXIT_DEFAULTS.keepUp, EXIT_DEFAULTS.floorUp); est.push('upside'); }
  if (arrUp != null && arrBase != null && arrUp < arrBase) arrUp = arrBase;
  if (evDown == null) { evDown = arr > 0 ? arr * (EXIT_DEFAULTS.downMultiple != null ? EXIT_DEFAULTS.downMultiple : 1) : 0; est.push('downside'); }
  if (arrBase == null) return { missing:true, years, r };
  const dp = EXIT_DEFAULTS.probs[stageKey()];
  let p = [n('prob_down'), n('prob_base'), n('prob_up')];
  let probsEstimated = p.every(v => v == null);
  const probsPartial = !probsEstimated && p.some(v => v == null);
  p = p.map((v, i) => v != null ? Math.max(0, v) : dp[i]);
  if (sum(p) <= 0) { p = dp.slice(); probsEstimated = true; }
  const pt = sum(p); p = p.map(v => v / pt);
  const who = I.check > 0 ? 'us' : 'round', stake = I.check > 0 ? I.check : I.round;
  const ownExit = I.check > 0 ? X.ownExit : X.fNew * X.retain;
  const shareOfNew = I.check > 0 ? I.check / I.round : 1;
  const downYears = Math.max(2, Math.round(years / 2));
  const irr = (moic, yrs) => moic > 0 ? Math.pow(moic, 1 / yrs) - 1 : -1;
  const mk = (name, prob, arrX, ev, diluted, yrs) => {
    const proceeds = diluted ? ownExit * ev : (X.wf(ev).byId.new || 0) * shareOfNew;
    const moic = stake > 0 ? proceeds / stake : null;
    return { name, prob, arr:arrX, ev, proceeds, moic, irr:moic != null ? irr(moic, yrs) * 100 : null, years:yrs, estimated:est.includes(name) };
  };
  const cases = [
    mk('downside', p[0], null, evDown, false, downYears),
    mk('base', p[1], arrBase, arrBase * I.exitMult, true, years),
    mk('upside', p[2], arrUp, (arrUp != null ? arrUp : arrBase) * I.exitMult, true, years),
  ];
  const expMoic = sum(cases.map(c => c.prob * (c.moic || 0)));
  const expIrr = irr(expMoic, years) * 100;
  const success = cases[2];
  /* VC Method (Sahlman): the success-case exit, discounted at the target return — a rate that is high
     precisely because it carries the risk of failure — gives the post-money the price can bear. */
  const disc = Math.pow(1 + r / 100, years);
  const justifiedPost = success.ev * X.retain / disc;
  const justifiedPre = justifiedPost - I.round;
  /* First Chicago: each case discounted at a lower rate, because failure is now in the probabilities. */
  const expEv = sum(cases.map(c => c.prob * c.ev));
  const fcPost = sum(cases.map(c => c.prob * c.ev * (c.name === 'downside' ? 1 : X.retain) / Math.pow(1 + fc / 100, c.years)));
  const exitForTarget = ownExit > 0 ? stake * disc / ownExit : null;
  return { who, stake, years, r, fc, cases, expMoic, expIrr, justifiedPost, justifiedPre, fcPost, expEv, exitForTarget,
    priceVsVc: justifiedPost / X.P - 1, priceVsFc: fcPost / X.P - 1, probsEstimated, probsPartial, estimated:est, growthUsed:g };
}
