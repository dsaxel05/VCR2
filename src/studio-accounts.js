/* ═══════════════════════════════════════════════════════════════
   STUDIO: ACCOUNTS (Part B, section 11). Which sign-in methods are offered and in what order, the sentence shown in the
   sign-in dialog, the free-user limits and an aggregate usage summary (counts only, never content). Stored in
   settings.accounts and resettable. The limits are enforced by the database, so the Studio writes the SQL to paste in
   the Supabase SQL editor. Project addresses and public keys are not here: they are in site.json (then python build.py).
   ═══════════════════════════════════════════════════════════════ */
const stAcct = () => { const s = ST.draft.settings; return s.accounts = s.accounts || {}; };
let _stLim = { max_analyses:100, max_mb:5, max_versions:20 }, _stUse = '';
function paneStAccounts() {
  const a = stAcct(), list = acctProviders(true, a), regs = acctRegions();
  const sql = `update public.app_limits set max_analyses = ${_stLim.max_analyses}, max_bytes = ${Math.round(_stLim.max_mb * 1048576)}, max_versions = ${_stLim.max_versions} where id;`;
  return `<p class="pg-desc">Accounts are optional for visitors. Nothing here changes guest mode.</p>
    <div class="st-card"><h3>Backend</h3><p>${regs.length ? 'Projects in this build: ' + regs.map(r => esc(r.label || r.id) + ' (' + esc(r.url) + ')').join(', ') + '.'
      : 'No project in this build, so the Sign in button is hidden. Add the project address and public key to site.json, then run python build.py (docs/accounts/SETUP-supabase.md).'}</p></div>
    <div class="st-card"><h3>Sign-in methods</h3><p class="field-hint">Switch on a method only after its developer app is set up (docs/accounts/SETUP-&lt;provider&gt;.md). Shown in this order; Google, Microsoft and Apple first, the rest under “More options”.</p>
      <table class="tbl"><tbody>${list.map((p, i) => `<tr><th scope="row">${esc(p.label)}</th>
        <td><label><input type="checkbox" data-change="stAcctOn" data-a="${esc(p.id)}"${p.enabled ? ' checked' : ''}${p.unavailable ? ' disabled' : ''}> On</label>${p.unavailable ? ' <span class="field-hint">' + esc(p.unavailable) + '</span>' : ''}</td>
        <td><button class="btn btn-ghost btn-sm" data-click="stAcctMove" data-a="${esc(p.id)}" data-b="#-1"${i ? '' : ' disabled'} aria-label="Move ${esc(p.label)} up">Up</button>
        <button class="btn btn-ghost btn-sm" data-click="stAcctMove" data-a="${esc(p.id)}" data-b="#1"${i < list.length - 1 ? '' : ' disabled'} aria-label="Move ${esc(p.label)} down">Down</button></td></tr>`).join('')}</tbody></table></div>
    <div class="st-card"><h3>Sentence in the sign-in dialog</h3>
      <textarea class="intake-ta" maxlength="600" aria-label="Sentence in the sign-in dialog" data-input="stAcctNotice">${esc(a.notice || ACCT_NOTE)}</textarea></div>
    <div class="st-card"><h3>Free-user limits</h3><p class="field-hint">Applied by the database to every account. Change the numbers, copy the line, paste it in Supabase: SQL editor, Run (once per project).</p>
      <div class="mine-tools">${[['max_analyses', 'Analyses per user'], ['max_mb', 'Megabytes per user'], ['max_versions', 'Versions kept per analysis']].map(([k, l]) => `<label>${l} <input class="form-inp" inputmode="decimal" value="${_stLim[k]}" data-change="stAcctLim" data-a="${k}"></label>`).join('')}</div>
      <p><code id="st-acct-sql">${esc(sql)}</code></p><button class="btn btn-ghost btn-sm" data-click="stAcctCopy">Copy the line</button></div>
    <div class="st-card"><h3>Usage</h3><p class="field-hint">Counts only, never content. Needs you signed in with an account listed in the app_admins table (SETUP-supabase.md).</p>
      <button class="btn btn-ghost btn-sm" data-click="stAcctUsage">Load the usage summary</button> <span role="status">${esc(_stUse)}</span></div>
    <button class="btn btn-ghost btn-sm" data-click="stAcctReset">Reset accounts settings to the defaults</button>`;
}
function stAcctOn(id, on) { const p = (stAcct().providers = stAcct().providers || {}); p[id] = Object.assign({}, p[id], { enabled:!!on }); saveStudioDraft(); renderStudioPane(); }
function stAcctMove(id, dir) {
  const a = stAcct(), list = acctProviders(true, a).map(p => p.id), i = list.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  a.providers = a.providers || {};
  list.forEach((k, n) => { a.providers[k] = Object.assign({}, a.providers[k], { order:n }); });
  saveStudioDraft(); renderStudioPane();
}
function stAcctNotice(v) { const t = String(v).slice(0, 600); if (t.trim() && t !== ACCT_NOTE) stAcct().notice = t; else delete stAcct().notice; saveStudioDraft(); }
function stAcctLim(k, v) { const n = +v; if (isFinite(n) && n > 0) _stLim[k] = Math.min(k === 'max_mb' ? 10240 : 100000, k === 'max_mb' ? Math.round(n * 10) / 10 : Math.round(n)); renderStudioPane(); }
function stAcctCopy() { const c = $id('st-acct-sql'); if (c) copyText(c.textContent, 'Copied. Paste it in Supabase, SQL editor, then Run.'); }
async function stAcctUsage() {
  if (!acctSession()) { _stUse = 'Sign in first (sidebar), with an account listed in app_admins.'; return renderStudioPane(); }
  try { const u = await acctRest('rpc/usage_summary', { method:'POST', body:{} }); _stUse = `${u.accounts} accounts, ${u.analyses} analyses, ${(u.bytes / 1048576).toFixed(1)} MB.`; }
  catch (e) { _stUse = /not_allowed/.test(JSON.stringify(e.detail || '')) ? 'This account is not listed in app_admins.' : 'Could not load the summary.'; }
  renderStudioPane();
}
function stAcctReset() { delete ST.draft.settings.accounts; saveStudioDraft(); renderStudioPane(); }
