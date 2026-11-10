# Set up sign-in with Yahoo

Cost: Free.  
Time: about 25 minutes.  
Reference (official): https://supabase.com/docs/guides/auth/custom-oauth-providers  
Scopes to request: openid, email, profile. Never contacts, calendars, posts or files.  
Redirect (callback) address: the callback address of each Supabase project, shown in Supabase: Authentication, Sign In / Providers, Yahoo, "Callback URL". It looks like `https://<project-ref>.supabase.co/auth/v1/callback`. You have two projects (Europe and United States), so two addresses.

## Steps (Windows 11, in Microsoft Edge)
1. Open https://developer.yahoo.com/apps/ and sign in with a Yahoo account, **Create an App**.
2. Application name `VCR2`, type **Web Application**, Redirect URI(s): the two callback addresses of the custom provider (see step 6 for the exact address).
3. API permissions: **OpenID Connect Permissions**, tick **Email** and **Profile** only. **Create App**.
4. Copy the **Client ID (Consumer Key)** and the **Client Secret (Consumer Secret)**.
5. Yahoo is not built into Supabase: it is added as a custom OIDC provider (the free plan allows 3).
6. In Supabase (each project): **Authentication**, **Sign In / Providers**, **Custom OAuth providers** (or **Add provider**), type **OIDC**, identifier `yahoo` (VCR2 calls it `custom:yahoo`), issuer `https://api.login.yahoo.com`, paste the client ID and secret, scopes `openid email profile`, **Save**. Copy the callback address it shows into the Yahoo app (step 2).

## Then, in VCR2
1. Open https://vcr2.app/ and the Owner Studio, section **Accounts (sign-in)**.
2. Tick **On** next to Yahoo. Use Up and Down to place it.
3. Review and publish as usual.
4. Test it yourself: sidebar, **Sign in**, Yahoo. Until you have done this once with your own account, this method counts as "mocked only" in docs/accounts/RESULTS.md.

Never paste a client secret in chat, in the repository or in the Studio: it goes only in the Supabase console.
