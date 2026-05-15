# Budget — Architectural Guide

> A personal finance dashboard for people who actually want to know where their money goes.
> This guide is for anyone joining this codebase cold — it explains not just *what* the code
> does, but *why* it looks the way it does.

---

## Table of Contents

**Part I — Orientation**
- [1. What This App Is](#1-what-this-app-is)
- [2. The User's Mental Model](#2-the-users-mental-model)
- [3. The Tech Stack at a Glance](#3-the-tech-stack-at-a-glance)

**Part II — The Architecture**
- [4. The Three-Tier Topology](#4-the-three-tier-topology)
- [5. The Provider Tree and Bootstrap](#5-the-provider-tree-and-bootstrap)
- [6. Routing and the Auth Gate](#6-routing-and-the-auth-gate)

**Part III — The Data Model**
- [7. The Postgres Schema, Table by Table](#7-the-postgres-schema-table-by-table)
- [8. The Snapshot Ledger](#8-the-snapshot-ledger)
- [9. Cents, Everywhere](#9-cents-everywhere)
- [10. The 14-Day Pay Cycle](#10-the-14-day-pay-cycle)
- [11. The Dual-Mode Account Model](#11-the-dual-mode-account-model)
- [12. The 50/30/20 Buckets](#12-the-503020-buckets)

**Part IV — The Integration Surfaces**
- [13. The Plaid Dance](#13-the-plaid-dance)
- [14. Passkeys and the Magic-Link Bridge](#14-passkeys-and-the-magic-link-bridge)
- [15. Push Notifications Without a Vendor SDK](#15-push-notifications-without-a-vendor-sdk)
- [16. Capacitor — The iOS Shell](#16-capacitor--the-ios-shell)
- [17. The Legacy Teller Code](#17-the-legacy-teller-code)

**Part V — Cross-Cutting Concerns**
- [18. The React Query Pattern](#18-the-react-query-pattern)
- [19. The Sheet Pattern](#19-the-sheet-pattern)
- [20. The Styling System](#20-the-styling-system)
- [21. Subscription Auto-Detection](#21-subscription-auto-detection)
- [22. The Small Features](#22-the-small-features)

**Part VI — Operations**
- [23. Deployment, End to End](#23-deployment-end-to-end)
- [24. Environments](#24-environments)
- [25. Glossary](#25-glossary)

**Back Matter**
- [Source Tree Map](#source-tree-map)
- [Further Reading](#further-reading)

---

## How to Read This Guide

If you're new to the codebase, read Parts I through III in order. They build the conceptual
vocabulary that everything else assumes. Part IV covers the most interesting engineering —
the bank-sync dance, the passkey flow, the handrolled APNs client — and can be read in any
order once you have the data model. Part V is reference material; come back to it when
something confuses you. Part VI is the "turn the key" section for running or deploying the app.

Every claim about code includes a `file:line` citation. The source tree map at the end gives
you the full inventory.

---

# Part I — Orientation

## 1. What This App Is

Budget is a personal finance dashboard. It lets you track account balances, understand where
your spending goes, manage recurring subscriptions, set savings goals, and review trends across
pay cycles. It is built for and used by a small, closed group of people — the design
explicitly assumes five or fewer users and deliberately avoids the complexity that multi-tenancy
or commercial scale would impose.

The product has seven pages:

| Page | Route | Core purpose |
|---|---|---|
| Dashboard | `/` | Aggregate view: net worth, spending buckets, recent subscriptions, goal progress |
| Accounts | `/accounts` | Add, edit, and link bank accounts |
| Transactions | `/transactions` | Bank transaction list, import from Plaid, categorize |
| Subscriptions | `/subscriptions` | Recurring charges, auto-detection, tracking |
| Goals | `/goals` | Savings targets with linked accounts and contribution logs |
| History | `/history` | Past 10 pay cycles, per-account balance trends, net worth chart |
| Settings | `/settings` | Profile, budget split, theme, passkeys, push notifications, data export |

Plus two non-routed flows: **Onboarding** (shown instead of the dashboard when the user has
no profile yet) and the **Auth flow** (Sign In, Forgot Password, Reset Password, Callback).

**What this app is not:** a commercial product, a multi-user SaaS, a mobile-first app with its
own App Store presence as the primary distribution channel, or a compliance-regulated financial
service. Those non-goals are load-bearing — they justify dozens of decisions throughout the
codebase that would look wrong in a larger product.

---

## 2. The User's Mental Model

Before reading any code, you need to understand how the user thinks about their money. The
app models three interrelated concepts.

### The 50/30/20 Budget Rule

Every dollar of take-home pay is allocated to one of three *buckets*:

- **Needs** (default 50%) — rent, groceries, utilities, transport, healthcare
- **Wants** (default 30%) — dining, entertainment, shopping, travel
- **Savings** (default 20%) — investments, debt repayment, savings goals

The user sets their own percentages in Settings. The Dashboard then shows how much they've
actually spent in each bucket this cycle versus their target. The percentages must sum to
100; the app enforces this.

Both *transactions* and *subscriptions* are classified into buckets. A Netflix charge is a
Want; your electricity bill is a Need. The app auto-classifies based on Plaid's category data
and lets the user override.

### The 14-Day Pay Cycle

Most budget apps work on calendar months. This app works on biweekly pay cycles because the
user is paid every two weeks. A *cycle* is a 14-day window that starts on the user's payday.
The user sets an *anchor date* — the most recent actual payday — and the app derives all past
and future cycle boundaries from that anchor using simple arithmetic (see Chapter 10).

Why not calendar months? Because money actually enters the user's account on a biweekly
cadence, and measuring spending against that actual cadence is more meaningful than forcing
it into an artificial calendar grid.

### Manual vs. Linked Accounts

The app supports two kinds of accounts:

- **Manual accounts** — the user taps in their balance. Simple, no bank credentials, fully
  editable. Every balance update is recorded and the history is queryable.
- **Linked accounts** — connected to a real bank via Plaid. Balances are pulled automatically.
  The balance is read-only in the UI; the user can't override it with a manual entry.

Both types exist side-by-side. A user might track their Discover card (linked, synced from
Plaid) alongside a cash envelope (manual, whatever they say it is). The rule for telling them
apart in code: `Boolean(account.plaid_item_id)` — if set, it's linked.

---

## 3. The Tech Stack at a Glance

**React + Vite** — The frontend is a single-page application built with React 18. Vite
handles bundling and the dev server. React Router v6 handles client-side routing. There is
no server-side rendering. The compiled output is static HTML/JS/CSS.

**Supabase** — Supabase provides three things: a managed Postgres database, an Auth service
(built on top of the GoTrue JWT system), and a Deno-based Edge Functions runtime. All three
live in one Supabase project. The Postgres schema and RLS policies are the authoritative source
of truth for data access control.

**Vercel** — The frontend SPA is deployed to Vercel. Vercel knows nothing about the database or
Plaid; it just serves the static files and rewrites all paths to `index.html`.

**Plaid** — The third-party service that provides read-only access to users' bank accounts.
Plaid handles the OAuth-style user authentication with the bank; the app receives a token it
exchanges for account data. Plaid is covered in depth in Chapter 13.

**Capacitor** — The same React codebase is wrapped in a Capacitor iOS shell, producing a
native iOS app with access to Face ID, push notifications, and the iOS status bar. The app
is still a web app at heart; Capacitor is a thin native wrapper around a WKWebView.

**SimpleWebAuthn** — Passkeys (Touch ID / Face ID on the web) are implemented using the
SimpleWebAuthn library pair: `@simplewebauthn/browser` (v9) in the React app and
`@simplewebauthn/server` (v13) in the Edge Functions.

**APNs** — Push notifications are sent directly to Apple's Push Notification service using
a hand-rolled JWT client in Deno, with no third-party push SDK involved.

---

# Part II — The Architecture

## 4. The Three-Tier Topology

```
┌─────────────────────────────────────────────────────────────────┐
│  USER                                                           │
│  Browser (Vercel SPA) or iOS app (Capacitor + WKWebView)        │
│                                                                 │
│  React + Vite + React Query + React Router                      │
│  Reads: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY               │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS (anon JWT or session JWT)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  SUPABASE EDGE FUNCTIONS  (Deno runtime)                        │
│                                                                 │
│  plaid-link-token    plaid-exchange    plaid-sync               │
│  plaid-transactions  plaid-list-accounts  plaid-remove-item     │
│  passkey-register-options  passkey-register-verify              │
│  passkey-auth-options  passkey-auth-verify                      │
│  notify-cron                                                    │
│                                                                 │
│  Secrets: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV             │
│           APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID  │
│           SUPABASE_SERVICE_ROLE_KEY                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Service-role key (bypasses RLS)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  SUPABASE POSTGRES                                              │
│                                                                 │
│  profile  accounts  account_balance_snapshots  subscriptions    │
│  transactions  goals  goal_contributions  device_tokens         │
│  passkey_credentials  passkey_challenges  transaction_rules     │
│  plaid_items  teller_enrollments                                │
│                                                                 │
│  All tables: RLS via auth.uid() = user_id                       │
│  Integration tables: service-role only                         │
└─────────────────────────────────────────────────────────────────┘
```

The critical insight here is the **secret split**. Plaid credentials (and APNs keys) are
stored as Supabase secrets, accessible only to Edge Functions via `Deno.env.get()`. They
never pass through Vercel and never reach the browser. The browser only holds two values:
`VITE_SUPABASE_URL` (the project URL, not secret) and `VITE_SUPABASE_ANON_KEY` (the public
anon key, safe to expose — RLS enforces authorization). Everything that needs to be kept
secret lives one tier deeper, in the Edge Functions.

---

## 5. The Provider Tree and Bootstrap

Application startup proceeds in two phases: native setup before React mounts, then the
React provider tree.

### Phase 1: Before React (`src/main.tsx`)

```typescript
applyTheme(getTheme())  // reads localStorage, sets data-theme on <html>
initNative()            // Capacitor: sets status bar color, installs MutationObserver
createRoot(...).render(<StrictMode><App /></StrictMode>)
```

`applyTheme` must run before React so there's no flash of the wrong theme. `initNative`
must run before React so the native status bar is in sync with the initial theme. Both are
synchronous operations on the `<html>` element (`src/lib/theme.ts`, `src/main.tsx:10-30`).

### Phase 2: The Provider Tree

```
<App>                                   src/App.tsx:135
  <QueryClientProvider>                 staleTime=30s, retry=2
    <BrowserRouter>                     React Router v6
      <AuthProvider>                    holds session, loading, recoveryPending
        <AppRoutes>                     gate: recoveryPending → ResetPassword
          ↓ (authenticated)             ↓
          <AuthenticatedApp>            fires side effects
            useBiometricLock()          Face ID gate on iOS
            useAutoLogout()             30-min idle → signOut
            usePushRegistration()       APNs token registration on iOS
            hideSplash()                hides Capacitor splash screen
            ↓ (!locked && profile)
            <AppLayout>                 sidebar + bottom nav shell
              <Routes>                  actual page components
```

`QueryClientProvider` is outermost (after `App`) because both `AuthProvider` and every page
component depend on `useQueryClient`. `BrowserRouter` wraps `AuthProvider` so that
`AuthProvider` can use `useNavigate` indirectly (via the callback). `AuthProvider` wraps
`AppRoutes` so the session state is available during routing decisions.

The `isSupabaseConfigured` check at `App.tsx:136` short-circuits the entire tree if the
`.env.local` file is missing or unpopulated, rendering a `SetupScreen` instead of a broken
app with cryptic errors. This is the only place in the codebase where the Supabase
configuration is validated.

---

## 6. Routing and the Auth Gate

Routing in `App.tsx` operates as two nested decision trees.

### The outer gate: `AppRoutes`

`AppRoutes` (`src/App.tsx:80-112`) reads `useAuth()` and resolves one of three states:

1. **`recoveryPending === true`** — The user arrived via a password-reset link. Every URL
   renders `<ResetPassword />`. They cannot navigate away until they set a new password.
   This is a security measure: without it, a user with the reset link could use the session
   to access the dashboard before completing the reset.

2. **`!session`** — User is not logged in. Three routes are available:
   `/auth/callback`, `/auth/forgot`, and `*` → `<SignIn />`. Every other path quietly
   redirects to the sign-in screen.

3. **Authenticated** — Renders `<AuthenticatedApp />`.

### The inner gate: `AuthenticatedApp`

`AuthenticatedApp` (`src/App.tsx:39-78`) adds two more checks before showing the app:

- **`locked`** — On iOS, if Face ID is required (user has enabled biometric lock in Settings
  and the app resumed from background), renders `<BiometricLock />` instead of anything else.
- **`!profile`** — If the database `profile` row doesn't exist yet (new user, first login),
  renders `<Onboarding />` instead of `<AppLayout>`. Onboarding collects paycheck amount,
  budget percentages, and cycle anchor date, then writes the profile row. On next render,
  `useProfile()` returns data and the gates open.

`Onboarding` is deliberately route-less. It renders in place, with no URL change, because
there's no meaningful URL for "you haven't set up your profile yet." Making it a redirect
would require knowing where to send the user back after onboarding completes, which adds
complexity for no user-facing benefit.

---

# Part III — The Data Model

## 7. The Postgres Schema, Table by Table

The schema lives in `supabase/schema.sql` (the full baseline) plus six additive migration
files in `supabase/migrations/`. The migration convention: always additive, always wrapped
in `IF NOT EXISTS` guards, always run manually via the Supabase SQL editor (never automated).

### The user-facing tables (RLS: `auth.uid() = user_id`)

**`profile`** — One row per user. Stores `paycheck_cents` (monthly take-home), budget
percentages (`needs_pct`, `wants_pct`, `savings_pct`, defaults 50/30/20), `cycle_anchor_date`,
and `dashboard_widget` (a JSONB blob recording which hero widget is selected on the dashboard).
The app renders `<Onboarding />` when this row is missing.

**`accounts`** — Every account the user has added, manual or linked. Has `type` (one of the
four `account_type` enum values: `checking`, `savings`, `credit_card`, `investment`),
`credit_limit_cents`, `due_day`, `sort_order`, and `archived`. Also carries Plaid and Teller
linkage columns (see Chapter 11).

**`account_balance_snapshots`** — An immutable ledger of balance readings. See Chapter 8.

**`subscriptions`** — Recurring charges. Has `name`, `amount_cents`, `cadence`
(`weekly/monthly/yearly`), `next_charge_on`, `bucket`, and `active`. The app advances
`next_charge_on` each cycle (see Chapter 21).

**`transactions`** — Bank transactions imported from Plaid. Has `amount_cents`, `description`,
`merchant_name`, Plaid category codes (`pfc_primary`, `pfc_detailed`), `date`, `bucket`,
`tag`, `category_override` (whether the user has manually overridden the bucket), and
`is_income`.

**`goals`** — Savings goals. Has `target_cents`, `current_cents`, `target_date`, and an
optional `linked_account_id`. When a savings account is linked to a goal, balance increases
auto-create contribution records (see Chapter 8).

**`goal_contributions`** — A log of contributions toward a goal, either `auto` (created by
the snapshot system) or `manual` (user-entered). Each row optionally references the
`account_balance_snapshots` row that triggered it.

**`device_tokens`** — APNs device tokens per user. Written by the iOS app on launch;
read by the `notify-cron` edge function.

**`passkey_credentials`** — Registered WebAuthn credentials. Has `credential_id`, `public_key`
(base64), `counter` (for replay defense), `transports`, `device_name`, `aaguid`. See
Chapter 14.

**`transaction_rules`** — User-defined merchant-to-bucket rules. A rule with
`merchant_pattern = 'whole foods'` and `bucket = 'needs'` will auto-classify any future
Whole Foods transaction.

### The service-role-only tables (RLS enabled, no client policy)

**`plaid_items`** — Stores the Plaid `access_token` for each connected institution. RLS is
enabled but no client-side SELECT policy exists, so a browser client with even a valid user
JWT cannot read this table. Only Edge Functions using the service-role key can. See Chapter 13.

**`teller_enrollments`** — Same idea for the legacy Teller integration. See Chapter 17.

**`passkey_challenges`** — Temporary challenge storage for the WebAuthn flow. RLS enabled,
no client policy, 5-minute TTL enforced by an `expires_at` column. See Chapter 14.

---

## 8. The Snapshot Ledger

The most important architectural decision in this app is that **balances are never stored as
a single mutable number**. Instead, every balance update — whether typed in by the user or
pulled from Plaid — inserts a new row into `account_balance_snapshots`. The current balance
is always derived by taking the most recent snapshot for each account.

### Why immutability?

Consider what you lose with a mutable balance:

```
-- Mutable: one row, updated in place
accounts: { id, balance_cents: 5420 }
-- Question: what was my balance on March 12? Answer: unknowable.
```

With the snapshot ledger:

```
account_balance_snapshots:
  { account_id, balance_cents: 4800, recorded_at: 2026-03-10 }
  { account_id, balance_cents: 5200, recorded_at: 2026-03-12 }
  { account_id, balance_cents: 5420, recorded_at: 2026-03-18 }
```

Now you can answer any historical question: what was the balance on any date, how much did
it change within a pay cycle, what was the net worth at the end of last year. The History
page (`src/pages/History.tsx`) and the net worth chart depend entirely on this.

### How "current balance" is derived

`useLatestBalances()` (`src/data/snapshots.ts:8`) fetches all snapshots ordered by
`recorded_at DESC` and deduplicates by `account_id` in JavaScript — the first row seen for
each account is the most recent. This is a single query, not one-per-account, so it's
efficient.

### How "cycle activity" is derived

`useCycleActivitySnapshots()` (`src/data/snapshots.ts:32`) fetches all snapshots in a
window starting 16 days before the current cycle and ending 1 day after. The 16-day
lookback ensures there's always at least one pre-cycle snapshot available even if the user
didn't update balances precisely at cycle start.

```
          -16d                  cycleStart           cycleEnd     +1d
           |________________________|___________________|___________|
           │◄── lookback window ───►│◄─── this cycle ──►│
           │
           last pre-cycle snapshot = baseline
                                     last in-cycle snapshot = current
                                     delta = current − baseline
```

`computeActivity()` (`src/data/snapshots.ts:55`) performs this derivation: for each account,
find the last snapshot before `cycleStart` (the baseline) and the last snapshot during the
cycle (current). `delta = current − baseline`. A positive delta on a checking account means
the balance grew; a positive delta on a credit card means the balance owed grew.

### The auto-contribution side effect

When the user manually updates a *savings* account's balance (`useUpdateBalance()`,
`src/data/snapshots.ts:86`), the mutation checks whether the balance increased. If it did,
and that account is linked to a goal, it automatically inserts a `goal_contributions` row
with `source = 'auto'` and a reference to the new snapshot. This is the only place in the
app where a single user action writes to two tables.

---

## 9. Cents, Everywhere

Every monetary value in this application — in the database, in API request/response bodies,
in React state, in every computation — is stored as an **integer count of cents**.

The reason is floating-point arithmetic. `0.1 + 0.2` in JavaScript is `0.30000000000000004`.
When you're adding up dozens of subscription amounts or computing a budget percentage,
accumulated floating-point error produces results that are wrong in the last cent or two.
Storing everything as integers eliminates this entirely: integer addition is exact.

Three helpers in `src/lib/money.ts` handle the boundary between the cent-integer world and
the human-readable string world:

```typescript
// Display: $5,420.00 — the only place cents become a formatted string
formatMoney(cents: number): string

// Input: user types "54.20" → 5420
parseCents(value: string): number

// Form pre-fill: 5420 → "54.20" (no currency symbol, for <input> values)
formatDollars(cents: number): string
```

The edge functions enforce the same convention. Plaid returns balances as floating-point
dollars with two decimal places. The `plaid-sync` function converts them:
`Math.round(balance * 100)`. The `Math.round` matters — `.toFixed(2)` and integer
multiplication alone can still drift by one cent on values like `$10.995`.

Plaid also has an unusual sign convention for transactions: a **positive** amount means
money left the account (a debit). The `plaid-transactions` function normalizes this:
`amount_cents = Math.round(Math.abs(rawAmount) * 100)` and `is_income = rawAmount < 0`.

---

## 10. The 14-Day Pay Cycle

All of the app's time-based analysis is relative to the current pay cycle. The cycle system
is in `src/lib/cycle.ts` and is the most mathematically dense part of the codebase.

### The anchor date

The user sets a `cycle_anchor_date` in their profile: the date of their most recent payday.
All cycle boundaries are derived from this single date using modular arithmetic.

```typescript
// src/lib/cycle.ts:5-13
export function currentCycleStart(anchor: string): Date {
  const anchorDate = parseISO(anchor)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = differenceInCalendarDays(today, anchorDate)
  if (diff < 0) return anchorDate
  const elapsed = Math.floor(diff / 14)
  return addDays(anchorDate, elapsed * 14)
}
```

The logic: how many complete 14-day periods have elapsed since the anchor? The current cycle
started `elapsed * 14` days after the anchor.

**Worked example:** Anchor is 2026-01-01 (a Thursday). Today is 2026-05-15.
- `diff = 134 days`
- `elapsed = Math.floor(134 / 14) = 9`
- `cycleStart = 2026-01-01 + 9*14 = 2026-01-01 + 126 days = 2026-05-07`
- `cycleEnd = 2026-05-07 + 13 = 2026-05-20`

The current cycle runs May 7–20.

### Cycle keys in React Query

`cycleKey(start)` formats the cycle start as `'yyyy-MM-dd'`. This string is used directly
as part of the React Query cache key: `['snapshots', 'activity', '2026-05-07']`. When the
cycle advances (at midnight on a cycle boundary), the key changes and React Query
automatically treats it as a cache miss, fetching fresh data for the new cycle.

### Why not calendar months?

Calendar months have 28, 29, 30, or 31 days. Spending patterns that look concerning against
a 28-day February baseline might look fine against a 31-day March. Biweekly cycles are
perfectly regular — every cycle is exactly 14 days — making comparisons between cycles
unambiguous.

---

## 11. The Dual-Mode Account Model

An account's mode determines how its balance gets updated and how the user interacts with it.

```typescript
// Detection: everywhere in the app
const isLinked = (a: Account) => Boolean(a.plaid_item_id || a.teller_enrollment_id)
```

**Manual accounts** are the simpler case. The user taps an account card and the
`UpdateBalanceSheet` opens, letting them type in a new balance. The sheet also lets them
edit nickname, credit limit, and due day. When they save, `useUpdateBalance()` inserts a
new snapshot and closes the sheet.

**Linked accounts** have their balance owned by the bank. The UI reflects this: tapping a
linked account opens `EditAccountSheet` (nickname, credit metadata only — no balance input
field). The balance shown on the card comes from the most recent Plaid-synced snapshot, and
a "Synced X hours ago" badge replaces the tap-to-edit affordance.

Both types are displayed as the same `AccountCard` component (`src/components/AccountCard.tsx`).
The component inspects `isLinked(account)` to choose which badge and which tap behavior to
render.

**Why both Teller and Plaid columns coexist on `accounts`:** Teller was the original bank
integration. When Plaid replaced it, the Teller columns were left in place (migration
convention: additive only, never drop). Any account linked in the Teller era still has
`teller_account_id` and `teller_enrollment_id` populated; new accounts only have Plaid
columns. The `isLinked` check handles both.

---

## 12. The 50/30/20 Buckets

"Bucket" is the app's term for the needs/wants/savings category assignment. It appears in
two independent but related contexts.

### Bucket as a budget target

The user's `profile` stores three percentages. Multiplied by `paycheck_cents`, they become
the spending targets for the current cycle:

```
needsTarget  = paycheck_cents × (needs_pct / 100)
wantsTarget  = paycheck_cents × (wants_pct / 100)
savingsTarget = paycheck_cents × (savings_pct / 100)
```

The Dashboard's `BucketCard` components compare actual spending (from `useCycleTransactionBuckets`)
plus subscription charges this cycle (from `subsThisCycle`) against these targets, and render
a progress bar that turns red when the user is over budget.

### Bucket as a transaction classification

Every `transaction` row has a `bucket` column: one of `needs`, `wants`, `savings`, or
`uncategorized`. New transactions imported from Plaid are auto-classified by `categorizePlaid()`
in the `plaid-transactions` edge function, which maps Plaid's Personal Finance Category (PFC)
taxonomy to the app's three buckets:

- `FOOD_AND_DRINK_GROCERIES` → `needs`
- `TRANSPORTATION_*`, `RENT_AND_UTILITIES_*`, `MEDICAL_*` → `needs`
- `FOOD_AND_DRINK_*` (non-grocery), `ENTERTAINMENT_*`, `GENERAL_MERCHANDISE_*` → `wants`
- `TRANSFER_IN/OUT_*`, `LOAN_PAYMENTS_*`, `INVESTMENTS_*` → `savings`
- Everything else → `uncategorized`

The user can re-classify any transaction from the Transactions page. When they do,
`useUpdateTransaction()` sets `category_override = true`. This flag is critical: on the next
`plaid-transactions` sync, overridden rows are updated in all fields *except* `bucket` —
preserving the user's classification across re-imports.

The same bucket concept applies to `subscriptions`: each subscription is tagged `needs`,
`wants`, or `savings`. The `BucketDetailSheet` shows both transaction amounts and subscription
charges together per bucket, giving the user the complete picture.

---

# Part IV — The Integration Surfaces

## 13. The Plaid Dance

Plaid provides access to users' bank data. The defining constraint of the integration is
this: **the Plaid `access_token` must never reach the browser**. It is a long-lived credential
that can query a user's real bank account. Once it exists, it lives only in the `plaid_items`
database table, readable only by Edge Functions using the service-role key.

The flow from "tap Link Bank" to "balances appear on screen" involves six steps across three
tiers:

```
Browser                    Edge Functions              Plaid API / Postgres
  │                              │                           │
  │── GET link token ───────────►│                           │
  │                              │── /link/token/create ────►│
  │◄─ { link_token } ────────────│◄─ { link_token } ─────────│
  │                              │                           │
  │ window.Plaid.create(token)   │                           │
  │    ↓ [Plaid overlay opens — user authenticates with bank]│
  │◄── onSuccess(publicToken, metadata)                      │
  │                              │                           │
  │── POST { public_token } ────►│                           │
  │                              │── /public_token/exchange ►│
  │                              │◄─ { access_token, item_id}│
  │                              │                           │
  │                              │── INSERT plaid_items ─────►Postgres
  │◄─ { plaid_item_db_id } ──────│   (service-role write)   │
  │                              │                           │
  │── useAddAccount() × N ──────────────────────────────────►Postgres (RLS)
  │── useLinkAccountToPlaid() ──────────────────────────────►Postgres (RLS)
  │── usePlaidSync() ───────────►│                           │
  │                              │── /accounts/balance/get ─►│
  │                              │── INSERT snapshots ───────►Postgres
  │◄─ { synced } ────────────────│                           │
  │                              │                           │
  [React Query invalidates snapshots → UI updates]
```

**Step 1 — Link token:** `plaid-link-token` (`supabase/functions/plaid-link-token/index.ts`)
calls Plaid's `/link/token/create` with the user's UUID as `client_user_id`. It uses the
Plaid API keys from Deno environment secrets. The token is short-lived and single-use.

**Step 2 — Plaid overlay:** The browser loads `cdn.plaid.com/link/v2/stable/link-initialize.js`
once via `useLoadPlaidLink()` (`src/data/plaid.ts`). `window.Plaid.create({ token })` opens
Plaid's hosted overlay. The user's bank credentials are entered *inside Plaid's iframe*, never
seen by this app.

**Step 3 — Exchange:** On success, Plaid calls `onSuccess(publicToken, metadata)`. The
`public_token` is a single-use code valid for 30 minutes. `plaid-exchange`
(`supabase/functions/plaid-exchange/index.ts`) trades it for the real `access_token`:

```typescript
// supabase/functions/plaid-exchange/index.ts:60-77
// Upsert plaid_items row — access_token never leaves this function
const { data: plaidItem } = await adminClient
  .from('plaid_items')
  .upsert({ user_id, plaid_item_id, plaid_access_token: access_token, ... },
           { onConflict: 'user_id,plaid_item_id' })
  .select('id').single()

return json({ plaid_item_db_id: plaidItem.id })
```

The `access_token` is written to `plaid_items` using the *service-role* client (bypasses RLS)
and is never included in the response. The browser only receives a UUID reference.

**Step 4 — Account type mapping:** The `metadata` from Plaid includes account type and
subtype. `Accounts.tsx:25-31` maps these to the app's four-bucket taxonomy: `credit` →
`credit_card`, `investment` → `investment`, savings-family subtypes → `savings`, everything
else → `checking`.

**Step 5 — Balance sync:** `plaid-sync` reads the `access_token` from `plaid_items` server-
side, calls Plaid's `/accounts/balance/get`, and inserts a `account_balance_snapshots` row
per account. It includes a one-hour throttle — if the last sync was within 60 minutes, it
skips that account. For balance selection: credit cards use `current` (amount owed), checking
and savings prefer `available` (what you can spend) falling back to `current`, investments
use `current` (portfolio value).

**Step 6 — Transaction import:** `plaid-transactions` is separate from the sync. It fetches
730 days of transactions, paginates Plaid's API 500 at a time, and upserts each one. The
`category_override` preservation (described in Chapter 12) ensures re-imports don't clobber
user edits.

**Why the access token is buried so deep:** A leaked `access_token` is a permanent credential
that lets anyone read the user's bank data. The `public_token` is also sensitive but at least
expires in 30 minutes. Burying the exchange in an Edge Function with service-role writes
means even a compromised browser client (XSS, etc.) cannot extract the token.

---

## 14. Passkeys and the Magic-Link Bridge

Passkeys (Touch ID on Mac/iPhone, Windows Hello, etc.) are an alternative to password-based
sign-in. They use the WebAuthn standard: the device holds a private key, the server holds
the public key, and authentication is a cryptographic challenge-response with no password
ever transmitted.

The implementation uses two SimpleWebAuthn packages that must stay in sync: browser v9 and
server v13. (The recent commit history reflects a stabilization arc; the current versions are
verified working.)

### Registration (one-time, for enrolled users)

```
Browser (authenticated)     Edge Functions              Postgres
  │                              │                         │
  │── passkey-register-options ─►│                         │
  │                              │── INSERT passkey_challenges ──►│
  │◄─ { options, challenge } ────│                         │
  │                              │                         │
  │ startRegistration(options)   │                         │
  │   ↓ [device shows Face ID / Touch ID prompt]          │
  │◄── { registrationResponse }                           │
  │                              │                         │
  │── passkey-register-verify ──►│                         │
  │   { registrationResponse,    │── verifyRegistrationResponse()
  │     deviceName }             │── INSERT passkey_credentials ──►│
  │                              │── DELETE passkey_challenges ────►│
  │◄─ { success } ───────────────│                         │
```

The `passkey_challenges` table is RLS-enabled but has no client-facing policy — it is
deliberately inaccessible to any browser request, even one with a valid user JWT. Only
Edge Functions using the service-role key can read or write it. The `expires_at` column
(5 minutes from creation) prevents replay if the user abandons mid-flow.

### Authentication (passwordless sign-in)

```
Browser (no session)        Edge Functions              Postgres
  │                              │                         │
  │── passkey-auth-options ─────►│                         │
  │   (no Authorization header)  │── INSERT challenge (user_id=NULL) ──►│
  │◄─ { options } ───────────────│                         │
  │                              │                         │
  │ startAuthentication(options) │                         │
  │   ↓ [device prompts for Touch ID / Face ID]           │
  │◄── { authenticationResponse }                         │
  │                              │                         │
  │── passkey-auth-verify ──────►│                         │
  │   { authResponse, challenge} │── lookup challenge ─────►│
  │                              │── lookup credential ────►│
  │                              │── verifyAuthenticationResponse()
  │                              │── UPDATE counter ────────►│
  │                              │── DELETE challenge ──────►│
  │                              │── admin.getUserById()    │
  │                              │── admin.generateLink({   │
  │                              │     type: 'magiclink',   │
  │                              │     email               │
  │                              │   })                    │
  │◄─ { hashed_token } ──────────│                         │
  │                              │                         │
  │ supabase.auth.verifyOtp({    │                         │
  │   token_hash: hashed_token,  │                         │
  │   type: 'magiclink'          │                         │
  │ })                           │                         │
  │ window.location.href = '/'   │                         │
```

The critical line in `passkey-auth-verify` (`src:75-84`):

```typescript
const { data: linkData } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: user.email,
})
return json({ hashed_token: linkData.properties.hashed_token })
```

And on the client (`src/hooks/usePasskey.ts:68-74`):

```typescript
const { error } = await supabase.auth.verifyOtp({
  token_hash: result.hashed_token,
  type: 'magiclink',
})
window.location.href = '/'
```

**Why the magic-link bridge?** Supabase Auth doesn't have a built-in "set session for this
user without their password" API that a custom verifier can call directly. The `generateLink`
admin API creates a token that represents "this email has been authenticated," and `verifyOtp`
on the client redeems it for a real session. The entire email-delivery step is bypassed —
the token goes directly from the edge function's response to the `verifyOtp` call. No email
is sent, no link is clicked. The user sees only the Face ID prompt and then is signed in.

The passkey button is only shown on web (`!isNative && passkeySupported`,
`src/auth/SignIn.tsx:216`). On the native iOS app, Capacitor provides its own Face ID via
the biometric lock (which gates access after the app is already open), not as a sign-in
mechanism.

---

## 15. Push Notifications Without a Vendor SDK

Most apps use a service like Firebase Cloud Messaging (FCM) or OneSignal to abstract over
APNs. This app talks directly to the Apple Push Notification service using a hand-rolled JWT
client in `supabase/functions/notify-cron/apns.ts`.

### The APNs JWT

APNs requires a JWT signed with an ES256 (ECDSA P-256) key that Apple provides when you
create an APNs key in the Apple Developer portal. The JWT is valid for up to 60 minutes;
the app caches it for 55 to be safe. Deno's `crypto.subtle` API handles the signing without
any npm dependencies:

```typescript
// supabase/functions/notify-cron/apns.ts:28-44
const key = await crypto.subtle.importKey(
  'pkcs8',
  pemToPkcs8(pemKey),           // APNS_KEY secret (PEM → ArrayBuffer)
  { name: 'ECDSA', namedCurve: 'P-256' },
  false, ['sign']
)
const sig = await crypto.subtle.sign(
  { name: 'ECDSA', hash: 'SHA-256' },
  key,
  te.encode(`${header}.${claims}`)  // standard JWT signing input
)
```

### What triggers a notification

`notify-cron` is invoked daily at 09:00 UTC via a `pg_cron` schedule (documented as a
SQL comment in the function). It runs two queries:

1. Subscriptions where `next_charge_on = today + 2 days` — alerts the user two days before
   a charge hits.
2. Credit card accounts where `due_day = day(today + 3 days)` — alerts the user three days
   before the payment is due.

Per user, it loads all `device_tokens` with `platform = 'ios'` (Android and web tokens are
filtered out — this app only implements APNs), assembles an alert body, and fires one POST
per token to `https://api.push.apple.com/3/device/{token}`.

### Device registration

`src/hooks/usePushRegistration.ts` runs on every `AuthenticatedApp` mount, but only on the
native iOS platform (`isNative` check). It requests permissions, calls
`PushNotifications.register()`, and upserts the received token into `device_tokens`. The
upsert conflict key is `(user_id, token)`, so re-registration on the same device is
idempotent.

**Why no vendor SDK?** For ≤5 users sending at most a few pushes per day, a third-party
push service adds cost (even free tiers have limits), a new dependency, and another set of
credentials. The APNs direct API is not particularly complex; 65 lines of Deno handles the
full client.

---

## 16. Capacitor — The iOS Shell

The same React codebase that ships to Vercel is also bundled into an iOS app via Capacitor.
The flow: `vite build` produces `dist/`, then `cap sync ios` copies `dist/` into
`ios/App/App/public/`. The iOS app opens that directory in a WKWebView. From the JavaScript
perspective, it's the same React app — just running inside Safari's engine without a browser
chrome.

### Configuration

`capacitor.config.ts` sets the app ID (`com.adriang.budget`) and two plugin configurations:
`SplashScreen` (800ms display, no spinner) and `PushNotifications` (badge + sound + alert
presentation modes). The `contentInset: 'always'` tells Capacitor to render the web content
behind the status bar, which the app's own CSS (`env(safe-area-inset-top)`) handles.

### Native plugins

| Package | Version | Usage |
|---|---|---|
| `@capacitor/app` | 8 | `appStateChange` event for biometric lock |
| `@capacitor/preferences` | 8 | Persists `biometric_enabled` flag |
| `@capacitor/push-notifications` | 8 | APNs registration |
| `@capacitor/splash-screen` | 8 | Hidden in `App.tsx` after mount |
| `@capacitor/status-bar` | 8 | Color/style set from `data-theme` |
| `@aparajita/capacitor-biometric-auth` | 10 | Face ID / Touch ID |

### Biometric lock

`useBiometricLock()` (`src/hooks/useBiometricLock.ts`) listens for `appStateChange` events.
When `isActive = true` (app comes to foreground) and the user has `biometric_enabled: 'true'`
in Capacitor Preferences, it sets `locked = true`. `AuthenticatedApp` then renders
`<BiometricLock />` instead of `<AppLayout>`. `BiometricLock` calls
`BiometricAuth.authenticate()`. On success, it calls `onUnlock()` which clears `locked`.

### Status bar theming

`src/main.tsx:13-24` sets the native status bar color immediately on startup (synchronously,
before React renders) and installs a `MutationObserver` on `<html>` to re-sync the status
bar color whenever `data-theme` changes. This means theme switching in Settings takes effect
on the native status bar in real time.

### Building for iOS

```bash
npm run cap:sync   # vite build && cap sync ios
# Then open ios/App/App.xcworkspace in Xcode
# Build → Archive → Distribute via TestFlight
```

There is no automated iOS CI. The Xcode workspace in `ios/App/` is the output of `cap sync`
and should not be edited manually (it gets overwritten on each sync).

---

## 17. The Legacy Teller Code

Teller was the original bank integration. It was abandoned when Discover cards — a key use
case — turned out not to be supported. Plaid replaced it.

**What's still in the codebase:**

- `src/data/teller.ts` — hooks for `useTellerEnroll`, `useTellerSync`, etc. Not imported
  anywhere in the UI.
- `src/lib/teller.d.ts` — TypeScript declarations for `window.TellerConnect`. Not used.
- `supabase/functions/teller-{enroll,sync,transactions}/` — three Edge Functions, still
  deployed (presumably) but never called from the frontend.
- `teller_enrollments` table in Postgres.
- `teller_*` columns on `accounts` (see Chapter 11).

**What would break if you removed it today:**

- `src/components/AccountCard.tsx` reads `account.teller_institution_name` and
  `account.teller_last_synced_at` as fallbacks. Any account linked in the Teller era would
  lose its institution badge.
- Any user with an existing Teller enrollment would have dangling foreign keys if
  `teller_enrollments` were dropped.

**The safe removal path:** Update `AccountCard.tsx` to remove the Teller fallbacks. Verify
no existing accounts have `teller_enrollment_id` set. Then drop the Teller data hooks, type
declarations, and Edge Functions. The `teller_*` columns and table can be left in place
(additive convention) or cleaned up in a migration.

---

# Part V — Cross-Cutting Concerns

## 18. The React Query Pattern

React Query is the entire data layer. No component ever calls Supabase directly. The
discipline is enforced by convention — every `from('table_name')` call lives in a hook
inside `src/data/`.

### Query structure

```typescript
// Canonical query hook shape
export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('archived', false)
        .order('sort_order')
      if (error) throw error
      return data as Account[]
    }
  })
}
```

Query keys follow a hierarchical convention: `['domain']` for full-table queries,
`['domain', 'sub-key']` for derived views, `['domain', 'sub-key', param]` for parameterized
queries. Examples: `['accounts']`, `['snapshots', 'latest']`, `['snapshots', 'activity',
cycleKey]`, `['contributions', goalId]`.

### Mutation structure

```typescript
// Canonical mutation hook shape
export function useAddAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<Account, 'id' | 'created_at'>) => {
      const { data, error } = await supabase.from('accounts').insert(input).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] })
  })
}
```

Every mutation invalidates the related query keys on success, causing React Query to
re-fetch the affected data. Related queries are also invalidated when the relationship
demands it (e.g., archiving an account invalidates `['snapshots']` because snapshot queries
filter by account).

### Two exceptions to invalidation

`useUpsertProfile` and `useUpdateDashboardWidget` use `qc.setQueryData(['profile'], ...)` to
update the cache directly instead of invalidating. This avoids a round-trip to the database
for simple single-row updates where the new value is known immediately. It's the only place
in the codebase that does optimistic-style cache updates.

### Why this matters architecturally

Because all data flows through React Query, cache invalidation is the mechanism by which
one part of the UI notifies other parts that data has changed. Adding a contribution
(`useAddContribution`) invalidates `['contributions', goalId]` — the Goals page re-renders
with the updated progress automatically, even though the mutation was initiated from a sheet
on the same page. No prop drilling, no global state, no event bus.

---

## 19. The Sheet Pattern

Almost all user interactions — adding an account, updating a balance, editing a goal,
confirming a delete — happen in a modal overlay. The app uses a single `Sheet` component
(`src/components/Sheet.tsx`) for all of them.

### Responsive behavior

`Sheet` uses `useMediaQuery('(min-width: 1024px)')` to pick its mode:

- **Mobile** — A bottom sheet: enters from below (`translate-y-full → translate-y-0`),
  `rounded-t-2xl`, drag handle at the top, `padding-bottom: max(1.5rem, env(safe-area-inset-bottom))`
  for iPhone home-indicator clearance.
- **Desktop** — A centered modal card: `max-w-lg`, opacity/scale transition, `shadow-modal`.

Both share a `Backdrop` layer (semi-transparent overlay, z-45) and the inner content (z-50).
Pressing `Escape` closes the sheet.

### The 280ms close delay

When `onClose` is called, the sheet doesn't unmount immediately. It plays its exit animation
(the `translate-y-full` return or the scale-down) and then calls `onClose` after 280ms.
This is why the closing prop is named `onClose` rather than `isOpen` — the parent doesn't
control mounting; it fires an event.

### The `ConfirmSheet`

`src/components/ConfirmSheet.tsx` wraps `Sheet` to provide a generic confirmation dialog
with title, body, and confirm/cancel buttons. It accepts a `destructive?: boolean` prop
that makes the confirm button red. Used everywhere a delete or irreversible action is needed.

---

## 20. The Styling System

The design system is built from three layers: CSS custom properties, Tailwind config, and
`@layer components` utilities.

### Layer 1: CSS custom properties

`src/index.css` defines color tokens as CSS variables:

```css
:root {
  --color-bg: #f5f5f7;
  --color-surface: #ffffff;
  --color-text: #1a1a1a;
  --color-accent: #007aff;
  /* ... */
}
[data-theme="dark"] {
  --color-bg: #0a0a0b;
  --color-surface: #1c1c1e;
  /* ... */
}
```

`data-theme` is set on `<html>` by `applyTheme()` from localStorage, before React mounts.
This is the source of truth for light/dark mode — not `prefers-color-scheme`, not Tailwind's
`dark:` variant (both are also present but secondary to the explicit `data-theme`).

### Layer 2: Tailwind config

`tailwind.config.js` maps semantic names to the CSS variables:

```js
colors: {
  bg: 'var(--color-bg)',
  surface: 'var(--color-surface)',
  text: 'var(--color-text)',
  accent: 'var(--color-accent)',
  // ...
}
```

This means you write `bg-surface`, `text-accent`, `border-border` in JSX and get the right
color for whatever theme is active. No `dark:` prefixes anywhere in component code.

### Layer 3: Component utilities

`src/index.css` defines higher-level component classes in `@layer components`:

```css
.field  { /* 44px-min input with focus ring */ }
.btn    { /* 44px-min button base */ }
.btn-primary { /* filled accent button */ }
.btn-ghost   { /* transparent, text-only */ }
.card   { /* bg-surface border shadow-card rounded */ }
.section-label { /* text-xs uppercase tracking-wide text-muted */ }
.money  { /* font-mono tabular-nums */ }
```

The 44px minimum height is Apple's HIG recommendation for tappable targets. It applies to
both buttons and inputs.

### The `xs` breakpoint

`tailwind.config.js` adds a custom `xs: 390px` breakpoint. This is the width of the iPhone
14/15 in portrait — the narrowest common iOS form factor. It's used in `AppLayout.tsx` to
show/hide bottom nav label text: labels appear on `xs:` and wider, icons only below.

---

## 21. Subscription Auto-Detection

When the user has bank transactions imported via Plaid, the app can suggest subscriptions
it detects in the transaction history. The detection runs entirely in the browser —
no server processing.

### Stage 1: Recurrence detection

`detectSubscriptions()` (`src/lib/detectSubscriptions.ts:53`) groups expenses by merchant.
For each group with at least two occurrences:

1. Compute the gaps in days between consecutive transactions.
2. Take the **median** gap (not average — resistant to outliers from skipped months or
   irregular timing).
3. Classify the cadence: 6–9 days → `weekly`, 25–35 → `monthly`, 355–380 → `yearly`.
   Anything outside these windows is discarded.
4. Check amount consistency: every amount must be within 25% of the median amount. Variable
   charges (like a utility bill that fluctuates with usage) are intentionally excluded here.
5. Pick the dominant bucket from the transaction set (ignoring `uncategorized` votes).

### Stage 2: Category detection

`detectByCategory()` (`src/lib/detectSubscriptions.ts:122`) catches services that appear
only once in the history (new subscriber) but have a Plaid PFC code that strongly implies
a subscription:

```
ENTERTAINMENT_TV_AND_MOVIES         ENTERTAINMENT_MUSIC_AND_AUDIO
ENTERTAINMENT_VIDEO_GAMES           RENT_AND_UTILITIES_INTERNET_AND_CABLE
RENT_AND_UTILITIES_TELEPHONE        PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS
GENERAL_SERVICES_INSURANCE          GENERAL_SERVICES_SUBSCRIPTION
```

These suggestions always get `cadence: 'monthly'` since there's only one data point.

### User interaction

Suggestions are shown on the Subscriptions page, separated into "Recurring" and "Category"
sections. Dismissing a suggestion writes its name to `localStorage['dismissed_suggestions']`
— a JSON array — so it doesn't reappear. Confirming it calls `useAddSubscription` with the
inferred fields prefilled.

---

## 22. The Small Features

**CSV export** (`src/lib/export.ts`) — Five exporters produce comma-separated files for
accounts, balance snapshots, subscriptions, goals, and contributions. Each is triggered from
a button in Settings, creates a `Blob`, and fires a programmatic `<a download>` click.
Transactions are not exportable (they're already available in your bank).

**Auto-logout** (`src/hooks/useAutoLogout.ts`) — After 30 minutes of inactivity (no mouse,
keyboard, touch, or pointer events), calls `supabase.auth.signOut()`. The React Query cache
is cleared via `qc.clear()` in `AuthProvider.signOut()`, so no financial data lingers in
memory after logout.

**Biometric lock** (`src/components/BiometricLock.tsx`) — On iOS only. A full-screen overlay
that appears when the app resumes from background and the user has enabled biometric lock in
Settings. The lock flag is stored in `@capacitor/preferences` (not localStorage — native
storage, not cleared on app update). See Chapter 16.

**PWA install prompt** (`src/components/InstallPrompt.tsx`) — Shown on Chrome/Android using
the `beforeinstallprompt` event, and on iOS Safari with manual instructions (tap Share →
Add to Home Screen). The prompt is dismissed to `localStorage['install-dismissed']` and never
shown to standalone-mode users (already installed).

---

# Part VI — Operations

## 23. Deployment, End to End

### Frontend → Vercel

```bash
npm run build         # tsc -b && vite build → dist/
# Vercel auto-deploys on push to main
```

Vercel detects the Vite project automatically. No `vercel.json` configuration beyond the
SPA rewrite (`"/(.*)" → "/index.html"`). Environment variables needed:

```
VITE_SUPABASE_URL      = https://mnxcdlyftdpcgtmjkdzq.supabase.co
VITE_SUPABASE_ANON_KEY = <anon key from Supabase dashboard>
```

### Edge Functions → Supabase

```bash
supabase functions deploy plaid-link-token
supabase functions deploy plaid-exchange
# ... (one deploy per function)
```

Secrets (set once, persist until changed):

```bash
supabase secrets set PLAID_CLIENT_ID=...
supabase secrets set PLAID_SECRET=...
supabase secrets set PLAID_ENV=production  # or sandbox
supabase secrets set APNS_KEY_ID=...
supabase secrets set APNS_TEAM_ID=...
supabase secrets set APNS_BUNDLE_ID=com.adriang.budget
supabase secrets set APNS_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

### Database migrations → Supabase SQL editor

Migrations are **never** run via `supabase db push`. They are copy-pasted into the SQL editor
in the Supabase dashboard and run manually. This is deliberate — it prevents accidental
schema changes and provides a review step before any destructive change.

Migration naming: `supabase/migrations/00N_description.sql`. All SQL is wrapped in
`IF NOT EXISTS` guards so re-running is idempotent.

### iOS → TestFlight

```bash
npm run cap:sync   # vite build && cap sync ios
# Open ios/App/App.xcworkspace in Xcode
# Product → Archive → Distribute App → App Store Connect → Upload
# Then in App Store Connect: add to TestFlight group
```

The iOS build requires Apple Developer membership, the `com.adriang.budget` App ID registered
in the Apple Developer portal, and provisioning profiles in Xcode.

---

## 24. Environments

### Plaid environments

Plaid has two environments relevant to this app:

| Environment | `PLAID_ENV` value | What it connects to |
|---|---|---|
| Sandbox | `sandbox` | Fake bank credentials, unlimited connections, for testing |
| Production | `production` | Real banks, 10 free trial connections |

In Sandbox mode, Plaid Link shows a fake bank UI. Use credentials `user_good` / `pass_good`.
This is the safe way to test the Plaid flow end-to-end without using a real trial connection.

In Production, each "connection" (called an *Item* in Plaid's API) represents one bank
institution login. One Chase login that covers a checking + savings account counts as one
Item. With ≤5 users connecting 2-3 banks each, the 10 trial connections may be tight.
The Plaid dashboard shows how many trial connections have been used.

### Supabase

There is a single Supabase project for both development and production. Local development
uses `.env.local` pointing at the same Supabase project. If schema experimentation is needed,
create a separate Supabase project for a staging environment — but for a ≤5-user app, this
is rarely worth the overhead.

---

## 25. Glossary

**Access token** — A long-lived Plaid credential that authorizes reading a user's accounts and
transactions from a specific bank institution. Stored only in `plaid_items`, never in the
browser. Compare with *public token*.

**Anchor date** — The `cycle_anchor_date` in a user's profile: the date of their most recent
payday, from which all cycle boundaries are derived.

**AAGUID** — Authenticator Attestation GUID. A UUID that identifies the model of passkey
authenticator (e.g., "iPhone Face ID," "Chrome on macOS"). Stored in `passkey_credentials`
for auditing purposes.

**Bucket** — One of three spending categories: `needs`, `wants`, or `savings`. Applied to
both transactions and subscriptions. Also used as the budget dimension against which spending
is measured.

**Challenge** — In WebAuthn, a random token generated by the server, included in the
authenticator response, and verified by the server to prove the response is fresh and from
the expected flow. Stored in `passkey_challenges` with a 5-minute TTL.

**Cycle** — A 14-day window starting on a user's payday, derived from the anchor date.
The fundamental time unit for all budget calculations.

**hashed_token** — The Supabase magic-link token generated by `admin.generateLink()` and
used by `verifyOtp` on the client to establish a session. It is a one-time-use token that
bypasses the email delivery step in the passkey auth flow.

**Item** — Plaid's term for a single institution connection (one bank login). Stored in
`plaid_items`. One Item can cover multiple accounts at the same institution.

**Link token** — A short-lived Plaid token that opens the Plaid Link overlay. Created by
`plaid-link-token`, passed to `window.Plaid.create()`. Not sensitive (expires in 30 minutes,
single-use). Compare with *public token* and *access token*.

**PFC** — Plaid Personal Finance Category. A two-level taxonomy (`pfc_primary`,
`pfc_detailed`) assigned to every Plaid transaction. Used for bucket auto-classification
and subscription detection.

**Public token** — A short-lived, single-use Plaid token returned by the Plaid Link overlay
after the user authenticates with their bank. Valid for 30 minutes. Exchanged by
`plaid-exchange` for an *access token*.

**RP ID** — Relying Party ID in WebAuthn. The hostname portion of the app's origin
(e.g., `budget.vercel.app`). The authenticator binds the credential to this domain; the
credential cannot be used on a different origin.

**Service-role key** — The Supabase admin key that bypasses Row Level Security. Used only
inside Edge Functions to write to tables like `plaid_items` and `passkey_challenges` that
are intentionally inaccessible to browser clients.

**Snapshot** — A row in `account_balance_snapshots` recording a balance reading at a point
in time. The fundamental unit of the balance ledger. Immutable once written.

---

# Back Matter

## Source Tree Map

```
src/
├── App.tsx                       Root component: providers, routing, auth gate
├── main.tsx                      Entry point: theme init, native init, React mount
├── index.css                     Design tokens, component utilities (@layer components)
│
├── auth/
│   ├── AuthProvider.tsx          Session context (session, loading, recoveryPending)
│   ├── SignIn.tsx                Email/password sign-in + passkey button
│   ├── ForgotPassword.tsx        Triggers password-reset email
│   ├── ResetPassword.tsx         Accepts new password after reset link click
│   └── AuthCallback.tsx          Exchange URL hash for session after email link
│
├── pages/
│   ├── Dashboard.tsx             Hero widget, buckets, subscriptions, goals overview
│   ├── Accounts.tsx              Account grid, Plaid link flow, manual add
│   ├── Transactions.tsx          Transaction list, import, categorize, rules
│   ├── Subscriptions.tsx         Recurring charges, detection, auto-advance
│   ├── Goals.tsx                 Savings goals, contributions, pace indicator
│   ├── History.tsx               Past 10 cycles, net worth chart, balance deltas
│   ├── Settings.tsx              Profile, budget split, theme, passkeys, exports
│   └── Onboarding.tsx            4-step first-run setup wizard
│
├── components/
│   ├── AppLayout.tsx             Desktop sidebar + mobile bottom nav shell
│   ├── Sheet.tsx                 Responsive bottom sheet / modal primitive
│   ├── ConfirmSheet.tsx          Generic confirm dialog built on Sheet
│   ├── AccountCard.tsx           Gradient wallet card with balance and delta
│   ├── BucketCard.tsx            50/30/20 progress bar card
│   ├── BucketDetailSheet.tsx     Bucket drill-down: transactions + subs this cycle
│   ├── UpdateBalanceSheet.tsx    Manual balance entry + account metadata editing
│   ├── SubscriptionRow.tsx       Subscription list row with actions
│   ├── ContributionSheet.tsx     Log a goal contribution
│   ├── NetWorthChart.tsx         SVG Bezier line chart with hover tooltip
│   ├── BiometricLock.tsx         Full-screen Face ID gate (iOS only)
│   ├── InstallPrompt.tsx         PWA install banner
│   └── Skeleton.tsx              Loading placeholder animations
│
├── data/
│   ├── accounts.ts               useAccounts, useAddAccount, useUpdateAccount, useArchiveAccount
│   ├── snapshots.ts              useLatestBalances, useCycleActivitySnapshots, useUpdateBalance
│   ├── transactions.ts           useTransactions, useCycleTransactionBuckets, useUpdateTransaction
│   ├── subscriptions.ts          useSubscriptions, CRUD, useSuggestedSubscriptions, helpers
│   ├── goals.ts                  useGoals, CRUD
│   ├── contributions.ts          useGoalContributions, useAddContribution, useDeleteContribution
│   ├── profile.ts                useProfile, useUpsertProfile, useUpdateDashboardWidget
│   ├── plaid.ts                  Plaid hooks: link token, exchange, sync, import, manage items
│   ├── passkeys.ts               usePasskeyCredentials, useDeletePasskey
│   ├── transactionRules.ts       useTransactionRules, useAddRule, useDeleteRule, applyRulesToTransactions
│   └── teller.ts                 (Legacy) Teller hooks — not used in UI
│
├── hooks/
│   ├── useAutoLogout.ts          30-minute idle timer → signOut
│   ├── useBiometricLock.ts       Face ID gate on appStateChange (iOS)
│   ├── useInstallPrompt.ts       beforeinstallprompt capture + iOS UA detection
│   ├── useMediaQuery.ts          Generic CSS media query hook
│   ├── usePasskey.ts             register() + authenticate() for WebAuthn
│   └── usePushRegistration.ts    APNs token registration on app launch (iOS)
│
└── lib/
    ├── supabase.ts               Supabase client + ALL TypeScript interfaces
    ├── cycle.ts                  14-day cycle math: start, end, key, label, dateInCycle
    ├── money.ts                  formatMoney, parseCents, formatDollars
    ├── buckets.ts                BUCKETS array, BUCKET_META (label, color per bucket)
    ├── accountTypes.ts           ACCOUNT_TYPES, ACCOUNT_TYPE_META (label, color per type)
    ├── tokens.ts                 CARD_GRADIENTS (CSS gradients for AccountCard)
    ├── detectSubscriptions.ts    detectSubscriptions + detectByCategory heuristics
    ├── export.ts                 CSV export for accounts/snapshots/subscriptions/goals/contributions
    ├── native.ts                 isNative, platform (Capacitor detection)
    ├── theme.ts                  getTheme, setTheme, applyTheme (localStorage + data-theme)
    ├── queryClient.ts            React Query QueryClient (staleTime=30s, retry=2)
    ├── plaid.d.ts                TypeScript declarations for window.Plaid
    └── teller.d.ts               (Legacy) TypeScript declarations for window.TellerConnect

supabase/
├── schema.sql                    Full baseline schema (v2.1, used to initialize)
├── config.toml                   Supabase CLI project config
│
├── migrations/
│   ├── 002_plaid_transactions_widget.sql   Teller tables, transactions, dashboard_widget
│   ├── 003_plaid.sql                       plaid_items, Plaid account columns, plaid_transaction_id
│   ├── 004_subscription_signals.sql        PFC columns (merchant_name, pfc_primary, pfc_detailed)
│   ├── 005_passkeys.sql                    passkey_credentials, passkey_challenges
│   ├── 006_transaction_rules.sql           transaction_rules table
│   └── 007_transaction_is_income.sql       transactions.is_income boolean
│
└── functions/
    ├── plaid-link-token/         Creates Plaid Link token (no DB write)
    ├── plaid-exchange/           Exchanges public_token → stores access_token in plaid_items
    ├── plaid-sync/               Pulls balances from Plaid → inserts snapshots
    ├── plaid-transactions/       Pulls 730 days of transactions → upserts transactions
    ├── plaid-list-accounts/      Lists Plaid accounts for an item (for linking UI)
    ├── plaid-remove-item/        Removes Plaid item and degrades accounts to manual
    ├── passkey-register-options/ Generates WebAuthn registration challenge
    ├── passkey-register-verify/  Verifies registration, stores credential
    ├── passkey-auth-options/     Generates WebAuthn auth challenge (no auth required)
    ├── passkey-auth-verify/      Verifies auth, returns hashed_token for session
    ├── notify-cron/              Daily APNs push notifications (subscriptions + due dates)
    │   └── apns.ts               Hand-rolled ES256 APNs JWT client (Deno WebCrypto)
    ├── teller-enroll/            (Legacy) Teller enrollment
    ├── teller-sync/              (Legacy) Teller balance sync
    └── teller-transactions/      (Legacy) Teller transaction import
```

---

## Further Reading

**Plaid**
- [Plaid Link documentation](https://plaid.com/docs/link/) — the overlay flow, `onSuccess`, `onExit`
- [Plaid /item/public_token/exchange](https://plaid.com/docs/api/items/#itempublic_tokenexchange) — the token exchange endpoint
- [Plaid Personal Finance Categories](https://plaid.com/docs/transactions/categories/) — the PFC taxonomy used for bucket classification

**Supabase**
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security) — how `auth.uid() = user_id` policies work
- [Edge Functions](https://supabase.com/docs/guides/functions) — Deno runtime, secrets, CORS
- [Auth Admin API](https://supabase.com/docs/reference/javascript/auth-admin-generatelink) — `generateLink` used in the passkey bridge

**WebAuthn / SimpleWebAuthn**
- [WebAuthn guide (web.dev)](https://web.dev/articles/passkey-registration) — the standard, registrations, assertions
- [SimpleWebAuthn documentation](https://simplewebauthn.dev/) — the library used here (browser v9, server v13)

**APNs**
- [APNs auth key JWT](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns) — the ES256 token format used in `apns.ts`
- [APNs request format](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns) — POST `/3/device/{token}`

**React Query**
- [React Query fundamentals](https://tanstack.com/query/latest/docs/framework/react/overview) — the mental model behind cache keys and invalidation
- [Optimistic updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates) — used for profile `setQueryData`

**Capacitor**
- [Capacitor iOS guide](https://capacitorjs.com/docs/ios) — how `cap sync` works, Xcode setup
- [Biometric auth plugin](https://github.com/aparajita/capacitor-biometric-auth) — the Face ID library used here
