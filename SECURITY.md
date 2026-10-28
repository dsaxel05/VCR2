# Security Policy

## How VCR2 handles data

- VCR2 is a static, client-side application. There is no VCR2 backend.
- Customer ledgers, monthly financials, derivations, consistency checks, forensic tests, the simulation and the score all run locally in the browser.
- The optional AI features (figure extraction, AI library import, memo narrative) send only the text involved to the model provider you select, using your own API key.
- **The AI resource rule.** The site owner's resources are never used: no key, token, account, proxy or paid service of the owner is in the source, the build, the Studio configuration, the tests or the git history. The AI features are off until a visitor pastes their own key; it stays in that visitor's browser, goes only to the provider they chose and only after they click, and is never written to a deal, an export, a library backup or the published configuration. Nothing is billed to the site owner. `python tools/key_scan.py` checks the tree, the build and the full history; `tests/browser/ai_rule_test.py` proves the network behaviour with fake keys and mocked calls.
- Drafts and the library are stored in your browser's `localStorage`. An AI key is kept in the tab only (`sessionStorage`) and is forgotten when the tab closes, unless you tick “Remember this key on this computer”; “Forget the key” removes it from both. A key is never part of a draft, an export, the library or a library backup. Clear site data to remove everything.
- A Content-Security-Policy (a `<meta>` tag, the first thing in the page, because GitHub Pages cannot set headers) limits the page to its own files (including the home page demo video and its captions, which are fetched only when play is pressed), `api.github.com` (Studio only) and the five AI provider hosts, and a no-referrer policy is set. Script blocks run only if they are this build's own: the policy lists the SHA-256 of each one, so an injected `<script>` element, a `javascript:` link or a script inside a frame is refused by the browser even if escaping ever failed. Click handlers stay inline (`script-src-attr`). Frames, plugins, form posts, `<base>` changes and `eval` are refused, and so is every request or image to any other host. `frame-ancestors` cannot be set from a meta tag; the page hides itself instead (below).
- All user-supplied and model-supplied text is escaped before it is rendered. `tests/browser/xss_sweep_test.py` plants hostile markup in every way outside text enters (a shared deal file, ledger and financials files and their names, the library, AI replies, the published configuration, a configuration imported into the Studio, the Studio's history) and opens every view; nothing planted may run or appear as live markup. `tests/browser/csp_test.py` checks the policy itself, as the browser enforces it.
- Excel files are read in the browser by VCR2's own reader; nothing is uploaded. A workbook that inflates beyond a fixed budget, or holds more than a fixed number of text cells, rows or cells, is refused, and a numeric cell longer than 40 characters is not parsed. A figure above 10 trillion (or more than 60 years to exit) is limited and the report says so.
- A library backup is rebuilt from a whitelist of known fields on import and on load, so a malformed or hostile backup cannot break the page.
- Text replacements made in the Studio are plain text only (never markup). They skip the Studio page and any dialog opened from it, they are matched against visible text and a fixed list of descriptive attributes (title, aria-label, placeholder, alt), never against attributes that execute, and a chain of replacements that would grow a text without end is stopped. A report, memo or export says how many wording replacements the owner has set.
- Configuration ids such as `constructor` or `__proto__` are refused, and a calculation or condition longer than 1,000 characters is refused whole rather than cut short.
- A page that another site frames hides itself.
- Sending figures to an AI provider is chosen in each session; the choice is not remembered.
- **Shared origin.** On the free `<name>.github.io` address every GitHub Pages project of one account shares one origin, so another page on that account could read this site's `localStorage`; on its own domain (vcr2.app) VCR2 has an origin of its own. Do not publish other projects on this account, or serve VCR2 from its own domain.

## The live site is watched

`.github/workflows/live-check.yml` runs `tools/live_check.py` every six hours: https://vcr2.app/ must serve, byte for byte and over a valid certificate, the page, the configuration, the logos and the fonts that this repository holds. Code tests cannot see a hijacked domain, a changed DNS record or a page altered outside the repository; this check can, and GitHub emails the owner when it fails.

### If the live site check fails

1. If you published in the last half hour, run the check again from the Actions tab (Run workflow): the hosting may still have been updating.
2. Otherwise open https://vcr2.app/ in a private window and compare it with the repository. Check the DNS records at the domain registrar and the custom domain under Settings > Pages.
3. If anything is not yours: turn off GitHub Pages for the repository (this takes the site offline), change the GitHub and registrar passwords, revoke every token at github.com/settings/personal-access-tokens, and only then restore the DNS records and turn Pages back on.

## Owner Studio

- The published configuration (`radar-config.json`) can only be changed by committing to the repository. The Studio does this through the GitHub API with a fine-grained token that the owner creates, limited to this repository and to “Contents: Read and write”.
- The Studio unlocks only after GitHub confirms that the token belongs to the repository owner and has write access. The token is kept in session storage (or local storage if “Keep me signed in” is ticked) and is sent only to `api.github.com`, and only for this repository: owner and repository names are plain names (never a path or a `..` step), whatever a configuration file says.
- Every entry in the configuration is validated on load: names must be plain identifiers, text is escaped, unknown keys are dropped, and a malformed file falls back to the built-in engine.
- Formulas are parsed and evaluated by a small interpreter with no access to anything but the assessment's numbers and text. Nothing is passed to `eval` or `Function`.
- Publishing never overwrites a newer version silently: the Studio sends the file's current revision and stops if it changed.

## Recommendations for users

- Use a restricted, low-spend API key created just for this tool.
- Do not paste confidential or regulated material into a provider you have not cleared for it.
- Leave the AI provider on "Deterministic only" when you only need the analysis, nothing leaves the browser.
- Export the library as a JSON backup; browser storage can be cleared.
- Owner: give the Studio token an expiry, limit it to this one repository, and don't tick “Keep me signed in” on a shared computer. Revoke it at github.com/settings/personal-access-tokens if it is ever exposed.

## Reporting a vulnerability

Please open a private report via **Security → Report a vulnerability** on this repository. Do not open a public issue for security problems.
