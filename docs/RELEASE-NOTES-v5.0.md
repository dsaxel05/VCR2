# VCR2 v5.0.0: release notes

Released 2026-10-14. Replaces v4.3.1.

## In one paragraph

v5.0 makes the scores explainable and the site entirely yours to change. Good figures without a source now count for less, every point
of a score is explained, the bars show where they come from, and nearly everything (metrics, questions, titles, thresholds, even the
look) is a setting in the Owner Studio. The look is new: an ivory page, deep-green ink, thin brass lines, large readable type.

## What is new for people who use the site

- **A calm, compact, readable look.** Ivory page and sidebar, 16 px body text (labels and table text 14 px, nothing under 13 px), one-column forms,
  a "5 of 12 filled" line, an example in every empty field, secondary fields behind **More options**, secondary table columns behind **Show details**,
  secondary report views behind **More views**. The whole page is at a 75% scale by default so more fits on a screen.
  An **Aa** button changes the text size (Normal, Large, Extra large) for the visitor; the night theme is one click away.
- **Scores you can explain.** "What drove this score" lists what pulled the score up or down, with the score before and after the evidence adjustment.
- **Evidence counts.** A good figure that rests on a founder's word is pulled towards 50; bad news is taken as stated.
- **Better numbers.** European numbers ("1.200"), day-first dates and French month names are read correctly; a number that cannot be read safely is flagged, not guessed.
- **One name: VCR2.** The sidebar, the browser-tab title, the report, the memo, the exports, the Studio and the documents all say VCR2 (the old name "VC Risk Radar" and the short name "Radar" are gone from everything a visitor reads).
- **Every generated question says what to do if it stays unresolved.**
- **Fewer false alarms** in the forensic tests on clean ledgers, and a pull-forward split over two months is now seen.
- **Fixes in the deal maths:** the runway simulator, lists of SAFEs, impossible deal inputs, "default alive", the exit waterfall, SAFE and note conversion.

## What is new for you, the owner (Studio)

- **Edit any text** on the site, and the memo, the markdown report and the founder email follow.
- **Replace any built-in metric's calculation**, move it to another dimension, limit it to business models, change its unit and its healthy ranges.
- **Add dimensions, stages and business models**; score the answers of choice fields; change the details of built-in items.
- **Metrics measured together** (groups) and the overlap cap are settings; **the browser-tab title** is a setting (Home page texts).
- **Retractable sidebar:** a "Menu" button in the top bar and Alt + M hide the left menu; while it is hidden the top bar keeps the coverage percentage and a "Sections" list. On a phone or tablet it is a drawer. The choice stays in the visitor's browser only. Studio > Look & feel > Sidebar on start sets the starting state.
- **Look & feel:** accent (brass, garnet, emerald), frame, divider, default theme (light by default), **text size**, **page scale (75 / 90 / 100%)**, **corners**, the **size of titles, figures and questions**, and **which report views are in sight**, plus your own ink and line colours with a contrast guard.
- **Safety:** undo and redo, a reset beside every value, a list of everything that differs from built-in, a review with the effect on the two examples before publishing, publish history, and an advanced JSON editor.
- **AI prompts' voice and extra instructions** are settings; the safety rules stay fixed.
- `docs/EDITING.md` lists exactly what is and is not a setting, with a ready-to-paste instruction for the few that are not.

## What changes in the scores

Rubric **5.0.0**. Scores move, mostly down by 5 to 10 points on the same inputs, because figures without a source now count for less. The order of companies is
broadly kept. The new scores are explained in the report and in `docs/METHODOLOGY.md`.

## Upgrading from 4.x: things to know

- **Run IDs are 16 hex digits now** (they were 8), so two different runs almost never share one. IDs written by earlier versions are not recomputed: a library entry saved
  before 5.0 keeps its 8-digit ID and is no longer recognised as "already in the library". Saved assessments and drafts open unchanged.
- **Your published configuration keeps working.** Files written by v4.0 to v4.3.1 are read as before (fixtures for every version are tested). A configuration that names one of the
  three earlier look identities simply uses the new one.
