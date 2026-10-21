
/* ═══════════════════════════════════════════════════════════════
   WHERE THE SIMULATION RUNS
   The Monte Carlo simulation is a pure function of its inputs and its seed, so it can run on a background thread and give
   exactly the same numbers. In the browser the report is drawn first and the simulation fills in when the worker answers;
   headless callers (Radar.assess, the tests, the Studio's impact preview) get the answer synchronously. Results are cached.
   ═══════════════════════════════════════════════════════════════ */
const SIM_CACHE = new Map();
let SIM_ASYNC = false, _simWorker = null, _simSeq = 0, _simBroken = false;
const _simJobs = new Map();
const NL = String.fromCharCode(10);
function simWorkerSource() {
  return [mulberry32, seedFrom, gauss, quantile, histogram, simulate].map(f => f.toString()).join(NL) + NL
    + 'self.onmessage = e => { const m = e.data; let r = null, err = null; try { r = simulate(m.P, m.seed); } catch (x) { err = String((x && x.message) || x); } self.postMessage({ id:m.id, r, err }); };';
}
const _simWaiters = new Map();
function simFinish(job, res) {
  SIM_CACHE.set(job.key, res);
  if (SIM_CACHE.size > 12) SIM_CACHE.delete(SIM_CACHE.keys().next().value);
  const w = _simWaiters.get(job.key); if (w) { _simWaiters.delete(job.key); w.forEach(f => f()); }
  simReady();
}
/* Resolves when the answer for this key is in the cache (at once if it already is). */
function simWait(key) {
  if (SIM_CACHE.has(key)) return Promise.resolve();
  return new Promise(r => { const w = _simWaiters.get(key); if (w) w.push(r); else _simWaiters.set(key, [r]); });
}
/* A worker that has not answered after ten seconds is not waited for: the simulation runs here, and the answer is the same. */
function simGuard(key) {
  const e = Array.from(_simJobs.entries()).find(x => x[1].key === key); if (!e) return;
  _simJobs.delete(e[0]); simFinish(e[1], simulate(e[1].P, e[1].seed));
}
function simWorker() {
  if (_simWorker || _simBroken) return _simWorker;
  try {
    _simWorker = new Worker(URL.createObjectURL(new Blob([simWorkerSource()], { type:'text/javascript' })));
    _simWorker.onmessage = e => {
      const job = _simJobs.get(e.data.id); if (!job) return;
      _simJobs.delete(e.data.id);
      /* A failure inside the worker is retried here, so the answer is never lost. */
      simFinish(job, e.data.err ? simulate(job.P, job.seed) : e.data.r);
    };
    _simWorker.onerror = () => {
      _simBroken = true; try { _simWorker.terminate(); } catch (x) {} _simWorker = null;
      const jobs = Array.from(_simJobs.values()); _simJobs.clear();
      jobs.forEach(j => simFinish(j, simulate(j.P, j.seed)));
    };
  } catch (e) { _simBroken = true; _simWorker = null; }
  return _simWorker;
}
function simulateCached(P, seed) {
  /* The cache key also carries the numbers the simulation reads, so a changed input can never be answered from the cache. */
  const key = seed + '||' + [P.rev0, P.exp0, P.cash0, P.g, P.eg, P.sd, P.milestone].join(',');
  if (SIM_CACHE.has(key)) return { sim:SIM_CACHE.get(key), pending:false, key };
  const valid = [P.rev0, P.exp0, P.cash0, P.g, P.sd].every(x => x != null && isFinite(x)) && P.rev0 > 0 && P.exp0 > 0;
  if (valid && SIM_ASYNC && typeof Worker === 'function' && typeof Blob === 'function' && typeof URL !== 'undefined' && URL.createObjectURL) {
    const w = simWorker();
    if (w) {
      if (!Array.from(_simJobs.values()).some(j => j.key === key)) { const id = ++_simSeq; _simJobs.set(id, { key, seed, P }); w.postMessage({ id, P, seed }); setTimeout(() => simGuard(key), 10000); }
      return { sim:null, pending:true, key };
    }
  }
  const sim = simulate(P, seed);
  if (SIM_CACHE.size > 12) SIM_CACHE.delete(SIM_CACHE.keys().next().value);
  SIM_CACHE.set(key, sim);
  return { sim, pending:false, key };
}
/* An interactive assessment: the simulation may run in the background; a finished one redraws the report. */
function assessUI() {
  SIM_ASYNC = true;
  try { return assessAll(); } finally { SIM_ASYNC = false; }
}
/* If the stored report is still waiting for a simulation that has since arrived, swap the answer in (and redraw when the report is on screen).
   Called when an answer arrives and again whenever a report is stored, so an answer that came first is never lost. */
function simRefresh(silent) {
  try {
    const R = typeof S !== 'undefined' && S && S.result;
    if (!R || !R.proj || !R.proj.simPending || !SIM_CACHE.has(R.proj.simKey)) return false;
    S.result = Object.assign(assessAll(), { memo:R.memo });
    const page = $id('page-result');
    if (!silent && page && page.classList.contains('active')) renderResult(S.result);
    return true;
  } catch (e) { return false; /* the report stays as drawn; a reload recomputes */ }
}
function simReady() { simRefresh(false); }
