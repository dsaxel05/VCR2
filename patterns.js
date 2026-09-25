
/* ═══════════════════════════════════════════════════════════════
   PATTERN LIBRARY — compound signals an experienced partner looks for.
   Each pattern combines several metrics; a single metric never fires one.
   ═══════════════════════════════════════════════════════════════ */

/* Every number that triggers a built-in pattern, with its default. The owner can change any of them
   in the Studio (Patterns → Triggers of built-in patterns); pp() reads the value in force. */
const PATTERN_PARAMS = {
  optimism:{ label:'Systematic optimism', p:[['minN',4,'at least this many directional discrepancies',''],['alpha',5,'chance under honest error below','%']] },
  bought_growth:{ label:'Growth bought with paid acquisition', p:[['paid',50,'new ARR from paid channels above','%'],['payback',24,'and CAC payback above','months']] },
  leaky_bucket:{ label:'Leaky bucket', p:[['grr',80,'GRR below','%'],['grrRed',72,'risk (not watch) when GRR below','%'],['newShare',40,'and new ARR above this share of opening ARR','%']] },
  nrr_definition:{ label:'NRR inflated by new customers', p:[['gap',5,'waterfall NRR above cohort NRR by more than','pts']] },
  services:{ label:'Services wearing a software multiple', p:[['pct',20,'non-recurring revenue above','%'],['gm',62,'and gross margin below','%'],['pctRed',30,'risk when non-recurring above','%']] },
  fragile_concentration:{ label:'Concentrated revenue on short contracts', p:[['top5',45,'top 5 customers above','%'],['top1',15,'or largest customer above','%'],['annual',50,'and ARR on annual terms below','%']] },
  window_dressing:{ label:'Bookings spike before the raise', p:[['months',12,'risk when the last round was at least this many months ago','months']] },
  runway_cliff:{ label:'Raising from need', p:[['amber',12,'runway below','months'],['red',9,'risk when runway below','months']] },
  hiring_ahead:{ label:'Hiring ahead of revenue', p:[['burn',2.5,'headcount growth above ARR growth and burn multiple above','x']] },
  discount_wins:{ label:'Wins bought with price', p:[['win',28,'discounting to win and win rate above','%']] },
  cycle_mismatch:{ label:'Enterprise cycle, SMB price', p:[['days',90,'sales cycle above','days'],['acv',15000,'and ACV below','$']] },
  ai_margin:{ label:'AI margin trap', p:[['inf',35,'inference cost above this share of revenue','%'],['gm',55,'or gross margin below (with a single model vendor)','%'],['infRed',45,'risk when inference above','%']] },
  overhang:{ label:'SAFE and pool overhang', p:[['overhang',15,'SAFE and note overhang above','% of pre-money'],['pool',8,'and unallocated pool below','%']] },
  default_dead:{ label:'Default dead', p:[['runway',18,'flagged when runway is below','months']] },
  sim:{ label:'Odds of the next-stage bar', p:[['low',35,'risk when the odds are below','%'],['mid',60,'watch when below','%'],['high',75,'strength when above','%']] },
  cohort:{ label:'Cohort decay or improvement', p:[['amber',8,'newer cohorts retain worse by more than','pts'],['red',15,'risk when worse by more than','pts'],['improve',5,'strength when better by more than','pts']] },
  fund_math:{ label:'Fund-returner test', p:[['red',30,'risk when the exit needs more than this share of bottom-up TAM','%'],['amber',10,'watch when more than','%']] },
  founder_risk:{ label:'Key-person risk', p:[['conc',70,'a co-founder left and the largest founder holds more than','%']] },
  subsidised:{ label:'Subsidised liquidity', p:[['inc',10,'incentives above this share of GMV','%'],['repeat',30,'and repeat GMV below','%']] },
  loss_growth:{ label:'Losses with fast volume growth', p:[['loss',3,'loss rate above','%'],['growth',80,'and volume growth above','%']] },
  shelfware:{ label:'Shelfware expansion', p:[['util',55,'seat utilisation below','%'],['nrr',105,'and NRR above','%']] },
  stage_mismatch:{ label:'Stage mismatch', p:[['over',2.5,'ARR above the stage range by more than','x'],['under',3,'or below it by more than','x']] },
  efficient:{ label:'Efficient growth', p:[['burn',1.5,'burn multiple below','x'],['nrr',110,'NRR above','%'],['grr',88,'GRR above','%']] },
  capital_light:{ label:'Capital-light growth', p:[['hype',2.5,'capital raised per $1 of ARR below','x'],['growth',80,'and growth above','%']] },
  clean_books:{ label:'Clean books', p:[['minChecks',6,'at least this many checks, all reconciling','']] },
  price_return:{ label:'Price vs target return', p:[['redMoic',1.5,'risk (not watch) when the probability-weighted multiple is below','x']] },
  weak_pmf:{ label:'Product-market fit', p:[['red',25,'risk when “very disappointed” is below','%'],['bar',40,'the fit bar (strength at or above)','%']] },
  nice_to_have:{ label:'Discretionary product', p:[['grr',85,'risk when GRR is below','%']] },
  new_team:{ label:'New founding team', p:[['years',1,'founders have worked together for less than','years']] },
  terms:{ label:'Term-sheet review (Round & returns)', p:[['pref',1,'liquidation preference is off-market above','x'],['seat',10,'a board or observer seat is expected from this ownership','%'],
    ['pool',5,'option-pool top-up in the pre-money flagged above','% of post-money'],['conv',12,'SAFE and note conversion flagged above','% of post-money']] },
};
function pp(id, key) {
  const o = CFG.patternParams && CFG.patternParams[id];
  if (o && o[key] != null && isFinite(+o[key])) return +o[key];
  const d = PATTERN_PARAMS[id] && PATTERN_PARAMS[id].p.find(x => x[0] === key);
  return d ? d[1] : null;
}

