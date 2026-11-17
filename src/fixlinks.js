/* ── FIX LINKS: from an issue (a contradiction, an inconsistency, a gate, a question) to the form fields behind it ──
   Every check knows which entered figures it compares. Each issue shows those fields as buttons; one press opens the right
   section (and its More options when the field sits there), scrolls to the field, highlights it and puts the cursor in it.
   A small bar then offers to re-check the numbers, so a typing mistake is fixed and verified in two clicks. */
const CHECK_FIELDS = {
  waterfall:['arr_now', 'arr_12mo', 'new_arr_l12', 'expansion_arr_l12', 'churned_arr_l12', 'contraction_arr_l12'],
  stated_arr:['stated_arr', 'arr_now'],
  conc_order:['top1_pct', 'top5_pct'], conc_order2:['top5_pct', 'top10_pct'], conc_over:['top10_pct'],
  gm_check:['gross_margin', 'cogs_hosting', 'cogs_support', 'arr_now'],
  burn_check:['net_burn', 'headcount_now', 'avg_loaded_comp', 'gross_margin'],
  burn_bridge:['net_burn', 'gross_burn', 'arr_now'],
  tam_check:['stated_tam', 'target_accounts', 'arr_now', 'customers_now'],
  deferred:['deferred_revenue', 'arr_now'], ar:['ar_over_90', 'arr_now'], services:['services_pct'],
  stated_customers:['stated_customers', 'customers_now'],
  logo_bridge:['customers_now', 'customers_12mo', 'new_customers_l12', 'logos_lost_l12'],
  series_cash:['cash_on_hand'], series_burn:['net_burn'], cash_raise:['cash_on_hand', 'total_raised', 'debt_outstanding'],
};
/* The fields behind a check: its own list, the stated figure and the inputs of the metric it is compared with, or the
   form field a ledger check compares. */
function checkFields(c) {
  if (!c) return [];
  if (Array.isArray(c.fields)) return c.fields;
  if (CHECK_FIELDS[c.id]) return CHECK_FIELDS[c.id];
  if (/^ledger_/.test(c.id) && c.id !== 'ledger_all') return [c.id.slice(7)];
  if (c.key) return [c.id].concat(inputsOf(c.key));
  return /^stated_/.test(c.id) ? [c.id] : [];
}
const fieldSection = id => SECTIONS.findIndex(s => !sectionHidden(s) && s.fields.some(f => f.id === id));
function fieldLabel(id) { for (const s of SECTIONS) { const f = s.fields.find(x => x.id === id); if (f) return f.lbl || id; } return id; }
/* Each button opens the correction window on the spot (the user stays on the results); data-b carries every field of
   the issue, so the window shows them together. */
