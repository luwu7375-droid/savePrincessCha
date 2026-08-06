// Test suite for autonomous game runner
// Run with: deno test --allow-net --allow-env

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("TEST_SUPABASE_URL") || "http://localhost:54321";
const SERVICE_ROLE_KEY = Deno.env.get("TEST_SERVICE_ROLE_KEY") || "";
const TEST_USER_ID = Deno.env.get("TEST_USER_ID") || "00000000-0000-0000-0000-000000000001";

Deno.test("game-task-manager: create and claim task", async () => {
  // Create a test task
  const createRes = await fetch(`${SUPABASE_URL}/rest/v1/game_tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id: TEST_USER_ID,
      conversation_id: "test_conv",
      game_id: "turtle_soup",
      game_name: "海龟汤",
      max_turns: 10,
      max_retries: 3,
      deadline: new Date(Date.now() + 3600000).toISOString(),
    }),
  });

  assertEquals(createRes.status, 201);
  const tasks = await createRes.json();
  assertExists(tasks[0]?.id);
  const taskId = tasks[0].id;

  // Claim the task
  const claimRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_game_task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      p_worker_id: "test_worker",
      p_lease_secs: 60,
    }),
  });

  assertEquals(claimRes.status, 200);
  const claimedId = await claimRes.json();
  assertEquals(claimedId, taskId);

  // Verify task is now locked
  const getRes = await fetch(
    `${SUPABASE_URL}/rest/v1/game_tasks?id=eq.${taskId}`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  );
  const [task] = await getRes.json();
  assertEquals(task.status, "running");
  assertEquals(task.locked_by, "test_worker");

  // Cleanup
  await fetch(`${SUPABASE_URL}/rest/v1/game_tasks?id=eq.${taskId}`, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
});

Deno.test("game-task-manager: reclaim expired task", async () => {
  // Create a task with expired lock
  const expiredTime = new Date(Date.now() - 3600000).toISOString();
  const createRes = await fetch(`${SUPABASE_URL}/rest/v1/game_tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id: TEST_USER_ID,
      conversation_id: "test_conv",
      game_id: "turtle_soup",
      game_name: "海龟汤",
      status: "running",
      locked_by: "dead_worker",
      locked_at: expiredTime,
      lock_expires_at: expiredTime,
      max_turns: 10,
      max_retries: 3,
      deadline: new Date(Date.now() + 3600000).toISOString(),
    }),
  });

  const tasks = await createRes.json();
  const taskId = tasks[0].id;

  // Reclaim expired tasks
  const reclaimRes = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/reclaim_expired_game_tasks`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  );

  assertEquals(reclaimRes.status, 200);
  const count = await reclaimRes.json();
  assertEquals(count >= 1, true);

  // Verify task is back to pending
  const getRes = await fetch(
    `${SUPABASE_URL}/rest/v1/game_tasks?id=eq.${taskId}`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  );
  const [task] = await getRes.json();
  assertEquals(task.status, "pending");
  assertEquals(task.locked_by, null);

  // Cleanup
  await fetch(`${SUPABASE_URL}/rest/v1/game_tasks?id=eq.${taskId}`, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
});

Deno.test("game-runner: no work available", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/game-runner`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });

  assertEquals(res.status, 200);
  const result = await res.json();
  assertEquals(result.ok, true);
  assertEquals(result.status, "no_work");
});

Deno.test("game-intent-detector: autonomous intent", async () => {
  const { detectGameIntent } = await import(
    "../supabase/functions/_shared/game-intent-detector.ts"
  );

  const tests = [
    {
      input: "去玩个海龟汤，玩完告诉我",
      expected: { autonomous: true, gameId: "turtle_soup", gameName: "海龟汤" },
    },
    {
      input: "帮我玩个狼人杀",
      expected: { autonomous: true, gameId: "werewolf", gameName: "狼人杀" },
    },
    {
      input: "我们一起玩海龟汤",
      expected: { autonomous: false, gameId: "turtle_soup", gameName: "海龟汤" },
    },
    {
      input: "想玩游戏",
      expected: { autonomous: false, gameId: null, gameName: null },
    },
  ];

  for (const test of tests) {
    const result = detectGameIntent(test.input);
    assertEquals(result.autonomous, test.expected.autonomous);
    assertEquals(result.gameId, test.expected.gameId);
    assertEquals(result.gameName, test.expected.gameName);
  }
});
