-- Add title / summary columns to auto_memory_candidates and memories.
-- These fields are populated by the LLM during candidate extraction,
-- then copied verbatim during promotion. No backfill for existing rows.

ALTER TABLE auto_memory_candidates
  ADD COLUMN IF NOT EXISTS title   text,
  ADD COLUMN IF NOT EXISTS summary text;

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS title   text,
  ADD COLUMN IF NOT EXISTS summary text;
