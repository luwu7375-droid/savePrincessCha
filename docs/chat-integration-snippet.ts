// CHAT INTEGRATION SNIPPET
// Add this to supabase/functions/chat/index.ts in the game_invitation handler

// Import at top of file:
// import { detectGameIntent } from "../_shared/game-intent-detector.ts";
// import { createGameTask, getActiveGameTask } from "../_shared/game-task-manager.ts";

// Replace the existing game_invitation handler (around line 2487) with:

if (topicRoute === "game_invitation" || topicRoute === "game_playing") {
  try {
    const gameProxyUrl = `${supabaseUrl}/functions/v1/game-proxy`;

    // 1. Detect autonomous intent
    const intent = detectGameIntent(lastUserMessage);

    if (intent.autonomous && intent.gameId && intent.gameName) {
      // User wants Cha to play autonomously and report back later

      // Check if there's already an active task
      const existingTask = await getActiveGameTask(
        supabaseUrl,
        serviceRoleKey,
        payload.userId as string,
      );

      if (existingTask) {
        additionalContext +=
          `\n\n<game_context source="async_game_runner" priority="high">\n你已经有一个正在进行的游戏任务：「${existingTask.game_name}」\n\n状态：${existingTask.status}\n回合数：${existingTask.turn_count}/${existingTask.max_turns}\n\n自然地告诉用户你正在玩那个游戏，不能同时玩两个。\n</game_context>`;
      } else {
        // Create async task
        const task = await createGameTask(supabaseUrl, serviceRoleKey, {
          userId: payload.userId as string,
          conversationId: conversationId || "default",
          gameId: intent.gameId,
          gameName: intent.gameName,
          maxTurns: 30,
          maxRetries: 5,
          deadlineHours: 2,
        });

        additionalContext +=
          `\n\n<game_context source="async_game_runner" priority="high">\n你刚刚创建了一个独立游戏任务！\n\n游戏：${intent.gameName}\n任务 ID：${task.id}\n\n现在你可以：\n1. 自然地告诉用户"好，我去玩${intent.gameName}，玩完告诉你"\n2. 说明你会在后台独立玩，不需要等待\n3. 玩完后会主动告诉用户结果\n\n注意：\n- 不要说"我不能真的玩"，你确实会独立玩游戏\n- 不要描述技术细节（任务、后台、worker 等）\n- 用自然口吻，就像真的要去玩一样\n</game_context>`;
      }
    } else {
      // Synchronous game play in chat (existing logic)
      if (
        topicRoute === "game_invitation" &&
        /海龟汤|turtle.*soup/i.test(lastUserMessage)
      ) {
        // Auto-start turtle soup game (existing code)
        console.log("[game_invitation] Auto-starting turtle_soup game");

        const createResponse = await fetch(gameProxyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            action: "play",
            userId: payload.userId,
            game: "turtle_soup",
            gameAction: "create_random",
          }),
        });

        // ... rest of existing sync game logic
      }
    }
  } catch (error) {
    console.error("Failed to handle game:", error);
  }
}

// End of integration snippet
