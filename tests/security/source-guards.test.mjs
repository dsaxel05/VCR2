// Permanent source guards for the page's script-injection defences (added with the removal of every inline handler).
// They read src/ and the built index.html and fail when any of these comes back:
//   - an inline on...= handler attribute in markup or in an HTML template string
//   - eval(, new Function(, document.write(
//   - an innerHTML / outerHTML / insertAdjacentHTML / parseFromString / new Worker use outside the one Trusted Types helper in src/core.js
//   - a Content-Security-Policy that loosens (script-src-attr not 'none', 'unsafe-inline' / 'unsafe-eval' / 'self' for scripts,
//     no Trusted Types, a connect-src host beyond the documented ones)
//   - a browser storage key that is not in the documented list below
//   - CSP script hashes that differ from the SHA-256 of the inline script blocks in index.html
//   - a data-click / data-change / ... name in the markup that has no entry in the dispatcher (src/actions.js)
//   node tests/security/source-guards.test.mjs        (needs a fresh `python build.py` for the index.html checks)
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? ' — ' + JSON.stringify(info).slice(0, 600) : '')); } };

const srcFiles = fs.readdirSync(path.join(ROOT, 'src')).filter(f => /\.(js|html)$/.test(f)).sort();
const SRC = Object.fromEntries(srcFiles.map(f => ['src/' + f, read('src/' + f)]));
const INDEX = read('index.html');
const ALL = { ...SRC, 'index.html': INDEX };
/* Lines that are only comments carry words like "eval(" on purpose; the built page has no comments, so it is checked whole. */
const codeLines = (name, text) => text.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => name === 'index.html' || !/^\s*(\/\/|\/\*|\*)/.test(l));
const findAll = (re, files = ALL) => {
  const hits = [];
  for (const [name, text] of Object.entries(files)) for (const [n, l] of codeLines(name, text)) if (re.test(l)) hits.push(`${name}:${n}`);
  return hits;
};
const indexScripts = [...INDEX.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

console.log('Source guards');

/* 1. No inline handlers ─ the attribute form (markup, template strings, setAttribute) */
{
  const attr = /[\s"'`]on[a-z]{3,}\s*=\s*(["'\\$`]|[A-Za-z_(])/;
  ok('no inline on...= handler attribute in src/ or index.html', findAll(attr).length === 0, findAll(attr));
  const setAttr = /setAttribute\(\s*['"`]on/i;
  ok('no setAttribute("on...") in src/ or index.html', findAll(setAttr).length === 0, findAll(setAttr));
  const jsUrl = /(href|src|action|formaction)\s*=\s*["'\\]?\s*javascript:/i;
  ok('no javascript: URL in markup', findAll(jsUrl).length === 0, findAll(jsUrl));
  ok('the built page has at most the three known inline <script> blocks, none with attributes', indexScripts.length >= 2 && indexScripts.length <= 3 && !/<script\s+[^>]/.test(INDEX), indexScripts.length);
}

/* 2. No eval, no Function constructor, no document.write */
{
  for (const [label, re] of [['eval(', /(^|[^\w.$])eval\s*\(/], ['new Function(', /new\s+Function\s*\(/], ['document.write(', /document\s*\.\s*write(ln)?\s*\(/]]) {
    const h = findAll(re);
    ok(`no ${label} in src/ or index.html`, h.length === 0, h);
  }
  const strCode = /\b(setTimeout|setInterval)\s*\(\s*["'`]/;
  ok('no setTimeout / setInterval with a string of code', findAll(strCode).length === 0, findAll(strCode));
}

/* 3. HTML sinks only through the one helper in src/core.js */
{
  const sinkRe = { innerHTML: /\.innerHTML\s*\+?=(?!=)/, outerHTML: /\.outerHTML\s*\+?=(?!=)/, insertAdjacentHTML: /insertAdjacentHTML\s*\(/, parseFromString: /parseFromString\s*\(/,
    createContextualFragment: /createContextualFragment\s*\(/, srcdoc: /\.srcdoc\s*=(?!=)|[\s"']srcdoc\s*=/, worker: /new\s+(Shared)?Worker\s*\(/, importScripts: /importScripts\s*\(/ };
  const allowed = { innerHTML: 1, outerHTML: 1, parseFromString: 1, worker: 1 };   // exactly one each, all in core.js, all fed through the policy
  for (const [k, re] of Object.entries(sinkRe)) {
    const inSrc = findAll(re, SRC), want = allowed[k] || 0;
    ok(`${k}: ${want ? 'only the helper in src/core.js' : 'never used'}`, inSrc.length === want && (!want || inSrc[0].startsWith('src/core.js:')), inSrc);
    const inBuilt = findAll(re, { 'index.html': INDEX });
    ok(`${k}: the built page matches the source (${want} use)`, inBuilt.length === want, inBuilt);
  }
  const core = SRC['src/core.js'];
  ok('the helper passes HTML through the vcr2 policy (htmlOf) before innerHTML, outerHTML and the DOMParser', /\.innerHTML\s*=\s*htmlOf\(/.test(core) && /\.outerHTML\s*=\s*htmlOf\(/.test(core) && /parseFromString\(\s*htmlOf\(/.test(core));
  ok("the worker is started only from a blob URL through the policy's createScriptURL", /new Worker\(\s*TT \? TT\.createScriptURL\(/.test(core) && /createScriptURL:\s*u\s*=>\s*\{\s*if \(!\/\^blob:\/\.test\(u\)\)\s*throw/.test(core));
  ok("exactly one Trusted Types policy is created, named 'vcr2'", (core.match(/createPolicy\(/g) || []).length === 1 && /createPolicy\('vcr2'/.test(core) && findAll(/createPolicy\s*\(/, SRC).length === 1);
  const policyNames = [...core.matchAll(/createPolicy\('([^']+)'/g)].map(m => m[1]);
  ok('the policy does not rewrite the string (createHTML returns it unchanged)', /createHTML:\s*s\s*=>\s*s\b/.test(core), policyNames);
  ok('no direct write to location.href / location.assign with a javascript: value (no javascript: anywhere in src)', findAll(/javascript:/i, SRC).length === 0, findAll(/javascript:/i, SRC));
}

/* 4. The Content-Security-Policy cannot loosen */
{
  const parse = html => {
    const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
    const d = {};
    (m ? m[1] : '').split(';').map(s => s.trim()).filter(Boolean).forEach(s => { const [k, ...v] = s.split(/\s+/); d[k] = v; });
    return { found: !!m, d };
  };
  const HOSTS = ["'self'", 'https://api.github.com', 'https://api.anthropic.com', 'https://api.openai.com', 'https://generativelanguage.googleapis.com', 'https://api.groq.com', 'https://openrouter.ai'];
  for (const [label, html] of [['src/shell.html', SRC['src/shell.html']], ['index.html', INDEX]]) {
    const { found, d } = parse(html);
    ok(`${label}: has a Content-Security-Policy meta`, found);
    ok(`${label}: script-src-attr is 'none'`, JSON.stringify(d['script-src-attr']) === JSON.stringify(["'none'"]), d['script-src-attr']);
    for (const dir of ['script-src', 'script-src-elem']) {
      const v = d[dir] || [];
      const loose = v.filter(x => /unsafe-|'self'|\*|^https?:|^data:|^blob:|^file:|strict-dynamic|nonce-/.test(x));
      const onlyHashes = v.length > 0 && v.every(x => label === 'src/shell.html' ? x === '@@SCRIPT_HASHES@@' : /^'sha256-[A-Za-z0-9+/]{43}='$/.test(x));
      ok(`${label}: ${dir} lists only script hashes (no 'unsafe-inline', 'unsafe-eval', 'self' or hosts)`, loose.length === 0 && onlyHashes, v);
    }
    ok(`${label}: require-trusted-types-for 'script'`, JSON.stringify(d['require-trusted-types-for']) === JSON.stringify(["'script'"]), d['require-trusted-types-for']);
    ok(`${label}: trusted-types allows only the vcr2 policy`, JSON.stringify(d['trusted-types']) === JSON.stringify(['vcr2']), d['trusted-types']);
    ok(`${label}: connect-src is the site, GitHub and the five AI hosts, nothing else`, JSON.stringify(d['connect-src']) === JSON.stringify(HOSTS), d['connect-src']);
    ok(`${label}: default-src, object-src, frame-src are 'none', base-uri and form-action 'none'`,
      ['default-src', 'object-src', 'frame-src', 'base-uri', 'form-action'].every(k => JSON.stringify(d[k]) === JSON.stringify(["'none'"])), d);
    ok(`${label}: worker-src is 'self' and blob: only`, JSON.stringify(d['worker-src']) === JSON.stringify(["'self'", 'blob:']), d['worker-src']);
    ok(`${label}: no 'unsafe-eval' or 'wasm-unsafe-eval' anywhere`, !/unsafe-eval/.test(Object.values(d).flat().join(' ')));
  }
  /* 5. The hashes in the CSP are the SHA-256 of the inline script blocks of this build */
  const { d } = parse(INDEX);
  const want = indexScripts.map(b => "'sha256-" + crypto.createHash('sha256').update(b, 'utf8').digest('base64') + "'").sort();
  ok('index.html: script-src-elem hashes equal the SHA-256 of every inline script block', JSON.stringify([...(d['script-src-elem'] || [])].sort()) === JSON.stringify(want), [d['script-src-elem'], want]);
  ok('index.html: script-src hashes equal the SHA-256 of every inline script block', JSON.stringify([...(d['script-src'] || [])].sort()) === JSON.stringify(want), [d['script-src'], want]);
}

/* 6. Browser storage: only the documented keys */
{
  const KEYS = new Set([
    'vcr2-edit-texts', 'vcr2-owner', 'vcr2-studio-base', 'vcr2-studio-draft', 'vcr2-studio-preview',   // Owner Studio
    'vcr3-draft', 'vcr3-draft-meta', 'vcr3-key', 'vcr3-provider', 'vcr3-remember', 'vcr4-memo', 'vcr4-model',   // assessment draft, AI key and model, memo
    'vcr2-library', 'vcr2-calibrate',                                           // library and its calibration switch
    'vcr2-sf-aliases',                                                          // Smart fill labels a visitor taught (this browser only, never published)
    'vcr2-theme', 'vcr2-theme-default', 'vcr2-text', 'vcr2-text-default', 'vcr2-look', 'vcr2-look-style', 'vcr2-sidebar',   // theme, text size, look, sidebar
  ]);
  const OTHER_NAMES = new Set(['vcr2-assessment' /* download file name */, 'vcr2-gh-token' /* only removed: an old Studio token is wiped, never written */, 'vcr2' /* the Trusted Types policy */]);
  const found = new Map();
  for (const [name, text] of Object.entries(ALL)) {
    for (const [n, l] of codeLines(name, text)) for (const m of l.matchAll(/['"`](vcr\d(?:-[a-z0-9]+)*)['"`]/g)) if (!found.has(m[1])) found.set(m[1], `${name}:${n}`);
  }
  const stray = [...found].filter(([k]) => !KEYS.has(k) && !OTHER_NAMES.has(k));
  ok('every vcr*-... string in src/ and index.html is a documented storage key (or a known non-key name)', stray.length === 0, stray);
  const missing = [...KEYS].filter(k => !found.has(k));
  ok('every documented key is still used (the list stays honest)', missing.length === 0, missing);
  /* storage calls must name their key through a documented literal or one of the constants that hold one */
  const dyn = [];
  for (const [name, text] of Object.entries(SRC)) for (const [n, l] of codeLines(name, text)) for (const m of l.matchAll(/(localStorage|sessionStorage)\.(?:get|set|remove)Item\(\s*([^,)]+)/g)) {
    const a = m[2].trim();
    if (!/^'[^']+'$/.test(a) && !/^[A-Z][A-Z_]*$/.test(a) && a !== 'k') dyn.push(`${name}:${n} ${a}`);
  }
  ok('storage calls use a literal, an UPPER_CASE key constant, or the key variable of the two helpers that loop over documented keys', dyn.length === 0, dyn);
  ok('no IndexedDB, cookies or other persistent stores are opened', findAll(/indexedDB\.open|document\.cookie\s*=/).length === 0, findAll(/indexedDB\.open|document\.cookie\s*=/));
}

/* 7. Every action name in the markup exists in the dispatcher (a typo would be a dead button) */
{
  const code = SRC['src/actions.js'];
  /* Run actions.js against a global that answers every name, so the two tables can be read without the rest of the app. */
  const dummy = new Proxy(function () {}, { get: () => dummy, apply: () => dummy });
  const g = new Proxy({}, { has: () => true, get: (_, k) => (k === Symbol.unscopables ? undefined : k in globalThis ? globalThis[k] : dummy) });
  let tables = null, err = null;
  try { tables = vm.runInNewContext(code + '\n;({ CALLS, ACTIONS })', vm.createContext(g)); } catch (e) { err = String(e); }
  ok('src/actions.js loads and defines CALLS and ACTIONS', !!tables, err);
  const names = new Set(tables ? [...Object.keys(tables.CALLS), ...Object.keys(tables.ACTIONS)] : []);
  const used = new Map();
  for (const [name, text] of Object.entries(SRC)) {
    if (name === 'src/actions.js') continue;
    for (const [n, l] of codeLines(name, text)) for (const m of l.matchAll(/data-(click|change|input|keydown|toggle)="([A-Za-z]+)"/g)) used.set(m[1] + ':' + m[2], `${name}:${n}`);
  }
  const unknown = [...used].filter(([k]) => !names.has(k.split(':')[1]));
  ok(`all ${used.size} event/action pairs in the markup are in CALLS or ACTIONS`, unknown.length === 0, unknown);
  const both = tables ? Object.keys(tables.CALLS).filter(k => Object.prototype.hasOwnProperty.call(tables.ACTIONS, k)) : [];
  ok('no name is in both lists', both.length === 0, both);
  const unused = [...names].filter(n => ![...used.keys()].some(k => k.split(':')[1] === n));
  ok('no dead entry in the dispatcher', unused.length === 0, unused);
  ok('the dispatcher never looks a function up on window (no window[...] or globalThis[...])', !/window\s*\[|globalThis\s*\[/.test(code));
  ok('actions.js is listed in build.py before boot.js', /'actions\.js',\s*'boot\.js'/.test(read('build.py')));
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
