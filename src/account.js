/* ═══════════════════════════════════════════════════════════════
   ACCOUNTS (Part B): the ONLY code allowed to talk to the accounts backend (rule A2).
   Nothing here connects until the visitor clicks "Sign in", comes back from a sign-in they started in this browser,
   or has a session saved by an earlier sign-in. A guest never reaches acctFetch().
   Hand-written against Supabase Auth and its REST API (no SDK): PKCE with WebCrypto, one state value per sign-in, used once.
   ═══════════════════════════════════════════════════════════════ */

/* The backend projects (EU, US), written by build.py from site.json. Public values only: project URL and public "anon" key. */
let ACCT_REGIONS = (() => { try { return JSON.parse('@@ACCOUNT_REGIONS@@'); } catch (e) { return []; } })();
const ACCT_URL_OK = /^(https:\/\/[a-z0-9-]{3,63}\.supabase\.co|http:\/\/127\.0\.0\.1:\d{2,5})$/;
const acctRegions = () => (Array.isArray(ACCT_REGIONS) ? ACCT_REGIONS : []).filter(r => r && /^[a-z]{2,8}$/.test(r.id) && ACCT_URL_OK.test(r.url) && typeof r.anonKey === 'string' && r.anonKey.length > 20);

/* Sign-in methods. Adding one is configuration (Studio, settings.accounts), not code: an extra provider is any
   "custom:<slug>" OAuth/OIDC provider set up in the backend console. All are off until the owner switches them on. */
const ACCT_PROVIDERS = [
  { id:'google',    label:'Google',    kind:'oauth', gotrue:'google',        group:'main' },
  { id:'microsoft', label:'Microsoft', kind:'oauth', gotrue:'azure',         group:'main', scopes:'email' },
  { id:'apple',     label:'Apple',     kind:'oauth', gotrue:'apple',         group:'main' },
  { id:'yahoo',     label:'Yahoo',     kind:'oauth', gotrue:'custom:yahoo',  group:'more' },
  { id:'github',    label:'GitHub',    kind:'oauth', gotrue:'github',        group:'more' },
  { id:'linkedin',  label:'LinkedIn',  kind:'oauth', gotrue:'linkedin_oidc', group:'more' },
  { id:'x',         label:'X',         kind:'oauth', gotrue:'twitter',       group:'more' },
  { id:'facebook',  label:'Facebook',  kind:'oauth', gotrue:'facebook',      group:'more' },
  { id:'email_link',     label:'Email link (no password)', kind:'email_link', group:'more' },
  { id:'email_password', label:'Email and password',       kind:'password',   group:'more' },
  { id:'passkey',   label:'Passkey',   kind:'passkey', group:'more', unavailable:'The backend marks passkeys as experimental; not offered yet.' },
];
const ACCT_GOTRUE_OK = /^([a-z][a-z0-9_]{0,30}|custom:[a-z0-9][a-z0-9_-]{1,40})$/;
const ACCT_NOTE = 'Signing in is optional. Signed in, your analyses are saved to your account so you can reopen them on another device: answers, notes, checklist and scores. Never your uploaded documents, their text or your customer ledger. As a guest, nothing leaves this browser.';
function acctProviders(all, stOver) {   /* stOver: the Studio's draft settings, to preview them */
  const st = stOver || (typeof CFG !== 'undefined' && CFG.settings && CFG.settings.accounts) || {}, cfg = st.providers || {};
  const extra = (Array.isArray(st.extra) ? st.extra : []).filter(p => p && /^[a-z][a-z0-9_]{1,30}$/.test(p.id) && /^custom:/.test(p.gotrue || '') && !ACCT_PROVIDERS.some(d => d.id === p.id))
    .map(p => ({ id:p.id, label:String(p.label || p.id).slice(0, 40), kind:'oauth', gotrue:p.gotrue, group:'more' }));
  return ACCT_PROVIDERS.concat(extra).map((p, i) => {
    const c = cfg[p.id] || {};
    const set = c.order != null && c.order !== '' && isFinite(c.order);   /* a chosen position wins a tie with a default one */
    const q = Object.assign({}, p, { order:set ? +c.order : i, rank:(set ? 0 : 1e3) + i, enabled:c.enabled === true && !p.unavailable });
    if (p.kind === 'oauth' && typeof c.gotrue === 'string' && ACCT_GOTRUE_OK.test(c.gotrue)) q.gotrue = c.gotrue;   /* e.g. 'x' once the backend names it so */
    if (typeof c.scopes === 'string' && /^[\w:./ -]{0,200}$/.test(c.scopes)) q.scopes = c.scopes;
    return q;
  }).filter(p => all || p.enabled).sort((a, b) => a.order - b.order || a.rank - b.rank);
}
const acctProvider = id => acctProviders().find(p => p.id === id) || null;
const acctAvailable = () => acctRegions().length > 0 && acctProviders().length > 0;

