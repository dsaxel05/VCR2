/* ── ACCOUNTS: "My analyses" page, versions, comparison, conflict choice (A8, A9). Text only through esc(). ── */
let _mine = { rows:[], q:'', sort:'updated_at', stage:'', arch:false, tick:new Set(), gone:{}, usage:null, err:'' };

/* A9: the person chooses. Resolves 'mine' | 'theirs' | 'both', or null if the dialog is closed (asked again at the next save). */
function acctAsk(c) {
  return new Promise(res => {
    let done = false; const pick = v => () => { done = true; closeModal(); res(v); };
    const when = c.server && c.server.updated_at ? ' (saved ' + acctAgo(Date.parse(c.server.updated_at)) + ')' : '';
    if (c.kind === 'newer') openModal('Changed on another device', `<p>“${esc(S.name || 'This analysis')}” was changed on another device${esc(when)} after this device last saved it. Nothing has been overwritten. Which version do you want?</p>`,
      [{ label:'Keep this device’s version', primary:true, onClick:pick('mine') }, { label:'Use the newer one', onClick:pick('theirs') }, { label:'Keep both', onClick:pick('both') }]);
    else openModal('Deleted on another device', `<p>“${esc(S.name || 'This analysis')}” was deleted from your account on another device. This device still has it.</p>`,
      [{ label:'Save it to my account again', primary:true, onClick:pick('mine') }, { label:'Keep it on this device only', onClick:pick('theirs') }]);
    const t = setInterval(() => { if (!$id('modal-wrap')) { clearInterval(t); if (!done) res(null); } }, 400);
  });
}
function acctShowStatus() { if (typeof showSaved === 'function') { let t = 0; try { t = (JSON.parse(localStorage.getItem('vcr3-draft-meta') || '{}') || {}).t; } catch (e) {} showSaved('', t); } }
const acctLedgerNote = () => S.ledgerStats && !S.ledger ? '<div class="warnstrip" role="note"><span aria-hidden="true">⚠</span><div>Ledger not on this device: drop it again to restore the forensic tests. The account keeps only its computed figures.</div></div>' : '';

