// Part B, B1: per-user isolation and security, enforced by the database (rule A7), against the LOCAL stack.
//   node tools/accounts_stack.mjs start      (Docker Desktop must be running)
//   node tests/accounts/isolation.test.mjs
import { randomUUID } from 'node:crypto';
import { connect, call, svc, makeUser, signJwt, decodeJwt, analysis, rep, ok, eq, report } from './_sb.mjs';

const SUITE = 'accounts isolation';
const env = connect(SUITE);
const denied = r => r.status === 401 || r.status === 403;
const refused = (r, word) => r.status >= 400 && (!word || r.text.includes(word));
const A = await makeUser(env, 'iso-a'), B = await makeUser(env, 'iso-b');
const asA = (p, o = {}) => call(env, p, Object.assign({ token:A.token }, o));
const asB = (p, o = {}) => call(env, p, Object.assign({ token:B.token }, o));
const rowsOf = async id => (await svc(env, '/rest/v1/analyses?id=eq.' + id)).body;
const setLimits = body => svc(env, '/rest/v1/app_limits?id=eq.true', { method:'PATCH', body });
const DEFAULT_LIMITS = { max_analyses:100, max_bytes:5242880, max_record_bytes:1048576, max_versions:20 };

/* ── own rows ── */
const ins = await asA('/rest/v1/analyses', { method:'POST', body:analysis(), headers:rep });
eq('A can create an analysis', ins.status, 201);
const aRow = ins.body && ins.body[0], aId = aRow && aRow.id;
eq('the server sets the owner to the signed-in user', aRow && aRow.owner, A.id);
eq('A reads their own analysis', (await asA('/rest/v1/analyses?id=eq.' + aId)).body.length, 1);
ok('the server counts the stored bytes', aRow && aRow.bytes > 0, aRow && aRow.bytes);

/* ── user B against user A ── */
eq('B lists analyses: none of A\'s', (await asB('/rest/v1/analyses?select=id')).body.filter(r => r.id === aId).length, 0);
eq('B reads A\'s analysis by id: nothing', (await asB('/rest/v1/analyses?id=eq.' + aId)).body, []);
const bUpd = await asB('/rest/v1/analyses?id=eq.' + aId, { method:'PATCH', body:{ title:'pwned', version:2 }, headers:rep });
eq('B updates A\'s analysis: no row touched', bUpd.body, []);
eq('A\'s analysis is unchanged after B\'s attempt', (await rowsOf(aId))[0].title, 'Acme');
const bDel = await asB('/rest/v1/analyses?id=eq.' + aId, { method:'DELETE', headers:rep });
eq('B deletes A\'s analysis: no row touched', bDel.body, []);
eq('A\'s analysis still exists after B\'s delete', (await rowsOf(aId)).length, 1);
ok('B inserts a row owned by A: refused', refused(await asB('/rest/v1/analyses', { method:'POST', body:analysis({ owner:A.id }) }), 'owner_mismatch'));
ok('A inserts a row owned by B: refused', refused(await asA('/rest/v1/analyses', { method:'POST', body:analysis({ owner:B.id }) }), 'owner_mismatch'));
const bOwn = (await asB('/rest/v1/analyses', { method:'POST', body:analysis({ title:'B deal' }), headers:rep })).body[0];
ok('B moves their own row to A: refused', refused(await asB('/rest/v1/analyses?id=eq.' + bOwn.id, { method:'PATCH', body:{ owner:A.id, version:2 } })));
eq('B\'s row still belongs to B', (await rowsOf(bOwn.id))[0].owner, B.id);
const injected = await asB('/rest/v1/analyses?select=id&or=(owner.eq.' + A.id + ',owner.neq.' + B.id + ')');
eq('a crafted filter naming A\'s id returns nothing to B', injected.body, []);
const wild = await asB('/rest/v1/analyses?select=id,owner&title=ilike.' + encodeURIComponent('*'));
ok('a wildcard search returns only B\'s rows', Array.isArray(wild.body) && wild.body.length >= 1 && wild.body.every(r => r.owner === B.id), wild.body);
const sq = await asB('/rest/v1/analyses?select=id&title=ilike.' + encodeURIComponent("*' or 1=1 --*"));
eq('an SQL-shaped search term is data, not code', sq.body, []);

