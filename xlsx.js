
/* ═══════════════════════════════════════════════════════════════
   EXCEL (.xlsx) READER — no library, nothing leaves the browser.
   An .xlsx file is a zip of XML parts. This reads the zip directory,
   inflates the parts with the browser's own DecompressionStream,
   and turns the best-matching sheet into CSV for the existing parsers.
   Dates become YYYY-MM-DD, computed without time zones.
   ═══════════════════════════════════════════════════════════════ */
const SHEET_EXT = /\.(xlsx|xlsm)$/i;
const LEGACY_SHEET_EXT = /\.(xls|ods|numbers)$/i;

function zipEntries(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This is not a valid .xlsx file.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder(), out = new Map();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('The .xlsx file is damaged.');
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true), name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    out.set(name.replace(/^\/+/, ''), { method, csize, off });
    p += 46 + nlen + xlen + clen;
  }
  return { u8, dv, entries:out };
}
async function zipRead(z, name) {
  const e = z.entries.get(name) || z.entries.get(name.replace(/^\/+/, ''));
  if (!e) return null;
  const h = e.off;
  if (z.dv.getUint32(h, true) !== 0x04034b50) throw new Error('The .xlsx file is damaged.');
  const start = h + 30 + z.dv.getUint16(h + 26, true) + z.dv.getUint16(h + 28, true);
  const raw = z.u8.subarray(start, start + e.csize);
  if (e.method === 0) return new TextDecoder().decode(raw);
  if (e.method !== 8) throw new Error('The .xlsx file uses an unsupported compression.');
  if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot read .xlsx files. Save the sheet as CSV instead.');
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}
const xmlDoc = s => new DOMParser().parseFromString(s, 'application/xml');
const xTags = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));
const xAttr = (el, name) => el.getAttribute(name) != null ? el.getAttribute(name)
  : (Array.from(el.attributes).find(a => a.localName === name) || {}).value || null;