/* ── storage: the session lives in this tab only when "Don't keep me signed in" is ticked ── */
const ACCT_SESSION = 'vcr2-acct-session', ACCT_FLOW = 'vcr2-acct-flow', ACCT_REGION = 'vcr2-acct-region';
const acctStore = keep => { try { return keep ? localStorage : sessionStorage; } catch (e) { return null; } };
const acctGet = (st, k) => { try { return JSON.parse(st.getItem(k) || 'null'); } catch (e) { return null; } };
const acctDel = k => { [true, false].forEach(keep => { try { acctStore(keep).removeItem(k); } catch (e) {} }); };
function acctSession() { return acctGet(acctStore(false) || {}, ACCT_SESSION) || acctGet(acctStore(true) || {}, ACCT_SESSION); }
const acctRegion = id => { const rs = acctRegions(); let pick = null; try { pick = id || localStorage.getItem(ACCT_REGION); } catch (e) {} return rs.find(r => r.id === pick) || (rs.length === 1 ? rs[0] : null); };

/* ── the network gate (A2) ── */
let _acctArmed = false;
const acctArm = () => { _acctArmed = true; };
function acctErr(code, status, detail) { const e = new Error(code); e.code = code; e.status = status || 0; e.detail = detail; return e; }
async function acctFetch(reg, path, o = {}) {
  if (!_acctArmed) throw acctErr('not_armed');
  if (!reg || !acctRegions().some(r => r.url === reg.url && r.anonKey === reg.anonKey)) throw acctErr('unknown_region');
  const h = { apikey:reg.anonKey, 'content-type':'application/json' };
  if (o.token) h.authorization = 'Bearer ' + o.token;
  Object.assign(h, o.headers || {});
  let res;
  try { res = await fetch(reg.url + path, { method:o.method || 'GET', headers:h, body:o.body == null ? undefined : JSON.stringify(o.body), cache:'no-store', credentials:'omit', redirect:'error', referrerPolicy:'no-referrer' }); }
  catch (e) { throw acctErr('offline'); }
  const text = await res.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok) throw acctErr(String((json && (json.error_code || json.code || json.error)) || 'http_' + res.status).slice(0, 60), res.status, json);
  return json;
}

/* ── PKCE (RFC 7636) and the one-time state ── */
const acctB64 = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const acctRandom = n => acctB64(crypto.getRandomValues(new Uint8Array(n)));
async function acctPkce() {
  const verifier = acctRandom(48);
  return { verifier, challenge:acctB64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))) };
}
const ACCT_FLOW_MS = { oauth:10 * 6e4, email:60 * 6e4 };
/* A pending sign-in. Kept in localStorage because an email link opens in a new tab; it is taken (read and erased) once. */
async function acctNewFlow(reg, provider, keep, kind) {
  const { verifier, challenge } = await acctPkce(), state = acctRandom(24);
  try { localStorage.setItem(ACCT_FLOW, JSON.stringify({ verifier, state, region:reg.id, provider, keep:!!keep, kind, t:Date.now() })); localStorage.setItem(ACCT_REGION, reg.id); } catch (e) {}
  return { challenge, state, back:acctReturnUrl(state) };
}
function acctTakeFlow() { const f = acctGet(localStorage, ACCT_FLOW); acctDel(ACCT_FLOW); return f; }
const acctReturnUrl = state => location.origin + location.pathname + '?acct=' + encodeURIComponent(state);
const acctGo = url => location.assign(url);   /* same tab: no popup to block */

