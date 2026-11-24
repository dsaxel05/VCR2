/* ═══════════════════════════════════════════════════════════════
   WORKSPACES (deal flow) — the pure engine. No DOM, no network, no AI.
   A workspace belongs to one investor (fund, angel, syndicate, accelerator) and holds everything that is set per investor:
   the thesis, the scorecard, the pipeline, the sheet mapping, the memo template and the notifications. Nothing here is
   specific to one fund. Every value a rule uses carries its source (file, place, quote), and the same inputs always give
   the same output.
   ═══════════════════════════════════════════════════════════════ */
const WS_VERSION = 1;
const WS_ID_OK = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const wsClip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);
const wsNum = (v, lo, hi) => { const n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
const wsSlug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
const wsRound1 = x => Math.round(x * 10) / 10;
const wsDay = 864e5;
const wsIso = t => new Date(t).toISOString().slice(0, 10);
const wsNewId = () => { const a = crypto.getRandomValues(new Uint8Array(12)); return Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 20); };
const wsTime = v => { if (v == null || v === '') return null; const t = typeof v === 'number' ? v : Date.parse(v); return isFinite(t) ? t : null; };

/* ── sectors, geographies and business models a thesis can name; detection keywords for each (weight 1 per mention) ── */
const WS_SECTORS = [
  { id:'fintech', n:'Fintech', kw:['fintech', 'payments', 'payment', 'banking', 'neobank', 'lending', 'credit card', 'card issuing', 'remittance', 'treasury', 'accounts payable', 'invoicing', 'wealth management', 'brokerage', 'open banking', 'kyc', 'aml'] },
  { id:'insurtech', n:'Insurtech', kw:['insurtech', 'insurance', 'insurer', 'underwriting', 'claims processing', 'policyholder', 'reinsurance'] },
  { id:'health', n:'Health and medtech', kw:['healthtech', 'health tech', 'digital health', 'medtech', 'patients', 'patient', 'clinical', 'clinicians', 'hospital', 'hospitals', 'healthcare', 'physicians', 'telehealth', 'medical device', 'care providers'] },
  { id:'bio', n:'Biotech and life sciences', kw:['biotech', 'drug discovery', 'therapeutics', 'life sciences', 'preclinical', 'molecule', 'genomics', 'protein'] },
  { id:'ai', n:'AI and machine learning', kw:['artificial intelligence', 'machine learning', 'generative ai', 'genai', 'llm', 'llms', 'large language model', 'ai-native', 'ai agents', 'ai agent', 'computer vision', 'foundation model', 'inference'] },
  { id:'devtools', n:'Developer tools and infrastructure', kw:['developer', 'developers', 'devops', 'api', 'sdk', 'open source', 'open-source', 'infrastructure', 'observability', 'database', 'cloud infrastructure', 'ci/cd', 'kubernetes'] },
  { id:'security', n:'Cybersecurity', kw:['cybersecurity', 'security', 'threat detection', 'zero trust', 'identity and access', 'siem', 'soc 2', 'phishing', 'ransomware', 'vulnerability'] },
  { id:'climate', n:'Climate and energy', kw:['climate', 'carbon', 'decarbonization', 'decarbonisation', 'renewable', 'solar', 'battery', 'batteries', 'energy storage', 'emissions', 'net zero', 'grid', 'ev charging', 'hydrogen'] },
  { id:'edtech', n:'Education', kw:['edtech', 'education', 'students', 'teachers', 'learning platform', 'e-learning', 'upskilling', 'tutoring', 'school', 'university'] },
  { id:'commerce', n:'E-commerce and retail', kw:['e-commerce', 'ecommerce', 'retail', 'retailers', 'shopify', 'merchants', 'd2c', 'direct-to-consumer', 'checkout', 'online store'] },
  { id:'logistics', n:'Logistics and supply chain', kw:['logistics', 'supply chain', 'freight', 'shipping', 'warehouse', 'fleet', 'last-mile', 'last mile', 'procurement', 'trucking'] },
  { id:'hr', n:'HR and future of work', kw:['hr tech', 'hrtech', 'recruiting', 'hiring', 'payroll', 'employees', 'workforce', 'talent', 'human resources', 'employee benefits'] },
  { id:'proptech', n:'Real estate and construction', kw:['proptech', 'real estate', 'property', 'construction', 'landlords', 'tenants', 'mortgage', 'building management'] },
  { id:'legal', n:'Legal and compliance', kw:['legaltech', 'legal tech', 'law firms', 'lawyers', 'contracts', 'compliance', 'regtech', 'e-discovery'] },
  { id:'consumer', n:'Consumer', kw:['consumer', 'consumers', 'app store', 'creators', 'social', 'dating', 'wellness', 'fitness', 'subscribers'] },
  { id:'media', n:'Media and gaming', kw:['gaming', 'games', 'game studio', 'esports', 'media', 'streaming', 'content creators', 'publishers', 'advertising'] },
  { id:'mobility', n:'Mobility and transport', kw:['mobility', 'ride-hailing', 'micromobility', 'autonomous driving', 'electric vehicles', 'transportation', 'automotive'] },
  { id:'food', n:'Food and agriculture', kw:['agtech', 'agritech', 'agriculture', 'farmers', 'farming', 'food tech', 'foodtech', 'restaurants', 'grocery', 'crop'] },
  { id:'deeptech', n:'Deep tech and hardware', kw:['deep tech', 'deeptech', 'hardware', 'semiconductor', 'semiconductors', 'robotics', 'quantum', 'photonics', 'space', 'satellite', 'drones', 'manufacturing'] },
  { id:'crypto', n:'Crypto and web3', kw:['crypto', 'blockchain', 'web3', 'token', 'tokens', 'defi', 'nft', 'stablecoin', 'smart contract'] },
  { id:'gov', n:'Government and defence', kw:['govtech', 'government', 'public sector', 'defense', 'defence', 'military', 'dual-use'] },
  { id:'b2b_software', n:'B2B software (horizontal)', kw:['b2b', 'saas', 'enterprise software', 'workflow', 'smbs', 'mid-market', 'crm', 'erp', 'productivity'] },
];
/* countries (with their region) and the words that place a company there */
const WS_COUNTRIES = [
  { id:'us', n:'United States', r:'north_america', kw:['united states', 'usa', 'u.s.', 'new york', 'nyc', 'san francisco', 'bay area', 'silicon valley', 'palo alto', 'boston', 'austin', 'seattle', 'los angeles', 'chicago', 'miami', 'denver', 'delaware c-corp'] },
  { id:'ca', n:'Canada', r:'north_america', kw:['canada', 'toronto', 'montreal', 'montréal', 'vancouver', 'ottawa'] },
  { id:'uk', n:'United Kingdom', r:'europe', kw:['united kingdom', 'uk', 'london', 'manchester', 'edinburgh', 'bristol', 'england', 'scotland'] },
  { id:'fr', n:'France', r:'europe', kw:['france', 'paris', 'lyon', 'marseille', 'toulouse', 'bordeaux', 'nantes', 'french'] },
  { id:'de', n:'Germany', r:'europe', kw:['germany', 'berlin', 'munich', 'münchen', 'hamburg', 'frankfurt', 'cologne', 'german'] },
  { id:'es', n:'Spain', r:'europe', kw:['spain', 'madrid', 'barcelona', 'valencia', 'spanish'] },
  { id:'it', n:'Italy', r:'europe', kw:['italy', 'milan', 'milano', 'rome', 'turin', 'italian'] },
  { id:'nl', n:'Netherlands', r:'europe', kw:['netherlands', 'amsterdam', 'rotterdam', 'utrecht', 'dutch'] },
  { id:'be', n:'Belgium', r:'europe', kw:['belgium', 'brussels', 'antwerp', 'ghent'] },
  { id:'ch', n:'Switzerland', r:'europe', kw:['switzerland', 'zurich', 'zürich', 'geneva', 'lausanne', 'swiss'] },
  { id:'ie', n:'Ireland', r:'europe', kw:['ireland', 'dublin', 'cork'] },
  { id:'pt', n:'Portugal', r:'europe', kw:['portugal', 'lisbon', 'porto'] },
  { id:'nordics', n:'Nordics', r:'europe', kw:['sweden', 'stockholm', 'denmark', 'copenhagen', 'norway', 'oslo', 'finland', 'helsinki', 'iceland', 'nordic', 'nordics'] },
  { id:'cee', n:'Central and Eastern Europe', r:'europe', kw:['poland', 'warsaw', 'krakow', 'czech', 'prague', 'romania', 'bucharest', 'estonia', 'tallinn', 'lithuania', 'vilnius', 'hungary', 'budapest', 'austria', 'vienna'] },
  { id:'il', n:'Israel', r:'mena', kw:['israel', 'tel aviv', 'jerusalem', 'haifa'] },
  { id:'ae', n:'United Arab Emirates', r:'mena', kw:['uae', 'dubai', 'abu dhabi', 'united arab emirates'] },
  { id:'in', n:'India', r:'apac', kw:['india', 'bangalore', 'bengaluru', 'mumbai', 'delhi', 'hyderabad', 'pune', 'chennai'] },
  { id:'sg', n:'Singapore', r:'apac', kw:['singapore'] },
  { id:'jp', n:'Japan', r:'apac', kw:['japan', 'tokyo', 'osaka'] },
  { id:'au', n:'Australia and New Zealand', r:'apac', kw:['australia', 'sydney', 'melbourne', 'new zealand', 'auckland'] },
  { id:'cn', n:'China', r:'apac', kw:['china', 'beijing', 'shanghai', 'shenzhen', 'hong kong'] },
  { id:'br', n:'Brazil', r:'latam', kw:['brazil', 'são paulo', 'sao paulo', 'rio de janeiro'] },
  { id:'mx', n:'Mexico', r:'latam', kw:['mexico', 'mexico city', 'guadalajara', 'monterrey'] },
  { id:'latam_other', n:'Rest of Latin America', r:'latam', kw:['argentina', 'buenos aires', 'colombia', 'bogotá', 'bogota', 'chile', 'santiago', 'peru', 'lima'] },
  { id:'africa', n:'Africa', r:'africa', kw:['nigeria', 'lagos', 'kenya', 'nairobi', 'south africa', 'cape town', 'johannesburg', 'egypt', 'cairo', 'ghana', 'accra'] },
];
const WS_REGIONS = [
  { id:'north_america', n:'North America' }, { id:'europe', n:'Europe (incl. UK and Switzerland)' }, { id:'mena', n:'Middle East and North Africa' },
  { id:'apac', n:'Asia-Pacific' }, { id:'latam', n:'Latin America' }, { id:'africa', n:'Africa' },
];
const WS_TLD = { fr:'fr', de:'de', es:'es', it:'it', nl:'nl', be:'be', ch:'ch', ie:'ie', pt:'pt', se:'nordics', dk:'nordics', no:'nordics', fi:'nordics', uk:'uk', 'co.uk':'uk', il:'il', in:'in', sg:'sg', jp:'jp', au:'au', br:'br', mx:'mx', ca:'ca', pl:'cee', cz:'cee', ee:'cee', at:'cee' };
const WS_MODELS = [
  { id:'saas', n:'B2B SaaS', kw:['saas', 'subscription', 'arr', 'seats', 'per seat', 'annual contracts', 'mrr'] },
  { id:'ai_app', n:'AI application', kw:['llm', 'generative ai', 'genai', 'ai-native', 'ai agents', 'inference cost', 'foundation model', 'copilot'] },
  { id:'marketplace', n:'Marketplace', kw:['marketplace', 'two-sided', 'gmv', 'take rate', 'buyers and sellers', 'supply and demand', 'commission'] },
  { id:'fintech', n:'Fintech (regulated)', kw:['payments', 'lending', 'interchange', 'banking license', 'e-money', 'loan book', 'payment volume', 'tpv'] },
  { id:'usage', n:'Usage-based', kw:['usage-based', 'pay as you go', 'pay-as-you-go', 'per api call', 'consumption-based', 'metered'] },
  { id:'consumer_sub', n:'Consumer subscription', kw:['consumer app', 'subscribers', 'app store', 'monthly subscribers', 'premium tier', 'freemium'] },
  { id:'hardware', n:'Hardware', kw:['hardware', 'device', 'devices', 'units shipped', 'bill of materials', 'manufacturing'] },
  { id:'services', n:'Tech-enabled services', kw:['managed service', 'services revenue', 'agency', 'consulting', 'tech-enabled services'] },
];
const WS_STAGE_IDS = ['preseed', 'seed', 'a', 'b'];
const WS_STAGE_N = { preseed:'Pre-seed', seed:'Seed', a:'Series A', b:'Series B+' };

