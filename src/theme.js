
/* ═══════════════════════════════════════════════════════════════
   LOOK & THEME — which visual identity (direction) and which colour theme are active.
   The inline script in shell.html sets both before the first paint; this module keeps them in
   sync with the owner's published choice (CFG.look) and the visitor's light/dark toggle.
   Owner colour overrides are applied only when they keep text readable (WCAG AA 4.5:1).
   ═══════════════════════════════════════════════════════════════ */
const LOOK_DEFAULT = 'privatebank';
const ACCENTS = [['brass', 'Brass'], ['garnet', 'Garnet'], ['emerald', 'Emerald']];
const THEME_KEY = 'vcr2-theme', LOOK_CACHE = 'vcr2-look', LOOK_STYLE_CACHE = 'vcr2-look-style', THEME_DEFAULT_CACHE = 'vcr2-theme-default';
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

/* Colour maths for the contrast guard (sRGB relative luminance, WCAG 2.2). */
function hexRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function relLum(rgb) { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); }
function contrastRatio(a, b) { const x = hexRgb(a), y = hexRgb(b); if (!x || !y) return null; const l1 = relLum(x), l2 = relLum(y); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
/* Best readable ink (white or near-black) on a fill colour, and whether it reaches 4.5:1. */
function inkOn(fill) { const w = contrastRatio('#FFFFFF', fill), k = contrastRatio('#0E1222', fill); if (w == null) return null; return w >= k ? { ink:'#FFFFFF', ratio:w } : { ink:'#0E1222', ratio:k }; }

/* Text size: the visitor's own choice wins, then the owner's default from the Studio, then Large. */
const TEXT_KEY = 'vcr2-text', TEXT_DEFAULT_CACHE = 'vcr2-text-default', TEXT_SIZES = [['normal', 'Normal'], ['large', 'Large'], ['xlarge', 'Extra large']];
/* The sidebar: the visitor's choice is kept in this browser only (never in a deal, a draft, an export or the library); the owner's
   "Sidebar on start" is the default until they choose. */
const SB_KEY = 'vcr2-sidebar';
function sidebarPref() { const p = lsGet(SB_KEY); return p === 'open' || p === 'hidden' ? p : null; }
function resolvedSidebar() { return sidebarPref() || (CFG && CFG.look && CFG.look.sidebar === 'hidden' ? 'hidden' : 'open'); }
function textPref() { const p = lsGet(TEXT_KEY); return TEXT_SIZES.some(x => x[0] === p) ? p : null; }
function resolvedText() {
  const own = CFG && CFG.look && CFG.look.text;
  return textPref() || (TEXT_SIZES.some(x => x[0] === own) ? own : 'normal');
}
function setTextPref(p) { lsSet(TEXT_KEY, TEXT_SIZES.some(x => x[0] === p) ? p : null); applyLook(); }
function cycleTextSize() {
  const i = TEXT_SIZES.findIndex(x => x[0] === resolvedText()), next = TEXT_SIZES[(i + 1) % TEXT_SIZES.length];
  setTextPref(next[0]);
  toast('Text size: ' + next[1].toLowerCase() + '. Your choice is remembered in this browser.');
}
function themePref() { const p = lsGet(THEME_KEY); return p === 'light' || p === 'dark' ? p : 'auto'; }
function resolvedTheme(pref) {
  const p = pref || themePref();
  if (p === 'light' || p === 'dark') return p;
  const own = CFG && CFG.look && CFG.look.theme;
  if (own === 'light' || own === 'dark') return own;
  /* Light is the default. The visitor's device is followed only when the owner chose "auto" in the Studio. */
  if (own !== 'auto') return 'light';
  try { return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
}
/* One identity. A configuration written for an earlier version names another direction: it simply means this one. */
function activeLook() { return LOOK_DEFAULT; }
function lookStyle() {
  const L = (CFG && CFG.look) || {};
  const sz = v => (v === 'small' || v === 'large' || v === 'xlarge') ? v : '';
  return { accent:ACCENTS.some(a => a[0] === L.accent) ? L.accent : 'brass', frame:L.frame === 'off' ? 'off' : 'on', divider:L.divider === 'plain' ? 'plain' : 'diamond',
    corners:L.corners === 'soft' || L.corners === 'round' ? L.corners : '', st:sz(L.sizeTitle), sf:sz(L.sizeFigure), sq:sz(L.sizeQuestion),
    page:L.page === '90' || L.page === '100' ? L.page : '' };
}
/* Owner colour overrides, checked before use. Returns the list of problems (empty when all applied). */
function lookOverrides(look, theme) {
  const L = (CFG && CFG.look) || {}, out = {}, problems = [];
  const brand = theme === 'dark' ? L.brandDark : L.brand;
  if (brand) {
    const ink = inkOn(brand), surf = theme === 'dark' ? '#0B2B26' : '#F6F1E6';
    const asText = contrastRatio(brand, surf);
    if (!ink || ink.ratio < 4.5) problems.push(`Brand colour ${brand}: text on it would be hard to read (${ink ? ink.ratio.toFixed(1) : '?'}:1, needs 4.5:1).`);
    else { out['--brand'] = brand; out['--brand-ink'] = ink.ink; }
    if (asText != null && asText >= 4.5) out['--brand-text'] = brand;
  }
  if (L.highlight) {
    const ink = inkOn(L.highlight);
    if (!ink || ink.ratio < 4.5) problems.push(`Highlight colour ${L.highlight}: text on it would be hard to read (${ink ? ink.ratio.toFixed(1) : '?'}:1, needs 4.5:1).`);
    else { out['--hl'] = L.highlight; out['--hl-ink'] = ink.ink; out['--accent-line'] = L.highlight; }
  }
  return { vars:out, problems };
}
function applyLook() {
  if (typeof document === 'undefined' || !document.documentElement || !document.documentElement.style || typeof document.documentElement.style.setProperty !== 'function') return;
  const root = document.documentElement, look = activeLook(), theme = resolvedTheme(), text = resolvedText();
  /* Writing an attribute or a custom property restyles the whole page, so nothing is written when it would not change. */
  const st = lookStyle();
  if (root.getAttribute('data-direction') !== look) root.setAttribute('data-direction', look);
  if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme);
  if (root.getAttribute('data-text') !== text) root.setAttribute('data-text', text);
  if (root.getAttribute('data-accent') !== st.accent) root.setAttribute('data-accent', st.accent);
  if (root.getAttribute('data-frame') !== st.frame) root.setAttribute('data-frame', st.frame);
  if (root.getAttribute('data-divider') !== st.divider) root.setAttribute('data-divider', st.divider);
  [['data-corners', st.corners], ['data-sz-t', st.st], ['data-sz-f', st.sf], ['data-sz-q', st.sq], ['data-page', st.page]].forEach(([a, v]) => {
    if (v) { if (root.getAttribute(a) !== v) root.setAttribute(a, v); } else if (root.hasAttribute(a)) root.removeAttribute(a);
  });
  const sbv = resolvedSidebar();
  if (root.getAttribute('data-sidebar') !== sbv) root.setAttribute('data-sidebar', sbv);
  syncSidebar();
  const o = lookOverrides(look, theme), want = JSON.stringify(o.vars);
  if (root.__lookVars !== want) {
    ['--brand', '--brand-ink', '--brand-text', '--hl', '--hl-ink', '--accent-line'].forEach(v => root.style.removeProperty(v));
    Object.entries(o.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.__lookVars = want;
  }
  /* Remember the published choice so the next visit paints it immediately. */
  const own = CFG_PUBLISHED && CFG_PUBLISHED.look ? CFG_PUBLISHED.look : {};
  lsSet(LOOK_CACHE, null);
  lsSet(LOOK_STYLE_CACHE, own.accent || own.frame || own.divider || own.corners || own.sizeTitle || own.sizeFigure || own.sizeQuestion
    || own.page || own.sidebar ? JSON.stringify({ accent:own.accent, frame:own.frame, divider:own.divider, corners:own.corners, st:own.sizeTitle, sf:own.sizeFigure, sq:own.sizeQuestion, page:own.page, sb:own.sidebar }) : null);
  lsSet(THEME_DEFAULT_CACHE, own.theme === 'light' || own.theme === 'dark' || own.theme === 'auto' ? own.theme : null);
  lsSet(TEXT_DEFAULT_CACHE, own.text === 'large' || own.text === 'xlarge' ? own.text : null);
  /* The browser-bar colour reads a computed style, which forces layout: do it when the browser is idle, not during start-up. */
  const setBar = () => { const meta = document.querySelector && document.querySelector('meta[name="theme-color"]');
    if (meta && typeof getComputedStyle === 'function') { const c = getComputedStyle(root).getPropertyValue('--sb-bg').trim(); if (c) meta.setAttribute('content', c); } };
  if (typeof requestIdleCallback === 'function') { clearTimeout(root.__barT); root.__barT = setTimeout(() => requestIdleCallback(setBar, { timeout:800 }), 50); } else setBar();
  renderThemeToggle();
  const tb = document.getElementById && $id('text-toggle');
  if (tb && typeof tb.setAttribute === 'function') { const nm = (TEXT_SIZES.find(x => x[0] === text) || TEXT_SIZES[1])[1]; tb.setAttribute('title', 'Text size: ' + nm.toLowerCase()); tb.setAttribute('aria-label', 'Text size: ' + nm.toLowerCase() + '. Activate to change it.'); }
  return o.problems;
}
function setThemePref(p) { lsSet(THEME_KEY, p === 'light' || p === 'dark' ? p : null); applyLook(); }
function cycleTheme() {
  const now = resolvedTheme();
  setThemePref(now === 'dark' ? 'light' : 'dark');
  toast(resolvedTheme() === 'dark' ? 'Dark theme on. Your choice is remembered in this browser.' : 'Light theme on. Your choice is remembered in this browser.');
}
function renderThemeToggle() {
  const b = document.getElementById && $id('theme-toggle');
  if (!b || typeof b.setAttribute !== 'function') return;
  const dark = resolvedTheme() === 'dark';
  b.setAttribute('aria-label', dark ? 'Switch to the light theme' : 'Switch to the dark theme');
  b.setAttribute('title', dark ? 'Light theme' : 'Dark theme');
  b.innerHTML = icon(dark ? 'sun' : 'moon');
}
if (typeof window !== 'undefined' && window.matchMedia) {
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (themePref() === 'auto') applyLook(); }); } catch (e) { /* old browser */ }
}
