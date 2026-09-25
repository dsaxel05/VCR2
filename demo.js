
/* ═══════════════════════════════════════════════════════════════
   WORKED EXAMPLES — two fictional companies, generated deterministically.
   Northwind Data: a Series A data pack with problems planted in it.
   Halcyon Labs: a clean seed-stage AI application that earns a score.
   Neither company exists; every figure is synthetic.
   ═══════════════════════════════════════════════════════════════ */

/* Build a customer ledger from a compact spec. Integer-only PRNG, so every browser generates the same file. */
function genLedger(spec) {
  const rand = mulberry32(spec.seed);
  const T = spec.months, start = spec.start;
  const months = Array.from({ length:T }, (_, k) => monthAdd(start, k));
  const pick = (lo, hi) => lo + (hi - lo) * rand();
  const names = spec.names.slice();
  let ni = 0;
  const nextName = () => names[ni++ % names.length] + (ni > names.length ? ' ' + (Math.floor((ni - 1) / names.length) + 1) : '');
  const customers = [];
  const mk = (s, m0, churnP, expP, big) => {
    const mrr = Array(T).fill(0); let v = m0, alive = true;
    for (let t = s; t < T; t++) {
      if (!alive) break;
      if (t > s) {
        const r = rand();
        if (r < churnP(t, s)) { alive = false; break; }
        const e = rand();
        if (e < expP) v = v * pick(1.08, big ? 1.45 : 1.3);
        else if (e < expP + spec.conP) v = v * pick(0.7, 0.92);
      }
      mrr[t] = Math.round(v / 10) * 10;
    }
    return mrr;
  };
  /* Installed base at month 0 */
  for (let i = 0; i < spec.base; i++) customers.push({ name:nextName(), mrr:mk(0, spec.size() * pick(0.6, 1.4), spec.churn, spec.exp, i < (spec.bigFirst || 0)) });
  /* New logos each month */
  for (let t = 1; t < T; t++) {
    const n = spec.newPerMonth(t, rand);
    for (let k = 0; k < n; k++) customers.push({ name:nextName(), mrr:mk(t, spec.size() * pick(0.5, 1.5), spec.churn, spec.exp, false) });
  }
  (spec.extra || []).forEach(x => customers.push({ name:x.name, mrr:months.map((m, t) => x.f(t, T)) }));
  if (spec.post) spec.post(customers, months, rand);
  if (spec.scale) customers.forEach(c => { c.mrr = c.mrr.map(v => Math.round(v * spec.scale / 10) * 10); });
  return { months, customers:customers.filter(c => c.mrr.some(v => v > 0)), unit:'mrr' };
}
const DEMO_NAMES = ['Arcadia Freight','Bellweather Health','Cobalt Mills','Dunmore Retail','Everly Bank','Foxglove Media','Granite Payroll','Harbor Clinics','Ironside Energy','Juniper Foods',
  'Kestrel Air','Lumen Schools','Marlow Insurance','Northgate Hotels','Orchard Pharma','Pioneer Water','Quarry Labs','Redwood Transit','Sable Mining','Tidewater Ports',
  'Umber Studios','Vantage Realty','Willow Care','Xenon Chemicals','Yardley Legal','Zephyr Telecom','Alder Robotics','Birch Capital','Cedar Logistics','Delta Dental Group',
  'Elm Street Bank','Fjord Seafood','Garnet Security','Heron Aerospace','Indigo Apparel','Jasper Hospitals','Kinetic Motors','Larkspur Hotels','Meridian Utilities','Nimbus Cloud',
  'Onyx Fitness','Pinnacle Title','Quill Publishing','Rook Games','Saffron Restaurants','Talon Defense','Upland Farms','Vireo Wireless','Wrenfield Council','Yew Tree Homes',
  'Zircon Glass','Amberline Rail','Bluecrest Credit','Copperleaf Dental','Driftwood Resorts','Emberly Candles','Fairhaven Senior Living','Goldfinch Payments','Hollis Manufacturing','Ivory Tower Press',
  'Jubilee Events','Keystone Builders','Lodestar Mapping','Mosaic Tiles','Nettle Organics','Oakridge Schools','Palisade Storage','Quantum Lenders','Riverbend Vets','Sterling Brokers',
  'Thistle Tea','Unity Credit Union','Verdant Garden','Waypoint Couriers','Xylo Instruments','Yarrow Wellness','Zenith Optics','Aspen Clinics','Bramble Bakeries','Crescent Bank',
  'Dovetail Joinery','Elmstead Water','Fenwick Retail','Galloway Energy','Hartwell Logistics','Islington Housing','Juno Biotech','Kingfisher Travel','Linden Care','Maple Leaf Foods',
  'Norbury Metals','Oxbow Outfitters','Penrose Labs','Quayside Marine','Rosewood Hotels','Stonebridge Law','Trentham Motors','Umberleigh Mills','Valemount Resorts','Westbrook Health'];

