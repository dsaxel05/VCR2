// Part B, B2: sign-in flows. src/account.js runs in a sandbox with a fake browser (location, storage, history);
// providers are mocked; email and password flows run for real against the LOCAL stack, reading mail from its local inbox.
//   node tools/accounts_stack.mjs start
//   node tests/accounts/signin.test.mjs
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { stackEnv } from '../../tools/accounts_stack.mjs';
import { ok, eq, report, svc, testPassword } from './_sb.mjs';

const SUITE = 'accounts sign-in';
const SRC = readFileSync(new URL('../../src/account.js', import.meta.url), 'utf8');
const SITE = 'http://127.0.0.1:8765/';
const OAUTH = { google:'google', microsoft:'azure', apple:'apple', yahoo:'custom:yahoo', github:'github', linkedin:'linkedin_oidc', x:'twitter', facebook:'facebook' };
const ALL_ON = Object.fromEntries(['google', 'microsoft', 'apple', 'yahoo', 'github', 'linkedin', 'x', 'facebook', 'email_link', 'email_password', 'passkey'].map(k => [k, { enabled:true }]));
const FAKE_EU = { id:'eu', label:'Europe', url:'https://abcdefghijklmnopqrst.supabase.co', anonKey:'fake-anon-key-for-tests-0123456789' };
const FAKE_US = { id:'us', label:'United States', url:'https://tsrqponmlkjihgfedcba.supabase.co', anonKey:'fake-anon-key-for-tests-9876543210' };
const b64 = buf => Buffer.from(buf).toString('base64url');

/* A fresh page: its own storage, address bar and network log. */
function page({ regions = [FAKE_EU], providers = ALL_ON, href = SITE, fetchImpl, store } = {}) {
  const mem = (m = new Map()) => ({ getItem:k => m.has(k) ? m.get(k) : null, setItem:(k, v) => m.set(k, String(v)), removeItem:k => m.delete(k), m });
  const nav = [], calls = [], popups = [], u0 = new URL(href);
  const loc = { href, origin:u0.origin, pathname:u0.pathname, assign:u => nav.push(u) };
  const ctx = { location:loc, localStorage:store ? store.local : mem(), sessionStorage:store ? store.session : mem(),
    history:{ replaceState:(a, b, u) => { loc.href = loc.origin + u; } },
    fetch:async (url, o) => { calls.push({ url, o, body:o && o.body ? JSON.parse(o.body) : null }); if (!fetchImpl) throw new Error('network not expected'); return fetchImpl(url, o); },
    window:{ open:() => { popups.push(1); return null; } }, CFG:{ settings:{ accounts:{ providers } } },
    crypto:globalThis.crypto, TextEncoder, URL, URLSearchParams, btoa, console };
  vm.createContext(ctx);
  vm.runInContext(SRC + '\n;globalThis.__a = { set regions(v) { ACCT_REGIONS = v; }, acctStartOAuth, acctEmailLink, acctSignUp, acctPasswordSignIn, acctHandleReturn, acctSession, acctToken, acctSignOut, acctBoot, acctFetch, acctMessage, acctProviders, acctAvailable };', ctx);
  ctx.__a.regions = regions;
  return { a:ctx.__a, ctx, loc, nav, calls, popups, store:{ local:ctx.localStorage, session:ctx.sessionStorage }, flow:() => JSON.parse(ctx.localStorage.getItem('vcr2-acct-flow') || 'null'),
    goto(url) { const u = new URL(url); loc.href = url; loc.origin = u.origin; loc.pathname = u.pathname; } };
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers:{ 'content-type':'application/json' } });
const fakeSession = (over = {}) => Object.assign({ access_token:'header.payload.sig', refresh_token:'r-' + randomUUID(), expires_in:3600, expires_at:Math.floor(Date.now() / 1000) + 3600, user:{ id:randomUUID(), email:'ana@example.test', app_metadata:{ provider:'google' } } }, over);

