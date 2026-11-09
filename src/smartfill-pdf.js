/* ═══════════════════════════════════════════════════════════════
   SMART FILL: PDF TEXT (in-house, no library). Objects are found by
   scanning (classic xref, xref streams and object streams all work),
   streams inflate with DecompressionStream, text comes from the page
   content operators with each font's encoding or ToUnicode map, and
   lines, columns and tables are rebuilt from positions. A font that
   cannot be decoded is reported, never guessed.
   ═══════════════════════════════════════════════════════════════ */
const SF_WINANSI = String.fromCharCode(0x20ac, 0xfffd, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0xfffd, 0x17d, 0xfffd, 0xfffd, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0xfffd, 0x17e, 0x178);
const SF_MACROMAN = String.fromCharCode(0xc4, 0xc5, 0xc7, 0xc9, 0xd1, 0xd6, 0xdc, 0xe1, 0xe0, 0xe2, 0xe4, 0xe3, 0xe5, 0xe7, 0xe9, 0xe8, 0xea, 0xeb, 0xed, 0xec, 0xee, 0xef, 0xf1, 0xf3, 0xf2, 0xf4, 0xf6, 0xf5, 0xfa, 0xf9, 0xfb, 0xfc, 0x2020, 0xb0, 0xa2, 0xa3, 0xa7, 0x2022, 0xb6, 0xdf, 0xae, 0xa9, 0x2122, 0xb4, 0xa8, 0x2260, 0xc6, 0xd8, 0x221e, 0xb1, 0x2264, 0x2265, 0xa5, 0xb5, 0x2202, 0x2211, 0x220f, 0x3c0, 0x222b, 0xaa, 0xba, 0x3a9, 0xe6, 0xf8, 0xbf, 0xa1, 0xac, 0x221a, 0x192, 0x2248, 0x2206, 0xab, 0xbb, 0x2026, 0x20, 0xc0, 0xc3, 0xd5, 0x152, 0x153, 0x2013, 0x2014, 0x201c, 0x201d, 0x2018, 0x2019, 0xf7, 0x25ca, 0xff, 0x178, 0x2044, 0x20ac, 0x2039, 0x203a, 0xfb01, 0xfb02, 0x2021, 0xb7, 0x201a, 0x201e, 0x2030, 0xc2, 0xca, 0xc1, 0xcb, 0xc8, 0xcd, 0xce, 0xcf, 0xcc, 0xd3, 0xd4, 0xf8ff, 0xd2, 0xda, 0xdb, 0xd9, 0x131, 0x2c6, 0x2dc, 0xaf, 0x2d8, 0x2d9, 0x2da, 0xb8, 0x2dd, 0x2db, 0x2c7);
const SF_GLYPH = { space:' ', exclam:'!', quotedbl:'"', numbersign:'#', dollar:'$', percent:'%', ampersand:'&', quotesingle:"'", quoteright:'’', quoteleft:'‘',
  parenleft:'(', parenright:')', asterisk:'*', plus:'+', comma:',', hyphen:'-', minus:'−', period:'.', slash:'/', zero:'0', one:'1', two:'2', three:'3', four:'4', five:'5',
  six:'6', seven:'7', eight:'8', nine:'9', colon:':', semicolon:';', less:'<', equal:'=', greater:'>', question:'?', at:'@', bracketleft:'[', backslash:'\\', bracketright:']',
  asciicircum:'^', underscore:'_', grave:'`', braceleft:'{', bar:'|', braceright:'}', asciitilde:'~', endash:String.fromCharCode(0x2013), emdash:String.fromCharCode(0x2014), bullet:'•', ellipsis:'…',
  quotedblleft:'“', quotedblright:'”', euro:'€', sterling:'£', yen:'¥', section:'§', degree:'°', dagger:'†', daggerdbl:'‡',
  fi:'fi', fl:'fl', ff:'ff', ffi:'ffi', ffl:'ffl', nbspace:' ', onesuperior:'¹', twosuperior:'²', threesuperior:'³', multiply:'×', trademark:'™',
  copyright:'©', registered:'®', germandbls:'ß', AE:'Æ', ae:'æ', OE:'Œ', oe:'œ', dotlessi:'ı', periodcentered:'·', guillemotleft:'«', guillemotright:'»' };
