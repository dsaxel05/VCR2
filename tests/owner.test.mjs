// Owner control, second layer: text replacements (2a). Further groups are appended as the Studio grows.
//   node tests/owner.test.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from './_harness.mjs';
const FIX = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8'));

const TESTS = String.raw`
const cfg = o => normalizeConfig(Object.assign(EMPTY_CONFIG(), o));

/* Texts: normalised, bounded, plain text */
const n = cfg({ texts:[ { from:'Score withheld', to:'Cannot rate yet' }, { from:'  ', to:'x' }, { from:'same', to:'same' }, { from:'Score withheld', to:'dup' },
  { from:'<b>x</b>', to:'<img src=x onerror=alert(1)>' }, 'junk', { from:'Gone', to:'' } ] });
eq('texts: kept, deduplicated and blank/identical ones dropped', n.texts.map(t => t.from), ['Score withheld', '<b>x</b>', 'Gone']);
eq('texts: an empty replacement is allowed (removes the words)', n.texts[2].to, '');
eq('texts: more than 400 are cut', cfg({ texts:Array.from({ length:500 }, (_, i) => ({ from:'t' + i, to:'u' })) }).texts.length, 400);

/* trText */
applyConfig(cfg({ texts:[ { from:'Score withheld', to:'Cannot rate yet' }, { from:'gate', to:'item' } ] }));
eq('trText replaces the words', trText('Score withheld: 2 gates to resolve'), 'Cannot rate yet: 2 items to resolve');
eq('trText leaves other text alone', trText('Nothing here'), 'Nothing here');
eq('trText handles null', trText(null), null);
applyConfig(EMPTY_CONFIG());
eq('and resets with the built-in config', trText('Score withheld'), 'Score withheld');

/* trHTML touches text between tags only */
applyConfig(cfg({ texts:[ { from:'Verdict', to:'Opinion' }, { from:'R&D', to:'Research' } ] }));
eq('trHTML replaces text nodes', trHTML('<h3>Verdict</h3>'), '<h3>Opinion</h3>');
eq('trHTML leaves attributes and tags alone', trHTML('<div class="Verdict" title="Verdict">Verdict</div>'), '<div class="Verdict" title="Verdict">Opinion</div>');
eq('trHTML matches escaped text', trHTML('<p>R&amp;D spend</p>'), '<p>Research spend</p>');
eq('trHTML does not touch scripts or styles', trHTML('<script>var Verdict = 1;</script><style>.Verdict{}</style>Verdict'), '<script>var Verdict = 1;</script><style>.Verdict{}</style>Opinion');
applyConfig(cfg({ texts:[ { from:'a', to:'<script>alert(1)</script>' } ] }));
ok('a replacement can never add markup (it is escaped)', trHTML('<p>a</p>').indexOf('<script>') < 0, trHTML('<p>a</p>'));
applyConfig(EMPTY_CONFIG());

/* the signature does not change: wording never changes a score */
const sig0 = configSignature();
applyConfig(cfg({ texts:[ { from:'x', to:'y' } ] }));
eq('text replacements do not change the rubric signature', configSignature(), sig0);
applyConfig(EMPTY_CONFIG());

/* ── Scoring constants (2b): each one changes the report, and clearing it restores the built-in value ── */
const A = ARCH.companies;
const resolveC = n => { const c = A[n], b = c.extends ? resolveC(c.extends) : { vals:{}, bools:{}, sel:{} }; return { stage:c.stage || b.stage, model:c.model || b.model, vals:Object.assign({}, b.vals, c.vals), bools:Object.assign({}, b.bools, c.bools), sel:Object.assign({}, b.sel, c.sel) }; };
const asm = (n, over, evid) => { const c = resolveC(n); return Radar.assess({ name:n, stage:c.stage, model:c.model, vals:Object.assign({}, c.vals, over || {}), bools:c.bools, sel:Object.assign({}, c.sel, (over && over.__sel) || {}), evid:evid || {} }); };
const withS = (s, f) => { applyConfig(Object.assign(EMPTY_CONFIG(), { settings:s })); const r = f(); applyConfig(EMPTY_CONFIG()); return r; };

/* normalisation: unknown, out-of-range and misordered values are dropped or clamped */
eq('a curve that does not rise is ignored', withS({ curve:[0, 80, 72, 100] }, () => sx('curve')), [0, 45, 72, 100]);
eq('a curve with the wrong length is ignored', withS({ curve:[0, 50, 100] }, () => sx('curve')), [0, 45, 72, 100]);
eq('a number is clamped to its limits', withS({ boolCap:999 }, () => sx('boolCap')), 50);
eq('an unknown select value is ignored', withS({ withheldMode:'nonsense' }, () => sx('withheldMode')), 'shrink');
eq('the built-ins are in force without a setting', [sx('curve'), sx('boolCap'), sx('fullCoverage'), sx('withheldMode'), sx('auditedCap')], [[0, 45, 72, 100], 15, 0.5, 'shrink', 'on']);

/* curve */
eq('curve: a value at the good anchor scores the owner’s figure', withS({ curve:[0, 40, 80, 100] }, () => bandScore(30, [10, 20, 30, 40], 'hi')), 80);
eq('curve: and the mirrored curve is used for lower-is-better', withS({ curve:[0, 40, 80, 100] }, () => bandScore(20, [10, 20, 30, 40], 'lo')), 80);
eq('curve: built-in again once cleared', bandScore(30, [10, 20, 30, 40], 'hi'), 72);

/* boolCap */
const posAll = n => resolveC(n);
const adjMax = r => Math.max(...r.scoring.dimensions.map(d => Math.abs(d.adj)));
const a0 = adjMax(asm('typical_a'));
ok('boolCap: the built-in cap is 15', a0 <= 15, a0);
const aC = withS({ boolCap:2 }, () => adjMax(asm('typical_a')));
ok('boolCap: a cap of 2 limits every dimension to 2 points', aC <= 2 + 1e-9, aC);

/* fullCoverage */
const sparse0 = asm('preseed_team').scoring.overallRaw, sparse1 = withS({ fullCoverage:1 }, () => asm('preseed_team').scoring.overallRaw);
ok('fullCoverage: demanding full coverage changes a sparse company’s score', Math.abs(sparse0 - sparse1) > 0.01, [sparse0, sparse1]);

/* auditedCap */
const allAudited = {}; ['arr_now', 'arr_12mo', 'net_burn', 'cash_on_hand', 'gross_margin', 'customers_now'].forEach(k => allAudited[k] = 'audited');
const internal = { __sel:{ audited_financials:'Internal only' } };
const capOn = asm('typical_a', internal, allAudited).scoring.overallRaw;
const capOff = withS({ auditedCap:'off' }, () => asm('typical_a', internal, allAudited).scoring.overallRaw);
const verbalOnly = asm('typical_a', internal, Object.fromEntries(Object.keys(allAudited).map(k => [k, 'verbal']))).scoring.overallRaw;
ok('auditedCap: audited tags on internal-only books count like verbal ones', Math.abs(capOn - verbalOnly) < 0.01, [capOn, verbalOnly]);
ok('auditedCap: and count in full when the owner switches it off', capOff > capOn + 0.1, [capOff, capOn]);
const honest = asm('typical_a', { __sel:{ audited_financials:'Audited' } }, allAudited).scoring.overallRaw;
ok('auditedCap: audited statements keep the audited tags', honest > capOn, [honest, capOn]);

/* confidence and range */
const base0 = asm('typical_a').scoring;
const confLoose = withS({ confMediumCoverage:0, confMediumEvidence:0 }, () => asm('typical_a').scoring.confidence);
ok('confidence: lowering the MEDIUM cut-offs lifts a LOW report', base0.confidence === 'LOW' && confLoose === 'MEDIUM', [base0.confidence, confLoose]);
const wide = withS({ bandBase:15 }, () => asm('typical_a').scoring);
ok('band: a larger base widens the likely range', (wide.band[1] - wide.band[0]) > (base0.band[1] - base0.band[0]), [wide.band, base0.band]);
const capped = withS({ bandMax:5 }, () => asm('typical_a').scoring);
ok('band: the widest half-width is respected', (capped.band[1] - capped.band[0]) / 2 <= 5.5, capped.band);

/* display */
eq('display: 60 reads as mixed by default', sWord(60)[0], 'mixed');
eq('display: and as strong when the owner sets 55', withS({ displayStrong:55 }, () => sWord(60)[0]), 'strong');
eq('display: 40 is weak by default', sWord(40)[0], 'weak');
eq('display: and mixed when the owner sets 35', withS({ displayMixed:35 }, () => sWord(40)[0]), 'mixed');

/* exit floors */
eq('exit floors: built-in 5 and 10', [EXIT_DEFAULTS.floorBase, EXIT_DEFAULTS.floorUp], [5, 10]);
eq('exit floors: the owner’s values reach the projections', withS({ exitFloorBase:8, exitFloorUp:20 }, () => [EXIT_DEFAULTS.floorBase, EXIT_DEFAULTS.floorUp]), [8, 20]);

/* ── Built-in metrics (2c): calculation, dimension, business models, healthy range, unit ── */
const withC = (o, f) => { applyConfig(Object.assign(EMPTY_CONFIG(), o)); const r = f(); applyConfig(EMPTY_CONFIG()); return r; };
const findM = (r, k) => { for (const d of r.scoring.dimensions) { const m = d.metrics.find(x => x.key === k); if (m) return { m, dim:d.id }; } return null; };
const nrr0 = asm('typical_a').derived.nrr;
eq('formula: a built-in metric uses the owner’s calculation', withC({ formulas:{ nrr:'nrr * 0.5' } }, () => Math.round(asm('typical_a').derived.nrr * 1000) / 1000), Math.round(nrr0 * 0.5 * 1000) / 1000);
eq('formula: cleared, the built-in calculation is back', asm('typical_a').derived.nrr, nrr0);
ok('formula: the report names the owner’s formula', /Your formula/.test(withC({ formulas:{ nrr:'nrr * 0.5' } }, () => asm('typical_a').formulas.nrr)), '');
ok('formula: a formula that cannot be computed leaves the metric without data, not broken', withC({ formulas:{ nrr:'no_such_input + 1' } }, () => { const r = asm('typical_a'); return r.derived.nrr == null && r.scoring.overallRaw != null; }), '');
eq('formula: an unknown metric key is dropped', normalizeConfig({ formulas:{ 'bad key!':'1+1', nrr:'  ' } }).formulas, {});
eq('dimension: a metric can be moved to another dimension', withC({ thresholds:{ gross_margin:{ dim:'capital' } } }, () => findM(asm('typical_a'), 'gross_margin').dim), 'capital');
eq('dimension: and is back where it was', findM(asm('typical_a'), 'gross_margin').dim, 'revenue');
ok('business models: restricting a metric to fintech removes it for SaaS', withC({ thresholds:{ nrr:{ models:['fintech'] } } }, () => findM(asm('typical_a'), 'nrr') === null), '');
ok('business models: an empty list means all models again', withC({ thresholds:{ nrr:{ models:[] } } }, () => findM(asm('typical_a'), 'nrr') !== null), '');
const pool0 = findM(asm('typical_a'), 'option_pool');
ok('healthy range: the built-in option pool band scores the sample company well', pool0 && pool0.m.rawScore >= 90, pool0 && pool0.m.rawScore);
const pool1 = withC({ thresholds:{ option_pool:{ ideal:[0, 5], hard:[0, 8] } } }, () => findM(asm('typical_a'), 'option_pool'));
ok('healthy range: an owner band changes the score', pool1 && pool1.m.rawScore < 50, pool1 && pool1.m.rawScore);
eq('healthy range: a band that does not nest is ignored', normalizeConfig({ thresholds:{ option_pool:{ ideal:[10, 5], hard:[0, 8] } } }).thresholds.option_pool.ideal, undefined);
eq('unit: the owner can change how a metric is shown', withC({ labels:{ units:{ nrr:'x' } } }, () => DUNIT.nrr), 'x');
eq('unit: and it is back when cleared', DUNIT.nrr, '%');

/* ── Dimensions and stages the owner adds (2d) ── */
const dimCfg = { dimensions:[{ id:'reg', label:'Regulatory exposure' }], metrics:[{ key:'reg_score', label:'Regulatory score', formula:'arr_now / 1000000', dim:'reg', dir:'hi', thresholds:{ a:[1, 3, 6, 10], seed:[1, 3, 6, 10], b:[1, 3, 6, 10], preseed:[1, 3, 6, 10] } }] };
const withDim = withC(dimCfg, () => asm('typical_a'));
const regD = withDim.scoring.dimensions.find(d => d.id === 'reg');
ok('dimension: an added dimension is scored with its metric', regD && regD.score != null && regD.metrics.length === 1, regD);
eq('dimension: it carries its own name', withC(dimCfg, () => DIM_LABEL.reg), 'Regulatory exposure');
ok('dimension: it takes a share of the headline, so the score can move', Math.abs(withDim.scoring.overallRaw - asm('typical_a').scoring.overallRaw) > 0.01, [withDim.scoring.overallRaw, asm('typical_a').scoring.overallRaw]);
ok('dimension: and the stage weights still add up to 1', withC(dimCfg, () => Math.abs(Object.values(RUBRIC.weights.a).reduce((a, b) => a + b, 0) - 1) < 1e-9), '');
ok('dimension: removed again, the built-in report is back', asm('typical_a').scoring.dimensions.every(d => d.id !== 'reg'), '');
eq('dimension: ids that shadow built-in ones are refused', normalizeConfig({ dimensions:[{ id:'revenue', label:'x' }, { id:'ok_one', label:'Fine' }] }).dimensions.map(d => d.id), ['ok_one']);
eq('dimension: owner weights per stage are used', withC({ dimensions:[{ id:'reg', label:'R' }], stageWeights:{ a:{ reg:0.5 } } }, () => Math.round(RUBRIC.weights.a.reg * 100) > 25), true);

const stgCfg = { stages:[{ id:'s_c', name:'Series C', like:'b', lo:30000000, hi:100000000 }] };
const likeB = Radar.assess({ name:'x', stage:'b', model:'saas', vals:resolveC('series_b_clean').vals, bools:resolveC('series_b_clean').bools, sel:resolveC('series_b_clean').sel, evid:{} });
const asC = withC(stgCfg, () => { const c = resolveC('series_b_clean'); return Radar.assess({ name:'x', stage:'s_c', model:'saas', vals:c.vals, bools:c.bools, sel:c.sel, evid:{} }); });
eq('stage: an added stage is scored like the built-in one it is based on', asC.scoring.overallRaw, likeB.scoring.overallRaw);
eq('stage: it has its own name and range', withC(stgCfg, () => [STAGES.find(s => s.id === 's_c').n, STAGES.length, STAGE_RANGE.s_c.hi]), ['Series C', 5, 100000000]);
eq('stage: built-in stage names can be changed', withC({ labels:{ stages:{ a:'Series A (growth)' } } }, () => STAGES.find(s => s.id === 'a').n), 'Series A (growth)');
eq('stage: and are back when cleared', STAGES.find(s => s.id === 'a').n, 'Series A');
eq('stage: a removed stage falls back to Seed', withC(stgCfg, () => { S.stage = 's_c'; applyConfig(EMPTY_CONFIG()); return S.stage; }), 'seed');
eq('stage: ids that shadow built-in ones are refused', normalizeConfig({ stages:[{ id:'seed', name:'x' }, { id:'s_new', name:'New', like:'zzz' }] }).stages.map(s => [s.id, s.like]), [['s_new', 'b']]);

/* ── Business models, evidence names, check titles (2e) ── */
eq('model: a built-in model can be renamed', withC({ labels:{ models:{ saas:'Software' } } }, () => MODELS.find(m => m.id === 'saas').n), 'Software');
eq('model: and is back when cleared', MODELS.find(m => m.id === 'saas').n, 'B2B SaaS');
eq('model: a built-in model can be hidden from the setup page', withC({ hidden:{ models:['fintech'] } }, () => MODELS.find(m => m.id === 'fintech').hidden), true);
eq('model: its note under the cards can be changed', withC({ labels:{ calib:{ marketplace:'Our view on marketplaces.' } } }, () => MODELS.find(m => m.id === 'marketplace').note), 'Our view on marketplaces.');
const aiVals = resolveC('seed_ai_clean');
const runAs = model => Radar.assess({ name:'x', stage:aiVals.stage, model, vals:aiVals.vals, bools:aiVals.bools, sel:aiVals.sel, evid:{} });
const aiBuiltin = runAs('ai_app');
const aiCustom = withC({ models:[{ id:'x_robot', name:'Robotics', from:'ai_app' }] }, () => runAs('x_robot'));
eq('model: a model that starts from AI application is scored like one', aiCustom.scoring.overallRaw, aiBuiltin.scoring.overallRaw);
const aiPlain = withC({ models:[{ id:'x_robot', name:'Robotics' }] }, () => runAs('x_robot'));
ok('model: without a starting point only the common metrics apply', aiPlain.scoring.overallRaw !== aiBuiltin.scoring.overallRaw, [aiPlain.scoring.overallRaw, aiBuiltin.scoring.overallRaw]);
eq('model: its note is kept', withC({ models:[{ id:'x_robot', name:'Robotics', note:'Hardware with software revenue.' }] }, () => MODELS.find(m => m.id === 'x_robot').note), 'Hardware with software revenue.');
eq('evidence: a source can be renamed', withC({ labels:{ evidence:{ bank:'Bank statement' } } }, () => EVIDENCE.find(e => e.id === 'bank').label), 'Bank statement');
eq('evidence: and is back when cleared', EVIDENCE.find(e => e.id === 'bank').label, 'Bank or billing record');
const stated = { stated_arr:String(Math.round(resolveC('typical_a').vals.arr_now * 1.3)) };
eq('check title: built-in', asm('typical_a', stated).checks.find(c => c.id === 'stated_arr').title, 'Deck ARR does not match the financials');
eq('check title: renamed by the owner', withC({ labels:{ checks:{ stated_arr:'Pitch ARR is off' } } }, () => asm('typical_a', stated).checks.find(c => c.id === 'stated_arr').title), 'Pitch ARR is off');

/* ── Scored answers on a choice field the owner added (2f) ── */
const ansCfg = { fields:[{ id:'c_reg_status', label:'Regulatory status', section:'custom', type:'select', options:['Licensed', 'Applied', 'None'], scores:{ Licensed:90, Applied:50, None:10 }, dim:'govern', weight:2 }] };
const ansRun = sel => withC(ansCfg, () => { const c = resolveC('typical_a'); return Radar.assess({ name:'x', stage:c.stage, model:c.model, vals:c.vals, bools:c.bools, sel:Object.assign({}, c.sel, { c_reg_status:sel }), evid:{} }); });
const gov = r => r.scoring.dimensions.find(d => d.id === 'govern');
const ansMetric = r => gov(r).metrics.find(m => m.key === 'field_c_reg_status');
ok('scored answer: the answer appears as a metric in its dimension', ansMetric(ansRun('Licensed')) && ansMetric(ansRun('Licensed')).rawScore === 90, ansMetric(ansRun('Licensed')));
ok('scored answer: a worse answer lowers the dimension', gov(ansRun('None')).raw < gov(ansRun('Licensed')).raw, [gov(ansRun('None')).raw, gov(ansRun('Licensed')).raw]);
ok('scored answer: unanswered it counts for nothing', ansMetric(ansRun('')) == null, '');
ok('scored answer: without the field the report is the built-in one', gov(asm('typical_a')).metrics.every(m => m.key !== 'field_c_reg_status'), '');
eq('scored answer: scores are clamped and only existing choices are kept', normalizeConfig({ fields:[{ id:'c_x', label:'X', type:'select', options:['A', 'B'], scores:{ A:150, Z:20 }, dim:'team' }] }).fields[0].scores, { A:100 });
eq('scored answer: a score without a dimension is dropped', normalizeConfig({ fields:[{ id:'c_x', label:'X', type:'select', options:['A', 'B'], scores:{ A:50 } }] }).fields[0].scores, undefined);

/* ── Forensic thresholds are editable like the other triggers (2g) ── */
const nlc = String.fromCharCode(10);
const rowsF = ['customer,' + Array.from({ length:12 }, (_, k) => monthAdd('2025-01', k)).join(',')];
for (let i = 0; i < 40; i++) rowsF.push('S' + i + ',' + Array.from({ length:12 }, () => 1000 + i * 10).join(','));
for (let i = 0; i < 6; i++) rowsF.push('O' + i + ',' + Array.from({ length:12 }, (_, k) => k === 3 + i ? 900 : 0).join(','));
const fxOf = id => ledgerAnalytics(parseLedger(rowsF.join(nlc)).ledger).forensics.find(f => f.id === id);
eq('forensics: six one-month customers are flagged by default', fxOf('one_offs').status, 'warn');
eq('forensics: the owner can raise the count that triggers it', withC({ patternParams:{ forensic_oneoff:{ count:50, mrrShare:200 } } }, () => fxOf('one_offs').status), 'info');
eq('forensics: and it is back when cleared', fxOf('one_offs').status, 'warn');
ok('forensics: every forensic threshold is listed with the triggers', ['forensic_spike', 'forensic_oneoff', 'forensic_quarter', 'forensic_benford'].every(k => PATTERN_PARAMS[k]), '');
`;

runSuite('Owner control', TESTS, 'const ARCH = ' + JSON.stringify(FIX) + ';');
