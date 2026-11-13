/* ═══════════════════════════════════════════════════════════════
   SMART FILL: THE SCREEN. Drop zone, guide and coverage on the source
   material page; a review page where every proposed value shows where
   it was read and why; apply, undo and forget. Nothing runs until
   "Read my documents" is pressed, and document text stays in memory.
   ═══════════════════════════════════════════════════════════════ */
const SF_DEFAULT_ON = true;   /* on for everyone (S2); the owner can hide it in the Studio (Site > Smart fill) */
const SFS = { files:[], extracts:[], resolved:null, reading:false, cancel:false, rate:{}, unmapped:[] };
const sfEnabled = () => { const o = sfOwn(); return o.enabled != null ? !!o.enabled : SF_DEFAULT_ON; };
/* the document types of the guide: what each is called, its formats, the fields it fills (the owner edits the names and words in the Studio) */
const SF_GUIDE = [
  ['ledger', 'Customer revenue ledger', 'customer-ledger.csv, MRR_by_customer.xlsx', 'CSV, XLSX', 'arr_now arr_12mo new_arr_l12 expansion_arr_l12 churned_arr_l12 contraction_arr_l12 customers_now customers_12mo logos_lost_l12 top1_pct top5_pct top10_pct'],
  ['financials', 'Monthly financials', 'monthly-financials.csv', 'CSV, XLSX', 'cash_on_hand net_burn gross_burn headcount_now'],
  ['deck', 'Pitch deck', 'pitch-deck.pdf, Investor_Presentation.pptx', 'PDF, PPTX, MD, TXT, HTML', 'stated_arr stated_nrr stated_growth stated_customers stated_tam round_size primary_competitor why_now'],
  ['model', 'Financial model, P&L or ARR bridge', 'financial-model.xlsx, p-and-l.csv', 'XLSX, CSV, PDF', 'arr_now arr_12mo new_arr_l12 expansion_arr_l12 churned_arr_l12 contraction_arr_l12 gross_margin cogs_hosting cogs_support sm_spend_l12 net_burn gross_burn deferred_revenue cash_on_hand'],
  ['update', 'Investor update or CFO reply', 'investor-update.eml, cfo-reply.docx', 'EML, MD, TXT, DOCX, PDF', 'cash_on_hand net_burn gross_burn stated_runway headcount_now stated_nrr'],
  ['captable', 'Cap table', 'cap-table.xlsx', 'XLSX, CSV', 'prior_investor_pct founder_max_equity founders_count option_pool safes_outstanding safe_cap safe_discount notes_principal notes_rate notes_cap notes_discount total_raised'],
  ['termsheet', 'Term sheet', 'term-sheet.docx', 'DOCX, PDF, MD, TXT', 'round_size round_pre_money pool_target_post new_liq_pref new_participating new_part_cap anti_dilution board_after cumulative_dividends redemption_rights pay_to_play pro_rata_rights information_rights board_seat'],
  ['bank', 'Bank statement or bank letter', 'bank-statement.pdf', 'PDF, CSV', 'cash_on_hand'],
  ['receivables', 'Receivables aging and deferred revenue', 'ar-aging.xlsx', 'XLSX, CSV, PDF', 'ar_over_90 deferred_revenue'],
  ['crm', 'Sales pipeline export', 'pipeline-export.csv', 'CSV, XLSX', 'pipeline_coverage win_rate sales_cycle quota_attainment'],
  ['headcount', 'Headcount by function', 'headcount.csv', 'CSV, XLSX', 'headcount_now headcount_eng headcount_sales avg_loaded_comp'],
  ['security', 'Security, legal and compliance summary', 'security-legal-summary.pdf', 'PDF, DOCX, MD', 'soc2 uptime_90d p1_incidents ip_assignments litigation dpas_signed oss_reviewed insurance_dno valuation_409a taxes_current'],
  ['market', 'Survey, NPS, market or reference-call notes', 'customer-research.md', 'MD, DOCX, PDF, CSV', 'nps pmf_very_disappointed pmf_respondents win_rate_vs_primary target_accounts reachable_pct primary_competitor pricing_move moat_type'],
  ['audited', 'Audited or reviewed financial statements', 'audited-financials.pdf', 'PDF, XLSX', 'audited_financials'],
  ['metrics', 'Metrics export (JSON or CSV)', 'metrics-export.json', 'JSON, CSV', 'arr_now arr_12mo customers_now gross_margin logos_lost_l12'],
].map(([id, name, names, formats, fills]) => ({ id, name, names, formats, fills:fills.split(' ') }));
const sfGuide = () => { const o = sfOwn().docTypes || {}; return SF_GUIDE.map(g => Object.assign({}, g, o[g.id] && o[g.id].name ? { name:o[g.id].name } : {})); };

