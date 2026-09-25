
/* ═══════════════════════════════════════════════════════════════
   REPORT — one run, eleven views
   ═══════════════════════════════════════════════════════════════ */
let _rtab = 'overview';
const sColor = v => v == null ? 'var(--t1)' : v >= 70 ? 'var(--green)' : v >= 45 ? 'var(--amber)' : 'var(--red)';
const STATUS_ICON = { pass:'✓', info:'i', warn:'!', fail:'✕', na:'–' };
const STATUS_LABEL = { pass:'pass', info:'note', warn:'flag', fail:'strong flag', na:'not applicable' };

function renderResult(R) {
  const { sc, questions, memo, checks, patterns } = R;
  const blocked = sc.gates.length > 0;
  const stageName = STAGES.find(s => s.id === S.stage).n, modelName = modelLabel(S.model);
  const date = new Date(R.at).toLocaleDateString('en-GB', { year:'numeric', month:'long', day:'numeric' });
  const reds = patterns.filter(p => p.sev === 'red').length;
  const fxFlags = R.forensics.filter(f => f.status === 'warn' || f.status === 'fail').length;
  const tabs = [
    ['overview', 'Overview'],
    ['findings', `Findings${R.checks.filter(c => c.sev !== 'ok').length ? ' (' + R.checks.filter(c => c.sev !== 'ok').length + ')' : ''}`],
    ['revenue', 'Revenue'],
    ['forensics', `Forensics${fxFlags ? ' (' + fxFlags + ')' : ''}`],
    ['runway', 'Runway & odds'],
    ['deal', 'Deal & returns'],
    ['bench', 'Benchmarks'],
    ['scoring', 'Scoring'],
    ['questions', `Questions (${questions.length})`],
    ['metrics', 'All metrics'],
    ['ledger', 'Consistency ledger'],
    ['checklist', `Diligence checklist${(() => { const c = checklistSummary(); return c.issues.length ? ' (' + c.issues.length + ' issue' + (c.issues.length === 1 ? '' : 's') + ')' : ''; })()}`],
  ];
  if (memo) tabs.push(['memo', 'Memo draft']);
  if (!tabs.some(t => t[0] === _rtab)) _rtab = 'overview';

  document.getElementById('result-content').innerHTML = `
    <div class="res-hero">
      <div>
        <div class="res-company">${esc(S.name)}</div>
        <div class="res-meta">${esc(stageName)} · ${esc(modelName)} · ${esc(date)}${S.asof ? ' · data as of ' + esc(monthLong(S.asof)) : ''}</div>
        <div class="res-meta" style="margin-top:3px">rubric ${esc(sc.rubric)} · run ${esc(R.hash)}${R.LED ? ' · customer ledger' : ''}${S.series ? ' · monthly financials' : ''}</div>
      </div>
      <div class="score-card">${blocked
        ? `<div><div class="verdict-pill vp-avoid">⛔ Blocked — ${sc.gates.length} gate${sc.gates.length === 1 ? '' : 's'}</div>
           <div style="font-size:11px;color:var(--t2);margin-top:8px;max-width:250px">The score is withheld until these are cleared. Every analysis below still runs.</div></div>`
        : bandHTML(sc)}</div>
    </div>
    ${blocked ? `<div class="gate"><h3>${sc.gates.length === 1 ? 'One item must be resolved before terms' : sc.gates.length + ' items must be resolved before terms'}</h3>
      <ul>${sc.gates.map(g => `<li><b>${esc(g.title)}.</b> ${esc(g.why)}</li>`).join('')}</ul></div>` : ''}

    <div class="rtabs" role="tablist">${tabs.map(([id, l]) => `<button class="rtab${_rtab === id ? ' active' : ''}" role="tab" onclick="rtab(this,'${id}')">${esc(l)}</button>`).join('')}</div>

    <div class="rpane${_rtab === 'overview' ? ' active' : ''}" id="rp-overview">${paneOverview(R)}</div>
    <div class="rpane${_rtab === 'findings' ? ' active' : ''}" id="rp-findings">${paneFindings(R)}</div>
    <div class="rpane${_rtab === 'revenue' ? ' active' : ''}" id="rp-revenue">${paneRevenue(R)}</div>
    <div class="rpane${_rtab === 'forensics' ? ' active' : ''}" id="rp-forensics">${paneForensics(R)}</div>
    <div class="rpane${_rtab === 'runway' ? ' active' : ''}" id="rp-runway">${paneRunway(R)}</div>
    <div class="rpane${_rtab === 'deal' ? ' active' : ''}" id="rp-deal">${paneDeal(R)}</div>
    <div class="rpane${_rtab === 'bench' ? ' active' : ''}" id="rp-bench">${paneBench(R)}</div>
    <div class="rpane${_rtab === 'scoring' ? ' active' : ''}" id="rp-scoring">${paneScoring(R)}</div>
    <div class="rpane${_rtab === 'questions' ? ' active' : ''}" id="rp-questions">${paneQuestions(R)}</div>
    <div class="rpane${_rtab === 'metrics' ? ' active' : ''}" id="rp-metrics">${paneMetrics(R)}</div>
    <div class="rpane${_rtab === 'ledger' ? ' active' : ''}" id="rp-ledger">${paneLedger(R)}</div>
    <div class="rpane${_rtab === 'checklist' ? ' active' : ''}" id="rp-checklist">${paneChecklist()}</div>
    ${memo ? `<div class="rpane${_rtab === 'memo' ? ' active' : ''}" id="rp-memo">
      <div class="warnstrip"><span>ℹ</span><div>Drafted by a language model from the computed figures above. It did not produce and cannot change the score. Check every sentence against the metrics tab before it goes near an IC.</div></div>
      <div class="analysis-blk">${esc(memo).split(/\n\n+/).map(p => `<p style="margin-bottom:13px">${p.replace(/\n/g, '<br>')}</p>`).join('')}</div>
    </div>` : ''}

    <div class="res-nav">
      <button class="btn btn-ghost" onclick="editData()">Edit inputs</button>
      <div class="res-nav-right">
        <button class="btn btn-success" onclick="printMemo()">IC memo · print / PDF</button>
        <button class="btn btn-ghost" onclick="founderEmail()">Founder email</button>
        <button class="btn btn-ghost" onclick="saveRunToLibrary()">Save to library</button>
        <button class="btn btn-ghost" onclick="exportAssessment()">Export .json</button>
        <button class="btn btn-ghost" onclick="downloadReport()">Markdown</button>
        <button class="btn btn-ghost" onclick="resetApp()">New assessment</button>
      </div>
    </div>
    <div class="runmeta">
      Radar is a workflow tool for investment professionals. It does not provide investment advice and its output is not a recommendation to buy or sell any security.
      Figures are as supplied by the user or computed from user-supplied files and are not independently verified. Default thresholds are editable calibrations, not market statistics.
    </div>`;
}
function rtab(btn, id) {
  _rtab = id;
  document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.rpane').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const el = document.getElementById('rp-' + id); if (el) el.classList.add('active');
}
function goTab(id) { const b = Array.from(document.querySelectorAll('.rtab')).find(x => (x.getAttribute('onclick') || '').includes(`'${id}'`)); if (b) { rtab(b, id); b.scrollIntoView({ block:'nearest', inline:'center' }); } }

