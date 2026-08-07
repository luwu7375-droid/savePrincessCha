// ── companion-tick.ts ─────────────────────────────────────────────────────────
//
// Companion state tick job for scheduler
// Advances companion state and triggers proactive actions

import type { CompanionState, CompanionStateAction } from "./companion-state-types.ts";
import { advanceCompanionState, isInDndTime } from "./companion-state-engine.ts";
import { ensureCompanionWorld, recordCompanionWorldActivity } from "./companion-world.ts";

interface TickResult {
  userId: string;
  oldState: Partial<CompanionState>;
  newState: Partial<CompanionState>;
  action: CompanionStateAction;
  stateChanges: Record<string, { from: number | string | null; to: number | string | null }>;
  nlContext: string;
}

interface CompanionTickJobResult {
  users_processed: number;
  actions_triggered: number;
  contacts_sent: number;
  observations_logged: number;
  activities_started: number;
  errors: string[];
  tick_results: TickResult[];
}

/**
 * Fetch all active companion states that need ticking
 */
async function fetchActiveStates(
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<CompanionState[]> {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  // Fetch all companion_state rows
  // In production, you might want to filter by last_tick_at to only process states that haven't been ticked recently
  const res = await fetch(`${supabaseUrl}/rest/v1/companion_state?select=*`, { headers });

  if (!res.ok) {
    throw new Error(`Failed to fetch companion states: ${res.status}`);
  }

  const states = await res.json() as CompanionState[];
  return Array.isArray(states) ? states : [];
}

/**
 * Update companion state in database
 */
async function updateCompanionState(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  updates: Partial<CompanionState>
): Promise<void> {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(
    `${supabaseUrl}/rest/v1/companion_state?user_id=eq.${userId}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify(updates),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to update companion state for user ${userId}: ${res.status}`);
  }
}

/**
 * Send proactive contact message via chat API.
 *
 * Flow:
 *   1. Fetch user's most recent conversation id
 *   2. POST to /functions/v1/chat with proactive_trigger=true
 *      (chat/index.ts reads this flag and skips the user-message requirement)
 *   3. On success, write a proactive_contact entry to cha_activity_log
 */
