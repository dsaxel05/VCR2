
/* ═══════════════════════════════════════════════════════════════
   BOOT — provider settings, file intake, navigation, public API
   ═══════════════════════════════════════════════════════════════ */
/* Accessibility pass, run after the page changes: every field has a name, a table that scrolls can be reached by keyboard and an empty
   table header says what its column is. Names come from the nearest visible label, the row, the column or the placeholder. */
function a11yPass() {
  const named = e => e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title') || (e.id && document.querySelector('label[for="' + e.id + '"]')) || (e.closest('label') && e.closest('label').textContent.trim());
  document.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea').forEach(e => {
    if (named(e)) return;
    let n = '';
    const row = e.closest('.st-row'), cell = e.closest('td');
    if (row) { const s = row.querySelector('span'); n = s ? s.textContent : ''; }
    if (!n && cell) {
      const tr = cell.parentElement, idx = Array.prototype.indexOf.call(tr.children, cell), th = cell.closest('table') && cell.closest('table').querySelectorAll('thead th')[idx];
      n = [tr.children[0] && tr.children[0] !== cell ? tr.children[0].textContent.trim() : '', th ? th.textContent.trim() : ''].filter(Boolean).join(': ');
    }
    if (!n && e.placeholder) n = e.placeholder;
    if (!n) { const p = e.previousElementSibling; if (p && /label|p|div|span/i.test(p.tagName) && p.textContent.trim().length < 90) n = p.textContent.trim(); }
    if (!n && e.id === 'adv-json') n = 'Configuration as JSON';
    if (!n && e.type === 'checkbox') n = 'Switch';
    if (n) e.setAttribute('aria-label', n.replace(/\s+/g, ' ').trim().slice(0, 120));
  });
  document.querySelectorAll('.tbl-wrap').forEach(w => {
    if (w.scrollWidth > w.clientWidth + 1 && w.checkVisibility && w.checkVisibility()) {
      if (!(w.tabIndex >= 0)) w.tabIndex = 0;
      if (!w.getAttribute('role')) w.setAttribute('role', 'region');
      if (!w.getAttribute('aria-label')) { const t = w.previousElementSibling && /block-title/.test(w.previousElementSibling.className) ? w.previousElementSibling.textContent.trim() : ''; w.setAttribute('aria-label', (t || 'Table') + ', scrolls sideways'); }
    }
  });
  /* A header cell with no words gets a visually hidden name (an aria-label alone is not "visible text" to a checker). */
  document.querySelectorAll('th').forEach(t => { if (!t.textContent.trim()) { const s = document.createElement('span'); s.className = 'sr-only'; s.textContent = t.getAttribute('aria-label') || 'Actions'; t.appendChild(s); } });
  /* Two scrolling tables with the same name are told apart by a number. */
  const seen = {};
  document.querySelectorAll('.tbl-wrap[role="region"][aria-label]').forEach(w => {
    if (!w.checkVisibility || !w.checkVisibility()) return;
    const base = (w.getAttribute('data-label') || w.getAttribute('aria-label'));
    w.setAttribute('data-label', base);
    seen[base] = (seen[base] || 0) + 1;
    w.setAttribute('aria-label', seen[base] > 1 ? base + ' (' + seen[base] + ')' : base);
  });
  /* Each report view starts with a hidden second-level heading carrying its name, so the headings inside never jump from 1 to 3. */
  document.querySelectorAll('.rpane').forEach(p => {
    if (p.firstElementChild && p.firstElementChild.className === 'sr-only') return;
    const b = $id(p.id.replace('rp-', 'rt-')), h = document.createElement('h2');
    h.className = 'sr-only'; h.textContent = b ? b.textContent : 'View'; p.insertBefore(h, p.firstChild);
  });
  /* Every strip of report tabs keeps one tab stop, also when the current view lives in the other strip. */
  if (typeof rtabStops === 'function') rtabStops();
}
if (typeof MutationObserver === 'function' && typeof document !== 'undefined' && document.body) {
  let _a11yT = null;
  new MutationObserver(() => { clearTimeout(_a11yT); _a11yT = setTimeout(a11yPass, 60); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'open'] });
  window.addEventListener('resize', () => { clearTimeout(_a11yT); _a11yT = setTimeout(a11yPass, 150); });
}
function updateProviderUI() {
  const id = $id('api-provider').value, p = PROVIDERS[id] || PROVIDERS.local;
  const inp = $id('api-key'), mod = $id('api-model');
  inp.placeholder = p.ph; inp.disabled = !p.needsKey;
  inp.style.opacity = p.needsKey ? '1' : '.45';
  mod.style.display = p.needsKey ? '' : 'none';
  mod.placeholder = p.needsKey ? `Model (default ${p.model})` : '';
  $id('memo-toggle').parentNode.style.display = p.needsKey ? '' : 'none';
  $id('api-hint').textContent = p.needsKey
    ? `Key stored in this browser only and sent only to ${p.name}. Used for extraction, AI import and the memo draft, never for scoring. Get one at ${p.hint}. Use a restricted, low-spend key.`
    : p.hint;
  updateKeyStatus(inp.value.trim());
  const ai = document.querySelector('.sb-ai'); if (ai && p.needsKey) ai.open = true;   /* a chosen provider keeps its settings in view */
  const warn = $id('intake-warn');
  if (warn) warn.style.display = p.needsKey ? '' : 'none';
}
/* Where the AI key is kept: this tab (sessionStorage) by default, this computer (localStorage) only when asked. */
function storeApiKey(k) {
  try {
    if (k) sessionStorage.setItem('vcr3-key', k); else sessionStorage.removeItem('vcr3-key');
    const rem = localStorage.getItem('vcr3-remember') === '1';
    if (rem && k) localStorage.setItem('vcr3-key', k); else localStorage.removeItem('vcr3-key');
  } catch (err) {}
}
function updateKeyStatus(k) {
  const el = $id('api-status'), p = PROVIDERS[$id('api-provider').value] || PROVIDERS.local;
  if (!p.needsKey) { el.className = 'api-status ok'; el.textContent = 'Deterministic engine ready'; return; }
  if (k && k.length > 8) { el.className = 'api-status ok'; el.textContent = `${p.name} key set`; }
  else { el.className = 'api-status off'; el.textContent = 'No key. Scoring still works without one.'; }
}
function renderFileList() {
  const el = $id('file-list'); if (!el) return;
  el.innerHTML = S.files.map((f, i) =>
    `<span class="file-pill">${esc(f.name)} <button onclick="S.files.splice(${i},1);renderFileList()" aria-label="Remove">×</button></span>`).join('');
}

