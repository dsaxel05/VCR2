# Set up sign-in with Microsoft

Cost: Free (a free Azure account is enough).  
Time: about 20 minutes.  
Reference (official): https://supabase.com/docs/guides/auth/social-login/auth-azure  
Scopes to request: openid, email, profile. Never contacts, calendars, posts or files.  
Redirect (callback) address: the callback address of each Supabase project, shown in Supabase: Authentication, Sign In / Providers, Microsoft, "Callback URL". It looks like `https://<project-ref>.supabase.co/auth/v1/callback`. You have two projects (Europe and United States), so two addresses.

## Steps (Windows 11, in Microsoft Edge)
1. Open https://portal.azure.com/ and sign in (a personal Microsoft account works).
2. Search bar: type `App registrations`, open it, click **New registration**.
3. Name `VCR2`. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
4. Redirect URI: platform **Web**, paste the Europe callback address. **Register**.
5. **Authentication** (left menu), **Add URI**, paste the United States callback address, **Save**.
6. Copy the **Application (client) ID** from **Overview**.
7. **Certificates & secrets**, **New client secret**, description `VCR2`, expiry 24 months, **Add**. Copy the **Value** at once (it is shown only once). Put a reminder to renew it before it expires.
8. **API permissions**: keep only Microsoft Graph `User.Read`, and add `email`, `openid`, `profile` if missing.
9. In Supabase (each project): **Authentication**, **Sign In / Providers**, **Azure**: switch on, paste the client ID and the secret value, leave **Azure Tenant URL** empty (personal and work accounts), **Save**.

## Then, in VCR2
1. Open https://vcr2.app/ and the Owner Studio, section **Accounts (sign-in)**.
2. Tick **On** next to Microsoft. Use Up and Down to place it.
3. Review and publish as usual.
4. Test it yourself: sidebar, **Sign in**, Microsoft. Until you have done this once with your own account, this method counts as "mocked only" in docs/accounts/RESULTS.md.

Never paste a client secret in chat, in the repository or in the Studio: it goes only in the Supabase console.