async function acctStartOAuth(pid, rid, keep) {
  const p = acctProvider(pid), reg = acctRegion(rid);
  if (!p || p.kind !== 'oauth') throw acctErr('provider_disabled');
  if (!reg) throw acctErr('no_region');
  acctArm();
  const f = await acctNewFlow(reg, p.id, keep, 'oauth');
  const q = new URLSearchParams({ provider:p.gotrue, redirect_to:f.back, code_challenge:f.challenge, code_challenge_method:'s256' });
  if (p.scopes) q.set('scopes', p.scopes);
  acctGo(reg.url + '/auth/v1/authorize?' + q.toString());
}
const acctEmailOk = e => typeof e === 'string' && e.length <= 254 && /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(e);
async function acctEmailLink(email, rid, keep) {
  const reg = acctRegion(rid);
  if (!acctProvider('email_link')) throw acctErr('provider_disabled');
  if (!reg) throw acctErr('no_region');
  if (!acctEmailOk(email)) throw acctErr('email_address_invalid');
  acctArm();
  const f = await acctNewFlow(reg, 'email_link', keep, 'email');
  await acctFetch(reg, '/auth/v1/otp?redirect_to=' + encodeURIComponent(f.back), { method:'POST', body:{ email, create_user:true, code_challenge:f.challenge, code_challenge_method:'s256' } });
  return true;
}
async function acctSignUp(email, password, rid, keep) {
  const reg = acctRegion(rid);
  if (!acctProvider('email_password')) throw acctErr('provider_disabled');
  if (!reg) throw acctErr('no_region');
  if (!acctEmailOk(email)) throw acctErr('email_address_invalid');
  acctArm();
  const f = await acctNewFlow(reg, 'email_password', keep, 'email');
  const r = await acctFetch(reg, '/auth/v1/signup?redirect_to=' + encodeURIComponent(f.back), { method:'POST', body:{ email, password, code_challenge:f.challenge, code_challenge_method:'s256' } });
  if (r && r.access_token) { acctDel(ACCT_FLOW); return { session:acctSaveSession(r, reg.id, keep) }; }
  return { confirm:true };   /* email verification is required: the session comes with the link */
}
async function acctPasswordSignIn(email, password, rid, keep) {
  const reg = acctRegion(rid);
  if (!acctProvider('email_password')) throw acctErr('provider_disabled');
  if (!reg) throw acctErr('no_region');
  acctArm();
  const r = await acctFetch(reg, '/auth/v1/token?grant_type=password', { method:'POST', body:{ email, password } });
  return { session:acctSaveSession(r, reg.id, keep) };
}

/* Back from a provider or an email link. Anything that does not match a sign-in started in this browser is dropped
   before any network call (no login CSRF); the code is exchanged once, with the verifier only this browser holds. */
async function acctHandleReturn() {
  if (typeof location === 'undefined') return null;
  const u = new URL(location.href), st = u.searchParams.get('acct');
  if (st == null) return null;
  const hp = new URLSearchParams(u.hash.replace(/^#/, ''));
  const par = k => u.searchParams.get(k) || hp.get(k);
  const code = u.searchParams.get('code'), err = par('error_code') || par('error');
  ['acct', 'code', 'error', 'error_code', 'error_description', 'state'].forEach(k => u.searchParams.delete(k));
  try { history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : '')); } catch (e) {}
  const flow = acctTakeFlow();
  if (!flow || typeof flow.state !== 'string' || flow.state !== st) return { error:'state_mismatch' };
  if (!(Date.now() - flow.t < (ACCT_FLOW_MS[flow.kind] || ACCT_FLOW_MS.oauth))) return { error:'flow_expired' };
  if (err) return { error:String(err).slice(0, 60), tried:flow.provider };
  if (!code) return { error:'no_code' };
  const reg = acctRegion(flow.region); if (!reg) return { error:'no_region' };
  acctArm();
  try {
    const r = await acctFetch(reg, '/auth/v1/token?grant_type=pkce', { method:'POST', body:{ auth_code:code, code_verifier:flow.verifier } });
    return { session:acctSaveSession(r, reg.id, flow.keep), tried:flow.provider };
  } catch (e) { return { error:e.code, tried:flow.provider }; }
}

