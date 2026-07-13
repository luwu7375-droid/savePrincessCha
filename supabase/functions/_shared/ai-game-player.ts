// AI Game Player - Handles autonomous game playing for Cha
// Can be triggered from chat route or scheduler

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  createGameSession,
  recordAction,
  updateGameState,
  completeSession,
  getActiveSession,
  getTodayGameTokenUsage,
  type GameSession,
} from "./game-session-manager.ts";

type GamePlayResult = {
  success: boolean;
  sessionId?: string;
  message: string;
  gameState?: unknown;
};

/**
 * Start a new game session for AI player
 */
export async function startAIGame(
  userId: string,
  gameName: string,
  gameDisplayName: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<GamePlayResult> {
  try {
    // Check if there's already an active session
    const activeSession = await getActiveSession(userId, supabaseUrl, serviceRoleKey);
    if (activeSession) {
      return {
        success: false,
        message: `已经有一个正在进行的游戏：${activeSession.game_display_name || activeSession.game_name}`,
      };
    }

    // Check daily token cap
    const settings = await getGameSettings(userId, supabaseUrl, serviceRoleKey);
    if (!settings.tool_game_enabled) {
      return {
        success: false,
        message: "游戏功能未启用",
      };
    }

    const todayUsage = await getTodayGameTokenUsage(userId, supabaseUrl, serviceRoleKey);
    if (todayUsage >= settings.game_daily_token_cap) {
      return {
        success: false,
        message: `今日游戏 token 已达上限（${settings.game_daily_token_cap}）`,
      };
    }

    // Create session
    const session = await createGameSession(
      userId,
      gameName,
      gameDisplayName,
      supabaseUrl,
      serviceRoleKey,
    );

    // Call MCP to start the game
    const gameProxyUrl = `${supabaseUrl}/functions/v1/game-proxy`;
    const startResponse = await fetch(gameProxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        action: "play",
        userId,
        game: gameName,
        gameAction: "start",
      }),
    });

    if (!startResponse.ok) {
      throw new Error(`Failed to start game: ${startResponse.statusText}`);
    }

    const startResult = await startResponse.json();

    // Record the start action
    await recordAction(
      session.id,
      "start",
      startResult,
      { background: false },
      supabaseUrl,
      serviceRoleKey,
    );

    // Update game state
    if (startResult.content?.[0]?.text) {
      await updateGameState(
        session.id,
        { lastResponse: startResult.content[0].text },
        supabaseUrl,
        serviceRoleKey,
      );
    }

    return {
      success: true,
      sessionId: session.id,
      message: `已开始游戏：${gameDisplayName}`,
      gameState: startResult,
    };
  } catch (error) {
    console.error("Failed to start AI game:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "启动游戏失败",
    };
  }
}

/**
 * Continue playing an active game session
 */
export async function continueAIGame(
  userId: string,
  action: string,
  actionParams?: Record<string, unknown>,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<GamePlayResult> {
  try {
    const session = await getActiveSession(userId, supabaseUrl, serviceRoleKey);
    if (!session) {
      return {
        success: false,
        message: "没有正在进行的游戏",
      };
    }

    // Call MCP to execute game action
    const gameProxyUrl = `${supabaseUrl}/functions/v1/game-proxy`;
    const playResponse = await fetch(gameProxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        action: "play",
        userId,
        game: session.game_name,
        gameAction: action,
        actionParams,
      }),
    });

    if (!playResponse.ok) {
      throw new Error(`Failed to execute game action: ${playResponse.statusText}`);
    }

    const playResult = await playResponse.json();

    // Record the action
    await recordAction(
      session.id,
      action,
      playResult,
      { background: false },
      supabaseUrl,
      serviceRoleKey,
    );

    // Update game state
    if (playResult.content?.[0]?.text) {
      await updateGameState(
        session.id,
        { lastResponse: playResult.content[0].text },
        supabaseUrl,
        serviceRoleKey,
      );
    }

    // Check if game is complete
    const isComplete = checkIfGameComplete(playResult);
    if (isComplete) {
      await completeSession(session.id, "completed", supabaseUrl, serviceRoleKey);
    }

    return {
      success: true,
      sessionId: session.id,
      message: "游戏动作已执行",
      gameState: playResult,
    };
  } catch (error) {
    console.error("Failed to continue AI game:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "执行游戏动作失败",
    };
  }
}

/**
 * Get game settings for user
 */
async function getGameSettings(
  userId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{
  tool_game_enabled: boolean;
  game_autonomous_enabled: boolean;
  game_daily_token_cap: number;
  game_session_max_duration_min: number;
}> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("app_settings")
    .select("tool_game_enabled, game_autonomous_enabled, game_daily_token_cap, game_session_max_duration_min")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    // Return defaults if no settings found
    return {
      tool_game_enabled: false,
      game_autonomous_enabled: false,
      game_daily_token_cap: 5000,
      game_session_max_duration_min: 60,
    };
  }

  return data;
}

/**
 * Check if game is complete based on result
 */
function checkIfGameComplete(result: any): boolean {
  if (!result || !result.content || !Array.isArray(result.content)) {
    return false;
  }

  const text = result.content[0]?.text || "";
  const lowerText = text.toLowerCase();

  // Check for common completion indicators
  return (
    lowerText.includes("game over") ||
    lowerText.includes("游戏结束") ||
    lowerText.includes("恭喜") ||
    lowerText.includes("完成") ||
    lowerText.includes("victory") ||
    lowerText.includes("你赢了")
  );
}

/**
 * Get current game status for AI player
 */
export async function getAIGameStatus(
  userId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{
  hasActiveGame: boolean;
  session?: GameSession;
  lastAction?: string;
  actionCount?: number;
}> {
  const session = await getActiveSession(userId, supabaseUrl, serviceRoleKey);

  if (!session) {
    return { hasActiveGame: false };
  }

  const lastAction = session.action_history.length > 0
    ? session.action_history[session.action_history.length - 1].action
    : undefined;

  return {
    hasActiveGame: true,
    session,
    lastAction,
    actionCount: session.action_count,
  };
}
