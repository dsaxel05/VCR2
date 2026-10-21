// Owner control: which metrics are measured together as one signal (settings.correlationGroups).
//   node tests/correlation.test.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from './_harness.mjs';
const FIX = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8'));

const TESTS = String.raw`
const A = ARCH.companies;
const resolveC = n => { const c = A[n], b = c.extends ? resolveC(c.extends) : { vals:{}, bools:{}, sel:{} }; return { stage:c.stage || b.stage, model:c.model || b.model, vals:Object.assign({}, b.vals, c.vals), bools:Object.assign({}, b.bools, c.bools), sel:Object.assign({}, b.sel, c.sel) }; };
const withC = (o, f) => { applyConfig(Object.assign(EMPTY_CONFIG(), o)); const r = f(); applyConfig(EMPTY_CONFIG()); return r; };
const assess = () => { const c = resolveC('typical_a'); return Radar.assess({ name:'x', stage:c.stage, model:c.model, vals:c.vals, bools:c.bools, sel:c.sel, evid:{} }); };
const groupsOf = r => Object.fromEntries(r.scoring.dimensions.flatMap(d => d.metrics).filter(m => m.group).map(m => [m.key, m.group]));

const base = assess(), baseGroups = groupsOf(base);
ok('built-in: the sample carries metrics of the built-in groups, and only those', Object.keys(baseGroups).length > 0 && Object.values(baseGroups).every(g => ['growth', 'burn', 'retention', 'unit', 'margin'].includes(g)), JSON.stringify(baseGroups));

/* normalisation */
const n1 = normalizeConfig({ settings:{ correlationGroups:{ pair_a:['nrr', 'grr'], Bad_Name:['nrr', 'grr'], solo:['runway'], dup:['nrr', 'logo_ret', 'churn_x'], lots:Array.from({ length:30 }, (_, i) => 'm' + (i + 10)) } } }).settings.correlationGroups;
eq('normalise: a group of one and a bad name are dropped', Object.keys(n1).sort(), ['dup', 'lots', 'pair_a']);
eq('normalise: a metric belongs to one group only (the first that names it)', [n1.pair_a, n1.dup], [['nrr', 'grr'], ['logo_ret', 'churn_x']]);
ok('normalise: at most 14 members', n1.lots.length === 14, n1.lots.length);
eq('normalise: an empty object means no groups at all', normalizeConfig({ settings:{ correlationGroups:{} } }).settings.correlationGroups, {});
eq('normalise: nothing stored when absent', 'correlationGroups' in normalizeConfig({ settings:{} }).settings, false);
eq('normalise: a list instead of an object is dropped', 'correlationGroups' in normalizeConfig({ settings:{ correlationGroups:['nrr'] } }).settings, false);

/* effect */
const none = withC({ settings:{ correlationGroups:{} } }, () => groupsOf(assess()));
eq('no groups: no metric carries a group', Object.keys(none).length, 0);
const mine = withC({ settings:{ correlationGroups:{ saas_core:['nrr', 'growth_yoy', 'gross_margin'] } } }, () => groupsOf(assess()));
ok('own group: its members carry its name', Object.entries(mine).every(([k, g]) => g === 'saas_core' && ['nrr', 'growth_yoy', 'gross_margin'].includes(k)) && Object.keys(mine).length > 0, JSON.stringify(mine));
eq('built-in groups are back after clearing', groupsOf(assess()), baseGroups);
const v0 = rubricVersion();
ok('signature: a change of groups changes the rubric version', withC({ settings:{ correlationGroups:{} } }, () => rubricVersion()) !== v0, '');
eq('signature: and is the same again when cleared', rubricVersion(), v0);
`;

runSuite('Correlation groups as a setting', TESTS, 'const ARCH = ' + JSON.stringify(FIX) + ';');
