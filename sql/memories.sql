create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  category text default 'general',
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.memories enable row level security;

drop policy if exists "Allow anonymous reads from memories" on public.memories;
drop policy if exists "Allow anonymous inserts into memories" on public.memories;
drop policy if exists "Allow anonymous updates to memories" on public.memories;

create policy "Allow anonymous reads from memories"
  on public.memories for select to anon using (true);

create policy "Allow anonymous inserts into memories"
  on public.memories for insert to anon with check (true);

create policy "Allow anonymous updates to memories"
  on public.memories for update to anon using (true);
