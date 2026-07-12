// ── companion-state-types.ts ──────────────────────────────────────────────────
//
// Type definitions for companion state engine
// Used by scheduler, chat, and frontend modules

export type ActivityType = "reading" | "browsing" | "gaming" | "diary" | "idle" | null;
export type UserStatus = "active" | "busy" | "away" | "sleeping" | null;

export interface CompanionState {
  user_id: string;
  connection: number;
  valence: number;
  arousal: number;
  immersion: number;
  last_user_message_at: string | null;
  last_contact_at: string | null;
  last_tick_at: string;
  activity_type: ActivityType;
  activity_label: string | null;
  activity_started_at: string | null;
  user_status: UserStatus;
  user_status_until: string | null;
  dnd_start_hour: number | null;
  dnd_start_minute: number | null;
  dnd_end_hour: number | null;
  dnd_end_minute: number | null;
  state_version: number;
  updated_at: string;
  created_at: string;
}

export type CompanionStateActionType = "none" | "observation" | "contact" | "find_activity";

export interface CompanionStateAction {
  type: CompanionStateActionType;
  context?: string;
  urgency?: "low" | "medium" | "high";
  reason?: string;
}

export type StateEventType =
  | "user_message"
  | "user_reply"
  | "goodnight"
  | "work_start"
  | "meeting_start"
  | "back"
  | "cha_sent";

export interface StateUpdateEvent {
  type: StateEventType;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface AdvanceStateInput {
  currentState: CompanionState;
  timeSinceLastTickMs: number;
  event?: StateUpdateEvent;
  now?: Date;
}

export interface AdvanceStateResult {
  newState: CompanionState;
  action: CompanionStateAction;
  stateChanges: Record<string, { from: number | string | null; to: number | string | null }>;
  nlContext: string; // Natural language context summary
}

// State update deltas
export interface StateUpdateDelta {
  connection?: number;
  valence?: number;
  arousal?: number;
  immersion?: number;
  last_user_message_at?: string;
  last_contact_at?: string;
  last_tick_at?: string;
  activity_type?: ActivityType;
  activity_label?: string | null;
  activity_started_at?: string | null;
  user_status?: UserStatus;
  user_status_until?: string | null;
}
