// The workspace tables' security rules, read from the migration itself (supabase/migrations/…_workspaces.sql).
//   node tests/workspaces-sql.test.mjs
// A static check that cannot replace a run against a real database (tools/accounts_stack.mjs, needs Docker), but catches the
// mistakes that would open one investor's data to another: a table without row-level security, a privilege left to anonymous
// visitors, a policy that does not check membership, a security-definer function without a fixed search path.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './_harness.mjs';
const f = readdirSync(join(root, 'supabase', 'migrations')).find(x => /_workspaces\.sql$/.test(x));
const sql = readFileSync(join(root, 'supabase', 'migrations', f), 'utf8').replace(/--[^\n]*/g, '');
const results = []; const ok = (n, c, d) => results.push({ n, ok:!!c, d });
const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map(m => m[1]);
ok('four tables: workspaces, members, invitations, companies', tables.join() === 'workspaces,workspace_members,workspace_invites,ws_companies', tables);
ok('row-level security is on for every table', tables.every(t => new RegExp(`alter table public\\.${t} enable row level security`).test(sql)));
ok('every privilege is taken back from anonymous visitors and the public role first', /revoke all on public\.workspaces, public\.workspace_members, public\.workspace_invites, public\.ws_companies from anon, authenticated, public/.test(sql));
ok('nothing is granted to anonymous visitors', !/grant [^;]* to anon/.test(sql));
const pol = [...sql.matchAll(/create policy (\w+) on public\.(\w+) for (\w+) to (\w+)\s+([^;]+);/g)].map(m => ({ name:m[1], table:m[2], cmd:m[3], role:m[4], body:m[5] }));
ok('every table has at least one policy, all for signed-in users only', tables.every(t => pol.some(p => p.table === t)) && pol.every(p => p.role === 'authenticated'), pol.map(p => p.name));
ok('every policy on members, invitations and companies checks the caller\'s role in that workspace', pol.filter(p => p.table !== 'workspaces' || p.cmd !== 'insert').every(p => /ws_role\((id|workspace_id)\)/.test(p.body) || /user_id = auth\.uid\(\)/.test(p.body)), pol.filter(p => !/ws_role/.test(p.body)).map(p => p.name));
ok('only admins change settings, members and invitations', ['ws_admin_update', 'ws_admin_delete', 'mem_admin_update', 'inv_admin_add', 'inv_admin_delete'].every(n => /= 'admin'/.test((pol.find(p => p.name === n) || {}).body || '')));
ok('a new workspace can only be created for oneself', /ws_create[^;]*created_by = auth\.uid\(\)/.test(sql));
ok('an invitation becomes a membership only for the invited, confirmed address', /email_confirmed_at is not null/.test(sql) && /lower\(i\.email\) = e/.test(sql));
const defs = [...sql.matchAll(/create or replace function public\.(\w+)\([^)]*\)[^$]*?security definer([^$]*?)as \$\$/g)];
ok('every security-definer function fixes its search path', defs.length >= 4 && defs.every(m => /set search_path = ''/.test(m[2])), defs.map(m => m[1]));
ok('function execute rights are not left to the public', /revoke all on function public\.ws_role\(uuid\), public\.ws_accept_invites\(\)[^;]*from public, anon/.test(sql));
ok('a write must carry the next version number (no silent overwrite between team members)', /new\.version <> old\.version \+ 1/.test(sql));
ok('the last admin cannot be removed', /last_admin/.test(sql));
ok('size and count limits are enforced by the database', /pg_column_size\(payload\) < 409600/.test(sql) && /quota_companies/.test(sql));
ok('no deck, no text: the company record has no column for documents', !/(deck|document|text)\s+(bytea|text)/i.test(sql.match(/create table public\.ws_companies[\s\S]*?\);/)[0]));
let failed = 0; console.log('Workspace tables: security rules');
for (const t of results) { if (t.ok) console.log('  ✓', t.n); else { failed++; console.log('  ✗', t.n, '—', JSON.stringify(t.d === undefined ? '' : t.d).slice(0, 300)); } }
console.log(`\n${results.length - failed}/${results.length} passed`); process.exitCode = failed ? 1 : 0;
