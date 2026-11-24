/* ═══════════════════════════════════════════════════════════════
   DEAL FLOW UI, PART 3 — process stages and the investment committee (settings), the stage checklist and the IC vote
   (company panel), and the LP data room (the process document and the anonymized pipeline, with its blocking check).
   ═══════════════════════════════════════════════════════════════ */
FS.lpf = FS.lpf || {}; FS.lpEdit = null; FS.imp = null;
const flEvNames = Object.fromEntries(WS_EVIDENCE_KINDS);

/* ── settings: process stages ── */
function flSetProcess(d) {
  const st = d.pipeline.statuses, S0 = d.pipeline.stages || {};
  return `<h2>Due diligence process</h2><p class="fl-muted">The stages are your pipeline statuses (Settings, Pipeline): one list for both. For each stage, set its goal, its checklist, who owns it, its target time and the evidence VCR2 brings to it. Start from the full preset (Sourcing to Post-investment monitoring) in Settings, Pipeline, or import your own process document below.</p>
    ${st.map(s => { const x = S0[s] || { goal:'', checklist:[], owner:'', days:null, evidence:[] }, p = 'pipeline.stages.' + s; return `<details class="card fl-stage"${x.goal ? '' : ' open'}><summary><b>${esc(s)}</b> <span class="fl-muted fl-small">${esc(x.owner || 'no owner')} · ${x.days ? x.days + ' days' : 'no target'} · ${x.checklist.length} checks</span></summary>
      <label class="acct-field">Goal <textarea class="form-inp" rows="2" maxlength="400" data-change="flStage" data-a="${esc(s)}" data-b="goal">${esc(x.goal)}</textarea></label>
      <label class="acct-field">Checklist, one item per line <textarea class="form-inp" rows="4" data-change="flStage" data-a="${esc(s)}" data-b="checklist">${esc(x.checklist.join('\n'))}</textarea></label>
      <div class="fl-grid2"><label class="acct-field">Owner role <input class="form-inp" maxlength="60" value="${esc(x.owner)}" data-change="flStage" data-a="${esc(s)}" data-b="owner"></label><label class="acct-field">Target (days) <input class="form-inp" inputmode="numeric" value="${x.days == null ? '' : esc(x.days)}" data-change="flStage" data-a="${esc(s)}" data-b="days"></label></div>
      <div class="fl-chips">${WS_EVIDENCE_KINDS.map(([k, l]) => `<label class="fl-chipbox"><input type="checkbox" data-change="flStageEv" data-a="${esc(s)}" data-b="${k}"${x.evidence.includes(k) ? ' checked' : ''}> ${esc(l)}</label>`).join('')}</div></details>`; }).join('')}
    <h3>Import your existing process</h3><p class="fl-small fl-muted">Paste your process notes or a framework document, or choose a file (.txt, .md, .docx, .pdf). VCR2 maps headings onto your stages, bullets onto their checklists, and recognises committee rules (quorum, majority, recusal, tie). Nothing changes until you confirm. No AI is used.</p>
    <textarea class="form-inp" id="fl-imp-text" rows="5" aria-label="Process notes"></textarea>
    <p><input type="file" id="fl-imp-file" accept=".txt,.md,.docx,.pdf" aria-label="Process document"> <button class="btn btn-ghost btn-sm" data-click="flImportProc">Read it</button></p>
    ${FS.imp ? `<div class="card"><h3>What VCR2 found</h3>${Object.keys(FS.imp.stages).length ? Object.entries(FS.imp.stages).map(([s, v]) => `<label class="fl-check"><input type="checkbox" class="fl-imp-st" value="${esc(s)}" checked> <b>${esc(s)}</b>: ${v.goal ? esc(v.goal.slice(0, 100)) + ' · ' : ''}${v.checklist.length} checklist item${v.checklist.length === 1 ? '' : 's'}${v.checklist.length ? ` (${esc(v.checklist.slice(0, 3).join('; '))}${v.checklist.length > 3 ? '…' : ''})` : ''}</label>`).join('<br>') : '<p>No stage heading recognised.</p>'}
      ${Object.keys(FS.imp.ic).length ? `<p><label class="fl-check"><input type="checkbox" id="fl-imp-ic" checked> Committee rules: ${esc(Object.entries(FS.imp.ic).map(([k, v]) => k + ' ' + v).join(', '))}</label></p>` : ''}
      ${FS.imp.unmatched.length ? `<details class="fl-small"><summary>${FS.imp.unmatched.length} lines not placed</summary><ul>${FS.imp.unmatched.slice(0, 20).map(u => `<li>${esc(u)}</li>`).join('')}</ul></details>` : ''}
      <p><button class="btn btn-primary btn-sm" data-click="flImportApply">Apply what is ticked</button> <button class="btn btn-ghost btn-sm" data-click="flImportDrop">Discard</button></p></div>` : ''}`;
}
function flStage(s, k, v) { const d = flDraft(); d.pipeline.stages = d.pipeline.stages || {}; const x = d.pipeline.stages[s] = Object.assign({ goal:'', checklist:[], owner:'', days:null, evidence:[] }, d.pipeline.stages[s]); if (k === 'checklist') x.checklist = String(v).split('\n').map(y => y.trim()).filter(Boolean); else if (k === 'days') x.days = String(v).trim() === '' ? null : parseFloat(v); else x[k] = String(v); flRender(); }
function flStageEv(s, k, on) { const d = flDraft(); const x = d.pipeline.stages[s] = Object.assign({ evidence:[] }, d.pipeline.stages[s]); x.evidence = on ? [...new Set((x.evidence || []).concat([k]))] : (x.evidence || []).filter(e => e !== k); flRender(); }
async function flImportProc() {
  let text = ($id('fl-imp-text') || {}).value || ''; const f = (($id('fl-imp-file') || {}).files || [])[0];
  if (f) { const r = await sfReadFile(new Uint8Array(await f.arrayBuffer()), f.name); if (r && r.ok && r.doc) text += '\n' + r.doc.blocks.map(b => b.type === 'list' ? '- ' + b.text : b.type === 'table' ? (b.rows || []).map(x => x.join(' ')).join('\n') : b.text).join('\n'); else { toast('The file could not be read: ' + ((r && r.why) || 'unknown format'), 'err'); return; } }
  if (!text.trim()) { toast('Paste the text or choose a file first.', 'err'); return; }
  FS.imp = wsImportProcess(text, wsNormalize(flDraft())); flRender();
}
function flImportApply() {
  const st = [...document.querySelectorAll('.fl-imp-st')].filter(x => x.checked).map(x => x.value), ic = !!($id('fl-imp-ic') && $id('fl-imp-ic').checked);
  _flDraft = JSON.parse(JSON.stringify(wsApplyImport(wsNormalize(flDraft()), FS.imp, { stages:st, ic })));
  FS.imp = null; toast('Applied to the draft: check it, then Save.'); flRender();
}
function flImportDrop() { FS.imp = null; flRender(); }

