// Gap 1 of the skills review: a single separator followed by three digits was read as a decimal ("€1.200" -> 1.2),
// and extraction used parseFloat ("1,200,000" -> 1).   node tests/numbers.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
/* a currency sign makes "1.200" a thousand-separated amount; several dot groups can only be thousands */
eq('€1.200 is one thousand two hundred', parseNum('€1.200'), 1200);
eq('€ 1.200 with a space', parseNum('€ 1.200'), 1200);
eq('$1.200', parseNum('$1.200'), 1200);
eq('1.200.000 is 1,200,000', parseNum('1.200.000'), 1200000);
eq('€1.200,50 is 1,200.50', parseNum('€1.200,50'), 1200.5);
eq('€1.2 stays a decimal', parseNum('€1.2'), 1.2);
eq('€12.50 stays a decimal', parseNum('€12.50'), 12.5);
eq('1.200 in a European file is 1,200', parseNum('1.200', 'eu'), 1200);
eq('1,200,000 is 1.2 million', parseNum('1,200,000'), 1200000);
eq('$1.2M is 1.2 million', parseNum('$1.2M'), 1200000);
eq('1,2 M€ is 1.2 million', parseNum('1,2 M€'), 1200000);
eq('ARR ~ 3m is not a number', parseNum('ARR ~ 3m'), null);

/* what cannot be settled from the text alone is reported, not guessed */
eq('1.200 alone is ambiguous', numberAmbiguity('1.200'), true);
eq('1,200 alone is ambiguous', numberAmbiguity('1,200'), true);
eq('€1.200 is not ambiguous', numberAmbiguity('€1.200'), false);
eq('1.200 in a European file is not', numberAmbiguity('1.200', 'eu'), false);
eq('1.2 is not', numberAmbiguity('1.2'), false);
eq('1200 is not', numberAmbiguity('1200'), false);
eq('1.200.000 is not', numberAmbiguity('1.200.000'), false);
eq('12.345 with two integer digits is ambiguous', numberAmbiguity('12.345'), true);
eq('1.2345 is not (four decimals)', numberAmbiguity('1.2345'), false);

/* a saved or imported assessment keeps numbers that arrive as text from being read as something else */
restorePayload({ stage:'seed', model:'saas', vals:{ arr_now:'1,200,000', customers_now:'€1.200', gross_margin:'about 70', cash_on_hand:'1.200', net_burn:'85000' } });
eq('1,200,000 as text is restored as 1.2 million', S.vals.arr_now, '1200000');
eq('€1.200 as text is restored as 1,200', S.vals.customers_now, '1200');
eq('words are dropped and listed', [S.vals.gross_margin, S.restoreNotes.length], [undefined, 1]);
eq('a plain decimal from the app itself is kept', S.vals.cash_on_hand, '1.200');
eq('a plain integer is kept', S.vals.net_burn, '85000');
`;

runSuite('Numbers: separators, currency signs and ambiguity', TESTS);
