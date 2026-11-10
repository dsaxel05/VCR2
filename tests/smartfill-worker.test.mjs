// Smart fill in a background thread: the worker is built from the page's own code (between the SFW markers) and must
// give exactly what the page gives, for every fixture, with the owner's settings and taught labels. Run in a real
// thread (node:worker_threads), which, like a browser worker, has no DOMParser and no page.
//   node tests/smartfill-worker.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { appSource, root, installStubs } from './_harness.mjs';

installStubs();
const APP = appSource();
(0, eval)(APP + '\n;globalThis.__w = { sfWorkerSource, sfWorkerCtxData, sfReadFile, sfExtract, sfFields, sfUnmappedDoc, get CFG() { return CFG; }, resetDict() { _sfDict = null; _sfNA = null; } };');
const W = globalThis.__w, results = [], ok = (name, cond, got) => results.push({ name, ok:!!cond, got });

const src = W.sfWorkerSource(APP);
ok('the worker code is cut from the page between the two markers', src && src.includes('function sfReadFile') && src.includes('function sfExtract') && !src.includes('function renderSfReview'), src && src.length);
ok('the page without markers gives no worker (the page then reads everything itself)', W.sfWorkerSource('const a = 1;') === null);

/* a real thread: the browser's self, postMessage and onmessage, mapped onto node's message port */
const SHIM = "globalThis.self = globalThis; const { parentPort } = require('node:worker_threads'); globalThis.postMessage = d => parentPort.postMessage(d); parentPort.on('message', d => self.onmessage({ data:d }));\n";
const th = new Worker(SHIM + src, { eval:true });
let seq = 0; const waits = new Map();
th.on('message', d => { const f = waits.get(d.seq); if (f) { waits.delete(d.seq); f(d); } });
const ask = msg => new Promise(r => { const s = ++seq; waits.set(s, r); th.postMessage(Object.assign({ seq:s }, msg)); });
const pageResult = async (u8, name, as) => {
  const res = await W.sfReadFile(u8, name);
  let extract = null, children = null, unmapped = [];
  if (res.ok && res.children) children = res.children.filter(c => c.ok && c.doc).map(c => W.sfExtract(c, { model:'saas' }));
  else if (res.ok) { extract = W.sfExtract(res, { model:'saas', as:as || null }); unmapped = W.sfUnmappedDoc(res, extract, W.sfFields('saas')); }
  return { res, extract, children, unmapped };
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try {
  await ask({ op:'ctx', ctx:W.sfWorkerCtxData() });
  const D = join(root, 'tests', 'fixtures', 'smartfill');
  let n = 0, diff = [], leaked = [], html = [];
  for (const f of readdirSync(D).filter(f => !/\.json$/.test(f)).sort()) {
    const u8 = new Uint8Array(readFileSync(join(D, f))), id = ++n;
    const w = await ask({ op:'read', id, u8, name:f, model:'saas' });
    if (w.page) { html.push(f); continue; }
    const p = await pageResult(u8, f);
    if (!same(w.extract, p.extract) || !same(w.children, p.children) || !same(w.unmapped, p.unmapped) || w.res.ok !== p.res.ok || w.res.code !== p.res.code || w.res.kind !== p.res.kind) diff.push(f);
    if (/"blocks"|"rows"\s*:\s*\[\[/.test(JSON.stringify(w.res))) leaked.push(f);
  }
  ok(`every fixture read in the thread gives the same result as the page (${n - html.length} files)`, n - html.length >= 40 && !diff.length, diff);
  ok('the thread sends back no document text (no blocks or table rows)', !leaked.length, leaked);
  ok('HTML is handed back to the page (it needs the page\'s parser)', html.length >= 2 && html.every(f => /\.html?$/.test(f)), html);

  /* "Read as": the thread keeps the document and extracts again */
  const tf = 'termsheet-chromium.pdf', tu8 = new Uint8Array(readFileSync(join(D, tf)));
  await ask({ op:'read', id:900, u8:tu8, name:tf, model:'saas' });
  const re = await ask({ op:'extract', id:900, model:'saas', as:'deck' }), rp = await pageResult(tu8, tf, 'deck');
  ok('Read as: the thread extracts again from the document it kept, as the page would', re.extract && same(re.extract, rp.extract) && re.extract.cls.type === 'deck', re.extract && re.extract.cls);
  await ask({ op:'drop', id:900 });
  const gone = await ask({ op:'extract', id:900, model:'saas' });
  ok('a removed file is forgotten by the thread', gone.page === true, gone);

  /* the owner's settings and the user's taught labels reach the thread */
  const text = new TextEncoder().encode('Company update, September 2026\nZorblax accounts: 212\nCash and cash equivalents: $4,200,000\n');
  W.CFG.hidden = Object.assign({}, W.CFG.hidden, { inputs:['cash_on_hand'] });
  localStorage.setItem('vcr2-sf-aliases', JSON.stringify({ customers_now:['zorblax accounts'] }));
  W.resetDict();
  await ask({ op:'ctx', ctx:W.sfWorkerCtxData() });
  const ws = await ask({ op:'read', id:901, u8:text, name:'update.txt', model:'saas' }), ps = await pageResult(text, 'update.txt');
  const ids = e => (e ? e.proposals : []).map(p => p.field).sort();
  ok('a taught label is used in the thread (Zorblax accounts fills customers)', ids(ws.extract).some(f => /^(stated_)?customers/.test(f)), ids(ws.extract));
  ok('a field the owner hid is not filled in the thread', !ids(ws.extract).includes('cash_on_hand') && !ids(ws.extract).includes('stated_cash'), ids(ws.extract));
  ok('with these settings the thread and the page still agree', same(ws.extract, ps.extract), [ids(ws.extract), ids(ps.extract)]);
} finally { await th.terminate(); }

let failed = 0;
console.log('Smart fill in a background thread');
for (const t of results) { if (t.ok) console.log('  ✓', t.name); else { failed++; console.log('  ✗', t.name, '— got', JSON.stringify(t.got)); } }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
