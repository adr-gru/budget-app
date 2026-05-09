-- ============================================================
-- Budget App Schema v2.1
-- Run in Supabase SQL Editor (replaces any prior schema entirely)
-- ============================================================

-- Drop v1 tables and types if they still exist
drop table if exists transactions cascade;
drop table if exists category_targets cascade;
drop type  if exists category;

-- Drop v2.x tables and types (clean slate)
drop table if exists goal_contributions cascade;
drop table if exists device_tokens cascade;
drop table if exists goals cascade;
drop table if exists subscriptions cascade;
drop table if exists account_balance_snapshots cascade;
drop table if exists accounts cascade;
drop table if exists profile cascade;
drop type  if exists contribution_source;
drop type  if exists device_platform;
drop type  if exists account_type;
drop type  if exists bucket;
drop type  if exists sub_cadence;

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
-- credit_limit_cents: only for credit_card accounts.
-- due_day: day of month (1-31) when the payment is due, credit cards only.
-- ============================================================
create table accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  type                account_type not null,
  credit_limit_cents  integer check (credit_limit_cents is null or credit_limit_cents > 0),
  due_day             smallint check (due_day is null or due_day between 1 and 31),
  sort_order          integer not null default 0,
  archived            boolean not null default false,
  created_at          timestamptz not null default now()
);

create index accounts_user_idx on accounts (user_id, sort_order, created_at);

-- ============================================================
-- account_balance_snapshots
-- Every manual balance update writes an immutable snapshot row.
-- Current balance  = latest snapshot for that account.
-- Cycle activity   = latest snapshot in cycle minus baseline.
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
-- First-class recurring obligations tagged to a budget bucket.
-- next_charge_on is advanced by the client as cycles pass.
-- Soft-delete via active = false.
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
-- goals
-- Savings goals. If linked_account_id is set, current progress
-- is derived from that account's latest balance snapshot.
-- If not, current_cents is tracked manually.
-- ============================================================
create table goals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  target_cents      integer not null check (target_cents > 0),
  current_cents     integer not null default 0 check (current_cents >= 0),
  linked_account_id uuid references accounts(id) on delete set null,
  target_date       date,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

create index goals_user_idx on goals (user_id, sort_order);

-- One goal per linked account per user (prevents double-counting auto contributions)
create unique index goals_one_per_linked_account
  on goals (user_id, linked_account_id)
  where linked_account_id is not null;

-- ============================================================
-- goal_contributions
-- Tracks deposits toward savings goals.
-- source='auto': written when a linked savings account snapshot has a positive delta.
-- source='manual': user-entered via UI.
-- ============================================================
create type contribution_source as enum ('auto', 'manual');

create table goal_contributions (
  id            uuid primary key default gen_random_uuid(),
  goal_id       uuid not null references goals(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  amount_cents  integer not null check (amount_cents > 0),
  occurred_on   date not null default current_date,
  source        contribution_source not null default 'manual',
  snapshot_id   uuid references account_balance_snapshots(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now()
);

create index goal_contributions_goal_idx on goal_contributions (goal_id, occurred_on desc);
create index goal_contributions_user_idx on goal_contributions (user_id);

-- ============================================================
-- device_tokens
-- Stores APNs/FCM tokens for push notifications.
-- ============================================================
create type device_platform as enum ('ios', 'android', 'web');

create table device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null,
  platform    device_platform not null,
  created_at  timestamptz not null default now(),
  unique (user_id, token)
);

create index device_tokens_user_idx on device_tokens (user_id);

-- ============================================================
-- Row Level Security — all tables scoped to auth.uid() = user_id
-- ============================================================
alter table profile                   enable row level security;
alter table accounts                  enable row level security;
alter table account_balance_snapshots enable row level security;
alter table subscriptions             enable row level security;
alter table goals                     enable row level security;

-- profile
create policy "profile: own select"  on profile for select using (auth.uid() = user_id);
create policy "profile: own insert"  on profile for insert with check (auth.uid() = user_id);
create policy "profile: own update"  on profile for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- accounts
create policy "accounts: own select" on accounts for select using (auth.uid() = user_id);
create policy "accounts: own insert" on accounts for insert with check (auth.uid() = user_id);
create policy "accounts: own update" on accounts for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "accounts: own delete" on accounts for delete using (auth.uid() = user_id);

-- account_balance_snapshots (immutable — no update policy)
create policy "snapshots: own select" on account_balance_snapshots for select using (auth.uid() = user_id);
create policy "snapshots: own insert" on account_balance_snapshots for insert with check (auth.uid() = user_id);
create policy "snapshots: own delete" on account_balance_snapshots for delete using (auth.uid() = user_id);

-- subscriptions
create policy "subscriptions: own select" on subscriptions for select using (auth.uid() = user_id);
create policy "subscriptions: own insert" on subscriptions for insert with check (auth.uid() = user_id);
create policy "subscriptions: own update" on subscriptions for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "subscriptions: own delete" on subscriptions for delete using (auth.uid() = user_id);

-- goals
create policy "goals: own select" on goals for select using (auth.uid() = user_id);
create policy "goals: own insert" on goals for insert with check (auth.uid() = user_id);
create policy "goals: own update" on goals for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals: own delete" on goals for delete using (auth.uid() = user_id);

-- goal_contributions
alter table goal_contributions enable row level security;
create policy "contributions: own select" on goal_contributions for select using (auth.uid() = user_id);
create policy "contributions: own insert" on goal_contributions for insert with check (auth.uid() = user_id);
create policy "contributions: own update" on goal_contributions for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "contributions: own delete" on goal_contributions for delete using (auth.uid() = user_id);

-- device_tokens
alter table device_tokens enable row level security;
create policy "tokens: own select" on device_tokens for select using (auth.uid() = user_id);
create policy "tokens: own insert" on device_tokens for insert with check (auth.uid() = user_id);
create policy "tokens: own delete" on device_tokens for delete using (auth.uid() = user_id);
