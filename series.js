
/* ═══════════════════════════════════════════════════════════════
   MONTHLY FINANCIALS — trajectory, burn trend, default-alive
   ═══════════════════════════════════════════════════════════════ */
const SERIES_COLS = {
  revenue:   /^(revenue|mrr|arr|sales|net revenue|total revenue|recurring revenue|subscription revenue)$/i,
  cash:      /^(cash|cash balance|ending cash|bank|cash on hand|closing cash)$/i,
  burn:      /^(burn|net burn|net cash burn|cash burn|burn rate|net cash flow|cash flow)$/i,
  expenses:  /^(expenses|opex|total expenses|operating expenses|costs|total costs|spend|gross burn)$/i,
  headcount: /^(headcount|fte|ftes|employees|team size|staff)$/i,
};

function parseSeries(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { ok:false, error:'Needs a header row and at least three months.' };
  const head = rows[0].map(h => h.replace(/\(.*?\)|\$|usd/gi, '').trim());
  const warnings = [];
  const monthsAcross = head.slice(1).filter(h => parseMonth(h)).length >= 3;
  let recs = []; /* [{month, key:value}] */
  const colKey = h => Object.keys(SERIES_COLS).find(k => SERIES_COLS[k].test(h.trim()));

  if (monthsAcross) {
    /* Transposed P&L: metrics down the side, months across the top. */
    const monthIdx = head.map((h, i) => ({ i, m:parseMonth(h) })).filter(x => x.m);
    const byMonth = new Map(monthIdx.map(x => [x.m, { month:x.m }]));
    rows.slice(1).forEach(r => {
      const k = colKey(r[0] || ''); if (!k) return;
      monthIdx.forEach(x => { const v = parseNum(r[x.i]); if (v != null) byMonth.get(x.m)[k] = v; });
    });
    recs = Array.from(byMonth.values());
  } else {
    let mi = head.findIndex(h => /^(month|date|period)$/i.test(h));
    if (mi < 0) mi = head.findIndex((_, i) => rows.slice(1, 8).filter(r => parseMonth(r[i])).length >= Math.min(3, rows.length - 1));
    if (mi < 0) return { ok:false, error:'Could not find a month column.' };
    const keys = head.map(colKey);
    if (!keys.some(Boolean)) return { ok:false, error:'No recognised columns. Use headers such as month, revenue, cash, burn, expenses, headcount.' };
    rows.slice(1).forEach(r => {
      const m = parseMonth(r[mi]); if (!m) return;
      const o = { month:m };
      keys.forEach((k, i) => { if (k) { const v = parseNum(r[i]); if (v != null) o[k] = v; } });
      recs.push(o);
    });
  }
  recs = recs.filter(r => Object.keys(r).length > 1).sort((a, b) => a.month < b.month ? -1 : 1);
  if (recs.length < 3) return { ok:false, error:'At least three months with data are needed.' };
  const first = recs[0].month, last = recs[recs.length - 1].month;
  const T = monthDiff(first, last) + 1;
  const months = Array.from({ length:T }, (_, k) => monthAdd(first, k));
  const col = k => months.map(m => { const r = recs.find(x => x.month === m); return r && r[k] != null ? r[k] : null; });
  const out = { months, revenue:col('revenue'), cash:col('cash'), burn:col('burn'), expenses:col('expenses'), headcount:col('headcount') };
  if (/\barr\b/i.test(rows[0].join(' '))) { out.revenue = out.revenue.map(v => v == null ? null : v / 12); warnings.push('Revenue column looked like ARR and was divided by 12.'); }
  /* Burn is always stored as a positive number meaning cash going out. */
  if (out.burn.some(v => v != null && v < 0) && !out.burn.some(v => v != null && v > 0)) out.burn = out.burn.map(v => v == null ? null : -v);
  if (out.burn.every(v => v == null) && out.expenses.some(v => v != null) && out.revenue.some(v => v != null))
    out.burn = months.map((_, t) => out.expenses[t] != null && out.revenue[t] != null ? out.expenses[t] - out.revenue[t] : null);
  if (out.burn.every(v => v == null) && out.cash.filter(v => v != null).length >= 3) {
    out.burn = months.map((_, t) => t && out.cash[t] != null && out.cash[t - 1] != null ? out.cash[t - 1] - out.cash[t] : null);
    warnings.push('Burn was inferred from month-on-month change in cash, so fundraises and debt draws will distort it.');
  }
  out.id = seedFrom(JSON.stringify(out)).toString(16);
  return { ok:true, series:out, warnings };
}

