# Part B test results

All runs against the LOCAL Supabase stack (CLI 2.122.0, Postgres 17.11, GoTrue 2.197.0, PostgREST 16.5) in Docker Desktop 29.9.3 on Axel's PC. No real accounts, no real keys: test users get random passwords held in memory and are deleted at the end of each run.

## B1, 2026-11-09: `node tests/accounts/isolation.test.mjs`
Result: **76/76 passed**, 2 consecutive runs, about 5 seconds each. 0 users and 0 analyses left on the stack afterwards.

| Group | Checks | Spec target |
|---|---|---|
| User B against user A (read, list, update, delete, forged owner, crafted filters, search injection) | 13 | |
| Anonymous and forged access (no key, anon key, wrong signature, alg none, swapped user id, forged service role, expired token, sign-out everywhere, refresh replay, self-edited metadata) | 18 | |
| What may be stored, rule A3 (ledger, document text, AI key refused; Vault ciphertext only; script stored as typed) | 13 | |
| Quotas (per record, count, megabytes, no usage leak through a forged owner, limits read-only) | 7 | |
| Versions (cross-user, read-only, keep last N) | 6 | |
| Own rows and owner-only summary | 7 | |
| **Isolation and security total** | **64** | at least 40 |
| Version counter and replays (counted with sync in B3) | 6 | |
| Account deletion on the server, rule A11 | 6 | |

Fixed during B1 (found by reading or by the suite):
- A quota error raised before the isolation check could have shown another user's usage: a forged owner is now refused first (check "no usage figure of another user leaks").
- The quota trigger named columns that only some tables have: profile updates would have failed. Rewritten per table.
- Supabase grants every privilege to signed-in users by default: an edit of a saved version or of the limits changed 0 rows (row-level security held) but was not refused outright. All privileges are now revoked first, then granted one by one; both attempts now get an error and the values are checked unchanged.

The stack signs user tokens with ES256. The expired-token check uses a token signed with the stack's shared secret, after a control check proves a fresh token signed the same way is accepted.

## B2, 2026-11-09: sign-in flows
`node tests/accounts/signin.test.mjs`: **51/51 passed** (35 with mocked providers, 16 live against the local sign-in server and its local inbox).
`python tests/browser/accounts_test.py`: **19/19 passed** in Chromium (5 on the published page, 14 on a test build pointed at the local stack).

| What | Checks | Spec target |
|---|---|---|
| Each provider button (Google, Microsoft, Apple, Yahoo, GitHub, LinkedIn, X, Facebook): right backend and provider name, PKCE S256 matching the stored verifier, one-time state in the return address, no request, no popup | 8 | at least 15 sign-in flow tests in all |
| Configuration: off providers refused, passkey kept off, nothing offered without backend or providers, order and backend name from config, Microsoft email scope only | 6 | |
| Regions EU/US: the choice is honoured; nothing starts without a choice | 2 | |
| Coming back: one PKCE exchange with the right verifier, URL wiped, keep / don't keep me signed in, wrong state, unknown flow (login CSRF), expired flow, replay, cancel, provider error text never shown, refused code, linking message | 11 | |
| Network gate: guest arms nothing, foreign host refused, malformed project ignored | 3 | |
| Session upkeep: one refresh for parallel callers, refused refresh signs out, offline refresh keeps the session | 3 | |
| Live: GitHub request accepted by the local sign-in server (provider not contacted), disabled provider refused, email link end to end, link single use, sign-up needs email verification, weak password, wrong password and unknown email give the same answer, refresh, sign-out revokes | 16 | |
| Browser: published page has no button, no request, no account storage, no account host in the policy; test build: keyboard open and Escape, dialog content, GitHub via the local server, real sign-up confirmed through the local inbox, signed in, URL wiped, sign-out, every request on 127.0.0.1, no console error | 19 | |

Fixed during B2: a provider position set in the configuration could tie with a default one; a one-letter backend name ("x") was rejected.
Incident, fixed: the first browser run let the test browser follow the local server's redirect to github.com and load GitHub's sign-in page (Playwright does not intercept redirected navigations). Only a fake client id was in the address; no account or data was involved. The test now reads the redirect without following it, and aborts any request to a host other than 127.0.0.1; the run after the fix shows no attempt to reach another host.
Not covered yet: the nonce of OIDC providers (Google, Apple, Microsoft, LinkedIn, Yahoo) is checked by the backend, not by VCR2; it can only be observed with a live provider (STOP E list). Passkey: off (the backend marks it experimental).
Size: the account module adds 5.5 KB gzip (page 312.0 KB, owner cap 330 KB).
Regression (guest mode and Part A unchanged): all 41 Node suites pass; full browser run 1,093/1,094 checks in 34/35 suites (520 s). The one failure was a hard-coded 8px radius in the new dialog style; fixed with the radius token and `motion_test.py` rerun 20/20. Smart fill suites in that run: readers 55/55, UI 33/33, end to end 16/16, worker 12/12.

## B3, 2026-11-09: My analyses, autosave, versions, sync and conflicts
`node tests/accounts/sync.test.mjs`: **55/55 passed**. Two sandboxed "devices" signed in as the same user, against the local stack.
`python tests/browser/accounts_test.py`: **26/26 passed** (7 new: autosave label, My analyses list with escaped name and quota meter, search, versions, delete and undo).

