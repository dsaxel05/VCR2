// Shared by the accounts suites: a "device" is a sandbox running the account modules with its own storage, signed in as a test user
// on the LOCAL stack. The app around them (draft state, save, restore) is a small stand-in with the same contract as src/core.js.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { call } from './_sb.mjs';

const SRC = ['account.js', 'account-sync.js', 'account-vault.js'].map(f => readFileSync(new URL('../../src/' + f, import.meta.url), 'utf8')).join('\n');
const APP = String.raw`
let S = blankState();
function blankState() { return { name:'', stage:'seed', model:'saas', vals:{}, bools:{}, sel:{}, prov:{}, evid:{}, assume:{}, notes:'', checklist:{}, ledger:null, series:null, result:null, example:false }; }
function draftPayload() { return { v:4, name:S.name, stage:S.stage, model:S.model, vals:S.vals, bools:S.bools, sel:S.sel, prov:S.prov, evid:S.evid, assume:S.assume, notes:S.notes, checklist:S.checklist,
  ledger:S.ledger ? { csv:'customer,month,mrr\nSecretCustomerCo,2026-01,100' } : null, ledgerStats:S.ledgerStats }; }
function restorePayload(d) { d = JSON.parse(JSON.stringify(d || {})); S = Object.assign(blankState(), { name:d.name || '', stage:d.stage || 'seed', model:d.model || 'saas', vals:d.vals || {}, bools:d.bools || {}, sel:d.sel || {}, prov:d.prov || {}, notes:d.notes || '', ledgerStats:d.ledgerStats }); }
let SAVES = 0; function saveDraft() { SAVES++; localStorage.setItem('vcr3-draft', JSON.stringify(draftPayload())); acctDirty(); }
function ledgerAnalytics() { return { months:[1, 2, 3], customersNow:2, arrNow:1200, top1:60.123, top5:100, top10:100, nrrCohort:110, grrCohort:95, logoRet:90, cmgr12:5 }; }
const sWord = v => v >= 70 ? ['strong', 'Strong'] : ['mixed', 'Mixed'];
let LIB = []; const libLoad = () => LIB.slice(); const libSave = l => { LIB = l; return true; }; const libClean = e => e;
const ALL_FIELDS = () => [{ id:'arr_now', lbl:'ARR today' }, { id:'nrr', lbl:'Net revenue retention' }];
let THEME = null; const setThemePref = t => { THEME = t; };
let ASKED = [], ANSWER = 'mine'; const acctAsk = async c => { ASKED.push(c.kind); return ANSWER; };
let TERMS = true, MIGRATE = null; const acctAskTerms = async () => TERMS; const acctAskMigrate = async list => { MIGRATE = list; };
function parseLedger(csv) { return { ok:true, ledger:{ id:'parsed' } }; }
`;
export function device(env, user, label) {
  const mem = (m = new Map()) => ({ getItem:k => m.has(k) ? m.get(k) : null, setItem:(k, v) => m.set(k, String(v)), removeItem:k => m.delete(k) });
  const net = { calls:0, failNext:0, dropAnswer:0, online:true };
  const ctx = { localStorage:mem(), sessionStorage:mem(), location:{ href:'http://127.0.0.1:8765/', origin:'http://127.0.0.1:8765', pathname:'/', assign(){} }, history:{ replaceState(){} },
    navigator:{ get onLine() { return net.online; } }, setTimeout, clearTimeout, crypto:globalThis.crypto, TextEncoder, TextDecoder, URL, URLSearchParams, btoa, atob, console, Date, JSON,
    CFG:{ settings:{ accounts:{ providers:{ email_password:{ enabled:true } } } } },
    fetch:async (u, o) => {
      net.calls++;
      if (net.failNext > 0) { net.failNext--; throw new TypeError('Failed to fetch'); }   /* never sent */
      const r = await fetch(u, o);
      if (net.dropAnswer > 0) { net.dropAnswer--; throw new TypeError('Failed to fetch'); }   /* sent and done, answer lost */
      return r;
    } };
  vm.createContext(ctx);
  vm.runInContext(APP + SRC, ctx);
  vm.runInContext(`ACCT_REGIONS = ${JSON.stringify([{ id:'eu', url:env.url, anonKey:env.anon }])}; acctDelay = 1e9; _acctTermsOk = true;`, ctx);
  const d = { label, ctx, net, run:code => vm.runInContext(code, ctx), user };
  d.signIn = async () => {
    const s = await call(env, '/auth/v1/token?grant_type=password', { method:'POST', body:{ email:user.email, password:user.password } });
    ctx.localStorage.setItem('vcr2-acct-session', JSON.stringify({ region:'eu', keep:true, access_token:s.body.access_token, refresh_token:s.body.refresh_token, expires_at:s.body.expires_at, user:{ id:s.body.user.id, email:user.email } }));
    d.run('acctBoot()');
  };
  d.edit = async (code, push = true) => { d.run(code + '; saveDraft();'); if (push) return d.run('acctPush()'); };
  d.meta = () => d.run('acctMeta()');
  d.status = () => d.run('acctStatusText()');
  return d;
}
