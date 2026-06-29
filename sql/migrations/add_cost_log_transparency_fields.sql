-- Migration: Add transparency fields to cost_log table
-- Created: 2026-06-29
-- Purpose: Add fields to distinguish usage/cost data sources and improve cost dashboard explainability

-- Add new columns to cost_log table
ALTER TABLE public.cost_log
  ADD COLUMN IF NOT EXISTS usage_source text,
  ADD COLUMN IF NOT EXISTS cost_source text,
  ADD COLUMN IF NOT EXISTS usage_raw jsonb,
  ADD COLUMN IF NOT EXISTS cost_precision text,
  ADD COLUMN IF NOT EXISTS cache_metric_source text;

-- Add comments for documentation
COMMENT ON COLUMN public.cost_log.usage_source IS 'Source of usage data: upstream_sse_usage / unavailable / estimated';
COMMENT ON COLUMN public.cost_log.cost_source IS 'Source of cost calculation: local_price_table / upstream_billing';
COMMENT ON COLUMN public.cost_log.usage_raw IS 'Raw usage object from upstream for debugging and auditing';
COMMENT ON COLUMN public.cost_log.cost_precision IS 'Precision level: estimated / actual';
COMMENT ON COLUMN public.cost_log.cache_metric_source IS 'Source of cache metrics: prompt_tokens_details.cached_tokens / none';
