-- ============================================================
-- Migration 002: Teller integration + transactions + dashboard widget
-- ADDITIVE ONLY — never drops existing tables or columns
-- Run in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- teller_enrollments
-- Stores Teller access tokens server-side — never returned to client.
-- Edge Functions read this via service role key.
-- ============================================================
create table if not exists teller_enrollments (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  teller_access_token   text not null,
  institution_name      text,
  created_at            timestamptz not null default now()
);

create index if not exists teller_enrollments_user_idx on teller_enrollments (user_id);

alter table teller_enrollments enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'teller_enrollments' and policyname = 'teller_enrollments: own select'
  ) then
    create policy "teller_enrollments: own select" on teller_enrollments
      for select using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'teller_enrollments' and policyname = 'teller_enrollments: own delete'
  ) then
    create policy "teller_enrollments: own delete" on teller_enrollments
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ============================================================
-- Add Teller columns to accounts (additive)
-- ============================================================
alter table accounts
  add column if not exists teller_account_id       text,
  add column if not exists teller_enrollment_id    uuid references teller_enrollments(id) on delete set null,
  add column if not exists teller_institution_name text,
  add column if not exists teller_last_synced_at   timestamptz;

-- ============================================================
-- transactions
-- teller_transaction_id is the dedup key.
-- bucket uses text + check constraint to avoid modifying the existing
-- bucket enum used by subscriptions.
-- ============================================================
create table if not exists transactions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  account_id            uuid references accounts(id) on delete set null,
  teller_transaction_id text unique,
  amount_cents          integer not null,
  description           text not null,
  date                  date not null,
  bucket                text not null default 'uncategorized'
                          check (bucket in ('needs', 'wants', 'savings', 'uncategorized')),
  tag                   text,
  category_override     boolean not null default false,
  created_at            timestamptz not null default now()
);

create index if not exists transactions_user_date_idx    on transactions (user_id, date desc);
create index if not exists transactions_account_idx      on transactions (account_id, date desc);
create index if not exists transactions_teller_id_idx    on transactions (teller_transaction_id);

alter table transactions enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'transactions' and policyname = 'transactions: own select'
  ) then
    create policy "transactions: own select" on transactions for select using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'transactions' and policyname = 'transactions: own insert'
  ) then
    create policy "transactions: own insert" on transactions for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'transactions' and policyname = 'transactions: own update'
  ) then
    create policy "transactions: own update" on transactions for update
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'transactions' and policyname = 'transactions: own delete'
  ) then
    create policy "transactions: own delete" on transactions for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ============================================================
-- Add dashboard_widget to profile (additive)
-- ============================================================
alter table profile
  add column if not exists dashboard_widget jsonb not null default '{"type":"net_worth"}';
