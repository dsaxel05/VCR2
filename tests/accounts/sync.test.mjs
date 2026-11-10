// Part B, B3: library, autosave, versions, sync, conflicts and offline, against the LOCAL stack.
// Two "devices" = two sandboxes running src/account.js + src/account-sync.js, each with its own storage, signed in as the same user.
// The app around them (draft state, save, restore) is a small stand-in with the same contract as src/core.js.
//   node tools/accounts_stack.mjs start
//   node tests/accounts/sync.test.mjs
import { randomUUID } from 'node:crypto';
import { connect, call, svc, makeUser, ok, eq, report } from './_sb.mjs';
import { device as dev } from './_device.mjs';

const SUITE = 'accounts sync';
const env = connect(SUITE);
const server = async id => (await svc(env, '/rest/v1/analyses?id=eq.' + id + '&select=*')).body[0];
const count = async uid => (await svc(env, '/rest/v1/analyses?select=id&owner=eq.' + uid)).body.length;
const U = await makeUser(env, 'sync');
const device = (u, l) => dev(env, u, l);
const A = device(U, 'A'), B = device(U, 'B');
await A.signIn(); await B.signIn();

/* ── autosave ── */
A.run('acctNewDraft()');
await A.edit("S.name = 'Acme'; S.vals.arr_now = '1200000'");
let m = A.meta();
eq('first save creates the account record at version 1', [!!m.id, m.version, m.dirty], [true, 1, false]);
eq('the server holds the analysis', (await server(m.id)).payload.vals.arr_now, '1200000');
ok('status: "Saved to your account, just now"', /^Saved to your account, just now$/.test(A.status()), A.status());
await A.edit("S.vals.arr_now = '1300000'");
eq('the next edit goes as version 2', A.meta().version, 2);
A.run('acctDelay = 40'); const before = A.net.calls;
for (let i = 0; i < 5; i++) A.run(`S.notes = 'n${i}'; saveDraft();`);
await new Promise(r => setTimeout(r, 400)); await A.run('_acctBusy');
ok('five quick edits are sent as one write (debounce)', A.net.calls - before <= 3 && A.meta().version === 3 && (await server(A.meta().id)).payload.notes === 'n4', { calls:A.net.calls - before, v:A.meta().version });
A.run('acctDelay = 1e9');
{ const p = A.run('acctPush()'); A.run("S.notes = 'typed while saving'; saveDraft();"); await p;
  ok('an edit made during a write keeps the analysis marked unsaved, and the next write sends it', A.meta().dirty === true, A.meta());
  await A.run('acctPush()'); eq('… and it arrives', (await server(A.meta().id)).payload.notes, 'typed while saving'); }

/* ── what is sent (A3) ── */
await A.edit("S.ledger = { id:'L1' }; S.prov.arr_now = { src:'extracted', line:'x'.repeat(400) }");
{ const row = await server(A.meta().id), txt = JSON.stringify(row);
  ok('the customer ledger is never sent (no customer name on the server)', row.payload.ledger === null && !txt.includes('SecretCustomerCo'));
  eq('its computed figures are sent instead', row.payload.ledgerStats.top1, 60.12);
  eq('provenance lines are cut to 160 characters', row.payload.prov.arr_now.line.length, 160);
  ok('index fields and app version are filled', row.title === 'Acme' && row.stage === 'seed' && row.app_version === '5.2.0', row.app_version); }

/* ── a second device ── */
const id = A.meta().id;
await B.run(`acctOpen('${id}')`);
eq('device B opens the analysis from the account', [B.run('S.name'), B.run('S.vals.arr_now')], ['Acme', '1300000']);
ok('device B has no ledger: it shows the "ledger not on this device" state', B.run('!!S.ledgerStats && !S.ledger'));
await B.edit("S.vals.arr_now = '2000000'");
const vB = B.meta().version;
eq('device B saves the next version', vB, A.meta().version + 1);

