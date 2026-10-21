
/* ═══════════════════════════════════════════════════════════════
   STUDIO, second part (5.0): edit any text on the site, and the panes added for full owner control.
   ═══════════════════════════════════════════════════════════════ */

/* ── Edit texts on the site: the owner clicks any text and rewrites it ── */
function textEditActive() {
  try { return localStorage.getItem('vcr2-edit-texts') === '1' && !!localStorage.getItem('vcr2-owner') && previewOn(); } catch (e) { return false; }
}
function textDraft() {
  if (!ST.draft) { const d = studioDraft(); ST.draft = d || normalizeConfig(JSON.parse(JSON.stringify(CFG_PUBLISHED))); }
  if (!Array.isArray(ST.draft.texts)) ST.draft.texts = [];
  return ST.draft;
}
function startTextEdit() {
  try { localStorage.setItem('vcr2-edit-texts', '1'); } catch (e) {}
  textDraft();
  try { localStorage.setItem('vcr2-studio-preview', '1'); } catch (e) {}
  saveStudioDraft();
  leaveStudio();
  renderTextEditBanner();
  toast('Text edit mode: click any text to change it. Nothing is published until you publish from the Studio.');
}
function stopTextEdit() {
  try { localStorage.removeItem('vcr2-edit-texts'); } catch (e) {}
  const b = $id('te-banner'); if (b) b.remove();
  document.body.classList.remove('te-on');
  closeModal();
}
function renderTextEditBanner() {
  let el = $id('te-banner');
  if (!textEditActive()) { if (el) el.remove(); document.body.classList.remove('te-on'); return; }
  if (!el) { el = document.createElement('div'); el.id = 'te-banner'; el.className = 'preview-banner te-banner'; el.setAttribute('data-no-text-edit', ''); document.body.appendChild(el); }
  document.body.classList.add('te-on');
  el.innerHTML = `Text edit mode — click any text on the page to change it. <a href="#studio" onclick="stopTextEdit();goStudio();return false">Back to the Studio</a> · <a href="#" onclick="stopTextEdit();return false">Leave edit mode</a>`;
}
function textNodeAt(x, y) {
  let n = null;
  try {
    if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); n = r && r.startContainer; }
    else if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); n = p && p.offsetNode; }
  } catch (e) { n = null; }
  return n && n.nodeType === 3 ? n : null;
}
function onTextEditClick(e) {
  if (!textEditActive()) return;
  const t = e.target;
  if (!t || !t.closest || t.closest('#te-banner, #preview-banner, #modal-wrap, [data-no-text-edit]')) return;
  e.preventDefault(); e.stopPropagation();
  let node = textNodeAt(e.clientX, e.clientY);
  if (!node || !String(node.nodeValue).trim()) {
    node = null;
    const w = document.createTreeWalker(t, 4); let n;
    while ((n = w.nextNode())) if (String(n.nodeValue).trim().length > 1) { node = n; break; }
  }
  if (!node) { toast('There is no text to change here. Click on a sentence or a label.'); return; }
  openTextEdit(txOriginalOf(node));
}
function openTextEdit(original) {
  const d = textDraft(), cur = d.texts.find(r => r.from === original);
  const digits = /\d/.test(original);
  openModal('Change this text',
    `<label class="form-lbl" for="te-from">The words on the site (shorten it to change only part of the sentence)</label>
     <textarea class="intake-ta" id="te-from" style="min-height:70px">${esc(original)}</textarea>
     <label class="form-lbl" for="te-to" style="margin-top:8px">Replace with</label>
     <textarea class="intake-ta" id="te-to" style="min-height:70px">${esc(cur ? cur.to : original)}</textarea>
     <p class="field-hint">Plain text only. ${digits ? 'This text contains numbers that change with each company, so it will only be replaced when they match; shorten the first box to just the wording to replace it everywhere. ' : ''}Leave the second box empty to remove the words.</p>`,
    [{ label:'Save change', primary:true, onClick:() => saveTextEdit(original) },
     ...(cur ? [{ label:'Back to the built-in text', onClick:() => { removeTextReplacement(original); closeModal(); } }] : [])]);
}
function saveTextEdit(original) {
  const from = $id('te-from').value, to = $id('te-to').value;
  if (!from.trim()) { toast('The words to replace cannot be empty.', 'err'); return; }
  const d = textDraft();
  d.texts = d.texts.filter(r => r.from !== original && r.from !== from);
  if (from !== to) d.texts.push({ from:from.slice(0, 400), to:to.slice(0, 800) });
  saveStudioDraft(); closeModal(); refreshAfterConfig();
  toast('Changed in your draft. Publish from the Studio to make it live.');
}
function removeTextReplacement(from) {
  const d = textDraft(); d.texts = d.texts.filter(r => r.from !== from);
  saveStudioDraft(); refreshAfterConfig();
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('click', onTextEditClick, true);
  document.addEventListener('DOMContentLoaded', () => renderTextEditBanner());
}

