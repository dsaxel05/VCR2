# Set up the two Supabase projects (do this first)

Cost: free plan (no card needed, so nothing can be charged). Limits per project: 50,000 monthly active users, 500 MB database, 5 GB egress; a free project is **paused after 1 week without activity** and must be restored from the dashboard (https://supabase.com/pricing, checked 2026-11-09).
Time: about 40 minutes for both projects.
You choose "Europe and United States": the free plan allows exactly 2 active projects, so both slots are used.

## 1. Create the projects (Windows 11, Microsoft Edge)
1. Open https://supabase.com/dashboard and sign up (GitHub or email). Create an organisation named `VCR2`, plan **Free**.
2. **New project**: name `vcr2-eu`, a strong database password (keep it in your password manager; Claude never needs it), region **West EU (Paris)**. **Create new project**. Wait 2 minutes.
3. Again **New project**: name `vcr2-us`, region **East US (North Virginia)**.

## 2. Create the tables and rules (each project)
1. Open the project, left menu **SQL Editor**, **New query**.
2. On your PC open `supabase\migrations\20261109120000_accounts.sql` with Notepad, press Ctrl+A, Ctrl+C.
3. Paste in the SQL editor (Ctrl+V), click **Run**. It should say "Success. No rows returned".

## 3. Sign-in settings (each project)
1. **Authentication**, **URL Configuration**: Site URL `https://vcr2.app/`; Redirect URLs: add `https://vcr2.app/**`. **Save**.
2. **Authentication**, **Sign In / Providers**, **Email**: on; **Confirm email** on; minimum password length `10`; password requirements: lower-case, upper-case letters and digits. **Save**.
3. **Authentication**, **Emails**, **SMTP Settings**: the built-in sender is limited to 2 emails an hour (https://supabase.com/docs/guides/auth/passwords). For real use, enter your own SMTP sender (for example the one of your email provider), sender name `VCR2`. **Save**.
4. Leave **Allow anonymous sign-ins** off. "Leaked password protection" needs the Pro plan (25 dollars a month): off on Free.

## 4. Tell VCR2 where the projects are
1. In each project: **Project Settings**, **API** (or **Data API**): copy the **Project URL** and the **anon public** key (this key is public by design; the service_role key is secret and must never be copied anywhere).
2. Ask Claude to paste them into `site.json` (accounts, regions eu and us) and run `python build.py`. The Sign in button appears only after that, and only when at least one sign-in method is switched on in the Studio.

## 5. Make yourself the admin for the usage summary
1. Sign in once on https://vcr2.app/ with your own account.
2. In each project, **SQL Editor**, run (with your email):
   `insert into public.app_admins (user_id) select id from auth.users where email = 'you@example.com';`

## 6. Budget
On the Free plan there is no card, so there is nothing to alert on. If you ever move to Pro, keep **Spend cap** on (the default) and add a billing alert in **Organization**, **Billing**.