function seriesToCSV(s) {
  const head = 'month,revenue,cash,burn,expenses,headcount';
  return [head, ...s.months.map((m, t) => [m, s.revenue[t], s.cash[t], s.burn[t], s.expenses[t], s.headcount[t]].map(v => v == null ? '' : v).join(','))].join('\n');
}

/* Combine the monthly file, the ledger and the form into one trajectory view. */
function trajectory(D) {
  const LED = ledgerAnalytics(S.ledger), SR = S.series;
  let rev = null, months = null, src = null;
  if (SR && SR.revenue.filter(v => v != null).length >= 3) { rev = SR.revenue; months = SR.months; src = 'monthly financials'; }
  else if (LED) { rev = LED.mrr; months = LED.months; src = 'customer ledger'; }
  const tr = { src, months, rev };
  const lastIdx = a => { if (!a) return -1; for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return i; return -1; };
  if (rev) {
    const e = lastIdx(rev);
    const cm = k => (e - k >= 0 && rev[e - k] > 0 && rev[e] > 0) ? (Math.pow(rev[e] / rev[e - k], 1 / k) - 1) * 100 : null;
    tr.cmgr3 = cm(3); tr.cmgr6 = cm(6); tr.cmgr12 = cm(12);
    tr.prior3 = (e - 6 >= 0 && rev[e - 6] > 0 && rev[e - 3] > 0) ? (Math.pow(rev[e - 3] / rev[e - 6], 1 / 3) - 1) * 100 : null;
    tr.accel = tr.cmgr3 != null && tr.prior3 != null ? tr.cmgr3 - tr.prior3 : null;
    const mom = rev.map((v, t) => t && rev[t - 1] > 0 && v != null ? (v / rev[t - 1] - 1) * 100 : null).slice(-12).filter(x => x != null);
    tr.momSd = stdev(mom); tr.momMean = mean(mom);
    tr.revNow = rev[e];
  }
  if (SR) {
    const b = SR.burn, eb = lastIdx(b);
    if (eb >= 5) {
      const l3 = mean(b.slice(eb - 2, eb + 1).filter(v => v != null)), p3 = mean(b.slice(eb - 5, eb - 2).filter(v => v != null));
      tr.burnL3 = l3; tr.burnP3 = p3; tr.burnTrend = p3 > 0 ? (l3 / p3 - 1) * 100 : null;
    }
    const ex = SR.expenses.some(v => v != null) ? SR.expenses
      : (SR.revenue.some(v => v != null) ? SR.months.map((_, t) => SR.burn[t] != null && SR.revenue[t] != null ? SR.burn[t] + SR.revenue[t] : null) : null);
    if (ex) {
      const ee = lastIdx(ex);
      if (ee >= 6 && ex[ee - 6] > 0 && ex[ee] > 0) tr.expGrowth = (Math.pow(ex[ee] / ex[ee - 6], 1 / 6) - 1) * 100;
      tr.expNow = ex[ee];
    }
    const ec = lastIdx(SR.cash); if (ec >= 0) tr.cashNow = SR.cash[ec];
    const eh = lastIdx(SR.headcount);
    if (eh >= 6 && SR.headcount[eh - 6] > 0) tr.hcGrowth = (Math.pow(SR.headcount[eh] / SR.headcount[eh - 6], 1 / 6) - 1) * 100;
  }
  return tr;
}

/* Paul Graham's default-alive test: at current growth and spend, does
   revenue overtake expenses before the cash runs out? Deterministic. */
