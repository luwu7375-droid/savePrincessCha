-- Migration: Fix image_description index size issue
-- Addresses PostgreSQL B-tree index row size limitation (2704 bytes)
-- Issue: index row size exceeds btree version 4 maximum for large image descriptions

-- Drop the problematic full-text indexes
DROP INDEX IF EXISTS public.idx_messages_image_description;
DROP INDEX IF EXISTS public.idx_messages_image_prompt;

-- Option 1: Create partial indexes using LEFT() to limit indexed text length
-- This allows searching on the first N characters while supporting longer values
CREATE INDEX idx_messages_image_description
  ON public.messages (LEFT(image_description, 500))
  WHERE image_description IS NOT NULL;

CREATE INDEX idx_messages_image_prompt
  ON public.messages (LEFT(image_prompt, 500))
  WHERE image_prompt IS NOT NULL;

-- Option 2: Add GIN indexes for full-text search (if needed for search functionality)
-- Uncomment these if you need to search within image descriptions
-- CREATE INDEX idx_messages_image_description_fts
--   ON public.messages USING gin(to_tsvector('english', COALESCE(image_description, '')));
--
-- CREATE INDEX idx_messages_image_prompt_fts
--   ON public.messages USING gin(to_tsvector('english', COALESCE(image_prompt, '')));

-- Option 3: Add hash-based index for exact lookups (if needed)
-- Uncomment if you need to find exact matches of descriptions
-- CREATE INDEX idx_messages_image_description_hash
--   ON public.messages (MD5(image_description))
--   WHERE image_description IS NOT NULL;
