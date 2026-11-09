/* ═══════════════════════════════════════════════════════════════
   SMART FILL: READERS (E1). Every reader returns one Document:
     { file, kind, pages|sheets|slides, blocks:[{ type, text, rows, loc, hints }], notes:[] }
   type: table | para | kv | heading | list | note | meta. Nothing is
   evaluated: no formulas, macros or scripts; only saved values and text.
   ═══════════════════════════════════════════════════════════════ */
const sfCol = n => { let s = ''; n++; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; } return s; };
const sfRef = ref => { const m = /^([A-Z]+)(\d+)$/i.exec(ref || ''); if (!m) return null; let c = 0; for (const ch of m[1].toUpperCase()) c = c * 26 + ch.charCodeAt(0) - 64; return { r:+m[2] - 1, c:c - 1 }; };
const sfClean = s => String(s == null ? '' : s).replace(/ | /g, ' ').replace(/[ \t]+/g, ' ').trim();
/* drop the empty edge of a grid, and cap its size so one hostile sheet cannot fill memory */
function sfTrim(rows) {
  let last = rows.length; while (last && !rows[last - 1].some(c => c !== '')) last--;
  rows = rows.slice(0, last);
  let w = 0; rows.forEach(r => { for (let i = r.length - 1; i >= 0; i--) if (r[i] !== '') { w = Math.max(w, i + 1); break; } });
  return rows.map(r => { const o = r.slice(0, w); while (o.length < w) o.push(''); return o; });
}

