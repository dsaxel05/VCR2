
/* ═══════════════════════════════════════════════════════════════
   CONFIGURATION — the owner's layer on top of the built-in rubric
   radar-config.json lives in the repository next to index.html. Every
   visitor's browser loads it at startup, so what the owner publishes
   from the Studio is what everyone sees. Only someone with write access
   to the repository (the owner) can change that file.
   ═══════════════════════════════════════════════════════════════ */
const CONFIG_FILE = 'radar-config.json';
const EMPTY_CONFIG = () => ({
  version:1, updated:null,
  owner:null, repo:null, branch:'main', path:CONFIG_FILE,
  branding:{}, settings:{}, look:{}, texts:[],
  hidden:{ sections:[], fields:[], metrics:[], checks:[], patterns:[], forensics:[], questions:[], requests:[], gates:[], checklist:[], models:[], stages:[] },
  thresholds:{}, metricWeights:{}, stageWeights:{},
  labels:{ fields:{}, hints:{}, metrics:{}, sections:{}, dims:{}, patterns:{}, gates:{}, checklist:{}, units:{}, stages:{}, models:{}, evidence:{}, calib:{}, sdescs:{}, checks:{} },
  formulas:{}, dimensions:[], stages:[],
  meta:{ fields:{}, gates:{}, checklist:{}, patterns:{}, booleans:{}, checks:{}, answers:{}, families:{}, prompts:{} },
  fields:[], metrics:[], checks:[], questions:[], patterns:[], requests:[], checklist:[],
  gates:[], checkTol:{}, categorical:{}, booleans:{}, patternParams:{}, defaults:{}, models:[], benchmarks:[],
});
let CFG_PUBLISHED = EMPTY_CONFIG();   /* what the live site serves */
let CFG = EMPTY_CONFIG();             /* what this browser is using right now */

/* Everything read from radar-config.json (or an imported draft) passes through here:
   unknown keys are dropped, text is coerced to strings, names must be plain identifiers.
   A malformed file therefore degrades to "no customisation" instead of breaking the app. */
/* Ids that would re-parent a map or shadow an Object method are never accepted. */
/* The report views, in their built-in order. Four are in sight unless the owner chooses others (Studio > Look & feel). */
const REPORT_VIEWS = [['overview','Overview'],['findings','Findings'],['revenue','Revenue'],['forensics','Forensics'],['runway','Runway & odds'],['deal','Deal & returns'],
  ['bench','Benchmarks'],['scoring','Scoring'],['questions','Questions'],['metrics','All metrics'],['ledger','Consistency ledger'],['checklist','Diligence checklist']];
