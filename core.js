
/* ═══════════════════════════════════════════════════════════════
   VC RISK RADAR v4 — evidence-first diligence engine
   © 2026 Axel De Sousa · MIT License · github.com/dsaxel05/VCR2
   ---------------------------------------------------------------
   Design rules enforced in this build:
   1. Never ask for a number that can be derived from other inputs.
   2. Separate what the company CLAIMS from what the data SHOWS —
      and prefer the company's own customer-level data to its summary.
   3. Score deterministically, from a versioned rubric, with weights.
   4. Suppress metrics that are not statistically meaningful at scale.
   5. Weight every number by the quality of the evidence behind it.
   6. Never render untrusted text with innerHTML without escaping.
   7. The model never scores. It extracts and it drafts prose.
   8. Output a question list, not a verdict.

   Modules, in bundle order: core · util · ledger · series · deal ·
   sim · patterns · library · charts · report · exports · demo · boot.
   Readable sources live in /src and are bundled into index.html by
   build.py. Engine tests: node tests/engine.test.mjs
   ═══════════════════════════════════════════════════════════════ */

/* ── ESCAPING: every interpolation of user or model text goes through esc() ── */
const ESC_MAP = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC_MAP[c]);

/* ── FORMATTERS ── */
const nf = new Intl.NumberFormat('en-US');
function money(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v), sign = v < 0 ? '-' : '';
  if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return sign + '$' + Math.round(a / 1e3) + 'k';
  return sign + '$' + Math.round(a);
}
const pctv = (v, d = 1) => v == null || !isFinite(v) ? '—' : v.toFixed(d) + '%';
const xv   = (v, d = 2) => v == null || !isFinite(v) ? '—' : v.toFixed(d) + 'x';
const numv = (v, d = 2) => v == null || !isFinite(v) ? '—' : v.toFixed(d);
const monv = (v, d = 1) => v == null || !isFinite(v) ? '—' : v.toFixed(d) + ' mo';

/* ═══════════════════════════════════════════════════════════════
   STAGES & BUSINESS MODELS
   ═══════════════════════════════════════════════════════════════ */
const STAGES = [
  { id:'preseed', n:'Pre-seed',  s:'< $250k ARR' },
  { id:'seed',    n:'Seed',      s:'$250k – $2M ARR' },
  { id:'a',       n:'Series A',  s:'$2M – $10M ARR' },
  { id:'b',       n:'Series B+', s:'$10M+ ARR' },
];

const MODELS = [
  { id:'saas',        em:'☁️', n:'B2B SaaS',        s:'Subscription software', calib:'full' },
  { id:'ai_app',      em:'🤖', n:'AI application',  s:'App layer on a model',  calib:'full' },
  { id:'marketplace', em:'⚡', n:'Marketplace',     s:'Two-sided, take rate',  calib:'partial' },
  { id:'fintech',     em:'💳', n:'Fintech',         s:'Regulated financial',   calib:'partial' },
];
const CALIB_NOTE = {
  full:    'The default thresholds are built for B2B SaaS and AI application companies, and the business-model section adds the metrics specific to this model. Every threshold is an editable calibration, not a market statistic — load your own deals into the Library to recalibrate them on your data.',
  custom:  'This business model was added by the owner of this site. The core thresholds (retention, burn, growth, team, governance) apply as they do to every model, and the business-model section shows the inputs added for it. Treat dimension scores as directional and lean on the consistency checks and the revenue ledger, which are model-independent.',
  partial: 'Core thresholds are adapted from software benchmarks, and the business-model section adds the metrics that matter for this model. Treat dimension scores as directional and lean on the consistency checks and the revenue ledger, which are model-independent. Recalibrating from your own Library makes the scores specific to how you invest.',
};

/* ═══════════════════════════════════════════════════════════════
   EVIDENCE SECTIONS — PRIMITIVES ONLY
   Anything computable from these fields is NOT a field. See DERIVED.
   ═══════════════════════════════════════════════════════════════ */
const SECTIONS = [
  {
    id:'revenue', label:'Revenue & retention', em:'📊', ibg:'#0e1a2e',
    desc:'The ARR waterfall. Everything on the retention side is computed from these four movement figures.',
    fields:[
      { g:'Position', id:'arr_now',   lbl:'ARR today',              t:'num', unit:'$', req:true,
        hint:'Contracted recurring revenue only. Exclude one-off services and unsigned pipeline.' },
      { g:'Position', id:'arr_12mo',  lbl:'ARR 12 months ago',      t:'num', unit:'$', req:true,
        hint:'Same definition, same date last year. Growth is computed from this — do not enter a growth rate.' },
      { g:'Movement (last 12 months)', id:'new_arr_l12',        lbl:'New-logo ARR added', t:'num', unit:'$',
        hint:'ARR from customers who were not customers 12 months ago.' },
      { g:'Movement (last 12 months)', id:'expansion_arr_l12',  lbl:'Expansion ARR',      t:'num', unit:'$',
        hint:'Upsell and seat growth inside existing accounts.' },
      { g:'Movement (last 12 months)', id:'churned_arr_l12',    lbl:'Churned ARR',        t:'num', unit:'$',
        hint:'ARR lost to full cancellations. Enter as a positive number.' },
      { g:'Movement (last 12 months)', id:'contraction_arr_l12',lbl:'Contraction ARR',    t:'num', unit:'$',
        hint:'ARR lost to downgrades on retained accounts. Positive number.' },
      { g:'Revenue quality', id:'gross_margin', lbl:'Gross margin', t:'num', unit:'%', req:true, chips:[45,60,75,85],
        hint:'(Revenue − COGS) ÷ Revenue. COGS includes hosting, inference, support and delivery.' },
      { g:'Revenue quality', id:'cogs_hosting',  lbl:'Annual hosting / inference cost', t:'num', unit:'$',
        hint:'Used to cross-check the stated gross margin.' },
      { g:'Revenue quality', id:'cogs_support',  lbl:'Annual support & delivery cost',  t:'num', unit:'$',
        hint:'Customer success, implementation, professional services headcount and vendors.' },
      { g:'Revenue quality', id:'services_pct',  lbl:'Non-recurring revenue share',     t:'num', unit:'%',
        hint:'Share of total revenue from implementation or services. Above 15% and the ARR label is doing work.' },
      { g:'Revenue quality', id:'pct_annual',    lbl:'ARR on annual or longer terms',   t:'num', unit:'%', chips:[25,50,75,95],
        hint:'Monthly-only contracts make NRR look better than the real commitment level.' },
      { g:'Collections', id:'deferred_revenue', lbl:'Deferred revenue balance', t:'num', unit:'$',
        hint:'Cash collected for services not yet delivered.' },
      { g:'Collections', id:'ar_over_90',       lbl:'Receivables over 90 days', t:'num', unit:'$',
        hint:'Booked revenue that has not been collected. A quiet churn indicator.' },
    ]
  },
  {
    id:'capital', label:'Capital & burn', em:'🔥', ibg:'#1e1308',
    desc:'Runway, burn efficiency and dilution overhang are all derived from these. Do not enter a runway figure.',
    fields:[
      { g:'Position', id:'cash_on_hand', lbl:'Cash and equivalents', t:'num', unit:'$', req:true,
        hint:'Bank balance today, excluding undrawn debt facilities.' },
      { g:'Position', id:'net_burn',     lbl:'Net monthly burn',     t:'num', unit:'$', req:true,
        hint:'Average over the last three months. Net of revenue collected, not gross spend.' },
      { g:'Position', id:'gross_burn',   lbl:'Gross monthly burn (all cash expenses)', t:'num', unit:'$',
        hint:'Everything that leaves the bank in a month, before revenue. Gives the runway if revenue stopped, and cross-checks the net burn.' },
      { g:'Position', id:'total_raised', lbl:'Total equity raised',  t:'num', unit:'$', req:true,
        hint:'Cumulative primary equity in. Excludes debt and unconverted SAFEs.' },
      { g:'Structure', id:'pre_money',         lbl:'Pre-money at last round', t:'num', unit:'$',
        hint:'Used to size the SAFE overhang and preference stack.' },
      { g:'Structure', id:'safes_outstanding', lbl:'SAFEs not yet converted', t:'num', unit:'$',
        hint:'Face value outstanding. This dilutes the next round, not the last one. Enter convertible notes separately below.' },
      { g:'Structure', id:'notes_principal', lbl:'Convertible notes outstanding (principal)', t:'num', unit:'$',
        hint:'Unlike SAFEs, notes accrue interest and convert on the pre-money. Terms go in Round & returns.' },
      { g:'Structure', id:'debt_outstanding',  lbl:'Venture debt outstanding', t:'num', unit:'$',
        hint:'Principal outstanding. Sits ahead of equity in a liquidation.' },
      { g:'Structure', id:'months_since_round',lbl:'Months since last round closed', t:'num', unit:'months' },
    ]
  },
  {
    id:'gtm', label:'Customers & go-to-market', em:'🎯', ibg:'#0a1e13',
    desc:'CAC, payback, LTV:CAC, ACV and magic number are all computed from the spend and count figures here.',
    fields:[
      { g:'Base', id:'customers_now',  lbl:'Paying customers today',        t:'num', unit:'', req:true,
        hint:'Paying logos, not seats or users. Sets whether retention metrics are meaningful.' },
      { g:'Base', id:'customers_12mo', lbl:'Paying customers 12 months ago',t:'num', unit:'' },
      { g:'Base', id:'logos_lost_l12', lbl:'Logos lost in last 12 months',  t:'num', unit:'' },
      { g:'Concentration', id:'top1_pct',  lbl:'Largest customer share of ARR', t:'num', unit:'%' },
      { g:'Concentration', id:'top5_pct',  lbl:'Top 5 share of ARR',            t:'num', unit:'%' },
      { g:'Concentration', id:'top10_pct', lbl:'Top 10 share of ARR',           t:'num', unit:'%' },
      { g:'Acquisition spend', id:'sm_spend_l12',     lbl:'Sales & marketing spend, last 12 months', t:'num', unit:'$',
        hint:'Fully loaded: salaries, commission, ad spend, events, tooling.' },
      { g:'Acquisition spend', id:'new_customers_l12',lbl:'New customers won, last 12 months', t:'num', unit:'',
        hint:'With S&M spend this gives blended CAC. Do not enter a CAC figure.' },
      { g:'Acquisition spend', id:'sm_spend_prior_q', lbl:'S&M spend, prior quarter', t:'num', unit:'$' },
      { g:'Acquisition spend', id:'new_arr_prior_q',  lbl:'Net new ARR, most recent quarter', t:'num', unit:'$',
        hint:'With prior-quarter S&M this gives the magic number.' },
      { g:'Sales motion', id:'win_rate',          lbl:'Win rate on qualified opportunities', t:'num', unit:'%', chips:[10,20,30,45] },
      { g:'Sales motion', id:'sales_cycle',       lbl:'Median sales cycle', t:'num', unit:'days' },
      { g:'Sales motion', id:'pipeline_coverage', lbl:'Pipeline coverage against next-quarter target', t:'num', unit:'x' },
      { g:'Sales motion', id:'quota_attainment',  lbl:'Reps at or above quota', t:'num', unit:'%', chips:[30,50,70,90],
        hint:'Leave blank if there are fewer than three quota-carrying reps.' },
      { g:'Sales motion', id:'pct_paid',          lbl:'New ARR from paid acquisition', t:'num', unit:'%' },
    ]
  },
  {
    id:'team', label:'Team', em:'🧑‍🚀', ibg:'#1a1108',
    desc:'Verifiable facts only. This build removes the behavioural and linguistic signals from v2 — they had no validated predictive power.',
    fields:[
      { g:'Size', id:'headcount_now',  lbl:'Headcount today',            t:'num', unit:'', req:true },
      { g:'Size', id:'headcount_12mo', lbl:'Headcount 12 months ago',    t:'num', unit:'' },
      { g:'Size', id:'headcount_eng',  lbl:'Engineering headcount',      t:'num', unit:'' },
      { g:'Size', id:'headcount_sales',lbl:'Sales & marketing headcount',t:'num', unit:'' },
      { g:'Size', id:'avg_loaded_comp',lbl:'Average fully loaded cost per employee', t:'num', unit:'$',
        hint:'Salary, tax, benefits, equipment. Defaults to $165,000 if blank. Used to sanity-check burn.' },
      { g:'Founders', id:'founders_count',      lbl:'Number of founders', t:'num', unit:'' },
      { g:'Founders', id:'founder_max_equity',  lbl:'Largest founder stake', t:'num', unit:'%',
        hint:'A very lopsided split among active co-founders is a known source of later conflict.' },
      { g:'Founders', id:'founder_domain_years',lbl:'Years in this domain before founding', t:'num', unit:'years' },
      { g:'Founders', id:'prior_exit',     lbl:'A founder has a prior acquisition or IPO', t:'bool',
        hint:'Verifiable outcome, not a claim of prior startup experience.' },
      { g:'Founders', id:'founder_departed',lbl:'A co-founder has left since inception', t:'bool',
        hint:'If yes, ask how their equity was handled — unresolved founder equity is a cap table problem.' },
      { g:'Founders', id:'founders_years_together', lbl:'Years the founders have worked together', t:'num', unit:'years', chips:[0,1,3,5],
        hint:'Including before this company. A proxy for cohesion: teams that have already worked through hard periods together break up less.' },
      { g:'Founders', id:'technical_founder', lbl:'A founder can build the core product themselves', t:'bool',
        hint:'Not “manages the engineers” — writes or designs the core of what is sold.' },
      { g:'Retention', id:'eng_departures_l12', lbl:'Engineering departures, last 12 months', t:'num', unit:'',
        hint:'Turnover rate is computed against engineering headcount.' },
    ]
  },
  {
    id:'market', label:'Market & competition', em:'🌍', ibg:'#081a14',
    desc:'TAM is computed bottom-up from named accounts and realised ACV. A typed-in market size is not accepted as an input to scoring.',
    fields:[
      { g:'Bottom-up sizing', id:'target_accounts', lbl:'Accounts that match the ICP', t:'num', unit:'',
        hint:'A defensible count of organisations that could buy this today. Not a market-report figure.' },
      { g:'Bottom-up sizing', id:'reachable_pct',   lbl:'Realistically reachable in 5 years', t:'num', unit:'%', chips:[2,5,10,20] },
      { g:'Competition', id:'primary_competitor',  lbl:'Primary competitor', t:'txt' },
      { g:'Competition', id:'win_rate_vs_primary', lbl:'Win rate in head-to-head deals', t:'num', unit:'%' },
      { g:'Competition', id:'pricing_move', lbl:'Last pricing action', t:'select',
        options:['Raised prices','Held prices','Discounted to win','Never tested'] },
      { g:'Competition', id:'switching_cost', lbl:'Cost for a customer to switch away', t:'select',
        options:['High — data or workflow lock-in','Medium — some migration effort','Low — swappable'] },
      { g:'Competition', id:'regulated_market', lbl:'Operates under a licensing or regulatory regime', t:'bool',
        hint:'A barrier and a risk at the same time. Scored neutrally, surfaced as a diligence item.' },
      { g:'Moat', id:'moat_type', lbl:'Main source of defensibility', t:'select',
        options:['Network effects','Proprietary technology or patents','Proprietary data','High switching costs','Economies of scale','Brand','None identified yet'],
        hint:'What stops a well-funded competitor from taking the market. Recorded, not scored: the evidence for it is what matters.' },
      { g:'Moat', id:'patents', lbl:'Patents granted or filed', t:'num', unit:'' },
      { g:'Product-market fit', id:'mission_critical', lbl:'How essential the product is to customers', t:'select',
        options:['Mission-critical — work stops without it','Important — painful to replace','Nice to have — discretionary'],
        hint:'The first line to be cut in a budget review is the one marked “nice to have”.' },
      { g:'Product-market fit', id:'pmf_very_disappointed', lbl:'Users who would be “very disappointed” without the product', t:'num', unit:'%', chips:[25,40,50,60],
        hint:'Sean Ellis test. 40% or more is the usual sign of product-market fit.' },
      { g:'Product-market fit', id:'pmf_respondents', lbl:'Respondents to that survey', t:'num', unit:'',
        hint:'Below about 30 answers the percentage is not scored.' },
      { g:'Product-market fit', id:'nps', lbl:'Net Promoter Score', t:'num', unit:'', chips:[0,20,40,60],
        hint:'% promoters − % detractors, from −100 to +100.' },
      { g:'Timing', id:'why_now', lbl:'Why now', t:'txt',
        hint:'The change — technology, regulation, cost, behaviour — that makes this possible today and was not true five years ago.' },
    ]
  },
  {
    id:'model', label:'Business-model specifics', em:'🧩', ibg:'#0b1b22',
    desc:'Metrics that only mean something for this business model. The fields shown follow the model chosen at setup, and the ones scored are scored only for that model.',
    fields:[
      { g:'Product usage', id:'seat_util', lbl:'Purchased seats or licences actively used', t:'num', unit:'%', models:['saas','ai_app'], chips:[40,60,75,90],
        hint:'Low utilisation is the leading indicator of contraction at renewal.' },
      { g:'Product usage', id:'usage_based_pct', lbl:'Revenue billed on usage rather than a fixed fee', t:'num', unit:'%', models:['saas','ai_app'],
        hint:'Usage revenue is real but volatile; it moves NRR in both directions.' },
      { g:'Model economics', id:'inference_pct', lbl:'Inference and model API cost as a share of revenue', t:'num', unit:'%', models:['ai_app'], chips:[10,20,35,50],
        hint:'Past a third of revenue, gross margin is mostly set by a supplier’s price list.' },
      { g:'Model economics', id:'gm_12mo', lbl:'Gross margin 12 months ago', t:'num', unit:'%', models:['ai_app','saas'],
        hint:'With today’s margin this gives the margin trend. AI applications often start low and must show the path up.' },
      { g:'Model economics', id:'top_model_share', lbl:'Inference spend with a single model provider', t:'num', unit:'%', models:['ai_app'] },
      { g:'Model economics', id:'proprietary_data', lbl:'The product depends on proprietary data or feedback loops a competitor cannot buy', t:'bool', models:['ai_app'],
        hint:'The main defence an application has against the model layer moving up the stack.' },
      { g:'Volume', id:'gmv_now', lbl:'GMV run-rate today, annualised', t:'num', unit:'$', models:['marketplace'],
        hint:'With ARR (net revenue run-rate) this gives the realised take rate.' },
      { g:'Volume', id:'gmv_12mo', lbl:'GMV run-rate 12 months ago, annualised', t:'num', unit:'$', models:['marketplace'] },
      { g:'Volume', id:'repeat_gmv_pct', lbl:'GMV from repeat buyers', t:'num', unit:'%', models:['marketplace'], chips:[20,35,50,70] },
      { g:'Unit economics', id:'contrib_margin', lbl:'Contribution margin per transaction', t:'num', unit:'%', models:['marketplace'],
        hint:'After payment processing, incentives, support and insurance.' },
      { g:'Unit economics', id:'incentives_pct', lbl:'Incentives and subsidies as a share of GMV', t:'num', unit:'%', models:['marketplace'],
        hint:'Growth bought with subsidies tends to leave when the subsidies do.' },
      { g:'Liquidity', id:'top_supplier_pct', lbl:'GMV from the top 10 suppliers', t:'num', unit:'%', models:['marketplace'] },
      { g:'Risk', id:'loss_rate', lbl:'Net credit and fraud losses as a share of volume', t:'num', unit:'%', models:['fintech'], chips:[0.5,1,2,4] },
      { g:'Risk', id:'licence_model', lbl:'Regulatory model', t:'select', models:['fintech'],
        options:['Own licences','Sponsor or partner bank','Licence application pending','Not regulated'] },
      { g:'Risk', id:'regulatory_findings', lbl:'Open regulatory findings, consent orders or partner-bank remediation', t:'bool', models:['fintech'] },
      { g:'Economics', id:'volume_now', lbl:'Processed or originated volume, annualised', t:'num', unit:'$', models:['fintech'] },
      { g:'Economics', id:'volume_12mo', lbl:'Volume 12 months ago, annualised', t:'num', unit:'$', models:['fintech'] },
    ]
  },
  {
    id:'govern', label:'Governance, cap table & technical risk', em:'⚖️', ibg:'#1e0a1e',
    desc:'Four of these are hard gates. A gate does not lower the score — it stops the assessment until resolved.',
    fields:[
      { g:'Gates', id:'ip_assignments', lbl:'Every employee and contractor has signed IP assignment', t:'bool', gate:'no',
        hint:'Gate. One unsigned contractor can mean the company does not own its own product.' },
      { g:'Gates', id:'contractor_ip',  lbl:'Any risk a contractor retains rights to core IP', t:'bool', gate:'yes',
        hint:'Gate. Answer yes if this has not been affirmatively checked.' },
      { g:'Gates', id:'chain_title',    lbl:'Clean chain of title through every historical transfer', t:'bool', gate:'no',
        hint:'Gate. Covers predecessor entities, university licences and acquired code.' },
      { g:'Gates', id:'captable_documented', lbl:'Cap table is fully documented with no verbal promises', t:'bool', gate:'no',
        hint:'Gate. Undocumented equity promises surface at the worst possible moment.' },
      { g:'Gates', id:'taxes_current', lbl:'Payroll, income and sales taxes are filed and paid to date', t:'bool', gate:'no',
        hint:'Gate. Unpaid payroll taxes are a liability that can reach the officers personally; they are settled before closing.' },
      { g:'Terms', id:'liq_pref',   lbl:'Liquidation preference on the senior series', t:'num', unit:'x', chips:[1,1.5,2] },
      { g:'Terms', id:'participating', lbl:'Preference is participating', t:'bool' },
      { g:'Terms', id:'option_pool', lbl:'Unallocated option pool', t:'num', unit:'%', chips:[5,10,15,20] },
      { g:'Terms', id:'founder_vesting', lbl:'Founders are on an unexpired vesting schedule', t:'bool' },
      { g:'Terms', id:'litigation', lbl:'Material pending litigation', t:'bool' },
      { g:'Books', id:'audited_financials', lbl:'Financial statement quality', t:'select',
        options:['Audited','Reviewed','Compiled','Internal only'] },
      { g:'Books', id:'funds_separate', lbl:'Company bank accounts are fully separate from the founders’ personal finances', t:'bool',
        hint:'Commingled funds make the books unauditable and are among the first things a diligence accountant checks.' },
      { g:'Books', id:'valuation_409a', lbl:'A 409A valuation from the last 12 months supports the option grants', t:'bool',
        hint:'US companies granting options. Without one, grants may be mispriced for tax purposes.' },
      { g:'Books', id:'insurance_dno', lbl:'D&O insurance is in place, or will be bound at closing', t:'bool' },
      { g:'Technical', id:'soc2', lbl:'SOC 2 status', t:'select',
        options:['Type II','Type I','In progress','None'] },
      { g:'Technical', id:'uptime_90d', lbl:'Measured uptime, last 90 days', t:'num', unit:'%', chips:[99,99.5,99.9,99.99],
        hint:'Measured, not the contractual SLA number.' },
      { g:'Technical', id:'p1_incidents', lbl:'Severity-1 incidents, last 12 months', t:'num', unit:'' },
      { g:'Technical', id:'infra_single_vendor', lbl:'A single infrastructure vendor outage takes the product down', t:'bool' },
      { g:'Technical', id:'model_single_vendor', lbl:'A single model provider outage takes the product down', t:'bool',
        hint:'Relevant for AI applications. Also a pricing-power question, not only an availability one.' },
      { g:'Technical', id:'dpas_signed', lbl:'Data processing agreements in place with enterprise customers', t:'bool' },
      { g:'Technical', id:'oss_reviewed', lbl:'Open-source licences reviewed — no copyleft code in what ships', t:'bool' },
    ]
  },
  {
    id:'claims', label:'What the company states', em:'🗣️', ibg:'#131025',
    desc:'Enter the headline numbers exactly as the deck, model or founder update presents them. Nothing here is scored. Every field is compared against the figure computed from the primitives above, and any gap becomes a finding.',
    claims:true,
    fields:[
      { g:'Headline', id:'stated_arr',     lbl:'ARR as stated in the deck', t:'num', unit:'$',
        hint:'The single most common diligence catch is a deck ARR that does not match the financial model.' },
      { g:'Headline', id:'stated_growth',  lbl:'Growth rate as stated',     t:'num', unit:'%' },
      { g:'Headline', id:'stated_runway',  lbl:'Runway as stated',          t:'num', unit:'months' },
      { g:'Retention', id:'stated_nrr',    lbl:'NRR as stated',             t:'num', unit:'%' },
      { g:'Retention', id:'stated_grr',    lbl:'GRR as stated',             t:'num', unit:'%' },
      { g:'Efficiency', id:'stated_rule40',        lbl:'Rule of 40 as stated',   t:'num', unit:'' },
      { g:'Efficiency', id:'stated_burn_multiple', lbl:'Burn multiple as stated',t:'num', unit:'' },
      { g:'Efficiency', id:'stated_magic_number',  lbl:'Magic number as stated', t:'num', unit:'' },
      { g:'Unit economics', id:'stated_cac',         lbl:'CAC as stated',          t:'num', unit:'$' },
      { g:'Unit economics', id:'stated_cac_payback', lbl:'CAC payback as stated',  t:'num', unit:'months' },
      { g:'Unit economics', id:'stated_ltv_cac',     lbl:'LTV:CAC as stated',      t:'num', unit:'x' },
      { g:'Unit economics', id:'stated_acv',         lbl:'ACV as stated',          t:'num', unit:'$' },
      { g:'Market', id:'stated_tam', lbl:'TAM as stated', t:'num', unit:'$',
        hint:'Compared against accounts × realised ACV. A gap of more than 10x means the figure is top-down.' },
      { g:'Headline', id:'stated_customers', lbl:'Customer count as stated', t:'num', unit:'',
        hint:'Logo counts are inflated by counting free users, pilots or subsidiaries separately.' },
      { g:'Unit economics', id:'stated_take_rate', lbl:'Take rate as stated', t:'num', unit:'%', models:['marketplace','fintech'] },
    ]
  },
  {
    id:'deal', label:'Round & returns', em:'💼', ibg:'#101a2a', deal:true,
    desc:'The proposed terms and your fund. Nothing here is scored. It drives the ownership, dilution, fund-return and liquidation analysis in the report. Leave it blank to skip that analysis.',
    fields:[
      { g:'Proposed round', id:'round_size', lbl:'Round size (new money)', t:'num', unit:'$' },
      { g:'Proposed round', id:'round_pre_money', lbl:'Pre-money valuation offered', t:'num', unit:'$',
        hint:'Headline pre-money. Radar assumes it includes the SAFE conversion and any pool top-up, which is the usual convention.' },
      { g:'Proposed round', id:'our_check', lbl:'Your cheque', t:'num', unit:'$' },
      { g:'Proposed round', id:'pool_target_post', lbl:'Option pool required post-money', t:'num', unit:'%', chips:[8,10,12,15],
        hint:'Any top-up needed to reach this is carved out of the pre-money.' },
      { g:'Proposed round', id:'new_liq_pref', lbl:'Liquidation preference on this round', t:'num', unit:'x', chips:[1,1.5,2] },
      { g:'Proposed round', id:'new_participating', lbl:'This round is participating preferred', t:'bool' },
      { g:'Proposed round', id:'new_part_cap', lbl:'Participation cap, as a multiple of the investment', t:'num', unit:'x', chips:[2,3],
        hint:'Participating preferred only. Leave blank for uncapped participation.' },
      { g:'Term sheet', id:'anti_dilution', lbl:'Anti-dilution protection', t:'select',
        options:['Broad-based weighted average','Narrow-based weighted average','Full ratchet','None'] },
      { g:'Term sheet', id:'board_after', lbl:'Board control after the round', t:'select',
        options:['Founders control the board','Balanced, with an independent director','Investors control the board'] },
      { g:'Term sheet', id:'cumulative_dividends', lbl:'Dividends are cumulative', t:'bool' },
      { g:'Term sheet', id:'redemption_rights', lbl:'Investors can force the company to buy back their shares (redemption)', t:'bool' },
      { g:'Term sheet', id:'pay_to_play', lbl:'Pay-to-play: investors who skip a down round lose their preferences', t:'bool' },
      { g:'Term sheet', id:'pro_rata_rights', lbl:'We get pro-rata rights in future rounds', t:'bool' },
      { g:'Term sheet', id:'information_rights', lbl:'We get monthly or quarterly financials (information rights)', t:'bool' },
      { g:'Term sheet', id:'board_seat', lbl:'We get a board or observer seat', t:'bool' },
      { g:'Existing structure', id:'prior_investor_pct', lbl:'Prior investors’ fully diluted stake before this round', t:'num', unit:'%',
        hint:'Excluding unconverted SAFEs. Needed for an exact liquidation waterfall; estimated if blank.' },
      { g:'Existing structure', id:'safe_cap', lbl:'SAFE valuation cap (weighted average)', t:'num', unit:'$' },
      { g:'Existing structure', id:'safe_discount', lbl:'SAFE discount', t:'num', unit:'%', chips:[0,10,15,20] },
      { g:'Existing structure', id:'notes_rate', lbl:'Convertible note interest rate', t:'num', unit:'%', chips:[4,6,8] },
      { g:'Existing structure', id:'notes_months', lbl:'Months since the notes were issued', t:'num', unit:'months' },
      { g:'Existing structure', id:'notes_cap', lbl:'Note valuation cap (pre-money)', t:'num', unit:'$' },
      { g:'Existing structure', id:'notes_discount', lbl:'Note discount', t:'num', unit:'%', chips:[0,15,20] },
      { g:'Your fund', id:'fund_size', lbl:'Fund size', t:'num', unit:'$',
        hint:'Sets the exit value this company would need to return the whole fund on its own.' },
      { g:'Your fund', id:'exit_multiple_assumption', lbl:'Exit multiple on ARR you would underwrite', t:'num', unit:'x', chips:[5,8,12,20],
        hint:'Your assumption, not a market fact. Turns an exit value into the ARR it requires.' },
      { g:'Your fund', id:'future_rounds', lbl:'Further priced rounds before exit', t:'num', unit:'', chips:[1,2,3,4] },
      { g:'Your fund', id:'dilution_per_round', lbl:'Dilution per future round, including pool refresh', t:'num', unit:'%', chips:[15,20,25] },
    ]
  },
  {
    id:'exits', label:'Exit scenarios', em:'🎯', ibg:'#14172a', deal:true,
    desc:'The VC Method and the First Chicago Method. Three exit cases, each with a probability, give the return this price produces and the price a target return would justify. Leave anything blank to use the estimate shown in the report.',
    fields:[
      { g:'Horizon and hurdle', id:'years_to_exit', lbl:'Years to exit', t:'num', unit:'years', chips:[5,7,10],
        hint:'Defaults by stage: 8 pre-seed, 7 seed, 6 Series A, 5 Series B+.' },
      { g:'Horizon and hurdle', id:'target_irr', lbl:'Target annual return (IRR)', t:'num', unit:'%', chips:[30,40,50,60],
        hint:'The VC Method’s discount rate, applied to the success (upside) case. It is high because it carries the risk of failure; early-stage investors typically use 40–60%.' },
      { g:'Horizon and hurdle', id:'fc_rate', lbl:'Discount rate once failure is in the probabilities', t:'num', unit:'%', chips:[20,25,30],
        hint:'First Chicago Method. The downside case already carries the failure risk, so the rate is lower. Default 25%.' },
      { g:'Cases', id:'exit_arr_base', lbl:'Base case: ARR at exit', t:'num', unit:'$',
        hint:'Blank = today’s ARR grown at today’s growth rate, decaying 30% a year.' },
      { g:'Cases', id:'exit_arr_up', lbl:'Upside case: ARR at exit', t:'num', unit:'$',
        hint:'Blank = the same path with growth decaying 15% a year — the “if it works” case.' },
      { g:'Cases', id:'exit_value_down', lbl:'Downside case: exit value', t:'num', unit:'$',
        hint:'Blank = a sale at 1× today’s ARR. Enter 0 for a wind-down.' },
      { g:'Probabilities', id:'prob_down', lbl:'Probability of the downside case', t:'num', unit:'%' },
      { g:'Probabilities', id:'prob_base', lbl:'Probability of the base case', t:'num', unit:'%' },
      { g:'Probabilities', id:'prob_up', lbl:'Probability of the upside case', t:'num', unit:'%',
        hint:'The three are rescaled to 100%. Defaults by stage lean on the downside, as venture outcomes do.' },
    ]
  },
];
/* Fields visible for the current business model. */
const sectionHidden = sec => typeof cfgHidden === 'function' && cfgHidden('sections', sec.id);
const visibleFields = sec => sectionHidden(sec) ? [] : sec.fields.filter(f => (!f.models || f.models.includes(S.model)) && !(typeof cfgHidden === 'function' && cfgHidden('fields', f.id)));
const ALL_FIELDS = () => SECTIONS.flatMap(s => s.fields);