/* ── 1. every OAuth button: right backend, right provider, PKCE S256 that matches, one-time state in the return address ── */
for (const [pid, gotrue] of Object.entries(OAUTH)) {
  const p = page();
  await p.a.acctStartOAuth(pid, 'eu', true);
  const u = new URL(p.nav[0]), f = p.flow();
  const challenge = b64(createHash('sha256').update(f.verifier).digest());
  const back = new URL(u.searchParams.get('redirect_to'));
  ok(`${pid}: goes to ${gotrue} through the backend with PKCE S256 and a one-time state`,
    u.origin + u.pathname === FAKE_EU.url + '/auth/v1/authorize' && u.searchParams.get('provider') === gotrue
    && u.searchParams.get('code_challenge_method') === 's256' && u.searchParams.get('code_challenge') === challenge
    && f.verifier.length >= 43 && f.verifier.length <= 128 && f.state.length >= 32
    && back.origin + back.pathname === SITE && back.searchParams.get('acct') === f.state
    && p.calls.length === 0 && p.popups.length === 0,
    { url:p.nav[0], f:{ v:f.verifier.length, s:f.state.length } });
}
{ const p = page(); await p.a.acctStartOAuth('microsoft', 'eu', true);
  eq('Microsoft asks only for the email scope', new URL(p.nav[0]).searchParams.get('scopes'), 'email'); }
{ const p = page({ providers:{ google:{ enabled:true }, github:{ enabled:false } } });
  let e = null; try { await p.a.acctStartOAuth('github', 'eu', true); } catch (x) { e = x.code; }
  ok('a switched-off provider cannot start a sign-in', e === 'provider_disabled' && p.nav.length === 0 && !p.flow(), e); }
{ const p = page(); eq('passkey stays off even if the configuration switches it on (backend marks it experimental)', p.a.acctProviders().some(x => x.id === 'passkey'), false); }
{ const p = page({ providers:{} }); eq('with nothing switched on, sign-in is not offered at all', p.a.acctAvailable(), false); }
{ const p = page({ regions:[] }); eq('with no backend in the build, sign-in is not offered at all', p.a.acctAvailable(), false); }
{ const p = page({ providers:Object.assign({}, ALL_ON, { x:{ enabled:true, gotrue:'x' }, github:{ enabled:true, order:0 } }) });
  const list = p.a.acctProviders().map(x => x.id);
  await p.a.acctStartOAuth('x', 'eu', true);
  ok('order and backend name come from the configuration (GitHub first; X switched to the "x" backend name)', list[0] === 'github' && new URL(p.nav[0]).searchParams.get('provider') === 'x', list); }
{ const p = page(); await p.a.acctStartOAuth('google', 'eu', true); const f1 = p.flow(); await p.a.acctStartOAuth('google', 'eu', true); const f2 = p.flow();
  ok('two sign-ins never share a verifier or a state', f1.verifier !== f2.verifier && f1.state !== f2.state); }
{ const p = page({ regions:[FAKE_EU, FAKE_US] }); await p.a.acctStartOAuth('google', 'us', true);
  ok('the United States choice goes to the US project', p.nav[0].startsWith(FAKE_US.url + '/auth/v1/authorize') && p.flow().region === 'us'); }
{ const p = page({ regions:[FAKE_EU, FAKE_US] }); let e = null; try { await p.a.acctStartOAuth('google', '', true); } catch (x) { e = x.code; }
  ok('with two regions and no choice yet, nothing starts until the user picks one', e === 'no_region' && p.nav.length === 0, e); }

