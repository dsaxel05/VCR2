// Shared harness for the headless test suites (Node, no dependencies).
// Loads the generated index.html, stubs the few DOM and storage calls the app makes at start-up,
// and evaluates the app script together with a suite's test source in one global scope, exactly
// like tests/engine.test.mjs does. A suite calls eq()/ok() and the harness prints the results.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const root = existsSync(join(here, 'index.html')) ? here : join(here, '..');

export function appSource() {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  return html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
}

function installStubs() {
  const el = () => ({ value:'', checked:false, style:{}, dataset:{}, innerHTML:'', textContent:'', className:'', disabled:false,
    parentNode:{ style:{} }, classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, appendChild(){}, removeChild(){}, remove(){}, setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; },
    querySelector(){ return null; }, querySelectorAll(){ return []; }, focus(){}, setSelectionRange(){} });
  const store = {};
  globalThis.document = { addEventListener(){}, removeEventListener(){}, getElementById:() => el(), querySelector:() => null,
    querySelectorAll:() => [], createElement:() => el(), body:el(), documentElement:el() };
  globalThis.localStorage = { getItem:k => (k in store ? store[k] : null), setItem:(k, v) => { store[k] = String(v); }, removeItem:k => { delete store[k]; } };
  globalThis.sessionStorage = globalThis.localStorage;
  globalThis.window = globalThis;
  globalThis.scrollTo = () => {};
  globalThis.confirm = () => true;
}

const PRELUDE = String.raw`
const results = [];
const eq = (name, got, exp, tol) => {
  const ok = tol != null ? Math.abs(got - exp) <= tol : JSON.stringify(got) === JSON.stringify(exp);
  results.push({ name, ok, got, exp });
};
const ok = (name, cond, detail) => results.push({ name, ok: !!cond, got: detail === undefined ? cond : detail, exp: true });
`;

/* Runs a suite. `extra` is prepended to the test source (data the suite needs, as JS source). */
export function runSuite(title, testSource, extra = '') {
  installStubs();
  (0, eval)(appSource() + '\n;' + PRELUDE + extra + '\n' + testSource + '\n;globalThis.__results = results;');
  const res = globalThis.__results;
  let failed = 0;
  console.log(title);
  for (const t of res) {
    if (t.ok) console.log('  ✓', t.name);
    else { failed++; console.log('  ✗', t.name, '— got', JSON.stringify(t.got), 'expected', JSON.stringify(t.exp)); }
  }
  console.log(`\n${res.length - failed}/${res.length} passed`);
  process.exitCode = failed ? 1 : 0;
  return { passed: res.length - failed, failed };
}
