-- Add metadata column to messages table for storing structured image generation details
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add index for metadata queries (optional but recommended for performance)
CREATE INDEX IF NOT EXISTS idx_messages_metadata ON messages USING GIN (metadata);

-- Add comment explaining the column
COMMENT ON COLUMN messages.metadata IS 'Structured metadata for special message types (e.g., generated images with prompt, type, size, quality)';
