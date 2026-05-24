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
- Review form for biller, amount, due date, reference, and notes.
- Local browser storage for bills and settings.
- Cloud sync through a Cloudflare Pages Function.
- Dashboard totals for unpaid, due soon, and overdue bills.
- Paid/unpaid filtering and JSON export.
- Browser notification permission flow and reminder checks while the app is opened.

## Supabase

Run `supabase/schema.sql` in a Supabase project SQL editor.

The MVP policy allows anon sync only when the request includes the browser's generated sync secret. Add Supabase Auth and per-user row-level security before using this for real shared or sensitive production data.

## Cloudflare Pages

This is a static site. In Cloudflare Pages, set:

- Build command: none
- Build output directory: `.`

Add these Cloudflare Pages environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The hosted app uses `functions/api/bills.js` for cloud sync and restore.

The included `_headers`, `wrangler.toml`, and `functions/` directory are ready for Cloudflare Pages.

## Extraction note

This first version decodes common text-readable PDF streams in the browser, then asks the user to confirm or correct the fields. Scanned bills still need OCR and should be entered manually until a backend extraction service is added.