function defaultAlive(p) {
  const { rev0, exp0, cash0, g, eg } = p;
  if (![rev0, exp0, cash0, g, eg].every(x => x != null && isFinite(x)) || cash0 <= 0) return null;
  let R = rev0, E = exp0, C = cash0, low = cash0;
  const path = [];
  for (let t = 1; t <= 120; t++) {
    R *= 1 + g / 100; E *= 1 + eg / 100; C -= (E - R);
    path.push({ t, R, E, C });
    if (C < low) low = C;
    if (R >= E) return { alive:true, months:t, low, path, needed:0 };
    if (C < 0) {
      /* How much more cash would make it alive at the same growth? */
      let R2 = rev0, E2 = exp0, cum = 0, worst = 0;
      for (let k = 1; k <= 120; k++) { R2 *= 1 + g / 100; E2 *= 1 + eg / 100; cum += (E2 - R2); if (cum > worst) worst = cum; if (R2 >= E2) return { alive:false, months:null, deadAt:t, low, path, needed:Math.max(0, worst - cash0), profitableAt:k }; }
      return { alive:false, months:null, deadAt:t, low, path, needed:null };
    }
  }
  return { alive:false, months:null, deadAt:null, low, path, needed:null, never:true };
}

/* Assumptions the user can override on the Runway tab. */
const ASSUME_DEFAULTS = { decay:3, horizon:36, paths:4000, buffer:6, milestone:null, gOverride:null, egOverride:null, sdOverride:null };
function assumptions() {
  const a = Object.assign({}, ASSUME_DEFAULTS, S.assume || {});
  a.paths = clamp(Math.round(+a.paths) || 4000, 500, 20000); a.horizon = clamp(Math.round(+a.horizon) || 36, 12, 60);
  return a;
}
const NEXT_STAGE_ARR = { preseed:250000, seed:2000000, a:10000000, b:null };

/* Build the starting point for projections from whatever evidence exists. */
function projectionInputs(D) {
  const tr = trajectory(D), A = assumptions();
  const arr = gv('arr_now');
  const rev0 = tr.revNow != null ? tr.revNow : (arr != null ? arr / 12 : null);
  const burn = gv('net_burn') != null ? gv('net_burn') : tr.burnL3;
  const exp0 = rev0 != null && burn != null ? burn + rev0 : tr.expNow;
  const cash0 = gv('cash_on_hand') != null ? gv('cash_on_hand') : tr.cashNow;
  let g = tr.cmgr6 != null ? tr.cmgr6 : tr.cmgr3 != null ? tr.cmgr3 : (D.growth_yoy != null ? (Math.pow(1 + D.growth_yoy / 100, 1 / 12) - 1) * 100 : null);
  let gSrc = tr.cmgr6 != null ? `6-month CMGR from the ${tr.src}` : tr.cmgr3 != null ? `3-month CMGR from the ${tr.src}` : 'YoY ARR growth converted to a monthly rate';
  if (A.gOverride != null) { g = A.gOverride; gSrc = 'your override'; }
  let eg = tr.expGrowth != null ? tr.expGrowth : (D.headcount_growth != null ? (Math.pow(1 + D.headcount_growth / 100, 1 / 12) - 1) * 100 : 0);
  let egSrc = tr.expGrowth != null ? '6-month expense growth from monthly financials' : D.headcount_growth != null ? 'headcount growth used as a proxy for spend growth' : 'assumed flat spend (no expense history)';
  if (A.egOverride != null) { eg = A.egOverride; egSrc = 'your override'; }
  let sd = tr.momSd != null ? tr.momSd : (g != null ? Math.max(2, Math.abs(g) * 0.5) : null);
  let sdSrc = tr.momSd != null ? 'observed month-on-month volatility' : 'assumed at half the growth rate (no monthly history)';
  if (A.sdOverride != null) { sd = A.sdOverride; sdSrc = 'your override'; }
  const milestone = A.milestone != null ? A.milestone : (NEXT_STAGE_ARR[S.stage] || (arr ? arr * 2 : null));
  return { tr, rev0, exp0, cash0, g, eg, sd, gSrc, egSrc, sdSrc, milestone, A };
}
