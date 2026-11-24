/* ═══════════════════════════════════════════════════════════════
   DEAL FLOW BOOT — one listener per event type; names are looked up in FLOW_CALLS only (never on window).
   data-click / data-change / data-input = name, arguments in data-a, data-b, data-c (a value starting with # is JSON);
   on change and input the field's value (checked, for a checkbox) comes last.
   ═══════════════════════════════════════════════════════════════ */
const FLOW_CALLS = {
  flView, flOpen, flCloseDrawer, flFilter, flPickWs, flCreateWs, flPullInbox, flSyncSheet:() => flSyncSheet(false), flRecheckAll, flExportAll, flExportOne, flDelete, flOpenAnalysis,
  flSet, flScore, flAiSuggest, flAiConfirm, flAddNote, flAddEvidence, flForceAnalysis, flMemo, flImport,
  flSetTab, flSaveSettings, flDiscard, flD, flDStr, flDNum, flDLines, flDList, flDMusts, flDProvider, flCardTemplate, flPipePreset, flPillar, flPillarAdd, flPillarDel, flTiers, flMap,
  flGoogle, flPickFolder, flMakeFolder, flPickSheet, flReadSheet, flPickTemplate, flMemoTplClear, flRegisterIntake, flCopy, flInvite, flRemoveMember, flRemoveInvite, flDeleteWs,
  closeModal,
};
const flArgs = el => ['a', 'b', 'c'].map(k => el.dataset[k]).filter(v => v !== undefined).map(v => v[0] === '#' ? JSON.parse(v.slice(1)) : v);
function flDispatch(attr, e, withValue) {
  const el = e.target.closest('[data-' + attr + ']'); if (!el) return;
  const fn = FLOW_CALLS[el.dataset[attr]]; if (!fn) return;
  if (attr === 'click' && el.tagName === 'A') e.preventDefault();
  const args = flArgs(el); if (withValue) args.push(el.type === 'checkbox' ? el.checked : el.value);
  try { const r = fn.apply(null, args); if (r && r.catch) r.catch(err => toast(String(err && err.message || err).slice(0, 200), 'err', 7000)); }
  catch (err) { toast(String(err && err.message || err).slice(0, 200), 'err', 7000); }
}
document.addEventListener('click', e => flDispatch('click', e, false));
document.addEventListener('change', e => flDispatch('change', e, true));
let _flIn = null; document.addEventListener('input', e => { clearTimeout(_flIn); _flIn = setTimeout(() => flDispatch('input', e, true), 250); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && FS.sel) flCloseDrawer(); });

async function flBoot() {
  try { await loadPublishedConfig().catch(() => false); } catch (e) {}
  try { await loadMarketData().catch(() => false); } catch (e) {}
  try { if (typeof acctBoot === 'function') acctBoot(); } catch (e) {}
  FS.store = wssFor();
  if (FS.store.mode === 'cloud') { try { const n = await FS.store.acceptInvites(); if (n) toast(`You joined ${n} workspace${n === 1 ? '' : 's'}.`); } catch (e) {} }
  try { FS.list = await FS.store.workspaces(); }
  catch (e) { toast('Your workspaces could not be loaded: ' + String(e.message || e.code).slice(0, 120) + '. Using this browser only.', 'err', 8000); FS.store = WSS_LOCAL; FS.list = await FS.store.workspaces().catch(() => []); }
  let last = null; try { last = localStorage.getItem('vcr2-ws-last'); } catch (e) {}
  FS.cur = FS.list.find(x => x.id === last) || FS.list[0] || null;
  if (FS.cur) FS.role = FS.cur.role;
  await flLoadDeals().catch(() => { FS.deals = []; });
  const h = (location.hash || '').slice(1); if (['dash', 'triage', 'add', 'calib', 'lp', 'settings', 'help'].includes(h)) FS.view = h;
  flRender();
}
if (typeof document !== 'undefined' && document.getElementById('fl-view')) flBoot();
