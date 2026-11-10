/* ── ACCOUNTS: the sidebar button and the sign-in dialog (Part B, section 11) ──
   Text goes into the page only through esc(); every network call goes through src/account.js. */
let _acctKeep = true, _acctRegionPick = '', _acctEmail = '';
function acctRenderButton() {
  const box = $id('sb-acct'), btn = $id('sb-acct-btn'); if (!box || !btn) return;
  const s = acctSession();
  box.hidden = !s && !acctAvailable();
  btn.textContent = s ? (s.user.email || 'Your account') : 'Sign in';
  btn.setAttribute('aria-label', s ? 'Your account, signed in as ' + (s.user.email || 'unknown email') : 'Sign in (optional)');
}
function acctOpen() { const s = acctSession(); if (s) acctMenu(s); else acctDialog(); }
function acctDialog(msg) {
  const regs = acctRegions(), ps = acctProviders(), cur = acctRegion(_acctRegionPick);
  const btn = p => `<button type="button" class="btn btn-ghost acct-prov" data-click="acctPick" data-a="${esc(p.id)}">${esc(p.label)}</button>`;
  const oauth = ps.filter(p => p.kind === 'oauth'), main = oauth.filter(p => p.group === 'main'), more = oauth.filter(p => p.group !== 'main');
  const has = k => ps.some(p => p.kind === k), email = has('email_link') || has('password');
  const body = `${msg ? `<p class="acct-msg" role="alert">${esc(msg)}</p>` : ''}
    <p class="acct-note">${esc((CFG.settings.accounts && CFG.settings.accounts.notice) || ACCT_NOTE)}</p>
    ${regs.length > 1 ? `<fieldset class="acct-region"><legend>Where your account is stored</legend>${regs.map(r => `<label><input type="radio" name="acct-region" value="${esc(r.id)}" data-change="acctRegionPick"${cur && cur.id === r.id ? ' checked' : ''}> ${esc(r.label || r.id)}</label>`).join(' ')}</fieldset>` : ''}
    ${main.length ? `<div class="acct-grid">${main.map(btn).join('')}</div>` : ''}
    ${more.length || email ? `<details class="acct-more"${main.length ? '' : ' open'}><summary>More options</summary>
      ${more.length ? `<div class="acct-grid">${more.map(btn).join('')}</div>` : ''}
      ${email ? `<label class="acct-field">Email <input type="email" id="acct-email" autocomplete="email" maxlength="254" value="${esc(_acctEmail)}"></label>` : ''}
      ${has('email_link') ? `<button type="button" class="btn btn-ghost" data-click="acctLinkGo">Email me a sign-in link</button>` : ''}
      ${has('password') ? `<label class="acct-field">Password <input type="password" id="acct-pass" autocomplete="current-password" maxlength="200"></label>
        <button type="button" class="btn btn-ghost" data-click="acctPassGo">Sign in with password</button>
        <button type="button" class="btn btn-ghost" data-click="acctSignUpGo">Create an account</button>` : ''}
    </details>` : ''}
    <label class="acct-keep"><input type="checkbox" id="acct-nokeep" data-change="acctKeepPick"${_acctKeep ? '' : ' checked'}> Don't keep me signed in (shared computer)</label>
    <p class="field-hint"><a href="#terms" data-click="acctTermsPage">Terms and privacy</a>: no analytics, no tracking, nothing shared.</p>`;
  openModal('Sign in', body, [{ label:'Continue as guest', onClick:closeModal }]);
}
function acctMenu(s) {
  const st = acctStatusText();
  openModal('Your account', `<p>Signed in as <strong>${esc(s.user.email || 'unknown email')}</strong>${s.keep ? '' : ' (this tab only)'}.</p>${st ? `<p>Open analysis: ${esc(st)}.</p>` : ''}`,
    [{ label:'My analyses', primary:true, onClick:acctGoMine }, { label:'Save a version', onClick:() => { closeModal(); acctSaveVersionGo(); } },
     { label:vaultLocked() ? 'Unlock Vault' : 'Vault mode', onClick:acctVaultGo }, { label:'Download my data', onClick:acctDataGo },
     { label:'Remove this analysis from this device', onClick:acctForgetGo }, { label:'Terms and privacy', onClick:acctTermsPage },
     { label:'Delete my account', onClick:acctDeleteAsk }, { label:'Sign out', onClick:acctSignOutGo }]);
}
const acctRegionPick = v => { _acctRegionPick = String(v); };
const acctKeepPick = noKeep => { _acctKeep = !noKeep; };
const acctVal = id => { const el = $id(id); return el ? el.value : ''; };
const acctFail = e => acctDialog(acctMessage(e && e.code));
async function acctPick(id) {
  try { const p = acctProvider(id); if (p) toast('Opening ' + p.label + '…'); await acctStartOAuth(id, _acctRegionPick, _acctKeep); } catch (e) { acctFail(e); }
}
async function acctLinkGo() {
  _acctEmail = acctVal('acct-email').trim();
  try { await acctEmailLink(_acctEmail, _acctRegionPick, _acctKeep); closeModal(); toast('We sent a sign-in link to ' + _acctEmail + '. Open it in this browser.', 'ok', 10000); } catch (e) { acctFail(e); }
}
async function acctPassGo() {
  _acctEmail = acctVal('acct-email').trim();
  try { const r = await acctPasswordSignIn(_acctEmail, acctVal('acct-pass'), _acctRegionPick, _acctKeep); closeModal(); acctRenderButton(); toast('Signed in as ' + r.session.user.email + '.'); acctSignedIn(); } catch (e) { acctFail(e); }
}
async function acctSignUpGo() {
  _acctEmail = acctVal('acct-email').trim();
  try {
    const r = await acctSignUp(_acctEmail, acctVal('acct-pass'), _acctRegionPick, _acctKeep);
    closeModal(); acctRenderButton(); if (r.session) acctSignedIn();
    toast(r.confirm ? 'Almost done: open the link we sent to ' + _acctEmail + ' to confirm your email.' : 'Account created.', 'ok', 10000);
  } catch (e) { acctFail(e); }
}
async function acctSignOutGo() { closeModal(); clearTimeout(_acctTimer); await acctSignOut(); acctRenderButton(); acctShowStatus(); toast('Signed out. Your work stays on this device.'); }
/* Start-up: a guest gets no request. Only a sign-in coming back, or a saved session, does anything. */
async function acctStartUp() {
  const back = acctBoot();
  acctRenderButton();
  if (!back) { if (acctSession()) acctSignedIn(); return; }
  const r = await acctHandleReturn();
  acctRenderButton();
  if (!r) return;
  if (r.session) { toast('Signed in as ' + (r.session.user.email || 'your account') + '.'); acctSignedIn(); }
  else acctDialog(acctMessage(r.error));
}
/* After any sign-in: the account copy is checked and the comparables and preferences merged; sync resumes when back online. */
let _acctOnline = false;
function acctSignedIn() {
  if (!_acctOnline && typeof addEventListener === 'function') { _acctOnline = true; addEventListener('online', () => { if (acctSession()) acctPush().catch(() => {}); }); }
  acctAfterSignIn().then(acctShowStatus, () => {});
}
/* A comparables change goes to the account after a pause. */
let _acctLibT = 0;
function acctLibChanged() { if (!acctSession()) return; clearTimeout(_acctLibT); _acctLibT = setTimeout(() => acctSyncProfile().catch(() => {}), 4000); }