const REPORT_VIEWS_DEFAULT = ['overview','findings','revenue','questions'];
const RESERVED_ID = /^(?:__proto__|constructor|prototype|toString|toLocaleString|valueOf|hasOwnProperty|isPrototypeOf|propertyIsEnumerable)$/;
const ID_RE = /^(?!(?:__proto__|constructor|prototype|toString|toLocaleString|valueOf|hasOwnProperty|isPrototypeOf|propertyIsEnumerable)$)[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const LABEL_KINDS = ['fields','hints','metrics','sections','dims','patterns','gates','checklist','units','stages','models','evidence','calib','sdescs','checks'];
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
/* A formula or condition over the limit is refused whole: cutting it short would silently change what it says. */
const fxLong = v => typeof v === 'string' && v.length > 1000;
const str = (v, max) => (typeof v === 'string' ? v : (typeof v === 'number' && isFinite(v)) ? String(v) : '').slice(0, max || 2000);
const numOr = (v, d) => { const n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : d; };
const strList = (v, max) => (Array.isArray(v) ? v : []).map(x => str(x, 200).trim()).filter(Boolean).slice(0, max || 200);

/* Quartiles are stored in value order (25th ≤ median ≤ 75th); the report flips them for lower-is-better metrics.
   Sources that list a lower-is-better metric best-first are reordered; a value on the wrong side of the median is dropped. */
function orderQuartiles(b) {
  let { p25, median, p75 } = b;
  if (p25 != null && p75 != null && p25 > p75) [p25, p75] = [p75, p25];
  if (p25 != null && p75 == null && p25 > median) { p75 = p25; p25 = null; }
  if (p75 != null && p25 == null && p75 < median) { p25 = p75; p75 = null; }
  if (p25 != null && p25 > median) p25 = null;
  if (p75 != null && p75 < median) p75 = null;
  return Object.assign({}, b, { p25, median, p75 });
}
/* JSON with object keys sorted, so the same content always gives the same text. */
const canonJSON = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x);
const safeItemId = (v, prefix, i) => { const t = str(v, 64).replace(/[^A-Za-z0-9_-]/g, ''); return t && !RESERVED_ID.test(t) ? t : `${prefix}${i}`; };
const anchors4 = a => Array.isArray(a) && a.length === 4 && a.every(x => x !== '' && x != null && isFinite(+x)) ? a.map(Number) : null;
function normalizeConfig(c) {
  const out = EMPTY_CONFIG();
  if (!isObj(c)) return out;
  out.updated = str(c.updated, 40) || null;
  ['owner','repo','branch'].forEach(k => { const v = str(c[k], 100); if (v && /^[A-Za-z0-9._\/-]+$/.test(v)) out[k] = v; });
  const obj = k => isObj(c[k]) ? c[k] : {};
  Object.entries(obj('branding')).forEach(([k, v]) => { if (['appName','kicker','headline','subtitle','note','customSectionLabel','pageTitle'].includes(k) && str(v).trim()) out.branding[k] = k === 'pageTitle' ? str(v, 70).trim() : str(v, 600); });
  /* Look & feel (added in 5.0; older files have none and keep the built-in look). Colours are checked again for contrast when applied. */
  const lk = obj('look');
  /* There is one identity now. A direction written by an earlier version (highlighter, thermal, dimensions) simply means it, so it is not kept. */
  if (['garnet','emerald'].includes(lk.accent)) out.look.accent = lk.accent;
  if (lk.frame === 'off') out.look.frame = 'off';
  if (lk.divider === 'plain') out.look.divider = 'plain';
  if (['auto','light','dark'].includes(lk.theme)) out.look.theme = lk.theme;
  /* Text size: normal (body 16 px) is the built-in default, so only the two larger ones are stored. */
  if (['large','xlarge'].includes(lk.text)) out.look.text = lk.text;
  /* Page scale: 75 % is built in; 90 and 100 zoom the whole page. */
  if (['90','100'].includes(String(lk.page))) out.look.page = String(lk.page);
  /* Sidebar on start: open is built in, so only "hidden" is stored. The visitor's own choice, kept in their browser, wins over it. */
  if (lk.sidebar === 'hidden') out.look.sidebar = 'hidden';
  /* Shape and size: square corners and normal title, figure and question sizes are the built-in values, so only the others are stored. */
  if (['soft','round'].includes(lk.corners)) out.look.corners = lk.corners;
  ['sizeTitle','sizeFigure','sizeQuestion'].forEach(k => { if (['small','large','xlarge'].includes(lk[k])) out.look[k] = lk[k]; });
  /* Which report views are in sight, in order (the rest sit behind "More views"). */
  if (Array.isArray(lk.views)) {
    const seenV = new Set(), ok = lk.views.map(v => String(v)).filter(v => REPORT_VIEWS.some(x => x[0] === v) && !seenV.has(v) && seenV.add(v)).slice(0, 6);
    if (ok.length && ok.join() !== REPORT_VIEWS_DEFAULT.join()) out.look.views = ok;
  }
  ['brand','brandDark','highlight'].forEach(k => { const v = str(lk[k], 7).trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) out.look[k] = v.toUpperCase(); });
  /* Scoring dimensions and stages the owner adds (the built-in ones stay). A custom stage scores with the bars and weights of a built-in stage. */
  const BUILTIN_DIMS = ['revenue','capital','gtm','team','market','govern'], BUILTIN_STAGES = ['preseed','seed','a','b'];
  const dseen = new Set(BUILTIN_DIMS);
  out.dimensions = (Array.isArray(c.dimensions) ? c.dimensions : []).filter(isObj).map(d => ({ id:str(d.id, 24), label:str(d.label, 60).trim(), desc:str(d.desc, 200).trim() }))
    .filter(d => /^[a-z][a-z0-9_]{1,23}$/.test(d.id) && d.label && !dseen.has(d.id) && dseen.add(d.id)).slice(0, 4);
  const sseen = new Set(BUILTIN_STAGES);
  out.stages = (Array.isArray(c.stages) ? c.stages : []).filter(isObj).map(s => ({ id:str(s.id, 24), name:str(s.name, 40).trim(), desc:str(s.desc, 80).trim(),
      like:BUILTIN_STAGES.includes(s.like) ? s.like : 'b', lo:isFinite(parseFloat(s.lo)) && +s.lo >= 0 ? +s.lo : null, hi:isFinite(parseFloat(s.hi)) && +s.hi > 0 ? +s.hi : null }))
    .filter(s => /^[a-z][a-z0-9_]{1,23}$/.test(s.id) && s.name && !sseen.has(s.id) && sseen.add(s.id)).slice(0, 4);
  const DIMS_OK = BUILTIN_DIMS.concat(out.dimensions.map(d => d.id));
  /* Text replacements: the words as built in -> the owner's words. Plain text only. */
  const tseen = new Set();
  out.texts = (Array.isArray(c.texts) ? c.texts : []).filter(isObj).map(t => ({ from:str(t.from, 400), to:str(t.to, 800) }))
    .filter(t => t.from.trim() && t.from !== t.to && !tseen.has(t.from) && tseen.add(t.from)).slice(0, 400);
  const st = obj('settings');
  if (st.blockAfter != null && isFinite(+st.blockAfter)) out.settings.blockAfter = Math.max(1, Math.round(+st.blockAfter));
  if (['off','gentle','strict'].includes(st.evidenceMode)) out.settings.evidenceMode = st.evidenceMode;
  if (['existing','block'].includes(st.noteCapBasis)) out.settings.noteCapBasis = st.noteCapBasis;
  if (st.ltvCapYears != null && st.ltvCapYears !== '' && isFinite(+st.ltvCapYears)) out.settings.ltvCapYears = Math.min(20, Math.max(1, +st.ltvCapYears));
  if (st.correlationCap != null && st.correlationCap !== '' && isFinite(+st.correlationCap)) out.settings.correlationCap = Math.min(10, Math.max(0, +st.correlationCap));
  SETTING_DEFS.forEach(d => { const v = cleanSetting(d, st[d.id]); if (v !== undefined) out.settings[d.id] = v; });
  /* The model name each AI provider is called with (the web address of a provider is not a setting). */
  if (isObj(st.aiModels)) { const am = {}; Object.entries(st.aiModels).forEach(([p, m]) => { if (/^[a-z]{3,20}$/.test(p) && typeof m === 'string' && /^[A-Za-z0-9._:\/-]{2,80}$/.test(m.trim()) && !KEY_RX.test(m)) am[p] = m.trim(); }); if (Object.keys(am).length) out.settings.aiModels = am; }
  /* Metrics measured together: group name -> metric keys. Absent means the built-in groups; {} means no groups. A metric is in one group
     (the first that names it) and a group needs two members to mean anything. */
  if (isObj(st.correlationGroups)) {
    const used = new Set(), g = {};
    Object.entries(st.correlationGroups).slice(0, 12).forEach(([name, ks]) => {
      if (!/^[a-z][a-z0-9_]{1,23}$/.test(name) || !Array.isArray(ks)) return;
      const keep = ks.map(String).filter(k => /^[a-z][a-z0-9_]{1,40}$/.test(k) && !used.has(k) && used.add(k)).slice(0, 14);
      if (keep.length >= 2) g[name] = keep;
    });
    out.settings.correlationGroups = g;
  }
  ['minN','nextStage'].forEach(k => { if (isObj(st[k])) { out.settings[k] = {}; Object.entries(st[k]).forEach(([a, v]) => { if (ID_RE.test(a) && isFinite(parseFloat(v))) out.settings[k][a] = parseFloat(v); }); } });
  Object.keys(out.hidden).forEach(k => { out.hidden[k] = strList(isObj(c.hidden) ? c.hidden[k] : null, 500); });
  const L = isObj(c.labels) ? c.labels : {};
  LABEL_KINDS.forEach(k => { if (isObj(L[k])) Object.entries(L[k]).forEach(([id, v]) => { if (ID_RE.test(id) && str(v).trim()) out.labels[k][id] = str(v, 400).trim(); }); });
  Object.entries(obj('thresholds')).forEach(([k, o]) => {
    if (!ID_RE.test(k) || !isObj(o)) return;
    const t = {}; ['preseed','seed','a','b'].forEach(stg => { if (o[stg] === null) t[stg] = null; else { const a = anchors4(o[stg]); if (a) t[stg] = a; } });
    if (str(o.note).trim()) t.note = str(o.note, 300).trim();
    if (DIMS_OK.includes(o.dim)) t.dim = o.dim;
    if (Array.isArray(o.models)) t.models = strList(o.models, 20).filter(m => /^[a-z][a-z0-9_]{1,39}$/.test(m));
    ['ideal','hard'].forEach(p => { const a = o[p]; if (Array.isArray(a) && a.length === 2 && a.every(x => x !== '' && x != null && isFinite(+x)) && +a[0] <= +a[1]) t[p] = a.map(Number); });
    out.thresholds[k] = t;
  });
  const MT = obj('meta'), RISKS_M = ['product','market','execution','financial','legal','deal'], cleanId = k => !RESERVED_ID.test(k) && (ID_RE.test(k) || /^[A-Za-z0-9_-]{1,64}$/.test(k));
  const metaOf = kind => isObj(MT[kind]) ? Object.entries(MT[kind]).filter(([k, o]) => cleanId(k) && isObj(o)) : [];
  const lever = o => str(o.lever).trim() ? { lever:str(o.lever, 600).trim() } : {};   /* what to do if a question stays unresolved */
  metaOf('fields').forEach(([k, o]) => { const t = {};
    if (Array.isArray(o.chips)) t.chips = o.chips.map(Number).filter(isFinite).slice(0, 12);
    if (typeof o.required === 'boolean') t.required = o.required;
    if (str(o.group).trim()) t.group = str(o.group, 120).trim();
    if (str(o.unit) in UNIT_MAP && str(o.unit) !== '') t.unit = str(o.unit);
    if (Array.isArray(o.addOptions)) t.addOptions = strList(o.addOptions, 20);
    if (Object.keys(t).length) out.meta.fields[k] = t; });
  metaOf('gates').forEach(([k, o]) => { const t = lever(o);
    if (str(o.why).trim()) t.why = str(o.why, 1500).trim();
    if (str(o.ask).trim()) t.ask = str(o.ask, 1000).trim();
    if (o.when === true || o.when === false) t.when = o.when;
    if (Object.keys(t).length) out.meta.gates[k] = t; });
  metaOf('families').forEach(([k, o]) => { const t = lever(o);
    if (o.p !== '' && o.p != null && isFinite(+o.p) && +o.p >= 0 && +o.p <= 10) t.p = +o.p;
    if (Object.keys(t).length) out.meta.families[k] = t; });
  metaOf('prompts').forEach(([k, o]) => { if (k !== 'memo' && k !== 'extraction') return; const t = {};
    if (k === 'memo' && str(o.voice).trim()) t.voice = str(o.voice, 600).trim();
    if (str(o.note).trim()) t.note = str(o.note, 1200).trim();
    if (Object.keys(t).length) out.meta.prompts[k] = t; });
  metaOf('checks').forEach(([k, o]) => { const t = lever(o);
    if (str(o.text).trim()) t.text = str(o.text, 1500).trim();
    if (str(o.ask).trim()) t.ask = str(o.ask, 1000).trim();
    if (Object.keys(t).length) out.meta.checks[k] = t; });
  metaOf('checklist').forEach(([k, o]) => { const t = {};
    if (str(o.cat).trim()) t.cat = str(o.cat, 60).trim();
    if (BUILTIN_STAGES.includes(o.from)) t.from = o.from;
    if (str(o.why).trim()) t.why = str(o.why, 600).trim();
    if (Object.keys(t).length) out.meta.checklist[k] = t; });
  metaOf('patterns').forEach(([k, o]) => { const t = lever(o);
    if (['red','amber','green'].includes(o.sev)) t.sev = o.sev;
    if (RISKS_M.includes(o.risk)) t.risk = o.risk;
    if (str(o.why).trim()) t.why = str(o.why, 1500).trim();
    if (str(o.ask).trim()) t.ask = str(o.ask, 1000).trim();
    if (Object.keys(t).length) out.meta.patterns[k] = t; });
  const modelIds = a => a.filter(m => typeof m === 'string' && ID_RE.test(m)).slice(0, 12);
  metaOf('answers').forEach(([k, o]) => { const t = {};
    if (Array.isArray(o.models)) t.models = modelIds(o.models);
    if (Object.keys(t).length) out.meta.answers[k] = t; });
  metaOf('booleans').forEach(([k, o]) => { const t = {};
    if (str(o.note).trim()) t.note = str(o.note, 300).trim();
    if (DIMS_OK.includes(o.dim)) t.dim = o.dim;
    if (Array.isArray(o.models)) t.models = modelIds(o.models);
    if (Object.keys(t).length) out.meta.booleans[k] = t; });
  Object.entries(obj('formulas')).forEach(([k, v]) => { if (ID_RE.test(k) && !fxLong(v) && str(v, 1000).trim()) out.formulas[k] = str(v, 1000).trim(); });
  Object.entries(obj('metricWeights')).forEach(([k, w]) => { if (ID_RE.test(k) && isFinite(+w) && +w > 0) out.metricWeights[k] = +w; });
  Object.entries(obj('stageWeights')).forEach(([stg, o]) => {
    if (!['preseed','seed','a','b'].includes(stg) || !isObj(o)) return;
    const t = {}; Object.entries(o).forEach(([d, w]) => { if (ID_RE.test(d) && isFinite(+w) && +w >= 0) t[d] = +w; });
    out.stageWeights[stg] = t;
  });
  const arr = k => (Array.isArray(c[k]) ? c[k] : []).filter(isObj).slice(0, 300);
  const seen = new Set();
  out.fields = arr('fields').filter(f => ID_RE.test(str(f.id)) && !seen.has(f.id) && seen.add(f.id)).map(f => {
    const type = ['num','bool','select','txt'].includes(f.type) ? f.type : 'num';
    const o = { id:f.id, label:str(f.label, 300) || f.id, section:ID_RE.test(str(f.section)) ? f.section : 'custom', group:str(f.group, 120), type,
      hint:str(f.hint, 600), required:f.required === true, models:strList(f.models, 10) };
    if (type === 'num') { o.unit = str(f.unit, 12); o.chips = (Array.isArray(f.chips) ? f.chips : []).map(Number).filter(isFinite).slice(0, 12); }
    if (type === 'select') { o.options = (Array.isArray(f.options) ? f.options : str(f.options).split(',')).map(x => str(x, 200).trim()).filter(Boolean).slice(0, 50); if (o.options.length < 2) { o.type = 'txt'; delete o.options; }
      /* A scored answer: what each choice earns (0 to 100), in which dimension and with what weight. */
      else if (isObj(f.scores) && DIMS_OK.includes(f.dim)) {
        const sc = {}; o.options.forEach(op => { const v = f.scores[op]; if (v != null && v !== '' && isFinite(+v)) sc[op] = Math.min(100, Math.max(0, +v)); });
        if (Object.keys(sc).length) { o.scores = sc; o.dim = f.dim; o.weight = isFinite(+f.weight) && +f.weight > 0 ? Math.min(10, +f.weight) : 1; }
      } }
    return o;
  });
  out.metrics = arr('metrics').filter(m => !fxLong(m.formula) && ID_RE.test(str(m.key)) && !seen.has(m.key) && seen.add(m.key)).map(m => {
    const th = {}; if (isObj(m.thresholds)) ['preseed','seed','a','b'].forEach(stg => { const a = anchors4(m.thresholds[stg]); if (a) th[stg] = a; });
    return { key:m.key, label:str(m.label, 300) || m.key, formula:str(m.formula, 1000), unit:str(m.unit, 12), description:str(m.description, 600),
      dim:DIMS_OK.includes(m.dim) ? m.dim : '', dir:m.dir === 'lo' ? 'lo' : 'hi',
      weight:isFinite(+m.weight) && +m.weight > 0 ? +m.weight : 1, thresholds:th, models:strList(m.models, 10) };
  });
  out.checks = arr('checks').filter(k => !fxLong(k.computed)).map((k, i) => ({ id:safeItemId(k.id, 'k_', i), title:str(k.title, 300) || 'Custom check', stated:ID_RE.test(str(k.stated)) ? k.stated : '',
    computed:str(k.computed, 1000), unit:str(k.unit, 12), mode:k.mode === 'pts' ? 'pts' : 'rel',
    tol:Math.max(0, numOr(k.tol, k.mode === 'pts' ? 3 : 10)), hard:Math.max(0, numOr(k.hard, k.mode === 'pts' ? 8 : 25)),
    good:k.good === 'lo' ? 'lo' : 'hi', ask:str(k.ask, 1000), ...lever(k) })).filter(k => k.stated && k.computed);
  out.questions = arr('questions').filter(q => !fxLong(q.when)).map((q, i) => ({ id:safeItemId(q.id, 'q_', i), text:str(q.text, 1000), when:str(q.when, 1000),
    priority:['high','normal','low'].includes(q.priority) ? q.priority : 'normal', tag:str(q.tag, 120), ...lever(q) })).filter(q => q.text.trim());
  out.patterns = arr('patterns').filter(p => !fxLong(p.when)).map((p, i) => ({ id:safeItemId(p.id, 'p_', i), title:str(p.title, 300) || 'Custom pattern', sev:['red','amber','green'].includes(p.sev) ? p.sev : 'amber',
    when:str(p.when, 1000), evidence:str(p.evidence, 400), why:str(p.why, 1500), ask:str(p.ask, 1000),
    risk:['product','market','execution','financial','legal','deal'].includes(p.risk) ? p.risk : '', ...lever(p) })).filter(p => p.when.trim());
  out.checklist = arr('checklist').map((c, i) => ({ id:safeItemId(c.id, 'cl_', i), text:str(c.text, 600), category:str(c.category, 60),
    from:['preseed','seed','a','b'].includes(c.from) ? c.from : 'preseed', why:str(c.why, 600) })).filter(c => c.text.trim());
  out.requests = arr('requests').filter(r => !fxLong(r.when)).map((r, i) => ({ id:safeItemId(r.id, 'r_', i), text:str(r.text, 1000), when:str(r.when, 1000) })).filter(r => r.text.trim());
  const RISKS = ['product','market','execution','financial','legal','deal'];
  out.gates = arr('gates').filter(g => !fxLong(g.when)).map((g, i) => ({ id:safeItemId(g.id, 'g_', i), title:str(g.title, 300) || 'Deal-breaker', when:str(g.when, 1000), why:str(g.why, 1500), ask:str(g.ask, 1000),
    risk:RISKS.includes(g.risk) ? g.risk : '', ...lever(g) })).filter(g => g.when.trim());
  const numMap = (o, keyOk, lo, hi) => { const r = {}; if (isObj(o)) Object.entries(o).forEach(([k, v]) => { const n = +v; if (keyOk(k) && v !== '' && v != null && isFinite(n)) r[k] = Math.min(hi, Math.max(lo, n)); }); return r; };
  Object.entries(obj('checkTol')).forEach(([k, o]) => { if (!ID_RE.test(k) || !isObj(o)) return; const t = {};
    if (o.tol != null && o.tol !== '' && isFinite(+o.tol) && +o.tol >= 0) t.tol = +o.tol; if (o.hard != null && o.hard !== '' && isFinite(+o.hard) && +o.hard >= 0) t.hard = +o.hard;
    if (Object.keys(t).length) out.checkTol[k] = t; });
  Object.entries(obj('categorical')).forEach(([k, o]) => { if (!ID_RE.test(k) || !isObj(o)) return; const m = {};
    Object.entries(o).forEach(([opt, v]) => { if (str(opt).trim() && opt !== '__proto__' && isFinite(+v) && v !== '' && v != null) m[str(opt, 200)] = Math.min(100, Math.max(0, +v)); });
    if (Object.keys(m).length) out.categorical[k] = m; });
  out.booleans = numMap(c.booleans, k => /^[A-Za-z_][A-Za-z0-9_]{0,63}:(plus|minus)$/.test(k), 0, 50);
  Object.entries(obj('patternParams')).forEach(([k, o]) => { if (!ID_RE.test(k)) return; const m = numMap(o, kk => ID_RE.test(kk), -1e12, 1e12); if (Object.keys(m).length) out.patternParams[k] = m; });
  const dfl = obj('defaults'), D0 = {};
  const stageNums = (o, lo, hi) => { const r = {}; if (isObj(o)) ['preseed','seed','a','b'].forEach(st => { if (o[st] != null && o[st] !== '' && isFinite(+o[st])) r[st] = Math.min(hi, Math.max(lo, +o[st])); }); return r; };
  if (isObj(dfl.exit)) { const e = dfl.exit, x = {};
    const yrs = stageNums(e.years, 1, 20); if (Object.keys(yrs).length) x.years = yrs;
    const irr = stageNums(e.irr, 1, 200); if (Object.keys(irr).length) x.irr = irr;
    if (isObj(e.probs)) { const pr = {}; ['preseed','seed','a','b'].forEach(st => { const a = e.probs[st]; if (Array.isArray(a) && a.length === 3 && a.every(v => isFinite(+v) && +v >= 0) && a.some(v => +v > 0)) pr[st] = a.map(Number); }); if (Object.keys(pr).length) x.probs = pr; }
    ['fcRate','decayBase','decayUp','downMultiple'].forEach(k => { if (e[k] != null && e[k] !== '' && isFinite(+e[k])) x[k] = Math.min(k === 'downMultiple' ? 50 : 100, Math.max(0, +e[k])); });
    if (Object.keys(x).length) D0.exit = x; }
  if (isObj(dfl.deal)) { const e = dfl.deal, x = {};
    ['exit_multiple','dilution','pool_target'].forEach(k => { if (e[k] != null && e[k] !== '' && isFinite(+e[k])) x[k] = Math.min(k === 'exit_multiple' ? 200 : 90, Math.max(k === 'exit_multiple' ? 0.1 : 0, +e[k])); });
    const fr = stageNums(e.future_rounds, 0, 10); if (Object.keys(fr).length) x.future_rounds = fr;
    if (Object.keys(x).length) D0.deal = x; }
  if (isObj(dfl.sim)) { const e = dfl.sim, x = {};
    [['decay',0,25],['horizon',12,60],['buffer',0,24]].forEach(([k, lo, hi]) => { if (e[k] != null && e[k] !== '' && isFinite(+e[k])) x[k] = Math.min(hi, Math.max(lo, +e[k])); });
    if (Object.keys(x).length) D0.sim = x; }
  if (isObj(dfl.stageRange)) { const x = {}; ['preseed','seed','a','b'].forEach(st => { const r = dfl.stageRange[st]; if (isObj(r)) { const y = {};
      ['lo','hi'].forEach(k => { if (r[k] != null && r[k] !== '' && isFinite(+r[k]) && +r[k] >= 0) y[k] = +r[k]; }); if (Object.keys(y).length) x[st] = y; } }); if (Object.keys(x).length) D0.stageRange = x; }
  if (isObj(dfl.evidence)) { const x = {}; Object.entries(dfl.evidence).forEach(([k, v]) => { if ((k === '' || ID_RE.test(k) || k === 'unverified') && isFinite(+v) && v !== '' && v != null) x[k === 'unverified' ? 'unverified' : k] = Math.min(1, Math.max(0, +v)); }); if (Object.keys(x).length) D0.evidence = x; }
  out.defaults = D0;
  const mseen = new Set();
  out.models = arr('models').map(m => ({ id:str(m.id, 40), name:str(m.name, 60).trim(), desc:str(m.desc, 120), emoji:str(m.emoji, 16).replace(/[\x00-\x7F]/g, '').slice(0, 8) || '🧩',
      from:['saas','ai_app','marketplace','fintech'].includes(m.from) ? m.from : '', note:str(m.note, 400).trim() }))
    .filter(m => /^[a-z][a-z0-9_]{1,39}$/.test(m.id) && m.name && !['saas','ai_app','marketplace','fintech'].includes(m.id) && !mseen.has(m.id) && mseen.add(m.id)).slice(0, 12);
  out.benchmarks = arr('benchmarks').map((b, i) => ({ id:safeItemId(b.id, 'b_', i), metric:ID_RE.test(str(b.metric)) ? b.metric : '',
    stage:['all','preseed','seed','a','b'].includes(b.stage) ? b.stage : 'all',
    p25:isFinite(parseFloat(b.p25)) ? parseFloat(b.p25) : null, median:isFinite(parseFloat(b.median)) ? parseFloat(b.median) : null, p75:isFinite(parseFloat(b.p75)) ? parseFloat(b.p75) : null,
    source:str(b.source, 200), year:str(b.year, 12) })).filter(b => b.metric && b.median != null).map(orderQuartiles).slice(0, 500);
  return out;
}
const cfgHidden = (kind, id) => !!(CFG.hidden[kind] && CFG.hidden[kind].includes(id));

