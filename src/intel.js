/* ═══════════════════════════════════════════════════════════════
   MARKET INTEL (LIVE): optional, with the visitor's own AI key.
   The provider searches the public web and cites its sources; VCR2
   keeps only claims whose source the provider really returned, shows
   each one next to the deal's own figures and never scores them.
   What is sent: the public company profile typed on this tab (name,
   website, what it does, sector, customers, country, competitors).
   Never the ledger, the financials, the documents or the form.
   ═══════════════════════════════════════════════════════════════ */
/* What VCs check outside the data room, in the order a partner reads it (investment memo practice: market, competition,
   comparable rounds, exit, team, customers, risks, timing). n: web searches allowed for the section. */
const INTEL_SECTIONS = [
  { id:'snapshot', n:2, t:'What the company does', q:'Product, customers, business model, headquarters, founding year, headcount and funding to date, from public sources.',
    ask:'What the company sells, to whom, how it charges, where it is based, when it was founded, roughly how many people work there, and what it has raised (rounds, dates, amounts, lead investors).',
    cols:['Fact', 'Public answer'] },
  { id:'competitors', n:5, t:'Competitors', q:'Who else solves this problem, how much they have raised and how they differ.',
    ask:'The direct competitors, the incumbent or legacy alternative customers use today, and adjacent players that could move in. For each: what they do, total funding and last round (date, amount, lead), headquarters, approximate headcount, pricing if public, and how they differ from this company.',
    cols:['Company', 'Type', 'Funding to date', 'Last round', 'How it differs'] },
  { id:'comps', n:5, t:'Comparable funding rounds', q:'Recent rounds of similar companies at the same stage: amount, valuation and revenue multiple where public.',
    ask:'Funding rounds in the last 24 months of companies in the same category and stage: company, date, round, amount raised, post-money valuation if disclosed, revenue or ARR at the time if disclosed, the valuation-to-revenue multiple when both are public, and the lead investors.',
    cols:['Company', 'Date', 'Round', 'Raised', 'Post-money', 'Revenue multiple', 'Lead'] },
  { id:'market', n:4, t:'Market size', q:'Published estimates of the market, their year, growth rate and method.',
    ask:'Published estimates of the size of the market this company sells into: the figure in US dollars, the year it refers to, the growth rate (CAGR) and period, the publisher, and whether the method is top-down (an analyst total) or bottom-up (customers times price). Prefer the narrowest market that matches what the company sells.',
    cols:['Estimate', 'Year', 'Growth', 'Publisher', 'Method'] },
  { id:'exits', n:4, t:'Public companies and exits', q:'What listed peers trade at and what similar companies were bought for.',
    ask:'Listed companies closest to this one with their enterprise value to revenue multiple (state the date), and acquisitions of similar companies in the last 5 years with buyer, price and revenue multiple when disclosed.',
    cols:['Company', 'Kind', 'Value', 'Revenue multiple', 'Date'] },
  { id:'team', n:3, t:'Founders and team', q:'Public background of the founders: prior roles, prior companies and exits, years in the field.',
    ask:'The founders and senior team: role, prior employers and roles, prior startups and their outcome (acquired, failed, still running), years of experience in this field, and anything public that contradicts what they say about themselves.',
    cols:['Person', 'Role', 'Background', 'Prior outcome'] },
  { id:'traction', n:4, t:'Customers and traction signals', q:'Named customers that confirm publicly, review scores, hiring and recent momentum.',
    ask:'Signals outside the data room: customers that publicly confirm using the product (case studies, press releases), review scores and counts on G2, Capterra, Trustpilot or app stores, open job postings (how many, which functions), partnerships, and notable news in the last 12 months.',
    cols:['Signal', 'What the web shows', 'Date'] },
  { id:'risks', n:4, t:'Red flags', q:'Litigation, layoffs, regulatory action, security incidents, negative press and departures.',
    ask:'Anything a careful investor would want to know before investing: lawsuits, regulatory action or fines, security breaches, layoffs, founder or executive departures, negative press, customer complaints, or a pivot. If none is found, say so plainly.',
    cols:['Issue', 'What happened', 'Date'] },
  { id:'whynow', n:3, t:'Trends and why now', q:'Regulation, technology and buying shifts that make this market open now, or close it.',
    ask:'Developments in the last 24 months that make this market more or less attractive now: regulation, technology shifts, changes in how customers buy, budget trends, and moves by large players.',
    cols:['Trend', 'Effect on the market', 'Date'] },
];
/* web search cost per search, in US dollars, and the tokens a section reads and writes (official pricing pages, 2026-11-14) */
const INTEL_PRICE = {
  anthropic:{ search:0.01, label:'$10 per 1,000 searches, plus the text it reads (about $0.01 to $0.04 a section)', tok:[0.01, 0.04] },
  openai:{ search:0.01, label:'$10 per 1,000 searches, plus the text it reads (about $0.01 to $0.04 a section)', tok:[0.01, 0.04] },
  gemini:{ search:0, label:'5,000 free searches a month on Gemini 3 and newer, then $14 per 1,000', tok:[0, 0.02] },
  openrouter:{ search:0.007, label:'about $0.007 a search, plus the model it runs', tok:[0.005, 0.03] },
};
const INTEL_KEY = 'vcr2-intel';
function intelSupported(p) { return !!INTEL_PRICE[p]; }
function intelCost(provider, ids) {
  const P = INTEL_PRICE[provider]; if (!P) return null;
  const secs = INTEL_SECTIONS.filter(s => ids.includes(s.id)), n = secs.reduce((a, s) => a + s.n, 0);
  return { searches:n, lo:Math.max(0, n * P.search * 0.5 + secs.length * P.tok[0]), hi:n * P.search + secs.length * P.tok[1], label:P.label };
}