const SF_ACCENT = { acute:'́', grave:'̀', circumflex:'̂', dieresis:'̈', tilde:'̃', cedilla:'̧', ring:'̊', caron:'̌' };
function sfGlyph(n) {
  if (SF_GLYPH[n] != null) return SF_GLYPH[n];
  if (/^[A-Za-z]$/.test(n)) return n;
  let m;
  if ((m = /^uni([0-9A-F]{4,})$/i.exec(n)) || (m = /^u([0-9A-F]{4,6})$/i.exec(n))) return String.fromCodePoint(parseInt(m[1].slice(0, 6), 16));
  if ((m = /^([A-Za-z])(acute|grave|circumflex|dieresis|tilde|cedilla|ring|caron)$/.exec(n))) return (m[1] + SF_ACCENT[m[2]]).normalize('NFC');
  return null;
}

/* ── objects: "n g obj ... endobj" found by scanning; the last definition wins (incremental updates) ── */
function sfPdfTok(s, i) {   /* returns [value, next index]; values: number, {name}, string (latin-1), array, dict (Map), {ref}, true/false/null, {op} */
  const ws = /[\s\0]/;
  for (;;) { while (i < s.length && ws.test(s[i])) i++; if (s[i] === '%') { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; } else break; }
  const c = s[i];
  if (c === '/') { let j = i + 1; while (j < s.length && !/[\s\0\/\[\]<>(){}%]/.test(s[j])) j++; return [{ name:s.slice(i + 1, j).replace(/#([0-9a-f]{2})/gi, (x, h) => String.fromCharCode(parseInt(h, 16))) }, j]; }
  if (c === '(') {
    let j = i + 1, d = 1, o = '';
    while (j < s.length && d) {
      const ch = s[j];
      if (ch === '\\') {
        const n = s[j + 1]; j += 2;
        if (n === 'n') o += '\n'; else if (n === 'r') o += '\r'; else if (n === 't') o += '\t'; else if (n === 'b') o += '\b'; else if (n === 'f') o += '\f';
        else if (/[0-7]/.test(n)) { let k = n; while (k.length < 3 && /[0-7]/.test(s[j])) k += s[j++]; o += String.fromCharCode(parseInt(k, 8) & 255); }
        else if (n === '\r') { if (s[j] === '\n') j++; } else if (n !== '\n') o += n;
        continue;
      }
      if (ch === '(') d++; else if (ch === ')') { d--; if (!d) { j++; break; } }
      o += ch; j++;
    }
    return [{ str:o }, j];
  }
  if (c === '<' && s[i + 1] === '<') {
    const m = new Map(); i += 2;
    for (;;) { let k; [k, i] = sfPdfTok(s, i); if (!k || k.op === '>>' || i >= s.length) break; let v; [v, i] = sfPdfVal(s, i); if (k.name != null) m.set(k.name, v); }
    return [m, i];
  }
  if (c === '>' && s[i + 1] === '>') return [{ op:'>>' }, i + 2];
  if (c === '<') { const j = s.indexOf('>', i); let h = s.slice(i + 1, j < 0 ? s.length : j).replace(/[^0-9a-f]/gi, ''); if (h.length % 2) h += '0'; let o = ''; for (let k = 0; k < h.length; k += 2) o += String.fromCharCode(parseInt(h.slice(k, k + 2), 16)); return [{ str:o, hex:true }, j < 0 ? s.length : j + 1]; }
  if (c === '[') { const a = []; i++; for (;;) { let v; [v, i] = sfPdfVal(s, i); if ((v && v.op === ']') || (v == null && i >= s.length)) break; a.push(v); if (i >= s.length) break; } return [a, i]; }
  if (c === ']') return [{ op:']' }, i + 1];
  if (c === '{' || c === '}') return [{ op:c }, i + 1];
  let j = i; while (j < s.length && !/[\s\0\/\[\]<>(){}%]/.test(s[j])) j++;
  const w = s.slice(i, j); if (!w) return [null, s.length];
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) return [+w, j];
  if (w === 'true' || w === 'false') return [w === 'true', j];
  if (w === 'null') return [null, j];
  return [{ op:w }, j];
}
function sfPdfVal(s, i) {   /* a value, with "n g R" read as a reference */
  let v; [v, i] = sfPdfTok(s, i);
  if (typeof v === 'number' && Number.isInteger(v)) {
    const m = /^\s+(\d+)\s+R(?![A-Za-z])/.exec(s.slice(i, i + 20)); if (m) return [{ ref:v }, i + m[0].length];
  }
  return [v, i];
}
async function sfReadPdf(u8, file) {
  const s = sfLatin1(u8), objs = new Map(), streams = new Map(), budget = { out:0, limit:Math.min(400 * 1048576, Math.max(8 * 1048576, u8.length * 120)) };
  const re = /(\d+)\s+(\d+)\s+obj\b/g; let m;
  while ((m = re.exec(s))) {
    if ((objs.size & 1023) === 0) sfTick();
    const n = +m[1]; let [v, i] = sfPdfVal(s, re.lastIndex);
    const k = /^\s*stream\r?\n/.exec(s.slice(i, i + 12));
    if (k && v instanceof Map) {
      const start = i + k[0].length; let len = v.get('Length');
      let end = typeof len === 'number' ? start + len : -1;
      if (end < 0 || end > s.length || !/^\s*endstream/.test(s.slice(end, end + 20))) end = s.indexOf('endstream', start);
      streams.set(n, { dict:v, start, end:end < 0 ? s.length : end });
      re.lastIndex = end < 0 ? s.length : end;
    }
    objs.set(n, v);
  }
  if (!objs.size) sfFail('truncated');
  const get = v => { for (let k = 0; k < 8 && v && v.ref != null; k++) v = objs.get(v.ref); return v; };
  const name = v => (v = get(v)) && v.name;
  const decode = async (n, cap) => {
    const st = streams.get(n); if (!st) return '';
    let data = u8.subarray(st.start, st.end); const f = get(st.dict.get('Filter')), filters = (Array.isArray(f) ? f : f ? [f] : []).map(x => name(x));
    for (const fl of filters) {
      if (fl === 'FlateDecode' || fl === 'Fl') { try { data = await sfInflate(data, 'deflate', budget); } catch (e) { if (e.code === 'bomb' || e.code === 'timeout') throw e; data = await sfInflate(data, 'deflate-raw', budget); } }
      else if (fl === 'ASCIIHexDecode' || fl === 'AHx') { const h = sfLatin1(data).replace(/>.*$/s, '').replace(/[^0-9a-f]/gi, ''); data = new Uint8Array(Math.ceil(h.length / 2)); for (let k = 0; k < h.length; k += 2) data[k / 2] = parseInt((h.slice(k, k + 2) + '0').slice(0, 2), 16); }
      else if (fl === 'ASCII85Decode' || fl === 'A85') data = sfA85(sfLatin1(data));
      else return null;   /* LZW, DCT and the image filters carry no text */
      if (cap && data.length > cap) data = data.subarray(0, cap);
    }
    return sfLatin1(data);
  };
  /* object streams: objects 3 and 5 can live inside stream 6 */
  for (const [n, st] of streams) {
    if (name(st.dict.get('Type')) !== 'ObjStm') continue;
    const txt = await decode(n); if (!txt) continue;
    const first = get(st.dict.get('First')) || 0, head = txt.slice(0, first).trim().split(/\s+/).map(Number);
    for (let k = 0; k + 1 < head.length; k += 2) if (!objs.has(head[k]) || objs.get(head[k]) == null) objs.set(head[k], sfPdfVal(txt, first + head[k + 1])[0]);
  }
  /* the trailer, or the cross-reference stream that plays its part */
  let trailer = null;
  for (const t of s.matchAll(/trailer\s*<</g)) trailer = sfPdfTok(s, t.index + 7)[0];
  if (!trailer || !trailer.get) for (const [, st] of streams) if (name(st.dict.get('Type')) === 'XRef') trailer = st.dict;
  if (trailer && trailer.get && trailer.get('Encrypt') != null) sfFail('encrypted');
  let root = trailer && trailer.get && get(trailer.get('Root'));
  if (!(root instanceof Map)) for (const v of objs.values()) if (v instanceof Map && name(v.get('Type')) === 'Catalog') { root = v; break; }
  if (!(root instanceof Map)) sfFail('truncated');
  /* pages, depth first, with inherited resources */
  const pages = [], seen = new Set();
  const walk = (node, res, depth) => {
    node = get(node); if (!(node instanceof Map) || depth > 30 || pages.length >= SF_LIMIT.pdfPages) return;
    const r = node.get('Resources') != null ? get(node.get('Resources')) : res;
    if (name(node.get('Type')) === 'Pages' || node.has('Kids')) { for (const k of get(node.get('Kids')) || []) { if (k && k.ref != null) { if (seen.has(k.ref)) continue; seen.add(k.ref); } walk(k, r, depth + 1); } }
    else pages.push({ node, res:r });
  };
  walk(root.get('Pages'), null, 0);
  const totalPages = get(get(root.get('Pages')) && get(root.get('Pages')).get('Count'));
  const doc = { file, kind:'pdf', pages:pages.length, blocks:[], notes:[] };
  if (totalPages > pages.length) doc.notes.push(`Only the first ${pages.length} of ${totalPages} pages were read.`);
  const fonts = new Map();
  const fontOf = async (ref, dict) => {
    const key = ref && ref.ref != null ? ref.ref : dict; if (fonts.has(key)) return fonts.get(key);
    const f = await sfPdfFont(dict, get, name, decode); fonts.set(key, f); return f;
  };
  let glyphs = 0, unknown = 0, images = 0;
  const pageLines = [];
  for (const [pi, pg] of pages.entries()) {
    sfTick();
    const box = get(pg.node.get('MediaBox')) || [0, 0, 612, 792], H = (+box[3] || 792) - (+box[1] || 0);
    const runs = [];
    const run = async (content, res, ctm0, depth) => {
      const fontsDict = res && get(res.get('Font')), xobj = res && get(res.get('XObject'));
      let i = 0, ops = [], ctm = ctm0.slice(), stack = [], tm = [1, 0, 0, 1, 0, 0], tlm = tm.slice(), font = null, size = 0, lead = 0, cs = 0, ws = 0, th = 1, rise = 0, n = 0;
      const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
      const show = str => {
        if (!font) return;
        const m2 = mul([size * th, 0, 0, size, 0, rise], mul(tm, ctm)), fs = Math.hypot(m2[2], m2[3]) || size;
        const codes = font.codes(str); let text = '', adv = 0;
        for (const c of codes) {
          const u = font.map(c); glyphs++;
          if (u == null) unknown++; else text += u;
          const w = (font.width(c) / 1000) * size + cs + (c === 32 && codes.unit === 1 ? ws : 0);
          adv += w * th;
        }
        runs.push({ x:m2[4], y:m2[5], w:adv * Math.hypot(tm[0], tm[1]) * (Math.hypot(ctm[0], ctm[1]) || 1), text, size:fs });
        tm = mul([1, 0, 0, 1, adv, 0], tm);
      };
      while (i < content.length) {
        if ((++n & 2047) === 0) sfTick();
        let v; [v, i] = sfPdfVal(content, i); if (v === null && i >= content.length) break;
        if (!v || v.op == null) { ops.push(v); continue; }
        const o = v.op, a = ops; ops = [];
        if (o === 'BI') { const e = content.indexOf('EI', i); i = e < 0 ? content.length : e + 2; continue; }
        if (o === 'q') stack.push(ctm.slice()); else if (o === 'Q') ctm = stack.pop() || ctm;
        else if (o === 'cm' && a.length >= 6) ctm = mul(a.slice(-6), ctm);
        else if (o === 'BT') { tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice(); }
        else if (o === 'Tf') { const fr = fontsDict && fontsDict.get(a[0] && a[0].name); font = fr ? await fontOf(fr, get(fr)) : null; size = +a[1] || 0; }
        else if (o === 'Td' || o === 'TD') { if (o === 'TD') lead = -a[1]; tlm = mul([1, 0, 0, 1, +a[0] || 0, +a[1] || 0], tlm); tm = tlm.slice(); }
        else if (o === 'Tm' && a.length >= 6) { tlm = a.slice(-6).map(Number); tm = tlm.slice(); }
        else if (o === 'T*') { tlm = mul([1, 0, 0, 1, 0, -lead], tlm); tm = tlm.slice(); }
        else if (o === 'TL') lead = +a[0] || 0; else if (o === 'Tc') cs = +a[0] || 0; else if (o === 'Tw') ws = +a[0] || 0; else if (o === 'Tz') th = (+a[0] || 100) / 100; else if (o === 'Ts') rise = +a[0] || 0;
        else if (o === 'Tj' && a[0] && a[0].str != null) show(a[0].str);
        else if (o === "'" || o === '"') { if (o === '"') { ws = +a[0] || 0; cs = +a[1] || 0; } tlm = mul([1, 0, 0, 1, 0, -lead], tlm); tm = tlm.slice(); const t = a[a.length - 1]; if (t && t.str != null) show(t.str); }
        else if (o === 'TJ' && Array.isArray(a[0])) for (const e of a[0]) { if (e && e.str != null) show(e.str); else if (typeof e === 'number') { const dx = -e / 1000 * size * th; if (e < -250 && runs.length) runs[runs.length - 1].gapAfter = true; tm = mul([1, 0, 0, 1, dx, 0], tm); } }
        else if (o === 'Do' && xobj) {
          const xr = xobj.get(a[0] && a[0].name), x = get(xr), st = xr && xr.ref != null && streams.get(xr.ref);
          if (st && name(st.dict.get('Subtype')) === 'Form' && depth < 3) { const mtx = get(st.dict.get('Matrix')) || [1, 0, 0, 1, 0, 0]; const c2 = await decode(xr.ref, 8e6); if (c2) await run(c2, get(st.dict.get('Resources')) || res, mul(mtx.map(Number), ctm), depth + 1); }
          else if (st && name(st.dict.get('Subtype')) === 'Image') images++;
          else if (x instanceof Map && name(x.get('Subtype')) === 'Image') images++;
        }
      }
    };
    const cont = get(pg.node.get('Contents')), parts = Array.isArray(cont) ? cont : [pg.node.get('Contents')];
    let content = '';
    for (const c of parts) if (c && c.ref != null) content += ((await decode(c.ref, 30e6)) || '') + '\n';
    await run(content, pg.res, [1, 0, 0, 1, 0, 0], 0);
    pageLines.push({ lines:sfPdfLines(runs, H), H });
  }
  if (!glyphs) sfFail(images ? 'scanned_pdf' : 'empty', `${pages.length} page${pages.length === 1 ? '' : 's'}`);
  if (unknown > glyphs * 0.3) sfFail('undecodable_font', `${unknown} of ${glyphs} characters`);
  if (unknown) doc.notes.push(`${unknown} characters could not be decoded and were left out.`);
  /* headers and footers: a line near the top or bottom that repeats (digits ignored) on at least half of the pages */
  const edge = (l, H) => l.y > H * 0.9 || l.y < H * 0.08, key = l => l.text.replace(/\d+/g, '#');
  const count = new Map(); pageLines.forEach(p => new Set(p.lines.filter(l => edge(l, p.H)).map(key)).forEach(k => count.set(k, (count.get(k) || 0) + 1)));
  pageLines.forEach((p, pi) => {
    const keep = p.lines.filter(l => !(edge(l, p.H) && pageLines.length > 1 && count.get(key(l)) >= Math.max(2, pageLines.length / 2)));
    sfPdfBlocks(keep, doc, `p.${pi + 1}`, p.H);
  });
  return doc;
}
function sfA85(s) {
  s = s.replace(/^<~/, '').replace(/~>.*$/s, '').replace(/\s/g, ''); const out = []; let g = [];
  for (const ch of s) {
    if (ch === 'z' && !g.length) { out.push(0, 0, 0, 0); continue; }
    g.push(ch.charCodeAt(0) - 33);
    if (g.length === 5) { let v = 0; for (const d of g) v = v * 85 + d; out.push(v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255); g = []; }
  }
  if (g.length) { const n = g.length; while (g.length < 5) g.push(84); let v = 0; for (const d of g) v = v * 85 + d; out.push(...[v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255].slice(0, n - 1)); }
  return new Uint8Array(out);
}
/* a font: how to cut a string into codes, map a code to text (null when unknown), and its widths */
async function sfPdfFont(f, get, name, decode) {
  const sub = name(f.get('Subtype')), cmapRef = f.get('ToUnicode');
  let uni = null, two = sub === 'Type0';
  if (cmapRef && cmapRef.ref != null) {
    const t = await decode(cmapRef.ref, 4e6);
    if (t) {
      uni = new Map();
      for (const b of t.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) if (/<[0-9a-f]{4}>/i.test(b[1])) two = true;
      const hex = h => { let o = ''; for (let k = 0; k + 3 < h.length + 1; k += 4) o += String.fromCharCode(parseInt(h.slice(k, k + 4).padEnd(4, '0'), 16)); return h.length <= 2 ? String.fromCharCode(parseInt(h, 16)) : o; };
      for (const b of t.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const p of b[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]*)>/gi)) uni.set(parseInt(p[1], 16), hex(p[2]));
      for (const b of t.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) for (const p of b[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<([0-9a-f]*)>|\[([^\]]*)\])/gi)) {
        const lo = parseInt(p[1], 16), hi = Math.min(parseInt(p[2], 16), lo + 65535);
        if (p[4] != null) { const base = hex(p[4]); for (let c = lo; c <= hi; c++) uni.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + c - lo)); }
        else [...p[5].matchAll(/<([0-9a-f]*)>/gi)].forEach((x, k) => { if (lo + k <= hi) uni.set(lo + k, hex(x[1])); });
      }
    }
  }
  let enc = null, diff = {};
  const e = get(f.get('Encoding')), base = name(e instanceof Map ? e.get('BaseEncoding') : e);
  if (e instanceof Map) { let c = 0; for (const d of get(e.get('Differences')) || []) { if (typeof d === 'number') c = d; else if (d && d.name) diff[c++] = d.name; } }
  enc = base === 'MacRomanEncoding' ? 'mac' : 'win';
  const widths = get(f.get('Widths')) || [], first = +get(f.get('FirstChar')) || 0, cidW = new Map();
  let dw = 1000;
  if (two) {
    const desc = get((get(f.get('DescendantFonts')) || [])[0]);
    if (desc instanceof Map) { dw = +get(desc.get('DW')) || 1000; const W = get(desc.get('W')) || []; for (let k = 0; k < W.length;) { const c0 = W[k]; if (Array.isArray(get(W[k + 1]))) { get(W[k + 1]).forEach((w, j) => cidW.set(c0 + j, +w)); k += 2; } else { for (let c = c0; c <= Math.min(W[k + 1], c0 + 65535); c++) cidW.set(c, +W[k + 2]); k += 3; } } }
  }
  const type3 = sub === 'Type3';
  return {
    codes:str => { const out = []; if (two) { for (let k = 0; k + 1 < str.length; k += 2) out.push(str.charCodeAt(k) * 256 + str.charCodeAt(k + 1)); out.unit = 2; } else { for (const ch of str) out.push(ch.charCodeAt(0)); out.unit = 1; } return out; },
    map:c => {
      if (uni) { const u = uni.get(c); if (u != null) return u; }
      if (two || type3) return null;   /* CID or Type3 glyphs without a ToUnicode map cannot be decoded honestly */
      if (diff[c] != null) return sfGlyph(diff[c]);
      if (c < 32) return null;
      if (enc === 'mac' && c >= 128) return SF_MACROMAN[c - 128];
      if (c >= 128 && c < 160) { const u = SF_WINANSI[c - 128]; return u === '�' ? null : u; }
      return String.fromCharCode(c === 160 ? 32 : c);
    },
    width:c => two ? (cidW.get(c) != null ? cidW.get(c) : dw) : (widths[c - first] != null ? +get(widths[c - first]) || 500 : 500),
  };
}
/* runs to lines: same baseline within 40% of the font size; inside a line a gap of more than 1.2 em starts a new cell */
function sfPdfLines(runs, H) {
  runs = runs.filter(r => r.text.trim());
  runs.sort((a, b) => Math.abs(b.y - a.y) > Math.min(a.size, b.size) * 0.4 ? b.y - a.y : a.x - b.x);
  const lines = [];
  for (const r of runs) {
    const l = lines[lines.length - 1];
    if (l && Math.abs(l.y - r.y) <= Math.min(l.size, r.size) * 0.4) l.runs.push(r); else lines.push({ y:r.y, size:r.size, runs:[r] });
  }
  return lines.map(l => {
    l.runs.sort((a, b) => a.x - b.x);
    const cells = [{ x:l.runs[0].x, end:l.runs[0].x, text:'' }]; let end = l.runs[0].x;
    l.runs.forEach((r, k) => {
      const gap = r.x - end, em = r.size || 10;
      if (k && gap > em * 1.2) cells.push({ x:r.x, end:r.x, text:r.text.replace(/^\s+/, '') });
      else cells[cells.length - 1].text += (k && gap > em * 0.18 && !/\s$/.test(cells[cells.length - 1].text) && !/^\s/.test(r.text) ? ' ' : '') + r.text;
      end = Math.max(end, r.x + r.w); cells[cells.length - 1].end = end;
    });
    cells.forEach(c => { c.text = sfClean(c.text); });
    return { y:l.y, size:l.size, cells:cells.filter(c => c.text), text:sfClean(cells.map(c => c.text).join('  ')) };
  }).filter(l => l.text);
}
/* lines to blocks: two or more cells on two or more consecutive lines make a table; big text is a heading; other lines join into paragraphs */
function sfPdfBlocks(lines, doc, loc, H) {
  const body = lines.map(l => l.size).sort((a, b) => a - b)[Math.floor(lines.length / 2)] || 10;
  let i = 0, para = null;
  const flush = () => { if (para) { doc.blocks.push(para); para = null; } };
  while (i < lines.length) {
    const l = lines[i];
    if (l.cells.length >= 2) {
      let j = i; while (j < lines.length && lines[j].cells.length >= 2) j++;
      flush();
      if (j - i >= 2 || l.cells.length >= 3) doc.blocks.push({ type:'table', rows:sfTrim(sfPdfGrid(lines.slice(i, j))), loc, hints:{ pdf:true, edge:l.y > H * 0.9 || l.y < H * 0.08 } });
      else doc.blocks.push({ type:'kv', text:`${l.cells[0].text}: ${l.cells.slice(1).map(c => c.text).join(' ')}`, rows:[l.cells.map(c => c.text)], loc, hints:{ pdf:true } });
      i = j; continue;
    }
    if (l.size > body * 1.25 && l.text.length < 120) { flush(); doc.blocks.push({ type:'heading', text:l.text, loc, hints:{ size:l.size } }); i++; continue; }
    const gapAbove = i ? lines[i - 1].y - l.y : 0;
    if (para && gapAbove < l.size * 1.9 && !/[.!?:]$/.test(para.text) && para.text.length < 600) para.text += (/\w-$/.test(para.text) && /^[a-z]/.test(l.text) ? '' : ' ') + l.text;
    else { flush(); para = { type:/^[¹²³*†‡]/.test(l.text) ? 'note' : 'para', text:l.text, loc, hints:{ edge:l.y > H * 0.9 || l.y < H * 0.08 } }; }
    i++;
  }
  flush();
}

/* table rows to a grid: the columns are those of the row with the most cells; every cell goes to the column it overlaps most,
   or else the one whose left edge (text) or right edge (numbers, which are right-aligned) is nearest */
function sfPdfGrid(lines) {
  const ref = lines.reduce((a, b) => b.cells.length > a.cells.length ? b : a), cols = ref.cells.map(c => ({ x:c.x, end:c.end }));
  return lines.map(l => {
    const row = cols.map(() => '');
    l.cells.forEach(c => {
      let best = 0, score = -Infinity;
      cols.forEach((a, k) => {
        const ov = Math.min(c.end, a.end) - Math.max(c.x, a.x), num = /^[-($€£]*\d/.test(c.text);
        const sc = ov > 0 ? ov : -(num ? Math.abs(c.end - a.end) : Math.abs(c.x - a.x));
        if (sc > score) { score = sc; best = k; }
      });
      row[best] = row[best] ? row[best] + ' ' + c.text : c.text;
    });
    return row;
  });
}
