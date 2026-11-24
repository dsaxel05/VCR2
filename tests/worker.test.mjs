// The intake service (worker/intake.mjs), with an in-memory KV, a fake mail service and a fake webhook receiver.
//   node tests/worker.test.mjs
// Covers: workspace registration, the public form (limits, honeypot, required fields), forwarded e-mails (known and unknown
// addresses), reading and deleting items with and without the workspace key, isolation between two workspaces, the signed
// webhook, the founder acknowledgement (off by default, once per address), the weekly digest.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { root } from './_harness.mjs';
const W = await import('file:///' + join(root, 'worker', 'intake.mjs').replace(/\\/g, '/'));

const results = []; const ok = (name, cond, detail) => results.push({ name, ok:!!cond, detail });
class KV {
  constructor() { this.m = new Map(); }
  async get(k, o) { const e = this.m.get(k); if (!e) return null; const t = typeof o === 'string' ? o : o && o.type; if (t === 'json') return JSON.parse(new TextDecoder().decode(e.v)); if (t === 'arrayBuffer') return e.v.buffer.slice(e.v.byteOffset, e.v.byteOffset + e.v.byteLength); return new TextDecoder().decode(e.v); }
  async put(k, v, o) { let b; if (typeof v === 'string') b = new TextEncoder().encode(v); else if (v instanceof ArrayBuffer) b = new Uint8Array(v); else if (v instanceof Uint8Array) b = v; else { const chunks = []; const r = v.getReader(); for (;;) { const x = await r.read(); if (x.done) break; chunks.push(x.value); } b = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let i = 0; for (const c of chunks) { b.set(c, i); i += c.length; } } this.m.set(k, { v:b, meta:o && o.metadata, ttl:o && o.expirationTtl }); }
  async delete(k) { this.m.delete(k); }
  async list(o) { const keys = [...this.m.keys()].filter(k => k.startsWith(o.prefix || '')).sort().slice(0, o.limit || 1000).map(name => ({ name, metadata:this.m.get(name).meta })); return { keys, list_complete:true }; }
}
const sent = [], hooks = [];
globalThis.fetch = async (url, o) => {
  if (String(url).startsWith('https://api.resend.com/')) { sent.push(JSON.parse(o.body)); return new Response('{"id":"x"}', { status:200 }); }
  if (String(url).startsWith('https://hooks.example.com/')) { hooks.push({ url, headers:o.headers, body:o.body }); return new Response('ok', { status:200 }); }
  return new Response('no', { status:404 });
};
const env = { INTAKE:new KV(), MAIL_DOMAIN:'vcr2.test', ALLOWED_ORIGINS:'https://vcr2.app', MAIL_FROM:'VCR2 <noreply@vcr2.test>', RESEND_API_KEY:'re_test_not_a_real_key' };
const call = async (method, path, body, headers, ip) => {
  const h = Object.assign({ origin:'https://vcr2.app', 'cf-connecting-ip':ip || '1.1.1.1' }, headers || {});
  if (body && typeof body !== 'string') { body = JSON.stringify(body); h['content-type'] = 'application/json'; }
  const r = await W.default.fetch(new Request('https://intake.vcr2.test' + path, { method, headers:h, body }), env);
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status:r.status, json:j, text:t, headers:r.headers };
};
const sha = s => createHash('sha256').update(s).digest('hex');

/* two workspaces */
const keyA = 'A'.repeat(20) + 'kA_' + 'x'.repeat(20), keyB = 'B'.repeat(20) + 'kB_' + 'y'.repeat(20);
const ra = await call('POST', '/v1/register', { ws:'wsaaaaaaaa', keyHash:sha(keyA), name:'Fund A' });
const rb = await call('POST', '/v1/register', { ws:'wsbbbbbbbb', keyHash:sha(keyB), name:'Fund B' }, null, '2.2.2.2');
ok('a workspace registers and gets its own address and form', ra.status === 200 && /^ws-[a-z0-9]{10}@vcr2\.test$/.test(ra.json.address) && /^[a-z0-9]{16}$/.test(ra.json.formId), ra.json);
ok('the same workspace id cannot be taken twice', (await call('POST', '/v1/register', { ws:'wsaaaaaaaa', keyHash:sha('other') })).status === 409);
ok('the key itself is never stored, only its hash', ![...env.INTAKE.m.values()].some(e => new TextDecoder().decode(e.v).includes(keyA)));
ok('the browser origin of the site is allowed, another origin gets no CORS header', ra.headers.get('access-control-allow-origin') === 'https://vcr2.app' && !(await W.default.fetch(new Request('https://intake.vcr2.test/v1/form/' + ra.json.formId, { headers:{ origin:'https://evil.example' } }), env)).headers.get('access-control-allow-origin'));
ok('the form tells its workspace name', (await call('GET', '/v1/form/' + ra.json.formId)).json.name === 'Fund A');

