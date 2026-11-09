// Smart fill readers (E0, E1): every format, the hostile files, encodings, the XML reader and the limits.
//   node tests/smartfill-readers.test.mjs        (fixtures: tests/fixtures/smartfill/, made by tests/smartfill/make_fixtures.py)
// HTML is read with the browser's DOMParser, so its checks are in tests/browser/smartfill_readers_test.py.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { appSource, installStubs, root } from './_harness.mjs';

installStubs();
(0, eval)(appSource() + '\n;globalThis.__sf = { sfReadFile, sfDecode, sfXml, sfText, sfSniff, SfError, SF_WHY, SF_LIMIT };');
const { sfReadFile, sfDecode, sfXml, sfText, sfSniff, SfError, SF_WHY } = globalThis.__sf;
const FX = join(root, 'tests', 'fixtures', 'smartfill'), expect = JSON.parse(readFileSync(join(FX, 'expect.json'), 'utf8'));
const results = [];
const ok = (name, cond, got) => results.push({ name, ok:!!cond, got });
const bytes = f => new Uint8Array(readFileSync(join(FX, f)));
const read = async f => sfReadFile(bytes(f), f);
const all = d => d.blocks.map(b => b.text || (b.rows || []).map(r => r.join(' | ')).join('\n')).join('\n');
const enc = s => new TextEncoder().encode(s);

/* ── decoding ── */
ok('UTF-8 with a BOM', sfDecode(new Uint8Array([0xEF, 0xBB, 0xBF, ...enc('Clients')])) === 'Clients');
ok('UTF-16 LE with a BOM', sfDecode(new Uint8Array([0xFF, 0xFE, 65, 0, 82, 0, 82, 0])) === 'ARR');
ok('UTF-16 BE with a BOM', sfDecode(new Uint8Array([0xFE, 0xFF, 0, 65, 0, 82, 0, 82])) === 'ARR');
ok('UTF-16 LE without a BOM', sfDecode(new Uint8Array([65, 0, 82, 0, 82, 0, 58, 0, 32, 0, 49, 0])) === 'ARR: 1');
ok('Windows-1252 when the bytes are not UTF-8', sfDecode(new Uint8Array([0x54, 0x72, 0xE9, 0x73, 0x6F, 0x72, 0x20, 0x80])) === 'Trésor €', sfDecode(new Uint8Array([0x54, 0x72, 0xE9, 0x73, 0x6F, 0x72, 0x20, 0x80])));

/* ── the XML reader ── */
const x = sfXml('<?xml version="1.0"?><a:root xmlns:a="u"><a:x b="1&amp;2"><w:t xml:space="preserve"> hi </w:t><![CDATA[<raw>]]></a:x><y/></a:root>');
const node = x.c[0];
ok('XML: prefixes dropped, attributes unescaped', node.n === 'root' && node.c[0].n === 'x' && node.c[0].a.b === '1&2', node.c[0]);
ok('XML: preserved spaces and CDATA kept as text', sfText(node.c[0]) === ' hi <raw>', sfText(node.c[0]));
ok('XML: numeric references decoded', sfText(sfXml('<t>&#8364;&#x24;&lt;</t>').c[0]) === '€$<');
for (const bad of ['<!DOCTYPE x [<!ENTITY a "aaaa">]><x>&a;</x>', '<x><!ENTITY b "c"></x>']) { let code = ''; try { sfXml(bad); } catch (e) { code = e.code; } ok('XML: a DOCTYPE or entity declaration is refused', code === 'unknown', code); }

