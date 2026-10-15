# VCR2 — project instructions

VCR2 is an evidence-first venture capital due-diligence engine: an investor enters a startup's
numbers (or loads a customer ledger / monthly financials), and VCR2 scores the company, checks
that the figures reconcile, flags red flags, drafts diligence questions, and models the deal
(SAFEs, notes, waterfall, VC method, returns). It is a static single-page app on GitHub Pages:
https://dsaxel05.github.io/VCR2/ — repository `dsaxel05/VCR2`.

## The owner

- Owner and only publisher: **Axel De Sousa**, GitHub **`dsaxel05`**. The project is his; the
  licence is proprietary ("source visible, all rights reserved"). Never change the licence or
  remove the copyright/footer lines.
- Axel is a finance student and a GitHub beginner. He reads English and French. Follow the
  `owner-handoff` skill whenever you explain something to him or ask him to click something.
- He must approve anything that changes the live site. Work on a branch, open a pull request,
  and merge only after he says yes in chat.

## Non-negotiables

1. **Owner-editable without code.** Every metric, threshold, weight, question, check, label,
   benchmark, business model and default must stay editable in the Owner Studio (`#studio`),
   which publishes `radar-config.json` through the GitHub contents API. New features must come
   with their Studio controls. See the `vcr2-studio-editability` skill.
2. **Private by design.** Deal data never leaves the visitor's browser. No analytics, trackers,
   CDNs or third-party requests at runtime. Fonts and assets are self-hosted. The only outbound
   calls allowed: the GitHub API from the Studio (owner only), `radar-config.json` from the same
   origin, and optional bring-your-own-key AI extraction that the visitor explicitly turns on.
3. **Static and free.** GitHub Pages, no backend, no paid services, no runtime dependencies.
   The shipped app is one self-contained `index.html` produced by `build.py`
   (Python standard library only). Dev-only tooling (Playwright, test helpers) is fine.
4. **Backward-compatible config.** A `radar-config.json` published by any earlier version must
   keep loading. Change the schema only with a version bump and a tested migration in
   `normalizeConfig`.
5. **Honest numbers.** Every default benchmark carries its source and as-of date, or is labelled
   as an editable calibration. Never invent statistics, users, customers or testimonials.
   Sample companies are clearly fictional. The app says it is not investment advice.
6. **Tests stay green.** Never delete or weaken a test to make it pass. Every behaviour change
   gets a test.
7. **Secrets.** Never ask Axel for his GitHub token, password or API keys, never print them,
   never write them to files. The Studio token is typed by Axel into the Studio himself.

## Layout

The live repo may still be in a flat layout (source files at the root). Check with `ls` first.
Target layout after the Phase 0 clean-up:

- `src/` — `shell.html` (page skeleton) + CSS (`style*.css`) + JS modules concatenated in the
  order listed in `build.py`. All code shares one global scope (no ES modules at runtime).
- `index.html` — **generated** by `python build.py`. Never hand-edit it; edit `src/` and rebuild.
- `radar-config.json` — the owner's published configuration (written by the Studio).
- `tests/engine.test.mjs` — engine tests (Node, no dependencies). `tests/browser/` — Playwright.
- `docs/` — `METHODOLOGY.md`, `STUDIO.md`, screenshots, `overhaul/` (plan, progress, audits).
- `examples/` — sample CSV/XLSX files for the ledger and monthly-financials importers.
- `.github/workflows/tests.yml` — CI ("Engine tests").

Key engine entry points (in `core.js` unless noted): `RUBRIC` (weights, anchors, categorical and
boolean scorers, gates), `derive()` (derived metrics + formula strings), `runChecks()`
(consistency checks), `scoreAll()` (dimension and overall scores, confidence band),
`buildQuestions()`, `buildDataRequests()`, `assessAll()`; `Radar.assess()` is the headless API
used by tests. Config layer: `config.js` (`normalizeConfig`, `applyConfig`, `applyDefaults`,
`configSignature`, safe formula interpreter `fx*`). Studio UI: `studio.js`. Deal maths:
`deal.js`. Patterns/red flags: `patterns.js`. Report: `report.js`. Details and a full map are in
the `vcr2-architecture` skill.

## Commands

```bash
python build.py                      # rebuild index.html from src/ (run after every edit)
node tests/engine.test.mjs           # engine tests (flat layout: node engine.test.mjs)
node tools/dev_server.mjs --port 8765   # local preview that rebuilds on change
python .claude/skills/vcr2-qa/scripts/shots.py --help   # screenshot tour for visual checks
```