/* ── XLSX and XLSM: every sheet, hidden ones flagged; merged cells copied to every cell they cover; saved values only ── */
async function sfReadXlsx(z, file, kind) {
  const doc = { file, kind, sheets:0, blocks:[], notes:[] };
  const rels = async p => {
    const t = await sfZipText(z, p.replace(/[^/]*$/, '_rels/') + p.split('/').pop() + '.rels'), m = new Map();
    if (t) for (const r of sfAll(sfXml(t), 'Relationship')) m.set(r.a.Id, { type:r.a.Type || '', target:sfResolve(p, r.a.Target || ''), ext:r.a.TargetMode === 'External' });
    return m;
  };
  let wbPath = 'xl/workbook.xml';
  const root = await rels(''); for (const r of root.values()) if (/officeDocument$/.test(r.type)) wbPath = r.target;
  const wbx = await sfZipText(z, wbPath); if (!wbx) sfFail('truncated');
  const wb = sfXml(wbx), wr = await rels(wbPath), pr = sfFirst(wb, 'workbookPr'), is1904 = !!pr && /^(1|true)$/i.test(pr.a.date1904 || '');
  const ss = [], ssPath = [...wr.values()].find(r => /sharedStrings$/.test(r.type));
  if (ssPath) { const t = await sfZipText(z, ssPath.target); if (t) for (const si of sfKids(sfXml(t).c.find(x => x.n === 'sst') || { c:[] }, 'si')) ss.push(sfText(si, new Set(['rPh']))); }
  /* number formats: which style indexes are percentages and which are dates */
  const fmt = [], stPath = [...wr.values()].find(r => /styles$/.test(r.type));
  if (stPath) {
    const t = await sfZipText(z, stPath.target);
    if (t) {
      const st = sfXml(t), codes = {}; for (const f of sfAll(st, 'numFmt')) codes[f.a.numFmtId] = f.a.formatCode || '';
      const xfs = sfFirst(st, 'cellXfs');
      if (xfs) for (const x of sfKids(xfs, 'xf')) { const id = +x.a.numFmtId || 0, code = codes[id] || ''; fmt.push(id === 9 || id === 10 || /%/.test(code) ? 'pct' : isDateFormat(id, code) ? 'date' : ''); }
    }
  }
  if ([...wr.values()].some(r => r.ext)) doc.notes.push('The workbook links to other files; only the values saved inside it were read.');
  let cells = 0;
  for (const sh of sfAll(wb, 'sheet')) {
    const r = wr.get(sh.a.id) || {}, x = r.target && await sfZipText(z, r.target); if (!x) continue;
    const name = sh.a.name || 'Sheet', hidden = /hidden/i.test(sh.a.state || ''), ws = sfXml(x), grid = [], hiddenRows = new Set(), hiddenCols = new Set();
    for (const c of sfAll(ws, 'col')) if (/^(1|true)$/.test(c.a.hidden || '')) for (let i = +c.a.min - 1; i < Math.min(+c.a.max, 16384); i++) hiddenCols.add(i);
    let noCache = 0;
    for (const row of sfAll(ws, 'row')) {
      if (/^(1|true)$/.test(row.a.hidden || '')) hiddenRows.add(+row.a.r - 1);
      for (const c of sfKids(row, 'c')) {
        const p = sfRef(c.a.r); if (!p || p.r > 1048575 || p.c > 16383) continue;
        if (++cells > SF_LIMIT.cells) sfFail('bomb'); if ((cells & 8191) === 0) sfTick();
        const v = sfKids(c, 'v')[0], f = sfKids(c, 'f')[0], t = c.a.t || '';
        let val = v ? sfText(v) : '';
        if (t === 's') val = ss[+val] || ''; else if (t === 'inlineStr') val = sfText(sfKids(c, 'is')[0] || { c:[] }); else if (t === 'b') val = val === '1' ? 'TRUE' : val === '0' ? 'FALSE' : val;
        else if (t !== 'str' && t !== 'e' && val !== '' && isFinite(+val)) { const k = fmt[+c.a.s || 0]; if (k === 'pct') val = String(+(+val * 100).toPrecision(12)) + '%'; else if (k === 'date') val = serialToISO(+val, is1904); }
        if (f && !v) { noCache++; val = ''; }
        (grid[p.r] ||= [])[p.c] = sfClean(val);
      }
    }
    for (const mc of sfAll(ws, 'mergeCell')) {
      const [a, b] = (mc.a.ref || '').split(':').map(sfRef); if (!a || !b) continue;
      const v = (grid[a.r] || [])[a.c] || '';
      for (let i = a.r; i <= Math.min(b.r, a.r + 200); i++) for (let j = a.c; j <= Math.min(b.c, a.c + 50); j++) (grid[i] ||= [])[j] = v;
    }
    if (noCache) doc.notes.push(`${name}: ${noCache} formula cell${noCache > 1 ? 's have' : ' has'} no saved value, so ${noCache > 1 ? 'they were' : 'it was'} left empty (formulas are never computed).`);
    const dense = []; for (let i = 0; i < grid.length; i++) { const r2 = grid[i] || []; const o = []; for (let j = 0; j < r2.length; j++) o.push(hiddenCols.has(j) ? '' : (r2[j] || '')); dense.push(hiddenRows.has(i) ? o.map(() => '') : o); }
    doc.sheets++;
    doc.blocks.push({ type:'table', rows:sfTrim(dense), loc:name, hints:{ sheet:name, hidden, hiddenRows:hiddenRows.size, r0:0, c0:0 } });
  }
  for (const dn of sfAll(wb, 'definedName')) doc.blocks.push({ type:'meta', text:`${dn.a.name} = ${sfText(dn)}`, loc:'defined name', hints:{ definedName:true } });
  return doc;
}
function sfResolve(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  target.split('/').forEach(seg => { if (seg === '..') parts.pop(); else if (seg !== '.' && seg) parts.push(seg); });
  return parts.join('/');
}

/* ── ODS: tables, repeated cells capped, covered (merged) cells copied, numbers from office:value ── */
async function sfReadOds(z, file) {
  const doc = { file, kind:'ods', sheets:0, blocks:[], notes:[] }, x = await sfZipText(z, 'content.xml'); if (!x) sfFail('truncated');
  let cells = 0;
  for (const tb of sfAll(sfXml(x), 'table')) {
    const rows = [];
    for (const tr of sfAll(tb, 'table-row')) {
      const rep = Math.min(+tr.a['number-rows-repeated'] || 1, 1000), row = [];
      for (const tc of sfKids(tr).filter(c => c.n === 'table-cell' || c.n === 'covered-table-cell')) {
        const n = Math.min(+tc.a['number-columns-repeated'] || 1, 512), vt = tc.a['value-type'];
        let v = vt === 'percentage' ? String(+(+tc.a.value * 100).toPrecision(12)) + '%' : (vt === 'float' || vt === 'currency') ? tc.a.value : vt === 'date' ? (tc.a['date-value'] || '').slice(0, 10) : sfKids(tc, 'p').map(p => sfText(p)).join(' ');
        if (tc.n === 'covered-table-cell') v = row[row.length - 1] || '';
        for (let k = 0; k < n; k++) { row.push(sfClean(v)); if (++cells > SF_LIMIT.cells) sfFail('bomb'); }
      }
      for (let k = 0; k < rep; k++) rows.push(row.slice());
      if ((cells & 4095) === 0) sfTick();
    }
    doc.sheets++;
    doc.blocks.push({ type:'table', rows:sfTrim(rows), loc:tb.a.name || 'Sheet', hints:{ sheet:tb.a.name || 'Sheet', hidden:tb.a.display === 'false' } });
  }
  return doc;
}

