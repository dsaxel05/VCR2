/* ── ACCOUNTS: Vault mode (A4), first sign-in migration (A10), data rights (A11), terms (A12) ──
   Vault: a random 256-bit key encrypts each analysis in the browser (AES-GCM, a fresh 12-byte IV each time). The key itself is
   stored in the account only wrapped by the passphrase (PBKDF2-SHA-256, 600,000 iterations, random 16-byte salt). The server
   sees ciphertext plus the title and dates. The recovery key is the raw key: whoever holds it can read the analyses. */
const VAULT_ITER = 600000;
let _vault = { cfg:null, key:null };
const vUn = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(s + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0)); };
const vaultOn = () => !!(_vault.cfg && _vault.cfg.on);
const vaultLocked = () => vaultOn() && !_vault.key;
async function vaultKek(pass, salt, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name:'PBKDF2', hash:'SHA-256', salt, iterations:iter }, base, { name:'AES-GCM', length:256 }, false, ['encrypt', 'decrypt']);
}
const vaultDek = raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
async function vaultSeal(obj, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return 'v1.' + acctB64(iv) + '.' + acctB64(await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key || _vault.key, new TextEncoder().encode(JSON.stringify(obj))));
}
async function vaultOpen(s, key) {
  key = key || _vault.key; if (!key) throw acctErr('vault_locked');
  const p = String(s).split('.');
  try { if (p[0] !== 'v1') throw 0; return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name:'AES-GCM', iv:vUn(p[1]) }, key, vUn(p[2])))); }
  catch (e) { throw acctErr('bad_cipher'); }
}
/* The wrapped key and a check value, kept in the profile (preferences) so another device can unlock with the passphrase. */
async function vaultWrap(dek, pass, expose) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), key = await vaultDek(dek);
  const wrapped = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, await vaultKek(pass, salt, VAULT_ITER), dek);
  return { cfg:{ on:true, v:1, salt:acctB64(salt), iter:VAULT_ITER, iv:acctB64(iv), wrapped:acctB64(wrapped), check:await vaultSeal('vcr2-vault', key), expose:!!expose }, key };
}
async function vaultEnable(pass, expose) {
  if (String(pass).length < 12) throw acctErr('weak_passphrase');
  const dek = crypto.getRandomValues(new Uint8Array(32)), w = await vaultWrap(dek, pass, expose);
  _vault = { cfg:w.cfg, key:w.key };
  await acctSyncProfile({ vault:w.cfg });
  await vaultConvertAll();
  return acctB64(dek);   /* the recovery key: shown once, offered as a file */
}
async function vaultUnlock(pass) {
  const c = _vault.cfg; if (!c) throw acctErr('vault_off');
  let dek; try { dek = await crypto.subtle.decrypt({ name:'AES-GCM', iv:vUn(c.iv) }, await vaultKek(pass, vUn(c.salt), c.iter), vUn(c.wrapped)); } catch (e) { throw acctErr('wrong_passphrase'); }
  _vault.key = await vaultDek(dek);
  return true;
}
/* Lost passphrase: the recovery key opens the vault and a new passphrase replaces the old one. */
async function vaultRecover(rec, pass) {
  if (String(pass).length < 12) throw acctErr('weak_passphrase');
  let raw = null; try { raw = vUn(String(rec).trim()); } catch (e) {}
  if (!raw || raw.length !== 32) throw acctErr('wrong_recovery_key');
  const key = await vaultDek(raw);
  try { if (await vaultOpen(_vault.cfg.check, key) !== 'vcr2-vault') throw 0; } catch (e) { throw acctErr('wrong_recovery_key'); }
  const w = await vaultWrap(raw, pass, _vault.cfg.expose);
  _vault = { cfg:w.cfg, key:w.key };
  await acctSyncProfile({ vault:w.cfg });
  return true;
}
/* Turning Vault on encrypts every analysis already in the account and removes the versions saved in clear before. */
async function vaultConvertAll() {
  const rows = await acctRest('analyses?select=id,version,vault,payload&vault=is.false');
  for (const r of rows) {
    const p = Object.assign({}, r.payload);
    await acctRest(`analyses?id=eq.${r.id}&version=eq.${r.version}`, { method:'PATCH', body:Object.assign(vaultIndex(), { vault:true, payload:null, cipher:await vaultSeal(p), version:r.version + 1 }) })
      .then(() => { const m = acctMeta(); if (m && m.id === r.id) { m.version = r.version + 1; acctSetMeta(m); } });
  }
  await acctRest('analysis_versions?vault=is.false', { method:'DELETE' });
}
/* Index fields of an encrypted row: title and dates only, unless the person chose to show stage, model and score in the list. */
function vaultIndex(ix) {
  const e = _vault.cfg && _vault.cfg.expose;
  ix = ix || {};
  return { company:null, stage:e ? ix.stage || null : null, model:e ? ix.model || null : null, score:e && ix.score != null ? ix.score : null, band:e ? ix.band || null : null };
}
async function acctRowPayload(r) { return r && r.vault ? vaultOpen(r.cipher) : (r && r.payload) || null; }
/* A body for analyses or analysis_versions: clear or sealed. In Vault mode the customer ledger may go too, encrypted. */
async function acctBody(ix, payload) {
  if (!vaultOn()) return Object.assign({}, ix, { vault:false, cipher:null, payload });
  if (!_vault.key) throw acctErr('vault_locked');
  return Object.assign({}, ix, vaultIndex(ix), { vault:true, payload:null, cipher:await vaultSeal(payload) });
}
function acctAdoptVault(v) {
  if (!v || v.on !== true || v.v !== 1 || !(+v.iter >= 1e5)) return;
  const same = _vault.cfg && _vault.cfg.wrapped === v.wrapped;
  _vault = { cfg:v, key:same ? _vault.key : null };
}

