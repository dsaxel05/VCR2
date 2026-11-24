/* ═══════════════════════════════════════════════════════════════
   DUE DILIGENCE PROCESS, INVESTMENT COMMITTEE AND LP PIPELINE — pure (no DOM, no network, no AI).
   The process stages ARE the workspace's pipeline statuses (one source of truth): each status carries a goal, a checklist, an
   owner role, a target time and the evidence VCR2 provides at that stage. The committee settings and every vote live with the
   workspace and the company. The LP outputs are built from a whitelist of generic fields only, and nothing leaves before an
   anonymization check has passed or a named reviewer has accepted each flag.
   ═══════════════════════════════════════════════════════════════ */
const WS_EVIDENCE_KINDS = [['metrics', 'Extracted metrics with their sources'], ['checks', 'Consistency checks (stated vs computed)'], ['scorecard', 'Scorecard (engine and reviewer scores)'], ['questions', 'Ranked diligence questions'], ['thesis', 'Thesis check with reasons']];
const WS_DDP_STAGES = [
  ['Sourcing', 'Bring in companies from the website form, the forwarding address, referrals and the team\'s own network.', ['Logged with its source', 'Deck or materials received', 'Duplicate check done'], 'Investment team', 3, ['thesis']],
  ['Thesis screen', 'Decide quickly whether the company fits the fund\'s thesis.', ['Thesis fit', 'Stage and round size in range', 'Missing information requested'], 'Analyst', 7, ['thesis', 'metrics']],
  ['First call', 'Meet the founders; test the team, the problem and the early evidence.', ['First call held', 'Team assessment', 'Market and timing view', 'Data request sent'], 'Partner', 14, ['metrics', 'scorecard', 'questions']],
  ['Deep diligence', 'Verify the figures against the company\'s own records and test the main risks.', ['Financials reconciled', 'Customer references', 'Market', 'Team references', 'Legal and cap table', 'Technology and security'], 'Deal lead', 30, ['metrics', 'checks', 'scorecard', 'questions']],
  ['IC memo', 'Write the investment memo from the evidence and the open questions.', ['Memo drafted', 'Scorecard complete', 'Risks and conditions listed'], 'Deal lead', 7, ['scorecard', 'checks', 'questions']],
  ['IC vote', 'The investment committee decides under its voting rules.', ['Quorum present', 'Conflicts declared', 'Vote recorded'], 'Investment committee', 7, ['scorecard']],
  ['Term sheet', 'Agree the terms.', ['Term sheet sent', 'Terms agreed'], 'Partner', 21, []],
  ['Close', 'Confirmatory diligence, legal documents and funding.', ['Confirmatory diligence', 'Legal documents signed', 'Funds wired'], 'Operations', 30, ['checks']],
  ['Post-investment monitoring', 'Follow the company after the investment.', ['Board seat or observer arranged', 'Quarterly reporting set up', 'KPIs tracked against the plan'], 'Partner', 90, ['metrics', 'checks']],
];
WS_PIPELINES.ddp = { id:'ddp', name:'Full due diligence process (sourcing to monitoring)', statuses:WS_DDP_STAGES.map(s => s[0]).concat(['Passed']), waiting:['Sourcing', 'Thesis screen'], closed:['Passed', 'Post-investment monitoring'],
  stages:Object.fromEntries(WS_DDP_STAGES.map(([n, goal, checklist, owner, days, evidence]) => [n, { goal, checklist, owner, days, evidence }])) };