/* ── conflicts ── */
A.run("ANSWER = 'mine'; ASKED = []");
await A.edit("S.vals.arr_now = '1500000'");
eq('device A, with an unsent edit on an older version, is asked (newer elsewhere)', A.run('ASKED'), ['newer']);
eq('"Keep this device\'s version": the account now has A\'s figure, as a new version', [(await server(id)).payload.vals.arr_now, A.meta().version], ['1500000', vB + 1]);
B.run("ANSWER = 'theirs'; ASKED = []");
await B.edit("S.notes = 'B note'");
ok('device B is asked in turn, nothing overwritten before the answer', B.run('ASKED')[0] === 'newer');
eq('"Use the newer one": device B now shows A\'s version, with nothing left to send', [B.run('S.vals.arr_now'), B.meta().dirty, B.meta().version], ['1500000', false, A.meta().version]);
eq('… and the account kept A\'s version (B\'s note was not written)', (await server(id)).payload.notes === 'B note', false);
const n0 = await count(U.id);
A.run("ANSWER = 'both'; ASKED = []"); await B.edit("S.vals.arr_now = '9'");
await A.edit("S.vals.arr_now = '7'");
const aNow = A.meta();
ok('"Keep both": a second record holds this device\'s version; the account copy keeps the other device\'s', aNow.id !== id && (await count(U.id)) === n0 + 1
  && (await server(aNow.id)).payload.vals.arr_now === '7' && (await server(id)).payload.vals.arr_now === '9' && /\(this device\)$/.test(A.run('S.name')), { n0, now:await count(U.id) });
A.run("ANSWER = null; ASKED = []"); await B.run(`acctOpen('${aNow.id}')`); await B.edit("S.notes = 'x'");
await A.edit("S.notes = 'y'");
ok('closing the question without an answer writes nothing and asks again later', A.run('ASKED').length === 1 && A.meta().dirty === true && (await server(aNow.id)).payload.notes === 'x');
A.run("ANSWER = 'theirs'"); await A.run('acctPush()');

/* ── delete versus edit ── */
await svc(env, '/rest/v1/analyses?id=eq.' + aNow.id, { method:'DELETE' });
A.run("ANSWER = 'mine'; ASKED = []"); await A.edit("S.notes = 'still here'");
ok('deleted on another device while edited here: asked, then saved again as a new record', A.run('ASKED')[0] === 'deleted' && A.meta().id !== aNow.id && !!(await server(A.meta().id)));
const again = A.meta().id; await svc(env, '/rest/v1/analyses?id=eq.' + again, { method:'DELETE' });
A.run("ANSWER = 'theirs'"); await A.edit("S.notes = 'keep local'");
ok('… or kept on this device only, with the label "Saved on this device only"', A.meta().local === true && A.status() === 'Saved on this device only' && A.run('S.notes') === 'keep local', A.status());
await A.edit("S.notes = 'more'");
eq('… and it is not sent again by later edits', A.net.calls > 0 && !(await server(again)), true);

/* ── start-up check ── */
A.run('acctNewDraft()'); await A.edit("S.name = 'Beta'");
const bid = A.meta().id; await B.run(`acctOpen('${bid}')`); await B.edit("S.notes = 'from B'");
eq('start-up on a clean device: the newer account copy is taken (nothing to lose)', [await A.run('acctCheckRemote()'), A.run('S.notes')], ['updated', 'from B']);
await B.edit("S.notes = 'B again'"); A.run("ANSWER = 'theirs'; ASKED = []; S.notes = 'A unsent'; saveDraft();");
eq('start-up with unsent changes: the conflict question instead', [await A.run('acctCheckRemote()'), A.run('ASKED')], ['conflict', ['newer']]);

