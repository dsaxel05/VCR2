/* VCR2 OCR thread (Deal flow, image-only decks). Runs tesseract.js 5.1.1 (Apache-2.0, files in this folder, unchanged from npm)
   entirely in the browser: images come in, text and its confidence go out. Nothing is fetched from anywhere but this folder. */
/* global Tesseract */
importScripts('tesseract.min.js');
let worker = null;
async function ready() {
  if (worker) return worker;
  const base = self.location.href.replace(/[^/]*$/, '');
  worker = await Tesseract.createWorker('eng', 1, { workerPath:base + 'worker.min.js', corePath:base, langPath:base, workerBlobURL:false, gzip:true, cacheMethod:'none' });
  return worker;
}
self.onmessage = async e => {
  const { id, bytes } = e.data || {};
  try {
    const w = await ready();
    const r = await w.recognize(new Blob([bytes]));
    self.postMessage({ id, ok:true, text:String(r.data.text || ''), conf:Math.round(r.data.confidence || 0) });
  } catch (err) {
    self.postMessage({ id, ok:false, why:String(err && err.message || err).slice(0, 200) });
  }
};