/* If the stated-vs-computed errors were honest noise, about half would flatter
   the company. A lopsided split is itself a finding. */
function optimismTest(checks) {
  const dir = checks.filter(c => c.sev !== 'ok' && typeof c.flatter === 'boolean');
  const n = dir.length, k = dir.filter(c => c.flatter).length;
  if (n < 3) return n ? { n, k, p:null, significant:false } : null;
  const p = binomTail(n, k, 0.5);
  return { n, k, p, significant: n >= pp('optimism', 'minN') && p < pp('optimism', 'alpha') / 100 };
}

function detectPatterns(ctx) {
  const { D, checks, LED, proj, deal, opt } = ctx;
  const out = [];
  const v = k => D[k] != null && isFinite(D[k]) ? D[k] : null;
  const f = id => gv(id);
  const add = (sev, id, title, evidence, why, ask) => out.push({ sev, id, title, evidence:evidence.filter(Boolean), why, ask });
  const fx = id => activeForensics(LED).find(x => x.id === id) || null;
  const sim = proj && proj.sim, da = proj && proj.da;

  if (opt && opt.significant)
    add('red', 'optimism', 'Systematic optimism in the data pack',
      [`${opt.k} of ${opt.n} discrepancies flatter the company`, `chance under honest error: ${fmtProb(opt.p)}`],
      'Random mistakes point both ways. When nearly all of them improve the story, the definitions were chosen, not stumbled into.',
      'Can the finance lead walk us through how each headline metric in the deck is defined and calculated, against the underlying data?');

  if (v('pct_paid') > pp('bought_growth', 'paid') && v('cac_payback') > pp('bought_growth', 'payback'))
    add('red', 'bought_growth', 'Growth bought with paid acquisition',
      [`${fmtPct(v('pct_paid'), 0)} of new ARR from paid channels`, `CAC payback ${fmtMo(v('cac_payback'))}`, v('magic_number') != null ? `magic number ${numv(v('magic_number'))}` : null],
      'When most growth is bought and each customer takes two years to pay back, growth stops the month the budget does.',
      'What happens to new ARR if paid spend is cut by half for a quarter? Is there organic or referral demand underneath?');

  const arr0 = f('arr_12mo'), nw = f('new_arr_l12');
  if (v('grr') != null && v('grr') < pp('leaky_bucket', 'grr') && arr0 > 0 && nw != null && nw > arr0 * pp('leaky_bucket', 'newShare') / 100)
    add(v('grr') < pp('leaky_bucket', 'grrRed') ? 'red' : 'amber', 'leaky_bucket', 'Growth poured into a leaking bucket',
      [`GRR ${fmtPct(v('grr'))}`, `new ARR equal to ${fmtPct(nw / arr0 * 100, 0)} of opening ARR`],
      'Strong acquisition is masking weak retention. At scale, churn grows with the base while new-logo capacity does not.',
      'Which customer segments churn, at what age, and for what stated reason? Please share the churn log with exit reasons.');

  if (LED && LED.nrrFlow != null && LED.nrrCohort != null && LED.nrrFlow - LED.nrrCohort > pp('nrr_definition', 'gap'))
    add('amber', 'nrr_definition', 'Expansion comes from this year’s customers, not the installed base',
      [`waterfall NRR ${fmtPct(LED.nrrFlow)}`, `cohort NRR ${fmtPct(LED.nrrCohort)}`, `${money(LED.expFromNew * 12)} of expansion ARR from customers acquired during the year`],
      'A waterfall-style NRR counts upsell of customers who were not in the base a year ago. The cohort figure is the one that predicts the installed base.',
      'Which NRR definition is used in the deck, and what is it on a strict twelve-month cohort basis?');

  if (v('services_pct') > pp('services', 'pct') && v('gross_margin') != null && v('gross_margin') < pp('services', 'gm'))
    add(v('services_pct') > pp('services', 'pctRed') ? 'red' : 'amber', 'services', 'Services business wearing a software multiple',
      [`${fmtPct(v('services_pct'), 0)} non-recurring revenue`, `gross margin ${fmtPct(v('gross_margin'))}`],
      'Implementation-heavy revenue with software-level valuation expectations compresses at every future round.',
      'What does gross margin look like on subscription revenue alone, and is services revenue shrinking as a share?');

  const annual = f('pct_annual');
  if ((v('top5_conc') > pp('fragile_concentration', 'top5') || f('top1_pct') > pp('fragile_concentration', 'top1')) && annual != null && annual < pp('fragile_concentration', 'annual'))
    add('red', 'fragile_concentration', 'Concentrated revenue on short contracts',
      [f('top1_pct') != null ? `largest customer ${fmtPct(f('top1_pct'), 0)} of ARR` : null, v('top5_conc') != null ? `top five ${fmtPct(v('top5_conc'), 0)}` : null, `only ${fmtPct(annual, 0)} on annual terms`],
      'A handful of customers can leave on thirty days’ notice. One decision in someone else’s budget meeting moves the whole company.',
      'What are the notice periods and renewal dates for the top five customers, and who owns each relationship?');

  const spike = fx('final_spike');
  if (spike && (spike.status === 'warn' || spike.status === 'fail'))
    add(f('months_since_round') >= pp('window_dressing', 'months') ? 'red' : 'amber', 'window_dressing', 'Bookings spike right before the raise',
      [spike.stat, f('months_since_round') != null ? `${f('months_since_round')} months since the last round` : null],
      'A record month landing just as the company goes out to raise is the most common place for pulled-forward or discounted deals to hide.',
      spike.ask);

  if (v('runway') != null && v('runway') < pp('runway_cliff', 'amber'))
    add(v('runway') < pp('runway_cliff', 'red') ? 'red' : 'amber', 'runway_cliff', 'Raising from a position of need',
      [`runway ${fmtMo(v('runway'))}`, D._cashOut ? `cash-out around ${monthLabel(D._cashOut)}` : null, f('months_since_round') != null ? `${f('months_since_round')} months since the last round` : null],
      'Under nine to twelve months of cash, the company negotiates against its own deadline — which shows up in terms, and in how numbers are presented.',
      'What is the plan if this round takes six months longer than expected? Which costs come out first?');

  if (v('headcount_growth') != null && v('growth_yoy') != null && v('headcount_growth') > v('growth_yoy') && v('burn_multiple') > pp('hiring_ahead', 'burn'))
    add('amber', 'hiring_ahead', 'Hiring ahead of revenue',
      [`headcount +${fmtPct(v('headcount_growth'), 0)}`, `ARR +${fmtPct(v('growth_yoy'), 0)}`, `burn multiple ${numv(v('burn_multiple'))}`],
      'Team growth outpacing revenue growth with a high burn multiple means the plan is being funded before it is proven.',
      'Which of the last twelve months’ hires were revenue-generating, and what were they expected to deliver by now?');

  if (gs('pricing_move') === 'Discounted to win' && v('win_rate') > pp('discount_wins', 'win'))
    add('amber', 'discount_wins', 'Wins bought with price',
      [`win rate ${fmtPct(v('win_rate'), 0)}`, 'last pricing action: discounted to win'],
      'A high win rate that depends on discounting says more about price than about product. It also caps expansion.',
      'What was the average discount on deals won in the last two quarters, and how does it compare with deals lost?');

  if (v('sales_cycle') > pp('cycle_mismatch', 'days') && v('acv') != null && v('acv') < pp('cycle_mismatch', 'acv'))
    add('amber', 'cycle_mismatch', 'Enterprise sales cycle, small-business price',
      [`median cycle ${Math.round(v('sales_cycle'))} days`, `ACV ${money(v('acv'))}`],
      'Long, sales-led cycles on small contracts rarely recover their acquisition cost. Either price moves up or the motion moves to self-serve.',
      'Where does the time go in the sales cycle, and has self-serve or product-led conversion been tested?');

  if (S.model === 'ai_app' && (v('inference_pct') > pp('ai_margin', 'inf') || (v('gross_margin') != null && v('gross_margin') < pp('ai_margin', 'gm') && gb('model_single_vendor') === true)))
    add((v('gm_trend') != null && v('gm_trend') < 0) || v('inference_pct') > pp('ai_margin', 'infRed') ? 'red' : 'amber', 'ai_margin', 'Model-provider margin trap',
      [v('inference_pct') != null ? `inference ${fmtPct(v('inference_pct'), 0)} of revenue` : null, v('gross_margin') != null ? `gross margin ${fmtPct(v('gross_margin'))}` : null,
       v('gm_trend') != null ? `margin trend ${fmtSigned(v('gm_trend'), 1, ' pts')}` : null, gb('model_single_vendor') === true ? 'single model provider' : null],
      'The largest cost line is set by a supplier who can also become a competitor. Margins need a visible path up through routing, caching, fine-tuned or smaller models.',
      'What is the cost per task today versus six months ago, and what is the plan to bring inference below a quarter of revenue?');

  if (v('safe_overhang') > pp('overhang', 'overhang') && f('option_pool') != null && f('option_pool') < pp('overhang', 'pool'))
    add('amber', 'overhang', 'Next round will be expensive for founders',
      [`SAFE overhang ${fmtPct(v('safe_overhang'), 0)} of pre-money`, `unallocated pool ${fmtPct(f('option_pool'), 0)}`],
      'Converting SAFEs plus a pool top-up both come out of the pre-money. Founders absorb both at once.',
      'Have the founders modelled their stake after SAFE conversion and a pool top-up to 10%?');

  if (da && !da.alive && v('runway') != null && v('runway') < pp('default_dead', 'runway'))
    add('red', 'default_dead', 'Default dead at the current trajectory',
      [da.deadAt ? `cash runs out in month ${da.deadAt}` : 'expenses never cross revenue', da.needed != null ? `${money(da.needed)} more needed to reach breakeven at this growth` : null],
      'At today’s growth and spend, revenue does not overtake expenses before the money runs out. The company depends on this round, and on the next one.',
      'What is the path to default-alive if no further capital were raised after this round?');
  else if (da && da.alive)
    add('green', 'default_alive', 'Default alive',
      [`revenue overtakes expenses in ${da.months} months at current growth`, `lowest cash ${money(da.low)}`],
      'On today’s growth and spend, the company reaches breakeven with the cash it has.', null);

  if (sim && sim.milestone) {
    const pm = sim.pMilestone;
    if (pm < pp('sim', 'low') / 100) add('red', 'sim_low', 'Unlikely to reach the next-stage bar on current cash',
      [`${fmtProb(pm)} of ${sim.N.toLocaleString('en-US')} simulated paths reach ${money(sim.milestone)} ARR before cash-out`,
       sim.need80 != null ? `capital needed at 80% confidence ${money(sim.need80)}` : `${fmtProb(sim.needShare)} reach it within ${sim.H} months even with unlimited capital`],
      'Even with growth volatility on its side, most futures run out of money first. The round size has to cover the gap.',
      'How does the round size compare with the capital the model says is needed to reach next-stage metrics with six months of buffer?');
    else if (pm < pp('sim', 'mid') / 100) add('amber', 'sim_mid', 'Coin-flip odds of reaching the next-stage bar',
      [`${fmtProb(pm)} of simulated paths reach ${money(sim.milestone)} ARR before cash-out`],
      'The outcome turns on execution in the next four quarters rather than on the current plan.', 'Which two levers — growth or burn — does management expect to move, and by how much?');
    else if (pm > pp('sim', 'high') / 100) add('green', 'sim_high', 'Funded to the next-stage bar',
      [`${fmtProb(pm)} of simulated paths reach ${money(sim.milestone)} ARR before cash-out`], 'Most simulated futures reach next-stage metrics on existing cash.', null);
  }

  if (LED && LED.cohortTrend && LED.cohortTrend.older != null && LED.cohortTrend.newer != null) {
    const ct = LED.cohortTrend, d = ct.newer - ct.older;
    if (d < -pp('cohort', 'amber')) add(d < -pp('cohort', 'red') ? 'red' : 'amber', 'cohort_decay', 'Newer customers retain worse than older ones',
      [`month-${ct.age} dollar retention: older cohorts ${fmtPct(ct.older, 0)}, newer ${fmtPct(ct.newer, 0)}`],
      'Recent customers are a worse fit than early ones. Headline retention still leans on the early base and will drift down as it becomes a smaller share.',
      'What changed in the ideal customer profile or acquisition channel for recent cohorts?');
    else if (d > pp('cohort', 'improve')) add('green', 'cohort_improve', 'Newer customers retain better than older ones',
      [`month-${ct.age} dollar retention: older cohorts ${fmtPct(ct.older, 0)}, newer ${fmtPct(ct.newer, 0)}`],
      'Product and targeting are improving; headline retention should rise as newer cohorts become the base.', null);
  }

  if (deal && deal.tamShare != null) {
    const ev = [`needs ${money(deal.arrForFund)} ARR at ${fmtX(deal.I.exitMult)}`, `${fmtPct(deal.tamShare, deal.tamShare < 10 ? 1 : 0)} of bottom-up TAM`,
      deal.samShare != null ? `${fmtPct(deal.samShare, 0)} of the market reachable in five years` : null];
    if (deal.tamShare > pp('fund_math', 'red')) add('red', 'fund_math', 'Cannot return the fund inside its own market', ev,
      'At this entry price and ownership, returning the fund requires owning an implausible share of the entire bottom-up market. The market has to be bigger than the account count says, or the price has to change.',
      'What adjacent segments or products expand the market beyond the current ideal customer profile, and on what evidence?');
    else if (deal.tamShare > pp('fund_math', 'amber')) add('amber', 'fund_math', 'Fund-returner case needs market leadership', ev,
      'Possible, but the case rests on becoming the category leader, not a participant.', 'What is the path from today’s ICP to a market large enough for the fund-returning outcome?');
    else add('green', 'fund_math', 'A fund-returning outcome fits inside the market', ev, 'The bottom-up market is large enough relative to the price and ownership.', null);
  }

  if (gb('founder_departed') === true && v('founder_conc') > pp('founder_risk', 'conc'))
    add('amber', 'founder_risk', 'Key-person concentration after a co-founder exit',
      ['a co-founder has left', `largest founder holds ${fmtPct(v('founder_conc'), 0)}`],
      'The company now depends on one person, and the departed founder’s equity may still be on the cap table.',
      'How was the departed co-founder’s equity handled, and who would run the company if the CEO stepped back?');

  if (S.model === 'marketplace' && v('incentives_pct') > pp('subsidised', 'inc') && v('repeat_pct') != null && v('repeat_pct') < pp('subsidised', 'repeat'))
    add('red', 'subsidised', 'Liquidity bought with subsidies',
      [`incentives ${fmtPct(v('incentives_pct'), 0)} of GMV`, `repeat GMV ${fmtPct(v('repeat_pct'), 0)}`],
      'Buyers come for the discount and do not come back. GMV growth will not survive the incentive budget.',
      'What does GMV look like for cohorts acquired without incentives?');

  if (S.model === 'fintech' && v('loss_rate') > pp('loss_growth', 'loss') && v('volume_growth') > pp('loss_growth', 'growth'))
    add('red', 'loss_growth', 'Volume growth with elevated losses',
      [`loss rate ${fmtPct(v('loss_rate'), 1)}`, `volume +${fmtPct(v('volume_growth'), 0)}`],
      'Fast volume growth with high losses usually means underwriting was loosened to grow. Loss curves lag, so the current rate understates what is coming.',
      'Please share loss curves by origination vintage.');
  if (S.model === 'fintech' && gs('licence_model') === 'Sponsor or partner bank' && gb('regulatory_findings') === true)
    add('red', 'partner_bank', 'Partner-bank dependency with open findings',
      ['operates on a sponsor bank', 'open regulatory findings'],
      'The company’s right to operate sits with a partner who is under regulatory pressure.', 'What is the status of the findings, and is there a second sponsor bank in place?');

  if (v('seat_util') != null && v('seat_util') < pp('shelfware', 'util') && v('nrr') > pp('shelfware', 'nrr'))
    add('amber', 'shelfware', 'Expansion on under-used seats',
      [`seat utilisation ${fmtPct(v('seat_util'), 0)}`, `NRR ${fmtPct(v('nrr'))}`],
      'Customers are buying more than they use. That reverses at renewal, when procurement looks at utilisation.',
      'What is utilisation for the accounts renewing in the next two quarters?');

  const arr = f('arr_now'), st = STAGE_RANGE[S.stage];
  if (arr != null && st && ((st.hi && arr > st.hi * pp('stage_mismatch', 'over')) || (st.lo && arr < st.lo / pp('stage_mismatch', 'under'))))
    add('amber', 'stage_mismatch', 'Graded against the wrong stage?',
      [`ARR ${money(arr)}`, `${STAGES.find(x => x.id === S.stage).n} range ${STAGES.find(x => x.id === S.stage).s}`],
      'Stage sets every threshold. A company far outside the stage range is being held to the wrong bar.',
      null);

  if (v('burn_multiple') != null && v('burn_multiple') < pp('efficient', 'burn') && v('nrr') > pp('efficient', 'nrr') && v('grr') > pp('efficient', 'grr'))
    add('green', 'efficient', 'Efficient, compounding growth',
      [`burn multiple ${numv(v('burn_multiple'))}`, `NRR ${fmtPct(v('nrr'))}`, `GRR ${fmtPct(v('grr'))}`],
      'Low burn per dollar of new ARR with a base that grows on its own is the profile that compounds.', null);

  if (v('hype_ratio') != null && v('hype_ratio') < pp('capital_light', 'hype') && v('growth_yoy') > pp('capital_light', 'growth'))
    add('green', 'capital_light', 'Capital-light growth',
      [`${fmtX(v('hype_ratio'))} raised per dollar of ARR`, `growth ${fmtPct(v('growth_yoy'), 0)}`],
      'The company has built its ARR with little capital, which leaves room on the cap table and in the valuation.', null);

  /* — Term sheet — */
  if (deal && deal.terms) {
    const off = deal.terms.filter(t => t.flag === 'off');
    if (off.length) add(off.length >= 2 || off.some(t => t.term === 'Anti-dilution') ? 'red' : 'amber', 'offmarket_terms', 'Off-market terms on this round',
      off.map(t => `${t.term.toLowerCase()}: ${t.value}`),
      'Terms like these protect this round’s money but shift risk onto founders and every later investor — and they tend to be copied into each round that follows.',
      'Which of these terms are required, and would market-standard terms (1x non-participating, broad-based weighted-average anti-dilution) be acceptable at a different price?');
    const rights = deal.terms.filter(t => (t.term === 'Pro-rata rights' || t.term === 'Information rights') && t.flag !== 'ok');
    if (rights.length) add('amber', 'investor_rights', 'Standard investor rights are missing',
      rights.map(t => `${t.term.toLowerCase()}: ${t.value.toLowerCase()}`),
      'Without pro-rata we cannot keep our ownership in the winners; without information rights, monitoring depends on goodwill.',
      'Would the company grant pro-rata and information rights to the major investors in this round?');
  }
  if (deal && deal.returns && !deal.returns.missing) {
    const Rt = deal.returns, b = Rt.cases[2];
    const ev = [`success case ${fmtX(b.moic, 1)} in ${b.years} years (${fmtPct(b.irr, 0)} IRR) against a ${fmtPct(Rt.r, 0)} target`,
      `probability-weighted ${fmtX(Rt.expMoic, 1)}`, `VC Method post-money ${money(Rt.justifiedPost)} vs ${money(deal.P)} offered`];
    if (b.irr != null && b.irr < Rt.r) add(Rt.expMoic < pp('price_return', 'redMoic') ? 'red' : 'amber', 'price_return', 'The price does not clear the target return', ev,
      'Even if the company succeeds, this post-money earns less than the return the fund underwrites to. Either the exit has to be larger or the price lower.',
      'What gets the company to the exit that returns our target — which milestones, by when?');
    else if (b.irr != null) add('green', 'price_return', 'The success case clears the target return', ev,
      'If the company succeeds, the price leaves the return the power law needs.', null);
  }

  /* — Product-market fit, moat and team — */
  const pmf = v('pmf_score'), pmfN = f('pmf_respondents');
  if (pmf != null && pmfN != null && pmfN >= RUBRIC.minN.pmf_survey) {
    if (pmf < pp('weak_pmf', 'red')) add('red', 'weak_pmf', 'Product-market fit is not there yet',
      [`${fmtPct(pmf, 0)} “very disappointed” (${pmfN} responses)`, `the bar is ${pp('weak_pmf', 'bar')}%`],
      'Fewer than one in four users would miss the product. Growth bought before this number moves tends to churn.',
      'Which user segment answers “very disappointed” most often, and is the roadmap focused on it?');
    else if (pmf < pp('weak_pmf', 'bar')) add('amber', 'weak_pmf', 'Approaching product-market fit',
      [`${fmtPct(pmf, 0)} “very disappointed” (${pmfN} responses)`, `the bar is ${pp('weak_pmf', 'bar')}%`],
      'Close, but not yet the pull that makes growth cheap.', 'What would move the “very disappointed” share above the bar, and for which segment?');
    else add('green', 'strong_pmf', 'Clear product-market fit signal',
      [`${fmtPct(pmf, 0)} “very disappointed” (${pmfN} responses)`, v('nps') != null ? `NPS ${Math.round(v('nps'))}` : null],
      'Four in ten users or more would be very disappointed without the product — the threshold associated with durable demand.', null);
  }
  const crit = gs('mission_critical');
  if (crit && /^Nice to have/.test(crit))
    add(v('grr') != null && v('grr') < pp('nice_to_have', 'grr') ? 'red' : 'amber', 'nice_to_have', 'A discretionary product',
      ['customers describe it as nice to have', v('grr') != null ? `GRR ${fmtPct(v('grr'))}` : null],
      'Discretionary spend is the first line cut in a budget review, so retention depends on the customer’s economy rather than the product.',
      'What happens to usage and renewals when a customer’s budget is cut — do you have an example?');
  const moat = gs('moat_type');
  if (moat === 'None identified yet' && (S.stage === 'a' || S.stage === 'b'))
    add('amber', 'moat_unproven', 'No defensibility identified at scale',
      [`stage ${STAGES.find(x => x.id === S.stage).n}`, 'main source of defensibility: none identified'],
      'By this stage competitors know the market works. Without a moat, margins and growth converge to the competition’s.',
      'What stops a well-funded competitor from matching the product within a year?');
  else if (moat === 'Proprietary technology or patents' && f('patents') === 0 && gb('proprietary_data') !== true)
    add('amber', 'moat_unproven', 'Technology moat claimed but not evidenced',
      ['defensibility: proprietary technology', 'no patents filed or granted'],
      'A technology lead without patents or proprietary data lasts only as long as it takes a well-funded team to rebuild it.',
      'What would it take for a competitor to rebuild the core technology, and how long would it take them?');
  if (gv('founders_count') >= 2 && f('founders_years_together') != null && f('founders_years_together') < pp('new_team', 'years'))
    add('amber', 'new_team', 'The founders have not worked together before',
      [`${f('founders_count')} founders`, `${f('founders_years_together')} years working together`],
      'Co-founder conflict is one of the most common causes of early failure, and it is hardest to predict in a team with no shared history.',
      'How did the founders meet, how are decisions made, and how have you resolved a serious disagreement so far?');
  if (gb('technical_founder') === false && (S.model === 'saas' || S.model === 'ai_app') && (S.stage === 'preseed' || S.stage === 'seed'))
    add('amber', 'no_tech_founder', 'No technical founder',
      ['no founder builds the core product', `${modelLabel(S.model)} at ${STAGES.find(x => x.id === S.stage).n}`],
      'At this stage the speed of product iteration is the company. Outsourced or employee-only engineering slows it and raises IP questions.',
      'Who writes the core code today, what do they own, and are they vesting?');
  if (gb('funds_separate') === false || gb('valuation_409a') === false)
    add(gb('funds_separate') === false ? 'red' : 'amber', 'finance_hygiene', 'Finance and tax hygiene needs work',
      [gb('funds_separate') === false ? 'company and personal money are mixed' : null, gb('valuation_409a') === false ? 'no current 409A behind option grants' : null],
      'These are fixable, but they are found in every diligence and delay closing. Commingled funds also make the historical numbers hard to rely on.',
      'Can the books be cleaned up and a 409A commissioned before closing, and who owns that work?');
  const whyAsked = !HIDDEN_IDS.has('why_now') && SECTIONS.some(sec => visibleFields(sec).some(fl => fl.id === 'why_now'));
  if (whyAsked && !String(S.vals.why_now || '').trim() && (S.stage === 'preseed' || S.stage === 'seed') && ctx.sc && ctx.sc.coverage > 0.25)
    add('amber', 'why_now', 'No answer yet to “why now?”',
      ['the timing thesis is blank'], 'Being early is indistinguishable from being wrong. The change that makes this possible today is the core of an early-stage case.',
      'What changed in the last two years — technology, cost, regulation or behaviour — that makes this possible now, and why did earlier attempts fail?');

  const bad = checks.filter(c => c.sev !== 'ok').length;
  if (checks.length >= pp('clean_books', 'minChecks') && bad === 0)
    add('green', 'clean_books', 'Every stated figure reconciles',
      [`${checks.length} checks, no discrepancies`], 'Management reports its numbers the way the arithmetic produces them. That is rarer than it should be.', null);

  return cfgPatterns(out, D);
}
/* ═══════════════════════════════════════════════════════════════
   RISK MAP — every red and amber signal, grouped the way an IC discusses risk:
   product, market & timing, execution, financial, legal & regulatory, deal.
   ═══════════════════════════════════════════════════════════════ */