function bandHTML(sc) {
  if (sc.overall == null) return `<div style="font-size:12px;color:var(--t2);max-width:240px">Not enough scored inputs to produce a score.</div>`;
  return `<div class="band-wrap">
    <div class="band-num" style="color:${sColor(sc.overall)}">${sc.overall}<span style="font-size:17px;color:var(--t2)">/100</span></div>
    <div class="band-rng">likely range ${sc.band[0]}–${sc.band[1]} · ${sc.confidence} confidence<br>${Math.round(sc.coverage * 100)}% of the rubric populated · evidence strength ${sc.evidence != null ? Math.round(sc.evidence * 100) + '%' : '—'}</div>
    <div class="band-track"><div class="band-fill" style="left:${sc.band[0]}%;width:${sc.band[1] - sc.band[0]}%"></div><div class="band-tick" style="left:${sc.overall}%"></div></div>
    <div class="band-scale"><span>0</span><span>45</span><span>70</span><span>100</span></div>
  </div>`;
}
const tile = (label, value, sub, cls = '') => `<div class="kpi ${cls}"><div class="kpi-l">${esc(label)}</div><div class="kpi-v">${esc(value)}</div>${sub ? `<div class="kpi-s">${esc(sub)}</div>` : ''}</div>`;
function patternCard(p) {
  const icon = p.sev === 'red' ? '▲' : p.sev === 'amber' ? '●' : '✓';
  return `<div class="pat ${p.sev}"><div class="pat-h"><span class="pat-i" aria-hidden="true">${icon}</span><strong>${esc(p.title)}</strong><span class="pat-sev">${p.sev === 'red' ? 'risk' : p.sev === 'amber' ? 'watch' : 'strength'}</span></div>
    <div class="pat-ev">${p.evidence.map(e => `<span class="chip-s">${esc(e)}</span>`).join('')}</div>
    <p>${esc(p.why)}</p>${p.ask ? `<div class="ask">${esc(p.ask)}</div>` : ''}</div>`;
}

/* ── Overview ── */
function paneOverview(R) {
  const { D, sc, proj, deal, LED, patterns, sens, questions } = R;
  const sim = proj.sim;
  const tiles = [
    tile('ARR', money(gv('arr_now')), LED ? `ledger ${money(LED.arrNow)}` : null),
    tile('Growth YoY', D.growth_yoy != null ? fmtPct(D.growth_yoy, 0) : '—', D.cmgr3 != null ? `${fmtPct(D.cmgr3)} / month lately` : null),
    tile('Net revenue retention', D.nrr != null ? fmtPct(D.nrr) : '—', LED ? 'cohort basis, from ledger' : 'waterfall basis'),
    tile('Burn multiple', D.burn_multiple != null ? numv(D.burn_multiple) : '—', D.burn_multiple != null ? 'net burn ÷ net new ARR' : null),
    tile('Runway', D.runway != null ? fmtMo(D.runway) : '—', D._cashOut ? 'cash-out ~' + monthLabel(D._cashOut) : null),
    tile('Odds of next-stage bar', sim ? fmtProb(sim.pMilestone) : '—', sim ? `${money(sim.milestone)} ARR before cash-out` : 'needs cash, burn and growth'),
    tile('Entry multiple', deal && deal.entryMult != null ? fmtX(deal.entryMult) + ' ARR' : '—', deal ? `post-money ${money(deal.P)}` : 'no terms entered'),
    tile('Evidence strength', sc.evidence != null ? Math.round(sc.evidence * 100) + '%' : '—', 'share of weight on verified sources'),
  ];
  const reds = patterns.filter(p => p.sev === 'red'), ambers = patterns.filter(p => p.sev === 'amber'), greens = patterns.filter(p => p.sev === 'green');
  const wnt = sens && sens.path.length && sc.overall < 70 ? `<div class="block-title" style="margin-top:22px">What would need to be true for 70+</div>
    <div class="tbl-wrap"><table class="ledger"><thead><tr><th>Metric</th><th>Today</th><th>Needs to be</th><th style="text-align:right">Score after</th></tr></thead>
    <tbody>${sens.path.slice(0, 6).map(p => `<tr><td>${esc(p.label)}</td><td class="m">${esc(p.from)}</td><td class="m">${esc(p.to)}</td><td class="m" style="text-align:right">${Math.round(p.cum)}</td></tr>`).join('')}
      ${sens.path.length > 6 ? `<tr><td colspan="4" style="color:var(--t2)">…and ${sens.path.length - 6} more metric${sens.path.length - 6 === 1 ? '' : 's'} to reach ${Math.round(sens.path[sens.path.length - 1].cum)}</td></tr>` : ''}</tbody></table></div>
    <p class="field-hint" style="margin-top:6px">${sens.reaches70 ? 'Moving these metrics to the “good” bar, in this order, lifts the score past 70.' : 'Even with these metrics at the “good” bar the score stays below 70 — the gap is spread across the whole profile.'}</p>` : '';
  return `
    <div class="kpi-grid">${tiles.join('')}</div>
    ${R.opt && R.opt.significant ? `<div class="gate optim" style="margin-top:16px"><h3>Every discrepancy points the same way</h3><p style="font-size:12px;color:var(--t1)">${R.opt.k} of ${R.opt.n} figures that disagree with the arithmetic flatter the company (chance under honest error ${fmtProb(R.opt.p)}).</p></div>` : ''}
    ${riskMapHTML(R.risk)}
    <div class="block-title" style="margin-top:22px">Pattern read-out <span class="field-group-hint">${reds.length} risk · ${ambers.length} watch · ${greens.length} strength</span></div>
    ${patterns.length ? `<div class="pat-grid">${patterns.map(patternCard).join('')}</div>` : '<div class="suppressed">No compound patterns fired. Add more evidence — a customer ledger and monthly financials unlock most of them.</div>'}
    ${wnt}
    <div class="block-title" style="margin-top:22px">First five questions for the founders</div>
    <div class="qlist">${questions.slice(0, 5).map((q, i) => `<div class="qitem"><div class="qnum">${i + 1}</div><div class="qtext">${esc(q.text)}<span class="qtag">${esc(q.tag)}</span></div></div>`).join('')}</div>
    <button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="goTab('questions')">All ${questions.length} questions →</button>`;
}

/* ── Risk map: every red and amber signal by type ── */
function riskMapHTML(map) {
  if (!map) return '';
  const any = map.some(c => c.items.length);
  return `<div class="block-title" style="margin-top:22px">Risk map <span class="field-group-hint">by type, as an investment committee discusses it</span></div>
    ${any ? `<div class="risk-grid">${map.map(c => `<div class="risk-cell ${c.red ? 'red' : c.amber ? 'amber' : 'clear'}">
      <div class="risk-h"><b>${esc(c.label)}</b><span>${c.red ? c.red + ' risk' : ''}${c.red && c.amber ? ' · ' : ''}${c.amber ? c.amber + ' watch' : ''}${!c.items.length ? 'nothing flagged' : ''}</span></div>
      ${c.items.length ? `<ul>${c.items.slice(0, 4).map(x => `<li class="${x.sev}">${esc(x.title)}</li>`).join('')}${c.items.length > 4 ? `<li class="more">+${c.items.length - 4} more</li>` : ''}</ul>` : ''}</div>`).join('')}</div>`
    : '<div class="suppressed">Nothing flagged yet in any risk category.</div>'}`;
}

