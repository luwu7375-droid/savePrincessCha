export type McpToolContext = {
  supabaseUrl: string;
  serviceRoleKey: string;
  authorization: string;
  userId?: string;
  conversationId?: string;
  rawUserMessage: string;
};

export type McpToolDefinition = {
  name: string;
  description: string;
  source: "internal" | "mcp";
  readOnly: boolean;
  requiresConfirmation: boolean;
  timeoutMs: number;
  inputSchema: Record<string, unknown>;
};

const MAX_TOOL_RESULT_CHARS = 16_000;

const definitions: McpToolDefinition[] = [
  {
    name: "web_read_url",
    description: "读取用户明确提供的公开网页 URL，返回页面标题、正文和摘要素材。只能读取 URL，不能搜索互联网。",
    source: "internal",
    readOnly: true,
    requiresConfirmation: false,
    timeoutMs: 12_000,
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "用户消息中出现的 http 或 https URL" },
        question: { type: "string", description: "用户希望从网页中了解的问题" },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "cedar_list_games",
    description: "通过 CedarToy MCP 列出当前支持的游戏。只读，不创建房间，也不开始游戏。",
    source: "mcp",
    readOnly: true,
    requiresConfirmation: false,
    timeoutMs: 8_000,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "cedar_get_guide",
    description: "通过 CedarToy MCP 查询某个游戏的玩法说明。只读，不创建房间，也不开始游戏。",
    source: "mcp",
    readOnly: true,
    requiresConfirmation: false,
    timeoutMs: 8_000,
    inputSchema: {
      type: "object",
      properties: {
        game: { type: "string", description: "游戏名称或游戏标识" },
      },
      required: ["game"],
      additionalProperties: false,
    },
  },
  {
    name: "cedar_play",
    description: "通过 CedarToy MCP 执行游戏操作（仅限已绑定的小机账号）。",
    source: "mcp",
    readOnly: false,
    requiresConfirmation: true,
    timeoutMs: 10_000,
    inputSchema: {
      type: "object",
      properties: {
        game: { type: "string", description: "游戏名称或游戏标��" },
        gameAction: { type: "string", description: "游戏操作名称" },
        actionParams: { type: "object", description: "操作参数（可选）" },
        slotId: { type: "number", description: "存档位（可选）" },
      },
      required: ["game", "gameAction"],
      additionalProperties: false,
    },
  },
];

const registry = new Map(definitions.map((tool) => [tool.name, tool]));

export function listMcpTools(): McpToolDefinition[] {
  return definitions.map((tool) => ({ ...tool }));
}

export function getMcpTool(name: string): McpToolDefinition | null {
  return registry.get(name) || null;
}

export function getOpenAiToolDefinitions(): Array<Record<string, unknown>> {
  return definitions.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

function compactResult(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return text.slice(0, MAX_TOOL_RESULT_CHARS) + "\n[工具结果过长，已截断]";
}

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      // Preserve non-JSON response for diagnostics.
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${compactResult(data).slice(0, 800)}`);
    }
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`tool_timeout_after_${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function stringArg(args: Record<string, unknown>, key: string): string {
  return typeof args[key] === "string" ? String(args[key]).trim() : "";
}

export async function executeMcpTool(
  name: string,
  args: Record<string, unknown>,
  context: McpToolContext,
): Promise<string> {
  const tool = getMcpTool(name);
  if (!tool) throw new Error(`tool_not_registered: ${name}`);
  if (!tool.readOnly || tool.requiresConfirmation) {
    throw new Error(`tool_not_allowed_without_confirmation: ${name}`);
  }

  switch (name) {
    case "web_read_url": {
      if (!context.authorization.toLowerCase().startsWith("bearer ")) {
        throw new Error("web_read_url_requires_user_auth");
      }
      const url = stringArg(args, "url");
      if (!/^https?:\/\//i.test(url)) throw new Error("invalid_web_url");
      const data = await fetchJson(
        `${context.supabaseUrl}/functions/v1/web?action=read_url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: context.authorization,
          },
          body: JSON.stringify({
            url,
            saveLog: true,
            userId: context.userId || null,
            conversationId: context.conversationId || null,
          }),
        },
        tool.timeoutMs,
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
          body: JSON.stringify({
            action: "list_games",
            userId: context.userId || "anon",
          }),
        },
        tool.timeoutMs,
      );
      return compactResult(data);
    }

    case "cedar_get_guide": {
      const game = stringArg(args, "game");
      if (!game) throw new Error("game_required");
      const data = await fetchJson(
        `${context.supabaseUrl}/functions/v1/game-proxy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${context.serviceRoleKey}`,
          },
          body: JSON.stringify({
            action: "get_guide",
            game,
            userId: context.userId || "anon",
          }),
        },
        tool.timeoutMs,
      );
      return compactResult(data);
    }

    case "cedar_play": {
      const game = stringArg(args, "game");
      const gameAction = stringArg(args, "gameAction");
      if (!game || !gameAction) throw new Error("game_and_gameAction_required");
      const actionParams = args.actionParams && typeof args.actionParams === "object"
        ? args.actionParams as Record<string, unknown>
        : undefined;
      const slotId = typeof args.slotId === "number" ? args.slotId : undefined;
      const data = await fetchJson(
        `${context.supabaseUrl}/functions/v1/game-proxy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${context.serviceRoleKey}`,
          },
          body: JSON.stringify({
            action: "play",
            game,
            gameAction,
            actionParams,
            slotId,
            userId: context.userId || "anon",
          }),
        },
        tool.timeoutMs,
      );
      return compactResult(data);
    }

    default:
      throw new Error(`tool_executor_missing: ${name}`);
  }
}