function northwindLedger() {
  return genLedger({
    seed:4242, start:'2024-09', months:24, base:34, names:DEMO_NAMES, conP:0.02, scale:1.19,
    size:() => 1900,
    churn:(t, s) => s >= 12 ? 0.03 : s >= 6 ? 0.012 : 0.008,
    exp:0.07,
    newPerMonth:(t, r) => (t % 3 === 0 ? 3 : 2) + (r() < 0.2 ? 1 : 0),
    extra:[
      { name:'Harrowgate Energy',      f:(t) => t >= 2 ? 21000 + (t - 2) * 900 : 0 },
      { name:'Everly Bank',            f:(t) => 11000 + Math.floor(t / 4) * 1500 },
      { name:'Portland Civic',         f:(t) => t >= 5 ? 8000 + Math.floor(t / 6) * 700 : 0 },
      { name:'Kestrel Air',            f:(t) => t >= 4 && t < 20 ? 7400 : 0 },
      { name:'Tidewater Ports',        f:(t) => t >= 9 ? 6200 : 0 },
      { name:'Acme Logistics Inc',     f:(t) => t >= 14 ? 5200 : 0 },
      { name:'ACME Logistics',         f:(t) => t >= 15 ? 4800 : 0 },
      { name:'Brightline (pilot)',     f:(t) => t === 9 ? 6000 : 0 },
      { name:'Corvid Analytics',       f:(t) => t === 13 ? 7500 : 0 },
      { name:'Solstice Group',         f:(t) => t === 17 ? 5400 : 0 },
      { name:'Titan Freight',          f:(t, T) => t === T - 1 ? 15000 : 0 },
      { name:'Meridian Health System', f:(t, T) => t === T - 1 ? 11500 : 0 },
      { name:'Global Parcel Co',       f:(t, T) => t === T - 1 ? 9000 : 0 },
    ],
    post:(C) => {
      /* Two one-off true-ups booked as MRR. */
      [3, 7].forEach((i, k) => { const c = C[i]; const t = 10 + k * 4; if (c && c.mrr[t] > 0 && c.mrr[t - 1] > 0) c.mrr[t] = c.mrr[t - 1] * 4; });
    },
  });
}
function halcyonLedger() {
  return genLedger({
    seed:777, start:'2025-03', months:18, base:18, names:DEMO_NAMES.slice(40).concat(DEMO_NAMES.slice(0, 40)), conP:0.012,
    size:() => 2000,
    churn:() => 0.005,
    exp:0.085,
    newPerMonth:(t, r) => 2 + (r() < 0.15 ? 1 : 0),
  });
}
function demoSeries(LED, spec) {
  const T = LED.months.length, rows = [];
  let cash = spec.cashEnd;
  const burn = LED.months.map((_, t) => Math.round(spec.burn0 + (spec.burn1 - spec.burn0) * t / (T - 1) + (t % 3 === 0 ? 9000 : -4000)));
  const cashArr = Array(T).fill(0);
  cashArr[T - 1] = cash;
  for (let t = T - 2; t >= 0; t--) { cashArr[t] = cashArr[t + 1] + burn[t + 1] - (spec.raiseAt === t + 1 ? spec.raise : 0); }
  const hc = LED.months.map((_, t) => Math.round(spec.hc0 + (spec.hc1 - spec.hc0) * t / (T - 1)));
  LED.months.forEach((m, t) => rows.push([m, Math.round(LED.mrr[t]), Math.round(cashArr[t]), burn[t], Math.round(burn[t] + LED.mrr[t]), hc[t]].join(',')));
  return 'month,revenue,cash,burn,expenses,headcount\n' + rows.join('\n');
}