/* ── Findings ── */
function contraCard(c) {
  return `<div class="contra${c.sev === 'minor' ? ' minor' : ''}">
    <div class="contra-h"><strong>${esc(c.title)}</strong><span class="sev">${esc(c.delta || '')}</span>${typeof c.flatter === 'boolean' ? `<span class="sev ${c.flatter ? 'flat' : ''}">${c.flatter ? 'flatters the company' : 'against the company'}</span>` : ''}</div>
    <p>${esc(c.text || '')}</p>${c.ask ? `<div class="ask">${esc(c.ask)}</div>` : ''}</div>`;
}
function paneFindings(R) {
  const { checks, sc, requests, opt } = R;
  const majors = checks.filter(c => c.sev === 'major'), minors = checks.filter(c => c.sev === 'minor');
  return `
    ${opt && opt.n >= 3 ? `<div class="optbox ${opt.significant ? 'bad' : ''}"><b>Direction of errors.</b> ${opt.k} of ${opt.n} discrepancies flatter the company. ${opt.p != null ? `Under honest, random error the chance of at least ${opt.k} leaning that way is ${fmtProb(opt.p)}.` : ''} ${opt.significant ? 'That is a finding in itself.' : 'Not a significant skew.'}</div>` : ''}
    ${majors.length ? `<div class="block-title">Material contradictions</div>${majors.map(contraCard).join('')}` : ''}
    ${minors.length ? `<div class="block-title" style="margin-top:18px">Minor inconsistencies</div>${minors.map(contraCard).join('')}` : ''}
    ${!majors.length && !minors.length ? `<div class="suppressed">Every stated figure reconciles with the figure computed from the primitives${R.LED ? ' and the customer ledger' : ''}. That is a meaningful positive signal about how this company keeps its books.</div>` : ''}
    ${Object.keys(sc.suppressed).length ? `<div class="block-title" style="margin-top:20px">Metrics withheld at this scale</div>
      ${Object.entries(sc.suppressed).map(([k, r]) => `<div class="suppressed"><b>${esc(DLABEL[k] || k)}</b> — ${esc(r)}.</div>`).join('')}` : ''}
    <div class="block-title" style="margin-top:20px">Documents to request</div>
    <div class="qlist">${requests.map((r, i) => `<div class="qitem"><div class="qnum">${i + 1}</div><div class="qtext">${esc(r)}</div></div>`).join('')}</div>`;
}

/* ── Revenue ── */
function paneRevenue(R) {
  const LED = R.LED, SR = S.series;
  if (!LED) {
    const line = SR && SR.revenue.filter(v => v != null).length >= 3
      ? `<div class="block-title">Monthly revenue (from monthly financials)</div>${chartLine(SR.months.map(m => monthLabel(m)), SR.revenue, { label:'Monthly revenue' })}` : '';
    return `${line}<div class="empty-card"><h4>Load the customer ledger to unlock this view</h4>
      <p>Upload revenue by customer by month — any billing-system export works, wide or long. Radar rebuilds the MRR bridge, true cohort retention (not the waterfall approximation), concentration and nine forensic tests from it.</p>
      <button class="btn btn-primary btn-sm" onclick="showPage('intake')">Add a ledger</button></div>`;
  }
  const cm = LED.cmgr3, top = LED.pareto.slice(0, 10);
  const nrrGap = LED.nrrFlow != null && LED.nrrCohort != null ? LED.nrrFlow - LED.nrrCohort : null;
  const ct = LED.cohortTrend;
  return `
    <div class="kpi-grid">
      ${tile('Ledger ARR', money(LED.arrNow), `${LED.customersNow} paying customers`)}
      ${tile('Monthly growth', cm != null ? fmtPct(cm) : '—', `3-mo CMGR · 12-mo ${fmtPct(LED.cmgr12)}`)}
      ${tile('Cohort NRR', fmtPct(LED.nrrCohort), LED.window === 12 ? 'trailing 12 months' : `trailing ${LED.window} months`)}
      ${tile('Cohort GRR', fmtPct(LED.grrCohort), `logo retention ${fmtPct(LED.logoRet, 0)}`)}
      ${tile('Waterfall NRR', fmtPct(LED.nrrFlow), nrrGap != null ? `${fmtSigned(nrrGap, 1, ' pts')} vs cohort` : null, nrrGap > 5 ? 'warn' : '')}
      ${tile('Top-5 concentration', fmtPct(LED.top5, 0), `largest ${fmtPct(LED.top1, 0)} · HHI ${Math.round(LED.hhi)}`)}
    </div>
    ${nrrGap != null && nrrGap > 2 ? `<div class="optbox" style="margin-top:12px">The waterfall formula gives ${fmtPct(LED.nrrFlow)} because it counts ${money(LED.expFromNew * 12)} of expansion ARR from customers who joined during the year. On a strict cohort basis — only customers who were already paying twelve months ago — retention is ${fmtPct(LED.nrrCohort)}. Most decks quote the first number.</div>` : ''}
    <div class="block-title" style="margin-top:22px">MRR over time</div>
    ${chartLine(LED.months.map(m => monthLabel(m)), LED.mrr, { label:'Total MRR by month' })}
    <div class="block-title" style="margin-top:22px">MRR bridge by month</div>
    ${chartBridge(LED.bridge)}
    <div class="block-title" style="margin-top:22px">Cohort retention ${LED.quarterly ? '(quarterly cohorts, months since start)' : '(monthly cohorts)'}
      <span class="seg"><button class="seg-b active" onclick="cohortMode(this,'dollar')">Dollar</button><button class="seg-b" onclick="cohortMode(this,'logo')">Logo</button></span></div>
    <div id="cohort-hm">${cohortHeatmap(LED, 'dollar')}</div>
    <p class="field-hint" style="margin-top:6px">Each cell is revenue (or logos) at that age as a share of the cohort's starting MRR. Faded cells are partial — not every customer in the cohort is that old yet. Customers already live in the first ledger month have no known start and are excluded.</p>
    ${ct ? `<div class="optbox ${ct.newer < ct.older - 8 ? 'bad' : ct.newer > ct.older + 5 ? 'good' : ''}" style="margin-top:10px"><b>Cohort quality.</b> At month ${ct.age}, older cohorts retain ${fmtPct(ct.older, 0)} of starting MRR and newer cohorts ${fmtPct(ct.newer, 0)} (${ct.n} cohorts compared${ct.slope != null ? `, trend ${fmtSigned(ct.slope, 1, ' pts per cohort')}` : ''}).</div>` : ''}
    <div class="block-title" style="margin-top:22px">Largest customers today</div>
    <div class="tbl-wrap"><table class="ledger"><thead><tr><th>#</th><th>Customer</th><th style="text-align:right">MRR</th><th style="text-align:right">Share</th><th style="text-align:right">Cumulative</th></tr></thead>
      <tbody>${top.map(t => `<tr><td class="m">${t.rank}</td><td>${esc(t.name)}</td><td class="m" style="text-align:right">${money(t.v)}</td><td class="m" style="text-align:right">${fmtPct(t.share)}</td><td class="m" style="text-align:right">${fmtPct(t.cum, 0)}</td></tr>`).join('')}</tbody></table></div>`;
}
function cohortMode(btn, mode) {
  btn.parentNode.querySelectorAll('.seg-b').forEach(b => b.classList.remove('active')); btn.classList.add('active');
  const LED = S.result && S.result.LED; if (LED) document.getElementById('cohort-hm').innerHTML = cohortHeatmap(LED, mode);
}

