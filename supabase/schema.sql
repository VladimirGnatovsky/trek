-- Run this once in Supabase Dashboard -> SQL Editor -> New query.
-- It stores every record per authenticated user and enables Row Level Security.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists avatar_path text;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'EUR' check (currency in ('UAH', 'PLN', 'EUR', 'USD')),
  monthly_budget numeric not null default 3000 check (monthly_budget >= 0),
  goal_saved numeric not null default 0 check (goal_saved >= 0),
  updated_at timestamptz not null default now()
);
alter table public.user_settings add column if not exists privacy_mode boolean not null default false;
alter table public.user_settings add column if not exists dashboard_widgets text[] not null default array['pace','signal','transactions','goals'];
-- Existing accounts skip first-run setup. Accounts created after this migration
-- receive the guided setup because the final column default is false.
alter table public.user_settings add column if not exists onboarding_completed boolean not null default true;
alter table public.user_settings alter column onboarding_completed set default false;
alter table public.user_settings add column if not exists notifications_enabled boolean not null default true;

-- Existing accounts keep their chosen currency; EUR applies only to new settings rows.
alter table public.user_settings alter column currency set default 'EUR';
-- Existing accounts keep their saved budget; 3,000 applies only to new settings rows.
alter table public.user_settings alter column monthly_budget set default 3000;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  merchant text not null check (char_length(merchant) between 1 and 120),
  category text not null,
  entry_type text not null check (entry_type in ('expense', 'income')),
  amount numeric not null check (amount > 0),
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
alter table public.transactions add column if not exists note text not null default '';
alter table public.transactions add column if not exists tags text[] not null default '{}';
alter table public.transactions add column if not exists needs_review boolean not null default false;
-- Bank statement provenance keeps conversions auditable and prevents importing the
-- same row twice. Null import hashes remain valid for manually entered records.
alter table public.transactions add column if not exists original_amount numeric;
alter table public.transactions add column if not exists original_currency text;
alter table public.transactions add column if not exists exchange_rate numeric;
alter table public.transactions add column if not exists exchange_rate_date date;
alter table public.transactions add column if not exists import_hash text;
alter table public.transactions add column if not exists import_source text;
create unique index if not exists transactions_user_import_hash_idx
  on public.transactions (user_id, import_hash);

-- Month-specific plans replace the old single demo budget while keeping the old
-- settings column as a fallback for accounts created before this migration.
create table if not exists public.monthly_budgets (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  month_start date not null,
  total numeric not null default 0 check (total >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month_start),
  check (month_start = date_trunc('month', month_start)::date)
);

create table if not exists public.category_budgets (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  month_start date not null,
  category text not null,
  amount numeric not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month_start, category),
  check (month_start = date_trunc('month', month_start)::date)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 100),
  target_amount numeric not null check (target_amount > 0),
  saved_amount numeric not null default 0 check (saved_amount >= 0),
  deadline date,
  icon text not null default 'Target',
  color text not null default '#00e5a0',
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goals_user_status_idx on public.goals (user_id, status, created_at);

create table if not exists public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  merchant text not null check (char_length(merchant) between 1 and 120),
  category text not null,
  entry_type text not null default 'expense' check (entry_type in ('expense', 'income')),
  amount numeric not null check (amount > 0),
  day_of_month integer not null check (day_of_month between 1 and 31),
  active boolean not null default true,
  last_posted_month date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recurring_user_day_idx on public.recurring_items (user_id, active, day_of_month);

-- Watch-only crypto positions. These are portfolio records, not wallet
-- credentials; Trek never stores seed phrases or private keys.
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
create index if not exists crypto_holdings_user_idx on public.crypto_holdings (user_id, updated_at desc);

-- Personal categorization memory. The client normalizes the merchant name and
-- reuses the latest category selected by the account owner.
create table if not exists public.merchant_category_rules (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  merchant_key text not null check (char_length(merchant_key) between 1 and 120),
  display_name text not null default '',
  category text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, merchant_key)
);

-- Financial accounts keep cash, cards and savings separate. Crypto is a
-- read-only portfolio account whose live balance comes from crypto holdings.
create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('cash', 'bank', 'savings', 'crypto')),
  currency text not null default 'EUR' check (currency in ('UAH', 'PLN', 'EUR', 'USD')),
  opening_balance numeric not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists financial_accounts_user_idx on public.financial_accounts (user_id, archived, created_at);

alter table public.transactions add column if not exists account_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_account_id_fkey') then
    alter table public.transactions add constraint transactions_account_id_fkey foreign key (account_id) references public.financial_accounts(id) on delete set null;
  end if;
end $$;

create table if not exists public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  from_account_id uuid not null references public.financial_accounts(id) on delete cascade,
  to_account_id uuid not null references public.financial_accounts(id) on delete cascade,
  amount numeric not null check (amount > 0),
  fee numeric not null default 0 check (fee >= 0),
  occurred_on date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);
