-- Add read tracking fields to messages table.
-- read_by_cha_at: set when Cha's reply context actually includes this user message.
-- read_by_user_at: set when the user's viewport renders this assistant message.
-- Both are nullable; NULL = unread.

alter table public.messages
  add column if not exists read_by_cha_at  timestamptz default null,
  add column if not exists read_by_user_at timestamptz default null;

comment on column public.messages.read_by_cha_at  is
  'Timestamp when this user message was consumed by Cha (auto-reply, forced reply, or similar trigger). NULL = unread by Cha.';

comment on column public.messages.read_by_user_at is
  'Timestamp when the user actually saw this assistant message in the viewport. NULL = unread by user.';
