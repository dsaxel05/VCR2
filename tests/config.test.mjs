// Every earlier radar-config.json shape must keep loading (tests/fixtures/configs/), the
// sanitiser must be idempotent and must not pollute prototypes, and owner settings must still
// change the engine in the intended direction.
//   node tests/config.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, root } from './_harness.mjs';

const dir = join(root, 'tests', 'fixtures', 'configs');
const configs = Object.fromEntries(readdirSync(dir).filter(f => f.endsWith('.json')).map(f => [f, JSON.parse(readFileSync(join(dir, f), 'utf8'))]));
const arch = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'archetypes', 'archetypes.json'), 'utf8')).companies.typical_a;

const TESTS = String.raw`
const company = () => ({ name:'Typical', stage:TYP.stage, model:TYP.model, vals:TYP.vals, bools:TYP.bools, sel:TYP.sel, evid:{} });
applyConfig(EMPTY_CONFIG());
const base = Radar.assess(company());
const metricScore = (r, key) => { for (const d of r.scoring.dimensions) { const m = d.metrics.find(x => x.key === key); if (m) return m.score; } return null; };
for (const [file, raw] of Object.entries(CONFIGS)) {
  let n1 = null, threw = null;
  try { n1 = normalizeConfig(JSON.parse(JSON.stringify(raw))); applyConfig(n1); } catch (e) { threw = String(e && e.message || e); }
  ok(file + ' loads without an error', threw === null, threw);
  if (!n1) continue;
  ok(file + ' sanitising is idempotent', canonJSON(normalizeConfig(JSON.parse(JSON.stringify(n1)))) === canonJSON(n1));
  let r = null; try { r = Radar.assess(company()); } catch (e) { r = null; }
  ok(file + ' still produces an assessment', r && r.scoring && r.scoring.dimensions.length > 0);
  ok(file + ' keeps scores in range', r && r.scoring.dimensions.every(d => d.score == null || (d.score >= 0 && d.score <= 100)));
  applyConfig(EMPTY_CONFIG());
}
ok('no prototype pollution from a hostile config', ({}).polluted === undefined && Object.prototype.polluted === undefined);
const hostile = normalizeConfig(JSON.parse(JSON.stringify(CONFIGS['hostile.json'])));
ok('hostile: owner with markup is dropped', hostile.owner === null, hostile.owner);
ok('hostile: thresholds with a non-number are dropped', !(hostile.thresholds.nrr && hostile.thresholds.nrr.a), hostile.thresholds.nrr);
ok('hostile: negative weights are dropped', hostile.metricWeights.nrr === undefined);
ok('hostile: a custom field cannot shadow a built-in', (() => { applyConfig(hostile); const n = ALL_FIELDS().filter(f => f.id === 'arr_now').length; applyConfig(EMPTY_CONFIG()); return n === 1; })());
/* Owner settings still move the engine in the intended direction. */
applyConfig(normalizeConfig(CONFIGS['v4.1-owner-standards.json']));
const strict = Radar.assess(company());
ok('a higher Series A NRR bar lowers the NRR score', metricScore(strict, 'nrr') < metricScore(base, 'nrr'), [metricScore(strict, 'nrr'), metricScore(base, 'nrr')]);
ok('a custom metric is scored', metricScore(strict, 'arr_per_eng') != null, metricScore(strict, 'arr_per_eng'));
ok('a hidden metric is not scored', metricScore(strict, 'sales_cycle') == null);
ok('a config that changes scores changes the rubric version', strict.rubric !== base.rubric, [strict.rubric, base.rubric]);
/* Look & feel (5.0): valid choices are kept, anything else is dropped, and it never changes a score. */
const lk = normalizeConfig({ look:{ direction:'thermal', theme:'dark', brand:'#2b3ae8', brandDark:'nope', highlight:'#FFE14D', extra:1 } }).look;
eq('look: valid choices kept, invalid dropped, an earlier identity name is not kept (there is one identity now)', lk, { theme:'dark', brand:'#2B3AE8', highlight:'#FFE14D' });
eq('look: unknown identity dropped', normalizeConfig({ look:{ direction:'neon' } }).look, {});
applyConfig(normalizeConfig({ look:{ direction:'dimensions', brand:'#787878' } })); /* mid-grey: neither white nor dark text reaches 4.5:1 */
ok('look does not change the rubric version', rubricVersion() === base.rubric, rubricVersion());
ok('contrast guard refuses an unreadable brand colour', lookOverrides('dimensions', 'light').problems.length === 1 && !('--brand' in lookOverrides('dimensions', 'light').vars));
applyConfig(normalizeConfig({ look:{ brand:'#123A7A' } }));
ok('contrast guard accepts a readable brand colour', lookOverrides('highlighter', 'light').vars['--brand'] === '#123A7A');
/* Shape and size (owner point of 2026-10-13): corners, title/figure/question size, report views in sight */
/* Round corners are built in since 5.0.4 (the golden warmth look); soft and square are the owner's other choices. */
const shp = normalizeConfig({ look:{ corners:'square', sizeTitle:'large', sizeFigure:'xlarge', sizeQuestion:'small', views:['deal', 'overview', 'nope', 'deal', 'checklist'] } }).look;
eq('shape and size: valid values kept, invalid and repeated views dropped', shp, { corners:'square', sizeTitle:'large', sizeFigure:'xlarge', sizeQuestion:'small', views:['deal', 'overview', 'checklist'] });
eq('shape and size: softly rounded corners are kept', normalizeConfig({ look:{ corners:'soft' } }).look, { corners:'soft' });
eq('shape and size: built-in values are not stored', normalizeConfig({ look:{ corners:'round', sizeTitle:'normal', sizeFigure:'huge', views:['overview', 'findings', 'revenue', 'questions'] } }).look, {});
eq('shape and size: an unknown corner shape is dropped', normalizeConfig({ look:{ corners:'pill' } }).look, {});
eq('shape and size: at most six views, an empty list is dropped', [normalizeConfig({ look:{ views:['overview','findings','revenue','questions','deal','bench','scoring','metrics'] } }).look.views.length, normalizeConfig({ look:{ views:[] } }).look.views], [6, undefined]);
eq('page title: kept, trimmed to 70 characters, plain text only', [normalizeConfig({ branding:{ pageTitle:'  Acme Diligence Radar  ' } }).branding.pageTitle, normalizeConfig({ branding:{ pageTitle:'x'.repeat(200) } }).branding.pageTitle.length], ['Acme Diligence Radar', 70]);
eq('page title: empty is not stored', 'pageTitle' in normalizeConfig({ branding:{ pageTitle:'   ' } }).branding, false);
eq('text size and page scale: only the non-default values are stored', [normalizeConfig({ look:{ text:'normal', page:'75' } }).look, normalizeConfig({ look:{ text:'xlarge', page:90 } }).look], [{}, { text:'xlarge', page:'90' }]);
eq('text size and page scale: unknown values are dropped', normalizeConfig({ look:{ text:'huge', page:'60' } }).look, {});
applyConfig(normalizeConfig({ look:{ corners:'soft', sizeTitle:'xlarge', views:['deal'] } }));
ok('shape and size do not change the rubric version or the run hash', rubricVersion() === base.rubric, rubricVersion());
eq('contrast ratio maths (white on black)', contrastRatio('#FFFFFF', '#000000'), 21, 1e-9);
applyConfig(EMPTY_CONFIG());
const again = Radar.assess(company());
eq('clearing the config restores the exact baseline', [again.scoring.overallRaw, again.rubric, again.hash], [base.scoring.overallRaw, base.rubric, base.hash]);

eq('sidebar on start: only "hidden" is stored', [normalizeConfig({ look:{ sidebar:'hidden' } }).look, normalizeConfig({ look:{ sidebar:'open' } }).look, normalizeConfig({ look:{ sidebar:'left' } }).look], [{ sidebar:'hidden' }, {}, {}]);
applyConfig(normalizeConfig({ look:{ sidebar:'hidden' } }));
ok('sidebar on start does not change the rubric version or the run hash', rubricVersion() === base.rubric && Radar.assess(company()).hash === base.hash, rubricVersion());
applyConfig(EMPTY_CONFIG());

/* A 5.0-shaped file keeps every part of what it says (nothing silently dropped) and is applied. */
{
  const f = normalizeConfig(JSON.parse(JSON.stringify(CONFIGS['v5.0-full.json'])));
  eq('5.0 fixture: look kept', [f.look.accent, f.look.frame, f.look.divider, f.look.theme, f.look.brand].join('/'), 'garnet/off/plain/dark/#112233');
  eq('5.0 fixture: text replacements kept', f.texts.length, 2);
  eq('5.0 fixture: constants kept', [f.settings.currency, f.settings.runwayCap, f.settings.evidencePivot].join(','), '€,96,55');
  eq('5.0 fixture: stage rename and unit kept', f.labels.stages.seed + '/' + f.labels.units.burn_multiple, 'Early growth/x');
  ok('5.0 fixture: built-in details kept', !!f.meta.gates.ip_assignments && f.meta.fields.arr_now.group === 'Revenue today' && f.meta.patterns.new_team.sev === 'amber', f.meta);
  eq('5.0 fixture: own dimension and stage kept', f.dimensions.length + '/' + f.stages.length, '1/1');
  applyConfig(f);
  eq('5.0 fixture: currency applied', money(1500000), '€1.50M');
  applyConfig(EMPTY_CONFIG());
}
`;

runSuite('Configuration fixtures', TESTS, 'const CONFIGS = ' + JSON.stringify(configs) + ';\nconst TYP = ' + JSON.stringify(arch) + ';');