/* ── anonymous and forged access ── */
ok('anonymous: list analyses refused', denied(await call(env, '/rest/v1/analyses?select=id')));
ok('anonymous: create refused', denied(await call(env, '/rest/v1/analyses', { method:'POST', body:analysis() })));
ok('anonymous: read profiles refused', denied(await call(env, '/rest/v1/profiles?select=owner')));
ok('anonymous: read versions refused', denied(await call(env, '/rest/v1/analysis_versions?select=id')));
ok('anonymous: read limits refused', denied(await call(env, '/rest/v1/app_limits?select=*')));
ok('anonymous: usage refused', (await call(env, '/rest/v1/rpc/my_usage', { method:'POST', body:{} })).status >= 400);
ok('anonymous: delete account refused', (await call(env, '/rest/v1/rpc/delete_my_account', { method:'POST', body:{} })).status >= 400);
ok('no API key at all: refused', (await call(env, '/rest/v1/analyses?select=id', { key:null })).status >= 400);
const claims = decodeJwt(A.token);
const forged = signJwt(Object.assign({}, claims, { sub:B.id }), 'not-the-server-secret-but-32-chars-long!');
ok('a token signed with a wrong key is refused', (await call(env, '/rest/v1/analyses?select=id', { token:forged })).status === 401);
ok('an unsigned token (alg none) is refused', (await call(env, '/rest/v1/analyses?select=id', { token:signJwt(Object.assign({}, claims, { sub:B.id }), '', 'none') })).status === 401);
const parts = A.token.split('.'), tampered = parts[0] + '.' + Buffer.from(JSON.stringify(Object.assign({}, claims, { sub:B.id }))).toString('base64url') + '.' + parts[2];
ok('A\'s token with the user id swapped is refused', (await call(env, '/rest/v1/analyses?select=id', { token:tampered })).status === 401);
ok('a forged service-role token is refused', (await call(env, '/rest/v1/analyses?select=id', { token:signJwt({ role:'service_role', iss:'supabase-demo', exp:Math.floor(Date.now() / 1000) + 600 }, 'wrong-secret-wrong-secret-wrong-secret') })).status === 401);
if (env.jwtSecret) {
  /* The stack also accepts tokens signed with its shared secret: first prove a fresh one works, so the refusal below is about expiry only. */
  const now = Math.floor(Date.now() / 1000);
  const fresh = signJwt(Object.assign({}, claims, { iat:now, exp:now + 600 }), env.jwtSecret);
  eq('control: a fresh token signed by the stack is accepted', (await call(env, '/rest/v1/analyses?select=id', { token:fresh })).status, 200);
  const expired = signJwt(Object.assign({}, claims, { iat:now - 7200, exp:now - 60 }), env.jwtSecret);
  ok('the same token, expired a minute ago, is refused', (await call(env, '/rest/v1/analyses?select=id', { token:expired })).status === 401);
}
const old = A.token, again = await call(env, '/auth/v1/token?grant_type=password', { method:'POST', body:{ email:A.email, password:A.password } });
await call(env, '/auth/v1/logout?scope=global', { method:'POST', token:again.body.access_token });
ok('after "sign out everywhere", an old session token is refused by the sign-in service', denied(await call(env, '/auth/v1/user', { token:old })));
ok('after "sign out everywhere", the old refresh token is refused (no replay)', (await call(env, '/auth/v1/token?grant_type=refresh_token', { method:'POST', body:{ refresh_token:A.refresh } })).status >= 400);
A.token = (await call(env, '/auth/v1/token?grant_type=password', { method:'POST', body:{ email:A.email, password:A.password } })).body.access_token;
const meta = await asA('/auth/v1/user', { method:'PUT', body:{ data:{ sub:B.id, role:'service_role', owner:B.id } } });
eq('A can edit their own profile metadata', meta.status, 200);
const A2 = (await call(env, '/auth/v1/token?grant_type=password', { method:'POST', body:{ email:A.email, password:A.password } })).body.access_token;
eq('self-edited metadata (claims B\'s id, service role) grants nothing on B\'s rows', (await call(env, '/rest/v1/analyses?id=eq.' + bOwn.id, { token:A2 })).body, []);
A.token = A2;