/* Load the published file. Works on GitHub Pages; silently skipped when the file is opened locally. */
async function loadPublishedConfig() {
  if (typeof fetch !== 'function' || (typeof location !== 'undefined' && location.protocol === 'file:')) return false;
  try {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 2500) : null;
    const res = await fetch(CONFIG_FILE + '?t=' + Date.now(), { cache:'no-store', signal:ctl ? ctl.signal : undefined });
    if (t) clearTimeout(t);
    if (!res.ok) return false;
    const text = await res.text();
    if (text.length > 2000000) return false;   /* a configuration is a few tens of kilobytes; refuse anything past 2 MB */
    CFG_PUBLISHED = normalizeConfig(JSON.parse(text));
    return true;
  } catch (e) { return false; }
}
/* The owner can preview an unpublished draft in their own browser only. */
function studioDraft() { try { const r = localStorage.getItem('vcr2-studio-draft'); return r ? normalizeConfig(JSON.parse(r)) : null; } catch (e) { return null; } }
function previewOn() { try { return localStorage.getItem('vcr2-studio-preview') === '1' && !!studioDraft(); } catch (e) { return false; } }
function effectiveConfig() { return previewOn() ? studioDraft() : CFG_PUBLISHED; }

/* ═══════════════════════════════════════════════════════════════
   SAFE FORMULA LANGUAGE — no eval, no access to anything but numbers.
   Grammar: numbers, 'text', identifiers, + − × ÷ ^, comparisons,
   and / or / not, and min max abs round sqrt if has coalesce.
   Missing values propagate as "no data" instead of becoming zero.
   ═══════════════════════════════════════════════════════════════ */
