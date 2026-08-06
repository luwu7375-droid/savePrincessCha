// game-intent-detector.ts
// Detects when the user wants Cha to play a game autonomously
// (as opposed to playing together synchronously in the chat).

export type GameIntent = {
  autonomous: boolean;      // true = "play it for me", false = "let's play together"
  gameId: string | null;    // extracted game name/id if mentioned
  gameName: string | null;  // display name
};

/**
 * Detects autonomous game intent from user message.
 * Returns autonomous=true when user asks Cha to play independently
 * and report back later.
 */
export function detectGameIntent(userMessage: string): GameIntent {
  const msg = userMessage.toLowerCase();

  // Strong autonomous indicators
  const autonomousPatterns = [
    /去玩.*告诉我|去玩.*回来|玩完.*告诉|玩完.*回来/,
    /自己玩.*告诉|自己.*玩完|帮我玩|代玩/,
    /play.*for me|play.*tell me|play.*come back|finish.*game.*tell/,
  ];

  const isAutonomous = autonomousPatterns.some((pattern) => pattern.test(msg));

  // Extract game name
  let gameId: string | null = null;
  let gameName: string | null = null;

  // Known games
  const games = [
    { id: "turtle_soup", names: ["海龟汤", "龟汤", "turtle soup", "turtle_soup"] },
    { id: "werewolf", names: ["狼人杀", "werewolf"] },
    { id: "mystery", names: ["剧本杀", "mystery"] },
  ];

  for (const game of games) {
    for (const name of game.names) {
      if (msg.includes(name.toLowerCase())) {
        gameId = game.id;
        gameName = game.names[0]; // use first name as display name
        break;
      }
    }
    if (gameId) break;
  }

  return {
    autonomous: isAutonomous,
    gameId,
    gameName,
  };
}
