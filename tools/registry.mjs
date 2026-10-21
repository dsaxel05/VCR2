// Prints the engine's registries as Markdown, straight from the built index.html, so a skill or a reviewer never
// works from a stale list.   node tools/registry.mjs [metrics|checks|thresholds|all]
//   metrics     every derived figure: key, label, unit, scored or shown, inputs it rests on
//   checks      every built-in consistency check: id, title, tolerance and hard limit
//   thresholds  every scored metric: direction, dimension, anchors per stage, and whether a source is listed
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

const el = () => ({ value:'', checked:false, style:{}, dataset:{}, innerHTML:'', textContent:'', className:'', disabled:false, parentNode:{ style:{} },
  classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } }, addEventListener(){}, appendChild(){}, removeChild(){}, remove(){},
  setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; }, querySelector(){ return null; }, querySelectorAll(){ return []; }, focus(){}, setSelectionRange(){} });
const store = {};
globalThis.document = { addEventListener(){}, removeEventListener(){}, getElementById:() => el(), querySelector:() => null, querySelectorAll:() => [],
  createElement:() => el(), body:el(), documentElement:el() };
globalThis.localStorage = { getItem:k => (k in store ? store[k] : null), setItem:(k, v) => { store[k] = String(v); }, removeItem:k => { delete store[k]; } };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.window = globalThis;
globalThis.scrollTo = () => {};
globalThis.confirm = () => true;

const what = process.argv[2] || 'all';
const SRC = String.raw`
const out = [];
const row = a => out.push('| ' + a.join(' | ') + ' |');
const table = (title, head, rows) => { out.push('', '## ' + title, '', '| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'); rows.forEach(row); };
const WHAT = ${JSON.stringify(what)};
if (WHAT === 'all' || WHAT === 'metrics') {
  table('Derived figures (' + Object.keys(BASE.dlabel).length + ')', ['key', 'label', 'unit', 'scored', 'inputs'],
    Object.keys(BASE.dlabel).map(k => { const t = RUBRIC.thresholds[k];
      return [k, BASE.dlabel[k], BASE.dunit[k] || '', t ? (t.dir + ' / ' + t.dim) : 'shown only', (INPUTS_OF[k] || []).join(', ') || '(entered or ledger)']; }));
}
if (WHAT === 'all' || WHAT === 'checks') {
  table('Built-in consistency checks (' + BUILTIN.checks.length + ' families, ' + CHECK_TOLS.length + ' tolerances)', ['id', 'title', 'unit', 'tolerance', 'hard'],
    CHECK_TOLS.map(c => [c.id, c.title, c.unit, c.tol, c.hard == null ? 'none' : c.hard]));
}
if (WHAT === 'all' || WHAT === 'thresholds') {
  const fmt = a => Array.isArray(a) ? a.join(' / ') : (a == null ? 'n/a' : String(a));
  table('Scored metrics and their bars (rubric ' + RUBRIC.version + ', ' + Object.keys(RUBRIC.thresholds).length + ')', ['key', 'dir', 'dim', 'preseed', 'seed', 'a', 'b', 'source listed'],
    Object.keys(RUBRIC.thresholds).map(k => { const t = RUBRIC.thresholds[k], p = provenanceOf(k);
      return t.dir === 'band' ? [k, 'band', t.dim, 'ideal ' + fmt(t.ideal), 'hard ' + fmt(t.hard), '', '', p.refs.length ? p.refs.length + ' ref(s)' : 'calibration only']
        : [k, t.dir, t.dim, fmt(t.preseed), fmt(t.seed), fmt(t.a), fmt(t.b), p.refs.length ? p.refs.length + ' ref(s)' : 'calibration only']; }));
}
console.log(out.join(String.fromCharCode(10)));
`;
(0, eval)(app + '\n;' + SRC);
