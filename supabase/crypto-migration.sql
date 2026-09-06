-- Run in Supabase Dashboard -> SQL Editor -> New query.
-- Safe to run more than once.

create table if not exists public.crypto_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  coin_id text not null check (char_length(coin_id) between 1 and 80),
  symbol text not null check (char_length(symbol) between 1 and 12),
  name text not null check (char_length(name) between 1 and 80),
  quantity numeric not null check (quantity > 0),
  average_buy_price_usd numeric not null default 0 check (average_buy_price_usd >= 0),
  source text not null default 'manual' check (source in ('manual', 'binance_csv', 'wallet')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, coin_id)
);

create index if not exists crypto_holdings_user_idx
  on public.crypto_holdings (user_id, updated_at desc);

alter table public.crypto_holdings enable row level security;

drop policy if exists "Users manage own crypto holdings" on public.crypto_holdings;
create policy "Users manage own crypto holdings" on public.crypto_holdings
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
