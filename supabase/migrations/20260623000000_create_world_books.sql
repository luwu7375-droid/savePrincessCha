-- World Books: user-managed lore/context documents injected into chat prompt.
-- Each book is owned by a user, has a priority order, and can be toggled on/off.
-- priority uses gap-10 spacing (0, 10, 20...) to allow insertions without full renumber.
-- Atomic reordering is handled by the reorder_world_books() RPC below.

create table if not exists public.world_books (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  author      text,
  content     text        not null,
  line_count  int         not null,
  enabled     boolean     not null default false,
  priority    int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint world_books_name_unique unique (user_id, name),
  constraint world_books_content_length_check check (char_length(content) <= 200000),
  constraint world_books_line_count_positive check (line_count >= 0)
);

comment on table public.world_books is
  'User-managed lore/context documents. Enabled books are injected into the chat system prompt in priority order (ascending).';

comment on column public.world_books.priority is
  'Injection order: lower = earlier in prompt. Gap-10 spacing allows insertions. Reordering via reorder_world_books() RPC.';

-- ── updated_at trigger ────────────────────────────────────────────────────────

create or replace function public.set_world_books_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_world_books_updated_at on public.world_books;

create trigger set_world_books_updated_at
  before update on public.world_books
  for each row
  execute function public.set_world_books_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.world_books enable row level security;

drop policy if exists "users can manage own world books" on public.world_books;
drop policy if exists "service_role full access to world books" on public.world_books;

create policy "users can manage own world books"
  on public.world_books
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "service_role full access to world books"
  on public.world_books
  for all
  to service_role
  using (true)
  with check (true);

-- ── Atomic reorder RPC ────────────────────────────────────────────────────────
-- Accepts an ordered array of book IDs and reassigns priority 0, 10, 20...
-- Runs in a single transaction to prevent race conditions from concurrent drags.
--
-- Usage:
--   SELECT reorder_world_books(ARRAY['id1','id2','id3']::uuid[], 'user-uuid'::uuid)

create or replace function public.reorder_world_books(
  ordered_ids uuid[],
  calling_user_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  i int;
begin
  -- Verify all IDs belong to the calling user before touching anything.
  if exists (
    select 1 from public.world_books
    where id = any(ordered_ids)
      and user_id <> calling_user_id
  ) then
    raise exception 'unauthorized: one or more book IDs do not belong to calling user';
  end if;

  -- Assign new priorities atomically.
  for i in 1..array_length(ordered_ids, 1) loop
    update public.world_books
    set priority = (i - 1) * 10
    where id = ordered_ids[i]
      and user_id = calling_user_id;
  end loop;
end;
$$;

comment on function public.reorder_world_books(uuid[], uuid) is
  'Atomically reassigns priority (gap-10) to world books given an ordered array of IDs. Validates ownership before any writes.';
