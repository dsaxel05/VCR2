/* ═══════════════════════════════════════════════════════════════
   DEAL FLOW PAGE — the few names the shared modules expect from the main page (they live in studio.js and boot.js there).
   ═══════════════════════════════════════════════════════════════ */
let CFG_READY = Promise.resolve(false);
const WS_SITE = (() => { try { return JSON.parse('@@WS_SITE@@'); } catch (e) { return {}; } })();
function refreshAfterConfig() {}
function saveDraft() {}
function updateProgress() {}
function renderIntakeStatus() {}
