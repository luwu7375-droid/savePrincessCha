-- Create xiaocha_diary_entries table for First-person Diary Draft MVP
-- This table stores Cha's private diary entries generated from various sources
-- IMPORTANT: This table is NOT injected into compileMemoryContext
-- Entries are draft/pending by default and do not auto-promote to memories

CREATE TABLE public.xiaocha_diary_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'default',
  conversation_id text,

  -- Source tracking (multi-source support)
  source_event_ids jsonb DEFAULT '[]'::jsonb,
  source_types text[] DEFAULT ARRAY[]::text[],
  source_boundary text,

  -- Diary metadata
  diary_type text CHECK (diary_type IN (
    'daily_fragment',
    'shared_activity',
    'self_observation',
    'relationship_shift',
    'archive_reflection',
    'project_aftertaste',
    'dream_fragment',
    'ordinary_day'
  )),
  diary_length text DEFAULT 'normal' CHECK (diary_length IN ('tiny', 'short', 'normal', 'long')),

  -- Main content
  title text,
  private_body text NOT NULL,
  memory_summary text,

  -- Reflection fields
  felt_sense text,
  stuck_point text,
  insight text,
  changed text,
  want_to_share text,

  -- Checker results
  checker_pass boolean,
  checker_problems jsonb DEFAULT '[]'::jsonb,
  checker_suggested_fix text,
  checker_retry_instruction text,

  -- Promotion control (MVP: no auto-promotion)
  should_promote_to_identity_brain boolean DEFAULT false,
  promotion_reason text,
  safe_to_promote boolean DEFAULT false,

  -- Status workflow
  status text DEFAULT 'draft' CHECK (status IN (
    'draft',
    'checked',
    'hidden',
    'promoted_pending',
    'failed_check'
  )),

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for fetching recent entries
CREATE INDEX idx_xiaocha_diary_entries_created_at ON public.xiaocha_diary_entries(created_at DESC);

-- Index for user-based queries
CREATE INDEX idx_xiaocha_diary_entries_user_id ON public.xiaocha_diary_entries(user_id);

-- Index for conversation-based queries
CREATE INDEX idx_xiaocha_diary_entries_conversation_id ON public.xiaocha_diary_entries(conversation_id) WHERE conversation_id IS NOT NULL;

-- Index for status filtering
CREATE INDEX idx_xiaocha_diary_entries_status ON public.xiaocha_diary_entries(status);

-- Composite index for user + status queries
CREATE INDEX idx_xiaocha_diary_entries_user_status ON public.xiaocha_diary_entries(user_id, status, created_at DESC);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_xiaocha_diary_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_xiaocha_diary_entries_updated_at
  BEFORE UPDATE ON public.xiaocha_diary_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_xiaocha_diary_entries_updated_at();

-- Comment explaining the isolation
COMMENT ON TABLE public.xiaocha_diary_entries IS
  'Stores Cha''s first-person private diary entries.
   NOT injected into compileMemoryContext by default.
   NOT auto-promoted to memories table.
   Entries remain as drafts unless explicitly promoted.';
