// Gap 4 of the skills review: the run hash is taken over canonical numbers, so "1" and "1.0" (which score the same)
// give the same hash.   node tests/hash.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
const h = vals => { S = Object.assign(blankState(), { name:'x', stage:'seed', model:'saas', vals }); return runHash(); };
const base = h({ arr_now:'1200000', net_burn:'85000', gross_margin:'72' });

eq('the same numbers written differently give the same hash', [h({ arr_now:'1200000.0', net_burn:'85000', gross_margin:'72' }), h({ arr_now:' 1200000 ', net_burn:'8.5e4', gross_margin:'72.00' }), h({ arr_now:'1.2e6', net_burn:'85000', gross_margin:'72' })], [base, base, base]);
eq('a different number gives a different hash', h({ arr_now:'1200001', net_burn:'85000', gross_margin:'72' }) !== base, true);
eq('key order does not matter', h({ gross_margin:'72', net_burn:'85000', arr_now:'1200000' }), base);
eq('a text value is hashed as typed (case matters)', h({ arr_now:'1200000', founder_note:'ABC' }) !== h({ arr_now:'1200000', founder_note:'abc' }), true);
eq('a value that is not a plain number is kept as it is', h({ arr_now:'about 3m' }) !== h({ arr_now:'about 3 m' }), true);
eq('negative and fractional numbers are canonical too', h({ net_burn:'-0.50' }), h({ net_burn:'-.5' }) === h({ net_burn:'-0.5' }) ? h({ net_burn:'-0.50' }) : 'differs');
eq('the hash is sixteen hex digits (64 bits)', /^[0-9A-F]{16}$/.test(base), true);
eq('the two halves are different hashes (not one 32-bit value written twice)', base.slice(0, 8) !== base.slice(8), true);
eq('one changed digit changes both halves', [h({ arr_now:'1200001', net_burn:'85000', gross_margin:'72' })].map(x => [x.slice(0, 8) !== base.slice(0, 8), x.slice(8) !== base.slice(8)])[0], [true, true]);
`;

runSuite('Run hash over canonical numbers', TESTS);
