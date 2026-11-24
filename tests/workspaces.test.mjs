// Workspaces (Deal flow): the pure engine and the whole pipeline, headless.
//   node tests/workspaces.test.mjs            (writes docs/overhaul/workspace/RESULTS.md when that folder exists)
// The app (index.html) plus src/ws-core.js, ws-ocr.js and ws-run.js are evaluated in one scope, as in the browser. The corpus in
// tests/fixtures/workspaces (56 fictional companies, 3 duplicates, 5 forwarded e-mails, a backfill spreadsheet, a fake master
// sheet with formula and dropdown columns) is run end to end for two fake investors, against a fake Google Drive and sheet.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, appSource, installStubs } from './_harness.mjs';

installStubs();
const src = ['ws-core.js', 'ws-lp.js', 'ws-ocr.js', 'ws-run.js'].map(f => readFileSync(join(root, 'src', f), 'utf8')).join('\n;');
(0, eval)(appSource() + '\n;' + src + '\n;globalThis.__ws = { wsNew, wsNormalize, wsThesisRun, wsFacts, wsScorecard, wsScoreOf, wsCardProblems, wsSetPillar, wsMarkComplete, wsSuggestPillar, wsConfirmAi, wsParseAi, wsAiPrompt, wsRescoreDiff, wsDistribution, wsFlags, wsTriage, wsKpis, wsDigest, wsFindDup, wsMerge, wsKey, wsAutoMap, wsSheetPlan, wsPickOption, wsMatchRow, wsMemoData, wsMemoHTML, wsMemoText, wsExportDeal, wsWebhookBody, wsProcessItem, wsAddEvidence, wsSyncSheet, wsMakeMemo, wsSafeCell, wsColLetter, WS_SCORECARDS, WS_PIPELINES, WS_MEMO_TEMPLATE, sfReadText, blankState, loadNorthwind, assessAll, setS:v => { S = v; }, getS:() => S };');
const W = globalThis.__ws;
const results = []; let section = '';
const ok = (name, cond, detail) => results.push({ name:(section ? section + ': ' : '') + name, ok:!!cond, detail });
const FX = join(root, 'tests', 'fixtures', 'workspaces');
const bytes = p => new Uint8Array(readFileSync(join(FX, p)));