/* ── the profile: the only thing that leaves the browser ── */
const INTEL_FIELDS = [['name', 'Company name', 80], ['website', 'Website', 120], ['what', 'What it does, in one or two sentences', 400], ['sector', 'Sector or category', 80],
  ['customers', 'Who pays (for example hospitals, SMB retailers, consumers)', 120], ['country', 'Country', 60], ['rivals', 'Competitors you already know (optional)', 200]];
function intelCleanProfile(p) {
  const o = {};
  INTEL_FIELDS.forEach(([k, , max]) => { const v = String((p || {})[k] == null ? '' : p[k]).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); if (v) o[k] = v; });
  if (o.website && !/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(o.website)) delete o.website;
  return o;
}
function intelDefaultProfile() {
  return intelCleanProfile({ name:S.name, sector:typeof modelLabel === 'function' ? modelLabel(S.model) : '', rivals:typeof gs === 'function' ? gs('primary_competitor') : '' });
}
/* the exact text sent for one section: shown to the visitor before anything leaves */
function intelPrompt(sec, profile) {
  const p = intelCleanProfile(profile), st = typeof STAGES !== 'undefined' ? (STAGES.find(s => s.id === S.stage) || {}).n : '';
  const lines = INTEL_FIELDS.filter(([k]) => p[k]).map(([k, l]) => `${l}: ${p[k]}`);
  return `Company under review (public facts only):\n${lines.join('\n')}${st ? `\nStage of the round: ${st}` : ''}\n\nResearch task: ${sec.ask}\n\n`
    + 'Use web search. Answer only from pages you found in this search, and cite them. If you cannot find something, say "not found" rather than guess. '
    + 'Return one JSON object and nothing else, in this shape:\n'
    + '{"headline":"one sentence an investor needs to know","rows":[{"cells":["…"],"src":[1]}],"facts":[{"text":"…","src":[1,2]}],'
    + '"numbers":[{"what":"short label","value":123,"unit":"usd|x|pct|count","src":[1]}],"ask":"one question for the founders","confidence":"high|medium|low",'
    + `"sources":[{"n":1,"url":"https://…","title":"…","date":"YYYY-MM or empty"}]}\nThe rows follow these columns: ${sec.cols.join(' | ')}. `
    + 'Every row, fact and number must cite at least one source number. Write in English.';
}
const INTEL_SYSTEM = 'You are a careful venture-capital research analyst. You verify public facts about private companies on the web and cite every claim. You never invent figures, names, dates or sources.';

