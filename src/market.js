/* ═══════════════════════════════════════════════════════════════
   MARKET DATA: the startup's market (United States or Europe) and the market figures that come with it.
   Three tiers, best first: online with an AI key (Market intel adds web research), online without a key (the weekly data
   file published with the site, data/market.json, read from this site only), offline (the snapshot built into this page).
   Rules (the owner's): a figure feeds a result only when it comes from an official source or a trusted VC source, and every
   figure shows its source, link and date. A figure with no trusted source falls back to the built-in value and says so.
   Each item can be switched to "shown only" in the Studio. The report records the market and the data date, and both enter
   the run hash, so the same inputs with the same data give the same result.
   ═══════════════════════════════════════════════════════════════ */
const MARKETS = [
  { id:'us', label:'United States', cur:'$', curName:'US dollars' },
  { id:'eu', label:'Europe', cur:'€', curName:'euros' },
];
/* What each item is for. feeds: what it changes when it is used (null: shown only, it never enters a calculation). */
const MD_ITEMS = [
  { id:'exit_multiple', label:'Exit multiple: public software, EV ÷ next-12-month revenue', unit:'x',
    feeds:'sets the exit multiple when you leave it blank (returns, VC Method, fund-return test)' },
  { id:'fx_usd', label:'Exchange rate: US dollars per euro', unit:'', only:'eu',
    feeds:'converts the dollar thresholds (ARR per employee, bottom-up market size, the next-stage ARR bar) into euros' },
  { id:'risk_free_10y', label:'Risk-free rate: 10-year government yield', unit:'%', feeds:null },
  { id:'firms_mid', label:'Companies with 100 to 499 employees (US) or 50 to 249 (EU), all industries', unit:'', feeds:null },
  { id:'firms_large', label:'Companies with 500 or more employees (US) or 250 or more (EU), all industries', unit:'', feeds:null },
  { id:'firms_software', label:'Software publishers (US NAICS 5112, EU NACE J58.2)', unit:'', feeds:null },
  { id:'round_pre_seed', label:'Median pre-seed and seed pre-money valuation', unit:'$', feeds:null },
  { id:'round_pre_a', label:'Median Series A pre-money valuation', unit:'$', feeds:null },
];
/* The snapshot built into the page (tier 3). Official figures are refreshed weekly by the data job; VC figures each quarter. */
const MARKET_BUILTIN = {
  updated:'2026-11-19', version:'2026-11-19',
  items:{
    exit_multiple:{
      us:{ value:4.7, date:'2026-11-13', src:'Clouded Judgement (Jamin Ball, Altimeter): public software index', kind:'vc', url:'https://cloudedjudgement.substack.com/p/clouded-judgement-111326-the-frontier',
        note:'Median EV ÷ next-12-month revenue. By projected growth: above 22%: 13.4x, 15 to 22%: 5.9x, below 15%: 3.3x.' },
      eu:{ value:2.1, date:'2026-11-19', src:'Multiples.vc European B2B SaaS Index (50 largest listed European B2B SaaS companies)', kind:'vc', url:'https://multiples.vc/sector-indexes/multiples-european-b2b-saas-index', feeds:false,
        note:'Median EV ÷ next-12-month revenue. Shown for reference only: this index is not yet on VCR2’s list of trusted VC sources, so the built-in exit multiple is used.' },
    },
    fx_usd:{ eu:{ value:1.0992, date:'2026-11-19', src:'European Central Bank reference rate', kind:'official', url:'https://data.ecb.europa.eu/data/datasets/EXR/EXR.D.USD.EUR.SP00.A' } },
    risk_free_10y:{
      us:{ value:5.04, date:'2026-11-19', src:'US Treasury daily par yield curve, 10-year', kind:'official', url:'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve' },
      eu:{ value:3.41, date:'2026-11-18', src:'ECB euro area yield curve (AAA), 10-year spot', kind:'official', url:'https://data.ecb.europa.eu/data/datasets/YC/YC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y' },
    },
    firms_mid:{
      us:{ value:88023, date:'2021', src:'US Census, Statistics of US Businesses (firms with 100 to 499 employees)', kind:'official', url:'https://www.census.gov/programs-surveys/susb.html' },
      eu:{ value:250765, date:'2024', src:'Eurostat, enterprises by size class (50 to 249 employees), EU27', kind:'official', url:'https://ec.europa.eu/eurostat/databrowser/view/sbs_sc_ovw/default/table' },
    },
    firms_large:{
      us:{ value:19688, date:'2021', src:'US Census, Statistics of US Businesses (firms with 500 or more employees)', kind:'official', url:'https://www.census.gov/programs-surveys/susb.html' },
      eu:{ value:54762, date:'2024', src:'Eurostat, enterprises by size class (250 or more employees), EU27', kind:'official', url:'https://ec.europa.eu/eurostat/databrowser/view/sbs_sc_ovw/default/table' },
    },
    firms_software:{
      us:{ value:12741, date:'2021', src:'US Census, Statistics of US Businesses (NAICS 5112, software publishers)', kind:'official', url:'https://www.census.gov/programs-surveys/susb.html' },
      eu:{ value:33004, date:'2024', src:'Eurostat, enterprises in software publishing (NACE J58.2), EU27', kind:'official', url:'https://ec.europa.eu/eurostat/databrowser/view/sbs_sc_ovw/default/table' },
    },
    round_pre_seed:{
      us:{ value:null, note:'No verified source yet: Carta and PitchBook-NVCA give it only in their full reports, behind a download form. Add the figure each quarter from the report.' },
      eu:{ value:4800000, date:'2026-11-17', src:'PitchBook, Q3 2026 European VC Valuations Report', kind:'vc', url:'https://pitchbook.com/news/reports/q3-2026-european-vc-valuations-report',
        note:'In euros. The only stage whose median valuation fell year on year.' },
    },
    round_pre_a:{
      us:{ value:null, note:'No verified source yet: Carta and PitchBook-NVCA give it only in their full reports, behind a download form. Add the figure each quarter from the report.' },
      eu:{ value:null, note:'No verified source yet: PitchBook gives it only in the full European report, behind a download form. Add the figure each quarter from the report.' },
    },
  },
};
let MARKET_DATA = MARKET_BUILTIN, MARKET_SRC = 'built-in', MD_READY = null;
const mktId = () => (typeof S !== 'undefined' && S && S.market === 'eu') ? 'eu' : 'us';
const mktInfo = () => MARKETS.find(m => m.id === mktId());
const curSym = () => mktId() === 'eu' ? '€' : (typeof MONEY_SYMBOL === 'string' ? MONEY_SYMBOL : '$');
const unitShown = u => u === '$' ? curSym() : u;
/* One figure for the current market (or a given one), or null when there is none or it is not a finite number. */
function mdGet(id, mkt) {
  const it = MARKET_DATA.items && MARKET_DATA.items[id], v = it && it[mkt || mktId()];
  return v && typeof v.value === 'number' && isFinite(v.value) ? v : null;
}
const mdNote = (id, mkt) => { const it = MARKET_DATA.items && MARKET_DATA.items[id], v = it && it[mkt || mktId()]; return v && v.note ? v.note : ''; };
const mdMode = id => (((typeof CFG !== 'undefined' && CFG.settings && CFG.settings.marketData) || {})[id] === 'show') ? 'show' : 'feed';
/* A figure that feeds results: it exists, is official or from a trusted VC source, the item can feed, and the owner did not
   switch it to "shown only". */
