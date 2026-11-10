/* ═══════════════════════════════════════════════════════════════
   STUDIO: SMART FILL (S9). The master switch, the label dictionary
   (synonyms and veto terms, English and French), plausibility ranges,
   tier thresholds with a live what-if, document types, period words,
   number settings, the two switches and a label tester. Everything is
   stored in settings.smartfill, shown next to the built-in value and
   resettable. Never anybody's documents: only words and numbers.
   ═══════════════════════════════════════════════════════════════ */
const sfDraft = () => { const s = ST.draft.settings; return s.smartfill = s.smartfill || {}; };
const sfSaveDraft = () => { _sfDict = null; saveStudioDraft(); };
let _sfStFilter = '', _sfStSample = 'ARR: $4.2M\nNet burn: $310k per month\nTarget: $9M ARR by end of 2027', _sfStLabel = 'Net dollar retention';
function paneStSmartfill() {
  const d = sfDraft(), th = Object.assign({ high:0.82, medium:0.62, low:0.45 }, d.thresholds || {}), dict = sfDict();
  const q = _sfStFilter.trim().toLowerCase(), list = ALL_FIELDS().filter(f => dict.has(f.id) && !dict.get(f.id).skip && (!q || (f.id + ' ' + f.lbl).toLowerCase().includes(q))).slice(0, 60);
  const sw = (k, label, def) => `<label class="api-check"><input type="checkbox" ${(d[k] != null ? d[k] : def) ? 'checked' : ''} data-change="sfStSwitch" data-a="${k}"> ${esc(label)}</label>`;
  const builtin = id => (SF_DICT_SRC.split('\n').find(l => l.startsWith(id + '|')) || '').split('|');
  return `<p class="pg-desc">Smart fill reads the documents a visitor drops (decks, models, term sheets, bank letters and more) in their browser, with rules only: no AI, nothing sent anywhere. Everything below is yours to tune; the visitors' documents are never stored or published, only these words and numbers.</p>
    <div class="st-card"><h3>Switches</h3>
      ${sw('enabled', 'Show Smart fill on the source material page', SF_DEFAULT_ON)}
      ${sw('excludeRestricted', 'Exclude restricted cash from the cash balance (bank documents)', true)}
      ${sw('allowComputed', 'Allow computed values (cap-table percentages, headcount sums, receivables over 90 days)', true)}
    </div>
    <div class="st-card"><h3>Confidence tiers</h3><p class="field-hint">A proposal at or above “High” is ticked for the visitor; “Medium” is shown unticked; “Low” is listed as a suggestion. Built-in: 0.82, 0.62, 0.45.</p>
      <div class="sf-th">${['high', 'medium', 'low'].map(k => `<label>${k[0].toUpperCase() + k.slice(1)} <input class="form-inp" inputmode="decimal" value="${th[k]}" data-change="sfStThreshold" data-a="${k}" aria-label="${k} threshold"></label>`).join('')}
      <button class="btn btn-ghost btn-sm" data-click="sfStReset" data-a="thresholds">Reset</button></div>
      <label class="field-hint" for="sf-st-sample">What-if: paste a sample and see what each line would give</label>
      <textarea class="intake-ta" id="sf-st-sample" data-input="sfStSample">${esc(_sfStSample)}</textarea>
      <div id="sf-st-whatif">${sfStWhatIf()}</div>
    </div>
    <div class="st-card"><h3>Label tester</h3><input class="form-inp" id="sf-st-label" value="${esc(_sfStLabel)}" data-input="sfStLabel" aria-label="A label to test"><div id="sf-st-tester">${sfStTester()}</div></div>
    <div class="st-card"><h3>Labels, veto terms and ranges</h3><p class="field-hint">Add the words your companies use for a field (one per line, English or French). A veto term rules the field out when it appears in a label (“per employee” stops “ARR per employee” from filling ARR). Your words are added to the built-in ones, shown in grey.</p>
      <input class="form-inp" placeholder="Filter fields…" value="${esc(_sfStFilter)}" data-input="sfStFilter" aria-label="Filter fields">
      <div class="tbl-wrap"><table class="ledger"><thead><tr><th>Field</th><th>Your labels</th><th>Your veto terms</th><th>Range</th><th></th></tr></thead><tbody>
      ${list.map(f => { const o = (d.fields || {})[f.id] || {}, b = builtin(f.id), dd = dict.get(f.id);
        return `<tr><td>${esc(f.lbl)}<div class="field-hint">${esc(f.id)}</div><div class="field-hint">Built-in: ${esc([b[1], b[2]].filter(Boolean).join(';').split(';').filter(Boolean).slice(0, 8).join(', '))}${(b[1] || '').split(';').length > 8 ? '…' : ''}</div></td>
          <td><textarea class="intake-ta sf-ta" data-change="sfStList" data-a="${esc(f.id)}" data-b="syn" aria-label="Your labels for ${esc(f.lbl)}">${esc((o.syn || []).join('\n'))}</textarea></td>
          <td><textarea class="intake-ta sf-ta" data-change="sfStList" data-a="${esc(f.id)}" data-b="neg" aria-label="Your veto terms for ${esc(f.lbl)}">${esc((o.neg || []).join('\n'))}</textarea><div class="field-hint">Built-in: ${esc((b[3] || '').split(';').filter(Boolean).slice(0, 6).join(', '))}</div></td>
          <td class="m"><input class="form-inp sf-rng" value="${o.range ? esc(o.range[0]) : ''}" placeholder="${isFinite(dd.lo) ? dd.lo : ''}" data-change="sfStRange" data-a="${esc(f.id)}" data-b="#0" aria-label="Lowest plausible value"> to <input class="form-inp sf-rng" value="${o.range ? esc(o.range[1]) : ''}" placeholder="${isFinite(dd.hi) ? dd.hi : ''}" data-change="sfStRange" data-a="${esc(f.id)}" data-b="#1" aria-label="Highest plausible value"></td>
          <td>${(d.fields || {})[f.id] ? `<button class="btn btn-ghost btn-sm" data-click="sfStResetField" data-a="${esc(f.id)}">Reset</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
      ${list.length === 60 ? '<p class="field-hint">Showing the first 60 fields: filter to find others.</p>' : ''}
    </div>
    <div class="st-card"><h3>Document types</h3><p class="field-hint">The names visitors see in the guide, and extra words that identify each type (one per line). The guide's “best next document” follows the fields each type fills.</p>
      <div class="tbl-wrap"><table class="ledger"><thead><tr><th>Type</th><th>Name shown</th><th>Extra words</th></tr></thead><tbody>
      ${SF_GUIDE.map(g => { const o = (d.docTypes || {})[g.id] || {}; return `<tr><td class="m">${esc(g.id)}</td><td><input class="form-inp" value="${esc(o.name || '')}" placeholder="${esc(g.name)}" data-change="sfStType" data-a="${esc(g.id)}" data-b="name" aria-label="Name for ${esc(g.name)}"></td><td><textarea class="intake-ta sf-ta" data-change="sfStType" data-a="${esc(g.id)}" data-b="words" aria-label="Extra words for ${esc(g.name)}">${esc((o.words || []).join('\n'))}</textarea></td></tr>`; }).join('')}</tbody></table></div>
    </div>
    <div class="st-card"><h3>Words that mark a figure as not an actual</h3><p class="field-hint">Built-in: forecast, plan, budget, target, goal, projected, pro forma, expected, competitor, market, industry, benchmark and their French forms. Add yours, one per line.</p>
      <textarea class="intake-ta" data-change="sfStWords" aria-label="Extra forecast and target words">${esc((d.forecastWords || []).join('\n'))}</textarea>
    </div>
    <div class="st-card"><h3>Numbers</h3><p class="field-hint">VCR2 works in US dollars and never converts by itself: amounts in another currency are only suggested, with the currency shown. Decimal separators are read per document; you can force one.</p>
      <label>Decimal separator <select class="mini-sel" data-change="sfStLocale"><option value="">Decide per document</option><option value="en"${d.locale === 'en' ? ' selected' : ''}>1,234.5 (point)</option><option value="eu"${d.locale === 'eu' ? ' selected' : ''}>1.234,5 or 1 234,5 (comma)</option></select></label>
    </div>
    <div class="sf-actions"><button class="btn btn-ghost btn-sm" data-click="sfStReset" data-a="all">Reset Smart fill to built-in</button></div>`;
}
function sfStWhatIf() {
  try {
    const lines = _sfStSample.split('\n').filter(Boolean).slice(0, 30);
    const doc = { file:'sample', kind:'md', notes:[], blocks:lines.map((l, i) => { const m = /^(.+?):\s+(.+)$/.exec(l); return m ? { type:'kv', text:l, rows:[[m[1], m[2]]], loc:`line ${i + 1}`, hints:{} } : { type:'para', text:l, loc:`line ${i + 1}`, hints:{} }; }) };
    const e = sfExtract({ ok:true, file:'sample', doc }, { model:'saas', as:'model' });
    return e.proposals.length ? `<ul class="sf-whatif">${e.proposals.map(p => `<li>${esc(p.label || p.field)} = ${esc(sfShow(p.value, p.field))} <span class="pill sf-${p.tier.toLowerCase()}">${p.tier}</span> <span class="field-hint">${esc(p.why.join(', '))}</span></li>`).join('')}</ul>` + (e.rejects.length ? `<p class="field-hint">Left out: ${esc(e.rejects.slice(0, 5).map(r => `${r.field}: ${r.why}`).join('; '))}</p>` : '') : '<p class="field-hint">Nothing would be proposed.</p>';
  } catch (err) { return '<p class="field-hint">The sample could not be read.</p>'; }
}
function sfStTester() {
  const fields = sfFields('saas'), scored = fields.map(f => ({ f, s:sfLabelScore(_sfStLabel, f, '') })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
  const vetoed = fields.filter(f => f.syn.some(s => sfHas(sfNorm(_sfStLabel), s)) && sfLabelScore(_sfStLabel, f, '') === 0).slice(0, 3);
  return (scored.length ? `<p>Maps to <b>${esc(scored[0].f.lbl)}</b> (${Math.round(scored[0].s * 100)}%)${scored.length > 1 ? `; next: ${scored.slice(1).map(x => `${esc(x.f.lbl)} (${Math.round(x.s * 100)}%)`).join(', ')}` : ''}.</p>` : '<p>Maps to no field.</p>')
    + (vetoed.length ? `<p class="field-hint">Ruled out by a veto term or a missing word: ${esc(vetoed.map(f => f.lbl).join(', '))}.</p>` : '');
}
const sfLines = v => String(v || '').split(/\n|;/).map(s => s.trim()).filter(Boolean).slice(0, 60).map(s => s.slice(0, 80));
function sfStSwitch(k, on) { sfDraft()[k] = !!on; sfSaveDraft(); }
function sfStThreshold(k, v) { const n = parseNum(v), d = sfDraft(); d.thresholds = d.thresholds || {}; if (n == null || n < 0 || n > 1) delete d.thresholds[k]; else d.thresholds[k] = n; sfSaveDraft(); setHTML($id('sf-st-whatif'), sfStWhatIf()); }
function sfStList(id, kind, v) { const d = sfDraft(), fs = d.fields = d.fields || {}, e = fs[id] = fs[id] || {}; e[kind] = sfLines(v); if (!e[kind].length) delete e[kind]; if (!Object.keys(e).length) delete fs[id]; sfSaveDraft(); }
function sfStRange(id, k, v) { const d = sfDraft(), fs = d.fields = d.fields || {}, e = fs[id] = fs[id] || {}, dd = sfDict().get(id), r = e.range ? e.range.slice() : [dd.lo, dd.hi], n = parseNum(v); r[k] = n == null ? [dd.lo, dd.hi][k] : n; if (isFinite(r[0]) && isFinite(r[1]) && r[0] < r[1]) e.range = r; else delete e.range; if (!Object.keys(e).length) delete fs[id]; sfSaveDraft(); }
function sfStResetField(id) { const d = sfDraft(); if (d.fields) delete d.fields[id]; sfSaveDraft(); renderStudioPane(); }
function sfStType(id, k, v) { const d = sfDraft(), t = d.docTypes = d.docTypes || {}, e = t[id] = t[id] || {}; if (k === 'name') { if (String(v).trim()) e.name = String(v).trim().slice(0, 60); else delete e.name; } else { e.words = sfLines(v); if (!e.words.length) delete e.words; } if (!Object.keys(e).length) delete t[id]; sfSaveDraft(); }
function sfStWords(v) { const d = sfDraft(); d.forecastWords = sfLines(v); if (!d.forecastWords.length) delete d.forecastWords; sfSaveDraft(); }
function sfStLocale(v) { const d = sfDraft(); if (v) d.locale = v; else delete d.locale; sfSaveDraft(); }
function sfStReset(what) { const d = sfDraft(); if (what === 'all') delete ST.draft.settings.smartfill; else delete d[what]; sfSaveDraft(); renderStudioPane(); }
