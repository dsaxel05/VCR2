/* ── ACCOUNTS: the personal library and the background sync (rules A3, A8, A9) ──
   The draft on this device stays the working copy. When signed in, each local save is sent a few seconds later.
   Every write names the version it started from; if another device wrote in between, the person chooses (never silent). */
const VCR2_VERSION = '5.2.0';
const ACCT_META = 'vcr2-acct-draft';
let _acctTimer = 0, _acctBusy = null, _acctEdits = 0, _acctEpoch = 0, _acctApplying = false, _acctState = { k:'' };
let acctDelay = 3000;

/* REST calls as the signed-in user; one forced refresh and retry if the server says the token expired. */
async function acctRest(path, o = {}) {
  const s = acctSession(); if (!s) throw acctErr('signed_out');
  const tok = await acctToken();
  try { return await acctFetch(acctRegion(s.region), '/rest/v1/' + path, Object.assign({ token:tok }, o)); }
  catch (e) {
    if (e.status !== 401 || o.retried) throw e;
    await acctRefresh(acctSession() || s);
    return acctRest(path, Object.assign({}, o, { retried:true }));
  }
}
const acctRep = { prefer:'return=representation' };

/* What goes to the cloud (A3): the structured state only. Never the customer ledger (computed analytics instead),
   never documents or their text, never keys. Provenance lines are cut to 160 characters. */
function acctLedgerStats(L) {
  const r = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
  return { months:L.months.length, customersNow:L.customersNow, arrNow:r(L.arrNow), top1:r(L.top1), top5:r(L.top5), top10:r(L.top10),
    nrr:r(L.nrrCohort), grr:r(L.grrCohort), logoRet:r(L.logoRet), cmgr12:r(L.cmgr12) };
}
const ACCT_PAYLOAD_KEYS = ['v', 'name', 'stage', 'model', 'asof', 'section', 'vals', 'bools', 'sel', 'prov', 'evid', 'assume', 'notes', 'checklist', 'evidFile', 'requests', 'series', 'ledger', 'ledgerStats', 'score'];
/* Any saved analysis (the draft, a local saved run) cut down to what may be stored. keepLedger: Vault mode only (encrypted). */
function acctCleanPayload(src, keepLedger) {
  const c = JSON.parse(JSON.stringify(src || {})), p = {};
  ACCT_PAYLOAD_KEYS.forEach(k => { if (c[k] !== undefined) p[k] = c[k]; });
  if (!keepLedger) {
    if (p.ledger && p.ledger.csv && !p.ledgerStats) try { const r = parseLedger(p.ledger.csv, 'mrr'); if (r.ok) p.ledgerStats = acctLedgerStats(ledgerAnalytics(r.ledger)); } catch (e) {}
    p.ledger = null;
  }
  Object.values(p.prov || {}).forEach(v => { if (v && typeof v === 'object') ['line', 'why'].forEach(k => { if (typeof v[k] === 'string') v[k] = v[k].slice(0, 160); }); });
  return p;
}
function acctCloudPayload(keepLedger) {
  const d = draftPayload(), p = acctCleanPayload(keepLedger ? d : Object.assign({}, d, { ledger:null }), keepLedger);
  const L = !keepLedger && S.ledger ? ledgerAnalytics(S.ledger) : null;
  if (L) p.ledgerStats = acctLedgerStats(L); else if (S.ledgerStats && !p.ledgerStats) p.ledgerStats = S.ledgerStats;
  const sc = S.result && S.result.sc;
  if (sc && sc.overall != null) p.score = { overall:sc.overall, band:sWord(sc.overall)[1], gates:(sc.gates || []).length };
  return p;
}
function acctIndex() {
  const sc = S.result && S.result.sc, ok = sc && sc.overall != null;
  return { title:(S.name || 'Untitled company').slice(0, 200), company:S.name ? S.name.slice(0, 200) : null, stage:S.stage, model:S.model,
    score:ok ? sc.overall : null, band:ok ? sWord(sc.overall)[1] : null, app_version:VCR2_VERSION };
}

/* Which cloud record the draft on this device is, for which user. */
function acctMeta() { const m = acctGet(localStorage, ACCT_META), s = acctSession(); return m && s && m.uid === s.user.id ? m : null; }
function acctSetMeta(m) { try { if (m) localStorage.setItem(ACCT_META, JSON.stringify(m)); else localStorage.removeItem(ACCT_META); } catch (e) {} }
const acctHasContent = () => !!(S.name || Object.keys(S.vals).length || Object.keys(S.bools).length || Object.keys(S.sel).length || S.notes);

