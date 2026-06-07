-- Migration: add persona_profile and openai_archive_entries tables
-- Replaces inlined TypeScript data in mastodon_profile.ts and openai_archive.ts
-- with DB-backed providers.

-- ── persona_profile ─────────────────────────────────────────────────────────
-- Stores the long-form user persona markdown (previously MASTODON_PROFILE_MD).
-- Single active row expected. Multiple rows are all injected in created_at order.

create table if not exists public.persona_profile (
  id         uuid primary key default gen_random_uuid(),
  content    text not null,
  note       text,                    -- optional label, e.g. "v3 2026-06"
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.persona_profile enable row level security;

-- Service role has full access (Edge Function reads via service role key).
-- No anon access — profile is sensitive personal data.
create policy "service_role full access to persona_profile"
  on public.persona_profile
  to service_role
  using (true)
  with check (true);

-- ── openai_archive_entries ───────────────────────────────────────────────────
-- Stores historical roleplay / AI usage archive entries (previously ARCHIVE_ROLEPLAY).
-- Each row is one ArchiveEntry. ARCHIVE_POLICY is stored as a special row
-- with entry_id = 'POLICY' and triggers = '{}'.

create table if not exists public.openai_archive_entries (
  id             uuid primary key default gen_random_uuid(),
  entry_id       text not null unique,   -- stable key, e.g. "E1_reporter_1920s"
  triggers       text[] not null default '{}',
  content        text not null,
  can_easter_egg boolean not null default false,
  caution        text,                   -- null if no caution fence
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.openai_archive_entries enable row level security;

-- Service role has full access.
-- No anon access — archive contains private interaction history.
create policy "service_role full access to openai_archive_entries"
  on public.openai_archive_entries
  to service_role
  using (true)
  with check (true);

-- Index on entry_id for debug log lookups.
create index if not exists openai_archive_entries_entry_id_idx
  on public.openai_archive_entries (entry_id);
