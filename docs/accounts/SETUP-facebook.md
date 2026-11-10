# Set up sign-in with Facebook

Cost: Free.  
Time: about 25 minutes.  
Reference (official): https://supabase.com/docs/guides/auth/social-login/auth-facebook  
Scopes to request: public_profile, email. Never contacts, calendars, posts or files.  
Redirect (callback) address: the callback address of each Supabase project, shown in Supabase: Authentication, Sign In / Providers, Facebook, "Callback URL". It looks like `https://<project-ref>.supabase.co/auth/v1/callback`. You have two projects (Europe and United States), so two addresses.

## Steps (Windows 11, in Microsoft Edge)
1. Open https://developers.facebook.com/apps/ , **Create app**.
2. Use case **Authenticate and request data from users with Facebook Login**. App name `VCR2`, contact email yours. **Create app**.
3. **Use cases**, **Customize**, add the `email` permission (public_profile is there by default).
4. **Facebook Login**, **Settings**: **Valid OAuth Redirect URIs**: the two callback addresses. **Save changes**.
5. **App settings**, **Basic**: copy the **App ID** and **App secret** (**Show**). Add a privacy policy URL: `https://vcr2.app/#terms`.
6. In Supabase (each project): **Authentication**, **Sign In / Providers**, **Facebook**: switch on, paste both, **Save**.
7. Back in Meta: switch the app from **Development** to **Live** (top of the page) so that anyone can sign in.

## Then, in VCR2
1. Open https://vcr2.app/ and the Owner Studio, section **Accounts (sign-in)**.
2. Tick **On** next to Facebook. Use Up and Down to place it.
3. Review and publish as usual.
4. Test it yourself: sidebar, **Sign in**, Facebook. Until you have done this once with your own account, this method counts as "mocked only" in docs/accounts/RESULTS.md.

Never paste a client secret in chat, in the repository or in the Studio: it goes only in the Supabase console.