/* ── one call with web search, for each provider; returns the text and the sources the provider itself returned ── */
async function intelCall(provider, key, prompt, maxUses) {
  const p = PROVIDERS[provider], model = modelName(provider), no = keyRefusal(provider, key);
  if (no) throw new Error(no);
  if (!intelSupported(provider)) throw new Error(`${p ? p.name : provider} has no web search here. Choose Anthropic, OpenAI, Gemini or OpenRouter in AI assist.`);
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 150000);
  const post = (url, headers, body) => fetch(url, { method:'POST', headers:Object.assign({ 'content-type':'application/json' }, headers), body:JSON.stringify(body),
    credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer', redirect:'error', signal:ctl.signal });
  const fail = async res => { throw new Error(`${p.name} returned ${res.status}. ${keyFree(await res.text(), key)}`); };
  try {
    if (provider === 'anthropic') {
      const res = await post(p.url, { 'x-api-key':key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
        { model, max_tokens:4000, system:INTEL_SYSTEM, messages:[{ role:'user', content:prompt }], tools:[{ type:'web_search_20250305', name:'web_search', max_uses:maxUses }] });
      if (!res.ok) await fail(res);
      return intelFromAnthropic(await res.json());
    }
    if (provider === 'openai') {
      const body = t => ({ model, instructions:INTEL_SYSTEM, input:prompt, tools:[{ type:t }], include:['web_search_call.action.sources'] });
      let res = await post('https://api.openai.com/v1/responses', { authorization:'Bearer ' + key }, body('web_search'));
      if (res.status === 400) res = await post('https://api.openai.com/v1/responses', { authorization:'Bearer ' + key }, Object.assign(body('web_search_preview'), { include:undefined }));
      if (!res.ok) await fail(res);
      return intelFromOpenAI(await res.json());
    }
    if (provider === 'gemini') {
      const res = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key':key },
        { systemInstruction:{ parts:[{ text:INTEL_SYSTEM }] }, contents:[{ role:'user', parts:[{ text:prompt }] }], tools:[{ google_search:{} }] });
      if (!res.ok) await fail(res);
      return intelFromGemini(await res.json());
    }
    const res = await post(p.url, { authorization:'Bearer ' + key }, { model, max_tokens:4000, plugins:[{ id:'web', max_results:Math.min(10, maxUses * 2) }],
      messages:[{ role:'system', content:INTEL_SYSTEM }, { role:'user', content:prompt }] });
    if (!res.ok) await fail(res);
    return intelFromOpenRouter(await res.json());
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error(`${p.name} did not answer within 150 seconds.`);
    throw new Error(keyFree(e && e.message, key));
  } finally { clearTimeout(timer); }
}
const intelSrc = (url, title, date) => ({ url:String(url || ''), title:String(title || '').slice(0, 200), date:String(date || '').slice(0, 20) });
function intelFromAnthropic(j) {
  const text = [], src = [];
  (j.content || []).forEach(b => {
    if (b.type === 'text') { text.push(b.text || ''); (b.citations || []).forEach(c => src.push(intelSrc(c.url, c.title))); }
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) b.content.forEach(r => src.push(intelSrc(r.url, r.title, r.page_age)));
  });
  const err = (j.content || []).find(b => b.type === 'web_search_tool_result' && b.content && b.content.error_code);
  return { text:text.join('\n'), sources:src, searches:+((j.usage || {}).server_tool_use || {}).web_search_requests || 0, error:err ? err.content.error_code : '' };
}
function intelFromOpenAI(j) {
  const text = [], src = []; let n = 0;
  (j.output || []).forEach(o => {
    if (o.type === 'web_search_call') { n++; ((o.action || {}).sources || []).forEach(s => src.push(intelSrc(s.url, s.title))); }
    if (o.type === 'message') (o.content || []).forEach(c => { if (c.type === 'output_text') { text.push(c.text || ''); (c.annotations || []).forEach(a => { if (a.type === 'url_citation') src.push(intelSrc(a.url, a.title)); }); } });
  });
  return { text:text.join('\n'), sources:src, searches:n };
}
function intelFromGemini(j) {
  const c = (j.candidates || [])[0] || {}, g = c.groundingMetadata || {};
  return { text:((c.content || {}).parts || []).map(x => x.text || '').join('\n'), sources:(g.groundingChunks || []).map(x => intelSrc((x.web || {}).uri, (x.web || {}).title)), searches:(g.webSearchQueries || []).length };
}
function intelFromOpenRouter(j) {
  const m = ((j.choices || [])[0] || {}).message || {};
  return { text:m.content || '', sources:(m.annotations || []).filter(a => a.type === 'url_citation').map(a => intelSrc((a.url_citation || a).url, (a.url_citation || a).title)), searches:(m.annotations || []).length ? 1 : 0 };
}