/* ── Forensics ── */
function paneForensics(R) {
  const LED = R.LED;
  const intro = `<p class="pg-desc" style="margin-bottom:14px">Tests an auditor would run on the revenue data. None of them is proof of anything; each tells you where to look, and each states its own limits.</p>`;
  if (!LED) return intro + `<div class="empty-card"><h4>Forensics need the customer ledger</h4><p>The tests look at customer-level billing — spikes before a raise, one-off charges booked as recurring, duplicate logos, quarter-end pull-forward and the first-digit distribution. Load a ledger on the source material step.</p>
    <button class="btn btn-primary btn-sm" onclick="showPage('intake')">Add a ledger</button></div>`;
  const bf = (R.forensics.find(f => f.id === 'benford') || {}).bf;
  return intro + `<div class="fx-list">${R.forensics.map(f => `
    <div class="fx ${f.status}"><div class="fx-h"><span class="fx-i" aria-hidden="true">${STATUS_ICON[f.status]}</span><strong>${esc(f.title)}</strong><span class="fx-st">${esc(STATUS_LABEL[f.status])}</span></div>
      <div class="fx-stat m">${esc(f.stat)}</div>
      <p>${esc(f.detail)}</p>
      <details><summary>Method and limits</summary><p><b>Method.</b> ${esc(f.method)}</p><p><b>Limits.</b> ${esc(f.caveat)}</p></details>
      ${f.ask ? `<div class="ask">${esc(f.ask)}</div>` : ''}
      ${f.id === 'benford' && bf && bf.prop ? `<div style="margin-top:10px">${f.status === 'na' ? '<p class="field-hint" style="margin-bottom:6px">Shown for reference only — the test does not apply to this data.</p>' : ''}${chartBars(bf.prop.map((p, i) => ({ l:String(i + 1), v:p * 100, dot:BENFORD[i] * 100,
        tip:`Digit ${i + 1}: observed ${fmtPct(p * 100)} · Benford ${fmtPct(BENFORD[i] * 100)}` })), { h:180, fmt:v => v + '%', label:'Leading digit distribution' })}
        ${legend([{ c:'var(--c-new)', l:'Observed share' }, { c:'var(--t0)', l:'Benford expectation (dot)' }])}</div>` : ''}
    </div>`).join('')}</div>`;
}

/* ── Runway & odds ── */
function paneRunway(R) {
  const { proj } = R, P = proj.P, sim = proj.sim, da = proj.da, A = P.A;
  const missing = [];
  if (P.rev0 == null) missing.push('ARR or monthly revenue');
  if (P.cash0 == null) missing.push('cash on hand');
  if (P.exp0 == null) missing.push('net monthly burn');
  if (P.g == null) missing.push('a growth rate (ARR 12 months ago, a ledger, or monthly financials)');
  const inp = (id, label, val, step, hint) => `<label class="asm"><span>${esc(label)}</span><input type="number" step="${step}" value="${val == null ? '' : +(+val).toFixed(3)}" data-asm="${id}"><em>${esc(hint || '')}</em></label>`;
  const controls = `<div class="asm-grid">
    ${inp('gOverride', 'Monthly revenue growth, %', P.g, '0.1', P.gSrc)}
    ${inp('egOverride', 'Monthly expense growth, %', P.eg, '0.1', P.egSrc)}
    ${inp('sdOverride', 'Growth volatility, % pts', P.sd, '0.1', P.sdSrc)}
    ${inp('decay', 'Growth decay per month, %', A.decay, '0.5', 'growth rate shrinks by this much each month')}
    ${inp('milestone', 'Next-stage ARR bar', P.milestone, '100000', A.milestone != null ? 'your override' : 'default for the next stage')}
    ${inp('horizon', 'Horizon, months', A.horizon, '6', '12 to 60')}
  </div>
  <div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-primary btn-sm" onclick="applyAssumptions()">Re-run simulation</button><button class="btn btn-ghost btn-sm" onclick="resetAssumptions()">Reset to evidence</button></div>`;
  if (missing.length) return `<div class="empty-card"><h4>Projections need ${esc(missing.join(', '))}</h4><p>Fill these on the evidence form, or load monthly financials, and the default-alive test and the simulation run automatically.</p></div>`;
  const daCard = da ? `<div class="da ${da.alive ? 'alive' : 'dead'}"><div class="da-v">${da.alive ? 'Default alive' : 'Default dead'}</div>
    <p>${da.alive ? `At ${fmtPct(P.g)} monthly revenue growth and ${fmtPct(P.eg)} monthly expense growth, revenue overtakes expenses in <b>${da.months} months</b>, with cash bottoming at ${money(da.low)}.`
      : `At ${fmtPct(P.g)} monthly revenue growth and ${fmtPct(P.eg)} monthly expense growth, the cash runs out ${da.deadAt ? `in <b>month ${da.deadAt}</b>` : ''} before revenue catches expenses.${da.needed != null ? ` Reaching breakeven at this pace needs about <b>${money(da.needed)}</b> more.` : ' At this pace expenses never cross revenue within ten years.'}`}</p>
    <p class="field-hint">Paul Graham’s test: constant growth, no new money. The simulation below relaxes both assumptions.</p></div>` : '';
  if (!sim) return daCard + controls;
  const rw = sim.runway;
  return `${daCard}
    <div class="block-title" style="margin-top:20px">Simulation — ${sim.N.toLocaleString('en-US')} paths over ${sim.H} months</div>
    <div class="kpi-grid">
      ${tile('Reach the bar before cash-out', fmtProb(sim.pMilestone), `${money(sim.milestone)} ARR`, sim.pMilestone < 0.35 ? 'bad' : sim.pMilestone > 0.7 ? 'good' : 'warn')}
      ${tile('…with 6 months of runway left', fmtProb(sim.pFundable), 'a fundable position')}
      ${tile('Cash-out before the bar', fmtProb(sim.pDeath), 'without new money')}
      ${tile('Breakeven within horizon', fmtProb(sim.pProfitable), 'revenue ≥ expenses')}
      ${tile('Runway, median', rw.p50 > sim.H ? sim.H + '+ mo' : rw.p50 + ' mo', `10th pct ${rw.p10 > sim.H ? sim.H + '+' : rw.p10} · 90th ${rw.p90 > sim.H ? sim.H + '+' : rw.p90}`)}
      ${tile('Extra capital to reach the bar', sim.need50 == null ? 'n/a' : sim.need80 === 0 ? 'none' : money(sim.need50),
        sim.need50 == null ? `only ${fmtProb(sim.needShare)} of paths reach it within ${sim.H} months, even with unlimited capital`
        : sim.need80 === 0 ? 'reached on existing cash' : sim.need80 == null ? 'median case · 80% case does not reach it in time' : `median · 80% confidence ${money(sim.need80)}`)}
    </div>
    ${R.deal ? `<div class="optbox ${sim.need80 != null && R.deal.I.round >= sim.need80 ? 'good' : 'bad'}" style="margin-top:12px">${roundVsNeed(R.deal.I.round, sim)}</div>` : ''}
    <div class="block-title" style="margin-top:22px">ARR paths</div>
    ${chartFan(sim.fan, 'r', { ref:sim.milestone, refLabel:'next-stage bar', label:'Simulated ARR' })}
    <div class="block-title" style="margin-top:22px">Cash paths (no new money)</div>
    ${chartFan(sim.fan, 'c', { ref:0, refLabel:'zero cash', color:'var(--c-cash)', label:'Simulated cash' })}
    <div class="block-title" style="margin-top:22px">When the cash runs out</div>
    ${chartBars(sim.hist.map(b => ({ l:b.survived ? `${sim.H}+` : `${b.lo}–${b.hi}`, v:b.n / sim.N * 100, c: b.survived ? 'var(--c-exp)' : 'var(--c-churn)',
      tip:`${b.survived ? 'Still funded at month ' + sim.H : 'Cash-out in months ' + b.lo + '–' + b.hi}: ${fmtPct(b.n / sim.N * 100)} of paths` })), { fmt:v => v + '%', label:'Runway distribution', h:190 })}
    <div class="block-title" style="margin-top:22px">Assumptions — edit and re-run</div>
    ${controls}
    <p class="field-hint" style="margin-top:8px">Each month, growth = the starting rate × (1 − decay)^month + volatility × a random normal draw; expenses grow at their rate with noise. Cash-out is the first month cash goes below zero. The random stream is seeded from the run hash, so the same inputs give the same odds.</p>`;
}
function roundVsNeed(round, sim) {
  const bar = money(sim.milestone);
  if (sim.need50 == null) return `Fewer than half of the simulated paths reach ${bar} ARR within ${sim.H} months even with unlimited capital, so on the current trajectory no round size makes the milestone likely. The case rests on changing the growth rate, not on funding it.`;
  if (sim.need80 == null) return `The proposed round of ${money(round)} ${round < sim.need50 ? 'is below the median capital needed' : 'covers the median case'} to reach ${bar} ARR with six months of runway left, but in the 80% case the bar is not reached within ${sim.H} months at all.`;
  if (sim.need80 === 0) return `The company reaches ${bar} ARR on existing cash in at least 80% of simulated paths; the proposed ${money(round)} is growth capital, not survival capital.`;
  return `The proposed round of ${money(round)} ${round < sim.need50 ? 'is below the median capital needed' : round < sim.need80 ? 'covers the median case but not the 80% case' : 'covers the capital needed in at least 80% of simulated paths'} to reach ${bar} ARR with six months of runway left.`;
}
function applyAssumptions() {
  const a = Object.assign({}, S.assume || {});
  document.querySelectorAll('[data-asm]').forEach(i => {
    const k = i.dataset.asm, v = parseFloat(i.value);
    if (!isFinite(v)) { delete a[k]; return; }
    if (k === 'horizon') a[k] = clamp(Math.round(v), 12, 60);
    else if (k === 'decay') a[k] = clamp(v, 0, 25);
    else a[k] = v;
  });
  S.assume = a; saveDraft();
  S.result = Object.assign(assessAll(), { memo:S.result && S.result.memo });
  _rtab = 'runway'; renderResult(S.result); toast('Simulation re-run with your assumptions.');
}
function resetAssumptions() { S.assume = {}; saveDraft(); S.result = Object.assign(assessAll(), { memo:S.result && S.result.memo }); _rtab = 'runway'; renderResult(S.result); }

