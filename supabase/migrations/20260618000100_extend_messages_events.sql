-- CH1: Extend messages table into events single table (D-1).
-- Adds 5 new columns. Existing rows get sensible defaults.
-- Existing write paths are unaffected (new columns all nullable or have defaults).

alter table public.messages
  add column if not exists type          text not null default 'message'
                                         check (type in ('message', 'image', 'system')),
  add column if not exists is_favorite   boolean not null default false,
  add column if not exists ai_tags       jsonb not null default '[]'::jsonb,
  add column if not exists system_action text
                                         check (system_action in (
                                           'favorite', 'edit', 'delete', 'tag',
                                           'game_played', null
                                         )),
  add column if not exists ref_event_id  bigint references public.messages(id) on delete set null;

-- Also widen the role check: existing constraint only allows 'user'|'assistant',
-- but system events need role='system'. Add the new value.
-- Postgres doesn't support ALTER CONSTRAINT directly; drop and recreate.
alter table public.messages drop constraint if exists messages_role_check;
alter table public.messages
  add constraint messages_role_check
  check (role in ('user', 'assistant', 'system'));

-- Index for fast timeline queries (filter by type/system_action)
create index if not exists messages_type_idx
  on public.messages (conversation_id, type, created_at desc);
