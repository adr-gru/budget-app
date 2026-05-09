alter table transactions
  add column if not exists merchant_name text null,
  add column if not exists pfc_primary   text null,
  add column if not exists pfc_detailed  text null;

create index if not exists transactions_pfc_detailed_idx
  on transactions (pfc_detailed)
  where pfc_detailed is not null;
