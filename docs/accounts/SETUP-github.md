# Set up sign-in with GitHub

Cost: Free.  
Time: about 15 minutes.  
Reference (official): https://supabase.com/docs/guides/auth/social-login/auth-github  
Scopes to request: read:user and user:email (name and email only). Never contacts, calendars, posts or files.  
Redirect (callback) address: the callback address of each Supabase project, shown in Supabase: Authentication, Sign In / Providers, GitHub, "Callback URL". It looks like `https://<project-ref>.supabase.co/auth/v1/callback`. You have two projects (Europe and United States), so two addresses.

## Steps (Windows 11, in Microsoft Edge)
1. GitHub allows ONE callback address per app, and you have two projects: you will create two OAuth apps, `VCR2 (Europe)` and `VCR2 (United States)`.
2. Open https://github.com/settings/developers, **OAuth Apps**, **New OAuth App**.
3. Application name `VCR2 (Europe)`, Homepage URL `https://vcr2.app/`, Authorization callback URL: the Europe callback address. **Register application**.
4. Copy the **Client ID**, click **Generate a new client secret**, copy it.
5. In the Europe Supabase project: **Authentication**, **Sign In / Providers**, **GitHub**: switch on, paste both, **Save**.
6. Repeat steps 2 to 5 for `VCR2 (United States)` with the United States callback address and project.

## Then, in VCR2
1. Open https://vcr2.app/ and the Owner Studio, section **Accounts (sign-in)**.
2. Tick **On** next to GitHub. Use Up and Down to place it.
3. Review and publish as usual.
4. Test it yourself: sidebar, **Sign in**, GitHub. Until you have done this once with your own account, this method counts as "mocked only" in docs/accounts/RESULTS.md.

Never paste a client secret in chat, in the repository or in the Studio: it goes only in the Supabase console.