const RISK_TYPES = [['product','Product'],['market','Market & timing'],['execution','Execution & team'],['financial','Financial & reporting'],['legal','Legal & regulatory'],['deal','Deal & structure']];
const PATTERN_RISK = {
  optimism:'financial', bought_growth:'execution', leaky_bucket:'product', nrr_definition:'financial', services:'financial',
  fragile_concentration:'market', window_dressing:'financial', runway_cliff:'financial', hiring_ahead:'execution', discount_wins:'market',
  cycle_mismatch:'execution', ai_margin:'financial', overhang:'deal', default_dead:'financial', sim_low:'financial', sim_mid:'financial',
  cohort_decay:'product', fund_math:'deal', founder_risk:'execution', subsidised:'market', loss_growth:'financial', partner_bank:'legal',
  shelfware:'product', stage_mismatch:'deal', offmarket_terms:'deal', investor_rights:'deal', price_return:'deal', weak_pmf:'product',
  nice_to_have:'product', moat_unproven:'market', new_team:'execution', no_tech_founder:'execution', finance_hygiene:'legal', why_now:'market',
};
const GATE_RISK = { ip_assignments:'legal', contractor_ip:'legal', chain_title:'legal', captable_documented:'legal', taxes_current:'legal', reconcile:'financial' };
function riskMap(R) {
  const m = {}; RISK_TYPES.forEach(([k]) => m[k] = []);
  R.sc.gates.forEach(g => m[(g.risk && m[g.risk]) ? g.risk : (GATE_RISK[g.id] || 'legal')].push({ sev:'red', title:g.title, src:'gate' }));
  R.patterns.filter(p => p.sev !== 'green').forEach(p => m[(p.risk && m[p.risk]) ? p.risk : (PATTERN_RISK[p.id] || 'execution')].push({ sev:p.sev, title:p.title, src:'pattern' }));
  R.checks.filter(c => c.sev === 'major').forEach(c => m.financial.push({ sev:'red', title:c.title, src:'check' }));
  R.forensics.filter(f => f.status === 'fail' || f.status === 'warn').forEach(f => m.financial.push({ sev:f.status === 'fail' ? 'red' : 'amber', title:f.title, src:'forensic' }));
  if (gb('regulated_market') === true) m.legal.push({ sev:'amber', title:'Operates under a licensing or regulatory regime', src:'input' });
  if (gb('litigation') === true) m.legal.push({ sev:'red', title:'Material pending litigation', src:'input' });
  if (gb('oss_reviewed') === false) m.legal.push({ sev:'amber', title:'Open-source licences not reviewed', src:'input' });
  if (gb('founder_departed') === true && !m.execution.some(x => /co-founder/.test(x.title))) m.execution.push({ sev:'amber', title:'A co-founder has left', src:'input' });
  if (gb('infra_single_vendor') === true || gb('model_single_vendor') === true) m.product.push({ sev:'amber', title:'Single vendor can take the product down', src:'input' });
  return RISK_TYPES.map(([k, l]) => ({ id:k, label:l, items:m[k], red:m[k].filter(x => x.sev === 'red').length, amber:m[k].filter(x => x.sev === 'amber').length }));
}
const STAGE_RANGE = { preseed:{ lo:null, hi:250000 }, seed:{ lo:250000, hi:2000000 }, a:{ lo:2000000, hi:10000000 }, b:{ lo:10000000, hi:null } };

