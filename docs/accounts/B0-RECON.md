# B0 recon (2026-11-09, branch `accounts` at a1d9360)

## What saveDraft() keeps today
`saveDraft()` (src/core.js) writes `draftPayload()` to `localStorage['vcr3-draft']` and `{t, name, pct}` to `vcr3-draft-meta`.
`draftPayload()` holds: `v:4, name, stage, model, asof, section, vals, bools, sel, prov, evid, assume, notes, checklist, evidFile, requests, ledger:{csv}, series:{csv}`.

Consequences for A3 (what may go to the cloud):
- `ledger.csv` is the customer-level ledger (customer names and rows). It must be stripped before any upload, except in Vault mode (encrypted). The cloud copy keeps computed analytics only.
- `series.csv` is company-level monthly totals (no customer names). Allowed by A3, to confirm with Axel at B1 if in doubt.
- `prov` lines: Smart fill and AI extraction cap them at 160 characters when written, but `restorePayload()` does not re-cap lines of `src:'extracted'` or `src:'ledger'` coming from an imported JSON. The cloud serializer must cap every line at 160 itself.
- No score summary or timestamps beyond `meta.t` today: the cloud record adds them (score, band, app version, created/updated, version counter).

## Library (src/library.js)
One key `vcr2-library` (array, max 1000 entries, whitelisted by `libClean()`). Each entry: id, company, stage, model, date, asof, source, quote (200 chars), metrics, stated, hash, outcome, flags, and `payload` (a full `draftPayload()`, ledger included). `libClean()` keeps `payload` as any object without cleaning it: the cloud path must run it through `restorePayload()`-style cleaning and strip `payload.ledger`.
Calibration flag: `vcr2-calibrate`.

## Storage keys (localStorage unless noted)
Draft: `vcr3-draft`, `vcr3-draft-meta`. Library: `vcr2-library`, `vcr2-calibrate`. AI: `vcr3-key` (session or 7-day remember), `vcr3-remember`, `vcr3-provider`, `vcr4-model`. Studio: `vcr2-owner`, `vcr2-gh-token` (session), `vcr2-studio-draft`, `vcr2-studio-base`, `vcr2-studio-preview`, `vcr2-edit-texts`. Smart fill: `vcr2-sf-aliases`. Theme and text size: src/theme.js. New account keys must use a `vcr2-acct-` prefix and never hold tokens in localStorage when "don't keep me signed in" is chosen.

## Network today
Only three call sites: `src/config.js` (same-origin `radar-config.json`), `src/core.js` (opt-in AI extraction), `src/studio.js` (GitHub API, owner only). A guest therefore already makes one same-origin request (the config). A1's "zero network requests" will be tested as "no request outside the page's own origin, and none at all after load", the same rule the Smart fill browser tests use.

## CSP (src/shell.html, meta tag)
`default-src 'none'`, scripts by sha256 hashes only (filled by build.py), Trusted Types required, `frame-src 'none'`, `form-action 'none'`, `connect-src 'self'` + GitHub API + 5 AI hosts. Accounts add one backend host to `connect-src`. Sign-in redirects are top-level navigations, so `form-action` and `frame-src` can stay `'none'` only if the chosen backend needs no iframe.

## Build and size
`build.py` concatenates `js_files` in order (account module goes after `library.js` and `config.js`), hashes inline scripts into the CSP. Size budget: page 306.5 KB gzip, owner cap 330 KB, so 23.5 KB of headroom for all of Part B.

## Studio
Sections are grouped in `src/studio.js` (the 'Site' group holds smartfill, look, texts, anytext, help). The new "Accounts" section goes there or in its own group.

## Tests and local tools
41 Node suites (`tests/*.test.mjs`), 41 files in `tests/browser/`. Node v24.19.0 and Python present. Java: not installed (Firebase emulator needs JDK 11+). Docker: not installed (Supabase local stack needs it).

## Conflict with CLAUDE.md
CLAUDE.md principles 2 and 3 say "deal data never leaves the browser" and "no backend". Part B changes both for signed-in users only; the prompt wins for Part B. CLAUDE.md is updated in B7.
