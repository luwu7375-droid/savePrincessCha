-- Migration: Add voice message fields
-- Adds columns needed for voice message functionality

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS audio_duration integer,
  ADD COLUMN IF NOT EXISTS audio_type text CHECK (audio_type IN ('real', 'fake')),
  ADD COLUMN IF NOT EXISTS audio_transcribed_text text;

-- Create indexes for better query performance on audio messages
CREATE INDEX IF NOT EXISTS idx_messages_audio_url ON public.messages(audio_url) WHERE audio_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_audio_type ON public.messages(audio_type) WHERE audio_type IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.messages.audio_url IS 'URL to audio file (blob storage or data URL)';
COMMENT ON COLUMN public.messages.audio_duration IS 'Audio duration in seconds';
COMMENT ON COLUMN public.messages.audio_type IS 'Type of audio: "real" (TTS generated) or "fake" (text-to-speech from user transcription)';
COMMENT ON COLUMN public.messages.audio_transcribed_text IS 'Transcribed text content of the audio message';
