-- Add user_id to messages (nullable to avoid breaking existing rows)
alter table public.messages add column if not exists user_id uuid references auth.users(id);

-- Drop old anon policies
drop policy if exists "Allow anonymous inserts into messages" on public.messages;
drop policy if exists "Allow anonymous reads from messages" on public.messages;
drop policy if exists "Allow anonymous deletes from messages" on public.messages;
drop policy if exists "allow insert" on public.messages;
drop policy if exists "allow select" on public.messages;
drop policy if exists "allow delete" on public.messages;
drop policy if exists "user owns messages" on public.messages;

-- New auth-based policies (only affects rows where user_id matches)
create policy "user owns messages"
  on public.messages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