- **The default theme is light**, even if the visitor's device prefers dark. "Follow the visitor's device" is an option in Look & feel.
- **Library backups and exports** from earlier versions still import.
- Nothing you enter leaves the browser; there is no outside request at runtime; fonts are served from the site.

## The AI resource rule, and the proof

**The rule.** The site never uses the owner's resources.
1. No API key, token, account, proxy, serverless function or paid service of the owner is used, bundled, hard-coded, defaulted or embedded anywhere: source, build, assets, Studio configuration, documents, tests, git history.
2. AI extraction, AI import and the AI memo are **off by default**. They work only if the visitor pastes **their own key**. Nothing is billed to the owner: no shared key, no shared proxy, no free tier the owner would pay for.
3. A visitor's key stays in that visitor's browser (this tab by default; this computer only if they tick "Remember this key"). It goes only directly to the provider the visitor chose. It is never put in a deal, an export, a library backup, a published configuration, and is never logged. The owner's GitHub token (Studio) is separate and is never used for AI.
4. Next to "Extract figures with AI", next to the AI memo option and in the library's AI import, the page says: "Uses your own key and your own account. Nothing is billed to the site owner." With no key, the button explains this in plain words instead of failing silently.
5. Tests use only fake keys (`'sk-' + 'A' * 40`, `'github_pat_' + 'A' * 60`) and mocked network calls. No real call is made to any AI provider.

**The proof** (measured on this build, 2026-10-14):

| Claim | How it was checked | Result |
|---|---|---|
| No key in the working tree, the build or the history | `python tools/key_scan.py --package <folder>`: key-like strings (sk-…, github_pat_…, ghp_…, AIza…, gsk_…, xox…, AKIA…, private-key headers) in every tracked file, `index.html`, `assets/`, the package (MANIFEST included, and the zip inside it) and all 125 commits of every branch | **clean, 0 matches** |
| No request leaves the page unless the visitor supplied a key and clicked a button | `tests/browser/ai_rule_test.py`, 21 checks: load, analysis with the memo option off and a key present, library, exports: no request outside the site's own address; after one click on "Extract figures with AI": exactly one request, to the chosen provider, carrying the visitor's key; the AI memo is a second, separate opt-in | **21 / 21** |
| No key is stored in a deal, an export, a library backup, a memo, a draft or an address | same suite, plus `tests/browser/privacy_test.py` | **pass** |
| The published configuration cannot carry a key or a token | a key typed in the model-name setting is dropped; Publish and "Save as file" are refused when the configuration contains anything key-like; nothing is written to GitHub | **pass** |
| No real AI call while testing | every provider address is mocked in the suites; the keys are fake | **by construction** |

