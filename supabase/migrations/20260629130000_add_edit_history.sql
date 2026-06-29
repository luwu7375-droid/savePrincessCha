-- Migration: Add edit history tracking
-- Tracks message edit history with timestamps and content changes

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edit_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS edit_history jsonb DEFAULT '[]'::jsonb;

-- Create index for edited messages
CREATE INDEX IF NOT EXISTS idx_messages_edited_at ON public.messages(edited_at) WHERE edited_at IS NOT NULL;

-- Comment
COMMENT ON COLUMN public.messages.edit_history IS 'Array of edit records: [{edited_at, previous_content, editor_note}]';
