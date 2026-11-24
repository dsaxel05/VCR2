/* ═══════════════════════════════════════════════════════════════
   OCR for image-only decks (Deal flow only). The pictures inside a scanned PDF, an image-only PowerPoint or an image file are
   read by tesseract.js in a background thread (vendor/ocr/, self-hosted, loaded only when needed). The text then goes through
   the same rule-based reading as any other document; every value keeps "OCR" in its place so a reviewer knows to check it.
   ═══════════════════════════════════════════════════════════════ */
let _wsOcr = null, _wsOcrN = 0;
const WS_OCR_URL = () => new URL('vendor/ocr/vcr2-ocr.js', location.href).href;
function wsOcrWorker() {
  if (_wsOcr) return _wsOcr;
  const u = WS_OCR_URL();
  const w = new Worker(TT ? TT.createScriptURL(u) : u), wait = new Map();
  w.onmessage = e => { const d = e.data || {}, p = wait.get(d.id); if (p) { wait.delete(d.id); p(d); } };
  w.onerror = () => { for (const p of wait.values()) p({ ok:false, why:'the OCR files could not be loaded on this site' }); wait.clear(); _wsOcr = null; };
  _wsOcr = { ask:bytes => new Promise(ok => { const id = ++_wsOcrN; wait.set(id, ok); w.postMessage({ id, bytes }, [bytes.buffer]); }), w };
  return _wsOcr;
}
/* the pictures inside a PDF: JPEG streams as they are, 8-bit RGB or grey Flate streams redrawn as PNG */
async function wsPdfImages(u8) {
  const s = new TextDecoder('latin1').decode(u8), out = [];
  const re = /\/Subtype\s*\/Image/g; let m;
  while ((m = re.exec(s)) && out.length < 60) {
    const dictStart = s.lastIndexOf('<<', m.index), so = s.indexOf('stream', m.index); if (dictStart < 0 || so < 0) continue;
    const dict = s.slice(dictStart, so);
    const w = +((/\/Width\s+(\d+)/.exec(dict) || [])[1] || 0), h = +((/\/Height\s+(\d+)/.exec(dict) || [])[1] || 0);
    if (w < 200 || h < 120) continue;   /* logos and icons carry no figures */
    let start = so + 6; if (s[start] === '\r') start++; if (s[start] === '\n') start++;
    const lenM = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict), end = lenM ? start + +lenM[1] : s.indexOf('endstream', start);
    if (end <= start) continue;
    const raw = u8.slice(start, end);
    if (/\/DCTDecode/.test(dict)) out.push({ bytes:raw, kind:'jpeg' });
    else if (/\/FlateDecode/.test(dict) && /\/BitsPerComponent\s+8/.test(dict) && /\/DeviceRGB|\/DeviceGray/.test(dict) && typeof OffscreenCanvas !== 'undefined') {
      try {
        const px = await sfInflate(raw, 'deflate', 80e6), gray = /\/DeviceGray/.test(dict), img = new ImageData(w, h), d = img.data;
        for (let i = 0, j = 0; i < w * h; i++) { const r = px[j], g = gray ? r : px[j + 1], b = gray ? r : px[j + 2]; j += gray ? 1 : 3; d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
        const c = new OffscreenCanvas(w, h); c.getContext('2d').putImageData(img, 0, 0);
        out.push({ bytes:new Uint8Array(await (await c.convertToBlob({ type:'image/png' })).arrayBuffer()), kind:'png' });
      } catch (e) {}
    }
  }
  return out;
}
/* the pictures of a PowerPoint, slide by slide */
async function wsPptxImages(u8) {
  const z = sfZip(u8), out = [], pres = await sfZipText(z, 'ppt/presentation.xml'); if (!pres) return out;
  const rels = await sfZipText(z, 'ppt/_rels/presentation.xml.rels'), rm = new Map();
  if (rels) for (const r of sfAll(sfXml(rels), 'Relationship')) rm.set(r.a.Id, 'ppt/' + String(r.a.Target || '').replace(/^\/?ppt\//, ''));
  const slides = [...sfAll(sfXml(pres), 'sldId')].map(x => rm.get(x.a.id)).filter(Boolean);
  for (const [i, p] of slides.entries()) {
    const sr = await sfZipText(z, p.replace(/[^/]*$/, '_rels/') + p.split('/').pop() + '.rels'); if (!sr) continue;
    for (const r of sfAll(sfXml(sr), 'Relationship')) {
      if (!/\/image$/.test(r.a.Type || '')) continue;
      const path = sfResolve(p, r.a.Target || ''); if (!/\.(png|jpe?g)$/i.test(path)) continue;
      const b = await sfZipBytes(z, path); if (b && b.length > 20000) out.push({ bytes:b, kind:'img', slide:i + 1 });
      if (out.length >= 60) return out;
    }
  }
  return out;
}
async function wsOcrFile(bytes, name) {
  if (typeof Worker === 'undefined') return { ok:false, why:'OCR needs a browser' };
  const head = bytes.subarray(0, 8), isPdf = head[0] === 0x25 && head[1] === 0x50, isZip = head[0] === 0x50 && head[1] === 0x4b;
  const isImg = (head[0] === 0x89 && head[1] === 0x50) || (head[0] === 0xff && head[1] === 0xd8);
  let imgs = [];
  if (isPdf) imgs = await wsPdfImages(bytes);
  else if (isZip) imgs = await wsPptxImages(bytes).catch(() => []);
  else if (isImg) imgs = [{ bytes:bytes.slice(), kind:'img' }];
  if (!imgs.length) return { ok:false, why:'no picture VCR2 can read was found inside (an unusual scan format)' };
  const doc = { file:name, kind:'ocr', pages:imgs.length, blocks:[], notes:['Read with OCR: check every figure against the original.'] };
  let conf = 0;
  for (const [i, im] of imgs.entries()) {
    const r = await wsOcrWorker().ask(im.bytes.slice());
    if (!r.ok) return { ok:false, why:'OCR failed: ' + r.why };
    conf += r.conf;
    const d = sfReadText(r.text, name, 'txt');
    d.blocks.forEach(b => { b.loc = `${im.slide ? 'slide ' + im.slide : 'page ' + (i + 1)} (OCR)`; doc.blocks.push(b); });
  }
  doc.ocrConfidence = Math.round(conf / imgs.length);
  return { ok:true, doc };
}