/* ── settings: investment committee ── */
function flSetIc(d) {
  const ic = d.ic || wsNormIc({}), mem = ic.members || [];
  const sel = (path, cur, opts) => `<select class="form-inp" data-change="flDStr" data-a="${path}">${opts.map(([v, l]) => `<option value="${v}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<h2>Investment committee</h2><p class="fl-muted">Who sits on the committee, how many must be present, how it votes, and how conflicts, ties and approvals with conditions are handled. Every vote is stored with the company and its IC memo.</p>
    <div class="tbl-wrap"><table class="fl-tbl"><thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Votes</th><th scope="col">Managing partner</th><th scope="col">Chair</th><th scope="col"></th></tr></thead><tbody>
    ${mem.map((m, i) => `<tr><td><input class="form-inp" maxlength="80" aria-label="Member ${i + 1} name" value="${esc(m.name)}" data-change="flIcMem" data-a="#${i}" data-b="name"></td><td><input class="form-inp" maxlength="60" aria-label="Member ${i + 1} role" value="${esc(m.role)}" data-change="flIcMem" data-a="#${i}" data-b="role"></td>
      <td><input type="checkbox" aria-label="${esc(m.name)} votes" data-change="flIcMem" data-a="#${i}" data-b="vote"${m.vote ? ' checked' : ''}></td><td><input type="checkbox" aria-label="${esc(m.name)} is managing partner" data-change="flIcMem" data-a="#${i}" data-b="mp"${m.mp ? ' checked' : ''}></td><td><input type="checkbox" aria-label="${esc(m.name)} chairs" data-change="flIcMem" data-a="#${i}" data-b="chair"${m.chair ? ' checked' : ''}></td>
      <td><button class="btn btn-ghost btn-sm" data-click="flIcDel" data-a="#${i}">Remove</button></td></tr>`).join('')}</tbody></table></div>
    <p><button class="btn btn-ghost btn-sm" data-click="flIcAdd">Add a member</button></p>
    <div class="fl-grid2">${flNumIn('ic.quorum', ic.quorum, 'Quorum (voting members present, recused ones excluded)')}
      <label class="acct-field">Voting rule ${sel('ic.rule', ic.rule, Object.entries(WS_IC_RULES))}</label>
      <label class="acct-field">Conflicts of interest ${sel('ic.conflicts', ic.conflicts, [['recuse', 'Declared; the member is recused (no vote, not in the quorum)'], ['disclose', 'Declared and recorded; the member still votes']])}</label>
      <label class="acct-field">On a tie ${sel('ic.tie', ic.tie, [['declined', 'Declined'], ['chair', 'The chair decides'], ['revote', 'Discuss and vote again']])}</label>
      <label class="acct-field">"Yes, with conditions" ${sel('ic.conditions', ic.conditions, [['yes', 'Counts as yes; conditions recorded'], ['no', 'Counts as no until the conditions are met']])}</label></div>
    <label class="acct-field">Other rules (shown in the LP process document) <textarea class="form-inp" rows="2" maxlength="1500" data-change="flDStr" data-a="ic.notes">${esc(ic.notes || '')}</textarea></label>`;
}
function flIcMem(i, k, v) { const ic = flDraft().ic; const m = ic.members[i]; if (!m) return; m[k] = ['vote', 'mp', 'chair'].includes(k) ? !!v : String(v).slice(0, 80); flRender(); }
function flIcAdd() { const d = flDraft(); d.ic = d.ic || wsNormIc({}); d.ic.members.push({ name:'', role:'Partner', vote:true, mp:false, chair:false }); flRender(); }
function flIcDel(i) { flDraft().ic.members.splice(i, 1); flRender(); }

/* ── company panel: the stage checklist and the IC vote ── */
function flDrawerProcess(d) {
  const ws = flWs(), st = wsStage(ws, d.status), ck = wsChecklist(ws, d), age = wsStageAge(ws, d);
  const ev = st.evidence.map(k => flEvNames[k]).filter(Boolean);
  let h = `<h3>Stage: ${esc(d.status || '')}</h3>${st.goal ? `<p class="fl-small">${esc(st.goal)}</p>` : ''}<p class="fl-small fl-muted">${[st.owner && 'Owner: ' + esc(st.owner), age.days != null && `${age.days} day${age.days === 1 ? '' : 's'} in this stage${st.days ? ` (target ${st.days})` : ''}`, ev.length && 'VCR2 evidence here: ' + esc(ev.join('; '))].filter(Boolean).join(' · ')}${age.late ? ' <span class="fl-flag">Late</span>' : ''}</p>
    ${ck.length ? `<ul class="fl-checklist">${ck.map(c => `<li><label class="fl-check"><input type="checkbox" data-change="flTickItem" data-a="${esc(d.id)}" data-b="${esc(c.item)}"${c.done ? ' checked' : ''}> ${esc(c.item)}</label>${c.done && c.by ? ` <span class="fl-muted fl-small">${esc(c.by)}, ${esc(String(c.at).slice(0, 10))}</span>` : ''}</li>`).join('')}</ul>` : ''}`;
  const ic = ws.ic || wsNormIc({}), voters = ic.members.filter(m => m.vote), isVote = /vote|\bIC\b/i.test(d.status || '');
  if (voters.length && (isVote || d.ic)) {
    const draft = FS.icDraft && FS.icDraft.id === d.id ? FS.icDraft.votes : voters.map(m => ({ member:m.name, vote:'', conflict:false, conditionsText:'' }));
    const t = wsIcTally(ws, draft.filter(v => v.vote));
    h += `<h3>Investment committee vote</h3>${d.memo && d.memo.url ? `<p class="fl-small">IC memo: <a href="${esc(d.memo.url)}" target="_blank" rel="noopener noreferrer">open</a> (${esc(String(d.memo.at || '').slice(0, 10))})</p>` : '<p class="fl-small fl-warn">No IC memo yet: create the deal memo first (above) so the vote links to it.</p>'}
      ${d.ic ? `<p><b>${esc(d.ic.label)}</b> on ${esc(String(d.ic.at).slice(0, 10))}${d.ic.by ? ' (recorded by ' + esc(d.ic.by) + ')' : ''}. ${esc(d.ic.why || '')}</p><ul class="fl-small">${d.ic.votes.map(v => `<li>${esc(v.member)}: ${esc(WS_VOTES[v.vote] || v.vote)}${v.conflict ? ', conflict declared' : ''}${v.conditionsText ? ': ' + esc(v.conditionsText) : ''}</li>`).join('')}</ul>` : ''}
      <div class="tbl-wrap"><table class="fl-tbl"><thead><tr><th scope="col">Member</th><th scope="col">Vote</th><th scope="col">Conflict</th><th scope="col">Conditions</th></tr></thead><tbody>${draft.map((v, i) => `<tr><td>${esc(v.member)}</td>
        <td><select class="form-inp" aria-label="Vote of ${esc(v.member)}" data-change="flIcVote" data-a="${esc(d.id)}" data-b="#${i}" data-c="vote"><option value="">Choose</option>${Object.entries(WS_VOTES).map(([k, l]) => `<option value="${k}"${v.vote === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></td>
        <td><input type="checkbox" aria-label="${esc(v.member)} declares a conflict" data-change="flIcVote" data-a="${esc(d.id)}" data-b="#${i}" data-c="conflict"${v.conflict ? ' checked' : ''}></td>
        <td>${v.vote === 'conditions' ? `<input class="form-inp" maxlength="500" aria-label="Conditions of ${esc(v.member)}" value="${esc(v.conditionsText)}" data-change="flIcVote" data-a="${esc(d.id)}" data-b="#${i}" data-c="conditionsText">` : ''}</td></tr>`).join('')}</tbody></table></div>
      <p class="fl-small">If recorded now: <b>${esc(t.label)}</b>. ${esc(t.why || '')}</p>
      <p><button class="btn btn-primary btn-sm" data-click="flIcSave" data-a="${esc(d.id)}"${draft.some(v => v.vote) ? '' : ' disabled'}>Record the vote</button></p>`;
  }
  return h;
}
function flTickItem(id, item, on) { const d = FS.deals.find(x => x.id === id); if (!d) return; d.checks = wsTick(d, d.status, item, on, flWho()); flSave(d).then(flRender); }
function flIcVote(id, i, k, v) {
  const d = FS.deals.find(x => x.id === id); if (!d) return;
  if (!FS.icDraft || FS.icDraft.id !== id) FS.icDraft = { id, votes:flWs().ic.members.filter(m => m.vote).map(m => ({ member:m.name, vote:'', conflict:false, conditionsText:'' })) };
  const x = FS.icDraft.votes[i]; if (!x) return; x[k] = k === 'conflict' ? !!v : String(v); if (k === 'conflict' && v && flWs().ic.conflicts === 'recuse') x.vote = 'recused';
  flDrawer();
}
async function flIcSave(id) {
  const d = FS.deals.find(x => x.id === id); if (!d || !FS.icDraft || FS.icDraft.id !== id) return;
  const votes = FS.icDraft.votes.filter(v => v.vote).map(v => Object.assign({}, v, { at:new Date().toISOString() }));
  const nd = wsIcRecord(flWs(), d, votes, flWho()), i = FS.deals.findIndex(x => x.id === id);
  nd._v = d._v; FS.deals[i] = nd; FS.icDraft = null; await flSave(nd);
  if (flWs().storage.sheet && wsConnector(flWs()) && wsConnector(flWs()).connected()) await flSyncSheet(true);
  if (flWs().integrations.webhook) wsWebhook(flCtx(), 'company.ic_vote', nd).catch(() => {});
  toast(`Vote recorded: ${nd.ic.label}.`); flRender();
}

/* ── the LP data room ── */
function flLp() {
  const ws = flWs(), f = FS.lpf, ents = wsLpEntries(ws, FS.deals, f), byId = Object.fromEntries(FS.deals.map(d => [d.id, d]));
  const flagsOf = e => wsLpOpenFlags(e, byId[e.id], FS.deals.filter(d => !d.mergedInto)), open = ents.map(e => ({ e, fl:flagsOf(e) })), nOpen = open.reduce((s, x) => s + x.fl.length, 0);
  const asOf = wsIso(Date.now()), con = wsConnector(ws), on = !!(con && con.connected()), ex = ws.lp.exports || {};
  const opt = (v, l, cur) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`;
  const secIds = [...new Set(FS.deals.map(d => d.sector).filter(Boolean))];
  const link = k => ex[k] && ex[k].url ? ` <a href="${esc(ex[k].url)}" target="_blank" rel="noopener noreferrer">open</a> <span class="fl-muted fl-small">(${esc(String(ex[k].at).slice(0, 10))})</span>` : '';
  return `<div class="fl-head"><h1>LP data room</h1><p class="fl-muted">Two LP-facing documents, ready for a data room (Google Drive or DocSend): your due diligence process, and your pipeline without naming any company. LP-facing outputs are built from a short list of generic fields only; notes, reviewers, contacts and deck text never reach them.</p></div>
  <div class="card"><h2>Due diligence process <span class="fl-chip">LP-facing</span></h2><p class="fl-small fl-muted">From Settings: Pipeline, Process stages and Investment committee. One-page flowchart, each stage, the committee and its voting rules, and how evidence-first scoring fits in.</p>
    <p><button class="btn btn-ghost btn-sm" data-click="flDdpView">Preview and print (PDF)</button> <button class="btn btn-ghost btn-sm" data-click="flDdpDownload">Download (HTML)</button>
    ${on ? `<button class="btn btn-primary btn-sm" data-click="flDdpDrive">${ex.ddpDoc ? 'Refresh in Google Drive' : 'Create in Google Drive (Doc and PDF)'}</button>` : '<span class="fl-muted fl-small">Connect Google (Settings) to create it in your Drive.</span>'}</p>
    <p class="fl-small">${ex.ddpDoc ? 'Google Doc:' + link('ddpDoc') : ''} ${ex.ddpPdf ? ' · PDF:' + link('ddpPdf') : ''}</p></div>
  <div class="card"><h2>Anonymized pipeline <span class="fl-chip">LP-facing</span></h2>
    <div class="fl-filters">
      <select class="form-inp" aria-label="Sector" data-change="flLpFilter" data-a="sector">${opt('', 'All sectors', f.sector || '')}${secIds.map(s => opt(s, (WS_SECTORS.find(x => x.id === s) || {}).n || s, f.sector)).join('')}</select>
      <select class="form-inp" aria-label="Stage" data-change="flLpFilter" data-a="stage">${opt('', 'All stages', f.stage || '')}${WS_STAGE_IDS.map(s => opt(s, WS_STAGE_N[s], f.stage)).join('')}</select>
      <select class="form-inp" aria-label="Tier" data-change="flLpFilter" data-a="tier">${opt('', 'All tiers', f.tier || '')}${ws.scorecard.tiers.map(t => opt(t.name, t.name, f.tier)).join('')}</select>
      <label class="fl-check">From <input class="form-inp" type="date" value="${esc(f.from || '')}" data-change="flLpFilter" data-a="from"></label><label class="fl-check">to <input class="form-inp" type="date" value="${esc(f.to || '')}" data-change="flLpFilter" data-a="to"></label>
      <label class="fl-check"><input type="checkbox" data-change="flLpTier"${ws.lp.showTier ? ' checked' : ''}> Show the priority tier</label></div>
    <p class="fl-small fl-muted">Code prefixes: ${secIds.map(s => `<label class="fl-check">${esc((WS_SECTORS.find(x => x.id === s) || {}).n || s)} <input class="form-inp fl-w" maxlength="6" value="${esc((ws.lp.prefixes || {})[s] || WS_LP_PREFIX[s] || 'GEN')}" data-change="flLpPrefix" data-a="${esc(s)}"></label>`).join(' ')}</p>
    <label class="acct-field">Reviewer name (to accept a flag) <input class="form-inp" id="fl-lp-rev" maxlength="80" value="${esc(FS.lpRev || flWho())}" data-change="flLpRev"></label>
    <p class="${nOpen ? 'fl-warn' : 'fl-good'}"><b>${ents.length}</b> compan${ents.length === 1 ? 'y' : 'ies'} · ${nOpen ? `${nOpen} open flag${nOpen === 1 ? '' : 's'}: export blocked until each is fixed or accepted by a named reviewer.` : 'Anonymization check passed.'}</p>
    <div class="tbl-wrap"><table class="fl-tbl"><thead><tr><th scope="col">In</th><th scope="col">Code</th><th scope="col">Sector</th><th scope="col">Stage</th><th scope="col">Round</th><th scope="col">Valuation</th><th scope="col">Region</th><th scope="col">Description and fit</th><th scope="col">Pipeline</th>${ws.lp.showTier ? '<th scope="col">Tier</th>' : ''}</tr></thead><tbody>
    ${open.map(({ e, fl }) => `<tr class="${fl.length ? 'fl-flagged' : ''}"><td><input type="checkbox" aria-label="Include ${esc(e.code)}" checked data-change="flLpInclude" data-a="${esc(e.id)}"></td><th scope="row">${esc(e.code)}</th><td>${esc(e.sector)}${e.subsector ? `<div class="fl-muted fl-small">${esc(e.subsector)}</div>` : ''}</td><td>${esc(e.stage)}</td><td>${esc(e.round)}</td><td>${esc(e.valuation)}</td><td>${esc(e.region)}</td>
      <td>${FS.lpEdit === e.id ? `<textarea class="form-inp" rows="2" id="fl-lp-d" aria-label="Description">${esc(e.description)}</textarea><textarea class="form-inp" rows="2" id="fl-lp-f" aria-label="Why it fits">${esc(e.fit)}</textarea><button class="btn btn-primary btn-sm" data-click="flLpSave" data-a="${esc(e.id)}">Check and keep</button>` : `${esc(e.description)}<div class="fl-muted fl-small">${esc(e.fit)}</div><button class="btn btn-ghost btn-sm" data-click="flLpEditGo" data-a="${esc(e.id)}">Edit</button>`}
        ${fl.map(x => `<div class="fl-lpflag"><span class="fl-flag">${esc(x.kind)}</span> “${esc(x.match)}” in ${esc(x.field)}. ${esc(x.why)} <button class="btn btn-ghost btn-sm" data-click="flLpFixGo" data-a="${esc(e.id)}" data-b="${esc(x.key)}">${x.suggest ? `Replace with “${esc(x.suggest)}”` : 'Remove it'}</button> <button class="btn btn-ghost btn-sm" data-click="flLpAcceptGo" data-a="${esc(e.id)}" data-b="${esc(x.key)}">Accept as is</button></div>`).join('')}</td>
      <td>${esc(e.pipelineStage)}</td>${ws.lp.showTier ? `<td>${esc(e.tier)}</td>` : ''}</tr>`).join('')}</tbody></table></div>
    <p>${on ? `<button class="btn btn-primary btn-sm" data-click="flLpDrive"${nOpen ? ' disabled' : ''}>${ex.lpDoc ? 'Refresh in Google Drive' : 'Create in Google Drive (Doc, Sheet and PDF)'}</button>` : ''}
      <button class="btn btn-ghost btn-sm" data-click="flLpView"${nOpen ? ' disabled' : ''}>Preview and print (PDF)</button> <button class="btn btn-ghost btn-sm" data-click="flLpDownload" data-a="html"${nOpen ? ' disabled' : ''}>Download (HTML)</button> <button class="btn btn-ghost btn-sm" data-click="flLpDownload" data-a="csv"${nOpen ? ' disabled' : ''}>Download (CSV)</button></p>
    <p class="fl-small">${['lpDoc', 'lpSheet', 'lpPdf'].filter(k => ex[k]).map(k => ({ lpDoc:'Google Doc', lpSheet:'Google Sheet', lpPdf:'PDF' })[k] + ':' + link(k)).join(' · ')} ${ex.lpDoc ? '· Data as of the last refresh; refresh in one click when the pipeline changes.' : ''}</p>
    ${(ws.lp.log || []).length ? `<details class="fl-small"><summary>Accepted flags log (${ws.lp.log.length})</summary><ul>${ws.lp.log.slice(-40).reverse().map(l => `<li>${esc(String(l.at).slice(0, 16).replace('T', ' '))} ${esc(l.by)}: ${esc(l.code)} ${esc(l.text)}</li>`).join('')}</ul></details>` : ''}
  </div>`;
}
const flLpEnts = () => { const f = Object.assign({}, FS.lpf); return wsLpEntries(flWs(), FS.deals, f); };
function flLpFilter(k, v) { FS.lpf[k] = v; flRender(); }
function flLpRev(v) { FS.lpRev = String(v).slice(0, 80); }
async function flWsSaveDirect(mut) { const w = JSON.parse(JSON.stringify(flWs())); mut(w); const d = wsNormalize(w); try { FS.cur.version = await FS.store.saveWorkspace(FS.cur.id, d, FS.cur.version); FS.cur.settings = d; _flDraft = null; } catch (e) { toast(e.code === 'version_conflict' ? 'Settings changed elsewhere: reload the page.' : 'Not saved: ' + (e.message || e.code), 'err', 7000); } flRender(); }
function flLpTier(on) { flWsSaveDirect(w => { w.lp.showTier = !!on; }); }
function flLpPrefix(s, v) { if (!/^[A-Za-z0-9]{1,6}$/.test(v)) { toast('A prefix is 1 to 6 letters or digits.', 'err'); return; } flWsSaveDirect(w => { w.lp.prefixes = Object.assign({}, w.lp.prefixes, { [s]:v }); }); }
function flLpInclude(id, on) { const d = FS.deals.find(x => x.id === id); if (!d) return; d.lp = Object.assign({}, d.lp, { exclude:!on }); flSave(d).then(flRender); }
function flLpEditGo(id) { FS.lpEdit = id; flRender(); }
function flLpSave(id) { const d = FS.deals.find(x => x.id === id); if (!d) return; d.lp = Object.assign({}, d.lp, { description:wsClip(($id('fl-lp-d') || {}).value, 600), fit:wsClip(($id('fl-lp-f') || {}).value, 400) }); FS.lpEdit = null; flSave(d).then(flRender); }
function flLpFlag(id, key) { const d = FS.deals.find(x => x.id === id), e = flLpEnts().find(x => x.id === id); return d && e ? { d, e, f:wsLpOpenFlags(e, d, FS.deals.filter(x => !x.mergedInto)).find(x => x.key === key) } : {}; }
function flLpFixGo(id, key) {
  const { d, e, f } = flLpFlag(id, key); if (!f) return;
  if (f.field === 'subsector') { d.facts = Object.assign({}, d.facts, { src:Object.assign({}, (d.facts || {}).src, { sector:Object.assign({}, ((d.facts || {}).src || {}).sector, { word:'' }) }) }); }
  else d.lp = Object.assign({}, d.lp, { [f.field]:wsLpFix(e[f.field], f) });
  flSave(d).then(flRender);
}
function flLpAcceptGo(id, key) {
  const { d, f } = flLpFlag(id, key), who = (FS.lpRev || ($id('fl-lp-rev') || {}).value || '').trim(); if (!f) return;
  if (!who) { toast('Type the reviewer name first.', 'err'); return; }
  const r = wsLpAccept(flWs(), d, Object.assign({}, f), who), code = flLpEnts().find(x => x.id === id).code; r.log[r.log.length - 1].code = code;
  Object.assign(d, { lp:r.deal.lp }); flSave(d).then(() => flWsSaveDirect(w => { w.lp.log = r.log; }));
}
/* every LP output passes the leak guard before it leaves the browser */
function flLpOut(kind) {
  const ws = flWs(), ents = flLpEnts(), asOf = wsIso(Date.now()), byId = Object.fromEntries(FS.deals.map(d => [d.id, d]));
  if (ents.some(e => wsLpOpenFlags(e, byId[e.id], FS.deals.filter(d => !d.mergedInto)).length)) throw new Error('Some entries still have open flags.');
  const out = kind === 'csv' ? wsLpCSV(ws, ents, asOf) : wsLpHTML(ws, ents, asOf);
  const leaks = wsLpLeaks(out, FS.deals); if (leaks.length) throw new Error(`Blocked: internal information found in the export (${leaks.length}). Check the descriptions.`);
  return out;
}
function flDdpOut() { const out = wsDdpHTML(flWs(), wsIso(Date.now())); if (wsLpLeaks(out, FS.deals).length) throw new Error('Blocked: the process text names a company or a person from your pipeline.'); return out; }
/* the document opens in a new tab (no script in it); the browser's Print, "Save as PDF", gives the PDF */
function flPrintHTML(html) {
  const u = URL.createObjectURL(new Blob([html.replace('</body>', '<p style="font:12px sans-serif;color:#777">To save it as PDF: Print, then “Save as PDF”.</p></body>')], { type:'text/html' }));
  const w = window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000);
  if (!w) toast('Allow pop-ups for this site to open the preview.', 'err'); else try { w.opener = null; } catch (e) {}
}
function flDdpView() { flPrintHTML(flDdpOut()); }
function flDdpDownload() { downloadFile(`${wsSlug(flWs().name)}-due-diligence-process-LP.html`, flDdpOut(), 'text/html'); }
function flLpView() { flPrintHTML(flLpOut('html')); }
function flLpDownload(k) { const ws = flWs(); downloadFile(`${wsSlug(ws.name)}-pipeline-LP-${wsIso(Date.now())}.${k === 'csv' ? 'csv' : 'html'}`, flLpOut(k), k === 'csv' ? 'text/csv' : 'text/html'); }
/* create once, then refresh the same files (the links in the data room keep working) */
async function flDriveDoc(key, name, html, kind) {
  const con = WSG, ex = flWs().lp.exports || {}, parent = (flWs().storage.folders.root || {}).id, bytes = new TextEncoder().encode(html);
  if (ex[key]) { try { const r = await con.update(ex[key].id, bytes, kind === 'sheet' ? 'text/csv' : 'text/html'); return { id:r.id, url:ex[key].url || r.url, at:new Date().toISOString() }; } catch (e) {} }
  const r = await con.upload(name, bytes, kind === 'sheet' ? 'text/csv' : 'text/html', parent, kind === 'sheet' ? 'sheet' : true);
  return { id:r.id, url:r.url, at:new Date().toISOString() };
}
async function flDrivePdf(key, name, docId) {
  const ex = flWs().lp.exports || {}, pdf = await WSG.exportPdf(docId), parent = (flWs().storage.folders.root || {}).id;
  if (ex[key]) { try { const r = await WSG.update(ex[key].id, pdf, 'application/pdf'); return { id:r.id, url:ex[key].url || r.url, at:new Date().toISOString() }; } catch (e) {} }
  const r = await WSG.upload(name, pdf, 'application/pdf', parent, false); return { id:r.id, url:r.url, at:new Date().toISOString() };
}
async function flDdpDrive() {
  try { toast('Writing the process document…'); const html = flDdpOut(), nm = `${flWs().name}: due diligence process (LP-facing)`;
    const doc = await flDriveDoc('ddpDoc', nm, html), pdf = await flDrivePdf('ddpPdf', nm + '.pdf', doc.id);
    await flWsSaveDirect(w => { w.lp.exports = Object.assign({}, w.lp.exports, { ddpDoc:doc, ddpPdf:pdf }); }); toast('Process document ready in your Drive.'); }
  catch (e) { toast(String(e.message || e).slice(0, 200), 'err', 8000); }
}
async function flLpDrive() {
  try { toast('Writing the pipeline overview…'); const html = flLpOut('html'), csv = flLpOut('csv'), nm = `${flWs().name}: pipeline overview (LP-facing)`;
    const doc = await flDriveDoc('lpDoc', nm, html), sheet = await flDriveDoc('lpSheet', nm, csv, 'sheet'), pdf = await flDrivePdf('lpPdf', nm + '.pdf', doc.id);
    await flWsSaveDirect(w => { w.lp.exports = Object.assign({}, w.lp.exports, { lpDoc:doc, lpSheet:sheet, lpPdf:pdf }); }); toast('Pipeline overview ready in your Drive (Doc, Sheet, PDF).'); }
  catch (e) { toast(String(e.message || e).slice(0, 200), 'err', 8000); }
}
Object.assign(FLOW_CALLS, { flStage, flStageEv, flImportProc, flImportApply, flImportDrop, flIcMem, flIcAdd, flIcDel, flTickItem, flIcVote, flIcSave,
  flLpFilter, flLpRev, flLpTier, flLpPrefix, flLpInclude, flLpEditGo, flLpSave, flLpFixGo, flLpAcceptGo, flDdpView, flDdpDownload, flLpView, flLpDownload, flDdpDrive, flLpDrive });
