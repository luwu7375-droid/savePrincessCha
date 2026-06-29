-- Test script to verify cost_log transparency fields
-- Run this in Supabase SQL Editor to verify migration

-- 1. Check table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'cost_log'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Insert a test record with new fields
INSERT INTO public.cost_log (
  user_id,
  tier,
  site,
  raw_model,
  in_tokens,
  out_tokens,
  cache_read_tokens,
  cost_cny,
  is_fallback,
  usage_source,
  cost_source,
  usage_raw,
  cost_precision,
  cache_metric_source
) VALUES (
  auth.uid(),
  'general',
  'openrouter',
  'anthropic/claude-3.5-sonnet',
  1000,
  500,
  200,
  0.000123,
  false,
  'upstream_sse_usage',
  'local_price_table',
  '{"prompt_tokens": 1000, "completion_tokens": 500, "prompt_tokens_details": {"cached_tokens": 200}}'::jsonb,
  'estimated',
  'prompt_tokens_details.cached_tokens'
);

-- 3. Verify the record
SELECT
  id,
  tier,
  site,
  in_tokens,
  out_tokens,
  cache_read_tokens,
  cost_cny,
  usage_source,
  cost_source,
  cost_precision,
  cache_metric_source,
  usage_raw
FROM public.cost_log
ORDER BY ts DESC
LIMIT 1;

-- Expected output should show all new fields populated correctly
