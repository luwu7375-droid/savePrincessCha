-- Migration: Add image description and prompt fields
-- Adds columns needed for image description editing and viewing

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS image_description text,
  ADD COLUMN IF NOT EXISTS image_prompt text;

-- Create indexes for better query performance on image messages
CREATE INDEX IF NOT EXISTS idx_messages_image_description ON public.messages(image_description) WHERE image_description IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_image_prompt ON public.messages(image_prompt) WHERE image_prompt IS NOT NULL;
