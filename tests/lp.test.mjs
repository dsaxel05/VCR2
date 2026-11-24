// Due diligence process, investment committee and the anonymized LP pipeline (Part 3), headless.
//   node tests/lp.test.mjs
// The 56 fictional companies of tests/fixtures/workspaces go through a third fake investor that uses the full process preset
// (Sourcing → … → Post-investment monitoring), several committee votes (a tie, a recusal, a pass with conditions, no quorum,
// a veto), the LP "Due Diligence Process" document and the anonymized pipeline (future of work only, then everything).
// 35 tricky anonymization cases must each be caught; generated descriptions must pass clean; no internal value may leak.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, appSource, installStubs } from './_harness.mjs';

installStubs();
const src = ['ws-core.js', 'ws-lp.js', 'ws-ocr.js', 'ws-run.js'].map(f => readFileSync(join(root, 'src', f), 'utf8')).join('\n;');
(0, eval)(appSource() + '\n;' + src + '\n;globalThis.__L = { wsNew, wsNormalize, wsIcTally, wsIcRecord, wsImportProcess, wsApplyImport, wsDdpHTML, wsLpEntries, wsLpFlags, wsLpOpenFlags, wsLpAccept, wsLpFix, wsLpLeaks, wsLpHTML, wsLpCSV, wsChecklist, wsTick, wsStageAge, wsProcessItem, wsSheetPlan, wsAutoMap, wsFieldValue, wsScoreOf, WS_PIPELINES };');
const L = globalThis.__L, results = []; let section = '';
const ok = (name, cond, detail) => results.push({ name:(section ? section + ': ' : '') + name, ok:!!cond, detail });

/* ── the process preset ── */
section = 'process';
const ws0 = L.wsNew('Fund C', { pipeline:'ddp', scorecard:'profit_durability' });
ok('the preset has the nine stages asked for, in order', ws0.pipeline.statuses.slice(0, 9).join(' → ') === 'Sourcing → Thesis screen → First call → Deep diligence → IC memo → IC vote → Term sheet → Close → Post-investment monitoring', ws0.pipeline.statuses);
ok('the stages are the pipeline statuses (one source of truth)', Object.keys(ws0.pipeline.stages).join() === ws0.pipeline.statuses.join());
ok('each stage has a goal, a checklist, an owner, a target time and the evidence VCR2 provides', ws0.pipeline.statuses.slice(0, 9).every(s => { const x = ws0.pipeline.stages[s]; return x.goal && x.checklist.length && x.owner && x.days > 0; }) && ws0.pipeline.stages['Deep diligence'].evidence.includes('checks'));
const dl = { id:'x', status:'Deep diligence', received:'2026-10-01', history:[{ at:'2026-10-05', what:'status → Deep diligence' }] };
const ck = L.wsChecklist(ws0, Object.assign({}, dl, { checks:L.wsTick(dl, 'Deep diligence', 'Customer references', true, 'A. Partner') }));
ok('a checklist item is ticked with who and when', ck.find(c => c.item === 'Customer references').done && ck.find(c => c.item === 'Customer references').by === 'A. Partner' && !ck.find(c => c.item === 'Legal and cap table').done);
ok('time in the stage is measured against its target', L.wsStageAge(ws0, dl, Date.parse('2026-11-23')).late === true);

