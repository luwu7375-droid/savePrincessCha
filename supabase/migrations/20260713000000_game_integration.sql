-- Game Integration Schema - Phase 1 MVP
-- Creates game_sessions table, extends cha_activity_log and app_settings for gaming features

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Create or alter game_sessions table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns if they don't exist
ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS game_display_name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS action_history JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS current_state JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS token_cost INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS action_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mcp_token TEXT,
  ADD COLUMN IF NOT EXISTS slot_id INTEGER,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'game_sessions'
      AND constraint_name = 'game_sessions_status_check'
  ) THEN
    ALTER TABLE public.game_sessions
      ADD CONSTRAINT game_sessions_status_check
        CHECK (status IN ('active', 'paused', 'completed', 'abandoned'));
  END IF;
END $$;

-- Indexes for game_sessions
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_status
  ON public.game_sessions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_game_sessions_started_at
  ON public.game_sessions(started_at DESC);

-- RLS policies for game_sessions
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own game sessions" ON public.game_sessions;
DROP POLICY IF EXISTS "Service role full access to game_sessions" ON public.game_sessions;

CREATE POLICY "Users can view own game sessions"
  ON public.game_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to game_sessions"
  ON public.game_sessions FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_game_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_game_sessions_updated_at ON public.game_sessions;

CREATE TRIGGER set_game_sessions_updated_at
  BEFORE UPDATE ON public.game_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_game_sessions_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Extend cha_activity_log with game_play action type
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop existing constraint and recreate with game_play
ALTER TABLE public.cha_activity_log DROP CONSTRAINT IF EXISTS cha_activity_log_action_type_check;

ALTER TABLE public.cha_activity_log
  ADD CONSTRAINT cha_activity_log_action_type_check
  CHECK (action_type IN ('web_browse', 'game_play', 'other'));

-- Add game-specific columns to cha_activity_log
ALTER TABLE public.cha_activity_log
  ADD COLUMN IF NOT EXISTS game_session_id UUID REFERENCES public.game_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS game_name TEXT,
  ADD COLUMN IF NOT EXISTS game_result TEXT;

-- Index for game activity logs
CREATE INDEX IF NOT EXISTS idx_cha_activity_log_game
  ON public.cha_activity_log(user_id, created_at DESC)
  WHERE action_type = 'game_play';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Extend app_settings with game configuration
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add game-related settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS tool_game_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS game_autonomous_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS game_autonomous_probability NUMERIC(4,3) NOT NULL DEFAULT 0.05,
  ADD COLUMN IF NOT EXISTS game_session_max_duration_min INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS game_daily_token_cap INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS game_background_max_turns INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS game_preferred_types JSONB NOT NULL DEFAULT '[]'::JSONB;

-- Add constraints for game settings
DO $$
BEGIN
  -- Probability constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'app_settings'
      AND constraint_name = 'app_settings_game_probability_check'
  ) THEN
    ALTER TABLE public.app_settings
      ADD CONSTRAINT app_settings_game_probability_check
        CHECK (game_autonomous_probability >= 0 AND game_autonomous_probability <= 1);
  END IF;

  -- Duration constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'app_settings'
      AND constraint_name = 'app_settings_game_duration_check'
  ) THEN
    ALTER TABLE public.app_settings
      ADD CONSTRAINT app_settings_game_duration_check
        CHECK (game_session_max_duration_min > 0);
  END IF;

  -- Token cap constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'app_settings'
      AND constraint_name = 'app_settings_game_token_cap_check'
  ) THEN
    ALTER TABLE public.app_settings
      ADD CONSTRAINT app_settings_game_token_cap_check
        CHECK (game_daily_token_cap >= 0);
  END IF;

  -- Background turns constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'app_settings'
      AND constraint_name = 'app_settings_game_background_turns_check'
  ) THEN
    ALTER TABLE public.app_settings
      ADD CONSTRAINT app_settings_game_background_turns_check
        CHECK (game_background_max_turns >= 0);
  END IF;

  -- JSONB type constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'app_settings'
      AND constraint_name = 'app_settings_game_preferred_types_check'
  ) THEN
    ALTER TABLE public.app_settings
      ADD CONSTRAINT app_settings_game_preferred_types_check
        CHECK (jsonb_typeof(game_preferred_types) = 'array');
  END IF;
END $$;