/* ── keep only what the web really said: a source the model lists counts only if the provider returned that page ── */
const intelUrlKey = u => { try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) return ''; return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase(); } catch (e) { return ''; } };
const intelHost = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
/* Gemini returns its sources through a Google redirect address, so only their titles (usually the site name) can be matched */
const intelGrounded = u => /vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/.test(u);
function intelVerify(answer, call) {
  const j = parseJSON(answer.text || '') || {}, seen = new Map(), seenHost = new Set();
  (call.sources || []).forEach(s => { const k = intelUrlKey(s.url); if (k) seen.set(k, s); const h = intelHost(s.url); if (h && !intelGrounded(s.url)) seenHost.add(h); if (intelGrounded(s.url) && s.title) seenHost.add(String(s.title).toLowerCase().replace(/^www\./, '')); });
  const listed = (Array.isArray(j.sources) ? j.sources : []).slice(0, 40).map(s => ({ n:+s.n, url:String(s.url || ''), title:String(s.title || '').slice(0, 200), date:String(s.date || '').slice(0, 20) }))
    .filter(s => s.n > 0 && intelUrlKey(s.url));
  const ok = new Map();
  listed.forEach(s => { const k = intelUrlKey(s.url); if (seen.has(k) || seenHost.has(intelHost(s.url))) ok.set(s.n, Object.assign({}, s, { exact:seen.has(k) })); });
  const keep = arr => (Array.isArray(arr) ? arr : []).slice(0, 30).map(x => Object.assign({}, x, { src:(Array.isArray(x.src) ? x.src : []).map(Number).filter(n => ok.has(n)) }));
  const rows = keep(j.rows).filter(r => Array.isArray(r.cells)), facts = keep(j.facts).filter(f => f.text), nums = keep(j.numbers).filter(x => isFinite(+x.value));
  const verified = a => a.filter(x => x.src.length), dropped = a => a.length - verified(a).length;
  return {
    headline:String(j.headline || '').slice(0, 400), ask:String(j.ask || '').slice(0, 300), confidence:/^(high|medium|low)$/.test(j.confidence) ? j.confidence : 'low',
    rows:verified(rows).map(r => ({ cells:r.cells.slice(0, 8).map(c => String(c == null ? '' : c).slice(0, 300)), src:r.src })),
    facts:verified(facts).map(f => ({ text:String(f.text).slice(0, 500), src:f.src })),
    numbers:verified(nums).map(x => ({ what:String(x.what || '').slice(0, 80), value:+x.value, unit:/^(usd|x|pct|count)$/.test(x.unit) ? x.unit : '', src:x.src })),
    sources:[...ok.values()].sort((a, b) => a.n - b.n), unverified:dropped(rows) + dropped(facts) + dropped(nums), searches:call.searches || 0,
    parsed:!!(j && (j.rows || j.facts || j.headline)),
  };
}

