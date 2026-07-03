-- Add thought field to messages table for visible_thought persistence
ALTER TABLE messages ADD COLUMN IF NOT EXISTS thought text;

COMMENT ON COLUMN messages.thought IS 'Cha''s inner thought (visible_thought) from model response, displayed before reply bubble';
