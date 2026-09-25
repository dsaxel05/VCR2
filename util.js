
/* ═══════════════════════════════════════════════════════════════
   VCR2 v4 — SHARED UTILITIES
   Deterministic maths, parsing and small UI primitives used by every
   engine below. Nothing in this block touches the network.
   ═══════════════════════════════════════════════════════════════ */

/* ── Seeded PRNG (mulberry32). Same seed, same numbers, every browser. ── */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFrom(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/* Standard normal from a uniform source (Box–Muller). */
function gauss(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ── Statistics ── */
const sum = a => a.reduce((x, y) => x + y, 0);
const mean = a => a.length ? sum(a) / a.length : null;
function quantile(arr, q) {
  const a = arr.filter(x => x != null && isFinite(x)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
const median = a => quantile(a, 0.5);
function stdev(a) {
  const xs = a.filter(x => x != null && isFinite(x));
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map(x => (x - m) * (x - m))) / (xs.length - 1));
}
function linreg(xs, ys) {
  const n = xs.length; if (n < 2) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) };
}
/* P(X >= k) for X ~ Binomial(n, p). Exact, via log-gamma-free recurrence. */
function binomTail(n, k, p = 0.5) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let pmf = Math.pow(1 - p, n), cdfBelow = 0;
  for (let i = 0; i < k; i++) {
    cdfBelow += pmf;
    pmf = pmf * (n - i) / (i + 1) * p / (1 - p);
  }
  return Math.max(0, 1 - cdfBelow);
}
/* Percentile rank of v inside arr (0–100), ties counted half. */
function pctRank(arr, v) {
  const a = arr.filter(x => x != null && isFinite(x));
  if (!a.length || v == null) return null;
  let below = 0, eq = 0;
  a.forEach(x => { if (x < v) below++; else if (x === v) eq++; });
  return (below + eq / 2) / a.length * 100;
}

/* ── Number parsing: "$1,234.50", "(1,234)", "1.2M", "12%", "€ 4.300,00" ── */
function parseNum(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s || s === '-' || s === '—' || /^n\/?a$/i.test(s)) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$€£¥\s ]/g, '').replace(/usd|eur|gbp/ig, '');
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  let mult = 1;
  const suf = s.match(/([kmb]|bn|mm)$/i);
  if (suf) {
    const u = suf[1].toLowerCase();
    mult = u === 'k' ? 1e3 : (u === 'm' || u === 'mm') ? 1e6 : 1e9;
    s = s.slice(0, -suf[1].length);
  }
  s = s.replace(/%$/, '');
  const hasDot = s.includes('.'), hasComma = s.includes(',');
  if (hasDot && hasComma) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  if (!/^\d*\.?\d+(e[+-]?\d+)?$/i.test(s)) return null;
  const v = parseFloat(s) * mult;
  return isFinite(v) ? (neg ? -v : v) : null;
}

/* ── CSV / TSV parser with quote handling and delimiter detection ── */
function parseCSV(text) {
  const src = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLines = src.split('\n').slice(0, 5).join('\n');
  const cand = ['\t', ',', ';', '|'];
  const counts = cand.map(d => (firstLines.match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length);
  const delim = cand[counts.indexOf(Math.max(...counts))] || ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(x => x !== ''));
}

/* ── Month handling. Canonical form: 'YYYY-MM'. ── */
const MON = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12,
  janvier:1, fevrier:2, février:2, mars:3, avril:4, mai:5, juin:6, juillet:7, aout:8, août:8, septembre:9, octobre:10, novembre:11, decembre:12, décembre:12 };
