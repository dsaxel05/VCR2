
/* ═══════════════════════════════════════════════════════════════
   DILIGENCE CHECKLIST — what a VC asks for, by stage.
   Built from common practice (startup-CPA diligence lists by stage,
   data-room checklists and VC diligence guides). Each item applies from
   a stage onwards; items tied to an evidence field or an uploaded file
   pre-fill their status, and whatever the user sets always wins.
   ═══════════════════════════════════════════════════════════════ */
const STAGE_ORDER = { preseed:0, seed:1, a:2, b:3 };
const CL_STATUS = [['todo','Not started'],['requested','Requested'],['received','Received'],['reviewed','Reviewed — fine'],['issue','Issue found'],['na','Not applicable']];
const CL_CATS = ['Founders & team','Financial','Tax','Cap table & legal','Customers & market','Product & technology','Intellectual property','People & HR','IT & security','Insurance & risk'];
const DILIGENCE = [
  /* Founders & team */
  { id:'ref_checks', cat:'Founders & team', from:'preseed', text:'Back-channel references on each founder — former colleagues, co-founders, investors', why:'The single best predictor of how a founder behaves under pressure is how they behaved before.' },
  { id:'founder_backgrounds', cat:'Founders & team', from:'preseed', text:'Founder backgrounds verified — education, employment, prior companies and outcomes' },
  { id:'founder_docs', cat:'Founders & team', from:'preseed', text:'Founder stock purchase and vesting agreements', auto:() => gb('founder_vesting') === true ? 'received' : null },
  { id:'org_chart', cat:'Founders & team', from:'seed', text:'Org chart, key hires and critical open roles' },
  { id:'hiring_plan', cat:'Founders & team', from:'seed', text:'18-month hiring plan tied to the milestones this round funds' },
  { id:'mgmt_comp', cat:'Founders & team', from:'a', text:'Management compensation — salary, bonus and equity' },
  { id:'key_person', cat:'Founders & team', from:'a', text:'Key-person dependencies and succession plan' },
  /* Financial */
  { id:'fin_model', cat:'Financial', from:'preseed', text:'Financial model with use of funds, burn plan and runway' },
  { id:'bank_statements', cat:'Financial', from:'preseed', text:'Bank statements for the last 12 months, to tie cash to the books' },
  { id:'separate_accounts', cat:'Financial', from:'preseed', text:'Company bank accounts separate from personal finances', auto:() => gb('funds_separate') === false ? 'issue' : gb('funds_separate') === true ? 'reviewed' : null },
  { id:'revenue_ledger', cat:'Financial', from:'seed', text:'Revenue by customer by month (billing-system export)', auto:() => S.ledger ? 'received' : null },
  { id:'monthly_accounts', cat:'Financial', from:'seed', text:'Monthly P&L, balance sheet and cash flow for the last 24 months', auto:() => S.series ? 'received' : null },
  { id:'debt_docs', cat:'Financial', from:'seed', text:'Venture debt and loan agreements, including covenants', when:() => gv('debt_outstanding') > 0 },
  { id:'gaap_statements', cat:'Financial', from:'a', text:'Accrual-basis (GAAP) financial statements' },
  { id:'unit_econ', cat:'Financial', from:'a', text:'CAC, LTV and payback workings with definitions' },
  { id:'ar_ap', cat:'Financial', from:'a', text:'Accounts receivable and payable ageing' },
  { id:'deferred_rev', cat:'Financial', from:'a', text:'Deferred revenue roll-forward and revenue-recognition policy' },
  { id:'bva', cat:'Financial', from:'b', text:'Budget versus actual for the last four quarters' },
  { id:'audit', cat:'Financial', from:'b', text:'Audited or reviewed financial statements', auto:() => gs('audited_financials') === 'Audited' || gs('audited_financials') === 'Reviewed' ? 'received' : null },
  { id:'qoe', cat:'Financial', from:'b', text:'Quality-of-earnings report' },
  /* Tax */
  { id:'payroll_tax', cat:'Tax', from:'seed', text:'Payroll tax filings current, with proof of payment', auto:() => gb('taxes_current') === false ? 'issue' : gb('taxes_current') === true ? 'reviewed' : null },
  { id:'income_tax', cat:'Tax', from:'seed', text:'Federal and state income tax returns filed' },
  { id:'franchise_tax', cat:'Tax', from:'seed', text:'Delaware franchise tax paid and certificate of good standing' },
  { id:'val_409a', cat:'Tax', from:'seed', text:'409A valuation from the last 12 months', auto:() => gb('valuation_409a') === false ? 'issue' : gb('valuation_409a') === true ? 'received' : null },
  { id:'sales_tax', cat:'Tax', from:'a', text:'Sales tax and nexus analysis for every state or country sold into' },
  { id:'rd_credit', cat:'Tax', from:'a', text:'R&D tax credit documentation, if claimed' },
  /* Cap table & legal */
  { id:'charter', cat:'Cap table & legal', from:'preseed', text:'Certificate of incorporation, bylaws and good standing' },
  { id:'cap_table_full', cat:'Cap table & legal', from:'preseed', text:'Fully diluted cap table including SAFEs, notes and options', auto:() => gb('captable_documented') === false ? 'issue' : gb('captable_documented') === true ? 'received' : null },
  { id:'safe_docs', cat:'Cap table & legal', from:'preseed', text:'SAFE and convertible note agreements', when:() => gv('safes_outstanding') > 0 || gv('notes_principal') > 0 },
  { id:'board_minutes', cat:'Cap table & legal', from:'seed', text:'Board minutes and written consents' },
  { id:'prior_rounds', cat:'Cap table & legal', from:'seed', text:'Prior financing documents and any side letters' },
  { id:'option_plan', cat:'Cap table & legal', from:'seed', text:'Equity incentive plan and grant records' },
  { id:'litigation', cat:'Cap table & legal', from:'seed', text:'Pending or threatened litigation and disputes', auto:() => gb('litigation') === true ? 'issue' : gb('litigation') === false ? 'reviewed' : null },
  { id:'licences_reg', cat:'Cap table & legal', from:'seed', text:'Regulatory licences and correspondence with regulators', when:() => gb('regulated_market') === true || S.model === 'fintech' },
  { id:'material_contracts', cat:'Cap table & legal', from:'a', text:'Material contracts — top customers, suppliers and partners' },
  /* Customers & market */
  { id:'customer_calls', cat:'Customers & market', from:'seed', text:'Customer reference calls, including one customer who churned' },
  { id:'market_sizing', cat:'Customers & market', from:'seed', text:'Bottom-up market sizing workings', auto:() => gv('target_accounts') != null ? 'received' : null },
  { id:'competition', cat:'Customers & market', from:'seed', text:'Competitive landscape and win/loss notes' },
  { id:'pmf_survey', cat:'Customers & market', from:'preseed', text:'Product-market fit survey or usage-retention evidence', auto:() => gv('pmf_very_disappointed') != null ? 'received' : null },
  { id:'top_customers', cat:'Customers & market', from:'a', text:'Top 20 customers with contract dates, terms and renewal dates' },
  { id:'cohorts', cat:'Customers & market', from:'a', text:'Cohort retention table, gross and net, in dollars', auto:() => S.ledger ? 'received' : null },
  { id:'pipeline', cat:'Customers & market', from:'a', text:'CRM pipeline export with stage history' },
  { id:'channel_cac', cat:'Customers & market', from:'a', text:'Customer acquisition by channel — spend, conversion and CAC' },
  /* Product & technology */
  { id:'demo', cat:'Product & technology', from:'preseed', text:'Product demo and roadmap' },
  { id:'usage', cat:'Product & technology', from:'seed', text:'Product usage and engagement data' },
  { id:'architecture', cat:'Product & technology', from:'seed', text:'Architecture and technology-stack overview' },
  { id:'tech_debt', cat:'Product & technology', from:'a', text:'Scalability and technical-debt assessment' },
  { id:'oss_scan', cat:'Product & technology', from:'a', text:'Open-source licence scan of what ships', auto:() => gb('oss_reviewed') === false ? 'issue' : gb('oss_reviewed') === true ? 'reviewed' : null },
  /* IP */
  { id:'ip_assign', cat:'Intellectual property', from:'preseed', text:'IP assignment agreements for every founder, employee and contractor', auto:() => gb('ip_assignments') === false || gb('contractor_ip') === true ? 'issue' : gb('ip_assignments') === true ? 'received' : null },
  { id:'ip_register', cat:'Intellectual property', from:'seed', text:'Patents, trademarks and pending applications' },
  { id:'ip_inbound', cat:'Intellectual property', from:'seed', text:'Inbound IP and technology licences, including any university licence', auto:() => gb('chain_title') === false ? 'issue' : null },
  /* People & HR */
  { id:'employment', cat:'People & HR', from:'seed', text:'Employment agreements and offer letters' },
  { id:'contractors', cat:'People & HR', from:'seed', text:'Contractor agreements and a classification review' },
  { id:'hr_policies', cat:'People & HR', from:'a', text:'HR policies, handbook and benefits' },
  { id:'payroll_systems', cat:'People & HR', from:'a', text:'Payroll, accounting and reporting systems' },
  /* IT & security */
  { id:'security', cat:'IT & security', from:'a', text:'Security policies, access controls and incident history' },
  { id:'soc2_doc', cat:'IT & security', from:'a', text:'SOC 2 report or roadmap', auto:() => gs('soc2') === 'Type II' || gs('soc2') === 'Type I' ? 'received' : null },
  { id:'privacy', cat:'IT & security', from:'a', text:'Data-protection compliance (GDPR, CCPA) and customer DPAs', auto:() => gb('dpas_signed') === true ? 'received' : null },
  /* Insurance & risk */
  { id:'dno', cat:'Insurance & risk', from:'a', text:'D&O insurance, in place or bound at closing', auto:() => gb('insurance_dno') === true ? 'received' : null },
  { id:'cyber', cat:'Insurance & risk', from:'a', text:'Cyber and general liability cover' },
  { id:'risk_register', cat:'Insurance & risk', from:'b', text:'Top failure modes and their mitigations' },
];

