// Security round 3 (audit of 2026-10-25): repository and branch names, and the formula interpreter under hostile input
//   node tests/security-round3.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
{
/* The Studio's token may only ever reach this one repository: names are plain, never a path or a dot step. */
const n = c => normalizeConfig(c);
eq('a plain owner and repository are kept', [n({ owner:'dsaxel05', repo:'VCR2' }).owner, n({ owner:'dsaxel05', repo:'VCR2' }).repo], ['dsaxel05', 'VCR2']);
eq('a repository name with dots inside is kept', n({ repo:'my.site-v2_x' }).repo, 'my.site-v2_x');
['..', '.', '...', 'a/b', '../x', 'x?y', 'x#y', 'x y', '%2e%2e', '<x>'].forEach(v => {
  eq('repository name refused: ' + v, n({ repo:v }).repo, null);
  eq('owner name refused: ' + v, n({ owner:v }).owner, null);
});
eq('a branch with slashes is kept', n({ branch:'release/v5' }).branch, 'release/v5');
['../main', 'a/../b', '/main', 'main/', 'a/./b', '..', '.', 'a b', 'x?ref=y'].forEach(v => eq('branch refused: ' + v, n({ branch:v }).branch, 'main'));
CFG_PUBLISHED = Object.assign(EMPTY_CONFIG(), { owner:'..', repo:'..' });
const t = repoTarget();
eq('the Studio target ignores dot-only names and keeps the built-in repository', [t.owner, t.repo], ['dsaxel05', 'VCR2']);
CFG_PUBLISHED = EMPTY_CONFIG();

/* Formulas reach numbers and text of the assessment only: no object, property, call or code. */
const D = { arr_now:1000, burn:10 };
['constructor', '__proto__', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', 'globalThis', 'window', 'self', 'this', 'eval', 'Function',
 'fetch', 'localStorage', 'sessionStorage', 'document', 'S', 'CFG', 'ST', 'process', 'require'].forEach(w => {
  const r = fxRun(w, D);
  ok('a name never yields an object or a function: ' + w, r === null, r);
});
['constructor(1)', 'eval(1)', 'Function(1)', 'fetch(1)', 'alert(1)', 'toString()', 'hasOwnProperty(1)', '__proto__(1)', 'valueOf()', 'setTimeout(1)']
  .forEach(f => ok('only the listed functions can be called: ' + f, !fxCompile(f).ok, fxCompile(f)));
['arr_now.constructor', 'arr_now["constructor"]', 'arr_now[0]', '{}', '[]', String.fromCharCode(96) + 'x' + String.fromCharCode(96), 'a => 1', 'a; b', 'new x', 'x ? y : z', '#x', '@x', '$x', '\\x']
  .forEach(f => ok('no property access, assignment, template or statement: ' + f, !fxCompile(f).ok, fxCompile(f)));
eq('deep nesting is evaluated, not a crash', fxRun('('.repeat(400) + '1' + ')'.repeat(400), D), 1);
eq('a long chain of signs is evaluated', fxRun('-'.repeat(998) + '1', D), 1);
eq('an overflowing power gives no value, not infinity', fxRun('10^400', D), null);
eq('a division by zero gives no value', fxRun('arr_now / 0', D), null);
ok('a result is always a number, a text or nothing', [fxRun('arr_now * 2', D), fxRun("'x'", D), fxRun('missing_field', D), fxRun('max(1, 2, 3)', D)]
  .every(v => v === null || typeof v === 'number' || typeof v === 'string'));
eq('a single = compares, it never assigns', [fxRun('arr_now = 1000', D), fxRun('arr_now = 5', D), D.arr_now], [1, 0, 1000]);
eq('text is compared, never run', fxRun("'alert(1)' == 'ALERT(1)'", D), 1);
}
`;

runSuite('Security round 3: repository names and the formula interpreter under hostile input', TESTS);
