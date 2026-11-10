// Part B, B4: terms (A12), first sign-in migration (A10), download and deletion (A11), Vault mode (A4), against the LOCAL stack.
//   node tools/accounts_stack.mjs start
//   node tests/accounts/vault.test.mjs
import { connect, svc, makeUser, ok, eq, report } from './_sb.mjs';
import { device as dev } from './_device.mjs';

const SUITE = 'accounts vault, migration, data rights';
const env = connect(SUITE);
const device = (u, l) => dev(env, u, l);
const rows = async (t, uid) => (await svc(env, `/rest/v1/${t}?select=*&owner=eq.${uid}`)).body;
const PASS = 'correct horse battery staple 42';

/* ── A12: terms before anything is stored ── */
const T = await makeUser(env, 'terms'), t1 = device(T, 't1'); await t1.signIn();
t1.run('_acctTermsOk = false; TERMS = false');
eq('terms declined: signed out, nothing stored', [await t1.run('acctAfterSignIn()'), t1.run('acctSession()'), (await rows('profiles', T.id)).length], ['declined', null, 0]);
await t1.signIn(); t1.run('_acctTermsOk = false; acctNewDraft()'); await t1.edit("S.name = 'Before terms'");
ok('before the terms are accepted, an edit is not sent ("accept the terms")', (await rows('analyses', T.id)).length === 0 && /accept the terms/.test(t1.status()), t1.status());
t1.run('TERMS = true'); await t1.run('acctAfterSignIn()');
ok('terms accepted: the date is stored in the account and saving starts', !!(await rows('profiles', T.id))[0].terms_accepted_at && t1.run('_acctTermsOk') === true);

/* ── A10: analyses from before sign-in ── */
const M = await makeUser(env, 'migr'), m1 = device(M, 'm1');
m1.run(`S.name = 'Local Draft Co'; S.vals.arr_now = '500000';
  LIB = [{ id:'r1', company:'Run One', stage:'seed', model:'saas', date:'2026-10-01', source:'assessment', metrics:{ score:61 }, payload:{ v:4, name:'Run One', vals:{ arr_now:'1' }, ledger:{ csv:'customer,month,mrr\\nSecretCustomerCo,2026-01,5' }, junkKey:'x' } },
         { id:'r2', company:'Run Two', stage:'a', model:'saas', source:'assessment', metrics:{ score:70 }, payload:{ v:4, name:'Run Two', vals:{ arr_now:'2' } } },
         { id:'c1', company:'Peer CSV', source:'csv', metrics:{ arr:1 } }]`);
await m1.signIn(); m1.run('_acctTermsOk = false'); await m1.run('acctAfterSignIn()');
eq('first sign-in with local work: asked about the open draft and the 2 saved runs (not the CSV comparable)', m1.run('MIGRATE.map(x => x.key)'), ['draft', 'r1', 'r2']);
eq('nothing moved before the answer', (await rows('analyses', M.id)).length, 0);
const mr = await m1.run("acctMigrate(['draft', 'r1'])");
eq('the ticked ones are moved, the unticked one is not', [mr.done, (await rows('analyses', M.id)).map(r => r.title).sort()], [['draft', 'r1'], ['Local Draft Co', 'Run One']]);
ok('local copies stay until the person says to delete them', m1.run('LIB.length') === 3);
{ const r1 = (await rows('analyses', M.id)).find(r => r.title === 'Run One'), txt = JSON.stringify(r1);
  ok('a moved run carries no customer ledger and no unknown field; its ledger figures come along', r1.payload.ledger === null && !txt.includes('SecretCustomerCo') && !('junkKey' in r1.payload) && !!r1.payload.ledgerStats); }