async function sendProactiveContact(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  action: CompanionStateAction,
  nlContext: string
): Promise<boolean> {
  const dbHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  // ── Step 1: resolve most recent conversation ──────────────────────────────
  const convUrl =
    `${supabaseUrl}/rest/v1/conversations` +
    `?user_id=eq.${encodeURIComponent(userId)}` +
    `&order=updated_at.desc&limit=1&select=id`;

  const convRes = await fetch(convUrl, { headers: dbHeaders });
  if (!convRes.ok) {
    console.error(JSON.stringify({
      fn: "sendProactiveContact", event: "conv_fetch_failed",
      userId: userId.slice(0, 6), status: convRes.status,
    }));
    return false;
  }

  const conversations = await convRes.json() as Array<{ id: string }>;
  if (!conversations || conversations.length === 0) {
    console.log(JSON.stringify({
      fn: "sendProactiveContact", event: "no_conversation",
      userId: userId.slice(0, 6),
    }));
    return false;
  }

  const conversationId = conversations[0].id;

  // ── Step 2: call chat Edge Function ──────────────────────────────────────
  // chat/index.ts detects proactive_trigger=true and:
  //   - skips requiring a real user message
  //   - injects nlContext into the system prompt's 【当前状态参考】block
  //   - saves the assistant message to messages table (same as normal chat)
  const chatBody = {
    userId,
    conversationId,
    modelTier: "general",
    stream: false,
    proactive_trigger: true,       // handled by chat/index.ts
    proactive_context: nlContext,  // injected into status block
    proactive_urgency: action.urgency ?? "medium",
    proactive_hint: action.context ?? "",
    // Empty messages array — chat function will build context from DB history
    messages: [],
  };

  const chatRes = await fetch(`${supabaseUrl}/functions/v1/chat`, {
    method: "POST",
    headers: dbHeaders,
    body: JSON.stringify(chatBody),
  });

  if (!chatRes.ok) {
    const errBody = await chatRes.text().catch(() => "(unreadable)");
    console.error(JSON.stringify({
      fn: "sendProactiveContact", event: "chat_call_failed",
      userId: userId.slice(0, 6), status: chatRes.status,
      body: errBody.slice(0, 200),
    }));
    return false;
  }

  // ── Step 2.5: Send Web Push notification ─────────────────────────────────
  // After successfully sending the proactive message, notify all subscribed devices
  try {
    const pushRes = await fetch(`${supabaseUrl}/functions/v1/push-send`, {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify({
        userId,
        payload: {
          title: "小钗",
          body: "有新消息",
          tag: "proactive-contact",
          icon: "/assets/pwa/icon-192.png",
          badge: "/assets/pwa/badge-72.png",
          data: {
            url: "/",
            type: "proactive_contact",
            urgency: action.urgency ?? "medium",
          },
        },
      }),
    });

    if (!pushRes.ok) {
      // Non-fatal — chat message was already sent successfully
      console.warn(JSON.stringify({
        fn: "sendProactiveContact", event: "push_send_failed",
        userId: userId.slice(0, 6), status: pushRes.status,
      }));
    } else {
      const pushResult = await pushRes.json();
      console.log(JSON.stringify({
        fn: "sendProactiveContact", event: "push_sent",
        userId: userId.slice(0, 6),
        delivered: pushResult.delivered ?? 0,
      }));
    }
  } catch (pushError) {
    // Non-fatal — log and continue
    console.warn(JSON.stringify({
      fn: "sendProactiveContact", event: "push_send_error",
      userId: userId.slice(0, 6),
      error: pushError instanceof Error ? pushError.message : String(pushError),
    }));
  }

  // ── Step 3: log to cha_activity_log ──────────────────────────────────────
  const logRes = await fetch(`${supabaseUrl}/rest/v1/cha_activity_log`, {
    method: "POST",
    headers: dbHeaders,
    body: JSON.stringify({
      user_id: userId,
      activity_type: "proactive_contact",
      label: (action.context ?? "主动联系").slice(0, 100),
      metadata: {
        urgency: action.urgency ?? "medium",
        nlContext,
        connection: action.reason ?? "",
      },
      started_at: new Date().toISOString(),
    }),
  });

  if (!logRes.ok) {
    // Non-fatal — message was already sent
    console.warn(JSON.stringify({
      fn: "sendProactiveContact", event: "log_write_failed",
      userId: userId.slice(0, 6), status: logRes.status,
    }));
  }

  console.log(JSON.stringify({
    fn: "sendProactiveContact", event: "contact_sent",
    userId: userId.slice(0, 6), urgency: action.urgency,
    conversationId,
  }));

  return true;
}

/**
 * Log observation (internal thought, not sent to user).
 * Written to cha_activity_log so diary/memory pipelines can pick it up.
 */
