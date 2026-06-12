-- Add image_storage_path to messages.
-- Stores the Storage object path (e.g. "{user_id}/{msg_id}.jpg") when a message
-- contains an image. NULL for text-only messages.
-- The actual image URL is reconstructed at read time via signed URL.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS image_storage_path text;
