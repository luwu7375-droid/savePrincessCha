-- Add source_msg_ids / source_msg_id to tables that get written by the
-- personality pipeline, so we have a runtime evidence chain linking each
-- extracted fact back to the message(s) that produced it.
--
-- No FK constraint: bigint[] can't carry per-element foreign keys natively.
-- A memory_sources join table can be added later if strict referential
-- integrity is needed.

-- memories: hand-maintained, column added for future tooling use
ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS source_msg_ids bigint[] DEFAULT NULL;

-- persona_layer1_contexts: hand-maintained
ALTER TABLE persona_layer1_contexts
  ADD COLUMN IF NOT EXISTS source_msg_ids bigint[] DEFAULT NULL;

-- persona_layer2_dynamic_features: written by afterChat pipeline
ALTER TABLE persona_layer2_dynamic_features
  ADD COLUMN IF NOT EXISTS source_msg_ids bigint[] DEFAULT NULL;

-- persona_extraction_log: one row per afterChat invocation → single source id
ALTER TABLE persona_extraction_log
  ADD COLUMN IF NOT EXISTS source_msg_id bigint DEFAULT NULL;
