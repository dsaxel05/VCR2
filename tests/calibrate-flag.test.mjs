// Calibration uses only the library companies the user flags, and a key is never sent to a provider it does not belong to (v5.0.14)
//   node tests/calibrate-flag.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
{
/* Library entries: ten Series A companies with NRR 100..109 */
const mk = (i, flag, extra) => Object.assign({ id:'c' + i, company:'Co ' + i, stage:'a', model:'saas', metrics:{ nrr:100 + i, arr:3e6 }, source:'csv' }, flag === undefined ? {} : { calibrate:flag }, extra || {});
const put = list => { localStorage.setItem(LIB_KEY, JSON.stringify(list)); _calCache = null; };
setCalibration(true);
const base = RUBRIC.version + (configSignature() ? '+cfg.' + configSignature() : '');
const nrrA = () => activeThresholds().nrr.a;
const dflt = JSON.stringify(configuredThresholds().nrr.a);

/* the data model */
eq('an old entry without the field loads as unflagged', libClean(mk(1)).calibrate, false);
eq('a flagged entry keeps its flag', libClean(mk(1, true)).calibrate, true);
[1, 'true', 'yes', [true], { v:true }, null, NaN, 0].forEach(v => eq('a hostile flag value becomes false: ' + JSON.stringify(v), libClean(mk(1, v)).calibrate, false));

/* unflagged entries are ignored, however many */
put(Array.from({ length:10 }, (_, i) => mk(i)));
eq('ten unflagged companies: default bars', JSON.stringify(nrrA()), dflt);
eq('ten unflagged companies: no +cal in the rubric version', rubricVersion(), base);
eq('ten unflagged companies: nothing used', calibrationStatus().used.length, 0);

/* 7 flagged = defaults; 8 flagged = percentiles */
put(Array.from({ length:10 }, (_, i) => mk(i, i < 7)));
eq('seven flagged: default bars', JSON.stringify(nrrA()), dflt);
eq('seven flagged: no +cal', rubricVersion(), base);
put(Array.from({ length:10 }, (_, i) => mk(i, i < 8)));
ok('eight flagged: percentile bars', JSON.stringify(nrrA()) !== dflt && nrrA()[3] <= 107, nrrA());
ok('eight flagged: +cal in the rubric version', rubricVersion().startsWith(base + '+cal.'), rubricVersion());
eq('eight flagged: one metric-stage pair, eight companies', calibrationStatus().used.filter(u => u.key === 'nrr').map(u => u.n), [8]);

/* synthetic entries never count, even when flagged */
put(Array.from({ length:10 }, (_, i) => mk(i, true, { source:'synthetic' })));
eq('flagged synthetic companies: default bars', JSON.stringify(nrrA()), dflt);

/* the run hash follows the flagged set */
put(Array.from({ length:10 }, (_, i) => mk(i, i < 8)));
const v1 = rubricVersion(), h1 = runHash();
put(Array.from({ length:10 }, (_, i) => mk(i, i >= 2)));
const v2 = rubricVersion(), h2 = runHash();
ok('a different flagged set gives a different rubric signature', v1 !== v2, [v1, v2]);
ok('and a different run hash', h1 !== h2, [h1, h2]);
put(Array.from({ length:10 }, (_, i) => mk(i, i < 8)));
eq('the same flagged set gives the same hash again', runHash(), h1);

/* the flag survives export and import */
const exported = JSON.parse(JSON.stringify({ kind:'vcr2-library', v:1, entries:libLoad() }));
eq('the export carries the flags', exported.entries.map(x => x.calibrate), [true, true, true, true, true, true, true, true, false, false]);
eq('and a re-import keeps them', exported.entries.map(libClean).map(x => x.calibrate), [true, true, true, true, true, true, true, true, false, false]);
put([]); setCalibration(false);

/* key and provider */
const A = 'sk-ant-api03-' + 'A'.repeat(40), O = 'sk-proj-' + 'A'.repeat(40), R = 'sk-or-v1-' + 'A'.repeat(40), L = 'sk-' + 'A'.repeat(48),
  G = 'gsk_' + 'A'.repeat(40), Z = 'AIza' + 'A'.repeat(35), H = 'github_pat_' + 'A'.repeat(60), U = 'unknown-format-' + 'A'.repeat(30);
eq('key owners, longest prefix first', [A, O, R, L, G, Z, H, U].map(keyOwner), ['anthropic', 'openai', 'openrouter', 'openai', 'groq', 'gemini', 'GitHub', '']);
eq('a key for its own provider is accepted', [['anthropic', A], ['openai', O], ['openai', L], ['openrouter', R], ['groq', G], ['gemini', Z]].map(([p, k]) => keyRefusal(p, k)), ['', '', '', '', '', '']);
eq('an unknown format is accepted everywhere', Object.keys(PROVIDERS).filter(p => p !== 'local').map(p => keyRefusal(p, U)), ['', '', '', '', '']);
ok('an Anthropic key is refused for OpenAI, and the message says why', /looks like a key for Anthropic.*not sent to OpenAI/.test(keyRefusal('openai', A)), keyRefusal('openai', A));
ok('an OpenAI key is refused for OpenRouter and Anthropic', keyRefusal('openrouter', O) && keyRefusal('anthropic', L), '');
ok('an OpenRouter key is refused for OpenAI', keyRefusal('openai', R), '');
ok('a GitHub token is refused everywhere', Object.keys(PROVIDERS).filter(p => p !== 'local').every(p => keyRefusal(p, H)), '');
ok('spaces around a key do not hide it', keyRefusal('openai', '  ' + A + ' '), '');
let calls = 0; const realFetch = globalThis.fetch;
globalThis.fetch = async () => { calls++; return { ok:true, status:200, json:async () => ({}) }; };
[['openai', A], ['anthropic', O], ['openai', R], ['gemini', G], ['groq', Z], ['openrouter', H]].forEach(([p, k]) => callModel(p, k, 's', 'p', 10).catch(() => null));
eq('a mismatched key makes zero network requests', calls, 0);
callModel('anthropic', A, 's', 'p', 10).catch(() => null);
eq('a matching key is sent (one request)', calls, 1);
globalThis.fetch = realFetch;
}
`;

runSuite('Calibration from flagged companies, and keys stay with their provider', TESTS);
