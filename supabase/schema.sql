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
  reminded_for text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bills_app_instance_due_date_idx
  on public.bills (app_instance_id, due_date);

alter table public.bills
  add column if not exists user_id uuid;

alter table public.bills
  add column if not exists client_bill_id text;

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

drop policy if exists "Allow anon bill sync for MVP" on public.bills;
drop policy if exists "Allow anon bill sync with device secret" on public.bills;
drop policy if exists "Allow user bill sync" on public.bills;
drop policy if exists "Allow user select bills" on public.bills;
drop policy if exists "Allow user insert bills" on public.bills;
drop policy if exists "Allow user update bills" on public.bills;
drop policy if exists "Allow user delete bills" on public.bills;
drop policy if exists "Allow anon select with device secret" on public.bills;
drop policy if exists "Allow anon insert with device secret" on public.bills;
drop policy if exists "Allow anon update with device secret" on public.bills;
drop policy if exists "Allow anon delete with device secret" on public.bills;

create policy "Allow user select bills"
  on public.bills
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Allow user insert bills"
  on public.bills
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Allow user update bills"
  on public.bills
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Allow user delete bills"
  on public.bills
  for delete
  to authenticated
  using (user_id = auth.uid());
