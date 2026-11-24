/* ═══════════════════════════════════════════════════════════════
   DEAL FLOW UI — dashboard, weekly triage, company drawer, adding companies, calibration.
   Settings and help are in ws-settings.js. Every handler is listed in FLOW_CALLS (no inline handlers: the policy forbids them).
   ═══════════════════════════════════════════════════════════════ */
const FS = { store:null, list:[], cur:null, role:'admin', deals:[], view:'dash', f:{ open:true }, tf:{ open:true }, sel:null, busy:false, queue:[], log:[], prevScores:null, moved:null, setTab:'thesis', textCache:new Map() };
const flWs = () => FS.cur && FS.cur.settings;
const flWho = () => { const s = typeof acctSession === 'function' && acctSession(); return s && s.user ? s.user.email : 'You'; };
const flCtx = () => ({ ws:flWs(), deals:FS.deals, connector:wsConnector(flWs()), store:FS.store, who:flWho() });
const flSc = d => wsScoreOf(flWs(), d);
const flMoney = v => v == null || v === '' ? '' : (typeof money === 'function' ? money(+v) : '$' + v);
const flDate = t => { const x = wsTime(t); return x == null ? '' : new Date(x).toISOString().slice(0, 10); };
const flResultChip = th => !th ? '<span class="fl-chip">not checked</span>' : `<span class="fl-chip fl-r-${esc(th.result)}${th.needsInfo ? ' fl-r-info' : ''}">${esc(th.label)}</span>`;
const flTierChip = s => s.tier ? `<span class="fl-tier fl-tier-${wsTierRank(flWs(), s.tier)}">${esc(s.tier)}</span>` : s.total != null ? `<span class="fl-tier fl-tier-p" title="${s.coverage}% of the weights scored">${esc(s.provisionalTier)}?</span>` : '';
function flRender() {
  document.querySelectorAll('.fl-tab').forEach(b => { const on = b.dataset.a === FS.view; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  flRenderWsBar();
  const v = $id('fl-view');
  if (!FS.cur) { setHTML(v, flFirstRun()); return; }
  const html = FS.view === 'triage' ? flTriage() : FS.view === 'add' ? flAdd() : FS.view === 'calib' ? flCalib() : FS.view === 'settings' ? flSettings() : FS.view === 'help' ? flHelp() : FS.view === 'lp' ? flLp() : flDash();
  setHTML(v, html);
  flCountUp(v);
  if (FS.sel) flDrawer();
}
function flRenderWsBar() {
  const w = $id('fl-ws'); if (!w) return;
  setHTML(w, FS.list.length ? `<label class="sr-only" for="fl-ws-sel">Workspace</label><select id="fl-ws-sel" class="form-inp" data-change="flPickWs">${FS.list.map(x => `<option value="${esc(x.id)}"${FS.cur && x.id === FS.cur.id ? ' selected' : ''}>${esc(x.name)}${x.role === 'admin' ? '' : ' (member)'}</option>`).join('')}<option value="__new">+ New workspace</option></select>` : '');
  const who = $id('fl-who'); if (who) setHTML(who, FS.store && FS.store.mode === 'cloud' ? `<span class="fl-muted">${esc(flWho())}</span>` : `<a class="btn btn-ghost btn-sm" href="./?signin=1">Sign in for a team</a>`);
}
/* count-up on the dashboard tiles (the house animation), skipped when motion is reduced */
function flCountUp(root) {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-count]').forEach(el => {
    const end = +el.dataset.count, suf = el.dataset.suf || '', dec = +(el.dataset.dec || 0), t0 = performance.now();
    if (!isFinite(end)) return;
    const tick = t => { const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3); el.textContent = (end * e).toFixed(dec) + suf; if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}
function flFirstRun() {
  return `<section class="fl-hero card"><h1>Deal flow</h1>
    <p class="fl-lead">Every deck that reaches you, read the same way: checked against your thesis with the exact reasons, scored on your own scorecard from the evidence, filed in your Drive and logged in your master sheet. No AI decides anything; VCR2 shows where each number comes from.</p>
    <div class="fl-row"><label class="acct-field">Workspace name <input class="form-inp" id="fl-new-name" maxlength="80" placeholder="e.g. Fund II deal flow"></label>
    <label class="acct-field">Scorecard <select class="form-inp" id="fl-new-card">${Object.values(WS_SCORECARDS).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
    <label class="acct-field">Pipeline <select class="form-inp" id="fl-new-pipe">${Object.values(WS_PIPELINES).map(p => `<option value="${esc(p.id)}">${esc(p.name)}: ${esc(p.statuses.join(' → '))}</option>`).join('')}</select></label></div>
    <p><button class="btn btn-primary" data-click="flCreateWs">Create the workspace</button></p>
    <p class="fl-muted">${FS.store && FS.store.mode === 'cloud' ? 'It is saved to your account; invite your team in Settings, Team.' : 'Not signed in: the workspace stays in this browser. Sign in on the main page to share it with your team.'}</p></section>`;
}

/* ── dashboard ── */
function flTiles() {
  const k = wsKpis(flWs(), FS.deals, flSc), min = ms => ms == null ? null : ms / 60000;
  const tile = (l, v, suf, dec, cls, sub) => `<div class="kpi card ${cls || ''}"><div class="kpi-l">${esc(l)}</div><div class="kpi-v"${v != null ? ` data-count="${v}" data-suf="${esc(suf || '')}" data-dec="${dec || 0}"` : ''}>${v == null ? 'n/a' : esc((+v).toFixed(dec || 0) + (suf || ''))}</div>${sub ? `<div class="kpi-s fl-muted">${sub}</div>` : ''}</div>`;
  const auto = k.medianAutoMs == null ? '' : `automated part ${k.medianAutoMs < 60000 ? Math.round(k.medianAutoMs / 1000) + ' s' : (k.medianAutoMs / 60000).toFixed(1) + ' min'}`;
  return `<div class="fl-tiles">${tile('Companies logged', k.logged)}${tile('Complete metadata and scores', k.complete, '%')}${tile('Median deck to complete score', min(k.medianToScoreMs), ' min', 1, k.medianToScoreMs != null && k.medianToScoreMs > 6e5 ? 'warn' : 'good', auto + (k.medianToScoreMs == null ? ' · appears once a company is fully scored' : ''))}${tile(`In ${k.topName || 'the top tier'}`, k.topTier, '%')}${tile('Overdue follow-ups', k.overdue, '', 0, k.overdue ? 'bad' : 'good', k.waiting ? `${k.waiting} waiting past ${flWs().targets.waitingDays} days` : '')}</div>`;
}
function flFilters(f, key) {
  const ws = flWs(), opt = (v, l, cur) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`;
  const reviewers = [...new Set(FS.deals.map(d => d.reviewer).filter(Boolean))];
  return `<div class="fl-filters" role="search">
    <label class="sr-only" for="${key}-q">Search</label><input id="${key}-q" class="form-inp" type="search" placeholder="Search company, founder, sector" value="${esc(f.q || '')}" data-input="flFilter" data-a="${key}" data-b="q">
    <select class="form-inp" aria-label="Thesis result" data-change="flFilter" data-a="${key}" data-b="result">${opt('', 'Any thesis result', f.result || '')}${opt('in', 'In thesis', f.result)}${opt('border', 'Borderline', f.result)}${opt('out', 'Out of thesis', f.result)}</select>
    <select class="form-inp" aria-label="Status" data-change="flFilter" data-a="${key}" data-b="status">${opt('', 'Any status', f.status || '')}${ws.pipeline.statuses.map(s => opt(s, s, f.status)).join('')}</select>
    <select class="form-inp" aria-label="Priority tier" data-change="flFilter" data-a="${key}" data-b="tier">${opt('', 'Any tier', f.tier || '')}${ws.scorecard.tiers.map(t => opt(t.name, t.name, f.tier)).join('')}</select>
    <select class="form-inp" aria-label="Next action" data-change="flFilter" data-a="${key}" data-b="next">${opt('', 'Any next action', f.next || '')}${opt('due', 'Next action overdue', f.next)}${opt('set', 'Has a next action', f.next)}${opt('none', 'No next action', f.next)}</select>
    <select class="form-inp" aria-label="Source" data-change="flFilter" data-a="${key}" data-b="source">${opt('', 'Any source', f.source || '')}${['website', 'email', 'linkedin', 'import', 'manual'].map(s => opt(s, s[0].toUpperCase() + s.slice(1), f.source)).join('')}</select>
    ${reviewers.length ? `<select class="form-inp" aria-label="Reviewer" data-change="flFilter" data-a="${key}" data-b="reviewer">${opt('', 'Any reviewer', f.reviewer || '')}${reviewers.map(r => opt(r, r, f.reviewer)).join('')}</select>` : ''}
    <label class="fl-check"><input type="checkbox" data-change="flFilter" data-a="${key}" data-b="overdue"${f.overdue ? ' checked' : ''}> Flagged only</label>
    <label class="fl-check"><input type="checkbox" data-change="flFilter" data-a="${key}" data-b="open"${f.open ? ' checked' : ''}> Open only</label></div>`;
}
function flTable(rows, opts) {
  opts = opts || {}; const ws = flWs();
  if (!rows.length) return `<div class="empty-card card"><p>${FS.deals.length ? 'No company matches these filters.' : 'No company yet. Add decks in <b>Add companies</b>, share your form, or forward decks to your workspace address.'}</p></div>`;
  return `<div class="tbl-wrap" role="region" aria-label="Companies" tabindex="0"><table class="fl-tbl"><thead><tr><th scope="col">Company</th><th scope="col">Received</th><th scope="col">Thesis</th><th scope="col">Score</th><th scope="col">Status</th><th scope="col">Reviewer</th><th scope="col">Next action</th><th scope="col">Flags</th></tr></thead><tbody>${rows.map(r => {
    const d = r.d, s = r.s, fl = r.fl;
    return `<tr class="${fl.flags.length ? 'fl-flagged' : ''}"><th scope="row"><button class="fl-link" data-click="flOpen" data-a="${esc(d.id)}">${esc(d.company || 'Unnamed company')}</button><div class="fl-muted fl-small">${esc([(WS_SECTORS.find(x => x.id === d.sector) || {}).n, WS_STAGE_N[d.stage], d.raise ? 'raising ' + flMoney(d.raise) : ''].filter(Boolean).join(' · '))}</div></th>
      <td>${esc(flDate(d.received))}<div class="fl-muted fl-small">${fl.days != null ? fl.days + ' d' : ''} · ${esc(d.source || '')}</div></td>
      <td>${flResultChip(d.thesis)}</td>
      <td class="fl-num">${s.total != null ? `<b>${s.total.toFixed(1)}</b>` : 'n/a'} ${flTierChip(s)}${s.total != null && !s.complete ? `<div class="fl-muted fl-small">${s.coverage}% scored</div>` : ''}</td>
      <td>${esc(d.status || '')}</td><td>${esc(d.reviewer || '')}</td>
      <td>${esc(d.nextAction || '')}${d.nextDue ? `<div class="fl-muted fl-small">by ${esc(flDate(d.nextDue))}${d.followOwner ? ' · ' + esc(d.followOwner) : ''}</div>` : ''}</td>
      <td>${fl.flags.map(x => `<span class="fl-flag" title="${esc(x.text)}">${esc(x.id === 'waiting' ? 'Waiting ' + fl.days + ' d' : x.id === 'next' ? 'Overdue' : 'No contact')}</span>`).join(' ')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function flDash() {
  const rows = wsTriage(flWs(), FS.deals, flSc, FS.f).sort((a, b) => (wsTime(b.d.received) || 0) - (wsTime(a.d.received) || 0));
  const con = wsConnector(flWs());
  return `<div class="fl-head"><h1>${esc(flWs().name)}</h1><div class="fl-actions">
      ${WS_SITE.intake && flWs().intake.key ? '<button class="btn btn-primary btn-sm" data-click="flPullInbox">Check the inbox</button>' : ''}
      ${con && flWs().storage.sheet ? '<button class="btn btn-ghost btn-sm" data-click="flSyncSheet">Update the master sheet</button>' : ''}
      <button class="btn btn-ghost btn-sm" data-click="flRecheckAll">Re-check every company</button>
      <button class="btn btn-ghost btn-sm" data-click="flExportAll">Export JSON</button></div></div>
    ${flTiles()}${FS.busy ? `<p class="fl-busy" role="status">${esc(FS.busy)}</p>` : ''}${flFilters(FS.f, 'f')}${flTable(rows)}`;
}
function flTriage() {
  const rows = wsTriage(flWs(), FS.deals, flSc, FS.tf);
  const ws = flWs();
  return `<div class="fl-head"><h1>Weekly triage</h1><p class="fl-muted">Open companies, top tier and highest score first, then the ones waiting longest. Flags: waiting past ${ws.targets.waitingDays} days, next action overdue, no contact for ${ws.targets.responseDays} days.</p></div>
    ${flFilters(FS.tf, 'tf')}${flTable(rows)}<p class="fl-muted">${ws.notify.digest ? 'The weekly digest is on: your team receives this list by e-mail.' : 'Turn on the weekly digest in Settings, Notifications, to receive this list by e-mail.'}</p>`;
}

/* ── the company drawer ── */
function flOpen(id) { FS.sel = id; flDrawer(); }
function flCloseDrawer() { FS.sel = null; const d = $id('fl-drawer'); d.hidden = true; $id('fl-scrim').hidden = true; }
function flDrawer() {
  const d = FS.deals.find(x => x.id === FS.sel); if (!d) { flCloseDrawer(); return; }
  const ws = flWs(), s = flSc(d), dr = $id('fl-drawer'), fl = wsFlags(ws, d);
  const src = x => x ? `<span class="fl-src" title="${esc(x.quote || '')}">${esc(x.file || '')}${x.loc ? ', ' + esc(x.loc) : ''}</span>` : '';
  const aiOn = !!flAiKey();
  const pill = p => `<div class="fl-pillar card"><div class="fl-p-h"><b>${esc(p.name)}</b> <span class="fl-muted">${p.weight}%</span><span class="fl-p-score">${p.score != null ? p.score.toFixed(1) : 'n/a'}</span></div>
      <div class="fl-p-from">${p.from === 'engine' ? `Engine${p.engine.basis === 'claims' ? ', from the deck’s claims (unverified)' : ', from the evidence'}` : p.from === 'reviewer' ? `Reviewer: ${esc(p.by)}, ${esc(String(p.at).slice(0, 10))}` : p.from === 'ai' ? `AI suggestion confirmed by ${esc(p.by)}, ${esc(String(p.at).slice(0, 10))}` : 'Needs a reviewer'}</div>
      ${p.engine ? `<ul class="fl-small">${p.engine.sources.map(x => `<li>${esc(x.label)}: <b>${esc(x.value)}</b> <span class="fl-muted">(${esc(x.evidence)}${x.bench ? '; ' + esc(x.bench) : ''})</span>${(x.from || []).map(f => ` ${src({ file:f.file, loc:f.loc, quote:f.line })}`).join('')}</li>`).join('')}${p.engine.notes.map(n => `<li class="fl-warn">${esc(n)}</li>`).join('')}</ul>` : ''}
      ${!p.engine && p.evidence.length ? `<p class="fl-small fl-muted">Evidence found: ${p.evidence.map(e => `${esc(e.label)} ${esc(e.value)} (${esc(e.evidence)})`).join('; ')}</p>` : ''}
      ${p.guide ? `<p class="fl-small fl-muted">${esc(p.guide)}</p>` : ''}
      <div class="fl-score-btns" role="group" aria-label="Score ${esc(p.name)}">${[1, 2, 3, 4, 5].map(n => `<button class="btn btn-sm ${p.from !== 'engine' && Math.round(p.score) === n ? 'btn-primary' : 'btn-ghost'}" data-click="flScore" data-a="${esc(d.id)}" data-b="${esc(p.id)}" data-c="#${n}">${n}</button>`).join('')}${p.from === 'reviewer' || p.from === 'ai' ? `<button class="btn btn-sm btn-ghost" data-click="flScore" data-a="${esc(d.id)}" data-b="${esc(p.id)}" data-c="#0">Clear</button>` : ''}
      ${aiOn && p.kind !== 'metrics' ? `<button class="btn btn-sm btn-ghost" data-click="flAiSuggest" data-a="${esc(d.id)}" data-b="${esc(p.id)}">Suggest with AI</button>` : ''}</div>
      ${p.ai && p.ai.score != null && !(p.from === 'ai') ? `<div class="fl-ai"><span class="fl-ai-tag">AI suggestion, not applied</span> ${p.ai.score.toFixed(1)}: ${esc(p.ai.why)} <span class="fl-muted">(${esc(p.ai.model)})</span> <button class="btn btn-sm btn-primary" data-click="flAiConfirm" data-a="${esc(d.id)}" data-b="${esc(p.id)}">Confirm ${p.ai.score.toFixed(1)}</button></div>` : ''}
      ${p.score == null && p.questions.length ? `<details class="fl-small"><summary>Questions to settle it</summary><ul>${p.questions.slice(0, 5).map(q => `<li>${esc(q)}</li>`).join('')}</ul></details>` : ''}</div>`;
  const opt = (v, cur) => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`;
  setHTML(dr, `<div class="fl-d-h"><div><h2>${esc(d.company || 'Unnamed company')}</h2><p class="fl-muted fl-small">${esc([(d.founders || []).join(', '), d.email, d.website].filter(Boolean).join(' · '))}</p></div><button class="modal-x" aria-label="Close" data-click="flCloseDrawer">×</button></div>
    <div class="fl-d-b">
      <div class="fl-d-sum">${flResultChip(d.thesis)} ${s.total != null ? `<span class="fl-big">${s.total.toFixed(1)}</span>/5 ${flTierChip(s)}` : '<span class="fl-muted">not scored yet</span>'} <span class="fl-muted">${s.coverage}% of the weights scored${s.meets ? ' · above your threshold' : ''}</span></div>
      ${fl.flags.length ? `<p class="fl-warn">${fl.flags.map(x => esc(x.text)).join(' · ')}</p>` : ''}
      <div class="fl-links">${d.folderUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(d.folderUrl)}" target="_blank" rel="noopener noreferrer">Drive folder</a>` : ''}${d.reportUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(d.reportUrl)}" target="_blank" rel="noopener noreferrer">Report</a>` : ''}${d.memo && d.memo.url ? `<a class="btn btn-ghost btn-sm" href="${esc(d.memo.url)}" target="_blank" rel="noopener noreferrer">Deal memo</a>` : ''}
        <button class="btn btn-ghost btn-sm" data-click="flOpenAnalysis" data-a="${esc(d.id)}">Open the full analysis</button>
        ${wsConnector(ws) ? `<button class="btn btn-${s.meets ? 'primary' : 'ghost'} btn-sm" data-click="flMemo" data-a="${esc(d.id)}">${d.memo ? 'Create the memo again' : 'Create the deal memo'}</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-click="flExportOne" data-a="${esc(d.id)}">JSON</button></div>
      <h3>Pipeline</h3>
      <div class="fl-grid2">
        <label class="acct-field">Status <select class="form-inp" data-change="flSet" data-a="${esc(d.id)}" data-b="status">${ws.pipeline.statuses.map(x => opt(x, d.status)).join('')}</select></label>
        <label class="acct-field">Reviewer <input class="form-inp" maxlength="80" value="${esc(d.reviewer || '')}" data-change="flSet" data-a="${esc(d.id)}" data-b="reviewer"></label>
        <label class="acct-field">Last contact <input class="form-inp" type="date" value="${esc(flDate(d.lastContact))}" data-change="flSet" data-a="${esc(d.id)}" data-b="lastContact"></label>
        <label class="acct-field">Follow-up owner <input class="form-inp" maxlength="80" value="${esc(d.followOwner || '')}" data-change="flSet" data-a="${esc(d.id)}" data-b="followOwner"></label>
        <label class="acct-field">Next action <input class="form-inp" maxlength="200" value="${esc(d.nextAction || '')}" data-change="flSet" data-a="${esc(d.id)}" data-b="nextAction"></label>
        <label class="acct-field">Next action by <input class="form-inp" type="date" value="${esc(flDate(d.nextDue))}" data-change="flSet" data-a="${esc(d.id)}" data-b="nextDue"></label>
        <label class="acct-field">Lead partner <input class="form-inp" maxlength="80" value="${esc(d.leadPartner || '')}" data-change="flSet" data-a="${esc(d.id)}" data-b="leadPartner"></label>
        <label class="acct-field">Referral source <input class="form-inp" maxlength="120" value="${esc(d.referral || '')}" data-change="flSet" data-a="${esc(d.id)}" data-b="referral"></label>
      </div>
      ${flDrawerProcess(d)}
      <h3>Thesis check</h3>
      ${d.thesis ? `<ul class="fl-reasons">${d.thesis.reasons.map(r => `<li class="fl-rs-${r.ok === true ? 'ok' : r.ok === false ? 'no' : 'q'}"><span class="sr-only">${r.ok === true ? 'Pass' : r.ok === false ? 'Fail' : 'To check'}: </span>${esc(r.text)} ${src(r.src)}${r.src && r.src.quote ? `<div class="fl-quote">“${esc(r.src.quote)}”</div>` : ''}</li>`).join('') || '<li>No thesis set yet: every company is “In thesis”. Set it in Settings, Thesis.</li>'}</ul>
        ${d.thesis.questions.length ? `<p><b>Questions to ask</b></p><ul>${d.thesis.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}` : ''}
      <h3>Scorecard: ${esc(ws.scorecard.name)}</h3>${s.pillars.map(pill).join('')}
      ${d.analysis ? `<h3>VCR2 analysis</h3><p>Evidence score <b>${esc(d.analysis.score)}</b>/100 · run <code>${esc(String(d.analysis.hash || '').slice(0, 16))}</code></p>
        ${d.analysis.checks.length ? `<ul class="fl-small">${d.analysis.checks.slice(0, 8).map(c => `<li class="${c.sev === 'major' ? 'fl-warn' : ''}">${esc(c.title)}</li>`).join('')}</ul>` : ''}
        <details><summary>Diligence questions (${d.analysis.questions.length})</summary><ol class="fl-small">${d.analysis.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ol></details>` : d.thesis && d.thesis.result === 'out' ? '<p class="fl-muted">Out of thesis: the full analysis was not run. <button class="btn btn-ghost btn-sm" data-click="flForceAnalysis" data-a="' + esc(d.id) + '">Run it anyway</button></p>' : ''}
      <h3>Add evidence</h3>
      <p class="fl-small fl-muted">A founder e-mail, a call transcript or notes: paste them or drop files (.eml, .txt, .docx, .pdf). VCR2 reads them with the same rules, adds what it finds with its source, and re-scores.</p>
      <div class="fl-grid2"><label class="acct-field">Kind <select class="form-inp" id="fl-ev-kind"><option value="email">Founder e-mail</option><option value="transcript">Call transcript</option><option value="note">Notes or other document</option></select></label>
      <label class="acct-field">Files <input class="form-inp" type="file" id="fl-ev-files" multiple accept=".eml,.txt,.md,.docx,.pdf,.pptx,.xlsx,.csv"></label></div>
      <label class="acct-field">Or paste the text <textarea class="form-inp" id="fl-ev-text" rows="4" maxlength="400000"></textarea></label>
      <p><button class="btn btn-primary btn-sm" data-click="flAddEvidence" data-a="${esc(d.id)}">Read and re-score</button></p>
      ${(d.evidence || []).length ? `<ul class="fl-small fl-muted">${d.evidence.slice(-8).map(e => `<li>${esc(String(e.at).slice(0, 10))}: ${esc(e.kind)}: ${esc((e.files || []).join(', '))}${e.fields != null ? ` (${e.fields} field${e.fields === 1 ? '' : 's'})` : ''}</li>`).join('')}</ul>` : ''}
      <h3>Notes</h3>
      <ul class="fl-notes">${(d.notes || []).slice(-20).map(n => `<li><b>${esc(n.by || '')}</b> <span class="fl-muted">${esc(String(n.at || '').slice(0, 10))}</span><br>${esc(n.text)}</li>`).join('') || '<li class="fl-muted">No notes yet.</li>'}</ul>
      <label class="acct-field">New note <textarea class="form-inp" id="fl-note" rows="2" maxlength="2000"></textarea></label>
      <p><button class="btn btn-ghost btn-sm" data-click="flAddNote" data-a="${esc(d.id)}">Add the note</button></p>
      ${(d.readNotes || []).length ? `<details class="fl-small"><summary>Reading notes</summary><ul>${d.readNotes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
      <details class="fl-small"><summary>History</summary><ul>${(d.history || []).slice(-30).reverse().map(h => `<li>${esc(String(h.at).slice(0, 16).replace('T', ' '))} ${esc(h.what)}${h.by ? ', ' + esc(h.by) : ''}</li>`).join('')}</ul></details>
      <p><button class="btn btn-ghost btn-sm fl-danger" data-click="flDelete" data-a="${esc(d.id)}">Delete this company</button></p>
    </div>`);
  dr.hidden = false; $id('fl-scrim').hidden = false;
}

/* ── adding companies: files, a folder, a .zip, a company spreadsheet ── */
function flAdd() {
  const ws = flWs();
  return `<div class="fl-head"><h1>Add companies</h1><p class="fl-muted">Decks you already have: one file per company, or one folder per company. Add your existing company spreadsheet (.xlsx or .csv, or a Google Sheet downloaded as .xlsx) and VCR2 matches its rows to the decks. Duplicates (same file, same web domain, same founder e-mail or same name) are merged.</p></div>
    <div class="card fl-drop" id="fl-drop">
      <div class="fl-grid2"><label class="acct-field">Decks <input class="form-inp" type="file" id="fl-files" multiple accept=".pdf,.pptx,.docx,.png,.jpg,.jpeg,.eml,.zip,.txt,.md,.xlsx"></label>
      <label class="acct-field">Or a whole folder <input class="form-inp" type="file" id="fl-folder" webkitdirectory multiple></label>
      <label class="acct-field">Company spreadsheet (optional) <input class="form-inp" type="file" id="fl-sheet" accept=".xlsx,.csv,.tsv"></label>
      <label class="acct-field">Where they came from <select class="form-inp" id="fl-src"><option value="import">Import</option><option value="linkedin">LinkedIn messages</option><option value="email">E-mail</option><option value="website">Website</option><option value="manual">Other</option></select></label></div>
      <p><button class="btn btn-primary" data-click="flImport">Read and score</button> <span class="fl-muted fl-small">Runs in this browser. ${wsConnector(ws) && wsConnector(ws).connected() ? 'Decks and reports are filed in your Drive.' : 'Connect Google in Settings to file them in your Drive.'}</span></p>
      ${FS.preview ? FS.preview : ''}
    </div>
    ${FS.log.length ? `<h2>Progress</h2><div class="tbl-wrap"><table class="fl-tbl"><thead><tr><th scope="col">Item</th><th scope="col">Result</th><th scope="col">Time</th></tr></thead><tbody>${FS.log.slice(-200).reverse().map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.text)}</td><td class="fl-num">${l.ms != null ? (l.ms / 1000).toFixed(1) + ' s' : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
}
/* a spreadsheet of companies: one row each; a "deck" column (file name or link) or the company name links a row to a deck file */
function flSheetRows(rows) {
  const head = (rows[0] || []).map(h => wsNorm(h).trim()), col = (...names) => head.findIndex(h => names.some(n => h === n || h.startsWith(n + ' ')));
  const c = { company:col('company', 'company name', 'startup', 'name'), website:col('website', 'url', 'site', 'domain'), founder:col('founder', 'founders', 'ceo'), email:col('email', 'e-mail', 'contact email'),
    deck:col('deck', 'deck link', 'pitch deck', 'file', 'deck file'), stage:col('stage', 'round'), sector:col('sector', 'industry', 'vertical'), status:col('status'), received:col('date received', 'date', 'received', 'date added'),
    source:col('source', 'channel'), referral:col('referral', 'referral source', 'intro by'), lead:col('lead partner', 'partner'), next:col('next action', 'next step'), owner:col('follow-up owner', 'owner') };
  return rows.slice(1).filter(r => r.some(x => String(x || '').trim())).map(r => { const g = k => c[k] >= 0 ? String(r[c[k]] || '').trim() : ''; return { company:g('company'), website:g('website'), founder:g('founder'), email:g('email'), deck:g('deck'), stage:g('stage'), sector:g('sector'), status:g('status'), received:g('received'), source:g('source'), referral:g('referral'), lead:g('lead'), next:g('next'), owner:g('owner') }; });
}
function flMatchFile(row, files) {
  const base = n => wsKey(String(n).split('/').pop().replace(/\.[a-z0-9]{2,5}$/i, '').replace(/\b(pitch|deck|investor|presentation|final|v\d+|20\d\d)\b/ig, ' '));
  if (row.deck) { const b = base(row.deck); const f = files.find(x => x.name === row.deck.split('/').pop() || base(x.name) === b); if (f) return f; }
  const k = wsKey(row.company); if (k.length >= 3) return files.find(x => base(x.name) === k || base(x.name).includes(k) || (x.dir && wsKey(x.dir) === k)) || null;
  return null;
}
const flStageId = v => { const s = String(v || '').toLowerCase(); return /pre/.test(s) ? 'preseed' : /seed/.test(s) ? 'seed' : /\ba\b|series a/.test(s) ? 'a' : /series [b-z]|growth|\bb\b/.test(s) ? 'b' : ''; };
const flSectorId = v => { const n = wsNorm(v).trim(); if (!n) return ''; const s = WS_SECTORS.find(x => wsNorm(x.n).trim() === n || x.id === n || x.kw.includes(n)); return s ? s.id : ''; };
async function flImport() {
  const ws = flWs(); if (FS.busy) return;
  const pick = id => [...(($id(id) || {}).files || [])];
  const raw = pick('fl-files').concat(pick('fl-folder')), sheetF = pick('fl-sheet')[0], source = ($id('fl-src') || {}).value || 'import';
  if (!raw.length && !sheetF) { toast('Choose decks, a folder or a spreadsheet first.', 'err'); return; }
  const files = []; for (const f of raw.slice(0, 400)) { if (f.size > 25e6) { FS.log.push({ name:f.name, text:'skipped: larger than 25 MB' }); continue; } const rel = f.webkitRelativePath || ''; files.push({ name:f.name, dir:rel.split('/').length > 2 ? rel.split('/').slice(-2, -1)[0] : '', bytes:new Uint8Array(await f.arrayBuffer()), type:f.type }); }
  /* one company per subfolder, else one per file */
  const groups = new Map(); for (const f of files) { const k = f.dir || f.name; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
  let rows = [];
  if (sheetF) { const u8 = new Uint8Array(await sheetF.arrayBuffer()); try { if (/\.xlsx$/i.test(sheetF.name)) { const sh = pickSheet(await readWorkbook(u8.buffer), 'library'); rows = flSheetRows(sh ? sh.rows : []); } else rows = flSheetRows(parseCSV(new TextDecoder().decode(u8))); } catch (e) { toast('The spreadsheet could not be read: ' + (e.message || e), 'err'); return; } }
  const items = [], used = new Set();
  for (const r of rows) {
    const f = flMatchFile(r, files), g = f ? groups.get(f.dir || f.name) : null; if (g) used.add(f.dir || f.name);
    items.push({ source:(r.source && /web|site/i.test(r.source) ? 'website' : r.source && /linked/i.test(r.source) ? 'linkedin' : r.source && /mail/i.test(r.source) ? 'email' : source), received:wsTime(r.received) ? new Date(wsTime(r.received)).toISOString() : new Date().toISOString(),
      meta:{ company:r.company, website:r.website, founder:r.founder, email:r.email, stage:flStageId(r.stage), sector:flSectorId(r.sector), referral:r.referral, deckLink:/^https:\/\//.test(r.deck) ? r.deck : '', via:'your spreadsheet' },
      files:g || [], extra:{ status:ws.pipeline.statuses.find(s => wsNorm(s).trim() === wsNorm(r.status).trim()) || '', leadPartner:r.lead, nextAction:r.next, followOwner:r.owner }, name:r.company || (f && f.name) || 'row' });
  }
  for (const [k, g] of groups) if (!used.has(k)) items.push({ source, received:new Date().toISOString(), meta:{}, files:g, name:k });
  await flRunItems(items);
}
async function flRunItems(items) {
  const ws = flWs(); FS.busy = `Reading ${items.length} compan${items.length === 1 ? 'y' : 'ies'}…`; flRender();
  let n = 0, merged = 0;
  for (const it of items) {
    n++; FS.busy = `${n} of ${items.length}: ${it.name || 'company'}`; flRenderBusy();
    const t0 = wsNow();
    try {
      const r = await wsProcessItem(flCtx(), it, s => { FS.busy = `${n} of ${items.length}: ${it.name || 'company'}: ${s}`; flRenderBusy(); });
      const d = r.deal; FS.textCache.set(d.id, r.lines || []); if (it.extra) for (const [k, v] of Object.entries(it.extra)) if (v && !d[k]) d[k] = v;
      const i = FS.deals.findIndex(x => x.id === d.id); if (i >= 0) FS.deals[i] = d; else FS.deals.push(d);
      if (r.merged) merged++;
      await flSave(d);
      if (ws.integrations.webhook) wsWebhook(flCtx(), r.merged ? 'company.updated' : 'company.created', d).catch(() => {});
      if (ws.storage.memo.auto && r.score.meets && wsConnector(ws) && wsConnector(ws).connected() && !d.memo) { try { await wsMakeMemo(flCtx(), d); await flSave(d); } catch (e) {} }
      FS.log.push({ name:it.name || d.company, text:`${d.company || 'Unnamed'}: ${d.thesis.label}${r.score.total != null ? `, ${r.score.total}/5` : ''}${r.merged ? ` (merged: ${r.why})` : ''}`, ms:wsNow() - t0 });
    } catch (e) { FS.log.push({ name:it.name || 'item', text:'could not be processed: ' + String(e && e.message || e).slice(0, 160), ms:wsNow() - t0 }); }
  }
  FS.busy = false;
  if (wsConnector(ws) && wsConnector(ws).connected() && ws.storage.sheet) await flSyncSheet(true);
  toast(`${items.length} processed${merged ? `, ${merged} merged into existing companies` : ''}.`);
  flRender();
}
function flRenderBusy() { const b = document.querySelector('.fl-busy'); if (b) b.textContent = FS.busy; else if (FS.busy) { const v = $id('fl-view'), p = document.createElement('p'); p.className = 'fl-busy'; p.setAttribute('role', 'status'); p.textContent = FS.busy; v.prepend(p); } }

/* ── calibration: the score distribution, and what moved after a change of weights ── */
function flBars(bins, max) { return `<div class="fl-bars">${bins.map(b => `<div class="fl-bar"><span class="fl-bar-fill" style="height:${max ? Math.round(b.n / max * 100) : 0}%"></span><span class="fl-bar-n">${b.n}</span><span class="fl-bar-l">${b.lo.toFixed(1)}</span></div>`).join('')}</div>`; }
function flCalib() {
  const ws = flWs(), sc = FS.deals.filter(d => !d.mergedInto).map(d => Object.assign({ id:d.id, company:d.company }, flSc(d))), dist = wsDistribution(ws.scorecard, sc);
  const mx = Math.max(1, ...dist.total.map(b => b.n));
  return `<div class="fl-head"><h1>Calibration</h1><p class="fl-muted">Check that your weights and threshold make sense before going live: how ${dist.n} companies spread on each pillar and in total. Change the weights in Settings, Scorecard: every company is re-scored and the ones that moved are listed here.</p></div>
    <div class="fl-tiles"><div class="kpi card"><div class="kpi-l">Median total</div><div class="kpi-v">${dist.median ?? 'n/a'}</div></div><div class="kpi card"><div class="kpi-l">Middle half</div><div class="kpi-v">${dist.p25 ?? 'n/a'} to ${dist.p75 ?? 'n/a'}</div></div><div class="kpi card"><div class="kpi-l">Above the threshold (${ws.scorecard.threshold})</div><div class="kpi-v">${dist.above}</div></div><div class="kpi card"><div class="kpi-l">Not scored on every pillar</div><div class="kpi-v">${sc.filter(s => !s.complete).length}</div></div></div>
    <div class="card"><h2>Total weighted score</h2>${flBars(dist.total, mx)}<p class="fl-small fl-muted">${Object.entries(dist.tiers).map(([t, n]) => `${esc(t)}: ${n}`).join(' · ')}</p></div>
    <div class="fl-grid2">${ws.scorecard.pillars.map(p => { const b = dist.per[p.id], m = Math.max(1, ...b.map(x => x.n)); return `<div class="card"><h3>${esc(p.name)} <span class="fl-muted">${p.weight}% · ${p.kind === 'reviewer' ? 'reviewer' : 'engine'}</span></h3>${flBars(b, m)}<p class="fl-small fl-muted">${b.reduce((s, x) => s + x.n, 0)} of ${dist.n} scored</p></div>`; }).join('')}</div>
    ${FS.moved ? `<div class="card"><h2>What moved after your last change</h2>${FS.moved.length ? `<ul>${FS.moved.slice(0, 60).map(m => `<li><button class="fl-link" data-click="flOpen" data-a="${esc(m.id)}">${esc(m.company || 'Unnamed')}</button>: ${m.from ?? 'n/a'} → <b>${m.to ?? 'n/a'}</b>${m.fromTier !== m.toTier ? ` (${esc(m.fromTier || 'no tier')} → ${esc(m.toTier || 'no tier')})` : ''}${m.crossed ? ` · ${esc(m.crossed)}` : ''}</li>`).join('')}</ul>` : '<p>Nothing moved.</p>'}</div>` : ''}`;
}

/* ── actions ── */
async function flSave(d) {
  try { await FS.store.saveCompany(FS.cur.id, d); }
  catch (e) {
    if (e.code === 'version_conflict') { toast('Someone in your team changed this company meanwhile: the list was reloaded.', 'err', 6000); await flLoadDeals(); }
    else toast('Not saved: ' + (e.message || e.code || e), 'err', 6000);
  }
}
function flSet(id, field, v) {
  const d = FS.deals.find(x => x.id === id); if (!d) return;
  const val = ['lastContact', 'nextDue'].includes(field) ? (v ? String(v).slice(0, 10) : '') : wsClip(v, 200);
  if (String(d[field] || '') === val) return;
  d.history = (d.history || []).concat([{ at:new Date().toISOString(), what:`${field} → ${val || '(empty)'}`, by:flWho() }]);
  d[field] = val; flSave(d).then(() => { flRender(); });
  if (field === 'status' && flWs().integrations.webhook) wsWebhook(flCtx(), 'company.status', d).catch(() => {});
}
function flScore(id, pid, n) { const d = FS.deals.find(x => x.id === id); if (!d) return; d.pillars = wsSetPillar(d, pid, n ? n : null, flWho(), 'reviewer'); wsMarkComplete(flWs(), d); d.history = (d.history || []).concat([{ at:new Date().toISOString(), what:`${pid} ${n ? 'scored ' + n : 'score cleared'}`, by:flWho() }]); flSave(d).then(flRender); }
function flAiKey() { try { const p = localStorage.getItem('vcr3-provider') || 'local', k = sessionStorage.getItem('vcr3-key') || localStorage.getItem('vcr3-key') || ''; return p !== 'local' && k ? { p, k } : null; } catch (e) { return null; } }
async function flAiSuggest(id, pid) {
  const d = FS.deals.find(x => x.id === id), ai = flAiKey(); if (!d || !ai) { toast('Add your own AI key on the main page (AI assist) first.', 'err'); return; }
  const p = flSc(d).pillars.find(x => x.id === pid), q = wsAiPrompt(flWs(), d, p);
  toast(`Asking ${PROVIDERS[ai.p].name}…`);
  try { const txt = await callModel(ai.p, ai.k, q.system, q.prompt, 300), sug = wsParseAi(txt); if (!sug) { toast('The answer could not be read: nothing was changed.', 'err'); return; }
    d.pillars = wsSuggestPillar(d, pid, Object.assign(sug, { model:modelName(ai.p) })); await flSave(d); flRender(); }
  catch (e) { toast('AI suggestion failed: ' + String(e.message || e).slice(0, 160), 'err', 7000); }
}
function flAiConfirm(id, pid) { const d = FS.deals.find(x => x.id === id); if (!d) return; d.pillars = wsConfirmAi(d, pid, flWho()); wsMarkComplete(flWs(), d); d.history = (d.history || []).concat([{ at:new Date().toISOString(), what:`${pid}: AI suggestion confirmed`, by:flWho() }]); flSave(d).then(flRender); }
function flAddNote(id) { const d = FS.deals.find(x => x.id === id), t = ($id('fl-note') || {}).value; if (!d || !t || !t.trim()) return; d.notes = (d.notes || []).concat([{ by:flWho(), at:new Date().toISOString(), text:wsClip(t, 2000) }]); flSave(d).then(flRender); }
async function flAddEvidence(id) {
  const d = FS.deals.find(x => x.id === id); if (!d) return;
  const kind = ($id('fl-ev-kind') || {}).value || 'note', text = ($id('fl-ev-text') || {}).value || '', fl = [...(($id('fl-ev-files') || {}).files || [])];
  if (!text.trim() && !fl.length) { toast('Paste the text or choose a file first.', 'err'); return; }
  const files = []; for (const f of fl.slice(0, 20)) files.push({ name:f.name, bytes:new Uint8Array(await f.arrayBuffer()) });
  try { const r = await wsAddEvidence(flCtx(), d, { kind, files, text, textName:kind === 'transcript' ? 'call transcript' : kind === 'email' ? 'founder e-mail' : 'notes' }); await flSave(d); toast(`${r.added} field${r.added === 1 ? '' : 's'} added; the company was re-scored.`); flRender(); }
  catch (e) { toast('Could not read it: ' + String(e.message || e).slice(0, 160), 'err'); }
}
async function flForceAnalysis(id) {
  const d = FS.deals.find(x => x.id === id); if (!d || !d.input) return;
  try { d.engine = wsCompact(wsAssess(d.input)); d.analysis = wsAnalysisSummary(d.engine); d.history = (d.history || []).concat([{ at:new Date().toISOString(), what:'full analysis run on request', by:flWho() }]); await flSave(d); flRender(); } catch (e) { toast('The analysis could not run.', 'err'); }
}
async function flMemo(id) {
  const d = FS.deals.find(x => x.id === id); if (!d) return;
  try { toast('Creating the memo in your Drive…'); const m = await wsMakeMemo(flCtx(), d); await flSave(d); if (flWs().storage.sheet) await flSyncSheet(true); toast('Memo created.'); flRender(); if (m.url) window.open(m.url, '_blank', 'noopener'); }
  catch (e) { toast('Memo: ' + String(e.message || e).slice(0, 200), 'err', 7000); }
}
async function flSyncSheet(quiet) {
  try { const r = await wsSyncSheet(flCtx()); for (const d of r.changed || []) await flSave(d); if (!quiet) toast(`Master sheet updated: ${r.written} cell${r.written === 1 ? '' : 's'} written${(r.skipped || []).length ? `, ${r.skipped.length} left as your team set them` : ''}.`); FS.lastSheet = r; if (!quiet) flRender(); return r; }
  catch (e) { if (!quiet || e.code !== 'google_signed_out') toast('Master sheet: ' + String(e.message || e).slice(0, 200), 'err', 7000); return null; }
}
async function flRecheckAll() {
  const ws = flWs(); let changed = 0;
  for (const d of FS.deals) {
    if (d.mergedInto) continue;
    const lines = FS.textCache.get(d.id) || [];
    const th = wsThesisRun(ws, d.facts || {}, lines);
    if (!lines.length && (ws.thesis.exclusions.length || ws.thesis.musts.some(m => m.kind === 'keyword'))) th.reasons.push({ rule:'note', ok:null, text:'Keywords re-checked on the facts only: drop the deck again to re-read its full text.', src:null });
    if (JSON.stringify([th.result, th.label]) !== JSON.stringify([(d.thesis || {}).result, (d.thesis || {}).label])) { d.history = (d.history || []).concat([{ at:new Date().toISOString(), what:`thesis re-checked: ${(d.thesis || {}).label || 'not checked'} → ${th.label}`, by:flWho() }]); changed++; }
    d.thesis = th;
    if (th.result !== 'out' && !d.engine && d.input) { try { d.engine = wsCompact(wsAssess(d.input)); d.analysis = wsAnalysisSummary(d.engine); } catch (e) {} }
    await flSave(d);
  }
  toast(`${FS.deals.length} companies re-checked against the thesis; ${changed} changed result.`); flRender();
}
function flExportAll() { const ws = flWs(); downloadFile(`${wsSlug(ws.name) || 'workspace'}-companies.json`, JSON.stringify({ schema:'vcr2.workspace.export/1', exported_at:new Date().toISOString(), workspace:{ id:ws.id, name:ws.name, scorecard:ws.scorecard, pipeline:ws.pipeline }, companies:FS.deals.filter(d => !d.mergedInto).map(d => wsExportDeal(ws, d, flSc(d))) }, null, 2), 'application/json'); }
function flExportOne(id) { const d = FS.deals.find(x => x.id === id); if (d) downloadFile(`${wsSlug(d.company) || 'company'}.json`, JSON.stringify(wsExportDeal(flWs(), d, flSc(d)), null, 2), 'application/json'); }
function flDelete(id) {
  const d = FS.deals.find(x => x.id === id); if (!d) return;
  openModal('Delete this company?', `<p>${esc(d.company || 'This company')} and its scores, notes and history are removed from VCR2. Files in your Drive and the row in your master sheet are not touched.</p>`, [{ label:'Delete', primary:true, onClick:async () => { closeModal(); await FS.store.deleteCompany(FS.cur.id, id); FS.deals = FS.deals.filter(x => x.id !== id); flCloseDrawer(); flRender(); } }]);
}
/* the full analysis opens on the main page, with the same inputs and their sources */
function flOpenAnalysis(id) {
  const d = FS.deals.find(x => x.id === id); if (!d || !d.input) { toast('No figures were read for this company yet.', 'err'); return; }
  try { localStorage.setItem('vcr2-handoff', JSON.stringify({ at:Date.now(), name:d.company || '', stage:d.input.stage, model:d.input.model, market:d.input.market, vals:d.input.vals, bools:d.input.bools, sel:d.input.sel, evid:d.input.evid, prov:d.input.prov })); } catch (e) { toast('Browser storage is full.', 'err'); return; }
  location.assign('./?handoff=1');
}
/* the intake service: new submissions from the website form and the forwarding address */
async function flPullInbox() {
  const ws = flWs(); if (!WS_SITE.intake || !ws.intake.key) return;
  const api = (p, o) => fetch(WS_SITE.intake + p, Object.assign({ credentials:'omit', referrerPolicy:'no-referrer', cache:'no-store' }, o || {}, { headers:Object.assign({ authorization:'Bearer ' + ws.intake.key }, (o || {}).headers || {}) }));
  try {
    const r = await api('/v1/inbox?ws=' + ws.intake.wsKey); if (!r.ok) throw new Error('HTTP ' + r.status);
    const list = (await r.json()).items || []; if (!list.length) { toast('No new submission.'); return; }
    const items = [];
    for (const it of list.slice(0, 50)) {
      const b = await api(`/v1/inbox/${encodeURIComponent(it.id)}?ws=${ws.intake.wsKey}`); if (!b.ok) continue;
      const u8 = new Uint8Array(await b.arrayBuffer());
      if (it.kind === 'email') items.push({ source:'email', received:it.received, meta:{ via:'forwarded e-mail' }, files:[{ name:`email-${String(it.received).slice(0, 10)}.eml`, bytes:u8 }], name:it.subject || 'forwarded e-mail', inboxId:it.id, founderFrom:it.from });
      else { const j = JSON.parse(new TextDecoder().decode(u8)); items.push({ source:'website', received:it.received, meta:Object.assign({ via:'website form' }, j.meta || {}), text:(j.meta || {}).message || '', files:(j.files || []).map(f => ({ name:f.name, bytes:Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)), type:f.type })), name:(j.meta || {}).company || 'website submission', inboxId:it.id }); }
    }
    await flRunItems(items);
    for (const it of items) { await api(`/v1/inbox/${encodeURIComponent(it.inboxId)}?ws=${ws.intake.wsKey}`, { method:'DELETE' }).catch(() => {});
      const d = FS.deals.find(x => (x.files || []).some(f => it.files.some(g => g.name === f.name)) && x.source === it.source);
      if (ws.notify.ack && d && d.email && !d.ackSent) { const a = await api(`/v1/ack?ws=${ws.intake.wsKey}`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ to:d.email, company:d.company || '' }) }).catch(() => null); if (a && a.ok) { d.ackSent = new Date().toISOString(); await flSave(d); } } }
    flPushDigest().catch(() => {});
  } catch (e) { toast('Inbox: ' + String(e.message || e).slice(0, 160), 'err'); }
}
/* the weekly digest is sent by the intake service from the latest list this browser pushed (no company data is kept there beyond it) */
async function flPushDigest() {
  const ws = flWs(); if (!WS_SITE.intake || !ws.intake.key || !ws.notify.digest) return;
  const dg = wsDigest(ws, FS.deals.filter(d => !d.mergedInto), flSc), to = (await FS.store.members(FS.cur.id)).map(m => m.email).filter(e => /@/.test(e || '')).slice(0, 50);
  await fetch(WS_SITE.intake + '/v1/digest?ws=' + ws.intake.wsKey, { method:'POST', credentials:'omit', referrerPolicy:'no-referrer', headers:{ authorization:'Bearer ' + ws.intake.key, 'content-type':'application/json' }, body:JSON.stringify({ subject:dg.subject, text:dg.text, to, day:ws.notify.digestDay }) });
}
function flView(v) { FS.view = v; flRender(); const m = $id('fl-main'); if (m) m.focus({ preventScroll:true }); try { history.replaceState(null, '', '#' + v); } catch (e) {} }
function flFilter(key, k, v) { const f = FS[key]; f[k] = typeof v === 'boolean' ? v : v; flRender(); if (k === 'q') { const i = $id(key + '-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } }
async function flPickWs(id) { if (id === '__new') { FS.cur = null; flRender(); return; } FS.cur = FS.list.find(x => x.id === id) || FS.cur; try { localStorage.setItem('vcr2-ws-last', id); } catch (e) {} await flLoadDeals(); flRender(); }
async function flCreateWs() {
  const name = ($id('fl-new-name') || {}).value || '', card = ($id('fl-new-card') || {}).value, pipe = ($id('fl-new-pipe') || {}).value;
  if (!name.trim()) { toast('Give the workspace a name.', 'err'); return; }
  try { const w = await FS.store.createWorkspace(wsNew(name.trim(), { scorecard:card, pipeline:pipe })); FS.list.push(w); FS.cur = w; FS.deals = []; FS.view = 'settings'; FS.setTab = 'thesis'; try { localStorage.setItem('vcr2-ws-last', w.id); } catch (e) {} toast('Workspace created. Set your thesis next.'); flRender(); }
  catch (e) { toast('Could not create it: ' + (e.message || e.code), 'err'); }
}
async function flLoadDeals() { FS.deals = FS.cur ? await FS.store.companies(FS.cur.id) : []; }
