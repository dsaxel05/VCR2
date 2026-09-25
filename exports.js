
/* ═══════════════════════════════════════════════════════════════
   EXPORTS — IC memo (print / PDF), founder email, JSON, Markdown
   ═══════════════════════════════════════════════════════════════ */
const GATE_ASK = {
  ip_assignments:'Could you share executed IP assignment agreements for every current and former employee and contractor?',
  contractor_ip:'Could you confirm, with the agreements, that no contractor retains rights to the core technology?',
  chain_title:'Could you walk us through the chain of title for the IP, including any predecessor entity, university licence or acquired code?',
  captable_documented:'Could you share the fully documented cap table, including any promised but not yet issued equity?',
  taxes_current:'Could you share payroll, income and sales tax filings with proof of payment for the last two years, and quantify anything still outstanding?',
  reconcile:null,
};

/* ── IC memo: a light, print-ready document rendered into #print-root ── */
function printMemo() {
  const R = S.result; if (!R) return;
  document.getElementById('print-root').innerHTML = memoHTML(R);
  setTimeout(() => window.print(), 60);
}
function memoHTML(R) {
  const { D, F, sc, checks, proj, deal, LED, patterns, questions, requests, memo } = R;
  const stageName = STAGES.find(s => s.id === S.stage).n, modelName = modelLabel(S.model);
  const bad = checks.filter(c => c.sev !== 'ok');
  const sim = proj.sim, da = proj.da;
  const kv = rows => `<table class="p-kv">${rows.filter(r => r[1] != null && r[1] !== '—').map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>`;
  const sec = (n, t, body) => body ? `<section><h2><span>${n}</span>${esc(t)}</h2>${body}</section>` : '';
  let n = 0; const N = () => ++n;
  return `
  <header class="p-head">
    <div class="p-kicker">Investment committee memo · draft</div>
    <h1>${esc(S.name)}</h1>
    <div class="p-meta">${esc(stageName)} · ${esc(modelName)} · ${esc(new Date(R.at).toLocaleDateString('en-GB', { year:'numeric', month:'long', day:'numeric' }))}${S.asof ? ' · data as of ' + esc(monthLong(S.asof)) : ''}</div>
    <div class="p-meta">Prepared with VC Risk Radar · rubric ${esc(sc.rubric)} · run ${esc(R.hash)} · evidence strength ${sc.evidence != null ? Math.round(sc.evidence * 100) + '%' : '—'}</div>
  </header>
  ${sec(N(), 'Summary', `
    <div class="p-verdict ${sc.gates.length ? 'blocked' : ''}">${sc.gates.length
      ? `<b>Score withheld.</b> ${sc.gates.length} gate${sc.gates.length === 1 ? '' : 's'} open: ${sc.gates.map(g => esc(g.title)).join('; ')}.`
      : sc.overall != null ? `<b>${sc.overall}/100</b> (likely ${sc.band[0]}–${sc.band[1]}, ${sc.confidence.toLowerCase()} confidence, ${Math.round(sc.coverage * 100)}% rubric coverage).` : 'Not enough scored inputs for a score.'}</div>
    ${kv([
      ['ARR', money(gv('arr_now'))], ['Growth YoY', D.growth_yoy != null ? fmtPct(D.growth_yoy, 0) : null],
      ['Net revenue retention', D.nrr != null ? fmtPct(D.nrr) + (LED ? ' (cohort, ledger)' : '') : null], ['Gross revenue retention', D.grr != null ? fmtPct(D.grr) : null],
      ['Gross margin', D.gross_margin != null ? fmtPct(D.gross_margin) : null], ['Burn multiple', D.burn_multiple != null ? numv(D.burn_multiple) : null],
      ['Runway', D.runway != null ? fmtMo(D.runway) + (D._cashOut ? ', cash-out ~' + monthLabel(D._cashOut) : '') : null],
      ['Odds of reaching the next-stage bar', sim ? `${fmtProb(sim.pMilestone)} (${money(sim.milestone)} ARR, ${sim.N.toLocaleString('en-US')} simulated paths)` : null],
      ['Entry multiple', deal && deal.entryMult != null ? fmtX(deal.entryMult) + ' ARR' : null],
    ])}
    ${patterns.length ? `<h3>Pattern read-out</h3><ul class="p-pat">${patterns.map(p => `<li class="${p.sev}"><b>${p.sev === 'red' ? 'Risk' : p.sev === 'amber' ? 'Watch' : 'Strength'} — ${esc(p.title)}.</b> ${esc(p.why)} <span class="p-ev">${esc(p.evidence.join(' · '))}</span></li>`).join('')}</ul>` : ''}`)}
  ${R.risk && R.risk.some(c => c.items.length) ? sec(N(), 'Risks by type', `<table class="p-tbl"><thead><tr><th>Type</th><th>Signals</th></tr></thead><tbody>${R.risk.filter(c => c.items.length).map(c => `<tr><td><b>${esc(c.label)}</b><br><span class="p-ev">${c.red} risk · ${c.amber} watch</span></td><td>${c.items.map(x => `${x.sev === 'red' ? '▲' : '●'} ${esc(x.title)}`).join('<br>')}</td></tr>`).join('')}</tbody></table>`) : ''}
  ${sec(N(), 'Stated versus computed', bad.length ? `<table class="p-tbl"><thead><tr><th>Check</th><th>Stated</th><th>Computed</th><th>Gap</th></tr></thead><tbody>${bad.map(c => `<tr class="${c.sev}"><td>${esc(c.title)}</td><td>${esc(c.stated)}</td><td>${esc(c.computed)}</td><td>${esc(c.delta)}</td></tr>`).join('')}</tbody></table>
    ${R.opt && R.opt.n >= 3 ? `<p>${R.opt.k} of ${R.opt.n} discrepancies flatter the company${R.opt.p != null ? ` (chance under honest error ${fmtProb(R.opt.p)})` : ''}.</p>` : ''}` : '<p>Every stated figure reconciles with the figure computed from the underlying inputs.</p>')}
  ${LED ? sec(N(), 'Revenue quality — from the customer ledger', `
    ${kv([['Customers × months', `${S.ledger.customers.length} × ${LED.months.length} (${monthLabel(LED.months[0])} – ${monthLabel(LED.months[LED.e])})`],
      ['Ledger ARR', money(LED.arrNow)], ['Cohort NRR / GRR', `${fmtPct(LED.nrrCohort)} / ${fmtPct(LED.grrCohort)}`], ['Waterfall NRR', fmtPct(LED.nrrFlow)],
      ['Logo retention', fmtPct(LED.logoRet, 0)], ['Monthly growth (3m / 12m)', `${fmtPct(LED.cmgr3)} / ${fmtPct(LED.cmgr12)}`],
      ['Concentration (top 1 / 5 / 10)', `${fmtPct(LED.top1, 0)} / ${fmtPct(LED.top5, 0)} / ${fmtPct(LED.top10, 0)}`]])}
    <div class="p-chart">${chartLine(LED.months.map(m => monthLabel(m)), LED.mrr, { label:'MRR', h:190 })}</div>
    <h3>Forensic signals</h3><ul>${R.forensics.map(f => `<li><b>${esc(f.title)}</b> — ${esc(STATUS_LABEL[f.status])}: ${esc(f.stat)}.</li>`).join('')}</ul>`) : ''}
  ${sim || da ? sec(N(), 'Runway and odds', `${da ? `<p><b>${da.alive ? 'Default alive' : 'Default dead'}.</b> ${da.alive ? `Revenue overtakes expenses in ${da.months} months at current growth and spend.` : `Cash runs out${da.deadAt ? ' in month ' + da.deadAt : ''} before revenue catches expenses${da.needed != null ? '; about ' + money(da.needed) + ' more is needed to reach breakeven at this pace' : ''}.`}</p>` : ''}
    ${sim ? kv([['Reach the next-stage bar before cash-out', fmtProb(sim.pMilestone)], ['…with six months of runway left', fmtProb(sim.pFundable)], ['Cash-out before the bar', fmtProb(sim.pDeath)],
      ['Median runway', sim.runway.p50 > sim.H ? sim.H + '+ months' : sim.runway.p50 + ' months'], ['Extra capital to reach the bar (p50 / p80)', sim.need80 === 0 ? 'none — reached on existing cash' : `${sim.need50 == null ? 'not reached in horizon' : money(sim.need50)} / ${sim.need80 == null ? 'not reached in horizon' : money(sim.need80)}`]]) : ''}
    <p class="p-note">Growth ${fmtPct(proj.P.g)} per month (${esc(proj.P.gSrc)}), decaying ${proj.P.A.decay}% a month; expenses ${fmtPct(proj.P.eg)} per month (${esc(proj.P.egSrc)}).</p>`) : ''}
  ${deal ? sec(N(), 'The deal', `${kv([['Round', `${money(deal.I.round)} at ${money(deal.I.pre)} pre-money (post ${money(deal.P)})`],
      ['Effective pre-money', money(deal.effPre)], ['Our ownership', deal.ownEntry != null ? `${fmtPct(deal.ownEntry * 100, 2)} at entry, ${fmtPct(deal.ownExit * 100, 2)} at exit` : null],
      ['Exit to return the fund', deal.fundReturner != null ? money(deal.fundReturner) : null],
      ['ARR that exit requires', deal.arrForFund != null ? `${money(deal.arrForFund)} at ${fmtX(deal.I.exitMult)}${deal.tamShare != null ? ' — ' + fmtPct(deal.tamShare, 1) + ' of bottom-up TAM' : ''}` : null]])}
    <table class="p-tbl"><thead><tr><th>Exit</th><th>Our proceeds</th><th>Multiple</th><th>Founders & common</th></tr></thead><tbody>${deal.table.map(t => `<tr><td>${money(t.x)}</td><td>${money(t.us)}</td><td>${t.moic != null ? fmtX(t.moic, 2) : '—'}</td><td>${money(t.common)}</td></tr>`).join('')}</tbody></table>
    ${deal.returns && !deal.returns.missing ? `<h3>Returns — VC Method and First Chicago</h3>
      <table class="p-tbl"><thead><tr><th>Case</th><th>Probability</th><th>Exit value</th><th>Multiple</th><th>IRR</th></tr></thead><tbody>${deal.returns.cases.map(c => `<tr><td>${esc(c.name[0].toUpperCase() + c.name.slice(1))}${c.estimated ? ' (estimate)' : ''}</td><td>${fmtPct(c.prob * 100, 0)}</td><td>${money(c.ev)}</td><td>${c.moic != null ? fmtX(c.moic, 2) : '—'}</td><td>${c.irr != null ? fmtPct(c.irr, 0) : '—'}</td></tr>`).join('')}
        <tr><td><b>Probability-weighted</b></td><td>100%</td><td>${money(deal.returns.expEv)}</td><td><b>${fmtX(deal.returns.expMoic, 2)}</b></td><td>${fmtPct(deal.returns.expIrr, 0)}</td></tr></tbody></table>
      <p>At a ${fmtPct(deal.returns.r, 0)} target return over ${deal.returns.years} years, the VC Method justifies a post-money of ${money(deal.returns.justifiedPost)} on the success case; the First Chicago Method, at ${fmtPct(deal.returns.fc, 0)}, gives ${money(deal.returns.fcPost)}. The price offered is ${money(deal.P)}.</p>` : ''}
    ${deal.terms && deal.terms.some(t => t.flag !== 'ok') ? `<h3>Terms that differ from market standard</h3><ul>${deal.terms.filter(t => t.flag !== 'ok').map(t => `<li><b>${esc(t.term)}: ${esc(t.value)}</b> (${t.flag === 'off' ? 'off-market' : 'watch'}; standard: ${esc(t.norm)}). ${esc(t.note)}</li>`).join('')}</ul>` : ''}`) : ''}
  ${(() => { const rows = benchRows(R).filter(r => r.v != null); return rows.length ? sec(N(), 'Against published benchmarks', `<table class="p-tbl"><thead><tr><th>Metric</th><th>Company</th><th>Median</th><th>Position</th><th>Source</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td>${esc(DUNIT[r.b.metric] ? dfmt(r.b.metric, r.v) : String(Math.round(r.v * 100) / 100))}</td><td>${esc(DUNIT[r.b.metric] ? dfmt(r.b.metric, r.b.median) : String(r.b.median))}</td><td>${esc(r.pos || '')}</td><td>${esc(r.b.source || '')}${r.b.year ? ' (' + esc(r.b.year) + ')' : ''}</td></tr>`).join('')}</tbody></table>`) : ''; })()}
  ${sec(N(), 'Scoring', `<table class="p-tbl"><thead><tr><th>Dimension</th><th>Weight</th><th>Coverage</th><th>Score</th></tr></thead><tbody>${sc.dimensions.map(d => `<tr><td>${esc(d.label)}</td><td>${(d.weight * 100).toFixed(0)}%</td><td>${Math.round(d.coverage * 100)}%</td><td>${d.score == null ? '—' : d.score}</td></tr>`).join('')}</tbody></table>`)}
  ${memo ? sec(N(), 'Narrative', `<div class="p-narr">${esc(memo).split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}</div><p class="p-note">Drafted by a language model from the computed figures; it did not produce the score.</p>`) : ''}
  ${sec(N(), 'Open questions', `<ol>${questions.slice(0, 18).map(q => `<li>${esc(q.text)} <span class="p-ev">${esc(q.tag)}</span></li>`).join('')}</ol>`)}
  ${sec(N(), 'Documents to request', `<ul>${requests.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`)}
  ${(() => { const c = checklistSummary(); return sec(N(), 'Diligence checklist', `<p>${c.done} of ${c.total} standard ${esc(STAGES.find(s => s.id === S.stage).n)} diligence items received, reviewed or not applicable${c.requested ? `; ${c.requested} requested` : ''}.</p>
    ${c.issues.length ? `<h3>Issues found</h3><ul>${c.issues.map(it => `<li>${esc(it.cat)} — ${esc(it.text)}</li>`).join('')}</ul>` : ''}
    ${c.open.length ? `<h3>Still open</h3><ul class="p-cols">${c.open.map(it => `<li>${esc(it.text)}</li>`).join('')}</ul>` : ''}`); })()}
  ${sec('A', 'Appendix — computed metrics', `<table class="p-tbl small"><thead><tr><th>Metric</th><th>Value</th><th>Formula</th></tr></thead><tbody>${Object.keys(D).filter(k => DLABEL[k]).map(k => `<tr><td>${esc(DLABEL[k])}</td><td>${esc(dfmt(k, D[k]))}</td><td>${esc(F[k] || '')}</td></tr>`).join('')}</tbody></table>`)}
  <footer class="p-foot">Workflow output, not investment advice. Figures are user-supplied or computed from user-supplied files and are not independently verified. Default thresholds are editable calibrations, not market statistics.</footer>`;
}

/* ── Founder email: polite, specific, ready to send ── */
function founderEmail() {
  const R = S.result; if (!R) return;
  const internal = /^(Not yet measurable|Thin evidence|Weak dimension|Missing input)/;
  const asks = [];
  R.sc.gates.forEach(g => { const a = GATE_ASK[g.id] || g.ask; if (a) asks.push(a); });
  R.questions.filter(q => q.p > 0 && !internal.test(q.tag)).forEach(q => { if (!asks.includes(q.text)) asks.push(q.text); });
  const recomputed = R.checks.filter(c => c.sev !== 'ok' && c.rawStated != null).length;
  /* The owner's own questions and requests (added in the Studio) are always included. */
  const mine = new Set(R.questions.filter(q => q.custom).map(q => q.text)), myReq = new Set(CFG.requests.map(r => r.text));
  const topAsks = asks.slice(0, 12).concat(asks.slice(12).filter(a => mine.has(a)));
  const topReqs = R.requests.slice(0, 8).concat(R.requests.slice(8).filter(r => myReq.has(r)));
  const body = `Hi team,