function wsNormStages(st, statuses) {
  const out = {};
  for (const s of statuses) {
    const x = st && st[s] && typeof st[s] === 'object' ? st[s] : {};
    out[s] = { goal:wsClip(x.goal, 400), checklist:wsNormList(x.checklist, null, 20).map(c => wsClip(c, 120)), owner:wsClip(x.owner, 60), days:wsNum(x.days, 0, 365), evidence:wsNormList(x.evidence, e => WS_EVIDENCE_KINDS.some(k => k[0] === e), 5) };
  }
  return out;
}
const WS_IC_RULES = { majority:'Simple majority of the votes cast', supermajority:'Supermajority (two thirds of the votes cast)', unanimous:'Unanimous', mp_veto:'Majority, with a veto for the managing partner' };
function wsNormIc(ic) {
  const r = ic && typeof ic === 'object' ? ic : {};
  const members = (Array.isArray(r.members) ? r.members : []).slice(0, 20).map(m => ({ name:wsClip(m && m.name, 80), role:wsClip(m && m.role, 60), mp:!!(m && m.mp), chair:!!(m && m.chair), vote:m && m.vote === false ? false : true })).filter(m => m.name);
  return { members, quorum:Math.round(wsNum(r.quorum, 1, 20) ?? Math.max(1, Math.ceil(members.filter(m => m.vote).length / 2) + (members.length ? 0 : 1))),
    rule:WS_IC_RULES[r.rule] ? r.rule : 'majority', conflicts:r.conflicts === 'disclose' ? 'disclose' : 'recuse', tie:['declined', 'chair', 'revote'].includes(r.tie) ? r.tie : 'declined',
    conditions:r.conditions === 'no' ? 'no' : 'yes', notes:wsClip(r.notes, 1500) };
}
const WS_LP_PREFIX = { fintech:'FIN', insurtech:'INS', health:'HLT', bio:'BIO', ai:'AI', devtools:'DEV', security:'SEC', climate:'CLM', edtech:'EDU', commerce:'COM', logistics:'LOG', hr:'FoW', proptech:'PRP', legal:'LGL', consumer:'CNS', media:'MED', mobility:'MOB', food:'AGR', deeptech:'DTK', crypto:'CRY', gov:'GOV', b2b_software:'B2B' };
function wsNormLp(lp) {
  const r = lp && typeof lp === 'object' ? lp : {};
  return { prefixes:Object.fromEntries(Object.entries(r.prefixes || {}).filter(([k, v]) => WS_SECTORS.some(s => s.id === k) && /^[A-Za-z0-9]{1,6}$/.test(v || ''))), showTier:!!r.showTier,
    exports:Object.fromEntries(Object.entries(r.exports || {}).filter(([k, v]) => /^(lpDoc|lpSheet|lpPdf|ddpDoc|ddpPdf)$/.test(k) && v && /^[A-Za-z0-9_-]{10,200}$/.test(v.id || '')).map(([k, v]) => [k, { id:v.id, url:/^https:\/\//.test(v.url || '') ? wsClip(v.url, 400) : '', at:wsClip(v.at, 30) }])),
    log:(Array.isArray(r.log) ? r.log : []).slice(-500).map(x => ({ at:wsClip(x.at, 30), by:wsClip(x.by, 80), code:wsClip(x.code, 20), kind:wsClip(x.kind, 30), text:wsClip(x.text, 200) })) };
}
const wsStage = (ws, status) => (ws.pipeline.stages || {})[status] || { goal:'', checklist:[], owner:'', days:null, evidence:[] };
/* the checklist of the company's current stage, with what is done (by whom, when) */
function wsChecklist(ws, deal, status) {
  const s = status || deal.status, st = wsStage(ws, s), done = ((deal.checks || {})[s]) || {};
  return st.checklist.map(item => Object.assign({ item }, done[item] || { done:false }));
}
function wsTick(deal, status, item, on, who) { const c = Object.assign({}, deal.checks || {}); c[status] = Object.assign({}, c[status] || {}); c[status][item] = on ? { done:true, by:wsClip(who, 80), at:new Date().toISOString() } : { done:false }; return c; }
/* days in the current stage against its target */
function wsStageAge(ws, deal, now) { const h = (deal.history || []).slice().reverse().find(x => /^status → /.test(x.what || '')); const since = wsTime(h ? h.at : deal.received); const d = since == null ? null : Math.floor(((now || Date.now()) - since) / wsDay); const t = wsStage(ws, deal.status).days; return { days:d, target:t, late:d != null && t != null && t > 0 && d > t }; }

/* ── the investment committee: one tally function for every rule ── */
const WS_VOTES = { yes:'Yes', conditions:'Yes, with conditions', no:'No', abstain:'Abstain', recused:'Recused (conflict)' };
function wsIcTally(ws, votes) {
  const ic = ws.ic || wsNormIc({}), vs = (votes || []).filter(v => v && v.member && WS_VOTES[v.vote]);
  const conflict = v => v.conflict && ic.conflicts === 'recuse';
  const counted = vs.filter(v => v.vote !== 'recused' && !conflict(v)), recused = vs.filter(v => v.vote === 'recused' || conflict(v));
  const yes = counted.filter(v => v.vote === 'yes').length, cond = counted.filter(v => v.vote === 'conditions').length, no = counted.filter(v => v.vote === 'no').length, abst = counted.filter(v => v.vote === 'abstain').length;
  const Y = yes + (ic.conditions === 'yes' ? cond : 0), N = no + (ic.conditions === 'no' ? cond : 0), cast = Y + N, present = counted.length;
  const out = { yes, conditions:cond, no, abstain:abst, recused:recused.map(v => v.member), present, quorum:ic.quorum, rule:ic.rule, conditionsList:vs.filter(v => v.vote === 'conditions' && v.conditionsText).map(v => ({ member:v.member, text:v.conditionsText })) };
  const res = (result, why) => Object.assign(out, { result, why, label:{ approved:'Approved', approved_conditions:'Approved with conditions', declined:'Declined', no_quorum:'No quorum', tie_revote:'Tie: vote again' }[result] });
  if (present < ic.quorum) return res('no_quorum', `${present} voting member${present === 1 ? '' : 's'} present (recused members excluded); the quorum is ${ic.quorum}.`);
  if (!cast) return res('declined', 'Every member present abstained.');
  const pass = r => r ? res(cond && ic.conditions === 'yes' ? 'approved_conditions' : 'approved', out.why || `${Y} for, ${N} against (${WS_IC_RULES[ic.rule].toLowerCase()}).`) : res('declined', out.why || `${Y} for, ${N} against (${WS_IC_RULES[ic.rule].toLowerCase()}).`);
  if (ic.rule === 'unanimous') return pass(N === 0 && Y > 0);
  if (ic.rule === 'supermajority') return pass(Y >= Math.ceil(cast * 2 / 3));
  if (ic.rule === 'mp_veto') {
    const mpNo = counted.find(v => v.vote === 'no' && (ic.members.find(m => m.name === v.member) || {}).mp);
    if (mpNo) { out.why = `Vetoed by the managing partner (${mpNo.member}).`; return pass(false); }
  }
  if (Y === N) {
    if (ic.tie === 'chair') { const ch = counted.find(v => (ic.members.find(m => m.name === v.member) || {}).chair); if (ch) { out.why = `Tie, ${Y} for and ${N} against; the chair (${ch.member}) decides.`; return pass(['yes', 'conditions'].includes(ch.vote) && !(ch.vote === 'conditions' && ic.conditions === 'no')); } }
    if (ic.tie === 'revote') return res('tie_revote', `Tie, ${Y} for and ${N} against: the committee votes again.`);
    out.why = `Tie, ${Y} for and ${N} against: a tie declines the investment.`; return pass(false);
  }
  return pass(Y > N);
}
/* the vote is stored with the company, linked to its memo; the status moves on (approved) or to the closed status (declined) */
function wsIcRecord(ws, deal, votes, who) {
  const t = wsIcTally(ws, votes), at = new Date().toISOString();
  const rec = { at, by:wsClip(who, 80), votes:votes.map(v => ({ member:wsClip(v.member, 80), vote:v.vote, conflict:!!v.conflict, conditionsText:wsClip(v.conditionsText, 500), at:v.at || at })), result:t.result, label:t.label, why:t.why, memo:deal.memo ? { url:deal.memo.url, at:deal.memo.at } : null };
  const d = Object.assign({}, deal, { ic:rec, icHistory:(deal.icHistory || []).concat(deal.ic ? [deal.ic] : []) });
  const st = ws.pipeline.statuses, i = st.indexOf(deal.status), vi = st.findIndex(s => /\bIC\b.*vote|vote/i.test(s)), from = vi >= 0 ? vi : i;
  if (t.result === 'approved' || t.result === 'approved_conditions') { const nx = st[from + 1]; if (nx && !ws.pipeline.closed.includes(nx)) d.status = nx; }
  else if (t.result === 'declined') d.status = ws.pipeline.closed[0] || deal.status;
  d.history = (deal.history || []).concat([{ at, what:`IC vote: ${t.label}${t.why ? '. ' + t.why : ''}`, by:wsClip(who, 80) }]);
  return d;
}

/* ── import an existing process document: headings and bullets mapped onto stages, IC rules recognised; the investor confirms ── */
const WS_STAGE_WORDS = [['Sourcing', /sourc|inbound|deal flow|referral|origination/], ['Thesis screen', /screen|thesis|triage|first look|qualif/], ['First call', /first (call|meeting)|intro(duction)? (call|meeting)|founder meeting|pitch meeting/],
  ['Deep diligence', /due diligence|deep dive|diligence|data room|reference/], ['IC memo', /memo|investment paper|write-?up/], ['IC vote', /committee|\bic\b|vote|decision/], ['Term sheet', /term sheet|terms|negotiat/],
  ['Close', /clos(e|ing)|completion|legal documents|wire|funding/], ['Post-investment monitoring', /monitor|portfolio|post-?investment|board|reporting/]];
function wsImportProcess(text, ws) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 2000);
  const stages = {}, unmatched = [], ic = {}; let cur = null;
  const statusFor = h => { const n = h.toLowerCase(); const hit = WS_STAGE_WORDS.find(([, re]) => re.test(n)); if (!hit) return null; const want = hit[0]; return ws.pipeline.statuses.find(s => s.toLowerCase() === want.toLowerCase()) || ws.pipeline.statuses.find(s => hit[1].test(s.toLowerCase())) || null; };
  for (const l of lines) {
    const bullet = /^([-*•·▪◦]|\d{1,2}[.)]|[a-z][.)])\s+/.test(l), body = l.replace(/^([-*•·▪◦]|\d{1,2}[.)]|[a-z][.)])\s+/, '').replace(/^#+\s*/, '').replace(/\*\*/g, '');
    const lo = body.toLowerCase();
    let m;
    if ((m = /quorum[^0-9]{0,30}(\d{1,2})|(\d{1,2})\s+(?:members?|partners?)[^.]{0,30}quorum/.exec(lo))) ic.quorum = +(m[1] || m[2]);
    if (/unanim/.test(lo)) ic.rule = 'unanimous'; else if (/two[- ]thirds|2\/3|supermajority|super-majority/.test(lo)) ic.rule = 'supermajority'; else if (/veto/.test(lo) && /managing partner|mp\b/.test(lo)) ic.rule = 'mp_veto'; else if (/simple majority|majority vote|majority of/.test(lo) && !ic.rule) ic.rule = 'majority';
    if (/recus|abstain from|conflict/.test(lo)) ic.conflicts = /disclos/.test(lo) && !/recus/.test(lo) ? 'disclose' : 'recuse';
    if (/\btie\b|deadlock|equal(ly)? split/.test(lo)) ic.tie = /chair/.test(lo) ? 'chair' : /re-?vote|again/.test(lo) ? 'revote' : 'declined';
    if (/condition/.test(lo) && /(count|treated|considered) as (a )?(yes|no|approval)/.test(lo)) ic.conditions = /as (a )?(no)/.test(lo) ? 'no' : 'yes';
    const isHead = !bullet && body.length <= 70 && !/[.;]$/.test(body);
    const st = isHead ? statusFor(body) : null;
    if (st) { cur = st; stages[cur] = stages[cur] || { goal:'', checklist:[] }; continue; }
    if (cur && bullet) { if (stages[cur].checklist.length < 20) stages[cur].checklist.push(wsClip(body, 120)); continue; }
    if (cur && !bullet && !stages[cur].goal && body.length > 20) { stages[cur].goal = wsClip(body, 400); continue; }
    if (!cur && bullet) { const s2 = statusFor(body); if (s2) { stages[s2] = stages[s2] || { goal:'', checklist:[] }; stages[s2].checklist.push(wsClip(body, 120)); continue; } }
    unmatched.push(body);
  }
  return { stages, ic, unmatched:unmatched.slice(0, 50) };
}
/* applying a confirmed import: only the stages and rules the investor ticked */
function wsApplyImport(ws, imp, pick) {
  const w = JSON.parse(JSON.stringify(ws));
  for (const [s, v] of Object.entries(imp.stages)) { if (pick && pick.stages && !pick.stages.includes(s)) continue; const cur = w.pipeline.stages[s] || {}; w.pipeline.stages[s] = Object.assign({}, cur, { goal:v.goal || cur.goal, checklist:v.checklist.length ? v.checklist : cur.checklist }); }
  if (!pick || pick.ic) w.ic = Object.assign({}, w.ic, imp.ic);
  return wsNormalize(w);
}

