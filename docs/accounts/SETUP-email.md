# Set up "Email link" and "Email and password"

Cost: free. Time: 10 minutes once SETUP-supabase.md is done.
Reference (official): https://supabase.com/docs/guides/auth/passwords and https://supabase.com/docs/guides/auth/auth-email-passwordless
Nothing to register elsewhere: Supabase sends the emails. VCR2 never sees or stores a password; Supabase hashes it.

## Steps (each Supabase project)
1. **Authentication**, **Sign In / Providers**, **Email**: on, **Confirm email** on, minimum length `10`, requirements lower-case, upper-case and digits. **Save**.
2. **Authentication**, **Emails**, **SMTP Settings**: set your own sender (the built-in one sends at most 2 emails an hour).
3. **Authentication**, **Emails**, **Templates**: optional, change the sender name and the wording of "Magic Link" and "Confirm signup" (keep the `{{ .ConfirmationURL }}` link in them).
4. **Authentication**, **Rate Limits**: keep the defaults.

## Then, in VCR2
Owner Studio, **Accounts (sign-in)**: tick **Email link (no password)** and/or **Email and password**, publish, then test both yourself (a link arrives, opens VCR2, you are signed in).
