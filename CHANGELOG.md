# Changelog

## v4.3.0 — 2026-09-24

Everything that decides how a company is judged can now be changed from the Owner Studio, without touching code.

### Added
- **Start page** in the Studio: pick what an investor told you (“a different value is healthy”, “this should stop a deal”, “a red flag should fire earlier”…) and land on the right screen. The tabs are grouped into *How companies are judged*, *Add your own*, *Built-in items* and *Site*.
- **Deal-breakers of your own**: a condition that withholds the score while it is true, with the reason, the question for the founders and its place on the risk map. They appear at the top of the report, the memo, the question list and the founder email.
- **Scored answers**: the score each choice earns (SOC 2 status, financial statement quality, switching cost, pricing action, regulatory model, how essential the product is), its weight, and the points of every yes/no answer.
- **Defaults & assumptions**: years to exit, target return and case probabilities by stage, the First Chicago rate, how fast growth slows in each case, the downside multiple, exit multiple, dilution, option pool, further rounds, the runway simulation, the stage ARR ranges and how much each source of evidence counts. Field hints quote the values in force.
- **Red-flag triggers**: every number behind every built-in red flag and strength, and the term-sheet norms (preference, board seat, pool top-up, conversions).
- **Check tolerances**: how far a stated figure can be from the computed one before it is a minor inconsistency or a material contradiction, for each built-in check.
- **Benchmark data**: publish medians and quartiles with their source, one at a time or by pasting rows; every report shows where the company sits (bottom quartile to top quartile).
- **Business models of your own** (hardware, consumer, biotech…), offered on the setup page; your inputs and metrics can be limited to them.
- **Checklist categories of your own**, and renaming of built-in sections, dimensions, red-flag titles, deal-breaker titles and checklist items.
- 178 engine tests.

### Changed
- The rubric version ignores the order in which items were switched off or edited: the same configuration always gives the same version.
- The Studio shows the value the site will actually use when a default is out of range, and refuses inconsistent stage ranges and all-zero probabilities.

## v4.2.1 — 2026-09-24

### Added
- **Healthy ranges** tab in the Studio: every scored metric with its “good” bar at each stage in one table, a search box, and an editor that reads your values back in plain language, shows the built-in values alongside, and records why you changed them. Reports mark owner-set bars as “your standard”, with the reason on hover.

## v4.2.0 — 2026-09-24

### Added
- **VC Method and First Chicago returns**: downside, base and upside exit cases with probabilities; multiple and IRR for each and probability-weighted; the post-money a target return justifies on the success case (VC Method) and on the probability-weighted value (First Chicago); the exit needed for the target return. Every default is shown and editable in the new **Exit scenarios** section.
- **Term-sheet review** against market standard: preference and participation (now with an optional cap), anti-dilution, dividends, redemption, pay-to-play, board control, pro-rata, information rights and board seat, plus the pool top-up and conversions.
- **Convertible notes** with simple accrued interest, converting on the pre-money at the lower of cap and discount; **capped participating preferred** in the waterfall, with exact convert-or-stay decisions for every class.
- **Gross burn**: runway if revenue stopped, and a new consistency check that gross burn − revenue equals net burn (29 checks).
- **Product-market fit and team signals**: Sean Ellis survey (scored, withheld below 30 responses), NPS, how essential the product is, main source of defensibility, patents, why now, years the founders have worked together, technical founder.
- **Tax and finance hygiene**: unpaid taxes gate the score; commingled funds, a missing 409A, D&O insurance and open-source review are recorded.
- **Risk map**: every signal grouped into product, market & timing, execution & team, financial & reporting, legal & regulatory, deal & structure — on the overview and in the memo.
- **Diligence checklist by stage**: ~60 items in ten categories, pre-filled from inputs and uploads, tracked per item, exported to the memo, Markdown and JSON, and extendable from the Studio.
- 11 new patterns (off-market terms, missing investor rights, price vs. target return, weak/strong product-market fit, discretionary product, unproven moat, new founding team, no technical founder, finance hygiene, no "why now").
- 113 engine tests, run in CI on every push.

## v4.1.0 — 2026-09-24

### Added
- **Owner Studio** (`/#studio`): add evidence fields, formula metrics (scored or informational), stated-vs-computed checks, conditional questions, patterns and document requests; switch off or rename any built-in item; retune thresholds, weights, sample-size minimums, the next-stage ARR bar and the score-blocking rule; edit the home-page texts. Drafts preview in the owner's browser only and publish to the live site by committing `radar-config.json` through the GitHub API. Access is limited to the repository owner with write access, and publishing refuses to overwrite a newer revision.
- **Safe formula language** with arithmetic, comparisons, `and`/`or`/`not`, `min max abs round sqrt has coalesce if`, text comparisons and three-valued logic, so missing data is never treated as zero. Live validation in every formula box.
- **Excel upload** (.xlsx/.xlsm) for the ledger, monthly financials, narrative files and library import, read by a dependency-free reader in the browser (shared and inline strings, date formats, 1904 dates, percentages, formulas' cached values, best-sheet selection).
- `radar-config.json`, `docs/STUDIO.md`, an Excel version of the example ledger, and configuration tests (81 engine tests in CI).

### Changed
- The rubric version now records any configuration that changes scores (`4.0.0+cfg.xxxxxx`).
- The founder email always includes the owner's own questions and document requests.
- Opened assessments, drafts and library backups are validated field by field before use, and simulation settings are bounded.

## v4.0.0 — 2026-09-24

A rebuild of the engine around the company's own data.

### Added
- **Customer revenue ledger**: wide or long CSV, monthly MRR bridge that closes to the dollar, true cohort NRR/GRR and logo retention, cohort heatmaps (dollar and logo), cohort-quality trend, concentration (top 1/5/10, HHI), and one-click filling of the evidence form with provenance.
- **Forensics**: nine tests on billing data, each with its method and limits.
- **Monthly financials**: CMGR, acceleration, burn trend, expense growth.
- **Projections**: default-alive test and a seeded 4,000-path Monte Carlo with fan charts, runway distribution and capital needed at p50/p80.
- **Deal & returns**: pool shuffle, SAFE conversion, effective pre-money, ownership to exit, fund-returner test against bottom-up TAM, liquidation waterfall and payoff chart.
- **Pattern library**: 20+ compound risk and strength patterns, and a binomial optimism test on the direction of discrepancies.
- **Evidence tags** on every field, feeding an evidence-strength measure and the confidence band.
- **Business-model modules** for AI applications, marketplaces, fintech and SaaS.
- **Sensitivity**: tornado chart and "what would need to be true for 70+".
- **Library**: saved runs, CSV import, AI-structured import with review, percentiles against your own deals, rubric calibration on your library, change tracking between runs, JSON backup.
- **Exports**: print-ready IC memo (PDF), founder email, JSON export/import, Markdown.
- Model-name override for AI providers; engine tests and CI.

### Fixed
- Magic number was multiplied by four twice (net new ARR is already annualised). It now equals net new ARR in the quarter ÷ prior-quarter S&M.
- The "good" bar shown for lower-is-better metrics now matches the value that actually scores 72.
- Setup page layout for company name and date.

## v3.0.0
- Deterministic, versioned rubric; stated-vs-computed checks; stage calibration; provenance on extracted fields.
