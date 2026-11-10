/* ═══════════════════════════════════════════════════════════════
   SMART FILL: INTAKE (E0). An optional, offline, rule-based reader:
   no AI, no network, nothing leaves the browser. Files are recognised
   by their content, decoded, and expanded within fixed limits; a file
   that cannot be read gets a plain reason and a fix, never a crash.
   Pure functions: they also run in a Worker and under Node (tests).
   ═══════════════════════════════════════════════════════════════ */
const SF_LIMIT = { file:25 * 1048576, files:40, zipTotal:150 * 1048576, zipRatio:100, zipDepth:2, pdfPages:400, ms:8000, tableRows:2000, tableHead:1000, tableTail:200, xmlChars:60 * 1048576, cells:2e6 };
class SfError extends Error { constructor(code, detail) { super(code); this.code = code; this.detail = detail || ''; } }
/* code -> [what happened, how to fix it] */
const SF_WHY = {
  empty:['The file is empty.', 'Check that the export finished, then drop it again.'],
  image:['This is a picture, and VCR2 cannot read text inside pictures offline (no OCR).', 'Export the original as a text PDF, .xlsx or .docx, or paste the text.'],
  scanned_pdf:['This PDF is an image: its pages hold no text layer.', 'Export the original document as a text PDF, .xlsx or .docx, or paste the text.'],
  encrypted:['The file is protected by a password or encrypted.', 'Save a copy without the password and drop that copy.'],
  legacy_office:['This is an old Office format (.xls, .doc or .ppt).', 'Open it and use Save As .xlsx, .docx or .pptx.'],
  apple:['Pages, Numbers and Keynote files cannot be read.', 'Export to PDF or to the Office format (.docx, .xlsx, .pptx).'],
  truncated:['The file is damaged or incomplete.', 'Download or export it again.'],
  too_big:['The file is larger than 25 MB.', 'Export only the tabs or pages you need.'],
  bomb:['The archive expands to far more data than its size allows, so it was not opened.', 'Unzip it yourself and drop the files you need.'],
  link:['This is only a link. VCR2 never fetches web pages or online documents.', 'Download the document as PDF, .xlsx or .docx and drop it, or copy the text and paste it.'],
  undecodable_font:['The PDF uses fonts whose letters cannot be decoded without guessing.', 'Export the PDF again from the source application, or paste the text.'],
  timeout:['Reading took longer than 8 seconds and was stopped.', 'Drop a smaller export of the part you need.'],
  too_deep:['The file is nested far more deeply than any data export needs, so it was not opened.', 'Export the data again as CSV or .xlsx.'],
  unknown:['VCR2 does not recognise this kind of file.', 'Save it as PDF, .xlsx, .docx, .csv or plain text.'],
};
const sfFail = (code, detail) => { throw new SfError(code, detail); };

/* ── deadline: long loops call sfTick() so one hostile file stops at 8 seconds instead of freezing the page ── */
let _sfDeadline = Infinity;
const sfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const sfTick = () => { if (sfNow() > _sfDeadline) sfFail('timeout'); };

/* ── text decoding: BOM first, then strict UTF-8, then UTF-16 without BOM, then Windows-1252 ── */
function sfDecode(u8) {
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return new TextDecoder('utf-8').decode(u8.subarray(3));
  if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  const n = Math.min(u8.length, 4000); let odd = 0, even = 0;
  for (let i = 0; i < n; i++) if (!u8[i]) { if (i % 2) odd++; else even++; }
  if (odd > n / 4) return new TextDecoder('utf-16le').decode(u8);
  if (even > n / 4) return new TextDecoder('utf-16be').decode(u8);
  try { return new TextDecoder('utf-8', { fatal:true }).decode(u8); } catch (e) { return new TextDecoder('windows-1252').decode(u8); }
}
const sfLatin1 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return s; };

