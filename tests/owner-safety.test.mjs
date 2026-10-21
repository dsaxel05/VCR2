// Owner control: what differs from built-in, change list, impact preview, fallback when a setting breaks the engine.
//   node tests/owner-safety.test.mjs
import { runSuite } from './_harness.mjs';

const TESTS = String.raw`
const cfg = o => normalizeConfig(Object.assign(EMPTY_CONFIG(), o));

/* settingsDiff: nothing in the built-in site, one entry per decision otherwise */
eq('diff: the built-in site differs in nothing', settingsDiff(EMPTY_CONFIG()).length, 0);
const rich = cfg({ settings:{ curve:[0, 40, 80, 100], minN:{ retention:15 } }, hidden:{ checks:['stated_arr'] }, thresholds:{ nrr:{ a:[80, 90, 100, 120] } }, metricWeights:{ nrr:3 },
  texts:[{ from:'Score withheld', to:'Cannot rate yet' }], labels:{ metrics:{ nrr:'Net dollar retention' } }, formulas:{ grr:'grr * 0.9' }, branding:{ appName:'My Radar' },
  fields:[{ id:'c_x', label:'My field', type:'num' }], dimensions:[{ id:'reg', label:'Regulatory' }], meta:{ gates:{ ip_assignments:{ why:'Own text.' } } } });
const dl = settingsDiff(rich);
ok('diff: every kind of change is counted once', dl.length >= 11 && new Set(dl.map(d => d.key)).size === dl.length, dl.length);
ok('diff: entries are readable', dl.every(d => typeof d.text === 'string' && d.text.length > 5), dl.map(d => d.text));
ok('diff: nested settings are listed one by one', dl.some(d => d.key === 'settings:minN.retention') && dl.some(d => d.key === 'settings:curve'), dl.map(d => d.key));

/* configChanges: added / changed / removed against the live site */
const live = cfg({ thresholds:{ nrr:{ a:[80, 90, 100, 120] } }, hidden:{ checks:['stated_arr'] }, texts:[{ from:'a', to:'b' }] });
const draft = cfg({ thresholds:{ nrr:{ a:[85, 95, 105, 125] } }, hidden:{ checks:['stated_arr'] }, metricWeights:{ nrr:2 } });
const ch = configChanges(live, draft);
eq('changes: a new setting is “added”', ch.filter(c => c.kind === 'added').map(c => c.area), ['metricWeights']);
eq('changes: an edited setting is “changed”', ch.filter(c => c.kind === 'changed').map(c => c.area), ['thresholds']);
eq('changes: a setting back to built-in is “removed”', ch.filter(c => c.kind === 'removed').map(c => c.area), ['texts']);
eq('changes: identical configurations have none', configChanges(live, live).length, 0);

/* the sentence on every report */
applyConfig(EMPTY_CONFIG());
eq('note: built-in site has no sentence', customisationNote(), '');
applyConfig(cfg({ texts:[{ from:'a', to:'b' }], look:{ direction:'thermal' } }));
eq('note: wording and look do not count as scoring changes', customisationNote(), '');
applyConfig(cfg({ thresholds:{ nrr:{ a:[80, 90, 100, 120] } }, metricWeights:{ nrr:3 } }));
ok('note: scoring changes are counted', /^2 settings of this site differ/.test(customisationNote()), customisationNote());
applyConfig(EMPTY_CONFIG());

/* impact preview: runs both examples under both configurations and leaves the owner’s state alone */
S = blankState(); S.name = 'Owner’s own company'; S.vals = { arr_now:'1234567' };
const before = JSON.stringify(S);
const rows = impactPreview(EMPTY_CONFIG(), cfg({ settings:{ curve:[0, 30, 60, 100] }, thresholds:{ gross_margin:{ seed:[10, 20, 30, 40] } } }));
eq('impact: two example companies', rows.map(r => r.name.split(' ')[0]), ['Northwind', 'Halcyon']);
ok('impact: a change in the curve moves at least one example', rows.some(r => r.a.overall !== r.b.overall), rows.map(r => [r.a.overall, r.b.overall]));
const same = impactPreview(EMPTY_CONFIG(), EMPTY_CONFIG());
ok('impact: no change, no difference', same.every(r => r.a.overall === r.b.overall && r.a.gates === r.b.gates), same.map(r => [r.a.overall, r.b.overall]));
eq('impact: the owner’s own state is restored', JSON.stringify(S), before);
eq('impact: and so is the configuration in force', settingsDiff(CFG).length, 0);

/* dropped keys in the advanced editor */
const dropped = jsonDropped({ settings:{ evidenceMode:'gentle', nonsense:3 }, madeUp:{ a:1 }, texts:[] }, cfg({ settings:{ evidenceMode:'gentle', nonsense:3 }, madeUp:{ a:1 } }));
ok('advanced: unknown keys are reported', dropped.includes('settings.nonsense') && dropped.includes('madeUp.a'), dropped);
eq('advanced: empty values are not reported', dropped.includes('texts'), false);

/* a setting that breaks the engine falls back to the built-in rules instead of breaking the page */
const realScoreAll = scoreAll;
scoreAll = function () { if (CFG.settings && CFG.settings.boolCap === 7) throw new Error('simulated failure'); return realScoreAll.apply(this, arguments); };
applyConfig(cfg({ settings:{ boolCap:7 } }));
S = blankState(); loadHalcyon();
let R, thrown = null;
try { R = assessAll(); } catch (e) { thrown = e; }
eq('fallback: the page still assesses', thrown, null);
ok('fallback: with a score from the built-in rules', R && R.sc.overall != null, R && R.sc.overall);
ok('fallback: and the report is told why', typeof CONFIG_FALLBACK === 'string' && /simulated failure/.test(CONFIG_FALLBACK), CONFIG_FALLBACK);
eq('fallback: the configuration in force is the built-in one', settingsDiff(CFG).length, 0);
scoreAll = realScoreAll; CONFIG_FALLBACK = null;
applyConfig(EMPTY_CONFIG());
let builtinFails = null;
scoreAll = function () { throw new Error('built-in failure'); };
try { assessAll(); } catch (e) { builtinFails = e.message; }
scoreAll = realScoreAll;
eq('fallback: an error in the built-in rules themselves is not hidden', builtinFails, 'built-in failure');
`;

runSuite('Owner control: safety', TESTS);
