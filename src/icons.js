
/* ═══════════════════════════════════════════════════════════════
   ICONS — one inline-SVG set drawn for VCR2 (24-unit grid, 1.75 stroke, round joins) instead of
   emoji. icon(name) returns decorative markup (aria-hidden); give the button or link around it
   an accessible name. Owner-added business models may still use an emoji they typed.
   ═══════════════════════════════════════════════════════════════ */
const ICON_PATHS = {
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  moon:'<path d="M20 14.6A8 8 0 0 1 9.4 4a8 8 0 1 0 10.6 10.6z"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  close:'<path d="M6 6l12 12M18 6L6 18"/>',
  ledger:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  compare:'<path d="M4 7h11M4 7l3-3M4 7l3 3M20 17H9M20 17l-3-3M20 17l-3 3"/>',
  forensics:'<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5M8 10.5h5M10.5 8v5"/>',
  odds:'<path d="M3 20h18"/><path d="M5 16c3-1 4-9 7-9s4 8 7 9"/><path d="M12 7v13" stroke-dasharray="2 2.5"/>',
  deal:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12h18"/>',
  library:'<path d="M5 4h3v16H5zM10 4h3v16h-3z"/><path d="M15.2 4.6l2.9-.8 3.6 15.4-2.9.8z"/>',
  revenue:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  capital:'<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10v4M7 11v2M11 11v2"/>',
  gtm:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  team:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.6c1.7.7 2.7 2.5 3 5.4"/>',
  market:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5S9.5 6.1 12 3.5z"/>',
  model:'<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4z"/><circle cx="16.5" cy="16.5" r="3.5"/>',
  govern:'<path d="M12 3v18M7 21h10M5 7h14"/><path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>',
  claims:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  exits:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  saas:'<path d="M7 18a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 8.5a4.8 4.8 0 0 1-.6 9.5z"/>',
  ai:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9.5 9.5h5v5h-5zM9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
  marketplace:'<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v2a3 3 0 0 1-5.3 1.9A3 3 0 0 1 12 14a3 3 0 0 1-2.7-1.1A3 3 0 0 1 4 11z"/><path d="M5.5 14v6h13v-6"/>',
  fintech:'<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19M6 15h4"/>',
  usage:'<path d="M3 17l5-6 4 3 4-6 5 4"/><path d="M3 21h18"/>',
  consumer:'<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  hardware:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  services:'<path d="M14.5 6.5a3.5 3.5 0 0 0-4.7 4.4L4 16.7 7.3 20l5.8-5.8a3.5 3.5 0 0 0 4.4-4.7l-2.2 2.2-2.4-.6-.6-2.4z"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  warn:'<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  stop:'<path d="M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.3"/>',
  shield:'<path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  doc:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  upload:'<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  question:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 4M12 17.2v.3"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14.5 8.5l2.5 2.5"/>',
};
/* Which icon each built-in business model uses. */
const MODEL_ICON = { saas:'saas', ai_app:'ai', marketplace:'marketplace', fintech:'fintech', usage:'usage', consumer:'consumer', hardware:'hardware', services:'services' };
function icon(name, cls) {
  const p = ICON_PATHS[name] || ICON_PATHS.info;
  return `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
}
/* A model's visual mark: the built-in icon, or the emoji an owner typed for a custom one. */
function modelMark(m) { return MODEL_ICON[m.id] ? icon(MODEL_ICON[m.id]) : `<span class="emoji-mark" aria-hidden="true">${esc(m.em || m.emoji || '')}</span>`; }
