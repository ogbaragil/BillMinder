# Bill Minder MVP

React + Vite + Supabase MVP for saving bill reminders from PDF bills.

## What changed in this ZIP

The PDF extractor now tries to detect:

- biller / company name
- amount due
- due date
- reference / account / invoice number
- payment notes such as BPAY text when present
- original PDF file name

It still lets the user confirm or edit the fields before saving.

## Supabase table

This app expects the `public.bills` table you already created:

- `id`
- `app_instance_id`
- `sync_secret`
- `biller`
- `amount`
- `due_date`
- `reference`
- `notes`
- `file_name`
- `status`
- `reminded_for`
- `created_at`
- `updated_at`

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local`:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Cloudflare Pages settings

Use:

```text
Build command: npm run build
Build output directory: dist
Node version: 20 or 22
```

Add the same environment variables in Cloudflare Pages.

## Note about PDFs

This works best on text-based PDFs. If a bill is a scanned image, browser-only PDF text extraction may return little or no text. The next upgrade would be OCR through Cloudflare Workers, Supabase Edge Functions, Google Vision, AWS Textract, or Azure Document Intelligence.
