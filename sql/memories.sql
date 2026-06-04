create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  category text default 'general',
  domain text not null default 'general',
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint memories_domain_check check (domain in ('persona', 'work', 'writing', 'life', 'relation', 'general'))
);

alter table public.memories
  add column if not exists domain text not null default 'general';

alter table public.memories
  alter column domain set default 'general';

update public.memories
set domain = 'general'
where domain is null
   or domain not in ('persona', 'work', 'writing', 'life', 'relation', 'general');

alter table public.memories
  alter column domain set not null;

alter table public.memories
  drop constraint if exists memories_domain_check;

alter table public.memories
  add constraint memories_domain_check
  check (domain in ('persona', 'work', 'writing', 'life', 'relation', 'general'));

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
