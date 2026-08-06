// game-task-manager.ts
// Shared utilities for the persistent async game task system.
// Workers call these functions; they never hold long-lived connections.

export type GameTaskStatus =
  | "pending"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

export type GameTask = {
  id: string;
  user_id: string;
  conversation_id: string;
  game_id: string;
  game_name: string;
  room_id: string | null;
  cedar_session_id: string | null;
  status: GameTaskStatus;
  locked_by: string | null;
  locked_at: string | null;
  lock_expires_at: string | null;
  turn_count: number;
  retry_count: number;
  max_turns: number;
  max_retries: number;
  deadline: string;
  last_action: string | null;
  last_result: unknown;
  current_state: Record<string, unknown>;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  game_session_id: string | null;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function dbHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

async function rpc(
  supabaseUrl: string,
  serviceRoleKey: string,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: dbHeaders(serviceRoleKey),
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`rpc/${fn} HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Create a new autonomous game task. Returns the created task row.
 */
export async function createGameTask(
  supabaseUrl: string,
  serviceRoleKey: string,
  params: {
    userId: string;
    conversationId: string;
    gameId: string;
    gameName: string;
    maxTurns?: number;
    maxRetries?: number;
    deadlineHours?: number;
  },
): Promise<GameTask> {
  const now = new Date();
  const deadline = new Date(
    now.getTime() + (params.deadlineHours ?? 2) * 3_600_000,
  ).toISOString();

  const res = await fetch(`${supabaseUrl}/rest/v1/game_tasks`, {
    method: "POST",
    headers: {
      ...dbHeaders(serviceRoleKey),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id: params.userId,
      conversation_id: params.conversationId,
      game_id: params.gameId,
      game_name: params.gameName,
      max_turns: params.maxTurns ?? 30,
      max_retries: params.maxRetries ?? 5,
      deadline,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`createGameTask HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const rows = await res.json() as GameTask[];
  if (!rows.length) throw new Error("createGameTask: no row returned");
  return rows[0];
}

/**
 * Atomically claim the oldest pending task. Returns task id or null.
 */
export async function claimGameTask(
  supabaseUrl: string,
  serviceRoleKey: string,
  workerId: string,
  leaseSeconds = 120,
): Promise<string | null> {
  const result = await rpc(supabaseUrl, serviceRoleKey, "claim_game_task", {
    p_worker_id: workerId,
    p_lease_secs: leaseSeconds,
  });
  // Postgres returns the UUID directly
  return typeof result === "string" && result.length > 0 ? result : null;
}

/**
 * Reclaim tasks whose worker lease expired. Returns number reclaimed.
 */
export async function reclaimExpiredTasks(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<number> {
  const result = await rpc(
    supabaseUrl,
    serviceRoleKey,
    "reclaim_expired_game_tasks",
    {},
  );
  return typeof result === "number" ? result : 0;
}

/**
 * Fetch a single task by id.
 */
export async function getGameTask(
  supabaseUrl: string,
  serviceRoleKey: string,
  taskId: string,
): Promise<GameTask> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/game_tasks?id=eq.${encodeURIComponent(taskId)}&limit=1`,
    { headers: dbHeaders(serviceRoleKey) },
  );
  if (!res.ok) throw new Error(`getGameTask HTTP ${res.status}`);
  const rows = await res.json() as GameTask[];
  if (!rows.length) throw new Error(`getGameTask: task ${taskId} not found`);
  return rows[0];
}

/**
 * Fetch the active task for a user (any non-terminal status).
 */
export async function getActiveGameTask(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<GameTask | null> {
  const statuses = ["pending", "running", "waiting"];
  const filter = statuses.map((s) => `"${s}"`).join(",");
  const res = await fetch(
    `${supabaseUrl}/rest/v1/game_tasks` +
      `?user_id=eq.${encodeURIComponent(userId)}` +
      `&status=in.(${filter})` +
      `&order=created_at.desc&limit=1`,
    { headers: dbHeaders(serviceRoleKey) },
  );
  if (!res.ok) return null;
  const rows = await res.json() as GameTask[];
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Patch a task. Used by the worker to update progress between turns.
 */
export async function patchGameTask(
  supabaseUrl: string,
  serviceRoleKey: string,
  taskId: string,
  patch: Partial<{
    status: GameTaskStatus;
    room_id: string | null;
    cedar_session_id: string | null;
    turn_count: number;
    retry_count: number;
    last_action: string | null;
    last_result: unknown;
    current_state: Record<string, unknown>;
    error: string | null;
    completed_at: string | null;
    game_session_id: string | null;
    // extend the lease (set by heartbeat)
    lock_expires_at: string | null;
    locked_by: string | null;
  }>,
): Promise<void> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/game_tasks?id=eq.${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      headers: {
        ...dbHeaders(serviceRoleKey),
        Prefer: "return=minimal",
      },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`patchGameTask HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
}

/**
 * Mark a task as cancelled. No-op if already terminal.
 */
export async function cancelGameTask(
  supabaseUrl: string,
  serviceRoleKey: string,
  taskId: string,
  userId: string,
): Promise<boolean> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/game_tasks` +
      `?id=eq.${encodeURIComponent(taskId)}` +
      `&user_id=eq.${encodeURIComponent(userId)}` +
      `&status=in.(pending,running,waiting)`,
    {
      method: "PATCH",
      headers: {
        ...dbHeaders(serviceRoleKey),
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        status: "cancelled",
        completed_at: new Date().toISOString(),
      }),
    },
  );
  if (!res.ok) return false;
  const rows = await res.json() as unknown[];
  return rows.length > 0;
}

/**
 * Extend the worker lease by `extraSeconds`. Must be called before
 * lock_expires_at to prevent the task from being reclaimed.
 */
export async function heartbeatGameTask(
  supabaseUrl: string,
  serviceRoleKey: string,
  taskId: string,
  workerId: string,
  leaseSeconds = 120,
): Promise<void> {
  const newExpiry = new Date(
    Date.now() + leaseSeconds * 1_000,
  ).toISOString();
  await patchGameTask(supabaseUrl, serviceRoleKey, taskId, {
    lock_expires_at: newExpiry,
    locked_by: workerId,
  });
}

/**
 * Write the final assistant result message back to the original conversation.
 * Uses the same REST insert pattern as the rest of the codebase.
 */
export async function writeCompletionMessage(
  supabaseUrl: string,
  serviceRoleKey: string,
  params: {
    userId: string;
    conversationId: string;
    content: string;
  },
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/rest/v1/messages`, {
    method: "POST",
    headers: {
      ...dbHeaders(serviceRoleKey),
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      user_id: params.userId,
      conversation_id: params.conversationId,
      role: "assistant",
      content: params.content,
      // mark as a background/proactive message so frontend can distinguish
      metadata: { proactive: true, source: "game_runner" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `writeCompletionMessage HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  }
}
