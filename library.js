
/* ═══════════════════════════════════════════════════════════════
   LIBRARY — your own deal data, in your browser
   Every assessment can be saved here. Comparables can be imported from
   CSV, or pasted in any shape and structured by a model you choose.
   The library then (1) ranks each new company against your own deals and
   (2) can recalibrate the rubric thresholds on your data.
   ═══════════════════════════════════════════════════════════════ */
const LIB_KEY = 'vcr2-library', CAL_KEY = 'vcr2-calibrate';
const LIB_METRICS = [
  { key:'arr',           label:'ARR',                  unit:'$',  dir:'hi', syn:['arr','annual recurring revenue','run rate','revenue run-rate'] },
  { key:'growth_yoy',    label:'Growth YoY',           unit:'%',  dir:'hi', syn:['growth','yoy growth','growth yoy','arr growth','growth rate','yoy'] },
  { key:'nrr',           label:'NRR',                  unit:'%',  dir:'hi', syn:['nrr','net revenue retention','ndr','net dollar retention','net retention'] },
  { key:'grr',           label:'GRR',                  unit:'%',  dir:'hi', syn:['grr','gross revenue retention','gross retention','gdr'] },
  { key:'gross_margin',  label:'Gross margin',         unit:'%',  dir:'hi', syn:['gross margin','gm','gross margin %'] },
  { key:'burn_multiple', label:'Burn multiple',        unit:'',   dir:'lo', syn:['burn multiple','burn mult'] },
  { key:'cac_payback',   label:'CAC payback',          unit:'mo', dir:'lo', syn:['cac payback','payback','payback months','cac payback months'] },
  { key:'ltv_cac',       label:'LTV:CAC',              unit:'x',  dir:'hi', syn:['ltv:cac','ltv/cac','ltv cac','ltv to cac'] },
  { key:'magic_number',  label:'Magic number',         unit:'',   dir:'hi', syn:['magic number','sales efficiency'] },
  { key:'runway',        label:'Runway',               unit:'mo', dir:'hi', syn:['runway','runway months'] },
  { key:'rule40',        label:'Rule of 40',           unit:'',   dir:'hi', syn:['rule of 40','rule40','r40'] },
  { key:'arr_per_fte',   label:'ARR per employee',     unit:'$',  dir:'hi', syn:['arr per employee','arr per fte','arr/fte','revenue per employee'] },
  { key:'top5_conc',     label:'Top-5 concentration',  unit:'%',  dir:'lo', syn:['top 5 concentration','top5','top 5','top five share'] },
  { key:'logo_ret',      label:'Logo retention',       unit:'%',  dir:'hi', syn:['logo retention','customer retention','logo ret'] },
  { key:'quick_ratio',   label:'Quick ratio',          unit:'x',  dir:'hi', syn:['quick ratio','saas quick ratio'] },
  { key:'hype_ratio',    label:'Raised per $ of ARR',  unit:'x',  dir:'lo', syn:['hype ratio','capital raised per arr','raised/arr'] },
  { key:'score',         label:'Radar score',          unit:'',   dir:'hi', syn:['score','radar score'] },
];
const OUTCOMES = ['', 'Tracking', 'Passed', 'Term sheet', 'Invested', 'Portfolio', 'Exited', 'Written off'];

