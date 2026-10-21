#!/usr/bin/env node
// Writes the "Where the default ranges come from" table of docs/METHODOLOGY.md from PROVENANCE in the app,
// between the <!-- sources:start --> and <!-- sources:end --> markers, so the document cannot drift from the code.
//   node tools/gen_sources_doc.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from '../tests/_harness.mjs';
const log = console.log; console.log = () => {};
runSuite('', String.raw`
const rows = [];
Object.keys(PROVENANCE).forEach(k => provenanceOf(k).refs.forEach((r, i) => rows.push('| ' + (i ? '' : (DLABEL[k] || k)) + ' | ' + r.src + ' | ' + r.asOf + ' | ' + r.text + ' | ' + r.pop + ' | ' + r.status.toLowerCase() + ' |')));
globalThis.__rows = rows; globalThis.__n = Object.keys(RUBRIC.thresholds).length; globalThis.__k = Object.keys(PROVENANCE).length;
`);
console.log = log;
const f = join(root, 'docs', 'METHODOLOGY.md');
let t = readFileSync(f, 'utf8');
const table = ['| Metric | Source | Edition | Reference point | Population | Status |', '|---|---|---|---|---|---|', ...globalThis.__rows].join('\n');
const note = `\n${globalThis.__k} of the ${globalThis.__n} scored ranges have a public reference point; the rest are calibrations with no public statistic.\n`;
t = t.replace(/<!-- sources:start -->[\s\S]*<!-- sources:end -->/, `<!-- sources:start -->\n${table}\n${note}<!-- sources:end -->`);
writeFileSync(f, t);
console.log(`wrote ${globalThis.__rows.length} reference rows`);