const FX_FUNCS = {
  min:(...a) => { const x = a.filter(v => typeof v === 'number'); return x.length ? Math.min(...x) : null; },
  max:(...a) => { const x = a.filter(v => typeof v === 'number'); return x.length ? Math.max(...x) : null; },
  abs:x => x == null ? null : Math.abs(x),
  round:(x, d) => x == null ? null : Math.round(x * Math.pow(10, d || 0)) / Math.pow(10, d || 0),
  sqrt:x => x == null || x < 0 ? null : Math.sqrt(x),
  has:x => (x != null && x !== '' ? 1 : 0),
  coalesce:(...a) => { for (const v of a) if (v != null) return v; return null; },
  if:null, /* handled lazily */
};
const FX_ARITY = { min:[1, Infinity], max:[1, Infinity], abs:[1, 1], round:[1, 2], sqrt:[1, 1], has:[1, 1], coalesce:[1, Infinity], if:[2, 3] };
function fxTokenize(src) {
  const t = [], s = String(src || '');
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9._]/.test(s[j])) j++; let raw = s.slice(i, j).replace(/_/g, '');
      if (s[j] === '%') { t.push({ t:'num', v:parseFloat(raw) }); i = j + 1; continue; }
      if (!/^\d*\.?\d+$|^\d+\.$/.test(raw)) throw new Error(`“${raw}” is not a number`); t.push({ t:'num', v:parseFloat(raw) }); i = j; continue; }
    if (/[A-Za-z_]/.test(c)) { let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++; const w = s.slice(i, j);
      const lw = w.toLowerCase(); if (lw === 'and' || lw === 'or' || lw === 'not') t.push({ t:'op', v:lw }); else if (lw === 'true' || lw === 'false') t.push({ t:'num', v:lw === 'true' ? 1 : 0 }); else t.push({ t:'id', v:w }); i = j; continue; }
    if (c === "'" || c === '"') { let j = i + 1; while (j < s.length && s[j] !== c) j++; if (j >= s.length) throw new Error('A text value is missing its closing quote'); t.push({ t:'str', v:s.slice(i + 1, j) }); i = j + 1; continue; }
    const two = s.slice(i, i + 2);
    if (['<=','>=','==','!=','&&','||'].includes(two)) { t.push({ t:'op', v: two === '&&' ? 'and' : two === '||' ? 'or' : two }); i += 2; continue; }
    if ('+-*/^()<>,!=×÷−'.includes(c)) { t.push({ t:'op', v: c === '×' ? '*' : c === '÷' ? '/' : c === '−' ? '-' : c === '!' ? 'not' : c === '=' ? '==' : c }); i++; continue; }
    throw new Error(`Unexpected character “${c}”`);
  }
  return t;
}
function fxParse(src) {
  const tk = fxTokenize(src); let p = 0;
  const peek = () => tk[p], isOp = v => tk[p] && tk[p].t === 'op' && tk[p].v === v;
  const expect = v => { if (!isOp(v)) throw new Error(`Expected “${v}”`); p++; };
  const orE = () => { let l = andE(); while (isOp('or')) { p++; l = { k:'or', l, r:andE() }; } return l; };
  const andE = () => { let l = notE(); while (isOp('and')) { p++; l = { k:'and', l, r:notE() }; } return l; };
  const notE = () => { if (isOp('not')) { p++; return { k:'not', e:notE() }; } return cmpE(); };
  const cmpE = () => { let l = addE(); const o = peek(); if (o && o.t === 'op' && ['<','<=','>','>=','==','!='].includes(o.v)) { p++; return { k:'cmp', o:o.v, l, r:addE() }; } return l; };
  const addE = () => { let l = mulE(); while (isOp('+') || isOp('-')) { const o = tk[p++].v; l = { k:'bin', o, l, r:mulE() }; } return l; };
  const mulE = () => { let l = unE(); while (isOp('*') || isOp('/')) { const o = tk[p++].v; l = { k:'bin', o, l, r:unE() }; } return l; };
  const unE = () => { if (isOp('-')) { p++; return { k:'neg', e:unE() }; } if (isOp('+')) { p++; return unE(); } return powE(); };
  const powE = () => { const b = prim(); if (isOp('^')) { p++; return { k:'bin', o:'^', l:b, r:unE() }; } return b; };
  const prim = () => {
    const x = peek(); if (!x) throw new Error('The formula ends too early');
    if (x.t === 'num') { p++; return { k:'num', v:x.v }; }
    if (x.t === 'str') { p++; return { k:'str', v:x.v }; }
    if (x.t === 'id') {
      p++;
      if (isOp('(')) {
        const fn = x.v.toLowerCase(); if (!Object.prototype.hasOwnProperty.call(FX_FUNCS, fn)) throw new Error(`Unknown function “${x.v}”`);
        p++; const args = [];
        if (!isOp(')')) { args.push(orE()); while (isOp(',')) { p++; args.push(orE()); } }
        expect(')');
        const [lo, hi] = FX_ARITY[fn];
        if (args.length < lo || args.length > hi) throw new Error(`${fn}() takes ${lo === hi ? lo : hi === Infinity ? 'at least ' + lo : lo + ' to ' + hi} value${hi === 1 ? '' : 's'}`);
        return { k:'fn', f:fn, args };
      }
      return { k:'id', v:x.v };
    }
    if (isOp('(')) { p++; const e = orE(); expect(')'); return e; }
    throw new Error(`Unexpected “${x.v}”`);
  };
  if (!tk.length) throw new Error('The formula is empty');
  const ast = orE();
  if (p < tk.length) throw new Error(`Unexpected “${tk[p].v}”`);
  return ast;
}
function fxIdents(ast, out = new Set()) {
  if (!ast) return out;
  if (ast.k === 'id') out.add(ast.v);
  ['l','r','e'].forEach(k => ast[k] && fxIdents(ast[k], out));
  (ast.args || []).forEach(a => fxIdents(a, out));
  return out;
}
const _fxCache = new Map();
function fxCompile(src) {
  if (_fxCache.has(src)) return _fxCache.get(src);
  let r;
  try { const ast = fxParse(src); r = { ok:true, ast, idents:Array.from(fxIdents(ast)) }; }
  catch (e) { r = { ok:false, error:e.message }; }
  _fxCache.set(src, r);
  return r;
}
function fxEval(ast, get) {
  const num = v => typeof v === 'number' && isFinite(v) ? v : (typeof v === 'boolean' ? (v ? 1 : 0) : null);
  const ev = n => {
    switch (n.k) {
      case 'num': return n.v;
      case 'str': return n.v;
      case 'id': return get(n.v);
      case 'neg': { const v = num(ev(n.e)); return v == null ? null : -v; }
      /* "No data" is neither true nor false: and/or/not follow three-valued logic. */
      case 'not': { const v = ev(n.e); return v == null ? null : (v ? 0 : 1); }
      case 'and': { const a = ev(n.l); if (a != null && !a) return 0; const b = ev(n.r); if (b != null && !b) return 0; return a == null || b == null ? null : 1; }
      case 'or': { const a = ev(n.l); if (a != null && a) return 1; const b = ev(n.r); if (b != null && b) return 1; return a == null || b == null ? null : 0; }
      case 'cmp': {
        const a = ev(n.l), b = ev(n.r);
        if (a == null || b == null) return null;
        if (typeof a === 'string' || typeof b === 'string') {
          const x = String(a).toLowerCase(), y = String(b).toLowerCase();
          return n.o === '==' ? +(x === y) : n.o === '!=' ? +(x !== y) : 0;
        }
        return +({ '<':a < b, '<=':a <= b, '>':a > b, '>=':a >= b, '==':a === b, '!=':a !== b })[n.o];
      }
      case 'bin': {
        const a = num(ev(n.l)), b = num(ev(n.r));
        if (a == null || b == null) return null;
        if (n.o === '+') return a + b; if (n.o === '-') return a - b; if (n.o === '*') return a * b;
        if (n.o === '/') return b === 0 ? null : a / b;
        if (n.o === '^') { const v = Math.pow(a, b); return isFinite(v) ? v : null; }
        return null;
      }
      case 'fn': {
        if (n.f === 'if') { const c = ev(n.args[0]); if (c == null) return null; return c ? ev(n.args[1]) : (n.args[2] ? ev(n.args[2]) : null); }
        const args = n.args.map(ev).map(v => typeof v === 'string' ? v : num(v));
        return FX_FUNCS[n.f](...args);
      }
    }
    return null;
  };
  const out = ev(ast);
  return typeof out === 'number' ? (isFinite(out) ? out : null) : typeof out === 'string' ? out : null;
}
/* Resolve an identifier against the current assessment. */
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
function fxGetter(D) {
  return name => {
    const clean = v => (typeof v === 'number' && isFinite(v)) || typeof v === 'string' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : null;
    if (own(D, name) && D[name] != null) return clean(D[name]);
    const lower = String(name).toLowerCase();
    if (lower === 'stage') return S.stage;
    if (lower === 'model') return S.model;
    if (lower === 'arr') return gv('arr_now');
    if (HIDDEN_IDS.has(name)) return null;
    if (own(S.bools, name) && S.bools[name] !== undefined) return S.bools[name] ? 1 : 0;
    if (own(S.sel, name) && S.sel[name]) return String(S.sel[name]);
    if (!own(S.vals, name)) return null;
    const v = gv(name); if (v != null) return v;
    const t = S.vals[name]; if (t != null && t !== '') return String(t);
    return null;
  };
}
function fxRun(src, D) {
  const c = fxCompile(src);
  if (!c.ok) return null;
  try { return fxEval(c.ast, fxGetter(D)); } catch (e) { return null; }
}
const fxTruthy = v => v != null && v !== 0 && v !== '' && v !== false;
/* Names a formula may use, for validation and the Studio's reference list. */
function knownIdentifiers(cfgLike) {
  const c = cfgLike || CFG, ids = new Map();
  BASE.sectionFields.forEach(b => { const sec = SECTIONS.find(s => s.id === b.id); b.fields.forEach(f => ids.set(f.id, { kind:'field', label:f.lbl, sec:sec ? sec.label : b.id, t:f.t })); });
  c.fields.forEach(f => ids.set(f.id, { kind:'custom field', label:f.label || f.id, sec:f.section, t:f.type }));
  Object.keys(BASE.dlabel).forEach(k => ids.set(k, { kind:'metric', label:BASE.dlabel[k] }));
  c.metrics.forEach(m => ids.set(m.key, { kind:'custom metric', label:m.label }));
  ['stage','model','arr'].forEach(k => ids.set(k, { kind:'special', label:k === 'arr' ? 'ARR today' : k === 'stage' ? "'preseed', 'seed', 'a' or 'b'" : "'saas', 'ai_app', 'marketplace' or 'fintech'" }));
  return ids;
}
function fxValidate(src, opts) {
  opts = opts || {};
  if (!String(src || '').trim()) return opts.optional ? { ok:true, empty:true } : { ok:false, error:'Enter a formula.' };
  /* A longer formula would be cut when published and stop working: refuse it here instead. */
  if (String(src).length > 1000) return { ok:false, error:`A formula can be at most 1,000 characters; this one has ${String(src).length}. Split it into two metrics.` };
  const c = fxCompile(src);
  if (!c.ok) return c;
  const known = knownIdentifiers(opts.cfg);
  const unknown = c.idents.filter(i => !known.has(i) && !(opts.self && i === opts.self) && !['stage','model','arr'].includes(i.toLowerCase()));
  if (unknown.length) return { ok:false, error:`Unknown name${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Use the reference list to pick field or metric names.` };
  if (opts.self && c.idents.includes(opts.self) && !opts.allowSelf) return { ok:false, error:'A metric cannot refer to itself.' };
  return c;
}