/* Built-in categories first, then any the owner created, in the order they appear. */
function checklistCats(items) { const extra = []; items.forEach(it => { if (!CL_CATS.includes(it.cat) && !extra.includes(it.cat)) extra.push(it.cat); }); return CL_CATS.filter(c => items.some(it => it.cat === c)).concat(extra); }
/* Built-in items plus the owner's own, minus those switched off. */
function checklistItems(allStages) {
  const custom = (CFG.checklist || []).map(c => ({ id:c.id, cat:(c.category && c.category.trim()) || 'Financial', from:c.from in STAGE_ORDER ? c.from : 'preseed', text:c.text, why:c.why || '', custom:true }));
  const L = (CFG.labels && CFG.labels.checklist) || {};
  const builtIn = DILIGENCE.map(it => typeof L[it.id] === 'string' && L[it.id].trim() ? Object.assign({}, it, { text:L[it.id].trim() }) : it);
  return builtIn.concat(custom)
    .filter(it => !cfgHidden('checklist', it.id))
    .filter(it => allStages || STAGE_ORDER[it.from] <= STAGE_ORDER[S.stage])
    .filter(it => !it.when || it.when());
}
function checklistStatus(it) {
  const set = S.checklist && S.checklist[it.id];
  if (set) return { v:set === 'todo' ? '' : set, auto:false, manual:true };
  const a = it.auto ? it.auto() : null;
  return { v:a || '', auto:!!a };
}
function checklistSummary() {
  const items = checklistItems(false);
  const st = items.map(it => checklistStatus(it).v);
  const done = st.filter(v => v === 'received' || v === 'reviewed' || v === 'na').length;
  return { total:items.length, done, issues:items.filter((it, i) => st[i] === 'issue'), requested:st.filter(v => v === 'requested').length,
    open:items.filter((it, i) => !st[i] || st[i] === 'requested') };
}
function setChecklist(id, v) {
  S.checklist = S.checklist || {};
  if (v) S.checklist[id] = v; else delete S.checklist[id];   /* 'todo' is stored, so it overrides a status filled from inputs */
  saveDraft();
  const p = document.getElementById('cl-progress'); if (p) p.outerHTML = checklistProgressHTML();
  const row = document.querySelector(`tr[data-cl="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id}"]`);
  if (row) { row.className = 'cl-' + (v && v !== 'todo' ? v : 'none'); const h = row.querySelector('.cl-auto'); if (h) h.remove(); }
}
function checklistProgressHTML() {
  const s = checklistSummary(), pct = s.total ? Math.round(s.done / s.total * 100) : 0;
  return `<div id="cl-progress" class="cl-progress"><div class="cl-bar"><div style="width:${pct}%"></div></div>
    <span>${s.done} of ${s.total} items received, reviewed or not applicable${s.issues.length ? ` · <b style="color:var(--red)">${s.issues.length} issue${s.issues.length === 1 ? '' : 's'}</b>` : ''}${s.requested ? ` · ${s.requested} requested` : ''}</span></div>`;
}
let _clAll = false;
function paneChecklist() {
  const items = checklistItems(_clAll);
  const cats = checklistCats(items);
  return `<p class="pg-desc" style="margin-bottom:10px">What investors typically ask for at ${esc(STAGES.find(s => s.id === S.stage).n)}, grouped the way a data room is. Items tied to your inputs or uploaded files fill in on their own; set any status by hand and it is saved with the assessment.</p>
    ${checklistProgressHTML()}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 4px">
      <label class="api-check" style="margin:0"><input type="checkbox" ${_clAll ? 'checked' : ''} onchange="_clAll=this.checked;document.getElementById('rp-checklist').innerHTML=paneChecklist()"> Show later-stage items too</label>
      <button class="btn btn-ghost btn-sm" onclick="copyChecklistRequest()">Copy the open items as a request list</button>
    </div>
    ${cats.map(c => `<div class="block-title" style="margin-top:16px">${esc(c)}</div>
      <div class="tbl-wrap"><table class="ledger cl-tbl"><tbody>${items.filter(it => it.cat === c).map(it => { const s = checklistStatus(it);
        return `<tr data-cl="${esc(it.id)}" class="cl-${s.v || 'none'}"><td>${esc(it.text)}${it.custom ? ' <span class="custom-tag">yours</span>' : ''}${STAGE_ORDER[it.from] > STAGE_ORDER[S.stage] ? ` <span class="pill">from ${esc(STAGES.find(x => x.id === it.from).n)}</span>` : ''}${it.why ? `<div class="field-hint">${esc(it.why)}</div>` : ''}</td>
          <td style="width:190px;white-space:nowrap"><select class="field-select mini" onchange="setChecklist(this.closest('tr').dataset.cl, this.value)">${CL_STATUS.map(([v, l]) => `<option value="${v}"${(s.v || 'todo') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${s.auto ? '<div class="field-hint cl-auto">from your inputs</div>' : ''}</td></tr>`; }).join('')}</tbody></table></div>`).join('')}`;
}
function copyChecklistRequest() {
  const s = checklistSummary();
  if (!s.open.length) { toast('Nothing open — every item is received, reviewed or not applicable.'); return; }
  const byCat = checklistCats(s.open).map(c => [c, s.open.filter(it => it.cat === c)]).filter(x => x[1].length);
  copyText(`Diligence request list — ${S.name || 'company'}\n\n` + byCat.map(([c, L]) => `${c}\n${L.map(it => '- ' + it.text).join('\n')}`).join('\n\n'), 'Request list copied.');
}
