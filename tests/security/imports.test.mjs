// Re-test findings (2026-11): imported files cannot forge evidence, poison a draft, or stall the page.
//   node tests/security/imports.test.mjs
import { runSuite } from '../_harness.mjs';

const TESTS = String.raw`
const LF = String.fromCharCode(10);
const timed = f => { const t = Date.now(); const r = f(); return { r, ms: Date.now() - t }; };
const LCSV = 'customer,2025-01,2025-02,2025-03' + LF + 'A,10,10,10' + LF + 'B,20,20,20' + LF + 'C,30,30,30' + LF;

/* 1. "from the ledger" is kept only when the ledger parses and the field is one the ledger fills. */
{
  const L = { src:'ledger', line:'x' };
  restorePayload({ prov:{ arr_now:L }, ledger:{ csv:'not a ledger at all' } });
  ok('P1 a ledger claim with an unreadable ledger is dropped', !S.prov.arr_now, JSON.stringify(S.prov));
  const real = String(Math.round(ledgerPrimitives(ledgerAnalytics(parseLedger(LCSV, 'mrr').ledger)).arr_now));
  restorePayload({ vals:{ arr_now:real }, prov:{ arr_now:L, cash_on_hand:L }, ledger:{ csv:LCSV } });
  ok('P1 a claim on a field the ledger fills, with the ledger figure, is kept', !!S.prov.arr_now, [real, JSON.stringify(S.prov)]);
  ok('P1 a claim on a field the ledger does not fill is dropped', !S.prov.cash_on_hand);
  restorePayload({ vals:{ arr_now:'99000000' }, prov:{ arr_now:L }, ledger:{ csv:LCSV } });
  ok('P1 a claim on a figure that differs from the ledger is dropped (a typed value cannot borrow ledger evidence)', !S.prov.arr_now, JSON.stringify(S.prov));
}
/* 2. A very wide header row was quadratic in the number of columns (50,000 month columns + 50,000 junk columns). */
{
  const J = 50000;
  const h = ['customer'].concat(Array(J).fill('2020-01'), Array(J).fill('c1')).join(',');
  const r = 'A,' + Array(2 * J).fill('1').join(',');
  const { ms } = timed(() => parseLedger([h, r, r].join(LF), 'mrr'));
  ok('P1 a 100,000-column ledger is read in under 3000 ms (took ' + ms + ')', ms < 3000, ms);
}
/* 3. Many long, near-identical customer names. */
{
  const A5 = 'abcdefghijklm', base = 'abcdefghij'.repeat(15), rows = ['customer,2024-01,2024-02,2024-03,2024-04'];
  for (let i = 0; i < 1500; i++) { const x1 = i % 13, x2 = Math.floor(i / 13) % 13, x3 = Math.floor(i / 169) % 13;
    rows.push(base.slice(0, 145) + A5[x1] + A5[x2] + A5[x3] + A5[(x1 + x2 + x3) % 13] + A5[(x1 + 2 * x2 + 3 * x3) % 13] + ',100,100,100,100'); }
  const r = parseLedger(rows.join(LF), 'mrr');
  const { ms } = timed(() => ledgerForensics(r.ledger, ledgerAnalytics(r.ledger)));
  ok('P1 1,500 long similar names are compared in under 3000 ms (took ' + ms + ')', ms < 3000, ms);
  ok('P1 edit distance unchanged for normal names', editDistance('acme corp', 'acme corpp', 2) === 1 && editDistance('acme', 'zzzz', 2) === 3 && editDistance('globex', 'globex', 2) === 0 && editDistance('abcdef', 'abXdeYf', 2) === 2 && editDistance('abcdef', 'aXXXef', 2) === 3);
}
/* 6/7. Assumptions and the section index are clamped. */
{
  restorePayload({ assume:{ gOverride:1e6, sdOverride:1e300, decay:-1e300, milestone:1, horizon:36, bogus:5 }, section:1e15 });
  ok('P2 out-of-range assumptions are pulled to the edge of their range', S.assume.gOverride === 100 && S.assume.sdOverride === 100 && S.assume.decay === 0, JSON.stringify(S.assume));
  ok('P2 in-range assumptions are kept', S.assume.horizon === 36 && S.assume.milestone === 1);
  ok('P2 unknown assumption keys are dropped', S.assume.bogus === undefined);
  ok('P2 a huge section index is clamped', S.section === SECTIONS.length - 1, S.section);
}

/* 4. The import review lists at most LIB_MAX rows and says how many are left out. */
{
  let body = '', ms = 0;
  const realOpen = openModal; openModal = (t, b) => { body = b; };
  const rows = Array.from({ length:50000 }, (_, i) => ({ company:'C' + i, stage:'seed', model:'saas', metrics:{ arr:1000 + i } }));
  ms = timed(() => reviewImport(rows, 'CSV')).ms;
  openModal = realOpen;
  ok('P1 the review shows at most 1,000 rows', (body.match(/data-imp=/g) || []).length === 1000, (body.match(/data-imp=/g) || []).length);
  ok('P1 it says how many rows are not shown', /49,000 more rows are not shown/.test(body));
  ok('P1 and renders fast (' + ms + ' ms)', ms < 1500, ms);
}
/* 9. The printable memo of one deal is gone when another starts. */
{
  const pr = { textContent:'' }, realGet = document.getElementById;
  document.getElementById = id => id === 'print-root' ? pr : realGet(id);
  ['leaveExample()', 'loadDemo()', 'startSections()', 'resetApp()'].forEach(call => {
    pr.textContent = 'SECRET DEAL';
    try { (0, eval)(call); } catch (e) {}
    ok('P2 ' + call + ' clears #print-root', pr.textContent === '', pr.textContent);
  });
  document.getElementById = realGet;
}
/* 5. A timer paused by OS sleep must not leave the token live: gh() checks the clock itself. */
{
  let calls = 0; const realFetch = globalThis.fetch; globalThis.fetch = () => { calls++; return Promise.resolve({ ok:true, status:200, json:() => Promise.resolve({}) }); };
  ST.token = 'ghp_x'; ghTouch(); _ghLast = Date.now() - 16 * 60000;
  gh('/user').catch(() => {});
  ok('P2 gh() signs out after 15 idle minutes without sending the request', ST.token === null && calls === 0, JSON.stringify([ST.token, calls]));
  ST.token = 'ghp_x'; ghTouch(); gh('/user').catch(() => {});
  ok('P2 a recently active session still sends requests', calls === 1 && ST.token === 'ghp_x');
  clearTimeout(_ghIdle); ST.token = null; globalThis.fetch = realFetch;
}
`;

runSuite('Imports (re-test 2026-11)', TESTS);
