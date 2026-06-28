-- cost_log: per-call token/cost tracking for all AI API calls
-- Run this in Supabase SQL editor (with service role / dashboard access)

create table public.cost_log (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null default auth.uid(),
  ts                  timestamptz not null default now(),
  tier                text,          -- instant / general / advanced / tts
  site                text,          -- 55api / fuka / openrouter / elevenlabs / minimax
  raw_model           text,          -- raw model name returned by provider
  endpoint_type       text,          -- anthropic / openai / gemini
  in_tokens           int,
  out_tokens          int,
  cache_read_tokens   int default 0,
  cache_write_tokens  int default 0,
  chars               int default 0, -- for TTS / character-billed calls
  cost_cny            numeric(10,6) not null default 0,
  is_fallback         boolean not null default false,
  fallback_reason     text
);

-- RLS: users can only read their own rows
alter table public.cost_log enable row level security;

create policy "user_read_own" on public.cost_log
  for select using (auth.uid() = user_id);

-- Edge functions use service_role key — bypass RLS on insert
create policy "service_insert" on public.cost_log
  for insert with check (true);

-- Indexes for dashboard queries (user + time range)
create index idx_cost_log_user_ts on public.cost_log (user_id, ts desc);
create index idx_cost_log_ts      on public.cost_log (ts desc);
