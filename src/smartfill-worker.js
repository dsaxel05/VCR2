/* ═══════════════════════════════════════════════════════════════
   SMART FILL: WHERE THE READING RUNS
   Reading and extracting run in a background thread, so a big file never freezes the page. The thread is built from
   this page's own code (the part between the 'SFW{' and '}SFW' markers that build.py places around the reader and the
   engine), from a Blob URL as the policy allows (worker-src blob:). It gets the field catalogue and the owner's
   settings as plain data, so its results are the same as the page's. Document text stays in the thread: the page
   receives only the file summary, the proposals and the unmatched numbers. "Forget documents" stops the thread,
   which drops everything it read. HTML needs the page's own parser and is read on the page; if the thread cannot
   start or fails, every file is read on the page, with the same results.
   ═══════════════════════════════════════════════════════════════ */
let _sfW = null, _sfWBroken = false, _sfWSeq = 0, _sfWId = 0, _sfWCtx = null;
const _sfWJobs = new Map();
const SF_W_WAIT = 60000;   /* a thread that has not answered in a minute is stopped; the file is reported as too slow */

/* the worker's code: the two parsers the readers share with the rest of the app (util.js), the marked part of the
   page's script, then the message handler below */
function sfWorkerSource(text) {
  const a = "'SFW" + "{'", b = "'}SFW" + "'", i = String(text || '').indexOf(a), j = i < 0 ? -1 : text.indexOf(b, i);
  if (i < 0 || j < 0) return null;
  return [parseCSV, parseJSONLimited].map(f => f.toString()).join('\n') + '\n'
    + text.slice(text.indexOf(';', i) + 1, text.lastIndexOf('void', j)) + '\n;(' + sfWorkerMain.toString() + ')();';
}
/* runs inside the thread only */
function sfWorkerMain() {
  const docs = new Map();
  let fields = [], taught = {};
  self.ALL_FIELDS = () => fields;
  self.labelOf = f => f.lab;
  self.localStorage = { getItem:k => k === 'vcr2-sf-aliases' ? JSON.stringify(taught) : null };
  const lite = r => {
    const o = { file:r.file, size:r.size, kind:r.kind, ok:r.ok, code:r.code, why:r.why, detail:r.detail };
    if (r.doc) o.doc = { file:r.doc.file, kind:r.doc.kind, pages:r.doc.pages, sheets:r.doc.sheets, slides:r.doc.slides, notes:r.doc.notes };
    if (r.children) o.children = r.children.map(lite);
    return o;
  };
  const answer = (res, m) => {
    let extract = null, children = null, unmapped = [];
    if (res.ok && res.children) children = res.children.filter(c => c.ok && c.doc).map(c => sfExtract(c, { model:m.model }));
    else if (res.ok) { extract = sfExtract(res, { model:m.model, as:m.as || null }); unmapped = sfUnmappedDoc(res, extract, sfFields(m.model)); }
    return { res:lite(res), extract, children, unmapped };
  };
  self.onmessage = async e => {
    const m = e.data; let out = {};
    try {
      if (m.op === 'ctx') { self.CFG = m.ctx.cfg; fields = m.ctx.fields; taught = m.ctx.taught; _sfDict = null; _sfNA = null; }
      else if (m.op === 'drop') docs.delete(m.id);
      else if (m.op === 'read') {
        _sfNeedsPage = false;
        const res = await sfReadFile(m.u8, m.name);
        if (_sfNeedsPage) { docs.delete(m.id); out = { page:true }; } else { docs.set(m.id, res); out = answer(res, m); }
      } else if (m.op === 'extract') { const res = docs.get(m.id); out = res ? answer(res, m) : { page:true }; }
    } catch (x) { out = { err:String((x && x.message) || x).slice(0, 160) }; }
    self.postMessage(Object.assign({ seq:m.seq }, out));
  };
}
function sfWorker() {
  if (_sfW || _sfWBroken) return _sfW;
  try {
    if (typeof Worker !== 'function' || typeof document === 'undefined' || !document.scripts) { _sfWBroken = true; return null; }
    const text = Array.from(document.scripts).map(s => s.textContent || '').find(t => t.includes("'SFW" + "{'"));
    const src = text && sfWorkerSource(text);
    if (!src) { _sfWBroken = true; return null; }
    _sfW = startWorker(src);
    _sfW.onmessage = e => { const job = _sfWJobs.get(e.data && e.data.seq); if (job) { _sfWJobs.delete(e.data.seq); clearTimeout(job.t); job.done(e.data); } };
    _sfW.onerror = ev => { if (ev && ev.preventDefault) ev.preventDefault(); sfWorkerStop(true); };
    if (_sfWCtx) _sfW.postMessage({ op:'ctx', ctx:_sfWCtx });   /* a restarted thread gets the settings again */
  } catch (e) { _sfWBroken = true; _sfW = null; }
  return _sfW;
}
/* stop the thread (it forgets every document); open jobs answer with an error so their files are read on the page */
function sfWorkerStop(broken) {
  if (broken) _sfWBroken = true;
  if (_sfW) { try { _sfW.terminate(); } catch (e) {} _sfW = null; }
  const jobs = Array.from(_sfWJobs.values()); _sfWJobs.clear();
  jobs.forEach(j => { clearTimeout(j.t); j.done({ err:'stopped' }); });
}
function sfWorkerAsk(msg) {
  const w = sfWorker(); if (!w) return Promise.resolve({ err:'no thread' });
  return new Promise(done => {
    const seq = ++_sfWSeq, job = { done };
    job.t = setTimeout(() => { if (_sfWJobs.get(seq) === job) { _sfWJobs.delete(seq); sfWorkerStop(false); done({ err:'timeout' }); } }, SF_W_WAIT);
    _sfWJobs.set(seq, job);
    try { w.postMessage(Object.assign({ seq }, msg)); } catch (e) { _sfWJobs.delete(seq); clearTimeout(job.t); done({ err:'post' }); }
  });
}
/* the field catalogue (S10) and the owner's Smart fill settings, as plain data */
function sfWorkerContext() {
  if (!sfWorker()) return Promise.resolve();
  const ctx = sfWorkerCtxData(); _sfWCtx = ctx;
  return sfWorkerAsk({ op:'ctx', ctx });
}
function sfWorkerCtxData() {
  let taught = {}; try { const a = JSON.parse(localStorage.getItem('vcr2-sf-aliases') || '{}'); if (a && typeof a === 'object' && !Array.isArray(a)) taught = a; } catch (e) {}
  const own = (typeof CFG !== 'undefined' && CFG) || {};
  return JSON.parse(JSON.stringify({
    cfg:{ settings:{ smartfill:(own.settings && own.settings.smartfill) || {} }, hidden:{ inputs:(own.hidden && own.hidden.inputs) || [] } },
    fields:ALL_FIELDS().map(f => ({ id:f.id, t:f.t, unit:f.unit, options:f.options, models:f.models, lbl:f.lbl, lab:typeof labelOf === 'function' ? labelOf(f) : f.lbl })),
    taught
  }));
}
/* one file in the thread; false when it must be read on the page */
async function sfReadInWorker(f, u8) {
  if (!sfWorker()) return false;
  f.wid = f.wid || ++_sfWId;
  const r = await sfWorkerAsk({ op:'read', id:f.wid, u8, name:f.name.split('/').pop(), model:S.model, as:f.as || null });
  if (r.err === 'timeout') {
    f.inWorker = false; f.extract = null; f.children = null; f.unmapped = [];
    f.res = { file:f.name.split('/').pop(), size:u8.length, ok:false, code:'timeout', why:SF_WHY.timeout };
    return true;
  }
  if (r.err || r.page) return false;
  f.inWorker = true; f.res = r.res; f.extract = r.extract; f.children = r.children; f.unmapped = r.unmapped || [];
  return true;
}
