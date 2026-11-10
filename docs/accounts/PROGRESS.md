# Part B (accounts) progress

Branch `accounts`, created 2026-11-09 from `smart-fill` (v5.1.0). Spec: `PART-B-PROMPT.md` (sections 0 and 10 to 14).
Read this first at the start of a session and resume at the first unchecked item.

- [x] B0 Recon (see `B0-RECON.md`)
- [x] STOP D answered 2026-11-09: region "EU and US" (two Supabase projects, the user picks one at first sign-in);
      Vault off by default; email verification required; free quotas 100 analyses and 5 MB per user;
      Supabase, hand-written REST and PKCE, no SDK; Axel installs Docker Desktop.
- [x] B1 Data model, security rules, local emulators, isolation tests first (rules before UI)
  - [x] Schema and row-level security: `supabase/migrations/20261109120000_accounts.sql`
  - [x] Local stack config (`supabase/config.toml`, CLI pinned to 2.122.0 in `tools/accounts_stack.mjs`)
  - [x] Isolation and security suite written: `tests/accounts/isolation.test.mjs` (76 checks)
  - [x] Axel installed Docker Desktop (`SETUP-docker.md`, WSL fix added)
  - [x] Stack started, suite run: 76/76 passed (`RESULTS.md`), data model in `DATA-MODEL.md`
- [x] B2 Account module, provider registry, mocked sign-in flows
  - [x] `src/account.js` (network gate, PKCE, sessions), `src/account-ui.js` (sidebar button, dialog), `settings.accounts` in the config
  - [x] `site.json` accounts.regions (EU, US; empty until Axel creates the projects); build.py fills connect-src only when set
  - [x] Tests: signin 51/51, browser 19/19, isolation still 76/76 (`RESULTS.md`)
- [x] B3 Library screen, autosave, versions, sync and conflicts
  - [x] `src/account-sync.js` (versioned writes, conflicts, offline, versions, diff, comparables and preferences), `src/account-lib.js` (My analyses page)
  - [x] Tests: sync 55/55, browser 26/26; isolation 76/76 and sign-in 51/51 still pass (`RESULTS.md`)
- [x] B4 Vault mode, migration, export, deletion, privacy and terms pages
  - [x] `src/account-vault.js` (Vault, migration, download, deletion, terms), dialogs in `src/account-lib.js`, `page-terms` (English and French)
  - [x] Tests: vault 36/36, browser 28/28; isolation, sign-in and sync still pass (`RESULTS.md`)
- [x] B5 Studio "Accounts" section, docs/accounts/SETUP-<provider>.md guides
  - [x] `src/studio-accounts.js`; guides for Supabase, email, 8 providers, passkey; tests 17/17
- [x] B6 Full test sweep, STOP E (`STOP-E.md`: 278 checks passed, 0 failed; browser 1,135/1,135)
- [x] B7 Docs (docs/ACCOUNTS.md, docs/PRIVACY.md, README, CHANGELOG v5.2.0, CLAUDE.md), `python build.py`, commit on `accounts` (no push, no deploy)
- [ ] Next, Axel: console steps in `STOP-E.md`, then sign in once per provider; publishing only when he says so