const pad2 = n => String(n).padStart(2, '0');
function parseMonth(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().replace(/[’']/g, ' ');
  if (!s) return null;
  let m;
  const yy = y => { y = +y; return y < 100 ? 2000 + y : y; };
  const ok = (y, mo) => (y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12) ? `${y}-${pad2(mo)}` : null;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[ t].*)?$/))) return ok(+m[1], +m[2]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) return ok(+m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    const a = +m[1], b = +m[2];
    return a > 12 ? ok(yy(m[3]), b) : ok(yy(m[3]), a);
  }
  if ((m = s.match(/^([a-zéû]+)\.?[\s\-/]*(\d{2,4})$/))) { const mo = MON[m[1]] || MON[m[1].slice(0, 3)]; return mo ? ok(yy(m[2]), mo) : null; }
  if ((m = s.match(/^(\d{4})[\s\-/]*([a-zéû]+)\.?$/))) { const mo = MON[m[2]] || MON[m[2].slice(0, 3)]; return mo ? ok(+m[1], mo) : null; }
  if ((m = s.match(/^(\d{4})\s*q([1-4])$/)) || (m = s.match(/^q([1-4])\s*(\d{4})$/))) {
    const y = m[1].length === 4 ? +m[1] : +m[2], qn = m[1].length === 4 ? +m[2] : +m[1];
    return ok(y, qn * 3);
  }
  if (/^\d{5}$/.test(s)) { /* Excel serial date */
    const d = new Date(Date.UTC(1899, 11, 30) + (+s) * 86400000);
    return ok(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
  return null;
}
function monthAdd(ym, k) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${pad2(t % 12 + 1)}`;
}
function monthDiff(a, b) {
  const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number);
  return (yb * 12 + mb) - (ya * 12 + ma);
}
const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function monthLabel(ym, withYear = true) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return MON_SHORT[m - 1] + (withYear ? ' ’' + String(y).slice(2) : '');
}
const MON_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function monthLong(ym) { if (!ym) return ''; const [y, m] = ym.split('-').map(Number); return MON_LONG[m - 1] + ' ' + y; }

/* ── Formatting helpers used by the new modules ── */
function fmtPct(v, d = 1) { return v == null || !isFinite(v) ? '—' : v.toFixed(d) + '%'; }
function fmtX(v, d = 1) { return v == null || !isFinite(v) ? '—' : v.toFixed(d) + 'x'; }
function fmtMo(v) { return v == null || !isFinite(v) ? '—' : (v >= 99 ? '99+ mo' : v.toFixed(1) + ' mo'); }
function fmtProb(p) { return p == null || !isFinite(p) ? '—' : (p < 0.01 ? '<1%' : p > 0.99 ? '>99%' : Math.round(p * 100) + '%'); }
function fmtSigned(v, d = 1, unit = '') { return v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + v.toFixed(d) + unit; }
function cleanName(s) {
  return String(s || '').toLowerCase()
    .replace(/[.,'"()&]/g, ' ')
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|gmbh|sa|sas|sarl|plc|bv|ag|pty|the)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
/* Levenshtein distance with an early exit — used to spot near-duplicate customers. */
function editDistance(a, b, cap = 3) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let cur = [i], best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/* ── Files ── */
function downloadFile(name, content, mime = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const safeFile = s => String(s || 'report').replace(/[^\w-]+/g, '_').slice(0, 40);
function pickFile(accept, cb, kind) {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = accept;
  i.onchange = () => {
    const f = i.files && i.files[0]; if (!f) return;
    if (f.size > 12e6) { toast(`${f.name} is larger than 12 MB. Export a narrower date range.`, 'err'); return; }
    readAnyFile(f, cb, kind);
  };
  i.click();
}

/* ── Tooltip layer: any element with data-tip gets a hover card. ── */
(function tooltipLayer() {
  let tip = null;
  const ensure = () => {
    if (!tip) { tip = document.createElement('div'); tip.className = 'vtip'; document.body.appendChild(tip); }
    return tip;
  };
  document.addEventListener('mouseover', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) return;
    const el = ensure();
    el.innerHTML = t.getAttribute('data-tip');
    el.classList.add('show');
  });
  document.addEventListener('mousemove', e => {
    if (!tip || !tip.classList.contains('show')) return;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  document.addEventListener('mouseout', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t && tip && !(e.relatedTarget && t.contains(e.relatedTarget))) tip.classList.remove('show');
  });
})();
/* data-tip content is HTML: escape everything that came from users. */
const tipAttr = html => esc(html);

/* ── Modal ── */
function openModal(title, bodyHtml, actions = []) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap'; wrap.id = 'modal-wrap';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-h"><h3>${esc(title)}</h3><button class="modal-x" aria-label="Close" onclick="closeModal()">×</button></div>
    <div class="modal-b">${bodyHtml}</div>
    <div class="modal-f">${actions.map((a, i) => `<button class="btn ${a.primary ? 'btn-primary' : 'btn-ghost'}" data-mi="${i}">${esc(a.label)}</button>`).join('')}
      <button class="btn btn-ghost" onclick="closeModal()">Close</button></div>
  </div>`;
  wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);
  wrap.querySelectorAll('[data-mi]').forEach(b => b.addEventListener('click', () => actions[+b.dataset.mi].onClick()));
  document.addEventListener('keydown', modalEsc);
}
function modalEsc(e) { if (e.key === 'Escape') closeModal(); }
function closeModal() {
  const w = document.getElementById('modal-wrap'); if (w) w.remove();
  document.removeEventListener('keydown', modalEsc);
}
function copyText(text, okMsg = 'Copied to clipboard.') {
  const done = () => toast(okMsg);
  if (navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast('Clipboard blocked by the browser.', 'err'); }
  document.body.removeChild(ta);
}
