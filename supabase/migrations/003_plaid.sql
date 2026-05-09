-- ============================================================
-- Migration 003: Plaid integration
-- ADDITIVE ONLY — never drops existing tables or columns
-- Run in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- plaid_items
-- Stores Plaid access tokens server-side — never returned to client.
-- Edge Functions read this via service role key.
-- ============================================================
create table if not exists plaid_items (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  plaid_access_token  text not null,
  plaid_item_id       text not null,
  institution_name    text,
  created_at          timestamptz not null default now(),
  unique (user_id, plaid_item_id)
);

create index if not exists plaid_items_user_idx on plaid_items (user_id);

alter table plaid_items enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'plaid_items' and policyname = 'plaid_items: own select'
  ) then
    create policy "plaid_items: own select" on plaid_items
      for select using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'plaid_items' and policyname = 'plaid_items: own delete'
  ) then
    create policy "plaid_items: own delete" on plaid_items
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ============================================================
-- Add Plaid columns to accounts (additive)
-- ============================================================
alter table accounts
  add column if not exists plaid_account_id       text,
  add column if not exists plaid_item_id          uuid references plaid_items(id) on delete set null,
  add column if not exists plaid_institution_name text,
  add column if not exists plaid_last_synced_at   timestamptz;

-- ============================================================
-- Add plaid_transaction_id to transactions (additive)
-- ============================================================
alter table transactions
  add column if not exists plaid_transaction_id text unique;

create index if not exists transactions_plaid_id_idx on transactions (plaid_transaction_id);