/* ── the committee ── */
section = 'committee';
const icws = (ic) => L.wsNormalize(Object.assign(L.wsNew('IC'), { ic:Object.assign({ members:[{ name:'Ana', role:'Managing partner', mp:true, chair:true }, { name:'Ben', role:'Partner' }, { name:'Cy', role:'Partner' }, { name:'Dee', role:'Venture partner' }, { name:'Eve', role:'Advisor', vote:false }], quorum:3 }, ic) }));
const V = (...a) => a.map(([member, vote, extra]) => Object.assign({ member, vote }, extra || {}));
const W1 = icws({ rule:'majority' });
ok('settings: members with roles, quorum, rule, conflicts, tie and conditions', W1.ic.members.length === 5 && W1.ic.quorum === 3 && W1.ic.rule === 'majority' && W1.ic.conflicts === 'recuse' && W1.ic.tie === 'declined' && W1.ic.conditions === 'yes');
ok('simple majority: 3 for, 1 against is approved', L.wsIcTally(W1, V(['Ana', 'yes'], ['Ben', 'yes'], ['Cy', 'yes'], ['Dee', 'no'])).result === 'approved');
const tie = L.wsIcTally(W1, V(['Ana', 'yes'], ['Ben', 'yes'], ['Cy', 'no'], ['Dee', 'no']));
ok('a tie declines by default, and says why', tie.result === 'declined' && /Tie, 2 for and 2 against/.test(tie.why), tie);
ok('a tie with "the chair decides" follows the chair', L.wsIcTally(icws({ tie:'chair' }), V(['Ana', 'yes'], ['Ben', 'yes'], ['Cy', 'no'], ['Dee', 'no'])).result === 'approved');
ok('a tie with "vote again" asks for a new vote', L.wsIcTally(icws({ tie:'revote' }), V(['Ana', 'yes'], ['Ben', 'no'], ['Cy', 'yes'], ['Dee', 'no'])).result === 'tie_revote');
const rec = L.wsIcTally(W1, V(['Ana', 'yes'], ['Ben', 'yes', { conflict:true }], ['Cy', 'no'], ['Dee', 'yes']));
ok('a member with a declared conflict is recused: not counted, not in the quorum', rec.recused.includes('Ben') && rec.present === 3 && rec.yes === 2 && rec.result === 'approved', rec);
ok('recusals can break the quorum', L.wsIcTally(W1, V(['Ana', 'yes'], ['Ben', 'recused'], ['Cy', 'yes', { conflict:true }])).result === 'no_quorum');
const cond = L.wsIcTally(W1, V(['Ana', 'conditions', { conditionsText:'Reference calls with 3 customers' }], ['Ben', 'yes'], ['Cy', 'no']));
ok('a pass with conditions (counted as yes) gives "Approved with conditions" and keeps the conditions', cond.result === 'approved_conditions' && cond.conditionsList[0].text === 'Reference calls with 3 customers', cond);
ok('a pass with conditions counted as no can decline', L.wsIcTally(icws({ conditions:'no' }), V(['Ana', 'conditions'], ['Ben', 'yes'], ['Cy', 'no'])).result === 'declined');
ok('supermajority needs two thirds', L.wsIcTally(icws({ rule:'supermajority' }), V(['Ana', 'yes'], ['Ben', 'yes'], ['Cy', 'no'])).result === 'approved' && L.wsIcTally(icws({ rule:'supermajority' }), V(['Ana', 'yes'], ['Ben', 'yes'], ['Cy', 'no'], ['Dee', 'no'])).result === 'declined');
ok('unanimous fails on one no', L.wsIcTally(icws({ rule:'unanimous' }), V(['Ana', 'yes'], ['Ben', 'yes'], ['Cy', 'no'])).result === 'declined');
const veto = L.wsIcTally(icws({ rule:'mp_veto' }), V(['Ana', 'no'], ['Ben', 'yes'], ['Cy', 'yes'], ['Dee', 'yes']));
ok('the managing partner can veto', veto.result === 'declined' && /Vetoed/.test(veto.why));
ok('abstentions count for the quorum but not as votes', L.wsIcTally(W1, V(['Ana', 'yes'], ['Ben', 'abstain'], ['Cy', 'abstain'])).result === 'approved');

