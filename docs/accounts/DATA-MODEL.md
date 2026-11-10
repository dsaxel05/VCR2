# Accounts data model (B1)

Source of truth: `supabase/migrations/20261109120000_accounts.sql`. Same schema in both projects (EU and US); a user lives in one region only.

| Table | One row per | Holds | Who can read and write |
|---|---|---|---|
| `analyses` | saved analysis | index fields (title, company, stage, model, score, band, tags, folder, archived), `payload` (structured state, A3) or `cipher` (Vault), `version`, `bytes`, dates, app version | the owner only |
| `analysis_versions` | saved version (manual "Save version") | same payload or cipher, label, score | owner reads, adds and deletes; nobody edits |
| `profiles` | user | preferences (16 KB max), comparables (metrics only, 1,000 max), terms acceptance date | the owner only |
| `app_limits` | project (1 row) | 100 analyses, 5 MB, 1 MB per analysis, 20 versions | signed-in users read; only the project owner changes it (dashboard) |
| `app_admins` | Studio admin | user ids allowed to read the aggregate summary | nobody through the API |

Server-side guards (database, not page):
- Row-level security on every table; anonymous visitors have no privilege at all.
- `owner` is set to the signed-in user and can never point to someone else.
- Payload keys are whitelisted; `ledger` must be null (the customer ledger travels only inside a Vault ciphertext).
- Every update must carry `version = previous + 1`, else `version_conflict` (no silent overwrite, no replay).
- Quotas checked on every write, serialised per user.
- `delete_my_account()` deletes the caller's sign-in record; every table cascades. `my_usage()` for the quota meter. `usage_summary()` counts only, for listed admins.