/* ── 2. coming back ── */
async function started(opts = {}) { const p = page(opts); await p.a.acctStartOAuth('google', 'eu', opts.keep !== false); return p; }
{ const s = fakeSession(); const p = await started({ fetchImpl:() => json(s) }); const f = p.flow();
  p.goto(SITE + '?acct=' + f.state + '&code=auth-code-123');
  const r = await p.a.acctHandleReturn();
  const c = p.calls[0];
  ok('the code is exchanged once, at the PKCE endpoint, with the verifier only this browser holds', p.calls.length === 1 && c.url === FAKE_EU.url + '/auth/v1/token?grant_type=pkce'
    && c.body.auth_code === 'auth-code-123' && c.body.code_verifier === f.verifier && c.o.headers.apikey === FAKE_EU.anonKey, c && c.url);
  ok('signed in, and the code is wiped from the address bar', r.session && r.session.user.email === 'ana@example.test' && !/code=|acct=/.test(p.loc.href), p.loc.href);
  ok('"keep me signed in": the session is kept on this device', !!p.store.local.getItem('vcr2-acct-session') && !p.store.session.getItem('vcr2-acct-session')); }
{ const p = await started({ keep:false, fetchImpl:() => json(fakeSession()) }); p.goto(SITE + '?acct=' + p.flow().state + '&code=c');
  await p.a.acctHandleReturn();
  ok('"don\'t keep me signed in": the session lives in this tab only', !!p.store.session.getItem('vcr2-acct-session') && !p.store.local.getItem('vcr2-acct-session')); }
{ const p = await started(); p.goto(SITE + '?acct=forged-state-value&code=c');
  const r = await p.a.acctHandleReturn();
  ok('a wrong state is refused with no request', r.error === 'state_mismatch' && p.calls.length === 0, r); }
{ const p = page(); p.goto(SITE + '?acct=attacker-state&code=attacker-code');
  ok('a sign-in link this browser never started (login CSRF) is dropped with no request', p.a.acctBoot() === true && (await p.a.acctHandleReturn()).error === 'state_mismatch' && p.calls.length === 0); }
{ const p = await started(); const f = p.flow(); f.t -= 11 * 60000; p.store.local.setItem('vcr2-acct-flow', JSON.stringify(f));
  p.goto(SITE + '?acct=' + f.state + '&code=c');
  eq('a sign-in older than 10 minutes is refused with no request', [(await p.a.acctHandleReturn()).error, p.calls.length], ['flow_expired', 0]); }
{ const p = await started({ fetchImpl:() => json(fakeSession()) }); const url = SITE + '?acct=' + p.flow().state + '&code=c';
  p.goto(url); await p.a.acctHandleReturn(); p.goto(url); const r2 = await p.a.acctHandleReturn();
  ok('the same return address replayed is refused (state used once)', r2.error === 'state_mismatch' && p.calls.length === 1, r2); }
{ const p = await started(); p.goto(SITE + '?acct=' + p.flow().state + '&error=access_denied&error_description=The+user+denied');
  const r = await p.a.acctHandleReturn();
  ok('cancel at the provider: a calm message, no request, nothing stored', r.error === 'access_denied' && /cancelled/.test(p.a.acctMessage(r.error)) && p.calls.length === 0 && !p.flow() && !p.store.local.getItem('vcr2-acct-session')); }
{ const p = await started(); p.goto(SITE + '?acct=' + p.flow().state + '&error=server_error&error_description=' + encodeURIComponent('<img src=x onerror=alert(1)>'));
  const r = await p.a.acctHandleReturn(), m = p.a.acctMessage(r.error);
  ok('a provider error shows fixed words, never the provider\'s text', !/img|onerror|alert/.test(m) && /did not work/.test(m), m); }
{ const p = await started({ fetchImpl:() => json({ error_code:'bad_code_verifier', msg:'code challenge does not match' }, 400) });
  p.goto(SITE + '?acct=' + p.flow().state + '&code=c'); const r = await p.a.acctHandleReturn();
  ok('a code the backend refuses leaves you signed out with a plain message', r.error === 'bad_code_verifier' && !p.a.acctSession() && /already used or has expired/.test(p.a.acctMessage(r.error)), r); }
{ const p = page();
  ok('account linking: the message never names the provider just tried, only a known existing one',
    p.a.acctMessage('identity_already_exists', null) === 'This email already has an account with another sign-in method. Sign in with that method first.'
    && p.a.acctMessage('email_exists', 'google') === 'This email already uses Google: sign in with Google first.'); }

/* ── 3. the network gate (A1, A2) ── */
{ const p = page({ fetchImpl:() => json({}) }); const back = p.a.acctBoot(); let e = null;
  try { await p.a.acctFetch(FAKE_EU, '/rest/v1/analyses'); } catch (x) { e = x.code; }
  ok('a guest page: start-up arms nothing and the module refuses to connect', back === false && e === 'not_armed' && p.calls.length === 0, e); }
{ const p = page({ fetchImpl:() => json({}) }); await p.a.acctStartOAuth('google', 'eu', true); let e = null;
  try { await p.a.acctFetch({ id:'eu', url:'https://evil.example', anonKey:FAKE_EU.anonKey }, '/x'); } catch (x) { e = x.code; }
  ok('even after a click, a host that is not one of the build\'s projects is refused', e === 'unknown_region' && p.calls.length === 0, e); }
{ const p = page({ regions:[{ id:'eu', url:'https://evil.example.com', anonKey:'x'.repeat(30) }] });
  eq('a malformed project address in the build is ignored', p.a.acctAvailable(), false); }

