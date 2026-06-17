-- Runtime log for the shared scheduler framework.
-- The scheduler records job decisions here; actual business jobs attach later.
CREATE TABLE IF NOT EXISTS public.scheduler_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  status text NOT NULL,
  reason text DEFAULT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz DEFAULT NULL,
  CONSTRAINT scheduler_runs_job_name_check
    CHECK (job_name IN ('web_explore', 'dream_nightly', 'proactive_chat', 'daily_diary')),
  CONSTRAINT scheduler_runs_status_check
    CHECK (status IN ('skipped', 'succeeded', 'failed')),
  CONSTRAINT scheduler_runs_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_job_started_at
  ON public.scheduler_runs(job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_status_started_at
  ON public.scheduler_runs(status, started_at DESC);

ALTER TABLE public.scheduler_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access to scheduler runs" ON public.scheduler_runs;

CREATE POLICY "service_role full access to scheduler runs"
  ON public.scheduler_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
