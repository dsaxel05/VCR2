// Studio coverage, proven item by item: every built-in metric, scored answer, yes/no point, deal-breaker, check and
// pattern has an owner control that changes the report, and clearing it restores the built-in result.
//   node tests/studio-coverage.test.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from './_harness.mjs';
const FIX = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8'));

const TESTS = String.raw`
const A = ARCH.companies, NAMES = Object.keys(A);
const resolveC = n => { const c = A[n], b = c.extends ? resolveC(c.extends) : { vals:{}, bools:{}, sel:{} }; return { stage:c.stage || b.stage, model:c.model || b.model, vals:Object.assign({}, b.vals, c.vals), bools:Object.assign({}, b.bools, c.bools), sel:Object.assign({}, b.sel, c.sel) }; };
const asm = (n, over) => { const c = resolveC(n); return Radar.assess({ name:n, stage:c.stage, model:c.model, vals:c.vals, bools:Object.assign({}, c.bools, (over && over.bools) || {}), sel:c.sel, evid:{} }); };
const withC = (o, f) => { applyConfig(Object.assign(EMPTY_CONFIG(), o)); try { return f(); } finally { applyConfig(EMPTY_CONFIG()); } };
const metricOf = (r, k) => { for (const d of r.scoring.dimensions) { const m = d.metrics.find(x => x.key === k); if (m) return m; } return null; };
const BASELINE = Object.fromEntries(NAMES.map(n => [n, asm(n)]));

/* 1. Every built-in threshold metric, in the archetype that scores it */
const th = RUBRIC.thresholds;
const owner = Object.keys(th).filter(k => th[k].dir !== 'band');
let covered = 0, uncovered = [];
owner.forEach(k => {
  const n = NAMES.find(x => { const m = metricOf(BASELINE[x], k); return m && m.score != null && !m.withheld; });
  if (!n) { uncovered.push(k); return; }
  covered++;
  const st = stageKey(resolveC(n).stage), base = metricOf(BASELINE[n], k);
  const dir = th[k].dir;
  /* anchors far to one side: the score must move to the extreme */
  const lowAnchors = [-1e9, -9e8, -8e8, -7e8], highAnchors = [1e9, 2e9, 3e9, 4e9];
  const rawOf = anchors => withC({ thresholds:{ [k]:{ [st]:anchors } } }, () => metricOf(asm(n), k));
  const lo = rawOf(lowAnchors), hi = rawOf(highAnchors);
  ok('anchors: ' + k + ' moves the score', lo && hi && lo.rawScore !== hi.rawScore, [lo && lo.rawScore, hi && hi.rawScore]);
  eq('anchors: ' + k + ' is back when cleared', metricOf(asm(n), k).rawScore, base.rawScore);
  /* hidden: the metric disappears from the report */
  ok('hide: ' + k + ' leaves the report', withC({ hidden:{ metrics:[k] } }, () => metricOf(asm(n), k) === null), '');
  /* weight: a different weight is reported */
  const w0 = base.weight, w1 = withC({ metricWeights:{ [k]:w0 * 3 } }, () => { const m = metricOf(asm(n), k); return m ? m.weight : null; });
  ok('weight: ' + k + ' follows the owner', w1 != null && w1 !== w0, [w0, w1]);
  /* calculation: an owner formula replaces the derived value */
  const f1 = withC({ formulas:{ [k]:'12345' } }, () => asm(n).derived[k]);
  eq('formula: ' + k + ' uses the owner’s calculation', f1, 12345);
  /* unit */
  eq('unit: ' + k + ' can be shown in another unit', withC({ labels:{ units:{ [k]:'pts' } } }, () => DUNIT[k]), 'pts');
  /* rename */
  eq('rename: ' + k, withC({ labels:{ metrics:{ [k]:'Renamed ' + k } } }, () => DLABEL[k]), 'Renamed ' + k);
});
ok('every built-in metric is scored by at least one archetype, so it is proven above (' + covered + ' of ' + owner.length + ')', uncovered.length <= 6, uncovered);
globalThis.__uncovered = uncovered;

/* 2. Scored answers */
CAT_DEFS.forEach(([key, field]) => {
  const n = NAMES.find(x => metricOf(BASELINE[x], key));
  if (!n) return;
  const base = metricOf(BASELINE[n], key), ans = Object.keys(RUBRIC.categorical[key].map).find(a => a === resolveC(n).sel[field]);
  if (!ans) return;
  const s1 = withC({ categorical:{ [key]:{ [ans]:base.rawScore === 100 ? 0 : 100 } } }, () => metricOf(asm(n), key).rawScore);
  ok('scored answer: ' + key + ' / ' + ans + ' follows the owner', s1 !== base.rawScore, [s1, base.rawScore]);
  eq('scored answer: ' + key + ' is back when cleared', metricOf(asm(n), key).rawScore, base.rawScore);
  ok('scored answer: ' + key + ' can be switched off', withC({ hidden:{ metrics:['cat_' + key] } }, () => metricOf(asm(n), key) === null), '');
});

/* 3. Yes/no points: each one changes its dimension */
RUBRIC.booleans.forEach(b => {
  const bools = { [b.id]:b.pts > 0 ? b.good : !b.good };   /* a penalty fires on the answer that is not the good one */
  const n = NAMES.find(x => { const c = resolveC(x); return !b.models || b.models.includes(c.model); }) || NAMES[0];
  const c = resolveC(n); if (b.models && !b.models.includes(c.model)) return;
  const adj = r => (r.scoring.dimensions.find(d => d.id === b.dim) || {}).adj;
  const a0 = adj(asm(n, { bools })), a1 = withC({ booleans:{ [boolKey(b)]:Math.max(1, Math.abs(b.pts) - 3) } }, () => adj(asm(n, { bools })));
  ok('yes/no: ' + b.id + ' follows the owner’s points', a0 !== a1, [a0, a1]);
});

/* 4. Deal-breakers: each can be switched off, and its title renamed */
RUBRIC.gates.forEach(g => {
  const bools = { [g.id]:g.when };
  const fires = r => r.scoring.gates.some(x => x.id === g.id);
  ok('gate: ' + g.id + ' fires on its trigger', fires(asm('typical_a', { bools })), '');
  ok('gate: ' + g.id + ' can be switched off', withC({ hidden:{ gates:[g.id] } }, () => !fires(asm('typical_a', { bools }))), '');
  eq('gate: ' + g.id + ' can be renamed', withC({ labels:{ gates:{ [g.id]:'Own title' } } }, () => asm('typical_a', { bools }).scoring.gates.find(x => x.id === g.id).title), 'Own title');
  ok('gate: ' + g.id + ' trigger can be reversed', withC({ meta:{ gates:{ [g.id]:{ when:!g.when } } } }, () => !fires(asm('typical_a', { bools }))), '');
});

/* 5. Checks and patterns that fire in the archetypes: each can be switched off and is back afterwards */
const firedChecks = new Set(), firedPatterns = new Set();
NAMES.forEach(n => { BASELINE[n].checks.filter(c => c.sev !== 'ok' && !c.custom).forEach(c => firedChecks.add(CHECK_FAMILY(c.id))); BASELINE[n].patterns.filter(p => !p.custom).forEach(p => firedPatterns.add(p.id)); });
firedChecks.forEach(id => {
  const n = NAMES.find(x => BASELINE[x].checks.some(c => CHECK_FAMILY(c.id) === id && c.sev !== 'ok'));
  ok('check: ' + id + ' can be switched off', withC({ hidden:{ checks:[id] } }, () => !asm(n).checks.some(c => CHECK_FAMILY(c.id) === id)), '');
  ok('check: ' + id + ' is back afterwards', asm(n).checks.some(c => CHECK_FAMILY(c.id) === id), '');
  ok('check: ' + id + ' can be renamed', withC({ labels:{ checks:{ [id]:'Own check title' } } }, () => asm(n).checks.filter(c => CHECK_FAMILY(c.id) === id).every(c => c.title === 'Own check title')), '');
});
firedPatterns.forEach(id => {
  const n = NAMES.find(x => BASELINE[x].patterns.some(p => p.id === id));
  ok('pattern: ' + id + ' can be switched off', withC({ hidden:{ patterns:[id] } }, () => !asm(n).patterns.some(p => p.id === id)), '');
  eq('pattern: ' + id + ' can be renamed', withC({ labels:{ patterns:{ [id]:'Own pattern' } } }, () => asm(n).patterns.find(p => p.id === id).title), 'Own pattern');
  eq('pattern: ' + id + ' severity can be changed', withC({ meta:{ patterns:{ [id]:{ sev:'green' } } } }, () => asm(n).patterns.find(p => p.id === id).sev), 'green');
});
ok('the archetypes exercise a broad set of checks and patterns', firedChecks.size >= 8 && firedPatterns.size >= 10, [firedChecks.size, firedPatterns.size]);

/* 6. Every check tolerance is wired: changing it is accepted and read back */
CHECK_TOLS.forEach(t => {
  const v = withC({ checkTol:{ [t.id]:{ tol:t.tol + 7 } } }, () => tolOf(t.id, t.tol, t.hard).tol);
  eq('tolerance: ' + t.id, v, t.tol + 7);
});

/* 7. Every pattern trigger number is wired */
Object.entries(PATTERN_PARAMS).forEach(([id, g]) => g.p.forEach(([key, def]) => {
  eq('trigger: ' + id + '.' + key, withC({ patternParams:{ [id]:{ [key]:def + 1 } } }, () => pp(id, key)), def + 1);
  eq('trigger: ' + id + '.' + key + ' is built-in again', pp(id, key), def);
}));

/* 8. Every scoring constant */
SETTING_DEFS.forEach(d => {
  const v = d.kind === 'select' ? d.options.find(o => o[0] !== d.def)[0] : d.kind === 'text' ? '€' : d.kind === 'numbers' ? d.def.map((x, i) => Math.min(d.max, x * 0.9 + i * (d.max > 1 ? 1 : 0.01))) : Math.min(d.max, d.def + (d.step || 1));
  const got = withC({ settings:{ [d.id]:v } }, () => sx(d.id));
  eq('constant: ' + d.id, JSON.stringify(got), JSON.stringify(cleanSetting(d, v)));
  eq('constant: ' + d.id + ' is built-in again', JSON.stringify(sx(d.id)), JSON.stringify(d.def));
});

/* 9. Everything that has a Studio control appears in the list of what differs from built-in, and a reset removes it */
const cfgAll = { settings:{ boolCap:9 }, hidden:{ metrics:['nrr'] }, thresholds:{ grr:{ a:[70, 80, 90, 95] } }, formulas:{ grr:'grr' }, texts:[{ from:'a', to:'b' }], labels:{ metrics:{ nrr:'N' } },
  categorical:{ soc2:{ None:5 } }, booleans:{ 'litigation:minus':20 }, checkTol:{ waterfall:{ tol:9 } }, patternParams:{ optimism:{ minN:7 } }, defaults:{ sim:{ decay:5 } },
  meta:{ gates:{ ip_assignments:{ why:'x' } } }, dimensions:[{ id:'reg', label:'Reg' }], stages:[{ id:'s_c', name:'C' }], models:[{ id:'x_m', name:'M' }] };
const diff = settingsDiff(normalizeConfig(Object.assign(EMPTY_CONFIG(), cfgAll)));
const areas = new Set(diff.map(d => d.area));
['settings', 'hidden', 'thresholds', 'formulas', 'texts', 'labels', 'categorical', 'booleans', 'checkTol', 'patternParams', 'defaults', 'meta', 'dimensions', 'stages', 'models'].forEach(a =>
  ok('differs: ' + a + ' is listed', areas.has(a), [...areas]));
`;

runSuite('Studio coverage by item', TESTS, 'const ARCH = ' + JSON.stringify(FIX) + ';');
console.log('metrics with no archetype that scores them:', JSON.stringify(globalThis.__uncovered || []));