function ledgerFromSpec(g) {
  const csv = ['customer,' + g.months.join(','), ...g.customers.map(c => '"' + c.name + '",' + c.mrr.join(','))].join('\n');
  return parseLedger(csv, 'mrr').ledger;
}

function loadDemo(which) {
  which = which || 'northwind';
  S = blankState();
  if (which === 'halcyon') loadHalcyon(); else loadNorthwind();
  document.getElementById('cname').value = S.name;
  document.getElementById('asof').value = S.asof;
  buildStages(); buildTypes(); buildNav(); renderIntakeStatus(); updateProgress(); saveDraft();
  startSections();
  toast(which === 'halcyon' ? 'Clean example loaded: every figure reconciles, so it earns a score.' : 'Messy example loaded. It contains deliberate inconsistencies and ledger anomalies.');
}

function loadNorthwind() {
  S.name = 'Northwind Data'; S.stage = 'a'; S.model = 'saas'; S.asof = '2026-08';
  S.ledger = ledgerFromSpec(northwindLedger());
  const L = ledgerAnalytics(S.ledger), P = ledgerPrimitives(L);
  S.series = parseSeries(demoSeries(L, { cashEnd:6100000, burn0:215000, burn1:318000, raiseAt:8, raise:8500000, hc0:24, hc1:39 })).series;
  const r = v => String(Math.round(v)), r1 = v => String(Math.round(v * 10) / 10);
  S.vals = {
    /* The company's financial summary: mostly the ledger's numbers, but a higher headline ARR. */
    arr_now:'4200000', arr_12mo:r(P.arr_12mo), new_arr_l12:r(P.new_arr_l12), expansion_arr_l12:r(P.expansion_arr_l12),
    churned_arr_l12:r(P.churned_arr_l12), contraction_arr_l12:r(P.contraction_arr_l12), gross_margin:'71',
    cogs_hosting:'620000', cogs_support:'540000', services_pct:'11', pct_annual:'44',
    deferred_revenue:'900000', ar_over_90:'310000',
    cash_on_hand:'6100000', net_burn:'310000', total_raised:'14500000', pre_money:'42000000',
    safes_outstanding:'2600000', debt_outstanding:'1500000', months_since_round:'16',
    customers_now:r(P.customers_now), customers_12mo:r(P.customers_12mo), logos_lost_l12:r(P.logos_lost_l12),
    top1_pct:r1(P.top1_pct), top5_pct:r1(P.top5_pct), top10_pct:r1(P.top10_pct),
    sm_spend_l12:'2900000', new_customers_l12:'36', sm_spend_prior_q:'790000', new_arr_prior_q:'430000',
    win_rate:'34', sales_cycle:'74', pipeline_coverage:'2.8', quota_attainment:'46', pct_paid:'58',
    headcount_now:'39', headcount_12mo:'28', headcount_eng:'17', headcount_sales:'11',
    avg_loaded_comp:'178000', founders_count:'2', founder_max_equity:'74', founder_domain_years:'6',
    eng_departures_l12:'4', seat_util:'52', gm_12mo:'69', usage_based_pct:'12',
    target_accounts:'6200', reachable_pct:'9', primary_competitor:'Kestrel Analytics', win_rate_vs_primary:'38',
    liq_pref:'1', option_pool:'6', uptime_90d:'99.72', p1_incidents:'3',
    stated_arr:'4900000', stated_growth:'92', stated_nrr:'134', stated_grr:'91',
    stated_runway:'24', stated_rule40:'52', stated_cac:'54000', stated_cac_payback:'14',
    stated_ltv_cac:'4.8', stated_acv:'56000', stated_tam:'11000000000', stated_burn_multiple:'1.6', stated_customers:'104',
    round_size:'15000000', round_pre_money:'60000000', our_check:'7000000', pool_target_post:'12', new_liq_pref:'1',
    prior_investor_pct:'38', safe_cap:'30000000', safe_discount:'20', fund_size:'250000000',
    exit_multiple_assumption:'8', future_rounds:'2', dilution_per_round:'20',
    gross_burn:'560000', founders_years_together:'4', patents:'0', nps:'31',
    why_now:'Mid-market data teams moved to cloud warehouses in the last three years, and the governance tooling built for on-premise stacks does not follow them.',
  };
  S.bools = {
    prior_exit:false, founder_departed:true, ip_assignments:false, contractor_ip:false,
    chain_title:true, captable_documented:true, participating:false, founder_vesting:true,
    litigation:false, infra_single_vendor:true, model_single_vendor:false, dpas_signed:true,
    regulated_market:false, new_participating:false,
    technical_founder:true, taxes_current:true, funds_separate:true, valuation_409a:false, insurance_dno:true, oss_reviewed:false,
    cumulative_dividends:false, redemption_rights:false, pay_to_play:false, pro_rata_rights:true, information_rights:true, board_seat:true,
  };
  S.sel = { soc2:'In progress', audited_financials:'Reviewed', pricing_move:'Discounted to win', switching_cost:'Medium — some migration effort',
    moat_type:'High switching costs', mission_critical:'Important — painful to replace', anti_dilution:'Broad-based weighted average',
    board_after:'Balanced, with an independent director' };
  ['arr_now','arr_12mo','new_arr_l12','expansion_arr_l12','churned_arr_l12','contraction_arr_l12','customers_now','customers_12mo','logos_lost_l12','top1_pct','top5_pct','top10_pct','cash_on_hand','net_burn']
    .forEach(k => S.evid[k] = 'model');
  ['total_raised','pre_money','safes_outstanding'].forEach(k => S.evid[k] = 'export');
}

