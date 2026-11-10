# Passkey: not offered yet

Supabase documents passkeys as a primary sign-in, but marks the feature "experimental, the API may change without notice" (https://supabase.com/docs/guides/auth/passkeys, checked 2026-11-09).
VCR2 therefore keeps Passkey switched off and the Studio cannot switch it on. Nothing to set up today.
When Supabase marks it stable, the provider entry already exists in `src/account.js` (id `passkey`); the work left is the WebAuthn ceremony and its tests.
