CREATE TABLE email_digest_settings (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled       boolean NOT NULL DEFAULT false,
  frequency     text NOT NULL DEFAULT 'weekly'
                CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  send_day      smallint,
  send_hour     smallint NOT NULL DEFAULT 8
                CHECK (send_hour BETWEEN 0 AND 23),
  recipients    text[] NOT NULL DEFAULT '{}',
  detail_level  text NOT NULL DEFAULT 'summary'
                CHECK (detail_level IN ('summary', 'detailed')),
  sections      jsonb NOT NULL DEFAULT
                '{"balances":true,"subscriptions":true,"budget":true,"goals":true,"credit_cards":true}',
  last_sent_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_digest_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner" ON email_digest_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