/* ── importing an existing process document ── */
section = 'import';
const doc = `Our investment process
Sourcing
- Referrals from founders and angels
- Inbound through the website
Screening
We check each deck against the thesis within a week.
- Thesis fit
- Stage and ticket size
First meeting
- Founder call with a partner
Due diligence
- Financial model review
- Three customer references
- Legal review of the cap table
Investment committee
Decisions need a quorum of 3 partners. Approval is by a two-thirds majority. A partner with a conflict must recuse. In case of a tie, the chair decides.
Term sheet
- Negotiate terms
Closing
- Legal documents and wire
Portfolio monitoring
- Quarterly board reporting`;
const imp = L.wsImportProcess(doc, ws0);
ok('headings are mapped onto the stages', ['Sourcing', 'Thesis screen', 'First call', 'Deep diligence', 'IC vote', 'Term sheet', 'Close', 'Post-investment monitoring'].every(s => imp.stages[s]), Object.keys(imp.stages));
ok('bullets become checklist items of their stage', imp.stages['Deep diligence'].checklist.length === 3 && /customer references/.test(imp.stages['Deep diligence'].checklist[1]));
ok('a sentence under a heading becomes its goal', /within a week/.test(imp.stages['Thesis screen'].goal));
ok('the committee rules are recognised (quorum, two thirds, recusal, chair on a tie)', imp.ic.quorum === 3 && imp.ic.rule === 'supermajority' && imp.ic.conflicts === 'recuse' && imp.ic.tie === 'chair', imp.ic);
const applied = L.wsApplyImport(ws0, imp, { stages:['Deep diligence'], ic:true });
ok('only what the investor confirms is applied', applied.pipeline.stages['Deep diligence'].checklist[0] === 'Financial model review' && applied.pipeline.stages['Sourcing'].checklist[0] !== 'Referrals from founders and angels' && applied.ic.rule === 'supermajority');

/* ── the LP-facing due diligence process document ── */
section = 'process document';
const ddp = L.wsDdpHTML(applied, '2026-11-23');
ok('it is marked LP-facing with its date', /LP-FACING · Data as of 2026-11-23/.test(ddp));
ok('it has the flowchart, each stage and the committee rules', /The process at a glance/.test(ddp) && /Deep diligence/.test(ddp) && /two thirds/i.test(ddp) && /recused/.test(ddp) && /chair decides/.test(ddp));
ok('it explains evidence-first scoring factually: no AI in the core', /contains no artificial intelligence in its scoring/.test(ddp) && /does not\./.test(ddp));
ok('it names no person and no company (roles only)', !/Ana|Ben|Cy|Dee/.test(L.wsDdpHTML(icws({}), '2026-11-23')));