On Windows use `py -3` if `python` is not on PATH (`.claude/settings.json` sets `PYTHONUTF8=1` so
Python prints and reads UTF-8; don't prefix commands with it). Before saying any task is done:
rebuild, run the engine tests, run the browser tests that exist, and look at the result in the
preview or in screenshots. Report what you ran and what you saw.

## Conventions

- Plain JavaScript (ES2020), no frameworks, no build step beyond concatenation. Keep functions
  pure where the engine is concerned; UI code may touch the DOM.
- Every string interpolated into HTML goes through `esc()`. No `eval`, no `new Function` — the
  formula interpreter is the only way owner formulas run.
- Changing any scoring behaviour: bump `RUBRIC.version`, add a `CHANGELOG.md` entry, update
  `docs/METHODOLOGY.md`, add tests, and check the Studio still exposes it.
- IDs for fields/metrics match `^[A-Za-z_][A-Za-z0-9_]{0,63}$`.
- Commit messages: conventional style (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
  Small commits. Branch per phase (`v5/phase-N-name`). Never force-push. Never push to `main`
  directly.

## Long-running work

The v5 overhaul program lives in the `vcr2-overhaul` skill (`/vcr2-overhaul`). Its state is in
`docs/overhaul/PROGRESS.md`: read it at the start of every session and update it after every
completed step (what changed, what's next, open decisions). When context gets long, update
PROGRESS.md before compacting so the next session can resume exactly.

## Skills, agents, workflows and hooks in this repo

- **Skills** (`.claude/skills/`, 150): 16 hubs — `vcr2-overhaul` (the program), `vcr2-architecture`,
  `vcr2-studio-editability`, `vc-metrics-science`, `vcr2-business-models`, `vcr2-forensics`,
  `deal-math-verification`, `vcr2-design-system`, `vcr2-performance`, `vcr2-qa`,
  `vcr2-security-privacy`, `vcr2-product-features`, `vcr2-moat-strategy`,
  `vcr2-verification-protocol`, `vcr2-release`, `owner-handoff` — each ending with a table of its
  specialists (`metric-*`, `scoring-*`, `forensics-*`, `diligence-*`, `model-*`, `deal-*`,
  `studio-*`, `design-*`, `perf-*`, `eng-*`, `qa-*`, `sec-*`, `feature-*`). Load the hub, then
  the specialists a task needs.
- **Subagents** (`.claude/agents/`, 46): independent reviewers and specialists. The agent that
  wrote a change is never the only one that checks it.
- **Saved workflows** (`.claude/workflows/`, 9): `/vcr2-mega-audit`, `/vcr2-metric-lab`,
  `/vcr2-benchmark-verify`, `/vcr2-design-review`, `/vcr2-red-team`, `/vcr2-studio-coverage`,
  `/vcr2-change-review`, `/vcr2-feature-forge`, `/vcr2-release-gate`. Two-key rule, scales and
  costs: `vcr2-verification-protocol`. Tell Axel the scale before any run above 50 agents.
- **Hooks** (`.claude/hooks/`, wired in `.claude/settings.json`): `guard.mjs` blocks hand edits of
  `index.html`, edits of `LICENSE` and real-looking secrets; `after-edit.mjs` rebuilds and runs the
  engine tests after each source edit and reports failures; `session-start.mjs` prints the branch
  and the next step. Fix what a hook reports; never work around it. To pause the after-edit check
  during a long refactor, set `"VCR2_HOOK_TESTS": "0"` under `env` in `.claude/settings.local.json`
  and remove it afterwards.
- **Reports** go to `docs/overhaul/verify/`; security reproduction details only to
  `docs/overhaul/verify/private/` (git-ignored: the repository may be public); scratch files to
  `docs/overhaul/verify/scratch/` (git-ignored).

## Working invariants and the 18 lean skills (added 2026-10-12)

Short skills for everyday work, on top of the 150 above (general-purpose ones live in `~/.claude/skills`):
- Provenance on every value: `provenance-invariant`. Rubric version bump on any threshold or weight change: `rubric-versioning`.
- Fixtures and the full suite pass before every commit: `fixture-regression` (`for t in tests/*.test.mjs; do node "$t"; done`).
- Live registries, never stale lists: `node tools/registry.mjs metrics|checks|thresholds`.
- Metrics and checks: `metric-spec-guard`, `consistency-check-registry`, `gap-severity-model`, `unit-period-normalization`, `parser-fuzzing`.
- Trust: `determinism-guard`, `explainability-trace`, `confidence-and-completeness`, `stage-calibration-audit`, `benchmark-honesty`, `sensitivity-analysis`, `adversarial-deck-defense`, `diligence-question-quality`.
- Presenting: `demo-readiness`, `vc-qa-prep`.
- Minimal diffs, terse output, verify before claiming done: the general skills `efficient-work` and `minimal-change`.
