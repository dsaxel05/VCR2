/* ── EVENT DELEGATION: the page has no inline handlers (the CSP forbids them) ──
   Markup says what should happen: data-click / data-change / data-input / data-keydown / data-toggle="name",
   with arguments in data-a, data-b, data-c (interpolated through esc(); a value starting with # is JSON: a number, true or false).
   One listener per event type looks the name up in two explicit lists, never by name on window:
   CALLS    name -> a function called with the data-* arguments, then the field's value (checked, for a checkbox) on change and input;
   ACTIONS  name -> a small function (element, event) for everything that needs more than that.
   A click on a link with an action never follows the link, as `return false` did. */
const CALLS = {
  showPage, toggleSidebar, setBool, setChecklist, libSetOutcome, libOpen, libDelete, goLibrary, goStudio, goSetup, goIntake, goVerify, startSections, runAnalysis, resetApp, continueDraft, watchDemo, importAssessment, loadDemo,
  sidebarToggle, cycleTextSize, cycleTheme, copyEmail, closeModal, downloadTemplate, runExtraction, selStage, selModel, jumpTo, setChip, prevSec, nextSec, clearSection,
  libSortBy, libImportCSV, libOpenAIPaste, libExport, libImportJSON, libRemoveSynthetic, loadSyntheticLibrary, libClear, copyChecklistRequest,
  printMemo, editData, goTab, founderEmail, saveRunToLibrary, exportAssessment, downloadReport, applyAssumptions, resetAssumptions,
  leaveStudio, setPreview, studioUndo, studioRedo, reviewPublish, openHistory, downloadDraft, importDraft, discardDraft, studioSignOut, startFromLive, keepDraftOverLive,
  studioTab, editItem, moveItem, deleteItem, toggleBuiltin, setLabel, setSetting, setSettingStr, setMinN, setNextStage, setStageWeight, resetStageWeights,
  setCorrMember, removeCorrGroup, filterStdRows, editStandard, sayStandard, setBrand, setLook, setLookColour, setLookView, insertRef, copyThresholdRow, pasteBenchmarks,
  setCatWeight, resetCat, setDefault, setProb, filterTrigRows, setTextReplacement, deleteTextReplacement, startTextEdit, addTextReplacement,
  setConst, setConstArray, resetAllConsts, resetConst, setStageName, setAiModel, setMeta, setMetaModels, filterDetailRows,
  resetEverything, advCheck, advApply, advReset, libSetFlag, libFlagShown, eraseAsk, eraseAll,
  sfRead, sfCancel, sfReview, sfUndoClick, sfForget, sfRemove, sfReadAs, sfTag, sfView, sfTickRow, sfOverwrite, sfAlso, sfEdit, sfAlt, sfRate, sfPickConflict, sfMove, sfAssign, sfAccept, sfCancelReview,
  acctGoMine, acctMineOpen, acctMineHistory, acctMineDup, acctMineRename, acctMineTags, acctMineArchive, acctMineDelete, acctMineUndo, acctMineExport, acctMineCompare,
  acctMineSearch, acctMineStage, acctMineSort, acctMineArch, acctMineTick, acctVerTick, acctVerRestore, acctSaveVersionGo, acctForgetGo, acctPrefsSave,
  stAcctOn, stAcctMove, stAcctNotice, stAcctLim, stAcctCopy, stAcctUsage, stAcctReset,
  acctTermsPage, acctOpen, acctPick, acctLinkGo, acctPassGo, acctSignUpGo, acctRegionPick, acctKeepPick,
  sfChecklist, sfAddRequests, sfStSwitch, sfStThreshold, sfStList, sfStRange, sfStResetField, sfStType, sfStWords, sfStLocale, sfStReset
};
const ACTIONS = {
setName: el => { S.name = el.value; saveDraft(); }, setAsof: el => { S.asof = el.value; saveDraft(); },
  ledgerPaste: () => loadLedgerText(document.getElementById('ledger-paste').value, 'pasted'),
  seriesPaste: () => loadSeriesText(document.getElementById('series-paste').value, 'pasted'),
  rmFile: el => { S.files.splice(+el.dataset.a, 1); renderFileList(); },
  fillLedger: () => { const n = applyLedgerToForm(); renderIntakeStatus(); toast(n + ' fields filled from the ledger.'); },
  rmLedger: () => { S.ledger = null; saveDraft(); renderIntakeStatus(); updateProgress(); },
  rmSeries: () => { S.series = null; saveDraft(); renderIntakeStatus(); updateProgress(); },
  clAll: el => { _clAll = el.checked; setHTML($id('rp-checklist'), paneChecklist()); },
  secSel: el => { jumpTo(+el.value); $id('tb-sections').focus(); },
  backReport: () => { renderResult(S.result); showPage('result'); }, intakeNav: () => { showPage('intake'); renderIntakeStatus(); },
  evidence: el => setEvidence(el.dataset.a, el.value, el), boolKey: (el, e) => boolKeydown(e, el.dataset.a),
  selChange: el => { const id = el.dataset.a; S.sel[id] = el.value; updateFieldCardState(id); liveDerive(); },
  fieldIn: el => { const id = el.dataset.a; if (el.dataset.b) numField(el); else S.vals[id] = el.value; updateFieldCardState(id); liveDerive(); saveDraft(); },
  moreOpen: el => { MORE_OPEN[el.dataset.a] = el.open; },
  applyLedger: () => { applyLedgerToForm(); renderSection(S.section); toast('Ledger figures applied to the form.'); },
  derivedAll: () => { derivedShowAll = !derivedShowAll; liveDerive(); }, backInputs: () => jumpTo(lastVisibleSection()),
  calib: el => { setCalibration(el.checked); renderLibrary(); toast(el.checked ? 'Thresholds now calibrate on your library.' : 'Back to the default rubric.'); },
  libFilter: el => { _libFilter = el.value; renderLibraryTable(); },
  rtab: el => rtab(el, el.dataset.a), rtabKey: (el, e) => rtabKey(e), toggleDetail: el => toggleDetail(el), cohortMode: el => cohortMode(el, el.dataset.a),
  openDeal: () => jumpTo(SECTIONS.findIndex(s => s.deal)),
  copyQuestions: () => copyText(S.result.questions.map((q, i) => (i + 1) + '. ' + q.text).join('\n'), 'Questions copied.'),
  filterLabels: el => { filterLabelRows(el.value); filterLabelRowsOpen(el.value); },
  addCorr: () => addCorrGroup($id('corr-new').value), corrReset: () => corrSave(JSON.parse(JSON.stringify(CORR_GROUPS))),
  formula: el => checkFormula(el.id, !!el.dataset.a, el.dataset.c, !!el.dataset.b), filterRef: el => filterRef(el, el.dataset.a),
  edType: el => {
    $id('ed-num-wrap').style.display = el.value === 'num' ? '' : 'none';
    $id('ed-opt-wrap').style.display = el.value === 'select' ? '' : 'none';
    $id('ed-score-wrap').style.display = el.value === 'select' ? '' : 'none';
  },
  catScore: el => setCatScore(el), boolPts: el => setBoolPts(el), trigger: el => setTrigger(el), tol: el => setTol(el),
  boolReset: () => { ST.draft.booleans = {}; saveStudioDraft(); renderStudioPane(); },
  defaultsReset: () => { if (confirm('Put every default back to the built-in value?')) { ST.draft.defaults = {}; saveStudioDraft(); renderStudioPane(); } },
  patReset: el => { delete ST.draft.patternParams[el.dataset.a]; saveStudioDraft(); renderStudioPane(); },
  tolReset: el => { delete ST.draft.checkTol[el.dataset.a]; saveStudioDraft(); renderStudioPane(); },
  textBackF: () => { stopTextEdit(); goStudio(); }, textLeaveF: () => stopTextEdit(),
  sfStSample: el => { _sfStSample = el.value; setHTML($id('sf-st-whatif'), sfStWhatIf()); }, sfStLabel: el => { _sfStLabel = el.value; setHTML($id('sf-st-tester'), sfStTester()); },
  sfStFilter: el => { _sfStFilter = el.value; const pos = el.selectionStart; renderStudioPane(); const n = document.querySelector('[data-input="sfStFilter"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } },
  editDerived: el => editDerived(el.dataset.k), resetDiffItem: el => resetDiffItem(el.dataset.area, el.dataset.key), loadVersion: el => loadVersion(el.dataset.sha)
};
/* click, change, input and keydown bubble: walk up from the target like an inline handler would, until one stops propagation.
   toggle does not bubble, so it is caught on the way down and read from its own target only. */
(() => {
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const run = (type, e, once) => {
    for (let el = e.target; el && el.nodeType === 1 && !e.cancelBubble; el = once ? null : el.parentElement) {
      const name = el.getAttribute('data-' + type);
      if (!name) continue;
      if (own(ACTIONS, name)) ACTIONS[name](el, e);
      else if (own(CALLS, name)) {
        const d = el.dataset, args = [d.a, d.b, d.c].filter(x => x != null).map(x => x[0] === '#' ? JSON.parse(x.slice(1)) : x);
        if (type === 'change' || type === 'input') args.push(el.type === 'checkbox' ? el.checked : el.value);
        CALLS[name](...args);
      } else continue;
      if (type === 'click' && el.tagName === 'A') e.preventDefault();
    }
  };
  ['click', 'change', 'input', 'keydown'].forEach(t => document.addEventListener(t, e => run(t, e)));
  document.addEventListener('toggle', e => run('toggle', e, true), true);
})();
