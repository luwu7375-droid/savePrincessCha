create table if not exists public.cha_activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null default 'web_browse',
  url text default null,
  duration_sec integer not null default 0,
  token_cost integer not null default 0,
  created_at timestamptz not null default now(),
  constraint cha_activity_log_action_type_check
    check (action_type in ('web_browse', 'other')),
  constraint cha_activity_log_duration_sec_check
    check (duration_sec >= 0),
  constraint cha_activity_log_token_cost_check
    check (token_cost >= 0)
);

create index if not exists idx_cha_activity_log_user_created_at
  on public.cha_activity_log(user_id, created_at desc);

create index if not exists idx_cha_activity_log_action_type
  on public.cha_activity_log(action_type);

alter table public.cha_activity_log enable row level security;

drop policy if exists "users own cha activity log" on public.cha_activity_log;
drop policy if exists "service_role full access to cha activity log" on public.cha_activity_log;

create policy "users own cha activity log"
  on public.cha_activity_log
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "service_role full access to cha activity log"
  on public.cha_activity_log
  for all
  to service_role
  using (true)
  with check (true);
