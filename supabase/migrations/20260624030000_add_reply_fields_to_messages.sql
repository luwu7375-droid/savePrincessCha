-- Add reply/quote fields to messages table
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id text,
  ADD COLUMN IF NOT EXISTS reply_to_preview    text,
  ADD COLUMN IF NOT EXISTS reply_to_role       text;
