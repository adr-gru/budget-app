-- View: latest balance snapshot per account.
-- DISTINCT ON replaces the client-side deduplication loop in useLatestBalances,
-- removing the need to fetch the entire table just to find the latest per account.
-- security_invoker = on means RLS from account_balance_snapshots still applies.
-- Requires PostgreSQL 15+ (Supabase default).
CREATE OR REPLACE VIEW latest_account_balances
  WITH (security_invoker = on)
AS
  SELECT DISTINCT ON (account_id)
    id, account_id, user_id, balance_cents, recorded_at
  FROM account_balance_snapshots
  ORDER BY account_id, recorded_at DESC;
