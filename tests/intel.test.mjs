// Market intel (live): what is sent, how each provider's web-search answer is read, and that only claims whose page the
// search really returned are kept. No network: the provider answers are fixtures in each provider's documented shape.
//   node tests/intel.test.mjs
import { appSource, installStubs } from './_harness.mjs';

installStubs();
(0, eval)(appSource() + '\n;globalThis.__i = { INTEL_SECTIONS, intelPrompt, intelCleanProfile, intelCost, intelFromAnthropic, intelFromOpenAI, intelFromGemini, intelFromOpenRouter, intelVerify, intelSoWhat, intelUrlKey, keyFree, S };');
const I = globalThis.__i, results = [], ok = (name, cond, got) => results.push({ name, ok:!!cond, got });

/* 1. what leaves the browser: the public profile only */
I.S.name = 'Acme Health'; I.S.vals = { arr_now:'4200000', cash_on_hand:'9400000', net_burn:'310000' }; I.S.ledger = { customers:[{ name:'Secret Customer Inc', mrr:[1, 2] }] };
const prof = { name:'Acme Health', website:'acme.example', what:'Prior-authorization software for hospitals', sector:'B2B SaaS', customers:'Hospitals', country:'US', rivals:'Cohere Health', junk:'x' };
const prompt = I.intelPrompt(I.INTEL_SECTIONS[1], prof);
ok('the prompt holds the profile', /Acme Health/.test(prompt) && /Prior-authorization/.test(prompt) && /Cohere Health/.test(prompt));
ok('and nothing from the form, the ledger or the files', !/4200000|9400000|310000|Secret Customer/.test(prompt) && !/junk/.test(prompt), prompt.slice(0, 200));
ok('a website that is not one is dropped; control characters are removed', I.intelCleanProfile({ name:'A\u0000B', website:'javascript:alert(1)' }).website === undefined && I.intelCleanProfile({ name:'A\u0000B' }).name === 'A B');
ok('every section asks for sources and forbids guessing', I.INTEL_SECTIONS.every(s => /cite them/.test(I.intelPrompt(s, prof)) && /not found/.test(I.intelPrompt(s, prof))));
ok('nine sections, from what the company does to why now', I.INTEL_SECTIONS.length === 9 && I.INTEL_SECTIONS[0].id === 'snapshot' && I.INTEL_SECTIONS[8].id === 'whynow');

/* 2. the cost shown before anything runs */
const all = I.INTEL_SECTIONS.map(s => s.id), c = I.intelCost('anthropic', all), g = I.intelCost('gemini', all);
ok(`the cost counts the searches (${c.searches}) and gives a range in dollars`, c.searches === I.INTEL_SECTIONS.reduce((a, s) => a + s.n, 0) && c.lo > 0 && c.hi > c.lo && c.hi < 2, c);
ok('Gemini searches are free within the monthly allowance', g.lo === 0 && /5,000 free/.test(g.label));
ok('a provider without web search gets no estimate', I.intelCost('groq', all) === null);

/* 3. each provider's answer, in its documented shape */
const answer = JSON.stringify({ headline:'Three funded competitors.', rows:[{ cells:['Cohere Health', 'direct', '$106M', 'Series B 2024', 'Payer side'], src:[1] }, { cells:['Ghost Co', 'direct', '$1B', '', ''], src:[9] }],
  facts:[{ text:'Cohere raised a Series B.', src:[1, 2] }, { text:'Unsourced claim.', src:[] }], numbers:[{ what:'Cohere funding', value:106000000, unit:'usd', src:[1] }, { what:'Ghost funding', value:1e9, unit:'usd', src:[9] }],
  ask:'How do you win against Cohere?', confidence:'medium',
  sources:[{ n:1, url:'https://www.cohere-health.example/news/series-b/', title:'Cohere Series B', date:'2024-05' }, { n:2, url:'https://techpress.example/cohere', title:'TechPress' }, { n:9, url:'https://made-up.example/ghost', title:'Invented' }] });
const A = I.intelFromAnthropic({ content:[
  { type:'server_tool_use', id:'s1', name:'web_search', input:{ query:'Acme Health competitors' } },
  { type:'web_search_tool_result', tool_use_id:'s1', content:[{ type:'web_search_result', url:'https://cohere-health.example/news/series-b', title:'Cohere Series B', page_age:'May 2024' }, { type:'web_search_result', url:'https://techpress.example/cohere', title:'TechPress' }] },
  { type:'text', text:'```json\n' + answer + '\n```', citations:[{ type:'web_search_result_location', url:'https://techpress.example/cohere', title:'TechPress', cited_text:'raised' }] }],
  usage:{ server_tool_use:{ web_search_requests:2 } } });
