ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_income boolean NOT NULL DEFAULT false;
