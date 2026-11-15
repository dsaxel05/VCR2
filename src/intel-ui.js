/* ═══════════════════════════════════════════════════════════════
   MARKET INTEL (LIVE): the report tab, the invitation on the
   overview, and the proof that the key cannot go anywhere else.
   ═══════════════════════════════════════════════════════════════ */
let _intel = { for:'', profile:null, picks:null, consent:false, running:false, cancel:false, status:{}, err:{} };
function intelState() {
  if (_intel.for !== intelId(S.name)) {
    const rec = intelGet(S.name);
    _intel = { for:intelId(S.name), profile:(rec && rec.profile) || intelDefaultProfile(), picks:new Set(INTEL_SECTIONS.map(s => s.id)), consent:false, running:false, cancel:false, status:{}, err:{} };
  }
  return _intel;
}
const intelProviderNow = () => { const p = ($id('api-provider') || {}).value || 'local', k = (($id('api-key') || {}).value || '').trim(); return { p, k, name:(PROVIDERS[p] || {}).name || p }; };

/* the invitation on the overview: what a key unlocks, or what the last run found */
function intelInviteHTML() {
  const rec = intelGet(S.name), done = rec && rec.results ? Object.keys(rec.results).length : 0;
  if (done) return `<div class="intel-invite done"><div><b>Market intel</b> · ${done} section${done === 1 ? '' : 's'} from the live web, ${esc(new Date(rec.at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }))}, with sources.</div>
    <button type="button" class="btn btn-ghost btn-sm" data-click="goTab" data-a="intel">Open Market intel</button></div>`;
  return `<div class="intel-invite"><div class="intel-invite-t">Go further: live market data, with sources</div>
    <p>Add your own AI key and VCR2 researches the public web for this company: competitors and what they raised, comparable rounds and their multiples, the published market size, listed peers and exits, the founders' track record, customer and hiring signals, red flags and why now. Every line links to its source, and each section says what it means for this price.</p>
    <button type="button" class="btn btn-primary btn-sm" data-click="goTab" data-a="intel">See what it finds</button>
    <span class="field-hint">Optional. Your key stays in your browser; only the public company profile is sent. Never scored.</span></div>`;
}

