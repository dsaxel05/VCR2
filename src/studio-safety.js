
/* ═══════════════════════════════════════════════════════════════
   STUDIO SAFETY: undo and redo, reset everything, what differs from built-in, review and impact before publishing,
   publish history with revert, and the advanced JSON editor with live validation.
   ═══════════════════════════════════════════════════════════════ */

/* ── Undo / redo ── */
ST.undo = []; ST.redo = []; ST.lastSnap = null;
const UNDO_MAX = 60;
function studioResetTrack() { ST.lastSnap = ST.draft ? JSON.stringify(ST.draft) : null; }
/* Called by saveStudioDraft(): remember the state the draft had before this change. */
function studioTrack() {
  if (!ST.draft) return;
  const now = JSON.stringify(ST.draft);
  if (ST.lastSnap == null) { ST.lastSnap = now; return; }
  if (now === ST.lastSnap) return;
  ST.undo.push(ST.lastSnap); if (ST.undo.length > UNDO_MAX) ST.undo.shift();
  ST.redo = []; ST.lastSnap = now;
  renderUndoState();
}
function renderUndoState() {
  const u = $id('st-undo'), r = $id('st-redo');
  if (u) u.disabled = !ST.undo.length;
  if (r) r.disabled = !ST.redo.length;
}
function studioRestore(snap) {
  ST.draft = normalizeConfig(JSON.parse(snap)); ST.lastSnap = JSON.stringify(ST.draft);
  try { localStorage.setItem('vcr2-studio-draft', JSON.stringify(ST.draft)); } catch (e) {}
  if (previewOn()) refreshAfterConfig();
  renderStudioStatus(); renderStudioPane(); renderUndoState();
}
function studioUndo() {
  if (!ST.undo.length) return;
  ST.redo.push(JSON.stringify(ST.draft));
  studioRestore(ST.undo.pop());
  toast('Undone.');
}
function studioRedo() {
  if (!ST.redo.length) return;
  ST.undo.push(JSON.stringify(ST.draft));
  studioRestore(ST.redo.pop());
  toast('Redone.');
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || !ST.draft || !$id('studio-pane')) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    const k = String(e.key).toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); studioUndo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); studioRedo(); }
  });
}

/* ── Reset everything ── */
function resetEverything() {
  if (!settingsDiff(ST.draft).length) { toast('Your draft already matches the built-in site.'); return; }
  if (!confirm('Put every setting in your draft back to the built-in value? Your published site is not changed until you publish; you can undo this.')) return;
  const keep = { owner:ST.draft.owner, repo:ST.draft.repo, branch:ST.draft.branch, path:ST.draft.path };
  ST.draft = Object.assign(normalizeConfig(EMPTY_CONFIG()), keep);
  saveStudioDraft(); renderStudio();
  toast('Everything is back to the built-in values in your draft.');
}