function mdFeed(id) {
  const d = mdGet(id), item = MD_ITEMS.find(x => x.id === id);
  return d && item && item.feeds && d.feeds !== false && (d.kind === 'official' || d.kind === 'vc') && mdMode(id) === 'feed' ? d : null;
}
/* US dollars per unit of the startup's currency: 1 in the US; the ECB rate in Europe (the built-in rate when the live one
   is switched to shown only, so euro thresholds never go unconverted). */
function usdPerLocal() {
  if (mktId() === 'us') return 1;
  const d = mdFeed('fx_usd') || ((MARKET_BUILTIN.items.fx_usd || {}).eu);
  return d && d.value > 0 ? d.value : 1;
}
const fromUsd = v => v == null || !isFinite(v) ? v : v / usdPerLocal();
/* The exit multiple used when the investor leaves it blank: the market figure when it may feed, else the built-in one. */
/* Precedence: the investor's own figure (handled by the caller), then the owner's Studio default, then the market figure
   when it may feed, then the built-in assumption. */
const DEAL_EXIT_BUILTIN = DEAL_DEFAULTS.exit_multiple;   /* read before the owner's configuration is applied */
const ownerExitDefault = () => DEAL_DEFAULTS.exit_multiple !== DEAL_EXIT_BUILTIN;
function defaultExitMultiple() { if (ownerExitDefault()) return DEAL_DEFAULTS.exit_multiple; const d = mdFeed('exit_multiple'); return d ? d.value : DEAL_DEFAULTS.exit_multiple; }
/* The market data that can change a result, for the run hash: the market and every figure actually feeding. */
function mdHashPart() {
  const used = {};
  MD_ITEMS.forEach(it => {
    if (it.only && it.only !== mktId()) return;
    if (it.id === 'exit_multiple' && ((typeof gv === 'function' && gv('exit_multiple_assumption') != null) || ownerExitDefault())) return;   /* the investor's or the owner's multiple is used */
    const d = mdFeed(it.id); if (d) used[it.id] = d.value;
  });
  return { m:mktId(), md:used };
}
const mdDateLabel = () => `${MARKET_DATA.updated || 'unknown date'} (${MARKET_SRC === 'live' ? 'live data file' : 'built-in snapshot'})`;