/* ── Structured file intake ── */
function loadLedgerText(text, name) {
  if (!text || text.trim().length < 10) { toast('The ledger is empty.', 'err'); return; }
  const unitSel = $id('ledger-unit').value;
  const r = parseLedger(text, unitSel === 'arr' ? 'arr' : 'mrr');
  if (!r.ok) { S._ledgerError = r.error; renderIntakeStatus(); toast('Ledger not loaded: ' + r.error, 'err'); return; }
  S._ledgerError = null;
  r.ledger.file = name;
  S.ledger = r.ledger; S._ledgerWarnings = r.warnings;
  saveDraft(); renderIntakeStatus(); updateProgress();
  const L = ledgerAnalytics(S.ledger);
  toast(`Ledger loaded: ${S.ledger.customers.length} customers × ${L.months.length} months, ARR ${money(L.arrNow)}.`);
}
function loadSeriesText(text, name) {
  if (!text || text.trim().length < 10) { toast('The file is empty.', 'err'); return; }
  const r = parseSeries(text);
  if (!r.ok) { S._seriesError = r.error; renderIntakeStatus(); toast('Financials not loaded: ' + r.error, 'err'); return; }
  S._seriesError = null;
  r.series.file = name;
  S.series = r.series; S._seriesWarnings = r.warnings;
  saveDraft(); renderIntakeStatus(); updateProgress();
  toast(`Monthly financials loaded: ${S.series.months.length} months.`);
}
function renderIntakeStatus() {
  const ls = $id('ledger-status'), ss = $id('series-status');
  const bad = (what, e) => e ? `<div class="warnstrip" role="alert"><span>⚠</span><div><b>${what} not loaded.</b> ${esc(e)}</div></div>` : '';
  if (ls) {
    if (!S.ledger) ls.innerHTML = bad('Ledger', S._ledgerError);
    else {
      const L = ledgerAnalytics(S.ledger), P = ledgerPrimitives(L);
      const conflicts = Object.keys(P).filter(k => gv(k) != null && S.prov[k]?.src !== 'ledger');
      ls.innerHTML = bad('Ledger', S._ledgerError) + `<div class="file-ok"><b>✓ ${S.ledger.customers.length} customers × ${L.months.length} months</b> · ${monthLabel(L.months[0])} to ${monthLabel(L.months[L.e])}
        <div class="field-hint">Ledger ARR ${money(L.arrNow)} · cohort NRR ${fmtPct(L.nrrCohort)} · GRR ${fmtPct(L.grrCohort)} · top-5 ${fmtPct(L.top5, 0)}${L.openingKnown === false ? ' · invoices cover under 24 months, so ARR a year ago, growth and retention are not computed from this file (24+ months of invoices are needed)' : L.window < 12 ? ` · a ${L.window}-month look-back (13+ months of data are needed for the 12-month fields)` : ''}</div>
        ${(S._ledgerWarnings || []).map(w => `<div class="field-hint" style="color:var(--amber-t)">${esc(w)}</div>`).join('')}
        <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="const n=applyLedgerToForm();renderIntakeStatus();toast(n+' fields filled from the ledger.')">Fill the form from the ledger</button>
          <button class="btn btn-ghost btn-sm" onclick="S.ledger=null;saveDraft();renderIntakeStatus();updateProgress()">Remove</button></div>
        ${conflicts.length ? `<div class="field-hint" style="margin-top:4px">${conflicts.length} form field${conflicts.length === 1 ? ' is' : 's are'} already filled by hand. Filling from the ledger overwrites ${conflicts.length === 1 ? 'it' : 'them'}; leaving ${conflicts.length === 1 ? 'it' : 'them'} lets verification test the hand-entered figures against the ledger.</div>` : ''}</div>`;
    }
  }
  if (ss) {
    if (!S.series) ss.innerHTML = bad('Financials', S._seriesError);
    else {
      const s = S.series, cols = ['revenue','cash','burn','expenses','headcount'].filter(k => s[k].some(v => v != null));
      ss.innerHTML = bad('Financials', S._seriesError) + `<div class="file-ok"><b>✓ ${s.months.length} months</b> · ${monthLabel(s.months[0])} to ${monthLabel(s.months[s.months.length - 1])}
        <div class="field-hint">Columns: ${cols.join(', ') || 'none recognised'}</div>
        ${(S._seriesWarnings || []).map(w => `<div class="field-hint" style="color:var(--amber-t)">${esc(w)}</div>`).join('')}
        <div style="display:flex;gap:4px;margin-top:6px"><button class="btn btn-ghost btn-sm" onclick="S.series=null;saveDraft();renderIntakeStatus();updateProgress()">Remove</button></div></div>`;
    }
  }
}
function downloadTemplate(kind) {
  if (kind === 'ledger') {
    const m = Array.from({ length:6 }, (_, k) => monthAdd('2026-01', k));
    downloadFile('radar-ledger-template.csv', ['customer,' + m.join(','), 'Acme Corp,4200,4200,4600,4600,4600,5100', 'Beacon Ltd,0,0,1800,1800,1800,1800', 'Cobalt Inc,2500,2500,2500,0,0,0'].join('\n'), 'text/csv');
  } else {
    downloadFile('radar-monthly-financials-template.csv', ['month,revenue,cash,burn,expenses,headcount', '2026-01,210000,6400000,290000,500000,31', '2026-02,221000,6120000,280000,501000,32', '2026-03,236000,5830000,290000,526000,33'].join('\n'), 'text/csv');
  }
}
function wireDrop(id, onText, accept, kind) {
  const dz = $id(id); if (!dz) return;
  const read = file => {
    if (!file) return;
    if (file.size > 12e6) { toast(`${file.name} is larger than 12 MB.`, 'err'); return; }
    readAnyFile(file, onText, kind);
  };
  dz.addEventListener('click', () => pickFile(accept, (t, n) => onText(t, n), kind));
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => read(e.dataTransfer.files[0]));
}

