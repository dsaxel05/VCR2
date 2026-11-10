// Accounts settings (Part B, B5): settings.accounts cleaned on load, never part of the score, and the Studio section.
//   node tests/accounts-config.test.mjs
import { runSuite } from './_harness.mjs';

runSuite('Accounts settings and Studio section', String.raw`
{
const n = c => normalizeConfig(c);
const base = rubricVersion(), co = () => ({ name:'Acme', stage:'a', model:'saas', vals:{ arr_now:'5000000', arr_12mo:'2500000', net_burn:'300000', cash_on_hand:'6000000', gross_margin:'72' } });
const h0 = Radar.assess(co()).hash;
const good = n({ settings:{ accounts:{ providers:{ google:{ enabled:true, order:2 }, x:{ enabled:true, gotrue:'x', scopes:'users.read' } }, notice:'Signing in is optional.', extra:[{ id:'okta', label:'Okta', gotrue:'custom:okta' }] } } }).settings.accounts;
eq('valid settings are kept', [good.providers.google.enabled, good.providers.google.order, good.providers.x.gotrue, good.notice, good.extra[0].gotrue], [true, 2, 'x', 'Signing in is optional.', 'custom:okta']);
const bad = n({ settings:{ accounts:{ providers:{ '__proto__':{ enabled:true }, 'bad id!':{ enabled:true }, google:{ enabled:'yes', order:'x', gotrue:'javascript:alert(1)', scopes:'<script>' } },
  notice:'x'.repeat(900), extra:[{ id:'evil', gotrue:'https://evil.example' }, { id:'ok_one', gotrue:'custom:ok' }], url:'https://evil.example', anonKey:'k' } } }).settings.accounts || {};
ok('hostile values are dropped: odd ids, non-boolean switches, backend names, scopes', !bad.providers || (!('bad id!' in bad.providers) && !Object.prototype.hasOwnProperty.call(bad.providers, '__proto__') && !bad.providers.google), bad.providers);
ok('no project address or key can come from the published configuration', !('url' in bad) && !('anonKey' in bad));
ok('the notice is capped at 600 characters; an extra provider must be a custom: one', bad.notice.length === 600 && bad.extra.length === 1 && bad.extra[0].id === 'ok_one');
applyConfig({ settings:{ accounts:{ providers:{ google:{ enabled:true } } } } });
eq('accounts settings never change the rubric version', rubricVersion(), base);
eq('nor the run ID of an assessment', Radar.assess(co()).hash, h0);
eq('with no project in this build, sign-in stays hidden even with a provider switched on', acctAvailable(), false);
ok('the published page holds no project address', acctRegions().length === 0);

/* the Studio section */
saveStudioDraft = () => {}; renderStudioPane = () => {};
ST.draft = { settings:{} };
const html = paneStAccounts();
ok('the Studio section lists every sign-in method, Passkey disabled with its reason', ['Google', 'Microsoft', 'Apple', 'Yahoo', 'GitHub', 'LinkedIn', 'X', 'Facebook', 'Email link (no password)', 'Email and password', 'Passkey'].every(l => html.includes('>' + l + '<')) && /experimental/.test(html));
ok('it says the build has no project and where to add one', /No project in this build/.test(html) && /site\.json/.test(html));
stAcctOn('github', true);
eq('switching a method on writes settings.accounts', ST.draft.settings.accounts.providers.github.enabled, true);
stAcctMove('github', -1); stAcctMove('github', -1);
const order = acctProviders(true, ST.draft.settings.accounts).map(p => p.id);
eq('Up moves it up (GitHub now third)', order.slice(0, 4), ['google', 'microsoft', 'github', 'apple']);
stAcctNotice('Our own sentence.');
eq('the dialog sentence is kept', ST.draft.settings.accounts.notice, 'Our own sentence.');
stAcctNotice(ACCT_NOTE);
eq('typing back the default sentence removes the override', 'notice' in ST.draft.settings.accounts, false);
stAcctLim('max_analyses', '250'); stAcctLim('max_mb', '12.5'); stAcctLim('max_versions', 'abc');
ok('the limits become the SQL line to paste (bad input ignored)', paneStAccounts().includes('update public.app_limits set max_analyses = 250, max_bytes = 13107200, max_versions = 20 where id;'));
stAcctReset();
eq('reset removes every accounts setting', 'accounts' in ST.draft.settings, false);
const back = n({ settings:{ accounts:{ providers:{ github:{ enabled:true, order:1 } }, notice:'Hi' } } }).settings.accounts;
eq('what the Studio writes survives the published round trip', [back.providers.github.enabled, back.providers.github.order, back.notice], [true, 1, 'Hi']);
}
`);