/* ── every document fixture reads, with its structure ── */
const docs = {};
for (const d of expect.docs.filter(x => !/^html?$/.test(x.format))) {
  const r = await read(d.file); docs[d.file] = r;
  ok(`${d.file}: read as ${d.format}`, r.ok && (r.kind === d.format || (d.format === 'xlsm' && r.kind === 'xlsm') || (d.format === 'txt' && r.kind === 'txt') || (d.format === 'md' && r.kind === 'md')), [r.kind, r.code, r.detail]);
  if (r.ok) ok(`${d.file}: no replacement characters, enough blocks`, !/�/.test(all(r.doc)) && r.doc.blocks.length >= (/^(csv|tsv|json)$/.test(d.format) ? 1 : 3), r.doc.blocks.length);
}
const D = f => (docs[f] || {}).doc || { blocks:[], notes:[] };
const pptx = D('deck-pptx.pptx');
ok('pptx: a KPI tile is read as a label and its value', pptx.blocks.some(b => b.type === 'kv' && b.hints.tile && /\d/.test(b.rows[0][1])), pptx.blocks.filter(b => b.hints.tile).map(b => b.text));
ok('pptx: blocks carry their slide', pptx.blocks.every(b => /^slide \d+/.test(b.loc)));
ok('pptx: speaker notes are read and marked', pptx.blocks.some(b => b.type === 'note' && b.hints.speakerNotes));
ok('pptx: the cached values of a chart are read', pptx.blocks.some(b => b.hints.chart && b.rows[1].some(v => /\d/.test(v))), pptx.blocks.filter(b => b.hints.chart).map(b => b.rows));
const xo = D('model-openpyxl.xlsx');
ok('xlsx: every sheet is read and the hidden one is flagged', xo.blocks.some(b => b.hints.sheet === 'old_v3' && b.hints.hidden) && xo.blocks.some(b => b.hints.sheet === 'ARR bridge' && !b.hints.hidden), xo.blocks.map(b => [b.hints.sheet, b.hints.hidden]));
ok('xlsx: the bridge has its Closing ARR row', xo.blocks.some(b => b.rows && b.rows.some(r => r[0] === 'Closing ARR')));
const xh = D('model-hand-built.xlsx');
ok('xlsx (hand-built): shared strings and the saved value of a formula', xh.blocks.some(b => b.rows && b.rows.some(r => r[0] === 'Check sum (formula)' && /\d/.test(r[2] || ''))), xh.blocks.map(b => b.rows && b.rows.slice(-1)));
ok('xlsx (hand-built): a defined name is kept as a hint', xh.blocks.some(b => b.type === 'meta' && /ClosingARR/.test(b.text)));
ok('ods: sheets read, the hidden one flagged', D('model-ods.ods').blocks.some(b => b.hints.hidden) && D('model-ods.ods').blocks.some(b => !b.hints.hidden && b.rows.length > 3));
ok('csv: a table with the bridge rows', D('model-csv.csv').blocks.some(b => b.type === 'table' && b.rows.some(r => /ARR/.test(r[0]))));
const tracked = await read('adv-tracked-changes.docx');
ok('docx with tracked changes: inserted text kept, deleted text dropped', tracked.ok && !/999,999,999/.test(all(tracked.doc)) && /Cash as of/.test(all(tracked.doc)), tracked.ok && all(tracked.doc).slice(0, 200));
ok('docx: footer read and marked as page furniture', D('update-docx.docx').blocks.some(b => b.type === 'note' && b.hints.furniture));
ok('odt: paragraphs read', /burn|consommation|cash|trésorerie/i.test(all(D('update-odt.odt'))), all(D('update-odt.odt')).slice(0, 120));
ok('rtf: paragraphs read, control words gone', /burn/i.test(all(D('update-rtf.rtf'))) && !/\\par|\\rtf/.test(all(D('update-rtf.rtf'))));
const eml = D('update-eml.eml');
ok('eml: subject kept as a meta block', eml.blocks.some(b => b.type === 'meta' && /^Subject:/.test(b.text)));
ok('eml: quoted-printable or base64 body decoded into label and value lines', eml.blocks.some(b => b.type === 'kv' && /burn/i.test(b.rows[0][0])), eml.blocks.slice(0, 6).map(b => b.text));
const js = D('json-json.json');
ok('json: key paths become label and value pairs', js.blocks.some(b => b.type === 'kv' && b.rows[0][0] === 'metrics.arr'), js.blocks.map(b => b.rows && b.rows[0][0]));
ok('tsv: tab-separated columns', D('crm-tsv.tsv').blocks.some(b => b.type === 'table' && b.rows[0].length >= 2));
ok('md: label and value lines', D('security-md.md').blocks.some(b => b.type === 'kv' && /Uptime/.test(b.rows[0][0])));
const bank = D('bank-reportlab.pdf');
ok('pdf (reportlab): a table whose numbers stay in their column', bank.blocks.some(b => b.type === 'table' && b.rows.some(r => r[1] === 'Opening balance' && r[2] === '' && /^\d[\d,.]*$/.test(r[3]))), bank.blocks.filter(b => b.type === 'table').map(b => b.rows.slice(2, 4)));
ok('pdf: page header and footer lines are marked at the page edge', bank.blocks.some(b => b.hints.edge));
const ts = D('termsheet-chromium.pdf');
ok('pdf (Chromium, Identity-H fonts with ToUnicode): text decoded', /Liquidation preference/.test(all(ts)) && /Pre-money valuation/.test(all(ts)), all(ts).slice(0, 120));
ok('pdf: a word broken by a line-end hyphen is joined', !/post- money/.test(all(ts)));