/* ── the LP-facing "Due Diligence Process" document: stages, committee, evidence; no company, no internal note ── */
function wsDdpHTML(ws, asOf) {
  const st = ws.pipeline.statuses.filter(s => !ws.pipeline.closed.includes(s) || s === ws.pipeline.statuses[ws.pipeline.statuses.length - 1] && false);
  const flow = ws.pipeline.statuses.filter(s => s !== 'Passed');
  const ic = ws.ic, voters = ic.members.filter(m => m.vote);
  const row = flow.map((s, i) => `<td style="border:1px solid #b8954a;padding:6px 8px;text-align:center;font-size:9pt;background:#f6f1e4"><b>${i + 1}. ${esc(s)}</b></td>${i < flow.length - 1 ? '<td style="text-align:center;font-size:12pt;color:#7a5c1e">→</td>' : ''}`);
  const half = Math.ceil(row.length / 2);
  const ev = k => (WS_EVIDENCE_KINDS.find(x => x[0] === k) || [k, k])[1].toLowerCase();
  return `<!doctype html><html><head><meta charset="utf-8"><title>Due diligence process</title><style>body{font-family:Georgia,serif;color:#1c2430}h1{font-size:22pt;color:#14213d}h2{font-size:14pt;color:#7a5c1e;border-bottom:1px solid #d9cba8;padding-bottom:2pt}p,li,td{font-size:10.5pt;line-height:1.45}</style></head><body>
<p style="font-size:9pt;color:#7a5c1e">LP-FACING · Data as of ${esc(asOf)}</p>
<h1>${esc(ws.name)}: due diligence process</h1>
<p>How we find, evaluate and decide on investments, from the first contact to the years after we invest.</p>
<h2>The process at a glance</h2>
<table style="border-collapse:collapse"><tr>${row.slice(0, half).join('')}</tr></table><table style="border-collapse:collapse;margin-top:6pt"><tr>${row.slice(half).join('')}</tr></table>
<h2>Each stage</h2>
${flow.map((s, i) => { const x = wsStage(ws, s); return `<h3>${i + 1}. ${esc(s)}</h3>${x.goal ? `<p>${esc(x.goal)}</p>` : ''}${x.checklist.length ? `<ul>${x.checklist.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}<p style="font-size:9.5pt;color:#555">${[x.owner ? 'Owner: ' + esc(x.owner) : '', x.days ? 'Target: ' + x.days + ' days' : '', x.evidence.length ? 'Evidence used: ' + x.evidence.map(ev).join('; ') : ''].filter(Boolean).join(' · ')}</p>`; }).join('\n')}
<h2>Investment committee</h2>
${ic.members.length ? `<ul>${ic.members.map(m => `<li>${esc(m.role || 'Member')}${m.mp ? ' (managing partner)' : ''}${m.chair ? ' (chair)' : ''}${m.vote ? '' : ', non-voting'}</li>`).join('')}</ul>` : '<p>Composition to be confirmed.</p>'}
<p><b>Voting members:</b> ${voters.length}. <b>Quorum:</b> ${ic.quorum} voting member${ic.quorum === 1 ? '' : 's'} present. <b>Rule:</b> ${esc(WS_IC_RULES[ic.rule])}.</p>
<p><b>Conflicts of interest:</b> ${ic.conflicts === 'recuse' ? 'a member with a conflict declares it and is recused: they do not vote and do not count towards the quorum.' : 'a member with a conflict declares it before the vote; the declaration is recorded with the vote.'}</p>
<p><b>Tie:</b> ${ic.tie === 'chair' ? 'the chair decides.' : ic.tie === 'revote' ? 'the committee discusses and votes again.' : 'a tie means the investment is declined.'} <b>Approval with conditions:</b> ${ic.conditions === 'yes' ? 'counts as a vote in favour; the conditions are recorded and must be met before the term sheet or closing.' : 'counts as a vote against until the conditions are met.'}</p>
${ic.notes ? `<p>${esc(ic.notes)}</p>` : ''}
<h2>How evidence-first scoring fits in</h2>
<p>We use VCR2 to read company materials and structure the evidence. VCR2 applies fixed, published rules: it contains no artificial intelligence in its scoring. It extracts the figures a company provides and records where each one comes from (document, page, quote); recomputes the main metrics from the underlying data; runs consistency checks that compare what a company states with what its own data shows; scores each metric against stage-specific thresholds, giving less weight to figures backed only by a deck; and ranks the diligence questions to ask. The same inputs always give the same result, with a run identifier.</p>
<p>Scores support the investment team's judgment; they do not replace it. Qualitative areas (such as team, market and product) are scored by named people, and every score records who set it and when. The investment committee decides; VCR2 does not.</p>
<p style="font-size:8.5pt;color:#777">Prepared with VCR2. This document describes a process; it is not an offer or investment advice.</p>
</body></html>`;
}

/* ── the anonymized pipeline: generic fields only, from a whitelist ── */
const WS_ROUND_BANDS = [[0, 1e6, 'under $1M'], [1e6, 3e6, '$1M to $3M'], [3e6, 7e6, '$3M to $7M'], [7e6, 15e6, '$7M to $15M'], [15e6, 30e6, '$15M to $30M'], [30e6, Infinity, 'over $30M']];
const WS_VAL_BANDS = [[0, 5e6, 'under $5M'], [5e6, 15e6, '$5M to $15M'], [15e6, 40e6, '$15M to $40M'], [40e6, 100e6, '$40M to $100M'], [100e6, Infinity, 'over $100M']];
const wsBand = (v, bands) => v == null || !isFinite(v) || v <= 0 ? 'not disclosed' : (bands.find(b => v >= b[0] && v < b[1]) || bands[bands.length - 1])[2];
const WS_SUB_BAN = /shopify|kubernetes|soc 2|llms?|ci\/cd/i;
function wsSubsector(deal) {
  const w = (((deal.facts || {}).src || {}).sector || {}).word || '';
  if (!w || WS_SUB_BAN.test(w)) return '';
  return w.replace(/\b[a-z]/g, c => c.toUpperCase());
}
const WS_SEGMENTS = [[/mid-?market/i, 'mid-market companies'], [/\bsmbs?\b|small (and medium|businesses)/i, 'small and medium businesses'], [/enterprise/i, 'large enterprises'], [/hospital|clinic/i, 'healthcare providers'], [/teachers|students|school/i, 'education providers'], [/manufactur/i, 'manufacturers'], [/consumer|subscriber/i, 'consumers'], [/developer/i, 'software developers'], [/finance teams|cfo/i, 'finance teams'], [/retail|merchant/i, 'retailers and merchants']];
function wsLpCode(ws, deal, deals) {
  if (deal.lp && deal.lp.code) return deal.lp.code;
  const pre = (ws.lp.prefixes || {})[deal.sector] || WS_LP_PREFIX[deal.sector] || 'GEN';
  const same = deals.filter(d => ((ws.lp.prefixes || {})[d.sector] || WS_LP_PREFIX[d.sector] || 'GEN') === pre).sort((a, b) => (wsTime(a.received) || 0) - (wsTime(b.received) || 0) || (a.id < b.id ? -1 : 1));
  return `${pre}-${String(same.findIndex(d => d.id === deal.id) + 1).padStart(2, '0')}`;
}
/* the default (generated) entry; the investor may rewrite the description and the fit, which are then checked again */
function wsLpEntry(ws, deal, deals) {
  const sec = (WS_SECTORS.find(s => s.id === deal.sector) || {}).n || 'Other', sub = wsSubsector(deal), reg = (WS_REGIONS.find(r => r.id === (WS_COUNTRIES.find(c => c.id === deal.geo) || {}).r) || {}).n || 'Not disclosed';
  const model = (WS_MODELS.find(m => m.id === deal.model) || {}).n, text = JSON.stringify((deal.facts || {}).src || {}) + ' ' + (deal.facts && deal.facts.sectors ? '' : '');
  const seg = (WS_SEGMENTS.find(([re]) => re.test(text)) || [0, ''])[1];
  const st = WS_STAGE_N[deal.stage] || 'Early-stage';
  const acr = x => String(x).toLowerCase().replace(/\b(ai|api|sdk|hr|b2b|d2c|ev|kyc|aml|crm|erp|llm|iot)\b/g, a => a.toUpperCase()).replace(/\bsaas\b/g, 'SaaS').replace(/\bsmbs\b/g, 'SMBs');
  const stw = { 'Pre-seed':'pre-seed', Seed:'seed-stage', 'Early-stage':'early-stage' }[st] || st, sub2 = sub && !sec.toLowerCase().includes(sub.toLowerCase()) ? sub : '';
  const gen = `${/^[AEIOU]/i.test(stw) ? 'An' : 'A'} ${stw} ${model ? acr(model) + ' ' : ''}company in ${acr(sec)}${sub2 ? ` (${acr(sub2)})` : ''}${seg ? `, selling to ${seg}` : ''}, based in ${reg === 'Not disclosed' ? 'an undisclosed region' : reg.replace(/ \(.*\)$/, '')}.`;
  const okR = ((deal.thesis || {}).reasons || []).filter(r => r.ok === true).map(r => r.rule);
  const fitGen = okR.length ? `Matches the fund's focus on ${[okR.includes('sector') && 'sector', okR.includes('stage') && 'stage', okR.includes('geo') && 'geography', okR.includes('round') && 'round size', okR.includes('model') && 'business model'].filter(Boolean).join(', ') || 'its criteria'}.` : 'Under review against the fund\'s thesis.';
  const s = wsScoreOf(ws, deal), own = deal.lp || {};
  return { id:deal.id, code:wsLpCode(ws, deal, deals), sector:sec, subsector:sub, stage:st, round:wsBand(deal.raise ?? (deal.facts || {}).raise, WS_ROUND_BANDS), valuation:wsBand(+(((deal.input || {}).vals || {}).round_pre_money) || null, WS_VAL_BANDS),
    region:reg, description:own.description || gen, fit:own.fit || fitGen, pipelineStage:deal.status || '', tier:ws.lp.showTier ? (s.tier || '') : '', received:wsIso(wsTime(deal.received) || Date.now()), sectorId:deal.sector || '', stageId:deal.stage || '', tierRaw:s.tier || s.provisionalTier || '' };
}
const WS_LP_FIELDS = ['code', 'sector', 'subsector', 'stage', 'round', 'valuation', 'region', 'description', 'fit', 'pipelineStage', 'tier'];
function wsLpEntries(ws, deals, f) {
  f = f || {}; const live = deals.filter(d => !d.mergedInto && !(d.lp && d.lp.exclude) && d.thesis && d.thesis.result !== 'out');
  return live.map(d => wsLpEntry(ws, d, live)).filter(e => (!f.sector || e.sectorId === f.sector) && (!f.stage || e.stageId === f.stage) && (!f.tier || e.tierRaw === f.tier) && (!f.from || e.received >= f.from) && (!f.to || e.received <= f.to) && (!f.ids || f.ids.includes(e.id)))
    .sort((a, b) => a.code < b.code ? -1 : 1);
}

