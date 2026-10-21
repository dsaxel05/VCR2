// Owner control: details of built-in items (fields, deal-breakers, patterns, checklist, yes/no answers).
//   node tests/owner-details.test.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from './_harness.mjs';
const FIX = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8'));

const TESTS = String.raw`
const A = ARCH.companies;
const resolveC = n => { const c = A[n], b = c.extends ? resolveC(c.extends) : { vals:{}, bools:{}, sel:{} }; return { stage:c.stage || b.stage, model:c.model || b.model, vals:Object.assign({}, b.vals, c.vals), bools:Object.assign({}, b.bools, c.bools), sel:Object.assign({}, b.sel, c.sel) }; };
const withC = (o, f) => { applyConfig(Object.assign(EMPTY_CONFIG(), o)); const r = f(); applyConfig(EMPTY_CONFIG()); return r; };
const fld = id => BASE.sectionFields.flatMap(b => b.fields).find(f => f.id === id);

const chips0 = (fld('option_pool').chips || []).slice();
eq('fields: quick-pick values of a built-in field can be changed', withC({ meta:{ fields:{ option_pool:{ chips:[3, 6, 9] } } } }, () => fld('option_pool').chips), [3, 6, 9]);
eq('fields: and are back when cleared', fld('option_pool').chips, chips0);
const selF = BASE.sectionFields.flatMap(b => b.fields).find(f => f.t === 'select' && Array.isArray(f.options));
eq('fields: a built-in choice field can get an extra choice', withC({ meta:{ fields:{ [selF.id]:{ addOptions:['Something new'] } } } }, () => fld(selF.id).options.slice(-1)[0]), 'Something new');
eq('fields: the choices are the built-in ones again', fld(selF.id).options.includes('Something new'), false);
eq('fields: the group heading can be changed', withC({ meta:{ fields:{ option_pool:{ group:'Cap table basics' } } } }, () => fld('option_pool').g), 'Cap table basics');
eq('fields: a field can be made required', withC({ meta:{ fields:{ option_pool:{ required:true } } } }, () => fld('option_pool').req), true);

eq('gates: an explanation can be changed', withC({ meta:{ gates:{ ip_assignments:{ why:'Our own explanation.' } } } }, () => RUBRIC.gates.find(g => g.id === 'ip_assignments').why), 'Our own explanation.');
eq('gates: and the request to the founder', withC({ meta:{ gates:{ ip_assignments:{ ask:'Send the IP file.' } } } }, () => GATE_ASK.ip_assignments), 'Send the IP file.');
ok('gates: the built-in text is back', RUBRIC.gates.find(g => g.id === 'ip_assignments').why.length > 40 && GATE_ASK.ip_assignments.startsWith('Could you share'), '');
eq('gates: a trigger can be reversed', withC({ meta:{ gates:{ taxes_current:{ when:true } } } }, () => RUBRIC.gates.find(g => g.id === 'taxes_current').when), true);
eq('gates: and is built-in again', RUBRIC.gates.find(g => g.id === 'taxes_current').when, false);

const cl0 = DILIGENCE.find(d => d.id === 'org_chart'), clBefore = [cl0.cat, cl0.from];
eq('checklist: an item can move to another category and stage', withC({ meta:{ checklist:{ org_chart:{ cat:'People', from:'b' } } } }, () => [cl0.cat, cl0.from]), ['People', 'b']);
eq('checklist: and is back', [cl0.cat, cl0.from], clBefore);

const leakyRun = () => { const c = resolveC('leaky_bucket'); return Radar.assess({ name:'x', stage:c.stage, model:c.model, vals:c.vals, bools:c.bools, sel:c.sel, evid:{} }); };
const redOf = r => r.patterns.find(p => p.id === 'leaky_bucket');
const sev0 = redOf(leakyRun()).sev;
ok('patterns: the built-in pattern fires on the leaky company', !!redOf(leakyRun()) && sev0 !== 'green', sev0);
eq('patterns: its severity can be changed', withC({ meta:{ patterns:{ leaky_bucket:{ sev:'green' } } } }, () => redOf(leakyRun()).sev), 'green');
eq('patterns: and is back', redOf(leakyRun()).sev, sev0);
eq('patterns: its explanation can be changed', withC({ meta:{ patterns:{ leaky_bucket:{ why:'Because we say so.' } } } }, () => redOf(leakyRun()).why), 'Because we say so.');

const litRun = () => { const c = resolveC('typical_a'); const r = Radar.assess({ name:'x', stage:c.stage, model:c.model, vals:c.vals, bools:Object.assign({}, c.bools, { litigation:true }), sel:c.sel, evid:{} }); return r.scoring.dimensions; };
eq('yes/no: the wording and dimension of a point can be changed', withC({ meta:{ booleans:{ litigation:{ dim:'team', note:'Pending case' } } } }, () => litRun().find(x => x.id === 'team').notes.some(n => n.note === 'Pending case')), true);
eq('yes/no: and is built-in again', litRun().find(x => x.id === 'govern').notes.some(n => /litigation/i.test(n.note)), true);

eq('normalisation: unknown severities, risks and stages are dropped', normalizeConfig({ meta:{ patterns:{ leaky_bucket:{ sev:'purple', risk:'x' } }, checklist:{ org_chart:{ from:'zz' } } } }).meta, { fields:{}, gates:{}, checklist:{}, patterns:{}, booleans:{}, checks:{}, answers:{}, families:{}, prompts:{} });

/* built-in checks: explanation and question */
const wf = () => { const c = resolveC('contradictions'); const r = Radar.assess({ name:'x', stage:c.stage, model:c.model, vals:c.vals, bools:c.bools, sel:c.sel, evid:{} }); return r.checks.find(k => k.id === 'stated_nrr'); };
const wf0 = wf();
ok('checks: the contradictions archetype has a failing NRR check', !!wf0 && wf0.sev !== 'ok', wf0 && wf0.sev);
eq('checks: its explanation can be reworded', withC({ meta:{ checks:{ stated_nrr:{ text:'Our own words about the waterfall.' } } } }, () => wf().text), 'Our own words about the waterfall.');
eq('checks: and its question', withC({ meta:{ checks:{ stated_nrr:{ ask:'Send the bridge, line by line.' } } } }, () => wf().ask), 'Send the bridge, line by line.');
eq('checks: and is built-in again', wf().text, wf0.text);
eq('checks: a passing check has no explanation to replace', withC({ meta:{ checks:{ stated_nrr:{ text:'x' } } } }, () => { const c = resolveC('typical_a'); const r = Radar.assess({ name:'x', stage:c.stage, model:c.model, vals:c.vals, bools:c.bools, sel:c.sel, evid:{} }); return r.checks.filter(z => z.sev === 'ok').every(z => z.text !== 'x'); }), true);

/* business models a scored answer or a yes/no point applies to */
const hasCat = key => { const c = resolveC('typical_a'); const r = Radar.assess({ name:'x', stage:c.stage, model:c.model, vals:c.vals, bools:c.bools, sel:c.sel, evid:{} }); return r.scoring.dimensions.some(d => d.metrics.some(m => m.key === key)); };
const catKey = ['soc2', 'books', 'switching', 'pricing'].find(k => hasCat('cat_' + k) || hasCat(k));
const ck = hasCat('cat_' + catKey) ? 'cat_' + catKey : catKey;
ok('answers: a scored answer counts for the built-in model', !!catKey && hasCat(ck), catKey);
eq('answers: restricted to another model it no longer counts', withC({ meta:{ answers:{ [catKey]:{ models:['marketplace'] } } } }, () => hasCat(ck)), false);
eq('answers: an empty list means every model', withC({ meta:{ answers:{ [catKey]:{ models:[] } } } }, () => hasCat(ck)), true);
eq('answers: and is built-in again', hasCat(ck), true);
eq('yes/no: restricted to another model the point no longer counts', withC({ meta:{ booleans:{ litigation:{ models:['fintech'] } } } }, () => litRun().some(d => d.notes.some(n => /litigation/i.test(n.note)))), false);
eq('yes/no: and is back', litRun().some(d => d.notes.some(n => /litigation/i.test(n.note))), true);
eq('normalisation: model lists keep only identifiers', normalizeConfig({ meta:{ answers:{ soc2:{ models:['saas', '<x>', 3] } } } }).meta.answers.soc2.models, ['saas']);

/* the rubric version follows every setting that changes a score, and ignores ones that only change wording */
const ver = cfg => withC(cfg, () => rubricVersion());
const v0 = rubricVersion();
ok('signature: business models of an answer change the version', ver({ meta:{ answers:{ soc2:{ models:['marketplace'] } } } }) !== v0, ver({ meta:{ answers:{ soc2:{ models:['marketplace'] } } } }));
eq('signature: a display-only setting does not', ver({ settings:{ displayStrong:80, displayMixed:50, currency:'€' } }), v0);
const runH = cfg => withC(cfg, () => { const c = resolveC('typical_a'); return Radar.assess({ name:'x', stage:c.stage, model:c.model, vals:c.vals, bools:c.bools, sel:c.sel, evid:{} }).hash; });
eq('signature: nor does it reseed the run hash', runH({ settings:{ displayStrong:80 } }), runH({}));
eq('reconcile: its explanation can be changed', withC({ meta:{ gates:{ reconcile:{ why:'Fix the pack first.' } } } }, () => { const c = resolveC('contradictions'); const r = Radar.assess({ name:'x', stage:c.stage, model:c.model, vals:c.vals, bools:c.bools, sel:c.sel, evid:{} }); return (r.scoring.gates.find(g => g.id === 'reconcile') || {}).why; }), 'Fix the pack first.');
`;

runSuite('Owner control: built-in details', TESTS, 'const ARCH = ' + JSON.stringify(FIX) + ';');