/* ── hostile files: the expected outcome, no exception, within 5 seconds ── */
for (const a of expect.adversarial) {
  if (/\.html$/.test(a.file)) continue;
  const t0 = performance.now(); let r, crash = null;
  try { r = await read(a.file); } catch (e) { crash = String(e); }
  const ms = performance.now() - t0, want = a.expect === 'read' ? 'read' : a.reason, got = crash ? 'CRASH ' + crash : r.ok ? 'read' : r.code;
  ok(`hostile ${a.file.slice(4, 44)}: ${want}`, got === want, got);
  ok(`hostile ${a.file.slice(4, 44)}: under 5 seconds`, ms < 5000, Math.round(ms));
  if (r && !r.ok) ok(`hostile ${a.file.slice(4, 44)}: a plain reason and a fix`, r.why && r.why[0].length > 10 && r.why[1].length > 10, r.why);
  if (r && r.ok && a.must_not_value) ok(`hostile ${a.file.slice(4, 44)}: the hidden or deleted figure is not read`, !all(r.doc).replace(/[,\s]/g, '').includes(String(a.must_not_value)));
}
const inj = await read('adv-injection.md');
ok('a sentence aimed at an AI is plain text, nothing more', inj.ok && /Ignore previous instructions/.test(all(inj.doc)));

/* ── a zipped data room expands; nested archives, oversize files and the 8-second budget are enforced ── */
const zipOf = files => {   /* stored (method 0) zip, enough for a test */
  const parts = [], dir = []; let off = 0;
  const crcT = Array.from({ length:256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = u => { let c = 0xFFFFFFFF; for (const b of u) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  for (const [name, data] of files) {
    const nm = enc(name), h = new DataView(new ArrayBuffer(30)), cr = crc(data);
    [[0, 0x04034b50, 4], [4, 20, 2], [14, cr, 4], [18, data.length, 4], [22, data.length, 4], [26, nm.length, 2]].forEach(([o, v, n]) => n === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true));
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [16, cr, 4], [20, data.length, 4], [24, data.length, 4], [28, nm.length, 2], [42, off, 4]].forEach(([o, v, n]) => n === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true));
    parts.push(new Uint8Array(h.buffer), nm, data); dir.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + data.length;
  }
  const dsize = dir.reduce((s, u) => s + u.length, 0), e = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [8, files.length, 2], [10, files.length, 2], [12, dsize, 4], [16, off, 4]].forEach(([o, v, n]) => n === 4 ? e.setUint32(o, v, true) : e.setUint16(o, v, true));
  const all2 = [...parts, ...dir, new Uint8Array(e.buffer)], out = new Uint8Array(all2.reduce((s, u) => s + u.length, 0)); let p = 0; all2.forEach(u => { out.set(u, p); p += u.length; }); return out;
};
const room = await sfReadFile(zipOf([['data-room/01-deck.md', bytes('deck-md.md')], ['data-room/02-model.xlsx', bytes('model-openpyxl.xlsx')], ['__MACOSX/._junk', enc('x')]]), 'room.zip');
ok('a zipped data room expands into its files (system junk skipped)', room.ok && room.children.length === 2 && room.children.every(c => c.ok), room.children && room.children.map(c => [c.file, c.ok]));
const nested = await sfReadFile(zipOf([['a.zip', zipOf([['b.zip', zipOf([['c.md', enc('# Deep\nARR: 1')]])]])]]), 'nest.zip');
ok('zips nested more than two deep are refused inside, without stopping the rest', nested.ok && nested.children[0].ok && nested.children[0].children[0].ok === false, JSON.stringify(nested).slice(0, 200));
const big = await sfReadFile(new Uint8Array(SF_LIMIT_FILE() + 1), 'huge.csv');
function SF_LIMIT_FILE() { return globalThis.__sf.SF_LIMIT.file; }
ok('a file over 25 MB is refused with a reason', !big.ok && big.code === 'too_big' && /25 MB/.test(big.why[0]), big.code);
ok('every reason code has a sentence and a fix', Object.values(SF_WHY).every(w => w.length === 2 && w.every(s => s.length > 10)));
const a1 = JSON.stringify((await read('model-openpyxl.xlsx')).doc), a2 = JSON.stringify((await read('model-openpyxl.xlsx')).doc);
ok('reading is deterministic', a1 === a2);

let failed = 0;
console.log('Smart fill readers');
for (const t of results) { if (t.ok) console.log('  ✓', t.name); else { failed++; console.log('  ✗', t.name, '— got', JSON.stringify(t.got)); } }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
