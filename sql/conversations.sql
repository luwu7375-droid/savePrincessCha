create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text default '新会话',
  pinned boolean default false,
  archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.conversations enable row level security;

drop policy if exists "user owns conversations" on public.conversations;

create policy "user owns conversations"
  on public.conversations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
