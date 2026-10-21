
/* ═══════════════════════════════════════════════════════════════
   STUDIO: built-in details — the parts of built-in items that are not their name
   ═══════════════════════════════════════════════════════════════ */
function metaVal(kind, id, key) { const o = (ST.draft.meta[kind] || {})[id]; return o ? o[key] : undefined; }
function setMeta(kind, id, key, raw) {
  const M = ST.draft.meta[kind] = ST.draft.meta[kind] || {};
  const o = M[id] = M[id] || {};
  let v = raw;
  if (key === 'chips') v = String(raw).split(',').map(x => parseNum(x)).filter(x => x != null);
  else if (key === 'addOptions') v = String(raw).split(',').map(x => x.trim()).filter(Boolean);
  else if (key === 'required' || key === 'when') v = raw === 'yes' ? true : raw === 'no' ? false : undefined;
  else if (key === 'p') { v = parseNum(raw); if (v == null) v = undefined; }
  else v = String(raw).trim();
  const empty = v === undefined || v === '' || (Array.isArray(v) && !v.length);
  if (empty) delete o[key]; else o[key] = v;
  if (!Object.keys(o).length) delete M[id];
  saveStudioDraft(); renderStudioStatus();
}
/* The business models a scored answer or a yes/no point applies to (all unticked means every model). */
function setMetaModels(kind, id) {
  const box = Array.from(document.querySelectorAll('input[data-mk]')).filter(x => x.dataset.mk === kind + ':' + id);
  const on = box.filter(x => x.checked).map(x => x.value);
  const base = kind === 'answers' ? ((RUBRIC.categorical[id] || {}).models || []) : ((RUBRIC.booleans.find(b => b.id === id) || {}).models || []);
  const M = ST.draft.meta[kind] = ST.draft.meta[kind] || {};
  if (JSON.stringify(on.slice().sort()) === JSON.stringify(base.slice().sort())) { if (M[id]) { delete M[id].models; if (!Object.keys(M[id]).length) delete M[id]; } }
  else (M[id] = M[id] || {}).models = on;
  saveStudioDraft(); renderStudioStatus();
}
function filterDetailRows(q) {
  q = String(q || '').trim().toLowerCase();
  document.querySelectorAll('.det-tbl tbody tr').forEach(r => r.style.display = !q || (r.dataset.q || '').includes(q) ? '' : 'none');
  if (q) document.querySelectorAll('#studio-pane details.paste').forEach(d => d.open = true);
}
function paneStDetails() {
  const shown = (kind, id, key) => { const v = metaVal(kind, id, key); return Array.isArray(v) ? v.join(', ') : (v == null ? '' : v); };
  const inp = (kind, id, key, ph, wide) => `<input class="form-inp lbl-inp" style="${wide ? '' : 'min-width:110px'}" value="${esc(shown(kind, id, key))}" placeholder="${esc(ph || 'Built-in')}" onchange="setMeta('${kind}','${esc(id)}','${key}', this.value)">`;
  const sel = (kind, id, key, opts) => {
    const c = metaVal(kind, id, key), cur = c === true ? 'yes' : c === false ? 'no' : (c == null ? '' : c);
    return `<select class="st-num" style="width:auto" onchange="setMeta('${kind}','${esc(id)}','${key}', this.value)">${opts.map(([v, l]) => `<option value="${v}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  };
  const tbl = (title, head, rows) => `<details class="paste" style="margin-top:10px"><summary>${esc(title)}</summary><div class="tbl-wrap det-tbl"><table class="ledger"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></details>`;
  const fieldRows = BASE.sectionFields.flatMap(b => b.fields.filter(f => f.t !== 'bool').map(f => {
    const base = BASE.fmeta[f.id] || {};
    return `<tr data-q="${esc((f.id + ' ' + BASE.flabel[f.id]).toLowerCase())}"><td>${esc(BASE.flabel[f.id])}<div class="field-hint">${esc(f.id)}</div></td>
      <td>${inp('fields', f.id, 'group', base.g || 'Group heading')}</td>
      <td>${f.t === 'num' ? inp('fields', f.id, 'chips', (base.chips || []).join(', ') || 'e.g. 10, 20, 30') : f.t === 'select' ? inp('fields', f.id, 'addOptions', 'Extra choices, comma-separated', true) : '—'}</td>
      <td>${f.t === 'num' ? sel('fields', f.id, 'unit', [['', 'Built-in'], ['$', '$'], ['%', '%'], ['x', 'x'], ['months', 'months'], ['pts', 'points'], ['count', 'count']]) : '—'}</td>
      <td>${sel('fields', f.id, 'required', [['', base.req ? 'Built-in: required' : 'Built-in: optional'], ['yes', 'Required'], ['no', 'Optional']])}</td></tr>`;
  })).join('');
  const recRow = `<tr data-q="reconcile contradictions figures do not reconcile"><td>Figures do not reconcile<div class="field-hint">reconcile (blocks after the number of material contradictions set in Weights &amp; rules)</div></td>
      <td>${inp('gates', 'reconcile', 'why', 'Built-in explanation', true)}</td><td>—</td><td>${inp('gates', 'reconcile', 'lever', LEVER_DEFAULTS.gates, true)}</td><td>—</td></tr>`;
  const gateRows = RUBRIC.gates.map(g => `<tr data-q="${esc((g.id + ' ' + g.title).toLowerCase())}"><td>${esc(BASE.gtitle[g.id])}<div class="field-hint">${esc(g.id)}</div></td>
      <td>${inp('gates', g.id, 'why', BASE.gwhy ? BASE.gwhy[g.id] : '', true)}</td><td>${inp('gates', g.id, 'ask', 'Built-in request to the founder', true)}</td>
      <td>${inp('gates', g.id, 'lever', LEVER_DEFAULTS.gates, true)}</td>
      <td>${sel('gates', g.id, 'when', [['', 'Built-in'], ['yes', 'Blocks when the answer is yes'], ['no', 'Blocks when the answer is no']])}</td></tr>`).join('') + recRow;
  const patRows = BUILTIN.patterns.map(([id, t]) => `<tr data-q="${esc((id + ' ' + t).toLowerCase())}"><td>${esc(t)}<div class="field-hint">${esc(id)}</div></td>
      <td>${sel('patterns', id, 'sev', [['', 'Built-in'], ['red', 'Risk'], ['amber', 'Watch'], ['green', 'Strength']])}</td>
      <td>${sel('patterns', id, 'risk', [['', 'Built-in'], ['product', 'Product'], ['market', 'Market'], ['execution', 'Execution'], ['financial', 'Financial'], ['legal', 'Legal'], ['deal', 'Deal']])}</td>
      <td>${inp('patterns', id, 'why', 'Built-in explanation', true)}</td><td>${inp('patterns', id, 'ask', 'Built-in question', true)}</td>
      <td>${inp('patterns', id, 'lever', LEVER_DEFAULTS.risk_patterns, true)}</td></tr>`).join('');
  const clRows = DILIGENCE.map((d, i) => `<tr data-q="${esc((d.id + ' ' + d.text).toLowerCase())}"><td>${esc(d.text)}</td>
      <td>${inp('checklist', d.id, 'cat', _dilBase && _dilBase[i] ? _dilBase[i].cat : d.cat)}</td>
      <td>${sel('checklist', d.id, 'from', [['', 'Built-in'], ['preseed', 'Pre-seed'], ['seed', 'Seed'], ['a', 'Series A'], ['b', 'Series B+']])}</td>
      <td>${inp('checklist', d.id, 'why', 'Why investors ask', true)}</td></tr>`).join('');
  const chkRows = BUILTIN.checks.map(([id, t]) => `<tr data-q="${esc((id + ' ' + t).toLowerCase())}"><td>${esc((ST.draft.labels.checks || {})[id] || t)}<div class="field-hint">${esc(id)}</div></td>
      <td>${inp('checks', id, 'text', 'Built-in explanation (it names the figures)', true)}</td><td>${inp('checks', id, 'ask', 'Built-in question to the founder', true)}</td>
      <td>${inp('checks', id, 'lever', LEVER_DEFAULTS.contradictions, true)}</td></tr>`).join('');
  const modelCells = (kind, id, base) => {
    const cur = metaVal(kind, id, 'models'), list = Array.isArray(cur) ? cur : (base || []);
    return `<div class="bi-grid">${modelOpts().map(([v, l]) => `<label class="bi"><input type="checkbox" data-mk="${esc(kind + ':' + id)}" value="${esc(v)}" ${list.includes(v) ? 'checked' : ''} onchange="setMetaModels('${kind}','${esc(id)}')"> <span>${esc(l)}</span></label>`).join('')}</div>`;
  };
  const ansModelRows = CAT_DEFS.map(([key, field, label]) => `<tr data-q="${esc((key + ' ' + label).toLowerCase())}"><td>${esc(label)}<div class="field-hint">${esc(key)}</div></td><td>${modelCells('answers', key, RUBRIC.categorical[key].models)}</td></tr>`).join('')
    + RUBRIC.booleans.map(b => `<tr data-q="${esc((b.id + ' ' + b.note).toLowerCase())}"><td>${esc(b.note)}<div class="field-hint">${esc(b.id)}</div></td><td>${modelCells('booleans', b.id, b.models)}</td></tr>`).join('');
  const FAM_LABELS = { gates:'Deal-breakers', contradictions:'Major contradictions', risk_patterns:'Red flags', forensics:'Ledger forensic signals', inconsistencies:'Minor inconsistencies',
    watch_patterns:'Watch patterns', missing_inputs:'Missing inputs', not_measurable:'Metrics not yet measurable', weak_dimensions:'Weak dimensions', thin_evidence:'Thin evidence',
    unverified_inputs:'Unverified inputs', confirm_calls:'Confirmatory customer calls', confirm_funds:'Confirmatory use of funds' };
  const famRows = Object.keys(LEVER_DEFAULTS).map(f => `<tr data-q="${esc((f + ' ' + (FAM_LABELS[f] || f)).toLowerCase())}"><td>${esc(FAM_LABELS[f] || f)}<div class="field-hint">${esc(f)}</div></td>
      <td>${inp('families', f, 'lever', LEVER_DEFAULTS[f], true)}</td>
      <td><input class="st-num" type="number" min="0" max="10" step="any" value="${esc(metaVal('families', f, 'p') != null ? metaVal('families', f, 'p') : '')}" placeholder="${esc(QUESTION_P[f] != null ? QUESTION_P[f] : '')}" aria-label="Order of ${esc(FAM_LABELS[f] || f)}" onchange="setMeta('families','${esc(f)}','p', this.value)"></td></tr>`).join('');
  const promptRows = ['memo', 'extraction'].map(k => `<tr data-q="ai prompt ${k}"><td>${k === 'memo' ? 'Memo narrative' : 'Extraction from pasted material'}</td>
      <td class="field-hint">${esc(AI_RULES[k])}</td>
      <td>${k === 'memo' ? inp('prompts', k, 'voice', AI_VOICE_DEFAULT, true) : '—'}</td><td>${inp('prompts', k, 'note', 'Nothing added', true)}</td></tr>`).join('');
  const boolRows = RUBRIC.booleans.map(b => `<tr data-q="${esc((b.id + ' ' + b.note).toLowerCase())}"><td>${esc(b.id)}<div class="field-hint">${esc(b.pts > 0 ? '+' + b.pts : String(b.pts))} points</div></td>
      <td>${inp('booleans', b.id, 'note', b.note, true)}</td>
      <td>${sel('booleans', b.id, 'dim', [['', 'Built-in']].concat(Object.keys(BASE.dimlabel).map(k => [k, BASE.dimlabel[k]])).concat(dimensionChoices()))}</td></tr>`).join('');
  return `<p class="pg-desc">The parts of built-in items that are not their name: quick-pick values, choices, deal-breaker explanations and triggers, red-flag severity, checklist categories and the wording of yes/no points. Leave a box empty for the built-in value. Names are on the Rename tab; points are on Scored answers.</p>
    <input class="form-inp" placeholder="Search…" oninput="filterDetailRows(this.value)" style="max-width:420px;margin-bottom:4px">
    ${tbl('Fields: group heading, quick picks, extra choices, unit, required', ['Field', 'Group heading', 'Quick picks / extra choices', 'Unit', 'Required'], fieldRows)}
    ${tbl('Deal-breakers: explanation, request, lever, trigger', ['Deal-breaker', 'Why it matters', 'Request to the founder', 'If unresolved (lever)', 'Trigger'], gateRows)}
    ${tbl('Red flags and strengths: severity, risk row, explanation, question, lever', ['Pattern', 'Severity', 'Risk row', 'Explanation', 'Question', 'If unresolved (lever)'], patRows)}
    ${tbl('Scored answers and yes/no points: business models they apply to (none ticked: every model)', ['Answer or point', 'Applies to'], ansModelRows)}
    ${tbl('Consistency checks: explanation, question and lever', ['Check', 'Explanation when it fires', 'Question to the founder', 'If unresolved (lever)'], chkRows)}
    ${tbl('Question families: what you do if it stays unresolved (the lever)', ['Family', 'Your wording (empty: built-in)', 'Order (0 first, 10 last)'], famRows)}
    ${tbl('AI prompts (optional memo drafting and extraction): voice and added instructions', ['Prompt', 'Fixed rules (read only)', 'Your voice (memo only)', 'Your added instructions'], promptRows)}
    ${tbl('Checklist: category, starting stage, reason', ['Item', 'Category', 'From stage', 'Why'], clRows)}
    ${tbl('Yes/no points: wording and dimension', ['Answer', 'Wording', 'Dimension'], boolRows)}`;
}

/* ── The owner's names, and the figures that are computed but not scored ── */
const metricName = k => ((ST.draft && ST.draft.labels && ST.draft.labels.metrics) || {})[k] || BASE.dlabel[k] || k;
function dimOptsNow() {
  const L = (ST.draft && ST.draft.labels && ST.draft.labels.dims) || {};
  return DIM_OPTS.map(([v, l]) => [v, v ? (L[v] || BASE.dimlabel[v] || l) : l]);
}
/* Figures VCR2 computes and shows but does not score (customer lifetime, CAC, ACV, implied burn…): name, unit, calculation and switch-off. */
function otherFiguresTable() {
  const keys = Object.keys(BASE.dlabel).filter(k => !(k in RUBRIC.thresholds));
  if (!keys.length) return '';
  const rows = keys.map(k => {
    const mine = ST.draft.formulas[k] || (ST.draft.labels.units || {})[k] || (ST.draft.labels.metrics || {})[k] || ST.draft.hidden.metrics.includes(k);
    return `<tr data-q="${esc((k + ' ' + metricName(k)).toLowerCase())}"><td>${esc(metricName(k))}${mine ? ' <span class="pill amber">yours</span>' : ''}${ST.draft.hidden.metrics.includes(k) ? ' <span class="pill">switched off</span>' : ''}<div class="field-hint">${esc(k)}</div></td>
      <td class="m">${esc(ST.draft.formulas[k] || 'built-in')}</td><td style="text-align:right"><button class="btn btn-ghost btn-sm" data-k="${esc(k)}" onclick="editDerived(this.dataset.k)">Change</button></td></tr>`;
  }).join('');
  return `<div class="block-title" style="margin-top:16px">Other figures VCR2 computes (shown, not scored)</div>
    <p class="field-hint" style="margin-bottom:6px">Customer lifetime, CAC, ACV, implied burn and similar. You can rename one, change its unit, replace its calculation or switch it off.</p>
    <div class="tbl-wrap"><table class="ledger"><thead><tr><th>Figure</th><th>Calculation</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function editDerived(key) {
  const f = ST.draft.formulas[key] || '', u = (ST.draft.labels.units || {})[key] || '', lbl = (ST.draft.labels.metrics || {})[key] || '';
  openModal(`Computed figure: ${metricName(key)}`, `
    ${edRow('Name', `<input class="form-inp" id="dv-label" value="${esc(lbl)}" placeholder="${esc(BASE.dlabel[key])}">`)}
    ${edRow('Unit', `<select class="field-select" id="thr-unit">${optionList(UNIT_CHOICES, u)}</select>`)}
    ${edRow('Replace the calculation (optional)', formulaBox('thr-formula', f, { optional:true, self:key, allowSelf:true }), `The figure’s own name stands for the built-in value, e.g. <code>${esc(key)} * 0.9</code>.`)}
    <label class="api-check" style="font-size:0.875rem"><input type="checkbox" id="dv-off" ${ST.draft.hidden.metrics.includes(key) ? 'checked' : ''}> Switch this figure off</label>`,
    [{ label:'Save', primary:true, onClick:() => saveDerived(key) }, { label:'Back to the built-in', onClick:() => { delete ST.draft.formulas[key]; if (ST.draft.labels.units) delete ST.draft.labels.units[key]; if (ST.draft.labels.metrics) delete ST.draft.labels.metrics[key]; ST.draft.hidden.metrics = ST.draft.hidden.metrics.filter(x => x !== key); saveStudioDraft(); closeModal(); renderStudioPane(); } }]);
}
function saveDerived(key) {
  const src = $id('thr-formula').value.trim();
  if (src) { const r = fxValidate(src, { optional:false, self:key, allowSelf:true, cfg:ST.draft }); if (!r.ok) { toast('The calculation does not work: ' + r.error, 'err'); return; } ST.draft.formulas[key] = src; } else delete ST.draft.formulas[key];
  const unit = $id('thr-unit').value; ST.draft.labels.units = ST.draft.labels.units || {};
  if (unit) ST.draft.labels.units[key] = unit; else delete ST.draft.labels.units[key];
  const label = $id('dv-label').value.trim(); ST.draft.labels.metrics = ST.draft.labels.metrics || {};
  if (label && label !== BASE.dlabel[key]) ST.draft.labels.metrics[key] = label; else delete ST.draft.labels.metrics[key];
  const off = $id('dv-off').checked, L = ST.draft.hidden.metrics, i = L.indexOf(key);
  if (off && i < 0) L.push(key); if (!off && i >= 0) L.splice(i, 1);
  saveStudioDraft(); closeModal(); renderStudioPane();
}