/* ── what it means for this deal: the web's figures set against the report's own (never scored) ── */
function intelSoWhat(id, r, R) {
  const nums = u => (r.numbers || []).filter(x => x.unit === u).map(x => x.value).filter(v => v > 0);
  const X = R && R.deal, D = (R && R.D) || {}, med = a => a.length ? median(a) : null;
  if (id === 'comps') {
    const m = med(nums('x').filter(v => v < 200)); if (m == null || !X || X.entryMult == null) return null;
    const d = X.entryMult / m - 1;
    const L = R.LED, f = gv('arr_now'), lx = L && L.arrNow > 0 && f && Math.abs(f - L.arrNow) / L.arrNow > 0.02 && X.P ? X.P / L.arrNow : null;
    return { tone:d > 0.3 ? 'bad' : d < -0.2 ? 'good' : '', text:`Comparable rounds price at a median ${fmtX(m)} revenue (${nums('x').length} with a public multiple); this round asks ${fmtX(X.entryMult)} ARR, ${fmtPct(Math.abs(d) * 100, 0)} ${d >= 0 ? 'above' : 'below'}${lx ? ` (${fmtX(lx)} on the ARR the ledger supports)` : ''}.` };
  }
  if (id === 'market') {
    const m = med(nums('usd')), st = gv('stated_tam'), bu = D.tam_bottomup != null ? D.tam_bottomup : null; if (m == null) return null;
    const parts = [`Published estimates put the market at a median ${money(m)}`];
    if (st) parts.push(`the deck states ${money(st)}${st > m * 2 ? ', more than twice the published figures' : ''}`);
    if (bu) parts.push(`VCR2's bottom-up count gives ${money(bu)}`);
    return { tone:st && st > m * 2 ? 'bad' : '', text:parts.join('; ') + '.' };
  }
  if (id === 'exits') {
    const m = med(nums('x').filter(v => v < 100)), a = gv('exit_multiple_assumption') || (typeof defaultExitMultiple === 'function' ? defaultExitMultiple() : DEAL_DEFAULTS.exit_multiple); if (m == null) return null;
    return { tone:a > m * 1.5 ? 'bad' : '', text:`Listed peers and recent deals sit at a median ${fmtX(m)} revenue; the returns in this report assume ${fmtX(a)} at exit.` };
  }
  if (id === 'competitors') {
    const f = nums('usd'), tot = f.reduce((s, v) => s + v, 0), raised = gv('total_raised');
    return r.rows.length ? { tone:raised && f.some(v => v > raised * 3) ? 'bad' : '', text:`${r.rows.length} competitor${r.rows.length === 1 ? '' : 's'} found${f.length ? `, ${money(tot)} raised between them` : ''}${raised && f.length ? `; the largest has raised ${fmtX(Math.max(...f) / raised, 1)} what this company has` : ''}.` } : null;
  }
  if (id === 'risks') { const k = (r.rows || []).length + (r.facts || []).length; return { tone:k ? 'bad' : 'good', text:k ? `${k} item${k === 1 ? '' : 's'} found on the public web: read ${k === 1 ? 'it' : 'them'} before terms.` : 'No issue found on the public web (absence of evidence, not proof).' }; }
  return null;
}

/* ── where results are kept: this browser only, per company, the last 10 (never synced, never exported without a click) ── */
function intelLoadAll() { try { const o = JSON.parse(localStorage.getItem(INTEL_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
const intelId = name => String(name || 'untitled').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80) || 'untitled';
function intelGet(name) { const a = intelLoadAll()[intelId(name)]; return a && typeof a === 'object' ? a : null; }
function intelPut(name, rec) {
  const all = intelLoadAll(); all[intelId(name)] = Object.assign({}, rec, { saved:Date.now() });
  const keys = Object.keys(all).sort((a, b) => (all[b].saved || 0) - (all[a].saved || 0));
  keys.slice(10).forEach(k => delete all[k]);
  try { localStorage.setItem(INTEL_KEY, JSON.stringify(all)); } catch (e) { /* storage full: the results stay on screen for this visit */ }
}
function intelForget(name) { const all = intelLoadAll(); delete all[intelId(name)]; try { localStorage.setItem(INTEL_KEY, JSON.stringify(all)); } catch (e) {} }

/* the addresses this page is allowed to contact, read from its own security policy: the proof shown to the visitor */
function intelAllowedHosts() {
  const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]'), c = m ? m.getAttribute('content') : '';
  const d = (c.split(';').find(x => /^\s*connect-src\b/.test(x)) || '').trim().split(/\s+/).slice(1);
  return d.map(h => h === "'self'" ? 'this site' : h.replace(/^https:\/\//, ''));
}
