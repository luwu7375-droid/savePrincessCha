create table if not exists public.scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null,
  reason text default null,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz default null,
  constraint scheduler_runs_job_name_check
    check (job_name in ('web_explore', 'dream_nightly', 'proactive_chat', 'daily_diary')),
  constraint scheduler_runs_status_check
    check (status in ('skipped', 'succeeded', 'failed')),
  constraint scheduler_runs_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_scheduler_runs_job_started_at
  on public.scheduler_runs(job_name, started_at desc);

create index if not exists idx_scheduler_runs_status_started_at
  on public.scheduler_runs(status, started_at desc);

alter table public.scheduler_runs enable row level security;

drop policy if exists "service_role full access to scheduler runs" on public.scheduler_runs;

create policy "service_role full access to scheduler runs"
  on public.scheduler_runs
  for all
  to service_role
  using (true)
  with check (true);
