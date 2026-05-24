# Bill Minder

Bill Minder is a local-first PWA for tracking PDF bills and payment reminders.

## Production deploy on Cloudflare Pages

Set these Cloudflare Pages environment variables:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Build settings:

```text
Build command: npm run build
Build output directory: dist
```

`package-lock.json` is intentionally not included.

## Run locally

For the static source version:

```sh
python3 -m http.server 4173
```

For a production-style local build:

```sh
VITE_SUPABASE_URL="https://your-project.supabase.co" \
VITE_SUPABASE_ANON_KEY="your_supabase_anon_key" \
npm run build
python3 -m http.server 4173 --directory dist
```

Then open `http://127.0.0.1:4173/`.

## Features

- Installable PWA shell with offline caching.
- PDF upload with browser-side decoding for text-readable compressed PDFs.
- Improved bill detail extraction for biller, amount, due date, reference, and filename.
- Review form before saving.
- Local browser storage.
- Cloud backup actions: Sync to cloud and Restore from cloud.
- Dashboard totals for unpaid, due soon, and overdue bills.
- Paid/unpaid filtering and JSON export.
- Browser notification permission flow and reminder checks while the app is opened.

## Supabase

Run `supabase/schema.sql` in your Supabase SQL editor.

The current MVP policy allows anon sync only when the request includes this browser's generated sync secret. For a multi-user production app, migrate to Supabase Auth and per-user row-level security.

## Extraction note

This app extracts text-readable PDFs in the browser. Scanned image-only PDFs still need OCR through a backend service such as Supabase Edge Functions, Cloudflare Workers with an OCR API, Google Vision, AWS Textract, or Azure Document Intelligence.
