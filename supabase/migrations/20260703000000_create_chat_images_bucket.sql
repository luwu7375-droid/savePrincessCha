-- Create chat-images bucket for user-uploaded images.
-- Private bucket (signed URLs for access), 20 MB per file limit. Generated
-- images can exceed the old 1 MB upload limit.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-images',
  'chat-images',
  false,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Authenticated users may upload under their own uid prefix
CREATE POLICY "users upload own chat images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users may read their own images (signed-URL path)
CREATE POLICY "users read own chat images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users may delete their own images
CREATE POLICY "users delete own chat images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chat-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