/* ═══════════════════════════════════════════════════════════════
   RUBRIC v3.0.0 — versioned, stage-aware, explicit weights
   Anchors are always ascending in value. dir says which end is good.
   ═══════════════════════════════════════════════════════════════ */
const RUBRIC = {
  version: '4.0.0',
  updated: '2026-09-24',

  /* Dimension weights must sum to 1 within each stage. */
  weights: {
    preseed: { team:0.32, market:0.26, govern:0.14, gtm:0.10, revenue:0.09, capital:0.09 },
    seed:    { team:0.24, revenue:0.20, market:0.18, capital:0.16, gtm:0.12, govern:0.10 },
    a:       { revenue:0.26, capital:0.20, gtm:0.18, team:0.14, market:0.12, govern:0.10 },
    b:       { revenue:0.28, capital:0.22, gtm:0.18, market:0.12, team:0.10, govern:0.10 },
  },

  /* Minimum sample sizes below which a metric is computed but NOT scored. */
  minN: {
    retention:      20,   // customers 12 months ago, for NRR / GRR / quick ratio
    unit_economics: 10,   // new customers won, for CAC and payback
    quota:           3,   // quota-carrying reps
    growth_base: 100000,  // ARR 12mo ago, below which a growth % is noise
    arr_per_fte:     5,   // headcount
    magic_number: 1000000,// ARR, below which quarterly magic number is noise
    pmf_survey:     30,   // survey responses, for the Sean Ellis product-market-fit test
  },

  /* Per-stage anchors. [poor, acceptable, good, excellent] mapped to [0,45,72,100]. */
  thresholds: {
    growth_yoy:   { dir:'hi', dim:'revenue', preseed:null,             seed:[50,150,250,400], a:[40,80,150,250],  b:[20,40,70,120] },
    nrr:          { dir:'hi', dim:'revenue', preseed:null,             seed:[85,95,105,125],  a:[90,100,112,130], b:[95,105,115,135] },
    grr:          { dir:'hi', dim:'revenue', preseed:null,             seed:[70,82,90,96],    a:[75,85,92,97],    b:[80,88,94,98] },
    quick_ratio:  { dir:'hi', dim:'revenue', preseed:null,             seed:[1,2,4,7],        a:[1,2,4,6],        b:[1,1.8,3,5] },
    gross_margin: { dir:'hi', dim:'revenue', preseed:[35,55,70,82],    seed:[40,58,72,84],    a:[45,62,75,86],    b:[50,66,78,88] },
    logo_ret:     { dir:'hi', dim:'revenue', preseed:null,             seed:[65,78,88,95],    a:[70,82,90,96],    b:[75,86,92,97] },
    services_pct: { dir:'lo', dim:'revenue', preseed:[5,15,30,50],     seed:[5,15,30,50],     a:[5,12,25,45],     b:[3,10,20,40] },

    runway:       { dir:'hi', dim:'capital', preseed:[6,12,18,30],     seed:[6,12,20,30],     a:[6,12,20,30],     b:[9,15,24,36] },
    burn_multiple:{ dir:'lo', dim:'capital', preseed:null,             seed:[1,2,3.5,6],      a:[1,1.5,2.5,4],    b:[0.8,1.3,2,3.5] },
    hype_ratio:   { dir:'lo', dim:'capital', preseed:null,             seed:[1.5,3,7,15],     a:[1,2,4,9],        b:[1,1.5,3,6] },
    arr_per_fte:  { dir:'hi', dim:'capital', preseed:null,             seed:[40000,70000,110000,160000], a:[70000,110000,150000,220000], b:[100000,150000,210000,300000] },
    rule40:       { dir:'hi', dim:'capital', preseed:null,             seed:[-40,-10,20,45],  a:[-20,0,25,50],    b:[0,20,40,60] },

    cac_payback:  { dir:'lo', dim:'gtm', preseed:null,                 seed:[6,14,24,36],     a:[6,12,20,30],     b:[6,12,18,26] },
    ltv_cac:      { dir:'hi', dim:'gtm', preseed:null,                 seed:[1.2,2,3,5],      a:[1.5,2.5,3.5,6],  b:[1.8,2.8,4,7] },
    magic_number: { dir:'hi', dim:'gtm', preseed:null,                 seed:[0.3,0.6,0.9,1.4],a:[0.4,0.7,1,1.5],  b:[0.4,0.7,1,1.5] },
    win_rate:     { dir:'hi', dim:'gtm', preseed:[8,15,25,40],         seed:[8,15,25,40],     a:[10,18,28,42],    b:[12,20,30,45] },
    quota_att:    { dir:'hi', dim:'gtm', preseed:null,                 seed:[30,45,65,85],    a:[35,50,68,85],    b:[40,55,70,88] },
    pipeline_cov: { dir:'hi', dim:'gtm', preseed:[1.5,2.5,3.5,5],      seed:[1.5,2.5,3.5,5],  a:[2,3,4,6],        b:[2,3,4,6] },
    pct_paid:     { dir:'lo', dim:'gtm', preseed:[25,45,70,90],        seed:[25,45,70,90],    a:[25,45,70,90],    b:[25,45,70,90] },
    top5_conc:    { dir:'lo', dim:'gtm', preseed:[35,55,75,90],        seed:[25,40,60,80],    a:[20,35,55,75],    b:[15,28,45,65] },
    sales_cycle:  { dir:'lo', dim:'gtm', preseed:[30,60,120,200],      seed:[30,60,120,200],  a:[30,60,110,180],  b:[30,55,100,170] },

    domain_years: { dir:'hi', dim:'team', preseed:[0,2,6,12],          seed:[0,2,6,12],       a:[1,3,7,12],       b:[1,3,7,12] },
    eng_turnover: { dir:'lo', dim:'team', preseed:[5,12,22,35],        seed:[5,12,22,35],     a:[5,12,20,32],     b:[5,10,18,30] },
    founder_conc: { dir:'lo', dim:'team', preseed:[50,65,82,94],       seed:[50,65,82,94],    a:[50,65,82,94],    b:[50,65,82,94] },
    headcount_eff:{ dir:'hi', dim:'team', preseed:null,                seed:[0.3,0.8,1.5,3],  a:[0.3,0.8,1.5,3],  b:[0.3,0.8,1.5,3] },
    team_tenure:  { dir:'hi', dim:'team', preseed:[0,1,3,6],           seed:[0,1,3,6],        a:null,             b:null },

    tam_bottomup: { dir:'hi', dim:'market', preseed:[5e6,5e7,3e8,1e9], seed:[1e7,1e8,5e8,2e9],a:[5e7,3e8,1e9,5e9],b:[1e8,5e8,2e9,1e10] },
    penetration:  { dir:'lo', dim:'market', preseed:[1,5,15,35],       seed:[1,5,15,35],      a:[2,8,20,40],      b:[3,10,25,45] },
    win_vs_primary:{dir:'hi', dim:'market', preseed:[20,35,50,70],     seed:[20,35,50,70],    a:[25,40,55,72],    b:[25,40,55,72] },
    pmf_score:    { dir:'hi', dim:'market', preseed:[15,30,40,55],     seed:[15,30,40,55],    a:[20,32,42,55],    b:null },
    nps:          { dir:'hi', dim:'market', preseed:[0,20,40,60],      seed:[0,20,40,60],     a:[0,20,40,60],     b:[0,20,40,60] },

    option_pool:  { dir:'band', dim:'govern', ideal:[9,20], hard:[3,30], preseed:1, seed:1, a:1, b:1 },
    liq_pref:     { dir:'lo', dim:'govern', preseed:[1,1.5,2,3],       seed:[1,1.5,2,3],      a:[1,1.5,2,3],      b:[1,1.5,2,3] },
    safe_overhang:{ dir:'lo', dim:'govern', preseed:[5,15,30,50],      seed:[5,12,25,40],     a:[3,10,20,35],     b:[2,8,15,28] },
    uptime:       { dir:'hi', dim:'govern', preseed:[98,99.3,99.9,99.99], seed:[98,99.3,99.9,99.99], a:[98.5,99.5,99.9,99.99], b:[99,99.7,99.95,99.99] },
    p1_incidents: { dir:'lo', dim:'govern', preseed:[0,2,5,12],        seed:[0,2,5,12],       a:[0,2,4,10],       b:[0,1,3,8] },

    /* Business-model specific. Scored only for the models listed. */
    gm_trend:     { dir:'hi', dim:'revenue', models:['saas','ai_app'], preseed:[-15,-4,3,10], seed:[-15,-4,3,10], a:[-12,-3,2,8], b:[-10,-2,1,6] },
    inference_pct:{ dir:'lo', dim:'revenue', models:['ai_app'],        preseed:[10,20,35,55], seed:[10,20,35,55], a:[8,16,30,45],  b:[6,12,24,38] },
    seat_util:    { dir:'hi', dim:'gtm',     models:['saas','ai_app'], preseed:[35,55,72,88], seed:[35,55,72,88], a:[40,58,75,90], b:[45,60,78,92] },
    gmv_growth:   { dir:'hi', dim:'revenue', models:['marketplace'],   preseed:null, seed:[50,150,250,400], a:[40,80,150,250], b:[20,40,70,120] },
    repeat_pct:   { dir:'hi', dim:'gtm',     models:['marketplace'],   preseed:[10,25,45,65], seed:[15,30,50,70], a:[20,35,55,72], b:[25,40,60,75] },
    contrib_margin:{dir:'hi', dim:'capital', models:['marketplace'],   preseed:[-30,-5,10,25], seed:[-25,0,12,25], a:[-15,3,15,28], b:[-5,8,18,30] },
    incentives_pct:{dir:'lo', dim:'capital', models:['marketplace'],   preseed:[2,6,14,25],  seed:[2,6,12,20],  a:[1,4,9,16],    b:[1,3,7,12] },
    supplier_conc:{ dir:'lo', dim:'gtm',     models:['marketplace'],   preseed:[20,40,65,85], seed:[15,30,50,70], a:[10,22,40,60], b:[8,18,32,50] },
    loss_rate:    { dir:'lo', dim:'revenue', models:['fintech'],       preseed:[0.3,1,2.5,5], seed:[0.3,1,2.5,5], a:[0.3,0.8,2,4], b:[0.2,0.7,1.6,3.2] },
    volume_growth:{ dir:'hi', dim:'revenue', models:['fintech'],       preseed:null, seed:[50,150,250,400], a:[40,80,150,250], b:[20,40,70,120] },
  },

  /* Categorical scorers: value → 0-100. */
  categorical: {
    soc2:      { dim:'govern', map:{ 'Type II':100, 'Type I':70, 'In progress':45, 'None':20 }, stageFloor:{ preseed:0, seed:0, a:1, b:1 } },
    books:     { dim:'govern', map:{ 'Audited':100, 'Reviewed':78, 'Compiled':52, 'Internal only':30 } },
    switching: { dim:'market', map:{ 'High — data or workflow lock-in':100, 'Medium — some migration effort':60, 'Low — swappable':25 } },
    pricing:   { dim:'market', map:{ 'Raised prices':100, 'Held prices':62, 'Discounted to win':25, 'Never tested':45 } },
    licence:   { dim:'govern', models:['fintech'], map:{ 'Own licences':92, 'Sponsor or partner bank':58, 'Licence application pending':35, 'Not regulated':70 } },
    critical:  { dim:'market', map:{ 'Mission-critical — work stops without it':100, 'Important — painful to replace':62, 'Nice to have — discretionary':22 } },
  },

  /* Boolean modifiers: applied as point adjustments to a dimension, bounded. */
  booleans: [
    { id:'prior_exit',          dim:'team',   good:true,  pts:8,  note:'Founder has a prior acquisition or IPO' },
    { id:'founder_departed',    dim:'team',   good:false, pts:-7, note:'A co-founder has already left' },
    { id:'founder_vesting',     dim:'govern', good:true,  pts:5,  note:'Founders still vesting' },
    { id:'litigation',          dim:'govern', good:false, pts:-12,note:'Material pending litigation' },
    { id:'participating',       dim:'govern', good:false, pts:-8, note:'Participating preference on the senior series' },
    { id:'infra_single_vendor', dim:'govern', good:false, pts:-6, note:'Single infrastructure vendor is a single point of failure' },
    { id:'model_single_vendor', dim:'govern', good:false, pts:-6, note:'Single model provider is a single point of failure' },
    { id:'dpas_signed',         dim:'govern', good:true,  pts:4,  note:'Data processing agreements in place' },
    { id:'regulatory_findings', dim:'govern', good:false, pts:-12,note:'Open regulatory findings or remediation', models:['fintech'] },
    { id:'proprietary_data',    dim:'market', good:true,  pts:6,  note:'Proprietary data or feedback loops', models:['ai_app'] },
    { id:'technical_founder',   dim:'team',   good:true,  pts:5,  note:'A founder can build the core product' },
    { id:'funds_separate',      dim:'govern', good:true,  pts:3,  note:'Company and personal finances are separate' },
    { id:'funds_separate',      dim:'govern', good:true,  pts:-10,note:'Company and personal finances are mixed' },
    { id:'valuation_409a',      dim:'govern', good:true,  pts:-4, note:'No current 409A behind option grants' },
    { id:'oss_reviewed',        dim:'govern', good:true,  pts:2,  note:'Open-source licences reviewed' },
  ],

  /* Hard gates. A gate halts the assessment; it does not merely reduce the score. */
  gates: [
    { id:'ip_assignments',      when:false, title:'IP assignments are not complete',
      why:'If any employee or contractor has not assigned their work, the company may not own the product it is selling. This is resolvable but it is resolved before terms, not after.' },
    { id:'contractor_ip',       when:true,  title:'A contractor may retain rights to core IP',
      why:'Ownership of the core technology is unconfirmed. Every other metric in this report is contingent on it.' },
    { id:'chain_title',         when:false, title:'Chain of title on IP is not clean',
      why:'A break anywhere in the historical transfer chain — a predecessor entity, a university licence, acquired code — leaves the current ownership unproven.' },
    { id:'captable_documented', when:false, title:'The cap table is not fully documented',
      why:'Verbal or undocumented equity promises surface during a financing or an exit, when they are most expensive to settle.' },
    { id:'taxes_current',       when:false, title:'Taxes are not filed and paid to date',
      why:'Unpaid payroll, income or sales taxes are liabilities that attach to the company — and payroll taxes can reach its officers personally. They are quantified and settled before closing.' },
  ],
};

