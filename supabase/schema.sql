create table if not exists public.bills (
  id uuid primary key,
  app_instance_id uuid not null,
  sync_secret text not null,
  biller text not null,
  amount numeric(12, 2) not null,
  due_date date not null,
  reference text,
  notes text,
  file_name text,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  reminded_for text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bills_app_instance_due_date_idx
  on public.bills (app_instance_id, due_date);

alter table public.bills enable row level security;

drop policy if exists "Allow anon bill sync for MVP" on public.bills;
drop policy if exists "Allow anon bill sync with device secret" on public.bills;

create policy "Allow anon bill sync with device secret"
  on public.bills
  for all
  to anon
  using (
    sync_secret = ((current_setting('request.headers', true)::json ->> 'x-sync-secret'))
  )
  with check (
    sync_secret = ((current_setting('request.headers', true)::json ->> 'x-sync-secret'))
  );