/* ── scorecards: ready-made templates. Pillar kinds: "metrics" (scored by the engine from derived metrics and checks),
   "dimension" (the engine's own dimension score), "reviewer" (a person scores it; the engine shows evidence and questions) ── */
const WS_PROFIT_METRICS = [
  { key:'gross_margin', w:20 }, { key:'gross_margin_ai', w:20 }, { key:'contrib_margin', w:15 }, { key:'burn_multiple', w:20 },
  { key:'cac_payback', w:15 }, { key:'ltv_cac', w:10 }, { key:'nrr', w:15 }, { key:'grr', w:10 }, { key:'rule40', w:15 }, { key:'runway', w:5 },
];
const WS_SCORECARDS = {
  profit_durability: { id:'profit_durability', name:'Profitability & Durability', threshold:3.5,
    tiers:[{ name:'Tier 1', min:4 }, { name:'Tier 2', min:3.25 }, { name:'Tier 3', min:0 }],
    pillars:[
      { id:'team', name:'Team & Execution', weight:25, kind:'reviewer', evidence:['domain_years', 'team_tenure', 'founder_conc', 'eng_turnover', 'headcount_eff', 'arr_per_fte'],
        guide:'1 = no relevant experience or execution record; 3 = relevant experience, some proof of execution; 5 = exceptional founder-market fit and a record of shipping and selling.',
        ask:['What did each founder build or sell before, and what did they learn from it?', 'Which commitments made at the last round were met, and which were missed?', 'Who are the next three hires, and who owns hiring them?'] },
      { id:'profitability', name:'10-Year Profitability & Unit Economics', weight:25, kind:'metrics', metrics:WS_PROFIT_METRICS, minMetrics:3,
        checks:['gm_check', 'burn_check', 'burn_bridge', 'stated_burn_multiple', 'stated_cac_payback', 'stated_ltv_cac', 'stated_nrr', 'stated_grr', 'stated_rule40', 'stated_runway', 'waterfall', 'services'],
        guide:'Scored by the engine from gross margin, burn multiple, CAC payback, LTV:CAC, NRR, GRR, Rule of 40 and runway, capped when a consistency check on those figures fails.',
        ask:['What gross margin does the company reach at scale, and which cost lines get it there?', 'In which month does the company reach break-even on the current plan, and on what assumptions?'] },
      { id:'moat', name:'M&A Durability & Exit Moat', weight:20, kind:'reviewer', evidence:['top5_conc', 'win_vs_primary', 'grr', 'logo_ret', 'liq_pref', 'safe_overhang'],
        guide:'1 = easy to copy, no natural acquirer; 3 = some switching costs, a few plausible acquirers; 5 = hard-to-replicate asset (data, network, distribution) and several strategic acquirers.',
        ask:['Who are the five most likely acquirers, and why would each pay a premium?', 'What would a well-funded competitor need to copy, and how long would it take?'] },
      { id:'market', name:'Market Size & Timing', weight:15, kind:'reviewer', evidence:['tam_bottomup', 'penetration', 'sam', 'win_vs_primary', 'growth_yoy'],
        guide:'1 = small or shrinking market, no timing trigger; 3 = large enough market, plausible timing; 5 = large, growing market with a clear trigger now.',
        ask:['How many target accounts exist, and how many can the company reach in three years?', 'What changed in the last 24 months that makes this possible now?'] },
      { id:'product', name:'Product Differentiation', weight:15, kind:'reviewer', evidence:['pmf_score', 'nps', 'uptime', 'p1_incidents', 'seat_util', 'gm_trend'],
        guide:'1 = me-too product; 3 = a clear edge for one segment; 5 = a product customers say they cannot replace, with evidence.',
        ask:['Which feature do customers name first when asked why they bought, and is it hard to copy?', 'What share of users would be very disappointed without the product (survey and sample size)?'] },
    ] },
  vcr2_dimensions: { id:'vcr2_dimensions', name:'VCR2 evidence dimensions', threshold:3.5,
    tiers:[{ name:'Strong', min:4 }, { name:'Mixed', min:3 }, { name:'Weak', min:0 }],
    pillars:[
      { id:'revenue', name:'Revenue quality', weight:25, kind:'dimension', dimension:'revenue' },
      { id:'capital', name:'Capital efficiency', weight:20, kind:'dimension', dimension:'capital' },
      { id:'gtm', name:'Go-to-market', weight:20, kind:'dimension', dimension:'gtm' },
      { id:'team', name:'Team', weight:15, kind:'dimension', dimension:'team' },
      { id:'market', name:'Market and moat', weight:10, kind:'dimension', dimension:'market' },
      { id:'govern', name:'Governance and technical risk', weight:10, kind:'dimension', dimension:'govern' },
    ] },
  seed_basics: { id:'seed_basics', name:'Early-stage basics', threshold:3.5,
    tiers:[{ name:'Priority', min:4 }, { name:'Watch', min:3 }, { name:'Pass', min:0 }],
    pillars:[
      { id:'team', name:'Founders', weight:40, kind:'reviewer', evidence:['domain_years', 'team_tenure', 'founder_conc'], guide:'1 = weak fit; 5 = exceptional founder-market fit.', ask:['Why are these founders the right people to win this market?'] },
      { id:'market', name:'Market', weight:30, kind:'reviewer', evidence:['tam_bottomup', 'penetration'], guide:'1 = small market; 5 = very large, growing market.', ask:['How large is the reachable market, counted bottom-up?'] },
      { id:'traction', name:'Early traction', weight:30, kind:'metrics', metrics:[{ key:'growth_yoy', w:30 }, { key:'nrr', w:20 }, { key:'logo_ret', w:15 }, { key:'burn_multiple', w:20 }, { key:'gross_margin', w:15 }], minMetrics:2,
        checks:['stated_growth', 'stated_nrr', 'waterfall'], guide:'Scored by the engine from growth, retention, burn multiple and gross margin.', ask:['What are the last six months of revenue, month by month?'] },
    ] },
};

/* ── pipelines: presets; every list is editable per workspace ── */
const WS_PIPELINES = {
  intake: { id:'intake', name:'Intake (screen then meet)', statuses:['New', 'Screened', 'Assigned', 'Initial call', 'Moving forward', 'Passed'], waiting:['New'], closed:['Passed'] },
  committee: { id:'committee', name:'Inbound to investment committee', statuses:['Inbound', 'Screened', 'Diligence', 'IC', 'Passed'], waiting:['Inbound'], closed:['Passed'] },
};