/* ── What differs from built-in, with a way back for each ── */
function delPath(o, parts) {
  if (!o || typeof o !== 'object') return;
  if (parts.length === 1) { delete o[parts[0]]; return; }
  delPath(o[parts[0]], parts.slice(1));
  if (o[parts[0]] && typeof o[parts[0]] === 'object' && !Array.isArray(o[parts[0]]) && !Object.keys(o[parts[0]]).length) delete o[parts[0]];
}
const DIFF_LISTS = ['fields', 'metrics', 'checks', 'questions', 'patterns', 'requests', 'checklist', 'gates', 'models', 'dimensions', 'stages', 'benchmarks'];
function resetDiffItem(area, key) {
  const d = ST.draft;
  if (DIFF_LISTS.includes(area)) {
    const idk = area === 'metrics' ? 'key' : 'id';
    const i = d[area].findIndex(x => String(x[idk]) === key);
    if (i >= 0 && confirm('Delete this item from your draft? You can undo this.')) d[area].splice(i, 1); else return;
  } else if (area === 'texts') d.texts = d.texts.filter(t => t.from !== key);
  else if (area === 'hidden') { const [kind, ...rest] = key.split('.'), id = rest.join('.'); d.hidden[kind] = d.hidden[kind].filter(x => x !== id); }
  else if (['thresholds', 'metricWeights', 'formulas', 'checkTol', 'branding', 'look'].includes(area)) delete d[area][key];
  else if (area === 'categorical' || area === 'labels') { const i = key.indexOf('.'), a = key.slice(0, i), b = key.slice(i + 1); if (d[area][a]) { delete d[area][a][b]; if (!Object.keys(d[area][a]).length) delete d[area][a]; } }
  else delPath(d[area], key.split('.'));
  if (area === 'thresholds') { /* a healthy range goes back together with its weight note */ }
  saveStudioDraft(); renderStudioPane();
}
function paneStDiffers() {
  const L = settingsDiff(ST.draft);
  const groups = {}; L.forEach(d => (groups[d.area] = groups[d.area] || []).push(d));
  const n = L.length;
  return `<p class="pg-desc">Everything in your draft that is not the built-in site: ${n ? `<b>${n}</b> setting${n === 1 ? '' : 's'}` : 'nothing yet'}. Each has a way back. The same count appears on every report as “N settings differ from the built-in rules”.</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px">
      <button class="btn btn-ghost btn-sm" onclick="resetEverything()"${n ? '' : ' disabled'}>Reset everything to built-in</button>
      <button class="btn btn-ghost btn-sm" onclick="reviewPublish()">Review changes against the live site</button></div>
    ${n ? Object.entries(groups).map(([a, items]) => `<div class="block-title" style="margin-top:10px">${esc(DIFF_AREAS[a] || a)} (${items.length})</div>
      <div class="tbl-wrap"><table class="ledger"><tbody>${items.map(d => { const key = d.key.slice(a.length + 1);
        return `<tr><td>${esc(d.text)}</td><td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" data-area="${esc(a)}" data-key="${esc(key)}" onclick="resetDiffItem(this.dataset.area, this.dataset.key)">${DIFF_LISTS.includes(a) ? 'Delete' : 'Back to built-in'}</button></td></tr>`; }).join('')}</tbody></table></div>`).join('')
      : `<div class="empty-card"><h3>The site is exactly as built</h3><p>Nothing in your draft differs from the built-in rules.</p></div>`}`;
}

/* ── Impact of the draft on the two example companies ── */
function impactPreview(from, to) {
  const keepS = JSON.stringify(S), rows = [];
  const run = (cfg, loader) => {
    applyConfig(cfg);
    S = blankState(); loader();
    const R = assessAll();
    return { overall:R.sc.overall, band:R.sc.band, gates:R.sc.gates.length, conf:R.sc.confidence, dims:Object.fromEntries(R.sc.dimensions.map(d => [d.id, d.score])), reds:R.patterns.filter(p => p.sev === 'red').length, majors:R.checks.filter(c => c.sev === 'major').length };
  };
  try {
    [['Northwind Data (messy example)', loadNorthwind], ['Halcyon Labs (clean example)', loadHalcyon]].forEach(([name, loader]) => {
      const a = run(from, loader), b = run(to, loader);
      rows.push({ name, a, b });
    });
  } finally {
    try { S = JSON.parse(keepS); } catch (e) {}
    applyConfig(effectiveConfig());
  }
  return rows;
}
function reviewPublish() {
  const errs = validateDraft();
  if (errs.length) { openModal('Fix these before publishing', `<ul class="howto">${errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`); return; }
  const ch = configChanges(CFG_PUBLISHED, ST.draft);
  if (!ch.length) { toast('Nothing to publish: the live site already matches your draft.'); return; }
  let impact = [];
  try { impact = impactPreview(CFG_PUBLISHED, ST.draft); } catch (e) { impact = []; }
  const mark = { added:'new', changed:'changed', removed:'back to built-in' };
  const num = v => v == null ? 'n/a' : v;
  const delta = (a, b) => a == null || b == null ? '' : (b - a === 0 ? 'no change' : (b > a ? '+' : '') + Math.round((b - a) * 10) / 10);
  const body = `<p class="pg-desc" style="margin-bottom:6px">${ch.length} change${ch.length === 1 ? '' : 's'} compared with the live site. Nothing is live until you publish.</p>
    <div class="tbl-wrap" style="max-height:220px;overflow:auto"><table class="ledger"><tbody>${ch.slice(0, 80).map(c => `<tr><td><span class="pill ${c.kind === 'removed' ? '' : 'amber'}">${esc(mark[c.kind])}</span></td><td>${esc(c.text)}</td></tr>`).join('')}</tbody></table></div>
    ${ch.length > 80 ? `<p class="field-hint">…and ${ch.length - 80} more.</p>` : ''}
    <div class="block-title" style="margin-top:10px">What this does to the two examples</div>
    ${impact.length ? `<div class="tbl-wrap"><table class="ledger"><thead><tr><th>Example</th><th>Live now</th><th>With your draft</th><th>Change</th></tr></thead><tbody>
      ${impact.map(r => `<tr><td>${esc(r.name)}</td><td>${r.a.gates ? 'withheld (' + r.a.gates + ' gate' + (r.a.gates === 1 ? '' : 's') + ')' : num(r.a.overall) + ' (' + r.a.band[0] + ' to ' + r.a.band[1] + ')'}</td>
        <td>${r.b.gates ? 'withheld (' + r.b.gates + ' gate' + (r.b.gates === 1 ? '' : 's') + ')' : num(r.b.overall) + ' (' + r.b.band[0] + ' to ' + r.b.band[1] + ')'}</td><td>${esc(delta(r.a.overall, r.b.overall))}${r.a.reds !== r.b.reds ? ` · ${r.b.reds - r.a.reds > 0 ? '+' : ''}${r.b.reds - r.a.reds} red flags` : ''}</td></tr>`).join('')}</tbody></table></div>
      <p class="field-hint">Run in your browser only. Your own companies are not affected by this preview.</p>` : '<div class="field-hint">The preview could not be run for this draft.</div>'}`;
  openModal('Review before publishing', body, [{ label:'Publish now', primary:true, onClick:() => { closeModal(); publishDraft(); } }]);
  const pb = document.querySelector('.modal-f .btn-primary'); if (pb) pb.id = 'rv-publish';
}

