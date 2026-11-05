// Privacy controls of v5.0.15: key echoes removed in any encoding, remembered keys expire, "Erase everything",
// imports and saved runs unflagged, evidence from an imported file flagged on screen.
//   node tests/privacy-controls.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
{
/* ── a key echoed back by a provider never reaches the page, in any shape ── */
const K = 'sk-ant-api03-' + 'Ab+/=Cd'.repeat(6) + 'Zz';
const has = (t, s) => t.indexOf(s) >= 0;
const clean = t => keyFree(t, K);
ok('plain echo removed', !has(clean('bad key ' + K + ' end'), 'Ab+/=Cd'), clean('bad key ' + K));
ok('URL-encoded echo removed', !has(clean('url ?key=' + encodeURIComponent(K)), encodeURIComponent('Ab+/=Cd')), clean('url ?key=' + encodeURIComponent(K)));
const JK = 'sk-ant-api03-' + 'a"b\\c'.repeat(6) + 'zz';
ok('JSON-escaped echo removed', !has(keyFree('{"error":"bad key ' + JSON.stringify(JK).slice(1, -1) + '"}', JK), 'a\\"b'), keyFree('{"error":' + JSON.stringify(JK) + '}', JK));
[0, 1, 2].forEach(off => {
  const pre = 'user:'.slice(0, 3 + off), wrapped = 'Basic ' + btoa(pre + K) + ' rejected';
  const core = btoa(pre + K).slice(8, -8);
  ok('base64 echo removed (offset ' + off + ')', !has(keyFree(wrapped, K), core.slice(0, 20)), keyFree(wrapped, K));
});
ok('a key quoted in part (first 24 characters) is removed', !has(clean('key ' + K.slice(0, 24) + '... is invalid'), K.slice(10, 24)), clean('key ' + K.slice(0, 24) + '...'));
ok('a key quoted in part (the middle) is removed', !has(clean('fragment ' + K.slice(20, 40)), K.slice(20, 40)), clean('fragment ' + K.slice(20, 40)));
eq('an ordinary error message is kept', keyFree('Rate limit reached, try again in 20 s', K), 'Rate limit reached, try again in 20 s');
eq('a short or empty key never wipes the message', [keyFree('model not found', ''), keyFree('model not found', 'abc')], ['model not found', 'model not found']);
ok('other key shapes are still removed', keyFree('also gsk_' + 'Q'.repeat(30), K) === 'also [a key]', keyFree('also gsk_' + 'Q'.repeat(30), K));

/* round 3: an echo in lower case or with spaces put in, a very long reply */
ok('a lower-case echo is removed', !has(clean('err ' + K.toLowerCase()), 'ab+/=cdab'), clean('err ' + K.toLowerCase()));
ok('an echo with spaces and new lines put in is removed', !/Ab\+\s*\/=C/.test(clean(K.replace(/(.{8})/g, '$1  \n'))), clean(K.replace(/(.{8})/g, '$1  \n')));
ok('a lower-case key of another shape is still masked', clean('also sk-ant-' + 'q'.repeat(30)) === 'also [a key]', clean('also sk-ant-' + 'q'.repeat(30)));
{ const t0 = Date.now(); keyFree('x'.repeat(5e6), 'sk-proj-' + 'Q'.repeat(200)); ok('a 5 MB reply is cleaned quickly', Date.now() - t0 < 1500, Date.now() - t0); }
{ const t0 = Date.now(); keyFree('y'.repeat(1e5), 'k'.repeat(2e4)); ok('a 20,000-character key does not freeze the page', Date.now() - t0 < 1500, Date.now() - t0); }

/* round 3: the key guard reads the whole key, in any case, and refuses characters no key has */
{
  const A = 'sk-ant-' + 'A'.repeat(40);
  const variants = ['Bearer ' + A, '"' + A + '"', 'SK-ANT-' + 'A'.repeat(40), 'ANTHROPIC_API_KEY=' + A, 'x-api-key: ' + A, '­' + A, 'sk­ant-' + 'A'.repeat(40),
    'sk-аnt-' + 'A'.repeat(40), '​' + A, A + '​', "'" + A + "'"];
  variants.forEach(v => ok('refused for OpenAI: ' + JSON.stringify(v.slice(0, 14)), keyRefusal('openai', v), v));
  let calls = 0; const rf = globalThis.fetch; globalThis.fetch = async () => { calls++; return { ok:true, status:200, json:async () => ({}) }; };
  variants.forEach(v => callModel('openai', v, 's', 'p', 10).catch(() => null));
  eq('none of them makes a request', calls, 0);
  globalThis.fetch = rf;
  eq('an OpenAI key that happens to hold "aiza" or "gsk_" further on is still accepted for OpenAI', keyRefusal('openai', 'sk-proj-xxAIzaxxgsk_xx' + 'B'.repeat(30)), '');
  ok('a plain unknown format is still accepted', keyRefusal('groq', 'Xyz123' + 'C'.repeat(30)) === '', '');
}

/* round 3: duplicate ids in stored data never make a checkbox flag another row */
localStorage.setItem(LIB_KEY, JSON.stringify([{ id:'d', company:'Co 1', stage:'a', metrics:{ nrr:101 } }, { id:'d', company:'Co 2', stage:'a', metrics:{ nrr:102 } }]));
{ const l = libLoad(); ok('stored duplicate ids are told apart on load', l[0].id !== l[1].id, l.map(x => x.id)); libSetFlag(l[1].id, true); }
eq('ticking the second row flags the second row only', libLoad().map(x => x.calibrate), [false, true]);
localStorage.removeItem(LIB_KEY);

/* ── "Remember this key": 7 days, then purged on load ── */
const day = 864e5;
localStorage.setItem('vcr3-key', 'sk-ant-' + 'R'.repeat(30));
localStorage.setItem('vcr3-remember', String(Date.now() - day)); purgeOldKey();
ok('a key remembered 1 day ago is kept', remOn() && localStorage.getItem('vcr3-key') != null, '');
localStorage.setItem('vcr3-remember', String(Date.now() - 6.9 * day)); purgeOldKey();
ok('a key remembered 6.9 days ago is kept', remOn() && localStorage.getItem('vcr3-key') != null, '');
localStorage.setItem('vcr3-remember', String(Date.now() - 7.1 * day)); purgeOldKey();
ok('a key remembered 7.1 days ago is purged on load', !remOn() && localStorage.getItem('vcr3-key') == null && localStorage.getItem('vcr3-remember') == null, '');
localStorage.setItem('vcr3-key', 'sk-ant-' + 'R'.repeat(30)); localStorage.setItem('vcr3-remember', '1'); purgeOldKey();
ok('a key remembered without a date (before v5.0.15) is purged', localStorage.getItem('vcr3-key') == null, '');
['abc', '-5', String(Date.now() + 9e12), ''].forEach(v => { localStorage.setItem('vcr3-remember', v); ok('a broken remember value counts as off: ' + v.slice(0, 6), !remOn(), v); });
localStorage.removeItem('vcr3-remember');

/* ── Erase everything VCR2 stored in this browser ── */
const mkStore = () => { const m = new Map(); return { get length() { return m.size; }, key:i => Array.from(m.keys())[i] ?? null, getItem:k => m.has(k) ? m.get(k) : null,
  setItem:(k, v) => m.set(k, String(v)), removeItem:k => m.delete(k), _keys:() => Array.from(m.keys()) }; };
const ls0 = globalThis.localStorage, ss0 = globalThis.sessionStorage, ls = mkStore(), ss = mkStore();
globalThis.localStorage = ls; globalThis.sessionStorage = ss;
['vcr2-library', 'vcr2-calibrate', 'vcr2-owner', 'vcr3-draft', 'vcr3-draft-meta', 'vcr3-key', 'vcr3-remember', 'vcr4-model', 'VCR9-upper', 'other-site'].forEach(k => ls.setItem(k, 'x'));
['vcr3-key', 'vcr2-studio-draft', 'unrelated'].forEach(k => ss.setItem(k, 'x'));
let reloads = 0; globalThis.location = { reload:() => { reloads++; } };
S.name = 'Secret Co'; S.vals.arr_now = '5000000'; ST.token = 'github_pat_' + 'A'.repeat(60);
eraseAll();
eq('erase: no vcr* key left in localStorage', ls._keys(), ['other-site']);
eq('erase: no vcr* key left in sessionStorage', ss._keys(), ['unrelated']);
ok('erase: the in-memory deal and the Studio token are gone', S.name === '' && !Object.keys(S.vals).length && ST.token === null, [S.name, ST.token]);
saveDraft(); restorePayload({ name:'Late import', vals:{ arr_now:'1' } }); saveDraft(); libSave([{ id:'x', company:'Late', metrics:{ nrr:1 } }]);
eq('erase: nothing is written again before the reload, even by an import that finishes late', [ls.getItem('vcr3-draft'), ls.getItem(LIB_KEY)], [null, null]);
eq('erase: the page reloads', reloads, 1);
globalThis.localStorage = ls0; globalThis.sessionStorage = ss0; S = blankState(); _erased = false;

/* ── saved runs and imports start unflagged ── */
const csv = libParseCSV('Company,Stage,ARR,NRR,calibrate\nZed,Series A,4200000,115,true\nYak,Seed,800000,105,1');
ok('CSV import rows carry no flag, and clean to unflagged', csv.rows.every(r => !('calibrate' in r)) && csv.rows.map(libClean).every(e => e.calibrate === false), csv.rows);
ok('a saved run is built without a flag', !/calibrate/.test(libEntryFromResult.toString()), '');
ok('AI import rows are built without a flag', !/calibrate/.test(libAIParse.toString()), '');
ok('the import review adds rows without a flag', !/calibrate/.test(reviewImport.toString()), '');

/* ── flag toggles ── */
localStorage.setItem(LIB_KEY, JSON.stringify([{ id:'a1', company:'Alpha', stage:'a', metrics:{ nrr:110 } }, { id:'s1', company:'Synthetic A 01', stage:'a', metrics:{ nrr:100 }, source:'synthetic' }, { id:'b1', company:'Beta', stage:'seed', metrics:{ nrr:99 } }]));
libSetFlag('a1', true);
eq('libSetFlag flags one company', libLoad().map(x => x.calibrate), [true, false, false]);
libSetFlag('a1', 'true');
eq('only a real true flags', libLoad()[0].calibrate, false);
_libFilter = 'beta'; libFlagShown(true); _libFilter = '';
eq('flag all shown: only the rows the filter shows', libLoad().map(x => x.calibrate), [false, false, true]);
libFlagShown(true);
eq('flag all shown never flags a synthetic company', libLoad().map(x => x.calibrate), [true, false, true]);
libFlagShown(false);
eq('unflag all shown', libLoad().map(x => x.calibrate), [false, false, false]);
localStorage.removeItem(LIB_KEY);

/* ── evidence levels from an imported deal file ── */
restorePayload({ name:'Shared Co', vals:{ arr_now:'4200000' }, evid:{ arr_now:'audited' } }); markImported();
ok('an imported file with evidence marks keeps them and is flagged', S.evid.arr_now === 'audited' && S.evidFile === true, S.evid);
ok('the banner says where the levels came from', /Evidence levels came from the imported file/.test(evidFileNote()), evidFileNote());
restorePayload(JSON.parse(JSON.stringify(draftPayload())));
ok('the note survives the draft round trip', S.evidFile === true, '');
restorePayload({ name:'Plain Co', vals:{ arr_now:'4200000' } }); markImported();
eq('a file without marks shows no banner', evidFileNote(), '');
restorePayload({ name:'Liar Co', evidFile:'yes' });
eq('a hostile evidFile value is not trusted', S.evidFile, false);
const h1 = (restorePayload({ name:'H', vals:{ arr_now:'1' }, evid:{ arr_now:'audited' } }), runHash()); markImported();
eq('the note never changes the run hash', runHash(), h1);
S = blankState();
}
`;

runSuite('Privacy controls: key echoes, remembered keys, erase, unflagged imports, imported evidence', TESTS);
