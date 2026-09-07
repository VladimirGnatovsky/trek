-- Product iteration: accounts, transfers and automation rules.
-- Safe to run more than once. The complete schema.sql includes the same changes.
create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 80), kind text not null check (kind in ('cash','bank','savings','crypto')),
  currency text not null default 'EUR' check (currency in ('UAH','PLN','EUR','USD')), opening_balance numeric not null default 0,
  archived boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,name)
);
alter table public.transactions add column if not exists account_id uuid;
do $$ begin if not exists (select 1 from pg_constraint where conname='transactions_account_id_fkey') then alter table public.transactions add constraint transactions_account_id_fkey foreign key(account_id) references public.financial_accounts(id) on delete set null; end if; end $$;
create table if not exists public.account_transfers (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  from_account_id uuid not null references public.financial_accounts(id) on delete cascade, to_account_id uuid not null references public.financial_accounts(id) on delete cascade,
  amount numeric not null check(amount>0), fee numeric not null default 0 check(fee>=0), occurred_on date not null default current_date,
  note text not null default '', created_at timestamptz not null default now(), check(from_account_id<>to_account_id)
);
create index if not exists financial_accounts_user_idx on public.financial_accounts(user_id,archived,created_at);
create index if not exists account_transfers_user_date_idx on public.account_transfers(user_id,occurred_on desc);
create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade default auth.uid(), name text not null,
  merchant_contains text, amount_above numeric check(amount_above is null or amount_above>=0), entry_type text not null default 'any' check(entry_type in ('any','expense','income')),
  action_category text, action_entry_type text not null default 'keep', action_needs_review boolean not null default false, active boolean not null default true, priority integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.automation_rules add column if not exists action_entry_type text not null default 'keep';
create index if not exists automation_rules_user_idx on public.automation_rules(user_id,active,priority desc);
alter table public.financial_accounts enable row level security; alter table public.account_transfers enable row level security; alter table public.automation_rules enable row level security;
drop policy if exists "Users manage own financial accounts" on public.financial_accounts; create policy "Users manage own financial accounts" on public.financial_accounts for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users manage own transfers" on public.account_transfers; create policy "Users manage own transfers" on public.account_transfers for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users manage own automation rules" on public.automation_rules; create policy "Users manage own automation rules" on public.automation_rules for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
insert into public.financial_accounts(user_id,name,kind,currency,opening_balance) select users.id,seed.name,seed.kind,coalesce(settings.currency,'EUR'),0 from auth.users users left join public.user_settings settings on settings.user_id=users.id cross join(values('Cash','cash'),('Bank card','bank'),('Savings','savings'),('Crypto','crypto')) seed(name,kind) on conflict(user_id,name) do nothing;
update public.transactions transaction set account_id=account.id from public.financial_accounts account where transaction.user_id=account.user_id and account.name='Bank card' and transaction.account_id is null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,full_name,email) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),coalesce(new.email,'')) on conflict(id) do nothing;
  insert into public.user_settings(user_id) values(new.id) on conflict(user_id) do nothing;
  insert into public.subscriptions(user_id) values(new.id) on conflict(user_id) do nothing;
  insert into public.financial_accounts(user_id,name,kind,opening_balance) values(new.id,'Cash','cash',0),(new.id,'Bank card','bank',0),(new.id,'Savings','savings',0),(new.id,'Crypto','crypto',0) on conflict(user_id,name) do nothing;
  return new;
end;
$$;
