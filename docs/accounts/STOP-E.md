# STOP E: final table (2026-11-10)

All counts measured on the local Supabase stack in Docker (no real account, no money). Details: RESULTS.md.

| Spec target (section 13) | Required | Measured | Where |
|---|---|---|---|
| Isolation and security | 40 | 64 passed | tests/accounts/isolation.test.mjs (76 checks in all) |
| Sync, conflict and offline | 30 | 35 passed | tests/accounts/sync.test.mjs (55 checks in all) |
| Sign-in flows with mocked providers | 15 | 51 passed (35 mocked, 16 on the local sign-in server) | tests/accounts/signin.test.mjs |
| Migration, export and deletion | 10 | 18 passed | tests/accounts/vault.test.mjs (36 checks with Vault) |
| Browser end to end | 10 | 43 passed (28 + 15 with axe-core; 13 without it) | tests/browser/accounts_test.py, accounts_e2e_test.py |
| Studio and settings | (not counted in the spec) | 17 passed | tests/accounts-config.test.mjs |
| **Total** | **100** | **278 passed, 0 failed** | |
| Part A regression | Smart fill numbers unchanged | all 42 Node suites pass (Smart fill accuracy suites included); full browser run 1,135/1,135 checks in 37 suites, Smart fill 55, 33, 16, 12 | |
| Guest mode | zero requests | published page: zero requests, no account storage, no button (browser); Smart fill run: zero requests | |
| Size | owner cap 330 KB gzip | 327.2 KB gzip | tools/size_check.py |

## Providers: mocked only or tested live
- Tested end to end on the local stack (not yet on the hosted projects): email and password (Node and browser), email link (Node).
- Request accepted by the local sign-in server, provider not contacted: GitHub.
- Mocked only: Google, Microsoft, Apple, Yahoo, LinkedIn, X, Facebook.
- Not offered: Passkey (experimental in Supabase).
- Nothing counts as working until Axel signs in once with it on the hosted projects.

## Console steps for Axel, in order
| # | Step | Guide | Time |
|---|---|---|---|
| 1 | Create the two Supabase projects (Paris, North Virginia), run the SQL file in each, set URLs and email options | SETUP-supabase.md, parts 1 to 3 | 40 min |
| 2 | Own SMTP sender in each project (needed before real users: the built-in one sends 2 emails an hour) | SETUP-supabase.md 3.3 | 15 min |
| 3 | Send Claude the two Project URLs and the two "anon public" keys (public values; never the service_role key or the database password) | SETUP-supabase.md 4 | 5 min |
| 4 | Claude puts them in site.json, builds, reruns the tests | (Claude) | 15 min |
| 5 | Studio, Accounts: switch on Email link and Email and password; sign up yourself once | SETUP-email.md | 10 min |
| 6 | Make yourself admin (one SQL line per project) | SETUP-supabase.md 5 | 2 min |
| 7 | Google | SETUP-google.md | 20 min |
| 8 | Microsoft | SETUP-microsoft.md | 20 min |
| 9 | GitHub (two OAuth apps) | SETUP-github.md | 15 min |
| 10 | LinkedIn | SETUP-linkedin.md | 20 min |
| 11 | Facebook (then switch the app to Live) | SETUP-facebook.md | 25 min |
| 12 | X | SETUP-x.md | 20 min |
| 13 | Yahoo (custom OIDC) | SETUP-yahoo.md | 25 min |
| 14 | Apple (optional: 99 USD a year) | SETUP-apple.md | 45 min plus Apple's enrolment delay |
| 15 | After each provider: Studio, tick it, publish, sign in once, tell Claude so it is recorded as tested live | each guide, "Then, in VCR2" | 5 min each |
| 16 | Publishing v5.2.0 to the live site: only when you say so (/vcr2-ship) | | |