**Which provider addresses the security policy allows** (`connect-src` in the page's Content-Security-Policy), and when each is used:

| Address | Used for | Used only after |
|---|---|---|
| the site itself (`'self'`) | the published configuration file, fonts | page load (no data sent) |
| `https://api.anthropic.com` | AI calls, if the visitor chose Anthropic | the visitor pasted their key and clicked an AI button |
| `https://api.openai.com` | same, if the visitor chose OpenAI | same |
| `https://generativelanguage.googleapis.com` | same, if the visitor chose Gemini | same |
| `https://api.groq.com` | same, if the visitor chose Groq | same |
| `https://openrouter.ai` | same, if the visitor chose OpenRouter | same |
| `https://api.github.com` | the Studio only: reads and publishes the configuration with the owner's own token | the owner signed in to the Studio |

There is no share-link feature, so there is no link that could carry a key.

## Fixed after an outside review of the first release candidate (2026-10-15)

- **The simulation always reaches the report.** "Odds of next-stage bar" and the Runway tab could stay at "simulating in the background…" for good when the background answer came before the report was stored. The answer is now kept and swapped in, the AI memo waits for it, and a worker silent for ten seconds is replaced by the same calculation on the page. Tested with a worker answering after 0, 150, 300, 500, 1,200 and 3,000 ms and never, with and without the (mocked) AI memo, over http and from disk.
- **One name per concept.** "Form filled" is the share of the form's fields entered; "Scoring weight covered" is the share of the rubric the figures reach.
- **Counts that explain themselves.** The Findings tab says how many discrepancies there are and how many are material and minor; the withheld-score gate is "N material discrepancies"; forensic flags are counted in their own tab.
- **Plain sentences.** "1786% of the market reachable" became "18 times the whole market reachable in five years".
- **Small items.** The static page no longer names an old rubric; the Markdown export date is "15 Oct 2026"; a refused ledger or financials file keeps its reason under the drop zone; the link-preview image address comes from `site.json` (your own domain: change that one value and rebuild). A missing `radar-config.json` makes the app start on the built-in rules and log nothing itself; the browser prints its own one-line "404" for the missing file, which no page script can suppress.

## Known issues

1. **The longest task while the page loads is about 340 ms under a 4x CPU slowdown** (target 100 ms); the largest contentful paint is 1.16 s (target 2.0 s). Fixing it means loading the Studio, the spreadsheet reader and the exports on demand, which ends the single-file page. It is the first job of v5.1.
2. **Not yet settings (planned for v5.1):** the rules that read a term sheet, separate healthy ranges for a stage you add (an added stage is scored like the built-in stage you pick), and the order of blocks inside one report view. The icon drawings stay fixed by your decision.
3. **Library entries saved before 5.0** are not recognised as the same run (see above).

## What comes next (v5.1)

1. The Studio moves into its own file, loaded only at `#studio`: it frees about 49 KB compressed on the page and fixes the page-load task above. Every Studio feature and the publish flow stay as they are.
2. Document import, with a confirmation screen and no key needed: drop several files or one .zip (a), a figure finder for text, DOCX, PPTX and text PDFs with the source line and a one-click accept (c), an import report (e), then column mapping with presets for Stripe, Chargebee, QuickBooks, Xero and Paddle (b) and plain-language fixes (f). A scanned PDF is said so in plain words, with the choice to paste the text or use your own key.
3. Then, one at a time, each with its Studio controls: the evidence trail, the publication-quality memo, the scenario lab.

## What was checked

- 1,626 Node checks in 28 suites, 25 build-tool checks and 562 browser checks in 17 suites pass on this build (the two new suites are `sim_refresh_test.py` and `clarity_test.py`).
- 92 colour pairs pass WCAG 2.2 AA in both themes; no chart relies on colour alone.
- **Zoom-out check** against the look you first approved (measured in a real browser at 1360 px): the page scale is 75 % by default; the same screens are 30 % shorter (2,447 px to 1,707 px for the same content), the sidebar is 26 % narrower, spacing and controls are 25 to 35 % smaller. Text is 19 % smaller, not 25 %, because it stops at the readability floors: body 16 px (was 19.8), labels and table text 14 px (was 16.5), nothing under 13 px (was 15.4). The floors measured exactly that on every screen.
- A layout scan of every screen at phone, tablet and desktop width, at Normal and Extra large text, finds nothing wider than the screen and nothing smaller than 13 px.
- The page is 815.9 KB against a budget of 840 KB (246.2 KB compressed against 248 KB); the build now also drops the spaces after commas and around `=` and `=>` in code, which made room. The retractable sidebar fits by removing dead code and unused tokens, by shortening the build's output (comments and indentation of the page shell) and by a short helper for the most repeated lookup; no feature was removed.
- 39 end-to-end tests through the real interface (20 invented companies on Chromium, Firefox and WebKit, 6 real public companies kept private, 13 Studio scenarios: undo, reset, invalid edits) found five product bugs, all fixed with a test first.
- An automated accessibility scan (axe-core, 18 screens, light and night, desktop and phone) finds no violation of any level after the fixes. A screen reader and a real Safari device were not tried.
- A red-team round found security issues; the code defects among them are fixed, each with a regression test.
- The package rebuilds byte for byte from its source.