/* ── the block on the source material page ── */
function renderSfIntake() {
  const el = $id('sf-intake'); if (!el) return;
  if (!sfEnabled()) { setHTML(el, ''); return; }
  const n = SFS.files.length;
  setHTML(el, `<div class="block-title">Smart fill · reads your documents in this browser, no AI</div>
    <div class="intake-grid sf-grid">
      <div class="intake-box">
        <h3>Drop everything here</h3>
        <p>Decks, models, term sheets, cap tables, bank letters, updates and exports, or a .zip of the data room. Nothing is uploaded: the documents are read in this browser and forgotten when you close the tab.</p>
        <div class="drop-zone" id="sf-drop" tabindex="0" role="button" aria-describedby="sf-drop-hint">Drop files, a folder or a .zip here, or press Enter to choose files</div>
        <div class="field-hint" id="sf-drop-hint">Up to ${SF_LIMIT.files} files, 25 MB each. PDF, Word, PowerPoint, Excel, OpenDocument, e-mail, CSV, JSON, HTML, RTF and text.</div>
        <div class="sf-actions">
          <button class="btn btn-primary" id="sf-read" data-click="sfRead" ${n && !SFS.reading ? '' : 'disabled'}>Read my documents</button>
          ${SFS.reading ? '<button class="btn btn-ghost" data-click="sfCancel">Cancel</button>' : ''}
          ${SFS.resolved ? '<button class="btn btn-ghost" data-click="sfReview">Review proposals</button>' : ''}
          ${typeof _sfUndo !== 'undefined' && _sfUndo ? '<button class="btn btn-ghost" data-click="sfUndoClick">Undo last Smart fill</button>' : ''}
          ${n ? '<button class="btn btn-ghost" data-click="sfForget">Forget documents</button>' : ''}
        </div>
        <ul class="sf-files" id="sf-files" aria-live="polite">${SFS.files.map(sfChipHTML).join('')}</ul>
      </div>
      <div class="intake-box sf-guide" id="sf-guide">${sfGuideHTML()}</div>
    </div>`);
}
const SF_TYPE_NAME = id => (sfGuide().find(g => g.id === id) || { name:id === 'unknown' ? 'Not recognised' : id }).name;
function sfChipHTML(f, i) {
  const r = f.res, st = f.status || 'waiting', tiers = f.extract ? f.extract.proposals.reduce((a, p) => (a[p.tier] = (a[p.tier] || 0) + 1, a), {}) : {};
  const cls = f.extract && f.extract.cls, size = r && r.doc ? (r.doc.pages ? `${r.doc.pages} page${r.doc.pages > 1 ? 's' : ''}` : r.doc.sheets ? `${r.doc.sheets} sheet${r.doc.sheets > 1 ? 's' : ''}` : r.doc.slides ? `${r.doc.slides} slides` : '') : '';
  return `<li class="sf-chip${r && !r.ok ? ' bad' : ''}">
    <div class="sf-chip-h"><b>${esc(f.name)}</b> <span class="field-hint">${esc(sfSize(f.size))}${size ? ' · ' + esc(size) : ''}</span>
      <button class="btn btn-ghost btn-sm" data-click="sfRemove" data-a="#${i}" aria-label="Remove ${esc(f.name)}">×</button></div>
    ${r && !r.ok ? `<div class="sf-why"><b>Could not read it.</b> ${esc(r.why[0])} <span class="field-hint">Fix: ${esc(r.why[1])}</span></div>` : ''}
    ${st === 'reading' ? '<div class="field-hint">Reading…</div>' : ''}
    ${cls ? `<div class="sf-chip-row">
      <span class="pill">${esc(SF_TYPE_NAME(cls.type))} · ${esc(cls.conf.toLowerCase())} confidence</span>
      <span class="field-hint">${f.extract.proposals.length} value${f.extract.proposals.length === 1 ? '' : 's'} found${tiers.High ? `, ${tiers.High} high` : ''}${f.extract.ledger ? ' · a customer ledger: loaded in the ledger box above' : ''}</span>
      <label class="field-hint">Read as <select class="mini-sel" data-change="sfReadAs" data-a="#${i}"><option value="">${esc(SF_TYPE_NAME(cls.type))} (detected)</option>${sfGuide().map(g => `<option value="${esc(g.id)}"${f.as === g.id ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      <label class="field-hint">Evidence <select class="mini-sel" data-change="sfTag" data-a="#${i}">${EVIDENCE.map(e => `<option value="${esc(e.id)}"${(f.tag != null ? f.tag : SF_EVID[cls.role] || '') === e.id ? ' selected' : ''}>${esc(e.label)}</option>`).join('')}</select></label>
    </div>` : ''}</li>`;
}
const sfSize = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

/* the guide: what to drop, the state of each document type, coverage per section and the best next document */
function sfGuideHTML() {
  const g = sfGuide(), byType = {};
  SFS.files.forEach(f => { const t = f.as || (f.extract && f.extract.cls.type); if (t) (byType[t] ||= []).push(f); });
  const cov = sfCoverage(), next = sfBestNext(cov);
  return `<h3>What can I drop?</h3>
    <details class="sf-what"><summary>Formats</summary>
      <p><b>Best:</b> the original exports. Excel, CSV, PDF made by the software that wrote it, Word, PowerPoint, JSON from your billing or analytics tool.</p>
      <p><b>Good:</b> Markdown, text, e-mails (.eml), web pages saved as .html, RTF, OpenDocument, a .zip of the data room, pasted text.</p>
      <p><b>Cannot read:</b> scanned PDFs and pictures (no OCR offline: export the original or paste the text); old .xls, .doc and .ppt (Save As the new format); password-protected files (save a copy without the password); links to Google Docs, Notion, Drive or DocSend (download the file, VCR2 never fetches the web); .pages, .numbers and .key (export to PDF or Office).</p>
    </details>
    <div class="sf-cov" aria-label="Coverage of the evidence form">${cov.map(c => `<div class="sf-cov-row"><span>${esc(c.title)}</span><span class="m">${c.filled} of ${c.total}</span><span class="sf-bar" aria-hidden="true"><i style="width:${c.total ? Math.round(c.filled / c.total * 100) : 0}%"></i></span>${next[c.id] ? `<span class="field-hint">Best next: ${esc(next[c.id].name)}</span>` : ''}</div>`).join('')}</div>
    <details class="sf-types"><summary>Document types (${Object.keys(byType).length} of ${g.length} provided)</summary>
      <ul>${g.map(t => { const fs = byType[t.id] || [], found = fs.reduce((a, f) => a + (f.extract ? f.extract.proposals.length : 0), 0), bad = fs.filter(f => f.res && !f.res.ok);
        return `<li><b>${esc(t.name)}</b> <span class="field-hint">${esc(t.formats)} · e.g. ${esc(t.names)}</span> <span class="pill">${fs.length ? (bad.length ? `could not read: ${esc(bad[0].res.why[0])}` : `read, ${found} field${found === 1 ? '' : 's'} found`) : 'not provided'}</span></li>`; }).join('')}</ul>
    </details>
    <div class="sf-actions"><button class="btn btn-ghost btn-sm" data-click="sfChecklist">Documents to bring (printable)</button><button class="btn btn-ghost btn-sm" data-click="sfAddRequests">Add missing documents to the request list</button></div>`;
}
/* coverage per form section: fields with a value against the fields documents can fill (assumptions and other business models left out) */
function sfCoverage() {
  const dict = sfDict();
  return SECTIONS.map(s => {
    const fs = visibleFields(s).filter(f => !(dict.get(f.id) || {}).skip);
    const filled = fs.filter(f => f.t === 'bool' ? f.id in S.bools : f.t === 'select' ? !!S.sel[f.id] : S.vals[f.id] != null && S.vals[f.id] !== '').length;
    return { id:s.id, title:s.label || s.title || s.id, filled, total:fs.length, empty:fs.filter(f => !(f.t === 'bool' ? f.id in S.bools : f.t === 'select' ? !!S.sel[f.id] : S.vals[f.id] != null && S.vals[f.id] !== '')).map(f => f.id) };
  }).filter(c => c.total);
}
/* for each section with gaps: the document type not yet provided that would fill the most of its empty fields */
function sfBestNext(cov) {
  const have = new Set(SFS.files.map(f => f.as || (f.extract && f.extract.cls.type)).filter(Boolean)), out = {};
  if (S.ledger) have.add('ledger'); if (S.series) have.add('financials');
  cov.forEach(c => {
    if (!c.empty.length) return;
    let best = null; sfGuide().forEach(t => { if (have.has(t.id)) return; const n = t.fills.filter(id => c.empty.includes(id)).length; if (n && (!best || n > best.n)) best = { name:t.name, n, id:t.id }; });
    if (best) out[c.id] = best;
  });
  return out;
}

/* ── files in: drop, folder, zip, file picker ── */
function sfAddFiles(list) {
  for (const f of list) {
    if (SFS.files.length >= SF_LIMIT.files) { toast(`Smart fill reads up to ${SF_LIMIT.files} files at a time. The rest were left out.`, 'err'); break; }
    if (SFS.files.some(x => x.name === f.name && x.size === f.size)) continue;
    SFS.files.push({ name:f.webkitRelativePath || f.name, size:f.size, file:f });
  }
  SFS.resolved = null; renderSfIntake();
}
async function sfEntries(items) {   /* a dropped folder: every file inside, depth first, up to the file limit */
  const out = [], walk = async e => {
    if (!e || out.length >= SF_LIMIT.files) return;
    if (e.isFile) { await new Promise(r => e.file(f => { out.push(f); r(); }, r)); return; }
    if (e.isDirectory) { const rd = e.createReader(); let batch; do { batch = await new Promise(r => rd.readEntries(r, () => r([]))); for (const x of batch) await walk(x); } while (batch.length && out.length < SF_LIMIT.files); }
  };
  for (const it of items) await walk(it.webkitGetAsEntry ? it.webkitGetAsEntry() : null);
  return out;
}
function sfWireDrop() {
  const dz = $id('sf-drop'); if (!dz || dz.dataset.wired) return; dz.dataset.wired = '1';
  const pick = () => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.onchange = () => sfAddFiles(i.files); i.click(); };
  dz.addEventListener('click', pick);
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', async e => {
    const items = e.dataTransfer.items ? [...e.dataTransfer.items].filter(x => x.kind === 'file') : [];
    const folder = items.some(x => x.webkitGetAsEntry && x.webkitGetAsEntry() && x.webkitGetAsEntry().isDirectory);
    sfAddFiles(folder ? await sfEntries(items) : e.dataTransfer.files);
  });
}

/* ── read: one file after the other, yielding between them so the page stays responsive; Cancel stops after the current file ── */
async function sfRead() {
  if (SFS.reading || !SFS.files.length) return;
  SFS.reading = true; SFS.cancel = false; renderSfIntake();
  await sfWorkerContext();
  for (const [i, f] of SFS.files.entries()) {
    if (SFS.cancel) break;
    if (f.res && f.extract && !f.dirty) continue;
    f.status = 'reading'; renderSfIntake();
    await new Promise(r => setTimeout(r, 0));
    const u8 = f.u8 || new Uint8Array(await f.file.arrayBuffer()); f.u8 = u8;
    if (!await sfReadInWorker(f, u8)) {
      f.inWorker = false;
      f.res = await sfReadFile(u8, f.name.split('/').pop());
      await sfYield();   /* reading and extracting run as separate tasks, so the page stays responsive */
      f.extract = null; f.children = null;
      try {
        if (f.res.ok && f.res.children) f.children = f.res.children.filter(c => c.ok && c.doc).map(c => sfExtract(c, { model:S.model }));
        else if (f.res.ok) f.extract = sfExtract(f.res, { model:S.model, as:f.as || null });
        f.unmapped = f.extract ? sfUnmappedDoc(f.res, f.extract, sfFields(S.model)) : [];
      } catch (e) {   /* one file that cannot be read never stops the others (S8) */
        f.extract = null; f.children = null; f.unmapped = [];
        f.res = { file:f.res.file, size:f.res.size, kind:f.res.kind, ok:false, code:'unknown', why:SF_WHY.unknown, detail:String((e && e.message) || e).slice(0, 160) };
      }
    }
    f.status = 'done'; f.dirty = false;
  }
  SFS.reading = false;
  if (!SFS.cancel) await sfLoadStructured();
  await sfYield(); sfResolveNow();
  renderSfIntake();
  if (!SFS.cancel && SFS.resolved) { await sfYield(); renderSfReview(); await sfYield(); showPage('sfreview'); }
}
const sfYield = () => new Promise(r => setTimeout(r, 0));
/* A customer ledger or monthly financials dropped here also goes into its own box on this page, as if dropped there:
   the analyses it unlocks run, and it fills the form fields that are still empty. One file of each kind; a loaded one stays. */
async function sfLoadStructured() {
  for (const f of SFS.files) {
    if (!f.file || !f.extract || !/\.(csv|tsv|txt|xlsx|xlsm)$/i.test(f.file.name)) continue;
    const ledger = !!f.extract.ledger; if (ledger ? S.ledger : S.series) continue;
    /* monthly financials are small and say so in their first row (column names, or months across): anything else is not
       parsed here, on the page (a 150,000-row bank export would block it) */
    if (!ledger) {
      if (f.file.size > 1e6) continue;
      if (!SHEET_EXT.test(f.file.name)) {
        const head = (await f.file.slice(0, 4096).text()).split(/\r?\n/)[0].split(/[,;\t]/).map(h => h.replace(/\(.*?\)|\$|usd|"/gi, '').trim());
        if (!head.some(h => Object.values(SERIES_COLS).some(re => re.test(seriesFold(h)))) && head.filter(h => parseMonth(h)).length < 3) continue;
      }
    }
    let text;
    try { text = SHEET_EXT.test(f.file.name) ? (await sheetFileToCSV(f.file, ledger ? 'ledger' : 'series')).csv : await f.file.text(); } catch (e) { continue; }
    if (ledger) { loadLedgerText(text, f.name); continue; }
    const r = parseSeries(text); if (!r.ok) continue;
    if (['cash', 'burn', 'expenses', 'headcount', 'revenue'].filter(k => r.series[k].some(v => v != null)).length >= 2 && Object.keys(seriesPrimitives(r.series)).length) loadSeriesText(text, f.name);
  }
}
function sfResolveNow() {
  const ex = []; SFS.files.forEach(f => { if (f.extract) ex.push(sfTagged(f.extract, f.tag)); (f.children || []).forEach(c => ex.push(c)); });
  SFS.extracts = ex; SFS.resolved = ex.length ? sfResolveAll(ex, S.model) : null;
  SFS.unmapped = sfUnmapped();
}
const sfTagged = (e, tag) => tag == null ? e : Object.assign({}, e, { proposals:e.proposals.map(p => Object.assign({}, p, { evid:tag })) });
function sfCancel() { SFS.cancel = true; toast('Reading stops after the current file.'); }
function sfRemove(i) { const f = SFS.files[i]; if (f && f.inWorker) sfWorkerAsk({ op:'drop', id:f.wid }); SFS.files.splice(i, 1); sfResolveNow(); renderSfIntake(); }
async function sfReadAs(i, v) {
  const f = SFS.files[i]; if (!f) return; f.as = v || null; f.dirty = true;
  if (f.res && f.res.ok && !f.res.children) {
    if (f.inWorker) { const r = await sfWorkerAsk({ op:'extract', id:f.wid, model:S.model, as:f.as }); if (r.err || r.page) { f.inWorker = false; f.res = null; f.extract = null; f.status = 'waiting'; sfResolveNow(); renderSfIntake(); return; } f.extract = r.extract; f.unmapped = r.unmapped; }
    else { f.extract = sfExtract(f.res, { model:S.model, as:f.as }); f.unmapped = sfUnmappedDoc(f.res, f.extract, sfFields(S.model)); }
    f.dirty = false;
  }
  sfResolveNow(); renderSfIntake();
}
function sfTag(i, v) { const f = SFS.files[i]; if (f) { f.tag = v; sfResolveNow(); } }
function sfForget() { sfWorkerStop(false); SFS.files = []; SFS.extracts = []; SFS.resolved = null; SFS.unmapped = []; renderSfIntake(); toast('The documents were forgotten. Values already applied stay in the form with their source line.'); }
function sfUndoClick() { const n = sfUndo(); renderSfIntake(); toast(n ? `Undone: ${n} value${n === 1 ? '' : 's'} put back.` : 'Nothing to undo.'); }

/* numbers that look meaningful but match no field: the user can assign them (and teach the label) */
function sfUnmapped() {
  return SFS.files.flatMap(f => f.extract ? f.unmapped || [] : []).sort((a, b) => b.w - a.w || (a.file < b.file ? -1 : 1)).slice(0, 40);
}

/* ── the review page ── */
const SF_VIEW = { tier:'', file:'', sort:'section' };
function sfReview() { if (!SFS.resolved) return; renderSfReview(); showPage('sfreview'); }
function renderSfReview() {
  const R = SFS.resolved, el = $id('sfreview-content'); if (!el || !R) return;
  const files = [...new Set(R.rows.map(r => r.file))].sort();
  let rows = R.rows.filter(r => (!SF_VIEW.tier || r.tier === SF_VIEW.tier) && (!SF_VIEW.file || r.file === SF_VIEW.file));
  const secOf = id => (SECTIONS.find(s => s.fields.some(f => f.id === id)) || { title:'Other' });
  if (SF_VIEW.sort === 'confidence') rows = rows.slice().sort((a, b) => b.score - a.score || (a.field < b.field ? -1 : 1));
  const groups = SF_VIEW.sort === 'confidence' ? [['By confidence', rows.filter(r => r.tier !== 'Low')]] : SECTIONS.map(s => [s.label || s.title || s.id, rows.filter(r => r.tier !== 'Low' && secOf(r.field) === s)]).filter(g => g[1].length);
  const low = rows.filter(r => r.tier === 'Low'), foreign = [...new Set(R.rows.filter(r => r.foreign).map(r => r.ccy))];
  setHTML(el, `<div class="pg-eyebrow">Smart fill</div><h2 class="pg-title">Review before anything is written</h2>
    <p class="pg-desc">${R.rows.length} value${R.rows.length === 1 ? '' : 's'} proposed from ${SFS.extracts.length} document${SFS.extracts.length === 1 ? '' : 's'}. High confidence rows are ticked; Medium rows are shown unticked; Suggestions are never ticked. Figures from a deck or an update fill the “as stated” fields: VCR2 then compares the company’s claim with the evidence.</p>
    <div class="sf-filters" role="group" aria-label="Filter the proposals">
      <label>Confidence <select class="mini-sel" data-change="sfView" data-a="tier"><option value="">All</option>${['High', 'Medium', 'Low'].map(t => `<option${SF_VIEW.tier === t ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>File <select class="mini-sel" data-change="sfView" data-a="file"><option value="">All files</option>${files.map(f => `<option${SF_VIEW.file === f ? ' selected' : ''} value="${esc(f)}">${esc(f)}</option>`).join('')}</select></label>
      <label>Sort <select class="mini-sel" data-change="sfView" data-a="sort"><option value="section"${SF_VIEW.sort === 'section' ? ' selected' : ''}>By form section</option><option value="confidence"${SF_VIEW.sort === 'confidence' ? ' selected' : ''}>By confidence</option></select></label>
      ${foreign.map(c => `<label>1 ${esc(c)} = <input class="form-inp sf-rate" inputmode="decimal" aria-label="Exchange rate, US dollars for one ${esc(c)}" value="${esc(SFS.rate[c] || '')}" data-change="sfRate" data-a="${esc(c)}"> USD <span class="field-hint">(optional: converts ${esc(c)} rows)</span></label>`).join('')}
    </div>
    <div class="sf-buttons"><button class="btn btn-primary" data-click="sfAccept" data-a="ticked">Accept ticked</button><button class="btn btn-ghost" data-click="sfAccept" data-a="high">Accept all High</button><button class="btn btn-ghost" data-click="sfCancelReview">Cancel</button></div>
    ${groups.map(([t, rs]) => `<h3 class="sf-group">${esc(t)}</h3>${rs.map(sfRowHTML).join('')}`).join('')}
    ${R.conflicts.length ? `<h3 class="sf-group">Conflicts (${R.conflicts.length}): two sources disagree, nothing is filled</h3>${R.conflicts.map(c => `<div class="sf-row sf-conflict"><b>${esc(c.label)}</b><ul>${c.sources.map((s, k) => `<li><label><input type="radio" name="sfc-${esc(c.field)}" data-change="sfPickConflict" data-a="${esc(c.field)}" data-b="#${k}"> ${esc(sfShow(s.value, c.field))} <span class="field-hint">${esc(s.file)} › ${esc(s.loc)}: “${esc(s.snippet)}”</span></label></li>`).join('')}</ul><div class="field-hint">A disagreement between documents is diligence information in itself: ask which is right.</div></div>`).join('')}` : ''}
    ${low.length ? `<h3 class="sf-group">Suggestions (${low.length}): never ticked</h3>${low.map(sfRowHTML).join('')}` : ''}
    ${SFS.unmapped.length ? `<h3 class="sf-group">Numbers with no field (${SFS.unmapped.length})</h3>${SFS.unmapped.map((u, k) => `<div class="sf-row"><span>${esc(u.label)}: <b>${esc(u.raw)}</b> <span class="field-hint">${esc(u.file)} › ${esc(u.loc)}</span></span> <label class="field-hint">Assign to field <select class="mini-sel" data-change="sfAssign" data-a="#${k}"><option value="">…</option>${sfFields(S.model).filter(f => f.t === 'num' && !f.d.skip).map(f => `<option value="${esc(f.id)}">${esc(f.lbl)}</option>`).join('')}</select></label></div>`).join('')}` : ''}
    <div class="sf-buttons"><button class="btn btn-primary" data-click="sfAccept" data-a="ticked">Accept ticked</button><button class="btn btn-ghost" data-click="sfAccept" data-a="high">Accept all High</button><button class="btn btn-ghost" data-click="sfCancelReview">Cancel</button></div>`);
}
const sfShow = (v, id) => { const f = ALL_FIELDS().find(x => x.id === id) || {}; if (typeof v === 'boolean') return v ? 'Yes' : 'No'; if (typeof v !== 'number') return String(v); return f.unit === '$' ? money(v) : f.unit === '%' ? v + '%' : f.unit === 'x' ? v + 'x' : f.unit ? `${v} ${f.unit}` : nf.format(v); };
function sfRowHTML(r) {
  const i = SFS.resolved.rows.indexOf(r), id = `sfr-${i}`, f = ALL_FIELDS().find(x => x.id === r.field) || {};
  if (r.ticked == null) r.ticked = r.tier === 'High' && !(r.inconsistent || []).length;
  const existing = f.t === 'bool' ? r.field in S.bools : f.t === 'select' ? !!S.sel[r.field] : S.vals[r.field] != null && S.vals[r.field] !== '';
  const mine = existing && !(S.prov[r.field] && S.prov[r.field].src === 'smartfill');
  const valueInput = f.t === 'bool' ? `<select class="mini-sel" data-change="sfEdit" data-a="#${i}" aria-label="Value for ${esc(r.label)}"><option value="true"${r.value ? ' selected' : ''}>Yes</option><option value="false"${!r.value ? ' selected' : ''}>No</option></select>`
    : f.t === 'select' ? `<select class="mini-sel" data-change="sfEdit" data-a="#${i}" aria-label="Value for ${esc(r.label)}">${(f.options || []).map(o => `<option${o === r.value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    : `<input class="form-inp sf-val" value="${esc(String(r.value))}" data-change="sfEdit" data-a="#${i}" aria-label="Value for ${esc(r.label)}" ${f.t === 'num' ? 'inputmode="decimal"' : ''}>`;
  return `<div class="sf-row tier-${r.tier.toLowerCase()}${(r.inconsistent || []).length ? ' warn' : ''}">
    <div class="sf-row-main">
      <input type="checkbox" id="${id}" ${r.ticked ? 'checked' : ''} data-change="sfTickRow" data-a="#${i}">
      <label for="${id}" class="sf-label">${esc(r.label)}</label>
      ${valueInput}<span class="field-hint">${f.t === 'num' && typeof r.value === 'number' ? esc(f.unit === '$' ? money(r.value) : f.unit === '%' ? r.value + '%' : f.unit ? r.value + ' ' + f.unit : nf.format(r.value)) : ''}</span>
      <span class="field-hint">as read “${esc(r.raw || String(r.value))}”</span>
      <span class="pill sf-${r.tier.toLowerCase()}">${esc(r.tier)}</span>
      <span class="sf-src">${esc(r.file)} › ${esc(r.loc || '')}</span>
    </div>
    <div class="sf-row-opts">
      ${r.alts && r.alts.length ? `<label class="field-hint">${r.alts.length} other value${r.alts.length > 1 ? 's' : ''} <select class="mini-sel" data-change="sfAlt" data-a="#${i}"><option value="">keep this one</option>${r.alts.map((a, k) => `<option value="${k}">${esc(sfShow(a.value, r.field))} (${esc(a.file)}, ${esc(a.tier)})</option>`).join('')}</select></label>` : ''}
      ${mine ? `<label class="field-hint"><input type="checkbox" data-change="sfOverwrite" data-a="#${i}"${r.overwrite ? ' checked' : ''}> overwrite the value you typed (${esc(String(S.vals[r.field] ?? S.sel[r.field] ?? S.bools[r.field]))})</label>` : ''}
      ${/^stated_/.test(r.field) && r.evidenceField ? `<label class="field-hint"><input type="checkbox" data-change="sfAlso" data-a="#${i}"${r.also ? ' checked' : ''}> also use as evidence for “${esc((ALL_FIELDS().find(x => x.id === r.evidenceField) || { lbl:r.evidenceField }).lbl)}” (tagged Deck or memo)</label>` : ''}
    </div>
    ${(r.inconsistent || []).length ? `<div class="sf-why warn">Inconsistent: ${esc(r.inconsistent.join('; '))}</div>` : ''}
    <details class="sf-details"><summary>Why this value</summary><p>“${esc(r.snippet || '')}”</p><p class="field-hint">${esc((r.why || []).concat(r.notes || []).join(' · '))} · score ${Math.round(r.score * 100)}%${r.agree && r.agree.length ? ` · also in ${esc(r.agree.join(', '))}` : ''}</p>
      <p><label class="field-hint">Not this field: move to <select class="mini-sel" data-change="sfMove" data-a="#${i}"><option value="">…</option>${sfFields(S.model).filter(x => x.t === f.t && x.id !== r.field && !x.d.skip).map(x => `<option value="${esc(x.id)}">${esc(x.lbl)}</option>`).join('')}</select></label></p>
    </details>
  </div>`;
}
function sfView(k, v) { SF_VIEW[k] = v; renderSfReview(); }
const sfRowAt = i => SFS.resolved && SFS.resolved.rows[i];
function sfTickRow(i, on) { const r = sfRowAt(i); if (r) r.ticked = on; }
function sfOverwrite(i, on) { const r = sfRowAt(i); if (r) { r.overwrite = on; if (on) r.ticked = true; } }
function sfAlso(i, on) { const r = sfRowAt(i); if (r) r.also = on; }
function sfEdit(i, v) {
  const r = sfRowAt(i); if (!r) return; const f = ALL_FIELDS().find(x => x.id === r.field) || {};
  if (f.t === 'bool') r.value = v === 'true'; else if (f.t === 'num') { const n = parseNum(v); if (n == null) { toast('That is not a number.', 'err'); return; } r.value = n; } else r.value = v;
  r.edited = true; r.ticked = true; renderSfReview();
}
function sfAlt(i, k) { const r = sfRowAt(i); if (!r || k === '') return; const a = r.alts[+k]; r.alts[+k] = { value:r.value, file:r.file, loc:r.loc, tier:r.tier, role:r.role }; Object.assign(r, { value:a.value, file:a.file, loc:a.loc, tier:a.tier, role:a.role, snippet:`(chosen from the other values) ${a.file} › ${a.loc}` }); renderSfReview(); }
function sfRate(c, v) {
  const n = parseNum(v); SFS.rate[c] = n || '';
  SFS.resolved.rows.filter(r => r.foreign && r.ccy === c).forEach(r => { if (r.orig == null) r.orig = r.value; r.value = n ? Math.round(r.orig * n) : r.orig; r.notes = (r.notes || []).filter(x => !/converted at/.test(x)).concat(n ? [`converted at 1 ${c} = ${n} USD (your rate)`] : []); });
  renderSfReview();
}
function sfPickConflict(field, k) {
  const c = SFS.resolved.conflicts.find(x => x.field === field); if (!c) return;
  const s = c.sources[k], row = Object.assign({}, s, { label:c.label, ticked:true, why:(s.why || []).concat(['chosen by you in a conflict']), alts:[] });
  SFS.resolved.conflicts = SFS.resolved.conflicts.filter(x => x !== c); SFS.resolved.rows.push(row); renderSfReview();
}
/* teach: a label that names another field. The owner's teaching goes into the Studio draft; a visitor's stays in this browser only. */
function sfTeach(label, id) {
  const l = sfNorm(label).slice(0, 80); if (!l) return;
  if (typeof ST !== 'undefined' && ST.draft && ST.token) {
    const s = ST.draft.settings.smartfill = ST.draft.settings.smartfill || {}, fs = s.fields = s.fields || {}, e = fs[id] = fs[id] || {};
    e.syn = [...new Set([...(e.syn || []), l])].slice(0, 60); saveStudioDraft();
  } else {
    try { const a = JSON.parse(localStorage.getItem('vcr2-sf-aliases') || '{}'); if (a && typeof a === 'object' && !Array.isArray(a)) { (a[id] = Array.isArray(a[id]) ? a[id] : []).push(l); a[id] = [...new Set(a[id])].slice(0, 60); localStorage.setItem('vcr2-sf-aliases', JSON.stringify(a)); } } catch (e) {}
  }
  _sfDict = null;
}
function sfMove(i, id) {
  const r = sfRowAt(i); if (!r || !id) return;
  const f = sfFields(S.model).find(x => x.id === id); if (!f) return;
  const label = String(r.snippet || '').split(/[:|]/)[0];
  sfTeach(label, id);
  Object.assign(r, { field:id, label:f.lbl, ticked:true, why:(r.why || []).concat(['moved by you']) });
  toast(`Moved to “${f.lbl}”. ${typeof ST !== 'undefined' && ST.token ? 'The label was added to your Studio draft.' : 'This browser will remember the label.'}`);
  renderSfReview();
}
function sfAssign(k, id) {
  const u = SFS.unmapped[k]; if (!u || !id) return;
  const f = sfFields(S.model).find(x => x.id === id); if (!f) return;
  sfTeach(u.label, id);
  SFS.resolved.rows.push({ field:id, label:f.lbl, value:u.value, raw:u.raw, file:u.file, loc:u.loc, snippet:`${u.label}: ${u.raw}`, tier:'Medium', score:0.7, why:['assigned by you'], role:'unknown', ticked:true, alts:[] });
  SFS.unmapped.splice(k, 1); renderSfReview();
}
function sfAccept(which) {
  const rows = SFS.resolved.rows.filter(r => which === 'high' ? r.tier === 'High' : r.ticked);
  const also = rows.filter(r => r.also && r.evidenceField).map(r => Object.assign({}, r, { field:r.evidenceField, evid:'deck', ticked:true }));
  const out = sfApply(rows.concat(also));
  rows.forEach(r => { if (S.prov[r.field] && S.prov[r.field].src === 'smartfill') S.prov[r.field].v = String(r.value).slice(0, 40); });
  saveDraft();
  showPage('intake'); renderSfIntake();
  toast(`${out.done.length} field${out.done.length === 1 ? '' : 's'} filled by Smart fill${SFS.resolved.conflicts.length ? `, ${SFS.resolved.conflicts.length} conflict${SFS.resolved.conflicts.length === 1 ? '' : 's'} left for you` : ''}${out.skipped.length ? `, ${out.skipped.length} kept as you had them` : ''}. Undo is on the source material page.`);
}
function sfCancelReview() { showPage('intake'); }

/* the "Documents to bring" checklist and the request list */
function sfMissingTypes() { const next = sfBestNext(sfCoverage()); return [...new Set(Object.values(next).map(n => n.name))]; }
function sfChecklist() {
  const have = new Set(SFS.files.map(f => f.as || (f.extract && f.extract.cls.type)).filter(Boolean));
  const L = sfGuide().map(t => `${have.has(t.id) ? '[x]' : '[ ]'} ${t.name} (${t.formats}). For example: ${t.names}.`);
  openModal('Documents to bring', `<p class="pg-desc">Ask the company for the original files (exports, not screenshots). Ticked ones are already here.</p><pre class="sf-check">${esc(L.join('\n'))}</pre>`,
    [{ label:'Download as text', primary:true, onClick:() => downloadFile('documents-to-bring.txt', L.join('\n') + '\n', 'text/plain') }]);
}
function sfAddRequests() {
  const add = sfMissingTypes(); if (!add.length) { toast('No missing document types: every section already has its best source or is filled.'); return; }
  S.requests = [...new Set([...(S.requests || []), ...add.map(n => `${n} (original file)`)])].slice(0, 30); saveDraft();
  toast(`${add.length} document type${add.length === 1 ? '' : 's'} added to “Documents to request”.`);
}

/* the report line: how much of the form Smart fill filled, and how much the user changed afterwards */
function sfReportLine() {
  const ids = Object.keys(S.prov).filter(k => S.prov[k] && S.prov[k].src === 'smartfill'); if (!ids.length) return '';
  const files = new Set(ids.map(k => S.prov[k].file)), edited = ids.filter(k => S.prov[k].v != null && String(S.vals[k] ?? S.sel[k] ?? S.bools[k]) !== S.prov[k].v).length;
  return `${ids.length} field${ids.length === 1 ? ' was' : 's were'} filled by Smart fill from ${files.size} document${files.size === 1 ? '' : 's'}; ${edited} ${edited === 1 ? 'was' : 'were'} edited by the user.`;
}
