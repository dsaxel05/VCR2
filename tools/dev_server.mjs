#!/usr/bin/env node
/*
 * Local preview server for VCR2 (Node, no dependencies).
 *
 * Serves the repository root and rebuilds index.html with build.py whenever a source file is
 * newer than index.html, so the preview always shows the current code. Sends no-cache headers.
 * Works on Windows, macOS and Linux: it finds Python as `python3`, `python` or `py -3`.
 *
 *   node tools/dev_server.mjs --port 8765
 */
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = Number(process.env.PORT || (portArg >= 0 ? args[portArg + 1] : 8765));
const HOST = '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.gif': 'image/gif',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.pdf': 'application/pdf',
};

function sourceDir() { return existsSync(join(ROOT, 'src', 'shell.html')) ? join(ROOT, 'src') : ROOT; }
function newestSource() {
  const dir = sourceDir();
  let newest = statSync(join(ROOT, 'build.py')).mtimeMs;
  for (const f of readdirSync(dir)) {
    if (!/\.(js|css|html)$/.test(f) || f === 'index.html') continue;
    newest = Math.max(newest, statSync(join(dir, f)).mtimeMs);
  }
  return newest;
}

let PY = null;
function findPython() {
  if (PY) return PY;
  const candidates = process.platform === 'win32' ? [['py', ['-3']], ['python', []], ['python3', []]] : [['python3', []], ['python', []]];
  for (const [cmd, pre] of candidates) {
    const r = spawnSync(cmd, [...pre, '--version'], { encoding: 'utf8' });
    if (r.status === 0 && /Python 3/.test((r.stdout || '') + (r.stderr || ''))) { PY = [cmd, pre]; return PY; }
  }
  throw new Error('Python 3 not found (tried python3, python, py -3).');
}

function rebuildIfStale() {
  const out = join(ROOT, 'index.html');
  if (existsSync(out) && statSync(out).mtimeMs >= newestSource()) return null;
  try {
    const [cmd, pre] = findPython();
    const r = spawnSync(cmd, [...pre, 'build.py'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
    if (r.status !== 0) return (r.stderr || r.stdout || 'build failed').trim();
    process.stdout.write((r.stdout || '').trim() + '\n');
    return null;
  } catch (e) { return String(e.message || e); }
}

const server = createServer((req, res) => {
  let path;
  try { path = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]); }
  catch { res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('bad request'); }
  if (path === '/') path = '/index.html';
  if (path === '/index.html') {
    const err = rebuildIfStale();
    if (err) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      return res.end('build.py failed:\n\n' + err);
    }
  }
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(normalize(ROOT + sep)) && file !== normalize(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  try {
    const st = statSync(file);
    if (st.isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('not found');
  }
});

const firstErr = rebuildIfStale();
if (firstErr) console.error(firstErr);
server.listen(PORT, HOST, () => console.log(`VCR2 preview on http://localhost:${PORT}/  (Ctrl+C to stop)`));
