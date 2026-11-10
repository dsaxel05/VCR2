// Hostile and odd files (test plan): every adv-* fixture read and extracted under Node; the outcome, the time, and whether
// anything crashed or hung. Writes the "adversarial" section of docs/smartfill/RESULTS.md.
//   node tests/smartfill/adversarial.mjs
// HTML fixtures need the browser's DOMParser: they are covered by tests/browser/smartfill_readers_test.py instead.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { appSource, root, installStubs } from '../_harness.mjs';

installStubs();
(0, eval)(appSource() + '\n;globalThis.__adv = { sfReadFile, sfExtract };');
const D = join(root, 'tests', 'fixtures', 'smartfill'), rows = [];
let crashed = 0, slow = 0;
for (const f of readdirSync(D).filter(f => f.startsWith('adv-') && !/\.html?$/.test(f)).sort()) {
  const u8 = new Uint8Array(readFileSync(join(D, f))), t0 = performance.now();
  let out, props = 0;
  try {
    const r = await globalThis.__adv.sfReadFile(u8, f);
    if (r.ok && !r.children) props = globalThis.__adv.sfExtract(r, { model:'saas' }).proposals.filter(p => p.tier !== 'Low').length;
    out = r.ok ? `read${r.children ? ` (${r.children.length} inside)` : ''}` : `refused: ${r.code}`;
  } catch (e) { crashed++; out = `CRASH: ${e.message}`; }
  const ms = performance.now() - t0; if (ms > 2000) slow++;
  rows.push(`| ${f.replace(/\|/g, '/')} | ${u8.length.toLocaleString('en-US')} | ${out} | ${props} | ${Math.round(ms)} |`);
}
const md = `## Hostile and odd files, ${new Date().toISOString().slice(0, 10)}

${rows.length} files, ${crashed} crashed, ${slow} took more than 2 s. "Filled" counts proposals at High or Medium.

| File | Bytes | Outcome | Filled | ms |
|---|---|---|---|---|
${rows.join('\n')}`;
const p = join(root, 'docs', 'smartfill', 'RESULTS.md'), start = '<!-- adversarial -->', end = '<!-- /adversarial -->';
let s = existsSync(p) ? readFileSync(p, 'utf8') : '# Smart fill results\n';
const block = `${start}\n${md}\n${end}`;
s = s.includes(start) ? s.slice(0, s.indexOf(start)) + block + s.slice(s.indexOf(end) + end.length) : s.trimEnd() + '\n\n' + block + '\n';
writeFileSync(p, s);
console.log(md);
process.exitCode = crashed || slow ? 1 : 0;
