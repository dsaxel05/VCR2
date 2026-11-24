/* ═══════════════════════════════════════════════════════════════
   WORKSPACE PIPELINE — one submission in, one scored company out, in the investor's browser:
   read the files (Smart fill; OCR for image-only decks) → facts with sources → duplicate check → thesis → full VCR2 analysis
   (In thesis and Borderline) → scorecard → deck and report into the investor's Drive → row in the master sheet → memo
   (optional) → webhook. No AI anywhere in this chain.
   ═══════════════════════════════════════════════════════════════ */
async function wsHash(u8) { try { const d = await crypto.subtle.digest('SHA-256', u8); return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join(''); } catch (e) { return ''; } }
const wsNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const WS_ENGINE_MODEL = { saas:'saas', ai_app:'ai_app', marketplace:'marketplace', fintech:'fintech', usage:'saas', consumer_sub:'saas', hardware:'saas', services:'saas' };

/* read every file; an image-only deck goes through OCR when it is available on this site */
async function wsReadFiles(files, onStep) {
  const docs = [], notes = [];
  for (const f of files) {
    let r = null;
    try { r = await sfReadFile(f.bytes, f.name); } catch (e) { r = { ok:false, file:f.name, code:'error', why:String(e && e.message || e) }; }
    const empty = r && r.ok && r.doc && !(r.doc.blocks || []).some(b => /[A-Za-z]{3}/.test(b.text || (b.rows || []).flat().join(' ')));
    if ((r && !r.ok && /image|scan|nofont|notext/.test(r.code || '')) || empty || (r && r.ok && r.doc && r.doc.kind === 'pdf' && r.doc.scanned)) {
      if (onStep) onStep(`Reading ${f.name} with OCR`);
      const o = await wsOcrFile(f.bytes, f.name).catch(e => ({ ok:false, why:String(e && e.message || e) }));
      if (o && o.ok) { docs.push({ file:f.name, doc:o.doc, ocr:true }); notes.push(`${f.name}: read with OCR (image-only); check the figures.`); continue; }
      notes.push(`${f.name}: ${o && o.why ? o.why : 'an image-only document and OCR is not available'}.`);
      continue;
    }
    if (r && r.ok && r.doc) {
      docs.push({ file:f.name, doc:r.doc, res:r });
      /* an e-mail's attachments (the deck) are read as documents of their own */
      for (const a of r.doc.attachments || []) { if (a && a.ok && a.doc) docs.push({ file:a.file || f.name, doc:a.doc, res:a }); else if (a && !a.ok) notes.push(`${a.file || 'an attachment'}: ${a.why || a.code || 'could not be read'}.`); }
    }
    else if (r && r.ok && r.children) r.children.filter(c => c.ok && c.doc).forEach(c => docs.push({ file:c.file, doc:c.doc, res:c }));
    else notes.push(`${f.name}: ${(r && (r.why || r.code)) || 'could not be read'}.`);
  }
  return { docs, notes };
}
/* Smart fill's rows → the engine's inputs, each with its source. Claims ("as stated") and evidence stay apart. */
function wsInputFrom(rows, stage, model) {
  const vals = {}, bools = {}, sel = {}, evid = {}, prov = {};
  for (const r of rows || []) {
    if (r.tier === 'Low') continue;
    const claim = /^stated_/.test(r.field);
    /* a figure for the evidence itself: confident, or from a system document (export, model, bank, audited) */
    if (!claim && r.tier !== 'High' && (r.role === 'deck' || r.role === 'unknown' || !r.role)) continue;
    const f = typeof ALL_FIELDS === 'function' ? ALL_FIELDS().find(x => x.id === r.field) : null; if (!f) continue;
    if (f.t === 'bool') bools[r.field] = !!r.value; else if (f.t === 'select') sel[r.field] = String(r.value); else vals[r.field] = typeof r.value === 'number' ? String(+r.value.toFixed(6)) : String(r.value).slice(0, 200);
    prov[r.field] = { src:'smartfill', file:String(r.file || '').slice(0, 120), loc:String(r.loc || '').slice(0, 80), line:String(r.snippet || '').slice(0, 160), conf:r.tier };
    evid[r.field] = r.evid != null ? r.evid : ((typeof SF_EVID !== 'undefined' && SF_EVID[r.role]) || '');
  }
  return { stage, model, vals, bools, sel, evid, prov };
}
/* the deck's own claims scored with the engine's thresholds (as "deck" evidence): used for a pillar only when the evidence is too thin,
   and always labelled "from the deck's claims (unverified)" */
