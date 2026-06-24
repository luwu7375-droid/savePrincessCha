-- Extend cha_activity_log with web reading/search fields for Phase 1 (联网搜索).
-- Uses ALTER TABLE to preserve existing rows and constraints.

ALTER TABLE public.cha_activity_log
  ADD COLUMN IF NOT EXISTS action_subtype text,
  ADD COLUMN IF NOT EXISTS conversation_id uuid,
  ADD COLUMN IF NOT EXISTS query text,
  ADD COLUMN IF NOT EXISTS final_url text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS excerpt text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_msg text,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS token_estimate integer;

-- action_subtype: how the web read was initiated
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'cha_activity_log'
      AND constraint_name = 'cha_activity_log_action_subtype_check'
  ) THEN
    ALTER TABLE public.cha_activity_log
      ADD CONSTRAINT cha_activity_log_action_subtype_check
        CHECK (action_subtype IS NULL OR action_subtype IN (
          'user_requested', 'real_time_query', 'auto_browsing', 'context_supplement'
        ));
  END IF;
END $$;

-- status: outcome of the web read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'cha_activity_log'
      AND constraint_name = 'cha_activity_log_status_check'
  ) THEN
    ALTER TABLE public.cha_activity_log
      ADD CONSTRAINT cha_activity_log_status_check
        CHECK (status IN ('success', 'timeout', 'error'));
  END IF;
END $$;

-- Additional index for today's web activity timeline
CREATE INDEX IF NOT EXISTS idx_cha_activity_log_web_today
  ON public.cha_activity_log(user_id, created_at DESC)
  WHERE action_type = 'web_browse';
