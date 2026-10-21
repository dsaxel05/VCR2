// Gap 2 of the skills review: a value read by a model must carry the source line it came from, and numbers it
// returns as text must be read with the same rules as everywhere else.   node tests/extraction.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
const fresh = () => { S = Object.assign(blankState(), { name:'x', stage:'seed', model:'saas' }); };
const run = obj => { fresh(); return acceptExtracted(obj); };

/* accepted: a value with its source line */
let r = run({ arr_now:{ value:1200000, line:'ARR reached $1.2M in March' } });
eq('a number with a line is accepted', [r.accepted, S.vals.arr_now], [1, '1200000']);
eq('and its provenance holds the line', S.prov.arr_now, { src:'extracted', line:'ARR reached $1.2M in March' });

/* refused: no line, empty line, blank line, missing line */
r = run({ arr_now:{ value:1200000, line:'' } });
eq('an empty line is refused', [r.accepted, S.vals.arr_now, S.prov.arr_now], [0, undefined, undefined]);
eq('and the reason says so', (r.refused[0] || {}).why, 'no source line');
r = run({ arr_now:{ value:1200000, line:'   ' } });
eq('a blank line is refused', r.accepted, 0);
r = run({ arr_now:{ value:1200000 } });
eq('a missing line is refused', r.accepted, 0);
r = run({ arr_now:1200000 });
eq('a bare value is refused', [r.accepted, r.refused.length], [0, 1]);
r = run({ litigation:{ value:true, line:'' } });
eq('a yes/no without a line is refused', [r.accepted, S.bools.litigation], [0, undefined]);

/* numbers returned as text are read like everywhere else */
r = run({ arr_now:{ value:'1,200,000', line:'ARR 1,200,000' } });
eq('1,200,000 as text is 1.2 million, not 1', S.vals.arr_now, '1200000');
r = run({ arr_now:{ value:'€1.200', line:'ARR €1.200' } });
eq('€1.200 as text is 1,200', S.vals.arr_now, '1200');
r = run({ arr_now:{ value:'1.200', line:'ARR 1.200' } });
eq('1.200 as text is refused as ambiguous', [r.accepted, (r.refused[0] || {}).why], [0, 'ambiguous number: 1.200 could be 1,200 or 1.2']);
r = run({ arr_now:{ value:'about 3 million', line:'about 3 million' } });
eq('words are refused', [r.accepted, (r.refused[0] || {}).why], [0, 'not a number']);
r = run({ gross_margin:{ value:'72%', line:'gross margin 72%' } });
eq('a percentage sign is read', S.vals.gross_margin, '72');

/* the rest keeps working */
r = run({ litigation:{ value:true, line:'one pending case' }, soc2:{ value:'Type II', line:'SOC 2 Type II' }, soc2_wrong:{ value:'x', line:'y' }, customers_now:{ value:48, line:'48 customers' } });
eq('yes/no, choice and number together; an unknown id is ignored', [r.accepted, S.bools.litigation, S.sel.soc2, S.vals.customers_now, r.refused.length], [3, true, 'Type II', '48', 0]);
r = run({ soc2:{ value:'Type VII', line:'SOC 2 Type VII' } });
eq('a choice that is not on the list is refused', [r.accepted, (r.refused[0] || {}).why], [0, 'not one of the listed choices']);
r = run({ litigation:{ value:'yes', line:'yes' } });
eq('a yes/no that is not true or false is refused', [r.accepted, (r.refused[0] || {}).why], [0, 'not true or false']);
`;

runSuite('AI extraction: every value needs its source line', TESTS);
