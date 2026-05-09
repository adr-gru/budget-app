create table public.passkey_credentials (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,
  public_key    text not null,
  counter       bigint not null default 0,
  transports    text[],
  device_name   text,
  aaguid        text,
  created_at    timestamptz not null default now()
);

alter table public.passkey_credentials enable row level security;

create policy "passkey_credentials_own"
  on public.passkey_credentials
  for all using (auth.uid() = user_id);

create table public.passkey_challenges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  challenge   text not null,
  type        text not null check (type in ('registration', 'authentication')),
  expires_at  timestamptz not null default (now() + interval '5 minutes'),
  created_at  timestamptz not null default now()
);

alter table public.passkey_challenges enable row level security;
-- No client-facing policy; only service-role edge functions access this table

create index on public.passkey_challenges (challenge);