function wsClaimsEngine(rows, stage, model) {
  const TH = activeThresholds(), row = id => (rows || []).find(r => r.field === id && typeof r.value === 'number');
  const v = {}, src = {};
  const put = (k, r, val) => { const x = val != null ? val : r && r.value; if (x != null && isFinite(x)) { v[k] = x; src[k] = r ? { file:r.file, loc:r.loc, line:String(r.snippet || r.raw || '').slice(0, 160) } : null; } };
  const arr = row('stated_arr') || row('arr_now'), g = row('stated_growth'), burn = row('net_burn'), gm = row('gross_margin') || row('stated_gross_margin');
  put('nrr', row('stated_nrr')); put('grr', row('stated_grr')); put(model === 'ai_app' ? 'gross_margin_ai' : 'gross_margin', gm); put('growth_yoy', g);
  put('cac_payback', row('stated_cac_payback')); put('ltv_cac', row('stated_ltv_cac')); put('runway', row('stated_runway'));
  if (row('stated_burn_multiple')) put('burn_multiple', row('stated_burn_multiple'));
  else if (arr && g && burn && g.value > 0) { const netNew = arr.value - arr.value / (1 + g.value / 100); if (netNew > 0) put('burn_multiple', burn, burn.value * 12 / netNew); }
  if (row('stated_rule40')) put('rule40', row('stated_rule40'));
  else if (arr && g && burn && arr.value > 0) put('rule40', g, g.value - burn.value * 12 / arr.value * 100);
  const metrics = [];
  for (const [k, val] of Object.entries(v)) {
    const cfg = TH[k]; if (!cfg || cfg.dir === 'band') continue;
    const a = cfg[stage]; if (!Array.isArray(a)) continue;
    if ((cfg.models && !cfg.models.includes(model)) || (cfg.notModels && cfg.notModels.includes(model))) continue;
    const raw = bandScore(val, a, cfg.dir);
    metrics.push({ key:k, label:(DLABEL[k] || k) + ' (claimed)', value:dfmt(k, val), score:Math.round(evidenceAdjust(raw, 0.45)), evidence:0.45, bench:'', src:src[k] });
  }
  return metrics.length ? { scoring:{ overall:null, dimensions:[{ id:'claims', label:'Deck claims', score:null, coverage:0, metrics }] }, checks:[], questions:[], patterns:[], claims:true } : null;
}
/* the engine, headless (the same as Radar.assess on the main page) */
function wsAssess(input) {
  const prev = S;
  S = Object.assign(blankState(), { stage:input.stage, model:input.model, vals:Object.assign({}, input.vals), bools:Object.assign({}, input.bools), sel:Object.assign({}, input.sel), evid:Object.assign({}, input.evid), prov:Object.assign({}, input.prov), market:input.market || 'us' });
  try { return assessAll(); } finally { S = prev; }
}
/* what is kept of an engine run: enough for the scorecard, the memo and re-scoring, nothing else */
function wsCompact(R) {
  if (!R) return null;
  return { scoring:{ overall:R.sc.overall, band:R.sc.band, dimensions:R.sc.dimensions.map(d => ({ id:d.id, label:d.label, score:d.score, coverage:d.coverage,
      metrics:d.metrics.filter(m => m.score != null && !m.withheld && !m.suppressed).map(m => ({ key:m.key, label:m.label, value:m.value, score:m.score, evidence:m.evidence, bench:m.bench || '' })) })) },
    checks:(R.checks || []).map(c => ({ id:c.id, sev:c.sev, title:c.title, text:String(c.text || '').slice(0, 300), stated:c.stated || '', computed:c.computed || '' })),
    questions:(R.questions || []).slice(0, 30).map(q => ({ text:q.text, tag:q.tag || '', ref:q.ref ? { k:q.ref.k, id:q.ref.id } : null })),
    patterns:(R.patterns || []).slice(0, 12).map(p => ({ id:p.id, sev:p.sev, title:p.title, why:String(p.why || '').slice(0, 300) })),
    hash:R.hash, rubric:R.sc.rubric };
}
function wsAnalysisSummary(C) {
  if (!C) return null;
  const metrics = []; C.scoring.dimensions.forEach(d => d.metrics.forEach(m => metrics.push({ key:m.key, label:m.label, value:m.value, evidence:wsEvidName(m.evidence) })));
  return { score:C.scoring.overall, band:C.scoring.band, hash:C.hash, rubric:C.rubric, metrics:metrics.slice(0, 30), checks:C.checks.filter(c => c.sev === 'major' || c.sev === 'minor').slice(0, 20), patterns:C.patterns, questions:C.questions.map(q => q.text).slice(0, 15) };
}
/* the scorecard of a company, from what is stored (no engine run needed: weights can change any time) */
function wsScoreOf(ws, deal) { return wsScorecard(ws, deal, deal.engine || null, deal.engineClaims || null); }

