/* ═══════════════════════════════════════════════════════════════
   SMART FILL: ENGINE (E2 to E6). Rules only: what kind of document,
   which label means which field, which column is the latest actual,
   which number is a target or someone else's figure, and how sure we
   are. Every proposal says where it came from and why.
   ═══════════════════════════════════════════════════════════════ */
/* document types: file-name words, sheet names and keywords, each with a weight; the role sets the evidence tag (S6) */
const SF_TYPES = [
  { id:'ledger', role:'export', name:/ledger|mrr|revenue.by.customer/i, words:[/\bmrr\b/i, /customer/i] },
  { id:'deck', role:'deck', name:/deck|presentation|pitch|overview/i, words:[/traction|market|team|why now|the problem|our solution|we are raising/i, /tam\b|addressable/i] },
  { id:'update', role:'deck', name:/update|letter|cfo|reply|monthly/i, words:[/\bhi (all|everyone)|dear investors|bonjour|update|this month|runway/i] },
  { id:'model', role:'model', name:/model|p.?&.?l|bridge|financ|budget/i, words:[/opening arr|closing arr|gross margin|p&l|arr bridge|ltm|forecast/i] },
  { id:'captable', role:'model', name:/cap.?table|capitali[sz]ation/i, words:[/fully diluted|shares|option pool|holder|preferred|common/i] },
  { id:'termsheet', role:'model', name:/term.?sheet|terms/i, words:[/pre-money|liquidation preference|anti-dilution|pro rata|term sheet|summary of terms/i] },
  { id:'bank', role:'bank', name:/bank|statement|account/i, words:[/statement period|ending balance|opening balance|available balance|account ending/i] },
  { id:'receivables', role:'export', name:/aging|ageing|receivable|\bar\b/i, words:[/91-120|120\+|receivables|aging|deferred revenue/i] },
  { id:'crm', role:'export', name:/pipeline|crm|opportunit/i, words:[/win rate|pipeline coverage|sales cycle|quota|opportunity|closed won/i] },
  { id:'headcount', role:'export', name:/headcount|team.?plan|people/i, words:[/headcount|engineering|g&a|open roles|loaded cost/i] },
  { id:'security', role:'model', name:/security|compliance|legal/i, words:[/soc ?2|penetration test|uptime|litigation|ip assignment|data processing agreement/i] },
  { id:'market', role:'deck', name:/market|research|survey|nps|reference/i, words:[/net promoter|sean ellis|very disappointed|competitor|target accounts|respondents/i] },
  { id:'audited', role:'audited', name:/audit/i, words:[/independent auditor|in our opinion|present fairly|balance sheet/i] },
  { id:'metrics', role:'export', name:/metric|export|kpi/i, words:[/"?metrics"?|as_of|active_customers/i] },
];
const SF_ROLE_TAG = { export:'export', model:'model', deck:'deck', bank:'bank', audited:'audited', unknown:'' };
function sfClassify(doc) {
  const text = sfDocText(doc).slice(0, 60000), name = doc.file || '';
  const sheets = doc.blocks.filter(b => b.hints && b.hints.sheet).map(b => b.hints.sheet).join(' ');
  const ranked = SF_TYPES.map(t => {
    let s = t.name.test(name) ? 3 : 0;
    if (sheets && t.name.test(sheets)) s += 2;
    t.words.forEach(w => { const n = (text.match(new RegExp(w.source, 'gi')) || []).length; s += Math.min(4, n) * 0.6; });
    const own = ((sfOwn().docTypes || {})[t.id] || {}).words || [], low = text.toLowerCase();
    own.forEach(w => { const k = String(w).toLowerCase(); if (k && low.includes(k)) s += 1.2; });
    if (doc.kind === 'json' && t.id === 'metrics') s += 3;
    if ((doc.kind === 'pptx' || doc.slides) && t.id === 'deck') s += 3;
    if (doc.kind === 'eml' && t.id === 'update') s += 2;
    return { id:t.id, role:t.role, score:Math.round(s * 10) / 10 };
  }).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  if (sfLedgerTable(doc)) ranked.unshift({ id:'ledger', role:'export', score:99 });
  const top = ranked[0], conf = top.score >= 4 ? 'High' : top.score >= 2 ? 'Medium' : 'Low';
  return { type:top.score > 0 ? top.id : 'unknown', role:top.score > 0 ? top.role : 'unknown', conf, ranked:ranked.slice(0, 4) };
}
const sfDocText = doc => doc.blocks.map(b => b.text || (b.rows || []).slice(0, 200).map(r => r.join(' ')).join('\n')).join('\n');
/* a customer ledger: one row per customer, six or more month columns */
function sfLedgerTable(doc) {
  return doc.blocks.some(b => b.type === 'table' && b.rows.length >= 4 && (b.rows[0] || []).filter(c => /^(20\d\d[-/]\d{1,2}|[A-Z][a-z]{2}[- ]?\d{2,4}|\d{1,2}\/20\d\d)$/.test(c)).length >= 6);
}