/* ── a fake Google: an in-memory Drive and the master sheet; formulas recomputed like Sheets would ── */
function fakeGoogle() {
  const sh = JSON.parse(readFileSync(join(FX, 'sheet.json'), 'utf8'));
  const G = { files:new Map(), n:0, writes:[], formulaWrites:0, docs:new Map(), sheet:{ headers:sh.headers, rows:sh.rows.map(r => r.slice()), formulaCols:sh.formulaCols, validations:Object.fromEntries(Object.entries(sh.validations).map(([k, v]) => [+k, v])) } };
  const id = () => 'f' + (++G.n).toString().padStart(12, '0');
  const recompute = () => { for (const r of G.sheet.rows) { const s = [14, 15, 16, 17, 18].map(c => parseFloat(r[c])); const w = [0.25, 0.25, 0.2, 0.15, 0.15]; const t = s.every(isFinite) ? Math.round(s.reduce((a, v, i) => a + v * w[i], 0) * 100) / 100 : ''; r[19] = t === '' ? '' : String(t); r[20] = t === '' ? '' : t >= 4 ? 'Tier 1' : t >= 3.25 ? 'Tier 2' : 'Tier 3'; } };
  recompute();
  return Object.assign(G, {
    id:'google', connected:() => true,
    async folder(name, parent) { const i = id(); G.files.set(i, { name, parent, folder:true }); return { id:i, name, url:'https://drive.google.com/drive/folders/' + i }; },
    async upload(name, b, mime, parent, asDoc) { const i = id(); G.files.set(i, { name, parent, size:b.length, mime, asDoc, text:asDoc ? new TextDecoder().decode(b) : '' }); return { id:i, name, url:'https://drive.google.com/file/d/' + i + '/view' }; },
    async copy(fid, name, parent) { const i = id(); G.files.set(i, { name, parent, copyOf:fid }); G.docs.set(i, G.docs.get(fid) || 'Memo for {{company}}: {{total}} ({{tier}}). {{questions}}'); return { id:i, name, url:'https://docs.google.com/document/d/' + i + '/edit' }; },
    async docReplace(did, pairs) { let t = G.docs.get(did) || ''; for (const [k, v] of Object.entries(pairs)) t = t.split('{{' + k + '}}').join(v); G.docs.set(did, t); },
    async readSheet() {
      recompute();
      const formulas = new Set(); G.sheet.formulaCols.forEach(c => { formulas.add('c' + c); G.sheet.rows.forEach((r, i) => formulas.add(i + ':' + c)); });
      return { id:'sheet1', title:'fake', tab:'Pipeline', tabs:['Pipeline'], headerRow:1, headers:G.sheet.headers.slice(), rows:G.sheet.rows.map(r => r.slice()), formulas, validations:G.sheet.validations };
    },
    async writeSheet(sid, sheet, plan) {
      let n = 0;
      const put = (row, col, v) => { if (G.sheet.formulaCols.includes(col)) G.formulaWrites++; while (G.sheet.rows.length <= row) G.sheet.rows.push(new Array(G.sheet.headers.length).fill('')); G.sheet.rows[row][col] = String(v).replace(/^'/, ''); G.writes.push({ row, col, v }); n++; };
      for (const u of plan.updates) put(u.row, u.col, u.value);
      for (const a of plan.appends) a.values.forEach((v, c) => { if (v !== undefined && v !== '') put(a.row, c, v); });
      recompute(); return n;
    },
  });
}

async function run() {
  /* ── units ── */
  section = 'thesis';
  const ws = W.wsNew('Unit fund', { scorecard:'profit_durability', pipeline:'committee' });
  ws.thesis = Object.assign(ws.thesis, { stages:['seed', 'a'], sectors:['fintech'], geos:['europe'], roundMin:1e6, roundMax:8e6, exclusions:['crypto'], musts:[{ kind:'keyword', text:'B2B' }] });
  const W1 = W.wsNormalize(ws);
  const lines = t => t.split('\n').map((x, i) => ({ text:x, loc:'slide ' + (i + 1), file:'deck.pdf', w:1 }));
  const good = W.wsThesisRun(W1, { sector:'fintech', geo:'fr', stage:'seed', raise:2e6, src:{ sector:{ file:'deck.pdf', loc:'slide 1', quote:'payments' } } }, lines('B2B payments for finance teams'));
  ok('a fit on every criterion is In thesis', good.result === 'in' && good.label === 'In thesis', good);
  ok('every reason names its source', good.reasons.filter(r => r.ok).every(r => r.src || r.rule === 'geo' || r.rule === 'stage' || r.rule === 'round'));
  const miss = W.wsThesisRun(W1, { sector:'fintech', src:{} }, lines('B2B payments'));
  ok('missing information is Borderline (needs info), never Out', miss.result === 'border' && miss.needsInfo && miss.label === 'Borderline (needs info)', miss.label);
  ok('missing information comes with the questions to ask', miss.questions.length >= 3, miss.questions);
  const excl = W.wsThesisRun(W1, { sector:'fintech', geo:'fr', stage:'seed', raise:2e6, src:{} }, lines('B2B\nWe build a crypto wallet'));
  ok('an exclusion word is Out of thesis, with its quote', excl.result === 'out' && excl.reasons.some(r => r.rule === 'exclusion' && /crypto/.test(r.src.quote)), excl.reasons);
  const geo = W.wsThesisRun(W1, { sector:'fintech', geo:'us', stage:'seed', raise:2e6, src:{} }, lines('B2B'));
  ok('outside the geographies is Out', geo.result === 'out');
  const near = W.wsThesisRun(W1, { sector:'fintech', geo:'de', stage:'b', raise:2e6, src:{} }, lines('B2B'));
  ok('a stage one step away is Borderline, not Out', near.result === 'border', near.reasons);
  const none = W.wsThesisRun(W.wsNormalize(W.wsNew('Empty')), {}, []);
  ok('no thesis set: everything is In thesis', none.result === 'in' && none.noThesis);

  section = 'scorecard';
  ok('the template weights total 100% and are valid', W.wsCardProblems(W1.scorecard).length === 0);
  ok('Profitability & Durability has the five pillars and weights asked for', JSON.stringify(W1.scorecard.pillars.map(p => [p.name, p.weight])) === JSON.stringify([['Team & Execution', 25], ['10-Year Profitability & Unit Economics', 25], ['M&A Durability & Exit Moat', 20], ['Market Size & Timing', 15], ['Product Differentiation', 15]]));
  const bad = JSON.parse(JSON.stringify(W1.scorecard)); bad.pillars[0].weight = 30;
  ok('weights not totalling 100% are refused', W.wsCardProblems(bad).some(p => /100%/.test(p)));
  /* Northwind (a full data pack) through the engine: the profitability pillar is scored from evidence, the others wait for a reviewer */
  W.setS(W.blankState()); const SS = W.getS(); SS.example = true; W.loadNorthwind();
  const R = W.assessAll(), comp = { scoring:{ dimensions:R.sc.dimensions.map(d => ({ id:d.id, label:d.label, score:d.score, coverage:d.coverage, metrics:d.metrics.filter(m => m.score != null).map(m => ({ key:m.key, label:m.label, value:m.value, score:m.score, evidence:m.evidence, bench:m.bench })) })) }, checks:R.checks.map(c => ({ id:c.id, sev:c.sev, title:c.title })), questions:R.questions.map(q => ({ text:q.text, ref:q.ref })) };
  const deal = { id:'nw', company:'Northwind', engine:comp, engineClaims:null, prov:{ gross_margin:{ file:'model.xlsx', loc:'P&L!B7', line:'Gross margin 71%' } } };
  const s1 = W.wsScorecard(W1, deal, comp, null), pp = s1.pillars.find(p => p.id === 'profitability');
  ok('the profitability pillar is scored by the engine from the evidence', pp.from === 'engine' && pp.engine.basis === 'evidence' && pp.score >= 1 && pp.score <= 5, pp);
  ok('its sources list the metrics used with their evidence level', pp.engine.sources.length >= 3 && pp.engine.sources.every(x => x.label && x.value && x.evidence));
  ok('a major consistency check on those figures caps it at 2.5', !R.checks.some(c => c.sev === 'major' && ['waterfall', 'stated_nrr', 'stated_burn_multiple', 'gm_check', 'burn_bridge', 'services', 'stated_runway', 'stated_rule40', 'stated_cac_payback', 'stated_ltv_cac', 'stated_grr', 'burn_check'].includes(c.id)) || pp.score <= 2.5);
  ok('team, moat, market and product are not invented: no score until a reviewer sets one', s1.pillars.filter(p => p.id !== 'profitability').every(p => p.score == null && p.from == null));
  ok('they show the evidence found and the questions to ask', s1.pillars.filter(p => p.kind === 'reviewer').every(p => p.questions.length >= 2));
  ok('a partial scorecard has a total but no tier yet', s1.total != null && s1.tier == null && s1.coverage === 25);
  let d2 = Object.assign({}, deal); ['team', 'moat', 'market', 'product'].forEach((p, i) => { d2.pillars = W.wsSetPillar(d2, p, [4, 4, 5, 4][i], 'A. Reviewer', 'reviewer'); });
  const s2 = W.wsScorecard(W1, d2, comp, null);
  ok('every pillar scored: the weighted total and the tier are computed', s2.complete && s2.tier && Math.abs(s2.total - (0.25 * 4 + 0.25 * pp.score + 0.2 * 4 + 0.15 * 5 + 0.15 * 4)) < 0.051, s2);
  ok('a reviewer score records who and when', s2.pillars.find(p => p.id === 'team').by === 'A. Reviewer' && s2.pillars.find(p => p.id === 'team').at);
  d2.pillars = W.wsSuggestPillar(d2, 'market', { score:2, why:'thin evidence', model:'test-model' });
  ok('an AI suggestion is never applied on its own', W.wsScorecard(W1, d2, comp, null).pillars.find(p => p.id === 'market').score === 5);
  d2.pillars = W.wsConfirmAi(d2, 'market', 'B. Reviewer');
  const pm = W.wsScorecard(W1, d2, comp, null).pillars.find(p => p.id === 'market');
  ok('confirmed by a reviewer, it applies and says so', pm.score === 2 && pm.from === 'ai' && pm.by === 'B. Reviewer' && pm.ai.confirmedBy === 'B. Reviewer');
  ok('the AI answer is parsed only from strict JSON', W.wsParseAi('Sure! {"score": 3.4, "why": "x"}').score === 3.4 && W.wsParseAi('three') === null && W.wsParseAi('{"score": 9}').score === 5);
  ok('the AI prompt carries only the evidence and the guide', /Pillar: Market/.test(W.wsAiPrompt(W1, d2, s1.pillars.find(p => p.id === 'market')).prompt));
  const W2 = W.wsNormalize(Object.assign(W.wsNew('Other'), { scorecard:W.WS_SCORECARDS.vcr2_dimensions }));
  const s3 = W.wsScorecard(W2, deal, comp, null);
  ok('a second scorecard (VCR2 dimensions) is scored by the engine on every pillar with evidence', s3.pillars.filter(p => p.score != null).length >= 5 && s3.pillars.every(p => p.from === 'engine' || p.score == null), s3.pillars.map(p => [p.id, p.score]));
  const before = [Object.assign({ id:'nw', company:'Northwind' }, s2)], W3 = JSON.parse(JSON.stringify(W1)); W3.scorecard.pillars[1].weight = 45; W3.scorecard.pillars[0].weight = 5;
  const moved = W.wsRescoreDiff(before, [Object.assign({ id:'nw', company:'Northwind' }, W.wsScorecard(W.wsNormalize(W3), d2, comp, null))]);
  ok('changing the weights re-scores and lists what moved', moved.length === 1 && moved[0].from !== moved[0].to, moved);

  section = 'pipeline';
  const now = Date.parse('2026-11-23T12:00:00Z'), WP = W.wsNormalize(W.wsNew('P', { pipeline:'committee' }));
  ok('the preset Inbound → Screened → Diligence → IC → Passed is available', WP.pipeline.statuses.join('>') === 'Inbound>Screened>Diligence>IC>Passed');
  const deals = [{ id:'a', company:'Alpha', status:'Inbound', received:'2026-11-10' }, { id:'b', company:'Beta', status:'Diligence', received:'2026-10-01', nextAction:'Call the CFO', nextDue:'2026-11-18' }, { id:'c', company:'Gamma', status:'Screened', received:'2026-11-20', lastContact:'2026-10-20' }, { id:'d', company:'Delta', status:'Passed', received:'2026-09-01', nextDue:'2026-10-01' }];
  const fl = Object.fromEntries(deals.map(d => [d.id, W.wsFlags(WP, d, now).flags.map(f => f.id)]));
  ok('waiting past the target, next action overdue and no contact are flagged; a closed company is not', fl.a.includes('waiting') && fl.b.includes('next') && fl.c.includes('contact') && !fl.d.length, fl);
  const dg = W.wsDigest(WP, deals, () => ({ total:null, tier:null, provisionalTier:null, pillars:[] }), now);
  ok('the digest lists the overdue companies with their owner', dg.overdue.length === 3 && /Beta/.test(dg.text), dg.text);
  const k = W.wsKpis(WP, deals, () => ({ total:null, tier:null, pillars:[] }), now);
  ok('dashboard tiles count logged companies and overdue follow-ups', k.logged === 4 && k.overdue === 3);

  section = 'duplicates';
  const base = [{ id:'x', company:'Acme Robotics Inc.', website:'https://acme-robotics.com', email:'jo@acme-robotics.com', files:[{ hash:'h1', name:'a.pdf' }], received:'2026-11-01' }];
  ok('the same file is a duplicate', W.wsFindDup(base, { id:'y', files:[{ hash:'h1' }] }).why === 'the same file');
  ok('the same web domain is a duplicate', /domain/.test(W.wsFindDup(base, { id:'y', website:'www.acme-robotics.com/about' }).why));
  ok('the same name without the legal suffix is a duplicate', /name/.test(W.wsFindDup(base, { id:'y', company:'ACME Robotics' }).why));
  ok('a free e-mail domain alone is not', !W.wsFindDup([{ id:'x', email:'a@gmail.com', company:'One' }], { id:'y', email:'b@gmail.com', company:'Two' }));
  const mg = W.wsMerge(base[0], { id:'y', company:'Acme', received:'2026-10-15', files:[{ hash:'h2', name:'b.pdf' }], source:'email' }, 'test');
  ok('a merge keeps the earliest date, both files and a history line', mg.received === '2026-10-15' && mg.files.length === 2 && /merged/.test(mg.history.slice(-1)[0].what));

  section = 'sheet units';
  ok('text that a spreadsheet would read as a formula is written as text', W.wsSafeCell('=HYPERLINK("x")') === '\'=HYPERLINK("x")' && W.wsSafeCell(4.2) === 4.2);
  ok('column letters', W.wsColLetter(0) === 'A' && W.wsColLetter(25) === 'Z' && W.wsColLetter(26) === 'AA');
  ok('a dropdown keeps the investor\'s own words', W.wsPickOption(['Pre-Seed', 'Seed', 'Series A', 'Series B+'], 'Series A') === 'Series A' && W.wsPickOption(['FinTech', 'HealthTech'], 'Fintech') === 'FinTech' && W.wsPickOption(['Inbound', 'Screened'], 'Unknown status') === null);
  ok('the memo escapes everything it is given', !/<script/i.test(W.wsMemoHTML(W.WS_MEMO_TEMPLATE, Object.assign(W.wsMemoData(W1, { company:'<script>x</script>' }, s1), {}))));

  /* ── the corpus, end to end: investor A (Google), then investor B ── */
  const inv = JSON.parse(readFileSync(join(FX, 'investors.json'), 'utf8')), plan = JSON.parse(readFileSync(join(FX, 'plan.json'), 'utf8'));
  const table = [];
  for (const key of ['a', 'b']) {
    section = 'corpus ' + key.toUpperCase();
    const I = inv[key], G = fakeGoogle();
    let wsx = W.wsNew(I.name, { scorecard:I.scorecard, pipeline:I.pipeline }); wsx.thesis = Object.assign(wsx.thesis, I.thesis);
    if (key === 'a') { wsx.storage = { provider:'google', folders:{ root:{ id:'root', name:'Deal flow', url:'' }, in:{ id:'in', name:'In', url:'' }, border:{ id:'border', name:'Borderline', url:'' }, out:{ id:'out', name:'Out', url:'' }, memos:{ id:'memos', name:'Memos', url:'' } }, sheet:{ id:'sheet1', tab:'Pipeline', headerRow:1, mapping:[] }, memo:{ templateId:'', template:'', auto:false } }; }
    wsx = W.wsNormalize(wsx);
    if (key === 'a') { const s0 = await G.readSheet(); wsx.storage.sheet.mapping = W.wsAutoMap(wsx, s0.headers, new Set(G.sheet.formulaCols), s0.validations).map(m => ({ col:m.col, header:m.header, field:m.field, mode:m.mode })); }
    const ctx = { ws:wsx, deals:[], connector:key === 'a' ? G : null, who:'test' };
    const teamBefore = key === 'a' ? JSON.parse(JSON.stringify(G.sheet.rows)) : null;
    let n = 0, merged = 0, autoMs = [];
    const items = plan.map(p => ({ source:p.format === 'email' ? 'email' : p.format.startsWith('dup') ? 'import' : (p.i % 5 === 0 ? 'website' : p.i % 7 === 0 ? 'linkedin' : 'import'), received:new Date(Date.parse('2026-11-01') + p.i * 36e5).toISOString(),
      meta:{}, files:p.files.map(f => ({ name:f.split('/').pop(), bytes:bytes(f) })), name:p.name, plan:p }));
    for (const it of items) {
      const t0 = Date.now(); const r = await W.wsProcessItem(ctx, it); n++;
      const i = ctx.deals.findIndex(x => x.id === r.deal.id); if (i >= 0) ctx.deals[i] = r.deal; else ctx.deals.push(r.deal);
      if (r.merged) merged++; autoMs.push(Date.now() - t0);
      if (key === 'a') table.push({ name:it.plan.name, format:it.plan.format, got:r.deal.company, result:r.deal.thesis.label, total:r.score.total, basis:(r.score.pillars.find(p => p.engine) || {}).engine ? r.score.pillars.find(p => p.engine).engine.basis : '', merged:r.merged ? r.why : '', ms:Date.now() - t0, notes:(r.deal.readNotes || []).join(' ') });
    }
    const live = ctx.deals;
    ok(`${items.length} items processed into ${live.length} companies`, n === items.length && live.length === 56, live.length);
    ok('the 3 duplicates were merged, not added', merged === 3, merged);
    const sec = live.filter(d => !d.files.some(f => /scan|\.png/.test(f.name))).map(d => [d.sector, (plan.find(p => p.name === d.company) || {}).sector]).filter(x => x[1]);
    ok('the sector is found right for at least 85% of the readable decks', sec.filter(x => x[0] === x[1]).length >= sec.length * 0.85, sec.filter(x => x[0] !== x[1]));
    ok('every company got a thesis result with reasons', live.every(d => d.thesis && ['in', 'border', 'out'].includes(d.thesis.result) && d.thesis.reasons.length));
    ok('the company name was found for at least 50 of 56', live.filter(d => d.company && plan.some(p => p.name.toLowerCase() === d.company.toLowerCase())).length >= 50, live.filter(d => !plan.some(p => p.name.toLowerCase() === (d.company || '').toLowerCase())).map(d => d.company));
    ok('image-only decks without OCR (Node) are Borderline (needs info), never Out', live.filter(d => d.files.some(f => /scan|\.png/.test(f.name))).every(d => d.thesis.result === 'border'));
    const inc = live.filter(d => plan.find(p => p.format === 'incomplete' && p.name === d.company));
    ok('incomplete decks: what is missing (headquarters, round) is a question, never a fail', inc.length === 3 && inc.every(d => d.thesis.reasons.filter(r => ['geo', 'round'].includes(r.rule)).every(r => r.ok === null) && (d.thesis.result === 'out' || (d.thesis.needsInfo && d.thesis.questions.length))), inc.map(d => [d.thesis.label, d.thesis.reasons.map(r => r.rule + ':' + r.ok)]));
    const noA = live.filter(d => d.thesis.result === 'out' ? !!d.analysis && !d._dupWhy : !d.analysis && d.input && Object.keys(d.input.vals).length);
    ok('In thesis and Borderline companies have the full analysis; Out ones do not', !noA.length, noA.map(d => [d.company, d.thesis.label, !!d.analysis]));
    ok('the automated part takes under a minute per company', Math.max(...autoMs) < 60000, Math.max(...autoMs));
    if (key === 'a') {
      ok('a forwarded e-mail is read with its attached deck (figures found)', live.filter(d => d.source === 'email').every(d => d.files.length && (d.facts.arr != null || d.thesis.result === 'out')) && live.filter(d => d.source === 'email').some(d => d.facts.arr != null), live.filter(d => d.source === 'email').map(d => [d.company, d.facts.arr, d.email]));
      ok('the founder e-mail is the founder’s, not the forwarder’s', live.filter(d => d.source === 'email').every(d => !/fund\.example/.test(d.email || '')));
      ok('excluded sectors (crypto) are Out with a quote', live.filter(d => /crypto|blockchain|defi/i.test(JSON.stringify(d.facts.src || {})) && d.thesis.reasons.some(r => r.rule === 'exclusion')).every(d => d.thesis.result === 'out'));
      ok('companies with a metrics export are scored from evidence, decks alone from claims', table.some(t => t.basis === 'evidence') && table.some(t => t.basis === 'claims'), table.map(t => t.basis).join(','));
      ok('every In and Borderline company has its deck and a report in Drive', live.filter(d => d.thesis.result !== 'out').every(d => d.folderUrl && d.reportUrl));
      const files = [...G.files.values()];
      ok('decks were filed in the folder of their thesis result', files.filter(f => f.folder).every(f => ['in', 'border', 'out'].includes(f.parent)));
      /* the master sheet */
      const r1 = await W.wsSyncSheet(ctx);
      ok('no formula cell was ever written', G.formulaWrites === 0);
      const names = G.sheet.rows.map(r => r[0]).filter(Boolean), dupRows = names.filter((x, i) => names.findIndex(y => W.wsKey(y) === W.wsKey(x)) !== i);
      ok('one row per company: no duplicate rows', dupRows.length === 0, dupRows);
      ok('the 8 companies already in the sheet were matched, not added again', G.sheet.rows.length === 8 + 56 - 8, G.sheet.rows.length);
      const kept = teamBefore.every((row, i) => row.every((v, c) => v === '' || G.sheet.formulaCols.includes(c) || G.sheet.rows[i][c] === v));
      ok('every value the team had typed is still there (status, next action, lead partner, their own summary column)', kept);
      ok('the team\'s own summary column (Gemini Summary) was never written', G.writes.every(w => w.col !== 22));
      ok('dropdown columns only received the investor\'s own values', G.writes.filter(w => [5, 6, 10].includes(w.col)).every(w => G.sheet.validations[w.col].includes(w.v)));
      ok('the team\'s status came back into VCR2 for matched rows', ctx.deals.some(d => d.status === 'Diligence' || d.status === 'IC'));
      const writesFirst = G.writes.length, r2 = await W.wsSyncSheet(ctx);
      ok('a second sync writes nothing new (idempotent)', r2.written === 0, r2.written);
      /* a person changes a cell VCR2 wrote: VCR2 keeps it */
      const someRow = G.sheet.rows.findIndex((r, i) => i >= 8 && r[21]); G.sheet.rows[someRow][21] = 'Edited by the partner';
      ctx.deals.forEach(d => { d.reviewer = 'R. Viewer'; });
      const r3 = await W.wsSyncSheet(ctx);
      ok('a cell your team changed is not overwritten on the next sync', G.sheet.rows[someRow][21] === 'Edited by the partner');
      /* reviewer scores for the top companies, then the memo above the threshold */
      const scorable = ctx.deals.filter(d => d.thesis.result === 'in').slice(0, 6);
      scorable.forEach((d, i) => { ['team', 'moat', 'market', 'product'].forEach(p => { d.pillars = W.wsSetPillar(d, p, 5 - (i % 3), 'A. Partner', 'reviewer'); }); W.wsMarkComplete(ctx.ws, d); });
      ok('a complete scorecard records the time from arrival to a complete scored row', scorable.filter(d => W.wsScoreOf(ctx.ws, d).complete).every(d => d.timing.completeAt && d.timing.toCompleteMs >= 0));
      const above = scorable.filter(d => W.wsScoreOf(ctx.ws, d).meets);
      for (const d of above) await W.wsMakeMemo(ctx, d);
      ok('companies above the threshold get a Google Doc memo with their link', above.length >= 1 && above.every(d => d.memo && /docs\.google|drive\.google/.test(d.memo.url)), above.length);
      const memoDoc = [...G.files.values()].find(f => /deal memo/.test(f.name));
      ok('the memo carries the pillar scores with their sources and the questions', memoDoc && /Profitability/.test(memoDoc.text) && /engine/.test(memoDoc.text) && /reviewer A\. Partner/.test(memoDoc.text) && /Diligence questions/.test(memoDoc.text));
      await W.wsSyncSheet(ctx);
      ok('the memo link is written back to the master sheet', above.every(d => G.sheet.rows.some(r => r[24] && r[24] === d.memo.url)));
      ok('pillar scores reach their columns and the sheet\'s own formula computes the total', G.sheet.rows.some(r => r[15] !== '' && r[19] !== ''));
      /* the investor's own Google Doc template */
      G.docs.set('tpl', 'MEMO {{company}} total {{total}} tier {{tier}}\n{{questions}}'); ctx.ws.storage.memo.templateId = 'tpl';
      const m2 = await W.wsMakeMemo(ctx, above[0] || scorable[0]); const txt = G.docs.get(m2.id);
      ok('a Google Doc template of the investor is copied and its placeholders filled', /^MEMO /.test(txt) && !/\{\{/.test(txt), txt.slice(0, 120));
      ctx.ws.storage.memo.templateId = '';
      /* more evidence: a call transcript for company 5 */
      const c5 = ctx.deals.find(d => d.company === plan[5].name);
      if (c5) { const before5 = JSON.stringify(c5.input.vals); const ev = await W.wsAddEvidence(ctx, c5, { kind:'transcript', text:readFileSync(join(FX, 'transcript.txt'), 'utf8') }); ok('a call transcript adds evidence with its source and re-scores', ev.added >= 1 && JSON.stringify(c5.input.vals) !== before5 && Object.values(c5.prov).some(p => /transcript/.test(p.file)), ev); }
      /* changing the weights re-scores everyone */
      const b4 = ctx.deals.map(d => Object.assign({ id:d.id, company:d.company }, W.wsScoreOf(ctx.ws, d)));
      const ws2 = JSON.parse(JSON.stringify(ctx.ws)); ws2.scorecard.pillars[0].weight = 15; ws2.scorecard.pillars[1].weight = 35; ws2.scorecard.threshold = 3;
      const af = ctx.deals.map(d => Object.assign({ id:d.id, company:d.company }, W.wsScoreOf(W.wsNormalize(ws2), d)));
      const mv = W.wsRescoreDiff(b4, af);
      ok('new weights re-score everyone and list what moved', mv.length >= 1, mv.length);
      const dist = W.wsDistribution(ctx.ws.scorecard, af);
      ok('the score distribution covers every company', dist.n === 56 && dist.total.reduce((s, b) => s + b.n, 0) + dist.unscored === 56);
      /* JSON export and webhook payload */
      const ex = W.wsExportDeal(ctx.ws, scorable[0], W.wsScoreOf(ctx.ws, scorable[0]));
      ok('the JSON export has the documented schema', ex.schema === 'vcr2.workspace.company/1' && ex.scorecard.pillars.length === 5 && ex.thesis.reasons.length && ex.pipeline && ex.links);
      ok('a webhook body wraps it with the event name', W.wsWebhookBody('company.created', ctx.ws, scorable[0], W.wsScoreOf(ctx.ws, scorable[0])).event === 'company.created');
      const kp = W.wsKpis(ctx.ws, ctx.deals, d => W.wsScoreOf(ctx.ws, d));
      ok('the dashboard tiles measure deck-to-score time', kp.medianAutoMs != null && kp.medianToScoreMs != null);
      globalThis.__tableA = table; globalThis.__kpiA = kp; globalThis.__sheetA = { rows:G.sheet.rows.length, writes:G.writes.length, formulaWrites:G.formulaWrites };
    } else {
      ok('investor B\'s thesis gives different results (North America, pre-seed and seed)', live.filter(d => d.thesis.result === 'in').every(d => ['us', 'ca'].includes(d.geo)));
      ok('investor B\'s scorecard (Early-stage basics) has its own pillars', W.wsScoreOf(ctx.ws, live[0]).pillars.map(p => p.id).join(',') === 'team,market,traction');
      globalThis.__resB = live.reduce((o, d) => { o[d.thesis.label] = (o[d.thesis.label] || 0) + 1; return o; }, {});
    }
    globalThis['__res' + key.toUpperCase()] = globalThis['__res' + key.toUpperCase()] || live.reduce((o, d) => { o[d.thesis.label] = (o[d.thesis.label] || 0) + 1; return o; }, {});
  }
}
await run();
let failed = 0;
console.log('Workspaces (Deal flow)');
for (const t of results) { if (t.ok) console.log('  ✓', t.name); else { failed++; console.log('  ✗', t.name, '—', JSON.stringify(t.detail === undefined ? '' : t.detail).slice(0, 400)); } }
console.log(`\n${results.length - failed}/${results.length} passed`);
const out = join(root, 'docs', 'overhaul', 'workspace');
if (existsSync(out) && globalThis.__tableA) {
  const T = globalThis.__tableA;
  writeFileSync(join(out, 'RESULTS-node.md'), `# Corpus run (Node, ${new Date().toISOString().slice(0, 10)})\n\nInvestor A: ${JSON.stringify(globalThis.__resA)}; investor B: ${JSON.stringify(globalThis.__resB)}. Sheet: ${JSON.stringify(globalThis.__sheetA)}. KPIs A: ${JSON.stringify(globalThis.__kpiA)}.\n\n| # | Company (planted) | Format | Found as | Thesis (A) | Total | Basis | Merged | ms |\n|---|---|---|---|---|---|---|---|---|\n` +
    T.map((t, i) => `| ${i + 1} | ${t.name} | ${t.format} | ${t.got} | ${t.result} | ${t.total ?? ''} | ${t.basis} | ${t.merged} | ${t.ms} |`).join('\n') + '\n');
}
process.exitCode = failed ? 1 : 0;