/* ── Publish history ── */
async function openHistory() {
  const t = repoTarget();
  openModal('Publish history', '<div class="field-hint" id="hist-body">Reading the history from GitHub…</div>');
  try {
    const r = await gh(`/repos/${t.owner}/${t.repo}/commits?path=${encodeURIComponent(t.path)}&sha=${encodeURIComponent(t.branch)}&per_page=25`);
    const el = $id('hist-body'); if (!el) return;
    if (!r.ok || !Array.isArray(r.body)) { el.textContent = `GitHub answered ${r.status}. Try again in a moment.`; return; }
    if (!r.body.length) { el.textContent = 'Nothing has been published yet.'; return; }
    el.outerHTML = `<div class="tbl-wrap"><table class="ledger"><tbody>${r.body.map(c => {
      const d = c.commit && c.commit.author && c.commit.author.date ? new Date(c.commit.author.date).toLocaleString('en-GB') : '';
      return `<tr><td>${esc(d)}</td><td>${esc(String((c.commit && c.commit.message) || '').split('\n')[0].slice(0, 90))}</td>
        <td style="text-align:right"><button class="btn btn-ghost btn-sm" data-sha="${esc(c.sha)}" onclick="loadVersion(this.dataset.sha)">Load into my draft</button></td></tr>`; }).join('')}</tbody></table></div>
      <p class="field-hint">Loading a version puts it in your draft only. Review it, then publish to make it live again.</p>`;
  } catch (e) { const el = $id('hist-body'); if (el) el.textContent = e.message; }
}
async function loadVersion(sha) {
  const t = repoTarget();
  try {
    const r = await gh(`/repos/${t.owner}/${t.repo}/contents/${t.path}?ref=${encodeURIComponent(sha)}`);
    if (!r.ok || !r.body || !r.body.content) { toast('Could not read that version.', 'err'); return; }
    const cfg = normalizeConfig(JSON.parse(b64decodeUtf8(r.body.content)));
    ST.draft = Object.assign(cfg, { owner:ST.draft.owner, repo:ST.draft.repo, branch:ST.draft.branch, path:ST.draft.path });
    saveStudioDraft(); closeModal(); renderStudio();
    toast('That version is now your draft. Review it, then publish to make it live.');
  } catch (e) { toast('Could not read that version: ' + e.message, 'err'); }
}

