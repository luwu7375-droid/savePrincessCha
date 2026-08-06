import type { TierProviders } from "./model-client.ts";
import {
  executeMcpTool,
  getOpenAiToolDefinitions,
  type McpToolContext,
} from "./mcp-registry.ts";
import { getActiveSession } from "./game-session-manager.ts";
import {
  executeRemoteMcpTool,
  getRemoteMcpToolDefinitions,
  isRemoteMcpAlias,
} from "./remote-mcp-runtime.ts";

type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type ToolPlanResult = {
  messages: unknown[];
  used: boolean;
  names: string[];
};

const MAX_TOOL_CALLS_PER_TURN = 2;

export const CHAT_TOOLS = getOpenAiToolDefinitions();

export async function getChatToolDefinitions(context: McpToolContext) {
  try {
    const remote = await getRemoteMcpToolDefinitions(context);
    return [...CHAT_TOOLS, ...remote];
  } catch (error) {
    console.warn("[tool-runtime] remote MCP discovery failed safely", {
      error: error instanceof Error ? error.message : String(error),
    });
    return CHAT_TOOLS;
  }
}

export async function executeRuntimeTool(
  name: string,
  args: Record<string, unknown>,
  context: McpToolContext,
) {
  return isRemoteMcpAlias(name)
    ? await executeRemoteMcpTool(name, args, context)
    : await executeMcpTool(name, args, context);
}

export function isToolRuntimeCandidate(message: string): boolean {
  const text = String(message || "").trim();
  if (!text) return false;
  const hasUrl = /https?:\/\/[^\s<>"']+/i.test(text);
  const asksAboutGames =
    /(cedar\s*toy|cedartoy|海龟汤|你画我猜|五子棋|狼人杀|有什么游戏|游戏列表|游戏规则|怎么玩|想玩游戏|玩个游戏|^(继续|接着|下一回合|continue|next)$)/i
      .test(text);
  return hasUrl || asksAboutGames;
}

function buildDirectToolCalls(message: string): ToolCall[] {
  const text = String(message || "").trim();
  const url = text.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  if (url) {
    return [{
      id: `direct_${crypto.randomUUID()}`,
      type: "function",
      function: {
        name: "web_read_url",
        arguments: JSON.stringify({ url, question: text }),
      },
    }];
  }

  const asksAboutGames =
    /(cedar\s*toy|cedartoy|海龟汤|你画我猜|五子棋|狼人杀|有什么游戏|游戏列表|游戏规则|怎么玩|想玩游戏|玩个游戏)/i
      .test(text);
  if (!asksAboutGames) return [];

  const guideRequested = /(规则|玩法|怎么玩|怎么参与|guide)/i.test(text);
  const knownGames: Array<[RegExp, string]> = [
    [/海龟汤|turtle[_\s-]*soup/i, "turtle_soup"],
    [/五子棋|gomoku/i, "gomoku"],
    [/狼人杀|werewolf/i, "werewolf"],
    [/你画我猜|draw[_\s-]*(?:and[_\s-]*)?guess/i, "draw_and_guess"],
  ];
  const matchedGame = knownGames.find(([pattern]) => pattern.test(text))?.[1];

  if (guideRequested && matchedGame) {
    return [{
      id: `direct_${crypto.randomUUID()}`,
      type: "function",
      function: {
        name: "cedar_get_guide",
        arguments: JSON.stringify({ game: matchedGame }),
      },
    }];
  }

  return [{
    id: `direct_${crypto.randomUUID()}`,
    type: "function",
    function: {
      name: "cedar_list_games",
      arguments: "{}",
    },
  }];
}

function safeJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export async function prepareToolMessages(params: {
  providers?: TierProviders;
  messages: unknown[];
  context: McpToolContext;
}): Promise<ToolPlanResult> {
  const { messages, context } = params;
  const candidateMatched = isToolRuntimeCandidate(context.rawUserMessage);

  console.log("[tool-runtime] candidate check", {
    candidateMatched,
    rawUserMessagePreview: context.rawUserMessage.slice(0, 100),
    supabaseUrlPresent: !!context.supabaseUrl,
    serviceRoleKeyPresent: !!context.serviceRoleKey,
  });

  if (!candidateMatched) {
    return { messages, used: false, names: [] };
  }

  const continueRequested = /^(继续|接着|下一回合|continue|next)$/i.test(
    context.rawUserMessage.trim(),
  );
  if (continueRequested && context.userId) {
    const active = await getActiveSession(
      context.userId,
      context.supabaseUrl,
      context.serviceRoleKey,
    );
    if (!active) {
      return {
        used: true,
        names: ["cedar_restore_session"],
        messages: [...messages, {
          role: "system",
          content:
            '<tool_results source="save_princess_game_session" trust="internal">' +
            JSON.stringify({ ok: false, error: "cedar_active_session_not_found" }) +
            "</tool_results>\n没有可续接的游戏。请直接如实告诉用户，不要创建新房间或编造进度。",
        }],
      };
    }
    const state = active.current_state || {};
    return {
      used: true,
      names: ["cedar_restore_session"],
      messages: [...messages, {
        role: "system",
        content:
          '<tool_results source="save_princess_game_session" trust="internal">' +
          JSON.stringify({
            ok: true,
            game: active.game_name,
            room_id: state.room_id || null,
            session_id: state.session_id || null,
            game_id: state.game_id || active.game_name,
            status: state.status || active.status,
            last_action: state.last_action || null,
            last_response: state.last_response || null,
          }) +
          "</tool_results>\n用户要求继续当前游戏。必须先依据以上 active session 调用 cedar_play 提交下一回合；不要重新列游戏、重新创建房间或只口头续写。",
      }],
    };
  }

  // Registered P0 tools use deterministic routing. This avoids a second model
  // request for tool planning and works with providers that do not implement
  // OpenAI-compatible tool_calls.
  const calls = buildDirectToolCalls(context.rawUserMessage)
    .slice(0, MAX_TOOL_CALLS_PER_TURN);

  console.log("[tool-runtime] registered calls", {
    count: calls.length,
    selectedTools: calls.map((call) => call.function.name),
  });

  if (!calls.length) {
    return { messages, used: false, names: [] };
  }

  const names: string[] = [];
  const results: Array<{ name: string; ok: boolean; content: string }> = [];

  for (const call of calls) {
    names.push(call.function.name);
    console.log("[tool-runtime] tool started", { name: call.function.name });
    try {
      const content = await executeMcpTool(
        call.function.name,
        safeJsonObject(call.function.arguments),
        context,
      );
      results.push({ name: call.function.name, ok: true, content });
      console.log("[tool-runtime] tool succeeded", {
        name: call.function.name,
        resultLength: content.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push({
        name: call.function.name,
        ok: false,
        content: JSON.stringify({ error: errorMessage }),
      });
      console.error("[tool-runtime] tool failed", {
        name: call.function.name,
        error: errorMessage.slice(0, 300),
      });
    }
  }

  return {
    used: true,
    names,
    messages: [
      ...messages,
      {
        role: "system",
        content:
          '<tool_results source="save_princess_mcp_registry" trust="external">\n' +
          "以下内容由服务端注册表中的只读工具取得。成功时请直接依据结果回答；失败时请如实说明工具暂时不可用，不要声称已经读取成功，也不要编造。\n" +
          JSON.stringify(results) +
          "\n</tool_results>",
      },
    ],
  };
}