/* ── offline, flaky network, tokens ── */
A.net.online = false; await A.edit("S.notes = 'offline edit'");
ok('offline: "Offline: will sync", no request made', A.status() === 'Offline: will sync' && A.meta().dirty === true, A.status());
A.net.online = true; await A.run('acctPush()');
eq('back online: the offline edit is sent', (await server(bid)).payload.notes, 'offline edit');
A.net.failNext = 1; await A.edit("S.notes = 'flaky 1'");
ok('a request that fails before reaching the server: kept, labelled, retried', A.meta().dirty === true && /Offline: will sync/.test(A.status()), A.status());
await A.run('acctPush()'); eq('… the retry sends it', (await server(bid)).payload.notes, 'flaky 1');
A.run('acctNewDraft()'); A.net.dropAnswer = 1; await A.edit("S.name = 'Gamma'");
const gid = A.meta().id, c0 = await count(U.id);
await A.run('acctPush()');
ok('a create whose answer was lost is not duplicated on retry', (await count(U.id)) === c0 && A.meta().version >= 1 && A.meta().dirty === false, { c0, c1:await count(U.id), m:A.meta() });
A.net.dropAnswer = 1; await A.edit("S.notes = 'lost answer'"); A.run("ANSWER = 'mine'; ASKED = []"); await A.run('acctPush()');
ok('an update whose answer was lost: the retry sees its own write as "newer" and asks; nothing is lost either way', (await server(gid)).payload.notes === 'lost answer', A.run('ASKED'));
A.run(`(() => { const s = acctSession(); s.expires_at = 1; localStorage.setItem('vcr2-acct-session', JSON.stringify(s)); })()`);
const oldTok = A.run('acctSession().access_token');
await A.edit("S.notes = 'after expiry'");
ok('a token that expired mid-session is refreshed during the save', A.run('acctSession().access_token') !== oldTok && (await server(gid)).payload.notes === 'after expiry');
A.run(`(() => { const s = acctSession(); s.access_token = s.access_token.slice(0, -4) + 'AAAA'; localStorage.setItem('vcr2-acct-session', JSON.stringify(s)); })()`);
await A.edit("S.notes = 'server said 401'");
eq('a token the server refuses (401): one refresh, one retry, saved', (await server(gid)).payload.notes, 'server said 401');
{ const p = A.run("S.notes = 'signing out'; saveDraft(); acctPush()"); A.run("acctSignOut()"); await p;
  ok('signing out during a save: nothing is marked saved for the signed-out user, no error shown', A.status() === null && A.run('acctMeta()') === null); }
await A.signIn();

/* ── size and quota ── */
await A.edit(`S.notes = 'z'.repeat(900000)`);
ok('a very large analysis (900 KB of notes) is saved', A.meta().dirty === false && (await server(gid)).payload.notes.length === 900000);
await A.edit(`S.notes = 'z'.repeat(1100000)`);
ok('over 1 MB: refused by the server, a plain message, the analysis stays on this device', /too large/.test(A.status()) && A.run('S.notes.length') === 1100000, A.status());
await A.edit(`S.notes = 'small again'`);
await svc(env, '/rest/v1/app_limits?id=eq.true', { method:'PATCH', body:{ max_analyses:await count(U.id) } });
A.run('acctNewDraft()'); await A.edit("S.name = 'Over quota'");
ok('analysis quota reached: a plain message, kept on this device', /number of analyses allowed/.test(A.status()), A.status());
await svc(env, '/rest/v1/app_limits?id=eq.true', { method:'PATCH', body:{ max_analyses:100 } });
const use = await A.run('acctUsage()');
ok('usage is reported for the quota meter', use.analyses === await count(U.id) && use.max_bytes === 5242880, use);

/* ── versions, restore, diff ── */
await A.run(`acctOpen('${gid}')`); await A.edit("S.vals.arr_now = '100'; S.result = { sc:{ overall:55, gates:[] } }");
const v1 = await A.run("acctSaveVersion('before raise')");
await A.edit("S.vals.arr_now = '250'; S.vals.nrr = '120'; S.result = { sc:{ overall:72, gates:[] } }");
const v2 = await A.run("acctSaveVersion('')");
let vers = await A.run(`acctVersions('${gid}')`);
eq('"Save version" keeps named versions, newest first', vers.map(v => [v.version, v.label]), [[v2, null], [v1, 'before raise']]);
let dup = null; try { await A.run("acctSaveVersion('again')"); } catch (e) { dup = e.code; }
eq('saving a version twice with no change in between: "already saved"', dup, 'version_exists');
const [p1, p2] = await Promise.all(vers.map(v => A.run(`acctVersionRow(${v.id})`)));
const diff = A.run(`acctDiff(${JSON.stringify(p2.payload)}, ${JSON.stringify(p1.payload)})`);
ok('the diff of two versions lists the changed fields with their labels, and the score change', diff.rows.some(r => r.label === 'ARR today' && r.a === '100' && r.b === '250') && diff.rows.some(r => r.label === 'Net revenue retention') && diff.score.change === 17, diff);
const before2 = A.meta().version;
await A.run(`acctRestoreVersion(${vers[1].id})`);
ok('restoring a version: it becomes the working copy and is saved as a newer version (history kept)', A.run('S.vals.arr_now') === '100' && A.meta().version === before2 + 1 && (await server(gid)).payload.vals.arr_now === '100');

