// Findings SV-01 to SV-10 of the independent review (red-team review of the 5.0 tree).
//   node tests/security-round2.test.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from './_harness.mjs';
const FIX = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8'));

const TESTS = String.raw`
{
const A = ARCH.companies;
const resolveC = n => { const c = A[n], b = c.extends ? resolveC(c.extends) : { vals:{}, bools:{}, sel:{} }; return { stage:c.stage || b.stage, model:c.model || b.model, vals:Object.assign({}, b.vals, c.vals), bools:Object.assign({}, b.bools, c.bools), sel:Object.assign({}, b.sel, c.sel) }; };
const run = (n, over) => { const c = resolveC(n); S = Object.assign(blankState(), { name:n, stage:c.stage, model:c.model, vals:Object.assign({}, c.vals, over || {}), bools:c.bools, sel:c.sel, evid:{} }); return assessAllCore(); };
const withCfg = (cfg, f) => { applyConfig(Object.assign(EMPTY_CONFIG(), cfg)); try { return f(); } finally { applyConfig(EMPTY_CONFIG()); } };

/* SV-02: a stray exponent cannot hang or overflow the report */
const t0 = Date.now();
const R1 = run('typical_a', { years_to_exit:'1e12', round_size:'3000000', round_pre_money:'12000000', our_check:'1000000' });
ok('SV-02: 1e12 years to exit finishes at once', Date.now() - t0 < 3000, Date.now() - t0);
ok('SV-02: and the report says the input was limited', R1.inputLimits.length === 1 && /Years to exit/.test(R1.inputLimits[0]), R1.inputLimits);
const R2 = run('typical_a', { round_pre_money:'1e308', round_size:'1e308', fund_size:'1e308' });
ok('SV-02: 1e308 round figures are limited and finite', R2.deal == null || (isFinite(R2.deal.P) && R2.deal.P <= 1e14), R2.deal && R2.deal.P);
ok('SV-02: the limited fields are listed', R2.inputLimits.length >= 1, R2.inputLimits);
eq('SV-02: an ordinary input is not limited', run('typical_a').inputLimits.length, 0);
eq('SV-02: the payoff chart refuses an infinite axis', chartPayoff([{ x:1, a:1 }, { x:Infinity, a:2 }], [{ k:'a', c:'#000', l:'a' }]), '');

/* SV-03: synthetic and AI entries keep their source through a load */
const key = LIB_METRICS[0].key;
eq('SV-03: synthetic source survives libClean', libClean({ company:'S', stage:'seed', model:'saas', metrics:{ [key]:5 }, source:'synthetic' }).source, 'synthetic');
eq('SV-03: ai source survives libClean', libClean({ company:'S', stage:'seed', model:'saas', metrics:{ [key]:5 }, source:'ai', quote:'from the deck' }).quote, 'from the deck');
eq('SV-03: an unknown source becomes json', libClean({ company:'S', stage:'seed', model:'saas', metrics:{ [key]:5 }, source:'<x>' }).source, 'json');

/* SV-06: a chain of replacements cannot grow without end */
const big = 'b'.repeat(800), mid = 'c'.repeat(800), end = 'd'.repeat(800);
const chain = withCfg({ texts:[{ from:'a', to:big }, { from:'b', to:mid }, { from:'c', to:end }] }, () => trText('aaa'));
ok('SV-06: a runaway chain is stopped and the text kept', chain === 'aaa', chain.length);
eq('SV-06: an ordinary replacement still works', withCfg({ texts:[{ from:'Seed', to:'Early' }] }, () => trText('Seed round')), 'Early round');

/* SV-07: replaced wording is disclosed apart from scoring settings */
eq('SV-07: no note without replacements', wordingNote(), '');
ok('SV-07: the note counts the replacements', /2 wording replacements/.test(withCfg({ texts:[{ from:'a', to:'b' }, { from:'c', to:'d' }] }, () => wordingNote())), '');
eq('SV-07: wording does not count as a scoring setting', withCfg({ texts:[{ from:'a', to:'b' }] }, () => customisationNote()), '');

/* SV-08 and SV-09: reserved ids are refused everywhere */
const evil = ['constructor', 'toString', '__proto__', 'hasOwnProperty'];
const cfgG = normalizeConfig({ gates:evil.map(id => ({ id, title:'G ' + id, when:'1' })), patterns:evil.map(id => ({ id, title:'P ' + id, when:'1' })) });
ok('SV-08: reserved item ids are replaced', cfgG.gates.every(g => !evil.includes(g.id)) && cfgG.patterns.every(p => !evil.includes(p.id)), cfgG.gates.map(g => g.id));
const noThrow = (() => { try { withCfg({ gates:evil.map(id => ({ id, title:'G ' + id, when:'1' })), patterns:evil.map(id => ({ id, title:'P ' + id, when:'1' })) }, () => run('typical_a')); return true; } catch (e) { return String(e); } })();
eq('SV-08: a report with such ids is produced', noThrow, true);
const raw = JSON.parse('{"thresholds":{"__proto__":{"seed":[1,2,3,4],"note":"n"}},"categorical":{"__proto__":{"Yes":50}},"meta":{"gates":{"__proto__":{"why":"x"}},"fields":{"constructor":{"label":"x"}}},"patternParams":{"__proto__":{"a":1}},"checkTol":{"__proto__":{"tol":1}}}');
const nrm = normalizeConfig(raw);
['thresholds', 'categorical', 'checkTol', 'patternParams'].forEach(k => eq('SV-09: ' + k + ' keeps its own prototype', Object.getPrototypeOf(nrm[k]), Object.prototype));
['gates', 'fields'].forEach(k => eq('SV-09: meta.' + k + ' keeps its own prototype', Object.getPrototypeOf(nrm.meta[k]), Object.prototype));
eq('SV-09: nothing leaks onto Object', ({}).note, undefined);

/* SV-10: a formula over the limit is refused whole, not cut short */
const long = Array.from({ length:600 }, () => '1').join('+');
const nf = normalizeConfig({ formulas:{ runway:long, burn_multiple:'1+1' }, questions:[{ text:'Q', when:long }], gates:[{ title:'G', when:long }], metrics:[{ key:'m_x', label:'X', formula:long }] });
eq('SV-10: the long calculation is not stored', nf.formulas.runway, undefined);
eq('SV-10: a short one still is', nf.formulas.burn_multiple, '1+1');
eq('SV-10: a long question condition drops the question', nf.questions.length, 0);
eq('SV-10: a long gate condition drops the gate', nf.gates.length, 0);
eq('SV-10: a long metric formula drops the metric', nf.metrics.length, 0);
const rawLong = { formulas:{ runway:long } };
ok('SV-10: the Advanced JSON check lists it', jsonDropped(rawLong, normalizeConfig(rawLong)).length === 1, jsonDropped(rawLong, normalizeConfig(rawLong)));
}
`;

runSuite('Security round 2: red-team findings SV-02, 03, 06 to 10', TESTS, 'const ARCH = ' + JSON.stringify(FIX) + ';');
