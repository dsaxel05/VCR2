
/* ═══════════════════════════════════════════════════════════════
   OWNER STUDIO — add, edit or remove fields, metrics, checks,
   questions, patterns, requests and texts, then publish them to the
   live site. Reached only through the #studio address.
   Access: sign in with a GitHub token. The Studio opens only when the
   token belongs to the repository owner and has write access, and
   publishing writes radar-config.json into the repository — which no
   one else can do. Drafts stay in the owner's browser until published.
   ═══════════════════════════════════════════════════════════════ */
const GH_API = 'https://api.github.com';
const ST = { token:null, user:null, draft:null, tab:'home', branch:null, sha:null, synced:false, conflict:false };
let CFG_READY = Promise.resolve(false);   /* resolves once the published config has loaded */
/* Business models to offer in editors: the built-ins plus the ones in the draft. */
const modelOpts = () => BASE.models.map(m => [m.id, m.n]).concat(((ST.draft && ST.draft.models) || []).map(m => [m.id, m.name]));
const DIM_OPTS = [['','Not scored'],['revenue','Revenue quality'],['capital','Capital efficiency'],['gtm','Go-to-market'],['team','Team'],['market','Market & moat'],['govern','Governance & technical risk']];
const UNIT_OPTS = [['','None'],['$','Dollars ($)'],['%','Percent (%)'],['x','Multiple (x)'],['months','Months'],['count','Count']];
const STAGE_IDS = ['preseed','seed','a','b'];

/* Where Publish writes. Never taken from a draft or an imported file: the path is fixed,
   the repository comes from the site's own address, and the branch from GitHub. */
function repoTarget() {
  const ok = v => typeof v === 'string' && /^[A-Za-z0-9._-]+$/.test(v);
  let owner = null, repo = null;
  if (typeof location !== 'undefined' && /\.github\.io$/i.test(location.hostname)) {
    owner = location.hostname.split('.')[0];
    const seg = location.pathname.split('/').filter(Boolean)[0];
    repo = seg && !/\.html?$/i.test(seg) ? seg : `${owner}.github.io`;
  }
  owner = owner || (ok(CFG_PUBLISHED.owner) ? CFG_PUBLISHED.owner : 'dsaxel05');
  repo = repo || (ok(CFG_PUBLISHED.repo) ? CFG_PUBLISHED.repo : 'VCR2');
  return { owner, repo, branch:ST.branch || 'main', path:CONFIG_FILE };
}
const tokenStore = {
  get() { try { return sessionStorage.getItem('vcr2-gh-token') || localStorage.getItem('vcr2-gh-token'); } catch (e) { return null; } },
  set(t, remember) { try { sessionStorage.setItem('vcr2-gh-token', t); if (remember) localStorage.setItem('vcr2-gh-token', t); } catch (e) {} },
  clear() { try { sessionStorage.removeItem('vcr2-gh-token'); localStorage.removeItem('vcr2-gh-token'); localStorage.removeItem('vcr2-owner'); } catch (e) {} },
};
async function gh(path, opts) {
  let res;
  try { res = await fetch(GH_API + path, Object.assign({ cache:'no-store', headers:{ Accept:'application/vnd.github+json', Authorization:'Bearer ' + ST.token, 'X-GitHub-Api-Version':'2022-11-28' } }, opts || {})); }
  catch (e) { const err = new Error('Could not reach GitHub. Check the connection and try again.'); err.keep = true; throw err; }
  let body = null; try { body = await res.json(); } catch (e) {}
  return { ok:res.ok, status:res.status, body };
}
const b64decodeUtf8 = b64 => new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, '')), c => c.charCodeAt(0)));
/* Read the committed file straight from the GitHub API — fresher than the site, which can lag a minute. */
async function syncRemote() {
  const t = repoTarget();
  const r = await gh(`/repos/${t.owner}/${t.repo}/contents/${t.path}?ref=${encodeURIComponent(t.branch)}`);
  if (r.status === 404) { ST.sha = null; ST.synced = true; return true; }
  if (!r.ok || !r.body) { ST.synced = false; return false; }
  ST.sha = r.body.sha || null; ST.synced = true;
  if (r.body.content) { try { CFG_PUBLISHED = normalizeConfig(JSON.parse(b64decodeUtf8(r.body.content))); } catch (e) {} }
  return true;
}
const draftBase = { get() { try { return localStorage.getItem('vcr2-studio-base'); } catch (e) { return null; } }, set(v) { try { localStorage.setItem('vcr2-studio-base', v || 'none'); } catch (e) {} } };
function loadDraftForEditing() {
  const saved = studioDraft();
  if (saved && draftChangesOf(saved).length) {
    ST.draft = saved;
    ST.conflict = draftBase.get() !== (ST.sha || 'none');
  } else {
    ST.draft = normalizeConfig(JSON.parse(JSON.stringify(CFG_PUBLISHED)));
    draftBase.set(ST.sha); ST.conflict = false;
  }
}
/* The Studio opens only for the repository owner with write access. */
async function studioSignIn(token, remember) {
  ST.token = token.trim();
  const t = repoTarget();
  const fail = (msg, keep) => { const e = new Error(msg); e.keep = !!keep; return e; };
  const me = await gh('/user');
  if (!me.ok) {
    if (me.status === 401) throw fail('GitHub rejected this token. Check that you copied all of it and that it has not expired.');
    throw fail(`GitHub answered ${me.status}. Try again in a minute.`, true);
  }
  if (String(me.body.login).toLowerCase() !== String(t.owner).toLowerCase())
    throw fail(`This token belongs to @${me.body.login}. Only @${t.owner}, the owner of this site, can open the Studio.`);
  const repo = await gh(`/repos/${t.owner}/${t.repo}`);
  if (!repo.ok) {
    if (repo.status === 404 || repo.status === 403) throw fail(`The token cannot see ${t.owner}/${t.repo}. When creating it, choose “Only select repositories” → ${t.repo}.`);
    throw fail(`GitHub answered ${repo.status} for the repository. Try again in a minute.`, true);
  }
  if (repo.body.permissions && repo.body.permissions.push === false) throw fail('This token cannot write to the repository. Set “Contents” to “Read and write” when creating it.');
  ST.user = me.body.login;
  ST.branch = (repo.body && typeof repo.body.default_branch === 'string' && repo.body.default_branch) || 'main';
  tokenStore.set(ST.token, remember);
  try { localStorage.setItem('vcr2-owner', ST.user); } catch (e) {}
  updateStudioLink();
  if (await syncRemote()) refreshAfterConfig();
  return true;
}
function studioSignOut() {
  tokenStore.clear(); ST.token = null; ST.user = null; updateStudioLink();
  toast('Signed out of the Studio.'); leaveStudio();
}

/* ── Draft state ── */
function saveStudioDraft() {
  try { localStorage.setItem('vcr2-studio-draft', JSON.stringify(ST.draft)); } catch (e) {}
  if (previewOn()) refreshAfterConfig();
  renderStudioStatus();
}
function setPreview(on) {
  try { localStorage.setItem('vcr2-studio-preview', on ? '1' : '0'); } catch (e) {}
  if (on) saveStudioDraft();
  refreshAfterConfig();
  renderStudioStatus();
  toast(on ? 'Previewing your draft in this browser only. Visitors still see the live version.' : 'Back to the live version.');
}
function refreshAfterConfig() {
  const onSection = document.getElementById('page-section').classList.contains('active');
  if (onSection) saveSec();
  const curId = SECTIONS[S.section] ? SECTIONS[S.section].id : null;
  applyConfig(effectiveConfig());
  /* Adding or removing the custom section shifts positions: stay on the same section. */
  let idx = curId ? SECTIONS.findIndex(s => s.id === curId) : -1;
  if (idx < 0) idx = Math.min(S.section, SECTIONS.length - 1);
  while (idx < SECTIONS.length - 1 && sectionHidden(SECTIONS[idx])) idx++;
  S.section = Math.max(0, idx);
  buildNav(); updateProgress(); renderPreviewBanner(); updateStudioLink();
  if (document.getElementById('page-setup') && document.getElementById('page-setup').classList.contains('active')) { buildStages(); buildTypes(); }
  if (onSection && SECTIONS[S.section]) renderSection(S.section);
  if (S.result && document.getElementById('page-result').classList.contains('active')) { S.result = Object.assign(assessAll(), { memo:S.result.memo }); renderResult(S.result); }
}
/* The sidebar link appears only in a browser where the owner has signed in before. */
function updateStudioLink() {
  const el = document.getElementById('studio-link'); if (!el) return;
  let on = false; try { on = !!localStorage.getItem('vcr2-owner'); } catch (e) {}
  el.style.display = on ? '' : 'none';
}
const stripMeta = c => { const x = JSON.parse(JSON.stringify(c)); delete x.updated; return x; };
function draftChanges() { return ST.draft ? draftChangesOf(ST.draft) : []; }
function draftChangesOf(draft) {
  const sortHidden = c => { Object.keys(c.hidden || {}).forEach(k => c.hidden[k].sort()); return c; };
  const a = sortHidden(stripMeta(normalizeConfig(draft))), b = sortHidden(stripMeta(normalizeConfig(CFG_PUBLISHED)));
  const areas = [];
  ['fields','metrics','checks','gates','questions','patterns','requests','checklist','benchmarks','models','hidden','labels','thresholds','metricWeights','stageWeights','categorical','booleans','checkTol','patternParams','defaults','settings','branding'].forEach(k => {
    if (canonJSON(a[k]) !== canonJSON(b[k])) areas.push(k);
  });
  return areas;
}
function renderPreviewBanner() {
  let el = document.getElementById('preview-banner');
  if (!previewOn()) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'preview-banner'; el.className = 'preview-banner'; document.body.appendChild(el); }
  el.innerHTML = `Previewing your unpublished Studio draft — visitors see the live version. <a href="#studio" onclick="goStudio();return false">Open Studio</a> · <a href="#" onclick="setPreview(false);return false">Stop preview</a>`;
}

/* ── Entry ── */
function goStudio() { if (location.hash === '#studio') openStudio(); else location.hash = 'studio'; }
function leaveStudio() { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; } showPage('intro'); }
async function openStudio() {
  showPage('studio');
  if (!ST.user) renderStudioGate('Loading…');
  await CFG_READY;
  const saved = tokenStore.get();
  if (saved && !ST.user) {
    renderStudioGate('Checking your GitHub sign-in…');
    try { await studioSignIn(saved, !!localStorage.getItem('vcr2-gh-token')); }
    catch (e) { if (!e.keep) { tokenStore.clear(); ST.token = null; } renderStudioGate(null, e.message); return; }
  } else if (ST.user) { try { if (await syncRemote()) refreshAfterConfig(); } catch (e) {} }
  if (!ST.user) { renderStudioGate(); return; }
  loadDraftForEditing();
  renderStudio();
}
function renderStudioGate(busy, err) {
  const t = repoTarget();
  document.getElementById('studio-content').innerHTML = `
    <div class="studio-gate">
      <div class="pg-eyebrow">Owner Studio</div>
      <h2 class="pg-title">Only the owner of ${esc(t.owner)}/${esc(t.repo)} can open this</h2>
      <p class="pg-desc">Sign in with a GitHub token. The Studio checks with GitHub that the token belongs to <b>@${esc(t.owner)}</b> and has write access to the repository. Changes are published by committing <code>${esc(t.path)}</code> to the repository, which nobody else can do.</p>
      ${busy ? `<div class="suppressed">${esc(busy)}</div>` : `
      ${err ? `<div class="warnstrip"><span>⚠</span><div>${esc(err)}</div></div>` : ''}
      <label class="form-lbl" for="gh-token">GitHub token</label>
      <input class="form-inp" id="gh-token" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…">
      <label class="api-check" style="font-size:12px;margin-bottom:14px"><input type="checkbox" id="gh-remember"> Keep me signed in on this computer</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" id="gh-signin">Sign in</button><button class="btn btn-ghost" onclick="leaveStudio()">Back to the app</button></div>
      <details class="paste" style="margin-top:18px" open><summary>How to create the token (one minute)</summary>
        <ol class="howto">
          <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a> (signed in as ${esc(t.owner)}).</li>
          <li>Name it <i>Radar Studio</i> and pick an expiry.</li>
          <li>Under <b>Repository access</b>, choose <b>Only select repositories</b> → <b>${esc(t.repo)}</b>.</li>
          <li>Under <b>Permissions → Repository permissions</b>, set <b>Contents</b> to <b>Read and write</b>. Nothing else is needed.</li>
          <li>Click <b>Generate token</b>, copy it, and paste it above.</li>
        </ol>
        <p class="field-hint">The token stays in this browser and is sent only to api.github.com. Anyone can see the site; only this token can change it. Leave “Keep me signed in” unticked on a shared computer.</p>
      </details>`}
    </div>`;
  const b = document.getElementById('gh-signin');
  if (b) b.onclick = async () => {
    const v = document.getElementById('gh-token').value;
    if (v.trim().length < 20) { toast('Paste the full token.', 'err'); return; }
    b.disabled = true; b.textContent = 'Checking…';
    try { await studioSignIn(v, document.getElementById('gh-remember').checked); loadDraftForEditing(); renderStudio(); toast(`Signed in as @${ST.user}.`); }
    catch (e) { renderStudioGate(null, e.message); }
  };
}

