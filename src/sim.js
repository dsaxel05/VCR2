
/* ═══════════════════════════════════════════════════════════════
   MONTE CARLO — survival and milestone odds
   Seeded from the run hash, so the same inputs always give the same
   probabilities. Growth decays month by month (companies rarely hold
   their current rate), with volatility taken from the company's own
   month-to-month history whenever it is available.
   ═══════════════════════════════════════════════════════════════ */
function simulate(P, seedStr) {
  const { rev0, exp0, cash0, g, eg, sd, milestone, A } = P;
  if (![rev0, exp0, cash0, g, sd].every(x => x != null && isFinite(x)) || rev0 <= 0 || exp0 <= 0) return null;
  const N = A.paths, H = A.horizon, decay = 1 - A.decay / 100, buf = A.buffer;
  const rand = mulberry32(seedFrom(seedStr));
  const egSd = Math.max(0.5, Math.abs(eg || 0) * 0.35);
  const revQ = Array.from({ length:H + 1 }, () => new Float64Array(N));
  const cashQ = Array.from({ length:H + 1 }, () => new Float64Array(N));
  const deathT = new Int16Array(N).fill(-1), msT = new Int16Array(N).fill(-1), fundable = new Uint8Array(N);
  const profT = new Int16Array(N).fill(-1);
  const need = new Float64Array(N).fill(NaN);
  const msM = milestone ? milestone / 12 : null;

  const atBar = !!(msM && rev0 >= msM);
  for (let n = 0; n < N; n++) {
    let R = rev0, E = exp0, C = cash0, gt = g, minC = cash0;
    revQ[0][n] = R; cashQ[0][n] = C;
    if (atBar) { msT[n] = 0; need[n] = 0; if (C >= buf * Math.max(0, E - R)) fundable[n] = 1; }
    for (let t = 1; t <= H; t++) {
      gt *= decay;
      const gr = Math.max(-35, gt + sd * gauss(rand));
      R = R * (1 + gr / 100);
      E = E * (1 + ((eg || 0) + egSd * gauss(rand)) / 100);
      C -= (E - R);
      revQ[t][n] = R; cashQ[t][n] = C;
      if (C < minC) minC = C;
      /* Cash-out is the first month cash goes below zero, whatever happens to revenue (no new money).
         Reaching the bar first is reported separately: it is when a raise becomes possible, not a guarantee. */
      if (C < 0 && deathT[n] < 0) deathT[n] = t;
      if (profT[n] < 0 && R >= E && deathT[n] < 0) profT[n] = t;
      if (msM && msT[n] < 0 && R >= msM) {
        msT[n] = t;
        /* Capital needed to get here with a buffer of runway left to raise on. */
        need[n] = Math.max(0, -minC + buf * Math.max(0, E - R));
        if (deathT[n] < 0 && C >= buf * Math.max(0, E - R)) fundable[n] = 1;
      }
    }
  }
  /* Quantiles from sorted typed arrays (numeric sort, no comparator): fast enough for 20,000 paths. */
  const sorted = arrs => arrs.map(a => Float64Array.from(a).sort());
  const revS = sorted(revQ), cashS = sorted(cashQ);
  const qa = (a, q) => a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))];
  const fan = t => ({ t, r10:qa(revS[t], 0.1) * 12, r50:qa(revS[t], 0.5) * 12, r90:qa(revS[t], 0.9) * 12,
                     c10:qa(cashS[t], 0.1), c50:qa(cashS[t], 0.5), c90:qa(cashS[t], 0.9) });
  const reached = [];
  let deathsBeforeBar = 0, deathsAll = 0;
  for (let n = 0; n < N; n++) {
    if (msT[n] >= 0 && (deathT[n] < 0 || msT[n] < deathT[n])) reached.push(msT[n]);
    if (deathT[n] >= 0) { deathsAll++; if (msT[n] < 0 || deathT[n] <= msT[n]) deathsBeforeBar++; }
  }
  const runwayDist = Array.from(deathT).map(t => t < 0 ? H + 1 : t);
  /* Capital needed, across ALL paths: a path that never reaches the bar within the horizon needs "more than any amount". */
  const needs = Array.from(need).filter(x => !isNaN(x)).sort((a, b) => a - b);
  const needQ = q => { const k = Math.ceil(q * N); return needs.length >= k ? needs[k - 1] : null; };
  const cnt = arr => Array.from(arr).filter(Boolean).length;
  return {
    N, H, milestone, seed:seedStr,
    pMilestone: reached.length / N,
    pFundable: cnt(fundable) / N,
    pDeath: deathsBeforeBar / N,       /* cash-out before reaching the bar */
    pCashOut: deathsAll / N,           /* cash-out within the horizon on current cash, bar or not */
    atBar,
    pProfitable: Array.from(profT).filter(t => t >= 0).length / N,
    tMilestone50: reached.length ? quantile(reached, 0.5) : null,
    runway: { p10:quantile(runwayDist, 0.1), p50:quantile(runwayDist, 0.5), p90:quantile(runwayDist, 0.9) },
    need50: needQ(0.5),
    need80: needQ(0.8),
    needShare: needs.length / N,
    fan: Array.from({ length:H + 1 }, (_, t) => fan(t)),
    hist: histogram(runwayDist, H),
  };
}
function histogram(vals, H) {
  const bins = [];
  const step = H <= 24 ? 3 : 6;
  for (let a = 0; a < H; a += step) bins.push({ lo:a + 1, hi:Math.min(a + step, H), n:0 });
  bins.push({ lo:H + 1, hi:null, n:0, survived:true });
  vals.forEach(v => {
    if (v > H) { bins[bins.length - 1].n++; return; }
    const b = bins.find(x => !x.survived && v >= x.lo && v <= x.hi); if (b) b.n++;
  });
  return bins;
}

/* Run the projection block used by the report and the Runway tab. */
function runProjections(D, hash) {
  const P = projectionInputs(D);
  const da = defaultAlive({ rev0:P.rev0, exp0:P.exp0, cash0:P.cash0, g:P.g, eg:P.eg });
  const r = simulateCached(P, (hash || '') + '|' + JSON.stringify(P.A));
  return { P, da, sim:r.sim, simPending:r.pending, simKey:r.key };
}