/* ── the anonymization check (blocking): everything that could identify a company, with a safer wording ── */
const WS_GENERIC_CAPS = new Set(('A An The This That It Its Our We They In On At For With From By To Of And Or But As Is Are Was Be Under Over Not No Yes Based Selling Matches Series Seed Pre Pre-seed Early Late Stage B2B B2C SaaS AI ML API APIs LLM IoT HR IT EU US UK USA EMEA APAC LATAM CEO CTO COO CFO VP IC LP LPs GP ARR MRR NRR GRR KPI KPIs GDPR ESG ' +
  'North South East West Central Europe European America American Asia Asian Pacific Middle Africa African Latin Nordic Nordics Western Eastern Northern Southern January February March April May June July August September October November December Q1 Q2 Q3 Q4 ' +
  WS_SECTORS.map(s => s.n + ' ' + s.kw.join(' ').replace(/\b[a-z]/g, c => c.toUpperCase())).join(' ') + ' ' + WS_REGIONS.map(r => r.n).join(' ') + ' ' + WS_MODELS.map(m => m.n).join(' ')).split(/[\s(),&]+/).filter(Boolean));
const WS_CITIES = WS_COUNTRIES.flatMap(c => c.kw.filter(k => k.length > 3 && !/^(united|usa|u\.s\.|uk|uae|french|german|spanish|italian|dutch|swiss|nordic|nordics|england|scotland|delaware c-corp)$/.test(k)).map(k => ({ k, region:((WS_REGIONS.find(r => r.id === c.r) || {}).n || '').replace(/ \(.*\)$/, '') })));
const WS_RE_ESC = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function wsLpFlags(entry, deal, deals) {
  const flags = [], seen = new Set();
  const add = (field, kind, match, suggest, why) => { const k = field + '|' + kind + '|' + String(match).toLowerCase(); if (seen.has(k)) return; seen.add(k); flags.push({ field, kind, match:String(match), suggest, why, key:k }); };
  const fields = ['description', 'fit', 'subsector'];
  const names = [];
  const pushName = (n, kind) => { const s = String(n || '').trim(); if (s.length >= 3) names.push({ s, kind }); };
  for (const d of deals) { pushName(d.company, d.id === deal.id ? 'company' : 'another company'); (d.founders || []).forEach(f => { pushName(f, 'founder'); String(f).split(/\s+/).filter(x => x.length >= 3).forEach(x => pushName(x, 'founder')); }); }
  const dom = wsDomain(deal.website) || wsDomain(deal.email);
  for (const field of fields) {
    const t = String(entry[field] || ''); if (!t) continue;
    for (const n of names) { const re = new RegExp('(^|[^\\p{L}])' + WS_RE_ESC(n.s) + '(?=$|[^\\p{L}])', 'iu'); const m = re.exec(t); if (m) add(field, n.kind === 'founder' ? 'founder name' : 'company name', n.s, n.kind === 'founder' ? 'a founder' : 'the company', n.kind === 'founder' ? 'A founder\'s name identifies the company.' : `The name of ${n.kind === 'company' ? 'this' : 'another'} company.`); }
    if (deal.company) { const key = wsKey(deal.company); const squash = t.toLowerCase().replace(/[^a-z0-9]/g, ''); if (key.length >= 4 && squash.includes(key) && !flags.some(f => f.kind === 'company name' && f.field === field)) add(field, 'company name', deal.company, 'the company', 'The company name appears, written differently.'); }
    let m;
    const em = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi; while ((m = em.exec(t))) add(field, 'e-mail', m[0], '', 'An e-mail address identifies the company.');
    const url = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]{2,63}\.(?:com|io|ai|co|app|net|org|dev|tech|fr|de|uk|es|it|nl|se|ch|eu|us|ca|in|xyz|so|me)\b(?:\/\S*)?/gi; while ((m = url.exec(t))) if (!/@/.test(t.slice(Math.max(0, m.index - 1), m.index))) add(field, 'web address', m[0], '', 'A web address identifies the company.');
    if (dom && t.toLowerCase().includes(dom.split('.')[0]) && dom.split('.')[0].length >= 4) add(field, 'web address', dom.split('.')[0], 'the company', 'Part of the company\'s web address.');
    const handle = /(^|\s)@[A-Za-z0-9_]{2,30}\b/g; while ((m = handle.exec(t))) add(field, 'social handle', m[0].trim(), '', 'A social media handle identifies the company.');
    if (/\blogo\b/i.test(t)) add(field, 'logo', 'logo', '', 'Logos must not appear in an LP-facing document.');
    const money = /(?:[$€£]\s?\d[\d.,]*\s?(?:k|m|bn|b|million|billion|thousand)?\b|\b\d[\d.,]*\s?(?:k|m|bn|million|billion|thousand)\s?(?:[$€£]|usd|eur|gbp|dollars|euros)?(?=\s|$|[.,;])|\b\d[\d.,]*\s?(?:usd|eur|gbp|dollars|euros)\b)/gi;
    while ((m = money.exec(t))) add(field, 'exact figure', m[0].trim(), wsLpRangeFor(m[0]), 'An exact amount (revenue, funding, valuation) can identify the company: give a range.');
    const count = /\b\d[\d.,]*\s?(?:\+\s?)?(?:k\s)?(?!(?:months|years|weeks|days|hours|minutes|times|founders|pillars|stages|rounds)\b)(?:[a-z][a-z-]{2,}s|people|staff)\b/gi;
    while ((m = count.exec(t))) add(field, 'exact figure', m[0].trim(), 'a growing number of ' + m[0].trim().split(/\s+/).pop(), 'An exact count (users, customers, staff) can identify the company.');
    const pct = /\b\d{1,3}(?:[.,]\d+)?\s?%/g; while ((m = pct.exec(t))) add(field, 'exact figure', m[0], 'strong', 'An exact percentage can identify the company: describe it qualitatively.');
    const yr = /\b(?:founded|started|launched|established|incorporated|since)\s+(?:in\s+)?(19|20)\d{2}\b/gi; while ((m = yr.exec(t))) add(field, 'founding date', m[0], 'recently founded', 'A founding year narrows the company down.');
    const rel = /\b(?:customers? (?:include|including|such as|like)|clients? (?:include|including|such as)|(?:backed|funded|invested|led) by|investors? (?:include|including|are)|partner(?:ed|ship)? with|used by|works with|trusted by|pilots? with|contract with|spun out of|former(?:ly)? at)\s+|\bex-/gi;
    while ((m = rel.exec(t))) { const nm = /^\s*([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})/.exec(t.slice(m.index + m[0].length)); if (nm) add(field, 'named customer or investor', nm[1], /investor|backed|funded|invested|led/i.test(m[0]) ? 'existing investors' : /ex-|former|spun/i.test(m[0]) ? 'a large company' : 'large customers', 'A named customer, investor or employer can identify the company.'); }
    for (const c of WS_CITIES) { const re = new RegExp('(^|[^\\p{L}])' + WS_RE_ESC(c.k) + '(?=$|[^\\p{L}])', 'iu'); const mm = re.exec(t); if (mm) add(field, 'location', mm[0].trim(), c.region || 'its region', 'Only the region may appear (no city or country).'); }
    /* proper names that are not generic words: a product, a customer, a person */
    if (field === 'subsector') continue;
    const words = t.split(/(?<=[.!?])\s+/);
    for (const sent of words) {
      const toks = sent.split(/\s+/);
      toks.forEach((w, i) => {
        const clean = w.replace(/^[("'“‘]+|[)"'”’.,;:!?]+$/g, '');
        if (!/^[A-Z][a-zA-Z0-9&'-]{1,}$/.test(clean) && !/^[a-z]+[A-Z][a-zA-Z]+$/.test(clean)) return;
        if (WS_GENERIC_CAPS.has(clean) || WS_GENERIC_CAPS.has(clean.replace(/s$/, ''))) return;
        if (i === 0 && !/^[a-z]+[A-Z]/.test(clean) && !/[A-Z].*[A-Z]/.test(clean.slice(1))) return;   /* the first word of a sentence */
        if (/^[A-Z]{2,5}$/.test(clean) && !/^[A-Z]+$/.test(clean.slice(0, 1) + clean.slice(1))) return;
        if (flags.some(f => f.field === field && String(f.match).toLowerCase().includes(clean.toLowerCase()))) return;
        add(field, 'proper name', clean, 'a generic description', 'A proper name (a product, a customer, a person) can identify the company.');
      });
    }
  }
  /* an unusual combination: a sub-sector that only this company has, together with anything finer than a region */
  const sameSub = deals.filter(d => d.id !== deal.id && wsSubsector(d) && wsSubsector(d) === wsSubsector(deal)).length;
  if (wsSubsector(deal) && !sameSub && flags.some(f => f.kind === 'location')) add('subsector', 'unusual combination', `${entry.subsector} + a city`, 'a broader sub-sector', 'A niche and a city together may point to one company.');
  return flags;
}
function wsLpRangeFor(s) {
  const n = parseFloat(String(s).replace(/[^\d.]/g, '')), mult = /bn|billion|b\b/i.test(s) ? 1e9 : /m|million/i.test(s) ? 1e6 : /k|thousand/i.test(s) ? 1e3 : 1;
  const v = n * mult; return isFinite(v) && v > 0 ? wsBand(v, WS_ROUND_BANDS).replace('under', 'under').replace(/\$/g, /€/.test(s) ? '€' : /£/.test(s) ? '£' : '$') : 'a range';
}
/* the flags still open for an entry: fixed by editing, or accepted by a named reviewer (logged) */
function wsLpOpenFlags(entry, deal, deals) { const acc = new Set(((deal.lp || {}).accepted || []).map(a => a.key)); return wsLpFlags(entry, deal, deals).filter(f => !acc.has(f.key)); }
function wsLpAccept(ws, deal, flag, who) {
  if (!String(who || '').trim()) throw new Error('A reviewer name is needed to accept a flag.');
  const at = new Date().toISOString();
  const lp = Object.assign({}, deal.lp || {}); lp.accepted = (lp.accepted || []).concat([{ key:flag.key, kind:flag.kind, match:flag.match, by:wsClip(who, 80), at }]);
  const log = (ws.lp.log || []).concat([{ at, by:wsClip(who, 80), code:'', kind:flag.kind, text:`accepted "${wsClip(flag.match, 80)}" in ${flag.field}` }]);
  return { deal:Object.assign({}, deal, { lp }), log };
}
function wsLpFix(text, flag) { if (!flag.match) return text; const re = new RegExp(WS_RE_ESC(flag.match), 'gi'); return String(text).replace(re, flag.suggest || '').replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').replace(/\(\s*\)/g, '').trim(); }
/* the export guard: an LP-facing output may contain only the whitelisted fields, and no internal value at all */
function wsLpLeaks(text, deals) {
  const out = [], t = String(text).toLowerCase();
  for (const d of deals) {
    const vals = [d.company, d.email, d.website && wsDomain(d.website), ...(d.founders || []), d.reviewer, d.followOwner, d.leadPartner, d.referral, d.nextAction, ...(d.notes || []).map(n => n.text), ...Object.values((d.facts || {}).src || {}).map(s => s && s.quote).filter(q => q && q.length >= 20 && /\s/.test(q))].filter(v => v && String(v).trim().length >= 4);
    for (const v of vals) if (t.includes(String(v).toLowerCase().slice(0, 120))) out.push({ id:d.id, value:String(v).slice(0, 60) });
  }
  return out;
}
function wsLpTable(ws, entries) { const cols = WS_LP_FIELDS.filter(c => c !== 'tier' || ws.lp.showTier); return { cols, rows:entries.map(e => cols.map(c => e[c] || '')) }; }
const WS_LP_HEAD = { code:'Code', sector:'Sector', subsector:'Sub-sector', stage:'Stage', round:'Round size', valuation:'Valuation', region:'Region', description:'Description', fit:'Why it fits the thesis', pipelineStage:'Pipeline stage', tier:'Priority tier' };
function wsLpHTML(ws, entries, asOf) {
  const T = wsLpTable(ws, entries);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Pipeline overview</title><style>body{font-family:Georgia,serif;color:#1c2430}h1{font-size:20pt;color:#14213d}td,th{font-size:9pt;border:1px solid #d9cba8;padding:4px 6px;vertical-align:top;text-align:left}th{background:#f6f1e4}</style></head><body>
<p style="font-size:9pt;color:#7a5c1e">LP-FACING · Data as of ${esc(asOf)}</p><h1>${esc(ws.name)}: pipeline overview</h1>
<p>${entries.length} compan${entries.length === 1 ? 'y' : 'ies'} currently in the pipeline, anonymized. Code names, ranges and regions only; no company is named.</p>
<table style="border-collapse:collapse"><tr>${T.cols.map(c => `<th>${esc(WS_LP_HEAD[c])}</th>`).join('')}</tr>${T.rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table>
<p style="font-size:8.5pt;color:#777">Ranges, regions and descriptions are deliberately general. Not an offer or investment advice. Prepared with VCR2.</p></body></html>`;
}
function wsLpCSV(ws, entries, asOf) { const T = wsLpTable(ws, entries), q = v => '"' + String(v).replace(/"/g, '""') + '"'; return [q('LP-FACING · Data as of ' + asOf)].concat([T.cols.map(c => q(WS_LP_HEAD[c])).join(',')], T.rows.map(r => r.map(q).join(','))).join('\n') + '\n'; }
