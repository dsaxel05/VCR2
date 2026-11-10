// Smart fill settings in the published configuration (S9): cleaned on load, never part of the score.
//   node tests/smartfill-config.test.mjs
import { runSuite } from './_harness.mjs';

runSuite('Smart fill settings', String.raw`
{
const n = c => normalizeConfig(c);
const base = rubricVersion(), co = () => ({ name:'Acme', stage:'a', model:'saas', vals:{ arr_now:'5000000', arr_12mo:'2500000', net_burn:'300000', cash_on_hand:'6000000', gross_margin:'72' } });
const h0 = Radar.assess(co()).hash;
const good = n({ settings:{ smartfill:{ enabled:true, excludeRestricted:false, allowComputed:false, locale:'eu', thresholds:{ high:0.9, medium:0.7, low:0.5 },
  forecastWords:['guidance', 'outlook 2027'], fields:{ arr_now:{ syn:['annual run rate'], neg:['bookings'], range:[1000, 1e9] } }, docTypes:{ deck:{ name:'Investor deck', words:['our vision'] } } } } }).settings.smartfill;
eq('valid settings are kept', [good.enabled, good.excludeRestricted, good.allowComputed, good.locale, good.thresholds.high, good.forecastWords.length, good.fields.arr_now.syn[0], good.fields.arr_now.range[1], good.docTypes.deck.name],
  [true, false, false, 'eu', 0.9, 2, 'annual run rate', 1e9, 'Investor deck']);
const bad = n({ settings:{ smartfill:{ enabled:'yes', locale:'xx', thresholds:{ high:7, medium:'a', low:-1 }, forecastWords:[1, {}, 'ok', 'x'.repeat(500)], fields:{ '__proto__':{ syn:['a'] }, 'bad id!':{ syn:['b'] }, arr_now:{ syn:'not a list', range:[5, 1] }, nrr:{ syn:Array(200).fill('w') } },
  docTypes:{ '<script>':{ name:'x' }, deck:{ name:{}, words:[3] } }, extra:'dropped' } } }).settings.smartfill || {};
ok('hostile values are dropped or bounded', bad.enabled === undefined && bad.locale === undefined && !bad.thresholds && bad.forecastWords.length === 2 && bad.forecastWords[1].length === 80 && !bad.extra, bad);
ok('field ids are checked; lists are capped at 60 words', !bad.fields || (!('bad id!' in bad.fields) && !Object.prototype.hasOwnProperty.call(bad.fields, '__proto__') && !bad.fields.arr_now && bad.fields.nrr.syn.length === 60), bad.fields);
ok('document types: only plain ids, text names', !bad.docTypes, bad.docTypes);
applyConfig({ settings:{ smartfill:{ enabled:true, thresholds:{ high:0.99 }, fields:{ arr_now:{ syn:['annual run rate'] } } } } });
eq('Smart fill settings never change the rubric version', rubricVersion(), base);
eq('nor the run ID of an assessment', Radar.assess(co()).hash, h0);
_sfDict = null;
ok('the owner\'s label reaches the dictionary', sfDict().get('arr_now').syn.includes('annual run rate'));
const m = sfMatch('Annual run rate', sfFields('saas'), '');
ok('and the matcher uses it', m && m.f.id === 'arr_now', m && m.f.id);
applyConfig({}); _sfDict = null;
ok('cleared again', !sfDict().get('arr_now').syn.includes('annual run rate'));
}
`);