/* Sidebar status line for data files and library size. */
const _updateProgressCore = updateProgress;
updateProgress = function () {
  _updateProgressCore();
  const fv = $id('files-val');
  if (fv) {
    const parts = [S.ledger ? 'ledger' : null, S.series ? 'financials' : null].filter(Boolean);
    fv.textContent = parts.length ? parts.join(' + ') : 'n/a';
    fv.style.color = parts.length ? 'var(--green)' : '';
  }
  const lc = $id('lib-count'); if (lc) lc.textContent = libLoad().length;
  const rb = $id('sb-rubric'); if (rb) rb.textContent = 'Evidence engine, rubric ' + rubricVersion();
};

/* Landing-page counts, read from the engine so they never go stale. */
function introStats() {
  const set = (id, v) => { const el = $id(id); if (el && v) el.textContent = String(v); };
  const live = (kind, list) => list.filter(id => !cfgHidden(kind, id)).length;
  set('st-metrics', live('metrics', Object.keys(DLABEL)) + ((CFG && CFG.metrics) ? CFG.metrics.length : 0));
  set('st-checks', checkCount());
  set('st-forensics', live('forensics', BUILTIN.forensics.map(x => x[0])));
  set('st-patterns', live('patterns', BUILTIN.patterns.map(x => x[0])) + ((CFG && CFG.patterns) ? CFG.patterns.length : 0));
}

