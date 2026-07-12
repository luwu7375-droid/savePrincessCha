-- Migration: Companion State and Source-Backed Memory
-- Created: 2026-07-12
-- Phase 1: Database schema for companion state engine and source tracking

-- ═══════════════════════════════════════════════════════════════════════════════
-- Part 1: companion_state table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.companion_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core state values (0-100 for most, -100 to 100 for valence)
  connection INTEGER NOT NULL DEFAULT 0 CHECK (connection >= 0 AND connection <= 100),
  valence INTEGER NOT NULL DEFAULT 50 CHECK (valence >= -100 AND valence <= 100),
  arousal INTEGER NOT NULL DEFAULT 30 CHECK (arousal >= 0 AND arousal <= 100),
  immersion INTEGER NOT NULL DEFAULT 0 CHECK (immersion >= 0 AND immersion <= 100),

  -- Time anchors
  last_user_message_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Activity and user status
  activity_type TEXT CHECK (activity_type IN ('reading', 'browsing', 'gaming', 'diary', 'idle')),
  activity_label TEXT,
  activity_started_at TIMESTAMPTZ,
  user_status TEXT CHECK (user_status IN ('active', 'busy', 'away', 'sleeping')),
  user_status_until TIMESTAMPTZ,

  -- Do Not Disturb time (daily recurring)
  dnd_start_hour INTEGER CHECK (dnd_start_hour >= 0 AND dnd_start_hour < 24),
  dnd_start_minute INTEGER CHECK (dnd_start_minute >= 0 AND dnd_start_minute < 60),
  dnd_end_hour INTEGER CHECK (dnd_end_hour >= 0 AND dnd_end_hour < 24),
  dnd_end_minute INTEGER CHECK (dnd_end_minute >= 0 AND dnd_end_minute < 60),

  -- Metadata
  state_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for companion_state
CREATE INDEX IF NOT EXISTS idx_companion_state_user_id ON public.companion_state (user_id);
CREATE INDEX IF NOT EXISTS idx_companion_state_last_tick_at ON public.companion_state (last_tick_at);

-- RLS for companion_state
ALTER TABLE public.companion_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own companion state"
  ON public.companion_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own companion state"
  ON public.companion_state FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own companion state"
  ON public.companion_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Part 2: Source tracking fields for memories table
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS source_msg_ids INTEGER[] DEFAULT NULL;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS source_start_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS source_end_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS extraction_model TEXT DEFAULT NULL;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS extraction_version TEXT DEFAULT NULL;

-- Indexes for source tracking
CREATE INDEX IF NOT EXISTS idx_memories_source_msg_ids ON public.memories USING GIN (source_msg_ids);
CREATE INDEX IF NOT EXISTS idx_memories_source_conversation_id ON public.memories (source_conversation_id);

-- Comment for documentation
COMMENT ON COLUMN public.memories.source_msg_ids IS 'Array of messages.id that this memory was extracted from';
COMMENT ON COLUMN public.memories.source_conversation_id IS 'Original conversation this memory came from';
COMMENT ON COLUMN public.memories.source_start_at IS 'Timestamp of first source message';
COMMENT ON COLUMN public.memories.source_end_at IS 'Timestamp of last source message';
COMMENT ON COLUMN public.memories.extraction_model IS 'Model used for extraction (e.g., gpt-4o-mini)';
COMMENT ON COLUMN public.memories.extraction_version IS 'Extraction logic version (e.g., vault-v2)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- Part 3: Source tracking fields for auto_memory_candidates table
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.auto_memory_candidates ADD COLUMN IF NOT EXISTS source_msg_ids INTEGER[] DEFAULT NULL;
ALTER TABLE public.auto_memory_candidates ADD COLUMN IF NOT EXISTS source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;
ALTER TABLE public.auto_memory_candidates ADD COLUMN IF NOT EXISTS source_start_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.auto_memory_candidates ADD COLUMN IF NOT EXISTS source_end_at TIMESTAMPTZ DEFAULT NULL;

-- Indexes for source tracking
CREATE INDEX IF NOT EXISTS idx_auto_memory_candidates_source_msg_ids ON public.auto_memory_candidates USING GIN (source_msg_ids);
CREATE INDEX IF NOT EXISTS idx_auto_memory_candidates_source_conversation_id ON public.auto_memory_candidates (source_conversation_id);

-- Comment for documentation
COMMENT ON COLUMN public.auto_memory_candidates.source_msg_ids IS 'Array of messages.id that this candidate was extracted from';
COMMENT ON COLUMN public.auto_memory_candidates.source_conversation_id IS 'Original conversation this candidate came from';

-- ═══════════════════════════════════════════════════════════════════════════════
-- Part 4: narrative_episodes table (城南旧事)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.narrative_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Narrative content
  episode_type TEXT NOT NULL CHECK (episode_type IN (
    'fact',
    'preference',
    'relationship_event',
    'unfinished_thread',
    'shared_experience',
    'cha_reflection'
  )),
  title TEXT NOT NULL,
  narrative_content TEXT NOT NULL,
  facts_extracted JSONB,
  cha_feeling TEXT,

  -- Source tracing
  source_memory_ids UUID[] NOT NULL DEFAULT '{}',
  source_msg_ids INTEGER[] NOT NULL DEFAULT '{}',
  source_conversations UUID[],
  source_time_range TSTZRANGE,

  -- Theme clustering
  themes TEXT[] DEFAULT '{}',
  related_episodes UUID[] DEFAULT '{}',

  -- Significance and confirmation
  significance INTEGER CHECK (significance >= 0 AND significance <= 100),
  user_confirmed BOOLEAN DEFAULT FALSE,
  user_favorited BOOLEAN DEFAULT FALSE,

  -- Consolidation metadata
  consolidation_run_id UUID,
  consolidation_batch TEXT,
  consolidation_model TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for narrative_episodes