/* the website form */
const deck = Buffer.from(readFileSync(join(root, 'tests', 'fixtures', 'workspaces', 'decks', 'arifal-pitch.pptx'))).toString('base64');
const form = (over, ip) => call('POST', '/v1/submit/' + ra.json.formId, Object.assign({ meta:{ company:'Arifal', founder:'Lena V', email:'lena@arifal.io', consent:true }, files:[{ name:'arifal.pptx', type:'application/vnd.openxmlformats-officedocument.presentationml.presentation', b64:deck }] }, over || {}), null, ip);
ok('a founder submits a deck through the form', (await form()).status === 200);
ok('the company, a valid e-mail and the consent are required', (await form({ meta:{ company:'', email:'x', consent:false } }, '3.3.3.3')).status === 400);
ok('a deck file or a link is required', (await form({ files:[] }, '3.3.3.4')).status === 400);
ok('a bot that fills the hidden field is ignored silently', (await form({ website_url_confirm:'spam' }, '3.3.3.5')).status === 200);
let lim = 0; for (let i = 0; i < 8; i++) if ((await form(null, '9.9.9.9')).status === 429) lim++;
ok('one network sends at most 6 submissions an hour', lim === 2, lim);
ok('an unknown form link is refused', (await call('POST', '/v1/submit/zzzzzzzzzzzz', {})).status === 404);

/* forwarded e-mails */
const raw = readFileSync(join(root, 'tests', 'fixtures', 'workspaces', 'email', readFileSync(join(root, 'tests', 'fixtures', 'workspaces', 'plan.json'), 'utf8').match(/email\/([a-z-]+\.eml)/)[1]));
const mail = to => { let rej = ''; return { m:{ to, from:'partner@fund.example', rawSize:raw.length, headers:new Headers({ subject:'Fwd: deck' }), raw:new Response(raw).body, setReject:r => { rej = r; } }, rej:() => rej }; };
const m1 = mail(ra.json.address); await W.default.email(m1.m, env);
ok('an e-mail to the workspace address is kept for the workspace', !m1.rej());
const m2 = mail('ws-unknown000@vcr2.test'); await W.default.email(m2.m, env);
ok('an e-mail to an unknown address is rejected', /Unknown/.test(m2.rej()));

/* reading the inbox */
const A = { authorization:'Bearer ' + keyA }, B = { authorization:'Bearer ' + keyB };
const la = await call('GET', '/v1/inbox?ws=wsaaaaaaaa', null, A);
ok('the workspace lists its items: forms and e-mails', la.status === 200 && la.json.items.filter(i => i.kind === 'form').length === 7 && la.json.items.filter(i => i.kind === 'email').length === 1, la.json);
ok('without the key, nothing is listed', (await call('GET', '/v1/inbox?ws=wsaaaaaaaa')).status === 401);
ok('another workspace\'s key cannot read it', (await call('GET', '/v1/inbox?ws=wsaaaaaaaa', null, B)).status === 401);
ok('workspace B sees only its own (empty) inbox', (await call('GET', '/v1/inbox?ws=wsbbbbbbbb', null, B)).json.items.length === 0);
const em = la.json.items.find(i => i.kind === 'email'), body = await call('GET', '/v1/inbox/' + em.id + '?ws=wsaaaaaaaa', null, A);
ok('an e-mail comes back byte for byte', body.text === raw.toString('utf8'));
ok('B cannot fetch A\'s item even with its id', (await call('GET', '/v1/inbox/' + em.id + '?ws=wsbbbbbbbb', null, B)).status === 404);
await call('DELETE', '/v1/inbox/' + em.id + '?ws=wsaaaaaaaa', null, A);
ok('a read item is deleted from the service', (await call('GET', '/v1/inbox?ws=wsaaaaaaaa', null, A)).json.items.length === 7);
ok('items expire after 14 days anyway', [...env.INTAKE.m.entries()].filter(([k]) => k.startsWith('in:')).every(([, e]) => e.ttl === 14 * 86400));