/* ── Pane: every text replacement, with a way back for each ── */
function paneStAnyText() {
  const L = textDraft().texts;
  const rows = L.map((r, i) => `<tr>
      <td><textarea class="intake-ta" style="min-height:44px" aria-label="Words on the site" onchange="setTextReplacement(${i}, 'from', this.value)">${esc(r.from)}</textarea></td>
      <td><textarea class="intake-ta" style="min-height:44px" aria-label="Replacement" onchange="setTextReplacement(${i}, 'to', this.value)">${esc(r.to)}</textarea></td>
      <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" onclick="deleteTextReplacement(${i})">Back to built-in</button></td></tr>`).join('');
  return `<p class="pg-desc">Change any wording on the site: headings, buttons, explanations, the disclaimer, the memo and the founder email. Click <b>Edit texts on the site</b>, then click any text. Replacements are plain text and apply everywhere the same words appear.</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:9px 0"><button class="btn btn-primary" onclick="startTextEdit()">Edit texts on the site</button>
      <button class="btn btn-ghost" onclick="addTextReplacement()">Add a replacement by typing</button></div>
    ${L.length ? `<table class="lbl-tbl"><thead><tr><th>Words on the site</th><th>Your words</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <p class="field-hint">${L.length} of ${TX_MAX} replacements. A replacement whose words are no longer on the site does nothing and can be removed.</p>`
      : `<div class="empty-card"><h3>No text changed yet</h3><p>Everything reads as built in.</p></div>`}`;
}
function setTextReplacement(i, k, v) {
  const d = textDraft(), r = d.texts[i]; if (!r) return;
  r[k] = String(v);
  if (!r.from.trim() || r.from === r.to) d.texts.splice(i, 1);
  saveStudioDraft(); renderStudioPane();
}
function deleteTextReplacement(i) { const d = textDraft(); d.texts.splice(i, 1); saveStudioDraft(); renderStudioPane(); }
function addTextReplacement() {
  const d = textDraft();
  if (d.texts.length >= TX_MAX) { toast(`The limit is ${TX_MAX} replacements.`, 'err'); return; }
  d.texts.push({ from:'Words on the site', to:'Your words' });
  saveStudioDraft(); renderStudioPane();
}

