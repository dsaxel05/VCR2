# Security Policy

## How VCR2 handles data

- VCR2 is a static, client-side application. There is no VCR2 backend.
- Customer ledgers, monthly financials, derivations, consistency checks, forensic tests, the simulation and the score all run locally in the browser.
- The optional AI features (figure extraction, AI library import, memo narrative) send only the text involved to the model provider you select, using your own API key.
- **The AI resource rule.** The site owner's resources are never used: no key, token, account, proxy or paid service of the owner is in the source, the build, the Studio configuration, the tests or the git history. The AI features are off until a visitor pastes their own key; it stays in that visitor's browser, goes only to the provider they chose and only after they click (a key whose format clearly belongs to another provider, or a GitHub token, is refused before anything is sent), and is never written to a deal, an export, a library backup or the published configuration. Nothing is billed to the site owner. `python tools/key_scan.py` checks the tree, the build and the full history; `tests/browser/ai_rule_test.py` proves the network behaviour with fake keys and mocked calls.
- Drafts and the library are stored in your browser's `localStorage`. An AI key is kept in the tab only (`sessionStorage`) and is forgotten when the tab closes, unless you tick “Remember this key on this computer for 7 days” (only on your own computer): the key is removed the first time the page opens after 7 days. “Forget the key” removes it from both. “Erase everything VCR2 stored in this browser” (in the menu, with an inline confirmation) removes every VCR2 entry from `localStorage` and `sessionStorage`, the library included, and reloads the page. An error message from a provider is shown without the key, whether it comes back as typed, URL-encoded, JSON-escaped, in base64 or in part. The form, the verification page, the report and the library carry `translate="no"`, so the browser’s translation feature does not send deal content to a cloud service. A key is never part of a draft, an export, the library or a library backup. Clear site data to remove everything.
- A Content-Security-Policy (a `<meta>` tag, the first thing in the page, because GitHub Pages cannot set headers) limits the page to its own files (including the home page demo video and its captions, which are fetched only when play is pressed), `api.github.com` (Studio only) and the five AI provider hosts, and a no-referrer policy is set. Script blocks run only if they are this build's own: the policy lists the SHA-256 of each one, so an injected `<script>` element, a `javascript:` link or a script inside a frame is refused by the browser even if escaping ever failed. The page has no inline event handlers at all (`script-src-attr 'none'`): buttons carry `data-*` attributes and one delegated listener (`src/actions.js`) runs only the actions on its explicit list. Trusted Types are required (`require-trusted-types-for 'script'; trusted-types vcr2`), so every write to `innerHTML`, `outerHTML`, the XML parser or a Worker goes through one policy in `src/core.js` (browsers without Trusted Types ignore this line). `tests/security/source-guards.test.mjs` fails if an inline handler, `eval`, a stray HTML sink, a looser policy or an undocumented storage key ever appears. Frames, plugins, form posts, `<base>` changes and `eval` are refused, and so is every request or image to any other host. `frame-ancestors` cannot be set from a meta tag; the page hides itself instead (below).
- All user-supplied and model-supplied text is escaped before it is rendered. `tests/browser/xss_sweep_test.py` plants hostile markup in every way outside text enters (a shared deal file, ledger and financials files and their names, the library, AI replies, the published configuration, a configuration imported into the Studio, the Studio's history) and opens every view; nothing planted may run or appear as live markup. `tests/browser/csp_test.py` checks the policy itself, as the browser enforces it.
- Excel files are read in the browser by VCR2's own reader; nothing is uploaded. A workbook that inflates beyond a fixed budget, or holds more than a fixed number of text cells, rows or cells, is refused, and a numeric cell longer than 40 characters is not parsed. A figure above 10 trillion (or more than 60 years to exit) is limited and the report says so.
- A library backup is rebuilt from a whitelist of known fields on import and on load, so a malformed or hostile backup cannot break the page.
- Text replacements made in the Studio are plain text only (never markup). They skip the Studio page and any dialog opened from it, they are matched against visible text and a fixed list of descriptive attributes (title, aria-label, placeholder, alt), never against attributes that execute, and a chain of replacements that would grow a text without end is stopped. A report, memo or export says how many wording replacements the owner has set.
- Configuration ids such as `constructor` or `__proto__` are refused, and a calculation or condition longer than 1,000 characters is refused whole rather than cut short.
- A page that another site frames hides itself.
- **HTTPS only.** "Enforce HTTPS" is on for the site (since 2026-11-02): the plain-http addresses of vcr2.app and www.vcr2.app, and the old GitHub Pages address, each answer with one permanent redirect to https://vcr2.app/, which has a valid certificate for vcr2.app and www.vcr2.app. GitHub Pages cannot send an HSTS header (it does not let a site set its own headers), so a browser is not told to refuse plain http in future; a first visit typed as http relies on that redirect. As a backup the page also moves itself to https if it is ever opened over http (local test servers are left alone). `tests/own-site-https.test.mjs` fails if a published file names the site over plain http or at the old address.
- Sending figures to an AI provider is chosen in each session; the choice is not remembered.
- **Shared origin.** On the free `<name>.github.io` address every GitHub Pages project of one account shares one origin, so another page on that account could read this site's `localStorage`; on its own domain (vcr2.app) VCR2 has an origin of its own. Do not publish other projects on this account, or serve VCR2 from its own domain.

## The live site is watched

`.github/workflows/live-check.yml` runs `tools/live_check.py` every six hours: https://vcr2.app/ must serve, byte for byte and over a valid certificate, the page, the configuration, the logos and the fonts that this repository holds. Code tests cannot see a hijacked domain, a changed DNS record or a page altered outside the repository; this check can, and GitHub emails the owner when it fails. `.github/workflows/uptime.yml` also checks once a day that the site answers, that its certificate has more than 14 days left, that the About page is there and that plain http still moves to https.

### If the live site check fails

1. If you published in the last half hour, run the check again from the Actions tab (Run workflow): the hosting may still have been updating.
2. Otherwise open https://vcr2.app/ in a private window and compare it with the repository. Check the DNS records at the domain registrar and the custom domain under Settings > Pages.
3. If anything is not yours: turn off GitHub Pages for the repository (this takes the site offline), change the GitHub and registrar passwords, revoke every token at github.com/settings/personal-access-tokens, and only then restore the DNS records and turn Pages back on.

## Owner Studio

- The published configuration (`radar-config.json`) can only be changed by committing to the repository. The Studio does this through the GitHub API with a fine-grained token that the owner creates, limited to this repository and to “Contents: Read and write”.
- The Studio unlocks only after GitHub confirms that the token belongs to the repository owner and has write access. The token is kept only in the tab's memory, never in any browser storage (a token an earlier version saved is deleted when the page loads), and is forgotten when the tab closes or reloads, after 15 minutes without activity and after each publish. It is sent only to `api.github.com`, and only for this repository: owner and repository names are plain names (never a path or a `..` step), whatever a configuration file says.
- Every entry in the configuration is validated on load: names must be plain identifiers, text is escaped, unknown keys are dropped, and a malformed file falls back to the built-in engine.
- Formulas are parsed and evaluated by a small interpreter with no access to anything but the assessment's numbers and text. Nothing is passed to `eval` or `Function`.
- Publishing never overwrites a newer version silently: the Studio sends the file's current revision and stops if it changed.

## Recommendations for users

- Use a restricted, low-spend API key created just for this tool.
- Do not paste confidential or regulated material into a provider you have not cleared for it.
- Leave the AI provider on "Deterministic only" when you only need the analysis, nothing leaves the browser.
- Export the library as a JSON backup; browser storage can be cleared.
- Owner: give the Studio token a 7-day expiry and limit it to this one repository with "Contents: Read and write" only. Revoke it at github.com/settings/personal-access-tokens if it is ever exposed.

## Threat model (audit of 2026-11-03)

Assume every input is hostile. The company being evaluated controls the files and text an investor loads (ledgers, financials, comparables, decks, term sheets, shared deal files) and may try to run code, steal a key, hide bad numbers or freeze the page. Other attackers: a site that frames or links to VCR2, a network attacker, hostile AI output (prompt injection hidden in a deck), a supply-chain attacker (the GitHub account, Actions, the build), a person using the same computer later, browser features that send text to the cloud (enhanced spell check, translation), and phishing copies of vcr2.app. The assets are the visitor's AI key, the owner's Studio token, deal data, and the integrity of the code served at vcr2.app.

What is tested on every push: no attacker-controlled text reaches the page as markup (`tests/browser/xss_sweep_test.py`), the security policy as the browser enforces it (`tests/browser/csp_test.py`), the source never adds inline handlers, `eval`, unrouted HTML sinks, new hosts or new storage keys (`tests/security/source-guards.test.mjs`), keys and tokens go only where they should (`tests/browser/ai_rule_test.py`, `privacy_test.py`, `studio_test.py`), hostile files are refused or parsed within a time limit (`tests/security/`), and the site is named only over https (`tests/own-site-https.test.mjs`).

## Residual risks no code can remove

- **A compromised GitHub account** can publish code that every visitor runs. Protect it with two-factor authentication (a passkey is best) and a ruleset on `main`.
- **Malicious browser extensions or malware** on a visitor's computer can read anything the page shows, including a pasted key.
- **Phishing copies** of the site can ask for a key. The real site is only https://vcr2.app/; it never asks for a password and never needs a key to compute a report.
- **AI providers** receive the text you choose to send, under their own terms, and can be breached themselves. Use a dedicated key with a low spending limit and revoke it after use.
- **A user who ignores warnings** (ticks "Remember this key" on a shared computer, pastes confidential material into a provider they have not cleared) is outside what the page can prevent.
- **No HSTS:** GitHub Pages cannot send security headers, so the first visit typed as plain http relies on the redirect.

## Reporting a vulnerability

Please open a private report via **Security → Report a vulnerability** on this repository. Do not open a public issue for security problems.