/* ═══════════════════════════════════════════════════════════════
   APPLYING THE CONFIGURATION
   Built-in defaults are captured once; every apply rebuilds from them,
   so publishing, previewing and discarding are always clean.
   ═══════════════════════════════════════════════════════════════ */
const BASE = {
  sectionFields: SECTIONS.map(s => ({ id:s.id, fields:s.fields.slice() })),
  minN: Object.assign({}, RUBRIC.minN),
  weights: JSON.parse(JSON.stringify(RUBRIC.weights)),
  nextStage: Object.assign({}, NEXT_STAGE_ARR),
  mw: Object.assign({}, MW),
  dlabel: Object.assign({}, DLABEL),
  dunit: Object.assign({}, DUNIT),
  exit: JSON.parse(JSON.stringify(EXIT_DEFAULTS)),
  deal: JSON.parse(JSON.stringify(DEAL_DEFAULTS)),
  assume: Object.assign({}, ASSUME_DEFAULTS),
  stageRange: JSON.parse(JSON.stringify(STAGE_RANGE)),
  stageText: STAGES.map(s => s.s),
  stages: STAGES.map(s => Object.assign({}, s)),
  stageName: Object.fromEntries(STAGES.map(s => [s.id, s.n])),
  evidence: EVIDENCE.map(e => e.w),
  models: MODELS.map(m => Object.assign({}, m)),
  evlabel: EVIDENCE.map(e => e.label),
  fmeta: Object.fromEntries(SECTIONS.flatMap(s => s.fields).map(f => [f.id, { chips:f.chips ? f.chips.slice() : undefined, g:f.g, unit:f.unit, req:f.req, options:f.options ? f.options.slice() : undefined }])),
  flabel: Object.fromEntries(SECTIONS.flatMap(s => s.fields).map(f => [f.id, f.lbl])),
  fhint: Object.fromEntries(SECTIONS.flatMap(s => s.fields).map(f => [f.id, f.hint])),
  slabel: Object.fromEntries(SECTIONS.map(s => [s.id, s.label])),
  sdesc: Object.fromEntries(SECTIONS.map(s => [s.id, s.desc])),
  dimlabel: Object.assign({}, DIM_LABEL),
  gtitle: Object.fromEntries(RUBRIC.gates.map(g => [g.id, g.title])),
};
const CUSTOM_SECTION = { id:'custom', label:'Additional evidence', em:'➕', ibg:'#11202a',
  desc:'Fields added by the owner in the Studio. They feed the custom metrics, checks, questions and patterns.', fields:[] };
const UNIT_MAP = { '$':'$', '%':'%', 'x':'x', 'months':'mo', 'mo':'mo', 'pts':'pts', 'count':'n', 'n':'n', '':'' };

function applyConfig(cfg) {
  try { applyConfigUnsafe(normalizeConfig(cfg || effectiveConfig())); }
  catch (e) {
    if (typeof console !== 'undefined') console.warn('VCR2: configuration ignored:', e && e.message);
    applyConfigUnsafe(EMPTY_CONFIG());
  }
  if (typeof applyLook === 'function') applyLook();
  if (typeof txRefresh === 'function') { try { txRefresh(); } catch (e) { if (typeof console !== 'undefined') console.warn('VCR2: text replacements not applied:', e && e.message); } }
}
function applyConfigUnsafe(cfg) {
  CFG = cfg;
  /* Fields and the optional custom section */
  /* A field placed in a section that no longer exists goes to the custom section. */
  CFG.fields.forEach(f => { if (f.section !== 'custom' && !BASE.sectionFields.some(b => b.id === f.section)) f.section = 'custom'; });
  const wantsCustom = CFG.fields.some(f => f.section === 'custom' && !k_builtin(f.id));
  const ci = SECTIONS.findIndex(s => s.id === 'custom');
  if (wantsCustom && ci < 0) SECTIONS.splice(SECTIONS.findIndex(s => s.id === 'claims'), 0, CUSTOM_SECTION);
  if (!wantsCustom && ci >= 0) SECTIONS.splice(ci, 1);
  CUSTOM_SECTION.label = (CFG.branding.customSectionLabel || '').trim() || 'Additional evidence';
  SECTIONS.forEach(sec => {
    const base = BASE.sectionFields.find(b => b.id === sec.id);
    sec.fields = (base ? base.fields.slice() : []).concat(CFG.fields.filter(f => f.section === sec.id && !k_builtin(f.id)).map(customField));
  });
  /* Switched-off fields, directly or through their section, read as empty everywhere. */
  HIDDEN_IDS = new Set(CFG.hidden.fields);
  BASE.sectionFields.forEach(b => { if (CFG.hidden.sections.includes(b.id)) b.fields.forEach(f => HIDDEN_IDS.add(f.id)); });
  /* Renamed built-in fields */
  BASE.sectionFields.forEach(b => b.fields.forEach(f => {
    const l = CFG.labels.fields[f.id], h = CFG.labels.hints[f.id];
    f.lbl = (typeof l === 'string' && l.trim()) ? l.trim() : BASE.flabel[f.id];
    const hint = (typeof h === 'string' && h.trim()) ? h.trim() : BASE.fhint[f.id];
    if (hint) f.hint = hint; else delete f.hint;
  }));
  /* Renamed sections, dimensions and built-in deal-breakers */
  const lb = (kind, id, base) => { const l = CFG.labels[kind] && CFG.labels[kind][id]; return (typeof l === 'string' && l.trim()) ? l.trim() : base; };
  SECTIONS.forEach(sec => { if (sec.id in BASE.slabel) sec.label = lb('sections', sec.id, BASE.slabel[sec.id]); });
  SECTIONS.forEach(sec => { if (sec.id in BASE.sdesc) { const d = CFG.labels.sdescs && CFG.labels.sdescs[sec.id]; sec.desc = (typeof d === 'string' && d.trim()) ? d.trim() : BASE.sdesc[sec.id]; } });
  Object.keys(DIM_LABEL).forEach(k => { if (!(k in BASE.dimlabel)) delete DIM_LABEL[k]; });
  Object.keys(BASE.dimlabel).forEach(k => DIM_LABEL[k] = lb('dims', k, BASE.dimlabel[k]));
  CFG.dimensions.forEach(d => { DIM_LABEL[d.id] = lb('dims', d.id, d.label); });
  RUBRIC.gates.forEach(g => g.title = lb('gates', g.id, BASE.gtitle[g.id]));
  /* Metric labels, units and weights */
  Object.keys(DLABEL).forEach(k => { if (!(k in BASE.dlabel)) delete DLABEL[k]; });
  Object.keys(BASE.dlabel).forEach(k => { const l = CFG.labels.metrics[k]; DLABEL[k] = (typeof l === 'string' && l.trim()) ? l.trim() : BASE.dlabel[k]; });
  Object.keys(DUNIT).forEach(k => { if (!(k in BASE.dunit)) delete DUNIT[k]; });
  Object.keys(BASE.dunit).forEach(k => { const u = CFG.labels.units && CFG.labels.units[k]; DUNIT[k] = (typeof u === 'string' && u in UNIT_MAP && u !== '') ? UNIT_MAP[u] : BASE.dunit[k]; });
  Object.keys(MW).forEach(k => { if (!(k in BASE.mw)) delete MW[k]; else MW[k] = BASE.mw[k]; });
  CFG.metrics.forEach(m => { if (k_builtin(m.key)) return; DLABEL[m.key] = m.label; DUNIT[m.key] = UNIT_MAP[m.unit] != null ? UNIT_MAP[m.unit] : ''; MW[m.key] = m.weight > 0 ? m.weight : 1; });
  Object.entries(CFG.metricWeights).forEach(([k, w]) => { if (k in RUBRIC.thresholds && isFinite(+w) && +w > 0) MW[k] = +w; });
  /* Settings */
  Object.assign(RUBRIC.minN, BASE.minN, numericOnly(CFG.settings.minN));
  Object.keys(RUBRIC.weights).forEach(st => {
    const o = CFG.stageWeights[st];
    RUBRIC.weights[st] = Object.assign({}, BASE.weights[st]);
    /* A dimension the owner added starts at a tenth of the headline unless the owner sets its weight for this stage. */
    const customW = {}; CFG.dimensions.forEach(d => { customW[d.id] = 0.1; });
    if ((o && typeof o === 'object') || CFG.dimensions.length) {
      const merged = Object.assign({}, BASE.weights[st], customW, numericOnly(o || {}));
      const tot = sum(Object.values(merged));
      if (tot > 0) Object.keys(merged).forEach(k => merged[k] = merged[k] / tot);
      RUBRIC.weights[st] = merged;
    }
  });
  Object.assign(NEXT_STAGE_ARR, BASE.nextStage);
  const ns = CFG.settings.nextStage || {};
  Object.keys(ns).forEach(k => { const v = parseNum(ns[k]); if (v != null) NEXT_STAGE_ARR[k] = v; });
  applyDefaults();
  applyStages();
  applyMeta();
  /* Business models: the four built in, plus the owner's own. */
  MODELS.length = 0;
  BASE.models.forEach(m => { const l = CFG.labels.models && CFG.labels.models[m.id], c = CFG.labels.calib && CFG.labels.calib[m.id];
    MODELS.push(Object.assign({}, m, { n:(typeof l === 'string' && l.trim()) ? l.trim() : m.n, note:(typeof c === 'string' && c.trim()) ? c.trim() : null, hidden:cfgHidden('models', m.id) })); });
  CFG.models.forEach(m => MODELS.push({ id:m.id, em:m.emoji || '🧩', n:m.name, s:m.desc || 'Added in the Studio', calib:'custom', custom:true, from:m.from || '', note:m.note || null, hidden:cfgHidden('models', m.id) }));
  RUNWAY_CAP = sx('runwayCap'); BM_CAP = sx('burnMultipleCap'); PAYBACK_CAP = sx('paybackCap'); QR_CAP = sx('quickRatioCap');
  EV_PRIOR = sx('evidencePivot'); EV_CONTESTED = sx('contestedEvidence'); MONEY_SYMBOL = sx('currency');
  if (typeof CAL_MIN !== 'undefined') CAL_MIN = sx('calMin');
  _cfgThCache = null; _calCache = null; _fxCache.clear();
  if (typeof _ledgerCache !== 'undefined') _ledgerCache.clear();   /* forensic thresholds are settings: ledger results depend on them */
  /* A stage the owner removed falls back to Seed rather than breaking a saved assessment. */
  if (typeof S !== 'undefined' && S && S.wantStage && STAGES.some(s => s.id === S.wantStage)) { S.stage = S.wantStage; delete S.wantStage; }
  if (typeof S !== 'undefined' && S && S.stage && !STAGES.some(s => s.id === S.stage)) S.stage = 'seed';
  applyBranding();
}
/* Details of built-in items the owner can change: field quick-picks, choices, group and unit; deal-breaker text and trigger; checklist category,
   starting stage and reason. (Patterns and yes/no answers are read where they are used.) */
