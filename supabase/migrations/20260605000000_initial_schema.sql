-- Initial schema migration
-- Creates base tables for the application

-- Messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id bigint PRIMARY KEY,
  role text CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamp DEFAULT now(),
  conversation_id text NOT NULL DEFAULT 'default',
  type text CHECK (type IN ('message', 'image', 'system', 'dream', 'voice')),
  is_favorite boolean DEFAULT false,
  ai_tags jsonb DEFAULT '[]'::jsonb,
  system_action text,
  ref_event_id bigint REFERENCES messages(id)
);

-- Conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
  id text PRIMARY KEY,
  title text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Memories table
CREATE TABLE IF NOT EXISTS public.memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  category text DEFAULT 'general',
  domain text CHECK (domain IN ('persona', 'work', 'writing', 'life', 'relation', 'general')),
  enabled boolean DEFAULT true,
  user_id uuid,
  source_msg_ids bigint[],
  title text,
  summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Memory buckets table
CREATE TABLE IF NOT EXISTS public.memory_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text NOT NULL,
  content text,
  domain text DEFAULT 'general',
  keywords text[] DEFAULT '{}',
  source_msg_ids bigint[],
  valence numeric DEFAULT 0,
  arousal numeric DEFAULT 0,
  importance numeric DEFAULT 0.5,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz
);

-- Story seeds table
CREATE TABLE IF NOT EXISTS public.story_seeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_seeds ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_memories_category ON public.memories(category);
CREATE INDEX IF NOT EXISTS idx_memory_buckets_domain ON public.memory_buckets(domain);
