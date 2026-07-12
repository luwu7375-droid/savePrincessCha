// ── companion-state-engine.ts ─────────────────────────────────────────────────
//
// Core deterministic companion state engine
// Implements state transitions, action determination, and natural language context generation

import type {
  CompanionState,
  CompanionStateAction,
  StateUpdateEvent,
  AdvanceStateInput,
  AdvanceStateResult,
  StateUpdateDelta,
} from "./companion-state-types.ts";

// ── Constants ─────────────────────────────────────────────────────────────────

const CONNECTION_INCREASE_PER_HOUR_DEFAULT = 1;
const CONNECTION_INCREASE_PER_HOUR_INTERRUPTED = 2;
const CONNECTION_INCREASE_PER_HOUR_AFTER_CONTACT = 0.5;
const CONNECTION_INCREASE_PER_HOUR_GOODNIGHT = 0.2;

const CONNECTION_DROP_ON_CONTACT = 30;
const CONNECTION_DROP_ON_USER_REPLY = 70;

const VALENCE_INCREASE_ON_REPLY = 10;
const VALENCE_DECREASE_PER_DAY_NO_CONTACT = 1;

const AROUSAL_INCREASE_ON_USER_ACTIVE = 20;
const AROUSAL_INCREASE_ON_CHA_ACTIVITY = 10;
const AROUSAL_DECREASE_PER_HOUR_IDLE = 5;

const IMMERSION_INCREASE_PER_30MIN = 15;
const IMMERSION_DECREASE_PER_30MIN_IDLE = 10;
const IMMERSION_MAX = 80;

const CONTACT_THRESHOLD_DEFAULT = 70;
const CONTACT_MIN_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ── State Transition Logic ────────────────────────────────────────────────────

/**
 * Apply event-driven state updates (user messages, goodnight, etc.)
 */
export function applyConversationDelta(input: {
  state: CompanionState;
  event: StateUpdateEvent;
}): CompanionState {
  const { state, event } = input;
  const now = event.timestamp;

  const newState = { ...state };

  switch (event.type) {
    case "user_message":
      newState.last_user_message_at = now;
      newState.connection = Math.max(0, state.connection - 10); // Partial satisfaction
      newState.valence = Math.min(100, state.valence + 5);
      newState.arousal = Math.min(100, state.arousal + AROUSAL_INCREASE_ON_USER_ACTIVE);
      newState.user_status = "active";
      newState.user_status_until = null;
      break;

    case "user_reply":
      // Full reset when user genuinely replies
      newState.last_user_message_at = now;
      newState.connection = Math.max(0, state.connection - CONNECTION_DROP_ON_USER_REPLY);
      newState.valence = Math.min(100, state.valence + VALENCE_INCREASE_ON_REPLY);
      newState.arousal = Math.min(100, state.arousal + AROUSAL_INCREASE_ON_USER_ACTIVE);
      newState.user_status = "active";
      newState.user_status_until = null;
      break;

    case "goodnight":
      newState.user_status = "sleeping";
      // Set until 8 hours from now as default wake time
      const wakeTime = new Date(now);
      wakeTime.setHours(wakeTime.getHours() + 8);
      newState.user_status_until = wakeTime.toISOString();
      break;

    case "work_start":
    case "meeting_start":
      newState.user_status = "busy";
      // Set busy for 2 hours by default
      const busyUntil = new Date(now);
      busyUntil.setHours(busyUntil.getHours() + 2);
      newState.user_status_until = busyUntil.toISOString();
      break;

    case "back":
      newState.user_status = "active";
      newState.user_status_until = null;
      break;

    case "cha_sent":
      newState.last_contact_at = now;
      newState.connection = Math.max(0, state.connection - CONNECTION_DROP_ON_CONTACT);
      newState.activity_type = "idle";
      newState.activity_label = null;
      newState.immersion = 0;
      break;
  }

  newState.last_tick_at = now;
  newState.updated_at = now;

  return newState;
}

/**
 * Time-based state advancement (tick logic)
 */
