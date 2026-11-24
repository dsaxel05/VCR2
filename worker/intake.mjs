/* VCR2 intake service — a Cloudflare Worker (free plan). Receives what founders send to an investor's workspace and holds it
   until a browser of that workspace reads it:
     - the website form (submit.html, embeddable on the investor's site)  → POST /v1/submit/<formId>
     - e-mails forwarded to the workspace address (Cloudflare Email Routing, catch-all → this Worker)
   Nothing is analysed here: the investor's browser reads, scores and files every item, then deletes it. Items expire after
   14 days anyway. It also relays the integration webhook (signed), stores the weekly digest a browser prepared and sends it,
   and sends the optional founder acknowledgement (off by default; via Resend when RESEND_API_KEY is set).
   Bindings: KV namespace INTAKE. Variables: MAIL_DOMAIN, ALLOWED_ORIGINS (comma separated), MAIL_FROM. Secret: RESEND_API_KEY. */
const TTL = 14 * 86400, MAX_ITEM = 24 * 1024 * 1024, MAX_ITEMS = 500;
const enc = new TextEncoder();
const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', typeof s === 'string' ? enc.encode(s) : s));
const rand = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), x => (x % 36).toString(36)).join('');
const okWs = s => /^[a-z0-9]{8,40}$/.test(s || '');
const okEmail = s => typeof s === 'string' && s.length <= 254 && /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(s);
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);

function cors(req, env) {
  const o = req.headers.get('origin') || '', allowed = String(env.ALLOWED_ORIGINS || 'https://vcr2.app').split(',').map(x => x.trim());
  return allowed.includes(o) ? { 'access-control-allow-origin':o, 'access-control-allow-headers':'authorization, content-type', 'access-control-allow-methods':'GET, POST, DELETE, OPTIONS', 'access-control-max-age':'600', vary:'origin' } : {};
}
const json = (req, env, body, status) => new Response(JSON.stringify(body), { status:status || 200, headers:Object.assign({ 'content-type':'application/json', 'cache-control':'no-store', 'x-content-type-options':'nosniff' }, cors(req, env)) });
const fail = (req, env, status, error) => json(req, env, { error }, status);

async function limit(env, key, max, ttl) {
  const k = 'rl:' + key, n = +(await env.INTAKE.get(k)) || 0;
  if (n >= max) return false;
  await env.INTAKE.put(k, String(n + 1), { expirationTtl:Math.max(60, ttl || 3600) });
  return true;
}
async function wsAuth(req, env, url) {
  const ws = url.searchParams.get('ws'), auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!okWs(ws) || !/^[A-Za-z0-9_-]{32,64}$/.test(auth)) return null;
  const rec = await env.INTAKE.get('ws:' + ws, { type:'json' });
  if (!rec || rec.keyHash !== await sha256(auth)) return null;
  return { ws, rec, key:auth };
}
async function store(env, ws, kind, body, meta) {
  const list = await env.INTAKE.list({ prefix:`in:${ws}:`, limit:MAX_ITEMS });
  if (list.keys.length >= MAX_ITEMS) return null;
  const id = Date.now().toString(36) + rand(8);
  await env.INTAKE.put(`in:${ws}:${id}`, body, { expirationTtl:TTL, metadata:Object.assign({ kind, received:new Date().toISOString() }, meta) });
  return id;
}
async function sendMail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return { ok:false, why:'mail not configured' };
  const r = await fetch('https://api.resend.com/emails', { method:'POST', headers:{ authorization:'Bearer ' + env.RESEND_API_KEY, 'content-type':'application/json' },
    body:JSON.stringify({ from:env.MAIL_FROM, to:Array.isArray(to) ? to : [to], subject:clip(subject, 200), text:clip(text, 20000) }) });
  return { ok:r.ok, status:r.status };
}