async function acctGoMine() {
  closeModal(); showPage('mine'); setHTML($id('mine-content'), '<p>Loading your analyses…</p>');
  try { const [rows, use] = await Promise.all([acctList(), acctUsage()]); _mine.rows = rows || []; _mine.usage = use; _mine.err = ''; }
  catch (e) { _mine.err = e.code === 'offline' ? 'Offline: the list will load when you are back online.' : 'The list could not be loaded. Try again in a moment.'; }
  acctRenderMine();
}
function acctRenderMine() {
  const el = $id('mine-content'); if (!el) return;
  const u = _mine.usage, mb = b => (b / 1048576).toFixed(1).replace(/\.0$/, '');
  const q = _mine.q.toLowerCase(), m = acctMeta();
  const rows = _mine.rows.filter(r => !_mine.gone[r.id] && (_mine.arch || !r.archived) && (!_mine.stage || r.stage === _mine.stage)
    && (!q || [r.title, r.company, r.model, r.band, (r.tags || []).join(' '), r.folder].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => _mine.sort === 'score' ? (b.score ?? -1) - (a.score ?? -1) : _mine.sort === 'title' ? String(a.title).localeCompare(b.title) : String(b.updated_at).localeCompare(a.updated_at));
  const stages = [...new Set(_mine.rows.map(r => r.stage).filter(Boolean))];
  const act = (n, id, l) => `<button type="button" class="btn btn-ghost btn-sm" data-click="${n}" data-a="${esc(id)}">${l}</button>`;
  const undo = Object.entries(_mine.gone).map(([id, g]) => `<div class="warnstrip" role="status"><div>Deleted “${esc(g.title)}”. It is removed for good in 30 seconds. ${act('acctMineUndo', id, 'Undo')}</div></div>`).join('');
  setHTML(el, `<h2 class="pg-title">My analyses</h2>
    ${_mine.err ? `<p class="acct-msg" role="alert">${esc(_mine.err)}</p>` : ''}
    ${u ? `<p class="pg-desc">${u.analyses} of ${u.max_analyses} analyses · ${mb(u.bytes)} of ${mb(u.max_bytes)} MB used. Each analysis keeps its last 20 saved versions.</p>` : ''}
    ${undo}
    <div class="mine-tools">
      <label>Search <input type="search" id="mine-q" value="${esc(_mine.q)}" data-input="acctMineSearch" maxlength="80"></label>
      <label>Stage <select data-change="acctMineStage"><option value="">All</option>${stages.map(s => `<option${s === _mine.stage ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label>Sort <select data-change="acctMineSort">${[['updated_at', 'Last saved'], ['score', 'Score'], ['title', 'Name']].map(([v, l]) => `<option value="${v}"${v === _mine.sort ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label><input type="checkbox" data-change="acctMineArch"${_mine.arch ? ' checked' : ''}> Show archived</label>
    </div>
    <div class="mine-tools">
      <button type="button" class="btn btn-ghost btn-sm" data-click="acctMineCompare"${_mine.tick.size === 2 ? '' : ' disabled'}>Compare the two ticked</button>
      <button type="button" class="btn btn-ghost btn-sm" data-click="acctMineExport">Export ${_mine.tick.size ? 'ticked' : 'all'} (.json)</button>
      <button type="button" class="btn btn-ghost btn-sm" data-click="acctSaveVersionGo">Save a version of the open analysis</button>
    </div>
    ${rows.length ? `<div class="tbl-wrap"><table class="tbl mine-tbl"><thead><tr><th scope="col"><span class="sr-only">Tick</span></th><th scope="col">Company</th><th scope="col">Stage</th><th scope="col">Model</th><th scope="col">Saved</th><th scope="col">Score</th><th scope="col">Tags</th><th scope="col">Actions</th></tr></thead><tbody>
      ${rows.map(r => `<tr${r.archived ? ' class="mine-arch"' : ''}><td><input type="checkbox" aria-label="Tick ${esc(r.title)}" data-change="acctMineTick" data-a="${esc(r.id)}"${_mine.tick.has(r.id) ? ' checked' : ''}></td>
        <th scope="row">${esc(r.title)}${m && m.id === r.id ? ' <span class="chip">open</span>' : ''}${r.archived ? ' <span class="chip">archived</span>' : ''}${r.vault ? ' <span class="chip">vault</span>' : ''}</th>
        <td>${esc(r.stage || '')}</td><td>${esc(r.model || '')}</td><td>${esc(acctAgo(Date.parse(r.updated_at)))}</td>
        <td>${r.score == null ? 'n/a' : esc(String(r.score)) + (r.band ? ' ' + esc(r.band) : '')}</td><td>${esc((r.tags || []).join(', '))}</td>
        <td class="mine-acts">${act('acctMineOpen', r.id, 'Open')}${act('acctMineHistory', r.id, 'Versions')}${act('acctMineDup', r.id, 'Duplicate')}${act('acctMineRename', r.id, 'Rename')}${act('acctMineTags', r.id, 'Tags')}${act('acctMineArchive', r.id, r.archived ? 'Unarchive' : 'Archive')}${act('acctMineDelete', r.id, 'Delete')}</td></tr>`).join('')}
    </tbody></table></div>` : `<p>${_mine.rows.length ? 'No analysis matches.' : 'No analysis in your account yet. Your open analysis is saved here automatically.'}</p>`}
    <h3>Preferences</h3>
    <div class="mine-tools">
      <label>Default stage for a new analysis <select id="pref-stage"><option value="">None</option>${STAGES.map(s => `<option value="${esc(s.id)}"${acctDefaultStage() === s.id ? ' selected' : ''}>${esc(s.label || s.id)}</option>`).join('')}</select></label>
      <label>Theme <select id="pref-theme">${[['', 'Follow the device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}"${(acctPrefs().theme || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <button type="button" class="btn btn-ghost btn-sm" data-click="acctPrefsSave">Save preferences</button>
    </div>
    <p class="field-hint">Your comparables library and these preferences are kept in your account too.</p>`);
}
const acctMineRow = id => _mine.rows.find(r => r.id === id);
const acctTry = async (fn, okMsg) => { try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.code === 'version_exists' ? 'Already saved: nothing changed since the last version.' : e.code === 'version_conflict' ? 'Changed on another device meanwhile: the list was reloaded.' : acctSyncMessage(e), 'err', 8000); if (e.code === 'version_conflict') acctGoMine(); } };
const acctMineSearch = v => { _mine.q = String(v).slice(0, 80); acctRenderMine(); const i = $id('mine-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
const acctMineStage = v => { _mine.stage = v; acctRenderMine(); };
const acctMineSort = v => { _mine.sort = v; acctRenderMine(); };
const acctMineArch = v => { _mine.arch = !!v; acctRenderMine(); };
const acctMineTick = (id, on) => { if (on) _mine.tick.add(id); else _mine.tick.delete(id); acctRenderMine(); };
async function acctMineOpen(id) { await acctTry(async () => { await acctOpen(id); buildStages(); buildTypes(); buildNav(); renderIntakeStatus(); updateProgress(); showPage('setup'); }, 'Opened from your account.'); }
async function acctMineDup(id) { await acctTry(() => acctDuplicate(id), 'Duplicated.'); acctGoMine(); }
async function acctMineRename(id) {
  const r = acctMineRow(id), t = r && prompt('New name', r.title); if (!t || !t.trim()) return;
  await acctTry(() => acctUpdate(id, r.version, { title:t.trim().slice(0, 200) })); acctGoMine();
}
async function acctMineTags(id) {
  const r = acctMineRow(id), t = r && prompt('Tags, separated by commas', (r.tags || []).join(', ')); if (t == null) return;
  const tags = [...new Set(t.split(',').map(x => x.trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
  await acctTry(() => acctUpdate(id, r.version, { tags })); acctGoMine();
}
async function acctMineArchive(id) { const r = acctMineRow(id); if (r) { await acctTry(() => acctUpdate(id, r.version, { archived:!r.archived })); acctGoMine(); } }
/* Delete: hidden at once, removed for good after 30 seconds unless "Undo". */
function acctMineDelete(id) {
  const r = acctMineRow(id); if (!r) return;
  _mine.gone[id] = { title:r.title, t:setTimeout(async () => { await acctTry(() => acctDelete(id)); delete _mine.gone[id]; acctGoMine(); }, 30000) };
  acctRenderMine();
}
function acctMineUndo(id) { const g = _mine.gone[id]; if (g) { clearTimeout(g.t); delete _mine.gone[id]; acctRenderMine(); toast('Delete undone.'); } }
async function acctMineExport() {
  const d = await acctTry(() => acctExport([..._mine.tick]));
  if (d) downloadFile('vcr2-my-analyses-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(d, null, 2), 'application/json');
}
const acctDiffTable = (d, la, lb) => `${d.score.a != null || d.score.b != null ? `<p>Score: ${d.score.a ?? 'n/a'} → ${d.score.b ?? 'n/a'}${d.score.change != null ? ` (${d.score.change > 0 ? '+' : ''}${d.score.change})` : ''}</p>` : ''}
  ${d.rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th scope="col">Field</th><th scope="col">${esc(la)}</th><th scope="col">${esc(lb)}</th></tr></thead><tbody>${d.rows.map(r => `<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.a)}</td><td>${esc(r.b)}</td></tr>`).join('')}</tbody></table></div>` : '<p>No field differs.</p>'}`;
async function acctMineCompare() {
  const [a, b] = [..._mine.tick].map(acctMineRow); if (!a || !b) return;
  const rows = await acctTry(() => Promise.all([acctRow(a.id), acctRow(b.id)])); if (!rows) return;
  const ps = await acctTry(() => Promise.all(rows.map(acctRowPayload))); if (!ps) return;
  openModal('Compare two analyses', acctDiffTable(acctDiff(ps[0], ps[1]), a.title, b.title));
}
let _ver = { id:'', list:[], tick:[] };
async function acctMineHistory(id) {
  const list = await acctTry(() => acctVersions(id)); if (!list) return;
  _ver = { id, list, tick:[] }; acctRenderVersions();
}
function acctRenderVersions() {
  openModal('Saved versions', _ver.list.length ? `<p>Tick two versions to see what changed, or restore one (it becomes the open analysis and is saved as a new version).</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th scope="col"><span class="sr-only">Tick</span></th><th scope="col">Version</th><th scope="col">Saved</th><th scope="col">Score</th><th scope="col">Label</th><th scope="col"></th></tr></thead><tbody>
    ${_ver.list.map(v => `<tr><td><input type="checkbox" aria-label="Tick version ${v.version}" data-change="acctVerTick" data-a="#${+v.id}"${_ver.tick.includes(+v.id) ? ' checked' : ''}></td><td>${+v.version}</td><td>${esc(acctAgo(Date.parse(v.created_at)))}</td><td>${v.score == null ? 'n/a' : esc(String(v.score))}</td><td>${esc(v.label || '')}</td>
      <td><button type="button" class="btn btn-ghost btn-sm" data-click="acctVerRestore" data-a="#${+v.id}">Restore</button></td></tr>`).join('')}</tbody></table></div>
    <div id="ver-diff"></div>` : '<p>No saved version yet. Use “Save a version” to keep a named copy.</p>');
}
async function acctVerTick(vid, on) {
  _ver.tick = on ? _ver.tick.concat(vid).slice(-2) : _ver.tick.filter(x => x !== vid);
  if (_ver.tick.length !== 2) return;
  const [a, b] = await Promise.all(_ver.tick.map(acctVersionRow)).catch(() => []);
  const [x, y] = a && b && a.version < b.version ? [a, b] : [b, a];
  const box = $id('ver-diff'); if (box && x && y) setHTML(box, acctDiffTable(acctDiff(x.payload, y.payload), 'Version ' + x.version, 'Version ' + y.version));
}
async function acctVerRestore(vid) {
  closeModal();
  await acctTry(async () => { await acctRestoreVersion(vid); buildStages(); buildTypes(); buildNav(); renderIntakeStatus(); updateProgress(); showPage('setup'); }, 'Version restored and saved as the newest version.');
}
async function acctSaveVersionGo() {
  const label = prompt('Name this version (optional)', ''); if (label === null) return;
  await acctTry(() => acctSaveVersion(label), 'Version saved.');
}
function acctForgetGo() {
  if (!confirm('Remove this analysis from this device?\n\nIt stays in your account: open it again from My analyses.')) return;
  closeModal(); acctForgetHere(); leaveExample(); showPage('intro'); toast('Removed from this device. It is still in your account.');
}
async function acctPrefsSave() {
  const st = ($id('pref-stage') || {}).value || '', th = ($id('pref-theme') || {}).value || '';
  try { if (st) localStorage.setItem('vcr2-acct-stage', st); else localStorage.removeItem('vcr2-acct-stage'); } catch (e) {}
  if (typeof setThemePref === 'function') setThemePref(th || null);
  await acctTry(() => acctSyncProfile({ stage:st || null, theme:th || null }), 'Preferences saved to your account.');
}

/* ── B4: terms, migration, Vault, data rights ── */
function acctModalAsk(title, body, buttons) {   /* resolves with the chosen value, or null when closed */
  return new Promise(res => {
    let done = false;
    openModal(title, body, buttons.map(([label, v, primary]) => ({ label, primary, onClick:() => { const r = typeof v === 'function' ? v() : v; if (r === undefined) return; done = true; closeModal(); res(r); } })));
    const t = setInterval(() => { if (!$id('modal-wrap')) { clearInterval(t); if (!done) res(null); } }, 400);
  });
}
const acctChecked = id => { const el = $id(id); return !!(el && el.checked); };
async function acctAskTerms() {
  return !!(await acctModalAsk('Before your first save', `<p>Nothing you store is shared with other users or used for anything else. Read the <a href="#terms" data-click="acctTermsPage">terms and privacy notice</a>.</p>
    <label class="acct-keep"><input type="checkbox" id="acct-terms"> I have the right to store the information I enter about third-party companies.</label>`,
    [['Accept and continue', () => acctChecked('acct-terms') || (toast('Tick the box to continue, or sign out.', 'err'), undefined), true], ['Sign out', false]]));
}
async function acctAskMigrate(list) {
  const keys = await acctModalAsk('Move your analyses to your account?', `<p>This device has ${list.length} analys${list.length === 1 ? 'is' : 'es'} made before you signed in. Tick the ones to move. Customer ledgers stay on this device${vaultOn() ? ' unless Vault is on' : ''}.</p>
    ${list.map((it, i) => `<label class="acct-keep"><input type="checkbox" id="mig-${i}" checked> ${esc(it.title)}</label>`).join('')}`,
    [['Move the ticked ones', () => list.filter((it, i) => acctChecked('mig-' + i)).map(it => it.key), true], ['Not now', []]]);
  if (!keys || !keys.length) return;
  const r = await acctMigrate(keys);
  if (r.failed.length) toast('Not moved: ' + r.failed.map(f => f.title).join(', ') + '. ' + r.failed[0].msg, 'err', 10000);
  const copies = r.done.filter(k => k !== 'draft');
  if (copies.length && await acctModalAsk('Moved to your account', `<p>${r.done.length} moved and confirmed by your account. Delete the ${copies.length} local cop${copies.length === 1 ? 'y' : 'ies'} from this device's library? The open analysis stays open; it is now saved to your account.</p>`,
    [['Delete the local copies', true, true], ['Keep them here too', false]])) { acctDropLocal(copies); toast('Local copies deleted.'); }
}
function acctTermsPage() { closeModal(); showPage('terms'); }
async function acctDataGo() {
  const d = await acctTry(() => acctExportAll());
  if (d) downloadFile('vcr2-my-data-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(d, null, 2), 'application/json');
}
function acctDeleteAsk() {
  openModal('Delete my account', `<p>This deletes your account and everything stored in it: analyses, versions, comparables and preferences. It cannot be undone. What is on this device stays here.</p>
    <label class="acct-field">Type DELETE to confirm <input id="acct-del" autocomplete="off" maxlength="10"></label>`,
    [{ label:'Delete my account and all my data', primary:true, onClick:async () => {
      const v = ($id('acct-del') || {}).value;
      if (v !== 'DELETE') { toast('Type DELETE in capital letters to confirm.', 'err'); return; }
      closeModal();
      try { await acctDeleteAccount(v); acctRenderButton(); acctShowStatus(); openModal('Account deleted', '<p>Your account and all its data were deleted from the server. Nothing of it is kept.</p>'); }
      catch (e) { toast(acctSyncMessage(e), 'err', 8000); }
    } }]);
}
/* Vault: on, unlock, recover. Passphrases are typed in password fields and never stored. */
const acctPassField = (id, l) => `<label class="acct-field">${l} <input type="password" id="${id}" autocomplete="new-password" maxlength="200"></label>`;
function acctVaultGo() {
  if (!vaultOn()) return openModal('Vault mode', `<p>Vault encrypts your analyses in this browser before they are saved. The server, and the site owner, then see only the title and dates. Only in Vault mode can the customer ledger be saved to your account (encrypted).</p>
    <p><strong>If you lose the passphrase and the recovery key, the analyses cannot be recovered by anyone.</strong></p>
    ${acctPassField('v-p1', 'Passphrase (12 characters or more)')}${acctPassField('v-p2', 'Same passphrase again')}
    <label class="acct-keep"><input type="checkbox" id="v-exp"> Also show stage, model and score in My analyses (not encrypted)</label>`,
    [{ label:'Turn on Vault', primary:true, onClick:async () => {
      const a = $id('v-p1').value, b = $id('v-p2').value;
      if (a !== b) return toast('The two passphrases differ.', 'err');
      try { const rec = await vaultEnable(a, acctChecked('v-exp')); closeModal(); acctShowRecovery(rec); } catch (e) { toast(e.code === 'weak_passphrase' ? 'Use 12 characters or more.' : acctSyncMessage(e), 'err', 8000); }
    } }]);
  if (vaultLocked()) return acctVaultUnlockGo();
  openModal('Vault mode', '<p>Vault is on and unlocked in this tab. Your analyses are encrypted before they leave this browser.</p>', [{ label:'Use the recovery key', onClick:acctVaultRecoverGo }]);
}
function acctShowRecovery(rec) {
  openModal('Your recovery key', `<p>Keep this key somewhere safe, away from this computer. With it you can set a new passphrase; without it and the passphrase, nobody can read your Vault analyses.</p><p><code class="acct-rec">${esc(rec)}</code></p>`,
    [{ label:'Download the recovery key', primary:true, onClick:() => downloadFile('vcr2-recovery-key.txt', 'VCR2 Vault recovery key\n' + rec + '\nKeep it private. Anyone with this key can read your Vault analyses.\n') }]);
}
function acctVaultUnlockGo() {
  openModal('Unlock Vault', acctPassField('v-u', 'Passphrase'), [{ label:'Unlock', primary:true, onClick:async () => {
    try { await vaultUnlock($id('v-u').value); closeModal(); toast('Vault unlocked in this tab.'); acctPush().catch(() => {}); }
    catch (e) { toast(e.code === 'wrong_passphrase' ? 'Wrong passphrase. Nothing was opened or changed.' : acctSyncMessage(e), 'err', 8000); }
  } }, { label:'Use the recovery key', onClick:acctVaultRecoverGo }]);
}
function acctVaultRecoverGo() {
  openModal('Recover Vault', `<label class="acct-field">Recovery key <input id="v-r" autocomplete="off" maxlength="100"></label>${acctPassField('v-n', 'New passphrase (12 characters or more)')}`,
    [{ label:'Set the new passphrase', primary:true, onClick:async () => {
      try { await vaultRecover($id('v-r').value, $id('v-n').value); closeModal(); toast('New passphrase set. The old one no longer works.'); }
      catch (e) { toast(e.code === 'wrong_recovery_key' ? 'This recovery key does not open this Vault.' : e.code === 'weak_passphrase' ? 'Use 12 characters or more.' : acctSyncMessage(e), 'err', 8000); }
    } }]);
}