/* ── Main Studio page ── */
const STUDIO_GROUPS = [
  ['Start', [['home','Start here']]],
  ['How companies are judged', [['standards','Healthy ranges'],['answers','Scored answers'],['scoring','Weights & rules'],['defaults','Defaults & assumptions']]],
  ['Add your own', [['fields','Inputs'],['metrics','Metrics'],['checks','Checks'],['gates','Deal-breakers'],['questions','Questions'],['patterns','Red flags & strengths'],['requests','Document requests'],['checklist','Checklist'],['benchmarks','Benchmark data'],['models','Business models']]],
  ['Built-in items', [['builtins','Switch on or off'],['labels','Rename'],['triggers','Red-flag triggers'],['tolerances','Check tolerances']]],
  ['Site', [['texts','Texts'],['help','Formula help']]],
];
const STUDIO_TABS = STUDIO_GROUPS.flatMap(g => g[1]);
function renderStudio() {
  const t = repoTarget();
  document.getElementById('studio-content').innerHTML = `
    <div class="studio-head">
      <div>
        <div class="pg-eyebrow">Owner Studio · @${esc(ST.user)}</div>
        <h2 class="pg-title">Shape the engine</h2>
        <p class="pg-desc" style="margin-bottom:10px">Add what investors ask for, switch off what they don’t, and publish. Everything here is saved as a draft in this browser until you publish it to <code>${esc(t.owner)}/${esc(t.repo)}</code>.</p>
      </div>
    </div>
    <div class="studio-bar">
      <div id="studio-status" class="studio-status"></div>
      <div class="studio-actions">
        <label class="api-check"><input type="checkbox" id="st-preview" ${previewOn() ? 'checked' : ''} onchange="setPreview(this.checked)"> Preview draft in this browser</label>
        <button class="btn btn-primary btn-sm" onclick="publishDraft()">Publish to the live site</button>
        <button class="btn btn-ghost btn-sm" onclick="downloadDraft()">Download config</button>
        <button class="btn btn-ghost btn-sm" onclick="importDraft()">Import config</button>
        <button class="btn btn-ghost btn-sm" onclick="discardDraft()">Discard draft</button>
        <button class="btn btn-ghost btn-sm" onclick="studioSignOut()">Sign out</button>
      </div>
    </div>
    ${ST.conflict ? `<div class="warnstrip" id="st-conflict"><span>⚠</span><div>The live configuration was changed after this draft was started — from another device or directly on GitHub. Publishing this draft would replace those changes.
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" onclick="startFromLive()">Start again from the live version</button><button class="btn btn-ghost btn-sm" onclick="keepDraftOverLive()">Keep my draft</button></div></div></div>` : ''}
    <nav class="studio-nav studio-tabs">${STUDIO_GROUPS.map(([g, tabs]) => `<div class="sn-group"><div class="sn-h">${esc(g)}</div><div class="sn-items">${tabs.map(([id, l]) => `<button class="rtab${ST.tab === id ? ' active' : ''}" onclick="studioTab('${id}')">${esc(l)}</button>`).join('')}</div></div>`).join('')}</nav>
    <div id="studio-pane"></div>`;
  renderStudioStatus(); renderStudioPane();
}
function studioTab(id) { ST.tab = id; document.querySelectorAll('.studio-tabs .rtab').forEach(b => b.classList.toggle('active', (b.getAttribute('onclick') || '').includes(`'${id}'`))); renderStudioPane();
  const p = document.getElementById('studio-pane'); if (p && p.getBoundingClientRect().top < 0) p.scrollIntoView({ block:'start' }); }
function renderStudioStatus() {
  const el = document.getElementById('studio-status'); if (!el || !ST.draft) return;
  const ch = draftChanges();
  const NAMES = { fields:'inputs', metrics:'metrics', checks:'checks', gates:'deal-breakers', questions:'questions', patterns:'red flags', requests:'document requests', checklist:'checklist',
    benchmarks:'benchmark data', models:'business models', hidden:'built-in items', labels:'renamed items', thresholds:'healthy ranges', metricWeights:'metric weights', stageWeights:'dimension weights',
    categorical:'scored answers', booleans:'yes/no points', checkTol:'check tolerances', patternParams:'red-flag triggers', defaults:'defaults', settings:'scoring rules', branding:'texts' };
  el.innerHTML = ch.length ? `<span class="pill amber">draft</span> Unpublished changes: ${ch.map(k => esc(NAMES[k] || k)).join(', ')}` : `<span class="pill green">live</span> The live site matches your draft${CFG_PUBLISHED.updated ? ` · last published ${esc(new Date(CFG_PUBLISHED.updated).toLocaleString('en-GB'))}` : ''}`;
}
function renderStudioPane() {
  const el = document.getElementById('studio-pane'); if (!el) return;
  const R = { home:paneStHome, fields:paneStFields, metrics:paneStMetrics, checks:paneStChecks, gates:paneStGates, questions:paneStQuestions, patterns:paneStPatterns, requests:paneStRequests, checklist:paneStChecklist,
    benchmarks:paneStBenchmarks, models:paneStModels, answers:paneStAnswers, defaults:paneStDefaults, triggers:paneStTriggers, tolerances:paneStTolerances,
    builtins:paneStBuiltins, labels:paneStLabels, scoring:paneStScoring, standards:paneStStandards, texts:paneStTexts, help:paneStHelp };
  el.innerHTML = (R[ST.tab] || paneStHome)();
}
const stEmpty = (what, btn) => `<div class="empty-card"><h4>No ${esc(what)} yet</h4><p>Add one and it appears for every visitor once you publish.</p>${btn}</div>`;
const rowActions = (kind, i) => `<td style="white-space:nowrap;text-align:right"><button class="btn btn-ghost btn-sm" onclick="editItem('${kind}',${i})">Edit</button> <button class="btn btn-ghost btn-sm" onclick="moveItem('${kind}',${i},-1)" aria-label="Move up">↑</button> <button class="btn btn-ghost btn-sm" onclick="deleteItem('${kind}',${i})" aria-label="Delete">Delete</button></td>`;

function paneStFields() {
  const L = ST.draft.fields, add = `<button class="btn btn-primary btn-sm" onclick="editItem('fields',-1)">Add a field</button>`;
  return `<p class="pg-desc">Fields are the inputs people fill in on the evidence form. Use them for anything an investor wants captured — a new KPI, a yes/no diligence item, a choice list. Their names can be used in formulas.</p>
    ${L.length ? `<div style="margin-bottom:10px">${add}</div><div class="tbl-wrap"><table class="ledger"><thead><tr><th>Label</th><th>Name in formulas</th><th>Section</th><th>Type</th><th></th></tr></thead><tbody>
      ${L.map((f, i) => `<tr><td>${esc(f.label)}${f.required ? ' <span class="pill red">required</span>' : ''}</td><td class="m">${esc(f.id)}</td><td>${esc(sectionLabel(f.section))}</td><td>${esc(typeLabel(f))}</td>${rowActions('fields', i)}</tr>`).join('')}</tbody></table></div>` : stEmpty('custom fields', add)}`;
}
function paneStMetrics() {
  const L = ST.draft.metrics, add = `<button class="btn btn-primary btn-sm" onclick="editItem('metrics',-1)">Add a metric</button>`;
  return `<p class="pg-desc">Metrics are computed from fields and other metrics with a formula. Give one a dimension and stage thresholds and it is scored like any built-in metric; leave the dimension empty and it is shown but not scored.</p>
    ${L.length ? `<div style="margin-bottom:10px">${add}</div><div class="tbl-wrap"><table class="ledger"><thead><tr><th>Metric</th><th>Formula</th><th>Scored in</th><th>Value now</th><th></th></tr></thead><tbody>
      ${L.map((m, i) => { const v = previewValue(m.formula, m.key); return `<tr><td>${esc(m.label)}<div class="field-hint">${esc(m.key)}</div></td><td class="m">${esc(m.formula)}</td><td>${esc((DIM_OPTS.find(d => d[0] === m.dim) || DIM_OPTS[0])[1])}${m.dim ? ` · ${m.dir === 'lo' ? 'lower' : 'higher'} is better` : ''}</td><td class="m">${esc(fmtPreview(v, m.unit))}</td>${rowActions('metrics', i)}</tr>`; }).join('')}</tbody></table></div>` : stEmpty('custom metrics', add)}`;
}
function paneStChecks() {
  const L = ST.draft.checks, add = `<button class="btn btn-primary btn-sm" onclick="editItem('checks',-1)">Add a check</button>`;
  return `<p class="pg-desc">A check compares something the company states with something Radar computes. It lands in verification, the findings and the question list, and counts towards blocking the score when it is material.</p>
    ${L.length ? `<div style="margin-bottom:10px">${add}</div><div class="tbl-wrap"><table class="ledger"><thead><tr><th>Check</th><th>Stated field</th><th>Computed as</th><th>Tolerance</th><th></th></tr></thead><tbody>
      ${L.map((c, i) => `<tr><td>${esc(c.title)}</td><td class="m">${esc(c.stated)}</td><td class="m">${esc(c.computed)}</td><td class="m">${esc(c.tol)}${c.mode === 'pts' ? ' pts' : '%'} / ${esc(c.hard)}${c.mode === 'pts' ? ' pts' : '%'}</td>${rowActions('checks', i)}</tr>`).join('')}</tbody></table></div>` : stEmpty('custom checks', add)}`;
}
function paneStQuestions() {
  const L = ST.draft.questions, add = `<button class="btn btn-primary btn-sm" onclick="editItem('questions',-1)">Add a question</button>`;
  return `<p class="pg-desc">Questions go into the question list and the founder email. Leave the condition empty to always ask; add one to ask only when it applies — for example <code>nrr &lt; 100</code> or <code>model == 'fintech'</code>.</p>
    ${L.length ? `<div style="margin-bottom:10px">${add}</div><div class="tbl-wrap"><table class="ledger"><thead><tr><th>Question</th><th>Asked when</th><th>Priority</th><th></th></tr></thead><tbody>
      ${L.map((q, i) => `<tr><td>${esc(q.text)}</td><td class="m">${esc(q.when || 'always')}</td><td>${esc(q.priority || 'normal')}</td>${rowActions('questions', i)}</tr>`).join('')}</tbody></table></div>` : stEmpty('custom questions', add)}`;
}
function paneStPatterns() {
  const L = ST.draft.patterns, add = `<button class="btn btn-primary btn-sm" onclick="editItem('patterns',-1)">Add a pattern</button>`;
  return `<p class="pg-desc">Patterns are the risk and strength cards on the overview. A pattern fires when its condition is true — combine several metrics with <code>and</code> / <code>or</code>.</p>
    ${L.length ? `<div style="margin-bottom:10px">${add}</div><div class="tbl-wrap"><table class="ledger"><thead><tr><th>Pattern</th><th>Fires when</th><th>Type</th><th></th></tr></thead><tbody>
      ${L.map((p, i) => `<tr><td>${esc(p.title)}</td><td class="m">${esc(p.when)}</td><td>${esc(p.sev === 'red' ? 'risk' : p.sev === 'green' ? 'strength' : 'watch')}</td>${rowActions('patterns', i)}</tr>`).join('')}</tbody></table></div>` : stEmpty('custom patterns', add)}`;
}
function paneStRequests() {
  const L = ST.draft.requests, add = `<button class="btn btn-primary btn-sm" onclick="editItem('requests',-1)">Add a request</button>`;
  return `<p class="pg-desc">Document requests appear under “Documents to request”, in the IC memo and in the founder email.</p>
    ${L.length ? `<div style="margin-bottom:10px">${add}</div><div class="tbl-wrap"><table class="ledger"><thead><tr><th>Request</th><th>Asked when</th><th></th></tr></thead><tbody>
      ${L.map((r, i) => `<tr><td>${esc(r.text)}</td><td class="m">${esc(r.when || 'always')}</td>${rowActions('requests', i)}</tr>`).join('')}</tbody></table></div>` : stEmpty('custom requests', add)}`;
}
function paneStChecklist() {
  const L = ST.draft.checklist, add = `<button class="btn btn-primary btn-sm" onclick="editItem('checklist',-1)">Add a checklist item</button>`;
  return `<p class="pg-desc">The diligence checklist in every report lists what investors ask for at each stage. Add the items your fund always requests; switch built-in ones off under “Switch built-ins on/off”.</p>
    ${L.length ? `<div style="margin-bottom:10px">${add}</div><div class="tbl-wrap"><table class="ledger"><thead><tr><th>Item</th><th>Category</th><th>From</th><th></th></tr></thead><tbody>
      ${L.map((c, i) => `<tr><td>${esc(c.text)}</td><td>${esc(c.category || 'Financial')}</td><td>${esc((STAGES.find(s => s.id === c.from) || STAGES[0]).n)}</td>${rowActions('checklist', i)}</tr>`).join('')}</tbody></table></div>` : stEmpty('checklist items of your own', add)}`;
}
function editChecklist(c, i) {
  openModal(i >= 0 ? 'Edit checklist item' : 'Add a checklist item', `
    ${edRow('Item', `<textarea class="intake-ta" id="ed-text" style="min-height:60px" placeholder="e.g. Signed customer contracts for the top ten accounts">${esc(c.text || '')}</textarea>`)}
    ${edRow('Category', `<input class="form-inp" id="ed-cat" list="cl-cats" value="${esc(c.category || 'Financial')}"><datalist id="cl-cats">${CL_CATS.concat((ST.draft.checklist || []).map(x => x.category)).filter((x, i, a) => x && a.indexOf(x) === i).map(x => `<option value="${esc(x)}">`).join('')}</datalist>`, 'Pick one, or type a new category name.')}
    ${edRow('Asked from this stage on', `<select class="field-select" id="ed-from">${optionList(STAGES.map(s => [s.id, s.n]), c.from || 'preseed')}</select>`)}
    ${edRow('Why it matters (optional)', `<input class="form-inp" id="ed-why" value="${esc(c.why || '')}">`)}`,
    [{ label:'Save item', primary:true, onClick:() => {
      const text = val('ed-text').trim(); if (!text) { toast('Write the item.', 'err'); return; }
      commitItem('checklist', i, { id:c.id || 'cl_' + slug(text).slice(0, 24) + '_' + Date.now().toString(36).slice(-4), text, category:val('ed-cat').trim() || 'Financial', from:val('ed-from'), why:val('ed-why').trim() });
    } }]);
}
function paneStBuiltins() {
  const H = ST.draft.hidden;
  const toggles = (kind, items, note) => `<div class="bi-group"><div class="block-title">${esc(note)}</div><div class="bi-grid">${items.map(([id, label]) =>
    `<label class="bi"><input type="checkbox" ${H[kind].includes(id) ? '' : 'checked'} onchange="toggleBuiltin('${kind}','${esc(id)}',this.checked)"> <span>${esc(label)}</span></label>`).join('')}</div></div>`;
  const secItems = SECTIONS.filter(s => s.id !== 'custom').map(s => [s.id, s.label]);
  const fieldGroups = BASE.sectionFields.map(b => { const sec = SECTIONS.find(s => s.id === b.id); return toggles('fields', b.fields.map(f => [f.id, f.lbl]), `Fields — ${sec ? sec.label : b.id}`); }).join('');
  const metricItems = Object.keys(RUBRIC.thresholds).map(k => [k, BASE.dlabel[k] || k]);
  return `<p class="pg-desc">Untick anything you do not want. Hidden items disappear from the form, the scoring, the report, the memo and the question list for every visitor once you publish. Nothing is deleted — tick it again to bring it back.</p>
    ${toggles('sections', secItems, 'Evidence sections')}
    ${toggles('metrics', metricItems.concat(CAT_DEFS.map(([k, , l]) => ['cat_' + k, l + ' (scored answer)'])), 'Scored metrics')}
    ${toggles('checks', BUILTIN.checks, 'Consistency checks')}
    ${toggles('forensics', BUILTIN.forensics, 'Forensic tests')}
    ${toggles('patterns', BUILTIN.patterns, 'Patterns')}
    ${toggles('questions', BUILTIN.questions, 'Question families')}
    ${toggles('requests', BUILTIN.requests, 'Document requests')}
    ${toggles('gates', BUILTIN.gates, 'Gates that block the score')}
    <details class="paste" style="margin-top:14px"><summary>Diligence checklist items (${BUILTIN.checklist.length})</summary>${toggles('checklist', BUILTIN.checklist, 'Checklist')}</details>
    <details class="paste" style="margin-top:14px"><summary>Individual fields (${BASE.sectionFields.reduce((a, b) => a + b.fields.length, 0)})</summary>${fieldGroups}</details>`;
}
function toggleBuiltin(kind, id, on) {
  const L = ST.draft.hidden[kind];
  const i = L.indexOf(id);
  if (on && i >= 0) L.splice(i, 1);
  if (!on && i < 0) L.push(id);
  saveStudioDraft();
}
function paneStLabels() {
  const L = ST.draft.labels;
  const row = (kind, id, base, cur, ph) => `<tr data-q="${esc((id + ' ' + base).toLowerCase())}"><td class="m" style="white-space:nowrap">${esc(id)}</td><td>${esc(base || '')}</td>
    <td><input class="form-inp lbl-inp" value="${esc(cur || '')}" placeholder="${esc(ph || 'Keep the built-in text')}" onchange="setLabel('${kind}','${esc(id)}', this.value)"></td></tr>`;
  const fieldRows = BASE.sectionFields.flatMap(b => b.fields.map(f => row('fields', f.id, BASE.flabel[f.id], L.fields[f.id]))).join('');
  const hintRows = BASE.sectionFields.flatMap(b => b.fields.map(f => row('hints', f.id, BASE.fhint[f.id] || '—', L.hints[f.id], 'Keep the built-in hint'))).join('');
  const metricRows = Object.keys(BASE.dlabel).map(k => row('metrics', k, BASE.dlabel[k], L.metrics[k])).join('');
  const secRows = BASE.sectionFields.map(b => row('sections', b.id, BASE.slabel[b.id], L.sections[b.id])).join('');
  const dimRows = Object.keys(BASE.dimlabel).map(k => row('dims', k, BASE.dimlabel[k], L.dims[k])).join('');
  const patRows = BUILTIN.patterns.map(([id, t]) => row('patterns', id, t, L.patterns[id])).join('');
  const gateRows = RUBRIC.gates.map(g => row('gates', g.id, BASE.gtitle[g.id], L.gates[g.id])).join('');
  const clRows = DILIGENCE.map(d => row('checklist', d.id, d.text, L.checklist[d.id])).join('');
  const n = LABEL_KINDS.reduce((a, k) => a + Object.keys(L[k] || {}).length, 0);
  const tbl = (title, rows, open) => `<details class="paste" style="margin-top:12px"${open ? ' open' : ''}><summary>${esc(title)}</summary><div class="tbl-wrap lbl-tbl"><table class="ledger"><thead><tr><th>Name</th><th>Built-in text</th><th>Your text</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  return `<p class="pg-desc">Use the words your investors use. A new label replaces the built-in one everywhere — the form, the report, the memo and the question list. Fields, metrics, sections, dimensions, red flags, deal-breakers and checklist items can all be renamed. Names used in formulas never change. Leave a box empty to keep the built-in text.${n ? ` <b>${n}</b> item${n === 1 ? '' : 's'} renamed.` : ''}</p>
    <input class="form-inp" placeholder="Search by name or label…" oninput="filterLabelRows(this.value);filterLabelRowsOpen(this.value)" style="max-width:420px;margin-bottom:12px">
    <div class="block-title">Field labels</div>
    <div class="tbl-wrap lbl-tbl"><table class="ledger"><thead><tr><th>Name</th><th>Built-in label</th><th>Your label</th></tr></thead><tbody>${fieldRows}</tbody></table></div>
    <div class="block-title" style="margin-top:18px">Metric labels</div>
    <div class="tbl-wrap lbl-tbl"><table class="ledger"><thead><tr><th>Name</th><th>Built-in label</th><th>Your label</th></tr></thead><tbody>${metricRows}</tbody></table></div>
    <details class="paste" style="margin-top:18px"><summary>Field hints (the small text under each field)</summary>
      <div class="tbl-wrap lbl-tbl"><table class="ledger"><thead><tr><th>Name</th><th>Built-in hint</th><th>Your hint</th></tr></thead><tbody>${hintRows}</tbody></table></div></details>
    ${tbl('Evidence section names', secRows)}
    ${tbl('Dimension names (revenue quality, team…)', dimRows)}
    ${tbl('Red flag and strength titles', patRows)}
    ${tbl('Built-in deal-breaker titles', gateRows)}
    ${tbl('Checklist items', clRows)}`;
}
function setLabel(kind, id, v) { const t = String(v || '').trim(); ST.draft.labels[kind] = ST.draft.labels[kind] || {}; if (t) ST.draft.labels[kind][id] = t; else delete ST.draft.labels[kind][id]; saveStudioDraft(); renderStudioStatus(); }
function filterLabelRowsOpen(q) { if (String(q || '').trim()) document.querySelectorAll('#studio-pane details.paste').forEach(d => d.open = true); }
function filterLabelRows(q) { q = String(q || '').trim().toLowerCase(); document.querySelectorAll('.lbl-tbl tbody tr').forEach(r => r.style.display = !q || r.dataset.q.includes(q) ? '' : 'none'); }
function paneStScoring() {
  const s = ST.draft.settings, minN = Object.assign({}, BASE.minN, s.minN || {}), ns = Object.assign({}, BASE.nextStage, s.nextStage || {});
  const num = (id, v, step, onch) => `<input class="st-num" type="number" step="${step || 'any'}" value="${v == null ? '' : esc(v)}" onchange="${onch}">`;
  const dims = ['revenue','capital','gtm','team','market','govern'];
  const sw = st => Object.assign({}, BASE.weights[st], ST.draft.stageWeights[st] || {});
  return `
    <div class="block-title">Blocking</div>
    <div class="st-row"><span>Withhold the score after this many material contradictions</span>${num('ba', s.blockAfter != null ? s.blockAfter : 3, 1, "setSetting('blockAfter', this.value)")}</div>
    <div class="block-title" style="margin-top:18px">Minimum sample sizes</div>
    <p class="field-hint" style="margin-bottom:8px">Below these, a metric is shown but not scored.</p>
    ${[['retention','Customers a year ago, for NRR / GRR / quick ratio'],['unit_economics','New customers, for CAC payback and LTV:CAC'],['quota','Quota-carrying reps'],['growth_base','Opening ARR for a growth rate ($)'],['arr_per_fte','Headcount for ARR per employee'],['magic_number','ARR for the magic number ($)'],['pmf_survey','Survey responses for the product-market-fit test']]
      .map(([k, l]) => `<div class="st-row"><span>${esc(l)}</span>${num(k, minN[k], 'any', `setMinN('${k}', this.value)`)}</div>`).join('')}
    <div class="block-title" style="margin-top:18px">Next-stage ARR bar used by the simulation</div>
    ${STAGE_IDS.map(st => `<div class="st-row"><span>${esc(STAGES.find(x => x.id === st).n)}</span>${num(st, ns[st], 'any', `setNextStage('${st}', this.value)`)}</div>`).join('')}
    <p class="field-hint">Leave Series B+ empty to use twice the current ARR.</p>
    <div class="block-title" style="margin-top:18px">Dimension weights by stage</div>
    <p class="field-hint" style="margin-bottom:8px">Any numbers — each stage is rescaled to 100%.</p>
    <div class="tbl-wrap"><table class="ledger"><thead><tr><th>Stage</th>${dims.map(d => `<th>${esc(DIM_LABEL[d])}</th>`).join('')}</tr></thead><tbody>
      ${STAGE_IDS.map(st => `<tr><td>${esc(STAGES.find(x => x.id === st).n)}</td>${dims.map(d => `<td>${num(d, Math.round((sw(st)[d] || 0) * 1000) / 10, 'any', `setStageWeight('${st}','${d}', this.value)`)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="field-hint" style="margin-top:18px">What counts as healthy for each metric is in the <a href="#" onclick="studioTab('standards');return false">Healthy ranges</a> tab.</p>`;
}
function setSetting(k, v) { const n = parseNum(v); if (n == null) delete ST.draft.settings[k]; else ST.draft.settings[k] = n; saveStudioDraft(); }
function setMinN(k, v) { ST.draft.settings.minN = ST.draft.settings.minN || {}; const n = parseNum(v); if (n == null || n === BASE.minN[k]) delete ST.draft.settings.minN[k]; else ST.draft.settings.minN[k] = n; saveStudioDraft(); }
function setNextStage(k, v) { ST.draft.settings.nextStage = ST.draft.settings.nextStage || {}; const n = parseNum(v); if (n == null) delete ST.draft.settings.nextStage[k]; else ST.draft.settings.nextStage[k] = n; saveStudioDraft(); }
function setStageWeight(st, d, v) {
  const n = parseNum(v); const cur = Object.assign({}, BASE.weights[st], ST.draft.stageWeights[st] || {});
  cur[d] = n == null ? 0 : n / 100;
  ST.draft.stageWeights[st] = cur; saveStudioDraft();
}
/* ── Healthy ranges: what Radar considers poor, good and excellent, per metric and stage ── */
const stageName = st => STAGES.find(x => x.id === st).n;
function thrFor(key) {
  const base = RUBRIC.thresholds[key], o = ST.draft.thresholds[key] || {}, r = {};
  STAGE_IDS.forEach(st => { r[st] = o[st] === null ? null : Array.isArray(o[st]) ? o[st] : base[st]; });
  return r;
}
const thrFmt = (key, v) => DUNIT[key] ? dfmt(key, v) : String(Math.round(v * 100) / 100);
function goodBar(key, dir, a) { return a ? (dir === 'hi' ? '≥ ' : '≤ ') + thrFmt(key, goodValue({ dir }, a)) : '—'; }
function thrSentence(key, dir, a) {
  if (!a) return 'Not scored at this stage.';
  const f = v => thrFmt(key, v);
  return dir === 'hi'
    ? `Poor at ${f(a[0])} or below · acceptable around ${f(a[1])} · good from ${f(a[2])} · excellent from ${f(a[3])}.`
    : `Excellent at ${f(a[0])} or below · good up to ${f(goodValue({ dir }, a))} · weak around ${f(a[2])} · poor at ${f(a[3])} or above.`;
}
function paneStStandards() {
  const keys = Object.keys(RUBRIC.thresholds).filter(k => RUBRIC.thresholds[k].dir !== 'band');
  const changed = keys.filter(k => ST.draft.thresholds[k] || ST.draft.metricWeights[k] != null).length;
  return `<p class="pg-desc">The bar Radar uses to call each metric poor, good or excellent, at each stage. When investors tell you a different number is healthy, change it here — every report uses your bar once you publish, and marks it “your standard”. Your own metrics’ ranges are set in the Metrics tab.${changed ? ` <b>${changed}</b> changed.` : ''}</p>
    <input class="form-inp" placeholder="Search a metric…" oninput="filterStdRows(this.value)" style="max-width:420px;margin-bottom:12px">
    <div class="tbl-wrap std-tbl"><table class="ledger"><thead><tr><th>Metric</th><th>Better when</th>${STAGE_IDS.map(st => `<th>Good at ${esc(stageName(st))}</th>`).join('')}<th></th></tr></thead><tbody>
    ${keys.map(k => { const cfg = RUBRIC.thresholds[k], t = thrFor(k), mine = !!(ST.draft.thresholds[k] || ST.draft.metricWeights[k] != null), off = ST.draft.hidden.metrics.includes(k);
      return `<tr data-q="${esc((k + ' ' + (BASE.dlabel[k] || k)).toLowerCase())}" class="${off ? 'std-off' : ''}"><td>${esc(BASE.dlabel[k] || k)}${mine ? ' <span class="pill amber">yours</span>' : ''}${off ? ' <span class="pill">switched off</span>' : ''}${cfg.models ? `<div class="field-hint">${esc(cfg.models.map(m => (MODELS.find(x => x.id === m) || {}).n || m).join(', '))} only</div>` : ''}</td>
        <td style="color:var(--t2)">${cfg.dir === 'hi' ? 'higher' : 'lower'}</td>${STAGE_IDS.map(st => `<td class="m">${esc(goodBar(k, cfg.dir, t[st]))}</td>`).join('')}
        <td style="text-align:right"><button class="btn btn-ghost btn-sm" onclick="editStandard('${k}')">Change</button></td></tr>`; }).join('')}</tbody></table></div>`;
}
function filterStdRows(q) { q = String(q || '').trim().toLowerCase(); document.querySelectorAll('.std-tbl tbody tr').forEach(r => r.style.display = !q || r.dataset.q.includes(q) ? '' : 'none'); }
function editStandard(key) {
  const base = RUBRIC.thresholds[key], t = thrFor(key), o = ST.draft.thresholds[key] || {};
  const heads = base.dir === 'hi' ? ['Poor', 'Acceptable', 'Good', 'Excellent'] : ['Excellent', 'Good', 'Weak', 'Poor'];
  openModal(`What counts as healthy — ${BASE.dlabel[key] || key}`, `
    <p class="pg-desc" style="margin-bottom:10px">${base.dir === 'hi' ? 'Higher is better' : 'Lower is better'}. Four values per stage, from lowest to highest; the score moves smoothly between them. Leave a whole row empty to stop scoring this metric at that stage. The sentence under each row shows how Radar will read it.</p>
    <div class="tbl-wrap"><table class="ledger"><thead><tr><th>Stage</th>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${STAGE_IDS.map(st => `<tr><td>${esc(stageName(st))}</td>${[0,1,2,3].map(i => `<td><input class="st-num" type="number" step="any" id="thr-${st}-${i}" value="${t[st] ? esc(t[st][i]) : ''}" oninput="sayStandard('${key}')"></td>`).join('')}</tr>
      <tr class="std-say"><td></td><td colspan="4"><div class="field-hint" id="thr-say-${st}">${esc(thrSentence(key, base.dir, t[st]))}</div>${base[st] ? `<div class="field-hint">Built-in: ${esc(base[st].map(v => thrFmt(key, v)).join(' · '))}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>
    ${edRow('Weight inside its dimension', `<input class="form-inp" type="number" step="any" id="thr-w" value="${esc(ST.draft.metricWeights[key] != null ? ST.draft.metricWeights[key] : (BASE.mw[key] || 1))}">`, `Built-in ${esc(BASE.mw[key] || 1)}. Higher means this metric moves its dimension more.`)}
    ${edRow('Why you changed it (optional, shown in reports)', `<input class="form-inp" id="thr-note" value="${esc(o.note || '')}" placeholder="e.g. Series A investors we spoke to expect NRR above 120%">`)}`,
    [{ label:'Save', primary:true, onClick:() => saveStandard(key) }, { label:'Back to the built-in values', onClick:() => resetStandard(key) }]);
}
function readStandardRow(st) {
  const vals = [0,1,2,3].map(i => document.getElementById(`thr-${st}-${i}`).value.trim());
  if (vals.every(v => v === '')) return { ok:true, a:null };
  const n = vals.map(Number);
  if (vals.some(v => v === '') || n.some(x => !isFinite(x))) return { ok:false, err:`Fill all four values for ${stageName(st)}, or leave the whole row empty.` };
  if (!(n[0] <= n[1] && n[1] <= n[2] && n[2] <= n[3])) return { ok:false, err:`${stageName(st)}: the four values must go from lowest to highest.` };
  return { ok:true, a:n };
}
function sayStandard(key) {
  const dir = RUBRIC.thresholds[key].dir;
  STAGE_IDS.forEach(st => { const r = readStandardRow(st), el = document.getElementById('thr-say-' + st); if (el) { el.textContent = r.ok ? thrSentence(key, dir, r.a) : r.err; el.style.color = r.ok ? '' : '#fca5a5'; } });
}
function saveStandard(key) {
  const o = {};
  for (const st of STAGE_IDS) { const r = readStandardRow(st); if (!r.ok) { toast(r.err, 'err'); return; } o[st] = r.a; }
  const w = parseNum(document.getElementById('thr-w').value);
  if (w != null && w <= 0) { toast('The weight must be above 0. To take a metric out of the score, switch it off in “Switch built-ins on/off”.', 'err'); return; }
  const note = document.getElementById('thr-note').value.trim();
  const base = RUBRIC.thresholds[key];
  const same = STAGE_IDS.every(st => JSON.stringify(o[st]) === JSON.stringify(base[st]));
  if (same && !note) delete ST.draft.thresholds[key];
  else { if (note) o.note = note; ST.draft.thresholds[key] = o; }
  if (w != null && w !== (BASE.mw[key] || 1)) ST.draft.metricWeights[key] = w; else delete ST.draft.metricWeights[key];
  saveStudioDraft(); closeModal(); renderStudioPane();
  toast(`${BASE.dlabel[key] || key}: saved to your draft. Publish to make it live.`);
}
function resetStandard(key) { delete ST.draft.thresholds[key]; delete ST.draft.metricWeights[key]; saveStudioDraft(); closeModal(); renderStudioPane(); toast('Back to the built-in values in your draft.'); }
function paneStTexts() {
  const b = ST.draft.branding;
  const row = (k, l, ph, area) => `<label class="form-lbl" style="margin-top:12px">${esc(l)}</label>${area
    ? `<textarea class="intake-ta" style="min-height:80px" onchange="setBrand('${k}', this.value)" placeholder="${esc(ph)}">${esc(b[k] || '')}</textarea>`
    : `<input class="form-inp" style="margin-bottom:0" value="${esc(b[k] || '')}" placeholder="${esc(ph)}" onchange="setBrand('${k}', this.value)">`}`;
  return `<p class="pg-desc">Leave a box empty to keep the built-in text.</p>
    ${row('appName', 'App name in the sidebar', 'VC Risk Radar')}
    ${row('headline', 'Home page headline', 'Check whether the numbers reconcile')}
    ${row('subtitle', 'Home page introduction', 'Founders send you a deck…', true)}
    ${row('note', 'Home page footnote', 'Radar is a workflow tool…', true)}
    ${row('customSectionLabel', 'Name of the section that holds your custom fields', 'Additional evidence')}`;
}
function setBrand(k, v) { if (String(v).trim()) ST.draft.branding[k] = String(v).trim(); else delete ST.draft.branding[k]; saveStudioDraft(); }
function paneStHelp() {
  return `<div class="help">
    <p class="pg-desc">Formulas use the names of fields and metrics. They are evaluated by Radar’s own interpreter — nothing is executed as code — and a missing value makes the result “no data” instead of zero.</p>
    <table class="ledger"><tbody>
      <tr><td>Arithmetic</td><td class="m">+ - * / ^ ( )</td></tr>
      <tr><td>Comparisons</td><td class="m">&lt; &lt;= &gt; &gt;= == !=</td></tr>
      <tr><td>Logic</td><td class="m">and · or · not</td></tr>
      <tr><td>Functions</td><td class="m">min(a,b,…) max(…) abs(x) round(x,d) sqrt(x) has(x) coalesce(a,b) if(condition, a, b)</td></tr>
      <tr><td>Text values</td><td class="m">model == 'fintech' · stage == 'seed' · soc2 == 'Type II'</td></tr>
      <tr><td>Yes/no fields</td><td class="m">1 for yes, 0 for no — e.g. litigation == 1</td></tr>
      <tr><td>Missing values</td><td class="m">a blank input gives “no data”, never 0 · a condition on no data does not fire · has(x) tests for a value · coalesce(x, 0) supplies a default</td></tr>
    </tbody></table>
    <div class="block-title" style="margin-top:18px">Examples</div>
    <table class="ledger"><tbody>
      <tr><td>Metric: new ARR per sales rep</td><td class="m">new_arr_l12 / headcount_sales</td></tr>
      <tr><td>Metric: months of runway after the round</td><td class="m">(cash_on_hand + round_size) / net_burn</td></tr>
      <tr><td>Metric: expansion share of new ARR</td><td class="m">expansion_arr_l12 / (new_arr_l12 + expansion_arr_l12) * 100</td></tr>
      <tr><td>Question condition</td><td class="m">nrr &lt; 100 and customers_now &gt;= 20</td></tr>
      <tr><td>Pattern condition</td><td class="m">burn_multiple &gt; 3 and runway &lt; 15</td></tr>
      <tr><td>Check: stated vs computed</td><td class="m">stated field: a claim field you added, e.g. c_stated_pipeline · computed: pipeline_coverage</td></tr>
    </tbody></table>
    <div class="block-title" style="margin-top:18px">All names you can use</div>
    ${identifierReference(null)}
  </div>`;
}

/* ── Editors ── */
function sectionLabel(id) { if (id === 'custom') return (ST.draft.branding.customSectionLabel || 'Additional evidence') + ' (new section)'; const s = SECTIONS.find(x => x.id === id); return s ? s.label : id; }
function typeLabel(f) { return f.type === 'bool' ? 'Yes / no' : f.type === 'select' ? 'Choice' : f.type === 'txt' ? 'Text' : 'Number' + (f.unit ? ` (${f.unit})` : ''); }
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36);
function uniqueId(prefix, label, current) {
  const known = knownIdentifiers(ST.draft);
  let base = prefix + (slug(label) || 'item'), id = base, n = 2;
  while (known.has(id) && id !== current) id = base + '_' + n++;
  return id;
}
function optionList(opts, cur) { return opts.map(([v, l]) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join(''); }
function modelBoxes(cur) { cur = cur || []; return `<div class="bi-grid">${modelOpts().map(([v, l]) => `<label class="bi"><input type="checkbox" name="ed-models" value="${v}" ${cur.includes(v) ? 'checked' : ''}> <span>${esc(l)}</span></label>`).join('')}</div><p class="field-hint">None ticked = all business models.</p>`; }
const edRow = (label, html, hint) => `<div class="ed-row"><label class="form-lbl">${esc(label)}</label>${html}${hint ? `<div class="field-hint">${hint}</div>` : ''}</div>`;
const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
function formulaBox(id, value, opts) {
  opts = opts || {};
  return `<textarea class="intake-ta formula" id="${id}" style="min-height:64px" spellcheck="false" oninput="checkFormula('${id}', ${opts.optional ? 'true' : 'false'}, '${esc(opts.self || '')}')">${esc(value || '')}</textarea>
    <div class="fx-status" id="${id}-st"></div>
    <details class="paste"><summary>Pick a field or metric name</summary><input class="form-inp" placeholder="Search…" oninput="filterRef(this,'${id}')" style="margin:6px 0">${identifierReference(id)}</details>`;
}
function identifierReference(targetId) {
  const known = knownIdentifiers(ST.draft || CFG);
  const groups = {};
  known.forEach((info, id) => { const g = info.kind === 'field' || info.kind === 'custom field' ? `Fields — ${info.sec === 'custom' ? 'custom' : info.sec}` : info.kind === 'custom metric' ? 'Your metrics' : info.kind === 'special' ? 'Special' : 'Computed metrics'; (groups[g] = groups[g] || []).push([id, info.label]); });
  return `<div class="ref-list">${Object.entries(groups).map(([g, items]) => `<div class="ref-g"><div class="ref-h">${esc(g)}</div>${items.map(([id, l]) =>
    `<button type="button" class="ref-i" data-q="${esc((id + ' ' + l).toLowerCase())}" ${targetId ? `onclick="insertRef('${targetId}','${esc(id)}')"` : ''}><code>${esc(id)}</code> ${esc(l)}</button>`).join('')}</div>`).join('')}</div>`;
}
function filterRef(inp, id) { const q = inp.value.trim().toLowerCase(); inp.parentNode.querySelectorAll('.ref-i').forEach(b => b.style.display = !q || b.dataset.q.includes(q) ? '' : 'none'); }
function insertRef(target, id) {
  const ta = document.getElementById(target); if (!ta) return;
  const s = ta.selectionStart != null ? ta.selectionStart : ta.value.length, e = ta.selectionEnd != null ? ta.selectionEnd : s;
  ta.value = ta.value.slice(0, s) + id + ta.value.slice(e); ta.focus(); ta.selectionStart = ta.selectionEnd = s + id.length;
  ta.dispatchEvent(new Event('input'));
}
function previewValue(src, selfKey) {
  if (!src) return null;
  try {
    const { D } = derive(); const D2 = Object.assign({}, D);
    if (selfKey) delete D2[selfKey];
    evalCustomMetrics(D2, ST.draft ? ST.draft.metrics : [], selfKey);
    return fxRun(src, D2);
  } catch (e) { return null; }
}
function fmtPreview(v, unit) {
  if (v == null) return 'no data';
  if (typeof v === 'string') return v;
  if (unit === '$') return money(v); if (unit === '%') return fmtPct(v); if (unit === 'x') return fmtX(v, 2); if (unit === 'months') return fmtMo(v);
  return String(Math.round(v * 1000) / 1000);
}
function checkFormula(id, optional, self) {
  const src = val(id), st = document.getElementById(id + '-st'); if (!st) return true;
  const r = fxValidate(src, { optional, self:self || undefined, cfg:ST.draft });
  if (!r.ok) { st.className = 'fx-status bad'; st.textContent = r.error; return false; }
  if (r.empty) { st.className = 'fx-status'; st.textContent = 'Empty — always applies.'; return true; }
  const v = previewValue(src, self);
  st.className = 'fx-status ok';
  st.textContent = S.name || Object.keys(S.vals).length ? `Valid · on the current assessment (${S.name || 'unnamed'}): ${v == null ? 'no data' : (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)}` : 'Valid. Load an example to preview values.';
  return true;
}

function editItem(kind, i) {
  const L = ST.draft[kind], it = i >= 0 ? JSON.parse(JSON.stringify(L[i])) : {};
  const E = { fields:editField, metrics:editMetric, checks:editCheck, questions:editQuestion, patterns:editPattern, requests:editRequest, checklist:editChecklist,
    gates:editGate, benchmarks:editBenchmark, models:editModel }[kind];
  E(it, i);
}
function commitItem(kind, i, item) {
  const L = ST.draft[kind];
  if (i >= 0) L[i] = item; else L.push(item);
  saveStudioDraft(); closeModal(); renderStudioPane();
  toast(`${i >= 0 ? 'Updated' : 'Added'} in the draft. Publish to make it live.`);
}
function deleteItem(kind, i) {
  const it = ST.draft[kind][i]; if (!it) return;
  const id = it.id || it.key;
  const users = id ? referencesTo(id) : [];
  if (!confirm(`Delete “${it.label || it.title || it.text}”?${users.length ? `\n\nIt is used by: ${users.join(', ')}. Those will show “no data” until updated.` : ''}`)) return;
  ST.draft[kind].splice(i, 1); saveStudioDraft(); renderStudioPane();
}
function moveItem(kind, i, d) { const L = ST.draft[kind], j = i + d; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; saveStudioDraft(); renderStudioPane(); }
function referencesTo(id) {
  const out = [], uses = src => { const c = fxCompile(String(src || '')); return c.ok && c.idents.includes(id); };
  ST.draft.metrics.forEach(m => uses(m.formula) && out.push('metric ' + m.label));
  ST.draft.checks.forEach(c => (uses(c.computed) || c.stated === id) && out.push('check ' + c.title));
  ST.draft.questions.forEach(q => uses(q.when) && out.push('question'));
  ST.draft.patterns.forEach(p => uses(p.when) && out.push('pattern ' + p.title));
  ST.draft.requests.forEach(r => uses(r.when) && out.push('request'));
  ST.draft.gates.forEach(g => uses(g.when) && out.push('deal-breaker ' + g.title));
  ST.draft.benchmarks.forEach(b => b.metric === id && out.push('benchmark'));
  return out;
}

function editField(f, i) {
  const secOpts = SECTIONS.filter(s => s.id !== 'custom').map(s => [s.id, s.label]).concat([['custom', (ST.draft.branding.customSectionLabel || 'Additional evidence') + ' (new section)']]);
  openModal(i >= 0 ? 'Edit field' : 'Add a field', `
    ${edRow('Label', `<input class="form-inp" id="ed-label" value="${esc(f.label || '')}" placeholder="e.g. Net dollar retention of the top 10 customers">`)}
    ${edRow('Name used in formulas', `<input class="form-inp m" id="ed-id" value="${esc(f.id || '')}" placeholder="filled in from the label" ${i >= 0 ? 'readonly' : ''}>`, i >= 0 ? 'Fixed once created, so saved assessments keep their values.' : 'Lower case letters, numbers and underscores.')}
    ${edRow('Section', `<select class="field-select" id="ed-section">${optionList(secOpts, f.section || 'custom')}</select>`)}
    ${edRow('Group heading inside the section', `<input class="form-inp" id="ed-group" value="${esc(f.group || '')}" placeholder="e.g. Pipeline">`)}
    ${edRow('Type', `<select class="field-select" id="ed-type" onchange="document.getElementById('ed-num-wrap').style.display=this.value==='num'?'':'none';document.getElementById('ed-opt-wrap').style.display=this.value==='select'?'':'none'">${optionList([['num','Number'],['bool','Yes / no'],['select','Choice from a list'],['txt','Text']], f.type || 'num')}</select>`)}
    <div id="ed-num-wrap" style="${(f.type || 'num') === 'num' ? '' : 'display:none'}">${edRow('Unit', `<select class="field-select" id="ed-unit">${optionList(UNIT_OPTS, f.unit || '')}</select>`)}
      ${edRow('Quick-pick values', `<input class="form-inp" id="ed-chips" value="${esc((f.chips || []).join(', '))}" placeholder="e.g. 10, 20, 30">`, 'Optional. Shown as buttons under the input.')}</div>
    <div id="ed-opt-wrap" style="${f.type === 'select' ? '' : 'display:none'}">${edRow('Choices', `<input class="form-inp" id="ed-options" value="${esc((f.options || []).join(', '))}" placeholder="Option one, Option two, Option three">`, 'Separated by commas.')}</div>
    ${edRow('Hint shown under the label', `<input class="form-inp" id="ed-hint" value="${esc(f.hint || '')}">`)}
    ${edRow('Business models', modelBoxes(f.models))}
    <label class="api-check" style="font-size:12px"><input type="checkbox" id="ed-req" ${f.required ? 'checked' : ''}> Required — missing it adds a question to the list</label>`,
    [{ label:'Save field', primary:true, onClick:() => {
      const label = val('ed-label').trim(); if (!label) { toast('Give the field a label.', 'err'); return; }
      const id = i >= 0 ? f.id : (val('ed-id').trim() ? 'c_' + slug(val('ed-id').replace(/^c_/, '')) : uniqueId('c_', label));
      if (i < 0 && knownIdentifiers(ST.draft).has(id)) { toast(`“${id}” is already used. Choose another name.`, 'err'); return; }
      const type = val('ed-type');
      const out = { id, label, section:val('ed-section'), group:val('ed-group').trim(), type, hint:val('ed-hint').trim(),
        required:document.getElementById('ed-req').checked, models:Array.from(document.querySelectorAll('[name=ed-models]:checked')).map(x => x.value) };
      if (type === 'num') { out.unit = val('ed-unit'); out.chips = val('ed-chips').split(',').map(x => parseNum(x)).filter(x => x != null); }
      if (type === 'select') { out.options = val('ed-options').split(',').map(x => x.trim()).filter(Boolean); if (out.options.length < 2) { toast('Give at least two choices.', 'err'); return; } }
      commitItem('fields', i, out);
    } }]);
  const lab = document.getElementById('ed-label'), idEl = document.getElementById('ed-id');
  if (i < 0) lab.addEventListener('input', () => { idEl.value = uniqueId('c_', lab.value); });
}
function editMetric(m, i) {
  const th = m.thresholds || {};
  openModal(i >= 0 ? 'Edit metric' : 'Add a metric', `
    ${edRow('Label', `<input class="form-inp" id="ed-label" value="${esc(m.label || '')}" placeholder="e.g. New ARR per sales rep">`)}
    ${edRow('Name used in formulas', `<input class="form-inp m" id="ed-key" value="${esc(m.key || '')}" ${i >= 0 ? 'readonly' : ''} placeholder="filled in from the label">`)}
    ${edRow('Formula', formulaBox('ed-formula', m.formula, { self:m.key }))}
    ${edRow('Unit', `<select class="field-select" id="ed-unit">${optionList(UNIT_OPTS, m.unit || '')}</select>`)}
    ${edRow('What it means (shown next to the formula)', `<input class="form-inp" id="ed-desc" value="${esc(m.description || '')}">`)}
    <div class="block-title" style="margin-top:14px">Scoring (optional)</div>
    ${edRow('Dimension', `<select class="field-select" id="ed-dim">${optionList(DIM_OPTS, m.dim || '')}</select>`)}
    ${edRow('Direction', `<select class="field-select" id="ed-dir">${optionList([['hi','Higher is better'],['lo','Lower is better']], m.dir || 'hi')}</select>`)}
    ${edRow('Weight inside the dimension', `<input class="form-inp" id="ed-weight" type="number" step="any" value="${esc(m.weight != null ? m.weight : 1)}">`, 'Built-in metrics use 0.6 to 2.2. 1 is typical.')}
    ${edRow('Stage thresholds', `<div class="tbl-wrap"><table class="ledger"><thead><tr><th>Stage</th><th>Lowest value</th><th>2nd</th><th>3rd</th><th>Highest value</th></tr></thead><tbody>
      ${STAGE_IDS.map(st => `<tr><td>${esc(STAGES.find(x => x.id === st).n)}</td>${[0,1,2,3].map(k => `<td><input class="st-num" type="number" step="any" id="ed-th-${st}-${k}" value="${th[st] ? esc(th[st][k]) : ''}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <button type="button" class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="copyThresholdRow()">Copy the first filled stage to all stages</button>`,
      'Four values from lowest to highest. Higher is better: they score 0 / 45 / 72 / 100. Lower is better: 100 / 55 / 28 / 0. The score is interpolated in between. Leave a stage empty to not score the metric there.')}
    ${edRow('Business models', modelBoxes(m.models))}`,
    [{ label:'Save metric', primary:true, onClick:() => {
      const label = val('ed-label').trim(); if (!label) { toast('Give the metric a label.', 'err'); return; }
      const key = i >= 0 ? m.key : (val('ed-key').trim() ? 'm_' + slug(val('ed-key').replace(/^m_/, '')) : uniqueId('m_', label));
      if (i < 0 && knownIdentifiers(ST.draft).has(key)) { toast(`“${key}” is already used.`, 'err'); return; }
      if (!checkFormula('ed-formula', false, key)) { toast('Fix the formula first.', 'err'); return; }
      const thresholds = {};
      for (const st of STAGE_IDS) {
        const vs = [0,1,2,3].map(k => val(`ed-th-${st}-${k}`).trim());
        if (vs.every(v => v === '')) continue;
        const n = vs.map(Number);
        if (vs.some(v => v === '') || n.some(x => !isFinite(x)) || !(n[0] <= n[1] && n[1] <= n[2] && n[2] <= n[3])) { toast(`Thresholds for ${STAGES.find(x => x.id === st).n} need four values from lowest to highest.`, 'err'); return; }
        thresholds[st] = n;
      }
      const dim = val('ed-dim');
      if (dim && !Object.keys(thresholds).length) { toast('A scored metric needs thresholds for at least one stage — or set the dimension to “Not scored”.', 'err'); return; }
      const weight = parseNum(val('ed-weight'));
      if (weight == null || weight <= 0) { toast('The weight must be above 0. To keep a metric out of the score, set its dimension to “Not scored”.', 'err'); return; }
      commitItem('metrics', i, { key, label, formula:val('ed-formula').trim(), unit:val('ed-unit'), description:val('ed-desc').trim(), dim, dir:val('ed-dir'),
        weight, thresholds, models:Array.from(document.querySelectorAll('[name=ed-models]:checked')).map(x => x.value) });
    } }]);
  const lab = document.getElementById('ed-label'), k = document.getElementById('ed-key');
  if (i < 0) lab.addEventListener('input', () => { k.value = uniqueId('m_', lab.value); });
  checkFormula('ed-formula', false, m.key || '');
}
function copyThresholdRow() {
  const src = STAGE_IDS.find(st => [0,1,2,3].every(k => val(`ed-th-${st}-${k}`).trim() !== ''));
  if (!src) { toast('Fill one stage first.', 'err'); return; }
  STAGE_IDS.forEach(st => [0,1,2,3].forEach(k => { document.getElementById(`ed-th-${st}-${k}`).value = val(`ed-th-${src}-${k}`); }));
}
function editCheck(c, i) {
  const numFields = [];
  knownIdentifiers(ST.draft).forEach((info, id) => { if ((info.kind === 'field' || info.kind === 'custom field') && (info.t === 'num' || !info.t)) numFields.push([id, `${info.label} (${id})`]); });
  numFields.sort((a, b) => (a[0].startsWith('stated_') ? 0 : 1) - (b[0].startsWith('stated_') ? 0 : 1));
  openModal(i >= 0 ? 'Edit check' : 'Add a check', `
    ${edRow('Title', `<input class="form-inp" id="ed-title" value="${esc(c.title || '')}" placeholder="e.g. Pipeline coverage">`)}
    ${edRow('What the company states (field)', `<select class="field-select" id="ed-stated">${optionList(numFields, c.stated || '')}</select>`, 'Add a field in “What the company states” or your own section for new claims.')}
    ${edRow('What Radar computes (formula)', formulaBox('ed-computed', c.computed))}
    ${edRow('Unit for display', `<select class="field-select" id="ed-unit">${optionList(UNIT_OPTS, c.unit || '')}</select>`)}
    ${edRow('Compare in', `<select class="field-select" id="ed-mode">${optionList([['rel','Percent difference'],['pts','Points (for percentages)']], c.mode || 'rel')}</select>`)}
    ${edRow('Minor beyond', `<input class="form-inp" id="ed-tol" type="number" step="any" value="${esc(c.tol != null ? c.tol : 10)}">`)}
    ${edRow('Material beyond', `<input class="form-inp" id="ed-hard" type="number" step="any" value="${esc(c.hard != null ? c.hard : 25)}">`)}
    ${edRow('A stated figure that is too high…', `<select class="field-select" id="ed-good">${optionList([['hi','…flatters the company'],['lo','…works against the company']], c.good || 'hi')}</select>`, 'Feeds the “every error flatters the company” test.')}
    ${edRow('Question to ask when it does not reconcile', `<textarea class="intake-ta" id="ed-ask" style="min-height:60px">${esc(c.ask || '')}</textarea>`)}`,
    [{ label:'Save check', primary:true, onClick:() => {
      const title = val('ed-title').trim(); if (!title) { toast('Give the check a title.', 'err'); return; }
      if (!checkFormula('ed-computed', false)) { toast('Fix the formula first.', 'err'); return; }
      const tol = parseNum(val('ed-tol')), hard = parseNum(val('ed-hard'));
      if (tol == null || hard == null || hard < tol) { toast('Material must be at least the minor tolerance.', 'err'); return; }
      commitItem('checks', i, { id:c.id || 'k_' + slug(title) + '_' + Date.now().toString(36).slice(-4), title, stated:val('ed-stated'), computed:val('ed-computed').trim(),
        unit:val('ed-unit'), mode:val('ed-mode'), tol, hard, good:val('ed-good'), ask:val('ed-ask').trim() });
    } }]);
  checkFormula('ed-computed', false);
}
function editQuestion(q, i) {
  openModal(i >= 0 ? 'Edit question' : 'Add a question', `
    ${edRow('Question', `<textarea class="intake-ta" id="ed-text" style="min-height:70px" placeholder="e.g. What share of pipeline is from existing customers?">${esc(q.text || '')}</textarea>`)}
    ${edRow('Ask only when (optional)', formulaBox('ed-when', q.when, { optional:true }), 'Empty = ask on every assessment.')}
    ${edRow('Priority', `<select class="field-select" id="ed-pri">${optionList([['high','High — right after blocking issues'],['normal','Normal'],['low','Low — near the end']], q.priority || 'normal')}</select>`)}
    ${edRow('Label under the question', `<input class="form-inp" id="ed-tag" value="${esc(q.tag || '')}" placeholder="e.g. Pipeline">`)}`,
    [{ label:'Save question', primary:true, onClick:() => {
      const text = val('ed-text').trim(); if (!text) { toast('Write the question.', 'err'); return; }
      if (!checkFormula('ed-when', true)) { toast('Fix the condition first.', 'err'); return; }
      commitItem('questions', i, { id:q.id || 'q_' + Date.now().toString(36), text, when:val('ed-when').trim(), priority:val('ed-pri'), tag:val('ed-tag').trim() });
    } }]);
  checkFormula('ed-when', true);
}
function editPattern(p, i) {
  openModal(i >= 0 ? 'Edit pattern' : 'Add a pattern', `
    ${edRow('Title', `<input class="form-inp" id="ed-title" value="${esc(p.title || '')}" placeholder="e.g. Burning hard with little runway">`)}
    ${edRow('Type', `<select class="field-select" id="ed-sev">${optionList([['red','Risk'],['amber','Watch'],['green','Strength']], p.sev || 'red')}</select>`)}
    ${edRow('Risk category on the risk map', `<select class="field-select" id="ed-risk">${optionList([['','Choose automatically']].concat(RISK_TYPES), p.risk || '')}</select>`)}
    ${edRow('Fires when', formulaBox('ed-when', p.when))}
    ${edRow('Evidence to show on the card', `<input class="form-inp m" id="ed-evid" value="${esc(p.evidence || '')}" placeholder="e.g. burn_multiple, runway">`, 'Names separated by commas.')}
    ${edRow('Why it matters', `<textarea class="intake-ta" id="ed-why" style="min-height:60px">${esc(p.why || '')}</textarea>`)}
    ${edRow('Question to ask', `<textarea class="intake-ta" id="ed-ask" style="min-height:50px">${esc(p.ask || '')}</textarea>`)}`,
    [{ label:'Save pattern', primary:true, onClick:() => {
      const title = val('ed-title').trim(); if (!title) { toast('Give the pattern a title.', 'err'); return; }
      if (!checkFormula('ed-when', false)) { toast('Fix the condition first.', 'err'); return; }
      const bad = val('ed-evid').split(',').map(s => s.trim()).filter(Boolean).filter(n => !knownIdentifiers(ST.draft).has(n));
      if (bad.length) { toast(`Unknown evidence names: ${bad.join(', ')}`, 'err'); return; }
      commitItem('patterns', i, { id:p.id || 'p_' + slug(title) + '_' + Date.now().toString(36).slice(-4), title, sev:val('ed-sev'), when:val('ed-when').trim(),
        evidence:val('ed-evid').trim(), why:val('ed-why').trim(), ask:val('ed-ask').trim(), risk:val('ed-risk') });
    } }]);
  checkFormula('ed-when', false);
}
function editRequest(r, i) {
  openModal(i >= 0 ? 'Edit request' : 'Add a document request', `
    ${edRow('Request', `<textarea class="intake-ta" id="ed-text" style="min-height:60px" placeholder="e.g. Pipeline export from the CRM with stage history">${esc(r.text || '')}</textarea>`)}
    ${edRow('Ask only when (optional)', formulaBox('ed-when', r.when, { optional:true }))}`,
    [{ label:'Save request', primary:true, onClick:() => {
      const text = val('ed-text').trim(); if (!text) { toast('Write the request.', 'err'); return; }
      if (!checkFormula('ed-when', true)) { toast('Fix the condition first.', 'err'); return; }
      commitItem('requests', i, { id:r.id || 'r_' + Date.now().toString(36), text, when:val('ed-when').trim() });
    } }]);
  checkFormula('ed-when', true);
}

function startFromLive() {
  ST.draft = normalizeConfig(JSON.parse(JSON.stringify(CFG_PUBLISHED))); draftBase.set(ST.sha); ST.conflict = false;
  try { localStorage.removeItem('vcr2-studio-draft'); } catch (e) {}
  refreshAfterConfig(); renderStudio(); toast('Your draft now matches the live version.');
}
function keepDraftOverLive() { draftBase.set(ST.sha); ST.conflict = false; renderStudio(); }

/* ── Validation, files and publishing ── */
function validateDraft() {
  const errs = [];
  const dup = (list, key, what) => { const seen = new Set(); list.forEach(x => { if (seen.has(x[key])) errs.push(`Two ${what} use the name “${x[key]}”. Delete or rename one.`); seen.add(x[key]); }); };
  dup(ST.draft.fields, 'id', 'fields'); dup(ST.draft.metrics, 'key', 'metrics');
  const builtin = knownIdentifiers(EMPTY_CONFIG());
  ST.draft.fields.forEach(f => { if (builtin.has(f.id)) errs.push(`The field name “${f.id}” is already used by a built-in item.`); });
  ST.draft.metrics.forEach(m => { if (builtin.has(m.key)) errs.push(`The metric name “${m.key}” is already used by a built-in item.`); });
  const v = (src, what, opts) => { const r = fxValidate(src, Object.assign({ cfg:ST.draft }, opts || {})); if (!r.ok) errs.push(`${what}: ${r.error}`); };
  ST.draft.metrics.forEach(m => v(m.formula, `Metric “${m.label}”`, { self:m.key }));
  ST.draft.checks.forEach(c => v(c.computed, `Check “${c.title}”`));
  ST.draft.questions.forEach(q => v(q.when, `Question “${String(q.text).slice(0, 40)}”`, { optional:true }));
  ST.draft.patterns.forEach(p => v(p.when, `Pattern “${p.title}”`));
  ST.draft.requests.forEach(r => v(r.when, `Request “${String(r.text).slice(0, 40)}”`, { optional:true }));
  ST.draft.gates.forEach(g => v(g.when, `Deal-breaker “${g.title}”`));
  const known = knownIdentifiers(ST.draft);
  ST.draft.benchmarks.forEach(b => { if (!known.has(b.metric)) errs.push(`Benchmark for “${b.metric}”: that metric no longer exists.`); });
  return errs;
}
function b64utf8(str) {
  const bytes = new TextEncoder().encode(str); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function publishDraft() {
  const errs = validateDraft();
  if (errs.length) { openModal('Fix these before publishing', `<ul class="howto">${errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`); return; }
  if (!draftChanges().length) { toast('Nothing to publish — the live site already matches your draft.'); return; }
  const t = repoTarget();
  const out = Object.assign(normalizeConfig(JSON.parse(JSON.stringify(ST.draft))), { owner:t.owner, repo:t.repo, branch:t.branch, path:t.path, updated:new Date().toISOString() });
  const body = JSON.stringify(out, null, 2) + '\n';
  const btn = document.querySelector('.studio-actions .btn-primary'); if (btn) { btn.disabled = true; btn.textContent = 'Publishing…'; }
  try {
    if (ST.conflict) throw new Error('the live configuration changed after this draft was started. Choose “Start again from the live version” or “Keep my draft” first.');
    if (!ST.synced && !(await syncRemote())) throw new Error('could not read the current file from GitHub. Try again in a moment.');
    const payload = { message:`Studio: update ${draftChanges().join(', ')}`, content:b64utf8(body), branch:t.branch };
    if (ST.sha) payload.sha = ST.sha;
    const r = await gh(`/repos/${t.owner}/${t.repo}/contents/${t.path}`, { method:'PUT', body:JSON.stringify(payload), headers:{ Accept:'application/vnd.github+json', Authorization:'Bearer ' + ST.token, 'Content-Type':'application/json', 'X-GitHub-Api-Version':'2022-11-28' } });
    if (!r.ok) {
      if (r.status === 409 || r.status === 422) {
        /* Someone (another device, or an edit on github.com) changed the file since the Studio loaded it. */
        const before = ST.sha; await syncRemote();
        if (ST.sha !== before) { ST.conflict = true; refreshAfterConfig(); renderStudio(); throw new Error('the live configuration changed since you opened the Studio. Nothing was overwritten — review the notice at the top.'); }
      }
      const why = r.status === 401 ? 'the token was rejected or has expired — sign out and sign in again'
        : r.status === 403 ? 'the token does not have “Contents: Read and write” on this repository'
        : r.status === 404 ? `the token cannot write to ${t.owner}/${t.repo} — give it access to that repository`
        : `GitHub answered ${r.status}${r.body && r.body.message ? ' (' + r.body.message + ')' : ''}`;
      throw new Error(why);
    }
    ST.sha = (r.body && r.body.content && r.body.content.sha) || ST.sha;
    CFG_PUBLISHED = normalizeConfig(out); ST.draft = normalizeConfig(JSON.parse(JSON.stringify(out)));
    draftBase.set(ST.sha);
    try { localStorage.setItem('vcr2-studio-draft', JSON.stringify(ST.draft)); } catch (e) {}
    refreshAfterConfig(); renderStudio();
    toast('Published. Visitors get it within about a minute.');
  } catch (e) { toast('Publish failed: ' + e.message, 'err'); }
  finally { const b = document.querySelector('.studio-actions .btn-primary'); if (b) { b.disabled = false; b.textContent = 'Publish to the live site'; } }
}
function downloadDraft() {
  const t = repoTarget();
  const out = Object.assign(normalizeConfig(JSON.parse(JSON.stringify(ST.draft))), { owner:t.owner, repo:t.repo, branch:t.branch, path:t.path, updated:new Date().toISOString() });
  downloadFile(CONFIG_FILE, JSON.stringify(out, null, 2) + '\n', 'application/json');
  toast(`Saved ${CONFIG_FILE}. Uploading it to the repository has the same effect as Publish.`);
}
function importDraft() {
  pickFile('.json', text => {
    let parsed; try { parsed = JSON.parse(text); } catch (e) { toast('That is not a Radar config file.', 'err'); return; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { toast('That is not a Radar config file.', 'err'); return; }
    try { ST.draft = normalizeConfig(parsed); saveStudioDraft(); renderStudio(); toast('Config imported into your draft. Review it, then publish.'); }
    catch (e) { toast('That is not a Radar config file.', 'err'); }
  });
}
function discardDraft() {
  if (!confirm('Throw away your unpublished changes and go back to the live version?')) return;
  ST.draft = normalizeConfig(JSON.parse(JSON.stringify(CFG_PUBLISHED))); draftBase.set(ST.sha); ST.conflict = false;
  try { localStorage.removeItem('vcr2-studio-draft'); localStorage.setItem('vcr2-studio-preview', '0'); } catch (e) {}
  refreshAfterConfig(); renderStudio();
}

/* ═══════════════════════════════════════════════════════════════
   START PAGE — pick what an investor told you, land on the right screen
   ═══════════════════════════════════════════════════════════════ */
function paneStHome() {
  const d = ST.draft, n = (x) => Array.isArray(x) ? x.length : Object.keys(x || {}).length;
  const card = (tab, title, desc, count) => `<button class="st-card" onclick="studioTab('${tab}')"><b>${esc(title)}</b><span>${esc(desc)}</span>${count ? `<em>${count} of yours</em>` : ''}</button>`;
  return `<p class="pg-desc">Everything that decides how a company is judged can be changed here — no code. Pick what an investor told you, make the change, preview it, then publish. Only you can publish.</p>
    <div class="block-title">An investor told you…</div>
    <div class="st-cards">
      ${card('standards', '…a different value is healthy', 'Change what counts as poor, good and excellent for any metric, at each stage.', n(d.thresholds))}
      ${card('metrics', '…to track a new number', 'Add a metric computed from any inputs, scored or just shown.', n(d.metrics))}
      ${card('fields', '…to collect a new piece of information', 'Add an input to the form: a number, yes/no, a choice or text.', n(d.fields))}
      ${card('gates', '…that something should stop a deal', 'Add a deal-breaker: when its condition is true, no score is given.', n(d.gates))}
      ${card('patterns', '…to watch for a warning sign', 'Add a red flag (or a strength) that fires on a condition.', n(d.patterns))}
      ${card('questions', '…a question to always ask founders', 'Add questions to the question list and the founder email.', n(d.questions))}
      ${card('checks', '…to double-check a figure founders state', 'Compare a stated number with the one Radar computes.', n(d.checks))}
      ${card('checklist', '…a document or step for diligence', 'Add items to the diligence checklist, by stage.', n(d.checklist))}
      ${card('benchmarks', '…market data or benchmarks', 'Publish medians and quartiles; every report shows where the company sits.', n(d.benchmarks))}
      ${card('answers', '…an answer should count more or less', 'Change the score of each answer (e.g. SOC 2 Type I) and the points of yes/no questions.', n(d.categorical) + n(d.booleans))}
      ${card('defaults', '…different default assumptions', 'Exit years, target return, probabilities, exit multiple, dilution, stage ranges, evidence weights.', n(d.defaults))}
      ${card('triggers', '…a red flag should fire earlier or later', 'Change the numbers behind every built-in red flag.', n(d.patternParams))}
      ${card('tolerances', '…a check is too strict or too loose', 'Change how big a gap must be before a stated figure is flagged.', n(d.checkTol))}
      ${card('scoring', '…a dimension matters more at a stage', 'Weights of revenue, capital, go-to-market, team, market and governance.', n(d.stageWeights))}
      ${card('models', '…about a sector you do not cover', 'Add a business model; your inputs and metrics can target it.', n(d.models))}
      ${card('builtins', '…something is not relevant', 'Switch off any built-in section, input, metric, answer, check, red flag, question, request, checklist item or deal-breaker.', Object.values(d.hidden || {}).reduce((a, x) => a + x.length, 0))}
      ${card('labels', '…to use different words', 'Rename any built-in input, metric, section, dimension, red flag, deal-breaker or checklist item.', LABEL_KINDS.reduce((a, k) => a + n(d.labels && d.labels[k]), 0))}
      ${card('texts', '…to change the home page', 'App name, headline, introduction and footnote.', n(d.branding))}
    </div>
    <p class="field-hint" style="margin-top:14px">Nothing you do here is permanent until you publish, and every change can be undone: switched-off items come back with one tick, and every value has a way back to the built-in default.</p>`;
}

/* ═══════════════════════════════════════════════════════════════
   SCORED ANSWERS — the score each choice earns, and yes/no points
   ═══════════════════════════════════════════════════════════════ */
function paneStAnswers() {
  const d = ST.draft;
  const catBlock = CAT_DEFS.map(([key, field, label, w0]) => {
    const cfg = RUBRIC.categorical[key], ov = d.categorical[key] || {}, wk = 'cat_' + key;
    const models = cfg.models ? ` <span class="field-hint">(${esc(cfg.models.map(m => modelLabel(m)).join(', '))} only)</span>` : '';
    return `<div class="ans-card"><div class="ans-h"><b>${esc(label)}</b>${models}<span class="field-hint">${esc(DIM_LABEL[cfg.dim])}</span></div>
      <table class="ledger"><tbody>${Object.keys(cfg.map).map(opt => `<tr><td>${esc(opt)}</td><td style="width:170px;text-align:right"><input class="st-num" type="number" min="0" max="100" step="any" value="${esc(ov[opt] != null ? ov[opt] : cfg.map[opt])}" data-cat="${esc(key)}" data-opt="${esc(opt)}" onchange="setCatScore(this)"> <span class="field-hint">/100${ov[opt] != null ? ` · built-in ${cfg.map[opt]}` : ''}</span></td></tr>`).join('')}
      <tr><td style="color:var(--t2)">Weight inside ${esc(DIM_LABEL[cfg.dim].toLowerCase())}</td><td style="text-align:right"><input class="st-num" type="number" step="any" min="0" value="${esc(d.metricWeights[wk] != null ? d.metricWeights[wk] : w0)}" onchange="setCatWeight('${key}', this.value)"> <span class="field-hint">built-in ${w0}</span></td></tr></tbody></table>
      ${d.categorical[key] || d.metricWeights[wk] != null ? `<button class="btn btn-ghost btn-sm" onclick="resetCat('${key}')">Back to the built-in scores</button>` : ''}</div>`;
  }).join('');
  const boolRows = RUBRIC.booleans.map(b => {
    const k = boolKey(b), f = ALL_FIELDS().find(x => x.id === b.id) || { lbl:b.id }, ov = d.booleans[k];
    const when = b.pts > 0 ? (b.good ? 'Yes' : 'No') : (b.good ? 'No' : 'Yes');
    return `<tr><td>${esc(f.lbl)}<div class="field-hint">${esc(b.note)}${b.models ? ' · ' + esc(b.models.map(m => modelLabel(m)).join(', ')) + ' only' : ''}</div></td><td class="m">${when}</td><td class="m">${b.pts > 0 ? 'adds' : 'removes'}</td>
      <td style="white-space:nowrap"><input class="st-num" type="number" min="0" max="50" step="any" value="${esc(ov != null ? ov : Math.abs(b.pts))}" data-bool="${esc(k)}" onchange="setBoolPts(this)"> <span class="field-hint">pts in ${esc(DIM_LABEL[b.dim].toLowerCase())}${ov != null ? ` · built-in ${Math.abs(b.pts)}` : ''}</span></td></tr>`;
  }).join('');
  return `<p class="pg-desc">Some inputs are answers rather than numbers. Here you set how much each answer is worth. A choice earns a score out of 100 inside its dimension; a yes/no answer adds or removes points from its dimension (capped at ±15 per dimension). Set points to 0 to make an answer neutral.</p>
    <div class="block-title">Choices</div><div class="ans-grid">${catBlock}</div>
    <div class="block-title" style="margin-top:20px">Yes / no answers</div>
    <div class="tbl-wrap"><table class="ledger"><thead><tr><th>Question</th><th>When the answer is</th><th>It</th><th>Points</th></tr></thead><tbody>${boolRows}</tbody></table></div>
    ${Object.keys(d.booleans).length ? `<button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="ST.draft.booleans={};saveStudioDraft();renderStudioPane()">Put every yes/no back to the built-in points</button>` : ''}`;
}
function setCatScore(el) {
  const key = el.dataset.cat, opt = el.dataset.opt, v = parseNum(el.value), base = RUBRIC.categorical[key].map[opt];
  const m = Object.assign({}, ST.draft.categorical[key] || {});
  if (v == null || v === base) delete m[opt]; else m[opt] = Math.min(100, Math.max(0, v));
  if (Object.keys(m).length) ST.draft.categorical[key] = m; else delete ST.draft.categorical[key];
  saveStudioDraft(); renderStudioPane();
}
function setCatWeight(key, v) {
  const n = parseNum(v), w0 = (CAT_DEFS.find(c => c[0] === key) || [])[3];
  if (n != null && n <= 0) { toast('The weight must be above 0. To stop scoring an answer, switch it off in “Switch on or off”.', 'err'); renderStudioPane(); return; }
  if (n == null || n === w0) delete ST.draft.metricWeights['cat_' + key]; else ST.draft.metricWeights['cat_' + key] = n;
  saveStudioDraft(); renderStudioPane();
}
function resetCat(key) { delete ST.draft.categorical[key]; delete ST.draft.metricWeights['cat_' + key]; saveStudioDraft(); renderStudioPane(); }
function setBoolPts(el) {
  const k = el.dataset.bool, v = parseNum(el.value), b = RUBRIC.booleans.find(x => boolKey(x) === k);
  if (v == null || (b && v === Math.abs(b.pts))) delete ST.draft.booleans[k]; else ST.draft.booleans[k] = Math.min(50, Math.max(0, v));
  saveStudioDraft(); renderStudioPane();
}

/* ═══════════════════════════════════════════════════════════════
   DEFAULTS & ASSUMPTIONS — used whenever a field is left blank
   ═══════════════════════════════════════════════════════════════ */
function paneStDefaults() {
  const d = ST.draft.defaults || {}, ex = d.exit || {}, dl = d.deal || {}, sm = d.sim || {}, sr = d.stageRange || {}, ev = d.evidence || {};
  const B = BASE;
  const inp = (path, v, base, extra) => `<input class="st-num" type="number" step="any" value="${v != null ? esc(v) : ''}" placeholder="${esc(base)}" onchange="setDefault('${path}', this.value)" ${extra || ''}>`;
  const stageRow = (label, path, obj, baseObj, unit) => `<tr><td>${esc(label)}</td>${STAGE_IDS.map(st => `<td>${inp(path + '.' + st, obj && obj[st], baseObj[st])}</td>`).join('')}<td class="field-hint">${esc(unit)}</td></tr>`;
  const stageHead = `<thead><tr><th></th>${STAGE_IDS.map(st => `<th>${esc(stageName(st))}</th>`).join('')}<th></th></tr></thead>`;
  const probs = st => (ex.probs && ex.probs[st]) || B.exit.probs[st];
  return `<p class="pg-desc">These are the values Radar uses when an assessment leaves a field blank. Each box shows the built-in value in grey; type a number to replace it, clear the box to go back.</p>
    <div class="block-title">Exit scenarios (VC Method and First Chicago)</div>
    <div class="tbl-wrap"><table class="ledger">${stageHead}<tbody>
      ${stageRow('Years to exit', 'exit.years', ex.years, B.exit.years, 'years')}
      ${stageRow('Target annual return (IRR)', 'exit.irr', ex.irr, B.exit.irr, '%')}
      ${['Downside','Base','Upside'].map((nm, i) => `<tr><td>Probability of the ${nm.toLowerCase()} case</td>${STAGE_IDS.map(st => `<td><input class="st-num" type="number" step="any" min="0" value="${ex.probs && ex.probs[st] ? esc(ex.probs[st][i]) : ''}" placeholder="${B.exit.probs[st][i]}" onchange="setProb('${st}', ${i}, this.value)"></td>`).join('')}<td class="field-hint">% (rescaled to 100)</td></tr>`).join('')}
    </tbody></table></div>
    <div class="st-row"><span>First Chicago discount rate (%)</span>${inp('exit.fcRate', ex.fcRate, B.exit.fcRate)}</div>
    <div class="st-row"><span>Base case: growth slows by this much each year (%)</span>${inp('exit.decayBase', ex.decayBase, Math.round((1 - B.exit.keepBase) * 100))}</div>
    <div class="st-row"><span>Upside case: growth slows by this much each year (%)</span>${inp('exit.decayUp', ex.decayUp, Math.round((1 - B.exit.keepUp) * 100))}</div>
    <div class="st-row"><span>Downside case: sale at this multiple of today’s ARR (x)</span>${inp('exit.downMultiple', ex.downMultiple, B.exit.downMultiple)}</div>
    <div class="block-title" style="margin-top:20px">Deal</div>
    <div class="st-row"><span>Exit multiple on ARR (x)</span>${inp('deal.exit_multiple', dl.exit_multiple, B.deal.exit_multiple)}</div>
    <div class="st-row"><span>Dilution per future round (%)</span>${inp('deal.dilution', dl.dilution, B.deal.dilution)}</div>
    <div class="st-row"><span>Option pool required post-money (%)</span>${inp('deal.pool_target', dl.pool_target, B.deal.pool_target)}</div>
    <div class="tbl-wrap"><table class="ledger">${stageHead}<tbody>${stageRow('Further priced rounds before exit', 'deal.future_rounds', dl.future_rounds, B.deal.future_rounds, 'rounds')}</tbody></table></div>
    <div class="block-title" style="margin-top:20px">Runway simulation</div>
    <div class="st-row"><span>Monthly growth fades by (%)</span>${inp('sim.decay', sm.decay, B.assume.decay)}</div>
    <div class="st-row"><span>Horizon (months)</span>${inp('sim.horizon', sm.horizon, B.assume.horizon)}</div>
    <div class="st-row"><span>Runway kept in reserve when sizing capital needed (months)</span>${inp('sim.buffer', sm.buffer, B.assume.buffer)}</div>
    <div class="block-title" style="margin-top:20px">Stage ARR ranges</div>
    <p class="field-hint" style="margin-bottom:6px">Shown on the setup page and used to flag a company graded against the wrong stage.</p>
    <div class="tbl-wrap"><table class="ledger wide-num">${stageHead}<tbody>
      <tr><td>From ($)</td>${STAGE_IDS.map(st => `<td>${inp('stageRange.' + st + '.lo', sr[st] && sr[st].lo, B.stageRange[st].lo == null ? '—' : B.stageRange[st].lo)}</td>`).join('')}<td></td></tr>
      <tr><td>To ($)</td>${STAGE_IDS.map(st => `<td>${inp('stageRange.' + st + '.hi', sr[st] && sr[st].hi, B.stageRange[st].hi == null ? '—' : B.stageRange[st].hi)}</td>`).join('')}<td></td></tr></tbody></table></div>
    <div class="block-title" style="margin-top:20px">How much each source of evidence counts</div>
    <p class="field-hint" style="margin-bottom:6px">0 to 100. Stronger sources narrow the confidence band around the score.</p>
    ${EVIDENCE.map((e, i) => { const k = e.id === '' ? 'unverified' : e.id; return `<div class="st-row"><span>${esc(e.label)}</span>${inp('evidence.' + k, ev[k] != null ? Math.round(ev[k] * 100) : null, Math.round(B.evidence[i] * 100))}</div>`; }).join('')}
    ${Object.keys(d).length ? `<button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="if(confirm('Put every default back to the built-in value?')){ST.draft.defaults={};saveStudioDraft();renderStudioPane();}">Put every default back to the built-in value</button>` : ''}`;
}
function setDefault(path, v) {
  const n = parseNum(v), parts = path.split('.');
  const d = ST.draft.defaults = ST.draft.defaults || {};
  let o = d;
  for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; }
  const last = parts[parts.length - 1];
  const prev = o[last];
  if (n == null) delete o[last]; else o[last] = parts[0] === 'evidence' ? Math.min(1, Math.max(0, n / 100)) : n;
  if (parts[0] === 'stageRange') {
    const r = Object.assign({}, BASE.stageRange[parts[1]], o);
    if (r.lo != null && r.hi != null && r.lo > r.hi) { if (prev == null) delete o[last]; else o[last] = prev; toast('“From” must be below “To” for the same stage.', 'err'); }
  }
  /* tidy empty objects */
  const prune = x => { Object.keys(x).forEach(k => { if (x[k] && typeof x[k] === 'object' && !Array.isArray(x[k])) { prune(x[k]); if (!Object.keys(x[k]).length) delete x[k]; } }); };
  prune(d);
  const clean = normalizeConfig({ defaults:d }).defaults;
  if (canonJSON(clean) !== canonJSON(d)) toast(n != null && n !== getPath(clean, parts) && getPath(clean, parts) != null ? `Kept within the allowed range: ${getPath(clean, parts)}.` : 'That value is not allowed here; the built-in value is kept.', 'err');
  ST.draft.defaults = clean;
  saveStudioDraft(); renderStudioPane(); renderStudioStatus();
}
function getPath(o, parts) { let x = o; for (const k of parts) { if (x == null || typeof x !== 'object') return null; x = x[k]; } return typeof x === 'number' && parts[0] === 'evidence' ? Math.round(x * 100) : x; }
function setProb(st, i, v) {
  const d = ST.draft.defaults = ST.draft.defaults || {}; d.exit = d.exit || {}; d.exit.probs = d.exit.probs || {};
  const cur = (d.exit.probs[st] || BASE.exit.probs[st]).slice(), n = parseNum(v);
  cur[i] = n == null ? BASE.exit.probs[st][i] : Math.max(0, n);
  if (cur.every(v => v === 0)) { toast('At least one case needs a probability above 0.', 'err'); renderStudioPane(); return; }
  if (JSON.stringify(cur) === JSON.stringify(BASE.exit.probs[st])) delete d.exit.probs[st]; else d.exit.probs[st] = cur;
  if (!Object.keys(d.exit.probs).length) delete d.exit.probs; if (!Object.keys(d.exit).length) delete d.exit;
  saveStudioDraft(); renderStudioPane();
}

/* ═══════════════════════════════════════════════════════════════
   RED-FLAG TRIGGERS and CHECK TOLERANCES of the built-ins
   ═══════════════════════════════════════════════════════════════ */
function paneStTriggers() {
  const d = ST.draft.patternParams;
  return `<p class="pg-desc">The numbers that make each built-in red flag or strength appear. Change one and the flag fires earlier or later for every report. To stop a flag entirely, switch it off in “Switch on or off”.</p>
    <input class="form-inp" placeholder="Search a red flag…" oninput="filterTrigRows(this.value)" style="max-width:420px;margin-bottom:12px">
    <div class="tbl-wrap trig-tbl"><table class="ledger"><thead><tr><th>Red flag or strength</th><th>Fires when…</th><th>Value</th><th></th></tr></thead><tbody>
    ${Object.entries(PATTERN_PARAMS).map(([id, def]) => def.p.map(([k, dv, label, unit], j) => { const ov = d[id] && d[id][k];
      return `<tr data-q="${esc((def.label + ' ' + label).toLowerCase())}">${j === 0 ? `<td rowspan="${def.p.length}"><b>${esc(def.label)}</b>${d[id] ? ' <span class="pill amber">yours</span>' : ''}</td>` : ''}
        <td class="trig-when">${esc(label)}</td><td style="white-space:nowrap"><input class="st-num" type="number" step="any" value="${ov != null ? esc(ov) : ''}" placeholder="${esc(dv)}" data-pat="${esc(id)}" data-key="${esc(k)}" onchange="setTrigger(this)"> <span class="field-hint">${esc(unit)}${ov != null ? ` · built-in ${dv}` : ''}</span></td>
        ${j === 0 ? `<td rowspan="${def.p.length}" style="text-align:right">${d[id] ? `<button class="btn btn-ghost btn-sm" onclick="delete ST.draft.patternParams['${id}'];saveStudioDraft();renderStudioPane()">Reset</button>` : ''}</td>` : ''}</tr>`; }).join('')).join('')}
    </tbody></table></div>`;
}
function filterTrigRows(q) { q = String(q || '').trim().toLowerCase(); document.querySelectorAll('.trig-tbl tbody tr').forEach(r => r.style.display = !q || r.dataset.q.includes(q) ? '' : 'none'); if (!q) renderStudioPane(); }
function setTrigger(el) {
  const id = el.dataset.pat, k = el.dataset.key, v = parseNum(el.value), dv = (PATTERN_PARAMS[id].p.find(x => x[0] === k) || [])[1];
  const m = Object.assign({}, ST.draft.patternParams[id] || {});
  if (v == null || v === dv) delete m[k]; else m[k] = v;
  if (Object.keys(m).length) ST.draft.patternParams[id] = m; else delete ST.draft.patternParams[id];
  saveStudioDraft(); renderStudioPane();
}
function paneStTolerances() {
  const d = ST.draft.checkTol;
  return `<p class="pg-desc">How far a figure the company states can be from the one Radar computes before it is flagged: first as a minor inconsistency, then as a material contradiction (which counts towards withholding the score). Leave a box empty to keep the built-in value.</p>
    <div class="tbl-wrap"><table class="ledger"><thead><tr><th>Check</th><th>Minor beyond</th><th>Material beyond</th><th>Unit</th><th></th></tr></thead><tbody>
    ${CHECK_TOLS.map(c => { const o = d[c.id] || {}; return `<tr><td>${esc(c.title)}${d[c.id] ? ' <span class="pill amber">yours</span>' : ''}</td>
      <td><input class="st-num" type="number" step="any" min="0" value="${o.tol != null ? esc(o.tol) : ''}" placeholder="${c.tol}" data-chk="${c.id}" data-k="tol" onchange="setTol(this)"></td>
      <td>${c.hard == null ? '<span class="field-hint">single threshold</span>' : `<input class="st-num" type="number" step="any" min="0" value="${o.hard != null ? esc(o.hard) : ''}" placeholder="${c.hard}" data-chk="${c.id}" data-k="hard" onchange="setTol(this)">`}</td>
      <td class="field-hint">${esc(c.unit)}</td><td style="text-align:right">${d[c.id] ? `<button class="btn btn-ghost btn-sm" onclick="delete ST.draft.checkTol['${c.id}'];saveStudioDraft();renderStudioPane()">Reset</button>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="field-hint" style="margin-top:6px">Your own checks carry their tolerances in the Checks tab. The customer-ledger comparisons use fixed tolerances per field.</p>`;
}
function setTol(el) {
  const id = el.dataset.chk, k = el.dataset.k, v = parseNum(el.value), c = CHECK_TOLS.find(x => x.id === id);
  const o = Object.assign({}, ST.draft.checkTol[id] || {});
  if (v == null || v === c[k] || v < 0) delete o[k]; else o[k] = v;
  const tol = o.tol != null ? o.tol : c.tol, hard = o.hard != null ? o.hard : c.hard;
  if (hard != null && tol > hard) { toast('“Minor beyond” cannot be larger than “material beyond”.', 'err'); renderStudioPane(); return; }
  if (Object.keys(o).length) ST.draft.checkTol[id] = o; else delete ST.draft.checkTol[id];
  saveStudioDraft(); renderStudioPane();
}

/* ═══════════════════════════════════════════════════════════════
   DEAL-BREAKERS, BENCHMARK DATA and BUSINESS MODELS
   ═══════════════════════════════════════════════════════════════ */
function paneStGates() {
  const L = ST.draft.gates, add = `<button class="btn btn-primary btn-sm" onclick="editItem('gates',-1)">Add a deal-breaker</button>`;
  return `<p class="pg-desc">A deal-breaker stops the assessment: while its condition is true, no score is given and it sits at the top of the report, the memo and the founder email. Use it for anything an investor would never invest past — for example <code>top1_pct &gt; 50</code> or <code>litigation == 1</code>. The built-in ones (IP, cap table, taxes, too many contradictions) are in “Switch on or off”.</p>
    ${L.length ? `<div style="margin-bottom:10px">${add}</div><div class="tbl-wrap"><table class="ledger"><thead><tr><th>Deal-breaker</th><th>When</th><th></th></tr></thead><tbody>
      ${L.map((g, i) => `<tr><td>${esc(g.title)}</td><td class="m">${esc(g.when)}</td>${rowActions('gates', i)}</tr>`).join('')}</tbody></table></div>` : stEmpty('deal-breakers of your own', add)}`;
}
function editGate(g, i) {
  openModal(i >= 0 ? 'Edit deal-breaker' : 'Add a deal-breaker', `
    ${edRow('Title', `<input class="form-inp" id="ed-title" value="${esc(g.title || '')}" placeholder="e.g. One customer is more than half of revenue">`)}
    ${edRow('Stops the deal when', formulaBox('ed-when', g.when), 'A condition. While it is true, no score is given.')}
    ${edRow('Why it matters', `<textarea class="intake-ta" id="ed-why" style="min-height:60px">${esc(g.why || '')}</textarea>`)}
    ${edRow('What to ask the founders (goes in the email)', `<textarea class="intake-ta" id="ed-ask" style="min-height:50px">${esc(g.ask || '')}</textarea>`)}
    ${edRow('Risk category on the risk map', `<select class="field-select" id="ed-risk">${optionList([['','Legal & regulatory (default)']].concat(RISK_TYPES), g.risk || '')}</select>`)}`,
    [{ label:'Save deal-breaker', primary:true, onClick:() => {
      const title = val('ed-title').trim(); if (!title) { toast('Give the deal-breaker a title.', 'err'); return; }
      if (!checkFormula('ed-when', false)) { toast('Fix the condition first.', 'err'); return; }
      commitItem('gates', i, { id:g.id || 'g_' + slug(title).slice(0, 24) + '_' + Date.now().toString(36).slice(-4), title, when:val('ed-when').trim(), why:val('ed-why').trim(), ask:val('ed-ask').trim(), risk:val('ed-risk') });
    } }]);
  checkFormula('ed-when', false);
}
function benchMetricOpts() {
  const out = [];
  knownIdentifiers(ST.draft).forEach((info, id) => { if (info.kind === 'metric' || info.kind === 'custom metric' || ((info.kind === 'field' || info.kind === 'custom field') && (info.t === 'num' || !info.t))) out.push([id, `${info.label}`]); });
  return out.sort((a, b) => a[1].localeCompare(b[1]));
}
function paneStBenchmarks() {
  const L = ST.draft.benchmarks, add = `<button class="btn btn-primary btn-sm" onclick="editItem('benchmarks',-1)">Add a benchmark</button>`;
  const lbl = k => (knownIdentifiers(ST.draft).get(k) || {}).label || k;
  return `<p class="pg-desc">Reference data you find — a report’s median NRR at Series A, the top quartile for gross margin — published for everyone. Each report shows where the company sits against it (bottom quartile to top quartile) with your source. To change the bar the score uses, go to Healthy ranges.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${add}<button class="btn btn-ghost btn-sm" onclick="pasteBenchmarks()">Paste many rows at once</button></div>
    ${L.length ? `<div class="tbl-wrap"><table class="ledger"><thead><tr><th>Metric</th><th>Stage</th><th style="text-align:right">25th</th><th style="text-align:right">Median</th><th style="text-align:right">75th</th><th>Source</th><th></th></tr></thead><tbody>
      ${L.map((b, i) => `<tr><td>${esc(lbl(b.metric))}</td><td>${esc(b.stage === 'all' ? 'All stages' : stageName(b.stage))}</td><td class="m" style="text-align:right">${b.p25 == null ? '—' : esc(b.p25)}</td><td class="m" style="text-align:right">${esc(b.median)}</td><td class="m" style="text-align:right">${b.p75 == null ? '—' : esc(b.p75)}</td><td style="color:var(--t2)">${esc(b.source)}${b.year ? ' (' + esc(b.year) + ')' : ''}</td>${rowActions('benchmarks', i)}</tr>`).join('')}</tbody></table></div>` : stEmpty('benchmarks', '')}`;
}
function editBenchmark(b, i) {
  openModal(i >= 0 ? 'Edit benchmark' : 'Add a benchmark', `
    ${edRow('Metric', `<select class="field-select" id="ed-metric">${optionList(benchMetricOpts(), b.metric || 'nrr')}</select>`, 'Percentages as numbers (110 for 110%), money in dollars, multiples as numbers (1.5).')}
    ${edRow('Stage', `<select class="field-select" id="ed-stage">${optionList([['all','All stages']].concat(STAGE_IDS.map(s => [s, stageName(s)])), b.stage || 'all')}</select>`)}
    ${edRow('25th percentile (optional)', `<input class="form-inp" id="ed-p25" type="number" step="any" value="${b.p25 != null ? esc(b.p25) : ''}">`)}
    ${edRow('Median', `<input class="form-inp" id="ed-med" type="number" step="any" value="${b.median != null ? esc(b.median) : ''}">`)}
    ${edRow('75th percentile (optional)', `<input class="form-inp" id="ed-p75" type="number" step="any" value="${b.p75 != null ? esc(b.p75) : ''}">`)}
    ${edRow('Source', `<input class="form-inp" id="ed-src" value="${esc(b.source || '')}" placeholder="e.g. a published SaaS benchmark report">`)}
    ${edRow('Year', `<input class="form-inp" id="ed-year" value="${esc(b.year || '')}" placeholder="2026">`)}`,
    [{ label:'Save benchmark', primary:true, onClick:() => {
      const med = parseNum(val('ed-med')), p25 = parseNum(val('ed-p25')), p75 = parseNum(val('ed-p75'));
      if (med == null) { toast('Enter at least the median.', 'err'); return; }
      if ((p25 != null && p25 > med) || (p75 != null && p75 < med)) { toast('The 25th percentile must be at or below the median, and the 75th at or above it.', 'err'); return; }
      commitItem('benchmarks', i, { id:b.id || 'b_' + Date.now().toString(36), metric:val('ed-metric'), stage:val('ed-stage'), p25, median:med, p75, source:val('ed-src').trim(), year:val('ed-year').trim() });
    } }]);
}
function pasteBenchmarks() {
  openModal('Paste benchmark rows', `
    <p class="pg-desc" style="margin-bottom:8px">One row per line: <code>metric, stage, 25th, median, 75th, source, year</code>. The metric can be its name (e.g. <code>nrr</code>) or its label (e.g. Net revenue retention). Stage is pre-seed, seed, A, B or all. Leave a percentile empty if you only have the median.</p>
    <textarea class="intake-ta" id="bm-paste" style="min-height:160px" placeholder="nrr, A, 100, 110, 120, Public SaaS survey, 2026&#10;gross_margin, all, 65, 74, 80, Public SaaS survey, 2026"></textarea>`,
    [{ label:'Add these rows', primary:true, onClick:() => {
      const opts = benchMetricOpts(), byLabel = new Map(opts.map(([id, l]) => [l.toLowerCase(), id])), ids = new Set(opts.map(o => o[0]));
      const stageOf = s => { s = String(s || '').trim().toLowerCase().replace(/[\s-]/g, ''); return s === '' || s === 'all' ? 'all' : s === 'preseed' ? 'preseed' : s === 'seed' ? 'seed' : /^(a|seriesa)$/.test(s) ? 'a' : /^(b|seriesb|b\+|seriesb\+)$/.test(s) ? 'b' : null; };
      const rows = parseCSV(val('bm-paste')); let added = 0, reordered = 0; const bad = [];
      rows.forEach((r, n) => {
        if (!r.length || r.every(x => !String(x).trim())) return;
        const m0 = String(r[0] || '').trim(), metric = ids.has(m0) ? m0 : byLabel.get(m0.toLowerCase());
        const st = stageOf(r[1]), p25 = parseNum(r[2]), med = parseNum(r[3]), p75 = parseNum(r[4]);
        if (!metric || !st || med == null) { bad.push(n + 1); return; }
        const o = orderQuartiles({ p25, median:med, p75 }); if (o.p25 !== p25 || o.p75 !== p75) reordered++;
        ST.draft.benchmarks.push({ id:'b_' + Date.now().toString(36) + n, metric, stage:st, p25:o.p25, median:med, p75:o.p75, source:String(r[5] || '').trim(), year:String(r[6] || '').trim() }); added++;
      });
      saveStudioDraft(); closeModal(); renderStudioPane();
      toast(`${added} benchmark${added === 1 ? '' : 's'} added${reordered ? ` · ${reordered} put in order (25th ≤ median ≤ 75th, by value)` : ''}${bad.length ? ` · line${bad.length === 1 ? '' : 's'} ${bad.join(', ')} not understood` : ''}.`, bad.length ? 'err' : 'ok');
    } }]);
}
function paneStModels() {
  const L = ST.draft.models, add = `<button class="btn btn-primary btn-sm" onclick="editItem('models',-1)">Add a business model</button>`;
  return `<p class="pg-desc">The setup page offers B2B SaaS, AI application, marketplace and fintech. Add another — hardware, consumer subscription, biotech — and it appears there for everyone. Your inputs and metrics can then be limited to it (the “Business models” boxes in their editors). Built-in metrics that apply to every model still apply.</p>
    ${L.length ? `<div style="margin-bottom:10px">${add}</div><div class="tbl-wrap"><table class="ledger"><thead><tr><th>Model</th><th>Description</th><th>Name in conditions</th><th></th></tr></thead><tbody>
      ${L.map((m, i) => `<tr><td>${esc(m.emoji)} ${esc(m.name)}</td><td style="color:var(--t2)">${esc(m.desc)}</td><td class="m">model == '${esc(m.id)}'</td>${rowActions('models', i)}</tr>`).join('')}</tbody></table></div>` : stEmpty('business models of your own', add)}`;
}
function editModel(m, i) {
  openModal(i >= 0 ? 'Edit business model' : 'Add a business model', `
    ${edRow('Name', `<input class="form-inp" id="ed-name" value="${esc(m.name || '')}" placeholder="e.g. Hardware">`)}
    ${edRow('Short description', `<input class="form-inp" id="ed-desc" value="${esc(m.desc || '')}" placeholder="e.g. Devices with recurring software">`)}
    ${edRow('Icon (one emoji)', `<input class="form-inp" id="ed-emoji" value="${esc(m.emoji || '🧩')}" maxlength="4" style="max-width:90px">`)}`,
    [{ label:'Save business model', primary:true, onClick:() => {
      const name = val('ed-name').trim(); if (!name) { toast('Give the model a name.', 'err'); return; }
      let id = m.id;
      if (!id) { const base = 'x_' + (slug(name).replace(/^[^a-z]+/, '') || 'model').slice(0, 30); id = base; let k = 2; while (BASE.models.some(x => x.id === id) || ST.draft.models.some(x => x.id === id)) id = base + '_' + k++; }
      commitItem('models', i, { id, name, desc:val('ed-desc').trim(), emoji:val('ed-emoji').trim() || '🧩' });
    } }]);
}
