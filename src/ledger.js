
/* ═══════════════════════════════════════════════════════════════
   CUSTOMER REVENUE LEDGER
   The single most valuable file in a data room: revenue by customer by
   month. From it VCR2 rebuilds the MRR bridge, true cohort retention,
   concentration, and runs forensic tests — the work an associate would
   otherwise spend two days doing in a spreadsheet.
   ═══════════════════════════════════════════════════════════════ */

const LEDGER_NAME_RX = /^(customer|client|account|company|name|logo|customer name|account name|org|organisation|organization)$/i;
const LEDGER_NAME_LOOSE = /(customer|client|account|company|name|logo|org)/i;
const LEDGER_MONTH_RX = /(month|date|period|invoice|billing)/i;
const LEDGER_AMT_RX = /(mrr|arr|revenue|amount|value|billing|billed|sales|usd|eur|total)/i;

/* Accepts wide (customer, Jan 24, Feb 24, …) or long (customer, month, amount) layouts. */
function parseLedger(text, unitHint) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { ok:false, error:'The file needs a header row and at least one customer row.' };
  const head = rows[0];
  const loc = numberLocale(rows);
  const hdrOrder = detectDateOrder(head);
  const monthCols = head.map((h, i) => ({ i, m: parseMonth(h, hdrOrder.order) })).filter(x => x.m);
  const warnings = [];
  if (loc === 'eu') warnings.push('Numbers were read in European format (a dot groups thousands, a comma is the decimal mark)' + (rows.localeWhy ? ' because every figure with a dot is written like 1.200 or 15.000. If they are decimals, export with a comma-free format.' : '.'));
  if (hdrOrder.mixed) warnings.push('The column dates mix day-first and month-first forms; each was read on its own and may be wrong. Use YYYY-MM headers.');
  if (hdrOrder.inferred) warnings.push(`The column dates could be day-first or month-first; they were read ${hdrOrder.order === 'dmy' ? 'day-first' : 'month-first'}. Use YYYY-MM headers to be explicit.`);
  const TOTAL_ROW = /^(total|sum|grand total|totals|subtotal|total mrr|total arr|total revenue|all customers)$/i;
  /* Other wordings ("Total général", "TOTAL USD", "Somme", "Σ") are dropped only when the row is the column sum of the others. */
  const TOTAL_LIKE = /^(total|totaux|sum|somme|gesamt|subtotal|sous-total|grand total|all customers|ensemble|tous|[Σ∑])(\b|\s|$)/i;
  const totalRows = new Set();
  const QUARTER = /q\s*[1-4]/i;
  let unit = unitHint || 'mrr';
  const map = new Map(); /* customer -> Map(month -> value) */
  let monthsSet = new Set();

  if (monthCols.length >= 3) {
    /* WIDE */
    let nameIdx = head.findIndex(h => LEDGER_NAME_RX.test(h));
    if (nameIdx < 0) nameIdx = head.findIndex((h, i) => !monthCols.some(c => c.i === i));
    if (nameIdx < 0) return { ok:false, error:'Could not find a customer name column.' };
    if (!unitHint && /\barr\b/i.test(head.join(' '))) unit = 'arr';
    /* Quarterly columns are not single months: spread each quarter over its three months. */
    const quarterly = monthCols.length >= 2 && monthCols.every(c => QUARTER.test(head[c.i]));
    const headMrr = /\bmrr\b/i.test(head.join(' '));
    const skipped = head.filter((h, i) => i !== nameIdx && !monthCols.some(c => c.i === i) && /\d/.test(h) && h.length <= 20);
    if (skipped.length) warnings.push(`${skipped.length} column${skipped.length === 1 ? '' : 's'} looked like a month but could not be read and ${skipped.length === 1 ? 'was' : 'were'} ignored: ${skipped.slice(0, 4).join(', ')}${skipped.length > 4 ? '…' : ''}.`);
    if (quarterly) warnings.push('The columns are quarters, not months. Each quarter’s amount was spread evenly over its three months' + (headMrr || unit === 'arr' ? '.' : ' (divided by 3, as revenue billed in the quarter). If the figures are monthly recurring revenue at quarter end, put MRR in the column headers.'));
    {
      const body = rows.slice(1).map(r => ({ name:(r[nameIdx] || '').trim(), vals:monthCols.map(c => parseNum(r[c.i], loc)) })).filter(x => x.name && !TOTAL_ROW.test(x.name));
      body.filter(x => TOTAL_LIKE.test(x.name)).forEach(t => {
        const others = body.filter(x => x !== t && !TOTAL_LIKE.test(x.name));
        let cmp = 0, same = 0;
        monthCols.forEach((_, j) => {
          if (t.vals[j] == null) return;
          const sum = others.reduce((a, x) => a + (x.vals[j] || 0), 0);
          if (sum <= 0 && t.vals[j] <= 0) return;
          cmp++; if (Math.abs(sum - t.vals[j]) <= 0.01 * Math.max(sum, t.vals[j])) same++;
        });
        if (cmp >= 3 && same / cmp >= 0.7) { totalRows.add(t.name); warnings.push(`The row “${t.name}” equals the sum of the other rows and was left out (it is a total, not a customer).`); }
      });
    }
    let badCells = 0, dupRows = 0; const badEx = [];
    const colCount = new Map(); monthCols.forEach(c => colCount.set(c.m, (colCount.get(c.m) || 0) + 1));
    const dupCols = Array.from(colCount).filter(([, n]) => n > 1).map(([m]) => m);
    if (dupCols.length) warnings.push(`${dupCols.length} month${dupCols.length === 1 ? ' appears' : 's appear'} in more than one column (${dupCols.slice(0, 3).join(', ')}); the amounts were added together.`);
    rows.slice(1).forEach((r, ri) => {
      const name = (r[nameIdx] || '').trim();
      if (!name || TOTAL_ROW.test(name) || totalRows.has(name)) return;
      if (map.has(name)) dupRows++;
      const rec = map.get(name) || new Map();
      monthCols.forEach(c => {
        const v = parseNum(r[c.i], loc);
        if (v == null) {
          const raw = String(r[c.i] == null ? '' : r[c.i]).trim();
          if (raw && !/^(-|—|–|n\/?a|nil|null)$/i.test(raw)) { badCells++; if (badEx.length < 3) badEx.push(raw.slice(0, 20)); }
          return;
        }
        if (quarterly) { const share = (headMrr || unit === 'arr') ? v : v / 3; for (let k = 0; k < 3; k++) { const mk = monthAdd(c.m, -k); rec.set(mk, (rec.get(mk) || 0) + share); monthsSet.add(mk); } }
        else { rec.set(c.m, (rec.get(c.m) || 0) + v); monthsSet.add(c.m); }
      });
      map.set(name, rec);
    });
    if (badCells) warnings.push(`${badCells} amount${badCells === 1 ? '' : 's'} could not be read as a number and ${badCells === 1 ? 'was' : 'were'} left out (for example ${badEx.map(x => '“' + x + '”').join(', ')}). Check the number format.`);
    if (dupRows) warnings.push(`${dupRows} customer name${dupRows === 1 ? ' appears' : 's appear'} on more than one row; the rows were added together.`);
  } else {
    /* LONG */
    const lower = head.map(h => h.toLowerCase());
    let nameIdx = lower.findIndex(h => LEDGER_NAME_RX.test(h));
    if (nameIdx < 0) nameIdx = lower.findIndex(h => LEDGER_NAME_LOOSE.test(h));
    let monIdx = lower.findIndex(h => LEDGER_MONTH_RX.test(h));
    /* A column called "Invoice number" matches the month pattern: it counts only if most of its cells really are dates. */
    if (monIdx >= 0) { const sample = rows.slice(1, 40); if (sample.filter(r => parseMonth(r[monIdx])).length < Math.max(1, Math.floor(sample.length / 2))) monIdx = -1; }
    const amtCands = []; lower.forEach((h, i) => { if (i !== nameIdx && i !== monIdx && LEDGER_AMT_RX.test(h)) amtCands.push(i); });
    /* With a net and a gross column, the net one is the revenue. */
    const netRx = /(net|excl|ex\.? ?vat|ex\.? ?tax|\bht\b|hors)/i, grossRx = /(gross|incl|ttc|tax|vat)/i;
    let amtIdx = amtCands.find(i => netRx.test(lower[i]) && !grossRx.test(lower[i]));
    if (amtIdx == null) amtIdx = amtCands.length ? amtCands[0] : -1;
    if (amtCands.length > 1) warnings.push(`More than one amount column was found; “${head[amtIdx]}” was used. Name the revenue column mrr or arr to choose another.`);
    if (monIdx < 0) {
      /* Guess from the data: the column whose cells parse as months. */
      monIdx = head.findIndex((_, i) => rows.slice(1, 12).filter(r => parseMonth(r[i])).length >= Math.min(5, rows.length - 1));
    }
    if (amtIdx < 0) amtIdx = head.findIndex((_, i) => i !== nameIdx && i !== monIdx && rows.slice(1, 12).every(r => parseNum(r[i]) != null));
    if (nameIdx < 0 || monIdx < 0 || amtIdx < 0)
      return { ok:false, error:'Could not identify the customer, month and amount columns. Use headers such as customer, month, mrr, or a wide layout with one column per month.' };
    if (!unitHint && /\barr\b/i.test(head[amtIdx])) unit = 'arr';
    const dataRows = rows.slice(1);
    const colOrder = detectDateOrder(dataRows.map(r => r[monIdx]));
    if (colOrder.inferred) warnings.push(`The dates could be day-first or month-first; they were read ${colOrder.order === 'dmy' ? 'day-first' : 'month-first'}. Use YYYY-MM to be explicit.`);
    if (colOrder.mixed) warnings.push('The date column mixes day-first and month-first dates; each date was read on its own and may be wrong. Use YYYY-MM.');
    const quarterlyLong = dataRows.length > 0 && dataRows.filter(r => r[monIdx]).every(r => QUARTER.test(r[monIdx]));
    if (quarterlyLong) warnings.push('The period column holds quarters. Each quarter’s amount was spread evenly over its three months (divided by 3).');
    let bad = 0, dup = 0;
    dataRows.forEach(r => {
      const name = (r[nameIdx] || '').trim(), m = parseMonth(r[monIdx], colOrder.order), v = parseNum(r[amtIdx], loc);
      if (TOTAL_ROW.test(name)) return;
      if (!name || !m || v == null) { bad++; return; }
      const rec = map.get(name) || new Map();
      if (quarterlyLong) { const share = unit === 'arr' ? v : v / 3; for (let k = 0; k < 3; k++) { const mk = monthAdd(m, -k); rec.set(mk, (rec.get(mk) || 0) + share); monthsSet.add(mk); } }
      else { if (rec.has(m)) dup++; rec.set(m, (rec.get(m) || 0) + v); monthsSet.add(m); }
      map.set(name, rec);
    });
    if (bad) warnings.push(`${bad} row${bad === 1 ? '' : 's'} skipped because the customer, month or amount could not be read.`);
    if (dup) warnings.push(`${dup} row${dup === 1 ? '' : 's'} repeated a customer and month; the amounts were added together.`);
  }

  const monthsSorted = Array.from(monthsSet).sort();
  if (!monthsSorted.length) return { ok:false, error:'At least three months of data are needed.' };
  const first = monthsSorted[0], last = monthsSorted[monthsSorted.length - 1];
  const T = monthDiff(first, last) + 1;
  /* The period the file covers must be three months or more. Invoices on two annual dates (every customer renews on 1 January) cover thirteen. */
  if (T < 3) return { ok:false, error:'At least three months of data are needed.' };
  if (T > 120) return { ok:false, error:'More than ten years of months detected. Check the month column.' };
  const months = Array.from({ length:T }, (_, k) => monthAdd(first, k));
  const gapMonths = T - monthsSorted.length;
  /* A list of invoices is not MRR: most customers billed once a year, twelve months apart. Spread each invoice over the
     twelve months it covers so the bridge, retention and spike tests see recurring revenue, not billing events. */
  let invoiceMode = false, gap = 12;
  if (unit !== 'arr' && map.size >= 3) {
    /* Customers billed once every 12, 6 or 3 months, at exactly that spacing. Annual billing may show a customer once in a year of file;
       for the shorter periods a customer must show at least two invoices, or a lost customer would look like a periodic one. */
    for (const g of [12, 6, 3]) {
      if (T < (g === 12 ? 13 : g * 3 + 1)) continue;
      const lim = Math.ceil(T / g) + 1;
      let periodic = 0, tot = 0;
      map.forEach(rec => {
        const idx = months.map((m, k) => (rec.get(m) || 0) !== 0 ? k : -1).filter(k => k >= 0);
        if (!idx.length) return;
        tot++;
        if ((g === 12 || idx.length >= 2) && idx.length <= lim && idx.every((k, j) => j === 0 || k - idx[j - 1] === g)) periodic++;
      });
      if (tot >= 3 && periodic / tot >= 0.7) { invoiceMode = true; gap = g; break; }
    }
  }
  if (!invoiceMode && gapMonths > 0) warnings.push(`${gapMonths} month${gapMonths === 1 ? '' : 's'} had no rows at all and were treated as zero revenue.`);
  if (monthsSorted.length < 3 && !invoiceMode) return { ok:false, error:'At least three months of data are needed.' };
  if (invoiceMode) {
    map.forEach((rec, name) => {
      const nr = new Map();
      rec.forEach((v, m) => { if (!v) return; for (let j = 0; j < gap; j++) { const mj = monthAdd(m, j); if (monthDiff(first, mj) <= T - 1) nr.set(mj, (nr.get(mj) || 0) + v / gap); } });
      map.set(name, nr);
    });
    const per = { 12:'once a year', 6:'every six months', 3:'every quarter' }[gap];
    warnings.push(`This looks like a list of invoices: most customers are billed ${per}. Each invoice was spread evenly over the ${gap} months it covers, so the figures are billed amount ÷ ${gap}.`
      + (T < 2 * gap ? ' With so few periods of invoices, revenue in the first months is understated (invoices issued before the file starts are missing), which flatters retention.' : ''));
  }
  const div = unit === 'arr' ? 12 : 1;
  const customers = [];
  map.forEach((rec, name) => {
    const mrr = months.map(m => { const v = rec.get(m); return v == null ? 0 : Math.round(v / div * 100) / 100; });
    if (mrr.some(v => v !== 0)) customers.push({ name, mrr });
  });
  if (customers.length < 3) return { ok:false, error:'At least three customers with revenue are needed.' };
  const L = { months, customers, unit, rows: rows.length - 1 };
  /* Under 24 months of invoices, the first twelve months of revenue are missing (invoices issued before the file starts),
     so nothing that compares today with a year ago can be computed from it. */
  if (invoiceMode) { L.invoiceMode = true; if (T < 24 || (gap < 12 && T < 12 + gap)) L.openingKnown = false; }
  L.id = seedFrom(months.join() + '|' + customers.map(c => c.name + ':' + c.mrr.join(',')).join(';')).toString(16);
  return { ok:true, ledger:L, warnings };
}

