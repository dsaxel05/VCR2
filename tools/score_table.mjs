#!/usr/bin/env node
// Prints a Markdown table of the scores of every archetype and both sample companies.
// Used for the before/after table in every scoring pull request.
//   node tools/score_table.mjs > baseline-scores.md
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from '../tests/_harness.mjs';
const FIX = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8'));
const resolve = n => { const c = FIX.companies[n]; const b = c.extends ? resolve(c.extends) : { vals:{}, bools:{}, sel:{} };
  return { label:c.label || b.label, stage:c.stage || b.stage, model:c.model || b.model, vals:{ ...b.vals, ...c.vals }, bools:{ ...b.bools, ...c.bools }, sel:{ ...b.sel, ...c.sel } }; };
const companies = Object.fromEntries(Object.keys(FIX.companies).map(n => [n, resolve(n)]));
const log = console.log; console.log = () => {};
runSuite('', String.raw`
const rows = [];
const row = (name, r) => rows.push([name, r.scoring.stage, r.scoring.model, r.scoring.overall, r.scoring.band ? r.scoring.band.join('–') : '', r.scoring.confidence,
  r.scoring.gates.map(g => g.id).join(', ') || '—', r.scoring.dimensions.map(d => d.score == null ? '–' : d.score).join(' / ')]);
for (const [n, c] of Object.entries(COS)) row(n, Radar.assess({ name:n, stage:c.stage, model:c.model, vals:c.vals, bools:c.bools, sel:c.sel, evid:{} }));
for (const d of ['northwind', 'halcyon']) { S = blankState(); loadDemo(d); const R = assessAll();
  rows.push(['sample: ' + d, R.sc.stage, R.sc.model, R.sc.overall, R.sc.band ? R.sc.band.join('–') : '', R.sc.confidence, R.sc.gates.map(g => g.id).join(', ') || '—', R.sc.dimensions.map(x => x.score == null ? '–' : x.score).join(' / ')]); }
globalThis.__rows = rows; globalThis.__rubric = rubricVersion();
`, 'const COS = ' + JSON.stringify(companies) + ';');
console.log = log;
console.log(`# Baseline scores\n\nRubric ${globalThis.__rubric}, generated ${new Date().toLocaleDateString('en-CA')} by \`node tools/score_table.mjs\`. Fictional companies from \`tests/fixtures/archetypes/archetypes.json\` plus the two sample companies. Dimensions: revenue / capital / go-to-market / team / market / governance.\n`);
console.log('| Company | Stage | Model | Overall | Band | Confidence | Gates | Dimensions |\n|---|---|---|---|---|---|---|---|');
for (const r of globalThis.__rows) console.log('| ' + r.join(' | ') + ' |');
