// The 404 page and the daily uptime check (2026-11-02).
//   node tests/site-extras.test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info != null ? ' — ' + JSON.stringify(info).slice(0, 300) : '')); } };
console.log('404 page and daily uptime check');

const p404 = path.join(ROOT, '404.html'), h = fs.readFileSync(p404, 'utf8');
ok('404.html is under 10 KB', fs.statSync(p404).size < 10 * 1024, fs.statSync(p404).size);
ok('its security policy is the first thing in <head> and allows only this site', /^<!doctype html>\s*<html[^>]*>\s*<head>\s*<meta http-equiv="Content-Security-Policy" content="default-src 'none'/i.test(h));
ok('no script and no address on another site', !/<script/i.test(h) && !/(src|href|url)\s*[=(]\s*['"]?https?:/i.test(h));
ok('a link back to the home page', /<a [^>]*href="\/"/.test(h));
ok('not indexed by search engines, with a title and a heading', /name="robots" content="noindex"/.test(h) && /<title>[^<]+<\/title>/.test(h) && /<h1>[^<]+<\/h1>/.test(h));
ok('fonts and logo are this site’s own files, by absolute path (the page answers at any address)', ["/assets/fonts/fraunces-400-normal.woff2", "/assets/logo/svg/seal-compact.svg"].every(f => h.includes(f) && fs.existsSync(path.join(ROOT, f))));

const w = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'uptime.yml'), 'utf8');
ok('the uptime check runs daily and can be run by hand', /schedule:\s*\n\s*- cron: '\d+ \d+ \* \* \*'/.test(w) && /workflow_dispatch/.test(w));
ok('it has no permissions and a time limit', /^permissions: \{\}$/m.test(w) && /timeout-minutes: \d+/.test(w));
ok('it uses no action at all, only curl and openssl', !/^\s*-?\s*uses:/m.test(w) && /curl/.test(w) && /openssl/.test(w));
ok('it checks 200, the certificate (more than 14 days), the About text and the https redirect',
  /test "\$code" = 200/.test(w) && /-gt 14/.test(w) && /Founder of VCR2/.test(w) && /= "https:\/\/vcr2\.app\/"/.test(w));
const st = fs.readFileSync(path.join(ROOT, '.well-known', 'security.txt'), 'utf8');
const exp = Date.parse((st.match(/^Expires: (.+)$/m) || [])[1]);
ok('security.txt has a contact, a policy, its canonical address and an Expires date in the future but under 13 months away',
  /^Contact: mailto:/m.test(st) && /^Policy: https:\/\/github\.com\/dsaxel05\/VCR2\/blob\/main\/SECURITY\.md$/m.test(st) && /^Canonical: https:\/\/vcr2\.app\/\.well-known\/security\.txt$/m.test(st)
  && exp > Date.now() && exp < Date.now() + 400 * 864e5, st);
ok('Jekyll is told to serve the .well-known folder', /include: \[".well-known"\]/.test(fs.readFileSync(path.join(ROOT, '_config.yml'), 'utf8')));
const dep = fs.readFileSync(path.join(ROOT, '.github', 'dependabot.yml'), 'utf8');
ok('Dependabot watches the GitHub Actions weekly', /package-ecosystem: github-actions/.test(dep) && /interval: weekly/.test(dep));
const pub = path.join(ROOT, 'tools', 'public_files.txt');   // the publish list exists in the dev folder only
if (fs.existsSync(pub)) ok('404.html is on the publish list', fs.readFileSync(pub, 'utf8').split(/\r?\n/).includes('404.html'));

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
