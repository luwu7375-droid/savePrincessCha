-- Add RLS to xiaocha_diary_entries (missed in initial migration)
-- user_id is text (not uuid), matching app pattern

ALTER TABLE public.xiaocha_diary_entries ENABLE ROW LEVEL SECURITY;

-- Edge Functions use service role key (bypasses RLS) — these policies protect
-- direct API / anon key access. Service role writes must validate userId themselves.

CREATE POLICY "users can read own diary entries"
  ON public.xiaocha_diary_entries FOR SELECT
  USING (user_id = (auth.uid())::text OR user_id = 'default');

CREATE POLICY "users can insert own diary entries"
  ON public.xiaocha_diary_entries FOR INSERT
  WITH CHECK (user_id = (auth.uid())::text OR user_id = 'default');

CREATE POLICY "users can update own diary entries"
  ON public.xiaocha_diary_entries FOR UPDATE
  USING (user_id = (auth.uid())::text OR user_id = 'default');

-- cha_activity_log already has RLS from earlier migrations.
-- Verify web_browse rows are also covered (no extra policy needed if base RLS covers all action_types).