/* ── what may be stored (A3) ── */
ok('a payload with the customer ledger is refused', refused(await asA('/rest/v1/analyses', { method:'POST', body:analysis({ payload:{ v:4, name:'X', ledger:{ csv:'customer,month,mrr\nBigCo,2026-01,100' } } }) }), 'analyses_payload_ok'));
ok('a payload with extracted document text is refused', refused(await asA('/rest/v1/analyses', { method:'POST', body:analysis({ payload:{ v:4, name:'X', docText:'Page 1 of the deck' } }) }), 'analyses_payload_ok'));
ok('a payload with an AI key is refused', refused(await asA('/rest/v1/analyses', { method:'POST', body:analysis({ payload:{ v:4, apiKey:'sk-test-fake' } }) }), 'analyses_payload_ok'));
ok('a payload that is not an object is refused', refused(await asA('/rest/v1/analyses', { method:'POST', body:analysis({ payload:[1, 2] }) })));
eq('a payload with ledger:null is accepted', (await asA('/rest/v1/analyses', { method:'POST', body:analysis({ title:'ok-null-ledger' }) })).status, 201);
ok('a Vault row carrying clear data is refused', refused(await asA('/rest/v1/analyses', { method:'POST', body:analysis({ vault:true, cipher:'QUJD' }) }), 'vault_shape'));
ok('a Vault row whose ciphertext is not base64 is refused', refused(await asA('/rest/v1/analyses', { method:'POST', body:{ title:'v', vault:true, cipher:'<script>alert(1)</script>' } })));
eq('a Vault row with ciphertext only is accepted', (await asA('/rest/v1/analyses', { method:'POST', body:{ title:'Vault deal', vault:true, cipher:'QUJDREVGR0g=' } })).status, 201);
ok('comparables that embed a full assessment are refused', refused(await asA('/rest/v1/profiles', { method:'POST', body:{ comparables:[{ company:'X', metrics:{ arr:1 }, payload:{ ledger:{ csv:'a' } } }] } })));
eq('A can create their own profile', (await asA('/rest/v1/profiles', { method:'POST', body:{ prefs:{ theme:'dark' }, comparables:[{ company:'Peer', metrics:{ arr:1e6 } }] } })).status, 201);
eq('B cannot read A\'s profile', (await asB('/rest/v1/profiles?owner=eq.' + A.id)).body, []);
ok('preferences over 16 KB are refused', refused(await asB('/rest/v1/profiles', { method:'POST', body:{ prefs:{ x:'y'.repeat(17000) } } })));
const xss = '<img src=x onerror=alert(1)><script>alert(2)</script>';
const xr = (await asA('/rest/v1/analyses', { method:'POST', body:analysis({ title:xss, company:xss, payload:{ v:4, name:xss, notes:xss } }), headers:rep })).body[0];
eq('script in a company name is stored exactly as typed (escaping is the page\'s job)', [xr.company, xr.payload.notes], [xss, xss]);

/* ── version counter and replays (A9) ── */
const up2 = await asA('/rest/v1/analyses?id=eq.' + aId + '&version=eq.1', { method:'PATCH', body:{ title:'Acme v2', version:2 }, headers:rep });
eq('A updates with the next version number', up2.body && up2.body[0] && up2.body[0].version, 2);
ok('replaying the same update is refused', refused(await asA('/rest/v1/analyses?id=eq.' + aId, { method:'PATCH', body:{ title:'Acme replay', version:2 } }), 'version_conflict'));
ok('a stale device (same version) is refused', refused(await asA('/rest/v1/analyses?id=eq.' + aId, { method:'PATCH', body:{ title:'stale', version:1 } }), 'version_conflict'));
ok('skipping a version is refused', refused(await asA('/rest/v1/analyses?id=eq.' + aId, { method:'PATCH', body:{ title:'skip', version:4 } }), 'version_conflict'));
ok('replaying a create with the same id is refused', refused(await asA('/rest/v1/analyses', { method:'POST', body:analysis({ id:aId }) })));
const keep = (await rowsOf(aId))[0];
ok('created_at cannot be rewritten', refused(await asA('/rest/v1/analyses?id=eq.' + aId, { method:'PATCH', body:{ created_at:'2000-01-01T00:00:00Z', version:keep.version + 1 } })) || (await rowsOf(aId))[0].created_at === keep.created_at);

/* ── versions ── */
const ver = { analysis_id:aId, version:2, label:'first', payload:{ v:4, name:'Acme' } };
eq('A saves a version of their analysis', (await asA('/rest/v1/analysis_versions', { method:'POST', body:ver })).status, 201);
ok('B attaches a version to A\'s analysis: refused', denied(await asB('/rest/v1/analysis_versions', { method:'POST', body:Object.assign({}, ver, { version:3 }) })));
eq('B reads A\'s versions: nothing', (await asB('/rest/v1/analysis_versions?analysis_id=eq.' + aId)).body, []);
ok('a saved version cannot be edited', (await asA('/rest/v1/analysis_versions?analysis_id=eq.' + aId, { method:'PATCH', body:{ label:'changed' } })).status >= 400);
eq('the saved version keeps its label', (await asA('/rest/v1/analysis_versions?select=label&analysis_id=eq.' + aId)).body.map(r => r.label), ['first']);
await setLimits({ max_versions:3 });
for (let v = 3; v <= 7; v++) await asA('/rest/v1/analysis_versions', { method:'POST', body:Object.assign({}, ver, { version:v }) });
eq('only the last N versions are kept (N=3 for the test)', (await asA('/rest/v1/analysis_versions?select=version&analysis_id=eq.' + aId + '&order=version')).body.map(r => r.version), [5, 6, 7]);