/* one submission → one company. ctx = { ws, deals (current list), connector, store, who } */
async function wsProcessItem(ctx, item, onStep) {
  const t0 = wsNow(), ws = ctx.ws, step = s => onStep && onStep(s);
  const files = [];
  for (const f of item.files || []) files.push({ name:wsClip(f.name, 200) || 'file', bytes:f.bytes, size:f.bytes.length, hash:await wsHash(f.bytes), type:f.type || '' });
  step('Reading the documents');
  const { docs, notes } = await wsReadFiles(files, step);
  /* text pasted or sent as the body of a form or e-mail is read too */
  if (item.text) { try { const d = sfReadText(String(item.text).slice(0, 200000), item.textName || 'message.txt', 'txt'); docs.push({ file:item.textName || 'message', doc:d }); } catch (e) {} }
  let model = 'saas';
  const pre = wsFacts(docs, item.meta || {}, []); if (pre.model && WS_ENGINE_MODEL[pre.model]) model = WS_ENGINE_MODEL[pre.model];
  step('Finding the figures');
  const extracts = docs.map(d => { try { return sfExtract(d.res || { file:d.file, doc:d.doc }, { model }); } catch (e) { return null; } }).filter(Boolean);
  const resolved = extracts.length ? sfResolveAll(extracts, model) : { rows:[], conflicts:[] };
  const facts = wsFacts(docs, item.meta || {}, resolved.rows);
  if (!facts.company && files.length) { const c = wsCompanyFromDocs([{ file:files[0].name }], []); if (c) { facts.company = c.name; facts.src.company = c.src; } }
  const lines = []; docs.forEach(d => wsLines(d.doc, d.file).forEach(l => lines.push(l)));
  const deal = {
    id:wsNewId(), company:facts.company || '', founders:facts.founders || [], email:facts.email || '', website:facts.website || '', linkedin:facts.linkedin || '',
    sector:facts.sector || '', stage:facts.stage || '', geo:facts.geo || '', model:facts.model || '', raise:facts.raise ?? null,
    source:item.source || 'import', sources:[item.source || 'import'], received:item.received || new Date().toISOString(), via:item.via || '',
    status:ws.pipeline.statuses[0], files:files.map(f => ({ name:f.name, hash:f.hash, size:f.size })), facts:Object.assign({}, facts, { src:facts.src }),
    notes:[], history:[{ at:new Date().toISOString(), what:`received (${item.source || 'import'})`, by:ctx.who || '' }], evidence:[{ kind:item.kind || 'deck', at:new Date().toISOString(), files:files.map(f => f.name), via:item.source || '' }],
    readNotes:notes.concat(resolved.conflicts.map(c => `Two documents disagree on ${c.label}.`)).slice(0, 20), deckLink:item.meta && item.meta.deckLink || '', leadPartner:'', referral:item.meta && item.meta.referral || '',
  };
  if (item.meta && item.meta.message) deal.notes.push({ by:'founder', at:deal.received, text:wsClip(item.meta.message, 2000) });
  /* the same company already in the workspace: merge, never a second row */
  const dup = wsFindDup(ctx.deals, deal);
  step('Checking the thesis');
  deal.thesis = wsThesisRun(ws, facts, lines);
  const input = wsInputFrom(resolved.rows, deal.stage || 'seed', model);
  input.market = (WS_COUNTRIES.find(c => c.id === deal.geo) || {}).r === 'europe' ? 'eu' : ws.market || 'us';
  if (deal.thesis.result !== 'out') {
    step('Running the VCR2 analysis');
    let R = null;
    try { R = wsAssess(input); } catch (e) { deal.readNotes.push('The analysis could not run: ' + String(e && e.message || e).slice(0, 120)); }
    deal.engine = wsCompact(R); deal.engineClaims = wsClaimsEngine(resolved.rows, input.stage, model);
    deal.analysis = wsAnalysisSummary(deal.engine);
  }
  deal.input = { stage:input.stage, model:input.model, market:input.market, vals:input.vals, bools:input.bools, sel:input.sel, evid:input.evid, prov:input.prov };
  deal.prov = input.prov;
  const s = wsScoreOf(ws, deal);
  /* timing: from the moment VCR2 got the deck (the intake time, or the start of this import) to the automated score */
  const inAt = item.inAt || new Date(Date.now() - (wsNow() - t0)).toISOString();
  deal.timing = { inAt, autoMs:Math.round(wsNow() - t0), scoredAt:new Date().toISOString() };
  deal.timing.toScoreMs = Math.max(0, Date.parse(deal.timing.scoredAt) - (wsTime(inAt) || Date.parse(deal.timing.scoredAt)));
  let out = deal;
  if (dup) { out = wsMerge(dup.deal, deal, dup.why); out.thesis = deal.thesis; out.engine = deal.engine || dup.deal.engine; out.engineClaims = deal.engineClaims || dup.deal.engineClaims; out.analysis = deal.analysis || dup.deal.analysis; out.input = deal.input; out.prov = deal.prov; out.facts = Object.assign({}, dup.deal.facts, deal.facts); out.readNotes = deal.readNotes; out.timing = dup.deal.timing || deal.timing; out._dupWhy = dup.why; }
  /* files into the investor's Drive: the deck in the folder of its thesis result, the report beside it */
  const con = ctx.connector;
  if (con && con.connected() && !ctx.noUpload) {
    step('Filing in your Drive');
    try { await wsFileToDrive(ws, out, files, con, s); } catch (e) { out.readNotes = (out.readNotes || []).concat(['Drive: ' + String(e.message || e).slice(0, 160)]); }
  }
  return { deal:out, merged:!!dup, why:dup && dup.why, score:wsScoreOf(ws, out), lines };
}
/* one folder per company inside the folder of its thesis result; the deck and the VCR2 report (a Google Doc) inside */
async function wsFileToDrive(ws, deal, files, con, s) {
  const key = deal.thesis.result === 'in' ? 'in' : deal.thesis.result === 'out' ? 'out' : 'border', target = ws.storage.folders[key] || ws.storage.folders.root;
  if (!target || !target.id) throw new Error('choose the folders in Settings, Google Drive');
  if (!deal.folderId) { const f = await con.folder(`${deal.company || 'Unnamed company'} (${String(deal.received).slice(0, 10)})`, target.id); deal.folderId = f.id; deal.folderUrl = f.url; }
  for (const f of files) { const up = await con.upload(f.name, f.bytes, f.type || 'application/octet-stream', deal.folderId); const r = (deal.files || []).find(x => x.hash === f.hash && !x.link); if (r) r.link = up.url; if (!deal.deckLink) deal.deckLink = up.url; }
  const rep = await con.upload(`VCR2 report: ${deal.company || 'company'}`, new TextEncoder().encode(wsMemoHTML(WS_REPORT_TEMPLATE, wsMemoData(ws, deal, s))), 'text/html', deal.folderId, true);
  deal.reportUrl = rep.url; deal.reportId = rep.id;
}
const WS_REPORT_TEMPLATE = `# {{company}}: VCR2 screening report
{{date}} · {{workspace}}

## Summary
{{summary}}

## Thesis check
{{thesis}}

## Scorecard
{{scorecard}}

Total weighted score: **{{total}}** ({{tier}}).

## Figures found, with their evidence
{{metrics}}

## Consistency checks
{{checks}}

## Questions to ask
{{questions}}

## Sources
{{sources}}

VCR2 reads the documents with fixed rules (no AI). A figure from a deck is a claim until a system export, a bank record or audited statements confirm it. Not investment advice.`;