function acctSet(k, msg) { _acctState = { k, msg }; if (typeof acctShowStatus === 'function') acctShowStatus(); }
const acctAgo = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t).toLocaleDateString('en-GB'); };
/* The status label shown for the open analysis (section 11). null when signed out: the guest wording is unchanged. */
function acctStatusText() {
  if (!acctSession() || S.example) return null;
  const m = acctMeta(), k = _acctState.k;
  if (k === 'offline') return 'Offline: will sync';
  if (k === 'conflict') return 'A newer version exists on another device: choose which to keep';
  if (k === 'error') return _acctState.msg;
  if (k === 'terms') return 'Saved on this device only: accept the terms to save to your account';
  if (m && m.local) return 'Saved on this device only';
  if (m && m.dirty) return 'Saving to your account…';
  if (m && m.at) return 'Saved to your account, ' + acctAgo(m.at);
  return 'Saved on this device only';
}
function acctSyncMessage(e) {
  const c = e && e.code, t = e && e.detail && (e.detail.message || '');
  if (/quota_analyses/.test(t)) return 'Not saved to your account: you have reached the number of analyses allowed. Delete or export old ones in My analyses.';
  if (/quota_bytes/.test(t)) return 'Not saved to your account: your storage is full. Delete old analyses or versions in My analyses.';
  if (/record_too_large/.test(t)) return 'Not saved to your account: this analysis is too large (over 1 MB). It stays on this device.';
  if (c === 'signed_out') return 'Signed out: saved on this device only.';
  if (c === 'vault_locked') return 'Vault locked: unlock it to save to your account (kept on this device meanwhile).';
  return 'Not saved to your account yet; it stays on this device and will be retried.';
}

/* Called by saveDraft() after every local save. */
function acctDirty() {
  if (_acctApplying || S.example || !acctSession() || !acctHasContent()) return;
  const m = acctMeta();
  if (!m || m.local) { acctSet(''); return; }   /* a draft from before sign-in stays on this device until moved (A10) */
  m.dirty = true; _acctEdits++; acctSetMeta(m);
  clearTimeout(_acctTimer); _acctTimer = setTimeout(() => { acctPush().catch(() => {}); }, acctDelay);
}
async function acctPush() {
  if (_acctBusy) await _acctBusy.catch(() => {});
  const s = acctSession(), m = acctMeta();
  if (!s || !m || !m.dirty || m.local || S.example) return m;
  if (!_acctTermsOk) { acctSet('terms'); return m; }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { acctSet('offline'); return m; }
  _acctBusy = acctSend(m, _acctEdits, _acctEpoch, s.user.id).catch(e => {
    if (!acctSession()) return null;
    acctSet(e.code === 'offline' ? 'offline' : 'error', acctSyncMessage(e));
    return m;
  });
  try { return await _acctBusy; } finally { _acctBusy = null; }
}
/* One write: create (with an id chosen first, so a retry after a lost answer cannot make a twin) or a versioned update. */
async function acctSend(m, edits, epoch, uid) {
  const body = await acctBody(acctIndex(), acctCloudPayload(vaultOn()));
  if (!m.id || !m.version) {
    m.id = m.id || crypto.randomUUID(); acctSetMeta(m);
    try { m.version = (await acctRest('analyses', { method:'POST', body:Object.assign({ id:m.id, version:1 }, body), headers:acctRep }))[0].version; return acctDone(m, edits, epoch, uid); }
    catch (e) {
      if (e.status !== 409) throw e;
      const row = (await acctRest('analyses?select=version&id=eq.' + m.id))[0];
      if (!row) throw e;
      m.version = row.version;   /* our first try did arrive: carry on as an update */
    }
  }
  delete body.title;   /* the title is set once; after that only "Rename" changes it (the company name follows the form) */
  const r = await acctRest(`analyses?id=eq.${m.id}&version=eq.${m.version}`, { method:'PATCH', body:Object.assign({ version:m.version + 1 }, body), headers:acctRep });
  if (!r || !r.length) return acctConflict(m, edits, epoch, uid);
  m.version = r[0].version;
  return acctDone(m, edits, epoch, uid);
}
/* Written: unless the person signed out, switched analysis or kept typing meanwhile (then it goes again). */
function acctDone(m, edits, epoch, uid) {
  const s = acctSession();
  if (!s || s.user.id !== uid || epoch !== _acctEpoch) return null;
  m.dirty = edits !== _acctEdits; m.at = Date.now(); acctSetMeta(m); acctSet(m.dirty ? 'pending' : 'saved');
  if (m.dirty) { clearTimeout(_acctTimer); _acctTimer = setTimeout(() => { acctPush().catch(() => {}); }, acctDelay); }
  return m;
}

