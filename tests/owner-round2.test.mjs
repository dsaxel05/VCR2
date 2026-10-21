// Findings C1 to C12 of the independent review (independent Studio re-measurement).
//   node tests/owner-round2.test.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from './_harness.mjs';
const FIX = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8'));

const TESTS = String.raw`
const withC = (o, f) => { applyConfig(Object.assign(EMPTY_CONFIG(), o)); try { return f(); } finally { applyConfig(EMPTY_CONFIG()); } };
const cfg = o => normalizeConfig(Object.assign(EMPTY_CONFIG(), o));
const sig = o => withC(o, () => configSignature());
const sig0 = configSignature();

/* C1: a built-in calculation may use its own name (the built-in value) */
ok('C1 the example the Studio shows is accepted', fxValidate('nrr * 0.95', { optional:false, self:'nrr', allowSelf:true, cfg:EMPTY_CONFIG() }).ok, '');
ok('C1 a custom metric still cannot refer to itself', !fxValidate('mine + 1', { optional:false, self:'mine', cfg:EMPTY_CONFIG() }).ok, '');

/* C2: everything that can change a score or a gate is part of the rubric version */
ok('C2 the built-in site has no configuration signature', sig0 == null, sig0);
const changes = {
  'a scored choice field':            { fields:[{ id:'c_q', label:'Q', type:'select', options:['A', 'B'], scores:{ A:90, B:10 }, dim:'team', weight:2 }] },
  'its other score':                  { fields:[{ id:'c_q', label:'Q', type:'select', options:['A', 'B'], scores:{ A:60, B:10 }, dim:'team', weight:2 }] },
  'its weight':                       { fields:[{ id:'c_q', label:'Q', type:'select', options:['A', 'B'], scores:{ A:90, B:10 }, dim:'team', weight:5 }] },
  'a yes/no point moved':             { meta:{ booleans:{ litigation:{ dim:'team' } } } },
  'a deal-breaker trigger reversed':  { meta:{ gates:{ taxes_current:{ when:true } } } },
  'an added dimension':               { dimensions:[{ id:'reg', label:'Reg' }] },
  'a model that starts from another': { models:[{ id:'x_m', name:'M', from:'saas' }] },
  'an added stage':                   { stages:[{ id:'s_c', name:'C', like:'a' }] },
  'the same stage scored like another': { stages:[{ id:'s_c', name:'C', like:'b' }] },
};
const sigs = Object.entries(changes).map(([k, o]) => [k, sig(o)]);
ok('C2 each of them changes the version', sigs.every(([, s]) => s != null && s !== sig0), sigs);
eq('C2 and they all differ from each other', new Set(sigs.map(x => x[1])).size, sigs.length);
eq('C2 an AI model name alone does not change the version', sig({ settings:{ aiModels:{ anthropic:'claude-x-1' } } }), sig0);
eq('C2 wording alone does not either', sig({ labels:{ metrics:{ nrr:'Dollar retention' } }, texts:[{ from:'a', to:'b' }] }), sig0);

/* C4, C5: the report states the rules in force and the owner's names */
const A = ARCH.companies;
const resolveC = n => { const c = A[n], b = c.extends ? resolveC(c.extends) : { vals:{}, bools:{}, sel:{} }; return { stage:c.stage || b.stage, model:c.model || b.model, vals:Object.assign({}, b.vals, c.vals), bools:Object.assign({}, b.bools, c.bools), sel:Object.assign({}, b.sel, c.sel) }; };
const report = () => { const c = resolveC('typical_a'); S = blankState(); S.stage = c.stage; S.model = c.model; S.vals = c.vals; S.bools = c.bools; S.sel = c.sel; S.name = 'x'; return assessAll(); };
document.getElementById = id => (id === 'result-content' ? (globalThis.__rc = globalThis.__rc || { innerHTML:'' }) : null);
const html = o => withC(o, () => { const R = report(); globalThis.__rc = { innerHTML:'' }; try { return paneScoring(R) + driversHTML(R.sc); } catch (e) { return 'ERR ' + e.message; } });
ok('C4 the built-in numbers are stated by default', /\[0, 45, 72, 100\]/.test(html({})) && /±15/.test(html({})), '');
const h2 = html({ settings:{ curve:[0, 30, 60, 100], boolCap:5, fullCoverage:0.8 } });
ok('C4 the owner’s numbers are stated when changed', /\[0, 30, 60, 100\]/.test(h2) && /±5/.test(h2) && /below 80% coverage/.test(h2), h2.slice(0, 200));
ok('C4 and the treatment of withheld metrics', /shrunk towards 50/.test(html({})) && /excluded rather than scored/.test(html({ settings:{ withheldMode:'drop' } })), '');
eq('C5 a renamed dimension shows its name', withC({ labels:{ dims:{ revenue:'Topline quality' } } }, () => dimShort('revenue')), 'Topline quality');
eq('C5 an added dimension shows its name, not its id', withC({ dimensions:[{ id:'reg', label:'Regulatory' }] }, () => dimShort('reg')), 'Regulatory');
eq('C5 built-in short names are unchanged', dimShort('gtm'), 'Go-to-market');

/* C6: a stage the owner added is remembered until the configuration that defines it has loaded */
const payload = { name:'x', stage:'s_c', model:'saas', vals:{}, bools:{}, sel:{}, v:4 };
applyConfig(EMPTY_CONFIG());
restorePayload(payload);
eq('C6 an unknown stage is shown as Seed meanwhile', S.stage, 'seed');
applyConfig(cfg({ stages:[{ id:'s_c', name:'Series C', like:'b' }] }));
eq('C6 and comes back when its definition arrives', S.stage, 's_c');
applyConfig(EMPTY_CONFIG());
eq('C6 an id that never arrives falls back to Seed', S.stage, 'seed');

/* C7: a broken built-in calculation is caught before publishing */
ST.draft = cfg({ formulas:{ nrr:'nope_x + (' } });
ok('C7 validate refuses it', validateDraft().some(e => /Calculation of/.test(e)), validateDraft());
ST.draft = cfg({ formulas:{ nrr:'nrr * 0.95' } });
eq('C7 and accepts a good one', validateDraft().length, 0);

/* C8: section descriptions can be changed */
eq('C8 a section description is the owner’s', withC({ labels:{ sdescs:{ revenue:'Our own description.' } } }, () => SECTIONS.find(s => s.id === 'revenue').desc), 'Our own description.');
ok('C8 and the built-in one is back', SECTIONS.find(s => s.id === 'revenue').desc.startsWith('The ARR waterfall'), SECTIONS.find(s => s.id === 'revenue').desc);

/* C9: resetting a scored choice whose name has a dot */
ST.draft = cfg({ categorical:{ soc2:{ 'Type 1.5':40, None:5 } } });
saveStudioDraft = () => {}; renderStudioPane = () => {};
resetDiffItem('categorical', 'soc2.Type 1.5');
eq('C9 the dotted choice is removed', ST.draft.categorical.soc2, { None:5 });

/* C12: the check text follows its tolerance */
const svc = withC({ checkTol:{ services:{ tol:25 } } }, () => { const c = resolveC('services_in_disguise'); S = blankState(); S.stage = c.stage; S.model = c.model; S.vals = Object.assign({}, c.vals, { services_pct:'40' }); S.bools = c.bools; S.sel = c.sel; const R = assessAll(); return R.checks.find(x => x.id === 'services'); });
ok('C12 the preferred level in the text is the owner’s', svc && /< 25% preferred/.test(svc.computed), svc);
`;

runSuite('Studio re-measurement findings', TESTS, 'const ARCH = ' + JSON.stringify(FIX) + ';');
