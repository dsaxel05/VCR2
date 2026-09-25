
/* ═══════════════════════════════════════════════════════════════
   BOOT — provider settings, file intake, navigation, public API
   ═══════════════════════════════════════════════════════════════ */
function updateProviderUI() {
  const id = document.getElementById('api-provider').value, p = PROVIDERS[id] || PROVIDERS.local;
  const inp = document.getElementById('api-key'), mod = document.getElementById('api-model');
  inp.placeholder = p.ph; inp.disabled = !p.needsKey;
  inp.style.opacity = p.needsKey ? '1' : '.45';
  mod.style.display = p.needsKey ? '' : 'none';
  mod.placeholder = p.needsKey ? `Model (default ${p.model})` : '';
  document.getElementById('memo-toggle').parentNode.style.display = p.needsKey ? '' : 'none';
  document.getElementById('api-hint').textContent = p.needsKey
    ? `Key stored in this browser only and sent only to ${p.name}. Used for extraction, AI import and the memo draft — never for scoring. Get one at ${p.hint}. Use a restricted, low-spend key.`
    : p.hint;
  updateKeyStatus(inp.value.trim());
  const warn = document.getElementById('intake-warn');
  if (warn) warn.style.display = p.needsKey ? '' : 'none';
}
function updateKeyStatus(k) {
  const el = document.getElementById('api-status'), p = PROVIDERS[document.getElementById('api-provider').value] || PROVIDERS.local;
  if (!p.needsKey) { el.className = 'api-status ok'; el.textContent = '⬤ Deterministic engine ready'; return; }
  if (k && k.length > 8) { el.className = 'api-status ok'; el.textContent = `⬤ ${p.name} key set`; }
  else { el.className = 'api-status off'; el.textContent = '⬤ No key — scoring still works'; }
}
function renderFileList() {
  const el = document.getElementById('file-list'); if (!el) return;
  el.innerHTML = S.files.map((f, i) =>
    `<span class="file-pill">${esc(f.name)} <button onclick="S.files.splice(${i},1);renderFileList()" aria-label="Remove">×</button></span>`).join('');
}