/* ── a new workspace, and the cleaning of a stored one (unknown keys dropped, everything clamped) ── */
function wsNew(name, opts) {
  opts = opts || {};
  const card = WS_SCORECARDS[opts.scorecard || 'profit_durability'] || WS_SCORECARDS.profit_durability;
  const pipe = WS_PIPELINES[opts.pipeline || 'intake'] || WS_PIPELINES.intake;
  return wsNormalize({
    v:WS_VERSION, id:opts.id || wsSlug(name) || 'workspace', name:name || 'My workspace',
    thesis:{ stages:[], sectors:[], sectorsOut:[], geos:[], models:[], roundMin:null, roundMax:null, checkMin:null, checkMax:null, exclusions:[], musts:[], strict:'balanced' },
    scorecard:JSON.parse(JSON.stringify(card)), pipeline:JSON.parse(JSON.stringify(pipe)),
    targets:{ waitingDays:7, responseDays:14 },
    notify:{ digest:false, digestDay:1, ack:false, ackSubject:'We received your deck', ackText:'Thank you for sending us your deck. We read every submission and will reply if we would like to know more.' },
    storage:{ provider:'none', folders:{}, sheet:null, memo:{ templateId:'', template:'', auto:false } },
    integrations:{ webhook:'' }, market:'us',
  });
}
function wsNormList(v, ok, max) { return (Array.isArray(v) ? v : []).map(x => wsClip(x, 80)).filter(x => x && (!ok || ok(x))).filter((x, i, a) => a.indexOf(x) === i).slice(0, max || 60); }
function wsNormalize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}, t = r.thesis || {};
  const sectorOk = x => WS_SECTORS.some(s => s.id === x), geoOk = x => WS_COUNTRIES.some(c => c.id === x) || WS_REGIONS.some(g => g.id === x);
  const modelOk = x => WS_MODELS.some(m => m.id === x), stageOk = x => WS_STAGE_IDS.includes(x);
  const musts = (Array.isArray(t.musts) ? t.musts : []).slice(0, 20).map(m => {
    if (!m || typeof m !== 'object') return null;
    if (m.kind === 'metric') { const metric = ['arr', 'raise', 'growth', 'customers', 'gross_margin', 'nrr'].includes(m.metric) ? m.metric : null; const value = wsNum(m.value, -1e12, 1e13); return metric && value != null ? { kind:'metric', metric, op:m.op === '<=' ? '<=' : '>=', value } : null; }
    const text = wsClip(m.text, 120); return text ? { kind:'keyword', text, words:wsNormList(m.words || [], null, 12) } : null;
  }).filter(Boolean);
  const sc = wsNormScorecard(r.scorecard);
  const p = r.pipeline || {}, statuses = wsNormList(p.statuses, null, 12);
  const pipeline = statuses.length >= 2 ? { id:wsClip(p.id, 40) || 'custom', name:wsClip(p.name, 80) || 'Custom', statuses,
    waiting:wsNormList(p.waiting, x => statuses.includes(x), 12), closed:wsNormList(p.closed, x => statuses.includes(x), 12) } : JSON.parse(JSON.stringify(WS_PIPELINES.intake));
  if (!pipeline.waiting.length) pipeline.waiting = [pipeline.statuses[0]];
  pipeline.stages = typeof wsNormStages === 'function' ? wsNormStages(p.stages || (statuses.length >= 2 ? null : WS_PIPELINES.intake.stages), pipeline.statuses) : {};
  const n = r.notify || {}, st = r.storage || {}, sheet = st.sheet && typeof st.sheet === 'object' ? st.sheet : null;
  return {
    v:WS_VERSION, id:WS_ID_OK.test(String(r.id || '')) ? r.id : 'workspace', name:wsClip(r.name, 80) || 'Workspace',
    thesis:{ stages:wsNormList(t.stages, stageOk), sectors:wsNormList(t.sectors, sectorOk), sectorsOut:wsNormList(t.sectorsOut, sectorOk), geos:wsNormList(t.geos, geoOk), models:wsNormList(t.models, modelOk),
      roundMin:wsNum(t.roundMin, 0, 1e12), roundMax:wsNum(t.roundMax, 0, 1e12), checkMin:wsNum(t.checkMin, 0, 1e12), checkMax:wsNum(t.checkMax, 0, 1e12),
      exclusions:wsNormList(t.exclusions, null, 40), musts, strict:['lenient', 'balanced', 'strict'].includes(t.strict) ? t.strict : 'balanced' },
    scorecard:sc, pipeline,
    targets:{ waitingDays:wsNum((r.targets || {}).waitingDays, 1, 365) || 7, responseDays:wsNum((r.targets || {}).responseDays, 1, 365) || 14 },
    notify:{ digest:!!n.digest, digestDay:Math.round(wsNum(n.digestDay, 0, 6) ?? 1), ack:!!n.ack, ackSubject:wsClip(n.ackSubject, 120) || 'We received your deck', ackText:wsClip(n.ackText, 2000) },
    storage:{ provider:['google', 'microsoft', 'none'].includes(st.provider) ? st.provider : 'none',
      folders:Object.fromEntries(Object.entries(st.folders || {}).filter(([k, v]) => /^(root|in|border|out|memos)$/.test(k) && v && typeof v === 'object').map(([k, v]) => [k, { id:wsClip(v.id, 200), name:wsClip(v.name, 200), url:/^https:\/\//.test(v.url || '') ? wsClip(v.url, 400) : '' }])),
      sheet:sheet ? wsNormSheet(sheet) : null,
      memo:{ templateId:wsClip((st.memo || {}).templateId, 200), template:wsClip((st.memo || {}).template, 20000), auto:!!(st.memo || {}).auto } },
    integrations:{ webhook:/^https:\/\/[^\s]{4,300}$/.test((r.integrations || {}).webhook || '') ? r.integrations.webhook : '' },
    market:r.market === 'eu' ? 'eu' : 'us',
    ic:typeof wsNormIc === 'function' ? wsNormIc(r.ic) : {}, lp:typeof wsNormLp === 'function' ? wsNormLp(r.lp) : {},
    intake:(() => { const i = r.intake || {}; return { key:/^[A-Za-z0-9_-]{32,64}$/.test(i.key || '') ? i.key : '', wsKey:/^[a-z0-9]{8,40}$/.test(i.wsKey || '') ? i.wsKey : '',
      address:/^[a-z0-9._+-]{3,64}@[a-z0-9.-]{3,120}$/.test(i.address || '') ? i.address : '', formId:/^[a-z0-9]{8,40}$/.test(i.formId || '') ? i.formId : '' }; })(),
  };
}
function wsNormScorecard(c) {
  const base = WS_SCORECARDS.profit_durability;
  if (!c || typeof c !== 'object' || !Array.isArray(c.pillars) || !c.pillars.length) return JSON.parse(JSON.stringify(base));
  const ids = new Set();
  const pillars = c.pillars.slice(0, 12).map(p => {
    if (!p || typeof p !== 'object') return null;
    let id = wsSlug(p.id || p.name) || 'pillar'; while (ids.has(id)) id += '_2'; ids.add(id);
    const kind = ['metrics', 'dimension', 'reviewer'].includes(p.kind) ? p.kind : 'reviewer';
    const out = { id, name:wsClip(p.name, 80) || id, weight:wsNum(p.weight, 0, 100) ?? 0, kind, guide:wsClip(p.guide, 600), ask:wsNormList(p.ask, null, 8).map(x => wsClip(x, 240)), evidence:wsNormList(p.evidence, x => /^[a-z_][a-z0-9_]{0,40}$/.test(x), 12) };
    if (kind === 'metrics') { out.metrics = (Array.isArray(p.metrics) ? p.metrics : []).filter(m => m && /^[a-z_][a-z0-9_]{0,40}$/.test(m.key)).slice(0, 20).map(m => ({ key:m.key, w:wsNum(m.w, 0, 100) ?? 10 })); out.minMetrics = Math.round(wsNum(p.minMetrics, 1, 10) ?? 3); out.checks = wsNormList(p.checks, x => /^[a-z_][a-z0-9_]{0,40}$/.test(x), 30); }
    if (kind === 'dimension') out.dimension = /^[a-z_]{2,20}$/.test(p.dimension || '') ? p.dimension : 'revenue';
    return out;
  }).filter(Boolean);
  const tiers = (Array.isArray(c.tiers) ? c.tiers : []).slice(0, 6).map(t => ({ name:wsClip(t && t.name, 40), min:wsNum(t && t.min, 0, 5) ?? 0 })).filter(t => t.name).sort((a, b) => b.min - a.min);
  return { id:wsClip(c.id, 40) || 'custom', name:wsClip(c.name, 80) || 'Custom scorecard', threshold:wsNum(c.threshold, 1, 5) ?? 3.5, tiers:tiers.length ? tiers : base.tiers.slice(), pillars };
}
/* the scorecard is usable only when its weights total exactly 100% */
function wsCardProblems(c) {
  const out = [], sum = c.pillars.reduce((s, p) => s + (p.weight || 0), 0);
  if (Math.abs(sum - 100) > 0.001) out.push(`The weights total ${wsRound1(sum)}%: they must total 100%.`);
  if (!c.pillars.length) out.push('Add at least one pillar.');
  c.pillars.filter(p => p.kind === 'metrics' && !(p.metrics || []).length).forEach(p => out.push(`${p.name}: choose at least one metric for the engine.`));
  if (!c.tiers.length) out.push('Add at least one priority tier.');
  return out;
}

/* ── text helpers: every match keeps its place in the document and a short quote ── */
const wsNorm = s => ' ' + String(s || '').toLowerCase().normalize('NFKC').replace(/[’‘]/g, "'").replace(/[^a-z0-9à-ÿ.'&/+-]+/g, ' ').replace(/\s+/g, ' ') + ' ';
const wsQuote = (text, i, len) => { const s = String(text || ''), a = Math.max(0, i - 50), b = Math.min(s.length, i + len + 90); return ((a ? '…' : '') + s.slice(a, b).replace(/\s+/g, ' ').trim() + (b < s.length ? '…' : '')).slice(0, 160); };
/* the readable lines of one document read by Smart fill: [{ text, loc, file, weight }] (titles and first slides weigh more) */
function wsLines(doc, file) {
  const out = [];
  const add = (text, loc, w) => { const t = String(text || '').trim(); if (t) out.push({ text:t.slice(0, 4000), loc:loc || '', file:file || doc.file || '', w }); };
  for (const b of (doc && doc.blocks) || []) {
    const early = /^(slide |page |p\.\s?)[12]\b/.test(b.loc || '') ? 1.5 : 1, head = b.type === 'heading' || b.type === 'meta' ? 1.5 : 1;
    if (b.type === 'table') (b.rows || []).forEach(r => { add(r.filter(Boolean).join(' · '), b.loc, early); out[out.length - 1] && (out[out.length - 1].tbl = true); });
    else add(b.text, b.loc, early * head);
  }
  return out;
}
/* count keyword hits across lines; returns [{ id, score, src }] best first */
function wsDetect(lines, list, boost) {
  const res = [];
  for (const it of list) {
    let score = 0, src = null;
    for (const l of lines) {
      const n = wsNorm(l.text);
      for (const k of it.kw) {
        const needle = ' ' + k + ' ', i = n.indexOf(needle);
        if (i < 0) continue;
        let w = l.w; if (boost) w *= boost(n, k);
        score += w;
        if (!src || w > src.w) { const raw = l.text.toLowerCase().indexOf(k); src = { file:l.file, loc:l.loc, quote:wsQuote(l.text, raw < 0 ? 0 : raw, k.length), w, word:k }; }
      }
    }
    if (score) res.push({ id:it.id, score:wsRound1(score), src:src && { file:src.file, loc:src.loc, quote:src.quote, word:src.word } });
  }
  return res.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}
const WS_HQ = /\b(based in|headquartered in|headquarters|hq|offices? in|incorporated in|located in|siège|basée? à|registered in)\b/;

/* ── facts about a company from its documents (Smart fill reads them), its metadata (form, e-mail) and Smart fill's proposals ── */
function wsFacts(docs, meta, rows) {
  meta = meta || {};
  const lines = []; (docs || []).forEach(d => { if (d && d.doc) wsLines(d.doc, d.file).forEach(l => lines.push(l)); else if (d && d.blocks) wsLines(d, d.file).forEach(l => lines.push(l)); });
  const all = lines.map(l => l.text).join('\n'), facts = { src:{} };
  const set = (k, v, src) => { if (v == null || v === '') return; facts[k] = v; if (src) facts.src[k] = src; };
  /* identity: the form or the e-mail first, the documents next */
  const firstSrc = re => { for (const l of lines) { const m = re.exec(l.text); if (m) return { m, src:{ file:l.file, loc:l.loc, quote:wsQuote(l.text, m.index, m[0].length) } }; } return null; };
  if (meta.company) set('company', wsClip(meta.company, 120), { file:meta.via || 'form', loc:'company', quote:wsClip(meta.company, 120) });
  else { const t = wsCompanyFromDocs(docs, lines); if (t) set('company', t.name, t.src); }
  const EM = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, hdr = new Set(lines.filter(l => l.loc === 'header').flatMap(l => (l.text.match(EM) || []).map(e => e.toLowerCase())));
  const emails = [...new Set((all.match(EM) || []).map(e => e.toLowerCase()))].filter(e => !/^(noreply|no-reply|donotreply)@/.test(e) && !hdr.has(e));
  const em = meta.email ? String(meta.email).toLowerCase() : (emails.find(e => !WS_FREEMAIL.test(e.split('@')[1])) || emails[0]);
  if (em && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(em)) set('email', em, meta.email ? { file:meta.via || 'form', loc:'e-mail', quote:em } : (firstSrc(new RegExp(em.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) || {}).src);
  const web = meta.website || ((/\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]{2,63}\.(?:[a-z]{2,10}|co\.uk|com\.br))(?:\/[^\s]*)?/i.exec(all.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '').replace(/https?:\/\/(www\.)?(linkedin|docsend|calendly|youtube|drive\.google|docs\.google|twitter|x)\.[^\s]*/gi, '')) || [])[0]);
  if (web && !/linkedin|docsend|calendly|google|youtube|twitter/i.test(web)) set('website', wsClip(String(web).replace(/^(?!https?:)/, 'https://'), 200));
  const li = (/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|company)\/[A-Za-z0-9_%-]{2,100}/i.exec(all) || [])[0] || meta.linkedin;
  if (li) set('linkedin', wsClip(li, 200));
  const founders = meta.founder ? [wsClip(meta.founder, 80)] : wsFounders(lines);
  if (founders.length) set('founders', founders, meta.founder ? { file:meta.via || 'form', loc:'founder', quote:founders[0] } : founders.src);
  /* sector, geography, model: keyword evidence, the strongest with its quote */
  /* the horizontal B2B label is a fallback: a specific sector found in the material wins over it */
  const sectors = wsDetect(lines, WS_SECTORS).map(s => s.id === 'b2b_software' ? Object.assign(s, { score:wsRound1(s.score * 0.4) }) : s).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  if (meta.sector && WS_SECTORS.some(s => s.id === meta.sector)) set('sector', meta.sector, { file:meta.via || 'form', loc:'sector', quote:meta.sector });
  else if (sectors.length && sectors[0].score >= 2) set('sector', sectors[0].id, sectors[0].src);
  facts.sectors = sectors.slice(0, 3).map(s => ({ id:s.id, score:s.score }));
  const geos = wsDetect(lines, WS_COUNTRIES, (n, k) => (WS_HQ.test(n) ? 3 : 1));
  const dom = (facts.email || '').split('@')[1] || String(facts.website || '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  const tld = dom && (/\.co\.uk$/.test(dom) ? 'co.uk' : dom.split('.').pop());
  if (tld && WS_TLD[tld]) { const g = geos.find(x => x.id === WS_TLD[tld]); if (g) g.score += 1; else geos.push({ id:WS_TLD[tld], score:1, src:{ file:'address', loc:'domain', quote:dom } }); geos.sort((a, b) => b.score - a.score); }
  if (meta.geo && WS_COUNTRIES.some(c => c.id === meta.geo)) set('geo', meta.geo, { file:meta.via || 'form', loc:'country', quote:meta.geo });
  else if (geos.length && geos[0].score >= 2 && (!geos[1] || geos[0].score >= geos[1].score * 1.5)) set('geo', geos[0].id, geos[0].src);
  facts.geos = geos.slice(0, 3).map(g => ({ id:g.id, score:g.score }));
  const models = wsDetect(lines, WS_MODELS);
  if (models.length && models[0].score >= 2) set('model', models[0].id, models[0].src);
  /* stage: the round named in the documents first, then the ARR */
  const st = firstSrc(/\b(pre[- ]?seed|seed (?:round|extension|funding)|raising (?:a |our )?seed|series ([a-e])\b)/i);
  if (meta.stage && WS_STAGE_IDS.includes(meta.stage)) set('stage', meta.stage, { file:meta.via || 'form', loc:'stage', quote:WS_STAGE_N[meta.stage] });
  else if (st) set('stage', /pre/i.test(st.m[1]) ? 'preseed' : /seed/i.test(st.m[1]) ? 'seed' : st.m[2] && st.m[2].toLowerCase() === 'a' ? 'a' : 'b', st.src);
  /* numbers from Smart fill's proposals, with their own place and quote */
  const row = id => (rows || []).find(r => r.field === id && typeof r.value === 'number');
  const srcOf = r => r && { file:r.file, loc:r.loc, quote:wsClip(r.snippet || r.raw || '', 160) };
  const raise = row('round_size'); if (raise) set('raise', raise.value, srcOf(raise));
  else if (meta.raise && wsNum(meta.raise, 1, 1e12)) set('raise', wsNum(meta.raise, 1, 1e12), { file:meta.via || 'form', loc:'raise', quote:String(meta.raise) });
  const arr = row('stated_arr') || row('arr_now'); if (arr) set('arr', arr.value, srcOf(arr));
  const growth = row('stated_growth'); if (growth) set('growth', growth.value, srcOf(growth));
  const cust = row('stated_customers') || row('customers_now'); if (cust) set('customers', cust.value, srcOf(cust));
  const gm = row('gross_margin'); if (gm) set('gross_margin', gm.value, srcOf(gm));
  const nrr = row('stated_nrr'); if (nrr) set('nrr', nrr.value, srcOf(nrr));
  if (!facts.stage && facts.arr != null) set('stage', facts.arr < 250000 ? 'preseed' : facts.arr < 2e6 ? 'seed' : facts.arr < 1e7 ? 'a' : 'b', Object.assign({}, facts.src.arr, { why:'from the ARR stated' }));
  facts.textLength = all.length;
  return facts;
}
const WS_FREEMAIL = /^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|proton|protonmail|gmx|orange|free|wanadoo|laposte|web|mail|yandex|zoho)\.[a-z.]+$/;
/* the company name: a title on the first page or slide, else the file name without the usual words */
function wsCompanyFromDocs(docs, lines) {
  const STOP = /^(confidential|pitch ?deck|investor (presentation|deck|update)|seed round|series [a-z]|agenda|introduction|overview|table of contents|deck|presentation|the problem|problem|traction|team|\d+)$/i;
  const HDR = /^(from|to|subject|date|sent|cc|bcc|re|fwd?|forwarded|hi|hello|dear|bonjour)\b|forwarded message|@/i;
  const take = l => { const t = l.text.replace(/[|·•–—:]+.*$/, '').replace(/\b(pitch deck|investor deck|investor presentation|confidential)\b/ig, '').trim();
    return t && t.length <= 40 && !STOP.test(t) && !HDR.test(l.text) && /^[A-Z0-9]/.test(t) && t.split(' ').length <= 4 && !/\d{3,}/.test(t) ? { name:t, src:{ file:l.file, loc:l.loc, quote:wsClip(l.text, 160) } } : null; };
  for (const l of lines) if (!l.tbl && /^(slide |page |p\.\s?)1\b/.test(l.loc)) { const r = take(l); if (r) return r; }
  for (const l of lines) if (!l.tbl && /^line [1-5]$/.test(l.loc)) { const r = take(l); if (r) return r; }
  for (const l of lines) if (l.loc === 'header' && /^Subject:/i.test(l.text)) { const m = /^Subject:\s*(?:(?:re|fwd?|tr)\s*:\s*)*([A-Z][\w&' .-]{1,40}?)(?:\s*[:–—-]|\s+(?:deck|pitch|seed|series|round|intro)\b|$)/i.exec(l.text); if (m && m[1].trim().split(' ').length <= 4) return { name:m[1].trim(), src:{ file:l.file, loc:'subject', quote:wsClip(l.text, 160) } }; }
  const d = (docs || [])[0]; const f = d && (d.file || (d.doc && d.doc.file));
  if (f) {
    const n = String(f).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_+.]+/g, ' ').replace(/\b(pitch|deck|investor|presentation|seed|series [a-z]|final|v\d+|draft|copy|confidential|scan|scanned|20\d\d|q[1-4])\b/ig, ' ').replace(/[-–]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (n && n.length <= 40) return { name:n.replace(/\b[a-z]/g, c => c.toUpperCase()), src:{ file:f, loc:'file name', quote:f } };
  }
  return null;
}
function wsFounders(lines) {
  const out = [], seen = new Set(); let src = null;
  const NAME = "([A-Z][a-zà-ÿ'’-]+(?: [A-Z][a-zà-ÿ'’-]+){1,2})", ROLE = '(?:co-?founder|founder|ceo|cto|coo|chief executive|chief technology)';
  const res = [new RegExp(NAME + '\\s*[,\u2013\u2014|:(-]+\\s*(?:[A-Za-z &]*?)' + ROLE, 'g'), new RegExp(ROLE + '[^A-Za-z]{0,6}(?:& ?' + ROLE + ')?\\s*[:\u2013\u2014-]\\s*' + NAME, 'gi')];
  for (const l of lines) {
    for (const re of res) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(l.text)) && out.length < 4) {
        const nm = (m[1] && /^[A-Z]/.test(m[1]) ? m[1] : m[2] || m[1] || '').trim();
        if (!nm || /^(The|Our|We|Founder|Founders|Team|Chief|Series|Seed)\b/.test(nm) || seen.has(nm)) continue;
        seen.add(nm); out.push(nm); if (!src) src = { file:l.file, loc:l.loc, quote:wsQuote(l.text, m.index, m[0].length) };
      }
    }
  }
  out.src = src; return out;
}

/* ── thesis check: In thesis / Borderline / Out of thesis, with every reason and its source; missing information is never a fail ── */
const WS_RESULT = { in:'In thesis', border:'Borderline', info:'Borderline (needs info)', out:'Out of thesis' };
function wsThesis(ws, facts) {
  const t = ws.thesis, reasons = [], questions = [];
  const R = (rule, ok, text, src, hard) => reasons.push({ rule, ok, text, src:src || null, hard:!!hard });
  const ask = q => { if (!questions.includes(q)) questions.push(q); };
  const lbl = (list, id) => (list.find(x => x.id === id) || {}).n || id;
  const fm = v => (typeof money === 'function' ? money(v) : '$' + Math.round(v));
  /* exclusions: a hard stop, quoted */
  for (const ex of t.exclusions) {
    const kw = ex.toLowerCase(); let hit = null;
    if (facts.sector && wsSlug(ex) === facts.sector) hit = facts.src.sector;
    if (!hit) for (const [k, s] of Object.entries(facts.src || {})) if (s && s.quote && wsNorm(s.quote).includes(' ' + kw + ' ')) { hit = s; break; }
    if (!hit && facts._lines) for (const l of facts._lines) { const n = wsNorm(l.text); if (n.includes(' ' + kw + ' ')) { const i = l.text.toLowerCase().indexOf(kw); hit = { file:l.file, loc:l.loc, quote:wsQuote(l.text, i < 0 ? 0 : i, kw.length) }; break; } }
    if (hit) R('exclusion', false, `Excluded: "${ex}" appears in the material.`, hit, true);
  }
  if (t.sectorsOut.length && facts.sector && t.sectorsOut.includes(facts.sector)) R('sector', false, `Sector ${lbl(WS_SECTORS, facts.sector)} is excluded by the thesis.`, facts.src.sector, true);
  /* sector */
  if (t.sectors.length) {
    if (!facts.sector) { R('sector', null, 'Sector not identified in the material.'); ask('Which sector and which customers does the company serve?'); }
    else if (t.sectors.includes(facts.sector)) R('sector', true, `Sector ${lbl(WS_SECTORS, facts.sector)} is in the thesis.`, facts.src.sector);
    else {
      const second = (facts.sectors || []).find(s => t.sectors.includes(s.id));
      if (second) R('sector', null, `Main sector reads as ${lbl(WS_SECTORS, facts.sector)}; ${lbl(WS_SECTORS, second.id)} also appears. Check which one applies.`, facts.src.sector);
      else R('sector', false, `Sector ${lbl(WS_SECTORS, facts.sector)} is outside the thesis (${t.sectors.map(s => lbl(WS_SECTORS, s)).join(', ')}).`, facts.src.sector, t.strict !== 'lenient');
      if (second) ask(`Is the company mainly ${lbl(WS_SECTORS, facts.sector)} or ${lbl(WS_SECTORS, second.id)}?`);
    }
  }
  /* geography: a country or its region */
  if (t.geos.length) {
    const c = WS_COUNTRIES.find(x => x.id === facts.geo);
    if (!c) { R('geo', null, 'Headquarters not identified in the material.'); ask('Where is the company headquartered and incorporated, and where are the founders based?'); }
    else if (t.geos.includes(c.id) || t.geos.includes(c.r)) R('geo', true, `Based in ${c.n}: in the thesis.`, facts.src.geo);
    else R('geo', false, `Based in ${c.n}: outside the thesis geographies.`, facts.src.geo, t.strict !== 'lenient');
  }
  /* stage: one step away is borderline, further is out */
  if (t.stages.length) {
    if (!facts.stage) { R('stage', null, 'Stage not identified (no round named, no ARR stated).'); ask('Which round is the company raising (pre-seed, seed, Series A...) and how much?'); }
    else if (t.stages.includes(facts.stage)) R('stage', true, `${WS_STAGE_N[facts.stage]}: a thesis stage.`, facts.src.stage);
    else {
      const d = Math.min(...t.stages.map(s => Math.abs(WS_STAGE_IDS.indexOf(s) - WS_STAGE_IDS.indexOf(facts.stage))));
      R('stage', d <= 1 && t.strict !== 'strict' ? null : false, `${WS_STAGE_N[facts.stage]}: ${d <= 1 ? 'next to' : 'outside'} the thesis stages (${t.stages.map(s => WS_STAGE_N[s]).join(', ')}).`, facts.src.stage, d > 1);
    }
  }
  /* round size and check size */
  if (t.roundMin != null || t.roundMax != null) {
    if (facts.raise == null) { R('round', null, 'Round size not stated.'); ask('How much is the company raising, and on what terms?'); }
    else {
      const lo = t.roundMin ?? 0, hi = t.roundMax ?? Infinity, v = facts.raise;
      if (v >= lo && v <= hi) R('round', true, `Raising ${fm(v)}: inside the round-size range.`, facts.src.raise);
      else { const far = v < lo / 2 || v > hi * 2; R('round', far && t.strict !== 'lenient' ? false : null, `Raising ${fm(v)}: ${v < lo ? 'below' : 'above'} the round-size range (${lo ? fm(lo) : 'any'} to ${isFinite(hi) ? fm(hi) : 'any'}).`, facts.src.raise, far); }
    }
  }
  if (t.checkMax != null && facts.raise != null && t.checkMin != null && facts.raise < t.checkMin) R('check', false, `The whole round (${fm(facts.raise)}) is smaller than your minimum check (${fm(t.checkMin)}).`, facts.src.raise, true);
  /* business model */
  if (t.models.length) {
    if (!facts.model) { R('model', null, 'Business model not identified.'); ask('How does the company make money (subscription, usage, take rate, hardware, services)?'); }
    else if (t.models.includes(facts.model)) R('model', true, `${lbl(WS_MODELS, facts.model)}: a thesis model.`, facts.src.model);
    else R('model', null, `Business model reads as ${lbl(WS_MODELS, facts.model)}, not one of the thesis models.`, facts.src.model);
  }
  /* must-haves: a keyword found passes; a measurable one fails only on a stated figure */
  for (const m of t.musts) {
    if (m.kind === 'metric') {
      const v = facts[m.metric], nm = { arr:'ARR', raise:'Round size', growth:'Growth', customers:'Customers', gross_margin:'Gross margin', nrr:'NRR' }[m.metric];
      if (v == null) { R('must', null, `Must-have "${nm} ${m.op} ${m.value}": not stated.`); ask(`What is the company's ${nm.toLowerCase()} today?`); }
      else { const ok = m.op === '>=' ? v >= m.value : v <= m.value; R('must', ok, `Must-have "${nm} ${m.op} ${m.value}": stated ${v}.`, facts.src[m.metric], !ok); }
    } else {
      const words = (m.words && m.words.length ? m.words : [m.text]).map(w => w.toLowerCase()); let hit = null;
      for (const l of facts._lines || []) { const n = wsNorm(l.text); const w = words.find(x => n.includes(' ' + x + ' ')); if (w) { const i = l.text.toLowerCase().indexOf(w); hit = { file:l.file, loc:l.loc, quote:wsQuote(l.text, i < 0 ? 0 : i, w.length) }; break; } }
      if (hit) R('must', true, `Must-have "${m.text}": found.`, hit);
      else { R('must', null, `Must-have "${m.text}": not shown in the material.`); ask(`${m.text}: can the company show this?`); }
    }
  }
  const hardFail = reasons.some(r => r.ok === false && r.hard), softFail = reasons.some(r => r.ok === false && !r.hard), unknown = reasons.some(r => r.ok === null);
  const missing = reasons.some(r => r.ok === null && !r.src);
  const result = hardFail ? 'out' : softFail || unknown ? 'border' : 'in';
  return { result, needsInfo:result === 'border' && missing, label:result === 'border' && missing ? WS_RESULT.info : WS_RESULT[result], reasons, questions:result === 'out' ? [] : questions,
    noThesis:!t.stages.length && !t.sectors.length && !t.geos.length && !t.models.length && t.roundMin == null && t.roundMax == null && !t.exclusions.length && !t.musts.length };
}
function wsThesisRun(ws, facts, lines) { const f = Object.assign({}, facts, { _lines:lines || [] }); return wsThesis(ws, f); }

/* ── scorecard: pillar scores with their origin; total and tier ── */
const WS_EVID_NAME = { 0.25:'unverified', 0.45:'deck', 0.6:'financial model', 0.85:'system export', 0.95:'bank or billing record', 1:'audited' };
const wsEvidName = w => WS_EVID_NAME[w] || (w >= 0.85 ? 'system export' : w >= 0.6 ? 'financial model' : w >= 0.45 ? 'deck' : 'unverified');
const wsTo5 = s => wsRound1(1 + 4 * Math.max(0, Math.min(100, s)) / 100);
/* R: the engine result with evidence (Radar.assess); Rc: the same company with the deck's claims used as figures (or null).
   prov: { field: { file, loc, quote } } where each input came from. */
function wsMetricsOf(R) { const m = new Map(); for (const d of ((R && (R.scoring || R.sc)) || {}).dimensions || []) for (const x of d.metrics) if (x.score != null && !x.withheld && !x.suppressed) m.set(x.key, Object.assign({ dim:d.id }, x)); return m; }
function wsEnginePillar(p, R, Rc, prov) {
  const one = (res, basis) => {
    if (!res) return null;
    if (p.kind === 'dimension') {
      const d = (((res.scoring || res.sc) || {}).dimensions || []).find(x => x.id === p.dimension);
      if (!d || d.score == null || !(d.coverage > 0.25)) return null;
      return { score:wsTo5(d.score), basis, sources:d.metrics.filter(x => x.score != null).slice(0, 8).map(x => ({ key:x.key, label:x.label, value:x.value, score:x.score, evidence:wsEvidName(x.evidence) })), notes:[`VCR2 ${d.label} score ${Math.round(d.score)}/100, coverage ${Math.round(d.coverage * 100)}%`] };
    }
    const mm = wsMetricsOf(res), used = [];
    for (const m of p.metrics || []) { const x = mm.get(m.key); if (x) used.push({ x, w:m.w }); }
    if (used.length < (p.minMetrics || 3)) return null;
    const ws = used.reduce((s, u) => s + u.w, 0), avg = used.reduce((s, u) => s + u.w * u.x.score, 0) / ws;
    let score = wsTo5(avg); const notes = [], caps = [];
    for (const c of res.checks || []) if ((p.checks || []).includes(c.id) && c.sev === 'major') caps.push(c);
    if (caps.length && score > 2.5) { notes.push(`Capped at 2.5: ${caps.map(c => c.title).join('; ')}.`); score = 2.5; }
    for (const c of res.checks || []) if ((p.checks || []).includes(c.id) && c.sev === 'minor') notes.push(`Minor: ${c.title}.`);
    return { score, basis, sources:used.map(u => ({ key:u.x.key, label:u.x.label, value:u.x.value, score:u.x.score, weight:u.w, evidence:basis === 'claims' ? 'deck claim' : wsEvidName(u.x.evidence), bench:u.x.bench, from:u.x.src ? [u.x.src] : wsProvFor(u.x.key, prov) })), checks:caps.map(c => ({ id:c.id, title:c.title, sev:c.sev, text:c.text })), notes };
  };
  return one(R, 'evidence') || one(Rc, 'claims');
}
/* the input fields behind a derived metric, with where each came from */
function wsProvFor(key, prov) {
  if (!prov) return [];
  const ins = (typeof INPUTS_OF !== 'undefined' && INPUTS_OF[key]) || [key];
  return ins.map(f => prov[f] ? Object.assign({ field:f }, prov[f]) : null).filter(Boolean).slice(0, 4);
}
function wsScorecard(ws, deal, R, Rc) {
  const card = ws.scorecard, own = deal.pillars || {}, mm = wsMetricsOf(R || Rc), out = [];
  for (const p of card.pillars) {
    const o = own[p.id] || {}, eng = p.kind === 'reviewer' ? null : wsEnginePillar(p, R, Rc, deal.prov);
    const evidence = (p.evidence || []).map(k => mm.get(k)).filter(Boolean).map(x => ({ key:x.key, label:x.label, value:x.value, score:x.score, evidence:wsEvidName(x.evidence), from:wsProvFor(x.key, deal.prov) }));
    const qs = wsPillarQuestions(p, R || Rc);
    let score = null, from = null, by = '', at = '';
    if (o.score != null && (o.from === 'reviewer' || o.from === 'ai')) { score = o.score; from = o.from; by = o.by || ''; at = o.at || ''; }
    else if (eng) { score = eng.score; from = 'engine'; }
    out.push({ id:p.id, name:p.name, weight:p.weight, kind:p.kind, score, from, by, at, engine:eng, evidence, questions:qs, guide:p.guide || '', ai:o.ai || null, note:o.note || '' });
  }
  const scored = out.filter(p => p.score != null), wsum = scored.reduce((s, p) => s + p.weight, 0);
  const total = wsum ? wsRound1(scored.reduce((s, p) => s + p.weight * p.score, 0) / wsum) : null;
  const coverage = Math.round(wsum / Math.max(1, card.pillars.reduce((s, p) => s + p.weight, 0)) * 100);
  const tierOf = v => v == null ? null : (card.tiers.find(t => v >= t.min) || card.tiers[card.tiers.length - 1]).name;
  return { pillars:out, total, coverage, complete:coverage === 100, tier:coverage === 100 ? tierOf(total) : null, provisionalTier:tierOf(total), meets:coverage === 100 && total != null && total >= card.threshold };
}
function wsPillarQuestions(p, R) {
  const out = (p.ask || []).slice();
  const keys = new Set([...(p.evidence || []), ...((p.metrics || []).map(m => m.key)), ...(p.checks || [])]);
  for (const q of (R && R.questions) || []) { if (q.ref && keys.has(q.ref.id) && !out.includes(q.text)) out.push(q.text); if (out.length >= 6) break; }
  return out;
}
/* a reviewer's score (one click) or a confirmed AI suggestion; returns a new pillars object (the deal keeps its history) */
/* the first time a company's scorecard is complete: minutes from its arrival in VCR2 to a complete scored row */
function wsMarkComplete(ws, deal) {
  const t = deal.timing || (deal.timing = {}); if (t.completeAt) return false;
  const s = wsScorecard(ws, deal, deal.engine || null, deal.engineClaims || null); if (!s.complete) return false;
  t.completeAt = new Date().toISOString(); const a = wsTime(t.inAt || deal.received); if (a != null) t.toCompleteMs = Math.max(0, Date.parse(t.completeAt) - a);
  return true;
}
function wsSetPillar(deal, pid, score, who, kind) {
  const s = score == null ? null : wsNum(score, 1, 5); const at = new Date().toISOString();
  const p = Object.assign({}, deal.pillars || {}); const cur = Object.assign({}, p[pid] || {});
  if (s == null) { delete cur.score; delete cur.from; delete cur.by; delete cur.at; }
  else Object.assign(cur, { score:wsRound1(s), from:kind === 'ai' ? 'ai' : 'reviewer', by:wsClip(who, 80), at });
  p[pid] = cur;
  return p;
}
/* an AI suggestion is stored apart and never used until a reviewer confirms it */
function wsSuggestPillar(deal, pid, sug) { const p = Object.assign({}, deal.pillars || {}); p[pid] = Object.assign({}, p[pid] || {}, { ai:{ score:wsNum(sug.score, 1, 5), why:wsClip(sug.why, 800), model:wsClip(sug.model, 80), at:new Date().toISOString() } }); return p; }
function wsConfirmAi(deal, pid, who) { const a = ((deal.pillars || {})[pid] || {}).ai; if (!a || a.score == null) return deal.pillars || {}; const p = wsSetPillar(deal, pid, a.score, who, 'ai'); p[pid].ai = Object.assign({}, a, { confirmedBy:wsClip(who, 80), confirmedAt:new Date().toISOString() }); return p; }
/* the prompt for a Tier 1 suggestion: the evidence VCR2 found and the reviewer guide, nothing else */
function wsAiPrompt(ws, deal, pillar) {
  const ev = pillar.evidence.map(e => `- ${e.label}: ${e.value} (${e.evidence})`).join('\n') || '- none';
  const facts = ['company', 'sector', 'geo', 'stage', 'raise', 'arr'].filter(k => deal.facts && deal.facts[k] != null).map(k => `- ${k}: ${deal.facts[k]}`).join('\n');
  return { system:'You help a venture investor fill a scorecard. Use only the evidence given. Answer with JSON only: {"score": <1 to 5, one decimal>, "why": "<two sentences citing the evidence>"}. If the evidence is too thin, give your best estimate and say so in "why".',
    prompt:`Pillar: ${pillar.name}\nScale guide: ${pillar.guide || '1 = weak, 5 = exceptional'}\nCompany facts:\n${facts || '- none'}\nEvidence found by the engine:\n${ev}\nOpen questions:\n${pillar.questions.slice(0, 4).map(q => '- ' + q).join('\n')}` };
}
function wsParseAi(text) {
  const m = /\{[\s\S]*\}/.exec(String(text || '')); if (!m) return null;
  try { const j = JSON.parse(m[0]); const s = wsNum(j.score, 1, 5); return s == null ? null : { score:wsRound1(s), why:wsClip(j.why, 800) }; } catch (e) { return null; }
}
/* re-scoring after a change of weights or threshold: what moved */
function wsRescoreDiff(before, after) {
  const b = new Map(before.map(x => [x.id, x])), moved = [];
  for (const a of after) { const p = b.get(a.id); if (!p) continue; if (p.total !== a.total || p.tier !== a.tier || p.meets !== a.meets) moved.push({ id:a.id, company:a.company, from:p.total, to:a.total, fromTier:p.tier, toTier:a.tier, crossed:p.meets !== a.meets ? (a.meets ? 'now above the threshold' : 'now below the threshold') : '' }); }
  return moved.sort((x, y) => Math.abs((y.to || 0) - (y.from || 0)) - Math.abs((x.to || 0) - (x.from || 0)));
}
/* score distribution, per pillar and total: bins of half a point from 1 to 5 */
function wsDistribution(card, scores) {
  const bins = () => [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5].map(lo => ({ lo, hi:lo + 0.5, n:0 }));
  const put = (b, v) => { if (v == null) return; const i = Math.min(7, Math.max(0, Math.floor((v - 1) / 0.5))); b[i].n++; };
  const total = bins(), per = Object.fromEntries(card.pillars.map(p => [p.id, bins()])), tiers = {};
  let unscored = 0;
  for (const s of scores) {
    put(total, s.total); if (s.total == null) unscored++;
    for (const p of s.pillars || []) if (per[p.id]) put(per[p.id], p.score);
    const t = s.tier || (s.total != null ? 'provisional ' + s.provisionalTier : 'not scored'); tiers[t] = (tiers[t] || 0) + 1;
  }
  const vals = scores.map(s => s.total).filter(v => v != null).sort((a, b) => a - b);
  const q = f => vals.length ? vals[Math.min(vals.length - 1, Math.floor(f * vals.length))] : null;
  return { total, per, tiers, unscored, n:scores.length, median:q(0.5), p25:q(0.25), p75:q(0.75), above:scores.filter(s => s.meets).length };
}

/* ── pipeline: days waiting, overdue follow-ups, triage order, tiles and the weekly digest ── */
function wsDaysSince(t, now) { const a = wsTime(t); return a == null ? null : Math.max(0, Math.floor(((now || Date.now()) - a) / wsDay)); }
function wsFlags(ws, deal, now) {
  now = now || Date.now();
  const closed = ws.pipeline.closed.includes(deal.status), waiting = ws.pipeline.waiting.includes(deal.status || ws.pipeline.statuses[0]);
  const days = wsDaysSince(deal.received, now), out = { days, waiting, closed, flags:[] };
  if (!closed && waiting && days != null && days >= ws.targets.waitingDays) out.flags.push({ id:'waiting', text:`Waiting ${days} days (target ${ws.targets.waitingDays})` });
  const due = wsTime(deal.nextDue);
  if (!closed && due != null && due < now - wsDay + 1) out.flags.push({ id:'next', text:`Next action overdue since ${wsIso(due)}${deal.nextAction ? ': ' + deal.nextAction : ''}` });
  const lc = wsDaysSince(deal.lastContact || deal.received, now);
  if (!closed && !waiting && lc != null && lc >= ws.targets.responseDays) out.flags.push({ id:'contact', text:`No contact for ${lc} days (target ${ws.targets.responseDays})` });
  return out;
}
function wsTierRank(ws, tier) { const i = ws.scorecard.tiers.findIndex(t => t.name === tier); return i < 0 ? 99 : i; }
function wsTriage(ws, deals, sc, f, now) {
  f = f || {};
  const rows = deals.map(d => ({ d, s:sc(d), fl:wsFlags(ws, d, now) }));
  return rows.filter(r => (!f.tier || (r.s.tier || r.s.provisionalTier) === f.tier) && (!f.status || r.d.status === f.status) && (!f.result || ((r.d.thesis || {}).result === f.result))
      && (!f.overdue || r.fl.flags.length) && (!f.next || (f.next === 'due' ? r.fl.flags.some(x => x.id === 'next') : f.next === 'none' ? !r.d.nextAction : !!r.d.nextAction))
      && (!f.open || !r.fl.closed) && (!f.reviewer || r.d.reviewer === f.reviewer) && (!f.source || r.d.source === f.source)
      && (!f.q || wsNorm([r.d.company, (r.d.founders || []).join(' '), r.d.sector, r.d.status, r.d.nextAction].join(' ')).includes(wsNorm(f.q).trim())))
    .sort((a, b) => wsTierRank(ws, a.s.tier || a.s.provisionalTier) - wsTierRank(ws, b.s.tier || b.s.provisionalTier) || (b.s.total ?? -1) - (a.s.total ?? -1) || (b.fl.days ?? 0) - (a.fl.days ?? 0) || (a.d.company < b.d.company ? -1 : 1));
}
const WS_META_FIELDS = ['company', 'founders', 'email', 'stage', 'sector', 'raise'];
function wsComplete(deal, s) { const f = deal.facts || {}; const meta = WS_META_FIELDS.every(k => k === 'founders' ? (deal.founders || f.founders || []).length : (deal[k] ?? f[k]) != null && (deal[k] ?? f[k]) !== ''); return { meta, scores:!!(s && s.complete), both:meta && !!(s && s.complete) }; }
function wsKpis(ws, deals, sc, now) {
  const n = deals.length, s = deals.map(sc), top = ws.scorecard.tiers[0] && ws.scorecard.tiers[0].name;
  const times = deals.map(d => d.timing && d.timing.toCompleteMs).filter(x => typeof x === 'number' && x >= 0).sort((a, b) => a - b);
  const auto = deals.map(d => d.timing && d.timing.autoMs).filter(x => typeof x === 'number' && x >= 0).sort((a, b) => a - b);
  const med = a => a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null;
  return { logged:n, complete:n ? Math.round(deals.filter((d, i) => wsComplete(d, s[i]).both).length / n * 100) : 0,
    medianToScoreMs:med(times), medianAutoMs:med(auto), topTier:n ? Math.round(s.filter(x => x.tier === top).length / n * 100) : 0, topName:top,
    overdue:deals.filter(d => wsFlags(ws, d, now).flags.length).length, waiting:deals.filter(d => wsFlags(ws, d, now).flags.some(f => f.id === 'waiting')).length,
    byResult:['in', 'border', 'out'].map(r => ({ r, n:deals.filter(d => (d.thesis || {}).result === r).length })) };
}
function wsDigest(ws, deals, sc, now) {
  const rows = wsTriage(ws, deals, sc, { open:true }, now), over = rows.filter(r => r.fl.flags.length);
  const fresh = deals.filter(d => wsDaysSince(d.received, now) != null && wsDaysSince(d.received, now) < 7);
  const top = rows.filter(r => r.s.tier === (ws.scorecard.tiers[0] || {}).name).slice(0, 10);
  const line = r => `- ${r.d.company || 'Unnamed'}${r.s.total != null ? ` (${r.s.total}${r.s.tier ? ', ' + r.s.tier : ''})` : ''}: ${r.fl.flags.map(f => f.text).join('; ') || r.d.status || ''}${r.d.followOwner || r.d.reviewer ? ', owner ' + (r.d.followOwner || r.d.reviewer) : ''}`;
  const text = [`${ws.name}: weekly deal-flow digest (${wsIso(now || Date.now())})`, '',
    `${fresh.length} new compan${fresh.length === 1 ? 'y' : 'ies'} this week, ${deals.length} in total.`, '',
    `Overdue (${over.length}):`, ...(over.length ? over.slice(0, 30).map(line) : ['- none']), '',
    `Top tier, open (${top.length}):`, ...(top.length ? top.map(line) : ['- none'])].join('\n');
  return { subject:`${ws.name}: ${over.length} overdue, ${fresh.length} new this week`, text, overdue:over.map(r => ({ id:r.d.id, company:r.d.company, flags:r.fl.flags.map(f => f.text), owner:r.d.followOwner || r.d.reviewer || '' })), fresh:fresh.length };
}

/* ── duplicates: the same file, the same web domain, the same founder e-mail or the same normalised name ── */
const WS_LEGAL = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|ag|sa|sas|sasu|sarl|bv|nv|ab|oy|as|aps|plc|srl|spa|sl|pty|pte|holdings?|technologies|technology|labs?|hq|ai|io|app)\b\.?/g;
const wsKey = name => wsNorm(name).replace(WS_LEGAL, ' ').replace(/[^a-z0-9]+/g, '').slice(0, 60);
function wsDomain(v) {
  const s = String(v || '').toLowerCase().trim(); if (!s) return '';
  const d = s.includes('@') ? s.split('@').pop() : s.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  return !d || WS_FREEMAIL.test(d) || /linkedin|docsend|google|dropbox|notion|calendly/.test(d) ? '' : d;
}
function wsFindDup(deals, c) {
  const hashes = new Set((c.files || []).map(f => f.hash).filter(Boolean)), key = wsKey(c.company), dom = wsDomain(c.website) || wsDomain(c.email), em = String(c.email || '').toLowerCase();
  for (const d of deals) {
    if (d.id === c.id || d.mergedInto) continue;
    if (hashes.size && (d.files || []).some(f => f.hash && hashes.has(f.hash))) return { deal:d, why:'the same file' };
    if (dom && (wsDomain(d.website) === dom || wsDomain(d.email) === dom)) return { deal:d, why:`the same web domain (${dom})` };
    if (em && String(d.email || '').toLowerCase() === em) return { deal:d, why:'the same founder e-mail' };
    if (key && key.length >= 3 && wsKey(d.company) === key) return { deal:d, why:'the same company name' };
  }
  return null;
}
/* merge b into a: a keeps its id and its first date; files, sources, evidence and history are joined; a field a lacks is taken from b */
function wsMerge(a, b, why) {
  const m = Object.assign({}, a);
  for (const k of ['company', 'website', 'email', 'linkedin', 'sector', 'stage', 'geo', 'raise', 'deckLink']) if ((m[k] == null || m[k] === '') && b[k] != null && b[k] !== '') m[k] = b[k];
  if (!(m.founders || []).length && (b.founders || []).length) m.founders = b.founders.slice();
  const ta = wsTime(a.received), tb = wsTime(b.received); if (tb != null && (ta == null || tb < ta)) m.received = b.received;
  const seen = new Set(); m.files = [...(a.files || []), ...(b.files || [])].filter(f => { const k = f.hash || f.name; if (seen.has(k)) return false; seen.add(k); return true; });
  m.sources = [...new Set([...(a.sources || [a.source]), ...(b.sources || [b.source])].filter(Boolean))];
  m.evidence = [...(a.evidence || []), ...(b.evidence || [])].slice(-200);
  m.notes = [...(a.notes || []), ...(b.notes || [])].slice(-200);
  m.history = [...(a.history || []), { at:new Date().toISOString(), what:`merged a duplicate (${why || 'same company'})${b.files && b.files[0] ? ': ' + b.files[0].name : ''}` }].slice(-200);
  return m;
}