/* ═══════════════════════════════════════════════════════════════
   SENSITIVITY — which inputs move the score, and what would need to be true
   ═══════════════════════════════════════════════════════════════ */
function sensitivity(D, checks, sc) {
  if (sc.overall == null) return null;
  const base = sc.overallRaw;
  const fields = SECTIONS.filter(s => !s.claims && !s.deal).flatMap(visibleFields).filter(f => f.t === 'num' && gv(f.id) != null && gv(f.id) !== 0);
  const saved = Object.assign({}, S.vals);
  const tornado = [];
  try {
    fields.forEach(f => {
      const x = gv(f.id);
      const run = m => { S.vals[f.id] = String(x * m); const r = derive(); return scoreAll(r.D, runChecks(r.D)).overallRaw; };
      const lo = run(0.85), hi = run(1.15);
      S.vals[f.id] = saved[f.id];
      if (lo == null || hi == null) return;
      const swing = Math.abs(hi - lo);
      if (swing >= 0.5) tornado.push({ id:f.id, label:f.lbl, lo:lo - base, hi:hi - base, swing });
    });
  } finally { S.vals = saved; }
  tornado.sort((a, b) => b.swing - a.swing);

  /* What would need to be true: lift the weakest scored metrics to "good" one at a time. */
  const TH = activeThresholds();
  const weak = sc.dimensions.flatMap(d => d.metrics.filter(m => m.score != null && m.score < 72 && TH[m.key] && TH[m.key].dir !== 'band')
    .map(m => ({ ...m, dim:d.id })));
  const gains = weak.map(m => {
    const r = scoreAll(D, checks, { overrides:{ [m.key]:72 } });
    r.overall = r.overallRaw;
    const cfg = TH[m.key], a = cfg[S.stage];
    return { key:m.key, label:m.label, from:m.value, to:(cfg.dir === 'hi' ? '≥ ' : '≤ ') + dfmt(m.key, goodValue(cfg, a)), gain:r.overall - base };
  }).filter(g => g.gain > 0).sort((a, b) => b.gain - a.gain);
  const path = []; let over = {}, cur = base;
  for (const g of gains) {
    if (cur >= 70) break;
    over[g.key] = 72;
    cur = scoreAll(D, checks, { overrides:over }).overallRaw;
    path.push({ ...g, cum:cur });
  }
  return { base, tornado:tornado.slice(0, 12), gains:gains.slice(0, 8), path, reaches70: cur >= 70 };
}
