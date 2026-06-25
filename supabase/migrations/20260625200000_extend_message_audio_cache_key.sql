-- Extend message_audio with provider/voice/model/text_hash for cache key validation.
-- Without these fields, switching voice_id or provider would still serve the old cached audio.

ALTER TABLE public.message_audio
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS voice_id text,
  ADD COLUMN IF NOT EXISTS model_id text,
  ADD COLUMN IF NOT EXISTS text_hash text;
