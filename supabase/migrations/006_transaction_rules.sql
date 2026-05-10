CREATE TABLE IF NOT EXISTS transaction_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_pattern text NOT NULL,
  bucket text NOT NULL CHECK (bucket IN ('needs', 'wants', 'savings')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transaction_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own rules" ON transaction_rules
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS transaction_rules_user_id_idx ON transaction_rules(user_id);