/* ── Advanced: the whole configuration as JSON, with live validation ── */
let _advTimer = null;
function jsonDropped(raw, norm) {
  const a = [], b = new Set();
  diffFlatten('', raw, a); const n = []; diffFlatten('', norm, n); n.forEach(([p]) => b.add(p));
  const isEmpty = v => v === '' || v == null || (Array.isArray(v) && !v.length);
  return a.filter(([p, v]) => p && !b.has(p) && !isEmpty(v) && !/^(version|updated|owner|repo|branch|path)$/.test(p)).map(x => x[0]).slice(0, 40);
}
function paneStAdvanced() {
  const t = repoTarget();
  const text = JSON.stringify(Object.assign(normalizeConfig(JSON.parse(JSON.stringify(ST.draft))), { owner:t.owner, repo:t.repo, branch:t.branch, path:t.path }), null, 2);
  return `<p class="pg-desc">The whole configuration as JSON: every setting on every tab. Edit it here for bulk changes, or paste a configuration. It is checked as you type. Nothing changes until you press Apply, and everything is still validated, so a broken file can never break the site.</p>
    <textarea class="intake-ta formula" id="adv-json" spellcheck="false" style="min-height:360px" oninput="advCheck()">${esc(text)}</textarea>
    <div class="fx-status" id="adv-status" role="status"></div>
    <div id="adv-drops" class="field-hint"></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
      <button class="btn btn-primary btn-sm" id="adv-apply" onclick="advApply()">Apply to my draft</button>
      <button class="btn btn-ghost btn-sm" onclick="downloadDraft()">Download</button>
      <button class="btn btn-ghost btn-sm" onclick="importDraft()">Import a file</button>
      <button class="btn btn-ghost btn-sm" onclick="advReset()">Reload from my draft</button></div>`;
}
function advRead() {
  const ta = $id('adv-json'); if (!ta) return { ok:false, error:'' };
  let raw; try { raw = JSON.parse(ta.value); } catch (e) { return { ok:false, error:'This is not valid JSON: ' + e.message }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok:false, error:'The top level must be an object, like { "settings": { … } }.' };
  try { const norm = normalizeConfig(raw); return { ok:true, raw, norm, dropped:jsonDropped(raw, norm) }; }
  catch (e) { return { ok:false, error:'This configuration could not be read: ' + (e && e.message ? e.message : 'unexpected structure') + '. Nothing was changed.' }; }
}
function advCheck() {
  clearTimeout(_advTimer);
  _advTimer = setTimeout(() => {
    const st = $id('adv-status'), dr = $id('adv-drops'), ap = $id('adv-apply'); if (!st) return;
    const r = advRead();
    if (!r.ok) { st.className = 'fx-status bad'; st.textContent = r.error; if (ap) ap.disabled = true; if (dr) dr.textContent = ''; return; }
    const saved = ST.draft; ST.draft = r.norm;
    let errs = []; try { errs = validateDraft(); } finally { ST.draft = saved; }
    const n = settingsDiff(r.norm).length;
    if (errs.length) { st.className = 'fx-status bad'; st.textContent = errs[0] + (errs.length > 1 ? ` (and ${errs.length - 1} more)` : ''); if (ap) ap.disabled = true; }
    else { st.className = 'fx-status ok'; st.textContent = `Valid · ${n} setting${n === 1 ? '' : 's'} differ from built-in.`; if (ap) ap.disabled = false; }
    if (dr) dr.innerHTML = r.dropped.length ? `Not recognised, and left out when applied: <code>${r.dropped.map(esc).join('</code>, <code>')}</code>` : '';
  }, 150);
}
function advApply() {
  const r = advRead(); if (!r.ok) { toast(r.error || 'Nothing to apply.', 'err'); return; }
  const saved = ST.draft; ST.draft = r.norm;
  let errs = []; try { errs = validateDraft(); } finally { ST.draft = saved; }
  if (errs.length) { toast(errs[0], 'err'); return; }
  const keep = { owner:saved.owner, repo:saved.repo, branch:saved.branch, path:saved.path };
  ST.draft = Object.assign(r.norm, keep);
  saveStudioDraft(); renderStudioPane();
  toast(r.dropped.length ? `Applied. ${r.dropped.length} entr${r.dropped.length === 1 ? 'y was' : 'ies were'} not recognised and left out.` : 'Applied to your draft.');
}
function advReset() { renderStudioPane(); }