/* ── 4. session upkeep ── */
{ let n = 0; const p = page({ fetchImpl:async () => { n++; await new Promise(r => setTimeout(r, 30)); return json(fakeSession({ access_token:'new.token.' + n })); } });
  p.store.local.setItem('vcr2-acct-session', JSON.stringify({ region:'eu', keep:true, access_token:'old', refresh_token:'r1', expires_at:Math.floor(Date.now() / 1000) + 20, user:{ id:'u', email:'a@b.test' } }));
  p.a.acctBoot();
  const toks = await Promise.all([p.a.acctToken(), p.a.acctToken(), p.a.acctToken()]);
  ok('a token about to expire is refreshed once for three parallel callers', n === 1 && toks.every(t => t === 'new.token.1') && p.calls[0].body.refresh_token === 'r1', { n, toks }); }
{ const p = page({ fetchImpl:() => json({ error_code:'refresh_token_already_used' }, 400) });
  p.store.local.setItem('vcr2-acct-session', JSON.stringify({ region:'eu', keep:true, access_token:'old', refresh_token:'r1', expires_at:1, user:{ id:'u', email:'a@b.test' } }));
  p.a.acctBoot(); let e = null; try { await p.a.acctToken(); } catch (x) { e = x.code; }
  ok('a refused refresh signs this device out', e === 'refresh_token_already_used' && !p.a.acctSession(), e); }
{ const p = page({ fetchImpl:() => { throw new TypeError('Failed to fetch'); } });
  p.store.local.setItem('vcr2-acct-session', JSON.stringify({ region:'eu', keep:true, access_token:'old', refresh_token:'r1', expires_at:1, user:{ id:'u', email:'a@b.test' } }));
  p.a.acctBoot(); let e = null; try { await p.a.acctToken(); } catch (x) { e = x.code; }
  ok('offline during a refresh: still signed in, retried later', e === 'offline' && !!p.a.acctSession(), e); }

