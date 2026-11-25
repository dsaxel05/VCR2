// Prints what the readers see in one corpus document and what the engine proposes (dev tool, not a test).
//   node tests/smartfill/showdoc.mjs heldout <file substring> [field]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appSource, installStubs } from '../_harness.mjs';
const here = dirname(fileURLToPath(import.meta.url)), [SET, PART, FIELD] = process.argv.slice(2);
const dir = join(here, 'corpus', SET), gold = JSON.parse(readFileSync(join(dir, 'gold.json'), 'utf8'));
installStubs();
(0, eval)(appSource() + '\n;globalThis.__a = { sfReadFile, sfExtract };');
for (const g of gold.docs.filter(d => d.file.includes(PART)).slice(0, 2)) {
  const r = await globalThis.__a.sfReadFile(new Uint8Array(readFileSync(join(dir, g.file))), g.file.split('/').pop());
  console.log('=== ' + g.file, g.type, g.lang);
  for (const b of (r.doc && r.doc.blocks) || []) console.log(b.type === 'table' ? 'T| ' + b.rows.map(x => x.join(' ; ')).join('\n T| ') : 'P| ' + (b.text || '').slice(0, 300), b.loc ? '@' + b.loc : '');
  const e = globalThis.__a.sfExtract(r, { model:g.model });
  console.log('cls', e.cls.type, e.cls.role); for (const p of e.proposals) if (!FIELD || p.field === FIELD) console.log('  ->', p.field, p.value, p.tier);
  console.log('gold', JSON.stringify(g.fields));
}