/* ── the tab ── */
function paneIntel(R) {
  const st = intelState(), rec = intelGet(S.name), res = (rec && rec.results) || {}, { p, k, name } = intelProviderNow();
  const ready = intelSupported(p) && k.length >= 8, cost = intelSupported(p) ? intelCost(p, [...st.picks]) : null, ids = INTEL_SECTIONS.map(s => s.id).filter(id => res[id]);
  const step = (n, title, body, ok) => `<div class="intel-step${ok ? ' ok' : ''}"><div class="intel-step-n" aria-hidden="true">${ok ? '✓' : n}</div><div class="intel-step-b"><h3>${esc(title)}</h3>${body}</div></div>`;
  const keyBody = intelSupported(p)
    ? `<p>${k.length >= 8 ? `Using your <b>${esc(name)}</b> key (model ${esc(modelName(p))}).` : `Paste your ${esc(name)} key in <b>AI assist</b>.`} Pricing on your own account: ${esc(INTEL_PRICE[p].label)}.</p>`
    : `<p>${p === 'local' ? 'Choose a provider and paste your own key in <b>AI assist</b>.' : `${esc(name)} cannot search the web here.`} Web search works with <b>Anthropic</b>, <b>OpenAI</b>, <b>Gemini</b> or <b>OpenRouter</b>.</p>`;
  const prof = st.profile, profBody = `<p class="field-hint">This profile is the only thing sent. Check that it describes the company: the search depends on it.</p>
    <div class="intel-form">${INTEL_FIELDS.map(([f, l]) => `<label class="intel-f${f === 'what' ? ' wide' : ''}"><span>${esc(l)}</span>${f === 'what'
      ? `<textarea rows="2" data-input="intelSet" data-a="${f}" maxlength="400">${esc(prof[f] || '')}</textarea>`
      : `<input type="text" data-input="intelSet" data-a="${f}" value="${esc(prof[f] || '')}" maxlength="200">`}</label>`).join('')}</div>
    ${!prof.what ? '<p class="field-hint">Not sure what it does? Leave the description empty and keep the first section ticked: it finds out from the website and the press, and shows you before anything else.</p>' : ''}`;
  const picks = `<div class="intel-picks">${INTEL_SECTIONS.map(s => `<label class="intel-pick"><input type="checkbox" data-change="intelPick" data-a="${s.id}"${st.picks.has(s.id) ? ' checked' : ''}${st.running ? ' disabled' : ''}>
      <span><b>${esc(s.t)}</b><span class="field-hint">${esc(s.q)} (${s.n} searches)</span></span></label>`).join('')}</div>
    <div class="intel-cost">${cost ? `<b>${cost.searches} web searches</b> on your ${esc(name)} account: about <b>${intelUsd(cost.lo)} to ${intelUsd(cost.hi)}</b> in all, billed by ${esc(name)}, never by VCR2.` : 'The cost appears once a provider with web search is chosen.'}</div>`;
  const preview = INTEL_SECTIONS.find(s => st.picks.has(s.id));
  const send = `<details class="intel-send"><summary>Exactly what will be sent to ${esc(name)}</summary><pre>${esc(preview ? intelPrompt(preview, prof) : '')}</pre>
      <p class="field-hint">One message like this per ticked section (only the research task changes). Never sent: the documents, the ledger, the financials, the evidence form, the score.</p></details>
    <label class="intel-consent"><input type="checkbox" data-change="intelConsent"${st.consent ? ' checked' : ''}${st.running ? ' disabled' : ''}> I agree to send this public profile to ${esc(name)}, which searches the web and charges my own account.</label>
    <div class="intel-go">${st.running ? `<button type="button" class="btn btn-ghost btn-sm" data-click="intelStop">Stop after this section</button>`
      : `<button type="button" class="btn btn-primary" data-click="intelRun"${ready && st.consent && st.picks.size ? '' : ' disabled'}>Run the market research</button>`}
      ${ids.length ? `<button type="button" class="btn btn-ghost btn-sm" data-click="intelCopy">Copy as Markdown</button><button type="button" class="btn btn-ghost btn-sm" data-click="intelClear">Delete these results</button>` : ''}</div>
    ${Object.keys(st.status).length ? `<ul class="intel-progress" aria-live="polite">${INTEL_SECTIONS.filter(s => st.status[s.id]).map(s => `<li class="${st.status[s.id]}">${esc(s.t)}: ${{ queued:'waiting', run:'searching the web…', done:'done', fail:'failed: ' + esc(st.err[s.id] || '') }[st.status[s.id]]}</li>`).join('')}</ul>` : ''}`;
  return `<div class="intel">
    <div class="intel-head"><h2>Market intel <span class="pill">live</span></h2>
      <p>What a partner checks outside the data room, researched on the public web with your own key. Each claim links to the page it comes from; a claim whose page the search did not really return is left out. Nothing here changes the score.</p></div>
    ${ids.length ? intelResultsHTML(res, rec, R) : ''}
    <details class="intel-setup"${ids.length ? '' : ' open'}><summary>${ids.length ? 'Run it again or add sections' : 'Set it up: three steps'}</summary>
      ${step(1, 'Your AI key', keyBody + intelSafetyHTML(), ready)}
      ${step(2, 'The company profile', profBody, !!(prof.name && (prof.what || prof.website)))}
      ${step(3, 'What to research', picks + send, false)}
    </details></div>`;
}
const intelUsd = v => v < 0.01 ? '$0.00' : '$' + v.toFixed(2);

/* the proof that the key is safe: each statement can be checked on this page */
function intelSafetyHTML() {
  const hosts = intelAllowedHosts(), kept = (() => { try { return localStorage.getItem('vcr3-key') ? 'on this computer for 7 days (you ticked Remember)' : sessionStorage.getItem('vcr3-key') ? 'in this tab only, forgotten when you close it' : 'nowhere yet'; } catch (e) { return 'in this tab only'; } })();
  return `<details class="intel-safe"><summary>Is my key safe? Six things you can check</summary><ol>
    <li><b>It never leaves your browser except to your provider.</b> VCR2 has no server: it is one page that runs on your computer.</li>
    <li><b>Your browser enforces it.</b> This page's security policy lists the only addresses it may contact, and the browser blocks every other one, even if the code had a bug: <span class="intel-hosts">${hosts.map(h => `<code>${esc(h)}</code>`).join(' ')}</span>.</li>
    <li><b>Where it is kept now:</b> ${esc(kept)}. Never in a draft, an export, the library or a signed-in account. <button type="button" class="btn btn-ghost btn-sm" id="intel-forget" data-click="intelForgetKey">Forget the key now</button></li>
    <li><b>How it travels:</b> only in your provider's own header, over HTTPS, with no cookies, no referrer and no redirect, and it is wiped from any error message before one is shown.</li>
    <li><b>Anyone can read the code</b> that sends it: <a href="https://github.com/dsaxel05/VCR2/blob/main/src/core.js" target="_blank" rel="noopener noreferrer">src/core.js on GitHub</a> (callModel) and <a href="https://github.com/dsaxel05/VCR2/blob/main/src/intel.js" target="_blank" rel="noopener noreferrer">src/intel.js</a>.</li>
    <li><b>Limit the damage of any leak:</b> create a key for VCR2 alone, with a monthly spending limit, in your provider's console, and delete it when you are done.</li></ol></details>`;
}