function libLoad() { try { return JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); } catch (e) { return []; } }
function libSave(list) {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(list)); _calCache = null; return true; }
  catch (e) {
    /* Too big: drop stored ledgers from the oldest entries and retry. */
    try {
      list.forEach(x => { if (x.payload) x.payload.ledger = null; });
      localStorage.setItem(LIB_KEY, JSON.stringify(list)); _calCache = null;
      toast('Library is near the browser storage limit. Customer ledgers were dropped from saved runs; export a JSON backup.', 'err');
      return true;
    } catch (e2) { toast('Browser storage is full. Export the library and remove old entries.', 'err'); return false; }
  }
}
const stageFromText = t => {
  const s = String(t || '').toLowerCase();
  if (/pre[\s-]?seed|angel/.test(s)) return 'preseed';
  if (/seed/.test(s)) return 'seed';
  if (/series\s*a\b|^a$/.test(s)) return 'a';
  if (/series\s*[b-z]|growth|^[b-z]$|b\+/.test(s)) return 'b';
  return null;
};
const modelFromText = t => {
  const s = String(t || '').toLowerCase();
  if (/market/.test(s)) return 'marketplace';
  if (/fin/.test(s)) return 'fintech';
  if (/\bai\b|llm|genai|machine/.test(s)) return 'ai_app';
  if (/saas|software|b2b/.test(s)) return 'saas';
  return null;
};
/* Infer the stage from ARR when the source does not give one. */
const stageFromArr = arr => arr == null ? null : arr < 250000 ? 'preseed' : arr < 2e6 ? 'seed' : arr < 1e7 ? 'a' : 'b';

function libEntryFromResult(R) {
  const m = {};
  LIB_METRICS.forEach(x => { if (x.key === 'arr') m.arr = gv('arr_now'); else if (x.key === 'score') m.score = R.sc.overall; else if (R.D[x.key] != null) m[x.key] = R.D[x.key]; });
  Object.keys(m).forEach(k => { if (m[k] == null || !isFinite(m[k])) delete m[k]; else m[k] = Math.round(m[k] * 100) / 100; });
  const stated = {};
  Object.keys(S.vals).filter(k => k.startsWith('stated_')).forEach(k => stated[k] = gv(k));
  let payload = draftPayload();
  if (JSON.stringify(payload).length > 900000) payload = Object.assign({}, payload, { ledger:null });
  return {
    id:'r' + R.hash + '-' + Date.now().toString(36), company:S.name, stage:S.stage, model:S.model, date:R.at.slice(0, 10), asof:S.asof || '',
    source:'assessment', metrics:m, stated, hash:R.hash, rubric:R.sc.rubric, blocked:R.sc.gates.length > 0,
    majors:R.checks.filter(c => c.sev === 'major').length, outcome:'', payload,
  };
}
function saveRunToLibrary() {
  const R = S.result; if (!R) return;
  const list = libLoad();
  if (list.some(x => x.hash === R.hash && x.company === S.name)) { toast('This exact run is already in the library.'); return; }
  list.push(libEntryFromResult(R));
  if (libSave(list)) { toast(`Saved to your library (${list.length} entr${list.length === 1 ? 'y' : 'ies'}).`); renderResult(S.result); }
}

/* Ratios quoted as multiples (1.15) become percentages (115); everything rounds to 2 decimals. */
function normalizeLibMetrics(m) {
  ['nrr','grr','logo_ret'].forEach(k => { if (m[k] != null && m[k] > 0 && m[k] <= 3) m[k] *= 100; });
  ['gross_margin','top5_conc'].forEach(k => { if (m[k] != null && m[k] > 0 && m[k] <= 1) m[k] *= 100; });
  Object.keys(m).forEach(k => { m[k] = Math.round(m[k] * 100) / 100; });
  return m;
}
/* ── CSV import with header synonyms ── */
function libParseCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { ok:false, error:'Needs a header row and at least one company.' };
  const head = rows[0].map(h => h.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, ' ').trim());
  const idx = {
    company: head.findIndex(h => /^(company|name|startup|company name)$/.test(h)),
    stage: head.findIndex(h => /stage|round/.test(h)),
    model: head.findIndex(h => /model|sector|category|type/.test(h)),
    outcome: head.findIndex(h => /outcome|status|decision/.test(h)),
    date: head.findIndex(h => /date|year|as of/.test(h)),
  };
  const mIdx = {};
  LIB_METRICS.forEach(x => { const i = head.findIndex(h => x.syn.includes(h.replace(/ %$/, '').trim()) || h === x.key); if (i >= 0) mIdx[x.key] = i; });
  if (idx.company < 0) return { ok:false, error:'No company or name column.' };
  if (!Object.keys(mIdx).length) return { ok:false, error:'No recognised metric columns. Use headers like arr, growth, nrr, grr, gross margin, burn multiple.' };
  const out = rows.slice(1).map(r => {
    const metrics = {};
    Object.entries(mIdx).forEach(([k, i]) => { const v = parseNum(r[i]); if (v != null) metrics[k] = v; });
    normalizeLibMetrics(metrics);
    return {
      company:r[idx.company] || 'Unnamed', stage: stageFromText(r[idx.stage]) || stageFromArr(metrics.arr) || 'seed',
      model: modelFromText(r[idx.model]) || 'saas', outcome: idx.outcome >= 0 ? (r[idx.outcome] || '') : '',
      date: idx.date >= 0 ? (r[idx.date] || '') : '', metrics, source:'csv',
    };
  }).filter(x => Object.keys(x.metrics).length);
  return { ok:true, rows:out, mapped:Object.keys(mIdx) };
}