/* ── STATE ── */
const modelLabel = id => (MODELS.find(m => m.id === id) || { n:'Custom model' }).n;
const blankState = () => ({
  name:'', stage:'seed', model:'saas', asof:'', section:0,
  vals:{}, bools:{}, sel:{}, prov:{}, evid:{}, assume:{}, result:null, files:[],
  ledger:null, series:null, notes:'', checklist:{},
});
let S = blankState();
/* ═══════════════════════════════════════════════════════════════
   DERIVATION ENGINE
   Every headline metric is computed here. None of them is an input.
   ═══════════════════════════════════════════════════════════════ */

/* Fields the owner switched off in the Studio (directly or through their section) read as empty. */
let HIDDEN_IDS = new Set();
const gv = id => { if (HIDDEN_IDS.has(id)) return null; const v = parseFloat(S.vals[id]); return Number.isFinite(v) ? v : null; };
const gb = id => HIDDEN_IDS.has(id) || S.bools[id] === undefined ? null : S.bools[id];
const gs = id => HIDDEN_IDS.has(id) ? null : (S.sel[id] || null);
const gt = id => (S.vals[id] || '').toString().trim() || null;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const has = (...xs) => xs.every(x => x != null && isFinite(x));

function derive() {
  const D = {}, F = {};
  const put = (k, v, f) => { if (v != null && isFinite(v)) { D[k] = v; F[k] = f; } };
  const LED = S.ledger ? ledgerAnalytics(S.ledger) : null;

  const arr = gv('arr_now'), arr0 = gv('arr_12mo');
  const nw = gv('new_arr_l12'), ex = gv('expansion_arr_l12');
  const ch = gv('churned_arr_l12'), co = gv('contraction_arr_l12');
  const gm = gv('gross_margin'), cash = gv('cash_on_hand'), burn = gv('net_burn');
  const raised = gv('total_raised'), cust = gv('customers_now'), cust0 = gv('customers_12mo');
  const hc = gv('headcount_now'), hc0 = gv('headcount_12mo'), hcEng = gv('headcount_eng');
  const comp = gv('avg_loaded_comp') || 165000;

  /* — Growth and retention — */
  if (has(arr, arr0) && arr0 > 0) put('growth_yoy', (arr / arr0 - 1) * 100, 'ARR today ÷ ARR 12 months ago − 1');
  if (has(nw, ex, ch, co)) put('net_new_arr', nw + ex - ch - co, 'new + expansion − churned − contraction');
  else if (has(arr, arr0)) put('net_new_arr', arr - arr0, 'ARR today − ARR 12 months ago');

  if (has(arr0, ex, ch, co) && arr0 > 0)
    put('nrr', (arr0 + ex - ch - co) / arr0 * 100, '(opening ARR + expansion − churn − contraction) ÷ opening ARR');
  if (has(arr0, ch, co) && arr0 > 0)
    put('grr', (arr0 - ch - co) / arr0 * 100, '(opening ARR − churn − contraction) ÷ opening ARR');
  if (has(nw, ex, ch, co) && (ch + co) > 0)
    put('quick_ratio', (nw + ex) / (ch + co), '(new + expansion) ÷ (churned + contraction)');

  if (has(cust0, gv('logos_lost_l12')) && cust0 > 0) {
    const lr = gv('logos_lost_l12') / cust0 * 100;
    put('logo_churn', lr, 'logos lost ÷ logos 12 months ago');
    put('logo_ret', 100 - lr, '100 − logo churn rate');
  }

  /* — Capital efficiency — */
  if (has(cash, burn) && burn > 0) put('runway', cash / burn, 'cash ÷ net monthly burn');
  if (has(burn) && D.net_new_arr > 0) put('burn_multiple', (burn * 12) / D.net_new_arr, 'annualised net burn ÷ net new ARR');
  if (has(raised, arr) && arr > 0) put('hype_ratio', raised / arr, 'total equity raised ÷ ARR');
  if (has(arr, hc) && hc > 0) put('arr_per_fte', arr / hc, 'ARR ÷ headcount');
  if (has(arr, burn) && arr > 0) put('fcf_margin', -(burn * 12) / arr * 100, '−(annualised net burn) ÷ ARR (a net-burn proxy for FCF)');
  if (D.growth_yoy != null && D.fcf_margin != null) put('rule40', D.growth_yoy + D.fcf_margin, 'growth % + FCF margin %');
  if (has(D.net_new_arr, hc, hc0, comp) && (hc - hc0) > 0)
    put('headcount_eff', D.net_new_arr / ((hc - hc0) * comp), 'net new ARR ÷ (net new headcount × loaded cost)');

  /* — Unit economics — */
  if (has(arr, cust) && cust > 0) put('acv', arr / cust, 'ARR ÷ paying customers');
  const sm = gv('sm_spend_l12'), nc = gv('new_customers_l12');
  if (has(sm, nc) && nc > 0) put('cac', sm / nc, 'S&M spend ÷ new customers won');
  if (has(D.cac, D.acv, gm) && D.acv > 0 && gm > 0)
    put('cac_payback', D.cac / (D.acv * gm / 100 / 12), 'CAC ÷ monthly gross profit per customer');
  if (has(D.acv, gm, D.logo_churn) && D.logo_churn > 0)
    put('ltv', (D.acv * gm / 100) / (D.logo_churn / 100), 'annual gross profit per customer ÷ logo churn rate');
  if (has(D.ltv, D.cac) && D.cac > 0) put('ltv_cac', D.ltv / D.cac, 'LTV ÷ CAC (gross-profit basis, logo churn)');
  const smq = gv('sm_spend_prior_q'), nnq = gv('new_arr_prior_q');
  /* Magic number = (quarterly revenue gain × 4) ÷ prior-quarter S&M. Net new ARR in a quarter already equals
     that quarterly revenue gain × 4, so it is divided by S&M directly — multiplying it by 4 again overstates it fourfold. */
  if (has(smq, nnq) && smq > 0) put('magic_number', nnq / smq, 'net new ARR in the quarter ÷ prior-quarter S&M');

  /* — Team — */
  if (has(hcEng, gv('eng_departures_l12')) && hcEng > 0)
    put('eng_turnover', gv('eng_departures_l12') / hcEng * 100, 'engineering departures ÷ engineering headcount');
  if (has(hc, hc0) && hc0 > 0) put('headcount_growth', (hc / hc0 - 1) * 100, 'headcount today ÷ headcount 12 months ago − 1');
  if (gv('founders_count') > 1 && gv('founder_max_equity') != null)
    put('founder_conc', gv('founder_max_equity'), 'largest founder stake among multiple founders');

  /* — Market — */
  const ta = gv('target_accounts');
  if (has(ta, D.acv)) put('tam_bottomup', ta * D.acv, 'ICP account count × realised ACV');
  if (has(D.tam_bottomup, gv('reachable_pct')))
    put('sam', D.tam_bottomup * gv('reachable_pct') / 100, 'bottom-up TAM × reachable share');
  if (has(arr, D.tam_bottomup) && D.tam_bottomup > 0)
    put('penetration', arr / D.tam_bottomup * 100, 'ARR ÷ bottom-up TAM');

  /* — Structure — */
  const notesAcc = notesAccrued();
  if (notesAcc != null) put('notes_accrued', notesAcc, 'note principal × (1 + interest rate × years outstanding), simple interest');
  const convOut = (gv('safes_outstanding') || 0) + (notesAcc || 0);
  if ((gv('safes_outstanding') != null || notesAcc != null) && gv('pre_money') > 0)
    put('safe_overhang', convOut / gv('pre_money') * 100, notesAcc ? 'unconverted SAFEs and notes (with accrued interest) ÷ pre-money valuation' : 'unconverted SAFEs ÷ pre-money valuation');

  /* — Burn: gross versus net — */
  const gross = gv('gross_burn');
  if (has(cash, gross) && gross > 0) put('runway_gross', cash / gross, 'cash ÷ gross monthly burn — months left if revenue stopped');
  if (has(gross, arr)) put('burn_from_gross', gross - arr / 12, 'gross burn − monthly recurring revenue (ARR ÷ 12)');

  /* — Product-market fit and team cohesion — */
  if (gv('pmf_very_disappointed') != null) put('pmf_score', gv('pmf_very_disappointed'), 'share of surveyed users “very disappointed” without the product (Sean Ellis test)');
  if (gv('nps') != null) put('nps', gv('nps'), '% promoters − % detractors');
  if (gv('founders_years_together') != null && !(gv('founders_count') != null && gv('founders_count') < 2))
    put('team_tenure', gv('founders_years_together'), 'years the founders have worked together');

  /* — Cross-check helpers — */
  if (has(gv('cogs_hosting'), gv('cogs_support'), arr) && arr > 0)
    put('gm_implied', (1 - (gv('cogs_hosting') + gv('cogs_support')) / arr) * 100, '1 − (hosting + support cost) ÷ ARR');
  if (has(hc, comp, arr, gm))
    put('burn_implied', (hc * comp / 12) - (arr / 12 * gm / 100), '(headcount × loaded cost ÷ 12) − monthly gross profit');
  if (has(gv('ar_over_90'), arr) && arr > 0)
    put('ar_share', gv('ar_over_90') / arr * 100, 'receivables over 90 days ÷ ARR');

  /* — Customer ledger overrides: cohort-true retention beats the waterfall approximation — */
  if (LED && LED.window >= 6) {
    const wl = LED.window === 12 ? '' : ` (trailing ${LED.window} months, not a full year)`;
    if (D.nrr != null) put('nrr_flow', D.nrr, F.nrr);
    if (LED.nrrCohort != null) put('nrr', LED.nrrCohort, 'cohort NRR from the customer ledger: today’s MRR of customers live 12 months ago ÷ their MRR then' + wl);
    if (LED.grrCohort != null) put('grr', LED.grrCohort, 'cohort GRR from the customer ledger: each base customer capped at its starting MRR' + wl);
    if (LED.logoRet != null) { put('logo_ret', LED.logoRet, 'base-period customers still billing today, from the ledger' + wl); put('logo_churn', 100 - LED.logoRet, '100 − ledger logo retention'); }
    if (LED.cmgr3 != null) put('cmgr3', LED.cmgr3, 'compound monthly MRR growth, last 3 months (ledger)');
    if (LED.cmgr12 != null) put('cmgr12', LED.cmgr12, 'compound monthly MRR growth, last 12 months (ledger)');
  }

  /* — Business-model specific — */
  if (has(gm, gv('gm_12mo'))) put('gm_trend', gm - gv('gm_12mo'), 'gross margin today − gross margin 12 months ago (pts)');
  if (gv('inference_pct') != null) put('inference_pct', gv('inference_pct'), 'entered directly');
  if (gv('seat_util') != null) put('seat_util', gv('seat_util'), 'entered directly');
  if (has(gv('gmv_now'), gv('gmv_12mo')) && gv('gmv_12mo') > 0) put('gmv_growth', (gv('gmv_now') / gv('gmv_12mo') - 1) * 100, 'GMV run-rate today ÷ 12 months ago − 1');
  if (S.model === 'marketplace' && has(arr, gv('gmv_now')) && gv('gmv_now') > 0) put('take_rate', arr / gv('gmv_now') * 100, 'net revenue run-rate (ARR) ÷ GMV run-rate');
  if (S.model === 'fintech' && has(arr, gv('volume_now')) && gv('volume_now') > 0) put('take_rate', arr / gv('volume_now') * 100, 'net revenue run-rate (ARR) ÷ processed volume');
  if (has(gv('volume_now'), gv('volume_12mo')) && gv('volume_12mo') > 0) put('volume_growth', (gv('volume_now') / gv('volume_12mo') - 1) * 100, 'volume today ÷ 12 months ago − 1');
  if (gv('repeat_gmv_pct') != null) put('repeat_pct', gv('repeat_gmv_pct'), 'entered directly');
  if (gv('contrib_margin') != null) put('contrib_margin', gv('contrib_margin'), 'entered directly');
  if (gv('incentives_pct') != null) put('incentives_pct', gv('incentives_pct'), 'entered directly');
  if (gv('top_supplier_pct') != null) put('supplier_conc', gv('top_supplier_pct'), 'entered directly');
  if (gv('loss_rate') != null) put('loss_rate', gv('loss_rate'), 'entered directly');
  if (gv('p1_incidents') != null) put('p1_incidents', gv('p1_incidents'), 'entered directly');

  /* — Cash-out date, for the report — */
  if (D.runway != null && S.asof && /^\d{4}-\d{2}$/.test(S.asof)) D._cashOut = monthAdd(S.asof, Math.floor(D.runway));

  /* Pass-through values used directly in scoring */
  if (gm != null) put('gross_margin', gm, 'entered directly');
  if (gv('top5_pct') != null) put('top5_conc', gv('top5_pct'), 'entered directly');
  if (gv('win_rate') != null) put('win_rate', gv('win_rate'), 'entered directly');
  if (gv('quota_attainment') != null) put('quota_att', gv('quota_attainment'), 'entered directly');
  if (gv('pipeline_coverage') != null) put('pipeline_cov', gv('pipeline_coverage'), 'entered directly');
  if (gv('pct_paid') != null) put('pct_paid', gv('pct_paid'), 'entered directly');
  if (gv('sales_cycle') != null) put('sales_cycle', gv('sales_cycle'), 'entered directly');
  if (gv('services_pct') != null) put('services_pct', gv('services_pct'), 'entered directly');
  if (gv('founder_domain_years') != null) put('domain_years', gv('founder_domain_years'), 'entered directly');
  if (gv('option_pool') != null) put('option_pool', gv('option_pool'), 'entered directly');
  if (gv('liq_pref') != null) put('liq_pref', gv('liq_pref'), 'entered directly');
  if (gv('uptime_90d') != null) put('uptime', gv('uptime_90d'), 'entered directly');
  if (gv('win_rate_vs_primary') != null) put('win_vs_primary', gv('win_rate_vs_primary'), 'entered directly');
  if (gv('reachable_pct') != null) put('penetration_target', gv('reachable_pct'), 'entered directly');

  /* Owner-defined metrics from the Studio, and built-ins the owner switched off. */
  cfgDerive(D, F);
  return { D, F };
}

