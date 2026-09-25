// Engine tests for VC Risk Radar.
// Runs the maths in index.html headlessly — no browser, no dependencies:
//   node tests/engine.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

/* Minimal DOM stand-ins so the UI layer can initialise without a browser. */
const el = () => ({ value:'', checked:false, style:{}, dataset:{}, innerHTML:'', textContent:'', className:'', disabled:false,
  parentNode:{ style:{} }, classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  addEventListener(){}, appendChild(){}, removeChild(){}, remove(){}, getAttribute(){ return null; }, querySelector(){ return null; }, querySelectorAll(){ return []; }, focus(){}, setSelectionRange(){} });
const store = {};
globalThis.document = { addEventListener(){}, removeEventListener(){}, getElementById:() => el(), querySelector:() => null,
  querySelectorAll:() => [], createElement:() => el(), body:el(), documentElement:el() };
globalThis.localStorage = { getItem:k => (k in store ? store[k] : null), setItem:(k, v) => { store[k] = String(v); }, removeItem:k => { delete store[k]; } };
globalThis.window = globalThis;
globalThis.scrollTo = () => {};
globalThis.confirm = () => true;

const TESTS = String.raw`
const results = [];
const eq = (name, got, exp, tol) => {
  const ok = tol != null ? Math.abs(got - exp) <= tol : JSON.stringify(got) === JSON.stringify(exp);
  results.push({ name, ok, got, exp });
};
/* Parsing */
eq('parseNum currency', parseNum('$1,234.50'), 1234.5);
eq('parseNum parentheses', parseNum('(1,234)'), -1234);
eq('parseNum suffix', parseNum('1.2M'), 1.2e6);
eq('parseNum european', parseNum('€ 4.300,00'), 4300);
eq('parseNum blank', parseNum('-'), null);
['2024-01','Jan 2024','Jan-24','01/2024','January 2024','45292','31/01/2024','janvier 2024'].forEach(x => eq('parseMonth ' + x, parseMonth(x), '2024-01'));
/* Statistics */
eq('binomial tail 12/11', binomTail(12, 11), 13 / 4096, 1e-12);
eq('binomial tail 10/5', binomTail(10, 5), 638 / 1024, 1e-12);
/* Ledger: hand-computed three-customer case */
const months = Array.from({ length:13 }, (_, k) => monthAdd('2025-01', k));
const csv = 'customer,' + months.join(',') + '\n'
  + 'A,' + Array(12).fill(100).concat([150]).join(',') + '\n'
  + 'B,' + [100,100,100,100,100,100,0,0,0,0,0,0,0].join(',') + '\n'
  + 'C,' + [0,0,0,50,50,50,50,50,50,50,50,50,100].join(',') + '\n';
const A = ledgerAnalytics(parseLedger(csv, 'mrr').ledger);
eq('cohort NRR', A.nrrCohort, 75, 1e-9);
eq('cohort GRR', A.grrCohort, 50, 1e-9);
eq('logo retention', A.logoRet, 50, 1e-9);
eq('waterfall NRR counts new-customer expansion', A.nrrFlow, 100, 1e-9);
eq('ledger ARR', A.arrNow, 3000, 1e-9);
/* The MRR bridge closes exactly every month */
const NA = ledgerAnalytics(ledgerFromSpec(northwindLedger()));
eq('bridge closes', Math.max(...NA.bridge.map((b, k) => Math.abs((NA.mrr[k + 1] - NA.mrr[k]) - b.net))), 0, 1e-6);
/* Liquidation waterfall */
const one = [{ id:'new', frac:0.2, pref:10, part:false }];
eq('takes preference at a low exit', liquidate(20, 0, one, 0.8).byId.new, 10, 1e-9);
eq('converts at a high exit', liquidate(100, 0, one, 0.8).byId.new, 20, 1e-9);
eq('debt is senior', liquidate(8, 5, one, 0.8).byId.new, 3, 1e-9);
eq('participating double-dips', liquidate(100, 0, [{ id:'new', frac:0.2, pref:10, part:true }], 0.8).byId.new, 28, 1e-9);
/* Default-alive */
eq('default alive', defaultAlive({ rev0:100, exp0:150, cash0:1000, g:10, eg:0 }).months, 5);
/* Simulation is reproducible */
const P = { rev0:100000, exp0:180000, cash0:3e6, g:5, eg:1, sd:4, milestone:2e6, A:Object.assign({}, ASSUME_DEFAULTS) };
eq('simulation reproducible', simulate(P, 'x').pMilestone, simulate(P, 'x').pMilestone);
/* Benford */
const r = mulberry32(9);
eq('benford accepts log-uniform data', benfordTest(Array.from({ length:3000 }, () => Math.pow(10, 1 + r() * 4))).mad < 0.012, true);
/* Magic number is not double-annualised */
const M = Radar.assess({ stage:'a', vals:{ sm_spend_prior_q:'500000', new_arr_prior_q:'400000' } });
eq('magic number', M.derived.magic_number, 0.8, 1e-9);
/* Headless assessment catches a deck/financials gap */
const H = Radar.assess({ stage:'seed', vals:{ arr_now:'1000000', arr_12mo:'400000', stated_arr:'1300000' } });
eq('growth derived', H.derived.growth_yoy, 150, 1e-9);
eq('deck ARR flagged', H.checks.find(c => c.id === 'stated_arr').sev, 'major');
/* Demos */
const NR = (() => { loadNorthwind(); return assessAll(); })();
eq('messy example is blocked', NR.sc.gates.length > 0, true);
eq('messy example: optimism is significant', NR.opt.significant, true);
S = blankState(); loadHalcyon();
const HR = assessAll();
eq('clean example reconciles', HR.checks.filter(c => c.sev !== 'ok').length, 0);
eq('clean example is scored', HR.sc.overall >= 70, true);
/* Owner configuration (Studio) */
eq('formula functions', fxRun('max(1, 3, 2) + round(2.345, 1)', {}), 5.3, 1e-9);
eq('formula if', fxRun('if(1 > 2, 10, 20)', {}), 20);
eq('formula missing value is no data', fxRun('not_a_field + 1', {}), null);
eq('formula division by zero is no data', fxRun('1 / 0', {}), null);
eq('formula cannot reach object internals', fxRun('constructor', {}), null);
eq('formula rejects unknown names', fxValidate('arr_now * nope_zz').ok, false);
eq('formula rejects bad syntax', fxValidate('arr_now +').ok, false);
eq('formula accepts known names', fxValidate('arr_now / headcount_now').ok, true);
applyConfig({
  fields:[{ id:'c_pipeline', label:'Qualified pipeline', section:'custom', type:'num', unit:'$', required:true },
          { id:'c_stated_cov', label:'Stated pipeline coverage', section:'claims', type:'num' },
          { id:'c_board', label:'Independent board member', section:'custom', type:'bool' }],
  metrics:[{ key:'m_pipe_cov', label:'Pipeline coverage', formula:'c_pipeline / arr_now', unit:'x', dim:'gtm', dir:'hi', weight:1, thresholds:{ a:[0.5, 1, 2, 3] } }],
  checks:[{ id:'k_pipe', title:'Pipeline coverage', stated:'c_stated_cov', computed:'m_pipe_cov', mode:'rel', tol:10, hard:25, good:'hi', ask:'Share the CRM export.' }],
  questions:[{ id:'q1', text:'How many deals are in legal review?', when:'m_pipe_cov < 1', priority:'high' },
             { id:'q2', text:'Never asked', when:'m_pipe_cov > 100' },
             { id:'q3', text:'Who is the independent director?', when:'c_board == 1' }],
  patterns:[{ id:'p1', title:'Thin pipeline', sev:'red', when:'m_pipe_cov < 1 and stage == \'a\'', evidence:'m_pipe_cov', why:'Too little pipeline.', ask:'Walk us through the pipeline.' }],
  requests:[{ id:'r1', text:'CRM pipeline export', when:'' }],
  hidden:{ checks:['stated_arr'], questions:['confirm_funds'], metrics:['magic_number'] },
  settings:{ blockAfter:5 },
});
const C = Radar.assess({ stage:'a', vals:{ arr_now:'2000000', c_pipeline:'1000000', c_stated_cov:'1', stated_arr:'5000000', sm_spend_prior_q:'500000', new_arr_prior_q:'400000' }, bools:{ c_board:true } });
eq('custom section added', SECTIONS.some(s => s.id === 'custom'), true);
eq('custom metric derived', C.derived.m_pipe_cov, 0.5, 1e-9);
eq('custom metric scored', C.scoring.dimensions.find(d => d.id === 'gtm').metrics.some(m => m.key === 'm_pipe_cov' && m.score != null), true);
eq('custom check flags a gap', (C.checks.find(c => c.id === 'k_pipe') || {}).sev, 'major');
eq('hidden check removed', C.checks.some(c => c.id === 'stated_arr'), false);
eq('hidden metric removed', C.derived.magic_number, undefined);
eq('conditional question asked', C.questions.some(q => q.text === 'How many deals are in legal review?'), true);
eq('conditional question skipped', C.questions.some(q => q.text === 'Never asked'), false);
eq('yes/no field in a condition', C.questions.some(q => q.text === 'Who is the independent director?'), true);
eq('hidden question family removed', C.questions.some(q => /eighteen months/.test(q.text)), false);
eq('custom pattern fires', C.patterns.some(p => p.title === 'Thin pipeline'), true);
eq('custom request added', C.data_requests.includes('CRM pipeline export'), true);
eq('block threshold setting', blockAfter(), 5);
eq('rubric version records the config', /\+cfg\./.test(C.rubric), true);
applyConfig({ metrics:[{ key:'m_b', label:'B', formula:'m_a * 2' }, { key:'m_a', label:'A', formula:'arr_now / 1000' }, { key:'m_c', label:'C', formula:'m_d + 1' }, { key:'m_d', label:'D', formula:'m_c + 1' }] });
const CO = Radar.assess({ stage:'a', vals:{ arr_now:'2000000' } });
eq('custom metrics resolve in any order', CO.derived.m_b, 4000, 1e-9);
eq('circular custom metrics are no data', CO.derived.m_c, undefined);
applyConfig({ labels:{ fields:{ arr_now:'Annual run-rate' }, hints:{ arr_now:'From the board deck' }, metrics:{ nrr:'Net dollar retention' } } });
eq('built-in field renamed', ALL_FIELDS().find(f => f.id === 'arr_now').lbl, 'Annual run-rate');
eq('built-in hint replaced', ALL_FIELDS().find(f => f.id === 'arr_now').hint, 'From the board deck');
eq('built-in metric renamed', DLABEL.nrr, 'Net dollar retention');
applyConfig(EMPTY_CONFIG());
eq('rename undone on reset', [ALL_FIELDS().find(f => f.id === 'arr_now').lbl, DLABEL.nrr], ['ARR today', 'Net revenue retention']);
/* Review fixes: no-data logic, order independence, malformed files, arity, weights, hidden fields */
eq('comparison on no data is no data', fxRun('not (zz_missing >= 100)', {}), null);
eq('if on no data is no data', fxRun('if(zz_missing < 60, 0, 100)', {}), null);
eq('and/or three-valued', [fxRun('zz_missing > 1 and 0', {}), fxRun('zz_missing > 1 or 1', {}), fxRun('zz_missing > 1 or 0', {})], [0, 1, null]);
eq('prototype names are not functions', fxValidate('constructor(1)').ok, false);
eq('function arity checked', [fxValidate('if(1)').ok, fxValidate('abs(1, 2)').ok, fxValidate('max()').ok], [false, false, false]);
eq('unicode minus accepted', fxRun('5 − 2', {}), 3);
applyConfig({ metrics:[{ key:'m_x', label:'X', formula:'coalesce(m_y, 0) + 1' }, { key:'m_y', label:'Y', formula:'arr_now / 1000' }] });
const O1 = Radar.assess({ vals:{ arr_now:'2000000' } }).derived.m_x;
applyConfig({ metrics:[{ key:'m_y', label:'Y', formula:'arr_now / 1000' }, { key:'m_x', label:'X', formula:'coalesce(m_y, 0) + 1' }] });
eq('custom metric order does not matter', [O1, Radar.assess({ vals:{ arr_now:'2000000' } }).derived.m_x], [2001, 2001]);
let threw = false;
try {
  [{ fields:[null, 5, 'x'], metrics:[null], checks:'no', labels:[], branding:{ customSectionLabel:{ a:1 } }, hidden:{ checks:'x' }, thresholds:{ nrr:{ a:[1, 2] } } },
   { fields:[{ id:'c_x"><img src=x onerror=alert(1)>', label:'x' }], metrics:[{ key:'__proto__', formula:'1' }] }, 'garbage', null, [1, 2]]
    .forEach(c => { applyConfig(c); Radar.assess({ stage:'a', vals:{ arr_now:'1000000' } }); });
} catch (e) { threw = e.message; }
eq('malformed configs never throw', threw, false);
applyConfig({ fields:[{ id:'c_x"><img src=x onerror=alert(1)>', label:'x', section:'custom' }] });
eq('unsafe ids dropped', ALL_FIELDS().some(f => /img/.test(f.id)), false);
applyConfig({ fields:[{ id:'arr_now', label:'Shadow', section:'custom' }], metrics:[{ key:'nrr', label:'Shadow', formula:'1', dim:'revenue', thresholds:{ a:[0, 1, 2, 3] } }] });
const SH = Radar.assess({ stage:'a', vals:{ arr_now:'1000000', arr_12mo:'500000' } });
eq('custom names cannot shadow built-ins', [ALL_FIELDS().filter(f => f.id === 'arr_now').length, DLABEL.nrr, SH.derived.growth_yoy], [1, 'Net revenue retention', 100]);
applyConfig({ metricWeights:{ gm_trend:2.5, nrr:0 } });
eq('weights apply to every rubric metric, zero ignored', [MW.gm_trend, MW.nrr > 0], [2.5, true]);
applyConfig({ fields:[{ id:'c_s', label:'S', section:'claims', type:'num' }], checks:[{ id:'k0', title:'Exact', stated:'c_s', computed:'arr_now / 1000', tol:0, hard:0 }] });
eq('zero tolerance respected', Radar.assess({ vals:{ arr_now:'1000000', c_s:'1050' } }).checks.find(c => c.id === 'k0').sev, 'major');
applyConfig({ hidden:{ fields:['top5_pct'], sections:['deal'] } });
S.vals.top5_pct = '60'; S.vals.round_size = '5000000';
eq('hidden fields read as empty', [gv('top5_pct'), gv('round_size')], [null, null]);
applyConfig({ hidden:{ fields:['litigation'] }, questions:[{ text:'Litigation?', when:'litigation == 1' }] });
eq('hidden fields invisible to formulas', Radar.assess({ bools:{ litigation:true } }).questions.some(q => q.text === 'Litigation?'), false);
restorePayload({ stage:'zzz', model:'<bad model>', evid:{ arr_now:'x" onmouseover="alert(1)', arr_12mo:'export' }, vals:{ 'bad-key"':'1', arr_now:'5' }, assume:{ paths:1e9 } });
eq('restored files are sanitised', [S.stage, S.model, S.evid.arr_now, S.evid.arr_12mo, Object.keys(S.vals), assumptions().paths], ['seed', 'saas', undefined, 'export', ['arr_now'], 20000]);
S = blankState();
applyConfig(EMPTY_CONFIG());
const C0 = Radar.assess({ stage:'a', vals:{ sm_spend_prior_q:'500000', new_arr_prior_q:'400000' } });
eq('reset restores built-ins', C0.derived.magic_number, 0.8, 1e-9);
eq('reset removes the custom section', SECTIONS.some(s => s.id === 'custom'), false);
eq('reset rubric version', C0.rubric, RUBRIC.version);
/* v4.2 — capped participation, notes, terms, VC Method, burn, PMF, checklist, risk map */
const capCls = [{ id:'new', frac:0.25, pref:1, part:true, cap:2 }];
eq('capped participation below the cap', liquidate(2, 0, capCls, 0.75).byId.new, 1.25, 1e-9);
eq('capped participation stops at the cap', liquidate(6, 0, capCls, 0.75).byId.new, 2, 1e-9);
eq('capped participation: excess goes to common', liquidate(6, 0, capCls, 0.75).common, 4, 1e-9);
eq('capped participation converts above the cap', liquidate(10, 0, capCls, 0.75).byId.new, 2.5, 1e-9);
S = blankState(); S.stage = 'seed';
S.vals = { notes_principal:'1000000', notes_rate:'6', notes_months:'18' };
eq('note accrues simple interest', notesAccrued(), 1090000, 1e-6);
S.vals = { round_size:'5000000', round_pre_money:'20000000', notes_principal:'1000000', notes_cap:'10000000', notes_discount:'20', future_rounds:'0', pool_target_post:'0' };
const ND = dealMath(derive().D);
eq('note converts at the cap on the pre-money', ND.fNote, (1 / 11) * 0.8, 1e-9);
eq('note lowers the effective pre-money', ND.effPre, 20000000 - (1 / 11) * 0.8 * 25000000, 1e-3);
S = blankState(); S.stage = 'a';
S.vals = { round_size:'8000000', round_pre_money:'19000000', our_check:'8000000', future_rounds:'0', years_to_exit:'5', target_irr:'30', exit_arr_base:'10000000', exit_multiple_assumption:'10' };
const VM = dealMath(derive().D).returns;
eq('VC Method post-money (Sahlman example)', VM.justifiedPost, 100000000 / Math.pow(1.3, 5), 1);
eq('VC Method base-case multiple', VM.cases[1].moic, 100000000 * (8 / 27) / 8000000, 1e-9);
eq('First Chicago probabilities sum to one', VM.cases.reduce((a, c) => a + c.prob, 0), 1, 1e-9);
S.sel = { anti_dilution:'Full ratchet' }; S.bools = { cumulative_dividends:true };
const TR = assessAll();
eq('full ratchet flagged off-market', TR.deal.terms.find(t => t.term === 'Anti-dilution').flag, 'off');
eq('off-market terms pattern', (TR.patterns.find(p => p.id === 'offmarket_terms') || {}).sev, 'red');
eq('off-market terms on the deal risk map', TR.risk.find(c => c.id === 'deal').items.some(x => /Off-market/.test(x.title)), true);
S = blankState();
S.vals = { gross_burn:'200000', net_burn:'300000', arr_now:'1200000' };
eq('net burn above gross burn is impossible', runChecks(derive().D).find(c => c.id === 'burn_bridge').sev, 'major');
S.vals = { gross_burn:'400000', net_burn:'300000', arr_now:'1200000', cash_on_hand:'4000000' };
eq('gross burn bridge reconciles', runChecks(derive().D).find(c => c.id === 'burn_bridge').sev, 'ok');
eq('runway if revenue stopped', derive().D.runway_gross, 10, 1e-9);
S = blankState(); S.stage = 'seed';
S.vals = { pmf_very_disappointed:'50', pmf_respondents:'12' };
eq('small PMF survey is not scored', suppressions(derive().D).pmf_score != null, true);
S.vals.pmf_respondents = '80';
eq('PMF survey scored with enough answers', scoreAll(derive().D, []).dimensions.find(d => d.id === 'market').metrics.some(m => m.key === 'pmf_score' && m.score > 72), true);
S = blankState(); S.stage = 'seed'; S.bools = { funds_separate:false, taxes_current:false };
const CI = checklistItems(false);
eq('checklist follows the stage', CI.some(it => it.id === 'qoe'), false);
eq('checklist marks an input as an issue', checklistStatus(CI.find(it => it.id === 'separate_accounts')).v, 'issue');
S.checklist = { separate_accounts:'reviewed' };
eq('checklist: the user’s status wins', checklistStatus(CI.find(it => it.id === 'separate_accounts')).v, 'reviewed');
const TX = assessAll();
eq('unpaid taxes gate the score', TX.sc.gates.some(g => g.id === 'taxes_current'), true);
eq('tax gate on the legal risk map', TX.risk.find(c => c.id === 'legal').red >= 1, true);
restorePayload({ checklist:{ a_ok:'received', bad:'<x>' } });
eq('checklist statuses restored and sanitised', S.checklist, { a_ok:'received' });
S = blankState();
/* v4.2 review fixes */
S = blankState(); S.stage = 'seed';
S.vals = { round_size:'4000000', round_pre_money:'16000000', exit_arr_base:'20000000', exit_multiple_assumption:'10', prob_up:'20' };
const PR = dealMath(derive().D).returns;
eq('blank probabilities take stage defaults, then rescale', PR.cases.map(c => Math.round(c.prob * 1000) / 1000), [60 / 108, 28 / 108, 20 / 108].map(v => Math.round(v * 1000) / 1000));
S.vals.prob_down = '0'; S.vals.prob_base = '0'; S.vals.prob_up = '0';
eq('all-zero probabilities fall back to defaults', dealMath(derive().D).returns.probsEstimated, true);
S.vals = { round_size:'3000000', round_pre_money:'12000000', our_check:'5000000' };
const BIG = dealMath(derive().D);
eq('cheque above the round is capped', [BIG.I.check, BIG.ownEntry], [3000000, 0.2]);
const stab = [{ id:'new', frac:0.5, pref:30, part:true, cap:60 }, { id:'safe', frac:0.1, pref:2, part:false }, { id:'notes', frac:0.05, pref:1, part:false }];
const LQ = liquidate(47.5, 0, stab, 0.35);
const alt = waterfallPayouts(47.5, stab, 0.35, new Set(LQ.converted.includes('new') ? LQ.converted.filter(x => x !== 'new') : LQ.converted.concat('new')));
eq('liquidation result is stable for every class', alt.byId.new <= LQ.byId.new + 1e-6, true);
eq('fractional years grow a partial year', projectArr(100, 100, 1.5, 1, 0), 100 * 2 * Math.pow(2, 0.5), 1e-9);
S.vals = { round_size:'5000000', round_pre_money:'20000000', new_liq_pref:'1', new_part_cap:'1' }; S.bools = { new_participating:true };
eq('a 1x cap works as non-participating', dealMath(derive().D).classes.find(c => c.id === 'new').part, false);
S = blankState(); S.stage = 'seed'; S.bools = { taxes_current:false }; S.checklist = { payroll_tax:'todo' };
eq('“Not started” overrides a status filled from inputs', checklistStatus(checklistItems(false).find(it => it.id === 'payroll_tax')).v, '');
eq('founder email asks about the tax gate', typeof GATE_ASK.taxes_current, 'string');
/* v4.3 — everything the owner can change in the Studio */
S = blankState();
applyConfig({ gates:[{ title:'Top customer over half of revenue', when:'top1_pct > 50', ask:'Who is the customer and when does the contract renew?', risk:'market' }] });
const G1 = Radar.assess({ stage:'a', vals:{ top1_pct:'60' } }), G2 = Radar.assess({ stage:'a', vals:{ top1_pct:'20' } });
eq('custom deal-breaker fires on its condition', G1.scoring.gates.some(g => g.custom && g.title === 'Top customer over half of revenue'), true);
eq('custom deal-breaker quiet otherwise', G2.scoring.gates.some(g => g.custom), false);
S = Object.assign(blankState(), { stage:'a', vals:{ top1_pct:'60' } });
eq('custom deal-breaker sits on its risk-map row', assessAll().risk.find(c => c.id === 'market').red >= 1, true);
S = blankState();
applyConfig({ gates:[{ title:'Bad', when:'top1_pct >' }] });
eq('a broken deal-breaker condition never fires', Radar.assess({ stage:'a', vals:{ top1_pct:'60' } }).scoring.gates.some(g => g.custom), false);
/* Check tolerances */
applyConfig(EMPTY_CONFIG());
const ARRCHK = { stage:'a', vals:{ arr_now:'1000000', stated_arr:'1050000' } };
eq('built-in tolerance: 5% deck gap is minor', Radar.assess(ARRCHK).checks.find(c => c.id === 'stated_arr').sev, 'minor');
applyConfig({ checkTol:{ stated_arr:{ tol:6 } } });
eq('looser tolerance: same gap now reconciles', Radar.assess(ARRCHK).checks.find(c => c.id === 'stated_arr').sev, 'ok');
applyConfig({ checkTol:{ stated_arr:{ tol:1, hard:3 } } });
eq('stricter tolerance: same gap now material', Radar.assess(ARRCHK).checks.find(c => c.id === 'stated_arr').sev, 'major');
applyConfig({ checkTol:{ stated_nrr:{ tol:20 } } });
eq('material threshold never below the minor one', tolOf('stated_nrr', 3, 8), { tol:20, hard:20 });
eq('single-threshold checks stay single', tolOf('burn_check', 55, null).hard, null);
/* Red-flag triggers */
applyConfig(EMPTY_CONFIG());
const RC = { stage:'seed', vals:{ cash_on_hand:'1100000', net_burn:'100000' } };
eq('built-in trigger: 11 months of runway is a risk-free watch', (Radar.assess(RC).patterns.find(p => p.id === 'runway_cliff') || {}).sev, 'amber');
applyConfig({ patternParams:{ runway_cliff:{ red:12 } } });
eq('changed trigger: same runway is now a risk', (Radar.assess(RC).patterns.find(p => p.id === 'runway_cliff') || {}).sev, 'red');
applyConfig({ patternParams:{ runway_cliff:{ amber:6, red:3 } } });
eq('changed trigger: same runway no longer flagged', Radar.assess(RC).patterns.some(p => p.id === 'runway_cliff'), false);
eq('triggers never change the score, so not the score version', rubricVersion(), RUBRIC.version);
/* Scored answers and yes/no points */
applyConfig(EMPTY_CONFIG());
const SOC = { stage:'a', sel:{ soc2:'Type I' } };
const socScore = r => r.scoring.dimensions.find(d => d.id === 'govern').metrics.find(m => m.key === 'soc2').score;
eq('built-in answer score', socScore(Radar.assess(SOC)), 70);
applyConfig({ categorical:{ soc2:{ 'Type I':40 } } });
eq('owner’s answer score', socScore(Radar.assess(SOC)), 40);
applyConfig({ metricWeights:{ cat_soc2:3 } });
eq('owner’s answer weight', Radar.assess(SOC).scoring.dimensions.find(d => d.id === 'govern').metrics.find(m => m.key === 'soc2').weight, 3);
applyConfig({ hidden:{ metrics:['cat_soc2'] } });
eq('switched-off answer not scored', Radar.assess(SOC).scoring.dimensions.find(d => d.id === 'govern').metrics.some(m => m.key === 'soc2'), false);
applyConfig(EMPTY_CONFIG());
const LIT = { stage:'a', vals:{ arr_now:'5000000' }, sel:{ audited_financials:'Reviewed' }, bools:{ litigation:true } };
const govAdj = r => r.scoring.dimensions.find(d => d.id === 'govern').adj;
eq('built-in yes/no points', govAdj(Radar.assess(LIT)), -12);
applyConfig({ booleans:{ 'litigation:minus':20 } });
eq('owner’s yes/no points (capped at 15 per dimension)', govAdj(Radar.assess(LIT)), -15);
applyConfig({ booleans:{ 'litigation:minus':0 } });
eq('0 points makes an answer neutral', govAdj(Radar.assess(LIT)), 0);
/* Defaults & assumptions */
applyConfig(EMPTY_CONFIG());
const DF = { stage:'seed', vals:{ round_size:'4000000', round_pre_money:'16000000', arr_now:'1000000', arr_12mo:'500000' } };
const d0 = Radar.assess(DF).deal;
applyConfig({ defaults:{ exit:{ years:{ seed:4 }, irr:{ seed:35 }, probs:{ seed:[50, 30, 20] }, fcRate:20 }, deal:{ exit_multiple:6, dilution:15, future_rounds:{ seed:2 } } } });
const d1 = Radar.assess(DF).deal;
eq('default years to exit', d1.returns.cases[1].years, 4);
eq('default probabilities', d1.returns.cases.map(c => Math.round(c.prob * 100)), [50, 30, 20]);
eq('default target return', d1.returns.r, 35);
eq('default First Chicago rate', d1.returns.fc, 20);
eq('default exit multiple and dilution', [d1.I.exitMult, d1.I.dil, d1.I.rounds], [6, 15, 2]);
eq('built-in defaults before the change', [d0.I.exitMult, d0.I.dil], [BASE.deal.exit_multiple, BASE.deal.dilution]);
applyConfig({ defaults:{ sim:{ horizon:48 }, stageRange:{ seed:{ lo:500000, hi:3000000 } }, evidence:{ verbal:0.1 } } });
eq('default simulation horizon', assumptions().horizon, 48);
eq('stage range used by the setup page', [STAGE_RANGE.seed.lo, STAGE_RANGE.seed.hi, STAGES[1].s], [500000, 3000000, money(500000) + ' – ' + money(3000000) + ' ARR']);
eq('evidence weight', EVIDENCE.find(e => e.id === 'verbal').w, 0.1);
applyConfig(EMPTY_CONFIG());
eq('defaults return to the built-ins', [EXIT_DEFAULTS.years.seed, DEAL_DEFAULTS.exit_multiple, ASSUME_DEFAULTS.horizon, STAGE_RANGE.seed.lo, EVIDENCE.find(e => e.id === 'verbal').w],
  [BASE.exit.years.seed, BASE.deal.exit_multiple, BASE.assume.horizon, BASE.stageRange.seed.lo, 0.25]);
eq('malformed defaults are cleaned', normalizeConfig({ defaults:{ exit:{ years:{ seed:'x', a:99 }, probs:{ seed:[1, 2] } }, deal:{ dilution:-5 }, evidence:{ '<x>':0.5 } } }).defaults, { exit:{ years:{ a:20 } }, deal:{ dilution:0 } });
/* Business models */
applyConfig({ models:[{ id:'x_hardware', name:'Hardware', desc:'Devices', emoji:'🔧' }, { id:'saas', name:'Shadow' }, { id:'Bad Id', name:'x' }],
  fields:[{ id:'c_units', label:'Units shipped', section:'custom', type:'num', models:['x_hardware'] }] });
eq('custom business model offered', MODELS.map(m => m.id), ['saas', 'ai_app', 'marketplace', 'fintech', 'x_hardware']);
eq('custom model label', modelLabel('x_hardware'), 'Hardware');
S = Object.assign(blankState(), { model:'x_hardware' });
eq('inputs limited to the custom model appear for it', ALL_FIELDS().some(f => f.id === 'c_units') && visibleFields(SECTIONS.find(s => s.id === 'custom')).some(f => f.id === 'c_units'), true);
S = Object.assign(blankState(), { model:'saas' });
eq('and not for other models', visibleFields(SECTIONS.find(s => s.id === 'custom')).some(f => f.id === 'c_units'), false);
S = blankState();
eq('a custom model scores with the core metrics', Radar.assess({ stage:'a', model:'x_hardware', vals:{ arr_now:'5000000', arr_12mo:'2500000', net_burn:'200000' } }).scoring.overall != null, true);
restorePayload({ model:'x_hardware' });
eq('custom model restored from a shared report', S.model, 'x_hardware');
S = blankState();
applyConfig(EMPTY_CONFIG());
eq('removing the model removes it from the list', MODELS.length, 4);
/* Published benchmarks */
applyConfig({ benchmarks:[{ metric:'nrr', stage:'a', p25:100, median:110, p75:120, source:'Survey', year:'2026' }, { metric:'burn_multiple', stage:'all', p25:1, median:1.6, p75:2.5 }, { metric:'nrr', stage:'seed', median:105 }, { metric:'<x>', median:1 }] });
eq('benchmarks validated', CFG.benchmarks.length, 3);
S = Object.assign(blankState(), { stage:'a', vals:{ nrr_override:'' } });
const BR = benchRows({ D:{ nrr:125, burn_multiple:0.8 } });
eq('benchmark rows follow the stage', BR.map(r => r.b.metric), ['nrr', 'burn_multiple']);
eq('position against the quartiles (higher is better)', BR[0].pos, 'top quartile');
eq('position against the quartiles (lower is better)', BR[1].pos, 'top quartile');
S.stage = 'seed';
eq('median-only benchmark never claims a quartile', [benchRows({ D:{ nrr:90 } }).find(r => r.b.metric === 'nrr').pos, benchRows({ D:{ nrr:140 } }).find(r => r.b.metric === 'nrr').pos], ['below the median', 'above the median']);
S = blankState();
/* Checklist: owner items in new categories */
applyConfig({ checklist:[{ text:'Reference calls with three lost deals', category:'Commercial references', from:'seed' }, { text:'Board minutes', from:'a' }] });
S = Object.assign(blankState(), { stage:'seed' });
const CLI = checklistItems(false);
eq('owner checklist item in its own category', checklistCats(CLI).includes('Commercial references'), true);
eq('owner checklist item follows its stage', CLI.some(it => it.text === 'Board minutes'), false);
/* Term-sheet norms */
applyConfig(EMPTY_CONFIG());
const TS = { stage:'a', vals:{ round_size:'5000000', round_pre_money:'20000000', new_liq_pref:'1.5' } };
eq('built-in norm: a 1.5x preference is off-market', Radar.assess(TS).deal.terms.find(t => t.term === 'Liquidation preference').flag, 'off');
applyConfig({ patternParams:{ terms:{ pref:2 } } });
eq('owner’s norm: up to 2x accepted', Radar.assess(TS).deal.terms.find(t => t.term === 'Liquidation preference').flag, 'ok');
applyConfig(EMPTY_CONFIG());
/* Renaming the rest of the built-ins */
applyConfig({ labels:{ sections:{ team:'Founders' }, dims:{ gtm:'Sales engine' }, patterns:{ runway_cliff:'Short runway' }, gates:{ taxes_current:'Tax arrears' }, checklist:{ separate_accounts:'Separate bank accounts' } } });
eq('section renamed', SECTIONS.find(x => x.id === 'team').label, 'Founders');
eq('dimension renamed in the scores', Radar.assess({ stage:'a', vals:{ arr_now:'1000000' } }).scoring.dimensions.find(d => d.id === 'gtm').label, 'Sales engine');
eq('red flag renamed', Radar.assess({ stage:'seed', vals:{ cash_on_hand:'1100000', net_burn:'100000' } }).patterns.find(p => p.id === 'runway_cliff').title, 'Short runway');
eq('deal-breaker renamed', Radar.assess({ stage:'seed', bools:{ taxes_current:false } }).scoring.gates.find(g => g.id === 'taxes_current').title, 'Tax arrears');
S = Object.assign(blankState(), { stage:'seed' });
eq('checklist item renamed', checklistItems(false).find(it => it.id === 'separate_accounts').text, 'Separate bank accounts');
applyConfig(EMPTY_CONFIG());
eq('names come back', [SECTIONS.find(x => x.id === 'team').label, DIM_LABEL.gtm, RUBRIC.gates.find(g => g.id === 'taxes_current').title, checklistItems(false).find(it => it.id === 'separate_accounts').text],
  [BASE.slabel.team, BASE.dimlabel.gtm, BASE.gtitle.taxes_current, DILIGENCE.find(d => d.id === 'separate_accounts').text]);
/* v4.3 review fixes */
eq('model icon cannot carry markup', normalizeConfig({ models:[{ id:'x_hw', name:'HW', emoji:'<img src=x onerror=alert(1)>' }] }).models[0].emoji, '🧩');
eq('model icon keeps an emoji', normalizeConfig({ models:[{ id:'x_hw', name:'HW', emoji:'🔧' }] }).models[0].emoji, '🔧');
eq('quartiles listed best-first are reordered', ['p25','median','p75'].map(k => normalizeConfig({ benchmarks:[{ metric:'cac_payback', p25:30, median:20, p75:12 }] }).benchmarks[0][k]), [12, 20, 30]);
eq('a lone quartile moves to its side of the median', [orderQuartiles({ p25:30, median:20, p75:null }).p25, orderQuartiles({ p25:30, median:20, p75:null }).p75], [null, 30]);
applyConfig({ benchmarks:[{ metric:'cac_payback', stage:'all', p25:30, median:20, p75:12 }] });
S = Object.assign(blankState(), { stage:'a' });
eq('lower-is-better placed after reordering', benchRows({ D:{ cac_payback:25 } })[0].pos, 'below the median');
eq('exactly at the median', benchRows({ D:{ cac_payback:20 } })[0].pos, 'at the median');
S = blankState();
applyConfig({ hidden:{ checks:['stated_arr','ar'] }, thresholds:{ nrr:{ a:[95,105,115,130] }, grr:{ a:[80,85,90,95] } } }); const sigA = rubricVersion();
applyConfig({ thresholds:{ grr:{ a:[80,85,90,95] }, nrr:{ a:[95,105,115,130] } }, hidden:{ checks:['ar','stated_arr'] } });
eq('same content, same rubric version, whatever the order', rubricVersion(), sigA);
eq('an exit multiple of 0 is not accepted', normalizeConfig({ defaults:{ deal:{ exit_multiple:0 } } }).defaults.deal.exit_multiple, 0.1);
applyConfig({ defaults:{ stageRange:{ seed:{ lo:5000000, hi:1000000 } } } });
eq('an inconsistent stage range keeps the built-in one', [STAGE_RANGE.seed.lo, STAGE_RANGE.seed.hi], [BASE.stageRange.seed.lo, BASE.stageRange.seed.hi]);
applyConfig({ defaults:{ exit:{ decayBase:20, downMultiple:0.5, fcRate:22 }, deal:{ exit_multiple:6 } } });
const hintOf = id => ALL_FIELDS().find(f => f.id === id).hint;
eq('hints quote the defaults in force', [/decaying 20%/.test(hintOf('exit_arr_base')), /0\.5×/.test(hintOf('exit_value_down')), /Default 22%/.test(hintOf('fc_rate')), /Blank = 6×/.test(hintOf('exit_multiple_assumption'))], [true, true, true, true]);
applyConfig({ defaults:{ exit:{ fcRate:22 } }, labels:{ hints:{ fc_rate:'Our own hint' } } });
eq('the owner’s own hint wins', hintOf('fc_rate'), 'Our own hint');
S = blankState();
applyConfig(EMPTY_CONFIG());
eq('all overrides cleared', [rubricVersion(), pp('runway_cliff', 'red'), tolOf('stated_arr', 2, 6).tol, MODELS.length], [RUBRIC.version, 9, 2, 4]);
S = blankState();
globalThis.__results = results;
`;

(0, eval)(app + '\n;' + TESTS);
const res = globalThis.__results;
let failed = 0;
for (const t of res) {
  if (t.ok) console.log('  ✓', t.name);
  else { failed++; console.log('  ✗', t.name, '— got', JSON.stringify(t.got), 'expected', JSON.stringify(t.exp)); }
}
console.log(`\n${res.length - failed}/${res.length} passed`);
process.exit(failed ? 1 : 0);