function acctSaveSession(r, rid, keep) {
  if (!r || typeof r.access_token !== 'string' || typeof r.refresh_token !== 'string') throw acctErr('bad_session');
  const u = r.user || {};
  const s = { region:rid, keep:!!keep, access_token:r.access_token, refresh_token:r.refresh_token,
    expires_at:+r.expires_at || Math.floor(Date.now() / 1000) + (+r.expires_in || 3600),
    user:{ id:String(u.id || ''), email:String(u.email || '').slice(0, 254), provider:String((u.app_metadata && u.app_metadata.provider) || '').slice(0, 40) } };
  acctDel(ACCT_SESSION);
  try { acctStore(keep).setItem(ACCT_SESSION, JSON.stringify(s)); } catch (e) {}
  return s;
}
/* A valid access token, refreshed once when it is about to expire (parallel callers share one refresh). */
let _acctRefreshing = null;
async function acctToken() {
  const s = acctSession(); if (!s) return null;
  if (s.expires_at * 1000 - Date.now() > 6e4) return s.access_token;
  if (!_acctRefreshing) _acctRefreshing = acctRefresh(s).finally(() => { _acctRefreshing = null; });
  return (await _acctRefreshing).access_token;
}
async function acctRefresh(s) {
  acctArm();
  try {
    const r = await acctFetch(acctRegion(s.region), '/auth/v1/token?grant_type=refresh_token', { method:'POST', body:{ refresh_token:s.refresh_token } });
    return acctSaveSession(r, s.region, s.keep);
  } catch (e) {
    if (e.code !== 'offline') acctDel(ACCT_SESSION);   /* revoked or reused refresh token: signed out here too */
    throw e;
  }
}
async function acctSignOut() {
  const s = acctSession(); acctDel(ACCT_SESSION); acctDel(ACCT_FLOW);
  if (!s) return;
  acctArm();
  try { await acctFetch(acctRegion(s.region), '/auth/v1/logout?scope=local', { method:'POST', token:s.access_token }); } catch (e) {}
}
/* At start-up: only a returning sign-in or an earlier session arms the gate. A guest makes no request. */
function acctBoot() {
  let back = false; try { back = typeof location !== 'undefined' && new URL(location.href).searchParams.has('acct'); } catch (e) {}
  if (back || acctSession()) acctArm();
  return back;
}

/* ── words shown to people: never the server's raw text ──
   The linking message names a provider only when the EXISTING one is known; the backend does not reveal it
   (that would tell anyone which emails have accounts), so it is generic unless a caller knows better. */
const ACCT_LINK_CODES = ['email_exists', 'user_already_exists', 'identity_already_exists', 'email_conflict_identity_not_deletable'];
const ACCT_MSG = {
  access_denied:'Sign-in was cancelled. Nothing was saved to an account; you can keep working as a guest.',
  state_mismatch:'This sign-in link does not match a sign-in started in this browser, so it was ignored. Start again from "Sign in".',
  flow_expired:'This sign-in took too long and expired. Start again from "Sign in".',
  bad_code_verifier:'This sign-in link was already used or has expired. Start again from "Sign in".',
  flow_state_not_found:'This sign-in link was already used or has expired. Start again from "Sign in".',
  flow_state_expired:'This sign-in link was already used or has expired. Start again from "Sign in".',
  otp_expired:'This sign-in link was already used or has expired. Start again from "Sign in".',
  invalid_credentials:'Wrong email or password.',
  email_not_confirmed:'Confirm your email first: open the link we sent you.',
  weak_password:'Choose a stronger password: at least 10 characters, with lower-case and upper-case letters and a digit.',
  email_address_invalid:'Check the email address.',
  over_email_send_rate_limit:'Too many emails were sent. Wait a few minutes and try again.',
  over_request_rate_limit:'Too many attempts. Wait a few minutes and try again.',
  provider_disabled:'This sign-in method is not available right now.',
  no_region:'Choose where your account is stored (Europe or United States).',
  offline:'No connection. You can keep working: everything stays on this device.',
};
function acctMessage(code, existingId) {
  if (ACCT_LINK_CODES.includes(code)) {
    const p = existingId && ACCT_PROVIDERS.find(x => x.id === existingId);
    return p && p.kind === 'oauth' ? `This email already uses ${p.label}: sign in with ${p.label} first.`
      : 'This email already has an account with another sign-in method. Sign in with that method first.';
  }
  return ACCT_MSG[code] || 'Sign-in did not work. Nothing was changed; you can keep working as a guest.';
}