/* Serialise back to a wide CSV (used for drafts and the JSON export). */
function ledgerToCSV(L) {
  const head = ['customer', ...L.months].join(',');
  const body = L.customers.map(c => ['"' + c.name.replace(/"/g, '""') + '"', ...c.mrr].join(','));
  return [head, ...body].join('\n');
}

const _ledgerCache = new Map();
function ledgerAnalytics(L) {
  if (!L) return null;
  if (_ledgerCache.has(L.id)) return _ledgerCache.get(L.id);
  const out = computeLedger(L);
  _ledgerCache.set(L.id, out);
  return out;
}

function computeLedger(L) {
  const M = L.months, T = M.length, C = L.customers, e = T - 1;
  const mrr = M.map((_, t) => sum(C.map(c => Math.max(0, c.mrr[t]))));
  const active = M.map((_, t) => C.filter(c => c.mrr[t] > 0).length);

  /* Per-customer lifecycle */
  const life = C.map(c => {
    const on = c.mrr.map(v => v > 0);
    const start = on.indexOf(true), end = on.lastIndexOf(true);
    return { start, end, months: on.filter(Boolean).length };
  });

  /* Monthly MRR bridge. Classification per customer per month. */
  const bridge = [];
  for (let t = 1; t < T; t++) {
    const b = { month:M[t], nw:0, react:0, exp:0, con:0, churn:0, nNew:0, nReact:0, nChurn:0 };
    C.forEach((c, i) => {
      const p = Math.max(0, c.mrr[t - 1]), v = Math.max(0, c.mrr[t]);
      if (p === 0 && v > 0) {
        if (life[i].start === t) { b.nw += v; b.nNew++; } else { b.react += v; b.nReact++; }
      } else if (p > 0 && v === 0) { b.churn += p; b.nChurn++; }
      else if (v > p) b.exp += v - p;
      else if (v < p) b.con += p - v;
    });
    b.net = b.nw + b.react + b.exp - b.con - b.churn;
    bridge.push(b);
  }

  /* Trailing window (12 months when available). */
  const w = Math.min(12, e), base = e - w;
  const win = bridge.slice(base, e); /* bridge[k] describes month k+1 */
  const flows = {
    nw: sum(win.map(b => b.nw)), react: sum(win.map(b => b.react)), exp: sum(win.map(b => b.exp)),
    con: sum(win.map(b => b.con)), churn: sum(win.map(b => b.churn)),
  };

  /* Cohort-true retention against the base month. */
  const baseSet = C.map((c, i) => i).filter(i => C[i].mrr[base] > 0);
  const baseMrr = sum(baseSet.map(i => C[i].mrr[base]));
  const endMrrOfBase = sum(baseSet.map(i => Math.max(0, C[i].mrr[e])));
  const grrNum = sum(baseSet.map(i => Math.min(Math.max(0, C[i].mrr[e]), C[i].mrr[base])));
  const retainedLogos = baseSet.filter(i => C[i].mrr[e] > 0).length;
  const nrrCohort = baseMrr > 0 ? endMrrOfBase / baseMrr * 100 : null;
  const grrCohort = baseMrr > 0 ? grrNum / baseMrr * 100 : null;
  const logoRet = baseSet.length ? retainedLogos / baseSet.length * 100 : null;
  const nrrFlow = mrr[base] > 0 ? (mrr[base] + flows.exp - flows.con - flows.churn) / mrr[base] * 100 : null;
  /* Expansion that came from customers acquired inside the window — the usual source of an inflated NRR. */
  let expFromBase = 0;
  for (let t = base + 1; t <= e; t++) baseSet.forEach(i => {
    const p = Math.max(0, C[i].mrr[t - 1]), v = Math.max(0, C[i].mrr[t]);
    if (p > 0 && v > p) expFromBase += v - p;
  });

  /* Concentration today */
  const cur = C.map((c, i) => ({ name:c.name, v:Math.max(0, c.mrr[e]), i })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const tot = sum(cur.map(x => x.v));
  const topShare = k => tot > 0 ? sum(cur.slice(0, k).map(x => x.v)) / tot * 100 : null;
  const hhi = tot > 0 ? sum(cur.map(x => (x.v / tot * 100) ** 2)) : null;
  let cum = 0;
  const pareto = cur.map((x, k) => { cum += x.v; return { rank:k + 1, name:x.name, v:x.v, share:x.v / tot * 100, cum:cum / tot * 100 }; });

  /* Cohorts by first revenue month; customers already live in month 0 have an unknown start. */
  const quarterly = T > 18;
  const cohortKey = t => quarterly ? `${M[t].slice(0, 4)} Q${Math.floor((+M[t].slice(5, 7) - 1) / 3) + 1}` : M[t];
  const groups = new Map();
  C.forEach((c, i) => {
    const s = life[i].start;
    if (s <= 0) return;
    const k = cohortKey(s);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  });
  const maxAge = Math.min(e, 24);
  const step = quarterly ? 3 : 1;
  const ages = []; for (let a = 0; a <= maxAge; a += step) ages.push(a);
  const cohorts = Array.from(groups.entries()).map(([key, idx]) => {
    const startMrr = sum(idx.map(i => C[i].mrr[life[i].start]));
    const cells = ages.map(a => {
      const mem = idx.filter(i => life[i].start + a <= e);
      if (!mem.length) return null;
      const s0 = sum(mem.map(i => C[i].mrr[life[i].start]));
      const sa = sum(mem.map(i => Math.max(0, C[i].mrr[life[i].start + a])));
      const la = mem.filter(i => C[i].mrr[life[i].start + a] > 0).length;
      return { dollar: s0 > 0 ? sa / s0 * 100 : null, logo: la / mem.length * 100, n: mem.length, partial: mem.length < idx.length };
    });
    return { key, n:idx.length, startMrr, cells };
  }).sort((a, b) => a.key < b.key ? -1 : 1);

  /* Weighted average curve and cohort-quality trend at a fixed age. */
  const avgCurve = ages.map((a, ai) => {
    const cs = cohorts.map(c => c.cells[ai]).filter(x => x && !x.partial && x.dollar != null);
    const wsum = sum(cs.map(x => x.n));
    return wsum ? sum(cs.map(x => x.dollar * x.n)) / wsum : null;
  });
  const probeAge = ages.includes(6) ? 6 : ages.includes(3) ? 3 : null;
  let cohortTrend = null;
  if (probeAge != null) {
    const ai = ages.indexOf(probeAge);
    /* Cohorts of fewer than five customers are noise; halves are weighted by starting MRR; the trend carries a t-statistic. */
    const pts = cohorts.map((c, k) => ({ k, v: c.cells[ai] && !c.cells[ai].partial ? c.cells[ai].dollar : null, n:c.n, s:c.startMrr }))
      .filter(p => p.v != null && p.n >= 5);
    if (pts.length >= 6) {
      const lr = linreg(pts.map(p => p.k), pts.map(p => p.v));
      const h = Math.floor(pts.length / 2);
      const wmean = arr => { const w = sum(arr.map(p => p.s)); return w > 0 ? sum(arr.map(p => p.v * p.s)) / w : mean(arr.map(p => p.v)); };
      const r2 = lr ? lr.r2 : null;
      const t = lr && r2 != null ? Math.sign(lr.slope) * Math.sqrt(Math.max(0, r2) * (pts.length - 2) / Math.max(1e-9, 1 - r2)) : null;
      cohortTrend = { age:probeAge, slope: lr ? lr.slope : null, r2, t, older:wmean(pts.slice(0, h)), newer:wmean(pts.slice(h)), n:pts.length };
    }
  }

  /* Growth */
  const cmgr = k => (e - k >= 0 && mrr[e - k] > 0 && mrr[e] > 0) ? (Math.pow(mrr[e] / mrr[e - k], 1 / k) - 1) * 100 : null;
  const mom = mrr.map((v, t) => t && mrr[t - 1] > 0 ? (v / mrr[t - 1] - 1) * 100 : null);

  const out = {
    months:M, T, e, base, window:w, mrr, active, bridge, flows, life,
    arrNow: mrr[e] * 12, arrBase: mrr[base] * 12,
    customersNow: active[e], customersBase: active[base], logosLost: baseSet.length - retainedLogos,
    nrrCohort, grrCohort, logoRet, nrrFlow, expFromBase, expFromNew: flows.exp - expFromBase,
    top1: topShare(1), top5: topShare(5), top10: topShare(10), hhi, pareto,
    cohorts, ages, avgCurve, cohortTrend, quarterly,
    cmgr3: cmgr(3), cmgr6: cmgr(6), cmgr12: cmgr(12), mom,
  };
  out.openingKnown = L.openingKnown !== false;
  if (!out.openingKnown) { out.window = 0; out.nrrCohort = out.grrCohort = out.logoRet = out.nrrFlow = null; }
  out.forensics = ledgerForensics(L, out);
  return out;
}

/* Values the ledger can supply to the evidence form. */
function ledgerPrimitives(LED) {
  if (!LED) return {};
  const P = {
    arr_now: LED.arrNow, customers_now: LED.customersNow,
    top1_pct: LED.top1, top5_pct: LED.top5, top10_pct: LED.top10,
  };
  if (LED.window === 12) Object.assign(P, {
    arr_12mo: LED.arrBase,
    new_arr_l12: (LED.flows.nw + LED.flows.react) * 12,
    expansion_arr_l12: LED.flows.exp * 12,
    churned_arr_l12: LED.flows.churn * 12,
    contraction_arr_l12: LED.flows.con * 12,
    customers_12mo: LED.customersBase,
    logos_lost_l12: LED.logosLost,
  });
  Object.keys(P).forEach(k => { if (P[k] == null || !isFinite(P[k])) delete P[k]; });
  return P;
}
const LEDGER_TOL = {
  arr_now:{ rel:2, hard:6 }, arr_12mo:{ rel:3, hard:8 },
  new_arr_l12:{ rel:6, hard:15 }, expansion_arr_l12:{ rel:8, hard:20 }, churned_arr_l12:{ rel:8, hard:20 }, contraction_arr_l12:{ rel:10, hard:25 },
  customers_now:{ abs:1, hard:3 }, customers_12mo:{ abs:1, hard:3 }, logos_lost_l12:{ abs:1, hard:3 },
  top1_pct:{ pts:1.5, hard:4 }, top5_pct:{ pts:2, hard:5 }, top10_pct:{ pts:2, hard:6 },
};

function applyLedgerToForm(keys) {
  const LED = ledgerAnalytics(S.ledger); if (!LED) return 0;
  const P = ledgerPrimitives(LED);
  let n = 0;
  (keys || Object.keys(P)).forEach(k => {
    if (P[k] == null) return;
    const v = /pct$/.test(k) ? Math.round(P[k] * 10) / 10 : Math.round(P[k]);
    S.vals[k] = String(v);
    S.prov[k] = { src:'ledger', line:`Computed from the customer ledger (${LED.months.length} months, ${S.ledger.customers.length} customers).` };
    S.evid[k] = 'export';
    n++;
  });
  saveDraft(); updateProgress();
  return n;
}

/* ═══════════════════════════════════════════════════════════════
   FORENSICS — each test states its method and its limits.
   Status: pass | info | warn | fail | na
   ═══════════════════════════════════════════════════════════════ */
const BENFORD = [1,2,3,4,5,6,7,8,9].map(d => Math.log10(1 + 1 / d));

function benfordTest(values) {
  const xs = values.filter(v => v >= 1);
  const n = xs.length;
  const res = { n, obs:Array(9).fill(0), exp:BENFORD };
  if (n < 50) return Object.assign(res, { applicable:false, why:`only ${n} distinct values: the first-digit distribution needs several hundred to carry any signal` });
  xs.forEach(v => { const d = +String(Math.floor(v)).replace(/^0+/, '')[0]; if (d >= 1 && d <= 9) res.obs[d - 1]++; });
  const p = res.obs.map(c => c / n);
  res.prop = p;
  res.mad = mean(p.map((x, i) => Math.abs(x - BENFORD[i])));
  res.chi2 = sum(p.map((x, i) => n * (x - BENFORD[i]) ** 2 / BENFORD[i]));
  const lo = quantile(xs, 0.05), hi = quantile(xs, 0.95);
  res.span = lo > 0 ? Math.log10(hi / lo) : 0;
  const freq = new Map(); xs.forEach(v => freq.set(v, (freq.get(v) || 0) + 1));
  const top3 = Array.from(freq.values()).sort((a, b) => b - a).slice(0, 3);
  res.tierShare = sum(top3) / n;
  res.applicable = n >= pp('forensic_benford', 'minN') && res.span >= pp('forensic_benford', 'span') && res.tierShare < 0.3;
  if (!res.applicable) res.why = n < 300 ? `${n} distinct values: below the ~300 where the test has power`
    : res.span < 1.3 ? `values span only ${res.span.toFixed(1)} orders of magnitude. Benford needs data that spans several`
    : `${Math.round(res.tierShare * 100)}% of values sit on three price points. Tiered pricing breaks the Benford assumption`;
  res.band = res.mad < pp('forensic_benford_bands', 'close') ? 'close conformity' : res.mad < pp('forensic_benford_bands', 'ok') ? 'acceptable conformity' : res.mad < pp('forensic_benford_bands', 'marginal') ? 'marginal conformity' : 'nonconformity';
  return res;
}

function ledgerForensics(L, A) {
  const C = L.customers, M = A.months, e = A.e, T = A.T;
  const out = [];
  const add = o => out.push(o);

  /* 1. Final-month spike (window dressing ahead of a raise). Robust to flat ledgers: the last month must stand out
     against the median AND the spread (MAD) of the six months before it, and be material (over 2 % of MRR). A second
     test looks at the last two months together, so a pull-forward split over two months is seen as well. */
  if (A.bridge.length >= 8) {
    const B = A.bridge, last = B[B.length - 1], prevMrr = A.mrr[e - 1] || 0, floor = pp('forensic_spike', 'floor') / 100 * prevMrr, spreadFloor = 0.01 * prevMrr;
    const priorNet = B.slice(-7, -1).map(b => b.net), priorNew = B.slice(-7, -1).map(b => b.nw + b.react);
    const mad = xs => { const m = median(xs); return median(xs.map(v => Math.abs(v - m))); };
    const med = median(priorNet), medNew = median(priorNew), avgNew = mean(priorNew);
    const sNew = Math.max(1.4826 * mad(priorNew), spreadFloor, 1e-9), sNet = Math.max(1.4826 * mad(priorNet), spreadFloor, 1e-9);
    const lastNew = last.nw + last.react;
    const zNet = (last.net - med) / sNet, zNew = (lastNew - medNew) / sNew;
    const ratio = med > 0 ? last.net / med : null;
    const newRatio = avgNew > 0 ? lastNew / avgNew : null;
    const material = last.net > floor || lastNew > floor;
    const fr = pp('forensic_spike', 'ratio'), fz = pp('forensic_spike', 'z');
    const spike1 = material && ((ratio != null && ratio >= fr && last.net > 0 && zNet >= fz) || (newRatio != null && newRatio >= fr && zNew >= fz));
    /* Two-month test, on new MRR as a share of the MRR at the start of each month: a company that grows fast books more
       new MRR every month without any pull-forward, so the raw amounts of the last two months always beat the six before. The
       reference is the six months before the last two (the last two are what is being tested). */
    const rate = j => { const b = B[j], base = A.mrr[j]; return base > 0 ? (b.nw + b.react) / base : null; };
    const L1 = B.length - 1, L2 = B.length - 2;
    const rLast = rate(L1), rPrev = rate(L2);
    const ref2 = []; for (let j = B.length - 8; j <= B.length - 3; j++) { const r = rate(j); if (r != null) ref2.push(r); }
    let ratio2 = null, z2 = 0, excess2 = 0;
    if (rLast != null && rPrev != null && ref2.length >= 5) {
      const med2 = median(ref2), avg2 = mean(ref2), s2 = Math.max(1.4826 * mad(ref2), 0.01, 1e-9), sum2 = rLast + rPrev;
      ratio2 = avg2 > 0 ? sum2 / (2 * avg2) : null;
      z2 = (sum2 - 2 * med2) / (s2 * Math.SQRT2);
      excess2 = (sum2 - 2 * med2) * prevMrr;
    }
    const spike2 = !spike1 && excess2 > floor && z2 >= pp('forensic_spike', 'twoZ') && ratio2 != null && ratio2 >= pp('forensic_spike', 'two');
    const spike = spike1 || spike2;
    add({ id:'final_spike', title:'Final-month bookings spike',
      status: !spike ? 'pass' : (spike1 && ((ratio || 0) >= pp('forensic_spike', 'strong') || (newRatio || 0) >= pp('forensic_spike', 'strong'))) ? 'fail' : 'warn',
      stat: spike2 ? `the last two months brought ${fmtX(ratio2)} the usual new MRR` : ratio != null ? `${fmtX(ratio)} the trailing median net new MRR` : `new MRR ${fmtX(newRatio)} trailing average`,
      detail: `Net new MRR in ${monthLabel(last.month)} was ${money(last.net)} against a six-month median of ${money(med)}. New-logo and reactivated MRR that month: ${money(lastNew)} (${last.nNew + last.nReact} logos).`,
      method:'The last month, and the last two months together, against the median and spread of the six months before; a flag also needs the jump to be over 2 % of MRR.',
      caveat:'A strong month is not wrongdoing. It matters when it lands right before a raise, is concentrated in a few contracts, or carries unusual discounts or start dates.',
      ask: spike ? `Which contracts drove ${monthLabel(last.month)}? Please share signed order forms, start dates and any discounts or free months attached to them.` : null });
  }

  /* 2. Quarter-end booking concentration. */
  const win = A.bridge.slice(-12);
  if (win.length >= 9) {
    const newBy = win.map(b => ({ m:+b.month.slice(5, 7), v:b.nw + b.react + b.exp }));
    const tot = sum(newBy.map(x => x.v));
    const qe = sum(newBy.filter(x => x.m % 3 === 0).map(x => x.v));
    const share = tot > 0 ? qe / tot * 100 : null;
    const qeMonths = newBy.filter(x => x.m % 3 === 0).length;
    const expected = qeMonths / newBy.length * 100;
    if (share != null) add({ id:'quarter_end', title:'Bookings concentrated at quarter-end',
      status: share > pp('forensic_quarter', 'warn') ? 'warn' : share > pp('forensic_quarter', 'info') ? 'info' : 'pass',
      stat:`${fmtPct(share, 0)} of gross new and expansion MRR in quarter-end months (even spread: ${fmtPct(expected, 0)})`,
      detail:'Heavy quarter-end concentration is common in sales-led companies. Past two thirds, it usually means deals are being pulled forward with concessions.',
      method:'Share of new, reactivated and expansion MRR booked in March, June, September and December over the last twelve months.',
      caveat:'Revenue ledgers record start of billing, not signature date. A billing-start convention can create or hide this pattern.',
      ask: share > pp('forensic_quarter', 'info') ? 'What share of quarter-end deals carried discounts, extended payment terms or delayed start dates?' : null });
  }

  /* 3. One-month "recurring" customers. */
  /* Customers already live in the first month of the file have an unknown start, so they cannot be one-month customers. */
  const oneOff = A.life.map((l, i) => ({ l, i })).filter(x => x.l.months === 1 && x.l.start > 0 && x.l.end < e - 1);
  const shortLived = A.life.map((l, i) => ({ l, i })).filter(x => x.l.months <= 2 && x.l.start > 0 && x.l.end < e);
  const totalNew = sum(A.bridge.map(b => b.nw));
  const oneOffMrr = sum(oneOff.map(x => C[x.i].mrr[x.l.start]));
  /* A few one-month customers are normal in any ledger (some customers leave right after signing). Flag when they are a
     material share of the new logos (over 5 %, and at least three) or of the new MRR (over 5 %, and at least two). */
  const totalNewLogos = sum(A.bridge.map(b => b.nNew));
  const oneOffLogoShare = totalNewLogos > 0 ? oneOff.length / totalNewLogos : 0;
  add({ id:'one_offs', title:'One-month customers inside recurring revenue',
    status: (oneOff.length >= pp('forensic_oneoff', 'count') && oneOffLogoShare > pp('forensic_oneoff', 'logoShare') / 100) || (oneOff.length >= 2 && totalNew > 0 && oneOffMrr / totalNew > pp('forensic_oneoff', 'mrrShare') / 100) ? 'warn' : oneOff.length ? 'info' : 'pass',
    stat: `${oneOff.length} customer${oneOff.length === 1 ? '' : 's'} billed for exactly one month; ${shortLived.length} for two months or less`,
    detail: oneOff.length ? `Examples: ${oneOff.slice(0, 4).map(x => C[x.i].name).join(', ')}. Together ${money(oneOffMrr)} of MRR in their only month.` : 'No customer appears for a single month and disappears.',
    method:'Customers with revenue in exactly one month that is not one of the last two months of the ledger; flagged above 5 % of new logos (and at least three) or 5 % of new MRR.',
    caveat:'Pilots and failed onboardings are normal. The question is whether they were counted in ARR and in new-logo numbers at the time.',
    ask: oneOff.length ? 'Were these one-month customers counted in ARR and logo counts when they were live? Are they pilots, setup fees or professional services?' : null });

  /* 4. Near-duplicate customers (double-counted logos or renamed accounts). */
  const names = C.map((c, i) => ({ i, raw:c.name, n:cleanName(c.name) })).filter(x => x.n.length >= 3);
  const pairs = [];
  if (names.length <= 1500) {
    const byExact = new Map();
    names.forEach(x => { if (!byExact.has(x.n)) byExact.set(x.n, []); byExact.get(x.n).push(x); });
    byExact.forEach(list => { if (list.length > 1) for (let k = 1; k < list.length; k++) pairs.push({ a:list[0], b:list[k], exact:true }); });
    for (let i = 0; i < names.length && pairs.length < 40; i++)
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i], b = names[j];
        if (a.n === b.n || a.n.length < pp('forensic_dupes', 'minLen') || b.n.length < pp('forensic_dupes', 'minLen') || a.n[0] !== b.n[0]) continue;
        /* "Customer 0001" and "Customer 0002" are numbered accounts of an anonymised export, not one customer twice. */
        if (a.n.replace(/\d+/g, '#') === b.n.replace(/\d+/g, '#')) continue;
        if (editDistance(a.n, b.n, pp('forensic_dupes', 'distance')) <= pp('forensic_dupes', 'distance')) pairs.push({ a, b, exact:false });
      }
  }
  const overlapping = pairs.filter(p => C[p.a.i].mrr.some((v, t) => v > 0 && C[p.b.i].mrr[t] > 0));
  add({ id:'dupes', title:'Possible duplicate customers',
    status: overlapping.length ? 'warn' : pairs.length ? 'info' : names.length > 1500 ? 'na' : 'pass',
    stat: names.length > 1500 ? 'skipped above 1,500 customers' : `${pairs.length} similar name pair${pairs.length === 1 ? '' : 's'}, ${overlapping.length} billed in the same months`,
    detail: pairs.length ? pairs.slice(0, 5).map(p => `“${p.a.raw}” / “${p.b.raw}”`).join('; ') : 'No two customer names normalise to the same or nearly the same string.',
    method:'Names lower-cased and stripped of legal suffixes, then compared exactly and by edit distance of at most two characters.',
    caveat:'Subsidiaries of one group legitimately bill separately. Duplicates matter when they inflate logo counts, or when a rename shows up as one churn and one new logo.',
    ask: pairs.length ? 'Are these the same economic customer? If so, how are they counted in the logo total and in the new-logo and churn figures?' : null });

  /* 5. Spike-and-revert: one-off fees recorded as MRR. */
  let spikes = 0; const spikeNames = [];
  C.forEach(c => {
    for (let t = 1; t < T - 1; t++) {
      const p = c.mrr[t - 1], v = c.mrr[t], n = c.mrr[t + 1];
      if (p > 0 && v >= p * pp('forensic_spike_revert', 'jump') && n > 0 && n <= p * pp('forensic_spike_revert', 'back')) { spikes++; if (spikeNames.length < 4) spikeNames.push(`${c.name} (${monthLabel(M[t])})`); break; }
    }
  });
  add({ id:'spike_revert', title:'One-off charges booked as recurring',
    status: spikes >= pp('forensic_spike_revert', 'hits') ? 'warn' : spikes ? 'info' : 'pass',
    stat:`${spikes} customer${spikes === 1 ? '' : 's'} with a single month at 3x or more of the surrounding level`,
    detail: spikes ? 'Examples: ' + spikeNames.join('; ') + '.' : 'No isolated one-month jumps.',
    method:'A month at least three times the prior month, followed by a return to within 30% of the prior level.',
    caveat:'Annual true-ups and overage billing produce the same shape. Whether it belongs in MRR depends on the contract.',
    ask: spikes ? 'Are overages, true-ups or setup fees included in the MRR figure? If so, what is contracted MRR alone?' : null });

  /* 6. Negative values. */
  const neg = C.reduce((a, c) => a + c.mrr.filter(v => v < 0).length, 0);
  if (neg) add({ id:'negatives', title:'Negative revenue entries', status:'info',
    stat:`${neg} negative customer-month value${neg === 1 ? '' : 's'}`,
    detail:'Negative entries were treated as zero for MRR. They usually represent credit notes or refunds.',
    method:'Count of customer-month values below zero.', caveat:'Credits are normal; they should net against revenue, not sit inside MRR.',
    ask:'What do the negative entries represent, and is ARR reported before or after credits?' });

  /* 7. Growth smoothness. */
  const g = A.mom.slice(-12).filter(x => x != null);
  if (g.length >= 9) {
    const mg = mean(g), sd = stdev(g), cv = mg > 0 ? sd / mg : null;
    const smooth = mg > 2 && cv != null && cv < pp('forensic_smooth', 'cv');
    add({ id:'smoothness', title:'Growth smoothness', status: smooth ? 'info' : 'pass',
      stat: cv != null ? `month-on-month growth ${fmtPct(mg)} ± ${fmtPct(sd)} (variation ${cv.toFixed(2)})` : `mean growth ${fmtPct(mg)}`,
      detail: smooth ? 'Growth is steadier than most early-stage ledgers, where single deals move the month. Worth understanding, not a finding on its own.' : 'Month-to-month variation looks like a normal ledger with deal-driven lumps.',
      method:'Coefficient of variation of month-on-month MRR growth over the last twelve months.',
      caveat:'A large, diversified self-serve base genuinely grows smoothly. This is a weak signal and is never scored.',
      ask: smooth ? 'Is revenue recognised ratably from annual invoices? That would explain the smoothness.' : null });
  }

  /* 8. Reactivation share. */
  const reactTot = sum(A.bridge.slice(-12).map(b => b.react)), newTot = sum(A.bridge.slice(-12).map(b => b.nw));
  if (reactTot + newTot > 0) {
    const rs = reactTot / (reactTot + newTot) * 100;
    add({ id:'reactivation', title:'Reactivations inside new business', status: rs > pp('forensic_react', 'warn') ? 'warn' : rs > pp('forensic_react', 'info') ? 'info' : 'pass',
      stat:`${fmtPct(rs, 0)} of incoming MRR came from customers who had previously left`,
      detail:'Customers who pause and return make gross churn look higher and new-logo growth look better than it is if the two are not separated.',
      method:'Reactivated MRR ÷ (new-logo + reactivated MRR), last twelve months.',
      caveat:'Seasonal businesses pause legitimately.',
      ask: rs > 10 ? 'How does the company report returning customers: as new logos, or as reactivations?' : null });
  }

  /* 9. Benford on distinct customer-level values. */
  const distinct = [];
  C.forEach(c => { let last = null; c.mrr.forEach(v => { if (v > 0 && v !== last) distinct.push(v); last = v; }); });
  const bf = benfordTest(distinct);
  add({ id:'benford', title:'First-digit (Benford) test', bf,
    status: !bf.applicable ? 'na' : bf.mad > 0.015 ? 'warn' : bf.mad > 0.012 ? 'info' : 'pass',
    stat: bf.applicable ? `MAD ${bf.mad.toFixed(4)}: ${bf.band} (n = ${bf.n})` : 'not applicable to this data',
    detail: bf.applicable ? `Chi-square ${bf.chi2.toFixed(1)} on 8 degrees of freedom (5% critical value 15.5). ${bf.mad > 0.015 ? 'The distribution of leading digits departs from what naturally occurring amounts usually show.' : 'Leading digits look like naturally occurring amounts.'}` : `Not run: ${bf.why}.`,
    method:'Leading digit of each distinct customer revenue level, compared with the Benford distribution; conformity bands from Nigrini (MAD 0.006 / 0.012 / 0.015).',
    caveat:'Benford nonconformity is a reason to look, never evidence on its own. Price lists, minimum commitments and currency conversion all distort it legitimately.',
    ask: bf.applicable && bf.mad > 0.015 ? 'Can the ledger be reconciled to invoices and bank receipts for a sample of customers we choose?' : null });

  return out;
}
