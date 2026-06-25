-- message_audio: caches ElevenLabs-generated audio URLs per message
CREATE TABLE IF NOT EXISTS public.message_audio (
  id bigserial PRIMARY KEY,
  message_id bigint NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  audio_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.message_audio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access" ON public.message_audio USING (true) WITH CHECK (true);

-- Storage bucket for generated mp3s (public read, service role write)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('message-audio', 'message-audio', true, 5242880, ARRAY['audio/mpeg'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public read message-audio" ON storage.objects
  FOR SELECT USING (bucket_id = 'message-audio');

CREATE POLICY "service write message-audio" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'message-audio');
