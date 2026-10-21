
/* ═══════════════════════════════════════════════════════════════
   OWNER CONTROL, second layer (5.0)
   Anything the owner sees on the site and wants worded differently is a text replacement: "from" is the words as
   built in, "to" is what the owner wants. The replacement is applied to everything that reaches the screen, the
   printed memo, the markdown report and the founder email. It is plain text only (never HTML), so a replacement
   cannot add markup or script. The Studio's "Edit texts on the site" mode lets the owner click any text.
   ═══════════════════════════════════════════════════════════════ */
const TX_MAX = 400;
/* A metric, field, dimension or section the owner renamed is renamed in the prose that quotes it too (questions, check texts,
   red-flag explanations, the memo), not only where it is a label. Longer names go first; a name that contains the old one is skipped. */
let _txAutoFor = null, _txAuto = [], _txBoth = [];
function txAuto() {
  if (_txAutoFor === CFG) return _txAuto;
  const out = [], L = CFG && CFG.labels;
  if (L && typeof BASE !== 'undefined') {
    const add = (from, to) => {
      if (typeof from !== 'string' || typeof to !== 'string' || from.length < 5 || !to.trim() || from === to || to.includes(from)) return;
      out.push({ from, to });
      const lf = from.toLowerCase(), acr = /^[A-Z]{2}/.test(to);
      if (lf !== from && !acr && lf.length >= 5) out.push({ from:lf, to:to.charAt(0).toLowerCase() + to.slice(1) });
    };
    Object.entries(L.metrics || {}).forEach(([k, v]) => add(BASE.dlabel[k], v));
    Object.entries(L.dims || {}).forEach(([k, v]) => add(BASE.dimlabel[k], v));
    Object.entries(L.fields || {}).forEach(([k, v]) => add(BASE.flabel[k], v));
    Object.entries(L.sections || {}).forEach(([k, v]) => add(BASE.slabel[k], v));
  }
  out.sort((a, b) => b.from.length - a.from.length);
  _txAuto = out; _txAutoFor = CFG;
  return out;
}
function txList() {
  if (!CFG) return [];
  const own = Array.isArray(CFG.texts) ? CFG.texts : [], auto = txAuto();
  return auto.length ? own.concat(auto) : own;
}
/* Plain-text replacement, in the order the owner listed them. */
function trText(s) {
  const L = txList();
  if (!L.length || s == null) return s;
  let t = String(s);
  /* Rules chain, so a few of them could multiply a text without end: past this length the original is kept. */
  const cap = Math.max(4 * t.length, 5000);
  for (const r of L) {
    if (r.from && t.indexOf(r.from) >= 0) { t = t.split(r.from).join(r.to); if (t.length > cap) return String(s); }
  }
  return t;
}
/* The same for a string of HTML: only text between tags is touched, so markup, attributes and scripts stay as built. */
function trHTML(html) {
  const L = txList();
  if (!L.length || html == null) return html;
  const pairs = L.map(r => [esc(r.from), esc(r.to)]).filter(p => p[0]);
  return String(html).replace(/(<(?:script|style)[\s\S]*?<\/(?:script|style)>)|(<[^>]*>)|([^<]+)/gi, (m, blk, tag, txt) => {
    if (txt == null) return m;
    let t = txt;
    for (const p of pairs) if (t.indexOf(p[0]) >= 0) t = t.split(p[0]).join(p[1]);
    return t;
  });
}

/* ── Live page: every text node (and title / aria-label / placeholder) passes through trText ── */
/* An <option> is included: every option carries its own value attribute, so rewording what it shows never changes what is stored. */
const TX_SKIP_TAGS = /^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|NOSCRIPT)$/;
const TX_ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
let _txOrig = null, _txOut = null, _txObserver = null;
function txDomReady() { return typeof document !== 'undefined' && document.body && typeof document.createTreeWalker === 'function' && typeof WeakMap === 'function'; }
function txSkipNode(n) {
  const p = n.parentNode;
  if (!p || TX_SKIP_TAGS.test(p.nodeName)) return true;
  return !!(p.closest && p.closest('[data-no-text-edit]'));
}
function txApplyTextNode(n) {
  if (txSkipNode(n)) return;
  let o = _txOrig.get(n);
  if (o != null && n.nodeValue !== _txOut.get(n)) o = n.nodeValue;     /* the app wrote a new text here since */
  if (o == null) o = n.nodeValue;
  const t = trText(o);
  if (t === o) { if (_txOrig.has(n)) { _txOrig.delete(n); _txOut.delete(n); } if (n.nodeValue !== o) n.nodeValue = o; return; }
  _txOrig.set(n, o); _txOut.set(n, t);
  if (n.nodeValue !== t) n.nodeValue = t;
}
function txApplyAttrs(el) {
  if (!el.getAttribute) return;
  TX_ATTRS.forEach(a => {
    const stash = 'data-tx-' + a;
    const cur = el.getAttribute(a), saved = el.getAttribute(stash);
    if (cur == null && saved == null) return;
    const base = saved != null && trText(saved) === cur ? saved : cur;
    if (base == null) return;
    const t = trText(base);
    if (t !== base) { el.setAttribute(stash, base); el.setAttribute(a, t); }
    else if (saved != null) { el.setAttribute(a, saved); el.removeAttribute(stash); }
  });
}
function txWalk(root) {
  if (!txDomReady() || !root) return;
  {
    if (root.nodeType === 3) { txApplyTextNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (root.closest && root.closest('[data-no-text-edit]')) return; txApplyAttrs(root); }
    /* Anything inside an element marked data-no-text-edit (the Studio, its dialogs and banners) is left as built, attributes included. */
    const w = document.createTreeWalker(root, 1 | 4, { acceptNode: n => (n.nodeType === 1 && n.hasAttribute('data-no-text-edit')) ? 2 : 1 });
    let n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) txApplyTextNode(n); else txApplyAttrs(n); }
  }
}
/* Called after every configuration change: start or stop the observer and re-read the whole page. */
function txRefresh() {
  if (!txDomReady()) return;
  if (!_txOrig) { _txOrig = new WeakMap(); _txOut = new WeakMap(); }
  const on = txList().length > 0;
  if (on && !_txObserver && typeof MutationObserver === 'function') {
    _txObserver = new MutationObserver(muts => {
      muts.forEach(m => {
        if (m.type === 'characterData') txApplyTextNode(m.target);
        else m.addedNodes.forEach(n => txWalk(n));
      });
    });
    _txObserver.observe(document.body, { childList:true, subtree:true, characterData:true });
  }
  if (!on && _txObserver) { _txObserver.disconnect(); _txObserver = null; }
  txWalk(document.body);
}
/* The words as built in for a text node: what the owner is replacing, whether or not a replacement is showing now. */
function txOriginalOf(node) {
  if (!node || node.nodeType !== 3) return '';
  if (_txOrig && _txOrig.has(node) && node.nodeValue === _txOut.get(node)) return _txOrig.get(node);
  return node.nodeValue;
}
