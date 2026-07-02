-- Distinguish TTS attachments on text messages from explicit voice messages.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS audio_type_explicit boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_explicit_voice
  ON public.messages(type, audio_type_explicit)
  WHERE type = 'voice' OR audio_type_explicit = true;

COMMENT ON COLUMN public.messages.audio_type_explicit IS
  'True only for explicit voice-message bubbles. False for text messages with TTS read-aloud attachments.';
