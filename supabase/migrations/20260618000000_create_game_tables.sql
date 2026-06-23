-- CH7/CH8: Game mode tables
-- game_sessions: temporary sandbox state (NOT the events table; discarded on /over)
-- game_meta: minimal cross-session state (e.g. who went first last time)

-- game_sessions stores active game state per user.
-- Rows are upserted on game start and deleted (or left as historical record) on /over.
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null check (game in ('wicked', 'truth_or_dare', 'turtle_soup', 'trpg')),
  -- Isolated conversation context — NOT written to messages/events table (D-5)
  messages jsonb not null default '[]'::jsonb,
  -- Wicked-specific fields (null for other games)
  stake text,
  starter text check (starter in ('user', 'cha', null)),
  -- poison_index_user: server-stored, MUST NOT appear in Cha's prompt (R5)
  poison_index_user integer,
  -- poison_index_cha: server-side Math.random(), NOT LLM-generated (R5)
  poison_index_cha integer,
  candy_count integer default 10,
  -- Turtle soup: current puzzle index
  puzzle_index integer,
  -- Turn-based state
  current_turn text check (current_turn in ('user', 'cha', null)),
  phase text default 'active',  -- 'stake' | 'active' | 'ended'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one active game session per user at a time
create unique index if not exists game_sessions_user_active_idx
  on public.game_sessions (user_id)
  where phase != 'ended';

alter table public.game_sessions enable row level security;

create policy "Users can manage their own game sessions"
  on public.game_sessions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- game_meta: minimal cross-session structured state (non-narrative, not events)
-- Stores only things like "who went first last time" for alternating first-mover rule.
create table if not exists public.game_meta (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Wicked: last game's first-mover, so next game alternates (D-4)
  wicked_last_starter text check (wicked_last_starter in ('user', 'cha', null)),
  updated_at timestamptz not null default now()
);

alter table public.game_meta enable row level security;

create policy "Users can manage their own game meta"
  on public.game_meta
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
