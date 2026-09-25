
/* ═══════════════════════════════════════════════════════════════
   CHARTS — dependency-free SVG. Thin marks, recessive grid, one axis,
   a hover card on every mark. Colours are validated for colour-vision
   deficiency against the app's dark surface (see style-v4.css tokens).
   ═══════════════════════════════════════════════════════════════ */
function niceTicks(lo, hi, n = 4) {
  if (!(hi > lo)) { hi = lo + 1; }
  const span = hi - lo, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n + 0.5) || 10 * mag;
  const t0 = Math.floor(lo / step + 1e-9) * step, out = [];
  let t = t0;
  out.push(Math.round(t / step) * step);
  while (out[out.length - 1] < hi - step * 1e-6 && out.length < 40) { t += step; out.push(Math.round(t / step) * step); }
  return out;
}
const trim1 = x => { const s = x.toFixed(1); return s.endsWith('.0') ? s.slice(0, -2) : s; };
const axisMoney = v => { const a = Math.abs(v); return (v < 0 ? '−' : '') + (a >= 1e9 ? '$' + trim1(a / 1e9) + 'B' : a >= 1e6 ? '$' + trim1(a / 1e6) + 'M' : a >= 1e3 ? '$' + Math.round(a / 1e3) + 'k' : '$' + Math.round(a)); };

function svgFrame(W, H, inner, label) {
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}
function yAxis(ticks, y, x0, x1, fmt) {
  return ticks.map(t => `<line class="grid${t === 0 ? ' base' : ''}" x1="${x0}" x2="${x1}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${x0 - 6}" y="${y(t) + 3.5}" text-anchor="end">${esc(fmt(t))}</text>`).join('');
}
function xLabels(labels, x, yPos, every) {
  const last = labels.length - 1, show = new Set();
  for (let i = 0; i <= last; i += every) show.add(i);
  if (!show.has(last)) { const prev = last - (last % every); if (last - prev < Math.ceil(every * 0.75)) show.delete(prev); show.add(last); }
  return labels.map((l, i) => show.has(i) ? `<text class="ax" x="${x(i)}" y="${yPos}" text-anchor="middle">${esc(l)}</text>` : '').join('');
}
function legend(items) {
  return `<div class="legend">${items.map(i => `<span><i style="background:${i.c}${i.line ? ';height:2px;border-radius:1px' : ''}"></i>${esc(i.l)}</span>`).join('')}</div>`;
}

/* MRR bridge: positive movements stacked above zero, losses below, net as a dot. */
function chartBridge(bridge) {
  const rows = bridge.slice(-24);
  const W = 760, H = 260, L = 58, R = 12, T = 12, B = 26;
  const pos = r => [r.nw, r.exp, r.react], neg = r => [r.con, r.churn];
  const maxP = Math.max(1, ...rows.map(r => sum(pos(r)))), maxN = Math.max(0, ...rows.map(r => sum(neg(r))));
  const ticks = niceTicks(-maxN, maxP, 5);
  const lo = Math.min(ticks[0], -maxN), hi = Math.max(ticks[ticks.length - 1], maxP);
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const band = (W - L - R) / rows.length, bw = Math.min(22, band * 0.62);
  const x = i => L + band * i + band / 2;
  const C = ['var(--c-new)', 'var(--c-exp)', 'var(--c-react)'], CN = ['var(--c-con)', 'var(--c-churn)'];
  let marks = '';
  rows.forEach((r, i) => {
    let acc = 0;
    pos(r).forEach((v, k) => { if (v <= 0) return; const y0 = y(acc), y1 = y(acc + v); marks += `<rect x="${x(i) - bw / 2}" y="${y1 + 1}" width="${bw}" height="${Math.max(0.5, y0 - y1 - 2)}" fill="${C[k]}"/>`; acc += v; });
    acc = 0;
    neg(r).forEach((v, k) => { if (v <= 0) return; const y0 = y(-acc), y1 = y(-acc - v); marks += `<rect x="${x(i) - bw / 2}" y="${y0 + 1}" width="${bw}" height="${Math.max(0.5, y1 - y0 - 2)}" fill="${CN[k]}"/>`; acc += v; });
    marks += `<circle cx="${x(i)}" cy="${y(r.net)}" r="3.5" class="netdot"/>`;
    const tip = `<b>${esc(monthLabel(r.month))}</b><br>New ${money(r.nw)} (${r.nNew})<br>Expansion ${money(r.exp)}<br>Reactivation ${money(r.react)}<br>Contraction −${money(r.con)}<br>Churn −${money(r.churn)} (${r.nChurn})<br><b>Net ${money(r.net)}</b>`;
    marks += `<rect class="hit" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}" data-tip="${tipAttr(tip)}"/>`;
  });
  const inner = yAxis(ticks, y, L, W - R, axisMoney) + marks + xLabels(rows.map(r => monthLabel(r.month)), x, H - 8, rows.length > 14 ? 3 : 2);
  return svgFrame(W, H, inner, 'Monthly MRR bridge') + legend([
    { c:'var(--c-new)', l:'New logos' }, { c:'var(--c-exp)', l:'Expansion' }, { c:'var(--c-react)', l:'Reactivation' },
    { c:'var(--c-con)', l:'Contraction' }, { c:'var(--c-churn)', l:'Churn' }, { c:'var(--t0)', l:'Net', line:true }]);
}

