# Set up sign-in with Google

Cost: Free.  
Time: about 20 minutes.  
Reference (official): https://supabase.com/docs/guides/auth/social-login/auth-google  
Scopes to request: openid, email, profile (name and email only). Never contacts, calendars, posts or files.  
Redirect (callback) address: the callback address of each Supabase project, shown in Supabase: Authentication, Sign In / Providers, Google, "Callback URL". It looks like `https://<project-ref>.supabase.co/auth/v1/callback`. You have two projects (Europe and United States), so two addresses.

## Steps (Windows 11, in Microsoft Edge)
1. Open https://console.cloud.google.com/ and sign in with the Google account that will own the app.
2. Top bar: click the project picker, **New project**, name it `VCR2 sign-in`, **Create**, then select it.
3. Left menu (☰): **APIs & Services**, **OAuth consent screen** (or **Google Auth Platform**). Click **Get started**.
4. App name `VCR2`, support email: yours. Audience: **External**. Contact email: yours. Accept the policy, **Create**.
5. Under **Data access** (scopes) add only `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. Save.
6. Go to **Clients**, **Create client**, type **Web application**, name `VCR2`.
7. Under **Authorized redirect URIs** click **Add URI** and paste the Europe callback address; **Add URI** again for the United States one. **Create**.
8. Copy the **Client ID** and the **Client secret** (a window shows them).
9. In Supabase (each project): **Authentication**, **Sign In / Providers**, **Google**: switch on, paste the Client ID and the Client secret, **Save**.
10. Back in Google: **Audience**, **Publish app** so that anyone can sign in (no review is needed for name and email only).

## Then, in VCR2
1. Open https://vcr2.app/ and the Owner Studio, section **Accounts (sign-in)**.
2. Tick **On** next to Google. Use Up and Down to place it.
3. Review and publish as usual.
4. Test it yourself: sidebar, **Sign in**, Google. Until you have done this once with your own account, this method counts as "mocked only" in docs/accounts/RESULTS.md.

Never paste a client secret in chat, in the repository or in the Studio: it goes only in the Supabase console.
