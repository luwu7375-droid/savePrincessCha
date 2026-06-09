-- Create instructions table for rule/persona/config type entries
-- that were previously mixed into memories.
--
-- Structure mirrors memories but drops title/summary (instructions are
-- read as raw content, not displayed as cards).

CREATE TABLE IF NOT EXISTS public.instructions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  content     text        NOT NULL,
  category    text        DEFAULT 'general',
  enabled     boolean     DEFAULT true,
  user_id     uuid,
  source_msg_ids bigint[],
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- RLS: same pattern as memories — service role only
ALTER TABLE public.instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role full access to instructions"
  ON public.instructions
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Migrate rule-class rows from memories into instructions.
-- Criteria:
--   1. category-level rules: current_context_summary / identity_context /
--      interaction_preferences / work
--   2. persona rows that use rule/prohibition language patterns
--      (NOT '期待' — that one is a preference, not a rule)
INSERT INTO public.instructions (id, content, category, enabled, user_id, source_msg_ids, created_at, updated_at)
SELECT id, content, category, enabled, user_id, source_msg_ids, created_at, updated_at
FROM public.memories
WHERE category IN ('current_context_summary', 'identity_context', 'interaction_preferences')
   OR (
     category = 'persona'
     AND (
       content LIKE '%规则%' OR content LIKE '%禁止%' OR content LIKE '%不要%'
       OR content LIKE '%需要的是%'
       OR content LIKE '%相处模式%' OR content LIKE '%反感%'
     )
   )
   OR category = 'work';

-- Remove migrated rows from memories
DELETE FROM public.memories
WHERE category IN ('current_context_summary', 'identity_context', 'interaction_preferences')
   OR (
     category = 'persona'
     AND (
       content LIKE '%规则%' OR content LIKE '%禁止%' OR content LIKE '%不要%'
       OR content LIKE '%需要的是%'
       OR content LIKE '%相处模式%' OR content LIKE '%反感%'
     )
   )
   OR category = 'work';
