# STOP D: backend comparison (checked in official documentation on 2026-11-09)

## Free tiers, providers, regions

| | Supabase (Auth + Postgres with RLS) | Firebase (Auth + Firestore with rules) | Clerk or Auth0 + a storage backend |
|---|---|---|---|
| Free sign-ins | 50,000 MAU [1] | 50,000 MAU; OIDC: 2 daily users on the free Spark plan after the Identity Platform upgrade [6] | Clerk 50,000 retained users [10]; Auth0 25,000 MAU [11] |
| Free storage | 500 MB database, 5 GB egress, 2 active projects [1] | Firestore 1 GiB, 50K reads, 20K writes, 20K deletes a day, 10 GiB egress a month [5] | none: neither stores app data [10][11]; a second service is needed |
| Catch on free | project paused after 1 week of inactivity [1]; default email service 2 emails an hour [3]; breached-password check is Pro only [1] | redirect sign-in on GitHub Pages needs a reverse proxy Pages cannot run, so popups only [7]; the SDK uses a cross-origin iframe [7] | two vendors, two consoles, two sets of limits |
| First paid tier | Pro $25/month, spend cap on by default [1] | Blaze, pay as you go [5] | Clerk Pro $25/month [10]; Auth0 Essentials from $35/month [11] |
| Google, Microsoft, Apple, GitHub, Facebook | built in [2] (Microsoft = Azure provider, "common" tenant covers personal and work [2b]) | built in, except Microsoft and Yahoo not checked today [6] | built in |
| LinkedIn | built in (OIDC) [2] | not found [6] | built in |
| X | built in, OAuth 2.0 [2c] | built in (Twitter) [6] | built in |
| Yahoo | custom OIDC (3 free custom providers) [4] | not checked today | built in |
| Email link, email + password | built in; email confirmation on by default [3] | built in [6] | built in |
| Passkey | primary sign-in, marked "experimental, API may change" [8] | not found [6] | yes |
| EU region | Frankfurt, Ireland, Paris, Stockholm (EU); London, Zurich (non-EU) [9] | eur3 multi-region, Paris, Frankfurt and 10 more; fixed once created [12] | Clerk/Auth0: not checked today |
| Local test stack | needs Docker (not installed on this PC) [13] | needs Java JDK 11+ (not installed) [14] | vendor-specific mocks |

## Hand-written OIDC and REST vs one vendored SDK
- Size: `@supabase/supabase-js` 2.119.0 is 55.4 KB gzip, `@supabase/auth-js` alone 23.6 KB [15]. Headroom under the 330 KB cap: 23.5 KB (page 306.5 KB). The full SDK breaks the cap; auth-js alone uses all of it. The Firebase modular size was not found (v8 full: 234.5 KB [15]).
- Hand-written: PKCE (WebCrypto), token refresh and two REST APIs (Auth and PostgREST) with `fetch`. Size estimate, not measured yet: under 10 KB gzip; measured at B2.
- Security: hand-written adds no third-party code to a page that runs only hash-pinned scripts under Trusted Types, and keeps `frame-src 'none'`. Risk: we own PKCE, state, nonce and refresh, covered by the 15+ flow tests. Isolation does not depend on the client in either case: it is enforced by row-level security on the server.

## Recommendation (10 lines)
1. Supabase, with sign-in and storage written by hand against its REST APIs (no SDK).
2. One vendor for both sign-in and storage; per-user isolation by Postgres row-level security, testable with SQL.
3. Covers 10 of the 11 target methods on the free plan (Yahoo via 1 of the 3 free custom OIDC slots); passkey is experimental and ships behind a switch.
4. No iframe and no third-party script: the current CSP only gains one `connect-src` host.
5. Fits the size cap; the SDK does not.
6. EU region available (Paris eu-west-3 or Frankfurt eu-central-1).
7. Costs to know: free project pauses after 7 days without activity; magic links need your own SMTP sender (default 2 emails an hour); breached-password check needs Pro ($25/month).
8. Tests need Docker Desktop on this PC (click-by-click steps given in B1).
9. Firebase is second: popups only on GitHub Pages, an iframe exception in the CSP, no LinkedIn, no passkey, Java needed.
10. Clerk/Auth0 need a second storage service: more cost and two consoles.

## Sources
[1] https://supabase.com/pricing
[2] https://supabase.com/docs/guides/auth/social-login · [2b] https://supabase.com/docs/guides/auth/social-sign-in/auth-azure · [2c] https://supabase.com/docs/guides/auth/social-sign-in/auth-twitter
[3] https://supabase.com/docs/guides/auth/passwords
[4] https://supabase.com/docs/guides/auth/custom-oauth-providers
[5] https://firebase.google.com/pricing
[6] https://firebase.google.com/docs/auth and https://firebase.google.com/docs/auth/web/start
[7] https://firebase.google.com/docs/auth/web/redirect-best-practices
[8] https://supabase.com/docs/guides/auth/passkeys
[9] https://supabase.com/docs/guides/platform/regions
[10] https://clerk.com/pricing
[11] https://auth0.com/pricing
[12] https://firebase.google.com/docs/firestore/locations
[13] https://supabase.com/docs/guides/local-development
[14] https://firebase.google.com/docs/emulator-suite/install_and_configure
[15] https://bundlephobia.com/package/@supabase/supabase-js , https://bundlephobia.com/package/@supabase/auth-js , https://bundlephobia.com/package/firebase
Not verified today: Identity Platform pricing page (did not render), Firebase Microsoft and Yahoo pages, Clerk/Auth0 regions.
