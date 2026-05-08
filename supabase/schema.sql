-- ============================================================
-- Budget App Schema v2
-- Run in Supabase SQL Editor (replaces the v1 schema entirely)
-- ============================================================

-- Drop v1 tables and types (day-zero project, no data to preserve)
drop table if exists transactions cascade;
drop table if exists category_targets cascade;
drop type  if exists category;

-- ============================================================
-- Enums
-- ============================================================
create type account_type as enum ('credit_card', 'checking', 'savings', 'investment');
create type bucket       as enum ('needs', 'wants', 'savings');
create type sub_cadence  as enum ('weekly', 'monthly', 'yearly');

-- ============================================================
-- profile
-- One row per user. Stores paycheck amount, 50/30/20 percentages,
-- and the cycle anchor date used to compute biweekly periods.
-- ============================================================
create table profile (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  paycheck_cents    integer  not null default 0   check (paycheck_cents >= 0),
  needs_pct         smallint not null default 50  check (needs_pct  between 0 and 100),
  wants_pct         smallint not null default 30  check (wants_pct  between 0 and 100),
  savings_pct       smallint not null default 20  check (savings_pct between 0 and 100),
  cycle_anchor_date date     not null default current_date,
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- accounts
-- Each user can have many accounts of four types.
-- credit_limit_cents is only relevant for credit_card accounts.
-- ============================================================
create table accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  type                account_type not null,
  credit_limit_cents  integer check (credit_limit_cents is null or credit_limit_cents > 0),
  sort_order          integer not null default 0,
  archived            boolean not null default false,
  created_at          timestamptz not null default now()
);

create index accounts_user_idx on accounts (user_id, sort_order, created_at);

-- ============================================================
-- account_balance_snapshots
-- Every manual balance update writes an immutable snapshot row.
-- Current balance  = latest snapshot for that account.
-- Cycle activity   = latest snapshot in cycle minus baseline
--                    (last snapshot before cycle start, or first
--                     snapshot in cycle if no prior snapshot exists).
-- balance_cents is what you OWE for credit cards, what you HAVE
-- for all other types — always stored as a non-negative integer.
-- ============================================================
create table account_balance_snapshots (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  balance_cents integer not null check (balance_cents >= 0),
  recorded_at   timestamptz not null default now()
);

create index snapshots_account_recorded_idx
  on account_balance_snapshots (account_id, recorded_at desc);
create index snapshots_user_recorded_idx
  on account_balance_snapshots (user_id, recorded_at desc);

-- ============================================================
-- subscriptions
-- First-class recurring obligations. Each subscription belongs
-- to a budget bucket (needs/wants/savings). next_charge_on is
-- advanced automatically by the client when a cycle passes.
-- Soft-delete via active = false rather than hard delete so
-- charge history is preserved.
-- ============================================================
create table subscriptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  amount_cents   integer not null check (amount_cents > 0),
  cadence        sub_cadence not null default 'monthly',
  next_charge_on date not null,
  bucket         bucket not null default 'wants',
  active         boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index subscriptions_user_active_idx on subscriptions (user_id, active, sort_order);

-- ============================================================
-- Row Level Security
-- All rows scoped to auth.uid() = user_id
-- ============================================================
alter table profile                   enable row level security;
alter table accounts                  enable row level security;
alter table account_balance_snapshots enable row level security;
alter table subscriptions             enable row level security;

-- profile
create policy "profile: own select"
  on profile for select using (auth.uid() = user_id);
create policy "profile: own insert"
  on profile for insert with check (auth.uid() = user_id);
create policy "profile: own update"
  on profile for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- accounts
create policy "accounts: own select"
  on accounts for select using (auth.uid() = user_id);
create policy "accounts: own insert"
  on accounts for insert with check (auth.uid() = user_id);
create policy "accounts: own update"
  on accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "accounts: own delete"
  on accounts for delete using (auth.uid() = user_id);

-- account_balance_snapshots (immutable — no update policy)
create policy "snapshots: own select"
  on account_balance_snapshots for select using (auth.uid() = user_id);
create policy "snapshots: own insert"
  on account_balance_snapshots for insert with check (auth.uid() = user_id);
create policy "snapshots: own delete"
  on account_balance_snapshots for delete using (auth.uid() = user_id);

-- subscriptions
create policy "subscriptions: own select"
  on subscriptions for select using (auth.uid() = user_id);
create policy "subscriptions: own insert"
  on subscriptions for insert with check (auth.uid() = user_id);
create policy "subscriptions: own update"
  on subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "subscriptions: own delete"
  on subscriptions for delete using (auth.uid() = user_id);