/* Single series line with an optional reference line. */
function chartLine(labels, values, opts = {}) {
  const W = 760, H = opts.h || 220, L = 58, R = 16, T = 14, B = 26;
  const vs = values.filter(v => v != null);
  if (vs.length < 2) return '';
  const lo0 = Math.min(0, ...vs, opts.ref != null ? opts.ref : Infinity), hi0 = Math.max(...vs, opts.ref != null ? opts.ref : -Infinity);
  const ticks = niceTicks(lo0, hi0, 4), lo = ticks[0], hi = ticks[ticks.length - 1];
  const y = v => T + (hi - v) / (hi - lo || 1) * (H - T - B);
  const x = i => L + (W - L - R) * (labels.length === 1 ? 0.5 : i / (labels.length - 1));
  const pts = values.map((v, i) => v == null ? null : [x(i), y(v)]).filter(Boolean);
  const path = 'M' + pts.map(p => p.map(n => n.toFixed(1)).join(',')).join('L');
  const area = path + `L${pts[pts.length - 1][0].toFixed(1)},${y(Math.max(lo, 0)).toFixed(1)}L${pts[0][0].toFixed(1)},${y(Math.max(lo, 0)).toFixed(1)}Z`;
  const fmt = opts.fmt || axisMoney;
  const hits = values.map((v, i) => v == null ? '' : `<rect class="hit" x="${x(i) - (W - L - R) / labels.length / 2}" y="${T}" width="${(W - L - R) / labels.length}" height="${H - T - B}" data-tip="${tipAttr(`<b>${esc(labels[i])}</b><br>${esc((opts.tipFmt || fmt)(v))}`)}"/>`).join('');
  const last = pts[pts.length - 1];
  const ref = opts.ref != null ? `<line class="refline" x1="${L}" x2="${W - R}" y1="${y(opts.ref)}" y2="${y(opts.ref)}"/><text class="ax refl" x="${W - R}" y="${y(opts.ref) - 5}" text-anchor="end">${esc(opts.refLabel || '')}</text>` : '';
  const inner = yAxis(ticks, y, L, W - R, fmt) + ref + `<path d="${area}" class="area" style="fill:${opts.color || 'var(--c-new)'}"/><path d="${path}" class="ln" style="stroke:${opts.color || 'var(--c-new)'}"/>`
    + `<circle cx="${last[0]}" cy="${last[1]}" r="4" class="enddot" style="fill:${opts.color || 'var(--c-new)'}"/>`
    + xLabels(labels, x, H - 8, Math.max(1, Math.ceil(labels.length / 8))) + hits;
  return svgFrame(W, H, inner, opts.label || 'Line chart');
}