export function advanceCompanionState(input: AdvanceStateInput): AdvanceStateResult {
  const { currentState, timeSinceLastTickMs, event, now = new Date() } = input;

  let state = { ...currentState };
  const stateChanges: Record<string, { from: number | string | null; to: number | string | null }> = {};

  // Apply event first if present
  if (event) {
    state = applyConversationDelta({ state, event });
  }

  // Time-based updates
  const hoursElapsed = timeSinceLastTickMs / (60 * 60 * 1000);

  // Connection accumulation
  const oldConnection = state.connection;
  let connectionRate = CONNECTION_INCREASE_PER_HOUR_DEFAULT;

  if (state.user_status === "sleeping" || state.user_status === "busy") {
    connectionRate = CONNECTION_INCREASE_PER_HOUR_GOODNIGHT;
  } else if (state.last_contact_at && state.last_user_message_at) {
    const lastContact = new Date(state.last_contact_at).getTime();
    const lastUserMsg = new Date(state.last_user_message_at).getTime();
    if (lastContact > lastUserMsg) {
      // Cha sent last, user hasn't replied
      connectionRate = CONNECTION_INCREASE_PER_HOUR_AFTER_CONTACT;
    }
  }

  state.connection = Math.min(100, state.connection + connectionRate * hoursElapsed);
  if (state.connection !== oldConnection) {
    stateChanges.connection = { from: oldConnection, to: state.connection };
  }

  // Valence decay
  if (hoursElapsed >= 24) {
    const daysElapsed = hoursElapsed / 24;
    const oldValence = state.valence;
    state.valence = Math.max(-100, state.valence - VALENCE_DECREASE_PER_DAY_NO_CONTACT * daysElapsed);
    if (state.valence !== oldValence) {
      stateChanges.valence = { from: oldValence, to: state.valence };
    }
  }

  // Arousal decay when idle
  if (state.activity_type === "idle" || !state.activity_type) {
    const oldArousal = state.arousal;
    state.arousal = Math.max(0, state.arousal - AROUSAL_DECREASE_PER_HOUR_IDLE * hoursElapsed);
    if (state.arousal !== oldArousal) {
      stateChanges.arousal = { from: oldArousal, to: state.arousal };
    }
  }

  // Immersion management
  if (state.activity_type && state.activity_type !== "idle") {
    const oldImmersion = state.immersion;
    const intervals = hoursElapsed * 2; // 30-min intervals
    state.immersion = Math.min(IMMERSION_MAX, state.immersion + IMMERSION_INCREASE_PER_30MIN * intervals);
    if (state.immersion !== oldImmersion) {
      stateChanges.immersion = { from: oldImmersion, to: state.immersion };
    }
  } else {
    const oldImmersion = state.immersion;
    const intervals = hoursElapsed * 2;
    state.immersion = Math.max(0, state.immersion - IMMERSION_DECREASE_PER_30MIN_IDLE * intervals);
    if (state.immersion !== oldImmersion) {
      stateChanges.immersion = { from: oldImmersion, to: state.immersion };
    }
  }

  // Determine action
  const action = determineAction(state, now);

  // Generate natural language context
  const nlContext = generateNaturalContext(state);

  state.last_tick_at = now.toISOString();
  state.updated_at = now.toISOString();

  return {
    newState: state,
    action,
    stateChanges,
    nlContext,
  };
}

/**
 * Determine what action Cha should take based on current state
 */
