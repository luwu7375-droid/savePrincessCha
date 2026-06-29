-- Cost Dashboard Migration - Execute in Supabase SQL Editor
-- This script is idempotent and safe to run multiple times

-- 1. Create cost_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.cost_log (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null default auth.uid(),
  ts                  timestamptz not null default now(),
  tier                text,
  site                text,
  raw_model           text,
  endpoint_type       text,
  in_tokens           int,
  out_tokens          int,
  cache_read_tokens   int default 0,
  cache_write_tokens  int default 0,
  chars               int default 0,
  cost_cny            numeric(10,6) not null default 0,
  is_fallback         boolean not null default false,
  fallback_reason     text
);

-- 2. Enable RLS
ALTER TABLE public.cost_log ENABLE ROW LEVEL SECURITY;

-- 3. Create policies (drop if exists, then create)
DROP POLICY IF EXISTS "user_read_own" ON public.cost_log;
CREATE POLICY "user_read_own" ON public.cost_log
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "service_insert" ON public.cost_log;
CREATE POLICY "service_insert" ON public.cost_log
  FOR INSERT WITH CHECK (true);

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_cost_log_user_ts ON public.cost_log (user_id, ts desc);
CREATE INDEX IF NOT EXISTS idx_cost_log_ts ON public.cost_log (ts desc);

-- 5. Add transparency fields
ALTER TABLE public.cost_log
  ADD COLUMN IF NOT EXISTS usage_source text,
  ADD COLUMN IF NOT EXISTS cost_source text,
  ADD COLUMN IF NOT EXISTS usage_raw jsonb,
  ADD COLUMN IF NOT EXISTS cost_precision text,
  ADD COLUMN IF NOT EXISTS cache_metric_source text;

-- 6. Add column comments
COMMENT ON COLUMN public.cost_log.usage_source IS 'Source of usage data: upstream_sse_usage / unavailable / estimated';
COMMENT ON COLUMN public.cost_log.cost_source IS 'Source of cost calculation: local_price_table / upstream_billing';
COMMENT ON COLUMN public.cost_log.usage_raw IS 'Raw usage object from upstream for debugging and auditing';
COMMENT ON COLUMN public.cost_log.cost_precision IS 'Precision level: estimated / actual';
COMMENT ON COLUMN public.cost_log.cache_metric_source IS 'Source of cache metrics: prompt_tokens_details.cached_tokens / none';

-- Done! Check the table structure:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'cost_log' ORDER BY ordinal_position;