(function init() {
  applyConfig(effectiveConfig());
  buildNav(); buildStages(); buildTypes();
  introStats();
  try {
    const pv = localStorage.getItem('vcr3-provider') || 'local';
    $id('api-provider').value = PROVIDERS[pv] ? pv : 'local';
    /* The key lives in this tab only unless the visitor ticks "Remember this key on this computer". A key an earlier version
       saved is shown as remembered, so it can be unticked and removed. */
    const remembered = localStorage.getItem('vcr3-key');
    if (remembered && localStorage.getItem('vcr3-remember') == null) localStorage.setItem('vcr3-remember', '1');
    const rem = localStorage.getItem('vcr3-remember') === '1';
    $id('api-remember').checked = rem;
    $id('api-key').value = sessionStorage.getItem('vcr3-key') || (rem ? remembered || '' : '');
    if (!rem && remembered) localStorage.removeItem('vcr3-key');
    $id('api-model').value = localStorage.getItem('vcr4-model') || '';
    try { localStorage.removeItem('vcr4-memo'); } catch (err) {}   /* an earlier version remembered this choice; sending data is decided per session now */
  } catch (e) {}
  updateProviderUI();
  loadDraft();
  renderIntakeStatus();
  updateProgress();

  $id('api-key').addEventListener('input', e => {
    const k = e.target.value.trim();
    storeApiKey(k);
    updateKeyStatus(k);
  });
  $id('api-remember').addEventListener('change', e => {
    try { localStorage.setItem('vcr3-remember', e.target.checked ? '1' : '0'); } catch (err) {}
    storeApiKey($id('api-key').value.trim());
    toast(e.target.checked ? 'The key is remembered on this computer.' : 'The key is no longer saved on this computer.');
  });
  $id('api-forget').addEventListener('click', () => {
    $id('api-key').value = '';
    try { sessionStorage.removeItem('vcr3-key'); localStorage.removeItem('vcr3-key'); } catch (err) {}
    updateKeyStatus('');
    toast('The key was forgotten.');
  });
  $id('api-model').addEventListener('input', e => { try { localStorage.setItem('vcr4-model', e.target.value.trim()); } catch (err) {} });
  $id('api-provider').addEventListener('change', e => {
    try { localStorage.setItem('vcr3-provider', e.target.value); } catch (err) {}
    updateProviderUI();
  });
  $id('api-eye').addEventListener('click', () => {
    const i = $id('api-key');
    i.type = i.type === 'password' ? 'text' : 'password';
  });

  /* Narrative files for AI extraction */
  const dz = $id('dropzone');
  const readFiles = list => {
    Array.from(list).slice(0, 5).forEach(file => {
      if (file.size > 900000) { toast(`${file.name} is too large to paste inline. Export a summary tab instead.`, 'err'); return; }
      readAnyFile(file, (text, name) => { S.files.push({ name, text:String(text).slice(0, 20000) }); renderFileList(); }, 'series');
    });
  };
  dz.addEventListener('click', () => {
    const i = document.createElement('input'); i.type = 'file'; i.multiple = true;
    i.accept = '.csv,.txt,.md,.tsv,.xlsx,.xlsm';
    i.onchange = () => readFiles(i.files); i.click();
  });
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => readFiles(e.dataTransfer.files));

  /* Structured files */
  wireDrop('ledger-drop', (t, n) => loadLedgerText(t, n), '.csv,.tsv,.txt,.xlsx,.xlsm', 'ledger');
  wireDrop('series-drop', (t, n) => loadSeriesText(t, n), '.csv,.tsv,.txt,.xlsx,.xlsm', 'series');

  /* Keyboard: Alt + M shows or hides the menu; Escape closes an open drawer. */
  document.addEventListener('keydown', e => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyM') { e.preventDefault(); sidebarToggle(); }
    else if (e.key === 'Escape' && $id('sidebar').classList.contains('open')) toggleSidebar(false);
  });
  if (window.addEventListener) window.addEventListener('resize', () => { if (!isNarrow()) toggleSidebar(false); syncSidebar(); });
  syncSidebar();

  /* Keyboard: ←/→ between evidence sections when focus is not in a field. */
  document.addEventListener('keydown', e => {
    if (!$id('page-section').classList.contains('active')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); nextSec(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prevSec(); }
  });

  /* Owner configuration: the published radar-config.json applies to everyone. */
  updateStudioLink(); renderPreviewBanner();
  CFG_READY = loadPublishedConfig().then(ok => { if (ok) refreshAfterConfig(); introStats(); return ok; }).catch(() => false);
  const route = () => { if (typeof location !== 'undefined' && /^#studio\b/i.test(location.hash || '')) openStudio(); };
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('hashchange', route);
  route();
})();

