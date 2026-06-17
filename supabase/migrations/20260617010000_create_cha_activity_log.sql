-- Create cha_activity_log for Cha background behavior.
-- This table is separate from messages/events and never stores chat content.
CREATE TABLE IF NOT EXISTS public.cha_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL DEFAULT 'web_browse',
  url text DEFAULT NULL,
  duration_sec integer NOT NULL DEFAULT 0,
  token_cost integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cha_activity_log_action_type_check
    CHECK (action_type IN ('web_browse', 'other')),
  CONSTRAINT cha_activity_log_duration_sec_check
    CHECK (duration_sec >= 0),
  CONSTRAINT cha_activity_log_token_cost_check
    CHECK (token_cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_cha_activity_log_user_created_at
  ON public.cha_activity_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cha_activity_log_action_type
  ON public.cha_activity_log(action_type);

ALTER TABLE public.cha_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own cha activity log" ON public.cha_activity_log;
DROP POLICY IF EXISTS "service_role full access to cha activity log" ON public.cha_activity_log;

CREATE POLICY "users own cha activity log"
  ON public.cha_activity_log
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_role full access to cha activity log"
  ON public.cha_activity_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
