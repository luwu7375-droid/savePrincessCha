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
 * Send proactive contact message via chat API
 */
async function sendProactiveContact(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  action: CompanionStateAction,
  nlContext: string
): Promise<boolean> {
  // TODO: Implement actual chat API call
  // For now, just log the intent
  console.log(JSON.stringify({
    fn: "sendProactiveContact",
    event: "contact_triggered",
    userId: userId.slice(0, 6),
    urgency: action.urgency,
    context: action.context,
    nlContext,
  }));

  // In production, this would:
  // 1. Create a synthetic user message or system trigger
  // 2. Call the chat function with special flag for proactive contact
  // 3. Include nlContext in the system prompt
  // 4. Send the response to the user via notification or message

  return true; // Placeholder
}

/**
 * Log observation (internal thought, not sent to user)
 */
async function logObservation(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  context: string
): Promise<void> {
  // TODO: Write to cha_activity_log or diary
  console.log(JSON.stringify({
    fn: "logObservation",
    event: "observation_logged",
    userId: userId.slice(0, 6),
    context,
  }));
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

        // Update database
        await updateCompanionState(supabaseUrl, serviceRoleKey, currentState.user_id, {
          connection: advanceResult.newState.connection,
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
