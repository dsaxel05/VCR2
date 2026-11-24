/* ═══════════════════════════════════════════════════════════════
   WORKSPACE STORE — where a workspace and its companies are kept.
   Signed in: the team's Supabase project (row-level security by membership, supabase/migrations/…_workspaces.sql).
   Not signed in: this browser only (IndexedDB), for one person trying it out. Same interface both ways.
   ═══════════════════════════════════════════════════════════════ */
const WS_DB = 'vcr2-workspaces';
function wsIdb() {
  return new Promise((ok, no) => {
    if (typeof indexedDB === 'undefined') { no(new Error('no_idb')); return; }
    const r = indexedDB.open(WS_DB, 1);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('ws')) db.createObjectStore('ws', { keyPath:'id' }); if (!db.objectStoreNames.contains('co')) { const s = db.createObjectStore('co', { keyPath:['ws', 'id'] }); s.createIndex('ws', 'ws'); } };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error || new Error('idb'));
  });
}
async function wsIdbDo(store, mode, fn) {
  const db = await wsIdb();
  return new Promise((ok, no) => { const tx = db.transaction(store, mode), s = tx.objectStore(store); let out; Promise.resolve(fn(s)).then(v => { out = v; }); tx.oncomplete = () => { db.close(); ok(out); }; tx.onerror = () => { db.close(); no(tx.error); }; });
}
const wsReq = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });

const WSS_LOCAL = {
  mode:'local',
  async workspaces() { return (await wsIdbDo('ws', 'readonly', s => wsReq(s.getAll()))).map(r => ({ id:r.id, name:r.ws.name, role:'admin', settings:wsNormalize(r.ws), version:r.version || 1 })); },
  async createWorkspace(ws) { const id = 'local-' + wsNewId(); const w = wsNormalize(Object.assign({}, ws, { id:id.slice(0, 48) })); await wsIdbDo('ws', 'readwrite', s => wsReq(s.put({ id:w.id, ws:w, version:1 }))); return { id:w.id, name:w.name, role:'admin', settings:w, version:1 }; },
  async saveWorkspace(id, ws, version) { const w = wsNormalize(Object.assign({}, ws, { id })); await wsIdbDo('ws', 'readwrite', s => wsReq(s.put({ id, ws:w, version:(version || 1) + 1 }))); return (version || 1) + 1; },
  async deleteWorkspace(id) { await wsIdbDo('co', 'readwrite', async s => { const keys = await wsReq(s.index('ws').getAllKeys(id)); for (const k of keys) await wsReq(s.delete(k)); }); await wsIdbDo('ws', 'readwrite', s => wsReq(s.delete(id))); },
  async companies(wsId) { return (await wsIdbDo('co', 'readonly', s => wsReq(s.index('ws').getAll(wsId)))).map(r => Object.assign(r.payload, { _v:r.version || 1 })); },
  async saveCompany(wsId, c) { const v = (c._v || 0) + 1, p = Object.assign({}, c); delete p._v; await wsIdbDo('co', 'readwrite', s => wsReq(s.put({ ws:wsId, id:c.id, payload:p, version:v }))); c._v = v; return v; },
  async deleteCompany(wsId, id) { await wsIdbDo('co', 'readwrite', s => wsReq(s.delete([wsId, id]))); },
  async members() { return [{ email:'you (this browser)', role:'admin', you:true }]; },
  async invites() { return []; },
  async invite() { throw Object.assign(new Error('Sign in to invite your team.'), { code:'local' }); },
  async removeMember() {}, async removeInvite() {}, async acceptInvites() { return 0; },
};

