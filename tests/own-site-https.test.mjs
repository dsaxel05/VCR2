// Our own site is only ever named over https at https://vcr2.app/ (2026-11-02, after "Enforce HTTPS" was switched on).
// Fails if a published text file names http://vcr2.app, http://www.vcr2.app or the old dsaxel05.github.io address.
// The changelog (history) and the tests (which hold these strings on purpose) are left out.
//   node tests/own-site-https.test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude', 'deliverables', 'tests', '__pycache__']);
const SKIP_PATHS = ['docs/overhaul', 'assets/Claude outputs', 'assets/video'];
const TEXT = /\.(html|js|mjs|json|md|txt|xml|css|yml|yaml|py|svg|vtt|webmanifest)$/i;
const BAD = [/http:\/\/(www\.)?vcr2\.app/i, /dsaxel05\.github\.io/i];
let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + JSON.stringify(info).slice(0, 300) : '')); } };

const hits = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), rel = path.relative(ROOT, p).split(path.sep).join('/');
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !SKIP_PATHS.some(s => rel === s || rel.startsWith(s + '/'))) walk(p); continue; }
    if (!TEXT.test(e.name) || rel === 'CHANGELOG.md') continue;
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => { if (BAD.some(r => r.test(line))) hits.push(`${rel}:${i + 1}`); });
  }
})(ROOT);
console.log('Our own site only over https');
ok('no published file names our site over plain http or at the old github.io address', hits.length === 0, hits);
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8'));
ok('site.json gives https://vcr2.app/', site.url === 'https://vcr2.app/', site.url);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const attr = re => (html.match(re) || [])[1];
ok('the canonical address is https://vcr2.app/', attr(/<link rel="canonical" href="([^"]+)"/) === 'https://vcr2.app/');
for (const tag of ['property="og:image"', 'name="twitter:image"']) {
  const v = attr(new RegExp(`<meta ${tag} content="([^"]+)"`));
  ok(`${tag} is served from https://vcr2.app/`, typeof v === 'string' && v.startsWith('https://vcr2.app/'), v);
}
ok('the page still moves plain http to https by itself (backup)', /location\.protocol === 'http:'/.test(html));
for (const f of ['robots.txt', 'sitemap.xml']) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  ok(`${f} names https://vcr2.app only`, /https:\/\/vcr2\.app\//.test(t) && !/http:\/\//.test(t.replace('http://www.sitemaps.org/schemas/sitemap/0.9', '')));
}
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