/* ── DOCX: paragraphs (headings and lists marked), tables, headers, footers and footnotes; inserted text kept, deleted text dropped ── */
const SF_DOCX_SKIP = new Set(['del', 'delText', 'instrText', 'rPh', 'drawing', 'pict']);
async function sfReadDocx(z, file) {
  const doc = { file, kind:'docx', pages:0, blocks:[], notes:[] }, x = await sfZipText(z, 'word/document.xml'); if (!x) sfFail('truncated');
  const body = sfFirst(sfXml(x), 'body') || { c:[] }; let np = 0, nt = 0;
  const para = p => {
    const t = sfClean(sfText(p, SF_DOCX_SKIP)); if (!t) return;
    const ps = sfFirst(p, 'pStyle'), style = ps ? ps.a.val || '' : '', list = !!sfFirst(p, 'numPr');
    np++; doc.blocks.push({ type:/^(Heading|Title|Subtitle)/i.test(style) ? 'heading' : list ? 'list' : 'para', text:t, loc:`paragraph ${np}`, hints:{ bold:!!sfFirst(p, 'b') } });
  };
  const walk = node => {
    for (const c of sfKids(node)) {
      if (c.n === 'p') para(c);
      else if (c.n === 'tbl') {
        nt++; const rows = sfKids(c, 'tr').map(tr => { const o = []; sfKids(tr, 'tc').forEach(tc => { const span = Math.min(+((sfFirst(tc, 'gridSpan') || { a:{} }).a.val) || 1, 20); const t = sfClean(sfKids(tc, 'p').map(p => sfText(p, SF_DOCX_SKIP)).join(' ')); for (let k = 0; k < span; k++) o.push(t); }); return o; });
        doc.blocks.push({ type:'table', rows:sfTrim(rows), loc:`table ${nt}`, hints:{} });
      } else if (c.n === 'sdt' || c.n === 'sdtContent' || c.n === 'ins' || c.n === 'customXml') walk(c);
    }
  };
  walk(body);
  for (const name of [...z.entries.keys()].filter(k => /^word\/(header|footer|footnotes|endnotes)\d*\.xml$/.test(k)).sort()) {
    const t = await sfZipText(z, name), kind = /foot(?!note)|header/.test(name) ? 'furniture' : 'footnote';
    for (const p of sfAll(sfXml(t), 'p')) { const s = sfClean(sfText(p, SF_DOCX_SKIP)); if (s) doc.blocks.push({ type:'note', text:s, loc:name.replace(/^word\//, '').replace(/\.xml$/, ''), hints:{ [kind]:true } }); }
  }
  return doc;
}

/* ── ODT: headings, paragraphs, lists, tables; tracked deletions skipped ── */
async function sfReadOdt(z, file) {
  const doc = { file, kind:'odt', pages:0, blocks:[], notes:[] }, x = await sfZipText(z, 'content.xml'); if (!x) sfFail('truncated');
  const body = sfFirst(sfXml(x), 'text') || { c:[] }, skip = new Set(['tracked-changes', 'note-citation']); let n = 0, nt = 0;
  const walk = node => {
    for (const c of sfKids(node)) {
      if (skip.has(c.n)) continue;
      if (c.n === 'h' || c.n === 'p') { const t = sfClean(sfText(c, skip)); if (t) doc.blocks.push({ type:c.n === 'h' ? 'heading' : node.n === 'list-item' ? 'list' : 'para', text:t, loc:`paragraph ${++n}`, hints:{} }); }
      else if (c.n === 'table') { nt++; doc.blocks.push({ type:'table', rows:sfTrim(sfAll(c, 'table-row') ? [...sfAll(c, 'table-row')].map(r => sfKids(r).filter(k => /table-cell$/.test(k.n)).map(k => sfClean(sfText(k, skip)))) : []), loc:`table ${nt}`, hints:{} }); }
      else walk(c);
    }
  };
  walk(body);
  return doc;
}

/* ── PPTX: per slide, shapes in reading order (top to bottom, then left to right), tables, chart caches, speaker notes.
   A shape holding a big value over a short label (a KPI tile) becomes a key-value pair. ── */
async function sfReadPptx(z, file) {
  const doc = { file, kind:'pptx', slides:0, blocks:[], notes:[] };
  const relsOf = async p => { const t = await sfZipText(z, p.replace(/[^/]*$/, '_rels/') + p.split('/').pop() + '.rels'), m = new Map(); if (t) for (const r of sfAll(sfXml(t), 'Relationship')) m.set(r.a.Id, { type:r.a.Type || '', target:sfResolve(p, r.a.Target || '') }); return m; };
  const pres = await sfZipText(z, 'ppt/presentation.xml'); if (!pres) sfFail('truncated');
  const prels = await relsOf('ppt/presentation.xml');
  const order = [...sfAll(sfXml(pres), 'sldId')].map(s => (prels.get(s.a.id) || {}).target).filter(Boolean);
  for (const [si, path] of order.entries()) {
    sfTick();
    const x = await sfZipText(z, path); if (!x) continue;
    const sl = sfXml(x), rels = await relsOf(path), shapes = [], loc = `slide ${si + 1}`;
    const pos = n => { const off = sfFirst(n, 'off'); return off ? { x:+off.a.x || 0, y:+off.a.y || 0 } : { x:0, y:0 }; };
    for (const sp of sfAll(sl, 'sp')) {
      const tx = sfFirst(sp, 'txBody'); if (!tx) continue;
      const paras = sfKids(tx, 'p').map(p => sfClean(sfText(p))).filter(Boolean); if (!paras.length) continue;
      const ph = sfFirst(sp, 'ph'), sizes = [...sfAll(tx, 'rPr')].map(r => +r.a.sz || 0);
      shapes.push({ ...pos(sp), paras, title:!!ph && /title/i.test(ph.a.type || ''), big:Math.max(0, ...sizes) });
    }
    shapes.sort((a, b) => Math.abs(a.y - b.y) > 300000 ? a.y - b.y : a.x - b.x);
    const VALUE = /^[~≈]?[-+(]?[$€£]?\s?\d[\d,.  ]*\s?(%|x|[kKmMbB](n|illion)?|M€|k€|M\$)?\)?[¹²³*†]*$/;
    for (const s of shapes) {
      if (s.title) { doc.blocks.push({ type:'heading', text:s.paras.join(' '), loc, hints:{} }); continue; }
      if (s.paras.length === 2 && VALUE.test(s.paras[0]) !== VALUE.test(s.paras[1])) {
        const [v, l] = VALUE.test(s.paras[0]) ? s.paras : [s.paras[1], s.paras[0]];
        doc.blocks.push({ type:'kv', text:`${l}: ${v}`, rows:[[l, v]], loc, hints:{ tile:true } }); continue;
      }
      s.paras.forEach(t => doc.blocks.push({ type:'para', text:t, loc, hints:{ size:s.big } }));
    }
    for (const gf of sfAll(sl, 'graphicFrame')) {
      const tbl = sfFirst(gf, 'tbl');
      if (tbl) doc.blocks.push({ type:'table', rows:sfTrim(sfKids(tbl, 'tr').map(tr => sfKids(tr, 'tc').map(tc => sfClean(sfText(tc))))), loc, hints:{} });
      const ch = sfFirst(gf, 'chart'), rel = ch && rels.get(ch.a.id);
      if (rel) {
        const cx = await sfZipText(z, rel.target); if (!cx) continue;
        for (const ser of sfAll(sfXml(cx), 'ser')) {
          const name = sfClean(sfText(sfFirst(ser, 'tx') || { c:[] })), pts = el => el ? [...sfAll(el, 'pt')].map(p => sfClean(sfText(sfFirst(p, 'v') || { c:[] }))) : [];
          const cats = pts(sfFirst(ser, 'cat')), vals = pts(sfFirst(ser, 'val'));
          if (vals.length) doc.blocks.push({ type:'table', rows:[[name || 'Series', ...cats], ['', ...vals]], loc:`${loc} chart`, hints:{ chart:true } });
        }
      }
    }
    const note = [...rels.values()].find(r => /notesSlide$/.test(r.type));
    if (note) { const t = await sfZipText(z, note.target); if (t) { const s = sfClean([...sfAll(sfXml(t), 'p')].map(p => sfText(p)).join(' ')); if (s && !/^\d+$/.test(s)) doc.blocks.push({ type:'note', text:s, loc:`${loc} notes`, hints:{ speakerNotes:true } }); } }
    doc.slides++;
  }
  return doc;
}

/* ── HTML: DOMParser only (inert: scripts never run); scripts, styles and hidden elements are dropped ── */
function sfReadHtml(text, file) {
  if (typeof DOMParser === 'undefined') sfFail('unknown', 'HTML is read on the page itself');
  const d = parseDoc(String(text), 'text/html'), doc = { file, kind:'html', pages:1, blocks:[], notes:[] };
  d.querySelectorAll('script,style,noscript,template,iframe,object,embed,[hidden],[aria-hidden="true"]').forEach(e => e.remove());
  d.querySelectorAll('[style]').forEach(e => { if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(e.getAttribute('style'))) e.remove(); });
  let n = 0;
  const walk = el => {
    for (const c of el.children) {
      const tag = c.tagName.toLowerCase(), loc = `block ${++n}`;
      if (/^h[1-6]$/.test(tag)) doc.blocks.push({ type:'heading', text:sfClean(c.textContent), loc, hints:{} });
      else if (tag === 'table') doc.blocks.push({ type:'table', rows:sfTrim([...c.querySelectorAll('tr')].map(tr => [...tr.children].map(td => sfClean(td.textContent)))), loc, hints:{} });
      else if (tag === 'dl') { const dts = [...c.querySelectorAll('dt')]; dts.forEach(dt => { const dd = dt.nextElementSibling; if (dd && dd.tagName === 'DD') doc.blocks.push({ type:'kv', text:`${sfClean(dt.textContent)}: ${sfClean(dd.textContent)}`, rows:[[sfClean(dt.textContent), sfClean(dd.textContent)]], loc, hints:{} }); }); }
      else if (tag === 'li') doc.blocks.push({ type:'list', text:sfClean(c.textContent), loc, hints:{} });
      else if (tag === 'p' || (!c.children.length && sfClean(c.textContent))) { const t = sfClean(c.textContent); if (t) doc.blocks.push({ type:'para', text:t, loc, hints:{ bold:!!c.querySelector('b,strong') } }); }
      else walk(c);
    }
  };
  walk(d.body || d.documentElement);
  return doc;
}

/* ── JSON: key paths as key-value pairs ("metrics.nrr": 1.28), arrays of objects as tables; depth and size capped ── */
function sfReadJson(text, file) {
  let j; try { j = parseJSONLimited(text); } catch (e) { sfFail(e && e.limit ? 'too_deep' : 'truncated'); }
  const doc = { file, kind:'json', pages:1, blocks:[], notes:[] };
  const walk = (v, path, depth) => {
    if (depth > 32 || doc.blocks.length > 20000) return;
    if (Array.isArray(v) && v.length && v.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
      const keys = [...new Set(v.slice(0, 2000).flatMap(Object.keys))].slice(0, 60);
      doc.blocks.push({ type:'table', rows:[keys, ...v.slice(0, 2000).map(x => keys.map(k => x[k] == null || typeof x[k] === 'object' ? '' : String(x[k])))], loc:path || '$', hints:{} });
    } else if (v && typeof v === 'object') Object.keys(v).forEach(k => walk(v[k], path ? `${path}.${k}` : k, depth + 1));
    else if (v != null) doc.blocks.push({ type:'kv', text:`${path}: ${v}`, rows:[[path, String(v)]], loc:path, hints:{ json:true, raw:typeof v === 'number' ? v : null } });
  };
  walk(j, '', 0);
  return doc;
}

/* ── RTF: control words stripped, paragraphs and simple tables kept, \'hh and \uN decoded ── */
function sfReadRtf(text, file) {
  const doc = { file, kind:'rtf', pages:1, blocks:[], notes:[] }, cp = new TextDecoder('windows-1252');
  let out = '', depth = 0, skipAt = -1, uc = 1, pendSkip = 0, row = [], cell = '';
  const SKIP = /^(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|themedata|datastore|latentstyles|listtable|listoverridetable|rsidtbl|generator|xmlnstbl|mmathPr)$/;
  for (let i = 0; i < text.length; i++) {
    if ((i & 16383) === 0) sfTick();
    const ch = text[i];
    if (ch === '{') { depth++; continue; }
    if (ch === '}') { if (depth === skipAt) skipAt = -1; depth--; continue; }
    if (ch === '\\') {
      const m = /^\\([a-z]+)(-?\d+)? ?|^\\'([0-9a-f]{2})|^\\(\*)|^\\([\\{}~_-])/i.exec(text.slice(i, i + 40)); if (!m) continue;
      i += m[0].length - 1;
      if (m[4]) { if (skipAt < 0) skipAt = depth; continue; }
      if (skipAt >= 0) continue;
      if (m[3]) { if (pendSkip) { pendSkip--; continue; } cell += cp.decode(new Uint8Array([parseInt(m[3], 16)])); continue; }
      if (m[5]) { cell += m[5] === '~' ? ' ' : m[5] === '_' || m[5] === '-' ? '-' : m[5]; continue; }
      const w = m[1];
      if (SKIP.test(w)) { skipAt = depth; continue; }
      if (w === 'uc') uc = +m[2] || 0;
      else if (w === 'u') { cell += String.fromCharCode((+m[2] + 65536) % 65536); pendSkip = uc; }
      else if (w === 'par' || w === 'line') { if (row.length) { row.push(sfClean(cell)); cell = ''; } else { out += cell + '\n'; cell = ''; } }
      else if (w === 'tab') cell += '\t';
      else if (w === 'cell') { row.push(sfClean(cell)); cell = ''; }
      else if (w === 'row') { doc.blocks.push({ type:'table', rows:[row], loc:'table', hints:{} }); row = []; }
      continue;
    }
    if (skipAt >= 0 || ch === '\r' || ch === '\n') continue;
    if (pendSkip) { pendSkip--; continue; }
    cell += ch;
  }
  out += cell;
  const tableRows = doc.blocks.splice(0).map(b => b.rows[0]);
  sfTextBlocks(out, doc);
  if (tableRows.length) doc.blocks.push({ type:'table', rows:sfTrim(tableRows), loc:'table 1', hints:{} });
  return doc;
}

/* ── EML: headers, MIME parts (quoted-printable, base64, charsets); plain text preferred over HTML; attachments read too ── */
async function sfReadEml(text, file, depth) {
  const doc = { file, kind:'eml', pages:1, blocks:[], notes:[] }, parts = [];
  const split = s => { const i = s.search(/\r?\n\r?\n/); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i).replace(/^\r?\n\r?\n/, '')]; };
  const headers = h => { const o = {}; h.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach(l => { const m = /^([\w-]+):\s*(.*)$/.exec(l); if (m) o[m[1].toLowerCase()] = m[2]; }); return o; };
  const param = (v, k) => (new RegExp(k + '\\s*=\\s*"?([^";]+)"?', 'i').exec(v || '') || [])[1];
  const word = s => String(s || '').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (m, cs, e, t) => { try { const b = e.toLowerCase() === 'b' ? Uint8Array.from(atob(t), c => c.charCodeAt(0)) : Uint8Array.from(t.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (x, h) => String.fromCharCode(parseInt(h, 16))), c => c.charCodeAt(0)); return new TextDecoder(cs).decode(b); } catch (err) { return t; } });
  const body = (b, h) => {
    const te = (h['content-transfer-encoding'] || '').toLowerCase(), cs = param(h['content-type'], 'charset') || 'utf-8';
    let bytes;
    if (te === 'base64') { try { bytes = Uint8Array.from(atob(b.replace(/[^A-Za-z0-9+/=]/g, '')), c => c.charCodeAt(0)); } catch (e) { bytes = new Uint8Array(); } }
    else if (te === 'quoted-printable') bytes = Uint8Array.from(b.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (x, hh) => String.fromCharCode(parseInt(hh, 16))), c => c.charCodeAt(0) & 255);
    else bytes = Uint8Array.from(b, c => c.charCodeAt(0) & 255);
    return { bytes, text:(() => { try { return new TextDecoder(cs).decode(bytes); } catch (e) { return new TextDecoder().decode(bytes); } })() };
  };
  const walk = (raw, n) => {
    if (n > 6 || parts.length > 50) return;
    const [h0, b] = split(raw), h = headers(h0), ct = (h['content-type'] || 'text/plain').toLowerCase();
    if (n === 0) { ['subject', 'from', 'date'].forEach(k => { if (h[k]) doc.blocks.push({ type:'meta', text:`${k[0].toUpperCase() + k.slice(1)}: ${word(h[k])}`, loc:'header', hints:{ [k]:word(h[k]) } }); }); }
    if (/^multipart\//.test(ct)) { const bd = param(h['content-type'], 'boundary'); if (bd) b.split('--' + bd).slice(1).forEach(p => { if (!/^--/.test(p)) walk(p.replace(/^\r?\n/, ''), n + 1); }); return; }
    const name = param(h['content-disposition'], 'filename') || param(h['content-type'], 'name');
    parts.push({ ct, name:name && word(name), ...body(b, h) });
  };
  walk(text.replace(/^﻿/, ''), 0);
  const plain = parts.find(p => !p.name && /^text\/plain/.test(p.ct)), html = parts.find(p => !p.name && /^text\/html/.test(p.ct));
  if (plain) sfTextBlocks(plain.text, doc);
  else if (html) { try { sfReadHtml(html.text, file).blocks.forEach(b => doc.blocks.push(b)); } catch (e) { sfTextBlocks(html.text.replace(/<[^>]*>/g, ' '), doc); } }
  for (const p of parts.filter(x => x.name)) {
    if (depth >= SF_LIMIT.zipDepth) { doc.notes.push(`Attachment ${p.name} was not opened (nested too deep).`); continue; }
    const r = await sfReadBytes(p.bytes, p.name, depth + 1);
    (doc.attachments ||= []).push(r);
  }
  return doc;
}