/* ═══════════════════════════════════════════════════════════════
   PUBLIC SURFACE
   The engines are exposed so they can be driven by tests or a script
   today, and lifted into a server module unchanged tomorrow.
   ═══════════════════════════════════════════════════════════════ */
window.Radar = {
  version: RUBRIC.version,
  get state() { return S; },
  set state(v) { S = v; },
  derive, runChecks, scoreAll, suppressions, buildQuestions, buildDataRequests, runHash,
  parseLedger, ledgerAnalytics, ledgerPrimitives, parseSeries, trajectory, defaultAlive, simulate, runProjections,
  dealMath, liquidate, detectPatterns, optimismTest, sensitivity, benfordTest, activeThresholds, rubricVersion,
  RUBRIC, SECTIONS, STAGES, MODELS,
  /* Headless: inputs in, full assessment out. No DOM required.
     input = { name, stage, model, vals, bools, sel, evid, ledgerCSV?, seriesCSV? } */
  assess(input) {
    const prev = S;
    S = Object.assign(blankState(), input);
    if (input.ledgerCSV) { const r = parseLedger(input.ledgerCSV, input.ledgerUnit); if (r.ok) S.ledger = r.ledger; }
    if (input.seriesCSV) { const r = parseSeries(input.seriesCSV); if (r.ok) S.series = r.series; }
    try {
      const R = assessAll();
      return { rubric:R.sc.rubric, hash:R.hash, derived:R.D, formulas:R.F, checks:R.checks, scoring:R.sc, patterns:R.patterns,
               forensics:R.forensics, projections:{ defaultAlive:R.proj.da, simulation:R.proj.sim && Object.assign({}, R.proj.sim, { fan:undefined }) },
               deal:R.deal && Object.assign({}, R.deal, { curve:undefined, ourAt:undefined }), questions:R.questions, data_requests:R.requests };
    } finally { S = prev; }
  },
};