CREATE INDEX IF NOT EXISTS idx_narrative_episodes_user_id ON public.narrative_episodes (user_id);
CREATE INDEX IF NOT EXISTS idx_narrative_episodes_type ON public.narrative_episodes (episode_type);
CREATE INDEX IF NOT EXISTS idx_narrative_episodes_created_at ON public.narrative_episodes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_episodes_source_msg_ids ON public.narrative_episodes USING GIN (source_msg_ids);
CREATE INDEX IF NOT EXISTS idx_narrative_episodes_themes ON public.narrative_episodes USING GIN (themes);
CREATE INDEX IF NOT EXISTS idx_narrative_episodes_consolidation_run ON public.narrative_episodes (consolidation_run_id);

-- RLS for narrative_episodes
ALTER TABLE public.narrative_episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own episodes"
  ON public.narrative_episodes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own episodes"
  ON public.narrative_episodes FOR UPDATE
  USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE public.narrative_episodes IS '城南旧事: Consolidated narrative episodes from memory candidates';
COMMENT ON COLUMN public.narrative_episodes.narrative_content IS 'Cha''s narrative organization of the memory';
COMMENT ON COLUMN public.narrative_episodes.facts_extracted IS 'Pure facts in structured JSON format';
COMMENT ON COLUMN public.narrative_episodes.cha_feeling IS 'Cha''s feelings, separated from facts';

-- ═══════════════════════════════════════════════════════════════════════════════
-- Part 5: Feature flags in app_settings
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS companion_state_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS source_backed_memory_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS nightly_consolidation_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS memory_constellations_ui_enabled BOOLEAN DEFAULT FALSE;

-- Proactive contact configuration
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS proactive_contact_min_interval_minutes INTEGER DEFAULT 120;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS proactive_contact_connection_threshold INTEGER DEFAULT 70;

-- Comments
COMMENT ON COLUMN public.app_settings.companion_state_enabled IS 'Enable companion state engine for proactive contact';
COMMENT ON COLUMN public.app_settings.source_backed_memory_enabled IS 'Enable source message tracking in memories';
COMMENT ON COLUMN public.app_settings.nightly_consolidation_enabled IS 'Enable nightly memory consolidation job';
COMMENT ON COLUMN public.app_settings.memory_constellations_ui_enabled IS 'Show Memory Constellations UI (城南旧事)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- Part 6: Helper functions (RPC)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Get or initialize companion state for a user
CREATE OR REPLACE FUNCTION public.get_or_init_companion_state(p_user_id UUID)
RETURNS public.companion_state AS $$
DECLARE
  v_state public.companion_state;
BEGIN
  SELECT * INTO v_state FROM public.companion_state WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.companion_state (user_id)
    VALUES (p_user_id)
    RETURNING * INTO v_state;
  END IF;

  RETURN v_state;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic state update
CREATE OR REPLACE FUNCTION public.update_companion_state(
  p_user_id UUID,
  p_updates JSONB
)
RETURNS public.companion_state AS $$
DECLARE
  v_state public.companion_state;
BEGIN
  UPDATE public.companion_state
  SET
    connection = COALESCE((p_updates->>'connection')::INTEGER, connection),
    valence = COALESCE((p_updates->>'valence')::INTEGER, valence),
    arousal = COALESCE((p_updates->>'arousal')::INTEGER, arousal),
    immersion = COALESCE((p_updates->>'immersion')::INTEGER, immersion),
    last_user_message_at = COALESCE((p_updates->>'last_user_message_at')::TIMESTAMPTZ, last_user_message_at),
    last_contact_at = COALESCE((p_updates->>'last_contact_at')::TIMESTAMPTZ, last_contact_at),
    last_tick_at = COALESCE((p_updates->>'last_tick_at')::TIMESTAMPTZ, last_tick_at),
    activity_type = COALESCE(p_updates->>'activity_type', activity_type),
    activity_label = COALESCE(p_updates->>'activity_label', activity_label),
    activity_started_at = COALESCE((p_updates->>'activity_started_at')::TIMESTAMPTZ, activity_started_at),
    user_status = COALESCE(p_updates->>'user_status', user_status),
    user_status_until = COALESCE((p_updates->>'user_status_until')::TIMESTAMPTZ, user_status_until),
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_state;

  RETURN v_state;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Retrieve source messages for a memory
CREATE OR REPLACE FUNCTION public.retrieve_memory_sources(
  p_memory_id UUID,
  p_max_excerpts INTEGER DEFAULT 5
)
RETURNS TABLE (
  message_id INTEGER,
  role TEXT,
  content TEXT,
  created_at TIMESTAMPTZ,
  conversation_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.role,
    m.content,
    m.created_at,
    m.conversation_id
  FROM public.messages m
  WHERE m.id = ANY(
    SELECT unnest(mem.source_msg_ids)
    FROM public.memories mem
    WHERE mem.id = p_memory_id
  )
  ORDER BY m.created_at ASC
  LIMIT p_max_excerpts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_or_init_companion_state(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_companion_state(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retrieve_memory_sources(UUID, INTEGER) TO authenticated;