create index if not exists account_transfers_user_date_idx on public.account_transfers (user_id, occurred_on desc);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 100),
  merchant_contains text,
  amount_above numeric check (amount_above is null or amount_above >= 0),
  entry_type text not null default 'any' check (entry_type in ('any', 'expense', 'income')),
  action_category text,
  action_entry_type text not null default 'keep' check (action_entry_type in ('keep', 'expense', 'income')),
  action_needs_review boolean not null default false,
  active boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.automation_rules add column if not exists action_entry_type text not null default 'keep';
create index if not exists automation_rules_user_idx on public.automation_rules (user_id, active, priority desc);

-- Membership is deliberately separate from the editable profile. The browser can read
-- it, but only a payment webhook using a server-side key may change it.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'Start' check (plan in ('Start', 'Plus', 'Lifetime')),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  provider_customer_id text,
  provider_subscription_id text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.transactions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.monthly_budgets enable row level security;
alter table public.category_budgets enable row level security;
alter table public.goals enable row level security;
alter table public.recurring_items enable row level security;
alter table public.crypto_holdings enable row level security;
alter table public.merchant_category_rules enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.account_transfers enable row level security;
alter table public.automation_rules enable row level security;

drop policy if exists "Users manage own profile" on public.profiles;
create policy "Users manage own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "Users manage own settings" on public.user_settings;
create policy "Users manage own settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own transactions" on public.transactions;
create policy "Users manage own transactions" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users read own subscription" on public.subscriptions;
create policy "Users read own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);
drop policy if exists "Users manage own monthly budgets" on public.monthly_budgets;
create policy "Users manage own monthly budgets" on public.monthly_budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own category budgets" on public.category_budgets;
create policy "Users manage own category budgets" on public.category_budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own goals" on public.goals;
create policy "Users manage own goals" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own recurring items" on public.recurring_items;
create policy "Users manage own recurring items" on public.recurring_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own crypto holdings" on public.crypto_holdings;
create policy "Users manage own crypto holdings" on public.crypto_holdings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own merchant rules" on public.merchant_category_rules;
create policy "Users manage own merchant rules" on public.merchant_category_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own financial accounts" on public.financial_accounts;
create policy "Users manage own financial accounts" on public.financial_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own transfers" on public.account_transfers;
create policy "Users manage own transfers" on public.account_transfers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own automation rules" on public.automation_rules;
create policy "Users manage own automation rules" on public.automation_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- New accounts receive their own rows automatically. The SECURITY DEFINER function is
-- safe here because it receives data only from auth.users and has no user parameters.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.email, ''))
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.subscriptions (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.financial_accounts (user_id, name, kind, opening_balance)
  values (new.id, 'Cash', 'cash', 0), (new.id, 'Bank card', 'bank', 0), (new.id, 'Savings', 'savings', 0), (new.id, 'Crypto', 'crypto', 0)
  on conflict (user_id, name) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Creates default rows for accounts registered before this script was run.
insert into public.profiles (id, full_name, email)
select id, coalesce(raw_user_meta_data ->> 'full_name', ''), coalesce(email, '') from auth.users
on conflict (id) do nothing;
insert into public.user_settings (user_id) select id from auth.users on conflict (user_id) do nothing;
insert into public.subscriptions (user_id) select id from auth.users on conflict (user_id) do nothing;
insert into public.financial_accounts (user_id, name, kind, currency, opening_balance)
select users.id, seed.name, seed.kind, coalesce(settings.currency, 'EUR'), 0 from auth.users users left join public.user_settings settings on settings.user_id = users.id cross join (values ('Cash','cash'),('Bank card','bank'),('Savings','savings'),('Crypto','crypto')) seed(name,kind)
on conflict (user_id, name) do nothing;

-- Put historical entries on the default bank card so account balances are useful
-- immediately after enabling the feature.
update public.transactions transaction
set account_id = account.id
from public.financial_accounts account
where transaction.user_id = account.user_id and account.name = 'Bank card' and transaction.account_id is null;

insert into public.monthly_budgets (user_id, month_start, total)
select user_id, date_trunc('month', current_date)::date, monthly_budget from public.user_settings
on conflict (user_id, month_start) do nothing;

-- Trek owner accounts: requested Lifetime access. Change/remove these emails if ownership changes.
update public.subscriptions set plan = 'Lifetime', status = 'active', updated_at = now()
where user_id in (
  select id from auth.users
  where lower(email) in ('straiker1990@gmail.com', 'vgtsky@gmail.com')
);

-- Private avatar storage. Files are readable/writable only by their owner.
insert into storage.buckets (id, name, public) values ('trek-avatars', 'trek-avatars', false)
on conflict (id) do nothing;
drop policy if exists "Users manage own Trek avatar" on storage.objects;
create policy "Users manage own Trek avatar" on storage.objects
  for all using (
    bucket_id = 'trek-avatars' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'trek-avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