function xResolve(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  target.split('/').forEach(seg => { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); });
  return parts.join('/');
}
function isDateFormat(id, code) {
  if ((id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58)) return true;
  if (!code) return false;
  const c = String(code).replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '').replace(/_.|\*./g, '');
  return /[dy]/i.test(c) || (/m/i.test(c) && !/[#0?]/.test(c) && /[dhsy\/-]|mmm/i.test(c));
}
function serialToISO(v, is1904) {
  const ms = Math.round(v * 86400000) + (is1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30));
  return new Date(ms).toISOString().slice(0, 10);
}
const colIndex = ref => { const m = /^([A-Z]+)/i.exec(ref || ''); if (!m) return -1; let n = 0; for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const csvCell = v => /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;

/* Returns [{ name, rows:[[...]] }] for every sheet. */
async function readWorkbook(buf) {
  const z = zipEntries(buf);
  let wbPath = 'xl/workbook.xml';
  const rootRels = await zipRead(z, '_rels/.rels');
  if (rootRels) { const r = xTags(xmlDoc(rootRels), 'Relationship').find(x => /officeDocument$/.test(xAttr(x, 'Type') || '')); if (r) wbPath = xResolve('', xAttr(r, 'Target')); }
  const wbXml = await zipRead(z, wbPath);
  if (!wbXml) throw new Error('No workbook found inside the file.');
  const wb = xmlDoc(wbXml);
  const pr = xTags(wb, 'workbookPr')[0], is1904 = !!pr && /^(1|true)$/i.test(xAttr(pr, 'date1904') || '');
  const relsPath = wbPath.replace(/[^/]*$/, '_rels/') + wbPath.split('/').pop() + '.rels';
  const rels = new Map(), relsXml = await zipRead(z, relsPath);
  if (relsXml) xTags(xmlDoc(relsXml), 'Relationship').forEach(r => rels.set(xAttr(r, 'Id'), { type:xAttr(r, 'Type') || '', target:xResolve(wbPath, xAttr(r, 'Target')) }));
  const find = re => { for (const r of rels.values()) if (re.test(r.type)) return r.target; return null; };
  /* Shared strings */
  const sst = [], sstXml = await zipRead(z, find(/sharedStrings$/) || 'xl/sharedStrings.xml');
  if (sstXml) xTags(xmlDoc(sstXml), 'si').forEach(si => sst.push(xTags(si, 't').filter(t => !xTags(si, 'rPh').some(ph => ph.contains(t))).map(t => t.textContent).join('')));
  /* Styles → which cells are dates */
  const xfDate = [], xfPct = [], stXml = await zipRead(z, find(/styles$/) || 'xl/styles.xml');
  if (stXml) {
    const st = xmlDoc(stXml), fmts = new Map();
    xTags(st, 'numFmt').forEach(n => fmts.set(+xAttr(n, 'numFmtId'), xAttr(n, 'formatCode')));
    const cx = xTags(st, 'cellXfs')[0];
    if (cx) Array.from(cx.children).filter(x => x.localName === 'xf').forEach(xf => {
      const id = +(xAttr(xf, 'numFmtId') || 0), code = fmts.get(id);
      xfDate.push(isDateFormat(id, code));
      xfPct.push(id === 9 || id === 10 || (!!code && /%/.test(String(code).replace(/"[^"]*"/g, '').replace(/\\./g, ''))));
    });
  }
  const sheets = [];
  for (const sh of xTags(wb, 'sheet')) {
    const rid = xAttr(sh, 'id'), rel = rels.get(rid);
    const state = xAttr(sh, 'state');
    const xml = rel ? await zipRead(z, rel.target) : null;
    if (!xml) continue;
    const doc = xmlDoc(xml), rows = [];
    let rAuto = 0;
    xTags(doc, 'row').forEach(row => {
      const rn = xAttr(row, 'r'); const ri = rn ? +rn - 1 : rAuto; rAuto = ri + 1;
      if (ri > 100000) return;
      const cells = []; let cAuto = 0;
      Array.from(row.children).filter(c => c.localName === 'c').forEach(c => {
        const ref = xAttr(c, 'r'); let ci = ref ? colIndex(ref) : cAuto; if (ci < 0) ci = cAuto; cAuto = ci + 1;
        if (ci > 2000) return;
        const t = xAttr(c, 't') || 'n', s = +(xAttr(c, 's') || 0);
        const vEl = Array.from(c.children).find(x => x.localName === 'v'), v = vEl ? vEl.textContent : null;
        let out = '';
        if (t === 's') out = v != null ? (sst[+v] || '') : '';
        else if (t === 'inlineStr') out = xTags(c, 't').map(x => x.textContent).join('');
        else if (t === 'str') out = v || '';
        else if (t === 'b') out = v === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'e') out = '';
        else if (t === 'd') out = v ? String(v).slice(0, 10) : '';
        else if (v != null && v !== '') {
          const n = +v;
          /* Show cells the way Excel shows them: dates as dates, 150% as 150%, not 1.5. */
          out = xfDate[s] && isFinite(n) && n > 0 && n < 2958466 ? serialToISO(n, is1904)
              : xfPct[s] && isFinite(n) ? String(Math.round(n * 100 * 1e9) / 1e9) + '%'
              : String(isFinite(n) ? n : v);
        }
        cells[ci] = out;
      });
      rows[ri] = cells;
    });
    const clean = [];
    for (let i = 0; i < rows.length; i++) { const r = rows[i] || []; clean.push(Array.from({ length:r.length }, (_, k) => r[k] == null ? '' : String(r[k]).trim())); }
    while (clean.length && clean[clean.length - 1].every(x => x === '')) clean.pop();
    sheets.push({ name:xAttr(sh, 'name') || `Sheet ${sheets.length + 1}`, hidden:!!state && state !== 'visible', rows:clean });
  }
  return sheets;
}
function rowsToCSV(rows) {
  const nonEmpty = rows.filter(r => r.some(x => x !== ''));
  const width = Math.max(0, ...nonEmpty.map(r => { let w = r.length; while (w && r[w - 1] === '') w--; return w; }));
  return nonEmpty.map(r => Array.from({ length:width }, (_, k) => csvCell(r[k] || '')).join(',')).join('\n');
}
/* Pick the sheet that most looks like what the drop zone expects. */
const SHEET_HINTS = {
  ledger:/ledger|mrr|arr|revenue|customer|billing|subscri|client/i,
  series:/month|financ|p&l|pnl|p ?& ?l|cash|burn|kpi|management|actuals/i,
  library:/deal|compar|portfolio|library|company|companies/i,
};
function pickSheet(sheets, kind) {
  const usable = sheets.filter(s => !s.hidden && s.rows.filter(r => r.some(x => x !== '')).length >= 2);
  const pool = usable.length ? usable : sheets.filter(s => s.rows.length);
  if (!pool.length) return null;
  const hint = SHEET_HINTS[kind];
  const score = s => {
    const cells = s.rows.reduce((a, r) => a + r.filter(x => x !== '').length, 0);
    return (hint && hint.test(s.name) ? 1e9 : 0) + cells;
  };
  return pool.slice().sort((a, b) => score(b) - score(a))[0];
}
async function sheetFileToCSV(file, kind) {
  const sheets = await readWorkbook(await file.arrayBuffer());
  const sh = pickSheet(sheets, kind);
  if (!sh) throw new Error('The workbook has no data.');
  return { csv:rowsToCSV(sh.rows), sheet:sh.name, count:sheets.filter(s => !s.hidden).length };
}
/* One entry point for every file input: text files as text, workbooks as CSV. */
function readAnyFile(file, cb, kind) {
  if (!file) return;
  if (LEGACY_SHEET_EXT.test(file.name)) { toast(`${file.name}: save it as .xlsx or .csv first (File → Save As).`, 'err'); return; }
  if (SHEET_EXT.test(file.name)) {
    sheetFileToCSV(file, kind).then(r => {
      if (r.count > 1) toast(`Read the sheet “${r.sheet}” from ${file.name}.`);
      cb(r.csv, `${file.name} › ${r.sheet}`);
    }).catch(e => toast(`${file.name}: ${e.message}`, 'err'));
    return;
  }
  const rd = new FileReader();
  rd.onload = () => cb(String(rd.result), file.name);
  rd.readAsText(file);
}
