-- Per-user CedarToy machine identity. Human CedarToy credentials never enter this table.
create table if not exists public.cedartoy_machine_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  machine_username text not null unique,
  machine_id text,
  binding_code text,
  status text not null default 'unregistered'
    check (status in ('unregistered', 'pending_binding', 'bound', 'error')),
  registration_tool text,
  account_metadata jsonb not null default '{}'::jsonb,
  last_error text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cedartoy_machine_accounts enable row level security;

-- Credentials and binding state are server-managed. The frontend reads them
-- only through the authenticated game-proxy Edge Function.
revoke all on table public.cedartoy_machine_accounts from anon, authenticated;

create index if not exists cedartoy_machine_accounts_status_idx
  on public.cedartoy_machine_accounts(status);

create or replace function public.touch_cedartoy_machine_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_cedartoy_machine_account
  on public.cedartoy_machine_accounts;

create trigger trg_touch_cedartoy_machine_account
before update on public.cedartoy_machine_accounts
for each row execute function public.touch_cedartoy_machine_account();