/* ── results: the glance first, then one card per section ── */
function intelResultsHTML(res, rec, R) {
  const secs = INTEL_SECTIONS.filter(s => res[s.id]), nsrc = secs.reduce((a, s) => a + res[s.id].sources.length, 0), nsearch = secs.reduce((a, s) => a + (res[s.id].searches || 0), 0);
  const glance = secs.map(s => { const r = res[s.id], w = intelSoWhat(s.id, r, R);
    return `<li class="${w ? w.tone : ''}"><a href="#intel-${s.id}" data-click="intelJump" data-a="${s.id}">${esc(s.t)}</a>: ${esc((w && w.text) || r.headline || 'no clear answer found')}</li>`; }).join('');
  return `<div class="intel-meta">${esc(new Date(rec.at).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }))} · ${esc((PROVIDERS[rec.provider] || {}).name || rec.provider)} ${esc(rec.model || '')} · ${nsearch} searches · ${nsrc} sources kept</div>
    <div class="intel-glance"><div class="bline-t">At a glance</div><ul>${glance}</ul></div>
    <nav class="intel-chips" aria-label="Market intel sections">${secs.map(s => `<a href="#intel-${s.id}" data-click="intelJump" data-a="${s.id}" class="intel-chip">${esc(s.t)}</a>`).join('')}</nav>
    ${secs.map(s => intelCardHTML(s, res[s.id], R)).join('')}`;
}
function intelCardHTML(s, r, R) {
  const sup = src => src.map(n => `<a class="intel-sup" href="#intel-${s.id}-s${n}" data-click="intelJump" data-a="${s.id}-s${n}">${n}</a>`).join('');
  const w = intelSoWhat(s.id, r, R), link = x => intelUrlKey(x.url) ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title || intelHost(x.url))}</a>` : esc(x.title);
  return `<section class="intel-card" id="intel-${s.id}"><div class="intel-card-h"><h3>${esc(s.t)}</h3><span class="intel-conf ${r.confidence}">${esc(r.confidence)} confidence</span>
      <button type="button" class="btn btn-ghost btn-sm" data-click="intelRerun" data-a="${s.id}">Search again</button></div>
    ${r.headline ? `<p class="intel-headline">${esc(r.headline)}</p>` : ''}
    ${w ? `<div class="intel-sowhat ${w.tone}"><b>For this deal:</b> ${esc(w.text)}</div>` : ''}
    ${r.rows.length ? `<div class="tbl-wrap"><table class="ledger intel-tbl"><thead><tr>${s.cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>Src</th></tr></thead><tbody>
      ${r.rows.map(x => `<tr>${s.cols.map((c, i) => `<td>${esc(x.cells[i] || '')}</td>`).join('')}<td>${sup(x.src)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${r.facts.length ? `<ul class="intel-facts">${r.facts.map(f => `<li>${esc(f.text)} ${sup(f.src)}</li>`).join('')}</ul>` : ''}
    ${!r.rows.length && !r.facts.length ? '<p class="field-hint">Nothing the search could back with a source.</p>' : ''}
    ${r.ask ? `<div class="ask">${esc(r.ask)}</div>` : ''}
    <details class="intel-src"><summary>${r.sources.length} source${r.sources.length === 1 ? '' : 's'}${r.unverified ? ` · ${r.unverified} claim${r.unverified === 1 ? '' : 's'} left out (no source the search returned)` : ''}</summary>
      <ol>${r.sources.map(x => `<li id="intel-${s.id}-s${x.n}" value="${x.n}">${link(x)} <span class="field-hint">${esc(intelHost(x.url))}${x.date ? ' · ' + esc(x.date) : ''}${x.exact ? '' : ' · site matched'}</span></li>`).join('')}</ol></details>
  </section>`;
}

/* ── actions ── */
function intelRedraw() { const el = $id('rp-intel'); if (el && S.result) setHTML(el, paneIntel(S.result)); }
function intelSet(f, v) { const st = intelState(); st.profile = Object.assign({}, st.profile, { [f]:String(v || '').slice(0, 400) }); }
function intelPick(id, on) { const st = intelState(); if (on) st.picks.add(id); else st.picks.delete(id); intelRedraw(); }
function intelConsent(on) { intelState().consent = !!on; intelRedraw(); }
function intelStop() { intelState().cancel = true; toast('Stopping after the section being searched.'); }
function intelJump(id) { const el = $id('intel-' + id); if (el) { const d = el.closest('details'); if (d) d.open = true; el.scrollIntoView({ block:'start', behavior:'smooth' }); } }
function intelForgetKey() { try { sessionStorage.removeItem('vcr3-key'); localStorage.removeItem('vcr3-key'); localStorage.removeItem('vcr3-remember'); } catch (e) {} const k = $id('api-key'); if (k) k.value = ''; toast('Your key was forgotten on this computer.'); intelRedraw(); }
function intelClear() { intelForget(S.name); _intel.for = ''; toast('The market intel for this company was deleted from this browser.'); intelRedraw(); }
async function intelRun(only) {
  const st = intelState(), ai = aiReady(), prof = intelCleanProfile(st.profile);
  if (!ai.ok) { toast(ai.why, 'err'); return; }
  if (!intelSupported(ai.provider)) { toast(`${PROVIDERS[ai.provider].name} cannot search the web here. Choose Anthropic, OpenAI, Gemini or OpenRouter.`, 'err'); return; }
  if (!prof.name) { toast('Enter the company name first.', 'err'); return; }
  if (!st.consent && !only) { toast('Tick the box that agrees to send the profile first.', 'err'); return; }
  const ids = only ? [only] : INTEL_SECTIONS.filter(s => st.picks.has(s.id)).map(s => s.id), name = S.name;
  st.running = true; st.cancel = false; st.status = {}; st.err = {}; ids.forEach(id => { st.status[id] = 'queued'; }); intelRedraw();
  const rec = Object.assign({ results:{} }, intelGet(name) || {}, { profile:prof, provider:ai.provider, model:modelName(ai.provider), at:Date.now() });
  for (const id of ids) {
    if (st.cancel) break;
    const sec = INTEL_SECTIONS.find(s => s.id === id); st.status[id] = 'run'; intelRedraw();
    try {
      const call = await intelCall(ai.provider, ai.key, intelPrompt(sec, prof), sec.n);
      if (call.error) throw new Error(`the web search returned "${call.error}"`);
      const v = intelVerify(call, call);
      if (!v.parsed) throw new Error('the answer was not in the expected form; try again or another model');
      rec.results[id] = v; st.status[id] = 'done';
      /* the first section answers "what does it do": when the profile left it empty, the next searches use what the web says */
      if (id === 'snapshot' && !prof.what && v.headline) { prof.what = v.headline.slice(0, 400); st.profile = Object.assign({}, st.profile, { what:prof.what }); rec.profile = prof; }
      intelPut(name, rec);
    } catch (e) { st.status[id] = 'fail'; st.err[id] = String((e && e.message) || e).slice(0, 200); }
    intelRedraw();
  }
  st.running = false; intelRedraw();
  const ok = ids.filter(id => st.status[id] === 'done').length;
  toast(ok ? `Market intel: ${ok} of ${ids.length} section${ids.length === 1 ? '' : 's'} done.` : 'Market intel: no section finished. See the reasons under the button.', ok ? 'ok' : 'err');
}
function intelRerun(id) { intelState().consent = true; intelRun(id); }
function intelCopy() {
  const rec = intelGet(S.name); if (!rec) return;
  const md = [`# Market intel: ${S.name}`, `_${new Date(rec.at).toISOString().slice(0, 10)} · ${(PROVIDERS[rec.provider] || {}).name || rec.provider} web search · not scored_`, ''];
  INTEL_SECTIONS.filter(s => rec.results[s.id]).forEach(s => {
    const r = rec.results[s.id], w = intelSoWhat(s.id, r, S.result);
    md.push(`## ${s.t}`, r.headline ? `**${r.headline}**` : '', w ? `_For this deal:_ ${w.text}` : '');
    if (r.rows.length) md.push('', `| ${s.cols.join(' | ')} | Src |`, `|${s.cols.map(() => '---').join('|')}|---|`, ...r.rows.map(x => `| ${s.cols.map((c, i) => String(x.cells[i] || '').replace(/\|/g, '/')).join(' | ')} | ${x.src.join(', ')} |`));
    r.facts.forEach(f => md.push(`- ${f.text} [${f.src.join(', ')}]`));
    if (r.ask) md.push('', `Ask: ${r.ask}`);
    md.push('', ...r.sources.map(x => `${x.n}. ${x.title || intelHost(x.url)}: ${x.url}`), '');
  });
  const no = () => toast('Copying is blocked in this browser.', 'err');
  try { navigator.clipboard.writeText(md.filter(l => l !== null).join('\n')).then(() => toast('Market intel copied as Markdown.'), no); } catch (e) { no(); }
}
