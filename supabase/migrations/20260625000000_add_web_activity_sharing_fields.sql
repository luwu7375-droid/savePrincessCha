-- Add sharing-related fields to cha_activity_log for web activity tracking
-- Supports user_link/chat_search/background_explore scenarios

alter table public.cha_activity_log
  add column if not exists cha_feeling text,
  add column if not exists want_to_share text check (want_to_share in ('yes', 'no', 'maybe')),
  add column if not exists shared_in_chat boolean not null default false,
  add column if not exists shared_at timestamptz,
  add column if not exists related_message_id bigint,
  add column if not exists related_activity_log_id uuid references public.cha_activity_log(id) on delete set null;

-- Update source_type constraint to include new values
alter table public.cha_activity_log
  drop constraint if exists cha_activity_log_source_type_check;

alter table public.cha_activity_log
  add constraint cha_activity_log_source_type_check
  check (source_type in ('user_link', 'chat_search', 'background_explore'));

-- Add index for querying unshared activities
create index if not exists idx_cha_activity_log_unshared
  on public.cha_activity_log(user_id, created_at desc)
  where shared_in_chat = false and action_type = 'web_browse';

-- Add index for related activities
create index if not exists idx_cha_activity_log_related_message
  on public.cha_activity_log(related_message_id)
  where related_message_id is not null;

comment on column public.cha_activity_log.cha_feeling is
  'Cha''s feeling or reaction after reading web content (Chinese, natural language)';

comment on column public.cha_activity_log.want_to_share is
  'Whether Cha wants to share this with KK: yes/no/maybe';

comment on column public.cha_activity_log.shared_in_chat is
  'Whether this activity has been shared in chat via visible_thought or webContext';

comment on column public.cha_activity_log.shared_at is
  'Timestamp when this activity was shared in chat';

comment on column public.cha_activity_log.related_message_id is
  'The chat message ID where this activity was shared';

comment on column public.cha_activity_log.related_activity_log_id is
  'Link to another activity log entry (for exploration chains)';
