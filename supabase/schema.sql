-- ============================================================
-- Budget App Schema
-- Run once in Supabase SQL Editor
-- ============================================================

-- Category enum (fixed in v1)
create type category as enum (
  'housing_utilities',
  'food_groceries',
  'transport',
  'entertainment',
  'subscriptions',
  'savings_investments'
);

-- ============================================================
-- transactions
-- amount stored as integer cents to avoid float drift
-- occurred_on is a calendar date (no timezone) so week-bucketing
-- happens client-side in the user's local TZ
-- client_id is an idempotency key generated on the client so
-- offline-queue flushes are safe to retry
-- ============================================================
create table transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  category     category not null,
  occurred_on  date not null,
  note         text,
  client_id    uuid not null,
  created_at   timestamptz not null default now(),
  unique (user_id, client_id)
);

create index transactions_user_occurred_idx
  on transactions (user_id, occurred_on desc);

-- ============================================================
-- category_targets
-- one row per user per category — upsert on conflict
-- ============================================================
create table category_targets (
  user_id      uuid not null references auth.users(id) on delete cascade,
  category     category not null,
  target_cents integer not null check (target_cents >= 0),
  updated_at   timestamptz not null default now(),
  primary key (user_id, category)
);

-- ============================================================
-- Row Level Security
-- All rows are scoped to auth.uid() so users only see their own data
-- ============================================================
alter table transactions enable row level security;
alter table category_targets enable row level security;

create policy "transactions: own select"
  on transactions for select using (auth.uid() = user_id);

create policy "transactions: own insert"
  on transactions for insert with check (auth.uid() = user_id);

create policy "transactions: own delete"
  on transactions for delete using (auth.uid() = user_id);

create policy "targets: own select"
  on category_targets for select using (auth.uid() = user_id);

create policy "targets: own insert"
  on category_targets for insert with check (auth.uid() = user_id);

create policy "targets: own update"
  on category_targets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
