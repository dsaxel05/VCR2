# Accounts and the personal library (v5.2.0, optional)

Signing in is never required and never blocks a feature. A guest keeps using VCR2 exactly as before: nothing leaves the browser.
A visitor who chooses to sign in gets a private library: every analysis saved automatically, reopenable on any device, plus their comparables and preferences.
For signed-in users only, the promise "your data never leaves your browser" changes: the structured analysis is stored in their account (rule A3). This is said on the sign-in dialog, on the Terms and privacy page, in the README and in [PRIVACY.md](PRIVACY.md).

Backend: Supabase (Auth and Postgres with row-level security), chosen at STOP D, with two projects: Europe (Paris) and United States. The sign-in and data code is written by hand against Supabase's REST APIs (no SDK: `@supabase/supabase-js` is 55.4 KB gzip, more than the page's whole size headroom).
Test results: [accounts/RESULTS.md](accounts/RESULTS.md). Data model: [accounts/DATA-MODEL.md](accounts/DATA-MODEL.md). Console steps: [accounts/SETUP-supabase.md](accounts/SETUP-supabase.md) first, then one SETUP file per provider.

## The rules, and how each is kept

| Rule | What it says | How it is kept | Proof |
|---|---|---|---|
| A1 | Guest mode is the default and complete | Without a project in `site.json` the account code cannot connect and the Sign in button is hidden; with one, nothing connects until the click | browser: zero network requests for a guest (published page, and Smart fill run: `smartfill_e2e_test.py`); test build: no backend request before a click |
| A2 | One network module | `src/account*.js` only; `acctFetch()` refuses unless armed by a click, a returning sign-in started in this browser, or a saved session, and refuses any host not built into the page; `connect-src` lists only the project hosts | sign-in suite "network gate"; CSP test |
| A3 | Only the structured state goes to the cloud | Payload keys are whitelisted by the database; `ledger` must be null outside Vault; provenance lines cut to 160 characters; ledger figures (totals, top shares, retention) sent instead of rows; documents, their text and AI keys are never in the payload | isolation "what may be stored"; sync "what is sent"; vault "moved run" |
| A4 | Vault mode, off by default | AES-GCM in the browser; the key is wrapped by the passphrase (PBKDF2-SHA-256, 600,000 iterations, random salt); recovery key offered as a file; only title and dates readable (stage, model and score only if the user ticks it); the ledger may be stored only inside the ciphertext | vault suite (18 checks), browser Vault round trip, database inspected |
| A5 | Many providers through a registry | `ACCT_PROVIDERS` in `src/account.js`; the Studio switches, orders and renames them; extra `custom:` OIDC providers are configuration | sign-in suite; Studio test |
| A6 | VCR2 never handles passwords | Supabase hashes, verifies email (required), rate-limits; linking only with a verified email; a generic message that never names the provider just tried | sign-in suite: weak password, unconfirmed email, same answer for wrong password and unknown email |
| A7 | Isolation on the server | Row-level security on every table, owner set by the server, forged owners refused before any quota check, no privilege for anonymous visitors | isolation suite (64 checks) |
| A8 | The library | My analyses: search, sort, filter, tags, open, duplicate, rename, archive, delete with 30-second undo, export, compare two, versions (last 20) with restore and diff, comparables and preferences per account, quota meter | sync suite, browser suite |
| A9 | Offline-first sync | The draft on the device is the working copy; every write names its base version; a newer copy elsewhere is never overwritten silently (keep mine, use newer, keep both); "Remove from this device"; "Don't keep me signed in" | sync suite (35 checks) |
| A10 | First sign-in migration | A list with one box per local analysis; local copies deleted only after the upload is confirmed and the user says so | vault suite "migration" (8 checks) |
| A11 | Data rights | "Download all my data" (JSON); "Delete my account" with DELETE typed, done at once on the server (well within 24 hours), confirmed on screen; privacy notice in English and French; no analytics, no tracking | vault suite (7 checks), browser deletion |
| A12 | Terms | Terms and privacy page; a box to tick at first sign-in, stored with its date; nothing is saved before; no sharing feature | vault suite "terms", browser |

## Sign-in methods

| Method | Supabase name | Status today | Cost | Guide |
|---|---|---|---|---|
| Google | google | mocked; local server accepted the request shape | free | SETUP-google.md |
| Microsoft (personal, work or school) | azure (common tenant) | mocked | free | SETUP-microsoft.md |
| Apple | apple | mocked | Apple Developer Program, 99 USD a year | SETUP-apple.md |
| Yahoo | custom:yahoo (custom OIDC, 1 of 3 free slots) | mocked | free | SETUP-yahoo.md |
| GitHub | github | tested against the local server (PKCE request accepted, redirect to GitHub not followed) | free; one OAuth app per project | SETUP-github.md |
| LinkedIn | linkedin_oidc | mocked | free | SETUP-linkedin.md |
| X | twitter (or x, set in the Studio) | mocked | free tier | SETUP-x.md |
| Facebook | facebook | mocked | free | SETUP-facebook.md |
| Email link | email (magic link, PKCE) | tested end to end on the local stack | free (own SMTP needed beyond 2 emails an hour) | SETUP-email.md |
| Email and password | email | tested end to end on the local stack and in the browser | free | SETUP-email.md |
| Passkey | (experimental in Supabase) | not offered | n/a | SETUP-passkey.md |
| Continue as guest | n/a | always | free | n/a |

Not possible, or not done by VCR2: passkeys (the backend marks them experimental); the breached-password check (Supabase Pro only); the OIDC nonce of Google, Apple, Microsoft, LinkedIn and Yahoo is checked by Supabase, not by VCR2, and can only be observed with a live provider. No provider counts as working until Axel has signed in with it once.

## Costs and free-tier limits (official pages, checked 2026-11-09)
- Supabase Free, per project: 50,000 monthly active users, 500 MB database, 5 GB egress, 2 active projects (both used: EU and US), paused after 1 week without activity, no card so no charge (https://supabase.com/pricing). Pro: 25 USD a month per organisation, spend cap on by default.
- Per user in VCR2 (database-enforced, editable through the Studio's SQL line): 100 analyses, 5 MB, 1 MB per analysis, last 20 versions per analysis.
- Apple Developer Program: 99 USD a year. Every other provider: free.

## What the project owner can and cannot see
- Can: that an account exists (email, sign-in method, dates), the aggregate usage summary (number of accounts, analyses, megabytes) in the Studio.
- Technically can, as database administrator in the Supabase dashboard: the content of analyses that are not in Vault mode. The terms say the owner does not look at them.
- Cannot: Vault analyses (ciphertext only), passwords (hashed by Supabase), documents, extracted text, customer ledgers outside Vault, AI keys (never sent).

## Files
`src/account.js` (network gate, PKCE, sessions, provider registry), `src/account-sync.js` (sync, versions, comparables, preferences), `src/account-vault.js` (Vault, migration, data rights, terms), `src/account-ui.js` and `src/account-lib.js` (sidebar, dialogs, My analyses), `src/studio-accounts.js` (Studio), `supabase/` (schema, rules, local test stack), `tests/accounts/` and `tests/browser/accounts*_test.py`.
