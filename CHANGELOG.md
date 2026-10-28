# Changelog

## v5.0.5: 2026-10-28

The home page now shows a demo video. Scoring is unchanged (rubric 5.0.0, same run IDs).

### Added
- **A demo video on the home page**, between the first screen and the figures row: "VCR2 in under three minutes", a 2 minute 43 second guided tour of the Series A example, from the raw files to the questions you put to the founders. A round play button sits on a poster of the report; a new "Watch the demo" button next to the two start buttons scrolls to the video and plays it. Captions are included (CC button in the player), and the video can be downloaded under the player.
- **Nothing is loaded until play is pressed.** The video is not fetched on page load (only a small poster is), it never starts by itself, and it is served from the site itself like everything else. If it cannot be loaded, the page says so in plain words and the play button comes back.
- The browser security policy gained `media-src 'self'`: video and captions only from the site itself. A test plants a video and an audio file from another host and checks the browser refuses them.
- The live site check (every six hours) also compares the video, its captions and its poster with the repository.
- A size budget for the video folder (30 MB), so a large file cannot be added by accident.

### Under the hood
- The build strips a few more pointless spaces in code (before `{`, after `)` or `}` before a word, after a colon, and between `if`, `for`, `return` and the `(`), never inside a string, template or regular expression; `tests/jsstrip_test.py` covers each rule. Four unused style rules and six unused tokens were removed. Together they kept the page inside its size budget with the new section.
- Tests: `tests/browser/demo_video_test.py` (29 checks: the files, streaming layout, no download before play, both play buttons, keyboard, failure message, phone layout, and in a browser that can decode H.264 real playback and caption timing).

## v5.0.4: 2026-10-26

A new look on every page, "golden warmth and soft pastels". Look and feel only: scores, run IDs, data flow and element IDs are unchanged (rubric 5.0.0).

### Changed
- **The page**: ivory with a soft brass glow top right, fine paper grain and three pastel lights (sage, apricot, butter) drifting slowly. On phones the lights stand still and nothing is blurred, so scrolling stays smooth.
- **Cards, panels, tables, dialogs, toasts and banners** are frosted ivory with 20 px corners, a gold hairline and a soft green shadow; the main ones (the home page example, the report header, dialogs, the Studio sign-in) carry a second gold ring. Cards you read one by one lift a little under the pointer. Figure tiles carry a thin bar on top: gold, emerald when the figure is good, coral when it is a warning.
- **Buttons are pills**: the primary one deep green with a light sheen every 5 s, the others with a brass edge that turn green under the pointer. Tabs, icon buttons, chips and the current section in the sidebar speak the same language. A chosen chip, a figure taken from the ledger and a received checklist item carry an emerald check.
- **Fields** are rounded with a soft hover and a brass focus ring; the form groups its fields in frosted cards and the page navigation floats at the bottom as a pill bar.
- **Colours**: deep green, brass and ivory stay the identity; emerald marks good values and coral marks mismatches, warnings and flags. Every text colour passes WCAG AA in light and night (the night theme was adapted to match).
- **Motion** (transform and opacity only, none under "reduce motion"): each page fades up in a cascade when it opens, and the headline word shimmers slowly in gold.
- **Headline figures count up** to their value when they first appear (report tiles, score, gate and finding counts, form progress, section counters, verification and library figures, and the home page example counting from 134% down to 98.8%), once per figure per page view. The true value is in the page text from the start and never changes: the counting digits are drawn over it, so screen readers, copy, print, the memo, exports, the library and every test see the exact figure.
- **Corners**: round is now the built-in shape; the Studio (Look & feel) still offers softly rounded and square.
- The print memo stays plain: white paper, no lights, no blur, no motion. The three print stylesheets were merged into one that uses named print colours.

### Fixed
- In the night theme, "Score withheld" in the report header was drawn in the page colour and could not be seen.
- An invalid healthy-range row in the Studio was reported in a pale pink that was unreadable on ivory; it now uses the coral text colour.

