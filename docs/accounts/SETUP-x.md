# Set up sign-in with X

Cost: Free tier of the X developer platform (check its current terms when you sign up).  
Time: about 20 minutes.  
Reference (official): https://supabase.com/docs/guides/auth/social-login/auth-twitter  
Scopes to request: users.read, tweet.read, users.email, offline.access (read only; VCR2 never posts). Never contacts, calendars, posts or files.  
Redirect (callback) address: the callback address of each Supabase project, shown in Supabase: Authentication, Sign In / Providers, X, "Callback URL". It looks like `https://<project-ref>.supabase.co/auth/v1/callback`. You have two projects (Europe and United States), so two addresses.

## Steps (Windows 11, in Microsoft Edge)
1. Open https://developer.x.com/ , sign in, **Developer Portal**, sign up for the free tier (describe the use: "Sign in to VCR2, no posting").
2. In your Project, open the App, **User authentication settings**, **Set up**.
3. App permissions **Read**, ask for email address if offered. Type of App: **Web App, Automated App or Bot**.
4. Callback URI: the two callback addresses. Website URL `https://vcr2.app/`. **Save**.
5. Copy the **OAuth 2.0 Client ID** and **Client Secret**.
6. In Supabase (each project): **Authentication**, **Sign In / Providers**, **X / Twitter (OAuth 2.0)**: switch on, paste both, **Save**.
7. The local test server names this provider `twitter`; if the hosted Supabase names it `x`, set the backend name of X to `x` in the Studio (VCR2 accepts both).

## Then, in VCR2
1. Open https://vcr2.app/ and the Owner Studio, section **Accounts (sign-in)**.
2. Tick **On** next to X. Use Up and Down to place it.
3. Review and publish as usual.
4. Test it yourself: sidebar, **Sign in**, X. Until you have done this once with your own account, this method counts as "mocked only" in docs/accounts/RESULTS.md.

Never paste a client secret in chat, in the repository or in the Studio: it goes only in the Supabase console.
