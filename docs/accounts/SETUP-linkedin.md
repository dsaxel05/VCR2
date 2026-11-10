# Set up sign-in with LinkedIn

Cost: Free.  
Time: about 20 minutes.  
Reference (official): https://supabase.com/docs/guides/auth/social-login/auth-linkedin  
Scopes to request: openid, profile, email. Never contacts, calendars, posts or files.  
Redirect (callback) address: the callback address of each Supabase project, shown in Supabase: Authentication, Sign In / Providers, LinkedIn, "Callback URL". It looks like `https://<project-ref>.supabase.co/auth/v1/callback`. You have two projects (Europe and United States), so two addresses.

## Steps (Windows 11, in Microsoft Edge)
1. Open https://www.linkedin.com/developers/apps and click **Create app**. A LinkedIn company page is required: create a simple one for VCR2 if you have none.
2. App name `VCR2`, LinkedIn page: yours, logo: the VCR2 seal. Accept the terms, **Create app**.
3. **Products** tab: request **Sign In with LinkedIn using OpenID Connect** (granted at once).
4. **Auth** tab: under **Authorized redirect URLs for your app** add the two callback addresses. Copy the **Client ID** and **Primary Client Secret**.
5. In Supabase (each project): **Authentication**, **Sign In / Providers**, **LinkedIn (OIDC)**: switch on, paste both, **Save**.

## Then, in VCR2
1. Open https://vcr2.app/ and the Owner Studio, section **Accounts (sign-in)**.
2. Tick **On** next to LinkedIn. Use Up and Down to place it.
3. Review and publish as usual.
4. Test it yourself: sidebar, **Sign in**, LinkedIn. Until you have done this once with your own account, this method counts as "mocked only" in docs/accounts/RESULTS.md.

Never paste a client secret in chat, in the repository or in the Studio: it goes only in the Supabase console.