/* ── CSV, TSV, TXT, MD and any text: tables (delimited, markdown pipes, aligned columns), headings, "Label: value" lines,
   bullets, and paragraphs (wrapped lines joined) ── */
function sfReadText(text, file, kind) {
  const doc = { file, kind, pages:1, blocks:[], notes:[] };
  if (kind === 'csv' || kind === 'tsv') {
    const src = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    src.split(/\n[ \t,;]*\n/).forEach((chunk, k) => { const rows = parseCSV(chunk).map(r => r.map(sfClean)); if (rows.length) doc.blocks.push({ type:'table', rows:sfTrim(rows), loc:k ? `table ${k + 1}` : 'line 1', hints:{ csv:true } }); });
    return doc;
  }
  sfTextBlocks(text, doc);
  return doc;
}
function sfTextBlocks(text, doc) {
  const lines = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0, para = null;
  const flush = () => { if (para) { doc.blocks.push(para); para = null; } };
  const cellsOf = l => l.trim().replace(/^\||\|$/g, '').split('|').map(sfClean);
  const aligned = l => l.trim().split(/\s{2,}|\t/).map(sfClean).filter(x => x !== '');
  while (i < lines.length) {
    if ((i & 4095) === 0) sfTick();
    const raw = lines[i], l = raw.trim(), loc = `line ${i + 1}`;
    if (!l || /^(-{3,}|\*{3,}|_{3,}|<!--.*-->)$/.test(l)) { flush(); i++; continue; }
    if (/^\|.*\|\s*$/.test(l)) {   /* markdown table */
      flush(); const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { if (!/^\s*\|?\s*:?-{2,}/.test(lines[i])) rows.push(cellsOf(lines[i])); i++; }
      doc.blocks.push({ type:'table', rows:sfTrim(rows), loc, hints:{ md:true } }); continue;
    }
    const a = aligned(raw);
    if (a.length >= 2 && !/[:=]\s/.test(l.slice(0, 60)) && /\d/.test(l)) {   /* columns aligned with spaces or tabs: a text table */
      let j = i, rows = [];
      while (j < lines.length && aligned(lines[j]).length >= 2 && Math.abs(aligned(lines[j]).length - a.length) <= 1) { rows.push(aligned(lines[j])); j++; }
      if (rows.length >= 2) { flush(); doc.blocks.push({ type:'table', rows:sfTrim(rows), loc, hints:{ aligned:true } }); i = j; continue; }
    }
    let m;
    if ((m = /^#{1,6}\s+(.*)$/.exec(l)) || (i + 1 < lines.length && /^(=+|-+)\s*$/.test(lines[i + 1].trim()) && l.length < 90) || (/^[A-Z0-9][A-Z0-9 &,'’()\/-]{3,60}$/.test(l) && /[A-Z]{3}/.test(l))) {
      flush(); doc.blocks.push({ type:'heading', text:sfClean(m ? m[1] : l).replace(/[*_]/g, ''), loc, hints:{} }); i += m || !(i + 1 < lines.length && /^(=+|-+)\s*$/.test(lines[i + 1].trim())) ? 1 : 2; continue;
    }
    const bullet = /^([-*•·▪◦]|\d{1,2}[.)])\s+/.test(l), body = l.replace(/^([-*•·▪◦]|\d{1,2}[.)])\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/<\/?(sub|sup|b|i|br)\s*\/?>/gi, '');
    if ((m = /^(.{2,90}?)\s*(?:\.{3,}|:|\s[-–]\s|\t)\s*(\S.*)$/.exec(body)) && !/^https?$/i.test(m[1]) && m[1].split(' ').length <= 12) {
      flush(); doc.blocks.push({ type:'kv', text:`${sfClean(m[1])}: ${sfClean(m[2])}`, rows:[[sfClean(m[1]), sfClean(m[2])]], loc, hints:{ bullet } }); i++; continue;
    }
    if (bullet) { flush(); doc.blocks.push({ type:'list', text:sfClean(body), loc, hints:{} }); i++; continue; }
    if (para && !/[.!?:]$/.test(para.text) && para.text.length < 400) para.text += (/\w-$/.test(para.text) && /^[a-z]/.test(body) ? '' : ' ') + sfClean(body);
    else { flush(); para = { type:/^<sub>|^[¹²³*†‡]/.test(l) ? 'note' : 'para', text:sfClean(body), loc, hints:{} }; }
    i++;
  }
  flush();
}