/* Labels for derived metrics, used in the UI and the export. */
const DLABEL = {
  growth_yoy:'Growth YoY', net_new_arr:'Net new ARR', nrr:'Net revenue retention', grr:'Gross revenue retention',
  quick_ratio:'Quick ratio', logo_churn:'Logo churn', logo_ret:'Logo retention', runway:'Runway',
  burn_multiple:'Burn multiple', hype_ratio:'Capital raised per $1 of ARR', arr_per_fte:'ARR per employee',
  fcf_margin:'FCF margin (burn proxy)', rule40:'Rule of 40', headcount_eff:'ARR per dollar of new headcount',
  acv:'Realised ACV', cac:'Blended CAC', cac_payback:'CAC payback', ltv:'LTV (gross profit)', ltv_cac:'LTV:CAC',
  magic_number:'Magic number', eng_turnover:'Engineering turnover', headcount_growth:'Headcount growth',
  founder_conc:'Largest founder stake', tam_bottomup:'Bottom-up TAM', sam:'Serviceable market',
  penetration:'Current penetration', safe_overhang:'SAFE overhang', gm_implied:'Gross margin implied by COGS',
  burn_implied:'Burn implied by headcount', ar_share:'Aged receivables share', gross_margin:'Gross margin',
  top5_conc:'Top 5 customer concentration', win_rate:'Win rate', quota_att:'Quota attainment',
  pipeline_cov:'Pipeline coverage', pct_paid:'Paid acquisition share', sales_cycle:'Sales cycle',
  services_pct:'Non-recurring revenue share', domain_years:'Founder domain years', option_pool:'Option pool',
  liq_pref:'Liquidation preference', uptime:'Uptime', win_vs_primary:'Win rate vs primary competitor',
  penetration_target:'Reachable share of market',
  nrr_flow:'NRR from the waterfall (all customers)', cmgr3:'Monthly growth, last 3 months', cmgr12:'Monthly growth, last 12 months',
  gm_trend:'Gross margin trend', inference_pct:'Inference cost share of revenue', seat_util:'Seat utilisation',
  gmv_growth:'GMV growth', take_rate:'Realised take rate', volume_growth:'Volume growth', repeat_pct:'Repeat-buyer GMV share',
  contrib_margin:'Contribution margin', incentives_pct:'Incentives share of GMV', supplier_conc:'Top-10 supplier concentration',
  loss_rate:'Loss rate', p1_incidents:'Severity-1 incidents',
  notes_accrued:'Convertible notes with accrued interest', runway_gross:'Runway if revenue stopped', burn_from_gross:'Net burn implied by gross burn',
  pmf_score:'Product-market fit survey (“very disappointed”)', nps:'Net Promoter Score', team_tenure:'Years founders have worked together',
};
const DUNIT = {
  growth_yoy:'%', nrr:'%', grr:'%', logo_churn:'%', logo_ret:'%', fcf_margin:'%', rule40:'', penetration:'%',
  net_new_arr:'$', runway:'mo', burn_multiple:'', hype_ratio:'x', arr_per_fte:'$', headcount_eff:'x',
  acv:'$', cac:'$', cac_payback:'mo', ltv:'$', ltv_cac:'x', magic_number:'', quick_ratio:'x',
  eng_turnover:'%', headcount_growth:'%', founder_conc:'%', tam_bottomup:'$', sam:'$', safe_overhang:'%',
  gm_implied:'%', burn_implied:'$', ar_share:'%', gross_margin:'%', top5_conc:'%', win_rate:'%',
  quota_att:'%', pipeline_cov:'x', pct_paid:'%', sales_cycle:'d', services_pct:'%', domain_years:'y',
  option_pool:'%', liq_pref:'x', uptime:'%', win_vs_primary:'%', penetration_target:'%',
  nrr_flow:'%', cmgr3:'%', cmgr12:'%', gm_trend:'pts', inference_pct:'%', seat_util:'%', gmv_growth:'%', take_rate:'%',
  volume_growth:'%', repeat_pct:'%', contrib_margin:'%', incentives_pct:'%', supplier_conc:'%', loss_rate:'%', p1_incidents:'n',
  notes_accrued:'$', runway_gross:'mo', burn_from_gross:'$', pmf_score:'%', nps:'n', team_tenure:'y',
};
/* Which form inputs each metric rests on — used to weight evidence quality. */
const INPUTS_OF = {
  growth_yoy:['arr_now','arr_12mo'], nrr:['arr_12mo','expansion_arr_l12','churned_arr_l12','contraction_arr_l12'],
  grr:['arr_12mo','churned_arr_l12','contraction_arr_l12'], quick_ratio:['new_arr_l12','expansion_arr_l12','churned_arr_l12','contraction_arr_l12'],
  logo_ret:['customers_12mo','logos_lost_l12'], runway:['cash_on_hand','net_burn'], burn_multiple:['net_burn','new_arr_l12','expansion_arr_l12','churned_arr_l12','contraction_arr_l12'],
  hype_ratio:['total_raised','arr_now'], arr_per_fte:['arr_now','headcount_now'], rule40:['arr_now','arr_12mo','net_burn'],
  cac_payback:['sm_spend_l12','new_customers_l12','arr_now','customers_now','gross_margin'], ltv_cac:['sm_spend_l12','new_customers_l12','arr_now','customers_now','gross_margin','logos_lost_l12'],
  magic_number:['sm_spend_prior_q','new_arr_prior_q'], top5_conc:['top5_pct'], quota_att:['quota_attainment'], pipeline_cov:['pipeline_coverage'],
  domain_years:['founder_domain_years'], eng_turnover:['eng_departures_l12','headcount_eng'], founder_conc:['founder_max_equity'],
  headcount_eff:['headcount_now','headcount_12mo','arr_now','arr_12mo'], tam_bottomup:['target_accounts','arr_now','customers_now'],
  penetration:['target_accounts','arr_now'], win_vs_primary:['win_rate_vs_primary'], safe_overhang:['safes_outstanding','notes_principal','pre_money'],
  pmf_score:['pmf_very_disappointed'], nps:['nps'], team_tenure:['founders_years_together'], runway_gross:['cash_on_hand','gross_burn'],
  uptime:['uptime_90d'], gm_trend:['gross_margin','gm_12mo'], gmv_growth:['gmv_now','gmv_12mo'], volume_growth:['volume_now','volume_12mo'],
  repeat_pct:['repeat_gmv_pct'], supplier_conc:['top_supplier_pct'],
};
const inputsOf = k => INPUTS_OF[k] || [k];
function dfmt(k, v) {
  const u = DUNIT[k];
  if (v == null || !isFinite(v)) return '—';
  if (u === '$') return money(v);
  if (u === '%') return v.toFixed(1) + '%';
  if (u === 'x') return v.toFixed(2) + 'x';
  if (u === 'mo') return v.toFixed(1) + ' mo';
  if (u === 'd') return Math.round(v) + ' d';
  if (u === 'y') return Math.round(v) + ' y';
  if (u === 'pts') return (v > 0 ? '+' : '') + v.toFixed(1) + ' pts';
  if (u === 'n') return String(Math.round(v));
  return v.toFixed(2);
}

/* ═══════════════════════════════════════════════════════════════
   CONSISTENCY CHECKS
   The product. Stated figures vs figures computed from primitives.
   ═══════════════════════════════════════════════════════════════ */
/* Tolerances of the built-in checks. The owner can change any of them in the Studio (Checks tab);
   tolOf() returns the value in force. hard:null means the check has a single threshold. */
const CHECK_TOLS = [
  { id:'waterfall', title:'ARR waterfall closes', unit:'% of ARR', tol:3, hard:10 },
  { id:'stated_arr', title:'Deck ARR vs financials', unit:'%', tol:2, hard:6 },
  { id:'stated_nrr', title:'NRR', unit:'pts', tol:3, hard:8 },
  { id:'stated_grr', title:'GRR', unit:'pts', tol:3, hard:8 },
  { id:'stated_growth', title:'Growth rate', unit:'pts', tol:5, hard:15 },
  { id:'stated_runway', title:'Runway', unit:'%', tol:12, hard:30 },
  { id:'stated_rule40', title:'Rule of 40', unit:'pts', tol:6, hard:15 },
  { id:'stated_burn_multiple', title:'Burn multiple', unit:'%', tol:18, hard:45 },
  { id:'stated_magic_number', title:'Magic number', unit:'%', tol:20, hard:50 },
  { id:'stated_acv', title:'ACV', unit:'%', tol:18, hard:45 },
  { id:'stated_cac', title:'CAC', unit:'%', tol:25, hard:60 },
  { id:'stated_cac_payback', title:'CAC payback', unit:'%', tol:25, hard:60 },
  { id:'stated_ltv_cac', title:'LTV:CAC', unit:'%', tol:30, hard:70 },
  { id:'stated_customers', title:'Customer count', unit:'%', tol:3, hard:10 },
  { id:'stated_take_rate', title:'Take rate', unit:'%', tol:8, hard:25 },
  { id:'gm_check', title:'Gross margin vs COGS', unit:'pts', tol:5, hard:12 },
  { id:'burn_check', title:'Burn vs headcount', unit:'%', tol:55, hard:null },
  { id:'burn_bridge', title:'Gross burn − revenue vs net burn', unit:'% of gross spend', tol:12, hard:null },
  { id:'tam_check', title:'Stated TAM vs bottom-up', unit:'x larger', tol:10, hard:null },
  { id:'ar', title:'Receivables over 90 days', unit:'% of ARR', tol:8, hard:18 },
  { id:'services', title:'Non-recurring revenue', unit:'%', tol:15, hard:null },
  { id:'series_cash', title:'Cash vs monthly financials', unit:'%', tol:5, hard:15 },
  { id:'series_burn', title:'Burn vs monthly financials', unit:'%', tol:15, hard:35 },
];
function tolOf(id, tol, hard) {
  const o = CFG.checkTol && CFG.checkTol[id];
  const t = o && o.tol != null && isFinite(+o.tol) ? +o.tol : tol;
  const h = hard == null ? null : o && o.hard != null && isFinite(+o.hard) ? +o.hard : hard;
  return { tol:t, hard:h == null ? null : Math.max(h, t) };
}
function runChecks(D) {
  const out = [];
  const add = (o) => out.push(o);

  /* Compare a stated field with a computed value. */
  function cmp(statedId, computedKey, opts) {
    const st = gv(statedId), cp = D[computedKey];
    if (!has(st, cp)) return;
    const o = opts || {};
    const abs = Math.abs(st - cp);
    const rel = Math.abs(cp) > 0 ? abs / Math.abs(cp) * 100 : 0;
    const overBy = o.pts ? abs : rel;
    const tt = tolOf(statedId, o.tol, o.hard != null ? o.hard : o.tol * 2.5), tol = tt.tol, hard = tt.hard;
    if (overBy <= tol) {
      add({ id:statedId, sev:'ok', title:o.title, stated:o.f(st), computed:o.f(cp), delta:'within tolerance' });
      return;
    }
    const sev = overBy > hard ? 'major' : 'minor';
    add({
      id:statedId, sev, title:o.title, stated:o.f(st), computed:o.f(cp),
      flatter: o.good === 'lo' ? st < cp : st > cp, rawStated:st, rawComputed:cp,
      delta:(o.pts ? abs.toFixed(1) + ' pts' : rel.toFixed(0) + '%') + (st > cp ? ' overstated' : ' understated'),
      text:o.text ? o.text(st, cp) : `The stated figure is ${o.f(st)}; recomputing it from the underlying inputs gives ${o.f(cp)}.`,
      ask:o.ask,
    });
  }

  /* 1 — the ARR waterfall must close */
  const arr = gv('arr_now'), arr0 = gv('arr_12mo');
  const nw = gv('new_arr_l12'), ex = gv('expansion_arr_l12'), ch = gv('churned_arr_l12'), co = gv('contraction_arr_l12');
  if (has(arr, arr0, nw, ex, ch, co)) {
    const implied = arr0 + nw + ex - ch - co;
    const gap = arr - implied, rel = arr > 0 ? Math.abs(gap) / arr * 100 : 0, tw = tolOf('waterfall', 3, 10);
    if (rel <= tw.tol) add({ id:'waterfall', sev:'ok', title:'ARR waterfall closes', stated:money(arr), computed:money(implied), delta:`within ${tw.tol}%` });
    else add({
      id:'waterfall', sev: rel > tw.hard ? 'major' : 'minor', title:'The ARR waterfall does not close',
      stated:money(arr), computed:money(implied), delta:money(gap) + ' unexplained',
      text:`Opening ARR plus new and expansion, less churn and contraction, gives ${money(implied)}. Closing ARR is stated as ${money(arr)}. ${money(Math.abs(gap))} is unaccounted for.`,
      ask:'Which movement line is missing from the waterfall — reactivations, FX, a reclassification between services and subscription, or an acquisition?',
    });
  }

  /* 2-12 — stated vs computed */
  /* 2 — deck ARR vs financial ARR */
  if (has(gv('stated_arr'), arr)) {
    const st = gv('stated_arr'), rel = arr > 0 ? Math.abs(st - arr) / arr * 100 : 0, ta = tolOf('stated_arr', 2, 6);
    if (rel <= ta.tol) add({ id:'stated_arr', sev:'ok', title:'Deck ARR matches the financials', stated:money(st), computed:money(arr), delta:`within ${ta.tol}%` });
    else add({
      id:'stated_arr', sev: rel > ta.hard ? 'major' : 'minor', title:'Deck ARR does not match the financials', flatter: st > arr,
      stated:money(st), computed:money(arr), delta:rel.toFixed(0) + '% ' + (st > arr ? 'higher in the deck' : 'lower in the deck'),
      text:`The headline ARR in the materials is ${money(st)}. The figure carried in the financials is ${money(arr)}.`,
      ask:'Which definition produces the deck number — is it including signed-but-not-started contracts, annualised last month, or gross bookings?',
    });
  }
  cmp('stated_nrr','nrr',{ good:'hi', tol:3, hard:8, pts:true, title:'Net revenue retention', f:v=>v.toFixed(1)+'%',
    ask:'Which cohort and which period does the stated NRR cover, and does it include or exclude customers who churned entirely?' });
  cmp('stated_grr','grr',{ good:'hi', tol:3, hard:8, pts:true, title:'Gross revenue retention', f:v=>v.toFixed(1)+'%',
    ask:'Does the stated GRR net off downgrades, or only full cancellations?' });
  cmp('stated_growth','growth_yoy',{ good:'hi', tol:5, hard:15, pts:true, title:'Growth rate', f:v=>v.toFixed(1)+'%',
    ask:'Is the stated growth measured on ARR, on recognised revenue, or on bookings?' });
  cmp('stated_runway','runway',{ good:'hi', tol:12, hard:30, title:'Runway', f:v=>v.toFixed(1)+' months',
    ask:'Does the stated runway assume the current burn, or a plan that includes hires and spend not yet committed?' });
  cmp('stated_rule40','rule40',{ good:'hi', tol:6, hard:15, pts:true, title:'Rule of 40', f:v=>v.toFixed(1),
    ask:'Which profitability measure feeds the stated Rule of 40 — FCF margin, EBITDA margin, or net margin?' });
  cmp('stated_burn_multiple','burn_multiple',{ good:'lo', tol:18, hard:45, title:'Burn multiple', f:v=>v.toFixed(2),
    ask:'Is the stated burn multiple computed on net new ARR or on new-logo ARR alone?' });
  cmp('stated_magic_number','magic_number',{ good:'hi', tol:20, hard:50, title:'Magic number', f:v=>v.toFixed(2),
    ask:'Which quarter and which S&M definition produce the stated magic number?' });
  cmp('stated_acv','acv',{ good:'hi', tol:18, hard:45, title:'Average contract value', f:v=>money(v),
    ask:'Is the stated ACV a blended average, a new-business average, or a list-price figure?' });
  cmp('stated_cac','cac',{ good:'lo', tol:25, hard:60, title:'Customer acquisition cost', f:v=>money(v),
    ask:'Does the stated CAC include fully loaded S&M salaries and commission, or only paid media?' });
  cmp('stated_cac_payback','cac_payback',{ good:'lo', tol:25, hard:60, title:'CAC payback', f:v=>v.toFixed(1)+' months',
    ask:'Is the stated payback computed on gross profit or on revenue? Revenue-basis payback understates the real recovery period.' });
  cmp('stated_ltv_cac','ltv_cac',{ good:'hi', tol:30, hard:70, title:'LTV:CAC', f:v=>v.toFixed(2)+'x',
    ask:'What churn assumption and what time horizon are behind the stated LTV? An LTV built on a 10-year life is not a measurement.' });

  /* 13 — concentration must be monotonic */
  const t1 = gv('top1_pct'), t5 = gv('top5_pct'), t10 = gv('top10_pct');
  if (has(t1, t5) && t1 > t5 + 0.5) add({ id:'conc_order', sev:'major', title:'Customer concentration figures are inconsistent',
    stated:`top 1 = ${t1}%`, computed:`top 5 = ${t5}%`, delta:'impossible ordering',
    text:'The largest single customer cannot represent a larger share of ARR than the top five combined.',
    ask:'Which of the two concentration figures is correct, and can the top ten be shown line by line?' });
  if (has(t5, t10) && t5 > t10 + 0.5) add({ id:'conc_order2', sev:'major', title:'Customer concentration figures are inconsistent',
    stated:`top 5 = ${t5}%`, computed:`top 10 = ${t10}%`, delta:'impossible ordering',
    text:'The top five cannot exceed the top ten.', ask:'Please provide the top ten customers by ARR with their contract dates.' });
  if (t10 != null && t10 > 100.5) add({ id:'conc_over', sev:'major', title:'Concentration exceeds 100% of ARR',
    stated:`${t10}%`, computed:'≤100%', delta:'impossible', text:'A subset of customers cannot exceed total ARR.',
    ask:'Is the concentration figure measured against ARR or against total revenue including services?' });

  /* 14 — gross margin vs COGS */
  if (has(gv('gross_margin'), D.gm_implied)) {
    const d = Math.abs(gv('gross_margin') - D.gm_implied), tg = tolOf('gm_check', 5, 12);
    if (d <= tg.tol) add({ id:'gm_check', sev:'ok', title:'Gross margin reconciles to COGS', stated:pctv(gv('gross_margin')), computed:pctv(D.gm_implied), delta:`within ${tg.tol} pts` });
    else add({ id:'gm_check', sev: d > tg.hard ? 'major' : 'minor', title:'Gross margin does not reconcile to the cost lines',
      stated:pctv(gv('gross_margin')), computed:pctv(D.gm_implied), delta:d.toFixed(1) + ' pts apart',
      text:`Hosting and support costs imply a gross margin of ${pctv(D.gm_implied)} against the stated ${pctv(gv('gross_margin'))}.`,
      ask:'Which costs sit above the gross margin line? Support and customer success are frequently moved below it to improve the optics.' });
  }

  /* 15 — burn vs headcount */
  if (has(gv('net_burn'), D.burn_implied) && gv('net_burn') > 0 && D.burn_implied > 0) {
    const rel = Math.abs(gv('net_burn') - D.burn_implied) / gv('net_burn') * 100;
    if (rel > tolOf('burn_check', 55, null).tol) add({ id:'burn_check', sev:'minor', title:'Burn does not track headcount cost',
      stated:money(gv('net_burn')) + '/mo', computed:money(D.burn_implied) + '/mo', delta:rel.toFixed(0) + '% apart',
      text:`Headcount at the assumed loaded cost, net of gross profit, implies roughly ${money(D.burn_implied)} a month against a stated ${money(gv('net_burn'))}.`,
      ask:'What non-payroll spend closes this gap, and is any of it capitalised rather than expensed?' });
  }

  /* 15b — gross burn, revenue and net burn must add up */
  const gb0 = gv('gross_burn'), nb0 = gv('net_burn');
  if (has(gb0, nb0) && gb0 > 0) {
    if (nb0 > gb0 * 1.02) add({ id:'burn_bridge', sev:'major', title:'Net burn is larger than gross burn', flatter:false,
      stated:money(nb0) + '/mo net', computed:money(gb0) + '/mo gross', delta:'impossible',
      text:'Net burn is gross spend minus cash coming in, so it cannot exceed gross spend. One of the two figures uses a different definition or period.',
      ask:'How are gross and net burn each defined, and over which months are they averaged?' });
    else if (arr != null && arr > 0) {
      const implied = gb0 - arr / 12, rel = Math.abs(nb0 - implied) / gb0 * 100, tb = tolOf('burn_bridge', 12, null);
      if (rel <= tb.tol) add({ id:'burn_bridge', sev:'ok', title:'Gross burn, revenue and net burn add up', stated:money(nb0) + '/mo', computed:money(implied) + '/mo', delta:`within ${tb.tol}% of gross spend` });
      else add({ id:'burn_bridge', sev:'minor', title:'Gross burn, revenue and net burn do not add up',
        stated:money(nb0) + '/mo net', computed:money(implied) + '/mo', delta:`${rel.toFixed(0)}% of gross spend unexplained`, flatter: nb0 < implied, rawStated:nb0, rawComputed:implied,
        text:`Gross spend of ${money(gb0)} a month less recurring revenue of ${money(arr / 12)} a month implies net burn of about ${money(implied)}, against the ${money(nb0)} stated. Annual upfront billing and one-off receipts explain some gap; a large one needs an answer.`,
        ask:'Can you bridge gross burn to net burn for the last three months — cash receipts by type, including any annual prepayments or one-off income?' });
    }
  }

  /* 16 — stated TAM vs bottom-up */
  if (has(gv('stated_tam'), D.tam_bottomup) && D.tam_bottomup > 0) {
    const mult = gv('stated_tam') / D.tam_bottomup;
    if (mult > tolOf('tam_check', 10, null).tol) add({ id:'tam_check', sev:'major', title:'Stated market size is top-down', flatter:true,
      stated:money(gv('stated_tam')), computed:money(D.tam_bottomup), delta:mult.toFixed(0) + 'x larger than bottom-up',
      text:`Counting target accounts at the ACV this company actually realises gives ${money(D.tam_bottomup)}. The stated figure is ${mult.toFixed(0)} times larger.`,
      ask:'Can the market size be rebuilt from a named account list at current pricing rather than from an analyst report?' });
    else add({ id:'tam_check', sev:'ok', title:'Market size is defensible bottom-up', stated:money(gv('stated_tam')), computed:money(D.tam_bottomup), delta:mult.toFixed(1) + 'x' });
  }

  /* 17 — deferred revenue larger than ARR */
  if (has(gv('deferred_revenue'), arr) && gv('deferred_revenue') > arr * 1.1)
    add({ id:'deferred', sev:'minor', title:'Deferred revenue exceeds ARR',
      stated:money(gv('deferred_revenue')), computed:money(arr), delta:'exceeds annual run rate',
      text:'A deferred balance above the annual run rate usually means multi-year prepayments, which change the cash picture but not the recurring one.',
      ask:'How much of the deferred balance relates to contract years beyond the next twelve months?' });

  /* 18 — aged receivables */
  const tar = tolOf('ar', 8, 18);
  if (D.ar_share != null && D.ar_share > tar.tol)
    add({ id:'ar', sev: D.ar_share > tar.hard ? 'major' : 'minor', title:'Material receivables past 90 days',
      stated:pctv(D.ar_share) + ' of ARR', computed:'< 5% typical', delta:'collection risk',
      text:'Revenue booked but not collected after ninety days is often revenue that will be disputed or churned.',
      ask:'Which accounts are past ninety days, and are any of them already in a cancellation conversation?' });

  /* 19 — services revenue inside ARR */
  if (gv('services_pct') != null && gv('services_pct') > tolOf('services', 15, null).tol)
    add({ id:'services', sev:'minor', title:'Significant non-recurring revenue',
      stated:pctv(gv('services_pct')), computed:'< 15% preferred', delta:'ARR quality',
      text:'A meaningful share of revenue is non-recurring, which inflates every multiple calculated on the ARR figure.',
      ask:'Can subscription and services be shown as two separate revenue lines for the last eight quarters?' });

  /* 21 — customer count */
  if (has(gv('stated_customers'), gv('customers_now'))) {
    const st = gv('stated_customers'), cp = gv('customers_now'), d = Math.abs(st - cp), rel = cp > 0 ? d / cp * 100 : 0, tc = tolOf('stated_customers', 3, 10);
    if (d <= Math.max(1, cp * tc.tol / 100)) add({ id:'stated_customers', sev:'ok', title:'Customer count', stated:String(st), computed:String(cp), delta:'within tolerance' });
    else add({ id:'stated_customers', sev: rel > tc.hard ? 'major' : 'minor', title:'Customer count', stated:String(st), computed:String(cp),
      flatter: st > cp, rawStated:st, rawComputed:cp, delta:rel.toFixed(0) + '% ' + (st > cp ? 'overstated' : 'understated'),
      text:`The materials cite ${st} customers; the paying-customer figure is ${cp}.`,
      ask:'Does the stated customer count include free accounts, pilots, churned-but-contracted logos, or subsidiaries of one group counted separately?' });
  }

  /* 22 — take rate (marketplace / fintech) */
  cmp('stated_take_rate','take_rate',{ good:'hi', tol:8, hard:25, title:'Take rate', f:v=>v.toFixed(2)+'%',
    ask:'Is the stated take rate on gross or net revenue, and does it include payment processing pass-through?' });

  /* 23 — form figures against the customer ledger */
  const LED = S.ledger ? ledgerAnalytics(S.ledger) : null;
  if (LED) {
    const P = ledgerPrimitives(LED); let agree = 0, compared = 0;
    const lbl = k => (ALL_FIELDS().find(f => f.id === k) || {}).lbl || k;
    Object.entries(P).forEach(([k, lv]) => {
      const fv = gv(k); if (fv == null) return;
      compared++;
      const t = LEDGER_TOL[k] || { rel:5, hard:12 };
      let off, hardOff, deltaTxt;
      if (t.abs != null) { off = Math.abs(fv - lv) > t.abs; hardOff = Math.abs(fv - lv) > t.hard; deltaTxt = `${fv > lv ? '+' : ''}${Math.round(fv - lv)} vs ledger`; }
      else if (t.pts != null) { off = Math.abs(fv - lv) > t.pts; hardOff = Math.abs(fv - lv) > t.hard; deltaTxt = `${(fv - lv).toFixed(1)} pts vs ledger`; }
      else { const r = lv !== 0 ? Math.abs(fv - lv) / Math.abs(lv) * 100 : (fv === 0 ? 0 : 100); off = r > t.rel; hardOff = r > t.hard; deltaTxt = `${r.toFixed(0)}% ${fv > lv ? 'above' : 'below'} ledger`; }
      if (!off) { agree++; return; }
      const isMoney = /arr/.test(k), fmt = v => isMoney ? money(v) : /pct/.test(k) ? pctv(v) : String(Math.round(v));
      const goodHi = !/churned|contraction|logos_lost|top\d/.test(k);
      add({ id:'ledger_' + k, sev: hardOff ? 'major' : 'minor', title:`${lbl(k)} differs from the customer ledger`,
        stated:fmt(fv), computed:fmt(lv), delta:deltaTxt, flatter: goodHi ? fv > lv : fv < lv, rawStated:fv, rawComputed:lv,
        text:`The evidence form carries ${fmt(fv)}; rebuilding it from the customer-level ledger gives ${fmt(lv)}.`,
        ask:`Why does “${lbl(k)}” in the summary differ from the customer-level ledger? Which customers or adjustments explain the gap?` });
    });
    if (compared && agree === compared) add({ id:'ledger_all', sev:'ok', title:'Evidence form reconciles to the customer ledger', stated:`${compared} fields`, computed:'ledger', delta:'all within tolerance' });
  }

  /* 24 — form figures against the monthly financials */
  const SR = S.series;
  if (SR) {
    const lastOf = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };
    const cashS = lastOf(SR.cash), cashF = gv('cash_on_hand');
    if (has(cashS, cashF) && cashS > 0) {
      const r = Math.abs(cashF - cashS) / cashS * 100, ts = tolOf('series_cash', 5, 15);
      if (r > ts.tol) add({ id:'series_cash', sev: r > ts.hard ? 'major' : 'minor', title:'Cash differs from the monthly financials',
        stated:money(cashF), computed:money(cashS), delta:`${r.toFixed(0)}% apart`, flatter: cashF > cashS, rawStated:cashF, rawComputed:cashS,
        text:`The form carries ${money(cashF)} of cash; the latest month in the financials shows ${money(cashS)}.`,
        ask:'Which balance is current, and does either figure include undrawn debt or restricted cash?' });
    }
    const bs = SR.burn.filter(v => v != null).slice(-3), burnS = bs.length ? mean(bs) : null, burnF = gv('net_burn');
    if (has(burnS, burnF) && burnS > 0) {
      const r = Math.abs(burnF - burnS) / burnS * 100, tsb = tolOf('series_burn', 15, 35);
      if (r > tsb.tol) add({ id:'series_burn', sev: r > tsb.hard ? 'major' : 'minor', title:'Net burn differs from the monthly financials',
        stated:money(burnF) + '/mo', computed:money(burnS) + '/mo', delta:`${r.toFixed(0)}% apart`, flatter: burnF < burnS, rawStated:burnF, rawComputed:burnS,
        text:`The form carries ${money(burnF)} a month; the last three months of the financials average ${money(burnS)}.`,
        ask:'Is the quoted burn a forward plan, or does it exclude one-off costs? Which is the run-rate today?' });
    }
  }

  /* 20 — cash vs raise history */
  if (has(gv('cash_on_hand'), gv('total_raised')) && gv('cash_on_hand') > gv('total_raised') * 1.02 && !gv('debt_outstanding'))
    add({ id:'cash_raise', sev:'minor', title:'Cash exceeds total equity raised',
      stated:money(gv('cash_on_hand')), computed:money(gv('total_raised')) + ' raised', delta:'unexplained',
      text:'Cash above cumulative equity raised implies either profitability, debt, or a raise not reflected in the total.',
      ask:'Is there debt, a grant, or a round that is not included in the total raised figure?' });

  return cfgChecks(out, D);
}

