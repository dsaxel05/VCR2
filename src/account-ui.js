/* ── ACCOUNTS: the sidebar button and the sign-in dialog (Part B, section 11) ──
   Text goes into the page only through esc(); every network call goes through src/account.js. */
let _acctKeep = true, _acctRegionPick = '', _acctEmail = '', _acctMode = 'signin';
function acctRenderButton() {
  const box = $id('sb-acct'), btn = $id('sb-acct-btn'); if (!box || !btn) return;
  const s = acctSession();
  box.hidden = !s && !acctAvailable();
  btn.textContent = s ? (s.user.email || 'Your account') : 'Sign in';
  btn.setAttribute('aria-label', s ? 'Your account, signed in as ' + (s.user.email || 'unknown email') : 'Sign in (optional)');
}
function acctOpen() { const s = acctSession(); if (s) acctMenu(s); else acctDialog(); }
/* Brand marks for the sign-in buttons: Google and Microsoft in their own colours, the others as a lettered tile in theirs. */
const ACCT_MARKS = {
  google:'<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>',
  microsoft:'<svg viewBox="0 0 21 21" aria-hidden="true" focusable="false"><rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/><rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/></svg>'
};
const ACCT_TILES = { apple:['#000000', 'A'], yahoo:['#6001D2', 'Y!'], github:['#24292F', 'GH'], linkedin:['#0A66C2', 'in'], x:['#000000', 'X'], facebook:['#1877F2', 'f'] };
function acctMark(id) {
  if (ACCT_MARKS[id]) return ACCT_MARKS[id];
  const [bg, l] = ACCT_TILES[id] || ['#5B6475', String(id || '?').slice(0, 1).toUpperCase()];
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect width="24" height="24" rx="5" fill="${bg}"/><text x="12" y="16.5" text-anchor="middle" font-size="${l.length > 1 ? 10 : 13}" font-weight="700" font-family="Arial, sans-serif" fill="#FFFFFF">${esc(l)}</text></svg>`;
}
const ACCT_EYE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><line class="acct-slash" x1="3" y1="3" x2="21" y2="21"/></svg>';
const ACCT_LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
/* The rules the backend enforces for a new password (ACCT_MSG.weak_password), shown before typing and ticked while typing. */
const ACCT_PW_RULES = [['len', 'At least 10 characters', v => v.length >= 10], ['case', 'Upper-case and lower-case letters', v => /[a-z]/.test(v) && /[A-Z]/.test(v)], ['digit', 'At least one digit', v => /\d/.test(v)]];
/* A first-time visitor gets the storage region nearest to their time zone; any earlier choice wins. */
function acctDefaultRegion() {
  const regs = acctRegions(); if (!regs.length) return '';
  const cur = acctRegion(_acctRegionPick); if (cur) return cur.id;
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  const want = /^America\//.test(tz) ? 'us' : /^(Europe|Africa)\//.test(tz) ? 'eu' : '';
  return (regs.find(r => r.id === want) || regs[0]).id;
}
function acctDialog(msg) {
  const regs = acctRegions(), ps = acctProviders();
  _acctRegionPick = acctDefaultRegion();
  const reg = acctRegion(_acctRegionPick), up = _acctMode === 'signup';
  const oauth = ps.filter(p => p.kind === 'oauth');
  const has = k => ps.some(p => p.kind === k), pass = has('password'), link = has('email_link');
  const top = oauth.slice(0, 4), rest = oauth.slice(4);
  const pbtn = p => `<button type="button" class="acct-prov" data-click="acctPick" data-a="${esc(p.id)}"><span class="acct-mark">${acctMark(p.id)}</span><span>Continue with ${esc(p.label)}</span></button>`;
  const lead = up ? 'Create a free account to save your analyses and reopen them on any device.' : 'Welcome back. Sign in to reopen your saved analyses on any device.';
  const pwField = pass ? `<div class="acct-field"><div class="acct-label-row"><label for="acct-pass">Password</label>${!up && link ? '<button type="button" class="acct-link" data-click="acctLinkGo">Forgot password?</button>' : ''}</div>
      <div class="acct-pw"><input type="password" class="form-inp" id="acct-pass" autocomplete="${up ? 'new-password' : 'current-password'}" maxlength="200" data-keydown="acctEnter"${up ? ' data-input="acctPwCheck" aria-describedby="acct-rules"' : ''}>
      <button type="button" class="acct-eye" data-click="acctEye" aria-label="Show password" aria-pressed="false" title="Show password">${ACCT_EYE}</button></div>
      ${up ? `<ul class="acct-rules" id="acct-rules">${ACCT_PW_RULES.map(([k, l]) => `<li data-rule="${k}">${esc(l)}</li>`).join('')}</ul>` : ''}</div>` : '';
  const emailForm = pass || link ? `<div class="acct-field"><label for="acct-email">Email</label>
      <input type="email" class="form-inp" id="acct-email" autocomplete="email" maxlength="254" inputmode="email" placeholder="you@example.com" value="${esc(_acctEmail)}" data-keydown="acctEnter"></div>
    ${pwField}
    ${pass ? (up ? '<button type="button" class="btn btn-primary acct-go" data-click="acctSignUpGo">Create account</button>' : '<button type="button" class="btn btn-primary acct-go" data-click="acctPassGo">Sign in</button>')
      : '<button type="button" class="btn btn-primary acct-go" data-click="acctLinkGo">Email me a sign-in link</button>'}
    ${pass && link ? `<button type="button" class="acct-link acct-alt" data-click="acctLinkGo">${up ? 'Rather not choose a password? Email me a sign-in link' : 'Sign in without a password: email me a link'}</button>` : ''}` : '';
  const body = `<div class="acct-box">
    <p class="acct-lead">${lead}</p>
    ${msg ? `<p class="acct-msg" role="alert">${esc(msg)}</p>` : ''}
    ${top.length ? `<div class="acct-provs">${top.map(pbtn).join('')}</div>` : ''}
    ${rest.length ? `<details class="acct-more"><summary>More ways to continue</summary><div class="acct-provs">${rest.map(pbtn).join('')}</div></details>` : ''}
    ${oauth.length && emailForm ? '<div class="acct-or" role="separator"><span>or with your email</span></div>' : ''}
    ${emailForm}
    ${pass ? `<p class="acct-switch">${up ? 'Already have an account? <button type="button" class="acct-link" data-click="acctMode" data-a="signin">Sign in</button>' : 'New to VCR2? <button type="button" class="acct-link" data-click="acctMode" data-a="signup">Create a free account</button>'}</p>` : ''}
    <div class="acct-opts">
      <label class="acct-keep"><input type="checkbox" id="acct-keep" data-change="acctKeepOn"${_acctKeep ? ' checked' : ''}> Keep me signed in on this device</label>
      ${regs.length > 1 ? `<label class="acct-where">Account stored in <select id="acct-region" class="form-inp acct-sel" data-change="acctRegionPick">${regs.map(r => `<option value="${esc(r.id)}"${reg && reg.id === r.id ? ' selected' : ''}>${esc(r.label || r.id)}</option>`).join('')}</select></label>` : ''}
    </div>
    <div class="acct-trust"><span class="acct-lock">${ACCT_LOCK}</span><p>${esc((CFG.settings.accounts && CFG.settings.accounts.notice) || ACCT_NOTE)} Free, with no ads and no tracking. <a href="#terms" data-click="acctTermsPage">Terms and privacy</a>${up ? '. Creating an account means you accept them' : ''}.</p></div>
    <p class="acct-guest"><button type="button" class="acct-link" data-click="closeModal">Not now, continue as a guest</button></p>
  </div>`;
  openModal(up ? 'Create your VCR2 account' : 'Sign in to VCR2', body, []);
  const m = document.querySelector('#modal-wrap .modal'); if (m) m.classList.add('modal-auth');
  const f = $id(_acctEmail ? 'acct-pass' : 'acct-email') || $id('acct-email'); if (f && !msg) f.focus();
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
const acctKeepOn = on => { _acctKeep = !!on; };
function acctMode(m) { const e = $id('acct-email'); if (e) _acctEmail = e.value.trim(); _acctMode = m === 'signup' ? 'signup' : 'signin'; acctDialog(); }
function acctEye(el) {
  const i = $id('acct-pass'); if (!i) return;
  const show = i.type === 'password'; i.type = show ? 'text' : 'password';
  const l = show ? 'Hide password' : 'Show password'; el.setAttribute('aria-pressed', String(show)); el.setAttribute('aria-label', l); el.title = l; i.focus();
}
function acctPwCheck(v) { ACCT_PW_RULES.forEach(([k, , ok]) => { const li = document.querySelector('#acct-rules [data-rule="' + k + '"]'); if (li) li.classList.toggle('ok', ok(String(v))); }); }
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
