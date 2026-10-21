# What you can change without code, and what you cannot

This page answers one question: *can I change this in the Studio?* The items that can be changed are checked by tests (`tests/studio-coverage.test.mjs` exercises each built-in metric, scored answer, yes/no point, deal-breaker, check, pattern, tolerance, trigger and constant), and an independent re-measurement was made after each round. What is *not* a setting is listed below, so nothing is left unsaid.

## Everything is a setting, except the items on this page

Every number that decides a score, every threshold, every weight, every yes/no point, every deal-breaker, every wording you can see on the site, and every list (fields, metrics, checks, patterns, questions, requests, checklist, benchmarks, business models, stages, dimensions) can be changed in the Studio, each with the built-in value shown next to yours and a way back. Where there is no dedicated box, **Edit any text** changes the wording of anything on screen, and **Advanced (JSON)** edits the whole configuration.

## Your own domain

The link-preview image (`og:image`, `twitter:image`) must be an absolute address, so the build writes it from `site.json` at the top of the project: `{ "url": "https://your-domain.example/" }`. Change that one value, run `python build.py`, and publish. Nothing else in the page names the address it is served from.

## What cannot be a setting (needs your approval)

Each of these is deliberate. For each one: why, the file to change, and a ready-to-paste instruction for Claude Code, so you can still change it.
Rows marked *candidate* could be turned into a setting; say so and I will build it.

| Not a setting | Why | File to change | Paste this to Claude Code |
|---|---|---|---|
| The arithmetic of the engine: the ARR bridge, cohort retention, the Monte Carlo model, SAFE and note conversion, the liquidation waterfall | A formula can replace a metric's calculation (Healthy ranges, Change, Advanced), but the engine's own algorithms are code: a wrong one would silently corrupt every report. | `src/core.js` (`derive`, `scoreAll`), `src/ledger.js` (bridge, cohorts), `src/sim.js` (Monte Carlo), `src/deal.js` (SAFEs, notes, waterfall) | In `<file>`, change `<function>` so that `<what it should do>`. Add a test with a hand-computed case first, run `python build.py` and every `tests/*.test.mjs`, bump `RUBRIC.version`, add a CHANGELOG entry. |
| The formula language itself (its functions and grammar) | A small interpreter with no access to anything but numbers is what makes published formulas safe. | `src/config.js` (`fxCompile`, `fxRun`, `fxValidate`) | In `src/config.js`, add the function `<name>(<args>)` to the formula interpreter, with tests in `tests/config.test.mjs` for valid and hostile input. No `eval`. |
| Web addresses of the AI providers | A visitor's key is sent only to the provider they chose; a published setting must not be able to redirect it. Model names are settings. | `src/core.js` (`PROVIDERS`) | Not recommended. If you really want a new provider: add it to `PROVIDERS` in `src/core.js` and to the `connect-src` list in `src/shell.html`, with a test in `tests/security.test.mjs`. |
| Section and model icons, the logo and favicon image files | Icons are drawings in the code; image files must be uploaded to the repository. | `src/core.js` (`sectionMark`), `assets/`, `src/shell.html` (favicon) | Replace `assets/<file>` with my file (same name), or draw the icon `<name>` for `<section or model>` in `sectionMark` and rebuild. |
| Own healthy ranges for an added stage | An added stage is scored like the built-in stage you pick. Separate bars per added stage are planned for v5.1. | `src/config.js` (`stageKey`, threshold lookup), `src/studio.js` (`editStandard`) | Let a stage I added carry its own four anchors per metric: store them under `thresholds.<metric>.<stage id>`, read them before falling back to `like`, add the column in Healthy ranges, test that clearing restores the built-in stage. |
| A different identity (a different family of colours and typefaces) | The site has one designed identity, Private bank. Accent (brass, garnet, emerald), frame, divider, light or night, and your own ink and line colours are settings, each with a contrast guard. | `src/style-tokens.css`, `src/style-identity.css`, `src/theme.js` | Design a second identity named `<name>`: tokens in `src/style-tokens.css`, signature rules in `src/style-identity.css`, add it to `LOOKS` in `src/theme.js`, extend `tools/contrast_pairs.json`, and re-take the screenshots. |
| The rules that read a term sheet (what makes a term market, watch or off) | Verdicts follow published norms; wording and points are not all exposed. Planned for v5.1. | `src/deal.js` (`termReview`) | For each term (`<list>`), make the verdict rule and its wording settings under `meta.terms.<term>`, with the built-in as default and a test per term. |
| The internal numbers of the Monte Carlo model (how growth, churn and burn are drawn, the number of paths) | They are the model. The horizon, decay, buffer and the default-alive expense behaviour are settings. | `src/sim.js` | In `src/sim.js`, change `<parameter>` from `<old>` to `<new>`, re-run `tests/deal-sim.test.mjs` and the sim worker browser test, and write the before and after odds in the CHANGELOG. |
| The prompts sent to an AI provider for the optional memo and extraction | The prompt fixes what is sent and forbids inventing numbers; a published setting must not weaken that. Model names are settings. | `src/core.js` (`writeMemo`, extraction `SYSTEM` and `PROMPT`) | In `src/core.js`, change the wording of `<prompt part>` to `<text>`. Keep the rules that the model gets figures already computed, must not contradict them and must return the source line. |
| The description and social-card text a search engine or a chat app shows | They live in the page head, outside what the app can rewrite after it loads. The title shown in the browser tab IS a setting (Home page texts). | `src/shell.html` (head) | In `src/shell.html`, change the `description`, `og:` and `twitter:` meta tags to `<text>`, then rebuild with `python build.py`. |
| Which answer counts as good for a yes/no point (its polarity) | Points, weight, dimension, wording and business models are settings; which side is good is what the question means. | `src/core.js` (`RUBRIC.booleans`) | In `RUBRIC.booleans`, flip `good` and `pts` for `<id>`, update the wording, add a test, bump the rubric version. |
| Deleting a built-in choice from an answer list | Saved assessments already hold it. A choice can be reworded (Edit any text), scored (Scored answers), and you can add choices. | `src/core.js` (`RUBRIC.categorical`, `SECTIONS`) | Remove `<choice>` from `RUBRIC.categorical.<key>.map` and from the field's `options`; keep restoring old assessments that hold it. |
| How many items a report list shows, and the colour cut-offs of tiles | Strong and mixed score cut-offs and the odds tile follow settings; list lengths are shared presentation limits. | `src/report.js`, `src/exports.js` | In `src/report.js`, change the `slice(0, <n>)` of `<list>` to `<m>`. |
| The order of the question families | The order encodes what an investor resolves first. How many weak dimensions and unverified inputs get a question, and every trigger, are settings. | `src/core.js` (`buildQuestions`, the `p:` values) | In `buildQuestions`, change the priority `p` of the `<family>` family to `<number>` so it sorts `<before or after>` `<family>`. |
| A renamed metric inside prose that uses an abbreviation (NRR, CAC, GRR) | A rename follows the full name; abbreviations are different words, so they are changed with Edit any text. | Studio, Edit any text | Nothing to paste: in the Studio open Edit any text and replace the abbreviation. |
| The order of blocks inside one report view | Which report views are in sight (up to six, in your order), the corners, the text size, the page scale and the size of titles, figures and questions are settings (Look & feel). The order of blocks inside a view is planned for v5.1 (about one and a half sessions: each of about 40 blocks needs a stable key and the Studio needs an up and down list). | `src/report.js` | In `src/report.js`, move the `<block>` before the `<other block>` in `renderResult`. |
| The LICENSE and the footer | Your rule: they are never changed. | none | Never. |