async function logObservation(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  context: string
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/rest/v1/cha_activity_log`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: userId,
      activity_type: "observation",
      label: context.slice(0, 100),
      metadata: { nlContext: context },
      started_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    console.warn(JSON.stringify({
      fn: "logObservation", event: "write_failed",
      userId: userId.slice(0, 6), status: res.status,
    }));
  }
}

/**
 * Start an activity (reading, browsing, gaming)
 */
async function startActivity(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  context: string
): Promise<void> {
  // TODO: Trigger reading/browsing/gaming logic
  console.log(JSON.stringify({
    fn: "startActivity",
    event: "activity_started",
    userId: userId.slice(0, 6),
    context,
  }));

  // Update companion state to reflect new activity
  const activityType = "reading"; // Could be determined from context
  await updateCompanionState(supabaseUrl, serviceRoleKey, userId, {
    activity_type: activityType,
    activity_label: "随便翻翻网页",
    activity_started_at: new Date().toISOString(),
    immersion: 0,
  });

  await ensureCompanionWorld({ supabaseUrl, serviceRoleKey, userId });
  await recordCompanionWorldActivity({
    supabaseUrl,
    serviceRoleKey,
    userId,
    activity: "在自己的北京随手读点东西",
    sceneLocation: "高层公寓的书桌边",
  });
}

/**
 * Run companion state tick for all users
 */
export async function runCompanionTick(
  supabaseUrl: string,
  serviceRoleKey: string,
  minIntervalMinutes: number,
  connectionThreshold: number
): Promise<CompanionTickJobResult> {
  const result: CompanionTickJobResult = {
    users_processed: 0,
    actions_triggered: 0,
    contacts_sent: 0,
    observations_logged: 0,
    activities_started: 0,
    errors: [],
    tick_results: [],
  };

  try {
    const states = await fetchActiveStates(supabaseUrl, serviceRoleKey);
    console.log(JSON.stringify({
      fn: "runCompanionTick",
      event: "states_fetched",
      count: states.length,
    }));

    const now = new Date();

    for (const currentState of states) {
      try {
        result.users_processed++;

        // Calculate time since last tick
        const lastTickAt = new Date(currentState.last_tick_at);
        const timeSinceLastTickMs = now.getTime() - lastTickAt.getTime();

        // Skip if ticked too recently (< 4 minutes, since we run every 5 minutes)
        if (timeSinceLastTickMs < 4 * 60 * 1000) {
          console.log(JSON.stringify({
            fn: "runCompanionTick",
            event: "skip_recent_tick",
            userId: currentState.user_id.slice(0, 6),
            timeSinceLastTickMs,
          }));
          continue;
        }

        // Advance state
        const advanceResult = advanceCompanionState({
          currentState,
          timeSinceLastTickMs,
          now,
        });

        // Store tick result
        result.tick_results.push({
          userId: currentState.user_id,
          oldState: {
            connection: currentState.connection,
            valence: currentState.valence,
            arousal: currentState.arousal,
            immersion: currentState.immersion,
          },
          newState: {
            connection: advanceResult.newState.connection,
            valence: advanceResult.newState.valence,
            arousal: advanceResult.newState.arousal,
            immersion: advanceResult.newState.immersion,
          },
          action: advanceResult.action,
          stateChanges: advanceResult.stateChanges,
          nlContext: advanceResult.nlContext,
        });

        // Update database — include pride so the new column stays in sync
        await updateCompanionState(supabaseUrl, serviceRoleKey, currentState.user_id, {
          connection: advanceResult.newState.connection,
          pride: advanceResult.newState.pride,
          valence: advanceResult.newState.valence,
          arousal: advanceResult.newState.arousal,
          immersion: advanceResult.newState.immersion,
          last_tick_at: advanceResult.newState.last_tick_at,
          updated_at: advanceResult.newState.updated_at,
        });

        // Execute action
        if (advanceResult.action.type !== "none") {
          result.actions_triggered++;

          switch (advanceResult.action.type) {
            case "contact": {
              const sent = await sendProactiveContact(
                supabaseUrl,
                serviceRoleKey,
                currentState.user_id,
                advanceResult.action,
                advanceResult.nlContext
              );
              if (sent) {
                result.contacts_sent++;
                // Update last_contact_at
                await updateCompanionState(supabaseUrl, serviceRoleKey, currentState.user_id, {
                  last_contact_at: now.toISOString(),
                });
              }
              break;
            }

            case "observation":
              await logObservation(
                supabaseUrl,
                serviceRoleKey,
                currentState.user_id,
                advanceResult.action.context || advanceResult.nlContext
              );
              result.observations_logged++;
              break;

            case "find_activity":
              await startActivity(
                supabaseUrl,
                serviceRoleKey,
                currentState.user_id,
                advanceResult.action.context || "找点事情做"
              );
              result.activities_started++;
              break;
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        result.errors.push(`User ${currentState.user_id.slice(0, 6)}: ${errorMsg}`);
        console.error(JSON.stringify({
          fn: "runCompanionTick",
          event: "user_tick_error",
          userId: currentState.user_id.slice(0, 6),
          error: errorMsg,
        }));
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Fatal: ${errorMsg}`);
    console.error(JSON.stringify({
      fn: "runCompanionTick",
      event: "fatal_error",
      error: errorMsg,
    }));
  }

  return result;
}