### Under the hood
- Every colour and corner in the component stylesheets comes from a token (`tests/browser/motion_test.py` fails on a hard-coded one). 287 declarations that a later identical rule always overrode were removed (screenshots before and after are identical), and the build strips more spaces in code, so the page stays inside its size budget.
- Tests: `tests/browser/motion_test.py` (20 checks); updated expectations for the new look in `comfort_test.py`, `config.test.mjs` and `jsstrip_test.py`.

## v5.0.3: 2026-10-26

A security release, from a full audit of the site. No weakness that could expose a visitor's data was found; this release adds walls behind the ones that already held. Scoring is unchanged (rubric 5.0.0, same run IDs).

### Security
- **Script blocks run only if they are the page's own.** The security policy now lists the SHA-256 fingerprint of each script in this build (`build.py` computes them). An injected `<script>` element, a `javascript:` link or a script inside a frame is refused by the browser, even if text ever slipped past escaping. The policy is now the first thing in the page and also refuses every frame.
- **The Studio's GitHub token can only reach this repository.** Owner and repository names must be plain names, never a path or a `..` step, and a branch name may not hold one either, whatever a configuration file says.
- **The live site is watched.** Every six hours a GitHub check (`tools/live_check.py`) confirms that https://vcr2.app/ serves exactly the files in this repository over a valid certificate. A hijacked domain or a page changed outside the repository makes it fail, and GitHub emails the owner. SECURITY.md says what to do then.
- **Exact test tool versions in CI.** The browser workflow installs Playwright from `requirements.txt` instead of the latest release.

### Tests
- `tests/browser/xss_sweep_test.py` (72 checks): hostile markup in a shared deal file, ledger and financials files and their names, the resume card, the library (backup, CSV, AI import), AI replies (extraction, memo), the published configuration, a configuration imported into the Studio and the Studio's history; every report view, the memo, the founder email, the library and all 29 Studio tabs and their editors are opened. Nothing planted may run or appear as live markup.
- `tests/browser/csp_test.py` (20 checks): the policy as the browser enforces it, against planted scripts, links, frames, requests, image beacons and framing by another site.
- `tests/browser/live_check_test.py` (6 checks) and `tests/security-round3.test.mjs` (repository names, and the formula interpreter against property access, calls, deep nesting and overflow).

## v5.0.2: 2026-10-25

### Changed
- **The site now lives at https://vcr2.app/.** The link-preview image address (`site.json`), the README and the Studio guide use it. The Studio still publishes to the same repository, so nothing changes for publishing.
- **A new logo: the VCR2 seal.** It marks the sidebar, the browser tab (favicon, with an Apple touch icon), the README header (with a dark-page variant) and the link-preview picture (1280 by 640). The files are in `assets/logo/` and are loaded from the site itself: no third-party request, and the page itself got smaller because the old inline mark and the data-URI favicon are gone.

## v5.0.1: 2026-10-21

A patch: plainer wording, an autosave that cannot lose your work, and one button to start clean. Scoring is unchanged (rubric 5.0.0, same run IDs).

### Changed
- **No dashes in the text.** Em dashes, en dashes and spaced hyphens used as sentence dashes are gone from everything you can read: labels, help, toasts, errors, the report, the memo (screen, print and Markdown), the founder email, the exports, the Studio, the home page, the README and the other documents. Sentences were rewritten, not just searched and replaced: asides are in parentheses, ranges read "5 to 10", and an empty value reads "n/a" everywhere. The built-in voice of the AI memo now also says not to use em dashes or en dashes. A test (`tests/browser/dash_test.py`) fails if one comes back.

### Fixed
- **An example can no longer replace your draft.** Opening an example used to overwrite the saved draft. Examples now live in memory only, autosave is off while one is open, and a note says "Example data, not saved". Going back to the home page closes the example and your own draft is intact.
- **Resuming is obvious.** When a draft exists the home page shows a "Continue your assessment" card with the company name, how much of the form is filled and when it was last edited. Nothing jumps by itself. The top bar shows a quiet "Saved in this browser" with the time.
- **A ledger too large for browser storage** now gets a plain message: what was saved (answers, notes, assumptions), what was not (the uploaded ledger), and that Export .json keeps everything.

