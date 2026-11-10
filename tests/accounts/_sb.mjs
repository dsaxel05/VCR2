// Helpers for the accounts suites: talk to the LOCAL Supabase stack only (tools/accounts_stack.mjs).
// No real accounts, no real keys: users are created on the local stack with random test passwords
// that live only in memory, and keys are read from the running stack, never printed.
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { stackEnv } from '../../tools/accounts_stack.mjs';

export const results = [];
export const ok = (name, cond, detail) => results.push({ name, ok:!!cond, detail });
export const eq = (name, got, exp) => results.push({ name, ok:JSON.stringify(got) === JSON.stringify(exp), detail:{ got, exp } });

export function report(suite) {
  const bad = results.filter(r => !r.ok);
  for (const r of bad) console.log('FAIL ' + r.name + ' ' + String(JSON.stringify(r.detail)).slice(0, 300));
  console.log(`${suite}: ${results.length - bad.length}/${results.length} passed`);
  process.exitCode = bad.length ? 1 : 0;
  /* the sandboxes keep a long autosave timer (acctDelay = 1e9 ms): leave once the results are out */
  setTimeout(() => process.exit(), 200);
}

export function connect(suite) {
  const env = stackEnv();
  if (!env) {
    console.log(`${suite}: SKIPPED, the local Supabase stack is not running (node tools/accounts_stack.mjs start)`);
    process.exit(0);
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.url)) throw new Error('refusing to test against a non-local URL');
  return env;
}

/* One HTTP call. Returns { status, body, code } where code is the Postgres error code or message, if any. */
export async function call(env, path, { method = 'GET', token, key, body, headers = {} } = {}) {
  const h = Object.assign({ apikey:key === undefined ? env.anon : key, 'content-type':'application/json' }, headers);
  if (key === null) delete h.apikey;
  if (token) h.authorization = 'Bearer ' + token;
  const res = await fetch(env.url + path, { method, headers:h, body:body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) {}
  return { status:res.status, body:json, text, code:json && (json.code || json.error_code || json.message || json.msg) };
}
export const svc = (env, path, opts = {}) => call(env, path, Object.assign({ key:env.service, token:env.service }, opts));

export const testPassword = () => 'Aa1' + randomBytes(18).toString('base64url');

/* A confirmed user on the local stack, signed in. */
export async function makeUser(env, tag) {
  const email = `${tag}-${randomUUID().slice(0, 8)}@example.test`, password = testPassword();
  const c = await svc(env, '/auth/v1/admin/users', { method:'POST', body:{ email, password, email_confirm:true } });
  if (c.status >= 300) throw new Error('admin create user failed: ' + c.status + ' ' + c.text.slice(0, 200));
  const s = await call(env, '/auth/v1/token?grant_type=password', { method:'POST', body:{ email, password } });
  if (s.status !== 200) throw new Error('sign in failed: ' + s.status + ' ' + s.text.slice(0, 200));
  return { id:c.body.id, email, password, token:s.body.access_token, refresh:s.body.refresh_token };
}

/* HS256 token signed with the given secret: used to forge, expire or tamper tokens in tests. */
export function signJwt(payload, secret, alg = 'HS256') {
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b({ alg, typ:'JWT' }) + '.' + b(payload);
  if (alg === 'none') return head + '.';
  return head + '.' + createHmac('sha256', secret).update(head).digest('base64url');
}
export const decodeJwt = t => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());

/* A minimal well-formed analysis row (the structured state of A3, never a ledger). */
export const analysis = (over = {}) => Object.assign({
  title:'Acme', company:'Acme', stage:'seed', model:'saas', score:61, band:'Promising', app_version:'5.2.0',
  payload:{ v:4, name:'Acme', stage:'seed', model:'saas', vals:{ arr:'1200000' }, bools:{}, sel:{}, prov:{}, evid:{}, assume:{}, notes:'', checklist:{}, ledger:null },
}, over);
export const rep = { prefer:'return=representation' };
