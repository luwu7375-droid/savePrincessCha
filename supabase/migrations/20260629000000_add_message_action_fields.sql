-- Migration: Add message action fields (delete, recall, favorite)
-- Adds columns needed for message delete, recall, and favorite operations

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_recalled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recalled_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_content text,
  ADD COLUMN IF NOT EXISTS is_favorited boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS favorited_at timestamptz;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_is_deleted ON public.messages(is_deleted) WHERE is_deleted = true;
CREATE INDEX IF NOT EXISTS idx_messages_is_recalled ON public.messages(is_recalled) WHERE is_recalled = true;
CREATE INDEX IF NOT EXISTS idx_messages_is_favorited ON public.messages(is_favorited) WHERE is_favorited = true;

-- Update existing is_favorite column to sync with is_favorited if needed
UPDATE public.messages SET is_favorited = is_favorite WHERE is_favorite = true AND is_favorited IS NULL;
