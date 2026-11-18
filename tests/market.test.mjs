// Market data (v5.8): the startup's market (United States or Europe) and the sourced market figures that come with it.
// Euros everywhere for a European startup, dollar thresholds converted at the ECB rate, the exit multiple from the market
// only when nobody set one, a figure without a trusted source never feeding a result, the Studio switch to "shown only",
// the data file checked before use, and the market and the figures used recorded in the run hash.
//   node tests/market.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
{
const fresh = () => { applyConfig(EMPTY_CONFIG()); MARKET_DATA = MARKET_BUILTIN; MARKET_SRC = 'built-in'; };
const nw = mkt => { fresh(); S = blankState(); S.example = true; loadNorthwind(); if (mkt) S.market = mkt; return { D:derive().D, a:assessAll(), hash:runHash() }; };

/* the built-in figures carry what the owner asked for */
const fed = MD_ITEMS.filter(it => it.feeds);
ok('every figure that can feed a result has a source, a link and a date in each market where it has a value',
  fed.every(it => ['us', 'eu'].every(m => { const d = mdGet(it.id, m); return !d || (d.src && /^https:\/\//.test(d.url) && /^\d{4}/.test(d.date) && ['official', 'vc'].includes(d.kind)); })));
ok('a figure with no trusted source says so', mdGet('round_pre_a', 'us') == null && /No verified source/.test(mdNote('round_pre_a', 'us')) && mdGet('exit_multiple', 'eu') == null && /built-in exit multiple/.test(mdNote('exit_multiple', 'eu')));

/* United States */
fresh(); S = blankState();
eq('a new analysis is a US one, in dollars', [mktId(), curSym(), money(4200000)], ['us', '$', '$4.20M']);
eq('US: dollars per local unit is 1', usdPerLocal(), 1);
eq('US: the exit multiple left blank is the public-software median (4.7x, Clouded Judgement)', defaultExitMultiple(), 4.7);

/* Europe */
S.market = 'eu';
eq('Europe: amounts in euros', [curSym(), money(4200000)], ['€', '€4.20M']);
eq('Europe: the ECB rate converts the dollar thresholds', Math.round(fromUsd(10000000)), Math.round(10000000 / 1.0968));
eq('Europe: no verified European exit multiple, so the built-in 8x is used', defaultExitMultiple(), 8);

/* scoring: a dollar threshold is converted, the rest is untouched */
const us = nw(), eu = nw('eu');
const m = (a, k) => a.sc.dimensions.flatMap(d => d.metrics).find(x => x.key === k);
ok('Europe: ARR per employee is scored against euro thresholds (a higher score for the same figure)', m(eu.a, 'arr_per_fte').score >= m(us.a, 'arr_per_fte').score && m(eu.a, 'arr_per_fte').value.includes('€'));
eq('Europe: a percentage metric scores the same in both markets', m(eu.a, 'nrr').score, m(us.a, 'nrr').score);
ok('the market enters the run hash', eu.hash !== us.hash);

/* the next-stage bar of the simulation is converted too */
fresh(); S = blankState(); S.example = true; loadNorthwind(); S.market = 'eu';
eq('Europe: the next-stage ARR bar is $10M in euros', Math.round(projectionInputs(derive().D).milestone), Math.round(10000000 / 1.0968));

/* precedence of the exit multiple: the investor, then the owner's Studio default, then the market, then built-in */
fresh(); S = blankState(); S.example = true; loadNorthwind();
eq('the investor\'s own multiple always wins', dealMath(derive().D).I.exitMult, 8);
delete S.vals.exit_multiple_assumption;
eq('left blank: the market median', dealMath(derive().D).I.exitMult, 4.7);
const hBlank = runHash();
applyConfig(Object.assign(EMPTY_CONFIG(), { defaults:{ deal:{ exit_multiple:6 } } }));
eq('the owner\'s Studio default wins over the market', dealMath(derive().D).I.exitMult, 6);
applyConfig(Object.assign(EMPTY_CONFIG(), { settings:{ marketData:{ exit_multiple:'show' } } }));
eq('switched to "shown only" in the Studio: the built-in 8x is used', dealMath(derive().D).I.exitMult, 8);
ok('the hash changes when the market multiple stops feeding the result', runHash() !== hBlank);
applyConfig(EMPTY_CONFIG());
S.vals.exit_multiple_assumption = '8';
const hOwn = runHash();
MARKET_DATA = { updated:'2026-12-01', items:Object.assign({}, MARKET_BUILTIN.items, { exit_multiple:{ us:Object.assign({}, MARKET_BUILTIN.items.exit_multiple.us, { value:6.1 }) } }) };
eq('with the investor\'s own multiple, a new market multiple changes neither the result nor the hash', [runHash(), dealMath(derive().D).I.exitMult], [hOwn, 8]);
delete S.vals.exit_multiple_assumption;
ok('left blank, a new market multiple is used and changes the hash', runHash() !== hBlank && dealMath(derive().D).I.exitMult === 6.1);
MARKET_DATA = MARKET_BUILTIN;
applyConfig(EMPTY_CONFIG());

/* the Studio switch survives the configuration checks, and nothing else does */
const c = normalizeConfig({ settings:{ marketData:{ exit_multiple:'show', fx_usd:'feed', 'bad key!':'show', risk_free_10y:'nonsense' } } });
eq('Studio: only "shown only" switches with a clean id are kept', c.settings.marketData, { exit_multiple:'show' });

/* the data file is checked before use */
const good = { updated:'2026-11-25', items:{ fx_usd:{ eu:{ value:1.1, date:'2026-11-25', src:'European Central Bank reference rate', kind:'official', url:'https://data.ecb.europa.eu/x' } } } };
ok('a well-formed file is accepted', mdValid(good));
ok('a value that is not a number is refused', !mdValid({ updated:'2026-11-25', items:{ fx_usd:{ eu:{ value:'1.1', date:'2026-11-25', src:'x', kind:'official', url:'https://a.b/c' } } } }));
ok('a figure without a source, link or trusted kind is refused', !mdValid({ updated:'2026-11-25', items:{ fx_usd:{ eu:{ value:1.1, date:'2026-11-25', src:'x', kind:'blog', url:'https://a.b/c' } } } })
  && !mdValid({ updated:'2026-11-25', items:{ fx_usd:{ eu:{ value:1.1, date:'2026-11-25', src:'x', kind:'official', url:'javascript:alert(1)' } } } }));
ok('an unknown market or a missing date is refused', !mdValid({ updated:'2026-11-25', items:{ fx_usd:{ asia:{ value:1 } } } }) && !mdValid({ items:{} }));
}
`;
runSuite('Market data', TESTS);