/* ═══════════════════════════════════════════════════════════════
   SCORING — deterministic, weighted, stage-aware, sample-guarded
   ═══════════════════════════════════════════════════════════════ */

/* Metric weights inside a dimension. Default 1. */
const MW = {
  growth_yoy:2.2, nrr:2.2, grr:1.8, gross_margin:1.6, quick_ratio:1, logo_ret:1.2, services_pct:0.8,
  runway:2.2, burn_multiple:2, hype_ratio:1.4, arr_per_fte:1.6, rule40:1.4,
  cac_payback:2, ltv_cac:1.6, magic_number:1.4, win_rate:1, quota_att:1, pipeline_cov:0.8,
  pct_paid:0.8, top5_conc:1.6, sales_cycle:0.6,
  domain_years:1.4, eng_turnover:1.2, founder_conc:0.8, headcount_eff:1.2,
  tam_bottomup:1.6, penetration:0.8, win_vs_primary:1.2,
  option_pool:0.8, liq_pref:1, safe_overhang:1.2, uptime:1,
  pmf_score:1.4, nps:0.8, team_tenure:0.8,
};

function pos4(v, a) {
  if (v <= a[0]) return 0;
  if (v >= a[3]) return 3;
  for (let i = 0; i < 3; i++) if (v <= a[i + 1]) return i + (v - a[i]) / ((a[i + 1] - a[i]) || 1);
  return 3;
}
function bandScore(v, anchors, dir) {
  const pts = [0, 45, 72, 100];
  const p = pos4(v, anchors), lo = Math.min(Math.floor(p), 2), f = p - lo;
  const base = pts[lo] + (pts[lo + 1] - pts[lo]) * f;
  return clamp(dir === 'hi' ? base : 100 - base, 0, 100);
}
/* The value that scores exactly 72 ("good"). For higher-is-better it is the third anchor;
   for lower-is-better it sits between the first two anchors. */
function goodValue(cfg, a) { return cfg.dir === 'hi' ? a[2] : a[0] + (28 / 45) * (a[1] - a[0]); }
function bandedIdeal(v, ideal, hard) {
  if (v >= ideal[0] && v <= ideal[1]) return 92;
  if (v < ideal[0]) return clamp(bandScore(v, [hard[0], (hard[0] + ideal[0]) / 2, ideal[0], ideal[0]], 'hi'), 0, 92);
  return clamp(bandScore(v, [ideal[1], ideal[1], (ideal[1] + hard[1]) / 2, hard[1]], 'lo'), 0, 92);
}

/* Which metrics are not meaningful at this company's scale. */
function suppressions(D) {
  const s = {}, m = RUBRIC.minN;
  const c0 = gv('customers_12mo'), nc = gv('new_customers_l12'), hc = gv('headcount_now'), arr = gv('arr_now');
  const arr0 = gv('arr_12mo');
  if (c0 != null && c0 < m.retention) {
    const r = `only ${c0} customers a year ago — below the ${m.retention}-logo floor where a retention percentage carries signal`;
    ['nrr','grr','quick_ratio','logo_ret'].forEach(k => s[k] = r);
  }
  if (nc != null && nc < m.unit_economics) {
    const r = `only ${nc} new customers in the period — blended CAC on that few wins is not a rate, it is an anecdote`;
    ['cac_payback','ltv_cac'].forEach(k => s[k] = r);
  }
  if (arr0 != null && arr0 < m.growth_base)
    s.growth_yoy = `growth measured off ${money(arr0)} of opening ARR — percentage growth off a base this small is not comparable to anything`;
  if (arr != null && arr < m.magic_number)
    s.magic_number = `ARR below ${money(m.magic_number)} — quarterly magic number is dominated by single-deal timing at this scale`;
  if (hc != null && hc < m.arr_per_fte) s.arr_per_fte = `only ${hc} employees — ARR per head is not yet a productivity measure`;
  if (gv('headcount_sales') != null && gv('headcount_sales') < m.quota)
    s.quota_att = `fewer than ${m.quota} quota carriers — attainment is a single person's quarter`;
  const pr = gv('pmf_respondents');
  if (D.pmf_score != null && (pr == null || pr < m.pmf_survey))
    s.pmf_score = pr == null ? 'the number of survey respondents is not entered — the 40% test needs at least ' + m.pmf_survey + ' answers to mean anything'
      : `only ${pr} survey responses — below ${m.pmf_survey} the percentage is mostly noise`;
  return s;
}

/* ── Evidence quality: where did each number come from? ── */
/* Choice answers that are scored: [scorer, field, label, default weight]. */
const CAT_DEFS = [
  ['soc2', 'soc2', 'SOC 2 status', 1], ['books', 'audited_financials', 'Financial statement quality', 1.2],
  ['switching', 'switching_cost', 'Switching cost', 1.4], ['pricing', 'pricing_move', 'Last pricing action', 1.2],
  ['licence', 'licence_model', 'Regulatory model', 1.3], ['critical', 'mission_critical', 'How essential the product is', 1.2],
];
/* A yes/no answer can add points (good answer) or remove them (bad answer); the owner can change either. */
const boolKey = b => b.id + (b.pts > 0 ? ':plus' : ':minus');
const EVIDENCE = [
  { id:'',        label:'Unverified',            short:'unverified', w:0.35 },
  { id:'verbal',  label:'Founder said so',       short:'verbal',     w:0.25 },
  { id:'deck',    label:'Deck or memo',          short:'deck',       w:0.45 },
  { id:'model',   label:'Financial model',       short:'model',      w:0.6 },
  { id:'export',  label:'System export',         short:'export',     w:0.85 },
  { id:'bank',    label:'Bank or billing record',short:'bank',       w:0.95 },
  { id:'audited', label:'Audited or reviewed',   short:'audited',    w:1 },
];
function evidenceOf(id) {
  const e = S.evid[id];
  if (e != null && e !== '' && EVIDENCE.some(x => x.id === e)) return e;
  const p = S.prov[id];
  if (p && p.src === 'ledger') return 'export';
  if (p && p.src === 'extracted') return 'deck';
  return '';
}
const evWeight = id => (EVIDENCE.find(e => e.id === evidenceOf(id)) || EVIDENCE[0]).w;
const CAT_INPUT = { soc2:'soc2', books:'audited_financials', switching:'switching_cost', pricing:'pricing_move', licence:'licence_model', critical:'mission_critical' };
const LEDGER_METRICS = ['nrr','grr','logo_ret','cmgr3','cmgr12'];
function metricEvidence(key) {
  if (S.ledger && LEDGER_METRICS.includes(key)) return 0.9;
  if (CAT_INPUT[key]) return evWeight(CAT_INPUT[key]);
  const ins = inputsOf(key).filter(id => S.vals[id] != null && S.vals[id] !== '' || S.sel[id]);
  return ins.length ? mean(ins.map(evWeight)) : EVIDENCE[0].w;
}