/* ── anonymization: 35 tricky cases, each must be caught ── */
section = 'anonymization';
const D = { id:'d1', company:'Brightloom', founders:['Lena Varga', 'Marc Brandt'], email:'lena@brightloom.io', website:'https://brightloom.io', sector:'hr', facts:{ src:{ sector:{ word:'payroll' } } } };
const O = { id:'d2', company:'Quietfield', founders:['Ada Lind'], sector:'climate', facts:{ src:{} } };
const all = [D, O];
const flags = t => L.wsLpFlags({ description:t, fit:'', subsector:'Payroll' }, D, all);
const CASES = [
  ['Brightloom builds payroll software for restaurants.', 'company name'], ['BRIGHTLOOM is a payroll tool.', 'company name'], ['Bright Loom is a payroll tool.', 'company name'],
  ['The company was founded by Lena Varga, a former payroll lead.', 'founder name'], ['The CEO, Varga, previously ran a payroll team.', 'founder name'], ['Engineering is led by marc, a co-founder.', 'founder name'],
  ['Contact lena@brightloom.io for the deck.', 'e-mail'], ['See brightloom.io for details.', 'web address'], ['A product page is at https://www.payrolly.com/pricing today.', 'web address'],
  ['The team posts as @brightloomhq on social media.', 'social handle'], ['Their logo is a blue loom.', 'logo'], ['The company has reached $2.4M ARR.', 'exact figure'],
  ['It is raising €3.5 million.', 'exact figure'], ['Valued at 40m USD in its last round.', 'exact figure'], ['It serves 1,200 customers.', 'exact figure'],
  ['The app has 350k users.', 'exact figure'], ['A team of 42 employees.', 'exact figure'], ['Net revenue retention of 134%.', 'exact figure'],
  ['The company was founded in 2019 by two engineers.', 'founding date'], ['Customers include Carrefour and others.', 'named customer or investor'], ['The company is backed by Sequoia Capital.', 'named customer or investor'],
  ['It has partnered with Deutsche Bahn on scheduling.', 'named customer or investor'], ['The tool is used by Spotify engineers.', 'named customer or investor'], ['A team of ex-Google engineers.', 'named customer or investor'],
  ['A payroll startup in Lyon.', 'location'], ['The company is based in Germany.', 'location'], ['It competes with Quietfield.', 'company name'],
  ['Ada Lind advises the team.', 'founder name'], ['Their product, PayFlow, automates payroll.', 'proper name'], ['Payroll for bakeries in Bordeaux.', 'unusual combination'],
  ['It runs on Stripe and Notion.', 'proper name'], ['It won the TechCrunch Disrupt award.', 'proper name'], ['Revenue grew 3x to 2 million dollars.', 'exact figure'],
  ['It serves 12 hospitals across the region.', 'exact figure'], ['It is running a pilot with NHS trusts.', 'named customer or investor'],
];
let caught = 0; const missed = [];
for (const [t, kind] of CASES) { const f = flags(t); if (f.some(x => x.kind === kind)) caught++; else missed.push([t, kind, f.map(x => x.kind + ':' + x.match)]); }
ok(`all ${CASES.length} tricky cases are caught with the right kind of flag`, caught === CASES.length && CASES.length >= 30, missed);
ok('every flag carries a safer wording or says to remove it', CASES.every(([t]) => flags(t).every(f => typeof f.suggest === 'string' && f.why)));
const CLEAN = ['A seed-stage payroll software company selling to small and medium businesses, based in Europe.', 'Strong growth and retention; capital-efficient.', 'Matches the fund\'s focus on sector, stage and geography.', 'An early-stage company in HR and future of work (recruiting), selling to mid-market companies, based in North America.'];
ok('clean, general wording raises no flag', CLEAN.every(t => !flags(t).length), CLEAN.map(t => flags(t).map(f => f.kind + ':' + f.match)));
const fx = L.wsLpFix('The company has reached $2.4M ARR.', flags('The company has reached $2.4M ARR.')[0]);
ok('"apply the suggestion" rewrites the text with a range', /\$1M to \$3M ARR/.test(fx) && !/2\.4/.test(fx), fx);
let threw = false; try { L.wsLpAccept(L.wsNew('x'), D, flags('Brightloom')[0], ''); } catch (e) { threw = true; }
ok('accepting a flag needs a reviewer name', threw);
const acc = L.wsLpAccept(L.wsNew('x'), D, flags('It is running a pilot with NHS trusts.').find(f => f.kind === 'named customer or investor'), 'C. Reviewer');
ok('an accepted flag is closed for that entry and logged with who and when', L.wsLpOpenFlags({ description:'It is running a pilot with NHS trusts.', fit:'', subsector:'Payroll' }, acc.deal, all).every(f => f.kind !== 'named customer or investor') && acc.log[0].by === 'C. Reviewer' && acc.log[0].at);

