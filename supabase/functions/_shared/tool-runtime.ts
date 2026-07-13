import {
  type ProviderConfig,
  type TierProviders,
  toCompletionsUrl,
} from "./model-client.ts";

type ToolContext = {
  supabaseUrl: string;
  serviceRoleKey: string;
  authorization: string;
  userId?: string;
  conversationId?: string;
  rawUserMessage: string;
};

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

const TOOL_TIMEOUT_MS = 30_000;
const MAX_TOOL_RESULT_CHARS = 16_000;
const MAX_TOOL_CALLS_PER_TURN = 2;

export const CHAT_TOOLS = [
  {
    type: "function",
    function: {
      name: "web_read_url",
      description: "读取用户明确提供的公开网页 URL，并提取和总结与问题相关的内容。只能读取 URL，不能搜索互联网。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "用户消息中出现的 http 或 https URL" },
          question: { type: "string", description: "用户希望从网页中了解的问题" },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cedar_list_games",
      description: "列出 CedarToy 当前支持的游戏。只读，不创建房间，也不开始游戏。",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cedar_get_guide",
      description: "查询某个 CedarToy 游戏的玩法说明。只读，不创建房间，也不开始游戏。",
      parameters: {
        type: "object",
        properties: {
          game: { type: "string", description: "游戏名称或游戏标识" },
        },
        required: ["game"],
        additionalProperties: false,
      },
    },
  },
] as const;

export function isToolRuntimeCandidate(message: string): boolean {
  const text = String(message || "").trim();
  if (!text) return false;
  const hasUrl = /https?:\/\/[^\s<>"']+/i.test(text);
  const asksToReadUrl = /(看看|读取|读一下|总结|分析|打开|这个链接|这个网页|网址|链接)/i.test(text);
  const asksAboutGames = /(cedar\s*toy|cedartoy|海龟汤|你画我猜|五子棋|狼人杀|有什么游戏|游戏列表|游戏规则|怎么玩|想玩游戏|玩个游戏)/i.test(text);
  return (hasUrl && asksToReadUrl) || asksAboutGames;
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

function compactResult(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return text.slice(0, MAX_TOOL_RESULT_CHARS) + "\n[工具结果过长，已截断]";
}

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      // Keep non-JSON response text for diagnostics.
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${compactResult(data)}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function executeTool(
  call: ToolCall,
  context: ToolContext,
): Promise<string> {
  const args = safeJsonObject(call.function.arguments);
  switch (call.function.name) {
    case "web_read_url": {
      if (!context.authorization.toLowerCase().startsWith("bearer ")) {
        throw new Error("网页读取需要有效的用户登录令牌");
      }
      const url = String(args.url || "").trim();
      if (!/^https?:\/\//i.test(url)) throw new Error("无效的网页 URL");
      const question = String(args.question || context.rawUserMessage || "").trim();
      const data = await fetchJson(
        `${context.supabaseUrl}/functions/v1/web?action=summarize_url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: context.authorization,
          },
          body: JSON.stringify({
            url,
            question,
            saveLog: true,
            userId: context.userId || null,
            conversationId: context.conversationId || null,
          }),
        },
      );
      return compactResult(data);
    }
    case "cedar_list_games": {
      const data = await fetchJson(
        `${context.supabaseUrl}/functions/v1/game-proxy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${context.serviceRoleKey}`,
          },
          body: JSON.stringify({ action: "list_games" }),
        },
      );
      return compactResult(data);
    }
    case "cedar_get_guide": {
      const game = String(args.game || "").trim();
      if (!game) throw new Error("缺少游戏名称");
      const data = await fetchJson(
        `${context.supabaseUrl}/functions/v1/game-proxy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${context.serviceRoleKey}`,
          },
          body: JSON.stringify({ action: "get_guide", game }),
        },
      );
      return compactResult(data);
    }
    default:
      throw new Error(`不允许调用工具：${call.function.name}`);
  }
}

async function requestToolPlan(
  provider: ProviderConfig,
  messages: unknown[],
): Promise<ToolCall[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  try {
    const response = await fetch(toCompletionsUrl(provider.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        stream: false,
        max_tokens: Math.min(provider.maxTokens || 512, 512),
        tools: CHAT_TOOLS,
        tool_choice: "auto",
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`tool planning HTTP ${response.status}: ${detail}`);
    }
    const data = await response.json();
    const calls = data?.choices?.[0]?.message?.tool_calls;
    if (!Array.isArray(calls) || calls.length === 0) return null;
    return calls
      .filter((item: unknown) => {
        const c = item as ToolCall;
        return c?.type === "function" &&
          typeof c?.id === "string" &&
          typeof c?.function?.name === "string" &&
          typeof c?.function?.arguments === "string";
      })
      .slice(0, MAX_TOOL_CALLS_PER_TURN);
  } finally {
    clearTimeout(timer);
  }
}

export async function prepareToolMessages(params: {
  providers: TierProviders;
  messages: unknown[];
  context: ToolContext;
}): Promise<ToolPlanResult> {
  const { providers, messages, context } = params;
  if (!isToolRuntimeCandidate(context.rawUserMessage)) {
    return { messages, used: false, names: [] };
  }

  let calls: ToolCall[] | null = null;
  let lastError: unknown = null;
  const candidates = [providers.primary, providers.fallback].filter(Boolean) as ProviderConfig[];
  for (const provider of candidates) {
    try {
      calls = await requestToolPlan(provider, messages);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      console.warn("[tool-runtime] provider does not support tool planning", {
        provider: provider.provider,
        model: provider.model,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (lastError || !calls?.length) {
    return { messages, used: false, names: [] };
  }

  const names: string[] = [];
  const toolMessages: unknown[] = [];
  for (const call of calls) {
    names.push(call.function.name);
    let content: string;
    try {
      content = await executeTool(call, context);
    } catch (error) {
      content = JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    toolMessages.push({
      role: "tool",
      tool_call_id: call.id,
      name: call.function.name,
      content,
    });
  }

  console.log("[tool-runtime] completed", { names, count: names.length });
  return {
    used: true,
    names,
    messages: [
      ...messages,
      { role: "assistant", content: null, tool_calls: calls },
      ...toolMessages,
    ],
  };
}