/* ── Scoring constants: every number that used to be fixed in the engine, with its built-in value and a way back ── */
function constValue(d) { const o = ST.draft.settings[d.id]; const v = cleanSetting(d, o); return v === undefined ? d.def : v; }
function constIsSet(d) { return cleanSetting(d, ST.draft.settings[d.id]) !== undefined && canonJSON(cleanSetting(d, ST.draft.settings[d.id])) !== canonJSON(d.def); }
function constControl(d) {
  const cur = constValue(d), id = esc(d.id);
  if (d.kind === 'select') return `<select class="form-inp" style="margin:0;max-width:420px" aria-label="${esc(d.label)}" onchange="setConst('${id}', this.value)">${d.options.map(([v, l]) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  if (d.kind === 'text') return `<input class="form-inp" style="width:90px;margin:0" maxlength="3" value="${esc(cur)}" aria-label="${esc(d.label)}" onchange="setConst('${id}', this.value)">`;
  if (d.kind === 'numbers') return `<span class="const-row" data-const="${id}">${cur.map((x, i) => `<input class="form-inp" style="width:84px;margin:0 4px 0 0" type="number" value="${x}" aria-label="${esc(d.label)} ${i + 1}" onchange="setConstArray('${id}')">`).join('')}</span>`;
  return `<input class="form-inp" style="width:120px;margin:0" type="number" step="${d.step || 1}" min="${d.min}" max="${d.max}" value="${cur}" aria-label="${esc(d.label)}" onchange="setConst('${id}', this.value)">`;
}
function paneStConstants() {
  const groups = [];
  SETTING_DEFS.forEach(d => { let g = groups.find(x => x[0] === d.group); if (!g) groups.push(g = [d.group, []]); g[1].push(d); });
  const builtinText = d => d.kind === 'select' ? (d.options.find(o => o[0] === d.def) || [d.def, d.def])[1] : Array.isArray(d.def) ? d.def.join(' / ') : String(d.def);
  const anySet = SETTING_DEFS.some(constIsSet);
  return `<p class="pg-desc">The constants behind how a value becomes a score, how confident the report sounds and how scores are shown. Each shows the built-in value; clear it to go back. Changing these changes scores, so the report states how many settings differ from the built-in ones.</p>
    ${anySet ? `<button class="btn btn-ghost btn-sm" onclick="resetAllConsts()">Reset all of these to the built-in values</button>` : ''}
    ${groups.map(([g, ds]) => `<div class="block-title" style="margin-top:14px">${esc(g)}</div>
      ${ds.map(d => `<div class="const-item"><div class="const-l"><label class="form-lbl" style="margin:0">${esc(d.label)}</label>${d.help ? `<div class="field-hint">${esc(d.help)}</div>` : ''}</div>
        <div class="const-c">${constControl(d)}<div class="field-hint">Built-in: ${esc(builtinText(d))}${constIsSet(d) ? ` · <a href="#" onclick="resetConst('${esc(d.id)}');return false">use the built-in</a>` : ''}</div></div></div>`).join('')}`).join('')}${aiModelBlock()}`;
}
function setConst(id, v) {
  const d = SETTING_DEF_BY_ID[id]; if (!d) return;
  const c = cleanSetting(d, d.kind === 'number' ? parseNum(v) : v);
  if (c === undefined || canonJSON(c) === canonJSON(d.def)) delete ST.draft.settings[id]; else ST.draft.settings[id] = c;
  saveStudioDraft(); renderStudioPane();
}
function setConstArray(id) {
  const d = SETTING_DEF_BY_ID[id], box = document.querySelector(`[data-const="${id}"]`); if (!d || !box) return;
  const vals = Array.from(box.querySelectorAll('input')).map(i => parseNum(i.value));
  const c = cleanSetting(d, vals);
  if (c === undefined) { toast(`The ${d.n} numbers must be between ${d.min} and ${d.max}${d.ascending ? ' and rise from left to right' : ''}.`, 'err'); renderStudioPane(); return; }
  if (canonJSON(c) === canonJSON(d.def)) delete ST.draft.settings[id]; else ST.draft.settings[id] = c;
  saveStudioDraft(); renderStudioPane();
}
function resetConst(id) { delete ST.draft.settings[id]; saveStudioDraft(); renderStudioPane(); }
function resetAllConsts() { SETTING_DEFS.forEach(d => delete ST.draft.settings[d.id]); saveStudioDraft(); renderStudioPane(); toast('Back to the built-in values in your draft.'); }

/* ── Scoring dimensions and stages the owner adds ── */
function newSlug(label, taken, prefix) {
  const base = (prefix + (slug(label).replace(/^[^a-z]+/, '') || 'item')).slice(0, 22); let id = base, k = 2;
  while (taken.includes(id)) id = base.slice(0, 20) + '_' + k++;
  return id;
}
function paneStDimensions() {
  const L = ST.draft.dimensions, add = `<button class="btn btn-primary btn-sm" onclick="editItem('dimensions',-1)">Add a scoring dimension</button>`;
  return `<p class="pg-desc">VCR2 scores six dimensions: revenue, capital, go-to-market, team, market and governance. Add another — regulatory risk, customer concentration, ESG — then put metrics in it (the “Dimension” box of a metric) and set its weight under <a href="#" onclick="studioTab('scoring');return false">Weights &amp; rules</a>. It starts at about a tenth of the headline score. Up to four.</p>
    ${L.length ? `<div style="margin-bottom:8px">${add}</div><div class="tbl-wrap"><table class="ledger"><thead><tr><th>Dimension</th><th>Description</th><th>Name in formulas</th><th></th></tr></thead><tbody>
      ${L.map((d, i) => `<tr><td>${esc(d.label)}</td><td style="color:var(--t2)">${esc(d.desc)}</td><td class="m">${esc(d.id)}</td>${rowActions('dimensions', i)}</tr>`).join('')}</tbody></table></div>` : stEmpty('scoring dimensions of your own', add)}`;
}
function editDimension(d, i) {
  openModal(i >= 0 ? 'Edit scoring dimension' : 'Add a scoring dimension', `
    ${edRow('Name', `<input class="form-inp" id="ed-name" value="${esc(d.label || '')}" placeholder="e.g. Regulatory exposure">`)}
    ${edRow('What it covers (shown in the report)', `<input class="form-inp" id="ed-desc" value="${esc(d.desc || '')}" placeholder="e.g. Licences, data protection, sector rules">`)}`,
    [{ label:'Save dimension', primary:true, onClick:() => {
      const label = val('ed-name').trim(); if (!label) { toast('Give the dimension a name.', 'err'); return; }
      if (i < 0 && ST.draft.dimensions.length >= 4) { toast('Up to four dimensions can be added.', 'err'); return; }
      const taken = ['revenue','capital','gtm','team','market','govern'].concat(ST.draft.dimensions.map(x => x.id));
      commitItem('dimensions', i, { id:d.id || newSlug(label, taken, 'd_'), label, desc:val('ed-desc').trim() });
    } }]);
}
function paneStStages() {
  const L = ST.draft.stages, add = `<button class="btn btn-primary btn-sm" onclick="editItem('stages',-1)">Add a stage</button>`;
  const names = ['preseed','seed','a','b'].map(s => `<div class="st-row"><span>${esc(BASE.stageName[s])}</span><input class="form-inp" style="max-width:240px;margin:0" aria-label="Name of ${esc(BASE.stageName[s])}" value="${esc((ST.draft.labels.stages || {})[s] || '')}" placeholder="${esc(BASE.stageName[s])}" onchange="setStageName('${s}', this.value)"></div>`).join('');
  return `<p class="pg-desc">Rename the four stages, or add a stage of your own (Series C, Growth, Pre-IPO). A stage you add is scored with the healthy ranges, weights and deal defaults of the built-in stage you pick, and shows its own name and ARR range.</p>
    <div class="block-title">Names of the built-in stages</div>${names}
    <div class="block-title" style="margin-top:14px">Stages you added</div>
    ${L.length ? `<div style="margin-bottom:8px">${add}</div><div class="tbl-wrap"><table class="ledger"><thead><tr><th>Stage</th><th>ARR range</th><th>Scored like</th><th></th></tr></thead><tbody>
      ${L.map((s, i) => `<tr><td>${esc(s.name)}</td><td class="m">${s.lo || s.hi ? esc((s.lo ? money(s.lo) : '0') + ' – ' + (s.hi ? money(s.hi) : 'and above')) : '—'}</td><td>${esc(BASE.stageName[s.like])}</td>${rowActions('stages', i)}</tr>`).join('')}</tbody></table></div>` : stEmpty('stages of your own', add)}`;
}
function setStageName(st, v) {
  ST.draft.labels.stages = ST.draft.labels.stages || {};
  const t = String(v || '').trim(); if (t && t !== BASE.stageName[st]) ST.draft.labels.stages[st] = t; else delete ST.draft.labels.stages[st];
  saveStudioDraft();
}
function editStage(s, i) {
  openModal(i >= 0 ? 'Edit stage' : 'Add a stage', `
    ${edRow('Name', `<input class="form-inp" id="ed-name" value="${esc(s.name || '')}" placeholder="e.g. Series C">`)}
    ${edRow('Scored like', `<select class="field-select" id="ed-like">${optionList(['preseed','seed','a','b'].map(x => [x, BASE.stageName[x]]), s.like || 'b')}</select>`, 'The built-in stage whose healthy ranges, weights and deal defaults it uses.')}
    ${edRow('ARR range from ($, optional)', `<input class="form-inp" type="number" id="ed-lo" value="${esc(s.lo != null ? s.lo : '')}">`)}
    ${edRow('ARR range up to ($, optional)', `<input class="form-inp" type="number" id="ed-hi" value="${esc(s.hi != null ? s.hi : '')}">`, 'Used by the stage-mismatch flag and shown on the setup page.')}
    ${edRow('Short description (optional)', `<input class="form-inp" id="ed-desc" value="${esc(s.desc || '')}">`)}`,
    [{ label:'Save stage', primary:true, onClick:() => {
      const name = val('ed-name').trim(); if (!name) { toast('Give the stage a name.', 'err'); return; }
      if (i < 0 && ST.draft.stages.length >= 4) { toast('Up to four stages can be added.', 'err'); return; }
      const taken = ['preseed','seed','a','b'].concat(ST.draft.stages.map(x => x.id));
      commitItem('stages', i, { id:s.id || newSlug(name, taken, 's_'), name, like:val('ed-like'), lo:parseNum(val('ed-lo')), hi:parseNum(val('ed-hi')), desc:val('ed-desc').trim() });
    } }]);
}
function aiModelBlock() {
  const cur = ST.draft.settings.aiModels || {};
  const rows = Object.entries(PROVIDERS).filter(([id, p]) => p.needsKey).map(([id, p]) => `<div class="st-row"><span>${esc(p.name)}</span><input class="form-inp" style="max-width:300px;margin:0" aria-label="Model name for ${esc(p.name)}" value="${esc(cur[id] || '')}" placeholder="${esc(p.model)}" onchange="setAiModel('${id}', this.value)"></div>`).join('');
  return `<div class="block-title" style="margin-top:14px">AI memo drafting: model names</div>
    <p class="field-hint" style="margin-bottom:6px">The model each provider is called with when a visitor turns the optional memo drafting on. Leave empty for the built-in name. The provider web addresses are fixed in the code, so a visitor’s key can only go to the provider they chose.</p>${rows}`;
}
function setAiModel(p, v) {
  const m = ST.draft.settings.aiModels = ST.draft.settings.aiModels || {};
  const t = String(v || '').trim();
  if (t && t !== PROVIDERS[p].model) m[p] = t; else delete m[p];
  if (!Object.keys(m).length) delete ST.draft.settings.aiModels;
  saveStudioDraft();
}