/* ── 5. against the local sign-in server (no real provider, no real email) ── */
const env = stackEnv();
if (!env) console.log(SUITE + ': local stack not running, the live part is SKIPPED');
else {
  const LOCAL = { id:'eu', label:'Local', url:env.url, anonKey:env.anon };
  const live = (o = {}) => page(Object.assign({ regions:[LOCAL], fetchImpl:(u, opt) => fetch(u, opt) }, o));
  const mail = async (to, after) => {
    for (let i = 0; i < 40; i++) {
      const r = await (await fetch(env.inbucket + '/api/v1/search?query=' + encodeURIComponent('to:"' + to + '"'))).json();
      const m = (r.messages || []).find(x => !after || x.ID !== after);
      if (m) { const full = await (await fetch(env.inbucket + '/api/v1/message/' + m.ID)).json(); const link = (full.Text || '').match(/https?:\/\/[^\s)\]]+\/auth\/v1\/verify\?[^\s)\]]+/); return { id:m.ID, link:link && link[0] }; }
      await new Promise(r => setTimeout(r, 250));
    }
    return {};
  };
  const follow = async link => { const r = await fetch(link, { redirect:'manual' }); return r.headers.get('location') || ''; };

  { const p = live(); await p.a.acctStartOAuth('github', 'eu', true);
    const r = await fetch(p.nav[0], { redirect:'manual' }), to = new URL(r.headers.get('location') || 'about:blank');
    ok('the local sign-in server accepts VCR2\'s PKCE request and sends the browser to GitHub with its own state',
      r.status === 302 && to.origin === 'https://github.com' && to.searchParams.get('client_id') === 'vcr2-local-test-client'
      && to.searchParams.get('redirect_uri') === env.url + '/auth/v1/callback' && (to.searchParams.get('state') || '').length > 20, { status:r.status, to:to.origin + to.pathname }); }
  { const p = live(); await p.a.acctStartOAuth('google', 'eu', true);
    eq('the local sign-in server refuses a provider it has not switched on', (await fetch(p.nav[0], { redirect:'manual' })).status, 400); }

  const email = `link-${randomUUID().slice(0, 8)}@example.test`;
  { const p = live(); await p.a.acctEmailLink(email, 'eu', true);
    const m = await mail(email), back = m.link ? await follow(m.link) : '';
    ok('email link: one email arrives with a sign-in link', !!m.link, m);
    p.goto(back); const r = await p.a.acctHandleReturn();
    ok('email link: the link comes back with a code and signs in that email (PKCE exchange)', r && r.session && r.session.user.email === email, { back:back.replace(/code=[^&]+/, 'code=…'), r:r && (r.error || 'ok') });
    const tok = await p.a.acctToken();
    eq('email link: the new session can read its own (empty) library', (await fetch(env.url + '/rest/v1/analyses?select=id', { headers:{ apikey:env.anon, authorization:'Bearer ' + tok } })).status, 200);
    const again = m.link ? await follow(m.link) : '';
    ok('email link: the same link used a second time does not sign in again', !/[?&]code=/.test(again), again.replace(/token=[^&]+/, 'token=…'));
    await p.a.acctSignOut();
    ok('sign out: the session is gone from this device', !p.a.acctSession()); }

  const pw = testPassword(), e2 = `pass-${randomUUID().slice(0, 8)}@example.test`;
  { const p = live(); let code = null;
    try { await p.a.acctSignUp(e2, 'short', 'eu', true); } catch (x) { code = x.code; }
    eq('sign up: a weak password is refused by the server', code, 'weak_password');
    const r = await p.a.acctSignUp(e2, pw, 'eu', true);
    ok('sign up: email verification is required before any session', r.confirm === true && !p.a.acctSession(), r);
    code = null; try { await p.a.acctPasswordSignIn(e2, pw, 'eu', true); } catch (x) { code = x.code; }
    eq('sign up: signing in before confirming the email is refused', code, 'email_not_confirmed');
    const m = await mail(e2); p.goto(m.link ? await follow(m.link) : SITE);
    const back = await p.a.acctHandleReturn();
    ok('sign up: the confirmation link signs in (PKCE)', back && back.session && back.session.user.email === e2, back && back.error);
    await p.a.acctSignOut(); }
  { const p = live(); let code = null;
    try { await p.a.acctPasswordSignIn(e2, pw + 'x', 'eu', true); } catch (x) { code = x.code; }
    eq('password: a wrong password gets one plain answer', [code, p.a.acctMessage(code)], ['invalid_credentials', 'Wrong email or password.']);
    code = null; try { await p.a.acctPasswordSignIn('nobody-' + randomUUID().slice(0, 6) + '@example.test', pw, 'eu', true); } catch (x) { code = x.code; }
    eq('password: an unknown email gets the same answer (no account enumeration)', code, 'invalid_credentials');
    const s = (await p.a.acctPasswordSignIn(e2, pw, 'eu', false)).session;
    ok('password: correct password signs in, kept in this tab only when asked', s.user.email === e2 && !!p.store.session.getItem('vcr2-acct-session') && !p.store.local.getItem('vcr2-acct-session'));
    const old = JSON.parse(p.store.session.getItem('vcr2-acct-session'));
    old.expires_at = 1; p.store.session.setItem('vcr2-acct-session', JSON.stringify(old));
    const fresh = await p.a.acctToken();
    ok('refresh against the real server: a new access token', typeof fresh === 'string' && fresh !== old.access_token);
    const cur = p.a.acctSession(); await p.a.acctSignOut();
    eq('sign out: the server refuses the signed-out refresh token', (await fetch(env.url + '/auth/v1/token?grant_type=refresh_token', { method:'POST', headers:{ apikey:env.anon, 'content-type':'application/json' }, body:JSON.stringify({ refresh_token:cur.refresh_token }) })).status >= 400, true); }

  /* tidy up the test users */
  const list = (await svc(env, '/auth/v1/admin/users?per_page=200')).body.users || [];
  for (const u of list) if (u.email === email || u.email === e2) await svc(env, '/auth/v1/admin/users/' + u.id, { method:'DELETE' });
}
report(SUITE);