/* ── Deal & returns ── */
function paneDeal(R) {
  const X = R.deal;
  if (!X) { const di = SECTIONS.findIndex(s => s.deal);
    if (di < 0 || sectionHidden(SECTIONS[di])) return `<div class="suppressed">Deal pricing is switched off on this site.</div>`;
    return `<div class="empty-card"><h4>Enter the proposed terms to price the deal</h4><p>Round size and pre-money are enough to start. Add your cheque, the pool requirement, SAFE terms and your fund size for ownership at exit, the fund-returner test and the full liquidation waterfall.</p>
    <button class="btn btn-primary btn-sm" onclick="jumpTo(SECTIONS.findIndex(s=>s.deal))">Open Round & returns</button></div>`; }
  const I = X.I;
  const capRows = [
    ['This round', X.fNew, I.check > 0 ? `your cheque ${money(I.check)} = ${fmtPct(X.ownEntry * 100, 2)}` : ''],
    ['Converting SAFEs', X.fSafe, X.vEff ? `convert at ${money(X.vEff)}` : ''],
    ['Converting notes', X.fNote || 0, X.vNote ? `${money(I.notes)} with interest, convert at ${money(X.vNote)}` : ''],
    ['Prior investors', X.fPrior, X.priorEstimated ? 'estimated' : ''],
    ['Existing option pool', X.fPoolOld, ''],
    ['Pool top-up', X.fTop, 'carved from the pre-money'],
    ['Founders and common', X.fCommon, ''],
  ].filter(r => r[1] > 0.0001);
  const marks = [{ x:X.P, l:'post-money' }];
  if (X.fundReturner) marks.push({ x:X.fundReturner, l:'returns the fund' });
  return `
    <div class="kpi-grid">
      ${tile('Post-money', money(X.P), `pre ${money(I.pre)} + ${money(I.round)}`)}
      ${tile('Your ownership', X.ownEntry != null ? fmtPct(X.ownEntry * 100, 2) : '—', X.ownExit != null ? `${fmtPct(X.ownExit * 100, 2)} at exit after ${I.rounds} rounds` : 'enter your cheque')}
      ${tile('Effective pre-money', money(X.effPre), `${fmtPct((1 - X.effPre / I.pre) * 100, 1)} below headline`, X.effPre < I.pre * 0.9 ? 'warn' : '')}
      ${tile('Entry multiple', X.entryMult != null ? fmtX(X.entryMult) + ' ARR' : '—', X.growthAdj != null ? `${numv(X.growthAdj)} growth-adjusted` : null)}
      ${tile('Exit to return the fund', X.fundReturner != null ? money(X.fundReturner) : '—', I.fund ? `fund ${money(I.fund)}` : 'enter your fund size')}
      ${tile('ARR that exit requires', X.arrForFund != null ? money(X.arrForFund) : '—', X.tamShare != null ? `${fmtPct(X.tamShare, X.tamShare < 10 ? 1 : 0)} of bottom-up TAM at ${fmtX(I.exitMult)}` : `at ${fmtX(I.exitMult)} ARR`, X.tamShare > 30 ? 'bad' : X.tamShare > 10 ? 'warn' : X.tamShare != null ? 'good' : '')}
      ${tile('Exit for 3x your cheque', X.threeX != null ? money(X.threeX) : '—', 'after dilution to exit')}
      ${tile('Ownership kept to exit', fmtPct(X.retain * 100, 0), `${I.rounds} rounds × ${I.dil}% dilution`)}
    </div>
    ${X.notes.length ? `<div class="optbox" style="margin-top:12px">${X.notes.map(esc).join('<br>')}</div>` : ''}
    <div class="block-title" style="margin-top:22px">Capitalisation after the round (fully diluted)</div>
    <div class="tbl-wrap"><table class="ledger"><thead><tr><th>Holder</th><th style="text-align:right">Stake</th><th>Note</th></tr></thead>
      <tbody>${capRows.map(r => `<tr><td>${esc(r[0])}</td><td class="m" style="text-align:right">${fmtPct(r[1] * 100, 2)}</td><td style="color:var(--t2);font-size:11px">${esc(r[2])}</td></tr>`).join('')}</tbody></table></div>
    <div class="block-title" style="margin-top:22px">Who gets what at each exit value</div>
    ${chartPayoff(X.curve, [{ k:'us', l:'Your cheque', c:'var(--c-new)' }, { k:'common', l:'Founders & common', c:'var(--c2)' }, { k:'prior', l:'Prior investors', c:'var(--c-exp)' }], { marks, label:'Liquidation payoff by exit value' })}
    <div class="tbl-wrap" style="margin-top:12px"><table class="ledger"><thead><tr><th>Exit value</th><th style="text-align:right">Your proceeds</th><th style="text-align:right">Multiple</th><th style="text-align:right">Founders & common</th><th style="text-align:right">Prior investors</th>${X.I.debt ? '<th style="text-align:right">Debt</th>' : ''}</tr></thead>
      <tbody>${X.table.map(t => `<tr><td class="m">${money(t.x)}${t.x === X.fundReturner ? ' <span class="pill">fund-returner</span>' : ''}</td><td class="m" style="text-align:right">${money(t.us)}</td><td class="m" style="text-align:right">${t.moic != null ? fmtX(t.moic, 2) : '—'}</td><td class="m" style="text-align:right">${money(t.common)}</td><td class="m" style="text-align:right">${money(t.prior)}</td>${X.I.debt ? `<td class="m" style="text-align:right">${money(t.debt)}</td>` : ''}</tr>`).join('')}</tbody></table></div>
    <p class="field-hint" style="margin-top:8px">Conventions: pre-money includes SAFE and note conversion and any pool top-up; SAFEs convert as post-money SAFEs, notes on the pre-money with simple accrued interest, each at the lower of cap and discounted price; preferred series are pari passu and ${I.newPart || I.priorPart ? 'participating where flagged' + (I.newPartCap ? ` (this round capped at ${numv(I.newPartCap)}x)` : '') : 'non-participating'}, each choosing the better of its preference or converting; debt is paid first. Exit multiple, future rounds and dilution are your assumptions.</p>
    <div id="deal-returns">${returnsHTML(X)}</div>
    <div id="deal-terms">${termsHTML(X)}</div>`;
}
function termsHTML(X) {
  const T = X.terms || [];
  const flagTxt = { ok:'market', watch:'watch', off:'off-market' };
  return `<div class="block-title" style="margin-top:26px">Term-sheet review <span class="field-group-hint">each term against the market-standard version</span></div>
    ${T.length > 1 || (T[0] && T[0].flag !== 'ok') ? `<div class="tbl-wrap"><table class="ledger terms-tbl"><thead><tr><th>Term</th><th>This round</th><th>Market standard</th><th>Read</th></tr></thead><tbody>
      ${T.map(t => `<tr class="t-${t.flag}"><td>${esc(t.term)}</td><td class="m">${esc(t.value)}</td><td style="color:var(--t2)">${esc(t.norm)}</td><td><span class="tflag ${t.flag}">${flagTxt[t.flag]}</span><div class="field-hint">${esc(t.note)}</div></td></tr>`).join('')}</tbody></table></div>
      <p class="field-hint" style="margin-top:6px">Market standard follows the NVCA model documents and the YC Series A template. Terms you have not entered are left out.</p>`
    : `<div class="empty-card"><h4>Add the term sheet</h4><p>Anti-dilution, dividends, redemption, pay-to-play, board control and your rights are in Round &amp; returns → Term sheet. Each is compared with the market-standard version.</p></div>`}`;
}
function returnsHTML(X) {
  const Rt = X.returns;
  if (!Rt) return '';
  if (Rt.missing) return `<div class="block-title" style="margin-top:26px">Returns — VC Method and First Chicago</div>
    <div class="empty-card"><h4>An exit case is needed</h4><p>Enter today’s ARR and its growth, or a base-case ARR at exit in Exit scenarios, to compute the return this price produces.</p>
    ${(() => { const ei = SECTIONS.findIndex(s => s.id === 'exits'); return ei >= 0 && !sectionHidden(SECTIONS[ei]) ? `<button class="btn btn-ghost btn-sm" onclick="jumpTo(${ei})">Open Exit scenarios</button>` : ''; })()}</div>`;
  const who = Rt.who === 'us' ? 'your cheque' : 'the round as a whole';
  const nm = { downside:'Downside', base:'Base', upside:'Upside' };
  const cls = v => v == null ? '' : v >= Rt.r ? 'good' : v >= Rt.r * 0.6 ? 'warn' : 'bad';
  const vs = d => d >= 0 ? `${fmtPct(d * 100, 0)} above the ${money(X.P)} offered` : `${fmtPct(-d * 100, 0)} below the ${money(X.P)} offered`;
  return `<div class="block-title" style="margin-top:26px">Returns — VC Method and First Chicago <span class="field-group-hint">for ${who}</span></div>
    <div class="kpi-grid">
      ${tile('Success (upside) case', fmtX(Rt.cases[2].moic, 1), `${fmtPct(Rt.cases[2].irr, 0)} IRR against a ${fmtPct(Rt.r, 0)} target`, cls(Rt.cases[2].irr))}
      ${tile('Base case', fmtX(Rt.cases[1].moic, 1), `${fmtPct(Rt.cases[1].irr, 0)} IRR over ${Rt.years} years`)}
      ${tile('Probability-weighted', fmtX(Rt.expMoic, 1), `${fmtPct(Rt.expIrr, 0)} IRR implied`)}
      ${tile('Exit needed for the target', Rt.exitForTarget != null ? money(Rt.exitForTarget) : '—', `${fmtPct(Rt.r, 0)} a year for ${Rt.years} years`)}
      ${tile('VC Method post-money', money(Rt.justifiedPost), `success case at ${fmtPct(Rt.r, 0)} · ${vs(Rt.priceVsVc)}`, Rt.priceVsVc < -0.25 ? 'bad' : Rt.priceVsVc < 0 ? 'warn' : 'good')}
      ${tile('First Chicago post-money', money(Rt.fcPost), `probability-weighted at ${fmtPct(Rt.fc, 0)} · ${vs(Rt.priceVsFc)}`, Rt.priceVsFc < -0.25 ? 'bad' : Rt.priceVsFc < 0 ? 'warn' : 'good')}
    </div>
    <div class="tbl-wrap" style="margin-top:12px"><table class="ledger"><thead><tr><th>Case</th><th style="text-align:right">Probability</th><th style="text-align:right">ARR at exit</th><th style="text-align:right">Exit value</th><th style="text-align:right">Proceeds</th><th style="text-align:right">Multiple</th><th style="text-align:right">IRR</th></tr></thead>
      <tbody>${Rt.cases.map(c => `<tr><td>${nm[c.name]}${c.estimated ? ' <span class="pill">estimate</span>' : ''}</td><td class="m" style="text-align:right">${fmtPct(c.prob * 100, 0)}</td><td class="m" style="text-align:right">${c.arr != null ? money(c.arr) : '—'}</td><td class="m" style="text-align:right">${money(c.ev)}</td><td class="m" style="text-align:right">${money(c.proceeds)}</td><td class="m" style="text-align:right">${c.moic != null ? fmtX(c.moic, 2) : '—'}</td><td class="m" style="text-align:right">${c.irr != null ? fmtPct(c.irr, 0) : '—'}</td></tr>`).join('')}
      <tr class="tot"><td>Probability-weighted</td><td class="m" style="text-align:right">100%</td><td></td><td class="m" style="text-align:right">${money(Rt.expEv)}</td><td></td><td class="m" style="text-align:right">${fmtX(Rt.expMoic, 2)}</td><td class="m" style="text-align:right">${fmtPct(Rt.expIrr, 0)}</td></tr></tbody></table></div>
    <p class="field-hint" style="margin-top:6px">Base and upside use your ownership after ${X.I.rounds} further rounds at ${X.I.dil}% dilution, as converted, at ${fmtX(X.I.exitMult)} ARR. The downside runs through the entry waterfall, where the preference does its work, over ${Rt.cases[0].years} years. ${Rt.estimated.length ? `Estimated (edit in Exit scenarios): ${Rt.estimated.join(', ')}${Rt.estimated.includes('base') ? ` — today’s ARR grown from ${fmtPct(Rt.growthUsed, 0)} a year, with growth decaying ${Math.round((1 - EXIT_DEFAULTS.keepBase) * 100)}% a year (${Math.round((1 - EXIT_DEFAULTS.keepUp) * 100)}% in the upside)` : ''}. ` : ''}${Rt.probsPartial ? 'Probabilities left blank take the stage defaults, and all three are rescaled to 100%. ' : ''}${Rt.probsEstimated ? `Probabilities are the ${esc(STAGES.find(s => s.id === S.stage).n)} defaults (${Rt.cases.map(c => fmtPct(c.prob * 100, 0)).join(' / ')}), which lean on the downside as venture outcomes do. ` : ''}The VC Method discounts the success-case exit at the target return, which is high because it carries the risk of failure; the First Chicago Method weights the three cases by probability and discounts them at a lower rate (${fmtPct(Rt.fc, 0)}).</p>`;
}