function scoreAll(D, checks, opts) {
  opts = opts || {};
  const stage = S.stage, W = RUBRIC.weights[stage];
  const TH = activeThresholds();
  const supp = suppressions(D);
  const dims = {};
  Object.keys(W).forEach(k => dims[k] = { wsum:0, psum:0, possible:0, metrics:[], adj:0, notes:[] });
  const modelOk = cfg => !cfg.models || cfg.models.includes(S.model);
  let evNum = 0, evDen = 0;

  /* --- threshold metrics --- */
  Object.entries(TH).forEach(([key, cfg]) => {
    const dim = cfg.dim; if (!dims[dim] || !modelOk(cfg)) return;
    const w = MW[key] > 0 ? MW[key] : 1;
    const anchors = cfg.dir === 'band' ? (cfg[stage] ? true : null) : cfg[stage];
    if (!anchors) return;                              // not scored at this stage
    dims[dim].possible += w;
    const v = D[key];
    if (v == null || !isFinite(v)) return;             // no data
    if (supp[key]) { dims[dim].metrics.push({ key, label:DLABEL[key]||key, value:dfmt(key,v), score:null, suppressed:supp[key] }); return; }
    let sc;
    if (opts.overrides && opts.overrides[key] != null) sc = opts.overrides[key];
    else if (cfg.dir === 'band') sc = bandedIdeal(v, cfg.ideal, cfg.hard);
    else sc = bandScore(v, anchors, cfg.dir);
    dims[dim].wsum += w; dims[dim].psum += w * sc;
    const ev = metricEvidence(key); evNum += w * ev; evDen += w;
    dims[dim].metrics.push({
      key, label:DLABEL[key] || key, value:dfmt(key, v), raw:v, score:Math.round(sc), weight:w, evidence:ev, calibrated:!!cfg._cal,
      bench: cfg.dir === 'band' ? `${cfg.ideal[0]}–${cfg.ideal[1]} ideal`
           : (cfg.dir === 'hi' ? '≥ ' : '≤ ') + dfmt(key, goodValue(cfg, anchors)) + ' good' + (cfg._owner ? ' · your standard' : ''),
      note: cfg._note || null,
    });
  });

  /* --- categorical metrics --- */
  const cats = CAT_DEFS.map(([key, field, label, w]) => [key, gs(field), RUBRIC.categorical[key], label, w]);
  cats.forEach(([key, val, cfg0, label, w0]) => {
    /* Owner overrides: the score each answer earns, and the weight. */
    const cfg = Object.assign({}, cfg0, { map:Object.assign({}, cfg0.map, (CFG.categorical && CFG.categorical[key]) || {}) });
    const w = CFG.metricWeights && CFG.metricWeights['cat_' + key] > 0 ? +CFG.metricWeights['cat_' + key] : w0;
    const dim = cfg.dim; if (cfgHidden('metrics', 'cat_' + key) || !dims[dim] || !modelOk(cfg)) return;
    dims[dim].possible += w;
    if (!val || cfg.map[val] == null) return;
    const sc = opts.overrides && opts.overrides[key] != null ? opts.overrides[key] : cfg.map[val];
    dims[dim].wsum += w; dims[dim].psum += w * sc;
    const ev = metricEvidence(key); evNum += w * ev; evDen += w;
    dims[dim].metrics.push({ key, label, value:val, score:sc, weight:w, evidence:ev, bench:'categorical' });
  });

  /* --- boolean modifiers, bounded --- */
  RUBRIC.booleans.forEach(b => {
    if (b.models && !b.models.includes(S.model)) return;
    const v = gb(b.id); if (v == null || !dims[b.dim]) return;
    const isGood = v === b.good;
    const ov = CFG.booleans && CFG.booleans[boolKey(b)];
    if (ov != null && isFinite(+ov)) b = Object.assign({}, b, { pts: b.pts > 0 ? Math.max(0, +ov) : -Math.abs(+ov) });
    if (isGood && b.pts > 0) { dims[b.dim].adj += b.pts; dims[b.dim].notes.push({ good:true, note:b.note }); }
    if (!isGood && b.pts < 0) { dims[b.dim].adj += b.pts; dims[b.dim].notes.push({ good:false, note:b.note }); }
  });

  /* --- resolve dimensions (canonical order, not object-literal order) --- */
  const DIM_ORDER = ['revenue','capital','gtm','team','market','govern'];
  const dimensions = DIM_ORDER.filter(k => W[k] != null).map(k => {
    const d = dims[k];
    const cov = d.possible > 0 ? d.wsum / d.possible : 0;
    const raw = d.wsum > 0 ? d.psum / d.wsum : null;
    const adj = clamp(d.adj, -15, 15);
    const score = raw == null ? null : Math.round(clamp(raw + adj, 0, 100));
    return { id:k, label:DIM_LABEL[k], weight:W[k], coverage:cov, raw, adj, score, metrics:d.metrics, notes:d.notes };
  });

  /* --- overall ---
     A dimension carries its full stage weight only once it is at least half
     populated. Below that its influence falls proportionally, so a single
     lucky metric in an otherwise empty dimension cannot move the headline. */
  const scored = dimensions.filter(d => d.score != null);
  scored.forEach(d => d.effWeight = d.weight * Math.min(1, d.coverage / 0.5));
  const wTot = scored.reduce((a, d) => a + d.effWeight, 0);
  const overall = wTot > 0 ? scored.reduce((a, d) => a + d.effWeight * d.score, 0) / wTot : null;
  const coverage = dimensions.reduce((a, d) => a + d.weight * d.coverage, 0);

  /* --- gates --- */
  const gates = [];
  RUBRIC.gates.forEach(g => { if (!cfgHidden('gates', g.id) && gb(g.id) === g.when) gates.push({ id:g.id, title:g.title, why:g.why }); });
  /* The owner's own deal-breakers: any condition that must stop the assessment. */
  (CFG.gates || []).forEach(g => { if (g.when && fxTruthy(fxRun(g.when, D))) gates.push({ id:g.id, title:g.title, why:g.why || '', ask:g.ask || null, risk:g.risk || null, custom:true }); });
  const major = checks.filter(c => c.sev === 'major').length;
  const minor = checks.filter(c => c.sev === 'minor').length;
  if (major >= blockAfter() && !cfgHidden('gates', 'reconcile')) gates.push({ id:'reconcile',
    title:`${major} figures do not reconcile`,
    why:'When this many headline numbers disagree with the arithmetic behind them, the correct next step is a corrected data pack, not a score. Radar will not produce one until the material contradictions are resolved.',
  });

  /* --- confidence band: widened by thin coverage, contradictions and weak evidence --- */
  const evidence = evDen > 0 ? evNum / evDen : null;
  const evGap = evidence == null ? 0.5 : 1 - evidence;
  const half = overall == null ? null : Math.round(clamp(3 + 20 * (1 - coverage) + 3 * major + 12 * evGap, 3, 32));
  const confidence = coverage >= 0.75 && major === 0 && (evidence || 0) >= 0.7 ? 'HIGH'
                   : coverage >= 0.45 && major <= 1 && (evidence || 0) >= 0.45 ? 'MEDIUM' : 'LOW';

  return {
    rubric:rubricVersion(), stage, model:S.model, evidence,
    overall: overall == null ? null : Math.round(overall), overallRaw: overall,
    band: half == null ? null : [Math.max(0, Math.round(overall) - half), Math.min(100, Math.round(overall) + half)],
    coverage, confidence, dimensions, gates, suppressed:supp,
    counts:{ major, minor, ok:checks.filter(c => c.sev === 'ok').length },
  };
}

const DIM_LABEL = {
  revenue:'Revenue quality', capital:'Capital efficiency', gtm:'Go-to-market',
  team:'Team', market:'Market & moat', govern:'Governance & technical risk',
};

/* ═══════════════════════════════════════════════════════════════
   QUESTION LIST — the actual deliverable
   ═══════════════════════════════════════════════════════════════ */
function buildQuestions(D, checks, sc, ctx) {
  ctx = ctx || {};
  const q = [];
  sc.gates.forEach(g => q.push({ p:0, fam:'gates', tag:'Gate — resolve before terms', text:[g.title + '.', g.why, g.ask].filter(Boolean).join(' ') }));
  checks.filter(c => c.sev === 'major').forEach(c => c.ask && q.push({ p:1, fam:'contradictions', tag:'Contradiction — ' + c.title, text:c.ask }));
  (ctx.patterns || []).filter(p => p.sev === 'red' && p.ask).forEach(p => q.push({ p:1.5, fam:'risk_patterns', tag:'Risk pattern — ' + p.title, text:p.ask }));
  (ctx.forensics || []).filter(f => (f.status === 'fail' || f.status === 'warn') && f.ask).forEach(f => q.push({ p:1.6, fam:'forensics', tag:'Forensic signal — ' + f.title, text:f.ask }));
  checks.filter(c => c.sev === 'minor').forEach(c => c.ask && q.push({ p:2, fam:'inconsistencies', tag:'Inconsistency — ' + c.title, text:c.ask }));
  (ctx.patterns || []).filter(p => p.sev === 'amber' && p.ask).forEach(p => q.push({ p:2.2, fam:'watch_patterns', tag:'Watch pattern — ' + p.title, text:p.ask }));

  /* Missing required inputs */
  SECTIONS.forEach(sec => visibleFields(sec).forEach(f => {
    if (f.req && !fieldIsFilled(f)) q.push({ p:2, fam:'missing_inputs', tag:'Missing input — ' + sec.label, text:`Obtain ${f.lbl.toLowerCase()}. Several derived metrics cannot be computed without it.` });
  }));

  /* Suppressed metrics: say so out loud rather than scoring noise */
  Object.entries(sc.suppressed).forEach(([k, r]) =>
    q.push({ p:3, fam:'not_measurable', tag:'Not yet measurable', text:`${DLABEL[k] || k} is not scored: ${r}. Ask for the raw cohort table instead of a headline percentage.` }));

  /* Weakest scored dimensions */
  sc.dimensions.filter(d => d.score != null && d.score < 50)
    .sort((a, b) => a.score - b.score).slice(0, 3)
    .forEach(d => {
      const worst = d.metrics.filter(m => m.score != null).sort((a, b) => a.score - b.score)[0];
      q.push({ p:2, fam:'weak_dimensions', tag:'Weak dimension — ' + d.label, text:worst
        ? `${d.label} scores ${d.score}. The binding constraint is ${worst.label.toLowerCase()} at ${worst.value} against a ${worst.bench} bar. Establish whether this is structural or a timing artefact.`
        : `${d.label} scores ${d.score}. Work out which underlying metric is driving it.` });
    });

  /* Low coverage dimensions */
  sc.dimensions.filter(d => d.coverage < 0.35).forEach(d =>
    q.push({ p:3, fam:'thin_evidence', tag:'Thin evidence — ' + d.label, text:`Only ${Math.round(d.coverage * 100)}% of the ${d.label.toLowerCase()} rubric is populated. The dimension score is not yet load-bearing.` }));

  /* Heavily weighted metrics that rest on weak sources: confirm before relying on them. */
  const VERIFIABLE = ['growth_yoy','nrr','grr','gross_margin','runway','burn_multiple','cac_payback','ltv_cac','magic_number','top5_conc','logo_ret','arr_per_fte','rule40','quick_ratio','services_pct','hype_ratio'];
  sc.dimensions.flatMap(d => d.metrics.filter(m => VERIFIABLE.includes(m.key) && m.score != null && m.evidence != null && m.evidence < 0.5).map(m => ({ ...m, w:(m.weight || 1) * d.weight })))
    .sort((a, b) => b.w - a.w).slice(0, 4)
    .forEach(m => q.push({ p:3.5, fam:'unverified_inputs', tag:'Unverified input — ' + m.label, text:`Could you share the underlying data behind ${m.label.toLowerCase()} (${m.value})? We would like to tie it to a system export or statement rather than a summary.` }));

  /* Confirmatory diligence that every deal should include. */
  const LED = S.ledger ? ledgerAnalytics(S.ledger) : null;
  if (LED && LED.pareto.length >= 3) {
    const top = LED.pareto.slice(0, 2).map(x => x.name).join(' and ');
    q.push({ p:4, fam:'confirm_calls', tag:'Confirmatory — customer calls', text:`Could we speak with ${top}, and with one customer who churned in the last year, about renewal intent, alternatives considered and how the product is used?` });
  } else q.push({ p:4, fam:'confirm_calls', tag:'Confirmatory — customer calls', text:'Could we speak with two of the largest customers and one who churned in the last year?' });
  q.push({ p:4, fam:'confirm_funds', tag:'Confirmatory — use of funds', text:'What does the next eighteen months look like: hires by function, spend, and the specific milestones this round is meant to reach?' });

  return cfgQuestions(q, D);
}

function buildDataRequests(D, checks, sc) {
  const r = [];
  const add = (id, text) => { if (!r.some(x => x.text === text)) r.push({ id, text }); };
  if (!S.ledger) add('ledger_request', 'Revenue by customer by month for the last 24 months (a billing-system export, one row per customer). Radar rebuilds the waterfall, cohorts and concentration from it.');
  else add('ledger_tieout', 'Invoices and bank receipts for a sample of ten customers from the ledger, chosen by us, to tie the ledger to cash.');
  if (!S.series) add('series_request', 'Monthly management accounts for the last 24 months: revenue, total expenses, net burn, cash balance and headcount.');
  if (!S.ledger) add('cohort_table', 'Cohort retention table by signup month, gross and net, in dollars.');
  add('top20', 'Top 20 customers by ARR with contract start date, renewal date and term length.');
  if (sc.gates.length || gb('ip_assignments') !== true)
    add('ip_agreements', 'Executed IP assignment agreements for every current and former employee and contractor.');
  add('cap_table', 'Cap table as issued, including all SAFEs and notes with caps and discounts.');
  if (gv('cash_on_hand') != null && evidenceOf('cash_on_hand') !== 'bank' && evidenceOf('cash_on_hand') !== 'audited')
    add('bank_statements', 'Bank statements for the last three months, to confirm the cash balance and the burn.');
  if (gv('notes_principal') > 0) add('note_agreements', 'Convertible note agreements with principal, interest, maturity, cap and discount for each note.');
  if (gv('sm_spend_l12') != null) add('sm_split', 'S&M spend by month split into people, paid media, events and tooling.');
  if (gs('audited_financials') === 'Internal only') add('qoe', 'At minimum a reviewed set of financial statements, or a quality-of-earnings scope for the last two years.');
  if (gv('deferred_revenue')) add('deferred_rollforward', 'Deferred revenue roll-forward with the contract terms that generated it.');
  if (gv('ar_over_90')) add('aged_ar', 'Aged receivables report by customer.');
  if (gs('soc2') !== 'Type II') add('soc2', 'Current SOC 2 report or the auditor engagement letter and target date.');
  checks.filter(c => c.sev === 'major').forEach(c => add('workings', `Supporting workings for ${c.title.toLowerCase()}.`));
  return cfgRequests(r, D);
}

/* ── Reproducibility: same inputs, same rubric, same hash ── */
function runHash() {
  const sorted = o => Object.keys(o || {}).sort().reduce((a, k) => (a[k] = o[k], a), {});
  const canon = JSON.stringify({
    v:rubricVersion(), stage:S.stage, model:S.model,
    vals:sorted(S.vals), bools:sorted(S.bools), sel:sorted(S.sel), evid:sorted(S.evid),
    ledger:S.ledger ? S.ledger.id : null, series:S.series ? S.series.id : null,
  });
  let h = 5381;
  for (let i = 0; i < canon.length; i++) h = ((h << 5) + h + canon.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0').toUpperCase();
}
/* ═══════════════════════════════════════════════════════════════
   UI — navigation, forms, live derivation panel
   ═══════════════════════════════════════════════════════════════ */

function fieldIsFilled(f) {
  if (f.t === 'bool')   return S.bools[f.id] !== undefined;
  if (f.t === 'select') return !!S.sel[f.id];
  return S.vals[f.id] !== undefined && S.vals[f.id] !== '';
}
function sectionProgress(sec) {
  const vf = visibleFields(sec);
  const total = vf.length, filled = vf.filter(fieldIsFilled).length;
  return { filled, total, pct: total ? Math.round(filled / total * 100) : 0 };
}
function allProgress() {
  let f = 0, t = 0;
  SECTIONS.filter(s => !s.deal).forEach(s => { const p = sectionProgress(s); f += p.filled; t += p.total; });
  return { filled:f, total:t, pct: t ? Math.round(f / t * 100) : 0 };
}

function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'toast ' + type;
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f => setTimeout(f, 16));
  raf(() => el.classList.add('show'));
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 3400);
}
function toggleSidebar(open) {
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('sidebar-overlay').classList.toggle('show', open);
}
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + id);
  if (el) el.classList.add('active');
  updateTopbar(id);
  window.scrollTo({ top:0 });
  toggleSidebar(false);
}
function updateTopbar(id) {
  const c = document.getElementById('tb-company'), s = document.getElementById('tb-section');
  c.textContent = S.name || 'New assessment';
  const map = { intro:'Start', setup:'Company', intake:'Source material', section:'Evidence', verify:'Verification', loading:'Computing', result:'Report', library:'Library', studio:'Owner Studio' };
  s.textContent = id === 'section' ? (SECTIONS[S.section] ? SECTIONS[S.section].label : 'Evidence') : (map[id] || '');
  const right = document.getElementById('tb-right');
  right.innerHTML = '';
  if (id === 'section' || id === 'verify') {
    const b = document.createElement('button');
    b.className = 'btn btn-ghost btn-sm'; b.textContent = 'Save & exit';
    b.onclick = () => { saveSec(); saveDraft(); toast('Draft saved in this browser.'); showPage('intro'); };
    right.appendChild(b);
  }
  if (id === 'result') {
    right.innerHTML = '<button class="btn btn-ghost btn-sm" onclick="printMemo()">Print memo</button><button class="btn btn-ghost btn-sm" onclick="editData()">Edit inputs</button>';
  }
  if (id === 'library' && S.result) {
    right.innerHTML = '<button class="btn btn-ghost btn-sm" onclick="renderResult(S.result);showPage(\'result\')">Back to the report</button>';
  }
  if (id === 'intake' || id === 'setup') {
    right.innerHTML = '<button class="btn btn-ghost btn-sm" onclick="goLibrary()">Library</button>';
  }
}
function updateProgress() {
  const p = allProgress();
  document.getElementById('pct-val').textContent = p.pct + '%';
  document.getElementById('pct-fill').style.width = p.pct + '%';
  const { D } = derive();
  const ck = runChecks(D);
  const maj = ck.filter(c => c.sev === 'major').length, min = ck.filter(c => c.sev === 'minor').length;
  const el = document.getElementById('consist-val');
  if (!ck.length) { el.textContent = '—'; el.style.color = ''; }
  else if (maj) { el.textContent = maj + ' material'; el.style.color = 'var(--red)'; }
  else if (min) { el.textContent = min + ' minor'; el.style.color = 'var(--amber)'; }
  else { el.textContent = 'clean'; el.style.color = 'var(--green)'; }
  refreshNavCounts();
}
function refreshNavCounts() {
  SECTIONS.forEach((sec, i) => {
    const el = document.getElementById('ni-' + i); if (!el) return;
    const p = sectionProgress(sec);
    const c = el.querySelector('.nav-count'); if (c) c.textContent = p.filled + '/' + p.total;
    el.classList.toggle('done', p.filled === p.total);
    el.classList.toggle('active', i === S.section);
  });
}
function buildNav() {
  const nav = document.getElementById('sb-nav');
  nav.innerHTML = `<div class="nav-item" onclick="showPage('intake');renderIntakeStatus()"><div class="nav-dot"></div><div class="nav-label">Source material &amp; data files</div><div class="nav-count">↑</div></div>
    <div class="sb-nav-label">Evidence sections</div>` + SECTIONS.map((sec, i) => sectionHidden(sec) ? '' : `
    <div class="nav-item${sec.deal ? ' deal' : ''}" id="ni-${i}" onclick="jumpTo(${i})">
      <div class="nav-dot"></div>
      <div class="nav-label">${esc(sec.label)}</div>
      <div class="nav-count">0/${visibleFields(sec).length}</div>
    </div>`).join('') +
    `<div class="nav-item" onclick="goVerify()" style="margin-top:8px">
      <div class="nav-dot"></div><div class="nav-label">Verification &amp; report</div><div class="nav-count">→</div></div>`;
}
function buildStages() {
  document.getElementById('stage-grid').innerHTML = STAGES.map(s => `
    <div class="stage-card${S.stage === s.id ? ' sel' : ''}" id="stc-${s.id}" onclick="selStage('${s.id}')">
      <div class="stage-n">${esc(s.n)}</div><div class="stage-s">${esc(s.s)}</div>
    </div>`).join('');
}
function buildTypes() {
  document.getElementById('type-grid').innerHTML = MODELS.map(t => `
    <div class="type-card${S.model === t.id ? ' sel' : ''}" id="tc-${t.id}" onclick="selModel('${t.id}')">
      <span class="type-em">${esc(t.em)}</span>
      <div class="type-n">${esc(t.n)}</div><div class="type-s">${esc(t.s)}</div>
    </div>`).join('');
  const m = MODELS.find(x => x.id === S.model);
  document.getElementById('calib-note').textContent = m ? CALIB_NOTE[m.calib] : '';
}
function selStage(id) { S.stage = id; buildStages(); saveDraft(); }
function selModel(id) { S.model = id; buildTypes(); buildNav(); updateProgress(); saveDraft(); }

function goSetup() { showPage('setup'); buildStages(); buildTypes(); }
function goIntake() {
  if (!S.name.trim()) { toast('Enter a company name so the report can be identified later.', 'err'); return; }
  showPage('intake'); renderIntakeStatus();
}
function lastVisibleSection() { let i = SECTIONS.length - 1; while (i > 0 && sectionHidden(SECTIONS[i])) i--; return i; }
function startSections() { let i = 0; while (i < SECTIONS.length - 1 && sectionHidden(SECTIONS[i])) i++; S.section = i; renderSection(i); showPage('section'); }
function goIntakeFromNav() { showPage('intake'); renderIntakeStatus(); }
function jumpTo(i) { saveSec(); S.section = i; renderSection(i); showPage('section'); }
function prevSec() {
  saveSec();
  let i = S.section - 1; while (i >= 0 && sectionHidden(SECTIONS[i])) i--;
  if (i >= 0) { S.section = i; renderSection(i); showPage('section'); } else showPage('intake');
}
function nextSec() {
  saveSec();
  let i = S.section + 1; while (i < SECTIONS.length && sectionHidden(SECTIONS[i])) i++;
  if (i < SECTIONS.length) { S.section = i; renderSection(i); showPage('section'); }
  else goVerify();
}
function saveSec() {
  document.querySelectorAll('[data-fid]').forEach(inp => {
    const id = inp.dataset.fid, v = inp.value.trim();
    if (inp.dataset.kind === 'select') { if (v) S.sel[id] = v; else delete S.sel[id]; }
    else if (v === '') delete S.vals[id];
    else S.vals[id] = v;
  });
  saveDraft(); updateProgress();
}