/* A9: the server copy moved on (another device) or is gone. The person chooses; nothing is overwritten before. */
async function acctConflict(m, edits, epoch, uid) {
  const srv = (await acctRest(`analyses?id=eq.${m.id}&select=id,version,title,updated_at,vault,payload,cipher`))[0] || null;
  acctSet('conflict');
  const choice = await acctAsk({ kind:srv ? 'newer' : 'deleted', server:srv });
  if (choice === 'mine' && srv) { m.version = srv.version; return acctSend(m, edits, epoch, uid); }
  if (choice === 'mine' || choice === 'both') {   /* a new record for this device's version; the account copy is left as it is */
    m.id = crypto.randomUUID(); m.version = 0; acctSetMeta(m);
    if (choice === 'both' && S.name) { _acctApplying = true; try { S.name = (S.name + ' (this device)').slice(0, 200); saveDraft(); } finally { _acctApplying = false; } }
    return acctSend(m, edits, epoch, uid);
  }
  if (choice === 'theirs' && srv) { await acctApply(srv); return acctMeta(); }
  if (choice === 'theirs') { m.local = true; m.dirty = false; m.id = null; acctSetMeta(m); acctSet('local'); return m; }   /* deleted elsewhere: kept here only */
  return m;   /* no answer: asked again at the next save */
}
/* Put a cloud record into the working draft. The customer ledger stays: it is never in the cloud. */
async function acctApply(row) {
  const keepLedger = S.ledger, p = await acctRowPayload(row);
  _acctApplying = true;
  try {
    restorePayload(p || {});
    if (keepLedger && !S.ledger) S.ledger = keepLedger;
    _acctEpoch++;
    const s = acctSession();
    acctSetMeta({ uid:s.user.id, id:row.id, version:row.version, dirty:false, at:Date.now() });
    saveDraft();
  } finally { _acctApplying = false; }
  acctSet('saved');
}
/* At start-up and on sign-in: a newer copy from another device replaces a clean local one (nothing to lose, a notice
   says so); a draft with unsent changes goes through the conflict choice instead. */
async function acctCheckRemote() {
  const m = acctMeta(); if (!m || !m.id || m.local) return null;
  const row = (await acctRest(`analyses?id=eq.${m.id}&select=id,version`))[0];
  if (!row) { if (!m.dirty) { m.local = true; m.id = null; acctSetMeta(m); acctSet('local'); } else await acctPush(); return 'gone'; }
  if (row.version === m.version) { if (m.dirty) await acctPush(); return 'same'; }
  if (m.dirty) { await acctPush(); return 'conflict'; }
  await acctApply((await acctRest(`analyses?id=eq.${m.id}&select=id,version,vault,payload,cipher`))[0]);
  return 'updated';
}

