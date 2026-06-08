-- Auto Memory Vault P2: add promotion tracking fields
-- Safe to run on existing data — all columns are nullable.

ALTER TABLE auto_memory_candidates
  ADD COLUMN IF NOT EXISTS promoted_at     timestamptz  NULL,
  ADD COLUMN IF NOT EXISTS promotion_error text         NULL,
  ADD COLUMN IF NOT EXISTS promotion_target text        NULL;

COMMENT ON COLUMN auto_memory_candidates.promoted_at IS
  'Timestamp when candidate was promoted to memories table. NULL if not yet promoted.';
COMMENT ON COLUMN auto_memory_candidates.promotion_error IS
  'Error message if promotion failed. NULL on success or if not attempted.';
COMMENT ON COLUMN auto_memory_candidates.promotion_target IS
  'The memories.id of the promoted record. NULL until promotion succeeds.';
