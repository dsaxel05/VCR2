
/* ═══════════════════════════════════════════════════════════════
   WHAT DIFFERS FROM BUILT-IN
   A flat, readable list of everything a configuration changes about the built-in site. It is shown to the owner in the
   Studio (with a way back for each), as a change list before publishing, and to every reader of a report as
   "N settings differ from built-in". Each entry is one thing the owner decided.
   ═══════════════════════════════════════════════════════════════ */
const DIFF_AREAS = {
  branding:'Home page text', look:'Look & feel', texts:'Text replacement', settings:'Scoring rule', hidden:'Switched off', thresholds:'Healthy range', metricWeights:'Metric weight',
  stageWeights:'Dimension weight', formulas:'Calculation', labels:'Rename', categorical:'Scored answer', booleans:'Yes/no point', checkTol:'Check tolerance', patternParams:'Trigger',
  defaults:'Default', meta:'Built-in detail', fields:'Your input', metrics:'Your metric', checks:'Your check', questions:'Your question', patterns:'Your red flag or strength',
  requests:'Your document request', checklist:'Your checklist item', gates:'Your deal-breaker', models:'Your business model', dimensions:'Your dimension', stages:'Your stage', benchmarks:'Your benchmark data',
};
function diffFlatten(prefix, o, out, depth) {
  depth = depth || 0;
  if (depth > 40) { out.push([prefix, '[nested too deeply]']); return; }
  if (o !== null && typeof o === 'object' && !Array.isArray(o)) Object.keys(o).forEach(k => diffFlatten(prefix ? prefix + '.' + k : k, o[k], out, depth + 1));
  else out.push([prefix, o]);
}
function settingsDiff(cfg) {
  const c = normalizeConfig(cfg || CFG), out = [];
  const add = (area, key, text, v) => out.push({ area, key: area + ':' + key, text, v: canonJSON(v === undefined ? text : v) });
  const nm = k => (typeof BASE !== 'undefined' && BASE.dlabel[k]) || k;
  ['branding', 'look'].forEach(a => Object.entries(c[a]).forEach(([k, v]) => add(a, k, `${DIFF_AREAS[a]}: ${k}`, v)));
  c.texts.forEach(t => add('texts', t.from, `Text “${String(t.from).slice(0, 50)}” reads “${String(t.to).slice(0, 50)}”`, t.to));
  Object.entries(c.settings).forEach(([k, v]) => { const flat = []; diffFlatten(k, v, flat); flat.forEach(([p, x]) => add('settings', p, `${DIFF_AREAS.settings}: ${p}`, x)); });
  Object.entries(c.hidden).forEach(([kind, ids]) => ids.forEach(id => add('hidden', kind + '.' + id, `Switched off (${kind}): ${id}`, true)));
  Object.entries(c.thresholds).forEach(([k, o]) => add('thresholds', k, `${DIFF_AREAS.thresholds}: ${nm(k)}`, o));
  Object.entries(c.metricWeights).forEach(([k, w]) => add('metricWeights', k, `${DIFF_AREAS.metricWeights}: ${nm(k)} = ${w}`, w));
  Object.entries(c.stageWeights).forEach(([st, o]) => Object.entries(o).forEach(([d, w]) => { if (typeof BASE === 'undefined' || !BASE.weights[st] || Math.abs((BASE.weights[st][d] || 0) - w) > 1e-9) add('stageWeights', st + '.' + d, `${DIFF_AREAS.stageWeights}: ${st} / ${d} = ${Math.round(w * 1000) / 10}`, w); }));
  Object.entries(c.formulas).forEach(([k, f]) => add('formulas', k, `${DIFF_AREAS.formulas}: ${nm(k)}`, f));
  Object.entries(c.labels).forEach(([kind, m]) => Object.entries(m).forEach(([id, v]) => add('labels', kind + '.' + id, `${DIFF_AREAS.labels} (${kind}): ${id} → ${String(v).slice(0, 40)}`, v)));
  Object.entries(c.categorical).forEach(([k, m]) => Object.entries(m).forEach(([opt, v]) => add('categorical', k + '.' + opt, `${DIFF_AREAS.categorical}: ${k} / ${opt} = ${v}`, v)));
  Object.entries(c.booleans).forEach(([k, v]) => add('booleans', k, `${DIFF_AREAS.booleans}: ${k} = ${v}`, v));
  Object.entries(c.checkTol).forEach(([k, o]) => add('checkTol', k, `${DIFF_AREAS.checkTol}: ${k}`, o));
  Object.entries(c.patternParams).forEach(([k, o]) => Object.entries(o).forEach(([p, v]) => add('patternParams', k + '.' + p, `${DIFF_AREAS.patternParams}: ${k} / ${p} = ${v}`, v)));
  const dfl = []; diffFlatten('', c.defaults, dfl); dfl.forEach(([p, v]) => add('defaults', p, `${DIFF_AREAS.defaults}: ${p} = ${Array.isArray(v) ? v.join(', ') : v}`, v));
  Object.entries(c.meta).forEach(([kind, m]) => Object.entries(m).forEach(([id, o]) => Object.entries(o).forEach(([k, v]) => add('meta', kind + '.' + id + '.' + k, `${DIFF_AREAS.meta}: ${kind} ${id} / ${k}`, v))));
  [['fields', 'id', 'label'], ['metrics', 'key', 'label'], ['checks', 'id', 'title'], ['questions', 'id', 'text'], ['patterns', 'id', 'title'], ['requests', 'id', 'text'], ['checklist', 'id', 'text'],
    ['gates', 'id', 'title'], ['models', 'id', 'name'], ['dimensions', 'id', 'label'], ['stages', 'id', 'name'], ['benchmarks', 'id', 'metric']].forEach(([a, idk, lk]) =>
    c[a].forEach(it => add(a, it[idk], `${DIFF_AREAS[a]}: ${String(it[lk] || it[idk]).slice(0, 60)}`, it)));
  return out;
}
/* Two configurations compared: what is new, what changed and what went back to built-in. */
function configChanges(from, to) {
  const A = new Map(settingsDiff(from).map(d => [d.key, d])), B = new Map(settingsDiff(to).map(d => [d.key, d])), out = [];
  B.forEach((d, k) => { const a = A.get(k); if (!a) out.push({ kind:'added', text:d.text, area:d.area }); else if (a.v !== d.v) out.push({ kind:'changed', text:d.text, area:d.area }); });
  A.forEach((d, k) => { if (!B.has(k)) out.push({ kind:'removed', text:d.text, area:d.area }); });
  return out;
}
/* The one sentence a report carries when the site differs from the built-in rules. */
function customisationNote() {
  const n = settingsDiff(CFG).filter(d => !['branding', 'look', 'texts', 'labels'].includes(d.area)).length;
  return n ? `${n} setting${n === 1 ? '' : 's'} of this site differ${n === 1 ? 's' : ''} from the built-in rules (healthy ranges, weights, checks and so on, set by the site's owner).` : '';
}
/* Wording the owner replaced is disclosed apart from scoring settings: it does not change a score, but a reader should know the words are not all as built. */
function wordingNote() {
  const w = (CFG && Array.isArray(CFG.texts)) ? CFG.texts.length : 0;
  return w ? `${w} wording replacement${w === 1 ? '' : 's'} set by the site's owner ${w === 1 ? 'is' : 'are'} applied to the text of this report.` : '';
}