/* Fan chart: 10th–90th percentile band, median line, reference line. */
function chartFan(fan, which, opts = {}) {
  const W = 760, H = 240, L = 62, R = 16, T = 14, B = 28;
  const k10 = which + '10', k50 = which + '50', k90 = which + '90';
  const all = fan.flatMap(f => [f[k10], f[k90]]).concat(opts.ref != null ? [opts.ref] : []);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(...all), 5), lo = ticks[0], hi = ticks[ticks.length - 1];
  const y = v => T + (hi - v) / (hi - lo || 1) * (H - T - B);
  const x = t => L + (W - L - R) * t / (fan.length - 1);
  const top = fan.map((f, t) => `${x(t).toFixed(1)},${y(f[k90]).toFixed(1)}`), bot = fan.map((f, t) => `${x(t).toFixed(1)},${y(f[k10]).toFixed(1)}`).reverse();
  const med = 'M' + fan.map((f, t) => `${x(t).toFixed(1)},${y(f[k50]).toFixed(1)}`).join('L');
  const ref = opts.ref != null ? `<line class="refline" x1="${L}" x2="${W - R}" y1="${y(opts.ref)}" y2="${y(opts.ref)}"/><text class="ax refl" x="${W - R}" y="${y(opts.ref) - 5}" text-anchor="end">${esc(opts.refLabel || '')}</text>` : '';
  const hits = fan.map((f, t) => `<rect class="hit" x="${x(t) - (W - L - R) / fan.length / 2}" y="${T}" width="${(W - L - R) / fan.length}" height="${H - T - B}" data-tip="${tipAttr(`<b>Month ${t}</b><br>90th pct ${axisMoney(f[k90])}<br>Median ${axisMoney(f[k50])}<br>10th pct ${axisMoney(f[k10])}`)}"/>`).join('');
  const xl = fan.map((_, t) => t % 6 === 0 ? `<text class="ax" x="${x(t)}" y="${H - 9}" text-anchor="middle">${t === 0 ? 'now' : '+' + t + 'm'}</text>` : '').join('');
  const inner = yAxis(ticks, y, L, W - R, axisMoney) + `<polygon points="${top.concat(bot).join(' ')}" class="fanband" style="fill:${opts.color || 'var(--c-new)'}"/>` + ref
    + `<path d="${med}" class="ln" style="stroke:${opts.color || 'var(--c-new)'}"/>` + xl + hits;
  return svgFrame(W, H, inner, opts.label || 'Projection fan chart') + legend([{ c:opts.color || 'var(--c-new)', l:'Median path', line:true }, { c:'color-mix(in srgb, ' + (opts.color || 'var(--c-new)') + ' 25%, transparent)', l:'10th–90th percentile' }]);
}

/* Vertical bars (histogram / generic). */
function chartBars(items, opts = {}) {
  const W = 760, H = opts.h || 200, L = 44, R = 12, T = 14, B = 34;
  const max = Math.max(1, ...items.map(i => i.v));
  const ticks = niceTicks(0, max, 4), hi = ticks[ticks.length - 1];
  const y = v => T + (hi - v) / hi * (H - T - B);
  const band = (W - L - R) / items.length, bw = Math.min(opts.bw || 24, band * 0.7);
  const x = i => L + band * i + band / 2;
  const marks = items.map((it, i) => {
    const h = Math.max(0, y(0) - y(it.v));
    return `<path d="M${x(i) - bw / 2},${y(0)}V${y(it.v) + Math.min(4, h)}Q${x(i) - bw / 2},${y(it.v)} ${x(i) - bw / 2 + Math.min(4, h)},${y(it.v)}H${x(i) + bw / 2 - Math.min(4, h)}Q${x(i) + bw / 2},${y(it.v)} ${x(i) + bw / 2},${y(it.v) + Math.min(4, h)}V${y(0)}Z" fill="${it.c || 'var(--c-new)'}"/>`
      + (it.dot != null ? `<circle cx="${x(i)}" cy="${y(it.dot)}" r="4" class="expdot"/>` : '')
      + `<rect class="hit" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}" data-tip="${tipAttr(it.tip || esc(it.l + ': ' + it.v))}"/>`
      + `<text class="ax" x="${x(i)}" y="${H - 18}" text-anchor="middle">${esc(it.l)}</text>`;
  }).join('');
  return svgFrame(W, H, yAxis(ticks, y, L, W - R, opts.fmt || (v => String(Math.round(v)))) + marks, opts.label || 'Bar chart');
}