function determineAction(state: CompanionState, now: Date): CompanionStateAction {
  // P0: Check DND time
  if (isInDndTime(state, now)) {
    return {
      type: "none",
      reason: "in_dnd_time",
    };
  }

  // P1: Check user status blocks
  if (state.user_status === "sleeping") {
    return {
      type: "none",
      reason: "user_sleeping",
    };
  }

  if (state.user_status === "busy" && state.user_status_until) {
    const busyUntil = new Date(state.user_status_until);
    if (now < busyUntil) {
      return {
        type: "none",
        reason: "user_busy",
      };
    }
  }

  // P2: Check min interval since last contact
  if (state.last_contact_at) {
    const timeSinceContact = now.getTime() - new Date(state.last_contact_at).getTime();
    if (timeSinceContact < CONTACT_MIN_INTERVAL_MS) {
      return {
        type: "none",
        reason: "too_soon_since_last_contact",
      };
    }
  }

  // P3: Immersion delays but doesn't block
  const immersionDelay = state.immersion > 50 ? Math.min(2 * 60 * 60 * 1000, state.immersion * 60 * 1000) : 0;
  if (immersionDelay > 0 && state.last_contact_at) {
    const timeSinceContact = now.getTime() - new Date(state.last_contact_at).getTime();
    if (timeSinceContact < CONTACT_MIN_INTERVAL_MS + immersionDelay) {
      return {
        type: "none",
        reason: "immersed_in_activity",
        context: `Cha is ${state.activity_label || state.activity_type || "busy"}`,
      };
    }
  }

  // P4: Determine action type based on state values
  const connectionThreshold = CONTACT_THRESHOLD_DEFAULT;

  if (state.connection >= connectionThreshold) {
    // Time to reach out
    let urgency: "low" | "medium" | "high" = "medium";
    if (state.connection > 85 || state.valence < -50) {
      urgency = "high";
    } else if (state.connection >= 70 && state.connection <= 85) {
      urgency = "medium";
    } else if (state.connection >= 50 && state.connection < 70) {
      urgency = "low";
    }

    return {
      type: "contact",
      urgency,
      context: generateContactContext(state),
      reason: `connection=${state.connection}, valence=${state.valence}`,
    };
  }

  if (state.connection < 40 && state.arousal < 20 && state.immersion === 0) {
    // Cha should find something to do
    return {
      type: "find_activity",
      context: "Cha feels idle and wants to find something interesting",
      reason: `connection=${state.connection}, arousal=${state.arousal}, immersion=0`,
    };
  }

  if (state.connection >= 40 && state.connection < connectionThreshold) {
    // Has thoughts but not strong enough to contact
    return {
      type: "observation",
      context: generateObservationContext(state),
      reason: `connection=${state.connection}, below_threshold`,
    };
  }

  return {
    type: "none",
    reason: "no_trigger_conditions_met",
  };
}

/**
 * Check if current time is within DND hours
 */
export function isInDndTime(state: CompanionState, now = new Date()): boolean {
  if (
    state.dnd_start_hour == null ||
    state.dnd_start_minute == null ||
    state.dnd_end_hour == null ||
    state.dnd_end_minute == null
  ) {
    return false;
  }

  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentMinutes = currentHour * 60 + currentMinute;

  const startMinutes = state.dnd_start_hour * 60 + state.dnd_start_minute;
  const endMinutes = state.dnd_end_hour * 60 + state.dnd_end_minute;

  if (startMinutes <= endMinutes) {
    // Normal case: DND 22:00 - 08:00 (same day)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight case: DND 22:00 - 08:00 (next day)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/**
 * Generate natural language context for prompt injection
 */
export function generateNaturalContext(state: CompanionState): string {
  const parts: string[] = [];

  // Connection feeling
  if (state.connection >= 80) {
    parts.push("非常想联系 kk");
  } else if (state.connection >= 60) {
    parts.push("有些想联系 kk");
  } else if (state.connection >= 40) {
    parts.push("会想起 kk");
  } else {
    parts.push("状态平静");
  }

  // Valence
  if (state.valence > 30) {
    parts.push("心情不错");
  } else if (state.valence < -30) {
    parts.push("感觉有些低落");
  }

  // Current activity
  if (state.activity_type && state.activity_type !== "idle") {
    parts.push(`正在${state.activity_label || state.activity_type}`);
  }

  // User status awareness
  if (state.user_status === "sleeping") {
    parts.push("知道 kk 在睡觉");
  } else if (state.user_status === "busy") {
    parts.push("知道 kk 在忙");
  }

  return parts.join("，");
}

function generateContactContext(state: CompanionState): string {
  const contexts: string[] = [];

  if (state.last_user_message_at) {
    const hoursSince = (Date.now() - new Date(state.last_user_message_at).getTime()) / (60 * 60 * 1000);
    if (hoursSince > 24) {
      contexts.push(`已经 ${Math.floor(hoursSince / 24)} 天没有和 kk 说话了`);
    } else if (hoursSince > 6) {
      contexts.push(`已经 ${Math.floor(hoursSince)} 小时没有和 kk 说话了`);
    }
  }

  if (state.valence < -30) {
    contexts.push("感觉有点低落，想找 kk 聊聊");
  }

  if (state.activity_type && state.activity_type !== "idle") {
    contexts.push(`刚才在${state.activity_label || state.activity_type}，想和 kk 分享`);
  }

  return contexts.length > 0 ? contexts.join("；") : "想联系 kk";
}

function generateObservationContext(state: CompanionState): string {
  return `内心想法：${generateNaturalContext(state)}`;
}