let _gaskBase = null, _dilBase = null;
function applyMeta() {
  const M = CFG.meta || { fields:{}, gates:{}, checklist:{}, patterns:{}, booleans:{} };
  BASE.sectionFields.forEach(b => b.fields.forEach(f => {
    const base = BASE.fmeta[f.id] || {}, o = M.fields[f.id] || {};
    f.chips = o.chips && o.chips.length ? o.chips.slice() : base.chips;
    if (f.chips === undefined) delete f.chips;
    f.g = o.group || base.g;
    if (f.t === 'num') f.unit = o.unit ? UNIT_MAP[o.unit] : base.unit;
    if (typeof o.required === 'boolean') f.req = o.required; else if (base.req === undefined) delete f.req; else f.req = base.req;
    if (base.options) f.options = base.options.concat((o.addOptions || []).filter(x => !base.options.includes(x)));
  }));
  if (typeof GATE_ASK !== 'undefined') { if (!_gaskBase) _gaskBase = Object.assign({}, GATE_ASK); Object.keys(_gaskBase).forEach(k => { GATE_ASK[k] = (M.gates[k] && M.gates[k].ask) || _gaskBase[k]; }); }
  RUBRIC.gates.forEach(g => { if (!BASE.gwhy) BASE.gwhy = {}; if (!BASE.gwhen) BASE.gwhen = {};
    if (!(g.id in BASE.gwhy)) { BASE.gwhy[g.id] = g.why; BASE.gwhen[g.id] = g.when; }
    g.why = (M.gates[g.id] && M.gates[g.id].why) || BASE.gwhy[g.id];
    g.when = M.gates[g.id] && typeof M.gates[g.id].when === 'boolean' ? M.gates[g.id].when : BASE.gwhen[g.id]; });
  if (typeof DILIGENCE !== 'undefined') { if (!_dilBase) _dilBase = DILIGENCE.map(d => ({ cat:d.cat, from:d.from, why:d.why }));
    DILIGENCE.forEach((d, i) => { const o = M.checklist[d.id] || {}, b = _dilBase[i]; d.cat = o.cat || b.cat; d.from = o.from || b.from; if (o.why || b.why) d.why = o.why || b.why; else delete d.why; }); }
}
/* Stages: the four built in, plus the owner's own. A custom stage is scored with the bars, weights, next-stage bar and deal
   defaults of the built-in stage it is "like", and shows its own name and ARR range. */
function applyStages() {
  const ranges = STAGES.slice(0, 4).map(s => s.s);   /* the range text applyDefaults just set */
  STAGES.length = 0; BASE.stages.forEach((s, i) => STAGES.push(Object.assign({}, s, { s:ranges[i] != null ? ranges[i] : s.s })));
  ['preseed','seed','a','b'].forEach((st, i) => { STAGES[i].hidden = cfgHidden('stages', st); STAGES[i].n = (CFG.labels.stages && typeof CFG.labels.stages[st] === 'string' && CFG.labels.stages[st].trim()) ? CFG.labels.stages[st].trim() : BASE.stageName[st]; });
  Object.keys(STAGE_RANGE).forEach(k => { if (!['preseed','seed','a','b'].includes(k)) delete STAGE_RANGE[k]; });
  CFG.stages.forEach(s => {
    const t = s.lo && s.hi ? `${money(s.lo)} to ${money(s.hi)} ARR` : s.hi ? `< ${money(s.hi)} ARR` : s.lo ? `${money(s.lo)}+ ARR` : (s.desc || 'Added in the Studio');
    STAGES.push({ id:s.id, n:s.name, s:s.desc || t, custom:true, like:s.like });
    STAGE_RANGE[s.id] = { lo:s.lo != null ? s.lo : STAGE_RANGE[s.like].lo, hi:s.hi != null ? s.hi : STAGE_RANGE[s.like].hi };
  });
}
/* The built-in stage whose bars, weights and defaults a stage uses (a built-in stage is its own). */
function stageKey(id) {
  const x = id == null ? S.stage : id;
  if (['preseed','seed','a','b'].includes(x)) return x;
  const c = (CFG.stages || []).find(s => s.id === x);
  return c ? c.like : x;
}
/* A custom name may never shadow a built-in field or metric. */
const k_builtin = id => (id in BASE.dlabel) || (id in BASE.flabel) || (id in RUBRIC.thresholds);
/* Defaults used whenever a field is left blank, reset from the built-ins on every apply. */
function applyDefaults() {
  const d = CFG.defaults || {};
  const ex = JSON.parse(JSON.stringify(BASE.exit));
  ex.floorBase = sx('exitFloorBase'); ex.floorUp = sx('exitFloorUp');
  if (d.exit) {
    if (d.exit.years) Object.assign(ex.years, d.exit.years);
    if (d.exit.irr) Object.assign(ex.irr, d.exit.irr);
    if (d.exit.probs) Object.assign(ex.probs, d.exit.probs);
    if (d.exit.fcRate != null) ex.fcRate = d.exit.fcRate;
    if (d.exit.decayBase != null) ex.keepBase = 1 - d.exit.decayBase / 100;
    if (d.exit.decayUp != null) ex.keepUp = 1 - d.exit.decayUp / 100;
    if (d.exit.downMultiple != null) ex.downMultiple = d.exit.downMultiple;
  }
  Object.keys(EXIT_DEFAULTS).forEach(k => delete EXIT_DEFAULTS[k]); Object.assign(EXIT_DEFAULTS, ex);
  const dl = JSON.parse(JSON.stringify(BASE.deal));
  if (d.deal) { ['exit_multiple','dilution','pool_target'].forEach(k => { if (d.deal[k] != null) dl[k] = d.deal[k]; }); if (d.deal.future_rounds) Object.assign(dl.future_rounds, d.deal.future_rounds); }
  Object.keys(DEAL_DEFAULTS).forEach(k => delete DEAL_DEFAULTS[k]); Object.assign(DEAL_DEFAULTS, dl);
  Object.assign(ASSUME_DEFAULTS, BASE.assume, d.sim || {});
  ['preseed','seed','a','b'].forEach((st, i) => {
    STAGE_RANGE[st] = Object.assign({}, BASE.stageRange[st], (d.stageRange && d.stageRange[st]) || {});
    const r = STAGE_RANGE[st], changed = d.stageRange && d.stageRange[st];
    if (r.lo != null && r.hi != null && r.lo > r.hi) STAGE_RANGE[st] = Object.assign({}, BASE.stageRange[st]);   /* inconsistent: keep the built-in range */
    STAGES[i].s = !changed ? BASE.stageText[i] : r.lo && r.hi ? `${money(r.lo)} to ${money(r.hi)} ARR` : r.hi ? `< ${money(r.hi)} ARR` : r.lo ? `${money(r.lo)}+ ARR` : BASE.stageText[i];
  });
  EVIDENCE.forEach((e, i) => { const k = e.id === '' ? 'unverified' : e.id; e.w = d.evidence && d.evidence[k] != null ? d.evidence[k] : BASE.evidence[i];
    const l = CFG.labels.evidence && CFG.labels.evidence[k]; e.label = (typeof l === 'string' && l.trim()) ? l.trim() : BASE.evlabel[i]; });
  /* Hints that quote a default follow the value in force (unless the owner rewrote the hint). */
  const byStage = o => `${o.preseed} pre-seed, ${o.seed} seed, ${o.a} Series A, ${o.b} Series B+`;
  const pc = x => Math.round((1 - x) * 100);
  const H = {
    years_to_exit:`Defaults by stage: ${byStage(ex.years)}.`,
    target_irr:`The VC Method’s discount rate, applied to the success (upside) case. It is high because it carries the risk of failure; early-stage investors typically use 40 to 60%. Defaults by stage: ${byStage(ex.irr).replace(/(\d+) /g, '$1% ')}.`,
    fc_rate:`First Chicago Method. The downside case already carries the failure risk, so the rate is lower. Default ${ex.fcRate}%.`,
    exit_arr_base:`Blank = today’s ARR grown at today’s growth rate, decaying ${pc(ex.keepBase)}% a year.`,
    exit_arr_up:`Blank = the same path with growth decaying ${pc(ex.keepUp)}% a year, the “if it works” case.`,
    exit_value_down:`Blank = a sale at ${ex.downMultiple}× today’s ARR. Enter 0 for a wind-down.`,
    exit_multiple_assumption:`Your assumption, not a market fact. Turns an exit value into the ARR it requires. Blank = ${dl.exit_multiple}×.`,
    future_rounds:`Blank = ${byStage(dl.future_rounds)}.`,
    dilution_per_round:`Blank = ${dl.dilution}%.`,
    pool_target_post:`Any top-up needed to reach this is carved out of the pre-money. Blank = ${dl.pool_target}%.`,
  };
  BASE.sectionFields.forEach(b => b.fields.forEach(f => { if (H[f.id] && !(CFG.labels && CFG.labels.hints && CFG.labels.hints[f.id])) f.hint = H[f.id]; }));
}
function numericOnly(o) { const r = {}; Object.entries(o || {}).forEach(([k, v]) => { const n = parseNum(v); if (n != null) r[k] = n; }); return r; }
function customField(f) {
  const out = { id:f.id, lbl:f.label || f.id, t:f.type || 'num', g:f.group || 'Added in the Studio', hint:f.hint || '', _custom:true };
  if (out.t === 'num') out.unit = f.unit || '';
  if (out.t === 'select') out.options = (Array.isArray(f.options) ? f.options : String(f.options || '').split(',')).map(x => String(x).trim()).filter(Boolean);
  if (f.required) out.req = true;
  if (Array.isArray(f.models) && f.models.length) out.models = f.models.slice();
  if (Array.isArray(f.chips) && f.chips.length) out.chips = f.chips.map(Number).filter(isFinite);
  return out;
}
const blockAfter = () => { const v = parseNum(CFG.settings.blockAfter); return v != null && v >= 1 ? Math.round(v) : 3; };
function applyBranding() {
  if (typeof document === 'undefined' || !document.querySelector) return;
  const b = CFG.branding || {};
  const set = (sel, v) => { const el = document.querySelector(sel); if (el && v && String(v).trim()) el.textContent = String(v); };
  const h1 = document.querySelector('.intro-h1');
  if (h1 && !h1.dataset.orig) h1.dataset.orig = h1.innerHTML;
  /* *word* in the owner's headline gets the highlight mark (the text is escaped first). */
  if (h1) { if (b.headline && String(b.headline).trim()) h1.innerHTML = esc(b.headline).replace(/\*([^*]{1,60})\*/g, '<span class="mark">$1</span>'); else if (h1.dataset.orig) h1.innerHTML = h1.dataset.orig; }
  const keep = (sel, key) => { const el = document.querySelector(sel); if (!el) return; if (!el.dataset.orig) el.dataset.orig = el.textContent; el.textContent = (b[key] && String(b[key]).trim()) ? b[key] : el.dataset.orig; };
  keep('.intro-sub', 'subtitle'); keep('.intro-note', 'note'); keep('.sb-logo-name', 'appName'); keep('.hero-kicker', 'kicker');
  /* The browser-tab title: the owner's words, or the built-in one again. */
  if (APP_TITLE_ORIG == null) APP_TITLE_ORIG = document.title;
  document.title = (b.pageTitle && String(b.pageTitle).trim()) ? String(b.pageTitle).trim() : APP_TITLE_ORIG;
}
let APP_TITLE_ORIG = null;