/* ── quotas ── */
const C = await makeUser(env, 'iso-c'), asC = (p, o = {}) => call(env, p, Object.assign({ token:C.token }, o));
ok('a single analysis over the per-record limit is refused', refused(await asC('/rest/v1/analyses', { method:'POST', body:analysis({ payload:{ v:4, notes:'x'.repeat(1100000) } }) }), 'record_too_large'));
await setLimits({ max_analyses:3 });
for (let i = 0; i < 3; i++) await asC('/rest/v1/analyses', { method:'POST', body:analysis({ title:'q' + i }) });
ok('the analysis-count quota is enforced', refused(await asC('/rest/v1/analyses', { method:'POST', body:analysis({ title:'q4' }) }), 'quota_analyses'));
const use = (await asC('/rest/v1/rpc/my_usage', { method:'POST', body:{} })).body;
eq('my_usage reports the user\'s own count and cap', [use && use.analyses, use && use.max_analyses], [3, 3]);
await setLimits({ max_analyses:100, max_bytes:20000 });
ok('the megabyte quota is enforced', refused(await asC('/rest/v1/analyses', { method:'POST', body:analysis({ payload:{ v:4, notes:'x'.repeat(30000) } }) }), 'quota_bytes'));
const leak = await asC('/rest/v1/analyses', { method:'POST', body:analysis({ owner:A.id, payload:{ v:4, notes:'x'.repeat(30000) } }) });
ok('a forged owner is refused before the quota check, so no usage figure of another user leaks', refused(leak, 'owner_mismatch') && !leak.text.includes('quota'));
await setLimits(DEFAULT_LIMITS);
ok('limits cannot be changed by a signed-in user', (await asA('/rest/v1/app_limits?id=eq.true', { method:'PATCH', body:{ max_analyses:99999 }, headers:rep })).status >= 400);
eq('the limits are unchanged after that attempt', (await svc(env, '/rest/v1/app_limits?select=max_analyses')).body, [{ max_analyses:100 }]);

/* ── owner-only aggregate summary ── */
ok('a normal user cannot read the usage summary', refused(await asB('/rest/v1/rpc/usage_summary', { method:'POST', body:{} }), 'not_allowed'));
ok('the admin list is not readable through the API', (await asA('/rest/v1/app_admins?select=*')).status >= 400);
await svc(env, '/rest/v1/app_admins', { method:'POST', body:{ user_id:B.id } });
const sum = await asB('/rest/v1/rpc/usage_summary', { method:'POST', body:{} });
eq('the summary for a listed admin holds counts only', sum.body && Object.keys(sum.body).sort(), ['accounts', 'analyses', 'bytes']);

/* ── A11: "Delete my account" removes everything on the server ── */
const D = await makeUser(env, 'iso-d'), asD = (p, o = {}) => call(env, p, Object.assign({ token:D.token }, o));
const dRow = (await asD('/rest/v1/analyses', { method:'POST', body:analysis(), headers:rep })).body[0];
await asD('/rest/v1/analysis_versions', { method:'POST', body:{ analysis_id:dRow.id, version:1, payload:{ v:4 } } });
await asD('/rest/v1/profiles', { method:'POST', body:{ prefs:{ lang:'fr' } } });
const E = await makeUser(env, 'iso-e');
ok('the delete function only ever deletes the caller: E deletes E, D is untouched', (await call(env, '/rest/v1/rpc/delete_my_account', { method:'POST', body:{}, token:E.token })).status < 300
  && (await svc(env, '/auth/v1/admin/users/' + D.id)).status === 200 && (await svc(env, '/auth/v1/admin/users/' + E.id)).status === 404);
eq('a user can delete their own account', (await asD('/rest/v1/rpc/delete_my_account', { method:'POST', body:{} })).status, 204);
const left = await Promise.all(['analyses', 'analysis_versions', 'profiles'].map(tb => svc(env, '/rest/v1/' + tb + '?select=owner&owner=eq.' + D.id)));
eq('after deletion no analysis, version or profile of that user remains', left.map(r => r.body.length), [0, 0, 0]);
eq('after deletion the sign-in record is gone', (await svc(env, '/auth/v1/admin/users/' + D.id)).status, 404);
ok('after deletion the old password no longer signs in', (await call(env, '/auth/v1/token?grant_type=password', { method:'POST', body:{ email:D.email, password:D.password } })).status >= 400);

/* ── tidy up: delete the test users (cascades) ── */
for (const u of [A, B, C]) await svc(env, '/auth/v1/admin/users/' + u.id, { method:'DELETE' });
eq('deleting a user removes all their analyses (cascade)', (await svc(env, '/rest/v1/analyses?select=id&owner=in.(' + [A.id, B.id, C.id].join(',') + ')')).body, []);
report(SUITE);
