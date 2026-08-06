// game-runner/index.ts
// Autonomous game task worker.
// Each invocation claims and executes ONE task from pending → completed/failed.
// Called by scheduler on a timer (e.g., every 30 seconds).
//
// Safety guarantees:
// - Atomic claim prevents concurrent execution
// - Max turns & max retries prevent infinite loops
// - Deadline prevents runaway tasks
// - Heartbeat prevents stale locks
// - All CedarToy responses are validated before advancing

import { corsHeaders } from "../_shared/cors.ts";
import {
  claimGameTask,
  getGameTask,
  patchGameTask,
  heartbeatGameTask,
  reclaimExpiredTasks,
  writeCompletionMessage,
  type GameTask,
} from "../_shared/game-task-manager.ts";
import {
  createGameSession,
  recordAction,
  updateGameState,
  completeSession,
  type GameSession,
} from "../_shared/game-session-manager.ts";

const RUNNER_VERSION = "v1-2026-08-06";
const HEARTBEAT_INTERVAL_MS = 60_000; // extend lease every 60s
const TURN_TIMEOUT_MS = 15_000;

type RunnerResult = {
  ok: boolean;
  version: string;
  task_id: string | null;
  status: string;
  turns_executed: number;
  reason: string;
  error?: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("DB_URL");
  const serviceRoleKey = Deno.env.get("DB_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "db_not_configured" }, 500);
  }

  const workerId = crypto.randomUUID().slice(0, 8);

  console.log(JSON.stringify({
    fn: "game-runner",
    event: "invoked",
    worker_id: workerId,
    version: RUNNER_VERSION,
  }));

  try {
    // 0. Reclaim expired leases
    const reclaimed = await reclaimExpiredTasks(supabaseUrl, serviceRoleKey);
    if (reclaimed > 0) {
      console.log(JSON.stringify({
        fn: "game-runner",
        event: "reclaimed_expired",
        count: reclaimed,
      }));
    }

    // 1. Claim one task
    const taskId = await claimGameTask(supabaseUrl, serviceRoleKey, workerId, 120);
    if (!taskId) {
      return json({
        ok: true,
        version: RUNNER_VERSION,
        task_id: null,
        status: "no_work",
        turns_executed: 0,
        reason: "No pending tasks available",
      });
    }

    console.log(JSON.stringify({
      fn: "game-runner",
      event: "claimed_task",
      task_id: taskId,
    }));

    // 2. Execute the task
    const result = await executeGameTask(
      supabaseUrl,
      serviceRoleKey,
      taskId,
      workerId,
    );

    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      fn: "game-runner",
      event: "top_level_error",
      error: message.slice(0, 500),
    }));
    return json({
      ok: false,
      version: RUNNER_VERSION,
      task_id: null,
      status: "error",
      turns_executed: 0,
      reason: "Runner error",
      error: message.slice(0, 200),
    }, 500);
  }
});

// ── executeGameTask ───────────────────────────────────────────────────────────

