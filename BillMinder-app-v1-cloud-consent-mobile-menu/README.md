# Bill Minder

Bill Minder is a local-first PWA for tracking PDF bills and payment reminders.

## Run locally

```sh
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/
```

## Current MVP

- Installable PWA shell with offline caching.
- PDF upload with browser-side decoding for text-readable compressed PDFs.
- AI extraction fallback through a Cloudflare Pages Function.
- Review form for biller, amount, due date, reference, and notes.
- Local browser storage for bills and settings.
- Cloud sync through a Cloudflare Pages Function.
- Email/password login through Supabase Auth.
- Dashboard totals for unpaid, due soon, and overdue bills.
- Paid/unpaid filtering, JSON export, and JSON import.
- Browser notification permission flow and reminder checks while the app is opened.
- Email reminders through Resend while the hosted app is opened.

## Supabase

Run `supabase/schema.sql` in a Supabase project SQL editor. Re-run it after this update so the `user_id`, `client_bill_id`, indexes, and authenticated policy are created.

The MVP policy allows anon sync only when the request includes the browser's generated sync secret. Add Supabase Auth and per-user row-level security before using this for real shared or sensitive production data.
Logged-in users sync through Supabase Auth and `user_id`. The hosted app requires sign-in before the dashboard can be used.

## Cloudflare Pages

This is a static site. In Cloudflare Pages, set:

- Build command: none
- Build output directory: `.`

Add this Cloudflare Pages secret:

- `VITE_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `RESEND_API_KEY`

The Supabase project URL is already configured in the Function because it is not sensitive.
`OPENAI_MODEL` is optional and defaults to `gpt-4.1-mini`.
`RESEND_FROM_EMAIL` is optional. If omitted, the app uses Resend's onboarding sender. For production, configure a verified Resend domain and set `RESEND_FROM_EMAIL`.
`RESEND_ALLOWED_TO` is optional and can restrict email sends to your own address.

Supabase Auth must have email/password signups enabled for the Account panel.

The hosted app uses `functions/api/bills.js` for cloud sync and restore.

The included `_headers`, `wrangler.toml`, and `functions/` directory are ready for Cloudflare Pages.

## Extraction note

This first version decodes common text-readable PDF streams in the browser, then asks the user to confirm or correct the fields. Scanned bills still need OCR and should be entered manually until a backend extraction service is added.