/* ── one entry point: bytes -> Document (or a plain reason), never an exception; zips expand into several results ── */
async function sfReadBytes(u8, name, depth) {
  depth = depth || 0;
  const res = { file:name, size:u8.length };
  try {
    if (u8.length > SF_LIMIT.file) sfFail('too_big');
    const s = await sfSniff(u8, name);
    res.kind = s.kind;
    if (SF_WHY[s.kind]) sfFail(s.kind);
    let doc;
    if (s.kind === 'xlsx' || s.kind === 'xlsm') doc = await sfReadXlsx(s.z, name, s.kind);
    else if (s.kind === 'ods') doc = await sfReadOds(s.z, name);
    else if (s.kind === 'docx') doc = await sfReadDocx(s.z, name);
    else if (s.kind === 'odt') doc = await sfReadOdt(s.z, name);
    else if (s.kind === 'pptx') doc = await sfReadPptx(s.z, name);
    else if (s.kind === 'pdf') doc = await sfReadPdf(u8, name);
    else if (s.kind === 'rtf') doc = sfReadRtf(sfLatin1(u8), name);
    else if (s.kind === 'eml') doc = await sfReadEml(sfLatin1(u8), name, depth);
    else if (s.kind === 'json') doc = sfReadJson(s.text, name);
    else if (s.kind === 'html') doc = sfReadHtml(s.text, name);
    else if (s.kind === 'zip') {
      if (depth >= SF_LIMIT.zipDepth) sfFail('bomb');
      const names = [...s.z.entries.keys()].filter(k => !/\/$/.test(k) && !/(^|\/)(__MACOSX|\.)/.test(k)).sort();
      if (names.length > 400) sfFail('bomb');
      res.children = [];
      for (const n of names) { const b = await sfZipBytes(s.z, n); res.children.push(await sfReadBytes(b, n, depth + 1)); }
      res.ok = true; return res;
    } else if (s.kind === 'odp') sfFail('unknown', 'OpenDocument presentations');
    else doc = sfReadText(s.text, name, s.kind);
    if (!doc.blocks.length && !(doc.attachments || []).length) { res.ok = false; res.code = 'empty'; res.why = SF_WHY.empty; return res; }
    res.ok = true; res.doc = doc; return res;
  } catch (e) {
    const code = e instanceof SfError ? e.code : 'truncated';
    res.ok = false; res.code = code; res.why = SF_WHY[code] || SF_WHY.unknown; if (e && e.detail) res.detail = e.detail;
    if (!(e instanceof SfError)) res.detail = String(e && e.message || e).slice(0, 160);
    return res;
  }
}
/* with the 8-second budget per file */
async function sfReadFile(u8, name) {
  _sfDeadline = sfNow() + SF_LIMIT.ms;
  try { return await sfReadBytes(u8, name, 0); } finally { _sfDeadline = Infinity; }
}