## How to add things

| You want to add… | Studio tab |
|---|---|
| An input, a yes/no, a choice list (optionally scored), a text | Add your own → Inputs |
| A metric from a formula, with its own healthy ranges | Add your own → Metrics |
| Which metrics count as one signal (groups), and how much a group can weigh | How companies are judged → Weights & rules → Metrics measured together |
| Corners, text size, page scale, and the size of titles, figures and questions | Site → Look & feel → Text size, Page scale, Shape and size |
| Whether the left menu starts open or hidden | Site → Look & feel → Sidebar on start |
| The title in the browser tab | Site → Home page texts |
| Which report views are in sight | Site → Look & feel → Report views in sight |
| A consistency check (stated vs computed) | Add your own → Checks |
| A deal-breaker, a question, a red flag or strength, a document request, a checklist item | Add your own → the matching tab |
| Benchmark data with its source | Add your own → Benchmark data |
| A business model, a scoring dimension, a stage | Add your own → Business models / Scoring dimensions / Stages |
| Scored answers | Inputs (choice field → "Score the answers") |

## Safety

- Nothing is live until you publish. Preview shows the draft in your browser only.
- Undo and redo; a reset beside every value; **What differs from built-in** lists everything with a way back; **Reset everything** puts the whole draft back.
- **Review before publishing** lists every change and shows what it does to the two example companies.
- **Publish history** lists the versions; loading one puts it in your draft only.
- A configuration that is invalid is cleaned on load (unknown keys are dropped, numbers clamped); if a setting still breaks the engine, the page uses the built-in rules and says so.
