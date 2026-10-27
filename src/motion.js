/* ═══════════════════════════════════════════════════════════════
   MOTION — the moving parts of the golden warmth look. Visual only: no value, score or text is ever changed.
   1. Each page fades up in a cascade when it opens (.fu, style-identity.css).
   2. Headline figures count up (or down) to their value, about 1.5 s with ease-out, when they first come into view: once per
      figure per page view, never again when the page re-renders. The element's own text is the true value from the start and
      stays untouched; the counting digits are drawn over it (.cu-run::after, from data-cu). Screen readers, copy, print, the
      memo, exports, the library and every test therefore read the exact figure. A sidebar figure counts from its last value
      when it jumps (a deal opened or reset), not while you type.
   3. The marked headline word gets the copy of itself that its shimmer layers need (data-word).
   Under prefers-reduced-motion nothing moves and every figure simply shows.
   ═══════════════════════════════════════════════════════════════ */
const CU_SEL = '.kpi-v, .stat-n, .spec-v.proven .ev-mark, .band-num, .dv-val, .dim-cell b, .sec-counter, .gate h2, .verdict-pill, #rt-findings, #rt-questions, .nav-count, .sb-progress-row span:last-child';
const CU_SIDE = '.sidebar, .topbar';
const CU_NUM = /([−-]?)(\d[\d,]*(?:\.\d+)?)/;
const cuState = new Map(), cuLast = new Map();
let cuPage = 'intro';
const cuStill = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return true; } };
const cuIO = typeof IntersectionObserver === 'function' ? new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  cuIO.unobserve(e.target);
  const k = e.target._cuKey;
  if (k && cuState.get(k) !== 'done') { cuState.set(k, 'done'); cuRun(e.target, e.target._cuFrom); }
}), { threshold:.2 }) : null;

/* The first text node holding a number: the number (with its sign), its decimals and separators, and a short unit right after it
   ("%", "x", "M", "/13", ")"), which the count is drawn with. */
function cuParse(el) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const m = CU_NUM.exec(n.nodeValue);
    if (m) return { node:n, at:m.index, len:m[0].length, to:parseFloat(m[2].replace(/,/g, '')) * (m[1] ? -1 : 1), sign:m[1],
      dec:(m[2].split('.')[1] || '').length, sep:m[2].includes(','), post:/^\S{0,3}/.exec(n.nodeValue.slice(m.index + m[0].length))[0] };
  }
  return null;
}
function cuFmt(v, p) {
  let s = Math.abs(v).toFixed(p.dec);
  if (p.sep) s = s.replace(/^(\d+)/, d => d.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
  return (v < 0 ? (p.sign || '-') : '') + s + p.post;
}
/* Draw the count over the number only: its text is moved into a span of its own (the page's text stays exactly the same). */
function cuRun(el, from) {
  const p = cuParse(el); if (!p || !el.isConnected || from === p.to) return;
  let node = p.node; if (p.at) node = node.splitText(p.at);
  if (node.nodeValue.length > p.len + p.post.length) node.splitText(p.len + p.post.length);
  const host = document.createElement('span'); node.parentNode.insertBefore(host, node); host.appendChild(node);
  const text = host.textContent, t0 = performance.now(), span = from - p.to;
  host.style.setProperty('--cu-c', getComputedStyle(host).color);
  if (el.matches('.nav-count, .sb-progress-row span, .spec-v *')) host.classList.add('cu-r');
  host.classList.add('cu-run');
  const stop = () => { host.classList.remove('cu-run', 'cu-r'); host.removeAttribute('data-cu'); };
  const step = now => {
    const k = Math.min(1, Math.max(0, now - t0) / 1500), e = 1 - Math.pow(1 - k, 3);   /* a frame time can be a little before t0 */
    if (k >= 1 || !host.isConnected || host.textContent !== text) return stop();
    host.setAttribute('data-cu', cuFmt(p.to + span * (1 - e), p));
    requestAnimationFrame(step);
  };
  host.setAttribute('data-cu', cuFmt(from, p));
  requestAnimationFrame(step);
}
/* Look at a figure that has just appeared (or changed) and decide whether it counts. */
function cuSee(el, force) {
  if (cuStill() || !cuIO || el.closest('[data-no-count]')) return;
  const p = cuParse(el); if (!p) return;
  const label = (el.closest('.kpi, .stat, .dv, .dim-cell, .nav-item, .sb-progress-row, .spec-row, .gate, .rtab, .sec-field-progress, .score-card') || el).textContent.replace(/\d+/g, '#').trim().slice(0, 80);
  if (el.closest(CU_SIDE)) {
    const last = cuLast.get(label); cuLast.set(label, p.to);
    if (last == null || Math.abs(last - p.to) < 3) return;          /* typing moves a figure by a step or two: no count */
    el._cuKey = 'side|' + label + '|' + Math.random(); el._cuFrom = last;
  } else {
    const pg = el.closest('.page'), pane = el.closest('.rpane');
    const key = (pg ? pg.id : cuPage) + '|' + (pane ? pane.id : '') + '|' + label;
    if (cuState.get(key) === 'done' && !force) return;
    cuState.set(key, 'pending'); el._cuKey = key;
    el._cuFrom = parseFloat(el.getAttribute('data-cu-from')) || 0;
  }
  cuIO.observe(el);
}
function motionScan(root, force) {
  if (!root || !root.querySelectorAll) return;
  if (root.matches && root.matches(CU_SEL)) cuSee(root, force);
  root.querySelectorAll(CU_SEL).forEach(el => cuSee(el, force));
  root.querySelectorAll('.mark').forEach(m => { if (m.dataset.word !== m.textContent) m.dataset.word = m.textContent; });
}
/* A page opens: its figures may count again, and its blocks fade up one after another. */
function motionPage(id) {
  cuPage = 'page-' + id;
  for (const k of Array.from(cuState.keys())) if (k.startsWith(cuPage + '|')) cuState.delete(k);
  const pg = document.getElementById(cuPage); if (!pg) return;
  motionScan(pg, true);
  if (cuStill()) return;
  let box = pg;
  while (box.children.length === 1 && box.firstElementChild.children.length) box = box.firstElementChild;
  Array.from(box.children).slice(0, 14).forEach((el, i) => {
    el.style.setProperty('--fu', i); el.classList.add('fu');
    /* Removed when its own fade ends, or is cancelled (the page was left before it finished), or at the latest by the timer. */
    const done = e => { if (e && e.target !== el) return; el.classList.remove('fu'); el.removeEventListener('animationend', done); el.removeEventListener('animationcancel', done); };
    el.addEventListener('animationend', done); el.addEventListener('animationcancel', done); setTimeout(done, 2000 + i * 70);
  });
}
/* Everything rendered later (a report, a section, the library, a sidebar update) is looked at once per frame. */
(function () {
  if (typeof MutationObserver !== 'function' || typeof document === 'undefined' || !document.body) return;
  let queue = new Set(), raf = 0;
  new MutationObserver(rs => {
    rs.forEach(r => r.addedNodes.forEach(n => queue.add(n.nodeType === 1 ? n : n.parentElement)));
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; const q = queue; queue = new Set(); q.forEach(n => n && n.isConnected && motionScan(n)); });
  }).observe(document.body, { childList:true, subtree:true });
  motionScan(document.body);
})();