async function handle(req, env) {
  const url = new URL(req.url), p = url.pathname;
  if (req.method === 'OPTIONS') return new Response(null, { status:204, headers:cors(req, env) });
  const ip = req.headers.get('cf-connecting-ip') || 'local';

  /* a workspace registers itself: a random id, the hash of its key (the key never reaches this service in clear except to sign) */
  if (p === '/v1/register' && req.method === 'POST') {
    if (!await limit(env, 'reg:' + ip, 10)) return fail(req, env, 429, 'too_many');
    const b = await req.json().catch(() => ({}));
    if (!okWs(b.ws) || !/^[0-9a-f]{64}$/.test(b.keyHash || '')) return fail(req, env, 400, 'bad_request');
    if (await env.INTAKE.get('ws:' + b.ws)) return fail(req, env, 409, 'exists');
    let old = null;
    if (b.oldWs) { old = await env.INTAKE.get('ws:' + b.oldWs, { type:'json' }); if (!old || old.keyHash !== await sha256(String(b.oldKey || ''))) return fail(req, env, 403, 'forbidden'); }
    const local = 'ws-' + rand(10), formId = rand(16), dom = String(env.MAIL_DOMAIN || '').toLowerCase();
    const rec = { keyHash:b.keyHash, name:clip(b.name, 80), local, formId, created:new Date().toISOString(), cfg:old ? old.cfg : { webhook:'', ack:{ on:false, subject:'', text:'' }, digest:{ on:false, day:1 } } };
    await env.INTAKE.put('ws:' + b.ws, JSON.stringify(rec));
    await env.INTAKE.put('addr:' + local, b.ws); await env.INTAKE.put('form:' + formId, b.ws);
    if (old) { await env.INTAKE.delete('addr:' + old.local); await env.INTAKE.delete('form:' + old.formId); await env.INTAKE.delete('ws:' + b.oldWs); }
    return json(req, env, { address:dom ? `${local}@${dom}` : '', formId });
  }
  /* the website form: public, rate-limited, size-limited; the deck is held until the workspace reads it */
  let m = /^\/v1\/form\/([a-z0-9]{8,40})$/.exec(p);
  if (m && req.method === 'GET') { const ws = await env.INTAKE.get('form:' + m[1]); const rec = ws && await env.INTAKE.get('ws:' + ws, { type:'json' }); return rec ? json(req, env, { name:rec.name }) : fail(req, env, 404, 'unknown_form'); }
  m = /^\/v1\/submit\/([a-z0-9]{8,40})$/.exec(p);
  if (m && req.method === 'POST') {
    const ws = await env.INTAKE.get('form:' + m[1]); if (!ws) return fail(req, env, 404, 'unknown_form');
    if (!await limit(env, 'sub:' + ip, 6)) return fail(req, env, 429, 'too_many');
    const len = +(req.headers.get('content-length') || 0); if (len > MAX_ITEM) return fail(req, env, 413, 'too_large');
    const raw = await req.arrayBuffer(); if (raw.byteLength > MAX_ITEM) return fail(req, env, 413, 'too_large');
    let b; try { b = JSON.parse(new TextDecoder().decode(raw)); } catch (e) { return fail(req, env, 400, 'bad_request'); }
    if (b.website_url_confirm) return json(req, env, { ok:true });   /* the honeypot: a bot filled the hidden field */
    const meta = b.meta || {};
    if (!clip(meta.company, 120) || !okEmail(meta.email) || !meta.consent) return fail(req, env, 400, 'missing_fields');
    const files = (Array.isArray(b.files) ? b.files : []).slice(0, 5).filter(f => f && typeof f.b64 === 'string' && /^[A-Za-z0-9+/=]+$/.test(f.b64)).map(f => ({ name:clip(f.name, 120) || 'deck', type:clip(f.type, 100), b64:f.b64 }));
    if (!files.length && !/^https:\/\//.test(meta.deckLink || '')) return fail(req, env, 400, 'no_deck');
    const clean = { meta:{ company:clip(meta.company, 120), founder:clip(meta.founder, 120), email:clip(meta.email, 254), website:clip(meta.website, 200), stage:clip(meta.stage, 20), raise:clip(meta.raise, 40), deckLink:/^https:\/\//.test(meta.deckLink || '') ? clip(meta.deckLink, 400) : '', message:clip(meta.message, 3000) }, files };
    const id = await store(env, ws, 'form', JSON.stringify(clean), { company:clean.meta.company, size:raw.byteLength });
    return id ? json(req, env, { ok:true }) : fail(req, env, 507, 'inbox_full');
  }
  /* everything below needs the workspace key */
  const a = await wsAuth(req, env, url);
  if (p.startsWith('/v1/') && !a) return fail(req, env, 401, 'unauthorized');
  if (p === '/v1/inbox' && req.method === 'GET') {
    const l = await env.INTAKE.list({ prefix:`in:${a.ws}:`, limit:MAX_ITEMS });
    return json(req, env, { items:l.keys.map(k => Object.assign({ id:k.name.split(':')[2] }, k.metadata || {})) });
  }
  m = /^\/v1\/inbox\/([a-z0-9]{6,40})$/.exec(p);
  if (m && req.method === 'GET') { const v = await env.INTAKE.get(`in:${a.ws}:${m[1]}`, { type:'arrayBuffer' }); return v ? new Response(v, { headers:Object.assign({ 'content-type':'application/octet-stream', 'cache-control':'no-store' }, cors(req, env)) }) : fail(req, env, 404, 'gone'); }
  if (m && req.method === 'DELETE') { await env.INTAKE.delete(`in:${a.ws}:${m[1]}`); return json(req, env, { ok:true }); }
  if (p === '/v1/config' && req.method === 'POST') {
    const b = await req.json().catch(() => ({})), ack = b.ack || {}, dg = b.digest || {};
    a.rec.cfg = { webhook:/^https:\/\/[^\s]{4,300}$/.test(b.webhook || '') ? b.webhook : '', ack:{ on:!!ack.on, subject:clip(ack.subject, 120), text:clip(ack.text, 2000) }, digest:{ on:!!dg.on, day:Math.max(0, Math.min(6, +dg.day || 0)) } };
    if (b.name) a.rec.name = clip(b.name, 80);
    await env.INTAKE.put('ws:' + a.ws, JSON.stringify(a.rec));
    return json(req, env, { ok:true });
  }
  /* the webhook, signed with the workspace key: X-VCR2-Signature: sha256=<hex HMAC of the body> */
  if (p === '/v1/hook' && req.method === 'POST') {
    const to = a.rec.cfg && a.rec.cfg.webhook; if (!to) return fail(req, env, 409, 'no_webhook');
    if (!await limit(env, 'hook:' + a.ws, 2000, 86400)) return fail(req, env, 429, 'too_many');
    const body = await req.text(); if (body.length > 400000) return fail(req, env, 413, 'too_large');
    const k = await crypto.subtle.importKey('raw', enc.encode(a.key), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
    const sig = hex(await crypto.subtle.sign('HMAC', k, enc.encode(body)));
    const r = await fetch(to, { method:'POST', headers:{ 'content-type':'application/json', 'x-vcr2-signature':'sha256=' + sig, 'user-agent':'VCR2-webhook/1' }, body, redirect:'manual' }).catch(() => null);
    return json(req, env, { ok:!!(r && r.ok), status:r ? r.status : 0 });
  }
  /* the founder acknowledgement: only when the workspace switched it on, once per address, at most 100 a day */
  if (p === '/v1/ack' && req.method === 'POST') {
    const b = await req.json().catch(() => ({})), c = a.rec.cfg && a.rec.cfg.ack;
    if (!c || !c.on || !c.text) return fail(req, env, 409, 'ack_off');
    if (!okEmail(b.to)) return fail(req, env, 400, 'bad_address');
    const once = 'ackto:' + a.ws + ':' + await sha256(String(b.to).toLowerCase());
    if (await env.INTAKE.get(once)) return json(req, env, { ok:true, already:true });
    if (!await limit(env, 'ack:' + a.ws, 100, 86400)) return fail(req, env, 429, 'too_many');
    const r = await sendMail(env, b.to, c.subject || 'We received your deck', c.text);
    if (r.ok) await env.INTAKE.put(once, '1', { expirationTtl:365 * 86400 });
    return json(req, env, r, r.ok ? 200 : 502);
  }
  /* the weekly digest prepared by a browser of the workspace; sent by the scheduled run on the chosen day */
  if (p === '/v1/digest' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const to = (Array.isArray(b.to) ? b.to : []).filter(okEmail).slice(0, 50);
    await env.INTAKE.put('digest:' + a.ws, JSON.stringify({ subject:clip(b.subject, 200), text:clip(b.text, 20000), to, at:new Date().toISOString() }), { expirationTtl:60 * 86400 });
    return json(req, env, { ok:true });
  }
  return fail(req, env, 404, 'not_found');
}

/* an e-mail forwarded to <workspace address>@MAIL_DOMAIN: kept as it came (the deck inside), for the workspace to read */
async function email(message, env) {
  const local = String(message.to || '').toLowerCase().split('@')[0], ws = /^ws-[a-z0-9]{10}$/.test(local) ? await env.INTAKE.get('addr:' + local) : null;
  if (!ws) { message.setReject('Unknown address'); return; }
  if (message.rawSize > MAX_ITEM) { message.setReject('Message too large (24 MB at most)'); return; }
  const subject = clip(message.headers && message.headers.get('subject'), 200);
  const id = await store(env, ws, 'email', message.raw, { from:clip(message.from, 254), subject, size:message.rawSize });
  if (!id) message.setReject('This workspace inbox is full');
}

/* every day: send the digests whose day it is (UTC), with the number of items still waiting in the inbox */
async function scheduled(event, env) {
  const day = new Date(event && event.scheduledTime || Date.now()).getUTCDay(), date = new Date(event && event.scheduledTime || Date.now()).toISOString().slice(0, 10);
  let cursor; let sent = 0;
  do {
    const l = await env.INTAKE.list({ prefix:'ws:', cursor }); cursor = l.list_complete ? null : l.cursor;
    for (const k of l.keys) {
      const ws = k.name.slice(3), rec = await env.INTAKE.get(k.name, { type:'json' });
      if (!rec || !rec.cfg || !rec.cfg.digest || !rec.cfg.digest.on || rec.cfg.digest.day !== day) continue;
      if (await env.INTAKE.get(`sent:${ws}:${date}`)) continue;
      const d = await env.INTAKE.get('digest:' + ws, { type:'json' }); if (!d || !d.to.length) continue;
      const waiting = (await env.INTAKE.list({ prefix:`in:${ws}:`, limit:MAX_ITEMS })).keys.length;
      const text = d.text + (waiting ? `\n\n${waiting} submission${waiting === 1 ? '' : 's'} waiting in the inbox: open Deal flow to read ${waiting === 1 ? 'it' : 'them'}.` : '') + `\n\n(List prepared ${d.at.slice(0, 10)} by your team's last visit to Deal flow.)`;
      const r = await sendMail(env, d.to, d.subject, text);
      if (r.ok) { sent++; await env.INTAKE.put(`sent:${ws}:${date}`, '1', { expirationTtl:8 * 86400 }); }
    }
  } while (cursor);
  return sent;
}

export default {
  fetch:(req, env) => handle(req, env).catch(() => fail(req, env, 500, 'error')),
  email,
  scheduled,
};
export { handle, email, scheduled };