/* ── zip: the directory is read with the workbook reader's zipEntries; parts inflate under a total and a ratio budget ── */
function sfZip(u8) {
  let z;
  try { z = zipEntries(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)); } catch (e) { sfFail('truncated'); }
  z.budget = { out:0, limit:Math.min(SF_LIMIT.zipTotal, Math.max(1048576, u8.length * SF_LIMIT.zipRatio)) };
  return z;
}
async function sfZipBytes(z, name) {
  const e = z.entries.get(name); if (!e) return null;
  const h = e.off;
  if (h + 30 > z.u8.length || z.dv.getUint32(h, true) !== 0x04034b50) sfFail('truncated');
  const start = h + 30 + z.dv.getUint16(h + 26, true) + z.dv.getUint16(h + 28, true);
  if (start + e.csize > z.u8.length) sfFail('truncated');
  const raw = z.u8.subarray(start, start + e.csize);
  if (e.method === 0) { z.budget.out += raw.length; if (z.budget.out > z.budget.limit) sfFail('bomb'); return raw; }
  if (e.method !== 8) sfFail('unknown', 'an unsupported zip compression');
  return sfInflate(raw, 'deflate-raw', z.budget);
}
/* DecompressionStream, with a running budget: a crafted archive or stream stops as soon as it passes it. */
async function sfInflate(raw, fmt, budget) {
  const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream(fmt)).getReader(), chunks = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.length; if (budget) { budget.out += value.length; if (budget.out > budget.limit) { try { await reader.cancel(); } catch (e) {} sfFail('bomb'); } }
      chunks.push(value); sfTick();
    }
  } catch (e) { if (e instanceof SfError) throw e; if (!total) sfFail('truncated'); }
  const out = new Uint8Array(total); let o = 0; chunks.forEach(c => { out.set(c, o); o += c.length; }); return out;
}
const sfZipText = async (z, name) => { const b = await sfZipBytes(z, name); return b ? new TextDecoder().decode(b) : null; };

/* ── a small XML reader (no DOM, so it runs in a Worker and under Node): elements, attributes, text; no DOCTYPE, no entities
   beyond the five standard ones and numeric references, prefixes dropped (w:t is read as t). ── */
const SF_ENT = { lt:'<', gt:'>', amp:'&', quot:'"', apos:"'" };
const sfUnesc = s => s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(Math.min(0x10FFFF, parseInt(e[1] === 'x' || e[1] === 'X' ? e.slice(2) : e.slice(1), e[1] === 'x' || e[1] === 'X' ? 16 : 10)) || 32) : SF_ENT[e.toLowerCase()]);
function sfXml(s) {
  if (s.length > SF_LIMIT.xmlChars) sfFail('bomb');
  if (/<!(DOCTYPE|ENTITY)/i.test(s.slice(0, 4096)) || /<!ENTITY/i.test(s)) sfFail('unknown', 'an XML part declares entities');
  const root = { n:'#root', a:{}, c:[] }, stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=>\/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let m, last = 0, k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) { const t = s.slice(last, m.index); if (/\S/.test(t) || stack[stack.length - 1].keep) stack[stack.length - 1].c.push(sfUnesc(t)); }
    last = re.lastIndex;
    if ((++k & 4095) === 0) sfTick();
    if (m[1] != null) { stack[stack.length - 1].c.push(m[1]); continue; }
    if (!m[3]) continue;
    const name = m[3].replace(/^.*:/, '');
    if (m[2]) { for (let i = stack.length - 1; i > 0; i--) if (stack[i].n === name) { stack.length = i; break; } continue; }
    const a = {}; m[4].replace(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (x, k2, v1, v2) => { a[k2.replace(/^.*:/, '')] = sfUnesc(v1 != null ? v1 : v2); });
    const node = { n:name, a, c:[], keep:name === 't' || name === 'p' || name === 'span' || name === 's' };
    stack[stack.length - 1].c.push(node);
    if (!m[5]) stack.push(node);
  }
  return root;
}
function* sfAll(node, name) { for (const c of node.c || []) if (typeof c === 'object') { if (!name || c.n === name) yield c; yield* sfAll(c, name); } }
const sfFirst = (node, name) => { for (const x of sfAll(node, name)) return x; return null; };
const sfKids = (node, name) => (node.c || []).filter(c => typeof c === 'object' && (!name || c.n === name));
/* the visible text of a node; skip lists element names whose text never counts (deleted text, phonetic guides, field codes) */
function sfText(node, skip) {
  let s = '';
  for (const c of node.c || []) {
    if (typeof c === 'string') { s += c; continue; }
    if (skip && skip.has(c.n)) continue;
    if (c.n === 'tab') s += '\t'; else if (c.n === 'br' || c.n === 'cr' || c.n === 'line-break') s += '\n';
    else if (c.n === 's' && c.a.c) s += ' '.repeat(Math.min(50, +c.a.c || 1)); else s += sfText(c, skip);
  }
  return s;
}