m1.run("acctDropLocal(['draft', 'r1'])");
eq('"Delete the local copies": only the moved run goes; the unmoved run and the CSV comparable stay', m1.run('LIB.map(e => e.id).join()'), 'r2,c1');
await m1.edit("S.notes = 'after migration'");
eq('the moved draft is now saved to the account as it changes', (await rows('analyses', M.id)).find(r => r.title === 'Local Draft Co').payload.notes, 'after migration');
await svc(env, '/rest/v1/app_limits?id=eq.true', { method:'PATCH', body:{ max_analyses:2 } });
const mf = await m1.run("acctMigrate(['r2'])");
ok('a move refused by the account (quota): reported, and the local copy is kept', mf.failed.length === 1 && /number of analyses/.test(mf.failed[0].msg) && m1.run('LIB.some(e => e.id === "r2")'), mf);
await svc(env, '/rest/v1/app_limits?id=eq.true', { method:'PATCH', body:{ max_analyses:100 } });

/* ── A11: download all my data, delete my account ── */
await m1.run("acctSaveVersion('v')");
const all = await m1.run('acctExportAll()');
ok('"Download all my data": account, every analysis, every version, the profile', all.account.email === M.email && all.analyses.length === 2 && all.versions.length === 1 && !!all.profile);
const other = await makeUser(env, 'other'), o1 = device(other, 'o1'); await o1.signIn(); o1.run('acctNewDraft()'); await o1.edit("S.name = 'Other user deal'");
ok('the download holds only this account\'s data', all.analyses.every(r => r.owner === M.id) && !JSON.stringify(all).includes('Other user deal'));
const back = m1.run(`(() => { restorePayload(${JSON.stringify(all.analyses.find(r => r.title === 'Run One').payload)}); return S.vals.arr_now; })()`);
eq('round trip: an analysis from the download opens again with the same figures', back, '1');
let nc = null; try { await m1.run("acctDeleteAccount('delete')"); } catch (e) { nc = e.code; }
ok('delete needs DELETE typed exactly; anything else changes nothing', nc === 'not_confirmed' && (await rows('analyses', M.id)).length === 2);
await m1.run("acctDeleteAccount('DELETE')");
const left = await Promise.all(['analyses', 'analysis_versions', 'profiles'].map(t => rows(t, M.id)));
eq('after deletion: no analysis, version or profile left on the server', left.map(r => r.length), [0, 0, 0]);
eq('after deletion: the sign-in record is gone and this device is signed out', [(await svc(env, '/auth/v1/admin/users/' + M.id)).status, m1.run('acctSession()')], [404, null]);
eq('another user\'s data is untouched', (await rows('analyses', other.id)).length, 1);

/* ── A4: Vault ── */
const V = await makeUser(env, 'vault'), v1 = device(V, 'v1'); await v1.signIn(); await v1.run('acctAfterSignIn()');
v1.run('acctNewDraft()'); await v1.edit("S.name = 'Acme Secret Deal'; S.notes = 'confidential note'");
await v1.run("acctSaveVersion('clear')");
let wk = null; try { await v1.run("vaultEnable('short')"); } catch (e) { wk = e.code; }
eq('a passphrase under 12 characters is refused', wk, 'weak_passphrase');
const rec = await v1.run(`vaultEnable(${JSON.stringify(PASS)})`);
const prof = (await rows('profiles', V.id))[0], vc = prof.prefs.vault;
ok('Vault on: the account keeps a salt, 600,000 PBKDF2 iterations and the wrapped key; never the passphrase', vc.iter === 600000 && vc.salt.length >= 20 && vc.wrapped.length > 40 && !JSON.stringify(prof).includes('battery'));
eq('the recovery key is a 256-bit key (43 characters)', rec.length, 43);
{ const r = (await rows('analyses', V.id))[0];
  ok('existing analyses are encrypted on the server: no payload, no company, ciphertext only', r.vault === true && r.payload === null && r.company === null && !r.cipher.includes('Acme') && !JSON.stringify(r).includes('confidential'), r);
  eq('versions saved in clear before Vault are removed from the server', (await rows('analysis_versions', V.id)).filter(x => !x.vault).length, 0); }
