// Archetype suite: fictional companies with expected orderings and flags (see
// tests/fixtures/archetypes/archetypes.json). Asserts orderings and flags, never exact scores,
// and prints a score table so a pull request can show before/after.
//   node tests/archetypes.test.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from './_harness.mjs';

const FIX = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8'));

function resolve(name, seen = new Set()) {
  if (seen.has(name)) throw new Error('archetype cycle at ' + name);
  seen.add(name);
  const c = FIX.companies[name];
  if (!c) throw new Error('unknown archetype ' + name);
  const base = c.extends ? resolve(c.extends, seen) : { vals:{}, bools:{}, sel:{} };
  return {
    name, label:c.label || base.label, stage:c.stage || base.stage, model:c.model || base.model,
    vals:Object.assign({}, base.vals, c.vals), bools:Object.assign({}, base.bools, c.bools), sel:Object.assign({}, base.sel, c.sel),
  };
}
const companies = Object.fromEntries(Object.keys(FIX.companies).map(n => [n, resolve(n)]));

const TESTS = String.raw`
const A = {};
for (const [name, c] of Object.entries(ARCH.companies)) {
  const r = Radar.assess({ name:c.label, stage:c.stage, model:c.model, vals:c.vals, bools:c.bools, sel:c.sel, evid:{} });
  A[name] = r;
  ok('assesses ' + name, r && r.scoring && Array.isArray(r.scoring.dimensions), r && r.rubric);
}
const overallOf = n => A[n].scoring.overallRaw;
const dimOf = (n, d) => { const x = A[n].scoring.dimensions.find(z => z.id === d); return x ? x.score : null; };
for (const o of ARCH.orderings) {
  let hi, lo, what;
  if (o.dimension) { hi = dimOf(o.higher, o.dimension); lo = dimOf(o.lower, o.dimension); what = o.dimension + ' dimension'; }
  else if (o.metric) { hi = A[o.higher].derived[o.metric]; lo = A[o.lower].derived[o.metric]; what = o.metric; }
  else { hi = overallOf(o.higher); lo = overallOf(o.lower); what = 'overall'; }
  ok(o.higher + ' > ' + o.lower + ' on ' + what + ' (' + o.why + ')', hi != null && lo != null && hi > lo, [hi, lo]);
}
const hasPattern = (n, id) => A[n].patterns.some(p => p.id === id);
const hasGate = (n, id) => A[n].scoring.gates.some(g => id === '*' || g.id === id);
for (const f of ARCH.flags) {
  if (f.pattern) ok(f.company + ' flags pattern ' + f.pattern, hasPattern(f.company, f.pattern), A[f.company].patterns.map(p => p.id));
  if (f.gate) ok(f.company + ' raises gate ' + f.gate, hasGate(f.company, f.gate), A[f.company].scoring.gates.map(g => g.id));
}
for (const f of ARCH.noFlags) {
  if (f.pattern) ok(f.company + ' does not flag ' + f.pattern, !hasPattern(f.company, f.pattern), A[f.company].patterns.map(p => p.id));
  if (f.gate) ok(f.company + ' has no gate ' + f.gate, !hasGate(f.company, f.gate), A[f.company].scoring.gates.map(g => g.id));
}
ok('pre-seed company gets an overall score', overallOf('preseed_team') != null, overallOf('preseed_team'));
ok('pre-seed growth is not scored', !A.preseed_team.scoring.dimensions.some(d => d.metrics.some(m => m.key === 'growth_yoy')));
ok('marketplace metrics never reach a SaaS company', !A.typical_a.scoring.dimensions.some(d => d.metrics.some(m => ['gmv_growth','incentives_pct','contrib_margin'].includes(m.key))));
globalThis.__archTable = Object.entries(A).map(([n, r]) => [n, r.scoring.overall, r.scoring.band, r.scoring.confidence, r.scoring.gates.length,
  r.scoring.dimensions.map(d => d.id + ':' + (d.score == null ? '-' : d.score)).join(' ')]);
`;

const out = runSuite('Archetype suite', TESTS, 'const ARCH = ' + JSON.stringify({ ...FIX, companies }) + ';');
if (process.argv.includes('--table') || process.env.VCR2_ARCH_TABLE) {
  console.log('\nname'.padEnd(26) + 'overall  band      conf    gates  dimensions');
  for (const [n, o, b, c, g, d] of globalThis.__archTable) console.log(n.padEnd(25), String(o).padEnd(8), JSON.stringify(b).padEnd(9), String(c).padEnd(7), String(g).padEnd(6), d);
}