/* Payoff curves vs exit value (log x). Up to three series — validated palette slots 1–3. */
function chartPayoff(curve, series, opts = {}) {
  const W = 760, H = 260, L = 62, R = 16, T = 14, B = 30;
  const xs = curve.map(c => c.x);
  const lx0 = Math.log10(xs[0]), lx1 = Math.log10(xs[xs.length - 1]);
  const maxY = Math.max(...curve.flatMap(c => series.map(s => c[s.k])));
  const ticks = niceTicks(0, maxY, 5), hi = ticks[ticks.length - 1];
  const x = v => L + (Math.log10(v) - lx0) / (lx1 - lx0) * (W - L - R);
  const y = v => T + (hi - v) / (hi || 1) * (H - T - B);
  const lines = series.map(s => `<path d="M${curve.map(c => `${x(c.x).toFixed(1)},${y(c[s.k]).toFixed(1)}`).join('L')}" class="ln" style="stroke:${s.c}"/>`).join('');
  const decades = []; for (let d = Math.ceil(lx0); d <= Math.floor(lx1); d++) [1, 2, 5].forEach(m => { const v = m * Math.pow(10, d); if (v >= xs[0] && v <= xs[xs.length - 1]) decades.push(v); });
  const xl = decades.map(v => `<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="${T}" y2="${H - B}"/><text class="ax" x="${x(v)}" y="${H - 10}" text-anchor="middle">${esc(axisMoney(v))}</text>`).join('');
  const marks = (opts.marks || []).map(m => { if (!(m.x >= xs[0] && m.x <= xs[xs.length - 1])) return ''; const px = x(m.x), right = px > W - R - 110;
    return `<line class="refline" x1="${px}" x2="${px}" y1="${T}" y2="${H - B}"/><text class="ax refl" x="${right ? px - 4 : px + 4}" y="${T + 10}" text-anchor="${right ? 'end' : 'start'}">${esc(m.l)}</text>`; }).join('');
  const hits = curve.map((c, i) => { const x0 = i ? (x(curve[i - 1].x) + x(c.x)) / 2 : L, x1 = i < curve.length - 1 ? (x(c.x) + x(curve[i + 1].x)) / 2 : W - R;
    return `<rect class="hit" x="${x0}" y="${T}" width="${Math.max(1, x1 - x0)}" height="${H - T - B}" data-tip="${tipAttr(`<b>Exit ${money(c.x)}</b><br>` + series.map(s => `${esc(s.l)}: ${money(c[s.k])}`).join('<br>'))}"/>`; }).join('');
  return svgFrame(W, H, yAxis(ticks, y, L, W - R, axisMoney) + xl + marks + lines + hits, opts.label || 'Payoff by exit value')
    + legend(series.map(s => ({ c:s.c, l:s.l, line:true })));
}