/* Supabase (PostgREST) through the account module's guarded fetch: only the project the visitor signed in with */
const wsCloud = async (path, o) => { acctArm(); const s = acctSession(); if (!s) throw acctErr('signed_out'); const tok = await acctToken(); return acctFetch(acctRegion(s.region), path, Object.assign({ token:tok }, o || {})); };
const WSS_CLOUD = {
  mode:'cloud',
  async workspaces() {
    const s = acctSession(), me = s && s.user && s.user.id;
    const rows = await wsCloud('/rest/v1/workspaces?select=id,name,settings,version,workspace_members(user_id,role)&order=created_at.asc');
    return (rows || []).map(r => ({ id:r.id, name:r.name, role:((r.workspace_members || []).find(m => m.user_id === me) || {}).role || 'member', settings:wsNormalize(Object.assign({}, r.settings, { id:String(r.id).slice(0, 36).replace(/[^a-z0-9-]/g, ''), name:r.name })), version:r.version }));
  },
  async createWorkspace(ws) {
    const w = wsNormalize(ws);
    const r = await wsCloud('/rest/v1/workspaces?select=id,name,settings,version', { method:'POST', headers:{ prefer:'return=representation' }, body:{ name:w.name, settings:w } });
    const row = r[0]; return { id:row.id, name:row.name, role:'admin', settings:wsNormalize(Object.assign({}, row.settings, { id:row.id, name:row.name })), version:row.version };
  },
  async saveWorkspace(id, ws, version) {
    const w = wsNormalize(ws);
    const r = await wsCloud(`/rest/v1/workspaces?id=eq.${encodeURIComponent(id)}&version=eq.${version}&select=version`, { method:'PATCH', headers:{ prefer:'return=representation' }, body:{ name:w.name, settings:w, version:version + 1 } });
    if (!r || !r.length) throw acctErr('version_conflict');
    return r[0].version;
  },
  async deleteWorkspace(id) { await wsCloud(`/rest/v1/workspaces?id=eq.${encodeURIComponent(id)}`, { method:'DELETE' }); },
  async companies(wsId) {
    const out = []; let from = 0;
    for (;;) {
      const rows = await wsCloud(`/rest/v1/ws_companies?workspace_id=eq.${encodeURIComponent(wsId)}&select=id,payload,version&order=id.asc`, { headers:{ range:`${from}-${from + 499}` } });
      (rows || []).forEach(r => out.push(Object.assign(r.payload, { id:r.id, _v:r.version })));
      if (!rows || rows.length < 500) break; from += 500;
    }
    return out;
  },
  async saveCompany(wsId, c) {
    const p = Object.assign({}, c); delete p._v;
    if (!c._v) {
      const r = await wsCloud('/rest/v1/ws_companies?select=version', { method:'POST', headers:{ prefer:'return=representation' }, body:{ workspace_id:wsId, id:c.id, payload:p, status:wsClip(c.status, 60), version:1 } });
      c._v = r[0].version; return c._v;
    }
    const r = await wsCloud(`/rest/v1/ws_companies?workspace_id=eq.${encodeURIComponent(wsId)}&id=eq.${encodeURIComponent(c.id)}&version=eq.${c._v}&select=version`, { method:'PATCH', headers:{ prefer:'return=representation' }, body:{ payload:p, status:wsClip(c.status, 60), version:c._v + 1 } });
    if (!r || !r.length) throw acctErr('version_conflict');
    c._v = r[0].version; return c._v;
  },
  async deleteCompany(wsId, id) { await wsCloud(`/rest/v1/ws_companies?workspace_id=eq.${encodeURIComponent(wsId)}&id=eq.${encodeURIComponent(id)}`, { method:'DELETE' }); },
  async members(wsId) { const s = acctSession(); return ((await wsCloud(`/rest/v1/workspace_members?workspace_id=eq.${encodeURIComponent(wsId)}&select=user_id,email,role`)) || []).map(m => Object.assign(m, { you:s && s.user && m.user_id === s.user.id })); },
  async invites(wsId) { try { return (await wsCloud(`/rest/v1/workspace_invites?workspace_id=eq.${encodeURIComponent(wsId)}&select=email,role,created_at`)) || []; } catch (e) { return []; } },
  async invite(wsId, email, role) { await wsCloud('/rest/v1/workspace_invites', { method:'POST', body:{ workspace_id:wsId, email:String(email).trim().toLowerCase(), role:role === 'admin' ? 'admin' : 'member' } }); },
  async removeMember(wsId, userId) { await wsCloud(`/rest/v1/workspace_members?workspace_id=eq.${encodeURIComponent(wsId)}&user_id=eq.${encodeURIComponent(userId)}`, { method:'DELETE' }); },
  async removeInvite(wsId, email) { await wsCloud(`/rest/v1/workspace_invites?workspace_id=eq.${encodeURIComponent(wsId)}&email=eq.${encodeURIComponent(email)}`, { method:'DELETE' }); },
  async acceptInvites() { return +(await wsCloud('/rest/v1/rpc/ws_accept_invites', { method:'POST', body:{} })) || 0; },
};
/* team workspaces need the workspace tables in the account projects (site.json workspaces.teams, set once they are created) */
const wssFor = () => (WS_SITE.teams && typeof acctSession === 'function' && acctSession() ? WSS_CLOUD : WSS_LOCAL);