function fixLinksHTML(ids) {
  const list = [...new Set(ids || [])].filter(id => fieldSection(id) >= 0).slice(0, 6);
  if (!list.length) return '';
  return `<div class="fix-links"><span class="fix-l">Correct a figure:</span>${list.map((id, i) =>
    `<button type="button" class="fix-link${i ? '' : ' fix-main'}" data-click="fixEditOpen" data-a="${esc(id)}" data-b="${esc(list.join(','))}">${esc(fieldLabel(id))}</button>`).join('')}</div>`;
}
const fixFieldOf = id => { for (const s of SECTIONS) { const f = s.fields.find(x => x.id === id); if (f) return f; } return null; };
function fixShown(f) {
  const v = S.vals[f.id]; if (v == null || v === '') return '';
  const n = Number(v); if (!isFinite(n)) return String(v);
  return f.unit === '$' ? money(n) : f.unit === '%' ? fmtPct(n) : String(n);
}
/* The correction window: the fields behind one issue, with their current values, editable in place. */
function fixEditOpen(focusId, idsCsv) {
  const ids = String(idsCsv || focusId).split(',').filter(id => fixFieldOf(id));
  if (!ids.length) return;
  const row = id => {
    const f = fixFieldOf(id), cur = fixShown(f);
    const unit = f.unit ? ` <span class="fix-unit">(${esc(f.unit)})</span>` : '';
    if (f.t === 'bool') {
      const b = S.bools[id];
      return `<label class="fix-row"><span class="fix-name">${esc(f.lbl || id)}</span>
        <select class="form-inp" data-fix="${esc(id)}" data-kind="bool"><option value=""${b == null ? ' selected' : ''}>Not answered</option><option value="yes"${b === true ? ' selected' : ''}>Yes</option><option value="no"${b === false ? ' selected' : ''}>No</option></select></label>`;
    }
    if (f.t !== 'num') return `<p class="fix-row"><span class="fix-name">${esc(f.lbl || id)}</span> <button type="button" class="acct-link" data-click="goField" data-a="${esc(id)}">Edit in the form</button></p>`;
    return `<label class="fix-row"><span class="fix-name">${esc(f.lbl || id)}${unit}</span>
      <input class="form-inp" data-fix="${esc(id)}" data-kind="num" inputmode="decimal" autocomplete="off" value="${esc(S.vals[id] || '')}" placeholder="empty">
      <span class="fix-cur">${cur ? 'now ' + esc(cur) : 'empty'}</span><span class="fix-err" id="fixe-${esc(id)}" role="alert"></span></label>`;
  };
  const onReport = !!(S.result && $id('page-result') && $id('page-result').classList.contains('active'));
  openModal('Correct a figure', `<p class="fix-intro">If a figure was mistyped, correct it here: ${onReport ? 'the report is recomputed in place and you stay on it' : 'the checks run again at once'}. Amounts accept 4200000, 4.2M or 4,200,000. Evidence tags are kept.</p>
    <div class="fix-form">${ids.map(row).join('')}</div>
    <p class="field-hint">Need the whole section? <button type="button" class="acct-link" data-click="goField" data-a="${esc(focusId)}">Open this field in the form</button></p>`,
    [{ label:onReport ? 'Save and recompute the report' : 'Save and re-check', primary:true, onClick:fixEditSave }]);
  const m = document.querySelector('#modal-wrap .modal'); if (m) m.classList.add('modal-fix');
  const inp = document.querySelector(`#modal-wrap [data-fix="${CSS.escape(focusId)}"]`); if (inp) { inp.focus(); if (inp.select) inp.select(); }
}
function fixEditSave() {
  let bad = false, changed = 0;
  const next = [];
  document.querySelectorAll('#modal-wrap [data-fix]').forEach(el => {
    const id = el.dataset.fix, raw = el.value.trim();
    if (el.dataset.kind === 'bool') { const v = raw === 'yes' ? true : raw === 'no' ? false : null; if (v !== (S.bools[id] ?? null)) next.push(['bool', id, v]); return; }
    const err = $id('fixe-' + id), amb = raw ? numberAmbiguity(raw) : null, n = raw && !amb ? parseNum(raw) : null;
    if (raw && n == null) { bad = true; el.setAttribute('aria-invalid', 'true'); if (err) err.textContent = amb ? `“${raw}” reads two ways: write ${raw.replace(/[.,]/, '')} or ${parseFloat(raw.replace(',', '.'))}.` : `“${raw}” is not a number.`; return; }
    el.removeAttribute('aria-invalid'); if (err) err.textContent = '';
    const v = n == null ? null : String(n);
    if (v !== (S.vals[id] ?? null)) next.push(['num', id, v]);
  });
  if (bad) return;
  next.forEach(([k, id, v]) => {
    const box = k === 'bool' ? S.bools : S.vals;
    if (v == null) delete box[id]; else box[id] = v;
    changed++;
  });
  closeModal();
  if (!changed) return;
  /* The form page still holds the old values in its inputs, and leaving it later reads them back (saveSec): redraw it from
     the corrected state first, or the correction would be overwritten. */
  if (SECTIONS[S.section]) renderSection(S.section);
  if (typeof saveDraft === 'function') saveDraft();
  if (S.result && $id('page-result').classList.contains('active')) {
    const y = window.scrollY;
    try { S.result = Object.assign(assessUI(), { memo:S.result.memo }); renderResult(S.result); }
    catch (e) { console.error(e); toast('The report could not be recomputed: ' + e.message, 'err'); return; }
    window.scrollTo({ top:y });
    toast(changed === 1 ? 'Corrected: the report is recomputed with the new figure.' : `Corrected ${changed} figures: the report is recomputed.`);
  } else { goVerify(); toast('Corrected: the checks ran again.'); }
}
const fixFor = c => fixLinksHTML(checkFields(c));
/* A question links to the fields of the check or the gate it comes from. */
function fixForQuestion(q, R) {
  const r = q && q.ref; if (!r) return '';
  if (r.k === 'checks') return fixFor((R.checks || []).find(c => c.id === r.id));
  if (r.k === 'gates') return fixLinksHTML([r.id]);
  return '';
}
function goField(id) {
  const i = fieldSection(id); if (i < 0) return;
  closeModal();   /* called from the correction window: it closes before the form opens */
  MORE_OPEN[SECTIONS[i].id] = true;   /* the field may sit under More options */
  jumpTo(i);
  const card = $id('fc-' + id); if (!card) return;
  card.scrollIntoView({ block:'center' });
  card.classList.remove('fix-target'); void card.offsetWidth; card.classList.add('fix-target');
  const inp = card.querySelector('input:not([type=hidden]), select, textarea') || card;
  if (inp.focus) inp.focus({ preventScroll:true });
  fixBackShow();
}
/* The bar that brings the user back once the figure is corrected. */
function fixBackShow() {
  let bar = $id('fix-back');
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'fix-back'; bar.className = 'fix-back'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Re-check after a fix');
    setHTML(bar, '<span>Corrected the figure?</span><button type="button" class="btn btn-primary btn-sm" data-click="fixBackGo">Re-check the numbers</button><button type="button" class="fix-x" data-click="fixBackHide" aria-label="Hide this bar">×</button>');
    document.body.appendChild(bar);
  }
  bar.hidden = false;
}
function fixBackHide() { const b = $id('fix-back'); if (b) b.hidden = true; }
function fixBackGo() { fixBackHide(); goVerify(); }
