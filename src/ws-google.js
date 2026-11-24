/* ═══════════════════════════════════════════════════════════════
   GOOGLE WORKSPACE CONNECTOR — Drive (folders, decks, reports), Sheets (the master sheet), Docs (deal memos).
   Scope: drive.file only (the files and folders VCR2 creates, plus the ones the investor picks in Google's picker). VCR2 never
   sees the rest of the investor's Drive. The token is asked in a small window (oauth.html) and kept in this tab for its hour of
   life; nothing is stored on VCR2's side. Microsoft (OneDrive, SharePoint, Excel) plugs into the same interface later.
   ═══════════════════════════════════════════════════════════════ */
const WSG_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const WSG_TOKEN_KEY = 'vcr2-google-token';
let _wsgTok = null;
const wsgCfg = () => (WS_SITE && WS_SITE.google) || {};
const wsgReady = () => !!wsgCfg().clientId;
function wsgSaved() { if (_wsgTok && _wsgTok.exp > Date.now() + 6e4) return _wsgTok; try { const t = JSON.parse(sessionStorage.getItem(WSG_TOKEN_KEY) || 'null'); if (t && t.exp > Date.now() + 6e4) return (_wsgTok = t); } catch (e) {} return null; }
function wsgForget() { _wsgTok = null; try { sessionStorage.removeItem(WSG_TOKEN_KEY); } catch (e) {} }
/* the sign-in window answers on a same-origin channel (Google's pages cut the window's link back to its opener) */
function wsgWaitResult(state, ms) {
  return new Promise((ok, no) => {
    let done = false, bc = null;
    const finish = v => { if (done) return; done = true; clearTimeout(t); window.removeEventListener('storage', onStore); if (bc) bc.close(); try { localStorage.removeItem('vcr2-oauth-result'); } catch (e) {} v instanceof Error ? no(v) : ok(v); };
    const take = d => { if (!d || d.state !== state) return; if (d.error) finish(new Error(d.error)); else finish(d); };
    const onStore = e => { if (e.key === 'vcr2-oauth-result' && e.newValue) { try { take(JSON.parse(e.newValue)); } catch (x) {} } };
    try { bc = new BroadcastChannel('vcr2-oauth'); bc.onmessage = e => take(e.data); } catch (e) {}
    window.addEventListener('storage', onStore);
    const t = setTimeout(() => finish(new Error('The Google window was closed or took too long.')), ms || 180000);
  });
}
async function wsgToken(interactive) {
  const have = wsgSaved(); if (have) return have.token;
  if (!interactive) throw Object.assign(new Error('Connect Google first.'), { code:'google_signed_out' });
  if (!wsgReady()) throw Object.assign(new Error('Google is not set up on this site yet (site.json, workspaces.google.clientId).'), { code:'google_not_set' });
  const state = acctRandom(16), redirect = location.origin + location.pathname.replace(/[^/]*$/, '') + 'oauth.html';
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id:wsgCfg().clientId, redirect_uri:redirect, response_type:'token', scope:WSG_SCOPE, state, include_granted_scopes:'true', prompt:'select_account' });
  const w = window.open(url, 'vcr2-google', 'popup,width=520,height=640');
  if (!w) throw Object.assign(new Error('Your browser blocked the Google window: allow pop-ups for this site, then try again.'), { code:'popup_blocked' });
  const r = await wsgWaitResult(state);
  if (!String(r.scope || '').includes('drive.file')) throw new Error('Google did not grant access to the files VCR2 creates. Try again and tick the Drive box.');
  _wsgTok = { token:r.access_token, exp:Date.now() + (Math.min(3600, +r.expires_in || 3600) - 30) * 1000, email:'' };
  try { sessionStorage.setItem(WSG_TOKEN_KEY, JSON.stringify(_wsgTok)); } catch (e) {}
  return _wsgTok.token;
}
const WSG_HOSTS = /^https:\/\/(www\.googleapis\.com|sheets\.googleapis\.com|docs\.googleapis\.com)\//;
async function wsgFetch(url, o) {
  if (!WSG_HOSTS.test(url)) throw new Error('not a Google API address');
  o = o || {}; const tok = await wsgToken(false);
  const h = Object.assign({ authorization:'Bearer ' + tok }, o.headers || {});
  let res;
  try { res = await fetch(url, { method:o.method || 'GET', headers:h, body:o.body, credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer', redirect:'error' }); }
  catch (e) { throw Object.assign(new Error('Google could not be reached (offline?).'), { code:'offline' }); }
  if (res.status === 401) { wsgForget(); throw Object.assign(new Error('The Google connection expired: connect again.'), { code:'google_signed_out' }); }
  const text = await res.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok) { const m = j && j.error && (j.error.message || j.error.status) || 'HTTP ' + res.status; throw Object.assign(new Error('Google: ' + String(m).slice(0, 200)), { code:'google_' + res.status, status:res.status }); }
  return j;
}
const wsgJson = (url, method, body) => wsgFetch(url, { method, headers:{ 'content-type':'application/json' }, body:JSON.stringify(body) });
/* ids typed or pasted by a person: a Drive or Docs link, or a bare id */
function wsgIdFrom(v) { const s = String(v || '').trim(); const m = /\/(?:d|folders)\/([A-Za-z0-9_-]{10,200})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{10,200})/.exec(s) || /^([A-Za-z0-9_-]{10,200})$/.exec(s); return m ? m[1] : ''; }

const WSG = {
  id:'google', name:'Google Workspace',
  ready:wsgReady,
  connected:() => !!wsgSaved(),
  connect:() => wsgToken(true),
  disconnect:wsgForget,
  async folder(name, parent) {
    const r = await wsgJson('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink', 'POST', { name:wsClip(name, 200), mimeType:'application/vnd.google-apps.folder', parents:parent ? [parent] : undefined });
    return { id:r.id, name:r.name, url:r.webViewLink || `https://drive.google.com/drive/folders/${r.id}` };
  },
  /* one file into a folder; asDoc converts an HTML report into a Google Doc */
  async upload(name, bytes, mime, parent, asDoc) {
    const meta = { name:wsClip(name, 200), parents:parent ? [parent] : undefined }; if (asDoc) meta.mimeType = asDoc === 'sheet' ? 'application/vnd.google-apps.spreadsheet' : 'application/vnd.google-apps.document';
    const boundary = 'vcr2' + acctRandom(12).replace(/[^A-Za-z0-9]/g, '');
    const head = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\ncontent-type: ${mime || 'application/octet-stream'}\r\n\r\n`;
    const body = new Blob([head, bytes, `\r\n--${boundary}--`]);
    const r = await wsgFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink', { method:'POST', headers:{ 'content-type':`multipart/related; boundary=${boundary}` }, body });
    return { id:r.id, name:r.name, url:r.webViewLink || `https://drive.google.com/file/d/${r.id}/view` };
  },
  async copy(fileId, name, parent) {
    const r = await wsgJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy?supportsAllDrives=true&fields=id,name,webViewLink`, 'POST', { name:wsClip(name, 200), parents:parent ? [parent] : undefined });
    return { id:r.id, name:r.name, url:r.webViewLink || `https://docs.google.com/document/d/${r.id}/edit` };
  },
  /* new content for a file VCR2 created (same link: a data-room link keeps working after a refresh) */
  async update(id, bytes, mime) {
    const r = await wsgFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media&supportsAllDrives=true&fields=id,name,webViewLink`, { method:'PATCH', headers:{ 'content-type':mime || 'application/octet-stream' }, body:new Blob([bytes]) });
    return { id:r.id, name:r.name, url:r.webViewLink || '' };
  },
  /* a Google Doc as PDF bytes */
  async exportPdf(id) {
    const tok = await wsgToken(false);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=application%2Fpdf`, { headers:{ authorization:'Bearer ' + tok }, credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer', redirect:'error' });
    if (!res.ok) throw new Error('Google could not export the PDF (HTTP ' + res.status + ').');
    return new Uint8Array(await res.arrayBuffer());
  },
  async fileInfo(id) { return wsgFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name,mimeType,webViewLink`); },
  async docReplace(docId, pairs) {
    const requests = Object.entries(pairs).map(([k, v]) => ({ replaceAllText:{ containsText:{ text:'{{' + k + '}}', matchCase:true }, replaceText:String(v) } }));
    return wsgJson(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}:batchUpdate`, 'POST', { requests });
  },
  /* the master sheet: headers, values, formula cells and dropdown options of one tab */
  async readSheet(id, tab, headerRow) {
    const meta = await wsgFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=properties.title,sheets.properties(title,sheetId,gridProperties)`);
    const tabs = (meta.sheets || []).map(s => s.properties.title), name = tab && tabs.includes(tab) ? tab : tabs[0];
    const q = `'${name.replace(/'/g, "''")}'!A1:ZZ5000`;
    const g = await wsgFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?ranges=${encodeURIComponent(q)}&includeGridData=true&fields=sheets(data(rowData(values(userEnteredValue,formattedValue,dataValidation))))`);
    const rowData = (((g.sheets || [])[0] || {}).data || [{}])[0].rowData || [];
    const hr = Math.max(1, headerRow || 1), cellV = c => c && c.formattedValue != null ? c.formattedValue : '';
    const headers = ((rowData[hr - 1] || {}).values || []).map(cellV);
    const rows = [], formulas = new Set(), validations = {}, colFormula = {};
    rowData.slice(hr).forEach((r, i) => {
      const vals = (r.values || []);
      rows.push(vals.map(cellV));
      vals.forEach((c, col) => {
        if (c && c.userEnteredValue && c.userEnteredValue.formulaValue != null) { formulas.add(i + ':' + col); colFormula[col] = (colFormula[col] || 0) + 1; }
        const dv = c && c.dataValidation && c.dataValidation.condition;
        if (dv && dv.type === 'ONE_OF_LIST' && !validations[col]) validations[col] = (dv.values || []).map(v => v.userEnteredValue).filter(Boolean).slice(0, 200);
      });
    });
    while (rows.length && rows[rows.length - 1].every(v => v === '')) rows.pop();
    /* a column whose filled cells are mostly formulas is a formula column: new rows will not get a value there either */
    for (const [col, n] of Object.entries(colFormula)) { const filled = rows.filter(r => r[col] !== '' && r[col] != null).length; if (n >= Math.max(1, filled * 0.5)) formulas.add('c' + col); }
    return { id, title:(meta.properties || {}).title || '', tab:name, tabs, headerRow:hr, headers, rows, formulas, validations };
  },
  /* the write plan: cell updates and new rows, in one call; text that could be read as a formula is written as text */
  async writeSheet(id, sheet, plan) {
    const q = c => `'${sheet.tab.replace(/'/g, "''")}'!${c}`, data = [];
    for (const u of plan.updates) data.push({ range:q(u.a1), values:[[u.value]] });
    for (const a of plan.appends) a.values.forEach((v, col) => { if (v !== undefined && v !== '') data.push({ range:q(wsColLetter(col) + (a.row + 1 + sheet.headerRow)), values:[[v]] }); });
    if (!data.length) return 0;
    for (let i = 0; i < data.length; i += 500) await wsgJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`, 'POST', { valueInputOption:'USER_ENTERED', data:data.slice(i, i + 500) });
    return data.length;
  },
  /* Google's own file picker, in its own page (picker.html) so this page keeps its strict policy. The picked items become
     reachable by VCR2 (drive.file); nothing else in the Drive does. */
  async pick(kind, preselect) {
    const tok = await wsgToken(true), state = acctRandom(12);
    const w = window.open('picker.html#' + new URLSearchParams({ state, kind }), 'vcr2-picker', 'popup,width=900,height=640');
    if (!w) throw new Error('Your browser blocked the Google window: allow pop-ups for this site, then try again.');
    const bc = new BroadcastChannel('vcr2-picker');
    const res = await new Promise((ok, no) => {
      const t = setTimeout(() => { bc.close(); no(new Error('The picker was closed.')); }, 600000);
      bc.onmessage = e => {
        const d = e.data || {}; if (d.state !== state) return;
        if (d.ready) bc.postMessage({ state, token:tok, apiKey:wsgCfg().apiKey, appId:wsgCfg().appId, kind, preselect:(preselect || []).slice(0, 20) });
        if (d.picked || d.cancel) { clearTimeout(t); bc.close(); ok(d.picked || []); }
      };
    });
    return res.map(x => ({ id:String(x.id || ''), name:wsClip(x.name, 200), url:/^https:\/\//.test(x.url || '') ? x.url : '', mime:wsClip(x.mimeType, 100) })).filter(x => /^[A-Za-z0-9_-]{10,200}$/.test(x.id));
  },
};
/* Microsoft 365 (OneDrive, SharePoint, Excel): same interface, planned. */
const WSM = { id:'microsoft', name:'Microsoft 365 (coming later)', ready:() => false, connected:() => false };
const wsConnector = ws => ws && ws.storage.provider === 'google' ? WSG : null;