/* Thresholds after owner overrides, custom metrics and hidden metrics. */
let _cfgThCache = null;
function configuredThresholds() {
  if (_cfgThCache) return _cfgThCache;
  const th = {};
  Object.entries(RUBRIC.thresholds).forEach(([k, cfg]) => {
    if (cfgHidden('metrics', k)) return;
    const c = Object.assign({}, cfg), o = CFG.thresholds[k];
    if (o && typeof o === 'object') ['preseed','seed','a','b'].forEach(st => {
      if (o[st] === null) c[st] = null;
      else if (Array.isArray(o[st]) && o[st].length === 4 && o[st].every(x => isFinite(+x))) c[st] = o[st].map(Number);
    });
    if (o && o.dim) c.dim = o.dim;
    if (o && Array.isArray(o.models)) { if (o.models.length) c.models = o.models.slice(); else delete c.models; }
    if (o && cfg.dir === 'band') { if (o.ideal) c.ideal = o.ideal.slice(); if (o.hard) c.hard = o.hard.slice(); }
    if (o && typeof o === 'object') { c._owner = true; if (o.note) c._note = o.note; }
    th[k] = c;
  });
  CFG.metrics.forEach(m => {
    if (!m.dim || !(m.dir === 'hi' || m.dir === 'lo') || k_builtin(m.key)) return;
    const c = { dir:m.dir, dim:m.dim, _custom:true };
    if (Array.isArray(m.models) && m.models.length) c.models = m.models.slice();
    ['preseed','seed','a','b'].forEach(st => { const a = (m.thresholds || {})[st]; c[st] = Array.isArray(a) && a.length === 4 && a.every(x => x !== '' && isFinite(+x)) ? a.map(Number) : null; });
    if (['preseed','seed','a','b'].some(st => c[st])) th[m.key] = c;
  });
  _cfgThCache = th;
  return th;
}
/* A short signature of everything in the config that changes scores — part of the rubric version. */
function configSignature() {
  const tNoNotes = {}; Object.entries(CFG.thresholds).forEach(([k, o]) => { const c = Object.assign({}, o); delete c.note; tNoNotes[k] = c; });
  const stSig = Object.assign({}, CFG.settings); delete stSig.aiModels;   /* a model name changes no score */
  ['displayStrong', 'displayMixed', 'earlyReadBelow', 'currency'].forEach(k => delete stSig[k]);   /* how a figure is worded or shown changes no score and must not reseed the simulation */
  const s = { fo:CFG.formulas, sx:stSig, un:CFG.labels.units,
    dm:CFG.dimensions.map(d => d.id), mf:CFG.models.map(m => [m.id, m.from || '']), sg:CFG.stages.map(x => [x.id, x.like, x.lo, x.hi]),
    mb:CFG.meta.booleans, ma:CFG.meta.answers, mg:Object.entries(CFG.meta.gates).filter(([, o]) => typeof o.when === 'boolean').map(([k, o]) => [k, o.when]), h:CFG.hidden, t:tNoNotes, w:CFG.metricWeights, g:CFG.gates.map(g => [g.id, g.when]), ct:CFG.checkTol, cat:CFG.categorical, b:CFG.booleans,
    ev:(CFG.defaults || {}).evidence || null, sw:CFG.stageWeights, st:{ minN:CFG.settings.minN, blockAfter:CFG.settings.blockAfter, ev:CFG.settings.evidenceMode, ltv:CFG.settings.ltvCapYears, corr:CFG.settings.correlationCap },
    m:CFG.metrics.map(m => [m.key, m.formula, m.dim, m.dir, m.weight, m.thresholds, m.models]), f:CFG.fields.map(f => [f.id, f.scores || null, f.dim || null, f.weight || null, f.models || null]), c:CFG.checks };
  s.h = Object.assign({}, s.h); delete s.h.checklist;   /* the checklist never changes a score */
  Object.keys(s.h).forEach(k => s.h[k] = s.h[k].slice().sort());   /* switch-off order does not matter */
  const j = canonJSON(s);
  if (!CFG.metrics.length && !CFG.fields.length && !CFG.checks.length && !Object.keys(CFG.thresholds).length && !Object.keys(CFG.metricWeights).length
      && !CFG.gates.length && !Object.keys(CFG.checkTol).length && !Object.keys(CFG.categorical).length && !Object.keys(CFG.booleans).length && !((CFG.defaults || {}).evidence)
      && !Object.keys(CFG.stageWeights).length && !Object.keys(CFG.formulas).length && !Object.keys(stSig).length && !Object.keys(CFG.labels.units).length
      && !CFG.dimensions.length && !CFG.stages.length && !CFG.models.some(m => m.from) && !Object.keys(CFG.meta.booleans).length && !Object.keys(CFG.meta.answers).length && !Object.keys(s.mg).length
      && !Object.entries(CFG.hidden).some(([k, a]) => k !== 'checklist' && a.length)) return null;
  return seedFrom(j).toString(16).slice(0, 6);
}

/* ── Hooks used by the engine ── */
/* Custom metrics may use each other: evaluate in dependency order, each exactly once.
   Metrics caught in a cycle are left as "no data". */
