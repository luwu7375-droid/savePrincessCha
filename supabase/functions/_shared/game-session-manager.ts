// Game Session Manager - Shared utilities for managing game sessions
// Handles session lifecycle: create, record actions, update state, complete

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export type GameSession = {
  id: string;
  user_id: string;
  game_name: string;
  game_display_name: string | null;
  status: "active" | "paused" | "completed" | "abandoned";
  started_at: string;
  ended_at: string | null;
  action_history: GameAction[];
  current_state: Record<string, unknown>;
  token_cost: number;
  action_count: number;
  mcp_token: string | null;
  slot_id: number | null;
  created_at: string;
  updated_at: string;
};

export type GameAction = {
  action: string;
  params?: Record<string, unknown>;
  result?: unknown;
  timestamp: string;
  token_cost?: number;
  background?: boolean;
  metadata?: Record<string, unknown>;
};

/**
 * Create a new game session
 */
export async function createGameSession(
  userId: string,
  gameName: string,
  gameDisplayName: string | null,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<GameSession> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("game_sessions")
    .insert({
      user_id: userId,
      game_name: gameName,
      game_display_name: gameDisplayName,
      status: "active",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create game session: ${error.message}`);
  }

  return data as GameSession;
}

/**
 * Record a game action to session history
 */
export async function recordAction(
  sessionId: string,
  action: string,
  result: unknown,
  metadata: { background?: boolean; token_cost?: number } = {},
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<void> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Get current session
  const { data: session, error: fetchError } = await supabase
    .from("game_sessions")
    .select("action_history, action_count, token_cost")
    .eq("id", sessionId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch session: ${fetchError.message}`);
  }

  const actionHistory = session.action_history as GameAction[] || [];
  const newAction: GameAction = {
    action,
    result,
    timestamp: new Date().toISOString(),
    background: metadata.background || false,
    token_cost: metadata.token_cost || 0,
    metadata,
  };

  actionHistory.push(newAction);

  // Update session
  const { error: updateError } = await supabase
    .from("game_sessions")
    .update({
      action_history: actionHistory,
      action_count: session.action_count + 1,
      token_cost: session.token_cost + (metadata.token_cost || 0),
    })
    .eq("id", sessionId);

  if (updateError) {
    throw new Error(`Failed to record action: ${updateError.message}`);
  }
}

/**
 * Update game session state
 */
export async function updateGameState(
  sessionId: string,
  newState: Record<string, unknown>,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<void> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { error } = await supabase
    .from("game_sessions")
    .update({
      current_state: newState,
    })
    .eq("id", sessionId);

  if (error) {
    throw new Error(`Failed to update game state: ${error.message}`);
  }
}

/**
 * Complete a game session and create activity log entry
 */
export async function completeSession(
  sessionId: string,
  result: "completed" | "abandoned",
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<void> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Get session details
  const { data: session, error: fetchError } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch session: ${fetchError.message}`);
  }

  const endedAt = new Date().toISOString();
  const durationSec = Math.floor(
    (new Date(endedAt).getTime() - new Date(session.started_at).getTime()) / 1000,
  );

  // Update session status
  const { error: updateError } = await supabase
    .from("game_sessions")
    .update({
      status: result,
      ended_at: endedAt,
    })
    .eq("id", sessionId);

  if (updateError) {
    throw new Error(`Failed to update session status: ${updateError.message}`);
  }

  // Create activity log entry
  const { error: activityError } = await supabase
    .from("cha_activity_log")
    .insert({
      user_id: session.user_id,
      action_type: "game_play",
      game_session_id: sessionId,
      game_name: session.game_name,
      game_result: result,
      duration_sec: durationSec,
      token_cost: session.token_cost,
    });

  if (activityError) {
    console.error("Failed to create activity log entry:", activityError);
    // Don't throw - activity log is not critical
  }
}

/**
 * Get active game session for user
 */
export async function getActiveSession(
  userId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<GameSession | null> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get active session: ${error.message}`);
  }

  return data as GameSession | null;
}

/**
 * Pause a game session
 */
export async function pauseSession(
  sessionId: string,
  reason: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<void> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { error } = await supabase
    .from("game_sessions")
    .update({
      status: "paused",
      current_state: {
        pause_reason: reason,
        paused_at: new Date().toISOString(),
      },
    })
    .eq("id", sessionId);

  if (error) {
    throw new Error(`Failed to pause session: ${error.message}`);
  }
}

/**
 * Get all completed sessions for a date range (for diary generation)
 */
export async function getCompletedSessions(
  userId: string,
  hoursAgo: number,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<GameSession[]> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const cutoff = new Date(Date.now() - hoursAgo * 3600000).toISOString();

  const { data, error } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("ended_at", cutoff)
    .order("ended_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to get completed sessions: ${error.message}`);
  }

  return data as GameSession[];
}

/**
 * Get today's token usage for games
 */
export async function getTodayGameTokenUsage(
  userId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<number> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("game_sessions")
    .select("token_cost")
    .eq("user_id", userId)
    .gte("started_at", todayStart.toISOString());

  if (error) {
    throw new Error(`Failed to get today's token usage: ${error.message}`);
  }

  return data.reduce((sum, session) => sum + (session.token_cost || 0), 0);
}