/* ── the corpus through the process, the committee and both exports ── */
section = 'corpus';
const FX = join(root, 'tests', 'fixtures', 'workspaces'), plan = JSON.parse(readFileSync(join(FX, 'plan.json'), 'utf8'));
let ws = L.wsNew('Investor C (fake): future of work and B2B', { pipeline:'ddp', scorecard:'profit_durability' });
ws.thesis = Object.assign(ws.thesis, { stages:['seed', 'a'], sectors:['hr', 'fintech', 'ai', 'b2b_software', 'edtech', 'climate', 'health', 'logistics', 'security', 'devtools'], exclusions:['crypto'] });
ws.ic = { members:[{ name:'Ana', role:'Managing partner', mp:true, chair:true }, { name:'Ben', role:'Partner' }, { name:'Cy', role:'Partner' }, { name:'Dee', role:'Venture partner' }], quorum:3, rule:'majority', conflicts:'recuse', tie:'declined', conditions:'yes' };
ws = L.wsNormalize(ws);
const ctx = { ws, deals:[], connector:null, who:'test' };
for (const p of plan) { const r = await L.wsProcessItem(ctx, { source:'import', received:new Date(Date.parse('2026-10-01') + p.i * 864e5 / 2).toISOString(), meta:{}, files:p.files.map(f => ({ name:f.split('/').pop(), bytes:new Uint8Array(readFileSync(join(FX, f))) })) }); const i = ctx.deals.findIndex(x => x.id === r.deal.id); if (i >= 0) ctx.deals[i] = r.deal; else ctx.deals.push(r.deal); }
const live = ctx.deals.filter(d => !d.mergedInto);
ok('56 companies start in Sourcing', live.length === 56 && live.every(d => d.status === 'Sourcing'));
/* move them through the stages: in-thesis ones further */
const st = ws.pipeline.statuses; let k = 0;
for (const d of live) { const target = d.thesis.result === 'out' ? 'Passed' : st[Math.min(5, 1 + (k++ % 5))]; d.history = (d.history || []).concat([{ at:'2026-11-10', what:'status → ' + target }]); d.status = target; }
const atVote = live.filter(d => d.status === 'IC vote');
ok('several companies reach the IC vote', atVote.length >= 4, atVote.length);
const votes = [V(['Ana', 'yes'], ['Ben', 'yes'], ['Cy', 'no'], ['Dee', 'no'])/* tie */, V(['Ana', 'yes'], ['Ben', 'yes', { conflict:true }], ['Cy', 'yes'], ['Dee', 'no'])/* recusal */, V(['Ana', 'conditions', { conditionsText:'Reference calls with 3 customers before the term sheet' }], ['Ben', 'yes'], ['Cy', 'no'], ['Dee', 'yes'])/* conditions */, V(['Ana', 'yes'], ['Ben', 'recused'])/* no quorum */];
const after = atVote.slice(0, 4).map((d, i) => L.wsIcRecord(ws, Object.assign({}, d, { memo:{ url:'https://docs.google.com/document/d/memo' + i + '/edit', at:'2026-11-20' } }), votes[i], 'Ana'));
ok('the tie is declined and the company moves to Passed', after[0].ic.result === 'declined' && after[0].status === 'Passed');
ok('the recusal is recorded and the vote approved: the company moves to Term sheet', after[1].ic.result === 'approved' && after[1].ic.votes.find(v => v.member === 'Ben').conflict && after[1].status === 'Term sheet');
ok('the pass with conditions keeps its conditions and moves on', after[2].ic.result === 'approved_conditions' && /Reference calls/.test(after[2].ic.votes[0].conditionsText) && after[2].status === 'Term sheet');
ok('no quorum leaves the company where it is', after[3].ic.result === 'no_quorum' && after[3].status === 'IC vote');
ok('each vote records who, how, when, and links the IC memo', after.every(d => d.ic.votes.every(v => v.member && v.vote && v.at) && d.ic.memo && /memo/.test(d.ic.memo.url)));
ok('the IC decision and date go to the master sheet columns', L.wsFieldValue(ws, after[2], null, 'icDecision').startsWith('Approved with conditions: Reference calls') && L.wsFieldValue(ws, after[2], null, 'icDate') === new Date().toISOString().slice(0, 10));
ok('the history says what the committee decided', after.every(d => /IC vote:/.test(d.history.slice(-1)[0].what)));
after.forEach(d => { const i = ctx.deals.findIndex(x => x.id === d.id); ctx.deals[i] = d; });
/* the anonymized pipeline */
const ents = L.wsLpEntries(ws, ctx.deals, {});
ok('every company not out of thesis gets an entry with a code name', ents.length === live.filter(d => d.thesis.result !== 'out').length && ents.every(e => /^[A-Za-z0-9]{1,6}-\d{2}$/.test(e.code)), ents.length);
const fow = L.wsLpEntries(ws, ctx.deals, { sector:'hr' });
ok('a filter keeps only future of work, coded FoW-01, FoW-02…', fow.length >= 3 && fow.every(e => /^FoW-\d{2}$/.test(e.code)) && new Set(fow.map(e => e.code)).size === fow.length, fow.map(e => e.code));
ok('round sizes and valuations are ranges, geography is a region', ents.every(e => !/\d{4}/.test(e.round) && /under| to |over|not disclosed/.test(e.round) && /under| to |over|not disclosed/.test(e.valuation) && !/France|Germany|Paris|Berlin|London|Toronto/.test(e.region)));
const byId = Object.fromEntries(ctx.deals.map(d => [d.id, d]));
const flagged = ents.map(e => ({ e, f:L.wsLpOpenFlags(e, byId[e.id], ctx.deals) })).filter(x => x.f.length);
ok('the generated descriptions pass the anonymization check', flagged.length === 0, flagged.slice(0, 3).map(x => [x.e.code, x.e.description, x.f.map(f => f.kind + ':' + f.match)]));
/* an investor rewrites one description badly: the export is blocked until it is fixed or accepted */
const bad = fow[0], badDeal = byId[bad.id]; badDeal.lp = { description:`${badDeal.company} sells payroll software to 340 restaurants in Paris; customers include Accor.` };
const e2 = L.wsLpEntries(ws, ctx.deals, { sector:'hr' }).find(e => e.id === bad.id), f2 = L.wsLpOpenFlags(e2, badDeal, ctx.deals);
ok('a rewritten description with a name, a count, a city and a customer blocks the export', ['company name', 'exact figure', 'location', 'named customer or investor'].every(k => f2.some(f => f.kind === k)), f2.map(f => f.kind));
let fixed = e2.description; for (const f of f2) fixed = L.wsLpFix(fixed, f);
badDeal.lp.description = fixed;
const e3 = L.wsLpEntries(ws, ctx.deals, { sector:'hr' }).find(e => e.id === bad.id);
ok('applying the suggestions clears every flag', !L.wsLpOpenFlags(e3, badDeal, ctx.deals).length, [fixed, L.wsLpOpenFlags(e3, badDeal, ctx.deals).map(f => f.kind + ':' + f.match)]);
/* the exports: no internal field, ever */
ctx.deals.forEach(d => { d.notes = [{ by:'Ben', at:'2026-11-12', text:'Internal: founder seemed evasive about churn numbers' }]; d.reviewer = 'Reviewer Rhea'; d.nextAction = 'Call the CFO about the data room'; d.followOwner = 'Owner Otto'; });
const html = L.wsLpHTML(ws, L.wsLpEntries(ws, ctx.deals, {}), '2026-11-23'), csv = L.wsLpCSV(ws, L.wsLpEntries(ws, ctx.deals, {}), '2026-11-23');
ok('the LP document and sheet are marked LP-facing with a data-as-of date', /LP-FACING · Data as of 2026-11-23/.test(html) && /LP-FACING · Data as of 2026-11-23/.test(csv));
const leaks = L.wsLpLeaks(html + csv, ctx.deals);
ok('no internal value appears: company names, founders, e-mails, web addresses, notes, reviewers, next actions, deck quotes', leaks.length === 0, leaks.slice(0, 5));
ok('the tier column appears only when the investor turns it on', !/Priority tier/.test(html) && /Priority tier/.test(L.wsLpHTML(L.wsNormalize(Object.assign({}, ws, { lp:{ showTier:true } })), ents, '2026-11-23')));
ok('the process document carries no company at all', L.wsLpLeaks(L.wsDdpHTML(ws, '2026-11-23'), ctx.deals).length === 0);

let failed = 0; console.log('Due diligence process, IC and LP pipeline');
for (const t of results) { if (t.ok) console.log('  ✓', t.name); else { failed++; console.log('  ✗', t.name, '—', JSON.stringify(t.detail === undefined ? '' : t.detail).slice(0, 700)); } }
console.log(`\n${results.length - failed}/${results.length} passed`); process.exitCode = failed ? 1 : 0;