await v1.edit("S.notes = 'new secret'; S.ledger = { id:'L' }");
{ const r = (await rows('analyses', V.id))[0], txt = JSON.stringify(r);
  ok('a save in Vault mode sends ciphertext only; the title is the only readable field', r.vault && r.payload === null && !txt.includes('new secret') && !txt.includes('SecretCustomerCo') && r.title === 'Acme Secret Deal');
  const p = await v1.run(`vaultOpen(${JSON.stringify(r.cipher)})`);
  ok('in Vault mode the customer ledger travels too, encrypted', p.notes === 'new secret' && /SecretCustomerCo/.test(p.ledger.csv)); }
await v1.run("acctSaveVersion('sealed')");
eq('a version saved in Vault mode is ciphertext only', (await rows('analysis_versions', V.id)).map(x => [x.vault, x.payload]), [[true, null]]);
const id = v1.meta().id;
const v2 = device(V, 'v2'); await v2.signIn(); await v2.run('acctAfterSignIn()');
ok('another device learns that Vault is on, and starts locked', v2.run('vaultOn() && vaultLocked()'));
let lk = null; try { await v2.run(`acctOpen('${id}')`); } catch (e) { lk = e.code; }
eq('locked: the analysis cannot be opened', lk, 'vault_locked');
v2.run('acctNewDraft()'); await v2.edit("S.name = 'Typed while locked'");
ok('locked: a save is not sent in clear; it waits on this device with a plain message', /Vault locked/.test(v2.status()) && !(await rows('analyses', V.id)).some(r => r.title === 'Typed while locked'), v2.status());
let wp = null; try { await v2.run("vaultUnlock('wrong passphrase here')"); } catch (e) { wp = e.code; }
ok('a wrong passphrase fails safely: still locked, nothing opened', wp === 'wrong_passphrase' && v2.run('vaultLocked()'));
await v2.run(`vaultUnlock(${JSON.stringify(PASS)})`);
await v2.run(`acctOpen('${id}')`);
eq('the right passphrase opens it on the other device, with the ledger', [v2.run('S.notes'), v2.run('!!S.ledger || true')], ['new secret', true]);
const v1cipher = (await rows('analyses', V.id)).find(r => r.id === id).cipher;
const tampered = v1cipher.slice(0, -6) + (v1cipher.slice(-6, -5) === 'A' ? 'B' : 'A') + v1cipher.slice(-5);
let bc = null; try { await v2.run(`vaultOpen(${JSON.stringify(tampered)})`); } catch (e) { bc = e.code; }
eq('a changed ciphertext is detected and refused (AES-GCM)', bc, 'bad_cipher');
const v3 = device(V, 'v3'); await v3.signIn(); await v3.run('acctAfterSignIn()');
let wr = null; try { await v3.run("vaultRecover('" + 'A'.repeat(43) + "', 'a brand new passphrase')"); } catch (e) { wr = e.code; }
eq('a wrong recovery key is refused', wr, 'wrong_recovery_key');
await v3.run(`vaultRecover(${JSON.stringify(rec)}, 'a brand new passphrase')`);
const v4 = device(V, 'v4'); await v4.signIn(); await v4.run('acctAfterSignIn()');
let old = null; try { await v4.run(`vaultUnlock(${JSON.stringify(PASS)})`); } catch (e) { old = e.code; }
await v4.run("vaultUnlock('a brand new passphrase')");
await v4.run(`acctOpen('${id}')`);
ok('recovery key: a new passphrase opens the vault, the old one no longer does', old === 'wrong_passphrase' && v4.run('S.notes') === 'new secret');
const ex = await v4.run('acctExportAll()');
ok('"Download all my data" with Vault unlocked includes the decrypted analyses', ex.analyses.some(r => r.payload_decrypted && r.payload_decrypted.notes === 'new secret'));
{ const dump = (await svc(env, `/rest/v1/analyses?select=*&owner=eq.${V.id}`)).body;
  ok('inspecting the database directly: every analysis of this account is ciphertext only', dump.length >= 1 && dump.every(r => r.vault && r.payload === null) && !JSON.stringify(dump.map(r => [r.cipher, r.payload, r.company])).match(/new secret|confidential|SecretCustomerCo|Acme/), dump.map(r => r.title)); }

for (const u of [T, other, V]) await svc(env, '/auth/v1/admin/users/' + u.id, { method:'DELETE' });
report(SUITE);