/* the master sheet: read it, plan the writes (never over a formula, a "read" column or a cell your team changed), write */
async function wsSyncSheet(ctx) {
  const ws = ctx.ws, con = ctx.connector, sh = ws.storage.sheet;
  if (!con || !con.connected() || !sh || !sh.id) return { written:0, note:'No master sheet connected.' };
  const sheet = await con.readSheet(sh.id, sh.tab, sh.headerRow);
  const sync = {}; ctx.deals.forEach(d => { if (d.sheetSync) sync[d.id] = d.sheetSync; });
  const plan = wsSheetPlan(ws, sheet, ctx.deals.filter(d => !d.mergedInto), d => wsScoreOf(ws, d), sync);
  const n = await con.writeSheet(sh.id, sheet, plan);
  const changed = [];
  for (const d of ctx.deals) {
    const r = plan.rowsOf[d.id]; if (!r) continue;
    const before = JSON.stringify(d.sheetSync || null); d.sheetSync = { row:r.row, written:r.written };
    const rb = plan.readBack[d.id] || {};
    /* what your team keeps in the sheet comes back into VCR2 (status, next action, owner, lead partner...) */
    for (const [field, v] of Object.entries(rb)) if (['status', 'nextAction', 'followOwner', 'leadPartner', 'referral', 'reviewer'].includes(field) && String(d[field] || '') !== String(v)) { d[field] = wsClip(v, 200); }
    for (const [field, v] of Object.entries(rb)) if (['lastContact', 'nextDue'].includes(field)) { const t = wsTime(v) || wsTime(String(v).replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1')); if (t) d[field] = wsIso(t); }
    if (before !== JSON.stringify(d.sheetSync) || Object.keys(rb).length) changed.push(d);
  }
  return { written:n, plan, changed, skipped:plan.skipped, notes:plan.notes };
}
/* the deal memo: a Google Doc from the investor's template (copied, placeholders replaced) or from VCR2's (converted) */
async function wsMakeMemo(ctx, deal) {
  const ws = ctx.ws, con = ctx.connector, s = wsScoreOf(ws, deal), data = wsMemoData(ws, deal, s);
  if (!con || !con.connected()) throw new Error('Connect Google first.');
  const parent = (ws.storage.folders.memos || {}).id || deal.folderId || (ws.storage.folders.root || {}).id;
  let doc;
  if (ws.storage.memo.templateId) {
    doc = await con.copy(ws.storage.memo.templateId, `${data.company}: deal memo`, parent);
    const flat = {}; for (const [k, v] of Object.entries(data)) flat[k] = Array.isArray(v) ? v.map(x => '• ' + x).join('\n') : v;
    await con.docReplace(doc.id, flat);
  } else doc = await con.upload(`${data.company}: deal memo`, new TextEncoder().encode(wsMemoHTML(ws.storage.memo.template || WS_MEMO_TEMPLATE, data)), 'text/html', parent, true);
  deal.memo = { id:doc.id, url:doc.url, at:new Date().toISOString(), by:ctx.who || '' };
  deal.history = (deal.history || []).concat([{ at:deal.memo.at, what:'deal memo created', by:ctx.who || '' }]);
  return deal.memo;
}
/* more evidence for a company already in the workspace (a founder e-mail, a call transcript, notes): read, add, re-score */
async function wsAddEvidence(ctx, deal, item, onStep) {
  const files = []; for (const f of item.files || []) files.push({ name:wsClip(f.name, 200), bytes:f.bytes, hash:await wsHash(f.bytes) });
  const { docs, notes } = await wsReadFiles(files, onStep);
  if (item.text) docs.push({ file:item.textName || (item.kind === 'transcript' ? 'call transcript' : 'pasted text'), doc:sfReadText(String(item.text).slice(0, 400000), item.textName || 'pasted.txt', 'txt') });
  const model = (deal.input || {}).model || 'saas';
  const extracts = docs.map(d => { try { return sfExtract(d.res || { file:d.file, doc:d.doc }, { model, as:'update' }); } catch (e) { return null; } }).filter(Boolean);
  const rows = extracts.length ? sfResolveAll(extracts, model).rows : [];
  const add = wsInputFrom(rows, (deal.input || {}).stage || deal.stage || 'seed', model);
  const inp = Object.assign({ vals:{}, bools:{}, sel:{}, evid:{}, prov:{} }, deal.input || {});
  let added = 0;
  for (const k of ['vals', 'bools', 'sel']) for (const [f, v] of Object.entries(add[k])) { if (inp[k][f] == null || inp[k][f] === '' || (inp.prov[f] && inp.prov[f].src === 'smartfill')) { inp[k][f] = v; inp.prov[f] = add.prov[f]; inp.evid[f] = add.evid[f]; added++; } }
  const R = wsAssess(inp);
  deal.input = inp; deal.prov = inp.prov; deal.engine = wsCompact(R); deal.analysis = wsAnalysisSummary(deal.engine);
  const cl = wsClaimsEngine(rows, inp.stage, model); if (cl) deal.engineClaims = cl;
  const facts = wsFacts(docs, {}, rows); for (const k of ['founders', 'email', 'website', 'linkedin']) if ((deal[k] == null || deal[k] === '' || (Array.isArray(deal[k]) && !deal[k].length)) && facts[k]) deal[k] = facts[k];
  deal.evidence = (deal.evidence || []).concat([{ kind:item.kind || 'note', at:new Date().toISOString(), files:files.map(f => f.name).concat(item.text ? [item.textName || 'pasted text'] : []), fields:added, by:ctx.who || '' }]);
  if (item.kind === 'email' || item.kind === 'transcript') deal.lastContact = wsIso(Date.now());
  deal.history = (deal.history || []).concat([{ at:new Date().toISOString(), what:`evidence added (${item.kind || 'note'}): ${added} field${added === 1 ? '' : 's'} filled`, by:ctx.who || '' }]);
  deal.readNotes = notes;
  return { added, notes };
}
/* the integration webhook, through the intake service (the page itself talks only to the hosts in its policy) */
async function wsWebhook(ctx, event, deal) {
  const ws = ctx.ws; if (!ws.integrations.webhook || !WS_SITE.intake || !ws.intake || !ws.intake.key) return false;
  const body = wsWebhookBody(event, ws, deal, wsScoreOf(ws, deal));
  const r = await fetch(WS_SITE.intake + '/v1/hook?ws=' + encodeURIComponent(ws.intake.wsKey || ''), { method:'POST', headers:{ authorization:'Bearer ' + ws.intake.key, 'content-type':'application/json' }, body:JSON.stringify(body), credentials:'omit', referrerPolicy:'no-referrer' });
  return r.ok;
}
