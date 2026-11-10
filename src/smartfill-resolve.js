/* ═══════════════════════════════════════════════════════════════
   SMART FILL: RESOLUTION, CHECKS, APPLY (E7 to E9). Across documents:
   one value per field, the more reliable source first, two confident
   sources that disagree make a Conflict (and fill nothing), and the
   proposed values are checked against each other before anything is
   written. Writing needs the review screen; one click undoes it.
   ═══════════════════════════════════════════════════════════════ */
const SF_ROLE_RANK = { bank:6, audited:5, export:4, model:3, deck:2, unknown:1 };
const SF_TIER_RANK = { High:3, Medium:2, Low:1 };
/* the newest date a document mentions (statement period, "as of", e-mail date): older documents give way */
function sfDocDate(doc) {
  let best = '';
  for (const b of doc.blocks.slice(0, 400)) {
    const t = (b.text || '') + ' ' + (b.rows ? b.rows.slice(0, 30).map(r => r.join(' ')).join(' ') : '');
    for (const m of t.matchAll(/\b(20\d\d)-(\d\d)(?:-(\d\d))?\b/g)) { const d = `${m[1]}-${m[2]}`; if (d > best && +m[2] >= 1 && +m[2] <= 12) best = d; }
  }
  if (!best) for (const b of doc.blocks.slice(0, 400)) {   /* no dated line: the latest period marked actual ("FY2024 (actual)", "2025A") */
    const t = (b.text || '') + ' ' + (b.rows ? b.rows.slice(0, 3).map(r => r.join(' ')).join(' ') : '');
    for (const m of t.matchAll(/\b(?:fy\s?)?(20\d\d)\s?(?:\(actual\)|actual|a\b)/gi)) { const d = `${m[1]}-12`; if (d > best) best = d; }
  }
  return best;
}
const sfMonths = (a, b) => a && b ? (+a.slice(0, 4) - +b.slice(0, 4)) * 12 + (+a.slice(5, 7) - +b.slice(5, 7)) : 0;
const sfSame = (a, b, f) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= (f.unit === '%' ? 1 : Math.max(Math.abs(a), Math.abs(b)) * 0.02) : String(a).toLowerCase() === String(b).toLowerCase();

