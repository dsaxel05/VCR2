/* ═══════════════════════════════════════════════════════════════
   DEAL FLOW SETTINGS AND HELP — everything is set per workspace, by its admins: thesis, scorecard, pipeline, intake,
   Google Drive and the master sheet, memo template, team, notifications, integrations.
   ═══════════════════════════════════════════════════════════════ */
const FL_SET_TABS = [['thesis', 'Thesis'], ['scorecard', 'Scorecard'], ['pipeline', 'Pipeline'], ['process', 'Process stages'], ['committee', 'Investment committee'], ['intake', 'Intake'], ['google', 'Google Drive and sheet'], ['memo', 'Deal memo'], ['team', 'Team'], ['notify', 'Notifications'], ['integrations', 'Integrations'], ['workspace', 'Workspace']];
let _flDraft = null;   /* the settings being edited; saved with "Save" so a half-typed change never re-scores everyone */
const flDraft = () => (_flDraft = _flDraft || JSON.parse(JSON.stringify(flWs())));
const flAdmin = () => FS.role === 'admin' || (FS.cur && FS.cur.role === 'admin');
function flSettings() {
  const t = FS.setTab, d = flDraft(), dirty = JSON.stringify(wsNormalize(d)) !== JSON.stringify(flWs());
  const body = t === 'process' ? flSetProcess(d) : t === 'committee' ? flSetIc(d) : t === 'scorecard' ? flSetCard(d) : t === 'pipeline' ? flSetPipe(d) : t === 'intake' ? flSetIntake(d) : t === 'google' ? flSetGoogle(d) : t === 'memo' ? flSetMemo(d) : t === 'team' ? flSetTeam() : t === 'notify' ? flSetNotify(d) : t === 'integrations' ? flSetInteg(d) : t === 'workspace' ? flSetWs(d) : flSetThesis(d);
  return `<div class="fl-head"><h1>Settings</h1>${flAdmin() ? '' : '<p class="fl-warn">You are a member of this workspace: only its admins change the settings.</p>'}</div>
    <div class="fl-settabs" role="tablist">${FL_SET_TABS.map(([id, l]) => `<button role="tab" class="fl-settab${t === id ? ' active' : ''}" aria-selected="${t === id}" data-click="flSetTab" data-a="${id}">${esc(l)}</button>`).join('')}</div>
    <div class="card fl-setbody"${flAdmin() ? '' : ' inert'}>${body}</div>
    ${t !== 'team' ? `<div class="fl-savebar${dirty ? ' dirty' : ''}"><span>${dirty ? 'Unsaved changes.' : 'Saved.'}</span> <button class="btn btn-primary" data-click="flSaveSettings"${dirty && flAdmin() ? '' : ' disabled'}>Save and re-score</button> <button class="btn btn-ghost" data-click="flDiscard"${dirty ? '' : ' disabled'}>Discard</button></div>` : ''}`;
}
const flChk = (path, on, label) => `<label class="fl-check"><input type="checkbox" data-change="flD" data-a="${esc(path)}"${on ? ' checked' : ''}> ${label}</label>`;
const flMulti = (path, list, cur) => `<div class="fl-chips">${list.map(x => `<label class="fl-chipbox"><input type="checkbox" data-change="flDList" data-a="${esc(path)}" data-b="${esc(x.id)}"${cur.includes(x.id) ? ' checked' : ''}> ${esc(x.n)}</label>`).join('')}</div>`;
const flNumIn = (path, v, label, ph) => `<label class="acct-field">${label} <input class="form-inp" inputmode="decimal" value="${v == null ? '' : esc(v)}" placeholder="${esc(ph || 'any')}" data-change="flDNum" data-a="${esc(path)}"></label>`;
function flSetThesis(d) {
  const t = d.thesis;
  return `<h2>Your thesis</h2><p class="fl-muted">Leave a criterion empty to accept anything. Missing information never fails a company: it becomes “Borderline (needs info)” with the questions to ask. After saving, every company is re-checked.</p>
    <h3>Stages</h3>${flMulti('thesis.stages', WS_STAGE_IDS.map(id => ({ id, n:WS_STAGE_N[id] })), t.stages)}
    <h3>Sectors</h3>${flMulti('thesis.sectors', WS_SECTORS, t.sectors)}
    <details><summary>Sectors you never invest in</summary>${flMulti('thesis.sectorsOut', WS_SECTORS, t.sectorsOut)}</details>
    <h3>Geographies</h3><p class="fl-small fl-muted">A region covers all its countries.</p>${flMulti('thesis.geos', WS_REGIONS, t.geos)}<details><summary>Countries</summary>${flMulti('thesis.geos', WS_COUNTRIES, t.geos)}</details>
    <h3>Business models</h3>${flMulti('thesis.models', WS_MODELS, t.models)}
    <h3>Round and check size</h3><div class="fl-grid2">${flNumIn('thesis.roundMin', t.roundMin, 'Round size, at least', 'e.g. 500000')}${flNumIn('thesis.roundMax', t.roundMax, 'Round size, at most', 'e.g. 5000000')}${flNumIn('thesis.checkMin', t.checkMin, 'Your check, at least')}${flNumIn('thesis.checkMax', t.checkMax, 'Your check, at most')}</div>
    <h3>Exclusions</h3><label class="acct-field">Words that put a company out of thesis, one per line (e.g. crypto, gambling, defence) <textarea class="form-inp" rows="3" data-change="flDLines" data-a="thesis.exclusions">${esc(t.exclusions.join('\n'))}</textarea></label>
    <h3>Must-haves</h3><p class="fl-small fl-muted">A word or phrase the material must show (one per line, e.g. “B2B”, “recurring revenue”), or a figure: <code>arr &gt;= 500000</code>, <code>growth &gt;= 100</code>, <code>raise &lt;= 3000000</code> (arr, raise, growth, customers, gross_margin, nrr).</p>
    <textarea class="form-inp" rows="4" aria-label="Must-haves" data-change="flDMusts">${esc(t.musts.map(m => m.kind === 'metric' ? `${m.metric} ${m.op} ${m.value}` : m.text).join('\n'))}</textarea>
    <h3>Strictness</h3><select class="form-inp" aria-label="Strictness" data-change="flDStr" data-a="thesis.strict">${[['lenient', 'Lenient: only exclusions and clear misses are out'], ['balanced', 'Balanced (default)'], ['strict', 'Strict: a near-miss on stage is out too']].map(([v, l]) => `<option value="${v}"${t.strict === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
}
function flSetCard(d) {
  const c = d.scorecard, probs = wsCardProblems(c), sum = c.pillars.reduce((s, p) => s + (+p.weight || 0), 0);
  const metricOpts = (typeof DLABEL !== 'undefined' ? Object.keys(DLABEL) : WS_PROFIT_METRICS.map(m => m.key)).filter(k => /^[a-z_][a-z0-9_]*$/.test(k));
  return `<h2>Scorecard</h2><p class="fl-muted">Pillars, weights (they must total 100%), a 1 to 5 scale, a threshold and priority tiers. Pillars marked <b>engine</b> are scored by VCR2 from the derived metrics and consistency checks, with their sources; the others are scored by a reviewer in one click (and, with your own AI key, an AI suggestion that a person must confirm).</p>
    <p><label class="acct-field">Start from a template <select class="form-inp" data-change="flCardTemplate"><option value="">Keep the current one</option>${Object.values(WS_SCORECARDS).map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label></p>
    <label class="acct-field">Name <input class="form-inp" maxlength="80" value="${esc(c.name)}" data-change="flDStr" data-a="scorecard.name"></label>
    <div class="tbl-wrap"><table class="fl-tbl"><thead><tr><th scope="col">Pillar</th><th scope="col">Weight %</th><th scope="col">Scored by</th><th scope="col">Engine metrics (key weight)</th><th scope="col"></th></tr></thead><tbody>
    ${c.pillars.map((p, i) => `<tr><td><input class="form-inp" maxlength="80" aria-label="Pillar ${i + 1} name" value="${esc(p.name)}" data-change="flPillar" data-a="#${i}" data-b="name"></td>
      <td><input class="form-inp fl-w" inputmode="decimal" aria-label="${esc(p.name)} weight" value="${esc(p.weight)}" data-change="flPillar" data-a="#${i}" data-b="weight"></td>
      <td><select class="form-inp" aria-label="${esc(p.name)} scored by" data-change="flPillar" data-a="#${i}" data-b="kind">${[['reviewer', 'Reviewer'], ['metrics', 'Engine (metrics)'], ['dimension', 'Engine (VCR2 dimension)']].map(([v, l]) => `<option value="${v}"${p.kind === v ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
      <td>${p.kind === 'metrics' ? `<input class="form-inp" aria-label="${esc(p.name)} metrics" value="${esc((p.metrics || []).map(m => m.key + ' ' + m.w).join(', '))}" data-change="flPillar" data-a="#${i}" data-b="metrics" list="fl-metric-list"><div class="fl-small fl-muted">at least ${p.minMetrics || 3} with evidence</div>` : p.kind === 'dimension' ? `<select class="form-inp" aria-label="${esc(p.name)} dimension" data-change="flPillar" data-a="#${i}" data-b="dimension">${['revenue', 'capital', 'gtm', 'team', 'market', 'govern'].map(x => `<option${p.dimension === x ? ' selected' : ''}>${x}</option>`).join('')}</select>` : '<span class="fl-muted fl-small">evidence and questions shown; a person scores</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" aria-label="Remove ${esc(p.name)}" data-click="flPillarDel" data-a="#${i}">Remove</button></td></tr>`).join('')}
    </tbody><tfoot><tr><th scope="row">Total</th><td class="${Math.abs(sum - 100) > 0.001 ? 'fl-bad' : 'fl-good'}"><b>${wsRound1(sum)}%</b></td><td colspan="3"><button class="btn btn-ghost btn-sm" data-click="flPillarAdd">Add a pillar</button></td></tr></tfoot></table></div>
    <datalist id="fl-metric-list">${metricOpts.map(k => `<option value="${esc(k)}">`).join('')}</datalist>
    ${probs.length ? `<ul class="fl-warn">${probs.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    <div class="fl-grid2">${flNumIn('scorecard.threshold', c.threshold, 'Threshold score (1 to 5): above it, a company is ready for a memo')}</div>
    <h3>Priority tiers</h3><p class="fl-small fl-muted">One per line, best first: <code>Tier 1 &gt;= 4</code>.</p>
    <textarea class="form-inp" rows="3" aria-label="Priority tiers" data-change="flTiers">${esc(c.tiers.map(t => `${t.name} >= ${t.min}`).join('\n'))}</textarea>`;
}
function flSetPipe(d) {
  const p = d.pipeline;
  return `<h2>Pipeline</h2><p><label class="acct-field">Start from a preset <select class="form-inp" data-change="flPipePreset"><option value="">Keep the current one</option>${Object.values(WS_PIPELINES).map(x => `<option value="${esc(x.id)}">${esc(x.name)}: ${esc(x.statuses.join(' → '))}</option>`).join('')}</select></label></p>
    <label class="acct-field">Statuses, in order, one per line <textarea class="form-inp" rows="6" data-change="flDLines" data-a="pipeline.statuses">${esc(p.statuses.join('\n'))}</textarea></label>
    <h3>Waiting statuses</h3><p class="fl-small fl-muted">A company in one of these is “waiting for a first look”: flagged after the target.</p>${flMulti('pipeline.waiting', p.statuses.map(s => ({ id:s, n:s })), p.waiting)}
    <h3>Closed statuses</h3>${flMulti('pipeline.closed', p.statuses.map(s => ({ id:s, n:s })), p.closed)}
    <div class="fl-grid2">${flNumIn('targets.waitingDays', d.targets.waitingDays, 'Target for a first look (days)', '7')}${flNumIn('targets.responseDays', d.targets.responseDays, 'Response target after the last contact (days)', '14')}</div>`;
}
function flFormUrl(d) { return d.intake.formId ? new URL('submit.html?f=' + d.intake.formId, location.href).href : ''; }
function flSetIntake(d) {
  const url = flFormUrl(d), on = !!(WS_SITE.intake);
  const snippet = url ? `<iframe src="${url}" title="Send us your deck" style="width:100%;max-width:640px;height:760px;border:0" loading="lazy"></iframe>` : '';
  return `<h2>Intake</h2>${on ? '' : '<p class="fl-warn">The intake service is not switched on for this site yet (site.json, workspaces.intake): the form and the forwarding address appear once it is. Adding decks by hand works now.</p>'}
    ${on && !d.intake.key ? `<p><button class="btn btn-primary" data-click="flRegisterIntake">Create this workspace's form and forwarding address</button></p>` : ''}
    ${d.intake.key ? `<h3>Submission form for your website</h3><p>Link: <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a> <button class="btn btn-ghost btn-sm" data-click="flCopy" data-a="${esc(url)}">Copy the link</button></p>
      <p class="fl-small fl-muted">Embed it on your site (paste this where the form should appear):</p><pre class="fl-code">${esc(snippet)}</pre><button class="btn btn-ghost btn-sm" data-click="flCopy" data-a="${esc(snippet)}">Copy the embed code</button>
      <h3>Forwarding address</h3><p><code class="fl-big-code">${esc(d.intake.address || '(set the mail domain in site.json)')}</code> ${d.intake.address ? `<button class="btn btn-ghost btn-sm" data-click="flCopy" data-a="${esc(d.intake.address)}">Copy</button>` : ''}</p>
      <p class="fl-small fl-muted">Forward a founder's e-mail with its deck attached to this address (or add it as an automatic forward in your mailbox). It is read the same way as a deck you add by hand when anyone in your team opens Deal flow, then removed from the intake service. Keep this address private: anything sent to it lands in your inbox here.</p>
      <p><button class="btn btn-ghost btn-sm" data-click="flRegisterIntake" data-a="#1">Change the address and the form link</button></p>` : ''}`;
}
function flSetGoogle(d) {
  const con = WSG, sh = d.storage.sheet, folders = d.storage.folders, f = k => folders[k] ? `<a href="${esc(folders[k].url)}" target="_blank" rel="noopener">${esc(folders[k].name)}</a>` : '<span class="fl-muted">not chosen</span>';
  const map = sh && sh.mapping || [], cat = wsSheetCatalog(d);
  return `<h2>Google Drive and the master sheet</h2>
    ${con.ready() ? `<p>${con.connected() ? '✓ Connected for this tab.' : 'Not connected in this tab.'} <button class="btn btn-${con.connected() ? 'ghost' : 'primary'} btn-sm" data-click="flGoogle">${con.connected() ? 'Reconnect' : 'Connect Google'}</button></p>
      <p class="fl-small fl-muted">VCR2 asks for the narrowest Drive access Google offers (“files you use with this app”): it sees only the folders and files it creates and the ones you pick below, never the rest of your Drive. Shared drives work.</p>` : '<p class="fl-warn">Google is not set up on this site yet (site.json, workspaces.google). The steps are in docs/WORKSPACES.md.</p>'}
    <label class="fl-check"><input type="checkbox" data-change="flDProvider"${d.storage.provider === 'google' ? ' checked' : ''}> File decks and reports in Google Drive and keep the master sheet up to date</label>
    <h3>Folders</h3><table class="fl-tbl"><tbody>${[['root', 'Main folder (VCR2 creates one folder per company in the folders below)'], ['in', 'In thesis'], ['border', 'Borderline'], ['out', 'Out of thesis'], ['memos', 'Deal memos (optional; else in the company folder)']].map(([k, l]) => `<tr><th scope="row">${esc(l)}</th><td>${f(k)}</td><td><button class="btn btn-ghost btn-sm" data-click="flPickFolder" data-a="${k}">Choose</button>${k !== 'root' && folders.root ? ` <button class="btn btn-ghost btn-sm" data-click="flMakeFolder" data-a="${k}">Create inside the main folder</button>` : ''}</td></tr>`).join('')}</tbody></table>
    <h3>Master sheet</h3>
    <p>${sh ? `<a href="${esc(sh.url || 'https://docs.google.com/spreadsheets/d/' + sh.id)}" target="_blank" rel="noopener">${esc(sh.name || sh.id)}</a>, tab <b>${esc(sh.tab || 'first')}</b>, headers on row ${sh.headerRow}` : '<span class="fl-muted">none yet</span>'} <button class="btn btn-ghost btn-sm" data-click="flPickSheet">Choose your sheet</button>${sh ? ' <button class="btn btn-ghost btn-sm" data-click="flReadSheet">Read its columns again</button>' : ''}</p>
    ${sh ? `<div class="fl-grid2"><label class="acct-field">Tab <input class="form-inp" value="${esc(sh.tab || '')}" data-change="flDStr" data-a="storage.sheet.tab"></label>${flNumIn('storage.sheet.headerRow', sh.headerRow, 'Header row')}</div>
      <p class="fl-small fl-muted">For each column: <b>VCR2 writes</b> (fills it and keeps it updated; a cell your team changed is never overwritten, its value comes back into VCR2), <b>VCR2 reads only</b> (formula columns are always read only), or <b>ignore</b>. Dropdown columns keep your own list of values.</p>
      <div class="tbl-wrap"><table class="fl-tbl"><thead><tr><th scope="col">Your column</th><th scope="col">VCR2 field</th><th scope="col">Mode</th><th scope="col">Note</th></tr></thead><tbody>${map.map((m, i) => `<tr><th scope="row">${esc(wsColLetter(m.col))} · ${esc(m.header)}</th>
        <td><select class="form-inp" aria-label="Field for ${esc(m.header)}" data-change="flMap" data-a="#${i}" data-b="field"><option value="">Choose</option>${['Identity', 'Pipeline', 'Scores', 'Outputs'].map(g => `<optgroup label="${g}">${cat.filter(x => x.g === g).map(x => `<option value="${esc(x.id)}"${m.field === x.id ? ' selected' : ''}>${esc(x.n)}</option>`).join('')}</optgroup>`).join('')}</select></td>
        <td><select class="form-inp" aria-label="Mode for ${esc(m.header)}" data-change="flMap" data-a="#${i}" data-b="mode">${(FS.sheetFormulas && FS.sheetFormulas.has('c' + m.col) ? [['read', 'VCR2 reads only (formula)'], ['ignore', 'Ignore']] : [['write', 'VCR2 writes'], ['read', 'VCR2 reads only'], ['ignore', 'Ignore']]).map(([v, l]) => `<option value="${v}"${m.mode === v ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
        <td class="fl-small fl-muted">${FS.sheetFormulas && FS.sheetFormulas.has('c' + m.col) ? 'formula column' : ''}${FS.sheetLists && FS.sheetLists[m.col] ? `dropdown: ${esc(FS.sheetLists[m.col].slice(0, 6).join(', '))}${FS.sheetLists[m.col].length > 6 ? '…' : ''}` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
}
function flSetMemo(d) {
  const m = d.storage.memo;
  return `<h2>Deal memo</h2><p class="fl-muted">When a company reaches your threshold, “Create the deal memo” (in its panel) writes a Google Doc filled from its data: pillar scores with their sources, the derived metrics, the consistency checks, risks, ranked diligence questions and your team's notes. Its link goes into the master sheet.</p>
    ${flChk('storage.memo.auto', m.auto, 'Create the memo automatically when a company is above the threshold (off by default)')}
    <h3>Template</h3><p><b>Your own Google Doc</b> (VCR2 copies it and replaces the placeholders): ${m.templateId ? `<code>${esc(m.templateId)}</code> <button class="btn btn-ghost btn-sm" data-click="flMemoTplClear">Use VCR2's template instead</button>` : '<span class="fl-muted">none</span>'} <button class="btn btn-ghost btn-sm" data-click="flPickTemplate">Choose a Google Doc</button></p>
    <p class="fl-small fl-muted">Placeholders: ${['company', 'date', 'workspace', 'summary', 'scorecard', 'total', 'tier', 'threshold', 'thesis', 'metrics', 'checks', 'risks', 'questions', 'notes', 'sources'].map(x => `<code>{{${x}}}</code>`).join(' ')}</p>
    <label class="acct-field">Or edit VCR2's template (# heading, - bullet, **bold**) <textarea class="form-inp fl-mono" rows="18" data-change="flDStr" data-a="storage.memo.template">${esc(m.template || WS_MEMO_TEMPLATE)}</textarea></label>`;
}
function flSetTeam() {
  const cloud = FS.store && FS.store.mode === 'cloud';
  return `<h2>Team</h2>${cloud ? `<p class="fl-muted">Only people you invite see this workspace. They sign in to VCR2 with the e-mail address you invite (Google or e-mail); the database itself refuses everyone else.</p>
    <div id="fl-team">Loading…</div>
    ${flAdmin() ? `<div class="fl-grid2"><label class="acct-field">E-mail <input class="form-inp" type="email" id="fl-inv-mail" maxlength="254"></label><label class="acct-field">Role <select class="form-inp" id="fl-inv-role"><option value="member">Member (reviews, scores, notes)</option><option value="admin">Admin (also settings and team)</option></select></label></div>
    <p><button class="btn btn-primary btn-sm" data-click="flInvite">Invite</button></p>` : ''}` : !WS_SITE.teams ? '<p>Team workspaces (shared with invited members, protected by the database) are not switched on for this site yet. For now this workspace lives in this browser only; export it as JSON at any time.</p>' : '<p>Sign in on the main page (Sign in, top left) to share a workspace with your team. Until then it lives in this browser only.</p>'}`;
}
function flSetNotify(d) {
  const n = d.notify;
  return `<h2>Notifications</h2>
    ${flChk('notify.digest', n.digest, 'Weekly digest to every member: overdue follow-ups, waiting decks, top tier (off by default)')}
    <label class="acct-field">Day <select class="form-inp" data-change="flDNum" data-a="notify.digestDay">${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((x, i) => `<option value="${i}"${n.digestDay === i ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
    <h3>Founder acknowledgement</h3><p class="fl-small fl-muted">Off by default. When on, a founder who sent a deck through your form or whose e-mail you forwarded receives this one message, once. VCR2 sends no other e-mail to founders.</p>
    ${flChk('notify.ack', n.ack, 'Send the acknowledgement')}
    <label class="acct-field">Subject <input class="form-inp" maxlength="120" value="${esc(n.ackSubject)}" data-change="flDStr" data-a="notify.ackSubject"></label>
    <label class="acct-field">Text <textarea class="form-inp" rows="5" maxlength="2000" data-change="flDStr" data-a="notify.ackText">${esc(n.ackText)}</textarea></label>
    ${WS_SITE.intake ? '' : '<p class="fl-warn">E-mails need the intake service (site.json, workspaces.intake).</p>'}`;
}
function flSetInteg(d) {
  return `<h2>Integrations</h2><p class="fl-muted">Other tools (a CRM, a deal-flow automation, an agent) can use VCR2's results: export everything as JSON, or receive a webhook each time a company is created, updated or changes status. The format is documented in <a href="https://github.com/dsaxel05/VCR2/blob/main/docs/workspace-integration.md" target="_blank" rel="noopener">docs/workspace-integration.md</a>.</p>
    <label class="acct-field">Webhook address (https) <input class="form-inp" type="url" maxlength="300" placeholder="https://hooks.example.com/vcr2" value="${esc(d.integrations.webhook)}" data-change="flDStr" data-a="integrations.webhook"></label>
    <p class="fl-small fl-muted">Each call carries a signature header (X-VCR2-Signature, HMAC-SHA256 of the body with your workspace key) so your tool can check it came from this workspace.</p>
    ${d.intake.key && flAdmin() ? `<p class="fl-small">Workspace key: <code>${esc(d.intake.key.slice(0, 4))}…${esc(d.intake.key.slice(-4))}</code> <button class="btn btn-ghost btn-sm" data-click="flCopy" data-a="${esc(d.intake.key)}">Copy the key</button> <span class="fl-muted">Keep it secret: it also reads your inbox.</span></p>` : '<p class="fl-small fl-muted">The webhook needs the intake service (Settings, Intake).</p>'}
    <p><button class="btn btn-ghost btn-sm" data-click="flExportAll">Export every company as JSON</button></p>`;
}
function flSetWs(d) {
  return `<h2>Workspace</h2><label class="acct-field">Name <input class="form-inp" maxlength="80" value="${esc(d.name)}" data-change="flDStr" data-a="name"></label>
    <label class="acct-field">Default market (currency and reference rates when the deck does not say) <select class="form-inp" data-change="flDStr" data-a="market"><option value="us"${d.market === 'us' ? ' selected' : ''}>United States ($)</option><option value="eu"${d.market === 'eu' ? ' selected' : ''}>Europe (€)</option></select></label>
    <p class="fl-small fl-muted">Stored ${FS.store && FS.store.mode === 'cloud' ? 'in your team\'s VCR2 account (settings, and per company: facts with short quotes, scores, statuses, notes; never the decks or their text)' : 'in this browser only'}.</p>
    ${flAdmin() ? '<p><button class="btn btn-ghost btn-sm fl-danger" data-click="flDeleteWs">Delete this workspace</button></p>' : ''}`;
}

/* ── editing the draft ── */
function flPath(obj, path, v) { const ks = path.split('.'); let o = obj; for (const k of ks.slice(0, -1)) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; } if (arguments.length > 2) o[ks[ks.length - 1]] = v; return o[ks[ks.length - 1]]; }
function flD(path, v) { flPath(flDraft(), path, !!v); flRender(); }
function flDStr(path, v) { flPath(flDraft(), path, String(v)); flRender(); }
function flDNum(path, v) { const n = String(v).trim() === '' ? null : parseFloat(String(v).replace(/[\s,$€£]/g, '').replace(/k$/i, '000').replace(/m$/i, '000000')); flPath(flDraft(), path, isFinite(n) ? n : null); flRender(); }
function flDLines(path, v) { flPath(flDraft(), path, String(v).split('\n').map(x => x.trim()).filter(Boolean)); flRender(); }
function flDList(path, id, on) { const a = flPath(flDraft(), path) || []; const b = on ? [...new Set(a.concat([id]))] : a.filter(x => x !== id); flPath(flDraft(), path, b); flRender(); }
function flDMusts(v) { flDraft().thesis.musts = String(v).split('\n').map(l => l.trim()).filter(Boolean).map(l => { const m = /^(arr|raise|growth|customers|gross_margin|nrr)\s*(>=|<=|>|<)\s*([\d.,]+[kKmM]?)$/i.exec(l); if (m) { let n = parseFloat(m[3].replace(/,/g, '')); if (/k$/i.test(m[3])) n *= 1e3; if (/m$/i.test(m[3])) n *= 1e6; return { kind:'metric', metric:m[1].toLowerCase(), op:m[2][0] === '<' ? '<=' : '>=', value:n }; } return { kind:'keyword', text:l }; }); flRender(); }
function flDProvider(on) { flDraft().storage.provider = on ? 'google' : 'none'; flRender(); }
function flCardTemplate(id) { if (!id || !WS_SCORECARDS[id]) return; flDraft().scorecard = JSON.parse(JSON.stringify(WS_SCORECARDS[id])); flRender(); }
function flPipePreset(id) { if (!id || !WS_PIPELINES[id]) return; flDraft().pipeline = JSON.parse(JSON.stringify(WS_PIPELINES[id])); flRender(); }
function flPillar(i, k, v) {
  const p = flDraft().scorecard.pillars[i]; if (!p) return;
  if (k === 'weight') p.weight = Math.max(0, Math.min(100, parseFloat(v) || 0));
  else if (k === 'metrics') p.metrics = String(v).split(',').map(x => x.trim().split(/\s+/)).filter(x => /^[a-z_][a-z0-9_]*$/.test(x[0])).map(x => ({ key:x[0], w:parseFloat(x[1]) || 10 }));
  else if (k === 'kind') { p.kind = v; if (v === 'metrics' && !(p.metrics || []).length) { p.metrics = WS_PROFIT_METRICS.slice(0, 6); p.minMetrics = 3; } if (v === 'dimension') p.dimension = p.dimension || 'revenue'; }
  else p[k] = String(v).slice(0, 80);
  flRender();
}
function flPillarAdd() { const c = flDraft().scorecard; c.pillars.push({ id:'pillar_' + (c.pillars.length + 1), name:'New pillar', weight:0, kind:'reviewer', evidence:[], ask:[], guide:'' }); flRender(); }
function flPillarDel(i) { flDraft().scorecard.pillars.splice(i, 1); flRender(); }
function flTiers(v) { flDraft().scorecard.tiers = String(v).split('\n').map(l => /^(.{1,40}?)\s*>=?\s*([\d.]+)\s*$/.exec(l.trim())).filter(Boolean).map(m => ({ name:m[1].trim(), min:parseFloat(m[2]) })); flRender(); }
function flMap(i, k, v) { const m = flDraft().storage.sheet.mapping[i]; if (!m) return; m[k] = v; if (k === 'field' && !v) m.mode = 'ignore'; if (FS.sheetFormulas && FS.sheetFormulas.has('c' + m.col) && m.mode === 'write') m.mode = 'read'; flRender(); }
function flDiscard() { _flDraft = null; flRender(); }
function flSetTab(t) { FS.setTab = t; flRender(); if (t === 'team') flLoadTeam(); }
async function flSaveSettings() {
  const d = wsNormalize(Object.assign({}, flDraft(), { id:flWs().id }));
  const probs = wsCardProblems(d.scorecard); if (probs.length) { toast(probs[0], 'err', 6000); return; }
  const before = FS.deals.filter(x => !x.mergedInto).map(x => Object.assign({ id:x.id, company:x.company }, flSc(x)));
  try { FS.cur.version = await FS.store.saveWorkspace(FS.cur.id, d, FS.cur.version); }
  catch (e) { toast(e.code === 'version_conflict' ? 'Another admin saved the settings meanwhile: reload the page and redo your change.' : 'Not saved: ' + (e.message || e.code), 'err', 7000); return; }
  const thesisChanged = JSON.stringify(d.thesis) !== JSON.stringify(flWs().thesis);
  if (d.intake.key) flPushIntakeConfig(d, d.intake.key, d.intake.wsKey).catch(() => {});
  FS.cur.settings = d; FS.cur.name = d.name; _flDraft = null;
  const li = FS.list.find(x => x.id === FS.cur.id); if (li) { li.settings = d; li.name = d.name; }
  const after = FS.deals.filter(x => !x.mergedInto).map(x => Object.assign({ id:x.id, company:x.company }, flSc(x)));
  FS.moved = wsRescoreDiff(before, after);
  if (thesisChanged) await flRecheckAll(); else toast(`Saved. ${FS.moved.length} compan${FS.moved.length === 1 ? 'y' : 'ies'} moved.`);
  if (FS.moved.length && FS.setTab === 'scorecard') FS.view = 'calib';
  flRender();
}
/* ── Google: connect, folders, sheet, template ── */
async function flGoogle() { try { await WSG.connect(); toast('Google connected for this tab.'); flRender(); } catch (e) { toast(String(e.message || e), 'err', 7000); } }
async function flPickFolder(k) {
  try { const p = await WSG.pick('folder', flDraft().storage.folders[k] ? [flDraft().storage.folders[k].id] : []); if (!p.length) return; flDraft().storage.folders[k] = { id:p[0].id, name:p[0].name, url:p[0].url || `https://drive.google.com/drive/folders/${p[0].id}` }; flDraft().storage.provider = 'google'; flRender(); }
  catch (e) { toast(String(e.message || e), 'err', 7000); }
}
async function flMakeFolder(k) {
  const root = flDraft().storage.folders.root; if (!root) return;
  try { const f = await WSG.folder({ in:'In thesis', border:'Borderline', out:'Out of thesis', memos:'Deal memos' }[k], root.id); flDraft().storage.folders[k] = f; flRender(); } catch (e) { toast(String(e.message || e), 'err', 7000); }
}
async function flPickSheet() {
  try { const p = await WSG.pick('sheet'); if (!p.length) return; flDraft().storage.sheet = { id:p[0].id, name:p[0].name, url:p[0].url, tab:'', headerRow:1, mapping:[] }; flDraft().storage.provider = 'google'; await flReadSheet(); }
  catch (e) { toast(String(e.message || e), 'err', 7000); }
}
async function flReadSheet() {
  const d = flDraft(), sh = d.storage.sheet; if (!sh) return;
  try {
    const s = await WSG.readSheet(sh.id, sh.tab, sh.headerRow);
    FS.sheetFormulas = s.formulas; FS.sheetLists = s.validations;
    const auto = wsAutoMap(wsNormalize(d), s.headers, new Set([...s.formulas].filter(x => x[0] === 'c').map(x => +x.slice(1))), s.validations);
    const old = new Map((sh.mapping || []).map(m => [m.header, m]));
    sh.mapping = auto.map(m => old.has(m.header) && !(s.formulas.has('c' + m.col) && old.get(m.header).mode === 'write') ? Object.assign({}, old.get(m.header), { col:m.col }) : { col:m.col, header:m.header, field:m.field, mode:m.mode });
    sh.tab = s.tab; sh.name = s.title || sh.name;
    toast(`${s.headers.filter(Boolean).length} columns read, ${s.rows.length} rows; ${sh.mapping.filter(m => m.mode === 'write').length} columns VCR2 will write.`); flRender();
  } catch (e) { toast(String(e.message || e), 'err', 7000); }
}
async function flPickTemplate() { try { const p = await WSG.pick('doc'); if (!p.length) return; flDraft().storage.memo.templateId = p[0].id; flRender(); } catch (e) { toast(String(e.message || e), 'err', 7000); } }
function flMemoTplClear() { flDraft().storage.memo.templateId = ''; flRender(); }
/* ── intake registration with the intake service ── */
async function flRegisterIntake(rotate) {
  if (!WS_SITE.intake) return;
  const d = flDraft(), key = acctRandom(32), wsKey = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join('');
  const hash = await wsHash(new TextEncoder().encode(key));
  try {
    const r = await fetch(WS_SITE.intake + '/v1/register', { method:'POST', credentials:'omit', referrerPolicy:'no-referrer', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ ws:wsKey, keyHash:hash, name:d.name, oldWs:rotate ? d.intake.wsKey : '', oldKey:rotate ? d.intake.key : '' }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    d.intake = { key, wsKey, address:j.address || '', formId:j.formId || '' };
    await flPushIntakeConfig(d, key, wsKey);
    toast('Form and forwarding address ready. Save to keep them.'); flRender();
  } catch (e) { toast('Intake service: ' + String(e.message || e).slice(0, 160), 'err', 7000); }
}
async function flPushIntakeConfig(d, key, wsKey) {
  if (!WS_SITE.intake || !key) return;
  await fetch(WS_SITE.intake + '/v1/config?ws=' + wsKey, { method:'POST', credentials:'omit', referrerPolicy:'no-referrer', headers:{ authorization:'Bearer ' + key, 'content-type':'application/json' },
    body:JSON.stringify({ name:d.name, webhook:d.integrations.webhook || '', ack:{ on:!!d.notify.ack, subject:d.notify.ackSubject, text:d.notify.ackText }, digest:{ on:!!d.notify.digest, day:d.notify.digestDay } }) });
}
function flCopy(t) { try { navigator.clipboard.writeText(t).then(() => toast('Copied.')); } catch (e) { toast('Select and copy it by hand.', 'err'); } }
/* ── team ── */
async function flLoadTeam() {
  const el = $id('fl-team'); if (!el || !FS.cur) return;
  try {
    const [m, inv] = await Promise.all([FS.store.members(FS.cur.id), flAdmin() ? FS.store.invites(FS.cur.id) : []]);
    setHTML(el, `<table class="fl-tbl"><thead><tr><th scope="col">Member</th><th scope="col">Role</th><th scope="col"></th></tr></thead><tbody>${m.map(x => `<tr><td>${esc(x.email || x.user_id)}${x.you ? ' (you)' : ''}</td><td>${esc(x.role)}</td><td>${flAdmin() && !x.you ? `<button class="btn btn-ghost btn-sm" data-click="flRemoveMember" data-a="${esc(x.user_id)}">Remove</button>` : x.you && !flAdmin() ? `<button class="btn btn-ghost btn-sm" data-click="flRemoveMember" data-a="${esc(x.user_id)}">Leave</button>` : ''}</td></tr>`).join('')}
      ${inv.map(x => `<tr><td>${esc(x.email)} <span class="fl-muted">(invited)</span></td><td>${esc(x.role)}</td><td><button class="btn btn-ghost btn-sm" data-click="flRemoveInvite" data-a="${esc(x.email)}">Cancel</button></td></tr>`).join('')}</tbody></table>`);
  } catch (e) { setHTML(el, `<p class="fl-warn">${esc(String(e.message || e.code))}</p>`); }
}
async function flInvite() { const e = ($id('fl-inv-mail') || {}).value || '', r = ($id('fl-inv-role') || {}).value; if (!acctEmailOk(e.trim())) { toast('Type a valid e-mail address.', 'err'); return; } try { await FS.store.invite(FS.cur.id, e, r); toast(`Invited. ${e} joins when they sign in to VCR2 with that address.`); flLoadTeam(); } catch (x) { toast(String(x.message || x.code), 'err'); } }
async function flRemoveMember(uid) { try { await FS.store.removeMember(FS.cur.id, uid); flLoadTeam(); } catch (x) { toast(x.code === 'last_admin' || /last_admin/.test(x.message || '') ? 'A workspace keeps at least one admin.' : String(x.message || x.code), 'err'); } }
async function flRemoveInvite(e) { try { await FS.store.removeInvite(FS.cur.id, e); flLoadTeam(); } catch (x) { toast(String(x.message || x.code), 'err'); } }
function flDeleteWs() {
  openModal('Delete this workspace?', `<p>${esc(flWs().name)}, its settings and every company in it are deleted from VCR2 for the whole team. Your Drive files and your master sheet are not touched. This cannot be undone.</p>`, [{ label:'Delete the workspace', primary:true, onClick:async () => { closeModal(); try { await FS.store.deleteWorkspace(FS.cur.id); FS.list = FS.list.filter(x => x.id !== FS.cur.id); FS.cur = FS.list[0] || null; await flLoadDeals(); flRender(); } catch (e) { toast(String(e.message || e.code), 'err'); } } }]);
}

/* ── help ── */
function flHelp() {
  return `<div class="fl-head"><h1>How Deal flow works</h1></div><div class="card fl-help">
  <h2>Workspaces</h2><p>A workspace is one investor's deal flow: a fund, an angel, a syndicate or an accelerator. Everything is set per workspace: the thesis, the scorecard, the pipeline, the Drive folders, the master sheet and its columns, the memo template and the team. One workspace never sees another's companies: the database refuses it, not just the page.</p>
  <h2>What you can drop</h2><p>Pitch decks as PDF, PowerPoint (.pptx) or Word, image-only decks and screenshots (read with OCR, in your browser), e-mails saved as .eml with their attachments, a .zip of decks, and your company spreadsheet (.xlsx or .csv, or a Google Sheet downloaded as .xlsx). Founder e-mails and call transcripts (text, .docx, PDF or pasted) are added to a company from its panel, then it is re-scored. Old formats (.ppt, .doc), password-protected files and links (DocSend, Notion) cannot be read: download or export them first.</p>
  <h2>Thesis check</h2><p>Each company is <b>In thesis</b>, <b>Borderline</b> or <b>Out of thesis</b>, with every reason and where it was found (file, page or slide, quote). Information that is missing is never a fail: the company is “Borderline (needs info)” with the questions to ask. Change the thesis in Settings and every company is re-checked.</p>
  <h2>Scorecard</h2><p>Your pillars, weights (total 100%), 1 to 5 scale, threshold and tiers. VCR2 scores a pillar itself only from evidence: the “Profitability & Durability” template has its unit-economics pillar scored from gross margin, burn multiple, CAC payback, LTV:CAC, NRR, GRR, Rule of 40 and runway, capped when a consistency check on them fails. A figure read only in the deck is a claim: such a score says “from the deck's claims (unverified)”. Team, market, product and exit moat are scored by a reviewer in one click, with the evidence and the questions next to the buttons; with your own AI key (main page, AI assist) you can ask for a suggestion, which is never applied until a person confirms it. Every score says where it came from.</p>
  <h2>Master sheet</h2><p>Pick your Google Sheet, then say for each column whether VCR2 writes it, only reads it, or ignores it. Formula columns are always read only. A cell your team changed is never overwritten: its value comes back into VCR2. Dropdown columns keep your own values. A company already in the sheet gets its row updated, never a second row (matched on name, web domain, founder or deck link).</p>
  <h2>Embedding the form</h2><p>Settings, Intake: copy the embed code and paste it into your website (most site builders have an “embed HTML” block). Founders attach their deck and a few details; it arrives in your workspace.</p>
  <h2>The forwarding address</h2><p>Settings, Intake shows your workspace's private address. Forward a founder's e-mail with its deck to it, or set an automatic forward in your mailbox. It is read when anyone in your team opens Deal flow (“Check the inbox”), filed in your Drive and logged in your sheet. Nothing is analysed on a server: VCR2 keeps the e-mail at most 14 days, until your browser has read it.</p>
  <h2>Deal memos</h2><p>From a company's panel, “Create the deal memo” writes a Google Doc from your template (or VCR2's), filled with the scores and their sources, the metrics, the checks, the risks, the questions and your notes, and puts its link in the master sheet. It can run automatically above your threshold (off by default).</p>
  <h2>Due diligence process</h2><p>Your process stages are your pipeline statuses: one list. In Settings, Process stages, give each stage a goal, a checklist, an owner role, a target time and the evidence VCR2 brings to it (metrics, consistency checks, scorecard, ranked questions). The full preset runs Sourcing → Thesis screen → First call → Deep diligence → IC memo → IC vote → Term sheet → Close → Post-investment monitoring. You can also import your own process notes (text, .docx or PDF): VCR2 places headings and bullets onto your stages and recognises committee rules; you confirm before anything changes. In a company's panel, tick the checklist of its stage; the time spent in the stage is measured against its target.</p>
  <h2>Investment committee and voting</h2><p>Settings, Investment committee: members and roles, quorum, the voting rule (simple majority, two-thirds supermajority, unanimous, or majority with a managing-partner veto), conflicts (declared and recused, or declared and recorded), ties (declined, chair decides, or vote again) and how a "yes, with conditions" counts. In the company's panel, record each member's vote: VCR2 shows the outcome before you save, stores who voted, how, when and the conditions with the company and its IC memo (the deal memo), moves the status on, and writes the decision and its date to your master sheet.</p>
  <h2>LP data room</h2><p>Two LP-facing documents. The <b>due diligence process</b>: a one-page flowchart, each stage, the committee and its rules, and how evidence-first scoring fits in, with no company and no internal note. The <b>anonymized pipeline</b>: one line per company with a code name by sector (your prefixes, e.g. FoW-01), sector and sub-sector, stage, round size and valuation as ranges, region only, a description that does not identify the company, why it fits, its pipeline stage and, if you choose, its tier. Filter by sector, stage, tier or date and untick what to leave out. Before any export, every entry is checked for names, founders, web addresses, e-mails, logos, exact figures, named customers or investors, cities and unusual combinations; each flag comes with a safer wording. Nothing exports until every flag is fixed or accepted by a named reviewer (logged). Exports carry "LP-facing" and their "data as of" date; in Google Drive they are a Doc, a Sheet and a PDF, refreshed in one click with the same links, ready for a data room or DocSend.</p>
  <h2>Speed</h2><p>The dashboard shows the median time from receiving a deck to a complete scored row, and the automated part alone (usually seconds).</p>
  <h2>Privacy</h2><p>Decks and their text stay in your browser and your Drive. Signed in, VCR2 keeps per company the facts with short quotes (160 characters at most), the scores, statuses and notes, so your team shares them. Not investment advice.</p></div>`;
}