/* ── AI import: paste anything, get structured rows back for review ── */
async function libAIParse(text) {
  const ai = aiReady(); if (!ai.ok) throw new Error(ai.why);
  const keys = LIB_METRICS.filter(x => x.key !== 'score').map(x => `${x.key} (${x.label}${x.unit === '%' ? ', percentage points' : x.unit === '$' ? ', USD number' : x.unit === 'mo' ? ', months' : ''})`).join('\n');
  const SYSTEM = 'You convert unstructured text about startups into structured rows. You never estimate or infer values that are not explicitly stated, and you always quote the source text for each company.';
  const PROMPT = `Extract one row per company mentioned with explicit metrics.

Return ONLY a JSON array. Each element:
{ "company": string, "stage": "preseed"|"seed"|"a"|"b"|null, "model": "saas"|"ai_app"|"marketplace"|"fintech"|null, "date": string|null,
  "metrics": { <metric_key>: number, ... }, "source": "<exact quote, max 160 chars>" }

Rules:
- Only include a metric if the text states it. Do not compute or annualise.
- Percentages as numbers: "118%" becomes 118. "1.18x NRR" becomes 118.
- Money in USD as plain numbers: "$4.2M" becomes 4200000. If another currency, keep the number and add it to source.
- Skip companies with no metrics.

Metric keys:
${keys}

TEXT
${String(text).slice(0, 30000)}`;
  const raw = await callModel(ai.provider, ai.key, SYSTEM, PROMPT, 6000);
  const arr = parseJSON(raw);
  if (!Array.isArray(arr)) throw new Error('The model did not return a JSON array.');
  return arr.map(x => {
    const metrics = {};
    Object.entries(x.metrics || {}).forEach(([k, v]) => { if (LIB_METRICS.some(m => m.key === k)) { const n = parseNum(v); if (n != null) metrics[k] = n; } });
    normalizeLibMetrics(metrics);
    return { company:String(x.company || 'Unnamed').slice(0, 80), stage: ['preseed','seed','a','b'].includes(x.stage) ? x.stage : stageFromArr(metrics.arr) || 'seed',
      model: ['saas','ai_app','marketplace','fintech'].includes(x.model) ? x.model : 'saas', date:x.date || '', metrics, source:'ai', quote:String(x.source || '').slice(0, 200) };
  }).filter(x => Object.keys(x.metrics).length);
}