/* Cohort heatmap (HTML table): sequential single hue, brighter = retained more. */
function cohortHeatmap(LED, mode) {
  const ages = LED.ages;
  const cell = c => {
    if (!c) return '<td class="hm-empty"></td>';
    const v = mode === 'logo' ? c.logo : c.dollar;
    if (v == null) return '<td class="hm-empty"></td>';
    const t = clamp(v / 120, 0, 1);
    const bg = `color-mix(in srgb, var(--c-new) ${Math.round(12 + t * 78)}%, var(--bg1))`;
    const ink = t > 0.55 ? '#fff' : 'var(--t0)';
    return `<td style="background:${bg};color:${ink}${c.partial ? ';opacity:.55' : ''}" data-tip="${tipAttr(`${fmtPct(v, 0)} ${mode === 'logo' ? 'of logos' : 'of starting MRR'}<br>${c.n} customers${c.partial ? '<br>partial: not every member is this old yet' : ''}`)}">${Math.round(v)}</td>`;
  };
  const avg = LED.avgCurve;
  return `<div class="tbl-wrap"><table class="heatmap"><thead><tr><th>Cohort</th><th>n</th>${ages.map(a => `<th>M${a}</th>`).join('')}</tr></thead><tbody>
    ${LED.cohorts.map(c => `<tr><td>${esc(c.key)}</td><td class="m">${c.n}</td>${c.cells.map(cell).join('')}</tr>`).join('')}
    ${mode !== 'logo' ? `<tr class="avg"><td>Weighted average</td><td></td>${avg.map(v => `<td class="m">${v == null ? '' : Math.round(v)}</td>`).join('')}</tr>` : ''}
  </tbody></table></div>`;
}

/* Horizontal tornado bars (HTML). Diverging pair: blue up, red down. */
function tornadoHTML(rows) {
  if (!rows || !rows.length) return '<div class="suppressed">No single input moves the score by half a point or more.</div>';
  const m = Math.max(...rows.map(r => Math.max(Math.abs(r.lo), Math.abs(r.hi))), 1);
  const bar = v => { const w = Math.abs(v) / m * 50; return v >= 0 ? `<i class="tpos" style="left:50%;width:${w}%"></i>` : `<i class="tneg" style="left:${50 - w}%;width:${w}%"></i>`; };
  return `<div class="tornado">${rows.map(r => `<div class="trow" data-tip="${tipAttr(`<b>${esc(r.label)}</b><br>−15% → ${fmtSigned(r.lo, 1)} pts<br>+15% → ${fmtSigned(r.hi, 1)} pts`)}">
    <div class="tlbl">${esc(r.label)}</div><div class="tbar">${bar(r.lo)}${bar(r.hi)}<span class="tmid"></span></div>
    <div class="tval m">${fmtSigned(Math.min(r.lo, r.hi), 1)} / ${fmtSigned(Math.max(r.lo, r.hi), 1)}</div></div>`).join('')}</div>
    ${legend([{ c:'var(--c-up)', l:'Score rises' }, { c:'var(--c-down)', l:'Score falls' }])}`;
}

/* Percentile strip: where this company sits among your own deals. */
function percentileHTML(rows) {
  return `<div class="pctl">${rows.map(r => {
    const has = r.pct != null;
    return `<div class="prow"><div class="plbl">${esc(r.m.label)}<div class="field-hint">${esc(libFmt(r.m, r.v))}</div></div>
      <div class="ptrack">${has ? `<span class="pq" style="left:25%"></span><span class="pq mid" style="left:50%"></span><span class="pq" style="left:75%"></span>
        <span class="pdot" style="left:${clamp(r.pct, 0, 100)}%" data-tip="${tipAttr(`Better than ${Math.round(r.pct)}% of ${r.n} deals (${esc(r.scope)})<br>25th ${esc(libFmt(r.m, r.m.dir === 'lo' ? r.p75 : r.p25))} · median ${esc(libFmt(r.m, r.p50))} · 75th ${esc(libFmt(r.m, r.m.dir === 'lo' ? r.p25 : r.p75))}`)}"></span>` : `<span class="field-hint" style="position:absolute;left:8px;top:2px">needs 5+ comparable deals (have ${r.n})</span>`}</div>
      <div class="pval m">${has ? Math.round(r.pct) + 'th' : '—'}</div></div>`; }).join('')}</div>`;
}
