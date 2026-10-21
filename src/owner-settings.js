
/* ═══════════════════════════════════════════════════════════════
   SCORING CONSTANTS the owner can change (each has its built-in value, its limits and a reset).
   The older settings (minimum samples, block-after, evidence mode, LTV cap, overlap cap, note-cap basis) have their own
   controls on "Weights & rules"; these are the constants that used to be fixed in the engine.
   ═══════════════════════════════════════════════════════════════ */
const SETTING_DEFS = [
  { id:'curve', group:'How a value becomes a score', label:'Scores at the four anchors', kind:'numbers', n:4, def:[0, 45, 72, 100], min:0, max:100, ascending:true,
    help:'The scores given to a value at the poor, acceptable, good and excellent anchors (lower-is-better metrics use the same scores mirrored). Between anchors the score moves in a straight line.' },
  { id:'boolCap', group:'How a value becomes a score', label:'Most a dimension can move from yes/no answers (points)', kind:'number', def:15, min:0, max:50,
    help:'Yes/no answers add or subtract points inside a dimension, but never more than this in total.' },
  { id:'fullCoverage', group:'How a value becomes a score', label:'Share of a dimension that must be filled for its full weight', kind:'number', def:0.5, min:0.1, max:1, step:0.05,
    help:'A dimension that is less filled than this counts proportionally less in the headline score.' },
  { id:'withheldMode', group:'How a value becomes a score', label:'Metrics withheld for a too-small sample', kind:'select', def:'shrink',
    options:[['shrink', 'Shrink towards 50 in proportion to the sample (smooth, no cliff)'], ['neutral', 'Count at 50 with half weight'], ['drop', 'Leave out of the score']],
    help:'A retention figure from 12 customers is not meaningful. Left out, a weak metric simply disappears and the score can rise. Shrinking pulls the score towards 50 by the share of the minimum sample that was reached, so 19 customers counts almost fully and 10 about half.' },
  { id:'auditedCap', group:'Evidence', label:'Cap an "audited" tag by the answer on audited statements', kind:'select', def:'on',
    options:[['on', 'On: audited counts only if the statements are audited or reviewed'], ['off', 'Off: the tag is taken as given']],
    help:'Stops a figure being tagged audited when the company has said its financial statements are internal only.' },
  { id:'confHighCoverage', group:'Confidence', label:'HIGH confidence: minimum coverage', kind:'number', def:0.75, min:0, max:1, step:0.05, help:'Share of the rubric populated.' },
  { id:'confHighEvidence', group:'Confidence', label:'HIGH confidence: minimum evidence strength', kind:'number', def:0.7, min:0, max:1, step:0.05, help:'Weighted evidence of the scored metrics.' },
  { id:'confHighMajor', group:'Confidence', label:'HIGH confidence: most material contradictions allowed', kind:'number', def:0, min:0, max:10, help:'' },
  { id:'confMediumMajor', group:'Confidence', label:'MEDIUM confidence: most material contradictions allowed', kind:'number', def:1, min:0, max:10, help:'' },
  { id:'confMediumCoverage', group:'Confidence', label:'MEDIUM confidence: minimum coverage', kind:'number', def:0.45, min:0, max:1, step:0.05, help:'' },
  { id:'confMediumEvidence', group:'Confidence', label:'MEDIUM confidence: minimum evidence strength', kind:'number', def:0.45, min:0, max:1, step:0.05, help:'' },
  { id:'bandBase', group:'Likely range', label:'Half-width of the range with full coverage and no doubts (points)', kind:'number', def:3, min:0, max:20, help:'' },
  { id:'bandPerGap', group:'Likely range', label:'Points added when the whole rubric is left empty', kind:'number', def:20, min:0, max:60, help:'Scaled by the share left empty.' },
  { id:'bandPerMajor', group:'Likely range', label:'Points added per material contradiction', kind:'number', def:3, min:0, max:15, help:'' },
  { id:'bandPerEvidence', group:'Likely range', label:'Points added when evidence is entirely unverified', kind:'number', def:12, min:0, max:40, help:'' },
  { id:'bandMax', group:'Likely range', label:'Widest the range can be (half-width, points)', kind:'number', def:32, min:5, max:50, help:'' },
  { id:'evidencePivot', group:'Evidence', label:'Score that evidence pulls good news towards', kind:'number', def:50, min:0, max:100, help:'A score above this is pulled towards it when its evidence is weak; a score below it is never raised.' },
  { id:'contestedEvidence', group:'Evidence', label:'Evidence weight of an input a material check calls into question', kind:'number', def:0.1, min:0, max:1, step:0.05, help:'Until the contradiction is resolved, the metrics resting on that input count as this well evidenced.' },
  { id:'runwayCap', group:'Boundary cases', label:'Runway shown and scored for a company that is not burning (months)', kind:'number', def:120, min:24, max:600, help:'' },
  { id:'burnMultipleCap', group:'Boundary cases', label:'Burn multiple scored when burning with no net new ARR', kind:'number', def:99, min:10, max:999, help:'' },
  { id:'paybackCap', group:'Boundary cases', label:'CAC payback scored when acquisition cost is never paid back (months)', kind:'number', def:120, min:24, max:600, help:'' },
  { id:'quickRatioCap', group:'Boundary cases', label:'Quick ratio shown for a period with no churn or contraction', kind:'number', def:10, min:2, max:100, help:'' },
  { id:'defaultLoadedCost', group:'Defaults', label:'Loaded cost per head used when the field is blank ($)', kind:'number', def:165000, min:20000, max:1000000, help:'Used by headcount efficiency and the burn-against-headcount check.' },
  { id:'currency', group:'Defaults', label:'Currency symbol in figures', kind:'text', def:'$', help:'One to three characters, for example € or £. It changes how amounts are shown, not how they are computed.' },
  { id:'questionWeakDim', group:'Question list', label:'A dimension scoring below this gets a question', kind:'number', def:50, min:10, max:90, help:'' },
  { id:'questionThinCoverage', group:'Question list', label:'A dimension populated below this share gets a question', kind:'number', def:0.35, min:0.05, max:0.9, step:0.05, help:'' },
  { id:'questionUnverified', group:'Question list', label:'A heavily weighted metric with evidence below this gets a question', kind:'number', def:0.5, min:0.1, max:1, step:0.05, help:'' },
  { id:'questionMaxWeakDims', group:'Question list', label:'Most weak dimensions that get a question', kind:'number', def:3, min:1, max:6, help:'' },
  { id:'questionMaxUnverified', group:'Question list', label:'Most unverified inputs that get a question', kind:'number', def:4, min:1, max:10, help:'Heaviest-weighted first.' },
  { id:'calPercentilesHi', group:'Library', label:'Percentiles that become the four bars of a higher-is-better metric', kind:'numbers', n:4, def:[0.15, 0.45, 0.72, 0.92], min:0, max:1, ascending:true,
    help:'When the library recalibrates a range from your own deals, a company scores about as well as its percentile among them. Poor, acceptable, good, excellent.' },
  { id:'calPercentilesLo', group:'Library', label:'Percentiles that become the four bars of a lower-is-better metric', kind:'numbers', n:4, def:[0.08, 0.28, 0.55, 0.85], min:0, max:1, ascending:true,
    help:'The same for metrics where lower is better. Excellent, good, weak, poor.' },
  { id:'calMin', group:'Library', label:'Companies needed at a stage before the library recalibrates a range', kind:'number', def:8, min:3, max:100, help:'' },
  { id:'displayStrong', group:'Display', label:'Score shown as "strong" from', kind:'number', def:70, min:50, max:95, help:'Colour and word on the score card and the dimension strip.' },
  { id:'displayMixed', group:'Display', label:'Score shown as "mixed" from', kind:'number', def:45, min:10, max:70, help:'' },
  { id:'earlyReadBelow', group:'Display', label:'Call a score an "early read" when less of the rubric than this is filled in (%)', kind:'number', def:25, min:0, max:60,
    help:'Below this share the report says "Early read" instead of Strong, Mixed or Weak, and adds a line saying the score rests on little. It changes no number. 0 switches it off.' },
  { id:'waterfallPool', group:'Returns', label:'Unallocated option pool at exit', kind:'select', def:'excluded',
    options:[['excluded', 'Not paid: its share goes pro rata to the shares actually issued'], ['paid', 'Paid out as if it were common stock']],
    help:'Options that were never granted receive nothing at an exit. Paying the pool as common (the earlier convention) lowers every issued holder’s payout.' },
  { id:'defaultAliveExpenses', group:'Returns', label:'Expenses in the default-alive test', kind:'select', def:'constant',
    options:[['constant', 'Held flat (Paul Graham’s definition)'], ['trend', 'Growing at their recent rate']],
    help:'The default-alive test asks whether revenue, growing at its current rate, catches up with expenses before the cash runs out. The original test holds expenses constant.' },
  { id:'exitFloorBase', group:'Returns', label:'Floor for projected ARR growth, base case (% a year)', kind:'number', def:5, min:-50, max:100, help:'Growth is never projected below this in the base exit case.' },
  { id:'exitFloorUp', group:'Returns', label:'Floor for projected ARR growth, upside case (% a year)', kind:'number', def:10, min:-50, max:200, help:'' },
];
const SETTING_DEF_BY_ID = Object.fromEntries(SETTING_DEFS.map(d => [d.id, d]));
/* The value in force: the owner's, else the built-in. */
function sx(id) {
  const d = SETTING_DEF_BY_ID[id], o = CFG && CFG.settings && CFG.settings[id];
  if (!d) return undefined;
  if (d.kind === 'numbers') return Array.isArray(o) && o.length === d.n ? o.slice() : d.def.slice();
  if (d.kind === 'select') return d.options.some(x => x[0] === o) ? o : d.def;
  if (d.kind === 'text') return typeof o === 'string' && o ? o : d.def;
  return typeof o === 'number' && isFinite(o) ? o : d.def;
}
/* Validation shared by the config reader and the Studio. Returns the cleaned value or undefined. */
function cleanSetting(d, v) {
  if (v == null || v === '') return undefined;
  if (d.kind === 'select') return d.options.some(x => x[0] === v) ? v : undefined;
  if (d.kind === 'text') return typeof v === 'string' && /^[^\s<>&"'\\]{1,3}$/.test(v.trim()) ? v.trim() : undefined;
  if (d.kind === 'numbers') {
    if (!Array.isArray(v) || v.length !== d.n) return undefined;
    const a = v.map(Number);
    if (a.some(x => !isFinite(x) || x < d.min || x > d.max)) return undefined;
    if (d.ascending && a.some((x, i) => i && x <= a[i - 1])) return undefined;
    return a;
  }
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? Math.min(d.max, Math.max(d.min, n)) : undefined;
}