/* ── Structured file intake ── */
function loadLedgerText(text, name) {
  if (!text || text.trim().length < 10) { toast('The ledger is empty.', 'err'); return; }
  const unitSel = document.getElementById('ledger-unit').value;
  const r = parseLedger(text, unitSel === 'arr' ? 'arr' : 'mrr');
  if (!r.ok) { toast('Ledger not loaded: ' + r.error, 'err'); return; }
  r.ledger.file = name;
  S.ledger = r.ledger; S._ledgerWarnings = r.warnings;
  saveDraft(); renderIntakeStatus(); updateProgress();
  const L = ledgerAnalytics(S.ledger);
  toast(`Ledger loaded: ${S.ledger.customers.length} customers × ${L.months.length} months, ARR ${money(L.arrNow)}.`);
}
function loadSeriesText(text, name) {
  if (!text || text.trim().length < 10) { toast('The file is empty.', 'err'); return; }
  const r = parseSeries(text);
  if (!r.ok) { toast('Financials not loaded: ' + r.error, 'err'); return; }
  r.series.file = name;
  S.series = r.series; S._seriesWarnings = r.warnings;
  saveDraft(); renderIntakeStatus(); updateProgress();
  toast(`Monthly financials loaded: ${S.series.months.length} months.`);
}
function renderIntakeStatus() {
  const ls = document.getElementById('ledger-status'), ss = document.getElementById('series-status');
  if (ls) {
    if (!S.ledger) ls.innerHTML = '';
    else {
      const L = ledgerAnalytics(S.ledger), P = ledgerPrimitives(L);
      const conflicts = Object.keys(P).filter(k => gv(k) != null && S.prov[k]?.src !== 'ledger');
      ls.innerHTML = `<div class="file-ok"><b>✓ ${S.ledger.customers.length} customers × ${L.months.length} months</b> · ${monthLabel(L.months[0])} – ${monthLabel(L.months[L.e])}
        <div class="field-hint">Ledger ARR ${money(L.arrNow)} · cohort NRR ${fmtPct(L.nrrCohort)} · GRR ${fmtPct(L.grrCohort)} · top-5 ${fmtPct(L.top5, 0)}${L.window < 12 ? ` · a ${L.window}-month look-back (13+ months of data are needed for the 12-month fields)` : ''}</div>
        ${(S._ledgerWarnings || []).map(w => `<div class="field-hint" style="color:var(--amber)">${esc(w)}</div>`).join('')}
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="const n=applyLedgerToForm();renderIntakeStatus();toast(n+' fields filled from the ledger.')">Fill the form from the ledger</button>
          <button class="btn btn-ghost btn-sm" onclick="S.ledger=null;saveDraft();renderIntakeStatus();updateProgress()">Remove</button></div>
        ${conflicts.length ? `<div class="field-hint" style="margin-top:6px">${conflicts.length} form field${conflicts.length === 1 ? ' is' : 's are'} already filled by hand. Filling from the ledger overwrites ${conflicts.length === 1 ? 'it' : 'them'}; leaving ${conflicts.length === 1 ? 'it' : 'them'} lets verification test the hand-entered figures against the ledger.</div>` : ''}</div>`;
    }
  }
  if (ss) {
    if (!S.series) ss.innerHTML = '';
    else {
      const s = S.series, cols = ['revenue','cash','burn','expenses','headcount'].filter(k => s[k].some(v => v != null));
      ss.innerHTML = `<div class="file-ok"><b>✓ ${s.months.length} months</b> · ${monthLabel(s.months[0])} – ${monthLabel(s.months[s.months.length - 1])}
        <div class="field-hint">Columns: ${cols.join(', ') || 'none recognised'}</div>
        ${(S._seriesWarnings || []).map(w => `<div class="field-hint" style="color:var(--amber)">${esc(w)}</div>`).join('')}
        <div style="display:flex;gap:6px;margin-top:8px"><button class="btn btn-ghost btn-sm" onclick="S.series=null;saveDraft();renderIntakeStatus();updateProgress()">Remove</button></div></div>`;
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
  const dz = document.getElementById(id); if (!dz) return;
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
  const fv = document.getElementById('files-val');
  if (fv) {
    const parts = [S.ledger ? 'ledger' : null, S.series ? 'financials' : null].filter(Boolean);
    fv.textContent = parts.length ? parts.join(' + ') : '—';
    fv.style.color = parts.length ? 'var(--green)' : '';
  }
  const lc = document.getElementById('lib-count'); if (lc) lc.textContent = libLoad().length;
  const rb = document.getElementById('sb-rubric'); if (rb) rb.textContent = 'evidence engine · rubric v' + rubricVersion();
};

(function init() {
  applyConfig(effectiveConfig());
  buildNav(); buildStages(); buildTypes();
  try {
    const pv = localStorage.getItem('vcr3-provider') || 'local';
    document.getElementById('api-provider').value = PROVIDERS[pv] ? pv : 'local';
    document.getElementById('api-key').value = localStorage.getItem('vcr3-key') || '';
    document.getElementById('api-model').value = localStorage.getItem('vcr4-model') || '';
    const mt = localStorage.getItem('vcr4-memo'); if (mt != null) document.getElementById('memo-toggle').checked = mt === '1';
  } catch (e) {}
  updateProviderUI();
  loadDraft();
  renderIntakeStatus();
  updateProgress();

  document.getElementById('api-key').addEventListener('input', e => {
    const k = e.target.value.trim();
    try { localStorage.setItem('vcr3-key', k); } catch (err) {}
    updateKeyStatus(k);
  });
  document.getElementById('api-model').addEventListener('input', e => { try { localStorage.setItem('vcr4-model', e.target.value.trim()); } catch (err) {} });
  document.getElementById('memo-toggle').addEventListener('change', e => { try { localStorage.setItem('vcr4-memo', e.target.checked ? '1' : '0'); } catch (err) {} });
  document.getElementById('api-provider').addEventListener('change', e => {
    try { localStorage.setItem('vcr3-provider', e.target.value); } catch (err) {}
    updateProviderUI();
  });
  document.getElementById('api-eye').addEventListener('click', () => {
    const i = document.getElementById('api-key');
    i.type = i.type === 'password' ? 'text' : 'password';
  });

  /* Narrative files for AI extraction */
  const dz = document.getElementById('dropzone');
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

  /* Keyboard: ←/→ between evidence sections when focus is not in a field. */
  document.addEventListener('keydown', e => {
    if (!document.getElementById('page-section').classList.contains('active')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); nextSec(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prevSec(); }
  });

  /* Owner configuration: the published radar-config.json applies to everyone. */
  updateStudioLink(); renderPreviewBanner();
  CFG_READY = loadPublishedConfig().then(ok => { if (ok) refreshAfterConfig(); return ok; }).catch(() => false);
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
