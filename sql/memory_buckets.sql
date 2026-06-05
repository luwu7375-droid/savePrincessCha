create table memory_buckets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  content text,
  domain text default 'general',
  keywords text[] default '{}',
  valence numeric default 0,
  arousal numeric default 0,
  importance numeric default 0.5,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz
);

alter table memory_buckets enable row level security;
-- All reads/writes go through Edge Function with service role key (no anon access)

-- Migration (for existing tables):
-- ALTER TABLE memory_buckets ADD COLUMN IF NOT EXISTS keywords text[] DEFAULT '{}';