/* ── FIELD RENDERING ── */
function provBadge(id) {
  const p = S.prov[id];
  if (!p) return '';
  return `<span class="prov${p.src === 'ledger' ? ' ledger' : ''}" title="${esc(p.line || '')}">${p.src === 'ledger' ? 'ledger' : 'extracted'}</span>`;
}
/* Compact evidence-source picker shown on every evidence field. */
function evidencePicker(f) {
  const sec = SECTIONS.find(s => s.fields.includes(f));
  if (!sec || sec.claims || sec.deal || f.t === 'txt') return '';
  const cur = evidenceOf(f.id);
  return `<select class="ev-sel ev-${cur || 'none'}" title="Where does this number come from? Stronger evidence narrows the score's confidence band." aria-label="Evidence source for ${esc(f.lbl)}"
    onchange="setEvidence('${f.id}',this.value,this)">${EVIDENCE.map(e => `<option value="${e.id}"${e.id === cur ? ' selected' : ''}>${esc(e.short)}</option>`).join('')}</select>`;
}
function setEvidence(id, v, el) {
  if (v) S.evid[id] = v; else S.evid[id] = '';
  if (el) el.className = 'ev-sel ev-' + (v || 'none');
  saveDraft();
}
function renderField(f) {
  const filled = fieldIsFilled(f) ? ' filled' : '';
  const hint = f.hint ? `<div class="field-hint">${esc(f.hint)}</div>` : '';
  const req = f.req ? '<span class="req-tag">required</span>' : '';
  const gate = f.gate ? '<span class="req-tag" style="background:var(--red-d);color:#fca5a5;border-color:var(--red-b)">gate</span>' : '';

  if (f.t === 'bool') {
    const v = S.bools[f.id];
    return `<div class="bool-card field-card${filled}" id="fc-${f.id}" tabindex="0" data-bool-id="${f.id}" onkeydown="boolKeydown(event,'${f.id}')">
      <div class="field-lbl">${esc(f.lbl)} ${gate}${provBadge(f.id)}${evidencePicker(f)}</div>
      ${hint}
      <div class="bool-grp">
        <button class="bool-btn yes${v === true ? ' active' : ''}"  onclick="setBool('${f.id}',true)">Yes</button>
        <button class="bool-btn no${v === false ? ' active' : ''}"  onclick="setBool('${f.id}',false)">No</button>
        <button class="bool-btn unk${v === undefined ? ' active' : ''}" onclick="setBool('${f.id}',undefined)">Unknown</button>
      </div>
    </div>`;
  }
  if (f.t === 'select') {
    return `<div class="field-card field-item${filled}" id="fc-${f.id}">
      <div class="field-lbl">${esc(f.lbl)}${req}${provBadge(f.id)}${evidencePicker(f)}</div>
      ${hint}
      <select class="field-select" data-fid="${f.id}" data-kind="select" onchange="S.sel['${f.id}']=this.value;updateFieldCardState('${f.id}');liveDerive()">
        <option value="">Not answered</option>
        ${f.options.map(o => `<option${S.sel[f.id] === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}
      </select>
    </div>`;
  }
  const chips = f.chips ? `<div class="chip-row">${f.chips.map(c =>
    `<button class="chip${String(S.vals[f.id]) === String(c) ? ' active' : ''}" onclick="setChip('${f.id}',${c})">${c}${f.unit === '%' ? '%' : ''}</button>`).join('')}</div>` : '';
  const unit = f.unit ? ` <span style="font-weight:300;opacity:.5">(${esc(f.unit)})</span>` : '';
  return `<div class="field-card field-item${filled}" id="fc-${f.id}">
    <div class="field-lbl">${esc(f.lbl)}${unit}${req}${provBadge(f.id)}${evidencePicker(f)}</div>
    ${hint}
    <input class="field-inp" data-fid="${f.id}" type="${f.t === 'num' ? 'number' : 'text'}" step="any"
           value="${esc(S.vals[f.id] == null ? '' : S.vals[f.id])}"
           placeholder="${f.t === 'num' ? '—' : 'Text'}"
           oninput="S.vals['${f.id}']=this.value;updateFieldCardState('${f.id}');liveDerive();saveDraft()" />
    ${chips}
  </div>`;
}
function updateFieldCardState(id) {
  const all = SECTIONS.flatMap(s => s.fields), f = all.find(x => x.id === id);
  const el = document.getElementById('fc-' + id);
  if (el && f) el.classList.toggle('filled', fieldIsFilled(f));
  updateSectionProgressUI();
}
function updateSectionProgressUI() {
  const sec = SECTIONS[S.section]; if (!sec) return;
  const p = sectionProgress(sec);
  const t = document.getElementById('sec-field-count'), fill = document.getElementById('sec-field-fill');
  if (t) t.textContent = `${p.filled} of ${p.total}`;
  if (fill) fill.style.width = p.pct + '%';
  updateProgress();
}
function setChip(id, val) {
  S.vals[id] = String(val);
  const inp = document.querySelector(`[data-fid="${id}"]`); if (inp) inp.value = val;
  const card = document.getElementById('fc-' + id);
  if (card) card.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.textContent.replace('%', '') === String(val)));
  updateFieldCardState(id); liveDerive(); saveDraft();
}
function setBool(id, val) {
  if (val === undefined) delete S.bools[id]; else S.bools[id] = val;
  const card = document.getElementById('fc-' + id); if (!card) return;
  const btns = card.querySelectorAll('.bool-btn');
  btns[0].classList.toggle('active', val === true);
  btns[1].classList.toggle('active', val === false);
  btns[2].classList.toggle('active', val === undefined);
  updateFieldCardState(id); liveDerive(); saveDraft();
}
function boolKeydown(e, id) {
  const k = e.key.toLowerCase();
  if (k === 'y') { setBool(id, true); e.preventDefault(); }
  if (k === 'n') { setBool(id, false); e.preventDefault(); }
  if (k === 'u' || k === '0') { setBool(id, undefined); e.preventDefault(); }
}

/* ── SECTION PAGE ── */
function renderSection(idx) {
  const sec = SECTIONS[idx], p = sectionProgress(sec);
  const groups = [];
  visibleFields(sec).forEach(f => {
    let g = groups.find(x => x.name === (f.g || ''));
    if (!g) { g = { name:f.g || '', fields:[] }; groups.push(g); }
    g.fields.push(f);
  });

  const html = `
    <div class="sec-step-bar">${SECTIONS.map((_, i) =>
      `<div class="sec-step-dot${i === idx ? ' active' : i < idx ? ' done' : ''}"></div>`).join('')}</div>

    <div class="sec-header">
      <div class="sec-icon" style="background:${sec.ibg}"><span style="font-size:20px">${sec.em}</span></div>
      <div>
        <div class="sec-title">${esc(sec.label)}</div>
        <div class="sec-desc">${esc(sec.desc)}</div>
        <div class="sec-field-progress">
          <span class="sec-counter" id="sec-field-count">${p.filled} of ${p.total}</span>
          <div class="sec-field-track"><div class="sec-field-fill" id="sec-field-fill" style="width:${p.pct}%"></div></div>
        </div>
      </div>
    </div>

    <div class="sec-toolbar">
      <div class="sec-toolbar-left">${sec.claims
        ? 'Nothing here is scored. Every entry is compared against the computed figure.'
        : sec.deal ? 'Nothing here is scored. It prices the deal and tests whether the outcome can matter to your fund.'
        : 'Leave a field blank rather than guessing — a blank lowers confidence, a guess corrupts the output. The small tag on each field records where the number came from.'}</div>
      <div class="sec-toolbar-right">
        <button class="btn btn-ghost btn-sm" onclick="clearSection()">Clear section</button>
      </div>
    </div>
    ${sectionBanner(sec)}

    <div id="derived-slot"></div>

    ${groups.map(g => `
      <div class="field-group">
        ${g.name ? `<div class="field-group-title">${esc(g.name)}</div>` : ''}
        <div class="field-grid">${g.fields.map(renderField).join('')}</div>
      </div>`).join('')}

    <div class="sec-nav">
      <button class="btn btn-ghost" onclick="prevSec()">${idx === 0 ? 'Back' : 'Previous'}</button>
      <div class="sec-nav-right">
        <span class="sec-kbd-hint">Y / N / U on a focused yes-no card</span>
        <button class="btn btn-primary" onclick="nextSec()">${idx === SECTIONS.length - 1 ? 'Go to verification' : 'Next section'}</button>
      </div>
    </div>`;

  document.getElementById('section-content').innerHTML = html;
  liveDerive();
  refreshNavCounts();
  window.scrollTo({ top:0 });
}
/* Context banners: ledger status on revenue, model note on the model section. */
function sectionBanner(sec) {
  if (sec.id === 'revenue' || sec.id === 'gtm') {
    const LED = S.ledger ? ledgerAnalytics(S.ledger) : null;
    if (!LED) return sec.id === 'revenue' ? `<div class="sector-note">No customer ledger loaded. Upload revenue by customer by month on the <a href="#" onclick="showPage('intake');return false">source material</a> step and Radar computes these fields — and true cohort retention — itself.</div>` : '';
    const P = ledgerPrimitives(LED);
    const diff = Object.keys(P).filter(k => SECTIONS.find(x => x.id === sec.id).fields.some(f => f.id === k) && gv(k) != null && S.prov[k]?.src !== 'ledger').length;
    return `<div class="sector-note ledger-note">Customer ledger loaded — ${S.ledger.customers.length} customers × ${LED.months.length} months (${monthLabel(LED.months[0])} – ${monthLabel(LED.months[LED.e])}).
      Ledger ARR ${money(LED.arrNow)} · cohort NRR ${fmtPct(LED.nrrCohort)} · GRR ${fmtPct(LED.grrCohort)}.
      <button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="applyLedgerToForm();renderSection(S.section);toast('Ledger figures applied to the form.')">Apply ledger figures to the form</button>
      ${diff ? `<span style="display:block;margin-top:6px;color:var(--amber)">${diff} field${diff === 1 ? '' : 's'} here were entered by hand; the verification step compares them against the ledger.</span>` : ''}</div>`;
  }
  if (sec.id === 'model') {
    const m = MODELS.find(x => x.id === S.model);
    return `<div class="sector-note">Showing the ${esc(m ? m.n : '')} fields. Change the business model on the <a href="#" onclick="goSetup();return false">setup step</a> to see others.</div>`;
  }
  return '';
}
function clearSection() {
  const sec = SECTIONS[S.section];
  sec.fields.forEach(f => { delete S.vals[f.id]; delete S.bools[f.id]; delete S.sel[f.id]; delete S.prov[f.id]; });
  renderSection(S.section); saveDraft(); updateProgress();
}

/* ── LIVE DERIVED PANEL ── */
const LIVE_BY_SECTION = {
  revenue: ['growth_yoy','nrr','grr','quick_ratio','net_new_arr','logo_ret','gm_implied'],
  capital: ['runway','burn_multiple','hype_ratio','arr_per_fte','rule40','fcf_margin','safe_overhang'],
  gtm:     ['acv','cac','cac_payback','ltv','ltv_cac','magic_number','top5_conc'],
  team:    ['arr_per_fte','eng_turnover','headcount_growth','headcount_eff','burn_implied'],
  market:  ['tam_bottomup','sam','penetration','acv'],
  govern:  ['safe_overhang','option_pool','uptime'],
  claims:  ['nrr','grr','growth_yoy','runway','rule40','burn_multiple','acv','cac','cac_payback','ltv_cac','take_rate'],
  model:   ['gm_trend','inference_pct','seat_util','gmv_growth','take_rate','repeat_pct','contrib_margin','loss_rate','volume_growth'],
};
function liveDeal(slot) {
  const { D } = derive();
  const X = dealMath(D);
  if (!X) { slot.innerHTML = `<div class="derived-panel"><div class="derived-head"><h4>Deal maths</h4><span>waiting for round size and pre-money</span></div>
    <p style="font-size:11.5px;color:var(--t2)">Enter the round size and the pre-money to see post-money, your ownership, the effective pre-money after the pool shuffle and SAFE conversion, and what exit would return your fund.</p></div>`; return; }
  const tiles = [
    ['Post-money', money(X.P), 'pre-money + new money'],
    ['Your ownership at entry', X.ownEntry != null ? fmtPct(X.ownEntry * 100, 2) : '—', 'cheque ÷ post-money'],
    ['Effective pre-money', money(X.effPre), 'after pool top-up and SAFE conversion'],
    ['Ownership at exit', X.ownExit != null ? fmtPct(X.ownExit * 100, 2) : '—', `after ${X.I.rounds} rounds at ${X.I.dil}% dilution`],
    ['Exit to return the fund', X.fundReturner != null ? money(X.fundReturner) : '—', 'fund size ÷ ownership at exit'],
    ['Entry multiple', X.entryMult != null ? fmtX(X.entryMult) + ' ARR' : '—', 'post-money ÷ ARR'],
  ];
  slot.innerHTML = `<div class="derived-panel"><div class="derived-head"><h4>Deal maths</h4><span>computed live · full analysis in the report</span></div>
    <div class="derived-grid">${tiles.map(t => `<div class="dv n"><div class="dv-lbl">${esc(t[0])}</div><div class="dv-val">${esc(t[1])}</div><div class="dv-form">${esc(t[2])}</div></div>`).join('')}</div></div>`;
}
function liveDerive() {
  const slot = document.getElementById('derived-slot'); if (!slot) return;
  const sec = SECTIONS[S.section]; if (!sec) return;
  if (sec.deal) return liveDeal(slot);
  const { D, F } = derive();
  const keys = (LIVE_BY_SECTION[sec.id] || []).filter(k => D[k] != null);
  const supp = suppressions(D);

  if (!keys.length) {
    slot.innerHTML = `<div class="derived-panel"><div class="derived-head"><h4>Computed from this section</h4>
      <span>waiting for inputs</span></div>
      <p style="font-size:11.5px;color:var(--t2)">Nothing derivable yet. Fill the primitives above and the metrics appear here as they become computable.</p></div>`;
    return;
  }
  const th = activeThresholds();
  const cls = k => {
    if (supp[k]) return 'n';
    const cfg = th[k]; if (!cfg || cfg.dir === 'band') return 'n';
    const a = cfg[S.stage]; if (!a) return 'n';
    const s = bandScore(D[k], a, cfg.dir);
    return s >= 72 ? 'g' : s >= 45 ? 'a' : 'r';
  };
  slot.innerHTML = `<div class="derived-panel">
    <div class="derived-head"><h4>Computed from this section</h4><span>${keys.length} metric${keys.length === 1 ? '' : 's'} · not entered by hand</span></div>
    <div class="derived-grid">${keys.map(k => `
      <div class="dv ${cls(k)}">
        <div class="dv-lbl">${esc(DLABEL[k] || k)}</div>
        <div class="dv-val">${esc(dfmt(k, D[k]))}</div>
        <div class="dv-form">${esc(F[k] || '')}</div>
        ${supp[k] ? `<div class="dv-form" style="color:var(--amber)">not scored at this scale</div>` : ''}
      </div>`).join('')}</div>
  </div>`;
}

/* ── DRAFTS ── */
function draftPayload() {
  return {
    v:4, name:S.name, stage:S.stage, model:S.model, asof:S.asof, section:S.section,
    vals:S.vals, bools:S.bools, sel:S.sel, prov:S.prov, evid:S.evid, assume:S.assume, notes:S.notes, checklist:S.checklist || {},
    ledger: S.ledger ? { csv:ledgerToCSV(S.ledger) } : null,
    series: S.series ? { csv:seriesToCSV(S.series) } : null,
  };
}
/* Saved drafts, exports and library entries come from files: keep only well-formed values. */
function cleanMap(o, test) {
  const out = {};
  if (o && typeof o === 'object' && !Array.isArray(o)) Object.keys(o).forEach(k => { if (/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k) && test(o[k])) out[k] = o[k]; });
  return out;
}
function restorePayload(d) {
  d = d && typeof d === 'object' ? d : {};
  const okStr = v => typeof v === 'string' || (typeof v === 'number' && isFinite(v));
  S = Object.assign(blankState(), {
    name:typeof d.name === 'string' ? d.name.slice(0, 200) : '',
    stage:STAGES.some(s => s.id === d.stage) ? d.stage : 'seed',
    /* A model added in the Studio may not be loaded yet when a draft is restored, so any well-formed id is kept. */
    model:MODELS.some(m => m.id === d.model) || (typeof d.model === 'string' && /^[a-z][a-z0-9_]{1,39}$/.test(d.model)) ? d.model : 'saas',
    asof:typeof d.asof === 'string' && /^\d{4}-\d{2}$/.test(d.asof) ? d.asof : '',
    section:Number.isInteger(d.section) && d.section >= 0 ? d.section : 0,
    vals:cleanMap(d.vals, okStr), bools:cleanMap(d.bools, v => typeof v === 'boolean'), sel:cleanMap(d.sel, v => typeof v === 'string'),
    prov:cleanMap(d.prov, v => v && typeof v === 'object' && (v.src === 'ledger' || v.src === 'extracted')),
    evid:cleanMap(d.evid, v => EVIDENCE.some(e => e.id === v)),
    assume:cleanMap(d.assume, v => typeof v === 'number' && isFinite(v)), notes:typeof d.notes === 'string' ? d.notes : '',
    checklist:cleanMap(d.checklist, v => ['todo','requested','received','reviewed','issue','na'].includes(v)),
  });
  if (d.ledger && d.ledger.csv) { const r = parseLedger(d.ledger.csv, 'mrr'); if (r.ok) S.ledger = r.ledger; }
  if (d.series && d.series.csv) { const r = parseSeries(d.series.csv); if (r.ok) S.series = r.series; }
  const n = document.getElementById('cname'); if (n) n.value = S.name;
  const a = document.getElementById('asof'); if (a) a.value = S.asof;
}
let _draftWarned = false;
function saveDraft() {
  try { localStorage.setItem('vcr3-draft', JSON.stringify(draftPayload())); }
  catch (e) {
    try {
      const p = draftPayload(); p.ledger = null;
      localStorage.setItem('vcr3-draft', JSON.stringify(p));
      if (!_draftWarned) { _draftWarned = true; toast('The ledger is too large to keep in browser storage. Export the assessment as JSON to save it.', 'err'); }
    } catch (e2) {}
  }
}
function loadDraft() {
  try {
    const raw = localStorage.getItem('vcr3-draft'); if (!raw) return;
    restorePayload(JSON.parse(raw));
    updateProgress();
    if (S.name || Object.keys(S.vals).length) document.getElementById('resume-btn').style.display = '';
  } catch (e) {}
}
function resumeDraft() { buildStages(); buildTypes(); renderIntakeStatus(); renderSection(S.section); showPage('section'); }
function resetApp() {
  if (!confirm('Clear this assessment and start again? The saved draft in this browser is deleted.')) return;
  try { localStorage.removeItem('vcr3-draft'); } catch (e) {}
  S = blankState();
  document.getElementById('cname').value = '';
  document.getElementById('asof').value = '';
  ['intake-deck', 'intake-fin', 'ledger-paste', 'series-paste'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderIntakeStatus(); renderFileList();
  updateProgress(); showPage('intro');
}
function editData() { renderSection(S.section); showPage('section'); }

/* ═══════════════════════════════════════════════════════════════
   PROVIDERS — the model never produces a score. It writes prose
   around numbers the deterministic engine has already computed.
   ═══════════════════════════════════════════════════════════════ */
const PROVIDERS = {
  local:      { needsKey:false, name:'Deterministic only', hint:'Scores, checks and the question list are computed in your browser. Nothing is sent anywhere.', ph:'No key needed' },
  anthropic:  { needsKey:true,  name:'Anthropic',    hint:'console.anthropic.com', ph:'sk-ant-api03-…',
                url:'https://api.anthropic.com/v1/messages', model:'claude-sonnet-4-6' },
  openai:     { needsKey:true,  name:'OpenAI',       hint:'platform.openai.com', ph:'sk-proj-…',
                url:'https://api.openai.com/v1/chat/completions', model:'gpt-4o' },
  gemini:     { needsKey:true,  name:'Gemini',       hint:'aistudio.google.com', ph:'AIza…',
                url:'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', model:'gemini-2.0-flash' },
  groq:       { needsKey:true,  name:'Groq',         hint:'console.groq.com', ph:'gsk_…',
                url:'https://api.groq.com/openai/v1/chat/completions', model:'llama-3.3-70b-versatile' },
  openrouter: { needsKey:true,  name:'OpenRouter',   hint:'openrouter.ai/keys', ph:'sk-or-v1-…',
                url:'https://openrouter.ai/api/v1/chat/completions', model:'meta-llama/llama-3.3-70b-instruct' },
};

/* The model name can be overridden in the sidebar, so the app keeps working as providers rename models. */
function modelName(providerId) {
  const o = (document.getElementById('api-model') || {}).value;
  return (o && o.trim()) || PROVIDERS[providerId].model;
}
async function callModel(providerId, key, system, prompt, maxTokens) {
  const p = PROVIDERS[providerId], model = modelName(providerId);
  const mt = maxTokens || 4000;
  let res;
  if (providerId === 'anthropic') {
    res = await fetch(p.url, { method:'POST',
      headers:{ 'content-type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
      body:JSON.stringify({ model, max_tokens:mt, system, messages:[{ role:'user', content:prompt }] }) });
  } else if (providerId === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    res = await fetch(url + '?key=' + encodeURIComponent(key), { method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ systemInstruction:{ parts:[{ text:system }] }, contents:[{ role:'user', parts:[{ text:prompt }] }], generationConfig:{ maxOutputTokens:mt } }) });
  } else {
    res = await fetch(p.url, { method:'POST',
      headers:{ 'content-type':'application/json', authorization:'Bearer ' + key },
      body:JSON.stringify({ model, max_tokens:mt, messages:[{ role:'system', content:system }, { role:'user', content:prompt }] }) });
  }
  if (!res.ok) throw new Error(`${p.name} returned ${res.status}. ${(await res.text()).slice(0, 180)}`);
  const j = await res.json();
  if (providerId === 'anthropic') return (j.content || []).map(c => c.text || '').join('\n');
  if (providerId === 'gemini') return ((j.candidates || [])[0]?.content?.parts || []).map(x => x.text || '').join('\n');
  return j.choices?.[0]?.message?.content || '';
}
function parseJSON(text) {
  const clean = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(clean); } catch (e) {}
  const m = clean.match(/[\[{][\s\S]*[\]}]/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}
function aiReady() {
  const provider = document.getElementById('api-provider').value;
  const key = document.getElementById('api-key').value.trim();
  if (!PROVIDERS[provider] || !PROVIDERS[provider].needsKey) return { ok:false, why:'Choose a model provider in the sidebar and paste a key.' };
  if (!key || key.length < 8) return { ok:false, why:'Enter the API key for the selected provider in the sidebar.' };
  return { ok:true, provider, key };
}

/* ═══════════════════════════════════════════════════════════════
   EXTRACTION — source material to primitives, with provenance
   ═══════════════════════════════════════════════════════════════ */
function extractableFields() {
  return SECTIONS.flatMap(visibleFields).filter(f => f.t === 'num' || f.t === 'bool' || f.t === 'select');
}
async function runExtraction() {
  const ai = aiReady();
  if (!ai.ok) { toast('Extraction needs a model key. ' + ai.why + ' Or continue and enter figures by hand — structured files never need a key.', 'err'); return; }
  const { provider, key } = ai;
  const deck = document.getElementById('intake-deck').value.trim();
  const fin  = document.getElementById('intake-fin').value.trim();
  const files = S.files.map(f => `--- ${f.name} ---\n${f.text}`).join('\n\n');
  const src = [deck && '=== NARRATIVE MATERIAL ===\n' + deck, fin && '=== FINANCIALS ===\n' + fin, files].filter(Boolean).join('\n\n');
  if (src.length < 40) { toast('Paste some source material first, or skip to enter figures by hand.', 'err'); return; }

  const btn = document.getElementById('extract-btn');
  btn.disabled = true; btn.textContent = 'Extracting…';

  const fieldList = extractableFields().map(f => {
    const u = f.t === 'select' ? `one of: ${f.options.join(' | ')}` : f.t === 'bool' ? 'true or false' : (f.unit === '$' ? 'number in USD, no symbols' : f.unit === '%' ? 'number, percentage points' : 'number');
    return `${f.id} — ${f.lbl} (${u})`;
  }).join('\n');

  const SYSTEM = 'You extract figures from startup fundraising material into a fixed schema. You never estimate, infer or annualise. If a value is not stated, you omit the field. You always return the exact source line for every value you return.';
  const PROMPT = `Extract values for the fields below from the source material.

RULES
- Only return a field if the material states it explicitly. Do not compute, annualise or infer anything.
- Currency: strip symbols and separators. "$4.2M" becomes 4200000.
- Percentages: "71%" becomes 71. "1.4x" becomes 1.4.
- Churn and contraction ARR must be positive numbers.
- Fields beginning with stated_ are the company's own headline claims — take them exactly as presented, even if the material elsewhere implies a different number. The disagreement is the point.
- Return ONLY a JSON object, no prose, in this shape:
{ "field_id": { "value": <number|boolean|string>, "line": "<the exact source sentence or cell, max 120 chars>" } }

FIELDS
${fieldList}

SOURCE MATERIAL
${src.slice(0, 28000)}`;

  try {
    const raw = await callModel(provider, key, SYSTEM, PROMPT);
    const obj = parseJSON(raw);
    if (!obj) throw new Error('The response was not valid JSON.');
    const all = extractableFields(); let n = 0;
    Object.entries(obj).forEach(([id, rec]) => {
      const f = all.find(x => x.id === id); if (!f || rec == null) return;
      const v = rec && typeof rec === 'object' ? rec.value : rec;
      if (v == null || v === '') return;
      if (f.t === 'bool') { if (typeof v !== 'boolean') return; S.bools[id] = v; }
      else if (f.t === 'select') { if (!f.options.includes(String(v))) return; S.sel[id] = String(v); }
      else { const num = parseFloat(v); if (!isFinite(num)) return; S.vals[id] = String(num); }
      S.prov[id] = { src:'extracted', line:(rec && rec.line) ? String(rec.line).slice(0, 160) : '' };
      n++;
    });
    saveDraft(); updateProgress();
    toast(`${n} field${n === 1 ? '' : 's'} extracted. Review every one before generating the report.`);
    startSections();
  } catch (e) {
    toast('Extraction failed: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Extract figures';
  }
}

/* ═══════════════════════════════════════════════════════════════
   VERIFICATION PAGE
   ═══════════════════════════════════════════════════════════════ */
function goVerify() {
  saveSec();
  const { D } = derive();
  const checks = runChecks(D);
  const majors = checks.filter(c => c.sev === 'major');
  const minors = checks.filter(c => c.sev === 'minor');
  const oks    = checks.filter(c => c.sev === 'ok');
  const p = allProgress();
  const LED = S.ledger ? ledgerAnalytics(S.ledger) : null;
  const opt = optimismTest(checks);
  const fx = activeForensics(LED).filter(f => f.status === 'warn' || f.status === 'fail');

  const card = c => `<div class="contra${c.sev === 'minor' ? ' minor' : ''}">
    <div class="contra-h"><strong>${esc(c.title)}</strong><span class="sev">${esc(c.delta || c.sev)}</span></div>
    <p>${esc(c.text || '')}</p>
    ${c.ask ? `<div class="ask">${esc(c.ask)}</div>` : ''}
  </div>`;

  document.getElementById('verify-content').innerHTML = `
    <div class="pg-eyebrow">Step 4 of 4</div>
    <h2 class="pg-title">Verification</h2>
    <p class="pg-desc">${CHECK_COUNT} checks compare what the company states against what the underlying figures produce${LED ? ', and every summary figure against the customer ledger' : ''}. This runs before any score is computed, because a score built on numbers that do not reconcile is worse than no score.</p>

    <div class="stat-row" style="margin-bottom:22px">
      <div class="stat"><span class="stat-n" style="color:${majors.length ? 'var(--red)' : 'var(--green)'}">${majors.length}</span><span class="stat-l">Material</span></div>
      <div class="stat"><span class="stat-n" style="color:${minors.length ? 'var(--amber)' : 'var(--t1)'}">${minors.length}</span><span class="stat-l">Minor</span></div>
      <div class="stat"><span class="stat-n">${oks.length}</span><span class="stat-l">Reconciled</span></div>
      <div class="stat"><span class="stat-n">${p.pct}%</span><span class="stat-l">Inputs filled</span></div>
      ${LED ? `<div class="stat"><span class="stat-n" style="color:${fx.length ? 'var(--amber)' : 'var(--green)'}">${fx.length}</span><span class="stat-l">Forensic flags</span></div>` : ''}
    </div>

    ${majors.length >= blockAfter() && !cfgHidden('gates', 'reconcile') ? `<div class="gate"><h3>Assessment blocked</h3>
      <p style="font-size:12px;color:var(--t1);margin-bottom:8px">${majors.length} headline figures disagree with the arithmetic behind them. Radar will still produce the full analysis — revenue, forensics, runway, deal maths and the question list — but it will not publish a score against a data pack in this state.</p></div>` : ''}

    ${opt && opt.significant ? `<div class="gate optim"><h3>Every discrepancy points the same way</h3>
      <p style="font-size:12px;color:var(--t1)">${opt.k} of the ${opt.n} figures that disagree with the arithmetic flatter the company. If these were honest, random errors, the chance of at least that many leaning in its favour would be ${fmtProb(opt.p)}. That is a pattern in how the data pack was prepared, not a series of typos.</p></div>` : ''}

    ${majors.length ? `<div class="block-title">Material contradictions</div>${majors.map(card).join('')}` : ''}
    ${minors.length ? `<div class="block-title" style="margin-top:20px">Minor inconsistencies</div>${minors.map(card).join('')}` : ''}
    ${fx.length ? `<div class="block-title" style="margin-top:20px">Forensic signals in the customer ledger</div>${fx.map(f => `<div class="contra minor"><div class="contra-h"><strong>${esc(f.title)}</strong><span class="sev">${esc(f.stat)}</span></div><p>${esc(f.detail)}</p>${f.ask ? `<div class="ask">${esc(f.ask)}</div>` : ''}</div>`).join('')}` : ''}
    ${!checks.length ? `<div class="suppressed">No checks could run yet. The verification layer needs both the primitives and at least one figure in “What the company states” — or a customer ledger to test the form against.</div>` : ''}

    ${oks.length ? `<div class="block-title" style="margin-top:22px">Reconciled</div>
      <div class="tbl-wrap"><table class="ledger">
        <thead><tr><th>Check</th><th>Stated</th><th>Computed</th><th>Result</th></tr></thead>
        <tbody>${oks.map(c => `<tr><td>${esc(c.title)}</td><td class="m">${esc(c.stated)}</td><td class="m">${esc(c.computed)}</td><td style="color:var(--green)">${esc(c.delta)}</td></tr>`).join('')}</tbody>
      </table></div>` : ''}

    <div class="sec-nav">
      <button class="btn btn-ghost" onclick="jumpTo(lastVisibleSection())">Back to inputs</button>
      <div class="sec-nav-right">
        <button class="btn btn-primary" onclick="runAnalysis()">Generate report</button>
      </div>
    </div>`;
  showPage('verify');
}
/* Number of distinct check families in runChecks (stated-vs-computed, structural, ledger, series). */
const CHECK_COUNT = 29;

/* ═══════════════════════════════════════════════════════════════
   RUN — every engine, in order, then the report
   ═══════════════════════════════════════════════════════════════ */
function assessAll() {
  const { D, F } = derive();
  const checks = runChecks(D);
  const sc = scoreAll(D, checks);
  const hash = runHash();
  const LED = S.ledger ? ledgerAnalytics(S.ledger) : null;
  const proj = runProjections(D, hash);
  const deal = dealMath(D);
  const opt = optimismTest(checks);
  const patterns = detectPatterns({ D, checks, sc, LED, proj, deal, opt });
  const forensics = activeForensics(LED);
  const questions = buildQuestions(D, checks, sc, { patterns, forensics });
  const requests = buildDataRequests(D, checks, sc);
  const sens = sensitivity(D, checks, sc);
  const bench = benchmarkCompare(D, sc);
  const risk = riskMap({ sc, patterns, checks, forensics });
  return { D, F, checks, sc, hash, LED, proj, deal, opt, patterns, forensics, questions, requests, sens, bench, risk,
           at:new Date().toISOString() };
}

async function runAnalysis() {
  saveSec();
  showPage('loading');
  const steps = Array.from({ length:8 }, (_, i) => document.getElementById('ls-' + i));
  steps.forEach(s => s.className = 'ld-step');
  const box = document.getElementById('stream-box');
  const advance = i => { steps.forEach((s, j) => s.className = 'ld-step' + (j < i ? ' done' : j === i ? ' active' : '')); };
  const ai = aiReady();
  const wantsMemo = ai.ok && document.getElementById('memo-toggle') && document.getElementById('memo-toggle').checked;

  advance(0); await sleep(150);
  advance(1); await sleep(150);
  advance(2); await sleep(150);
  advance(3); await sleep(120);
  let R;
  try { R = assessAll(); }
  catch (e) { console.error(e); toast('Analysis failed: ' + e.message, 'err'); showPage('verify'); return; }
  advance(4); await sleep(150);
  advance(5); await sleep(120);
  advance(6);
  box.textContent = 'Deterministic pass complete. Rubric ' + R.sc.rubric + ' · run ' + R.hash
    + (R.proj.sim ? ` · ${R.proj.sim.N.toLocaleString('en-US')} simulated paths` : '');

  R.memo = null;
  if (wantsMemo) {
    advance(7);
    box.textContent = 'Drafting the memo narrative from the computed figures…';
    try { R.memo = await writeMemo(ai.provider, ai.key, R); }
    catch (e) { R.memo = null; toast('Memo draft failed: ' + e.message + ' The computed report is unaffected.', 'err'); }
  }
  steps.forEach(s => s.className = 'ld-step done');
  S.result = R;
  renderResult(R);
  showPage('result');
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function writeMemo(provider, key, R) {
  const { D, F, checks, sc, questions, proj, deal, patterns, LED } = R;
  const metricLines = Object.keys(D).filter(k => DLABEL[k]).map(k => `${DLABEL[k] || k}: ${dfmt(k, D[k])}  [${F[k]}]`).join('\n');
  const dimLines = sc.dimensions.map(d => `${d.label}: ${d.score == null ? 'not scored' : d.score + '/100'} (weight ${(d.weight * 100).toFixed(0)}%, coverage ${(d.coverage * 100).toFixed(0)}%)`).join('\n');
  const checkLines = checks.filter(c => c.sev !== 'ok').map(c => `[${c.sev}] ${c.title}: stated ${c.stated}, computed ${c.computed} — ${c.delta}`).join('\n');
  const gateLines = sc.gates.map(g => '- ' + g.title).join('\n') || 'none';
  const patLines = patterns.map(p => `[${p.sev}] ${p.title}: ${p.evidence.join('; ')}`).join('\n') || 'none';
  const sim = proj.sim, da = proj.da;
  const projLines = [
    da ? `Default-alive test at current growth and spend: ${da.alive ? 'ALIVE — profitable in ' + da.months + ' months' : 'DEAD — cash runs out in month ' + (da.deadAt || '?')}` : null,
    sim ? `Monte Carlo (${sim.N} paths, ${sim.H} months): P(reach ${money(sim.milestone)} ARR before cash-out) ${fmtProb(sim.pMilestone)}; P(cash-out first) ${fmtProb(sim.pDeath)}; median runway ${sim.runway.p50 > sim.H ? sim.H + '+ months' : sim.runway.p50 + ' months'}; capital needed to reach the milestone with buffer p50 ${sim.need50 == null ? 'n/a (bar not reached in horizon)' : money(sim.need50)}, p80 ${sim.need80 == null ? 'n/a (bar not reached in horizon)' : money(sim.need80)}` : null,
  ].filter(Boolean).join('\n') || 'not computed';
  const dealLines = deal ? `Post-money ${money(deal.P)}; our entry ownership ${deal.ownEntry != null ? fmtPct(deal.ownEntry * 100, 2) : 'n/a'}; ownership at exit ${deal.ownExit != null ? fmtPct(deal.ownExit * 100, 2) : 'n/a'}; effective pre-money ${money(deal.effPre)}; entry multiple ${fmtX(deal.entryMult)} ARR; exit needed to return the fund ${money(deal.fundReturner)}; ARR needed at the assumed exit multiple ${money(deal.arrForFund)}${deal.samShare != null ? ' = ' + fmtPct(deal.samShare) + ' of the serviceable market' : ''}` : 'no proposed terms entered';
  const ledLines = LED ? `Customer ledger: ${S.ledger.customers.length} customers, ${LED.months.length} months; ledger ARR ${money(LED.arrNow)}; cohort NRR ${fmtPct(LED.nrrCohort)}, waterfall NRR ${fmtPct(LED.nrrFlow)}, GRR ${fmtPct(LED.grrCohort)}; top-5 concentration ${fmtPct(LED.top5)}; forensic flags: ${activeForensics(LED).filter(f => f.status === 'warn' || f.status === 'fail').map(f => f.title).join(', ') || 'none'}` : 'no customer ledger supplied';

  const SYSTEM = `You are a venture investor writing the narrative section of an investment committee memo. You are given figures that have already been computed by a deterministic engine. You do not recompute, re-score or contradict them, and you never invent a number that is not in the input. You write in plain, unhedged English, in complete paragraphs, without headers or bullet points. You do not open with a summary of your instructions.`;

  const PROMPT = `Write the narrative for an IC memo on ${S.name}, a ${modelLabel(S.model)} company at ${STAGES.find(s => s.id === S.stage).n}.

Write exactly six paragraphs, no headings:
1. What the business is doing, in numbers, and whether the trajectory holds up.
2. Revenue quality and retention, using the computed and ledger figures rather than the stated ones, and saying plainly where they differ.
3. Capital efficiency, what the runway actually supports, and what the simulation says about reaching the next milestone.
4. Go-to-market and whether the motion looks repeatable at this scale.
5. The deal: what the terms mean for ownership and whether a realistic outcome can matter to the fund.
6. What would have to be true for this to work, and the single thing that would most change the view.

Constraints:
- Use only the figures below. If a figure is absent, say the evidence is not there rather than estimating.
- Where a metric is marked "not scored", explain that it is below the sample size where it carries signal. Do not treat it as bad news.
- Do not state a verdict, a recommendation, or a score. The engine owns those.

COMPUTED METRICS
${metricLines}

DIMENSION SCORES (deterministic, rubric ${sc.rubric})
${dimLines}
Overall: ${sc.overall == null ? 'not computed' : sc.overall + '/100, band ' + sc.band[0] + '–' + sc.band[1] + ', confidence ' + sc.confidence}

GATES
${gateLines}

STATED VS COMPUTED
${checkLines || 'no contradictions found'}

CUSTOMER LEDGER
${ledLines}

RISK PATTERNS
${patLines}

PROJECTIONS
${projLines}

DEAL
${dealLines}

SUPPRESSED AT THIS SCALE
${Object.entries(sc.suppressed).map(([k, r]) => `${DLABEL[k] || k}: ${r}`).join('\n') || 'none'}`;

  const out = await callModel(provider, key, SYSTEM, PROMPT, 5000);
  return String(out).trim();
}

/* Report rendering, exports and boot live in report.js, exports.js and boot.js. */
