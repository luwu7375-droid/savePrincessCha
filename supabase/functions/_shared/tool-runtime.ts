import type { TierProviders } from "./model-client.ts";
import {
  executeMcpTool,
  getOpenAiToolDefinitions,
  type McpToolContext,
} from "./mcp-registry.ts";

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

export function isToolRuntimeCandidate(message: string): boolean {
  const text = String(message || "").trim();
  if (!text) return false;
  const hasUrl = /https?:\/\/[^\s<>"']+/i.test(text);
  const asksAboutGames =
    /(cedar\s*toy|cedartoy|海龟汤|你画我猜|五子棋|狼人杀|有什么游戏|游戏列表|游戏规则|怎么玩|想玩游戏|玩个游戏)/i
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