### Added
- **Reset all inputs**, on the home page next to the Continue card and at the bottom of the sidebar (the "New assessment" button on the report does the same). The confirmation lists exactly what is deleted and says it does not touch the library, the Studio settings, the theme, the text size or the AI key. It also stops any simulation still running, so no old report comes back.
- Tests: `autosave_test.py` (30 checks), `dash_test.py` (7 checks).

## v5.0.0: 2026-10-21

A rebuild of how companies are scored and of how the site looks, found and checked by independent reviews. Rubric **5.0.0**: scores change, mostly downwards by 5 to 10 points on the same inputs because figures without a source now count for less; the order of companies is broadly kept; four companies move past others (the leaky-bucket and subsidised-marketplace archetypes rise above the flat and the burning ones, and the clean seed AI example falls below the Halcyon sample).

### Scoring
- Lower-is-better metrics use the mirrored curve the documentation always described (100 / 72 / 45 / 0).
- Boundary cases are scored instead of dropped: a company that is not burning, burns with no growth, has no gross profit or no churn can no longer score higher than a better one.
- Evidence now changes the score: good figures without a strong source are pulled towards 50, bad news is taken as stated, and inputs behind a failed check count as barely evidenced. Owner setting: off, gentle (default) or strict.
- CAC payback and LTV use new-customer contract value; LTV lifetime is capped at five years (setting); burn multiple uses twelve months of burn when monthly financials are loaded.
- Related metrics share their weight (cap of twice the largest, setting).
- AI applications have their own gross-margin ranges.
- Every score is explained: “What drove this score” and the score before and after the evidence adjustment.
- A stated figure against a computed zero is a discrepancy; the stage-mismatch flag fires earlier.