function reviewImport(rows, how) {
  if (!rows.length) { toast('Nothing to import — no rows with metrics were found.', 'err'); return; }
  window._pendingImport = rows;
  const cols = LIB_METRICS.filter(m => m.key !== 'score' && rows.some(r => r.metrics[m.key] != null));
  const body = `<p class="pg-desc" style="margin-bottom:10px">${rows.length} compan${rows.length === 1 ? 'y' : 'ies'} found via ${esc(how)}. Untick anything wrong before adding. ${how === 'AI' ? 'Each row keeps the quote it came from — hover the name.' : ''}</p>
    <div class="tbl-wrap" style="max-height:52vh;overflow:auto"><table class="ledger"><thead><tr><th></th><th>Company</th><th>Stage</th>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr><td><input type="checkbox" checked data-imp="${i}"></td>
      <td${r.quote ? ` data-tip="${tipAttr(esc(r.quote))}"` : ''}>${esc(r.company)}</td><td class="m">${esc(STAGES.find(s => s.id === r.stage)?.n || r.stage)}</td>
      ${cols.map(c => `<td class="m">${r.metrics[c.key] == null ? '—' : esc(libFmt(c, r.metrics[c.key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  openModal('Review before adding to your library', body, [{ label:'Add selected', primary:true, onClick:() => {
    const pick = Array.from(document.querySelectorAll('[data-imp]')).filter(x => x.checked).map(x => window._pendingImport[+x.dataset.imp]);
    const list = libLoad();
    pick.forEach(r => list.push(Object.assign({ id:'i' + seedFrom(JSON.stringify(r) + Math.random()).toString(36), outcome:'' }, r)));
    if (libSave(list)) { closeModal(); toast(`${pick.length} added to your library.`); renderLibrary(); }
  } }]);
}
function libFmt(m, v) {
  if (v == null || !isFinite(v)) return '—';
  if (m.unit === '$') return money(v);
  if (m.unit === '%') return v.toFixed(1) + '%';
  if (m.unit === 'x') return v.toFixed(2) + 'x';
  if (m.unit === 'mo') return v.toFixed(1) + ' mo';
  return v.toFixed(m.key === 'score' ? 0 : 2);
}

/* ── Peer comparison and change since the last run ── */
function benchmarkCompare(D, sc) {
  const lib = libLoad();
  const own = lib.filter(x => !(x.hash && S.result && x.hash === S.result.hash));
  const val = k => k === 'arr' ? gv('arr_now') : k === 'score' ? sc.overall : D[k];
  const rows = LIB_METRICS.map(m => {
    const v = val(m.key); if (v == null || !isFinite(v)) return null;
    let peers = own.filter(x => x.stage === S.stage && x.metrics[m.key] != null).map(x => x.metrics[m.key]), scope = 'same stage';
    if (peers.length < 5) { peers = own.filter(x => x.metrics[m.key] != null).map(x => x.metrics[m.key]); scope = 'all stages'; }
    if (peers.length < 5) return { m, v, n:peers.length, pct:null, scope };
    const pr = pctRank(peers, v);
    return { m, v, n:peers.length, scope, pct: m.dir === 'lo' ? 100 - pr : pr, p25:quantile(peers, 0.25), p50:quantile(peers, 0.5), p75:quantile(peers, 0.75) };
  }).filter(Boolean);
  /* Previous runs of the same company: what changed, including how it describes itself. */
  const me = cleanName(S.name);
  const prev = own.filter(x => x.source === 'assessment' && cleanName(x.company) === me).sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;
  let drift = null;
  if (prev) {
    const metrics = LIB_METRICS.map(m => ({ m, was:prev.metrics[m.key], now:val(m.key) })).filter(x => x.was != null && x.now != null);
    const stated = Object.keys(Object.assign({}, prev.stated || {}, ...Object.keys(S.vals).filter(k => k.startsWith('stated_')).map(k => ({ [k]:1 }))))
      .map(k => ({ k, was:(prev.stated || {})[k], now:gv(k) })).filter(x => x.was != null || x.now != null);
    drift = { prev, metrics, stated };
  }
  return { rows, total:lib.length, drift, calibrated:calibrationStatus() };
}

/* ── Rubric recalibration from the library ── */
let _calCache = null;
function calibrationOn() { try { return localStorage.getItem(CAL_KEY) === '1'; } catch (e) { return false; } }
function setCalibration(on) { try { localStorage.setItem(CAL_KEY, on ? '1' : '0'); } catch (e) {} _calCache = null; }
const CAL_MIN = 8;
function buildCalibration() {
  const lib = libLoad(), th = {}, used = [];
  const map = { growth_yoy:'growth_yoy', nrr:'nrr', grr:'grr', gross_margin:'gross_margin', burn_multiple:'burn_multiple', cac_payback:'cac_payback',
    ltv_cac:'ltv_cac', magic_number:'magic_number', runway:'runway', rule40:'rule40', arr_per_fte:'arr_per_fte', top5_conc:'top5_conc',
    logo_ret:'logo_ret', quick_ratio:'quick_ratio', hype_ratio:'hype_ratio' };
  Object.entries(configuredThresholds()).forEach(([k, cfg]) => { th[k] = Object.assign({}, cfg); });
  Object.entries(map).forEach(([libKey, thKey]) => {
    const cfg = th[thKey]; if (!cfg || cfg.dir === 'band') return;
    ['preseed','seed','a','b'].forEach(st => {
      if (!cfg[st]) return;
      const xs = lib.filter(x => x.stage === st && x.metrics[libKey] != null && x.source !== 'synthetic-excluded').map(x => x.metrics[libKey]);
      if (xs.length < CAL_MIN) return;
      /* Anchors chosen so a company's score roughly equals its percentile among your own deals. */
      const a = cfg.dir === 'hi'
        ? [quantile(xs, 0.15), quantile(xs, 0.45), quantile(xs, 0.72), quantile(xs, 0.92)]
        : [quantile(xs, 0.08), quantile(xs, 0.45), quantile(xs, 0.72), quantile(xs, 0.95)];
      for (let i = 1; i < 4; i++) if (a[i] <= a[i - 1]) a[i] = a[i - 1] + Math.abs(a[i - 1]) * 0.01 + 1e-6;
      cfg[st] = a.map(x => Math.round(x * 1000) / 1000);
      cfg._cal = true;
      used.push({ key:thKey, stage:st, n:xs.length });
    });
  });
  const sig = seedFrom(JSON.stringify(used) + JSON.stringify(used.map(u => th[u.key][u.stage]))).toString(16).slice(0, 6);
  return { th, used, sig };
}
function activeThresholds() {
  if (!calibrationOn()) return configuredThresholds();
  if (!_calCache) _calCache = buildCalibration();
  return _calCache.used.length ? _calCache.th : configuredThresholds();
}
function rubricVersion() {
  const sig = configSignature(), base = RUBRIC.version + (sig ? `+cfg.${sig}` : '');
  if (!calibrationOn()) return base;
  if (!_calCache) _calCache = buildCalibration();
  return _calCache.used.length ? `${base}+cal.${_calCache.sig}` : base;
}
function calibrationStatus() {
  const c = _calCache || buildCalibration();
  return { on:calibrationOn(), used:c.used, sig:c.sig };
}

/* ── Synthetic sample, for trying the feature. Clearly labelled; never real companies. ── */
function loadSyntheticLibrary() {
  if (!confirm('Add 64 synthetic companies to your library? They are generated for trying the benchmark and calibration features, are labelled “synthetic”, and are not market data.')) return;
  const rand = mulberry32(20260924);
  const n = (m, s) => m + s * gauss(rand);
  const cfg = {
    preseed:{ arr:[120000, 60000], g:null },
    seed:{ arr:[900000, 450000], g:[170, 70] },
    a:{ arr:[4500000, 2000000], g:[110, 45] },
    b:{ arr:[18000000, 7000000], g:[60, 25] },
  };
  const list = libLoad();
  ['preseed','seed','a','b'].forEach(st => {
    for (let i = 0; i < 16; i++) {
      const c = cfg[st], arr = Math.max(40000, n(c.arr[0], c.arr[1]));
      const m = { arr:Math.round(arr) };
      if (c.g) m.growth_yoy = Math.round(Math.max(5, n(c.g[0], c.g[1])));
      if (st !== 'preseed') {
        m.nrr = Math.round(n(108, 12)); m.grr = Math.round(Math.min(98, n(86, 6)));
        m.burn_multiple = Math.round(Math.max(0.4, n(st === 'b' ? 1.6 : 2.3, 0.9)) * 100) / 100;
        m.cac_payback = Math.round(Math.max(4, n(st === 'b' ? 16 : 20, 7)));
        m.ltv_cac = Math.round(Math.max(0.6, n(3, 1.2)) * 100) / 100;
        m.magic_number = Math.round(Math.max(0.1, n(0.75, 0.3)) * 100) / 100;
        m.rule40 = Math.round(n(st === 'b' ? 25 : 5, 25));
        m.arr_per_fte = Math.round(Math.max(20000, n(st === 'b' ? 170000 : st === 'a' ? 120000 : 75000, 35000)));
        m.logo_ret = Math.round(Math.min(98, n(85, 7)));
      }
      m.gross_margin = Math.round(Math.min(92, n(72, 9)));
      m.runway = Math.round(Math.max(3, n(18, 7)));
      m.top5_conc = Math.round(Math.max(5, Math.min(90, n(st === 'preseed' ? 60 : st === 'seed' ? 42 : st === 'a' ? 32 : 22, 12))));
      list.push({ id:'syn-' + st + '-' + i, company:`Synthetic ${STAGES.find(s => s.id === st).n} ${String(i + 1).padStart(2, '0')}`,
        stage:st, model:'saas', date:'', metrics:m, source:'synthetic', outcome:'' });
    }
  });
  if (libSave(list)) { toast('64 synthetic companies added. Remove them any time with “Remove synthetic”.'); renderLibrary(); }
}

/* ── Library page ── */
let _libSort = { key:'date', dir:-1 }, _libFilter = '';
function goLibrary() { renderLibrary(); showPage('library'); }
function renderLibrary() {
  const lib = libLoad();
  const cal = calibrationStatus();
  const stageN = st => lib.filter(x => x.stage === st).length;
  const syn = lib.filter(x => x.source === 'synthetic').length;
  const q = _libFilter.trim().toLowerCase();
  const rows = lib.filter(x => !q || (x.company || '').toLowerCase().includes(q) || (x.outcome || '').toLowerCase().includes(q))
    .sort((a, b) => {
      const k = _libSort.key;
      const av = k === 'company' || k === 'date' || k === 'stage' || k === 'outcome' || k === 'source' ? (a[k] || '') : (a.metrics[k] ?? -Infinity);
      const bv = k === 'company' || k === 'date' || k === 'stage' || k === 'outcome' || k === 'source' ? (b[k] || '') : (b.metrics[k] ?? -Infinity);
      return (av < bv ? -1 : av > bv ? 1 : 0) * _libSort.dir;
    });
  const cols = ['arr','growth_yoy','nrr','grr','gross_margin','burn_multiple','cac_payback','runway','score'].map(k => LIB_METRICS.find(m => m.key === k));
  const th = (k, l) => `<th class="sortable" onclick="libSortBy('${k}')">${esc(l)}${_libSort.key === k ? (_libSort.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
  document.getElementById('library-content').innerHTML = `
    <div class="pg-eyebrow">Library</div>
    <h2 class="pg-title">Your deal data</h2>
    <p class="pg-desc">Every assessment you save lands here, alongside any comparables you import. Radar ranks each new company against this set and, if you switch it on, recalibrates its thresholds on it — so the scores reflect how you invest rather than a generic benchmark. Everything stays in this browser until you export it.</p>

    <div class="lib-stats">
      <div class="stat"><span class="stat-n">${lib.length}</span><span class="stat-l">Companies</span></div>
      ${STAGES.map(s => `<div class="stat"><span class="stat-n">${stageN(s.id)}</span><span class="stat-l">${esc(s.n)}</span></div>`).join('')}
      <div class="stat"><span class="stat-n">${lib.filter(x => x.source === 'assessment').length}</span><span class="stat-l">Your runs</span></div>
    </div>

    <div class="lib-actions">
      <button class="btn btn-primary" onclick="libImportCSV()">Import CSV</button>
      <button class="btn btn-ghost" onclick="libOpenAIPaste()">Paste anything — structure it with AI</button>
      <button class="btn btn-ghost" onclick="libExport()">Export backup (.json)</button>
      <button class="btn btn-ghost" onclick="libImportJSON()">Restore backup</button>
      ${syn ? `<button class="btn btn-ghost" onclick="libRemoveSynthetic()">Remove ${syn} synthetic</button>` : `<button class="btn btn-ghost" onclick="loadSyntheticLibrary()">Add synthetic sample</button>`}
      ${lib.length ? `<button class="btn btn-ghost" onclick="libClear()">Clear all</button>` : ''}
    </div>

    <div class="calib-card ${cal.on ? 'on' : ''}">
      <div class="calib-row">
        <label class="switch"><input type="checkbox" ${cal.on ? 'checked' : ''} onchange="setCalibration(this.checked);renderLibrary();toast(this.checked ? 'Thresholds now calibrate on your library.' : 'Back to the default rubric.')"><span></span></label>
        <div><b>Calibrate the rubric on this library</b>
          <div class="field-hint">Needs ${CAL_MIN}+ companies at a stage with a metric. Anchors are set at your library’s 15th / 45th / 72nd / 92nd percentiles, so a score of 72 means “better than about 72% of the deals you have seen”. The run hash records the calibration, so results stay reproducible.</div></div>
      </div>
      <div class="calib-used">${cal.used.length
        ? `${cal.on ? 'Active' : 'Available'} for ${cal.used.length} metric-stage pairs: ${cal.used.slice(0, 18).map(u => `<span class="pill">${esc(DLABEL[u.key] || u.key)} · ${esc(STAGES.find(s => s.id === u.stage).n)} (${u.n})</span>`).join(' ')}${cal.used.length > 18 ? ' …' : ''}${cal.on ? ` · rubric ${esc(rubricVersion())}` : ''}`
        : 'Not enough data yet for any metric at any stage.'}</div>
      ${syn && cal.on ? `<div class="warnstrip" style="margin-top:10px"><span>⚠</span><div>Calibration currently includes ${syn} synthetic companies. Remove them before relying on calibrated scores.</div></div>` : ''}
    </div>

    <input class="form-inp" style="margin:14px 0 10px" placeholder="Filter by company or outcome…" value="${esc(_libFilter)}" oninput="_libFilter=this.value;renderLibraryTable()" id="lib-filter" />
    <div id="lib-table">${libTableHTML(rows, cols, th)}</div>`;
}
function renderLibraryTable() {
  const el = document.getElementById('lib-filter'); const pos = el ? el.selectionStart : null;
  renderLibrary();
  const el2 = document.getElementById('lib-filter'); if (el2) { el2.focus(); if (pos != null) el2.setSelectionRange(pos, pos); }
}
function libTableHTML(rows, cols, th) {
  if (!rows.length) return `<div class="suppressed">No companies yet. Save a report to the library, import a CSV, or paste comparables in any format and let a model structure them.</div>`;
  return `<div class="tbl-wrap"><table class="ledger lib-tbl"><thead><tr>${th('company','Company')}${th('stage','Stage')}${cols.map(c => th(c.key, c.label)).join('')}${th('outcome','Outcome')}${th('source','Source')}<th></th></tr></thead>
    <tbody>${rows.map(x => `<tr data-id="${esc(x.id)}">
      <td>${x.quote ? `<span data-tip="${tipAttr(esc(x.quote))}">${esc(x.company)}</span>` : esc(x.company)}${x.blocked ? ' <span class="pill red">blocked</span>' : ''}<div class="field-hint">${esc(x.date || '')}</div></td>
      <td class="m">${esc(STAGES.find(s => s.id === x.stage)?.n || x.stage)}</td>
      ${cols.map(c => `<td class="m">${esc(libFmt(c, x.metrics[c.key]))}</td>`).join('')}
      <td><select class="mini-sel" onchange="libSetOutcome(this.closest('tr').dataset.id,this.value)">${OUTCOMES.map(o => `<option${(x.outcome || '') === o ? ' selected' : ''} value="${esc(o)}">${esc(o || '—')}</option>`).join('')}</select></td>
      <td class="m">${esc(x.source)}</td>
      <td style="white-space:nowrap">${x.payload ? `<button class="btn btn-ghost btn-sm" onclick="libOpen(this.closest('tr').dataset.id)">Open</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="libDelete(this.closest('tr').dataset.id)" aria-label="Delete">×</button></td></tr>`).join('')}</tbody></table></div>`;
}
function libSortBy(k) { _libSort = { key:k, dir:_libSort.key === k ? -_libSort.dir : -1 }; renderLibrary(); }
function libSetOutcome(id, v) { const l = libLoad(); const x = l.find(e => e.id === id); if (x) { x.outcome = v; libSave(l); } }
function libDelete(id) { const l = libLoad().filter(e => e.id !== id); libSave(l); renderLibrary(); }
function libClear() { if (!confirm('Delete every company in the library? Export a backup first if you might want it back.')) return; libSave([]); renderLibrary(); }
function libRemoveSynthetic() { libSave(libLoad().filter(x => x.source !== 'synthetic')); renderLibrary(); toast('Synthetic companies removed.'); }
function libOpen(id) {
  const x = libLoad().find(e => e.id === id); if (!x || !x.payload) return;
  restorePayload(x.payload); saveDraft(); buildStages(); buildTypes(); renderIntakeStatus(); updateProgress();
  goVerify(); toast(`Opened ${x.company} as of ${x.date}.`);
}
function libExport() {
  downloadFile(`vcr2-library-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ kind:'vcr2-library', v:1, exported:new Date().toISOString(), entries:libLoad() }, null, 1), 'application/json');
}
function libImportJSON() {
  pickFile('.json', text => {
    try {
      const j = JSON.parse(text);
      const entries = Array.isArray(j) ? j : j.entries;
      if (!Array.isArray(entries)) throw new Error('not a library file');
      const list = libLoad(), ids = new Set(list.map(x => x.id));
      let n = 0; entries.forEach(e => { if (e && e.company && e.metrics && !ids.has(e.id)) { list.push(e); n++; } });
      if (libSave(list)) { toast(`${n} entries restored.`); renderLibrary(); }
    } catch (e) { toast('That file is not a Radar library backup.', 'err'); }
  });
}
function libImportCSV() {
  pickFile('.csv,.tsv,.txt,.xlsx,.xlsm', text => {
    const r = libParseCSV(text);
    if (!r.ok) { toast(r.error, 'err'); return; }
    reviewImport(r.rows, 'CSV');
  }, 'library');
}
function libOpenAIPaste() {
  const ai = aiReady();
  openModal('Paste anything — structure it with AI', `
    <p class="pg-desc" style="margin-bottom:10px">Paste a portfolio update, a newsletter, a spreadsheet dump, meeting notes or a benchmark report. The model you chose in the sidebar extracts one row per company with a quote for every value, and you review each row before anything is saved. Only explicitly stated figures are kept.</p>
    ${ai.ok ? '' : `<div class="warnstrip"><span>⚠</span><div>${esc(ai.why)}</div></div>`}
    <textarea class="intake-ta" id="ai-lib-text" style="min-height:220px" placeholder="e.g. “Acme (Series A, $3.1M ARR, 140% YoY, 112% NRR, 76% GM)…”"></textarea>`,
    [{ label:'Structure with AI', primary:true, onClick: async () => {
      const t = document.getElementById('ai-lib-text').value.trim();
      if (t.length < 20) { toast('Paste some text first.', 'err'); return; }
      const b = document.querySelector('.modal-f .btn-primary'); if (b) { b.disabled = true; b.textContent = 'Structuring…'; }
      try { const rows = await libAIParse(t); closeModal(); reviewImport(rows, 'AI'); }
      catch (e) { toast('AI import failed: ' + e.message, 'err'); if (b) { b.disabled = false; b.textContent = 'Structure with AI'; } }
    } }]);
}