| Group | Checks | Spec target |
|---|---|---|
| Autosave (create, next version, debounce, edit during a write) | 7 | |
| Second device, conflicts (keep mine, use newer, keep both, no answer), delete versus edit, start-up check | 15 | |
| Offline, flaky network (lost request, lost answer on create and update), token expiry and 401 during a save, sign-out during a save | 9 | |
| Size and quota (900 KB saved, over 1 MB refused, analysis quota, usage) | 4 | |
| **Sync, conflict and offline total** | **35** | at least 30 |
| What is sent (no ledger rows, ledger figures, 160-character provenance, index fields) | 4 | |
| Versions (save, already saved, diff with labels and score change, restore as a new version) | 4 | |
| List actions (columns, rename and tags, archive, stale row refused, duplicate, delete, export all, remove from this device) | 8 | |
| Comparables and preferences across devices; another user cannot open an id | 4 | |

Fixed during B3: autosave sent the title computed from the company name and undid a "Rename" (now the title is set once, then only Rename changes it); a "Keep both" answer called the save from inside the save in progress and would have waited forever (found by reading, before any run); opening an imported file or a local saved run while signed in now gets its own account record instead of overwriting the open one.
Behaviour to know: a draft started before signing in stays "Saved on this device only" until the B4 migration question; a clean device takes a newer account copy with a notice (nothing can be lost), a device with unsent changes is always asked.
Size: B3 adds 8.1 KB gzip (page 320.1 KB; 9.9 KB left under the 330 KB cap for B4 and B5).
Full browser run before the dash fix: 1,119/1,120 checks in 35/36 suites (543 s); the one failure (en dash used for a missing score) fixed, dash_test and accounts_test rerun 33/33.

## B4, 2026-11-09: Vault, migration, data download and deletion, terms and privacy
`node tests/accounts/vault.test.mjs`: **36/36 passed** (about 9 seconds).
`python tests/browser/accounts_test.py`: **28/28 passed** (2 new: the terms box must be ticked before anything is saved; the dialog closes once accepted).

| Group | Checks | Spec target |
|---|---|---|
| Terms (declined signs out and stores nothing; nothing sent before acceptance; acceptance date stored) | 3 | |
| Migration (asked first, nothing moved before the answer, only ticked ones moved, local copies kept until "delete", no ledger rows or unknown fields, moved draft keeps syncing, refused move keeps the local copy) | 8 | |
| Download all my data (complete, only this account, round trip) and delete my account (DELETE typed exactly, nothing left in any table, sign-in record gone, other users untouched) | 7 | |
| **Migration, export and deletion total** | **18** | at least 10 |
| Vault (weak passphrase refused; salt, 600,000 iterations, wrapped key, never the passphrase; 256-bit recovery key; existing analyses encrypted and clear versions removed; ciphertext-only saves and versions; ledger only inside the ciphertext; other device starts locked, cannot open, does not send in clear; wrong passphrase fails safely; tampered ciphertext refused; wrong recovery key refused; recovery sets a new passphrase and retires the old; download includes decrypted analyses when unlocked; the database inspected directly holds ciphertext only) | 18 | |

Fixed during B4: in Vault mode, "Save version" sent analysis-only columns (stage, band) to the versions table and failed (found by the suite). The first suite run failed in the test sandbox only (it lacked atob and TextDecoder, which every browser has).
Size: B4 adds 5.5 KB gzip (page 325.6 KB; 4.4 KB left under the 330 KB cap for B5).

## B5, 2026-11-10: Studio "Accounts" section and setup guides
`node tests/accounts-config.test.mjs`: **17/17 passed** (settings cleaned on load; never part of the score or run ID; no project address or key can come from the published configuration; the Studio lists every method with Passkey disabled and its reason, switches, reorders, keeps or resets the dialog sentence, writes the limits as the SQL line to paste, resets everything; round trip through the published configuration).
Guides: `SETUP-supabase.md` (both projects, tables, URLs, email, keys into site.json, admin), `SETUP-email.md`, and one per provider: Google, Microsoft, Apple, Yahoo, GitHub, LinkedIn, X, Facebook; `SETUP-passkey.md` says why it is not offered.
Fixed during B5: the configuration cleaner rejected the one-letter provider id "x", so X could never have been switched on (found by the suite).
Size: B5 adds 1.6 KB gzip (page 327.2 KB, owner cap 330 KB).
Test hygiene: the sync and Vault suites left a long autosave timer running in their sandboxes, so the process stayed open after printing its results until the 900-second limit cut it; the suites now exit after reporting (7 s and 9 s).

## B6, 2026-11-10: full sweep
- Accounts suites: isolation 76/76 (6 s), sign-in 51/51 (4 s), sync 55/55 (7 s), Vault, migration and data rights 36/36 (9 s).
- `node tests/*.test.mjs`: 42 suites, all pass (accounts-config 17/17 included).
- `python tests/browser/run_all.py`: **37/37 suites, 1,135/1,135 checks** (631 s), including accounts 28/28 and accounts end to end 13/13.
- `accounts_e2e_test.py` with axe-core 4.14.0 (dev tool, outside the repository): **15/15**: keyboard-only sign-in and terms, axe clean on My analyses and on the sign-in dialog (phone, dark), Vault on with recovery key, locked after reload, wrong passphrase fails safely, right one unlocks, the database inspected holds ciphertext only, DELETE typed deletes the account, phone 375 px without sideways scroll and 44 px buttons, dark theme contrast at least 4.5:1, every request on 127.0.0.1, no console error.
- `tools/key_scan.py`: clean (651 tracked files, 211 commits). Size 327.2 KB gzip.
Found while writing the end-to-end test: the first axe run measured colours during the page's fade-in (2.4:1); after the animation the same page passes. axe-core cannot be injected as a script: the page's CSP and Trusted Types refuse it, as intended.
Final table and console steps: STOP-E.md.
