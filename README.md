# Bill Reminder MVP

A simple React + Supabase app that uploads a bill PDF, extracts likely bill details, saves them to your `public.bills` table, and triggers browser notifications 3 days before and on the due date.

## 1. Supabase

You already ran the required SQL. Make sure your table has RLS enabled and the `x-sync-secret` policy.

## 2. Configure environment

Copy `.env.example` to `.env.local` and fill in your Supabase values:

```bash
cp .env.example .env.local
```

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## 3. Run locally

```bash
npm install
npm run dev
```

## 4. How it works

- A device ID and sync secret are generated in `localStorage`.
- Supabase requests include the `x-sync-secret` header.
- PDF text is extracted in the browser using `pdfjs-dist`.
- The app uses simple regex heuristics to detect biller, amount, and due date.
- You confirm/edit the result before saving.
- Browser notifications fire while the app is open.

## 5. Important next upgrades

For production, add:

- OCR for scanned PDFs using Google Vision, AWS Textract, Azure Document Intelligence, or Tesseract.
- LLM extraction with strict JSON schema validation.
- Server-side scheduled reminders via Supabase Edge Functions + cron, Resend, SendGrid, Twilio, or push notifications.
- Real user auth instead of anonymous device sync.
- File storage using Supabase Storage.

## Notes

This MVP assumes Australian-style dates when parsing slash dates: `DD/MM/YYYY`.