/* extracts: one sfExtract result per document. Returns the proposal set the review screen shows. */
function sfResolveAll(extracts, model) {
  const fields = sfFields(model || 'saas'), byId = new Map(fields.map(f => [f.id, f]));
  const newest = extracts.map(e => e.date || '').sort().pop() || '';
  const all = [];
  for (const e of extracts) for (const p of e.proposals) {
    const c = Object.assign({}, p, { file:e.file, docType:e.cls.type, role:e.cls.role, date:e.date || '' });
    if (newest && c.date && sfMonths(newest, c.date) > 6 && c.tier !== 'Low') { c.tier = 'Low'; c.why = (c.why || []).concat([`an older document (${c.date}, the newest is ${newest})`]); }
    all.push(c);
  }
  const groups = new Map(); for (const c of all) { if (!groups.has(c.field)) groups.set(c.field, []); groups.get(c.field).push(c); }
  const rows = [], conflicts = [];
  for (const [id, cs] of [...groups.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    const f = byId.get(id); if (!f) continue;
    cs.sort((a, b) => SF_TIER_RANK[b.tier] - SF_TIER_RANK[a.tier] || (SF_ROLE_RANK[b.role] || 0) - (SF_ROLE_RANK[a.role] || 0) || b.score - a.score || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || (a.loc < b.loc ? -1 : 1));
    const top = cs[0], rivals = cs.slice(1).filter(c => c.tier === 'High' && top.tier === 'High' && !sfSame(c.value, top.value, f) && c.role === top.role);
    if (rivals.length) { conflicts.push({ field:id, label:f.lbl, sources:[top, ...rivals] }); continue; }   /* two confident sources of the same standing disagree: fill neither */
    const agree = cs.slice(1).filter(c => sfSame(c.value, top.value, f) && c.file !== top.file);
    const differ = cs.slice(1).filter(c => !sfSame(c.value, top.value, f) && c.tier !== 'Low');
    const row = Object.assign({}, top, { label:f.lbl, unit:f.unit, t:f.t, agree:agree.map(c => c.file), alts:cs.slice(1).map(c => ({ value:c.value, file:c.file, loc:c.loc, tier:c.tier, role:c.role })) });
    if (agree.length && row.tier === 'Medium' && !row.foreign && !row.computed) { row.tier = 'High'; row.why = (row.why || []).concat([`${agree.length + 1} documents agree`]); }
    if (differ.length) row.why = (row.why || []).concat([`${differ.length} other value${differ.length > 1 ? 's' : ''} in ${[...new Set(differ.map(c => c.file))].length} document${differ.length > 1 ? 's' : ''}: a ${SF_ROLE_RANK[top.role] > SF_ROLE_RANK[differ[0].role] ? 'more reliable' : 'stronger'} source was kept`]);
    rows.push(row);
  }
  /* one number fills one field (a claim and its evidence field excepted) */
  const seen = new Map();
  for (const r of rows.slice().sort((a, b) => SF_TIER_RANK[b.tier] - SF_TIER_RANK[a.tier] || b.score - a.score)) {
    if (typeof r.value !== 'number' || r.computed) continue;
    const k = `${r.file}|${r.loc}|${r.raw}`, prev = seen.get(k);
    if (prev && !(/^stated_/.test(prev.field) !== /^stated_/.test(r.field))) r.drop = true; else seen.set(k, r);
  }
  const kept = rows.filter(r => !r.drop);
  sfCrossCheck(kept, byId);
  return { rows:kept, conflicts, newest };
}

/* E8: the proposed values must agree with each other before anything is written; a failed check lowers the tier and says why.
   A difference between a claim (as stated) and its evidence is not a failure: it is the point of the review. */
function sfCrossCheck(rows, byId) {
  const v = id => { const r = rows.find(x => x.field === id); return r && typeof r.value === 'number' ? r.value : null; };
  const flag = (ids, why) => ids.forEach(id => { const r = rows.find(x => x.field === id); if (!r) return; r.inconsistent = (r.inconsistent || []).concat([why]); if (r.tier === 'High') r.tier = 'Medium'; });
  const t1 = v('top1_pct'), t5 = v('top5_pct'), t10 = v('top10_pct');
  if (t1 != null && t5 != null && t1 > t5) flag(['top1_pct', 'top5_pct'], 'the largest customer share is above the top-5 share');
  if (t5 != null && t10 != null && t5 > t10) flag(['top5_pct', 'top10_pct'], 'the top-5 share is above the top-10 share');
  const a0 = v('arr_12mo'), a1 = v('arr_now'), n = v('new_arr_l12'), x = v('expansion_arr_l12'), ch = v('churned_arr_l12'), co = v('contraction_arr_l12');
  if ([a0, a1, n, x, ch, co].every(z => z != null) && a1 > 0) {
    const implied = a0 + n + x - ch - co;
    if (Math.abs(implied - a1) / a1 > 0.03) flag(['arr_now', 'arr_12mo', 'new_arr_l12', 'expansion_arr_l12', 'churned_arr_l12', 'contraction_arr_l12'], `the ARR movements do not add up (${Math.round(implied).toLocaleString('en-US')} against ${Math.round(a1).toLocaleString('en-US')})`);
  }
  for (const r of rows) {
    const f = byId.get(r.field);
    if (f && f.unit === '%' && typeof r.value === 'number' && !/margin|contrib/.test(r.field) && (r.value < 0 || r.value > (r.field === 'stated_nrr' || r.field === 'quota_attainment' ? 400 : 100))) flag([r.field], 'a percentage outside 0 to 100');
  }
  const c0 = v('customers_12mo'), c1 = v('customers_now'), lost = v('logos_lost_l12');
  if (c0 != null && c1 != null && lost != null && c1 < c0 - lost) flag(['customers_now', 'customers_12mo', 'logos_lost_l12'], 'fewer customers today than a year ago minus the logos lost');
  const hc = v('headcount_now'), he = v('headcount_eng'), hs = v('headcount_sales');
  if (hc != null && he != null && hs != null && he + hs > hc) flag(['headcount_now', 'headcount_eng', 'headcount_sales'], 'engineering plus sales is more than the whole team');
  const nb = v('net_burn'), gb = v('gross_burn');
  if (nb != null && gb != null && nb > gb * 1.02) flag(['net_burn', 'gross_burn'], 'net burn above gross burn');
}

/* E9: write the ticked rows to the form. Values the user typed stay unless the row says "overwrite"; values from the ledger
   or the monthly financials are never replaced. One snapshot is kept for undo. */
let _sfUndo = null;
const SF_EVID = { export:'export', model:'model', deck:'deck', bank:'bank', audited:'audited', unknown:'' };
function sfApply(rows) {
  const snap = { vals:{}, bools:{}, sel:{}, prov:{}, evid:{} }, done = [], skipped = [];
  for (const r of rows) {
    const id = r.field, f = ALL_FIELDS().find(x => x.id === id); if (!f) continue;
    const p = S.prov[id], typed = S.vals[id] != null && S.vals[id] !== '' && !(p && p.src === 'smartfill');
    if (p && (p.src === 'ledger' || p.src === 'series')) { skipped.push([id, 'from the ledger']); continue; }
    if ((typed || (f.t === 'bool' && id in S.bools && !(p && p.src === 'smartfill')) || (f.t === 'select' && S.sel[id] && !(p && p.src === 'smartfill'))) && !r.overwrite) { skipped.push([id, 'you typed a value']); continue; }
    for (const k of ['vals', 'bools', 'sel', 'prov', 'evid']) if (!(id in snap[k])) snap[k][id] = S[k][id] === undefined ? null : JSON.parse(JSON.stringify(S[k][id]));
    if (f.t === 'bool') S.bools[id] = !!r.value; else if (f.t === 'select') S.sel[id] = String(r.value); else S.vals[id] = typeof r.value === 'number' ? String(+r.value.toFixed(6)) : String(r.value).slice(0, 200);
    S.prov[id] = { src:'smartfill', file:String(r.file).slice(0, 120), loc:String(r.loc || '').slice(0, 80), line:String(r.snippet || '').slice(0, 160), conf:r.tier, why:(r.why || []).join('; ').slice(0, 160) };
    S.evid[id] = r.evid != null ? r.evid : (SF_EVID[r.role] || '');
    done.push(id);
  }
  if (done.length) _sfUndo = snap;
  saveDraft(); updateProgress();
  return { done, skipped };
}
function sfUndo() {
  if (!_sfUndo) return 0;
  let n = 0;
  for (const k of ['vals', 'bools', 'sel', 'prov', 'evid']) for (const [id, v] of Object.entries(_sfUndo[k])) { if (v === null) delete S[k][id]; else S[k][id] = v; if (k === 'vals') n++; }
  _sfUndo = null; saveDraft(); updateProgress();
  return n;
}
