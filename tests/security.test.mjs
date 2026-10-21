// Security and privacy findings SEC-03, 05, 07, 08, 09, 10 of the independent review
//   node tests/security.test.mjs
import { deflateRawSync } from 'node:zlib';
import { runSuite } from './_harness.mjs';

/* A one-entry .xlsx-like zip whose entry inflates to `bytes` zeros. */
function zipOf(name, bytes) {
  const raw = deflateRawSync(Buffer.alloc(bytes, 0), { level: 9 });
  const nameB = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(raw.length, 18); local.writeUInt32LE(bytes >>> 0, 22); local.writeUInt16LE(nameB.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(raw.length, 20); central.writeUInt32LE(bytes >>> 0, 24); central.writeUInt16LE(nameB.length, 28); central.writeUInt32LE(0, 42);
  const body = Buffer.concat([local, nameB, raw]);
  central.writeUInt32LE(0, 42);
  const cd = Buffer.concat([central, nameB]);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(body.length, 16);
  const all = Buffer.concat([body, cd, eocd]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}

const TESTS = String.raw`
/* SEC-05: a library backup is rebuilt from a whitelist; one bad entry cannot break the page */
const hostile = [
  { id:'a1', company:'Fine Co', stage:'seed', model:'saas', date:'2026-01-02', metrics:{ nrr:104, arr:1200000, unknown_metric:5 }, outcome:'Invested' },
  { company:'<img src=x onerror=alert(1)>', metrics:{ nrr:'104' } },                       /* numbers as text */
  { company:'Text metrics', metrics:{ nrr:'abc', grr:null } },
  { company:'', metrics:{ nrr:100 } },
  null, 7, 'x', [], { company:'No metrics' },
  { id:'a2', company:'Proto', metrics:{ __proto__:{ nrr:1 }, nrr:90 }, stated:{ stated_arr:5, evil:1, stated_x:'7' }, outcome:'Hacked', payload:'not an object', blocked:'yes', majors:1e9 },
];
const cleaned = hostile.map(libClean).filter(Boolean);
eq('library: only usable entries survive', cleaned.map(e => e.company), ['Fine Co', 'Proto']);
ok('library: text metrics are dropped and entries without a number are refused', !cleaned.some(e => e.company === 'Text metrics') && !cleaned.some(e => e.company === 'No metrics'), cleaned.map(e => e.company));
const fine = cleaned.find(e => e.id === 'a1');
eq('library: unknown metrics are dropped', Object.keys(fine.metrics).sort(), ['arr', 'nrr']);
const proto = cleaned.find(e => e.id === 'a2');
ok('library: stated figures, outcomes, flags and counts are bounded', proto && Object.keys(proto.stated).join() === 'stated_arr' && proto.outcome === '' && proto.blocked === false && proto.majors === 100 && proto.payload === null, proto);
ok('library: every metric value is a finite number', cleaned.every(e => Object.values(e.metrics).every(v => typeof v === 'number' && isFinite(v))), '');
eq('library: formatting never throws on odd values', ['x', '5', null, NaN, {}].map(v => libFmt({ unit:'%' }, v)), ['n/a', 'n/a', 'n/a', 'n/a', 'n/a']);
localStorage.setItem(LIB_KEY, JSON.stringify(hostile));
let loadErr = null, loaded = [];
try { loaded = libLoad(); } catch (e) { loadErr = e; }
eq('library: loading a poisoned library does not throw', loadErr, null);
ok('library: and rendering it does not throw', (() => { try { renderLibrary(); return true; } catch (e) { return String(e); } })() === true, '');
localStorage.removeItem(LIB_KEY);

/* SEC-08: a very long cell is refused at once, a normal one still parses */
const t0 = Date.now();
eq('parseNum: a 200,000-character numeric cell is refused', parseNum('9'.repeat(200000)), null);
ok('parseNum: and does so quickly', Date.now() - t0 < 200, Date.now() - t0);
eq('parseNum: ordinary figures still parse', [parseNum('1,234.5'), parseNum('(2,000)'), parseNum('12%'), parseNum('€ 4.5m')], [1234.5, -2000, 12, 4500000]);

/* SEC-10: a formula that would be cut at publish is refused in the editor */
const long = '1 + ' + Array(300).fill('2').join(' + ');
const lr = fxValidate(long, {});
ok('formula: over 1,000 characters is refused with its length', !lr.ok && /1,000/.test(lr.error) && /\d{4}/.test(lr.error), lr);
eq('formula: a normal one passes', fxValidate('arr_now / 12', { cfg:EMPTY_CONFIG() }).ok, true);

/* SEC-09: the Gemini key goes in a header, not in the web address */
let seen = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => { seen = { url:String(url), headers:opts && opts.headers }; return { ok:true, status:200, json:async () => ({ candidates:[{ content:{ parts:[{ text:'ok' }] } }] }) }; };
callModel('gemini', 'AIza' + 'B'.repeat(35), 'sys', 'prompt', 50).catch(() => null);
globalThis.fetch = realFetch;
ok('gemini: the key is not in the URL', seen && !/key=|AIza/.test(seen.url), seen && seen.url);
ok('gemini: it is sent in the x-goog-api-key header', seen && seen.headers && /^AIza/.test(seen.headers['x-goog-api-key']), seen && seen.headers);
`;

runSuite('Security findings', TESTS);

/* SEC-07: a workbook that inflates to hundreds of megabytes is refused, not opened */
import { readFileSync } from 'node:fs';
const bomb = zipOf('xl/workbook.xml', 150 * 1024 * 1024);
const SRC = readFileSync(new URL('../src/xlsx.js', import.meta.url), 'utf8');
const mod = new Function(SRC + '\nreturn { zipEntries, zipRead };')();
const z = mod.zipEntries(bomb);
let msg = null; const t0 = Date.now();
try { await mod.zipRead(z, 'xl/workbook.xml'); } catch (e) { msg = e.message; }
const ok1 = /expands to far more data/.test(msg || '');
console.log((ok1 ? '  ✓ ' : '  ✗ ') + 'xlsx: a 150 MB zip bomb is refused (' + (Date.now() - t0) + ' ms)');
const small = mod.zipEntries(zipOf('a.xml', 1000));
const txt = await mod.zipRead(small, 'a.xml');
const ok2 = typeof txt === 'string' && txt.length === 1000;
console.log((ok2 ? '  ✓ ' : '  ✗ ') + 'xlsx: an ordinary part still opens');
if (!ok1 || !ok2) process.exitCode = 1;