/* ── tier 2: the weekly data file, read from this site only (the page's security policy allows nothing else for it) ── */
const MD_ISO = /^\d{4}(-\d{2}(-\d{2})?)?$/;
function mdValid(d) {
  if (!d || typeof d !== 'object' || !MD_ISO.test(String(d.updated || '')) || !d.items || typeof d.items !== 'object') return false;
  return Object.entries(d.items).every(([id, byMkt]) => /^[a-z0-9_]{1,40}$/.test(id) && byMkt && typeof byMkt === 'object'
    && Object.entries(byMkt).every(([m, v]) => MARKETS.some(x => x.id === m) && v && typeof v === 'object'
      && (v.value === null || (typeof v.value === 'number' && isFinite(v.value) && v.value >= 0 && v.value < 1e13))
      && (v.value === null || (MD_ISO.test(String(v.date || '')) && typeof v.src === 'string' && v.src.length < 200 && /^https:\/\/[^\s"<>]{4,300}$/.test(String(v.url || '')) && ['official', 'vc'].includes(v.kind)))));
}
async function loadMarketData() {
  if (typeof fetch !== 'function' || (typeof location !== 'undefined' && location.protocol === 'file:')) return false;
  try {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null, t = ctl ? setTimeout(() => ctl.abort(), 2500) : null;
    const res = await fetch('data/market.json?t=' + Date.now(), { cache:'no-store', credentials:'omit', signal:ctl ? ctl.signal : undefined });
    if (t) clearTimeout(t);
    if (!res.ok) return false;
    const text = await res.text(); if (text.length > 200000) return false;
    const d = JSON.parse(text);
    if (!mdValid(d) || String(d.updated) < String(MARKET_BUILTIN.updated)) return false;   /* never step back to older data */
    /* Items the file does not carry keep their built-in value. */
    MARKET_DATA = { updated:d.updated, version:d.version || d.updated, items:Object.assign({}, MARKET_BUILTIN.items, d.items) };
    MARKET_SRC = 'live';
    return true;
  } catch (e) { return false; }
}

/* ── the market selector on the set-up page ── */
function buildMarkets() {
  const el = $id('market-grid'); if (!el) return;
  setHTML(el, MARKETS.map(m => `<button type="button" class="type-card market-card${mktId() === m.id ? ' sel' : ''}" aria-pressed="${mktId() === m.id}" data-click="selMarket" data-a="${esc(m.id)}">
    <span class="type-n">${esc(m.label)}</span><span class="type-s">Amounts in ${esc(m.curName)} (${esc(m.cur)}); ${m.id === 'eu' ? 'European rates, exchange rate and company counts' : 'US rates and company counts'}</span></button>`).join(''));
}
function selMarket(id) {
  if (!MARKETS.some(m => m.id === id)) return;
  S.market = id; buildMarkets(); if (typeof saveDraft === 'function') saveDraft(); if (typeof updateProgress === 'function') updateProgress();
}

/* ── in the report: every market figure with its source, link, date and whether it fed the results ── */
function mdFmt(it, d) {
  if (it.id === 'fx_usd') return d.value.toFixed(4);
  if (it.unit === 'x') return d.value.toFixed(1) + 'x';
  if (it.unit === '%') return d.value.toFixed(2) + '%';
  if (it.unit === '$') return money(d.value);
  return nf.format(Math.round(d.value));
}
function marketDataHTML() {
  const m = mktInfo();
  const rows = MD_ITEMS.filter(it => !it.only || it.only === m.id).map(it => {
    const d = mdGet(it.id), feed = mdFeed(it.id);
    const use = !d ? `<span class="pill">built-in value used</span>` : feed ? '<span class="pill md-feed">feeds the results</span>' : it.feeds && d.feeds !== false && mdMode(it.id) === 'show' ? '<span class="pill">shown only (Studio)</span>' : '<span class="pill">shown only</span>';
    return `<tr><td>${esc(it.label)}${it.feeds && feed ? `<div class="field-hint">It ${esc(it.feeds)}.</div>` : ''}</td>
      <td class="m">${d ? esc(mdFmt(it, d)) : 'n/a'}</td>
      <td>${d ? `<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.src)}</a>${d.note ? `<div class="field-hint">${esc(d.note)}</div>` : ''}` : `<span class="field-hint">${esc(mdNote(it.id) || 'No trusted source: the built-in value is used.')}</span>`}</td>
      <td>${d ? esc(d.date) : ''}</td><td>${use}</td></tr>`;
  }).join('');
  return `<div class="block-title">Market data: ${esc(m.label)}</div>
    <p class="field-hint">Data as of ${esc(mdDateLabel())}. Only official sources and trusted VC sources feed a result; anything else falls back to the built-in value and says so. ${mktId() === 'eu' ? `Amounts are in euros; dollar thresholds are converted at ${usdPerLocal().toFixed(4)} US dollars per euro.` : ''}</p>
    <div class="tbl-wrap"><table class="ledger md-tbl"><thead><tr><th>Figure</th><th>Value</th><th>Source</th><th>Date</th><th>Use</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
/* A short line next to the bottom-up market inputs: how many companies there are, by the official counts. */
function mdFirmsHint() {
  const a = mdGet('firms_mid'), b = mdGet('firms_large'), s = mdGet('firms_software'); if (!a && !b) return '';
  const eu = mktId() === 'eu';
  return `For reference (${eu ? 'EU27' : 'United States'}): ${a ? `${nf.format(a.value)} companies with ${eu ? '50 to 249' : '100 to 499'} employees` : ''}${a && b ? ', ' : ''}${b ? `${nf.format(b.value)} with ${eu ? '250' : '500'} or more` : ''}${s ? `, ${nf.format(s.value)} software publishers` : ''} (${esc((a || b).src.split(',')[0])}, ${esc((a || b).date)}).`;
}

/* ── Studio: which market figures may feed the results ── */
function paneStMarket() {
  const md = (ST.draft.settings.marketData = ST.draft.settings.marketData || {});
  const rows = MD_ITEMS.filter(it => it.feeds).map(it => `<tr><th scope="row">${esc(it.label)}<div class="field-hint">When used, it ${esc(it.feeds)}.</div></th>
    <td><label><input type="radio" name="md-${esc(it.id)}" data-change="stMdMode" data-a="${esc(it.id)}" data-b="feed"${md[it.id] !== 'show' ? ' checked' : ''}> Feeds the results</label><br>
        <label><input type="radio" name="md-${esc(it.id)}" data-change="stMdMode" data-a="${esc(it.id)}" data-b="show"${md[it.id] === 'show' ? ' checked' : ''}> Shown only</label></td></tr>`).join('');
  return `<p class="pg-desc">Market figures come from official sources (US Treasury, ECB, US Census, Eurostat) refreshed weekly, and trusted VC sources refreshed each quarter. Each one shows its source, link and date in the report. Choose here which may change a result; the rest are shown next to the results only.</p>
    <div class="st-card"><h3>Data in use</h3><p>${esc(mdDateLabel())}</p></div>
    <div class="st-card"><h3>Feeds the results or shown only</h3><table class="tbl"><tbody>${rows}</tbody></table></div>`;
}
function stMdMode(id, mode, on) {
  if (!on || !MD_ITEMS.some(x => x.id === id)) return;
  const md = (ST.draft.settings.marketData = ST.draft.settings.marketData || {});
  if (mode === 'show') md[id] = 'show'; else delete md[id];
  saveStudioDraft();
}

/* Under the returns: which exit multiple was used and where it comes from, and the risk-free rate next to the target return. */
function mdDealNote(Rt) {
  const own = typeof gv === 'function' ? gv('exit_multiple_assumption') : null, d = mdFeed('exit_multiple'), rf = mdGet('risk_free_10y');
  const ex = own != null ? `Exit multiple: ${own}x, your assumption.`
    : ownerExitDefault() ? `Exit multiple: ${DEAL_DEFAULTS.exit_multiple}x, the default set in the Studio.`
    : d ? `Exit multiple: ${d.value.toFixed(1)}x, because the field is blank: the median of the <a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.src)}</a> (${esc(d.date)}).`
    : `Exit multiple: ${DEAL_DEFAULTS.exit_multiple}x, the built-in assumption (${esc(mdNote('exit_multiple') || 'no trusted market figure for this market')}).`;
  const r = rf ? ` Risk-free rate: ${rf.value.toFixed(2)}% (<a href="${esc(rf.url)}" target="_blank" rel="noopener noreferrer">${esc(rf.src)}</a>, ${esc(rf.date)})${Rt && Rt.r != null ? `, so the ${Math.round(Rt.r)}% target asks ${Math.round(Rt.r - rf.value)} points a year for the venture risk` : ''}.` : '';
  return `<p class="field-hint md-deal">${ex}${r}</p>`;
}

/* ── stages: the ARR ranges are set in US dollars; for a European startup they are shown and compared in euros ── */
function stageRangeLocal(id) {
  const r = typeof STAGE_RANGE !== 'undefined' && STAGE_RANGE[id]; if (!r) return null;
  return { lo:r.lo != null ? fromUsd(r.lo) : null, hi:r.hi != null ? fromUsd(r.hi) : null };
}
function stageText(st) {
  if (!st) return '';
  if (mktId() === 'us') return st.s;
  const r = stageRangeLocal(st.id); if (!r || (r.lo == null && r.hi == null)) return st.s;
  return r.lo && r.hi ? `${money(r.lo)} to ${money(r.hi)} ARR` : r.hi ? `< ${money(r.hi)} ARR` : `${money(r.lo)}+ ARR`;
}

/* ── what differs beyond the figures: the rules an investor checks, and the usual exit routes. Each line links to an
   official source (or the VC report it quotes), checked on 2026-11-19. Not legal or tax advice. ── */
const MKT_RULES = {
  us:[
    { t:'Fundraising rules (Regulation D)', why:'Startup rounds are usually sold under the SEC’s Regulation D exemption, and a Form D notice is due within 15 days of the first sale. Ask for the filings for every past round.', src:'SEC, Filing a Form D notice', url:'https://www.sec.gov/resources-small-businesses/exempt-offerings/filing-form-d-notice' },
    { t:'Privacy', why:'There is no single federal privacy law: California’s CCPA and a growing number of state laws apply depending on where customers live, plus the GDPR for European users.', src:'California Attorney General, CCPA', url:'https://oag.ca.gov/privacy/ccpa' },
    { t:'Foreign investors (CFIUS)', why:'Investment by non-US investors in companies with critical technology, critical infrastructure or sensitive personal data can need a CFIUS filing before closing.', src:'US Treasury, CFIUS', url:'https://www.cfius.gov/' },
  ],
  eu:[
    { t:'Data protection (GDPR)', why:'Applies to any company handling personal data of people in the EU. Fines reach €20 million or 4% of worldwide annual turnover, whichever is higher.', src:'Regulation (EU) 2016/679, Article 83', url:'https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng' },
    { t:'AI Act', models:['ai_app'], why:'Prohibited uses have been banned since February 2025 and rules for general-purpose models apply since August 2025. Rules for high-risk uses (biometrics, critical infrastructure, education, employment and others) apply from 2 December 2027. Ask how each AI system is classified.', src:'European Commission, AI Act (Regulation (EU) 2024/1689)', url:'https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai' },
    { t:'Digital operational resilience (DORA)', models:['fintech'], why:'Since 17 January 2025, financial firms, payment and e-money institutions included, must meet rules on ICT risk, incident reporting and third-party providers.', src:'Regulation (EU) 2022/2554', url:'https://eur-lex.europa.eu/eli/reg/2022/2554/oj/eng' },
    { t:'Foreign investment screening', why:'A revised EU regulation makes screening of foreign investment in sensitive sectors mandatory in every Member State, which have 18 months from mid-2026 to put it in place. A non-EU investor or buyer can face a review.', src:'European Commission, 26 June 2026', url:'https://policy.trade.ec.europa.eu/news/eu-strengthens-its-foreign-investment-screening-framework-2026-06-26_en' },
  ],
};
const MKT_EXITS = {
  us:[
    { t:'Sale to a buyer (M&A)', why:'The usual exit. Deals above $133.9 million must be notified to the FTC and the Justice Department before closing (thresholds in force from 17 February 2026), which adds a waiting period.', src:'Federal Trade Commission, HSR thresholds', url:'https://www.ftc.gov/enforcement/premerger-notification-program/current-thresholds' },
    { t:'Listing (IPO)', why:'Rare at the moment: 18 US companies went public in Q3 2026, most of them in healthcare, while 992 unicorns wait for an exit.', src:'PitchBook-NVCA Venture Monitor, Q3 2026', url:'https://pitchbook.com/news/reports/q3-2026-pitchbook-nvca-venture-monitor' },
    { t:'Tax relief on the exit (QSBS)', why:'For individual holders, gains on shares of a US C corporation that had up to $75 million of gross assets when the shares were issued can be partly or fully excluded from tax: 50% after 3 years, 75% after 4, 100% after 5, up to $15 million per company, for shares issued after 4 July 2025.', src:'26 U.S. Code § 1202', url:'https://www.law.cornell.edu/uscode/text/26/1202' },
  ],
  eu:[
    { t:'Sale to a buyer (M&A)', why:'The usual exit, often to a US buyer. Only very large deals reach the EU merger thresholds (more than €5 billion combined worldwide turnover and at least two parties with more than €250 million each in the EU); national rules can still apply.', src:'EU Merger Regulation (EC) No 139/2004, Article 1', url:'https://eur-lex.europa.eu/eli/reg/2004/139/oj/eng' },
    { t:'Listing (IPO)', why:'European exit valuations are above the 2021 peak, but carried by a handful of large deals rather than broad activity.', src:'PitchBook, Q3 2026 European VC Valuations Report', url:'https://pitchbook.com/news/reports/q3-2026-european-vc-valuations-report', listing:true },
  ],
};
const mdLink = (src, url) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(src)}</a>`;
function mktList(L) {
  const mk = typeof modelKey === 'function' ? modelKey() : S.model;
  return `<ul class="md-list">${L.filter(x => !x.models || x.models.includes(mk)).map(x => {
    let why = esc(x.why);
    if (x.listing) {
      const e = mdGet('exit_multiple', 'eu'), u = mdGet('exit_multiple', 'us');
      if (e && u) why += ` Listed European B2B software trades at a median ${e.value.toFixed(1)}x next-year revenue (${mdLink(e.src.split(' (')[0], e.url)}, ${esc(e.date)}) against ${u.value.toFixed(1)}x for US software (${mdLink(u.src.split(':')[0], u.url)}, ${esc(u.date)}), so a European listing usually values the same company lower.`;
    }
    return `<li><strong>${esc(x.t)}.</strong> ${why} <span class="field-hint">Source: ${mdLink(x.src, x.url)}.</span></li>`;
  }).join('')}</ul>`;
}
function marketRulesHTML() {
  const m = mktInfo();
  return `<div class="block-title" style="margin-top:20px">Rules to check: ${m.id === 'eu' ? 'a European startup' : 'a US startup'}</div>
    <p class="field-hint">What changes with the market, with the official source of each point. Not legal or tax advice.</p>${mktList(MKT_RULES[m.id])}`;
}
function marketExitsHTML() {
  const m = mktInfo();
  return `<div class="block-title" style="margin-top:20px">Exit routes: ${m.id === 'eu' ? 'Europe' : 'United States'}</div>${mktList(MKT_EXITS[m.id])}`;
}
