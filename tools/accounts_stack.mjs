// Local Supabase stack for the accounts tests (Part B). Needs Docker Desktop running.
//   node tools/accounts_stack.mjs start    start the stack and apply supabase/migrations
//   node tools/accounts_stack.mjs reset    re-apply the migrations on an empty database
//   node tools/accounts_stack.mjs stop     stop it
// The CLI version is pinned. The local keys it prints are the stack's public demo keys;
// this script never prints them, and tests read them at run time only.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const CLI = 'supabase@2.122.0';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Dummy OAuth credentials for the providers switched on in supabase/config.toml for local tests: obviously fake, never sent anywhere real. */
const TEST_ENV = { VCR2_TEST_OAUTH_ID:'vcr2-local-test-client', VCR2_TEST_OAUTH_SECRET:'vcr2-local-test-not-a-secret' };
const run = (args, opts = {}) => execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', CLI, ...args],
  { cwd:root, encoding:'utf8', shell:process.platform === 'win32', env:Object.assign({}, process.env, TEST_ENV),
    stdio:opts.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit', timeout:opts.timeout || 600000 });

/* The running stack's URL and keys, or null when it is not running. Values never leave this process. */
export function stackEnv() {
  let out = '';
  try { out = run(['status', '-o', 'env'], { quiet:true, timeout:60000 }); } catch (e) { return null; }
  const env = {};
  for (const m of out.matchAll(/^([A-Z_]+)="?([^"\r\n]*)"?$/gm)) env[m[1]] = m[2];
  if (!env.API_URL || !(env.ANON_KEY || env.PUBLISHABLE_KEY) || !(env.SERVICE_ROLE_KEY || env.SECRET_KEY)) return null;
  return { url:env.API_URL, anon:env.ANON_KEY || env.PUBLISHABLE_KEY, service:env.SERVICE_ROLE_KEY || env.SECRET_KEY,
    jwtSecret:env.JWT_SECRET || '', inbucket:env.INBUCKET_URL || env.MAILPIT_URL || '' };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cmd = process.argv[2];
  if (cmd === 'start') run(['start']);
  else if (cmd === 'reset') run(['db', 'reset']);
  else if (cmd === 'stop') run(['stop']);
  else if (cmd === 'restart') { run(['stop']); run(['start']); }
  else if (cmd === 'status') { const e = stackEnv(); console.log(e ? 'running at ' + e.url : 'not running'); }
  else console.log('usage: node tools/accounts_stack.mjs start|restart|reset|stop|status');
}
