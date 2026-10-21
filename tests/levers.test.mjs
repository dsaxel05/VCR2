// Gap 3 of the skills review: every generated question says what the investor does if it stays unresolved
// (the lever), the owner can word it per family and per item, and the founder never sees it.
//   node tests/levers.test.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from './_harness.mjs';
const FIX = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8'));

const TESTS = String.raw`
{
const A = ARCH.companies;
const resolveC = n => { const c = A[n], b = c.extends ? resolveC(c.extends) : { vals:{}, bools:{}, sel:{} }; return { stage:c.stage || b.stage, model:c.model || b.model, vals:Object.assign({}, b.vals, c.vals), bools:Object.assign({}, b.bools, c.bools), sel:Object.assign({}, b.sel, c.sel) }; };
const qs = (n, cfg) => { applyConfig(Object.assign(EMPTY_CONFIG(), cfg || {})); try { const c = resolveC(n); return Radar.assess({ name:n, stage:c.stage, model:c.model, vals:c.vals, bools:c.bools, sel:c.sel, evid:{} }).questions; } finally { applyConfig(EMPTY_CONFIG()); } };

const base = qs('contradictions');
ok('questions exist', base.length > 5, base.length);
eq('every question carries a lever', base.filter(q => !q.lever || q.lever.length < 20).length, 0);
eq('the lever is not the question', base.filter(q => q.lever === q.text).length, 0);
const fams = [...new Set(base.map(q => q.fam))];
ok('every family has a built-in lever', fams.every(f => typeof LEVER_DEFAULTS[f] === 'string' && LEVER_DEFAULTS[f].length > 20), fams.filter(f => !LEVER_DEFAULTS[f]));
const gq = base.find(q => q.fam === 'gates') || base.find(q => q.fam === 'contradictions');
ok('a question of a family gets that family’s built-in lever', gq && gq.lever === LEVER_DEFAULTS[gq.fam], gq && gq.lever);

/* the owner's words: per family, then per item, then per own question */
const cf = qs('contradictions', { meta:{ families:{ contradictions:{ lever:'Walk away until the pack is corrected.' } } } });
ok('a family lever replaces the built-in one', cf.filter(q => q.fam === 'contradictions').every(q => q.lever === 'Walk away until the pack is corrected.'), cf.filter(q => q.fam === 'contradictions').map(q => q.lever));
const item = qs('contradictions', { meta:{ checks:{ stated_nrr:{ lever:'Re-price on the computed NRR.' } } } });
const nq = item.find(q => q.ref && q.ref.id === 'stated_nrr');
eq('an item lever beats the family lever', nq && nq.lever, 'Re-price on the computed NRR.');
const own = qs('typical_a', { questions:[{ id:'q_own', text:'Who owns the domain?', lever:'Hold the signing until the domain is in the company name.' }] });
eq('your own question carries its lever', (own.find(q => q.custom) || {}).lever, 'Hold the signing until the domain is in the company name.');
const own0 = qs('typical_a', { questions:[{ id:'q_own', text:'Who owns the domain?' }] });
ok('your own question without a lever has none (no invented advice)', (own0.find(q => q.custom) || {}).lever === undefined, (own0.find(q => q.custom) || {}).lever);

/* the investor's lever is never in what the founder reads */
applyConfig(EMPTY_CONFIG());
{
  const c = resolveC('contradictions');
  S = Object.assign(blankState(), { name:'Acme', stage:c.stage, model:c.model, vals:c.vals, bools:c.bools, sel:c.sel, evid:{} });
  const R = assessAllCore();
  const body = founderEmailText ? founderEmailText(R) : '';
  ok('the founder email exists', body.length > 100, body.length);
  ok('and contains no lever text', R.questions.every(q => !q.lever || body.indexOf(q.lever) < 0), '');
}

/* normalisation */
const n = normalizeConfig({ meta:{ families:{ gates:{ lever:'  Hold.  ' }, '__proto__':{ lever:'x' } }, checks:{ waterfall:{ lever:'L'.repeat(900) } } }, questions:[{ text:'Q', lever:'Because.' }] });
eq('a family lever is trimmed', n.meta.families.gates.lever, 'Hold.');
eq('a reserved id is refused', Object.keys(n.meta.families), ['gates']);
eq('a lever is limited to 600 characters', n.meta.checks.waterfall.lever.length, 600);
eq('a custom question keeps its lever', n.questions[0].lever, 'Because.');
}
`;

runSuite('Question levers: what to do if it stays unresolved', TESTS, 'const ARCH = ' + JSON.stringify(FIX) + ';');