/* ── Published benchmarks: reference data the owner adds in the Studio ── */
function benchRows(R) {
  const D = R.D;
  return (CFG.benchmarks || []).filter(b => (b.stage === 'all' || b.stage === S.stage) && !cfgHidden('metrics', b.metric)).map(b => {
    const v = D[b.metric] != null ? D[b.metric] : gv(b.metric);
    const cm = CFG.metrics.find(m => m.key === b.metric);
    const dir = (RUBRIC.thresholds[b.metric] || {}).dir === 'lo' || (cm && cm.dir === 'lo') ? 'lo' : 'hi';
    let pos = null;
    if (v != null) {
      const { p25, median, p75 } = b;
      if (v === median) pos = 'at the median';
      else if (dir === 'hi') pos = p75 != null && v >= p75 ? 'top quartile' : v > median ? 'above the median' : p25 != null && v <= p25 ? 'bottom quartile' : 'below the median';
      else pos = p25 != null && v <= p25 ? 'top quartile' : v < median ? 'above the median' : p75 != null && v >= p75 ? 'bottom quartile' : 'below the median';
    }
    return { b, v, dir, pos, label:DLABEL[b.metric] || (ALL_FIELDS().find(f => f.id === b.metric) || {}).lbl || b.metric };
  });
}
function publishedBenchHTML(R) {
  const rows = benchRows(R);
  if (!rows.length) return '';
  const f = (k, v) => v == null ? '—' : DUNIT[k] ? dfmt(k, v) : String(Math.round(v * 100) / 100);
  return `<div class="block-title">Published benchmarks <span class="field-group-hint">reference data added by the owner of this site</span></div>
    <div class="tbl-wrap" style="margin-bottom:22px"><table class="ledger"><thead><tr><th>Metric</th><th style="text-align:right">This company</th><th style="text-align:right">25th pct</th><th style="text-align:right">Median</th><th style="text-align:right">75th pct</th><th>Where it sits</th><th>Source</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(r.label)}${r.b.stage !== 'all' ? '' : ' <span class="pill">all stages</span>'}</td><td class="m" style="text-align:right">${esc(f(r.b.metric, r.v))}</td>
      <td class="m" style="text-align:right">${esc(f(r.b.metric, r.b.p25))}</td><td class="m" style="text-align:right">${esc(f(r.b.metric, r.b.median))}</td><td class="m" style="text-align:right">${esc(f(r.b.metric, r.b.p75))}</td>
      <td style="color:${r.pos == null ? 'var(--t2)' : /top|above/.test(r.pos) ? 'var(--green)' : /bottom/.test(r.pos) ? 'var(--red)' : 'var(--amber)'}">${r.pos ? esc(r.pos) : 'no value'}</td>
      <td style="color:var(--t2);font-size:11px">${esc(r.b.source || '')}${r.b.year ? ' (' + esc(r.b.year) + ')' : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

/* ── Benchmarks ── */
function paneBench(R) {
  const B = R.bench;
  const cal = B.calibrated;
  const drift = B.drift;
  const head = `<p class="pg-desc" style="margin-bottom:14px">Where this company sits among the deals in your own library (${B.total} saved). Percentiles are “better than”, so lower-is-better metrics are flipped. ${cal.on && cal.used.length ? `Scores are calibrated on your library (rubric ${esc(R.sc.rubric)}).` : ''}</p>`;
  const ranked = B.rows.filter(r => r.pct != null);
  const body = B.total < 5 ? `<div class="empty-card"><h4>Your library is still small</h4><p>Save runs to the library, import comparables from CSV, or paste them in any format and let a model structure them. At five comparable deals the percentiles switch on; at ${CAL_MIN} per stage you can calibrate the rubric on your own data.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" onclick="saveRunToLibrary()">Save this run</button><button class="btn btn-ghost btn-sm" onclick="goLibrary()">Open the library</button></div></div>`
    : percentileHTML(B.rows) + (ranked.length ? '' : '<p class="field-hint">No metric has five comparable deals yet.</p>');
  const fmtField = (k, v) => { if (v == null) return '—'; const f = ALL_FIELDS().find(x => x.id === k) || {};
    return f.unit === '$' ? money(v) : f.unit === '%' ? fmtPct(v) : f.unit === 'months' ? fmtMo(v) : f.unit === 'x' ? fmtX(v, 2) : String(Math.round(v * 100) / 100); };
  let dr = '';
  if (drift) {
    const moved = drift.metrics.filter(x => Math.abs(x.now - x.was) > Math.max(1e-6, Math.abs(x.was) * 0.005));
    const restated = drift.stated.filter(x => x.was !== x.now);
    dr = `<div class="block-title" style="margin-top:24px">Since the last assessment (${esc(drift.prev.date)})</div>
    ${moved.length ? `<div class="tbl-wrap"><table class="ledger"><thead><tr><th>Metric</th><th style="text-align:right">Then</th><th style="text-align:right">Now</th><th style="text-align:right">Change</th></tr></thead>
    <tbody>${moved.map(x => `<tr><td>${esc(x.m.label)}</td><td class="m" style="text-align:right">${esc(libFmt(x.m, x.was))}</td><td class="m" style="text-align:right">${esc(libFmt(x.m, x.now))}</td><td class="m" style="text-align:right;color:${(x.now - x.was) * (x.m.dir === 'lo' ? -1 : 1) >= 0 ? 'var(--green)' : 'var(--red)'}">${x.m.unit === '$' ? (x.now >= x.was ? '+' : '−') + money(Math.abs(x.now - x.was)) : fmtSigned(x.now - x.was, 1)}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="suppressed">No computed metric has moved since ${esc(drift.prev.date)}.</div>`}
    ${restated.length ? `<div class="block-title" style="margin-top:18px">Stated figures that changed</div>
      <div class="tbl-wrap"><table class="ledger"><thead><tr><th>Stated figure</th><th style="text-align:right">Then</th><th style="text-align:right">Now</th></tr></thead>
      <tbody>${restated.map(x => `<tr><td>${esc((ALL_FIELDS().find(f => f.id === x.k) || {}).lbl || x.k)}</td><td class="m" style="text-align:right">${esc(fmtField(x.k, x.was))}</td><td class="m" style="text-align:right">${esc(fmtField(x.k, x.now))}</td></tr>`).join('')}</tbody></table></div>
      <p class="field-hint" style="margin-top:6px">A stated metric that moves while the computed one does not usually means the definition changed between updates.</p>`
      : drift.stated.length ? `<p class="field-hint" style="margin-top:8px">The company describes itself with the same headline figures as last time.</p>` : ''}`;
  }
  return publishedBenchHTML(R) + head + body + dr;
}

/* ── Scoring ── */
function paneScoring(R) {
  const { sc, sens } = R;
  const dimRows = sc.dimensions.map(d => `
    <tr><td>${esc(d.label)}${d.notes.length ? `<div style="font-size:10px;color:var(--t2);margin-top:3px">${d.notes.map(n => (n.good ? '+ ' : '− ') + esc(n.note)).join('<br>')}</div>` : ''}</td>
      <td class="n">${(d.weight * 100).toFixed(0)}%</td><td class="n">${Math.round(d.coverage * 100)}%</td>
      <td class="n" style="color:${sColor(d.score)}">${d.score == null ? '—' : d.score}</td>
      <td style="width:110px"><div class="minibar"><i style="width:${d.score || 0}%;background:${sColor(d.score)}"></i></div></td></tr>`).join('');
  return `
    <p class="pg-desc" style="margin-bottom:14px">Weights are set by stage, not by how many fields happened to be filled. Coverage and evidence strength are shown separately from the score so a thin or unverified dimension cannot masquerade as a confident one.${sc.gates.length ? ' A gate is open, so the headline score is withheld; the dimension scores are shown for diagnosis.' : ''}</p>
    <div class="tbl-wrap"><table class="dimtbl">
      <thead><tr><th>Dimension</th><th style="text-align:right">Weight</th><th style="text-align:right">Coverage</th><th style="text-align:right">Score</th><th></th></tr></thead>
      <tbody>${dimRows}</tbody></table></div>
    <div class="block-title" style="margin-top:22px">Which inputs move the score (±15% each)</div>
    ${sens ? tornadoHTML(sens.tornado) : '<div class="suppressed">Not enough scored inputs.</div>'}
    ${sens && sens.gains.length ? `<div class="block-title" style="margin-top:22px">Biggest single improvements</div>
      <div class="tbl-wrap"><table class="ledger"><thead><tr><th>Metric</th><th>Today</th><th>Good bar</th><th style="text-align:right">Score gain</th></tr></thead>
      <tbody>${sens.gains.map(g => `<tr><td>${esc(g.label)}</td><td class="m">${esc(g.from)}</td><td class="m">${esc(g.to)}</td><td class="m" style="text-align:right;color:var(--green)">+${g.gain.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="runmeta">
      <span>Rubric</span> ${esc(sc.rubric)} (${RUBRIC.updated}) &nbsp;·&nbsp; <span>Stage profile</span> ${esc(S.stage)} &nbsp;·&nbsp; <span>Run</span> ${esc(R.hash)}<br>
      <span>Method</span> each metric is mapped onto its stage anchors [poor, acceptable, good, excellent] → [0, 45, 72, 100] and weighted inside its dimension. Dimensions are combined at the stage weights, with a dimension below 50% coverage carrying proportionally less than its full weight. Booleans adjust a dimension by at most ±15. Metrics below the sample size where they carry signal are excluded rather than scored. The confidence band widens with thin coverage, material contradictions and weak evidence sources. The same inputs and rubric version always produce this exact score.
    </div>`;
}

/* ── Questions ── */
function paneQuestions(R) {
  return `<p class="pg-desc" style="margin-bottom:14px">Ordered by what would most change the decision: gates, contradictions, risk patterns and forensic signals, then evidence gaps.</p>
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" onclick="founderEmail()">Draft the founder email</button><button class="btn btn-ghost btn-sm" onclick="copyText(S.result.questions.map((q,i)=>(i+1)+'. '+q.text).join('\\n'),'Questions copied.')">Copy as a list</button></div>
    <div class="qlist">${R.questions.map((q, i) => `<div class="qitem"><div class="qnum">${i + 1}</div><div class="qtext">${esc(q.text)}<span class="qtag">${esc(q.tag)}</span></div></div>`).join('')}</div>`;
}

/* ── All metrics ── */
function paneMetrics(R) {
  const { D, F, sc } = R;
  const metricRows = sc.dimensions.flatMap(d => d.metrics.map(m => `
    <tr class="${m.suppressed ? 'warn' : ''}"><td>${esc(m.label)}${m.calibrated ? ' <span class="pill">calibrated</span>' : ''}</td><td class="m">${esc(m.value)}</td>
      <td class="m" style="color:var(--t2)">${esc(m.bench || '—')}${m.note ? ` <span class="pill" data-tip="${tipAttr(esc(m.note))}">why</span>` : ''}</td>
      <td class="n" style="color:${m.score == null ? 'var(--t2)' : sColor(m.score)}">${m.score == null ? 'not scored' : m.score}</td>
      <td class="m" style="color:var(--t2)">${m.evidence != null ? Math.round(m.evidence * 100) + '%' : ''}</td>
      <td style="color:var(--t2);font-size:10.5px">${esc(m.suppressed || DIM_LABEL[d.id])}</td></tr>`)).join('');
  const derivedRows = Object.keys(D).filter(k => DLABEL[k]).map(k => `<tr><td>${esc(DLABEL[k])}</td><td class="m">${esc(dfmt(k, D[k]))}</td><td style="color:var(--t2);font-size:10.5px">${esc(F[k] || '')}</td></tr>`).join('');
  return `<div class="block-title">Scored against stage thresholds</div>
    <div class="tbl-wrap"><table class="ledger"><thead><tr><th>Metric</th><th>Value</th><th>Bar</th><th style="text-align:right">Score</th><th>Evidence</th><th>Note</th></tr></thead>
      <tbody>${metricRows || '<tr><td colspan="6" style="color:var(--t2)">No metrics could be scored from the inputs provided.</td></tr>'}</tbody></table></div>
    <div class="block-title" style="margin-top:22px">Everything computed, with its formula</div>
    <p style="font-size:11.5px;color:var(--t2);margin-bottom:10px">None of these was typed in. Each is derived from the primitives or the ledger, which is why a company cannot improve its score by reporting a flattering version of a headline metric.</p>
    <div class="tbl-wrap"><table class="ledger"><thead><tr><th>Metric</th><th>Value</th><th>Formula</th></tr></thead><tbody>${derivedRows}</tbody></table></div>`;
}

/* ── Consistency ledger ── */
function paneLedger(R) {
  const { checks } = R;
  const okRows = checks.filter(c => c.sev === 'ok').map(c => `<tr><td>${esc(c.title)}</td><td class="m">${esc(c.stated)}</td><td class="m">${esc(c.computed)}</td><td style="color:var(--green)">${esc(c.delta)}</td></tr>`).join('');
  const badRows = checks.filter(c => c.sev !== 'ok').map(c => `<tr class="${c.sev === 'major' ? 'bad' : 'warn'}"><td>${esc(c.title)}</td><td class="m">${esc(c.stated)}</td><td class="m">${esc(c.computed)}</td><td style="color:${c.sev === 'major' ? 'var(--red)' : 'var(--amber)'}">${esc(c.delta)}</td></tr>`).join('');
  return `<div class="tbl-wrap"><table class="ledger"><thead><tr><th>Check</th><th>Stated / entered</th><th>Computed by Radar</th><th>Result</th></tr></thead>
    <tbody>${badRows}${okRows}${!checks.length ? '<tr><td colspan="4" style="color:var(--t2)">No checks could run. Fill “What the company states” or load a customer ledger to enable the comparison layer.</td></tr>' : ''}</tbody></table></div>`;
}