### Fixed
- **Found by an outside review of the first release candidate (2026-10-15):**
  - The "Odds of next-stage bar" tile and the Runway tab no longer stay at "simulating in the background…" for good: a worker answer that arrives before the report is stored is kept and swapped in, the AI memo waits for the simulation, and a worker that has not answered after ten seconds is replaced by the same calculation run on the page (`tests/browser/sim_refresh_test.py`, 66 checks, http and file://).
  - One name per concept: **Form filled** (share of the form's fields entered) and **Scoring weight covered** (share of the rubric the figures reach), in the sidebar, the top bar, the report, the Scoring table and the exports.
  - Counts that explain themselves: the Findings tab says how many discrepancies there are and how many are material and minor; the gate is "N material discrepancies"; the direction-of-errors line says it counts the discrepancies that have a direction.
  - "1786% of the market reachable" and "161% of bottom-up TAM" are now plain sentences ("18 times the whole market reachable in five years", "1.6 times the bottom-up market").
  - The static page no longer names an old rubric; the Markdown export date is "15 Oct 2026"; a ledger or financials file that is refused keeps its reason under the drop zone, not only in a toast; the link-preview image address comes from `site.json` (so it follows your own domain) instead of being typed into the page.
  - The build also drops the spaces after commas and around `=` and `=>` in code (strings, templates, regular expressions and comments untouched): the page is 20 KB smaller (`tests/jsstrip_test.py`).
- **Found by the end-to-end company tests (2026-10-14):** a SAFE line that cannot be read is named in the deal notes instead of being dropped, and the SAFE list is a text area (it said "one per line" in a single-line box); a form with no revenue, no cash and no burn no longer gets a 120-month runway and a Strong score; the overview tiles say "no growth" and "not burning" instead of 99.00 and 120 months; invoices on two annual billing dates are read as a ledger.
- **Accessibility (axe-core scan, 2026-10-14):** every field has a name, every page has one h1 and no skipped heading level, navigation landmarks are named, scrolling tables can be reached by keyboard, the cohort heatmap and the status text read at 4.5:1 in both themes. A second pass closed the last findings: every strip of report tabs keeps a keyboard stop, empty table headers carry a hidden name, headings never jump from level 1 to 3, and tables with the same name are numbered; the scan now finds nothing.
- **Runway simulator:** a simulated path that reached the next-stage bar could never run out of cash, so fast-burning companies showed “36+ months”. Cash-out is now the first month cash goes below zero, whatever revenue did.
- **A list of SAFEs** (amount, cap, discount per line) converts each at its own price; before, one aggregate cap approximated them and understated the SAFE stake in a tenth of cases.
- **Deal inputs** that are impossible (a negative preference, a pool of 100 %, a prior stake of 150 %, a dilution of 120 %…) are kept inside what a deal can be, and the report says what was changed.
- **Default alive** now holds expenses flat, as Paul Graham's test does (setting to let them grow); before, expenses grew at their recent rate under the same name.
- **Exit waterfall:** the unallocated option pool is no longer paid out as if it were common stock; its share goes pro rata to the issued shares (setting under Scoring constants → Returns).
- **SAFEs and notes:** post-money SAFEs are diluted by the option-pool top-up, as in YC's document; the note discount formula; no silent 60 % clamp; the note cap is measured on the existing shares (setting); the SAFE cap field asks for total amount ÷ Σ(amount ÷ cap).
- **File readers:** European numbers (1.200), day-first dates, French abbreviated months, quarterly columns, lists of invoices and cash-flow columns with a fundraise are no longer misread.
- **Forensics:** far fewer false alarms on clean ledgers (one-month customers 45 % → 7.5 % on flat ledgers, final-month spike 15 % → 7.5 %, cohort decay 17.5 % → 0 %) and a pull-forward split over two months is now seen without flagging fast-growing honest companies (7 to 14 % net monthly growth: 0 of 40 clean ledgers flagged, before 18 % to 95 %); the optimism test counts related discrepancies once.

### Privacy and security
- No Google Fonts request: the fonts are served from the site (SIL Open Font Licence). The tour reports zero third-party requests.
- AI memo drafting is opt-in; before, a stored key sent the deal's figures by default.
- GitHub Actions pinned to commit SHAs, read-only permissions.

### Design
- **One identity, Private bank** (from the owner's style template): an ivory page and sidebar, deep-green ink and buttons, thin brass hairlines, Fraunces for display and figures and IBM Plex Sans for text (four self-hosted files), garnet kept for risk, and a night theme. The default theme is light, whatever the visitor's device prefers ("follow the device" is a Studio option). A double frame and a diamond divider appear only on the home page, the report header and the printed memo.
- **Compact and readable by design**: a 75% page scale (measured against the first approved look: the same screens are 30% shorter, the sidebar 26% narrower, spacing and control heights 25 to 35% smaller, text 19% smaller because it stops at the floors) with floors for the type: body text 16 px, form labels and table text 14 px, table headings and help text 13 px, nothing smaller than 13 px on screen, line height 1.6. One spacing scale (6, 12, 18, 30, 48 px), one-column forms with 39 px fields, and a quiet "5 of 12 filled" line. Secondary fields sit behind "More options", secondary table columns behind "Show details", secondary report views behind "More views", and AI assist and consistency detail behind a disclosure in the sidebar. Every empty field shows an example and every group a one-line guide.
- **Retractable sidebar**: a "Menu" button in the top bar (and Alt + M) hides the left menu so the form has the whole width. While it is hidden the top bar keeps the coverage percentage and a "Sections" list to jump between evidence sections; Previous and Next stay at the bottom of each section. On a phone or tablet the menu is a drawer that closes when a section is picked. The visitor's choice is kept in their own browser only; the owner sets the starting state in Studio > Look & feel > Sidebar on start.
- **Text size and page scale**: Normal (default), Large or Extra large text, and a page scale of 75% (default), 90% or 100%, set in Studio > Look & feel; each visitor can change the text size with the "Aa" button.
- New home page built around a real finding from the sample; icons instead of emoji; report tabs and navigation work with the keyboard.

### Owner Studio
- **Edit any text on the site**: click any wording and rewrite it; the change applies to the page, the memo, the markdown report and the founder email.
- **Scoring constants**: the scores at the four anchors, the cap on yes/no points, coverage for full weight, how withheld metrics are treated, the audited-tag cap, confidence cut-offs, the likely-range formula, display thresholds, exit growth floors, AI model names. Each shows its built-in value and a way back.
- **Built-in metrics are fully editable**: replace the calculation, move to another dimension, limit to business models, change the unit, edit banded ranges.
- **Add scoring dimensions and stages**; business models can start from a built-in one; choice fields can be scored; details of built-in items (quick picks, deal-breaker text and trigger, red-flag severity, checklist category, yes/no wording) are settings.
- Forensic thresholds, deferred-revenue, cash-vs-raise, concentration and every form-vs-ledger tolerance are settings like the other triggers.
- **Safety**: undo and redo, reset per item and everything, a list of what differs from built-in (also a sentence on every report), a review with the change list and the effect on the two examples before publishing, publish history with load-into-draft, an advanced JSON editor with live validation, and a fallback to the built-in rules if a setting ever breaks the engine.
- **Look & feel**: accent, frame, divider, default theme, text size, corners, the size of titles, figures and questions, which report views are in sight, and your own ink and line colours with a contrast guard.
- **Metrics measured together**: the groups that count as one signal are a setting (Weights & rules), next to the overlap cap.
- `docs/EDITING.md` lists what is and is not a setting.

### Questions, numbers and sources
- **Every generated question says what you do if it stays unresolved** (the lever): a built-in wording per question family, which you can change per family or per built-in deal-breaker, check and red flag, and on your own questions. It appears in the report and the memo and never in the founder email.
- **Numbers**: "1.200" with a currency sign, or with several dot groups ("1.200.000"), is read as a thousand-separated amount; a bare "1.200" or "1,200" is flagged as ambiguous instead of guessed. Text numbers in a saved assessment are read once with the same rules; ones that cannot be read are dropped and listed.
- **AI extraction**: a value is accepted only with the line of the source it came from; numbers returned as text follow the same rules; every refused value is reported with its reason.
- **Run hash**: computed over canonical numbers, so "1200000", "1200000.0" and "1.2e6" give one hash. It is now 16 hex digits (64 bits) instead of 8, so two different runs almost never share one. Run IDs written by earlier versions are not recomputed: a library entry saved before 5.0 keeps its 8-digit ID and is no longer recognised as the same run ("already in the library", and the comparison that leaves a company out of its own peer list). Saved assessments and drafts open unchanged.
- **Studio**: section descriptions can be renamed; a stage's weights have their own way back; the sign-in page says to use a 7-day token limited to this repository with Contents read and write only.

### Known issues
- **The longest task while the page loads is 344 ms under a 4x CPU slowdown (target 100 ms).** Largest contentful paint is 1.19 s (target 2.0 s). Fixing it means loading the Studio, the spreadsheet reader and the exports on demand, which ends the single-file page; this is the first job of v5.1.

### Performance
- The Monte Carlo simulation runs in a background worker and gives the same numbers; assessing a company takes 12 to 20 ms instead of 57 to 67 ms. Measured before and after.
- The generated page is about 50 KB smaller than the first v5.0 builds (comments and indentation removed from the scripts; the stylesheet is compacted and 72 unused and 662 overridden rules are removed, with a browser test that every rule still means the same; the readable sources are in `src/`).

### Security and privacy (additional)
- The AI key is kept in the tab only unless "Remember this key on this computer" is ticked; it is never in a draft, export or library.
- A library backup is rebuilt from a whitelist, so a malformed one cannot break the app.
- A Content-Security-Policy and a no-referrer policy; a spreadsheet that inflates beyond a budget is refused; very long numeric cells are refused; the Gemini key goes in a header; formulas over 1,000 characters are refused instead of being cut.

### Tests
- 400+ tests: 16 fictional companies with expected orderings, property tests, old-configuration fixtures, importer, forensic and deal-convention suites; browser suites run by one command; CI checks that `index.html` is a fresh build and enforces a size budget.

## v4.3.1: 2026-09-28

### Fixed
- The rubric version shown in the sidebar and on every report now reads **4.3.0**, matching the scoring changes shipped since 4.0 (it still read 4.0.0). Two reports with the same inputs and the same rubric version always have the same score.
- The home page understated the engine: it computes **65** derived metrics, not "40+".
- `build.py` works whether the source files sit in `src/` or next to the script.

### Added
- Link previews for the live site (Open Graph and Twitter cards): sharing the link on LinkedIn, iMessage, Slack or WhatsApp now shows the title, a description and the preview image.

## v4.3.0: 2026-09-24

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

## v4.2.1: 2026-09-24

### Added
- **Healthy ranges** tab in the Studio: every scored metric with its “good” bar at each stage in one table, a search box, and an editor that reads your values back in plain language, shows the built-in values alongside, and records why you changed them. Reports mark owner-set bars as “your standard”, with the reason on hover.

## v4.2.0: 2026-09-24

### Added
- **VC Method and First Chicago returns**: downside, base and upside exit cases with probabilities; multiple and IRR for each and probability-weighted; the post-money a target return justifies on the success case (VC Method) and on the probability-weighted value (First Chicago); the exit needed for the target return. Every default is shown and editable in the new **Exit scenarios** section.
- **Term-sheet review** against market standard: preference and participation (now with an optional cap), anti-dilution, dividends, redemption, pay-to-play, board control, pro-rata, information rights and board seat, plus the pool top-up and conversions.
- **Convertible notes** with simple accrued interest, converting on the pre-money at the lower of cap and discount; **capped participating preferred** in the waterfall, with exact convert-or-stay decisions for every class.
- **Gross burn**: runway if revenue stopped, and a new consistency check that gross burn − revenue equals net burn (29 checks).
- **Product-market fit and team signals**: Sean Ellis survey (scored, withheld below 30 responses), NPS, how essential the product is, main source of defensibility, patents, why now, years the founders have worked together, technical founder.
- **Tax and finance hygiene**: unpaid taxes gate the score; commingled funds, a missing 409A, D&O insurance and open-source review are recorded.
- **Risk map**: every signal grouped into product, market & timing, execution & team, financial & reporting, legal & regulatory, deal & structure, on the overview and in the memo.
- **Diligence checklist by stage**: ~60 items in ten categories, pre-filled from inputs and uploads, tracked per item, exported to the memo, Markdown and JSON, and extendable from the Studio.
- 11 new patterns (off-market terms, missing investor rights, price vs. target return, weak/strong product-market fit, discretionary product, unproven moat, new founding team, no technical founder, finance hygiene, no "why now").
- 113 engine tests, run in CI on every push.

## v4.1.0: 2026-09-24

### Added
- **Owner Studio** (`/#studio`): add evidence fields, formula metrics (scored or informational), stated-vs-computed checks, conditional questions, patterns and document requests; switch off or rename any built-in item; retune thresholds, weights, sample-size minimums, the next-stage ARR bar and the score-blocking rule; edit the home-page texts. Drafts preview in the owner's browser only and publish to the live site by committing `radar-config.json` through the GitHub API. Access is limited to the repository owner with write access, and publishing refuses to overwrite a newer revision.
- **Safe formula language** with arithmetic, comparisons, `and`/`or`/`not`, `min max abs round sqrt has coalesce if`, text comparisons and three-valued logic, so missing data is never treated as zero. Live validation in every formula box.
- **Excel upload** (.xlsx/.xlsm) for the ledger, monthly financials, narrative files and library import, read by a dependency-free reader in the browser (shared and inline strings, date formats, 1904 dates, percentages, formulas' cached values, best-sheet selection).
- `radar-config.json`, `docs/STUDIO.md`, an Excel version of the example ledger, and configuration tests (81 engine tests in CI).

### Changed
- The rubric version now records any configuration that changes scores (`4.0.0+cfg.xxxxxx`).
- The founder email always includes the owner's own questions and document requests.
- Opened assessments, drafts and library backups are validated field by field before use, and simulation settings are bounded.

## v4.0.0: 2026-09-24

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