function customMetricOrder(metrics, skipKey) {
  const list = metrics.filter(m => m.key && m.formula && m.key !== skipKey), keys = new Set(list.map(m => m.key));
  const deps = new Map(list.map(m => { const c = fxCompile(m.formula); return [m.key, c.ok ? c.idents.filter(i => keys.has(i) && i !== m.key) : []]; }));
  const order = [], state = new Map();
  const visit = k => { if (state.get(k) === 2) return true; if (state.get(k) === 1) return false; state.set(k, 1);
    const ok = deps.get(k).every(visit); state.set(k, ok ? 2 : 3); if (ok) order.push(k); return ok; };
  list.forEach(m => { if (!state.has(m.key)) visit(m.key); });
  const byKey = new Map(list.map(m => [m.key, m]));
  return order.map(k => byKey.get(k));
}
function evalCustomMetrics(D, metrics, skipKey) {
  const done = new Set();
  customMetricOrder(metrics, skipKey).forEach(m => {
    const v = fxRun(m.formula, D);
    if (typeof v === 'number' && isFinite(v)) { D[m.key] = v; done.add(m.key); } else delete D[m.key];
  });
  return done;
}
function cfgDerive(D, F) {
  CFG.hidden.metrics.forEach(k => { delete D[k]; delete F[k]; });
  /* The owner's formula for a built-in metric replaces its calculation (it can still read the built-in value by its own name). */
  const own = Object.entries(CFG.formulas || {}).filter(([k, f]) => k in BASE.dlabel && f && !cfgHidden('metrics', k)).map(([k, f]) => ({ key:k, formula:f }));
  const done = evalCustomMetrics(D, own.concat(CFG.metrics.filter(m => !k_builtin(m.key))));
  own.forEach(m => { if (done.has(m.key)) F[m.key] = 'Your formula: ' + m.formula; else { delete D[m.key]; delete F[m.key]; } });
  CFG.metrics.forEach(m => { if (done.has(m.key)) F[m.key] = (m.description ? m.description + ': ' : '') + m.formula; });
}
/* The built-in business model a model behaves like: itself, or the one an owner-added model starts from. */
function modelKey(id) {
  const x = id == null ? S.model : id;
  const m = (CFG.models || []).find(c => c.id === x);
  return m && m.from ? m.from : x;
}
const CHECK_FAMILY = id => id.startsWith('ledger_') ? 'ledger' : id.startsWith('conc_') ? 'conc' : id.startsWith('series_') ? id : id;
function cfgChecks(out, D) {
  const kept = out.filter(c => !cfgHidden('checks', CHECK_FAMILY(c.id)) && !cfgHidden('checks', c.id));
  kept.forEach(c => { const t = CFG.labels.checks && (CFG.labels.checks[c.id] || CFG.labels.checks[CHECK_FAMILY(c.id)]); if (typeof t === 'string' && t.trim() && !c.custom) c.title = t.trim(); });
  /* The explanation and the question of a built-in check can be reworded (a check that passed has neither). */
  const mc = (CFG.meta && CFG.meta.checks) || {};
  kept.forEach(c => {
    if (c.custom || c.sev === 'ok') return;
    const o = mc[c.id] || mc[CHECK_FAMILY(c.id)];
    if (!o) return;
    if (o.text) c.text = o.text;
    if (o.ask) c.ask = o.ask;
  });
  CFG.checks.forEach(ck => {
    if (cfgHidden('checks', ck.id)) return;
    const st = gv(ck.stated);
    const cp = ck.computed ? (fxRun(ck.computed, D)) : null;
    if (!has(st, cp) || typeof cp !== 'number') return;
    const abs = Math.abs(st - cp), rel = Math.abs(cp) > 0 ? abs / Math.abs(cp) * 100 : (abs === 0 ? 0 : 100);
    const pts = ck.mode === 'pts', off = pts ? abs : rel;
    const tol = ck.tol != null && isFinite(+ck.tol) ? +ck.tol : (pts ? 3 : 10), hard = ck.hard != null && isFinite(+ck.hard) ? Math.max(+ck.hard, tol) : tol * 2.5;
    const fmt = v => ck.unit === '$' ? money(v) : ck.unit === '%' ? pctv(v) : ck.unit === 'x' ? xv(v) : (Math.round(v * 100) / 100).toString();
    if (off <= tol) { kept.push({ id:ck.id, sev:'ok', title:ck.title, stated:fmt(st), computed:fmt(cp), delta:'within tolerance', custom:true }); return; }
    kept.push({ id:ck.id, sev: off > hard ? 'major' : 'minor', title:ck.title, stated:fmt(st), computed:fmt(cp), custom:true,
      delta:(pts ? abs.toFixed(1) + ' pts' : rel.toFixed(0) + '%') + (st > cp ? ' overstated' : ' understated'),
      flatter: ck.good === 'lo' ? st < cp : st > cp, rawStated:st, rawComputed:cp,
      text:`The stated figure is ${fmt(st)}; recomputing it gives ${fmt(cp)}.`, ask:ck.ask || null });
  });
  return kept;
}
const PRIORITY_P = { high:0.5, normal:2.5, low:3.8 };   /* high = right after gates, before contradictions */
function cfgQuestions(q, D) {
  const kept = q.filter(x => !x.fam || !cfgHidden('questions', x.fam));
  CFG.questions.forEach(cq => {
    if (!cq.text) return;
    if (cq.when && String(cq.when).trim() && !fxTruthy(fxRun(cq.when, D))) return;
    kept.push({ p:PRIORITY_P[cq.priority] || 2.5, tag:(cq.tag && cq.tag.trim()) || 'Your question', text:cq.text, fam:'custom', custom:true, ...(cq.lever ? { lever:cq.lever } : {}) });
  });
  return kept.sort((a, b) => a.p - b.p);
}
function cfgRequests(list, D) {
  const kept = list.filter(r => !cfgHidden('requests', r.id)).map(r => r.text);
  CFG.requests.forEach(cr => {
    if (!cr.text) return;
    if (cr.when && String(cr.when).trim() && !fxTruthy(fxRun(cr.when, D))) return;
    if (!kept.includes(cr.text)) kept.push(cr.text);
  });
  return kept;
}
function cfgPatterns(out, D) {
  const kept = out.filter(p => !cfgHidden('patterns', p.id));
  kept.forEach(p => { const t = CFG.labels.patterns && CFG.labels.patterns[p.id]; if (typeof t === 'string' && t.trim()) p.title = t.trim();
    const m = !p.custom && CFG.meta.patterns[p.id];
    if (m) { if (m.sev) p.sev = m.sev; if (m.why) p.why = m.why; if (m.ask) p.ask = m.ask; if (m.risk) p.risk = m.risk; } });
  CFG.patterns.forEach(cp => {
    if (!cp.when || !fxTruthy(fxRun(cp.when, D))) return;
    const ev = (cp.evidence || '').split(',').map(s => s.trim()).filter(Boolean).map(name => {
      const v = fxRun(name, D); if (v == null) return null;
      const lbl = DLABEL[name] || (ALL_FIELDS().find(f => f.id === name) || {}).lbl || name;
      return `${lbl} ${typeof v === 'number' ? (DUNIT[name] ? dfmt(name, v) : (Math.round(v * 100) / 100)) : v}`;
    });
    kept.push({ sev:['red','amber','green'].includes(cp.sev) ? cp.sev : 'amber', id:cp.id, title:cp.title || 'Custom pattern', evidence:ev.filter(Boolean),
      why:cp.why || '', ask:cp.ask || null, custom:true, risk:cp.risk || null });
  });
  const order = { red:0, amber:1, green:2 };
  return kept.sort((a, b) => order[a.sev] - order[b.sev]);
}
const activeForensics = LED => LED ? LED.forensics.filter(f => !cfgHidden('forensics', f.id)) : [];

/* Catalogue of built-in items the Studio can switch off. */
const BUILTIN = {
  gates:[['ip_assignments','IP assignments are not complete'],['contractor_ip','A contractor may retain rights to core IP'],['chain_title','Chain of title on IP is not clean'],
    ['captable_documented','The cap table is not fully documented'],['taxes_current','Taxes are not filed and paid to date'],['reconcile','Too many figures do not reconcile (block threshold)']],
  checks:[['waterfall','ARR waterfall closes'],['stated_arr','Deck ARR vs financials'],['stated_nrr','NRR'],['stated_grr','GRR'],['stated_growth','Growth rate'],['stated_runway','Runway'],
    ['stated_rule40','Rule of 40'],['stated_burn_multiple','Burn multiple'],['stated_magic_number','Magic number'],['stated_acv','ACV'],['stated_cac','CAC'],['stated_cac_payback','CAC payback'],
    ['stated_ltv_cac','LTV:CAC'],['stated_customers','Customer count'],['logo_bridge','Customer count bridge'],['stated_take_rate','Take rate'],['conc','Concentration ordering'],['gm_check','Gross margin vs COGS'],
    ['burn_check','Burn vs headcount'],['burn_bridge','Gross burn − revenue vs net burn'],['tam_check','Stated TAM vs bottom-up'],['deferred','Deferred revenue vs ARR'],['ar','Aged receivables'],['services','Non-recurring revenue'],
    ['cash_raise','Cash vs equity raised'],['ledger','Form vs customer ledger'],['series_cash','Cash vs monthly financials'],['series_burn','Burn vs monthly financials']],
  forensics:[['final_spike','Final-month bookings spike'],['quarter_end','Quarter-end concentration'],['one_offs','One-month customers'],['dupes','Duplicate customers'],
    ['spike_revert','One-off charges as recurring'],['negatives','Negative entries'],['smoothness','Growth smoothness'],['reactivation','Reactivations'],['benford','Benford first digit']],
  patterns:[['optimism','Systematic optimism'],['bought_growth','Growth bought with paid acquisition'],['leaky_bucket','Leaky bucket'],['nrr_definition','NRR inflated by new customers'],
    ['services','Services wearing a software multiple'],['fragile_concentration','Concentrated revenue on short contracts'],['window_dressing','Bookings spike before the raise'],
    ['runway_cliff','Raising from need'],['hiring_ahead','Hiring ahead of revenue'],['discount_wins','Wins bought with price'],['cycle_mismatch','Enterprise cycle, SMB price'],
    ['ai_margin','AI margin trap'],['overhang','SAFE and pool overhang'],['default_dead','Default dead'],['default_alive','Default alive'],['sim_low','Low odds of next stage'],
    ['sim_mid','Coin-flip odds'],['sim_high','Funded to next stage'],['cohort_decay','Cohort decay'],['cohort_improve','Improving cohorts'],['fund_math','Fund-returner test'],
    ['founder_risk','Key-person risk'],['subsidised','Subsidised liquidity'],['loss_growth','Losses with fast volume'],['partner_bank','Partner-bank findings'],['shelfware','Shelfware expansion'],
    ['stage_mismatch','Stage mismatch'],['efficient','Efficient growth'],['capital_light','Capital-light growth'],['clean_books','Clean books'],
    ['offmarket_terms','Off-market term sheet'],['investor_rights','Missing investor rights'],['price_return','Price vs target return'],['weak_pmf','Weak product-market fit'],
    ['strong_pmf','Strong product-market fit'],['nice_to_have','Discretionary product'],['moat_unproven','Moat not evidenced'],['new_team','New founding team'],
    ['no_tech_founder','No technical founder'],['finance_hygiene','Finance and tax hygiene'],['why_now','No “why now”']],
  questions:[['gates','Gates'],['contradictions','Material contradictions'],['risk_patterns','Risk patterns'],['forensics','Forensic signals'],['inconsistencies','Minor inconsistencies'],
    ['watch_patterns','Watch patterns'],['missing_inputs','Missing required inputs'],['not_measurable','Not yet measurable'],['weak_dimensions','Weak dimensions'],['thin_evidence','Thin evidence'],
    ['unverified_inputs','Unverified inputs'],['confirm_calls','Confirmatory: customer calls'],['confirm_funds','Confirmatory: use of funds']],
  requests:[['ledger_request','Customer ledger'],['ledger_tieout','Ledger tie-out to invoices'],['series_request','Monthly management accounts'],['cohort_table','Cohort table'],
    ['top20','Top 20 customers'],['ip_agreements','IP assignment agreements'],['cap_table','Cap table'],['sm_split','S&M split'],['qoe','Reviewed statements / QoE'],
    ['deferred_rollforward','Deferred revenue roll-forward'],['aged_ar','Aged receivables'],['soc2','SOC 2 report'],['workings','Supporting workings for contradictions'],
    ['bank_statements','Bank statements'],['note_agreements','Convertible note agreements']],
  checklist: DILIGENCE.map(d => [d.id, d.text.length > 70 ? d.text.slice(0, 68) + '…' : d.text]),
};
