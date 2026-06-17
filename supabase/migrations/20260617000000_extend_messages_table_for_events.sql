-- Extend messages into the shared events table used by chat and couple-space.
-- Existing message writes remain valid because every new field has a default.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'message',
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS system_action text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ref_event_id bigint DEFAULT NULL REFERENCES public.messages(id) ON DELETE SET NULL;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_type_check
  CHECK (type IN ('message', 'image', 'system', 'dream', 'voice'));

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_ai_tags_array_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_ai_tags_array_check
  CHECK (jsonb_typeof(ai_tags) = 'array');

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_system_action_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_system_action_check
  CHECK (
    system_action IS NULL
    OR system_action IN ('favorite', 'edit', 'delete', 'tag', 'game_played')
  );
