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
  monthly_budget numeric not null default 30000 check (monthly_budget >= 0),
  goal_saved numeric not null default 0 check (goal_saved >= 0),
  updated_at timestamptz not null default now()
);
alter table public.user_settings add column if not exists privacy_mode boolean not null default false;
alter table public.user_settings add column if not exists dashboard_widgets text[] not null default array['pace','signal','transactions','goals'];

-- Existing accounts keep their chosen currency; EUR applies only to new settings rows.
alter table public.user_settings alter column currency set default 'EUR';

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

insert into public.monthly_budgets (user_id, month_start, total)
select user_id, date_trunc('month', current_date)::date, monthly_budget from public.user_settings
on conflict (user_id, month_start) do nothing;

-- Trek owner: requested Lifetime access. Change/remove this line if ownership changes.
update public.subscriptions set plan = 'Lifetime', status = 'active', updated_at = now()
where user_id in (select id from auth.users where lower(email) = 'straiker1990@gmail.com');

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