function loadHalcyon() {
  S.name = 'Halcyon Labs'; S.stage = 'seed'; S.model = 'ai_app'; S.asof = '2026-08';
  S.ledger = ledgerFromSpec(halcyonLedger());
  const L = ledgerAnalytics(S.ledger), P = ledgerPrimitives(L);
  S.series = parseSeries(demoSeries(L, { cashEnd:5200000, burn0:120000, burn1:150000, raiseAt:4, raise:4000000, hc0:9, hc1:16 })).series;
  const arr = P.arr_now, cust = P.customers_now, acv = arr / cust;
  const gm = 74, nc = 30, cac = 24000, smL12 = nc * cac;
  const lr = P.logos_lost_l12 / P.customers_12mo;
  const r = v => String(Math.round(v)), r1 = v => String(Math.round(v * 10) / 10);
  S.vals = {
    arr_now:r(arr), arr_12mo:r(P.arr_12mo), new_arr_l12:r(P.new_arr_l12), expansion_arr_l12:r(P.expansion_arr_l12),
    churned_arr_l12:r(P.churned_arr_l12), contraction_arr_l12:r(P.contraction_arr_l12), gross_margin:String(gm),
    cogs_hosting:r(arr * 0.19), cogs_support:r(arr * 0.07), services_pct:'4', pct_annual:'82',
    deferred_revenue:r(arr * 0.35), ar_over_90:r(arr * 0.015),
    cash_on_hand:'5200000', net_burn:'148000', total_raised:'6500000', pre_money:'18000000',
    safes_outstanding:'1500000', months_since_round:'13',
    customers_now:r(cust), customers_12mo:r(P.customers_12mo), logos_lost_l12:r(P.logos_lost_l12),
    top1_pct:r1(P.top1_pct), top5_pct:r1(P.top5_pct), top10_pct:r1(P.top10_pct),
    sm_spend_l12:r(smL12), new_customers_l12:String(nc), sm_spend_prior_q:'205000', new_arr_prior_q:r((L.mrr[L.e] - L.mrr[L.e - 3]) * 12),
    win_rate:'31', sales_cycle:'38', pipeline_coverage:'3.6', pct_paid:'22',
    headcount_now:'16', headcount_12mo:'10', headcount_eng:'9', headcount_sales:'3',
    avg_loaded_comp:'170000', founders_count:'3', founder_max_equity:'36', founder_domain_years:'8',
    eng_departures_l12:'0', seat_util:'81', usage_based_pct:'35', inference_pct:'17', gm_12mo:'63', top_model_share:'55',
    target_accounts:'90000', reachable_pct:'12', primary_competitor:'Incumbent suite add-on', win_rate_vs_primary:'57',
    liq_pref:'1', option_pool:'7', uptime_90d:'99.93', p1_incidents:'1',
    stated_arr:r(arr * 1.01), stated_growth:r1((arr / P.arr_12mo - 1) * 100), stated_nrr:r1(L.nrrCohort + 1), stated_grr:r1(L.grrCohort),
    stated_runway:r1(5200000 / 148000), stated_cac:r(cac * 1.05), stated_acv:r(acv), stated_customers:r(cust),
    stated_ltv_cac:r1((acv * gm / 100) / Math.max(0.02, lr) / cac), stated_cac_payback:r1(cac / (acv * gm / 100 / 12)),
    round_size:'8000000', round_pre_money:'32000000', our_check:'4000000', pool_target_post:'10', new_liq_pref:'1',
    prior_investor_pct:'24', safe_cap:'20000000', safe_discount:'20', fund_size:'150000000',
    exit_multiple_assumption:'12', future_rounds:'3', dilution_per_round:'20',
    gross_burn:r(148000 + arr / 12), founders_years_together:'3', patents:'1', nps:'52', pmf_very_disappointed:'46', pmf_respondents:'112',
    why_now:'Frontier models made document reasoning reliable enough for regulated workflows in the last eighteen months, while the cost per task fell by an order of magnitude.',
  };
  S.bools = {
    prior_exit:true, founder_departed:false, ip_assignments:true, contractor_ip:false, chain_title:true, captable_documented:true,
    participating:false, founder_vesting:true, litigation:false, infra_single_vendor:false, model_single_vendor:false, dpas_signed:true,
    proprietary_data:true, regulated_market:false, new_participating:false,
    technical_founder:true, taxes_current:true, funds_separate:true, valuation_409a:true, oss_reviewed:true,
    cumulative_dividends:false, redemption_rights:false, pay_to_play:false, pro_rata_rights:true, information_rights:true, board_seat:true,
  };
  S.sel = { soc2:'Type I', audited_financials:'Reviewed', pricing_move:'Raised prices', switching_cost:'High — data or workflow lock-in',
    moat_type:'Proprietary data', mission_critical:'Mission-critical — work stops without it', anti_dilution:'Broad-based weighted average',
    board_after:'Founders control the board' };
  applyLedgerToForm(['arr_now','arr_12mo','new_arr_l12','expansion_arr_l12','churned_arr_l12','contraction_arr_l12','customers_now','customers_12mo','logos_lost_l12','top1_pct','top5_pct','top10_pct']);
  ['cash_on_hand','net_burn','total_raised','pre_money','safes_outstanding'].forEach(k => S.evid[k] = 'bank');
  ['gross_margin','cogs_hosting','cogs_support','sm_spend_l12','new_customers_l12','headcount_now','headcount_12mo'].forEach(k => S.evid[k] = 'model');
}