/* ── the master sheet: VCR2 fields, header aliases, the mapping and the write plan ── */
const WS_SHEET_FIELDS = [
  { id:'company', n:'Company name', g:'Identity', a:['company', 'company name', 'startup', 'name', 'organization', 'organisation', 'entreprise', 'société'] },
  { id:'founders', n:'Founder(s)', g:'Identity', a:['founder', 'founders', 'founder(s)', 'ceo', 'founder name', 'fondateur', 'fondateurs'] },
  { id:'email', n:'Founder e-mail', g:'Identity', a:['email', 'e-mail', 'founder email', 'contact email', 'contact'] },
  { id:'website', n:'Website', g:'Identity', a:['website', 'url', 'site', 'web', 'domain'] },
  { id:'linkedin', n:'LinkedIn', g:'Identity', a:['linkedin', 'linkedin url', 'founder linkedin', 'linkedin profile'] },
  { id:'deckLink', n:'Deck link', g:'Identity', a:['deck', 'deck link', 'pitch deck', 'deck url', 'deck (link)'] },
  { id:'sector', n:'Sector', g:'Identity', a:['sector', 'industry', 'vertical', 'secteur'], list:true },
  { id:'stage', n:'Stage', g:'Identity', a:['stage', 'round', 'round stage', 'funding stage', 'série', 'stade'], list:true },
  { id:'geo', n:'Geography', g:'Identity', a:['geography', 'geo', 'country', 'location', 'hq', 'region', 'pays'], list:true },
  { id:'leadPartner', n:'Lead partner', g:'Identity', a:['lead partner', 'partner', 'lead', 'deal lead', 'owner partner'], own:true },
  { id:'referral', n:'Referral source', g:'Identity', a:['referral', 'referral source', 'referred by', 'intro by', 'introduced by', 'source of intro'], own:true },
  { id:'source', n:'Source', g:'Identity', a:['source', 'channel', 'inbound source'], list:true },
  { id:'received', n:'Date received', g:'Pipeline', a:['date received', 'received', 'date', 'date added', 'added', 'submitted', 'date in'], date:true },
  { id:'status', n:'Status', g:'Pipeline', a:['status', 'pipeline status', 'stage of deal', 'deal status', 'statut'], list:true },
  { id:'lastContact', n:'Last contact date', g:'Pipeline', a:['last contact', 'last contact date', 'last touch', 'last touchpoint', 'last contacted'], date:true, own:true },
  { id:'nextAction', n:'Next action', g:'Pipeline', a:['next action', 'next step', 'next steps', 'action', 'to do'], own:true },
  { id:'nextDue', n:'Next action date', g:'Pipeline', a:['next action date', 'due date', 'follow-up date', 'follow up date', 'next action due'], date:true, own:true },
  { id:'followOwner', n:'Follow-up owner', g:'Pipeline', a:['follow-up owner', 'follow up owner', 'owner', 'assigned to', 'follow-up', 'responsible'], own:true },
  { id:'reviewer', n:'Reviewer', g:'Pipeline', a:['reviewer', 'screened by', 'analyst'] },
  { id:'daysWaiting', n:'Days waiting', g:'Pipeline', a:['days waiting', 'days since received', 'age (days)', 'days open'] },
  { id:'raise', n:'Raise', g:'Identity', a:['raise', 'raising', 'round size', 'amount raising', 'ticket', 'amount'] },
  { id:'thesisResult', n:'Thesis result', g:'Scores', a:['thesis', 'thesis fit', 'thesis result', 'fit'], list:true },
  { id:'thesisReasons', n:'Thesis reasons', g:'Scores', a:['reasons', 'thesis reasons', 'fit reasons', 'why'] },
  { id:'total', n:'Total weighted score', g:'Scores', a:['total', 'total score', 'weighted score', 'total weighted score', 'score total', 'overall score'] },
  { id:'tier', n:'Priority tier', g:'Scores', a:['tier', 'priority', 'priority tier'], list:true },
  { id:'vcr2Score', n:'VCR2 evidence score (0 to 100)', g:'Scores', a:['vcr2 score', 'evidence score', 'vcr2'] },
  { id:'summary', n:'Executive summary', g:'Outputs', a:['summary', 'executive summary', 'exec summary', 'one-liner', 'description', 'résumé'] },
  { id:'gaps', n:'Diligence gaps', g:'Outputs', a:['diligence gaps', 'gaps', 'open questions', 'missing info', 'red flags'] },
  { id:'topQuestions', n:'Top questions', g:'Outputs', a:['top questions', 'questions', 'questions to ask'] },
  { id:'memoLink', n:'Memo link', g:'Outputs', a:['memo', 'memo link', 'deal memo', 'ic memo', 'investment memo'] },
  { id:'folderLink', n:'Folder link', g:'Outputs', a:['folder', 'folder link', 'drive folder', 'files'] },
  { id:'reportLink', n:'Report link', g:'Outputs', a:['report', 'vcr2 report', 'report link', 'analysis'] },
  { id:'icDecision', n:'IC decision', g:'Pipeline', a:['ic decision', 'ic outcome', 'ic result', 'committee decision', 'decision'] },
  { id:'icDate', n:'IC date', g:'Pipeline', a:['ic date', 'decision date', 'committee date'], date:true },
];
/* pillar columns are added per scorecard: "<pillar name>" or "<pillar name> score" */
function wsSheetCatalog(ws) {
  return WS_SHEET_FIELDS.concat(ws.scorecard.pillars.map(p => ({ id:'pillar:' + p.id, n:p.name + ' (1 to 5)', g:'Scores', a:[wsNorm(p.name).trim(), wsNorm(p.name + ' score').trim(), wsNorm(p.name.split(/[&(]/)[0]).trim(), p.id.replace(/_/g, ' ')] })));
}
/* first guess of the mapping from the header row; a formula column is always "reads only"; an unknown header is "ignore" */
function wsAutoMap(ws, headers, formulaCols, validations) {
  const cat = wsSheetCatalog(ws), used = new Set(), out = [];
  const clean = h => wsNorm(h).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  headers.forEach((h, col) => {
    const c = clean(h); let best = null, bs = 0;
    if (!c) { out.push({ col, header:String(h || ''), field:'', mode:'ignore', why:'empty header' }); return; }
    for (const f of cat) {
      if (used.has(f.id)) continue;
      for (const a of f.a) { const s = c === a ? 3 : c.startsWith(a + ' ') || c.endsWith(' ' + a) ? 2 : a.length > 5 && c.includes(a) ? 1 : 0; if (s > bs) { bs = s; best = f; } }
    }
    if (!best) { out.push({ col, header:String(h), field:'', mode:'ignore', why:'not a VCR2 field' }); return; }
    used.add(best.id);
    const formula = formulaCols && formulaCols.has(col);
    out.push({ col, header:String(h), field:best.id, mode:formula ? 'read' : best.own ? 'read' : 'write', why:formula ? 'a formula column: VCR2 never writes it' : best.own ? 'kept by your team: VCR2 reads it' : 'VCR2 fills it', options:validations && validations[col] || null });
  });
  return out;
}
function wsNormSheet(s) {
  return { id:wsClip(s.id, 200), url:/^https:\/\//.test(s.url || '') ? wsClip(s.url, 400) : '', name:wsClip(s.name, 200), tab:wsClip(s.tab, 100), headerRow:Math.round(wsNum(s.headerRow, 1, 50) || 1),
    mapping:(Array.isArray(s.mapping) ? s.mapping : []).slice(0, 200).map(m => ({ col:Math.round(wsNum(m.col, 0, 1000) ?? 0), header:wsClip(m.header, 120), field:/^(pillar:)?[a-zA-Z_][a-zA-Z0-9_]{0,48}$/.test(m.field || '') ? m.field : '', mode:['write', 'read', 'ignore'].includes(m.mode) ? m.mode : 'ignore' })) };
}
const wsColLetter = i => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
/* text that a spreadsheet would read as a formula is written as text */
const wsSafeCell = v => typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
/* the value VCR2 holds for one field of one company */
function wsFieldValue(ws, deal, s, field) {
  const f = deal.facts || {}, th = deal.thesis || {};
  const geoN = id => (WS_COUNTRIES.find(c => c.id === id) || {}).n || id || '';
  switch (field) {
    case 'company': return deal.company || f.company || '';
    case 'founders': return (deal.founders || f.founders || []).join(', ');
    case 'email': return deal.email || f.email || '';
    case 'website': return deal.website || f.website || '';
    case 'linkedin': return deal.linkedin || f.linkedin || '';
    case 'deckLink': return deal.deckLink || ((deal.files || []).find(f2 => f2.link) || {}).link || '';
    case 'sector': return (WS_SECTORS.find(x => x.id === (deal.sector || f.sector)) || {}).n || '';
    case 'stage': return WS_STAGE_N[deal.stage || f.stage] || '';
    case 'geo': return geoN(deal.geo || f.geo);
    case 'source': return deal.source || '';
    case 'received': return deal.received ? wsIso(wsTime(deal.received)) : '';
    case 'status': return deal.status || '';
    case 'lastContact': return deal.lastContact ? wsIso(wsTime(deal.lastContact)) : '';
    case 'nextAction': return deal.nextAction || '';
    case 'nextDue': return deal.nextDue ? wsIso(wsTime(deal.nextDue)) : '';
    case 'followOwner': return deal.followOwner || '';
    case 'reviewer': return deal.reviewer || '';
    case 'leadPartner': return deal.leadPartner || '';
    case 'referral': return deal.referral || '';
    case 'daysWaiting': { const d = wsDaysSince(deal.received); return d == null ? '' : d; }
    case 'raise': return deal.raise ?? f.raise ?? '';
    case 'thesisResult': return th.label || '';
    case 'thesisReasons': return (th.reasons || []).filter(r => r.ok !== true).map(r => r.text).slice(0, 4).join(' | ') || (th.reasons || []).map(r => r.text).slice(0, 3).join(' | ');
    case 'total': return s && s.total != null ? s.total : '';
    case 'tier': return s ? s.tier || '' : '';
    case 'vcr2Score': return deal.analysis && deal.analysis.score != null ? deal.analysis.score : '';
    case 'summary': return wsSummary(ws, deal, s);
    case 'gaps': return wsGaps(deal, s).slice(0, 5).join(' | ');
    case 'topQuestions': return ((deal.analysis || {}).questions || []).slice(0, 3).join(' | ');
    case 'memoLink': return (deal.memo || {}).url || '';
    case 'folderLink': return deal.folderUrl || '';
    case 'reportLink': return deal.reportUrl || '';
    case 'icDecision': return deal.ic ? deal.ic.label + ((deal.ic.votes || []).some(v => v.conditionsText) ? ': ' + deal.ic.votes.filter(v => v.conditionsText).map(v => v.conditionsText).join('; ') : '') : '';
    case 'icDate': return deal.ic ? wsIso(wsTime(deal.ic.at)) : '';
  }
  if (field.startsWith('pillar:')) { const p = s && s.pillars.find(x => x.id === field.slice(7)); return p && p.score != null ? p.score : ''; }
  return '';
}
function wsSummary(ws, deal, s) {
  const f = deal.facts || {}, money = v => '$' + (v >= 1e6 ? wsRound1(v / 1e6) + 'M' : Math.round(v / 1e3) + 'k');
  const bits = [deal.company || f.company || 'The company'];
  const sec = (WS_SECTORS.find(x => x.id === (deal.sector || f.sector)) || {}).n, geo = (WS_COUNTRIES.find(c => c.id === (deal.geo || f.geo)) || {}).n;
  bits.push([sec && sec.toLowerCase(), geo && 'in ' + geo].filter(Boolean).join(' ') || '');
  const st = WS_STAGE_N[deal.stage || f.stage], raise = deal.raise ?? f.raise;
  let t = `${bits[0]}${bits[1] ? ' (' + bits[1] + ')' : ''}${st ? `, ${st}` : ''}${raise ? `, raising ${money(raise)}` : ''}.`;
  if (f.arr != null) t += ` States ${money(f.arr)} ARR${f.growth != null ? `, ${Math.round(f.growth)}% growth` : ''}.`;
  if (s && s.total != null) t += ` Scorecard ${s.total}/5${s.tier ? ` (${s.tier})` : ` (${s.coverage}% scored)`}.`;
  if (deal.thesis) t += ` ${deal.thesis.label}.`;
  return t;
}
function wsGaps(deal, s) {
  const out = [];
  for (const q of ((deal.thesis || {}).questions || [])) out.push(q);
  for (const p of (s && s.pillars) || []) if (p.score == null) out.push(`${p.name}: not scored yet`);
  for (const c of ((deal.analysis || {}).checks || []).filter(c => c.sev === 'major')) out.push(c.title);
  return out;
}
/* a dropdown keeps the investor's own words: the closest of their options, or nothing (VCR2 never adds an option) */
const WS_SYN = { preseed:['pre-seed', 'pre seed', 'preseed', 'angel'], seed:['seed'], a:['series a', 'a'], b:['series b', 'series b+', 'b', 'growth', 'series c'],
  'in thesis':['in', 'yes', 'fit', 'in thesis'], 'out of thesis':['out', 'no', 'not a fit', 'out of thesis'], 'borderline':['maybe', 'borderline', 'review'], 'borderline (needs info)':['needs info', 'borderline', 'maybe', 'more info'] };
function wsPickOption(options, value) {
  if (!options || !options.length || value === '' || value == null) return value === '' ? '' : null;
  const v = wsNorm(value).trim(), opts = options.map(o => ({ o, n:wsNorm(o).trim() }));
  let hit = opts.find(x => x.n === v); if (hit) return hit.o;
  for (const [k, syn] of Object.entries(WS_SYN)) if (k === v || syn.includes(v) || wsNorm(WS_STAGE_N[k] || '').trim() === v) { hit = opts.find(x => syn.includes(x.n) || x.n === k); if (hit) return hit.o; }
  hit = opts.find(x => x.n && (x.n.includes(v) || v.includes(x.n)) && Math.min(x.n.length, v.length) >= 3); if (hit) return hit.o;
  const first = v.split(' ')[0]; hit = first.length >= 4 && opts.find(x => x.n.split(' ')[0] === first); if (hit) return hit.o;
  return null;
}
/* rows of the sheet that are this company: by name, web domain, founder or deck link */
function wsMatchRow(sheet, mapping, deal) {
  const col = id => (mapping.find(m => m.field === id) || {}).col, cName = col('company'), cWeb = col('website'), cFounder = col('founders'), cDeck = col('deckLink'), cMail = col('email');
  const key = wsKey(deal.company || (deal.facts || {}).company), dom = wsDomain(deal.website) || wsDomain(deal.email), founder = wsNorm((deal.founders || [])[0] || '').trim(), deck = deal.deckLink || '';
  for (let i = 0; i < sheet.rows.length; i++) {
    const r = sheet.rows[i] || [], cell = c => c == null ? '' : String(r[c] ?? '');
    if (key && key.length >= 3 && cName != null && wsKey(cell(cName)) === key) return { row:i, why:'company name' };
    if (dom && ((cWeb != null && wsDomain(cell(cWeb)) === dom) || (cMail != null && wsDomain(cell(cMail)) === dom))) return { row:i, why:'web domain' };
    if (deck && cDeck != null && cell(cDeck) === deck) return { row:i, why:'deck link' };
    if (founder && founder.length >= 5 && cFounder != null && wsNorm(cell(cFounder)).includes(' ' + founder + ' ')) return { row:i, why:'founder' };
  }
  return null;
}
/* the write plan. sheet = { headers, rows (values), formulas: Set of "r:c" or columns, validations:{ col:[options] } };
   sync = { dealId: { row, written:{ col:value } } } what VCR2 wrote last time. Rules:
   - a "write" column is filled when empty, or updated when it still holds what VCR2 wrote; a cell a person changed is left alone
     and read back (the investor's value wins);
   - a formula cell is never written; "read" columns are only read; "ignore" columns are not touched;
   - a dropdown column takes the closest option of the investor's list, or stays empty with a note;
   - a company already in the sheet gets its row updated, never a second row. */
function wsSheetPlan(ws, sheet, deals, sc, sync) {
  const mapping = (ws.storage.sheet || {}).mapping || [], updates = [], appends = [], skipped = [], readBack = {}, rowsOf = {}, notes = [];
  const isFormula = (r, c) => sheet.formulas && (sheet.formulas.has(r + ':' + c) || sheet.formulas.has('c' + c));
  const taken = new Set(); let next = sheet.rows.length;
  for (const d of deals) {
    if (d.mergedInto) continue;
    const s = sc(d), prev = (sync || {})[d.id];
    let row = prev && prev.row != null && prev.row < sheet.rows.length ? prev.row : null, why = row != null ? 'linked' : '';
    if (row == null) { const m = wsMatchRow(sheet, mapping, d); if (m && !taken.has(m.row)) { row = m.row; why = m.why; } }
    const written = Object.assign({}, prev && prev.written || {});
    if (row == null) {   /* a new row: every write column, nothing in formula, read or ignore columns */
      const vals = []; row = next++;
      for (const m of mapping) {
        if (m.mode !== 'write' || isFormula(row, m.col) || sheet.formulas && sheet.formulas.has('c' + m.col)) continue;
        let v = wsFieldValue(ws, d, s, m.field); const opts = sheet.validations && sheet.validations[m.col];
        if (opts && v !== '') { const o = wsPickOption(opts, v); if (o == null) { skipped.push({ id:d.id, row, col:m.col, why:`"${v}" is not one of your ${m.header} options` }); continue; } v = o; }
        if (v === '' || v == null) continue;
        vals[m.col] = wsSafeCell(v); written[m.col] = v;
      }
      appends.push({ id:d.id, row, values:vals });
      rowsOf[d.id] = { row, written, why:'new row' };
      taken.add(row); continue;
    }
    taken.add(row);
    const cur = sheet.rows[row] || [];
    for (const m of mapping) {
      const have = cur[m.col] == null ? '' : cur[m.col];
      if (m.mode === 'read') { if (have !== '') (readBack[d.id] = readBack[d.id] || {})[m.field] = have; continue; }
      if (m.mode !== 'write') continue;
      if (isFormula(row, m.col)) { skipped.push({ id:d.id, row, col:m.col, why:'a formula cell' }); continue; }
      let v = wsFieldValue(ws, d, s, m.field); const opts = sheet.validations && sheet.validations[m.col];
      if (opts && v !== '') { const o = wsPickOption(opts, v); if (o == null) { skipped.push({ id:d.id, row, col:m.col, why:`"${v}" is not one of your ${m.header} options` }); continue; } v = o; }
      if (v === '' || v == null) continue;
      const mine = Object.prototype.hasOwnProperty.call(written, m.col) && String(written[m.col]) === String(have);
      if (have !== '' && !mine) { if (String(have) !== String(v)) { (readBack[d.id] = readBack[d.id] || {})[m.field] = have; skipped.push({ id:d.id, row, col:m.col, why:'changed by your team: kept' }); } continue; }
      if (String(have) === String(v)) { written[m.col] = v; continue; }
      updates.push({ id:d.id, row, col:m.col, value:wsSafeCell(v), a1:wsColLetter(m.col) + (row + 1 + (sheet.headerRow || 1)) }); written[m.col] = v;
    }
    rowsOf[d.id] = { row, written, why };
  }
  if (!mapping.some(m => m.field === 'company' && m.mode !== 'ignore')) notes.push('Map the company name column: without it VCR2 cannot find existing rows.');
  return { updates, appends, skipped, readBack, rowsOf, notes };
}

/* ── the deal memo: a template in plain text with a few marks (# heading, - bullet, {{placeholder}}), rendered safely ── */
const WS_MEMO_TEMPLATE = `# {{company}}: deal memo
{{date}} · {{workspace}} · prepared with VCR2 (evidence-first)

## Summary
{{summary}}

## Scorecard
{{scorecard}}

Total weighted score: **{{total}}** ({{tier}}). Threshold {{threshold}}.

## Thesis fit
{{thesis}}

## Key metrics (with their evidence)
{{metrics}}

## Consistency checks
{{checks}}

## Risks and red flags
{{risks}}

## Diligence questions, most important first
{{questions}}

## Team notes
{{notes}}

## Sources
{{sources}}

Generated by VCR2. Scores marked "engine" come from the figures and checks listed; scores marked "reviewer" were set by a person. Not investment advice.`;
function wsMemoData(ws, deal, s) {
  const pill = (s.pillars || []).map(p => `${p.name} (${p.weight}%): ${p.score != null ? p.score + '/5' : 'not scored'}, ${p.from === 'engine' ? `engine${p.engine && p.engine.basis === 'claims' ? ', from the deck claims' : ''}: ${(p.engine.sources || []).map(x => `${x.label} ${x.value}`).join(', ')}` : p.from === 'reviewer' ? `reviewer ${p.by || ''}${p.at ? ', ' + p.at.slice(0, 10) : ''}` : p.from === 'ai' ? `AI suggestion confirmed by ${p.by || 'a reviewer'}${p.at ? ', ' + p.at.slice(0, 10) : ''}` : 'needs a reviewer'}`);
  const a = deal.analysis || {}, f = deal.facts || {};
  const src = new Set(); Object.values(f.src || {}).forEach(x => x && x.file && src.add(`${x.file}${x.loc ? ' (' + x.loc + ')' : ''}`)); (deal.files || []).forEach(x => src.add(x.name + (x.link ? ': ' + x.link : '')));
  return {
    company:deal.company || f.company || 'Unnamed company', date:wsIso(Date.now()), workspace:ws.name, summary:wsSummary(ws, deal, s),
    scorecard:pill, total:s.total != null ? String(s.total) : 'n/a', tier:s.tier || (s.provisionalTier ? 'provisional ' + s.provisionalTier : 'not tiered'), threshold:String(ws.scorecard.threshold),
    thesis:[(deal.thesis || {}).label || 'Not checked'].concat(((deal.thesis || {}).reasons || []).map(r => `${r.ok === true ? 'Yes' : r.ok === false ? 'No' : 'Check'}: ${r.text}${r.src ? ` (${r.src.file}${r.src.loc ? ', ' + r.src.loc : ''})` : ''}`)),
    metrics:(a.metrics || []).slice(0, 14).map(m => `${m.label}: ${m.value} (${m.evidence || 'unverified'})`),
    checks:(a.checks || []).length ? a.checks.slice(0, 10).map(c => `${c.sev === 'major' ? 'Major' : 'Minor'}: ${c.title}. ${c.text || ''}`) : ['No consistency check failed on the figures provided.'],
    risks:(a.patterns || []).length ? a.patterns.slice(0, 8).map(p => `${p.title}${p.why ? ': ' + p.why : ''}`) : ['No red-flag pattern detected on the figures provided.'],
    questions:[...new Set([...(deal.thesis || {}).questions || [], ...(a.questions || []), ...(s.pillars || []).filter(p => p.score == null).flatMap(p => p.questions.slice(0, 1))])].slice(0, 12),
    notes:(deal.notes || []).length ? deal.notes.slice(-12).map(n => `${n.by || 'Team'}${n.at ? ' (' + String(n.at).slice(0, 10) + ')' : ''}: ${n.text}`) : ['No notes yet.'],
    sources:[...src].slice(0, 20),
  };
}
function wsMemoText(template, data) {
  return String(template || WS_MEMO_TEMPLATE).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => { const v = data[k]; return v == null ? m : Array.isArray(v) ? v.map(x => '- ' + x).join('\n') : String(v); });
}
/* safe HTML for a Google Doc upload (Drive converts it): only headings, paragraphs, lists and bold */
function wsMemoHTML(template, data) {
  const out = [], lines = wsMemoText(template, data).split('\n'); let list = false;
  const inline = s => esc(s).replace(/\*\*([^*]{1,200})\*\*/g, '<b>$1</b>');
  for (const l of lines) {
    const m = /^(#{1,3})\s+(.*)$/.exec(l), b = /^\s*[-•]\s+(.*)$/.exec(l);
    if (b) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(b[1])}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    if (m) out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  if (list) out.push('</ul>');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(data.company)} deal memo</title><style>body{font-family:Georgia,serif;color:#1c2430}h1{font-size:22pt;color:#14213d}h2{font-size:14pt;color:#7a5c1e;border-bottom:1px solid #d9cba8;padding-bottom:2pt}p,li{font-size:11pt;line-height:1.45}</style></head><body>${out.join('\n')}</body></html>`;
}

/* ── JSON export and webhook payload (documented in docs/workspace-integration.md) ── */
function wsExportDeal(ws, deal, s) {
  return { schema:'vcr2.workspace.company/1', workspace:{ id:ws.id, name:ws.name }, id:deal.id, company:deal.company || (deal.facts || {}).company || null,
    founders:deal.founders || (deal.facts || {}).founders || [], email:deal.email || null, website:deal.website || null, linkedin:deal.linkedin || null,
    sector:deal.sector || (deal.facts || {}).sector || null, stage:deal.stage || (deal.facts || {}).stage || null, geo:deal.geo || (deal.facts || {}).geo || null,
    raise:deal.raise ?? (deal.facts || {}).raise ?? null, source:deal.source || null, received:deal.received || null,
    thesis:deal.thesis ? { result:deal.thesis.result, label:deal.thesis.label, reasons:deal.thesis.reasons, questions:deal.thesis.questions } : null,
    scorecard:s ? { name:ws.scorecard.name, total:s.total, tier:s.tier, coverage:s.coverage, meets_threshold:s.meets, pillars:s.pillars.map(p => ({ id:p.id, name:p.name, weight:p.weight, score:p.score, from:p.from, by:p.by || null, at:p.at || null, basis:p.engine ? p.engine.basis : null, sources:p.engine ? p.engine.sources : [] })) } : null,
    analysis:deal.analysis ? { score:deal.analysis.score, hash:deal.analysis.hash, rubric:deal.analysis.rubric, checks:deal.analysis.checks, questions:deal.analysis.questions } : null,
    pipeline:{ status:deal.status || null, reviewer:deal.reviewer || null, last_contact:deal.lastContact || null, next_action:deal.nextAction || null, next_action_due:deal.nextDue || null, follow_up_owner:deal.followOwner || null },
    links:{ folder:deal.folderUrl || null, memo:(deal.memo || {}).url || null, report:deal.reportUrl || null, deck:deal.deckLink || null },
    files:(deal.files || []).map(f => ({ name:f.name, sha256:f.hash || null, size:f.size || null, link:f.link || null })), timing:deal.timing || null };
}
function wsWebhookBody(event, ws, deal, s) { return { event, sent_at:new Date().toISOString(), data:wsExportDeal(ws, deal, s) }; }