/* ── list actions ── */
const list = await A.run('acctList()');
ok('the list carries company, stage, model, date, score, band, tags and no payload', list.length >= 3 && list.every(r => 'score' in r && 'band' in r && 'tags' in r && !('payload' in r)));
const row = list.find(r => r.id === gid); A.run('ASKED = []');
await A.run(`acctUpdate('${gid}', ${row.version}, { title:'Gamma renamed', tags:['saas', 'q4'] })`);
await A.edit("S.notes = 'after rename'");
ok('rename and tags on the open analysis: its next save is not taken for a conflict', (await server(gid)).title === 'Gamma renamed' && (await server(gid)).payload.notes === 'after rename' && A.meta().dirty === false && A.run('ASKED').length === 0, { t:(await server(gid)).title, n:(await server(gid)).payload.notes, m:A.meta(), st:A.status(), asked:A.run('ASKED') });
const r2 = (await A.run('acctList()')).find(r => r.id === gid);
await A.run(`acctUpdate('${gid}', ${r2.version}, { archived:true })`);
eq('archive', (await server(gid)).archived, true);
let stale = null; try { await A.run(`acctUpdate('${gid}', ${r2.version}, { archived:false })`); } catch (e) { stale = e.code; }
eq('a list action on a stale row is refused, not applied blindly', stale, 'version_conflict');
const cp = await A.run(`acctDuplicate('${gid}')`);
ok('duplicate creates a separate copy named "(copy)"', cp.id !== gid && cp.title === 'Gamma renamed (copy)' && cp.version === 1, cp && { id:cp.id, t:cp.title, v:cp.version });
await A.run(`acctDelete('${cp.id}')`);
eq('delete removes it from the account', await server(cp.id), undefined);
const exp = await A.run('acctExport([])');
ok('export all: every analysis, no owner id, no customer ledger rows', exp.analyses.length === await count(U.id) && exp.analyses.every(r => !('owner' in r)) && !JSON.stringify(exp).includes('SecretCustomerCo'));
A.run('acctForgetHere()');
ok('"Remove this analysis from this device": gone here, still in the account', A.run('localStorage.getItem("vcr3-draft")') === null && A.meta() === null && !!(await server(gid)));

/* ── comparables and preferences across devices ── */
A.run(`LIB = [{ id:'c1', company:'Peer One', metrics:{ arr:1e6 }, payload:{ ledger:{ csv:'x' } } }]`);
await A.run(`acctSyncProfile({ theme:'dark', stage:'a' })`);
B.run(`LIB = [{ id:'c2', company:'Peer Two', metrics:{ arr:2e6 } }]`);
await B.run('acctSyncProfile()');
ok('comparables from both devices are merged in the account, without any saved assessment inside', B.run('LIB.map(e => e.id).sort().join()') === 'c1,c2' && !JSON.stringify((await svc(env, '/rest/v1/profiles?owner=eq.' + U.id)).body).includes('payload'));
ok('preferences follow the account (theme dark, default stage A)', B.run('THEME') === 'dark' && B.run('acctDefaultStage()') === 'a');
await A.run('acctSyncProfile()');
eq('device A receives device B\'s comparable too', A.run('LIB.map(e => e.id).sort().join()'), 'c1,c2');

/* ── isolation inside the sync layer ── */
const V = await makeUser(env, 'sync-v'), X = device(V, 'X'); await X.signIn();
let nf = null; try { await X.run(`acctOpen('${gid}')`); } catch (e) { nf = e.code; }
eq('another user cannot open this analysis by its id', nf, 'not_found');

for (const u of [U, V]) await svc(env, '/auth/v1/admin/users/' + u.id, { method:'DELETE' });
report(SUITE);
