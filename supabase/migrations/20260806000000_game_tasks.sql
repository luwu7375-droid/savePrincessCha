-- Autonomous game task runner
-- Creates game_tasks table and extends game_sessions for runner tracking.
-- All statements are idempotent (safe to re-run on already-migrated databases).

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0. Extend game_sessions with fields the runner needs
--    (existing rows are not affected; NULL means "no task owner yet")
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS room_id       TEXT,
  ADD COLUMN IF NOT EXISTS session_id    TEXT,
  ADD COLUMN IF NOT EXISTS game_id       TEXT,
  ADD COLUMN IF NOT EXISTS task_id       UUID;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. game_tasks — one row per autonomous play request
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.game_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- who / where
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id   TEXT        NOT NULL,

  -- what to play
  game_id           TEXT        NOT NULL,
  game_name         TEXT        NOT NULL,

  -- CedarToy runtime identifiers (populated during play)
  room_id           TEXT,
  cedar_session_id  TEXT,

  -- lifecycle
  -- pending   → claimed by a worker
  -- running   → worker is executing turns
  -- waiting   → CedarToy is waiting for external event (not AI turn); do not spin
  -- completed → game finished successfully
  -- failed    → permanent failure (max retries exceeded or fatal error)
  -- cancelled → user cancelled
  status            TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','waiting','completed','failed','cancelled')),

  -- worker lease (prevents concurrent execution)
  locked_by         TEXT,                   -- random worker instance id
  locked_at         TIMESTAMPTZ,
  lock_expires_at   TIMESTAMPTZ,            -- worker must heartbeat before this

  -- progress counters
  turn_count        INTEGER     NOT NULL DEFAULT 0,
  retry_count       INTEGER     NOT NULL DEFAULT 0,

  -- safety limits
  max_turns         INTEGER     NOT NULL DEFAULT 30,
  max_retries       INTEGER     NOT NULL DEFAULT 5,
  deadline          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),

  -- last action recorded for resume
  last_action       TEXT,
  last_result       JSONB,
  current_state     JSONB       NOT NULL DEFAULT '{}'::JSONB,
  error             TEXT,

  -- timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,

  -- game_session back-link (created once runner creates the session)
  game_session_id   UUID REFERENCES public.game_sessions(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_game_tasks_user_status
  ON public.game_tasks(user_id, status);

CREATE INDEX IF NOT EXISTS idx_game_tasks_pending
  ON public.game_tasks(status, lock_expires_at)
  WHERE status IN ('pending','running');

CREATE INDEX IF NOT EXISTS idx_game_tasks_conversation
  ON public.game_tasks(conversation_id, user_id);

-- RLS: service role manages all tasks; users can read their own
ALTER TABLE public.game_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own game tasks"     ON public.game_tasks;
DROP POLICY IF EXISTS "Service role full access game tasks" ON public.game_tasks;

CREATE POLICY "Users can view own game tasks"
  ON public.game_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access game tasks"
  ON public.game_tasks FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_game_tasks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_game_tasks_updated_at ON public.game_tasks;
CREATE TRIGGER trg_game_tasks_updated_at
  BEFORE UPDATE ON public.game_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_game_tasks_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Atomic claim function — returns the task id claimed or NULL
--    Uses UPDATE ... RETURNING with a WHERE that acts as a distributed lock.
--    Safe for concurrent workers on Postgres; no advisory locks needed.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.claim_game_task(
  p_worker_id   TEXT,
  p_lease_secs  INTEGER DEFAULT 120
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id UUID;
BEGIN
  UPDATE game_tasks
  SET
    status          = 'running',
    locked_by       = p_worker_id,
    locked_at       = NOW(),
    lock_expires_at = NOW() + (p_lease_secs || ' seconds')::INTERVAL,
    started_at      = COALESCE(started_at, NOW()),
    updated_at      = NOW()
  WHERE id = (
    SELECT id FROM game_tasks
    WHERE status = 'pending'
      AND deadline > NOW()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING id INTO v_task_id;

  RETURN v_task_id;  -- NULL when no work available
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Reclaim expired leases — resets stale running tasks to pending
--    so another worker can pick them up.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reclaim_expired_game_tasks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE game_tasks
  SET
    status          = 'pending',
    locked_by       = NULL,
    locked_at       = NULL,
    lock_expires_at = NULL,
    error           = COALESCE(error, '') || ' [lease_expired]',
    updated_at      = NOW()
  WHERE status = 'running'
    AND lock_expires_at < NOW()
    AND retry_count < max_retries;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Mark permanently failed tasks that exceeded retries
  UPDATE game_tasks
  SET
    status          = 'failed',
    locked_by       = NULL,
    lock_expires_at = NULL,
    error           = COALESCE(error, '') || ' [max_retries_exceeded]',
    completed_at    = NOW(),
    updated_at      = NOW()
  WHERE status = 'running'
    AND lock_expires_at < NOW()
    AND retry_count >= max_retries;

  RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Refresh PostgREST schema cache so new table is immediately accessible
-- ═══════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