/* ── A10: analyses made on this device before signing in ── */
function acctLocalAnalyses() {
  const out = [];
  if (!acctMeta() && acctHasContent()) out.push({ key:'draft', title:(S.name || 'Untitled company') + ' (open now)' });
  libLoad().forEach(e => { if (e.payload && e.source === 'assessment') out.push({ key:e.id, title:e.company + (e.date ? ' (' + e.date + ')' : ''), e }); });
  return out;
}
/* Uploads the ticked ones. Local copies are not touched here: they are removed only after the person says so. */
async function acctMigrate(keys) {
  const done = [], failed = [], s = acctSession();
  for (const it of acctLocalAnalyses().filter(x => keys.includes(x.key))) {
    try {
      if (it.key === 'draft') {
        acctSetMeta({ uid:s.user.id, id:null, version:0, dirty:true });
        const m = await acctPush();
        if (!m || !m.id || m.dirty) { acctSetMeta(null); throw acctErr(_acctState.msg ? 'sync' : 'not_saved'); }
      } else {
        const e = it.e, sc = e.metrics && e.metrics.score;
        const ix = { title:String(e.company || 'Untitled company').slice(0, 200), company:String(e.company || '').slice(0, 200) || null, stage:/^[a-z][a-z0-9_]{0,23}$/.test(e.stage) ? e.stage : null,
          model:/^[a-z][a-z0-9_]{0,39}$/.test(e.model) ? e.model : null, score:sc != null && sc >= 0 && sc <= 100 ? sc : null, band:sc != null ? sWord(sc)[1] : null, app_version:VCR2_VERSION };
        await acctRest('analyses', { method:'POST', body:Object.assign(await acctBody(ix, acctCleanPayload(e.payload, vaultOn())), { version:1 }) });
      }
      done.push(it.key);
    } catch (x) { failed.push({ key:it.key, title:it.title, msg:acctSyncMessage(x) }); }
  }
  return { done, failed };
}
function acctDropLocal(keys) { const k = new Set(keys.filter(x => x !== 'draft')); if (k.size) libSave(libLoad().filter(e => !k.has(e.id))); }

/* ── A11: download everything; delete the account ── */
async function acctExportAll() {
  const s = acctSession();
  const [analyses, versions, profile] = await Promise.all([acctRest('analyses?select=*&order=updated_at.desc'), acctRest('analysis_versions?select=*&order=id'), acctProfile()]);
  for (const r of analyses) if (r.vault && _vault.key) { try { r.payload_decrypted = await vaultOpen(r.cipher); } catch (e) {} }
  return { app:'VCR2', version:VCR2_VERSION, exported:new Date().toISOString(), account:{ id:s.user.id, email:s.user.email, region:s.region, provider:s.user.provider },
    note:'Vault analyses are encrypted (cipher); payload_decrypted is present only when the vault was unlocked while exporting.', analyses, versions, profile };
}
async function acctDeleteAccount(typed) {
  if (typed !== 'DELETE') throw acctErr('not_confirmed');
  await acctRest('rpc/delete_my_account', { method:'POST', body:{} });
  clearTimeout(_acctTimer); acctSetMeta(null); acctDel(ACCT_SESSION); acctDel(ACCT_FLOW); _vault = { cfg:null, key:null }; _acctTermsOk = false;
}

/* ── A12: the terms are accepted once per account, before anything is saved to it ── */
let _acctTermsOk = false;
async function acctAcceptTerms() {
  const p = await acctProfile(), now = new Date().toISOString();
  if (p) await acctRest(`profiles?owner=eq.${p.owner}&version=eq.${p.version}`, { method:'PATCH', body:{ terms_accepted_at:now, version:p.version + 1 } });
  else await acctRest('profiles', { method:'POST', body:{ terms_accepted_at:now } });
  _acctTermsOk = true;
}
