create table if not exists public.bills (
  id uuid primary key,
  client_bill_id text,
  app_instance_id uuid not null,
  sync_secret text not null,
  user_id uuid,
  biller text not null,
  amount numeric(12, 2) not null,
  due_date date not null,
  reference text,
  notes text,
  file_name text,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  paid_at date,
  payment_notes text,
  reschedule_notes text,
  reminded_for text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key,
  email text not null,
  reminder_lead_days integer not null default 3 check (reminder_lead_days in (0, 1, 3, 7)),
  email_reminders boolean not null default false,
  timezone text not null default 'Australia/Melbourne',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bills_app_instance_due_date_idx
  on public.bills (app_instance_id, due_date);

alter table public.bills
  add column if not exists user_id uuid;

alter table public.bills
  add column if not exists client_bill_id text;

alter table public.bills
  add column if not exists paid_at date;

alter table public.bills
  add column if not exists payment_notes text;

alter table public.bills
  add column if not exists reschedule_notes text;

update public.bills
set client_bill_id = id::text
where client_bill_id is null;

create index if not exists bills_user_due_date_idx
  on public.bills (user_id, due_date);

create index if not exists bills_user_client_bill_idx
  on public.bills (user_id, client_bill_id);

create index if not exists bills_app_instance_client_bill_idx
  on public.bills (app_instance_id, client_bill_id);

alter table public.bills enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "Allow anon bill sync for MVP" on public.bills;
drop policy if exists "Allow anon bill sync with device secret" on public.bills;
drop policy if exists "Allow user bill sync" on public.bills;
drop policy if exists "Allow anon select with device secret" on public.bills;
drop policy if exists "Allow anon insert with device secret" on public.bills;
drop policy if exists "Allow anon update with device secret" on public.bills;
drop policy if exists "Allow anon delete with device secret" on public.bills;
drop policy if exists "Allow user settings sync" on public.user_settings;

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

create policy "Allow user bill sync"
  on public.bills
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Allow user settings sync"
  on public.user_settings
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