/* ── what is this file? by its bytes, not its name ── */
async function sfSniff(u8, name) {
  if (!u8.length) return { kind:'empty' };
  const head = sfLatin1(u8.subarray(0, 2048)), ext = (/\.([a-z0-9]{1,6})$/i.exec(name || '') || [])[1] || '';
  if (head.startsWith('PK\x03\x04') || head.startsWith('PK\x05\x06')) {
    let z; try { z = sfZip(u8); } catch (e) { return { kind:/^(pages|numbers|key)$/i.test(ext) ? 'apple' : 'truncated' }; }
    const has = p => z.entries.has(p), any = re => Array.from(z.entries.keys()).some(k => re.test(k));
    if (has('[Content_Types].xml')) {
      if (any(/^xl\//)) return { kind:any(/vbaProject\.bin$/) || /xlsm/i.test(ext) ? 'xlsm' : 'xlsx', z };
      if (any(/^word\//)) return { kind:'docx', z };
      if (any(/^ppt\//)) return { kind:'pptx', z };
    }
    if (has('mimetype')) {
      const mt = new TextDecoder().decode(await sfZipBytes(z, 'mimetype') || new Uint8Array());
      if (/spreadsheet/.test(mt)) return { kind:'ods', z };
      if (/text/.test(mt)) return { kind:'odt', z };
      if (/presentation/.test(mt)) return { kind:'odp', z };
    }
    if (any(/^(Index\/|index\.xml$|.*\.iwa$)/) || /^(pages|numbers|key)$/i.test(ext)) return { kind:'apple' };
    return { kind:'zip', z };
  }
  if (head.slice(0, 1024).indexOf('%PDF-') >= 0) return { kind:'pdf' };
  if (head.startsWith('\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1')) {
    const all = sfLatin1(u8.subarray(0, Math.min(u8.length, 1 << 20)));
    return { kind:/E\0n\0c\0r\0y\0p\0t\0e\0d\0P\0a\0c\0k\0a\0g\0e|EncryptedPackage/.test(all) ? 'encrypted' : 'legacy_office' };
  }
  if (/^(\x89PNG|\xFF\xD8\xFF|GIF8|II\*\0|MM\0\*|BM|RIFF....WEBP)/.test(head) || /^....ftyp(hei|mif|avif)/.test(head)) return { kind:'image' };
  if (/^\{\\rtf/.test(head)) return { kind:'rtf' };
  const text = sfDecode(u8), t = text.replace(/^\s+/, '');
  if (/^\[InternetShortcut\]/i.test(t) || /<key>URL<\/key>/.test(t.slice(0, 2000)) || /^https?:\/\/\S+\s*$/i.test(t)) return { kind:'link' };
  if (/^(?:(?:Received|Return-Path|From|To|Subject|Date|MIME-Version|Message-ID|Content-Type|Delivered-To):[^\n]*\r?\n(?:[ \t][^\n]*\r?\n)*){3,}/i.test(t)) return { kind:'eml', text };
  if (/^[{\[]/.test(t)) { try { parseJSONLimited(text); return { kind:'json', text }; } catch (e) { if (e && e.limit) return { kind:'json', text }; } }
  if (/<(!doctype html|html[\s>]|head[\s>]|body[\s>]|table[\s>])/i.test(t.slice(0, 4096))) return { kind:'html', text };
  if (/^(md|markdown)$/i.test(ext)) return { kind:'md', text };
  if (/^(tsv|tab)$/i.test(ext)) return { kind:'tsv', text };
  return { kind:/^csv$/i.test(ext) ? 'csv' : 'txt', text };
}