Thank you for sharing the materials on ${S.name}. We have been working through them and would like to move quickly.

${recomputed ? `We rebuilt a few of the headline metrics from the underlying data and landed on different figures in ${recomputed} place${recomputed === 1 ? '' : 's'}. That is usually a question of definitions, so it would help to understand how each one is calculated on your side.\n\n` : ''}A few questions ahead of our next conversation:

${topAsks.map((a, i) => `${i + 1}. ${a}`).join('\n')}

It would also help to receive:

${topReqs.map(r => `- ${r}`).join('\n')}

Happy to jump on a call if it is easier to walk through any of this live.

Best,
`;
  const subject = `${S.name} — follow-up questions`;
  window._emailDraft = { subject, body };
  openModal('Founder email', `<p class="pg-desc" style="margin-bottom:10px">Written to be sent as-is: specific, non-accusatory, and ordered by what matters most. Edit freely.</p>
    <input class="form-inp" id="em-subj" value="${esc(subject)}" style="margin-bottom:8px">
    <textarea class="intake-ta" id="em-body" style="min-height:360px">${esc(body)}</textarea>`,
    [{ label:'Copy', primary:true, onClick:() => copyText(`Subject: ${document.getElementById('em-subj').value}\n\n${document.getElementById('em-body').value}`, 'Email copied.') },
     { label:'Open in mail app', onClick:() => { location.href = `mailto:?subject=${encodeURIComponent(document.getElementById('em-subj').value)}&body=${encodeURIComponent(document.getElementById('em-body').value.slice(0, 1800))}`; } }]);
}

/* ── JSON: the full assessment, re-openable anywhere ── */
function exportAssessment() {
  const R = S.result;
  const out = { kind:'vcr2-assessment', v:4, exported:new Date().toISOString(), rubric:rubricVersion(), run_hash:R ? R.hash : runHash(), payload:draftPayload() };
  if (R) out.summary = { score:R.sc.overall, band:R.sc.band, confidence:R.sc.confidence, gates:R.sc.gates.map(g => g.title),
    checks:R.checks.map(c => ({ id:c.id, sev:c.sev, title:c.title, stated:c.stated, computed:c.computed, delta:c.delta })),
    patterns:R.patterns.map(p => ({ sev:p.sev, title:p.title, evidence:p.evidence })), derived:R.D, formulas:R.F,
    projections:R.proj.sim ? { pMilestone:R.proj.sim.pMilestone, pDeath:R.proj.sim.pDeath, runway:R.proj.sim.runway, need50:R.proj.sim.need50, need80:R.proj.sim.need80 } : null,
    deal:R.deal ? { post:R.deal.P, effPre:R.deal.effPre, ownEntry:R.deal.ownEntry, ownExit:R.deal.ownExit, fundReturner:R.deal.fundReturner } : null,
    questions:R.questions, requests:R.requests };
  downloadFile(`${safeFile(S.name)}-radar-${out.run_hash}.json`, JSON.stringify(out, null, 1), 'application/json');
  toast('Assessment exported. Anyone with Radar can open it with “Open a saved assessment”.');
}
function importAssessment() {
  pickFile('.json', text => {
    try {
      const j = JSON.parse(text);
      const p = j.payload || j;
      if (!p || (!p.vals && !p.name)) throw new Error('not an assessment');
      restorePayload(p); saveDraft(); buildStages(); buildTypes(); renderIntakeStatus(); updateProgress();
      goVerify(); toast(`Opened ${S.name || 'assessment'}.`);
    } catch (e) { toast('That file is not a Radar assessment export.', 'err'); }
  });
}
function copyJSON() {
  if (!S.result) return;
  const R = S.result;
  copyText(JSON.stringify({ company:S.name, rubric:R.sc.rubric, run_hash:R.hash, derived:R.D, checks:R.checks, scoring:R.sc, patterns:R.patterns, questions:R.questions }, null, 2), 'Run copied as JSON.');
}

/* ── Markdown report ── */
function downloadReport() {
  const R = S.result; if (!R) return;
  const { D, F, checks, sc, questions, requests, memo, patterns, proj, deal, LED } = R;
  const stageName = STAGES.find(s => s.id === S.stage).n;
  let md = `# ${S.name} — diligence report\n\n`;
  md += `${stageName} · ${modelLabel(S.model)} · ${new Date(R.at).toLocaleDateString('en-GB')}\n\n`;
  md += `Rubric ${sc.rubric} · run ${R.hash} · ${Math.round(sc.coverage * 100)}% rubric coverage · ${sc.confidence} confidence · evidence strength ${sc.evidence != null ? Math.round(sc.evidence * 100) + '%' : '—'}\n\n`;
  if (sc.gates.length) { md += `## Gates — resolve before terms\n\n`; sc.gates.forEach(g => md += `- **${g.title}.** ${g.why}\n`); md += `\nNo score is published while a gate is open.\n\n`; }
  else if (sc.overall != null) md += `## Score\n\n**${sc.overall}/100**, likely range ${sc.band[0]}–${sc.band[1]}.\n\n`;
  if (patterns.length) { md += `## Patterns\n\n`; patterns.forEach(p => md += `- **${p.sev.toUpperCase()} — ${p.title}.** ${p.why} _(${p.evidence.join('; ')})_\n`); md += '\n'; }
  const bad = checks.filter(c => c.sev !== 'ok');
  if (bad.length) {
    md += `## Stated vs computed\n\n| Check | Stated | Computed | Gap |\n|---|---|---|---|\n`;
    bad.forEach(c => md += `| ${c.title} | ${c.stated} | ${c.computed} | ${c.delta} |\n`);
    md += `\n`;
  }
  if (LED) {
    md += `## Customer ledger\n\n- ${S.ledger.customers.length} customers × ${LED.months.length} months\n- Ledger ARR ${money(LED.arrNow)}; cohort NRR ${fmtPct(LED.nrrCohort)}; waterfall NRR ${fmtPct(LED.nrrFlow)}; GRR ${fmtPct(LED.grrCohort)}\n- Concentration top 1/5/10: ${fmtPct(LED.top1, 0)} / ${fmtPct(LED.top5, 0)} / ${fmtPct(LED.top10, 0)}\n\n`;
    md += `### Forensics\n\n`; R.forensics.forEach(f => md += `- **${f.title}** (${STATUS_LABEL[f.status]}): ${f.stat}\n`); md += '\n';
  }
  if (proj.sim) md += `## Runway and odds\n\n- ${proj.da ? (proj.da.alive ? 'Default alive' : 'Default dead') : ''}\n- P(reach ${money(proj.sim.milestone)} ARR before cash-out): ${fmtProb(proj.sim.pMilestone)}\n- Capital to reach the bar p50 / p80: ${proj.sim.need50 == null ? 'n/a' : money(proj.sim.need50)} / ${proj.sim.need80 == null ? 'n/a' : money(proj.sim.need80)}\n\n`;
  if (deal) {
    md += `## Deal\n\n- Post-money ${money(deal.P)}; effective pre-money ${money(deal.effPre)}\n- Ownership ${deal.ownEntry != null ? fmtPct(deal.ownEntry * 100, 2) : '—'} at entry, ${deal.ownExit != null ? fmtPct(deal.ownExit * 100, 2) : '—'} at exit\n- Exit to return the fund ${money(deal.fundReturner)}\n\n`;
    const Rt = deal.returns;
    if (Rt && !Rt.missing) {
      md += `### Returns — VC Method and First Chicago\n\n| Case | Probability | Exit value | Multiple | IRR |\n|---|---|---|---|---|\n`;
      Rt.cases.forEach(c => md += `| ${c.name}${c.estimated ? ' (estimate)' : ''} | ${fmtPct(c.prob * 100, 0)} | ${money(c.ev)} | ${c.moic != null ? fmtX(c.moic, 2) : '—'} | ${c.irr != null ? fmtPct(c.irr, 0) : '—'} |\n`);
      md += `| probability-weighted | 100% | ${money(Rt.expEv)} | ${fmtX(Rt.expMoic, 2)} | ${fmtPct(Rt.expIrr, 0)} |\n\nVC Method post-money (success case at a ${fmtPct(Rt.r, 0)} target over ${Rt.years} years): ${money(Rt.justifiedPost)}; First Chicago at ${fmtPct(Rt.fc, 0)}: ${money(Rt.fcPost)}; offered ${money(deal.P)}.\n\n`;
    }
    if (deal.terms && deal.terms.length) { md += `### Term-sheet review\n\n| Term | This round | Standard | Read |\n|---|---|---|---|\n`; deal.terms.forEach(t => md += `| ${t.term} | ${t.value} | ${t.norm} | ${t.flag === 'off' ? 'off-market' : t.flag} |\n`); md += '\n'; }
  }
  if (R.risk && R.risk.some(c => c.items.length)) { md += `## Risks by type\n\n`; R.risk.filter(c => c.items.length).forEach(c => md += `- **${c.label}:** ${c.items.map(x => x.title).join('; ')}\n`); md += '\n'; }
  md += `## Dimension scores\n\n| Dimension | Weight | Coverage | Score |\n|---|---|---|---|\n`;
  sc.dimensions.forEach(d => md += `| ${d.label} | ${(d.weight * 100).toFixed(0)}% | ${Math.round(d.coverage * 100)}% | ${d.score == null ? '—' : d.score} |\n`);
  md += `\n## Computed metrics\n\n| Metric | Value | Formula |\n|---|---|---|\n`;
  Object.keys(D).filter(k => DLABEL[k]).forEach(k => md += `| ${DLABEL[k]} | ${dfmt(k, D[k])} | ${F[k]} |\n`);
  md += `\n## Questions, in priority order\n\n`;
  questions.forEach((q, i) => md += `${i + 1}. ${q.text}  \n   _${q.tag}_\n`);
  md += `\n## Documents to request\n\n`;
  requests.forEach(r => md += `- ${r}\n`);
  const cls = checklistSummary();
  md += `\n## Diligence checklist\n\n${cls.done} of ${cls.total} items received, reviewed or not applicable.\n\n`;
  checklistItems(false).forEach(it => { const st = checklistStatus(it).v; md += `- [${st === 'received' || st === 'reviewed' || st === 'na' ? 'x' : ' '}] ${it.cat} — ${it.text}${st ? ` _(${(CL_STATUS.find(s => s[0] === st) || [,''])[1].toLowerCase()})_` : ''}\n`; });
  if (memo) md += `\n## Narrative draft\n\n${memo}\n\n_Drafted by a language model from the figures above. It did not produce the score._\n`;
  md += `\n---\nGenerated by VC Risk Radar, rubric ${sc.rubric}. Workflow tool, not investment advice. Figures are user-supplied and not independently verified.\n`;
  downloadFile(`${safeFile(S.name)}-diligence-${R.hash}.md`, md, 'text/markdown');
  toast('Report downloaded.');
}