/* ── My analyses ── */
const ACCT_COLS = 'id,title,company,stage,model,score,band,tags,folder,archived,vault,version,bytes,updated_at';
const acctList = () => acctRest('analyses?select=' + ACCT_COLS + '&order=updated_at.desc');
const acctUsage = () => acctRest('rpc/my_usage', { method:'POST', body:{} });
async function acctRow(id) { const r = (await acctRest(`analyses?id=eq.${encodeURIComponent(id)}&select=*`))[0]; if (!r) throw acctErr('not_found'); return r; }
/* Open one: the current draft is sent first, so switching never loses work. */
async function acctOpen(id) {
  const m = acctMeta(); if (m && m.dirty) await acctPush();
  await acctApply(await acctRow(id));
}
async function acctDuplicate(id) {
  const r = await acctRow(id);
  const t = (r.title + ' (copy)').slice(0, 200);
  const p = r.payload ? Object.assign({}, r.payload, { name:t }) : null;
  return (await acctRest('analyses', { method:'POST', headers:acctRep,
    body:{ title:t, company:r.company, stage:r.stage, model:r.model, score:r.score, band:r.band, tags:r.tags, folder:r.folder, vault:r.vault, payload:p, cipher:r.cipher, app_version:VCR2_VERSION, version:1 } }))[0];
}
/* Rename, archive, tags, folder: also a versioned write. The open analysis follows the new version number. */
async function acctUpdate(id, version, fields) {
  const r = await acctRest(`analyses?id=eq.${encodeURIComponent(id)}&version=eq.${version}`, { method:'PATCH', headers:acctRep, body:Object.assign({}, fields, { version:version + 1 }) });
  if (!r || !r.length) throw acctErr('version_conflict');
  const m = acctMeta(); if (m && m.id === id) { m.version = r[0].version; acctSetMeta(m); }
  return r[0];
}
async function acctDelete(id) {
  await acctRest('analyses?id=eq.' + encodeURIComponent(id), { method:'DELETE' });
  const m = acctMeta(); if (m && m.id === id) { m.local = true; m.id = null; m.dirty = false; acctSetMeta(m); acctSet('local'); }
}
/* A different analysis became the working draft (new assessment, imported file, local saved run): it gets its own record. */
function acctNewDraft() { _acctEpoch++; clearTimeout(_acctTimer); const s = acctSession(); acctSetMeta(s ? { uid:s.user.id, id:null, version:0 } : null); if (_acctState.k) acctSet(''); }
/* After a sign-in (or at start-up with a session): an empty draft joins the account; the open one is checked against the
   account copy; comparables and preferences are merged. Errors are quiet: everything still works on this device. */
async function acctAfterSignIn() {
  const s = acctSession(); if (!s) return;
  const p = await acctProfile();
  if (p) acctAdoptProfile(p);
  if (!p || !p.terms_accepted_at) {   /* A12: once per account, before anything is stored */
    if (!(await acctAskTerms())) { await acctSignOut(); return 'declined'; }
    await acctAcceptTerms();
  }
  _acctTermsOk = true;
  if (!acctMeta() && !acctHasContent()) acctSetMeta({ uid:s.user.id, id:null, version:0 });
  acctSet('');
  const local = acctLocalAnalyses();   /* A10: asked, never moved silently */
  if (local.length) await acctAskMigrate(local);
  await acctCheckRemote().catch(() => {});
  await acctSyncProfile().catch(() => {});
  return 'ok';
}
/* "Remove this analysis from this device": the account copy stays. */
function acctForgetHere() {
  _acctEpoch++; clearTimeout(_acctTimer); acctSetMeta(null);
  _acctApplying = true;
  try { try { ['vcr3-draft', 'vcr3-draft-meta'].forEach(k => localStorage.removeItem(k)); } catch (e) {} S = blankState(); }
  finally { _acctApplying = false; }
}
async function acctExport(ids) {
  const sel = ids && ids.length ? '&id=in.(' + ids.map(encodeURIComponent).join(',') + ')' : '';
  const rows = await acctRest('analyses?select=*' + sel + '&order=updated_at.desc');
  return { app:'VCR2', version:VCR2_VERSION, exported:new Date().toISOString(), analyses:rows.map(r => { const o = Object.assign({}, r); delete o.owner; return o; }) };
}