/* webhook, acknowledgement, digest */
ok('without a webhook set, nothing is relayed', (await call('POST', '/v1/hook?ws=wsaaaaaaaa', { event:'x' }, A)).status === 409);
await call('POST', '/v1/config?ws=wsaaaaaaaa', { webhook:'https://hooks.example.com/vcr2', ack:{ on:false, subject:'Thanks', text:'We received your deck.' }, digest:{ on:true, day:1 } }, A);
const hk = await call('POST', '/v1/hook?ws=wsaaaaaaaa', '{"event":"company.created","data":{"company":"Arifal"}}', Object.assign({ 'content-type':'application/json' }, A));
const sig = 'sha256=' + createHmac('sha256', keyA).update('{"event":"company.created","data":{"company":"Arifal"}}').digest('hex');
ok('the webhook is relayed with an HMAC signature the receiver can check', hk.json.ok && hooks.length === 1 && hooks[0].headers['x-vcr2-signature'] === sig);
ok('the acknowledgement is off by default: nothing is sent', (await call('POST', '/v1/ack?ws=wsaaaaaaaa', { to:'lena@arifal.io' }, A)).status === 409 && sent.length === 0);
await call('POST', '/v1/config?ws=wsaaaaaaaa', { webhook:'https://hooks.example.com/vcr2', ack:{ on:true, subject:'Thanks', text:'We received your deck.' }, digest:{ on:true, day:1 } }, A);
const k1 = await call('POST', '/v1/ack?ws=wsaaaaaaaa', { to:'lena@arifal.io' }, A), k2 = await call('POST', '/v1/ack?ws=wsaaaaaaaa', { to:'Lena@Arifal.io' }, A);
ok('switched on, the founder receives the investor\'s text once, never twice', k1.status === 200 && k2.json.already && sent.length === 1 && sent[0].text === 'We received your deck.' && sent[0].to[0] === 'lena@arifal.io');
await call('POST', '/v1/digest?ws=wsaaaaaaaa', { subject:'Fund A: 2 overdue', text:'Overdue:\n- Arifal', to:['partner@fund.example', 'not an address'] }, A);
const monday = Date.parse('2026-11-23T07:00:00Z'), n1 = await W.default.scheduled({ scheduledTime:monday }, env), n2 = await W.default.scheduled({ scheduledTime:monday }, env);
ok('the weekly digest goes out on the chosen day to the team, once, with the inbox count', n1 === 1 && n2 === 0 && sent[1].to.join() === 'partner@fund.example' && /7 submissions waiting/.test(sent[1].text), sent[1]);
ok('another day, no digest', (await W.default.scheduled({ scheduledTime:Date.parse('2026-11-24T07:00:00Z') }, env)) === 0);
/* rotating the address */
const rot = await call('POST', '/v1/register', { ws:'wsaaaaaaa2', keyHash:sha(keyA + '2'), name:'Fund A', oldWs:'wsaaaaaaaa', oldKey:keyA }, null, '4.4.4.4');
const m3 = mail(ra.json.address); await W.default.email(m3.m, env);
ok('after a change of address the old address stops working', rot.status === 200 && rot.json.address !== ra.json.address && /Unknown/.test(m3.rej()));
ok('a change of address needs the old key', (await call('POST', '/v1/register', { ws:'wsaaaaaaa3', keyHash:sha('z'), oldWs:'wsbbbbbbbb', oldKey:'wrong-key-wrong-key-wrong-key-wrong' }, null, '5.5.5.5')).status === 403);

let failed = 0; console.log('Intake service (worker)');
for (const t of results) { if (t.ok) console.log('  ✓', t.name); else { failed++; console.log('  ✗', t.name, '—', JSON.stringify(t.detail === undefined ? '' : t.detail).slice(0, 300)); } }
console.log(`\n${results.length - failed}/${results.length} passed`); process.exitCode = failed ? 1 : 0;
