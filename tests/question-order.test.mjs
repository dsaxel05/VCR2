// The order of the question families is owner data: meta.families.<family>.p moves a family up or down the list.
//   node tests/question-order.test.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from './_harness.mjs';
const FIX = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8'));

const TESTS = String.raw`
{
const A = ARCH.companies;
const resolveC = n => { const c = A[n], b = c.extends ? resolveC(c.extends) : { vals:{}, bools:{}, sel:{} }; return { stage:c.stage || b.stage, model:c.model || b.model, vals:Object.assign({}, b.vals, c.vals), bools:Object.assign({}, b.bools, c.bools), sel:Object.assign({}, b.sel, c.sel) }; };
const fams = cfg => { applyConfig(Object.assign(EMPTY_CONFIG(), cfg || {})); try { const c = resolveC('contradictions'); return Radar.assess({ name:'x', stage:c.stage, model:c.model, vals:c.vals, bools:c.bools, sel:c.sel, evid:{} }).questions.map(q => q.fam); } finally { applyConfig(EMPTY_CONFIG()); } };
const first = list => { const out = []; list.forEach(f => { if (!out.includes(f)) out.push(f); }); return out; };

const base = first(fams());
ok('built-in: gates come first, then contradictions', base[0] === 'gates' && base[1] === 'contradictions', base);
ok('built-in: confirmatory use-of-funds is last', base[base.length - 1] === 'confirm_funds', base);

const moved = first(fams({ meta:{ families:{ confirm_calls:{ p:0.5 } } } }));
ok('a family given a lower number moves up', moved.indexOf('confirm_calls') < moved.indexOf('contradictions'), moved);
const down = first(fams({ meta:{ families:{ contradictions:{ p:9 } } } }));
ok('a family given a higher number moves down', down.indexOf('contradictions') > down.indexOf('missing_inputs') || down.indexOf('contradictions') > down.indexOf('weak_dimensions'), down);
eq('and the built-in order is back', first(fams()), base);
eq('a number outside 0 to 10 is refused', normalizeConfig({ meta:{ families:{ gates:{ p:99 }, forensics:{ p:'x' } } } }).meta.families, {});
eq('0 and 10 are accepted', normalizeConfig({ meta:{ families:{ gates:{ p:0 }, forensics:{ p:10 } } } }).meta.families, { gates:{ p:0 }, forensics:{ p:10 } });
}
`;

runSuite('Question family order', TESTS, 'const ARCH = ' + JSON.stringify(FIX) + ';');
