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
- Local browser storage with cloud sync for bills and reminder settings.
- Cloud sync through Cloudflare Pages Functions.
- Email/password login, account signup, and password reset through Supabase Auth.
- Dashboard totals for unpaid, due soon, and overdue bills.
- Paid/unpaid filtering, bill rescheduling with notes, payment date/notes, JSON export, and JSON import.
- Synced email reminder settings per signed-in user.
- Scheduled email reminders through a Cloudflare Worker Cron Trigger and Resend.

## Supabase

Run `supabase/schema.sql` in a Supabase project SQL editor. Re-run it after this update so `user_settings`, payment note fields, `user_id`, `client_bill_id`, indexes, and authenticated policies are created.

The MVP policy allows anon sync only when the request includes the browser's generated sync secret. Add Supabase Auth and per-user row-level security before using this for real shared or sensitive production data.
Logged-in users sync through Supabase Auth and `user_id`. The hosted app requires sign-in before the dashboard can be used.

## Cloudflare Pages

This is a static site. In Cloudflare Pages, set:

- Build command: none
- Build output directory: `.`

Add this Cloudflare Pages secret:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`

`OPENAI_MODEL` is optional and defaults to `gpt-4.1-mini`.

Supabase Auth must have email/password signups enabled. For password reset links, add your Cloudflare Pages URL to the Supabase Auth redirect URLs.

The hosted app uses `functions/api/bills.js` for bill sync and `functions/api/settings.js` for reminder settings sync.

The included `_headers`, `wrangler.toml`, and `functions/` directory are ready for Cloudflare Pages.

## Reminder Worker

Guaranteed email reminders need the included Cloudflare Worker in `worker/reminder-worker.js`.

Create a separate Worker using `wrangler.reminders.toml`, then add these Worker secrets:

- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Optional Worker secrets:

- `RESEND_ALLOWED_TO`
- `REMINDER_CRON_SECRET`

The Worker cron is set to `0 18 * * *`, which runs daily at 18:00 UTC. It checks each user's saved timezone and reminder lead time, sends due reminder emails, and marks each bill as reminded so duplicate emails are avoided.

## Extraction note

This first version decodes common text-readable PDF streams in the browser, then asks the user to confirm or correct the fields. Scanned bills still need OCR and should be entered manually until a backend extraction service is added.
