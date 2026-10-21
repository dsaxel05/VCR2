// The AI prompts are data: the owner can set the voice of the memo and add instructions, and cannot remove the rules.
//   node tests/prompts.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
const withCfg = (cfg, f) => { applyConfig(Object.assign(EMPTY_CONFIG(), cfg)); try { return f(); } finally { applyConfig(EMPTY_CONFIG()); } };
const memo0 = aiSystem('memo'), ext0 = aiSystem('extraction');

ok('built-in memo prompt keeps its rules', /never invent a number/.test(memo0) && /do not recompute, re-score or contradict/.test(memo0), memo0.slice(0, 80));
ok('built-in extraction prompt keeps its rules', /never estimate, infer or annualise/.test(ext0) && /exact source line/.test(ext0), ext0.slice(0, 80));
eq('built-in memo voice is the shipped one', memo0.endsWith(AI_VOICE_DEFAULT), true);

const m = withCfg({ meta:{ prompts:{ memo:{ voice:'Write in short, direct paragraphs, in the first person plural.', note:'Always mention the lead investor.' } } } }, () => aiSystem('memo'));
ok('the memo voice can be replaced', /short, direct paragraphs/.test(m) && !m.includes(AI_VOICE_DEFAULT), m);
ok('the rules stay, whatever the voice', /never invent a number/.test(m) && /do not recompute/.test(m), m);
ok('an added instruction comes after the rules and says it cannot override them', m.indexOf('Always mention the lead investor.') > m.indexOf('never invent a number') && /never override the rules above/.test(m), m);
const e = withCfg({ meta:{ prompts:{ extraction:{ note:'Amounts in the deck are in euros.' } } } }, () => aiSystem('extraction'));
ok('an extraction instruction is appended', e.includes('Amounts in the deck are in euros.') && /exact source line/.test(e), e);
eq('and the built-in is back after the config is cleared', aiSystem('memo'), memo0);

const n = normalizeConfig({ meta:{ prompts:{ memo:{ voice:'  V  ', note:'N'.repeat(2000) }, bogus:{ note:'x' } } } });
eq('voice is trimmed', n.meta.prompts.memo.voice, 'V');
eq('an instruction is limited to 1200 characters', n.meta.prompts.memo.note.length, 1200);
eq('only memo and extraction exist', Object.keys(n.meta.prompts), ['memo']);
`;

runSuite('AI prompts as owner data', TESTS);