/* ── versions (A8): manual "Save version", the last 20 kept by the server ── */
async function acctSaveVersion(label) {
  let m = acctMeta(); if (m && m.dirty) m = await acctPush();
  if (!m || !m.id) throw acctErr('not_saved');
  try {
    const ix = acctIndex();
    await acctRest('analysis_versions', { method:'POST', body:Object.assign({ analysis_id:m.id, version:m.version, label:String(label || '').slice(0, 80) || null },
      (({ vault, payload, cipher, score }) => ({ vault, payload, cipher, score }))(await acctBody({ score:ix.score }, acctCloudPayload(vaultOn())))) });   /* the columns a version has */
  } catch (e) { if (e.status === 409) throw acctErr('version_exists'); throw e; }
  return m.version;
}
const acctVersions = id => acctRest(`analysis_versions?analysis_id=eq.${encodeURIComponent(id)}&select=id,version,label,score,created_at&order=version.desc`);
async function acctVersionRow(vid) { const r = (await acctRest(`analysis_versions?id=eq.${+vid}&select=*`))[0]; if (r) r.payload = await acctRowPayload(r); return r; }
/* Restoring a version makes it the working copy again; it is saved as the next version (history is never rewritten). */
async function acctRestoreVersion(vid) {
  const v = await acctVersionRow(vid); if (!v || !v.payload) throw acctErr('not_found');
  const m = acctMeta(); if (!m || m.id !== v.analysis_id) await acctOpen(v.analysis_id);
  const keepLedger = S.ledger; _acctApplying = true;
  try { restorePayload(v.payload); if (keepLedger && !S.ledger) S.ledger = keepLedger; } finally { _acctApplying = false; }
  saveDraft();
  return acctPush();
}
/* Two payloads side by side: every field that differs, with its label, plus the score change. */
function acctDiff(a, b) {
  a = a || {}; b = b || {};
  const lbl = {}; try { ALL_FIELDS().forEach(f => { lbl[f.id] = f.lbl; }); } catch (e) {}
  const rows = [], show = v => v == null || v === '' ? '' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
  [['name', 'Company'], ['stage', 'Stage'], ['model', 'Business model'], ['notes', 'Notes']].forEach(([k, l]) => { if (show(a[k]) !== show(b[k])) rows.push({ id:k, label:l, a:show(a[k]), b:show(b[k]) }); });
  ['vals', 'bools', 'sel'].forEach(g => {
    const A = a[g] || {}, B = b[g] || {};
    [...new Set(Object.keys(A).concat(Object.keys(B)))].sort().forEach(k => { if (show(A[k]) !== show(B[k])) rows.push({ id:k, label:lbl[k] || k, a:show(A[k]), b:show(B[k]) }); });
  });
  const sa = a.score && a.score.overall, sb = b.score && b.score.overall;
  return { rows, score:{ a:sa == null ? null : sa, b:sb == null ? null : sb, change:sa != null && sb != null ? Math.round((sb - sa) * 10) / 10 : null } };
}

/* ── comparables library and preferences, one row per user ── */
async function acctProfile() { return (await acctRest('profiles?select=*'))[0] || null; }
function acctLocalComparables() { return libLoad().map(e => { const o = Object.assign({}, e); delete o.payload; return o; }).slice(0, 1000); }
function acctPrefs() { let theme = null; try { theme = localStorage.getItem('vcr2-theme'); } catch (e) {} return { theme, stage:acctDefaultStage() }; }
const acctDefaultStage = () => { try { return localStorage.getItem('vcr2-acct-stage') || null; } catch (e) { return null; } };
/* Merge this device's comparables with the account's (union by id), then write back with the version counter. */
async function acctSyncProfile(over) {
  for (let i = 0; i < 3; i++) {
    const p = await acctProfile();
    const mine = acctLocalComparables(), seen = new Set(mine.map(e => e.id));
    const merged = mine.concat(((p && p.comparables) || []).filter(e => e && !seen.has(e.id))).slice(0, 1000);
    const prefs = Object.assign({}, (p && p.prefs) || {}, over || {});
    try {
      const r = p ? await acctRest(`profiles?owner=eq.${p.owner}&version=eq.${p.version}`, { method:'PATCH', headers:acctRep, body:{ comparables:merged, prefs, version:p.version + 1 } })
        : await acctRest('profiles', { method:'POST', headers:acctRep, body:{ comparables:merged, prefs } });
      if (r && r.length) { acctAdoptProfile(r[0]); return r[0]; }
    } catch (e) { if (e.status !== 409) throw e; }
  }
  throw acctErr('version_conflict');
}
function acctAdoptProfile(p) {
  const have = new Set(libLoad().map(e => e.id)), add = (p.comparables || []).filter(e => !have.has(e.id));
  if (add.length) libSave(libLoad().concat(add).map(libClean).filter(Boolean));
  const pr = p.prefs || {};
  acctAdoptVault(pr.vault);
  if (p.terms_accepted_at) _acctTermsOk = true;
  try {
    if (pr.stage && /^[a-z][a-z0-9_]{0,23}$/.test(pr.stage)) localStorage.setItem('vcr2-acct-stage', pr.stage);
    if ((pr.theme === 'light' || pr.theme === 'dark') && typeof setThemePref === 'function') setThemePref(pr.theme);
  } catch (e) {}
}
