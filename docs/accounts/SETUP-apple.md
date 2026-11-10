# Set up sign-in with Apple

Cost: Paid: the Apple Developer Program costs 99 US dollars a year (https://developer.apple.com/support/compare-memberships/).  
Time: about 45 minutes, plus Apple's enrolment delay.  
Reference (official): https://supabase.com/docs/guides/auth/social-login/auth-apple  
Scopes to request: name and email (Apple may hide the email behind a relay address). Never contacts, calendars, posts or files.  
Redirect (callback) address: the callback address of each Supabase project, shown in Supabase: Authentication, Sign In / Providers, Apple, "Callback URL". It looks like `https://<project-ref>.supabase.co/auth/v1/callback`. You have two projects (Europe and United States), so two addresses.

## Steps (Windows 11, in Microsoft Edge)
1. Enrol at https://developer.apple.com/programs/enroll/ (paid, yearly). Wait for the confirmation email.
2. https://developer.apple.com/account/ : **Certificates, Identifiers & Profiles**, **Identifiers**, **+**, **App IDs**, type App, description `VCR2`, bundle id `app.vcr2.web`, tick **Sign In with Apple**, **Continue**, **Register**.
3. **Identifiers**, **+**, **Services IDs**, description `VCR2 web`, identifier `app.vcr2.web.signin`, **Register**. Open it, tick **Sign In with Apple**, **Configure**.
4. Primary App ID: the one above. Domains: the two Supabase project hosts (`<project-ref>.supabase.co`). Return URLs: the two callback addresses. **Next**, **Done**, **Save**.
5. **Keys**, **+**, name `VCR2 sign-in`, tick **Sign In with Apple**, **Configure** with the App ID, **Register**, **Download** the `.p8` file (only once). Note the **Key ID** and your **Team ID** (top right).
6. In Supabase (each project): **Authentication**, **Sign In / Providers**, **Apple**: switch on. Client IDs: `app.vcr2.web.signin`. Use the Supabase tool linked in that panel to turn the `.p8` key, Key ID and Team ID into the secret, paste it, **Save**.
7. The Apple secret expires after 6 months at most: put a reminder to make a new one.

## Then, in VCR2
1. Open https://vcr2.app/ and the Owner Studio, section **Accounts (sign-in)**.
2. Tick **On** next to Apple. Use Up and Down to place it.
3. Review and publish as usual.
4. Test it yourself: sidebar, **Sign in**, Apple. Until you have done this once with your own account, this method counts as "mocked only" in docs/accounts/RESULTS.md.

Never paste a client secret in chat, in the repository or in the Studio: it goes only in the Supabase console.