async function executeGameTask(
  supabaseUrl: string,
  serviceRoleKey: string,
  taskId: string,
  workerId: string,
): Promise<RunnerResult> {
  let task = await getGameTask(supabaseUrl, serviceRoleKey, taskId);
  let turnsExecuted = 0;
  let heartbeatTimer: number | null = null;

  try {
    // Start heartbeat
    heartbeatTimer = setInterval(async () => {
      try {
        await heartbeatGameTask(supabaseUrl, serviceRoleKey, taskId, workerId, 120);
      } catch (err) {
        console.error(JSON.stringify({
          fn: "executeGameTask",
          event: "heartbeat_failed",
          task_id: taskId,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Create game_session if needed
    let session: GameSession | null = null;
    if (!task.game_session_id) {
      session = await createGameSession(
        task.user_id,
        task.game_name,
        task.game_name,
        supabaseUrl,
        serviceRoleKey,
      );
      await patchGameTask(supabaseUrl, serviceRoleKey, taskId, {
        game_session_id: session.id,
      });
      task.game_session_id = session.id;
    }

    // Main turn loop
    while (true) {
      // Safety checks
      if (task.turn_count >= task.max_turns) {
        await finishTask(supabaseUrl, serviceRoleKey, task, "failed", {
          error: `max_turns_exceeded (${task.max_turns})`,
          final_state: task.current_state,
        });
        return {
          ok: true,
          version: RUNNER_VERSION,
          task_id: taskId,
          status: "failed",
          turns_executed: turnsExecuted,
          reason: `Exceeded max turns (${task.max_turns})`,
        };
      }

      if (new Date(task.deadline) < new Date()) {
        await finishTask(supabaseUrl, serviceRoleKey, task, "failed", {
          error: "deadline_exceeded",
          final_state: task.current_state,
        });
        return {
          ok: true,
          version: RUNNER_VERSION,
          task_id: taskId,
          status: "failed",
          turns_executed: turnsExecuted,
          reason: "Deadline exceeded",
        };
      }

      // Determine next action
      const action = determineNextAction(task);
      if (!action) {
        await finishTask(supabaseUrl, serviceRoleKey, task, "failed", {
          error: "cannot_determine_next_action",
          final_state: task.current_state,
        });
        return {
          ok: true,
          version: RUNNER_VERSION,
          task_id: taskId,
          status: "failed",
          turns_executed: turnsExecuted,
          reason: "Could not determine next action",
        };
      }

      console.log(JSON.stringify({
        fn: "executeGameTask",
        event: "turn_start",
        task_id: taskId,
        turn: task.turn_count + 1,
        action: action.action,
      }));

      // Execute turn with timeout
      let turnResult: unknown;
      try {
        turnResult = await executeTurn(
          supabaseUrl,
          serviceRoleKey,
          task,
          action,
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({
          fn: "executeGameTask",
          event: "turn_error",
          task_id: taskId,
          turn: task.turn_count + 1,
          error: errMsg.slice(0, 300),
        }));

        // Increment retry, persist error
        const newRetryCount = task.retry_count + 1;
        await patchGameTask(supabaseUrl, serviceRoleKey, taskId, {
          retry_count: newRetryCount,
          error: errMsg.slice(0, 500),
        });

        if (newRetryCount >= task.max_retries) {
          await finishTask(supabaseUrl, serviceRoleKey, task, "failed", {
            error: `max_retries_exceeded: ${errMsg.slice(0, 300)}`,
            final_state: task.current_state,
          });
          return {
            ok: true,
            version: RUNNER_VERSION,
            task_id: taskId,
            status: "failed",
            turns_executed: turnsExecuted,
            reason: `Max retries exceeded after error: ${errMsg.slice(0, 100)}`,
          };
        }

        // Retry same turn
        task = await getGameTask(supabaseUrl, serviceRoleKey, taskId);
        continue;
      }

      turnsExecuted++;

      // Parse result
      const parsed = parseGameResult(turnResult);

      // Record action in game_session
      if (task.game_session_id) {
        await recordAction(
          task.game_session_id,
          action.action,
          turnResult,
          { background: true },
          supabaseUrl,
          serviceRoleKey,
        );
      }

      // Update task state
      const newState = {
        ...task.current_state,
        last_response: parsed.text,
        room_id: parsed.room_id || task.room_id,
        session_id: parsed.session_id || task.cedar_session_id,
      };

      await patchGameTask(supabaseUrl, serviceRoleKey, taskId, {
        turn_count: task.turn_count + 1,
        last_action: action.action,
        last_result: turnResult,
        current_state: newState,
        room_id: parsed.room_id || task.room_id || null,
        cedar_session_id: parsed.session_id || task.cedar_session_id || null,
        retry_count: 0, // reset on success
        error: null,
      });

      // Check completion
      if (parsed.completed) {
        await finishTask(supabaseUrl, serviceRoleKey, task, "completed", {
          success: true,
          final_text: parsed.text,
          final_state: newState,
        });
        return {
          ok: true,
          version: RUNNER_VERSION,
          task_id: taskId,
          status: "completed",
          turns_executed: turnsExecuted,
          reason: "Game completed successfully",
        };
      }

      // Check waiting state
      if (parsed.waiting) {
        await patchGameTask(supabaseUrl, serviceRoleKey, taskId, {
          status: "waiting",
        });
        return {
          ok: true,
          version: RUNNER_VERSION,
          task_id: taskId,
          status: "waiting",
          turns_executed: turnsExecuted,
          reason: "Game is waiting for external event (not AI turn)",
        };
      }

      // Refresh task for next iteration
      task = await getGameTask(supabaseUrl, serviceRoleKey, taskId);
    }
  } finally {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
    }
  }
}

// ── determineNextAction ───────────────────────────────────────────────────────

function determineNextAction(
  task: GameTask,
): { action: string; params?: Record<string, unknown> } | null {
  // First turn: start or create room
  if (task.turn_count === 0) {
    if (task.game_id === "turtle_soup") {
      return { action: "create_random" };
    }
    return { action: "start" };
  }

  // Subsequent turns: continue, query, or guess
  // Real implementation would parse last_result to decide.
  // For MVP, we'll use a simple heuristic based on turn count.
  const state = task.current_state as Record<string, unknown>;
  const lastResponse = String(state.last_response || "");

  // Check for explicit game-over indicators
  if (
    /游戏结束|game over|恭喜|you win|你赢了|victory/i.test(lastResponse)
  ) {
    return null; // will be caught as completed in parseGameResult
  }

  // For turtle soup: alternate between questions and guesses
  if (task.game_id === "turtle_soup") {
    if (task.turn_count % 5 === 4) {
      return { action: "guess", params: { answer: "根据线索推理的答案" } };
    }
    return { action: "ask", params: { question: "这是一个是/否问题吗？" } };
  }

  // Generic: continue
  return { action: "continue" };
}

// ── executeTurn ───────────────────────────────────────────────────────────────

async function executeTurn(
  supabaseUrl: string,
  serviceRoleKey: string,
  task: GameTask,
  action: { action: string; params?: Record<string, unknown> },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/game-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        action: "play",
        userId: task.user_id,
        game: task.game_id,
        gameAction: action.action,
        actionParams: action.params,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`game-proxy HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    return await res.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`turn_timeout_after_${TURN_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── parseGameResult ───────────────────────────────────────────────────────────

function parseGameResult(result: unknown): {
  text: string;
  completed: boolean;
  waiting: boolean;
  room_id: string | null;
  session_id: string | null;
} {
  // CedarToy returns MCP content array format
  const content = Array.isArray((result as any)?.content)
    ? (result as any).content
    : [];
  const firstText = content.find((item: any) => item?.type === "text");
  const text = typeof firstText?.text === "string" ? firstText.text : "";

  // Empty or punctuation-only response = invalid
  if (!text.trim() || /^[.\s…]+$/.test(text.trim())) {
    throw new Error("cedartoy_returned_empty_or_invalid_response");
  }

  // Check completion indicators
  const completed = /游戏结束|game over|恭喜|完成|victory|you win|你赢了/i.test(
    text,
  );

  // Check waiting indicators (must wait for human or external event)
  // CedarToy uses "waiting" or "等待" in status/response
  const waiting = /waiting|等待|需要等待|please wait/i.test(text);

  // Extract room_id and session_id from response
  // Real implementation would parse structured data if available
  const roomMatch = text.match(/房间\s*ID[:：]\s*([a-zA-Z0-9_-]+)/);
  const sessionMatch = text.match(/session[:：]\s*([a-zA-Z0-9_-]+)/);

  return {
    text,
    completed,
    waiting,
    room_id: roomMatch ? roomMatch[1] : null,
    session_id: sessionMatch ? sessionMatch[1] : null,
  };
}

// ── finishTask ────────────────────────────────────────────────────────────────

async function finishTask(
  supabaseUrl: string,
  serviceRoleKey: string,
  task: GameTask,
  status: "completed" | "failed",
  details: {
    success?: boolean;
    error?: string;
    final_text?: string;
    final_state?: Record<string, unknown>;
  },
): Promise<void> {
  const now = new Date().toISOString();

  // Mark task as done
  await patchGameTask(supabaseUrl, serviceRoleKey, task.id, {
    status,
    completed_at: now,
    error: details.error || null,
    current_state: details.final_state || task.current_state,
  });

  // Complete game_session
  if (task.game_session_id) {
    await completeSession(
      task.game_session_id,
      status === "completed" ? "completed" : "abandoned",
      supabaseUrl,
      serviceRoleKey,
    );
  }

  // Write result message to original conversation
  const message = status === "completed"
    ? `玩完了「${task.game_name}」！\n\n${details.final_text || "游戏结束"}\n\n总共玩了 ${task.turn_count} 回合。`
    : `尝试玩「${task.game_name}」时出错了：${details.error || "unknown"}\n\n已进行 ${task.turn_count} 回合。`;

  try {
    await writeCompletionMessage(supabaseUrl, serviceRoleKey, {
      userId: task.user_id,
      conversationId: task.conversation_id,
      content: message,
    });
  } catch (err) {
    console.error(JSON.stringify({
      fn: "finishTask",
      event: "write_message_failed",
      task_id: task.id,
      error: err instanceof Error ? err.message : String(err),
    }));
  }

  console.log(JSON.stringify({
    fn: "finishTask",
    event: "task_finished",
    task_id: task.id,
    status,
    turns: task.turn_count,
  }));
}