/* ── label matching: exact > synonym inside the label > shared words; a veto term rules the field out ── */
let _sfNA = null;
function sfNA() {   /* the built-in words plus the owner's (Studio) */
  const w = (sfOwn().forecastWords || []).map(x => sfNorm(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean), key = w.join('|');
  if (!_sfNA || _sfNA.key !== key) _sfNA = { key, re:w.length ? new RegExp(SF_NOT_ACTUAL.source + '|\\b(' + key + ')\\b', 'i') : SF_NOT_ACTUAL };
  return _sfNA.re;
}
/* the point in time a header or row label names (2025, FY26, Q3 2026, Sep-26, September, 2026-09), as a number of years; 0 when none */
function sfPeriodT(h) {
  h = String(h || '').trim(); if (!h || h.length > 40) return 0;
  const MON = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12, janv:1, fev:2, fevr:2, mars:3, avr:4, mai:5, juin:6, juil:7, aout:8, sept:9 };
  const n = h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let y = +((/(?:^|\D)((?:19|20)\d\d)(?!\d)/.exec(n) || [])[1] || 0);
  if (!y) { const m2 = /(?:fy|cy|q[1-4]|h[12]|[a-z]{3,9})\s?[-'.]?\s?(\d\d)(?![0-9])/.exec(n); if (m2) y = 2000 + +m2[1]; }
  const q = /\bq([1-4])\b/.exec(n), mi = /^((?:19|20)\d\d)-(\d\d)/.exec(n), mo = /\b(janv|fevr?|mars|avr|mai|juin|juil|aout|sept|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\b/.exec(n);
  const sub = mi ? +mi[2] / 12 : q ? +q[1] / 4 : mo ? MON[mo[1]] / 12 : y ? 0.99 : 0;
  if (!y && !mo) return 0;
  return (y || 1) + sub;
}
const sfNotActual = (text, f) => { const t = f.syn.reduce((x, s) => s.length > 2 ? x.split(s).join(' ') : x, sfNorm(text)).replace(/\bactual\b/g, ''); return sfNA().test(t); };
const _sfTokMemo = new Map(), sfToks = s => { let v = _sfTokMemo.get(s); if (!v) { v = sfToks0(s); if (_sfTokMemo.size > 50000) _sfTokMemo.clear(); _sfTokMemo.set(s, v); } return v; };
const sfToks0 = s => s.split(' ').filter(w => w && !/^(the|of|our|a|an|in|for|and|at|as|to|de|la|le|les|du|des|en|total|current|monthly|annual|actual)$/.test(w)).map(w => w.length > 5 ? w.replace(/(ing|ed|es|s)$/, '') : w.length > 4 ? w.replace(/s$/, '') : w);
function sfEdit1(a, b) { if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, e = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } } return e + (a.length - i) + (b.length - j) <= 1; }
const sfHas = (hay, needle) => (' ' + hay + ' ').includes(' ' + needle + ' ') || (/[^a-z0-9 ]/.test(needle) && hay.includes(needle));
/* a label prepared once for scoring against many fields: its text, its text with "excluding X" removed (for vetoes), its words */
function sfLabelPrep(label, ctx) {
  const L = sfNorm(label); if (!L || L.length > 160) return null;
  const lt = sfToks(L);
  const Lv = L.replace(/\b(excluding|excl|net of|without|hors)\b( [a-z]+){1,2}/g, ' '), c = ctx ? sfNorm(ctx) : '';
  return { L, Lv, ctx:c, lt, lset:new Set(lt), Lp:' ' + L + ' ', Lvp:' ' + Lv + ' ', cp:' ' + c + ' ' };
}
/* sfHas on a text already padded with spaces (hp) */
const _sfSym = new Map(), sfHasP = (hp, h, n) => {
  if (hp.includes(' ' + n + ' ')) return true;
  let y = _sfSym.get(n); if (y === undefined) { y = /[^a-z0-9 ]/.test(n); _sfSym.set(n, y); }
  return y && h.includes(n);
};
function sfLabelScore(label, f, ctx) { const P = sfLabelPrep(label, ctx); return P ? sfLabelScoreP(P, f) : 0; }
function sfLabelScoreP(P, f) {
  const { L, Lv, ctx, lt, lset, Lp, Lvp, cp } = P;
  for (const n of f.neg) if (n && sfHasP(Lvp, Lv, n)) return 0;
  if (f.must.length && !f.must.some(m => sfHasP(Lp, L, m) || sfHasP(Lp, L, m + 's') || (ctx && (sfHasP(cp, ctx, m) || sfHasP(cp, ctx, m + 's'))))) return 0;
  let best = 0;
  for (const s of f.syn) {
    if (L === s) return 1;
    if (sfHasP(Lp, L, s)) best = Math.max(best, 0.72 + 0.26 * Math.min(1, s.length / L.length));
    else if (lt.length) {
      const st = sfToks(s); if (!st.length) continue;
      /* every word of the synonym must be in the label (one letter off allowed in words of six letters or more) */
      if (!st.every(t => lset.has(t) || (t.length >= 6 && lt.some(u => sfEdit1(t, u))))) continue;
      const j = st.length / (new Set([...st, ...lt]).size);
      if (j >= 0.5) best = Math.max(best, 0.55 + 0.35 * j);
    }
  }
  return best;
}
/* An index from synonym words to fields, so a label is scored only against fields that share a word with it (a field scores 0
   unless every word of one of its synonyms is in the label, give or take one letter in words of six letters or more).
   Fields with a synonym that has no plain words are always scored. The result is the same as scoring every field. */
const sfDels = w => { const o = []; for (let i = 0; i < w.length; i++) o.push(w.slice(0, i) + w.slice(i + 1)); return o; };
function sfSynIndex(fields) {
  const exact = new Map(), del = new Map(), always = [], put = (m, k, i) => { let x = m.get(k); if (!x) m.set(k, x = []); if (x[x.length - 1] !== i) x.push(i); };
  fields.forEach((f, i) => {
    let any = false;
    for (const sy of f.syn) {
      const st = sfToks(sy); if (!st.length || /[^a-z0-9 ]/.test(sy)) { any = true; continue; }
      for (const t of st) { put(exact, t, i); if (t.length >= 6) { put(del, t, i); for (const v of sfDels(t)) put(del, v, i); } }
    }
    if (any) always.push(i);
  });
  return { exact, del, always };
}
function sfCandidateFields(ix, label, fields) {
  const L = sfNorm(label); if (!L || L.length > 160) return [];
  const hit = new Set(ix.always), add = a => { if (a) for (const i of a) hit.add(i); };
  for (const u of sfToks(L)) {
    add(ix.exact.get(u));
    if (u.length >= 5) { add(ix.del.get(u)); for (const v of sfDels(u)) { add(ix.del.get(v)); if (v.length >= 6) add(ix.exact.get(v)); } }
  }
  return [...hit].sort((a, b) => a - b).map(i => fields[i]);
}
/* the best field for a label; remembered per field list (one extraction), and a fresh object each time so callers may change it */
const _sfMatchMemo = new WeakMap();
function sfMatch(label, fields, ctx) {
  let memo = _sfMatchMemo.get(fields); if (!memo) { memo = new Map(); memo.ix = sfSynIndex(fields); _sfMatchMemo.set(fields, memo); }
  const key = String(label) + '\u0001' + (ctx || '');
  let best = memo.get(key);
  if (best === undefined) {
    best = null;
    const P = sfLabelPrep(label, ctx);
    if (P) for (const f of sfCandidateFields(memo.ix, label, fields)) { const s = sfLabelScoreP(P, f); if (s > 0.5 && (!best || s > best.s)) best = { f, s }; }
    if (memo.size > 20000) memo.clear();   /* the index (memo.ix) stays; only remembered answers are dropped */
    memo.set(key, best);
  }
  return best && { f:best.f, s:best.s };
}

/* ── a value for a field: unit, scale, range and plausibility; null when the number does not fit ── */
function sfFit(n, fld, ctx) {
  const u = fld.unit || '', note = [];
  let v = fld.d && fld.d.abs ? Math.abs(n.value) : n.value, unit = n.unit;
  if (n.range) return null;
  if (u === '$') {
    if (unit && unit !== '$') return null;
    if (!n.scaled && ctx.scale && ctx.scale !== 1) { v *= ctx.scale; note.push(`× ${ctx.scale.toLocaleString('en-US')} (the table says so)`); }
  } else if (u === '%') {
    if (unit === '%') {} else if (unit) return null;
    else if (ctx.fraction && Math.abs(v) <= 1.5) { v = Math.round(v * 1e6) / 1e4; note.push('a fraction, shown as a percentage'); }
    else if (!ctx.pctHeader) return null;
  } else if (u === 'x') { if (unit && unit !== 'x') return null; }
  else if (u === 'months') { if (unit === 'days') { v = Math.round(v / 30 * 10) / 10; note.push('days to months'); } else if (unit && unit !== 'months') return null; }
  else if (u === 'days') { if (unit === 'months') { v = Math.round(v * 30); note.push('months to days (30 days a month)'); } else if (unit && unit !== 'days') return null; }
  else if (u === 'years') { if (unit && unit !== 'years') return null; }
  else { if (unit && unit !== '' && !(fld.id === 'nps' && unit === '%') && !(unit === 'x' && /multiple|magic|ratio/.test(fld.id))) return null; if (fld.t === 'num' && !Number.isInteger(v) && !/pct|rate|ratio|util|multiple|magic/.test(fld.id)) return null; }
  const d = fld.d; if (d && (v < d.lo || v > d.hi)) return null;
  return { value:v, note, converted:note.length > 0 };
}

/* ── candidates from one document ── */
function sfCandidates(doc, cls, fields, opts) {
  const out = [], rejects = [], notes = [], text = sfDocText(doc), locale = sfOwn().locale || sfLocale(text);
  const reject = (f, why, snippet) => { if (f && rejects.length < 500) rejects.push({ field:f.id, why, snippet:String(snippet || '').slice(0, 120) }); };
  const ccyDoc = (/all figures in (eur|gbp|chf)|en (euros|livres)/i.exec(text) || [])[1];
  const counts = { USD:(text.match(/\$|USD/g) || []).length, EUR:(text.match(/€|EUR/g) || []).length, GBP:(text.match(/£|GBP/g) || []).length };
  const ccy = ccyDoc ? ccyDoc.toUpperCase() : Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const docCcy = counts[ccy] ? ccy : 'USD';
  const byId = new Map(fields.map(f => [f.id, f]));
  const head0 = doc.blocks.slice(0, 6).map(b => b.text || '').join(' ');
  const docScale = /\$\s?in millions|in \$?\s?millions|\(\$\s?m(illions)?\)|en millions/i.test(head0) ? 1e6 : /\$\s?in thousands|in \$?\s?thousands|en milliers/i.test(head0) ? 1e3 : 1;
  let curHead = '';
  const add = (fld, value, c) => {
    if (!fld || fld.d.skip) return;
    /* a number under a definitions, footnotes, appendix or assumptions heading explains a figure; it is not the figure (Low at most) */
    if (/definition|footnote|appendix|glossary|methodolog|assumption|basis of preparation/i.test(curHead)) { c = Object.assign({}, c, { struct:(c.struct || 1) * 0.6, notes:(c.notes || []).concat([`under "${curHead.slice(0, 40)}"`]) }); }
    out.push(Object.assign({ field:fld.id, value, file:doc.file, role:cls.role, type:cls.type }, c));
  };
  /* a label and its value (kv blocks, "Label: value" paragraphs) */
  const blockKV = (l, v, b, bi) => {
    const m = sfMatch(l, fields, '');
    if (m && sfNotActual(l, m.f)) reject(m.f, 'a target, forecast, competitor or market figure', `${l}: ${v}`);
    if (m && !sfNotActual(l, m.f)) {
      const tile = !!(b.hints && b.hints.tile), foot = /[¹²³*†]/.test(l) || /[¹²³*†]/.test(v);
      if (m.f.t === 'num') valueOf(m, v, { via:tile ? 'tile' : 'kv', loc:b.loc, struct:tile ? 0.95 : 1, snippet:`${l}: ${v}`, ctx:{ locale, pctHeader:/%|percent/i.test(l + v) }, foot });
      else sfChoiceKV(m.f, l, v, b, add);
      if (m.f.t === 'num' && sfNumbers(v, { locale }).length > 1) sentenceCands(b, `${l} ${v}`);
    } else if (/\d/.test(v)) sentenceCands(b, `${l}: ${v}`);
  };
  /* a table: header row, label column, the column holding the latest actual and the one a year earlier */
  const tableCands = (b, bi) => {
    const rows = b.rows; if (!rows.length) return;
    const all = rows.map(r => r.join(' ')).join(' '), scaleText = (doc.blocks[bi - 1] && doc.blocks[bi - 1].text || '') + ' ' + rows.slice(0, 4).map(r => r.join(' ')).join(' ') + ' ' + (b.hints.sheet || '');
    const scale = /in thousands|\(000s?\)|\$ ?000|\$k\b|en milliers|k€|€k|thousands\)/i.test(scaleText) ? 1e3 : /in millions|\(\$m\)|\$mm|en millions/i.test(scaleText) ? 1e6 : docScale;
    if (b.hints.hidden) return;
    const isNum = c => sfNumbers(c, { locale }).length === 1 && /^[^A-Za-z]*\d[^A-Za-z]*(%|x|k|m|bn|mm|days|months)?[^A-Za-z]*$/i.test(c);
    const isPeriod = c => /^((fy|cy)\s?'?\d{2,4}[a-z]?|(19|20)\d\d([a-z]| ?\(?[a-z ]+\)?)?|q[1-4]\s?'?\d{2,4}|h[12]\s?'?\d{2,4}|[a-z]{3,9}[- ]?'?\d{2,4}|ltm.*|ttm.*|actual.*|forecast.*|budget.*|plan.*)$/i.test(String(c).trim());
    const hi = rows.findIndex((r, ri) => ri < 6 && r.filter(Boolean).length >= 2 && r.filter(c => c && (!isNum(c) || isPeriod(c))).length === r.filter(Boolean).length && r.slice(1).some(c => c));
    let hi2 = hi; if (hi2 >= 0) { const m1 = sfMatch(rows[hi2][0] || '', fields, b.hints.sheet || ''); if (m1 && m1.s >= 0.8 && rows[hi2].filter(Boolean).length === 2) hi2 = -1; }
    const header = hi2 >= 0 && hi2 < 5 ? rows[hi2] : null, w = rows.reduce((m, r) => Math.max(m, r.length), 0);
    let tctx = (b.hints.sheet || '') + ' ' + (header ? rows.slice(0, hi2 + 1).map(r => r.join(' ')).join(' ') : '');
    if (header && /valuation cap/i.test(tctx) && /discount/i.test(tctx) && !/interest|maturity|note|lender/i.test(tctx)) tctx += ' safe';   /* sheet name, title rows and headers: the context of every row */
    const colInfo = Array.from({ length:w }, (_, k) => {
      const h = header ? header[k] || '' : '';
      const year = +((/(20\d\d)/.exec(h) || /(?:fy|cy|q[1-4]|h[12]|[a-z]{3})\s?[-']?\s?(\d\d)(?![0-9])/i.exec(h) || [])[1] || 0); const y = year && year < 100 ? 2000 + year : year;
      const t = sfPeriodT(h);
      return { h, notActual:sfNA().test(h) && !/actual/i.test(h), actual:SF_ACTUAL.test(h), t, prior:/prior|last year|12 months ago|year ago|previous/i.test(h) };
    });
    const numericCols = colInfo.map((c, k) => k).filter(k => rows.slice(header ? hi2 + 1 : 0).some(r => isNum(r[k] || '')));
    const usable = numericCols.filter(k => !colInfo[k].notActual);
    const dated = usable.filter(k => colInfo[k].t);
    let cur = dated.length ? dated.reduce((a, k) => colInfo[k].t > colInfo[a].t ? k : a, dated[0]) : usable.find(k => colInfo[k].actual) ?? usable[0];
    const prior = dated.find(k => k !== cur && colInfo[cur] && Math.abs(colInfo[cur].t - colInfo[k].t - 1) < 0.6) ?? usable.find(k => colInfo[k].prior);
    const pctHeader = k => /%|percent|pct|share|rate|margin/i.test((header && header[k]) || '');
    /* periods down the rows (Q4 2024 ... Q3 2026), metrics across: each metric from the latest actual row, the year before for "12 months ago" */
    const dataRows = rows.slice(header ? hi2 + 1 : 0), pRows = dataRows.filter(r => sfPeriodT(r[0] || '') && !sfNA().test(r[0] || ''));
    /* a transaction list (bank statement, ledger) also has dates down the rows, but a column of words (a description) */
    const textCol = header && header.some((h, k) => k && dataRows.filter(r => r[k] && !isNum(r[k])).length > dataRows.length * 0.5);
    if (header && !textCol && pRows.length >= 3 && pRows.length >= dataRows.length * 0.6) {
      const latest = pRows.reduce((a, r) => sfPeriodT(r[0]) > sfPeriodT(a[0]) ? r : a, pRows[0]), lt = sfPeriodT(latest[0]), ri = rows.indexOf(latest);
      const yearAgo = pRows.find(r => Math.abs(lt - sfPeriodT(r[0]) - 1) < 0.05), quarter = /\bq[1-4]\b|quarter/i.test(latest[0]);
      header.forEach((h, k) => {
        if (!k) return; const m = sfMatch(h, fields, tctx); if (!m || m.f.t !== 'num' || sfNotActual(h, m.f)) return;
        if (quarter && /^(net_burn|gross_burn)$/.test(m.f.id)) { reject(m.f, 'a quarterly total, not a monthly figure', `${h} | ${latest[0]}`); return; }
        if (latest[k]) valueOf(m, latest[k], { loc:cellLoc(b, ri, k), struct:0.95, snippet:`${h} | ${latest[0]} | ${latest[k]}`, ctx:{ scale, locale, pctHeader:pctHeader(k) } });
        const pf = m.f.d.prior && byId.get(m.f.d.prior);
        if (yearAgo && pf && yearAgo[k]) valueOf({ f:pf, s:m.s }, yearAgo[k], { loc:cellLoc(b, rows.indexOf(yearAgo), k), struct:0.9, snippet:`${h} | ${yearAgo[0]} | ${yearAgo[k]}`, ctx:{ scale, locale }, why:'the row a year earlier' });
      });
      return;
    }
    /* transposed: field names across the header, values in the next row */
    if (header && rows.length <= 3) {
      header.forEach((h, k) => { const m = sfMatch(h, fields, tctx); const cell = (rows[hi2 + 1] || [])[k]; if (m && cell) valueOf(m, cell, { loc:cellLoc(b, hi2 + 1, k), struct:0.95, snippet:`${h}: ${cell}`, ctx:{ scale, locale, pctHeader:pctHeader(k) } }); });
    }
    /* a long data table (an export, a log): metrics sit at its top and its totals at its bottom; the middle is not read for labels */
    const long = rows.length > SF_LIMIT.tableRows;
    if (long) notes.push(`${b.hints.sheet || b.loc || 'a table'}: rows ${SF_LIMIT.tableHead + 1} to ${rows.length - SF_LIMIT.tableTail} of ${rows.length} were not read for labels (a long data table).`);
    rows.forEach((r, ri) => {
      if (header && ri <= hi2) return;
      if (long && ri >= SF_LIMIT.tableHead && ri < rows.length - SF_LIMIT.tableTail) return;
      const labelCells = r.map((c, k) => ({ c, k })).filter(x => x.c && !isNum(x.c));
      if (!labelCells.length) return;
      if (labelCells.length === 2 && !/\d/.test(labelCells[0].c) && /\d/.test(labelCells[1].c) && !r.some(c => c && isNum(c))) { blockKV(labelCells[0].c, labelCells[1].c, { loc:cellLoc(b, ri, labelCells[1].k), hints:{} }, bi); return; }
      const m0 = sfMatch(labelCells[0].c, fields, ''), label = m0 && m0.f.t !== 'num' ? labelCells[0].c : labelCells.map(x => x.c).join(' ');
      let m = sfMatch(label, fields, tctx);
      if (!m && /\s\/\s|\(/.test(label)) {
        const part = label.split(/\s\/\s|[()]/).map(x => x.trim()).filter(x => x.length > 2).map(x => sfMatch(x, fields, tctx)).filter(Boolean).sort((a, b) => b.s - a.s)[0];
        if (part) m = { f:part.f, s:part.s * 0.9 };
      }
      if (!m) return;
      if (sfNotActual(label, m.f)) { reject(m.f, 'a target, forecast, competitor or market figure', label); return; }
      const pick = k => k != null && isNum(r[k] || '') ? k : null;
      let k = pick(cur);
      if (k == null) { const nums = r.map((c, j) => j).filter(j => isNum(r[j] || '') && !colInfo[j].notActual); k = nums.length ? nums[nums.length - 1] : null; }
      if (m.f.t !== 'num') { const v = labelCells.length > 1 ? labelCells[labelCells.length - 1].c : ''; if (v) sfChoiceKV(m.f, labelCells[0].c, v, { loc:cellLoc(b, ri, labelCells[labelCells.length - 1].k) }, add); return; }
      if (k != null) valueOf(m, r[k], { loc:cellLoc(b, ri, k), struct:1, snippet:`${label} | ${header && header[k] ? header[k] + ' | ' : ''}${r[k]}`, ctx:{ scale, locale, pctHeader:pctHeader(k) || /%|(\b|_)pct\b|percent/i.test(label) } });
      const pk = pick(prior), pf = m.f.d.prior && byId.get(m.f.d.prior);
      if (pk != null && pf && pk !== k) valueOf({ f:pf, s:m.s }, r[pk], { loc:cellLoc(b, ri, pk), struct:0.95, snippet:`${label} | ${header[pk]} | ${r[pk]}`, ctx:{ scale, locale }, why:'the column a year earlier' });
    });
    sfCalcTable(b, rows, header, hi, fields, byId, add, doc, scale, locale);
  };
  const cellLoc = (b, r, k) => b.hints && b.hints.sheet ? `${b.hints.sheet}!${sfCol(k)}${r + 1}` : `${b.loc}, row ${r + 1}`;
  const valueOf = (m, raw, c) => {
    if (m.f.t === 'select' || m.f.t === 'bool' || m.f.t === 'txt') return;
    let nums = sfNumbers(raw, c.ctx || { locale });
    if (nums.length > 1) nums = sfNumbers(String(raw).replace(/\([^)]*\)|\[[^\]]*\]/g, ' '), c.ctx || { locale });
    if (nums.length > 1) { const fitting = nums.filter(n => (m.f.unit === '$' ? n.unit === '$' : m.f.unit === '%' ? n.unit === '%' : m.f.unit === 'x' ? n.unit === 'x' : false)); if (fitting.length) { nums = [fitting[0]]; c.struct = Math.min(c.struct, 0.92); } }
    if (nums.length !== 1) return;
    const n = nums[0], fit = sfFit(n, m.f, Object.assign({ fraction:doc.kind === 'json' || /^0?\.\d+$/.test(String(raw).trim()) }, c.ctx || {}));
    if (!fit) { reject(m.f, n.range ? 'a range, not a single figure' : 'the unit or the size does not fit this field', c.snippet); return; }
    if (m.f.d.abs) fit.value = Math.abs(fit.value);
    const money = m.f.unit === '$', foreign = money && (n.ccy ? n.ccy !== 'USD' : docCcy !== 'USD');
    add(m.f, fit.value, { via:c.via || 'table', raw:String(raw).trim(), loc:c.loc, snippet:String(c.snippet).slice(0, 160), label:m.s, struct:c.struct, approx:n.approx, foot:n.foot || c.foot, computed:false,
      ccy:money ? (n.ccy || docCcy) : '', foreign, bound:n.bound, converted:fit.converted, notes:fit.note.concat(c.why ? [c.why] : []), scaled:n.scaled });
  };
  /* sentences: the words before a number (or after it) name the field; "from X to Y" keeps Y */
  const sentenceCands = (b, text) => {
    const nums = sfNumbers(text, { locale });
    nums.forEach((n, i) => {
      const prevEnd = i ? nums[i - 1].end : 0, before = text.slice(Math.max(prevEnd, n.start - 90), n.start), after = ((n.unitWord ? n.unitWord + ' ' : '') + text.slice(n.end, n.end + 60)).split(/[.;,]|\band\b|\bfrom\b/)[0];
      let cs = 0; text.slice(0, n.start).replace(/[.!?](?=\s)/g, (x, o) => { cs = o + 1; return x; });
      const clause = text.slice(cs, n.end + 60);
      if (/\bfrom\s*$/i.test(before.slice(-8)) && nums[i + 1] && /^\s*to\s/i.test(text.slice(n.end, nums[i + 1].start))) return;   /* X in "from X to Y" is the earlier value */
      let m = null, struct = 0.9, label = '';
      const bw0 = before.replace(/.*[.;!?]\s/, '').replace(/^.*\b(and|while|but|et)\b/i, ''), seg = bw0.split(',').pop(), bw = /[a-z]{2}/i.test(seg) ? seg : bw0;
      const a1 = sfMatch(bw, fields, clause), a2 = after.trim() ? (sfMatch(after.trim().split(/\s+/).slice(0, 3).join(' '), fields, clause) || sfMatch(after.trim().split(/\s+/).slice(0, 6).join(' '), fields, clause)) : null;
      if (a1 && (!a2 || a1.s >= a2.s)) { m = a1; label = bw; } else if (a2) { m = a2; label = after; struct = 0.88; }
      /* "up 239% on the prior year", "grew 80% year over year": the percentage is the growth, whatever grew */
      const yoy = n.unit === '%' && /\b(up|grew|grown|growth of|increase of|increased|rose|higher)\s*(by\s*)?$/i.test(text.slice(Math.max(0, n.start - 20), n.start))
        && /^\s*(?:(?:on|over|vs\.?|versus|compared (?:to|with)|from)\s+(?:the\s+)?(?:prior|previous|last)\s+year|year[- ](?:on|over)[- ]year|yoy)\b/i.test(text.slice(n.end, n.end + 40));
      if (yoy && (!m || !/growth/.test(m.f.id))) { const g = sfMatch('year over year growth', fields, ''); if (g) { m = g; label = 'growth on the prior year'; struct = 0.85; } }
      if (!m) return;
      const cl2 = m.f.syn.reduce((t, s) => t.split(s).join(' '), sfNorm(clause)).replace(/\bactual\b/g, '');   /* the field's own words never veto it (TAM says "market") */
      if (sfNA().test(cl2) && !(m.f.d.narrative && /market/.test(cls.type))) { reject(m.f, 'a target, forecast, competitor or market figure', clause); return; }
      const per = /\b(\d{1,3})\s*(?:months|mos|mois)\b/i.exec(text.slice(n.end, n.end + 40));
      if (/_l12$/.test(m.f.id) && per && +per[1] !== 12) { reject(m.f, `a ${per[1]}-month figure, not 12 months`, clause); return; }
      if (/_l12$/.test(m.f.id) && /\b(in|during|for)\s+(january|february|march|april|may|june|july|august|september|october|november|december|the (month|quarter)|q[1-4])\b|\b(this|last) (month|quarter)\b|\bper (month|quarter)\b/i.test(text.slice(n.end, n.end + 50))) { reject(m.f, 'a one-month or one-quarter figure, not 12 months', clause); return; }
      if (!yoy && /\b(last year|a year ago|12 months ago|prior year|il y a)\b/i.test(bw + ' ' + text.slice(n.end, n.end + 25).split(/\d/)[0])) { const pf = m.f.d.prior && byId.get(m.f.d.prior); if (!pf) return; m = { f:pf, s:m.s }; }
      valueOf(m, n.raw, { via:'sentence', loc:b.loc, struct, snippet:clause.trim(), ctx:{ locale, pctHeader:/%|percent/i.test(n.raw) }, foot:/[¹²³*†]/.test(label) });
    });
  };
  doc.blocks.forEach((b, bi) => {
    if (b.type === 'heading') curHead = b.text || '';
    if (cls.type === 'ledger' && b.type === 'table') return;
    if (b.type === 'table') { tableCands(b, bi); return; }
    if (b.hints && (b.hints.furniture || b.hints.speakerNotes)) return;
    if (b.type === 'kv') { blockKV(b.rows[0][0], b.rows[0][1], b, bi); return; }
    const t = b.text || ''; if (!t) return;
    const kvm = /^([^:.!?]{2,70}):\s+(\S.{0,400})$/.exec(t);
    if (kvm && b.type !== 'heading' && !/^(hi|dear|bonjour|note)\b/i.test(kvm[1])) { blockKV(kvm[1], kvm[2], b, bi); return; }
    /* a KPI tile split in two blocks (PDF, HTML): a short value block next to a short label block */
    const nxt = doc.blocks[bi + 1], VAL = /^[~≈]?[-(]?[$€£]?\s?\d[\d,.  ]*\s?(%|x|[kKmMbB](n)?|M€|k€|M\$)?\)?[¹²³*†]?$/;
    if (VAL.test(t.trim()) && nxt && nxt.text && nxt.text.length < 60 && !/\d{2}/.test(nxt.text)) {
      const m = sfMatch(nxt.text, fields, ''); if (m && m.f.t === 'num') valueOf(m, t, { via:'tile', loc:b.loc, struct:0.9, snippet:`${nxt.text}: ${t}`, ctx:{ locale }, foot:/[¹²³*†]/.test(nxt.text) });
      return;
    }
    if (VAL.test(t.trim())) return;
    if (/\d/.test(t)) sentenceCands(b, t);
  });
  curHead = '';
  sfChoices(doc, cls, fields, byId, add, text);
  const restricted = doc.blocks.flatMap(b => (b.type === 'kv' || b.type === 'table') ? b.rows.map(r => { const c = r.filter(Boolean); return [c.find(x => !/^[\d\s,.()-]+$/.test(x)) || '', c.pop() || '']; }) : (/^([^:]{3,80}):\s*(.+)$/.exec(b.text || '') || []).length ? [/^([^:]{3,80}):\s*(.+)$/.exec(b.text).slice(1)] : []).find(r => /restricted|collateral/i.test(r[0]) && !/excluding|excl/i.test(r[0]) && /\d/.test(r[1]));
  const own = sfOwn();
  if (restricted && own.excludeRestricted !== false) {
    const rv = sfNumbers(restricted[1], { locale })[0];
    out.filter(c => c.field === 'cash_on_hand' && /ending|closing|balance/i.test(c.snippet) && !/available|excluding|excl/i.test(c.snippet)).forEach(c => {
      if (!rv) return;
      c.value = Math.round((c.value - rv.value) * 100) / 100; c.computed = true;
      c.notes = (c.notes || []).concat([`ending balance minus restricted cash (${restricted[1]}): the Studio switch "exclude restricted cash" is on`]);
    });
  }
  return { cands:out, rejects, locale, ccy:docCcy, notes };
}

/* ── yes/no and choice fields from label-value pairs (term sheets) ── */
function sfChoiceKV(f, l, v, b, add) {
  const V = v.toLowerCase(), none = /^(none|n\/a|no\b|not applicable|néant|aucun)/.test(V), d = { via:'kv', loc:b.loc, snippet:`${l}: ${v}`.slice(0, 160), label:1, struct:1, raw:v };
  if (f.t === 'bool') {
    let val = !none;
    if (f.id === 'cumulative_dividends') val = /\bcumulative\b/.test(V) && !/non-cumulative|noncumulative|non cumulative/.test(V);
    if (f.id === 'new_participating') val = /participating/.test(V) && !/non-participating|non participating/.test(V);
    add(f, val, d);
  } else if (f.t === 'select') {
    const opt = sfOption(f, V); if (opt) add(f, opt, d);
  } else if (f.t === 'txt' && v.length < 80) add(f, v.trim(), Object.assign({}, d, { struct:0.9 }));
}
const SF_OPTION_WORDS = { 'Broad-based weighted average':/broad/, 'Narrow-based weighted average':/narrow/, 'Full ratchet':/ratchet/, 'Type II':/type ii\b|type 2\b/, 'Type I':/type i\b|type 1\b/,
  'In progress':/in progress|underway|engaged an auditor/, 'Audited':/audited|auditor.s report/, 'Reviewed':/review(ed)? report|reviewed by/, 'Compiled':/compil/ };
function sfSoc(L) {
  return /type ii (report )?(was |has been )?(issued|completed|obtained|received|certified)|soc 2 type ii report|type ii\s*$/.test(L) && !/type ii (observation|audit) (period )?is in progress/.test(L) ? 'Type II'
    : /type i\b[^;.]*(completed|issued|obtained)|type i\s*$/.test(L) ? 'Type I' : /do not have|not started|no soc ?2|^none/.test(L) ? 'None' : /in progress|engaged an auditor|underway|planned/.test(L) ? 'In progress' : null;
}
function sfOption(f, V) {
  if (f.id === 'soc2') return sfSoc(V);
  for (const o of f.options || []) { const w = SF_OPTION_WORDS[o]; if (w ? w.test(V) : V.includes(o.toLowerCase())) return o; }
  if ((f.options || []).includes('None') && /^none\b|^no\b/.test(V)) return 'None';
  return null;
}

/* ── yes/no and choice fields from sentences, with negation, plus the term-sheet clauses ── */
const SF_BOOL_PACKS = {
  litigation:[/litigation|lawsuit|legal proceeding|defendant/i, false], ip_assignments:[/ip assignment|invention assignment|assignment agreements/i, true],
  dpas_signed:[/data processing agreement/i, true], oss_reviewed:[/open.source licen[cs]e/i, true], insurance_dno:[/d&o insurance|directors and officers/i, true],
  valuation_409a:[/409a/i, true], taxes_current:[/\btax(es)?\b.*\b(filed|paid|overdue|late)\b|\b(filed|paid)\b.*\btax/i, true], founder_vesting:[/founders? .*vesting|vesting schedule/i, true],
  regulatory_findings:[/consent order|regulatory finding/i, false], proprietary_data:[/proprietary data/i, true],
};
const SF_NEG = /\b(no|not|never|none|without|have not|has not|hasn't|haven't|lacks?|missing|overdue|late|pas de|aucun|n'a pas)\b/i;
function sfChoices(doc, cls, fields, byId, add, text) {
  const sentences = []; doc.blocks.forEach(b => { if (b.type !== 'table' && b.text && !(b.hints && (b.hints.furniture || b.hints.speakerNotes))) b.text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/).forEach(s => sentences.push({ s:s.trim(), loc:b.loc })); });
  const once = new Set();
  const put = (id, val, x, struct) => { const f = byId.get(id); if (!f || once.has(id)) return; once.add(id); add(f, val, { via:'clause', loc:x.loc, snippet:x.s.slice(0, 160), label:0.9, struct:struct || 0.85, raw:x.s.slice(0, 60) }); };
  for (const x of sentences) {
    const L = x.s.toLowerCase();
    for (const [id, [re, positiveWord]] of Object.entries(SF_BOOL_PACKS)) {
      if (!re.test(x.s)) continue;
      if (id === 'litigation') { if (/\b(no|not|none)\b[^.]*\b(litigation|lawsuit|proceeding)/.test(L)) put(id, false, x, 0.9); else if (/pending|defendant|filed against|threatened/.test(L)) put(id, true, x, 0.9); continue; }
      if (id === 'taxes_current') { put(id, !/overdue|late|not (been )?filed|unpaid/.test(L), x, 0.9); continue; }
      put(id, positiveWord ? !SF_NEG.test(L) : SF_NEG.test(L), x, 0.9);
    }
    if (/soc ?2/i.test(x.s)) {
      const v = sfSoc(L); if (v) put('soc2', v, x, 0.9);
    }
    if (/raised (list )?prices|price increase|increased prices/.test(L)) put('pricing_move', 'Raised prices', x, 0.75);
    else if (/held prices|prices flat|kept prices/.test(L)) put('pricing_move', 'Held prices', x, 0.75);
    else if (/discount(ed)? (heavily )?to win|discounted heavily/.test(L)) put('pricing_move', 'Discounted to win', x, 0.75);
    else if (/not tested pricing|never tested (our )?pric/.test(L)) put('pricing_move', 'Never tested', x, 0.75);
    if (/\bmoat\b|defensib/.test(L)) {
      const mo = /network effect/.test(L) ? 'Network effects' : /proprietary data/.test(L) ? 'Proprietary data' : /switching cost/.test(L) ? 'High switching costs' : /\bbrand\b/.test(L) ? 'Brand'
        : /patent|proprietary tech/.test(L) ? 'Proprietary technology or patents' : /economies of scale/.test(L) ? 'Economies of scale' : null;
      if (mo) put('moat_type', mo, x, 0.75);
    }
    if (/independent auditor.s report|in our opinion[^.]*present fairly/.test(L)) put('audited_financials', 'Audited', x, 0.95);
    let m;
    if (/very disappointed|sean ellis|tr[eè]s d[eé][cç]us/i.test(x.s) && (m = /\(n\s?=\s?([\d,]+)\)/.exec(x.s))) put('pmf_respondents', +m[1].replace(/,/g, ''), x, 0.8);
    if ((m = /(?:^|[.;:]\s+|\s)([A-Z][\w&.-]+(?: [A-Z][\w&.-]+)?), (?:our|notre) (?:closest|main|primary|principal|biggest) (?:competitor|concurrent)/.exec(x.s))) put('primary_competitor', m[1], x, 0.7);
  }
  /* term sheet clauses */
  const T = text.replace(/\s+/g, ' ');
  let m;
  if ((m = /liquidation(?: preference)?:?\s*(\d+(?:\.\d+)?)\s?x\b([^.\n]{0,80})/i.exec(T))) {
    const src = { loc:'Liquidation preference', s:m[0] };
    put('new_liq_pref', +m[1], src, 1);
    put('new_participating', /participating/i.test(m[2]) && !/non.participating/i.test(m[2]), src, 1);
    const cap = /capped at (\d+(?:\.\d+)?)\s?x/i.exec(m[2]); if (cap) put('new_part_cap', +cap[1], src, 1);
  }
  if (!once.has('new_liq_pref') && (m = /(\d+(?:\.\d+)?)\s?x\s+((?:non[- ])?participating)[^.]{0,40}liquidation preference/i.exec(T))) {
    const src = { loc:'Liquidation preference', s:m[0] }; put('new_liq_pref', +m[1], src, 0.95); put('new_participating', !/non/i.test(m[2]), src, 0.95);
  }
  if ((m = /unallocated option pool equal to (\d+(?:\.\d+)?)\s?%\s*of the post.money/i.exec(T))) put('pool_target_post', +m[1], { loc:'Pre-money valuation', s:m[0] }, 1);
  if ((m = /board shall consist of (\w+) directors?:?([^.]{0,300})/i.exec(T))) {
    const W = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7 }, num = s => W[String(s).toLowerCase()] || +s || 0;
    const c = /(\w+) designated by the holders of common/i.exec(m[2]), i = /(\w+) designated by the (series|preferred|investors)/i.exec(m[2]), ind = /(\w+) independent/i.exec(m[2]);
    const a = c ? num(c[1]) : 0, bb = i ? num(i[1]) : 0, cc = ind ? num(ind[1]) : 0;
    if (a || bb) put('board_after', a > bb + cc ? 'Founders control the board' : bb > a + cc ? 'Investors control the board' : 'Balanced, with an independent director', { loc:'Board of directors', s:m[0] }, 0.8);
  }
}

/* ── computed values (S7 whitelist): cap-table percentages and founders, receivables over 90 days, headcount by function ── */
function sfCalcTable(b, rows, header, hi, fields, byId, add, doc, scale, locale) {
  if (typeof CFG !== 'undefined' && CFG.settings && CFG.settings.smartfill && CFG.settings.smartfill.allowComputed === false) return;
  const H = header ? header.map(h => h.toLowerCase()) : [], num = c => { const n = sfNumbers(c || '', { locale }); return n.length === 1 && !n[0].unit ? n[0].value : null; };
  const comp = (id, value, formula, n) => { const f = byId.get(id); if (f && isFinite(value)) add(f, Math.round(value * 10) / 10, { via:'computed', loc:`${b.loc} (${n} rows)`, snippet:formula.slice(0, 160), label:0.9, struct:0.8, computed:true, raw:formula.slice(0, 60), notes:[`Computed from ${n} rows: ${formula}`] }); };
  const sh = H.findIndex(h => /shares|units|fully diluted/.test(h)), cl = H.findIndex(h => /class|type|security/.test(h));
  if (sh > 0) {
    const data = rows.slice(hi + 1).filter(r => num(r[sh]) != null && !/^total/i.test(r[0]));
    const total = (rows.find(r => /^total/i.test(r[0] || '')) || [])[sh], T = num(total) || data.reduce((s, r) => s + num(r[sh]), 0);
    if (T > 0 && data.length >= 2) {
      const kind = r => (r[0] + ' ' + (cl >= 0 ? r[cl] : '')).toLowerCase();
      const founders = data.filter(r => /founder/.test(kind(r))), inv = data.filter(r => /preferred|investor|series|seed/.test(kind(r)) && !/option/.test(kind(r))), unalloc = data.filter(r => /unallocated|available|unissued/.test(kind(r)));
      if (founders.length) { comp('founders_count', founders.length, `${founders.length} holders marked founder`, data.length); const mx = founders.reduce((m, r) => Math.max(m, num(r[sh])), -Infinity); comp('founder_max_equity', mx / T * 100, `${mx.toLocaleString('en-US')} / ${T.toLocaleString('en-US')} shares`, data.length); }
      if (inv.length) { const s = inv.reduce((a, r) => a + num(r[sh]), 0); comp('prior_investor_pct', s / T * 100, `${s.toLocaleString('en-US')} preferred / ${T.toLocaleString('en-US')} shares`, data.length); }
      if (unalloc.length) { const s = unalloc.reduce((a, r) => a + num(r[sh]), 0); comp('option_pool', s / T * 100, `${s.toLocaleString('en-US')} unallocated / ${T.toLocaleString('en-US')} shares`, data.length); }
    }
  }
  const over = rows.filter(r => /\b(9[1-9]|1[0-2]\d)\s?(-|\u2013|to)\s?\d+\s?days|\b(120|90)\s?\+|over 120|> ?90|more than 90/i.test(r[0] || ''));
  if (over.length) { const vals = over.map(r => num(r[r.length - 1]) ?? num(r[1])).filter(v => v != null); if (vals.length === over.length) comp('ar_over_90', vals.reduce((a, v) => a + v, 0) * (scale || 1), `${over.map(r => r[0]).join(' + ')}`, over.length); }
  const hc = H.findIndex(h => /headcount|fte|employees/.test(h));
  if (hc > 0 && !rows.some(r => /^total/i.test(r[0] || ''))) {
    const data = rows.slice(hi + 1).filter(r => num(r[hc]) != null && Number.isInteger(num(r[hc])) && num(r[hc]) < 1e5 && !/cost|average|avg|salary|comp|burn|margin|cash|spend|arr/i.test(r[0] || '') && !SF_NOT_ACTUAL.test(r[0] || ''));
    if (data.length >= 3 && !data.some(r => sfPeriodT(r[0]))) comp('headcount_now', data.reduce((a, r) => a + num(r[hc]), 0), `${data.map(r => r[0]).join(' + ')}`, data.length);
  }
}

/* ── scoring and tiers (E6): label strength x structure, then caps by document role, unit conversion, approximation, footnotes, currency ── */
function sfScore(c, fld, dict) {
  let s = c.label * (c.struct || 1), why = [`label ${Math.round(c.label * 100)}%`, `structure ${Math.round((c.struct || 1) * 100)}%`], cap = 1;
  const own = sfOwn(), th = Object.assign({ high:0.82, medium:0.62, low:0.45 }, own.thresholds || {});
  if (c.approx) { cap = Math.min(cap, th.high - 0.01); why.push('approximate ("about", "~")'); }
  if (c.foot) { cap = Math.min(cap, th.high - 0.01); why.push('a footnote qualifies the figure'); }
  if (c.computed) { cap = Math.min(cap, th.high - 0.01); why.push('computed'); }
  if (c.converted) { cap = Math.min(cap, th.high - 0.01); why.push('unit converted'); }
  if (c.narrativeCap) { cap = Math.min(cap, th.high - 0.01); why.push('read from a narrative document'); }
  if (c.bound) { cap = Math.min(cap, th.medium - 0.01); why.push('a bound ("at least", "over", "<"), not a point value'); }
  if (c.foreign) { cap = Math.min(cap, th.medium - 0.01); why.push(`currency is ${c.ccy}: not converted`); }
  s = Math.min(s, cap);
  return { score:Math.round(s * 1000) / 1000, tier:s >= th.high ? 'High' : s >= th.medium ? 'Medium' : s >= th.low ? 'Low' : null, why };
}
const sfOwn = () => (typeof CFG !== 'undefined' && CFG && CFG.settings && CFG.settings.smartfill) || {};

/* ── the fields Smart fill can fill: read from the form at run time (S10) ── */
function sfFields(model) {
  const dict = sfDict(), out = [];
  const hidden = new Set(((typeof CFG !== 'undefined' && CFG && CFG.hidden && CFG.hidden.inputs) || []));
  for (const f of ALL_FIELDS()) {
    if (hidden.has(f.id) || (f.models && model && !f.models.includes(model))) continue;
    const d = dict.get(f.id) || { id:f.id, syn:[], neg:[], lo:-Infinity, hi:Infinity, must:[], claim:'', prior:'', narrative:false, skip:false };
    const label = typeof labelOf === 'function' ? labelOf(f) : f.lbl;
    const syn = d.syn.includes(sfNorm(label)) || /as stated/i.test(f.lbl) ? d.syn : d.syn.concat(sfNorm(label));
    out.push({ id:f.id, t:f.t, unit:f.unit || '', options:f.options, lbl:label, syn, neg:d.neg, must:d.must, d });
  }
  return out;
}

/* ── one document to proposals: route claims (S6), one value per field, one number per field ── */
function sfExtract(res, opts) {
  opts = opts || {};
  const doc = res.doc, cls = opts.as ? Object.assign({}, sfClassify(doc), { type:opts.as, role:(SF_TYPES.find(t => t.id === opts.as) || {}).role || 'unknown' }) : sfClassify(doc);
  const fields = sfFields(opts.model || 'saas').filter(f => !f.d.skip), byId = new Map(fields.map(f => [f.id, f]));
  const { cands, rejects, locale, ccy, notes:readNotes } = sfCandidates(doc, cls, fields, opts);
  const narrative = cls.role === 'deck';
  const scored = [];
  for (const c of cands) {
    let fld = byId.get(c.field); if (!fld) continue;
    if (narrative && fld.d.claim && byId.get(fld.d.claim)) { c.evidenceField = fld.id; fld = byId.get(fld.d.claim); c.field = fld.id; c.notes = (c.notes || []).concat(['a company claim: filled as stated']); }
    else if (narrative && !fld.d.narrative && !/^stated_/.test(fld.id) && !(cls.type === 'market' && fld.d.narrative)) c.narrativeCap = true;
    if (cls.role === 'unknown') c.narrativeCap = true;
    if (cls.type === 'audited' && fld.unit === '$') { c.label = Math.min(c.label, 0.5); c.notes = (c.notes || []).concat(['a year-end statement: an older period, shown as a cross-check']); }
    const sc = sfScore(c, fld); if (!sc.tier) continue;
    scored.push(Object.assign(c, sc, { tag:SF_ROLE_TAG[cls.role] || '' }));
  }
  /* best per field (score, then document order); a number fills one field only */
  scored.sort((a, b) => b.score - a.score || (a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0) || (a.field < b.field ? -1 : 1));
  const used = new Set(), byField = new Map();
  for (const c of scored) {
    if (byField.has(c.field)) { const top = byField.get(c.field); if (top.alts.length < 5) top.alts.push(c); continue; }   /* the 5 best others: a long file can hold thousands */
    const key = c.loc + '|' + c.raw;
    if (typeof c.value === 'number' && used.has(key) && !c.computed) continue;
    used.add(key); c.alts = []; byField.set(c.field, c);
  }
  const below = scored.length ? [] : []; cands.filter(c => !scored.includes(c)).forEach(c => rejects.push({ field:c.field, why:'found, but below the confidence threshold', snippet:String(c.snippet || '').slice(0, 120) }));
  return { file:res.file, kind:doc.kind, cls, locale, ccy, date:sfDocDate(doc), proposals:[...byField.values()], rejects, notes:(doc.notes || []).concat(readNotes), ledger:cls.type === 'ledger' };
}
/* numbers in one document that look meaningful but match no field (the review lists the 40 most plausible across files) */
function sfUnmappedDoc(res, e, fields) {
  const out = [];
  if (!res || !res.ok || !res.doc || !e) return out;
  for (const b of res.doc.blocks) {
    const pairs = b.type === 'kv' ? [[b.rows[0][0], b.rows[0][1]]] : b.type === 'table' ? b.rows.filter(r => r.length >= 2 && r[0] && !/\d/.test(r[0])).map(r => [r[0], r.slice(1).find(c => /\d/.test(c)) || '']) : [];
    for (const [l, v] of pairs) {
      if (!v || out.length > 400) continue;
      const n = sfNumbers(v); if (n.length !== 1 || sfMatch(l, fields, '')) continue;
      if (e.proposals.some(p => p.raw === v.trim())) continue;
      out.push({ label:l.slice(0, 80), raw:v.slice(0, 40), value:n[0].value, unit:n[0].unit, file:e.file, loc:b.loc, w:(n[0].unit ? 2 : 0) + (Math.abs(n[0].value) >= 1000 ? 1 : 0) });
    }
  }
  return out;
}
/* S13: why an empty field stayed empty */
function sfWhyEmpty(id, resolved, extracts, model) {
  const f = ALL_FIELDS().find(x => x.id === id);
  if (f && f.models && model && !f.models.includes(model)) return 'not used for this business model';
  const d = sfDict().get(id); if (d && d.skip) return 'your own assumption: documents never fill it';
  if (resolved.conflicts.some(c => c.field === id)) return 'two documents disagree (see Conflicts)';
  const r = extracts.flatMap(e => (e.rejects || []).filter(x => x.field === id).map(x => Object.assign({ file:e.file }, x)));
  if (r.length) return `${r[0].why} (${r[0].file}: "${r[0].snippet}")`;
  return 'no candidate in the documents read';
}