ok('Anthropic: text, the pages the search returned and the number of searches', A.sources.length === 3 && A.searches === 2 && /headline/.test(A.text), A);
const O = I.intelFromOpenAI({ output:[{ type:'web_search_call', id:'w', status:'completed', action:{ type:'search', query:'q', sources:[{ url:'https://techpress.example/cohere' }] } },
  { type:'message', content:[{ type:'output_text', text:answer, annotations:[{ type:'url_citation', url:'https://cohere-health.example/news/series-b', title:'Cohere', start_index:0, end_index:5 }] }] }] });
ok('OpenAI (Responses API): text, sources from the search call and the citations', O.sources.length === 2 && O.searches === 1 && /headline/.test(O.text), O);
const G = I.intelFromGemini({ candidates:[{ content:{ parts:[{ text:answer }] }, groundingMetadata:{ webSearchQueries:['a', 'b'], groundingChunks:[{ web:{ uri:'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title:'cohere-health.example' } }, { web:{ uri:'https://vertexaisearch.cloud.google.com/grounding-api-redirect/def', title:'techpress.example' } }] } }] });
ok('Gemini: text, grounding chunks and the queries run', G.sources.length === 2 && G.searches === 2, G);
const R = I.intelFromOpenRouter({ choices:[{ message:{ content:answer, annotations:[{ type:'url_citation', url_citation:{ url:'https://techpress.example/cohere', title:'TechPress' } }, { type:'url_citation', url_citation:{ url:'https://cohere-health.example/news/series-b', title:'Cohere' } }] } }] });
ok('OpenRouter: text and url citations', R.sources.length === 2, R);

/* 4. only what the search really returned is kept */
for (const [label, call] of [['Anthropic', A], ['OpenAI', O], ['Gemini (site matched by title)', G], ['OpenRouter', R]]) {
  const v = I.intelVerify(call, call);
  ok(`${label}: the invented source and everything resting on it are left out`, v.sources.map(s => s.n).join() === '1,2' && v.rows.length === 1 && v.numbers.length === 1 && v.facts.length === 1 && v.unverified === 3, v);
}
const v = I.intelVerify(A, A);
ok('a fact keeps only its verified sources', v.facts[0].src.join() === '1,2');
ok('a source page matches with or without www, a trailing slash or the http scheme', I.intelUrlKey('http://www.A.example/x/') === I.intelUrlKey('https://a.example/x'));
ok('a javascript: or data: address is never a source', I.intelUrlKey('javascript:alert(1)') === '' && I.intelUrlKey('data:text/html,x') === '');
const bad = I.intelVerify({ text:'Sorry, I could not search.' }, { sources:[] });
ok('an answer that is not the expected JSON is marked unreadable, not shown', bad.parsed === false && !bad.rows.length);
const inj = I.intelVerify({ text:JSON.stringify({ headline:'<img src=x onerror=alert(1)>', rows:[{ cells:['<script>'], src:[1] }], sources:[{ n:1, url:'https://techpress.example/cohere', title:'<b>x</b>' }] }) }, A);
ok('page text is kept as text (escaped when drawn), never as markup that could run', inj.headline.includes('<img') && typeof inj.rows[0].cells[0] === 'string');

/* 5. what it means for this deal */
const comps = { rows:[], facts:[], numbers:[{ value:10, unit:'x', src:[1] }, { value:14, unit:'x', src:[1] }, { value:12, unit:'x', src:[1] }], sources:[] };
const w = I.intelSoWhat('comps', comps, { deal:{ entryMult:19 }, D:{} });
ok('comparable rounds against the entry multiple: median 12.0x vs 19.0x, flagged', w && /12\.0x/.test(w.text) && /19\.0x/.test(w.text) && w.tone === 'bad', w);
const r0 = I.intelSoWhat('risks', { rows:[], numbers:[] }, {});
ok('no red flag found is said with its limit', r0 && /absence of evidence/.test(r0.text) && r0.tone === 'good');

/* 6. the key never appears in an error */
const key = 'sk-' + 'ant-api03-' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
ok('an error quoting the key is cleaned before it is shown', !I.keyFree('invalid x-api-key ' + key, key).includes('ABCDEFGHIJ'));

let failed = 0;
console.log('Market intel (live)');
for (const t of results) { if (t.ok) console.log('  ✓', t.name); else { failed++; console.log('  ✗', t.name, '— got', JSON.stringify(t.got).slice(0, 400)); } }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
