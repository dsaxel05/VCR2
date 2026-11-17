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
function fixLinksHTML(ids) {
  const list = [...new Set(ids || [])].filter(id => fieldSection(id) >= 0).slice(0, 6);
  if (!list.length) return '';
  return `<div class="fix-links"><span class="fix-l">Fix in the form:</span>${list.map((id, i) =>
    `<button type="button" class="fix-link${i ? '' : ' fix-main'}" data-click="goField" data-a="${esc(id)}">${esc(fieldLabel(id))}</button>`).join('')}</div>`;
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
