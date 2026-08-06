import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  createGameSession,
  getActiveSession,
  recordAction,
  updateGameState,
} from "./game-session-manager.ts";

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
    description: "通过已绑定的小机账号执行 CedarToy 游戏操作。创建或加入房间、开始普通游戏、查询状态和进行回合操作无需用户逐步确认。参数必须来自游戏攻略或上游返回，不能编造。",
    source: "mcp",
    readOnly: false,
    requiresConfirmation: false,
    timeoutMs: 10_000,
    inputSchema: {
      type: "object",
      properties: {
        game: { type: "string", description: "游戏名称或游戏标识" },
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

type CedarSessionState = {
  success: boolean | null;
  room_id: string | null;
  session_id: string | null;
  game_id: string | null;
  status: string;
};

function extractCedarSessionState(value: unknown): CedarSessionState {
  const state: CedarSessionState = {
    success: null,
    room_id: null,
    session_id: null,
    game_id: null,
    status: "active",
  };
  const seen = new Set<unknown>();
  const aliases: Record<"room_id" | "session_id" | "game_id", string[]> = {
    room_id: ["room_id", "roomId", "room"],
    session_id: ["session_id", "sessionId"],
    game_id: ["game_id", "gameId"],
  };

  const visit = (item: unknown, depth = 0): void => {
    if (depth > 8 || item === null || item === undefined || seen.has(item)) return;
    if (typeof item === "string") {
      try {
        visit(JSON.parse(item), depth + 1);
      } catch {
        // CedarToy also returns human-readable content; it is not session state.
      }
      return;
    }
    if (typeof item !== "object") return;
    seen.add(item);
    if (Array.isArray(item)) {
      item.forEach((child) => visit(child, depth + 1));
      return;
    }
    const record = item as Record<string, unknown>;
    if (state.success === null) {
      if (typeof record.success === "boolean") state.success = record.success;
      else if (typeof record.ok === "boolean") state.success = record.ok;
      else if (record.isError === true) state.success = false;
    }
    for (const [target, keys] of Object.entries(aliases) as Array<[
      keyof typeof aliases,
      string[],
    ]>) {
      if (state[target]) continue;
      const found = keys.map((key) => record[key]).find((candidate) =>
        typeof candidate === "string" || typeof candidate === "number"
      );
      if (found !== undefined) state[target] = String(found);
    }
    const rawStatus = record.status ?? record.state ?? record.game_status;
    if (typeof rawStatus === "string" && rawStatus.trim()) {
      state.status = rawStatus.trim().toLowerCase();
    }
    Object.values(record).forEach((child) => visit(child, depth + 1));
  };
  visit(value);
  return state;
}

function localSessionStatus(status: string): "active" | "paused" | "completed" | "abandoned" {
  if (/completed|complete|finished|ended|success|won|lost/.test(status)) return "completed";
  if (/paused/.test(status)) return "paused";
  if (/abandoned|cancelled|canceled|closed|expired/.test(status)) return "abandoned";
  return "active";
}

async function persistCedarPlaySession(
  context: McpToolContext,
  game: string,
  gameAction: string,
  actionParams: Record<string, unknown> | undefined,
  result: unknown,
): Promise<void> {
  if (!context.userId) return;
  const cedarState = extractCedarSessionState(result);
  if (cedarState.success === false) return;
  const status = localSessionStatus(cedarState.status);
  let session = await getActiveSession(
    context.userId,
    context.supabaseUrl,
    context.serviceRoleKey,
  );

  if (session && session.game_name !== game) {
    const supabase = createClient(context.supabaseUrl, context.serviceRoleKey);
    await supabase.from("game_sessions").update({
      status: "abandoned",
      ended_at: new Date().toISOString(),
    }).eq("id", session.id);
    session = null;
  }
  if (!session) {
    session = await createGameSession(
      context.userId,
      game,
      game,
      context.supabaseUrl,
      context.serviceRoleKey,
    );
  }

  const previous = session.current_state || {};
  await updateGameState(session.id, {
    ...previous,
    room_id: cedarState.room_id ?? previous.room_id ?? null,
    session_id: cedarState.session_id ?? previous.session_id ?? null,
    game_id: cedarState.game_id ?? previous.game_id ?? game,
    status: cedarState.status,
    conversation_id: context.conversationId || previous.conversation_id || null,
    last_action: gameAction,
    last_action_params: actionParams || {},
    last_response: result,
  }, context.supabaseUrl, context.serviceRoleKey);
  await recordAction(
    session.id,
    gameAction,
    result,
    { background: false },
    context.supabaseUrl,
    context.serviceRoleKey,
  );

  if (status !== "active") {
    const supabase = createClient(context.supabaseUrl, context.serviceRoleKey);
    await supabase.from("game_sessions").update({
      status,
      ended_at: status === "completed" || status === "abandoned"
        ? new Date().toISOString()
        : null,
    }).eq("id", session.id);
  }
}

export async function executeMcpTool(
  name: string,
  args: Record<string, unknown>,
  context: McpToolContext,
): Promise<string> {
  const tool = getMcpTool(name);
  if (!tool) throw new Error(`tool_not_registered: ${name}`);
  if (tool.requiresConfirmation) {
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
      let game = stringArg(args, "game");
      const gameAction = stringArg(args, "gameAction");
      let actionParams = args.actionParams && typeof args.actionParams === "object"
        ? args.actionParams as Record<string, unknown>
        : undefined;
      const continuing = /^(继续|接着|下一回合|continue|next)$/i.test(
        context.rawUserMessage.trim(),
      );
      if (continuing && context.userId) {
        const active = await getActiveSession(
          context.userId,
          context.supabaseUrl,
          context.serviceRoleKey,
        );
        if (!active) throw new Error("cedar_active_session_not_found");
        game = active.game_name;
        const saved = active.current_state || {};
        actionParams = {
          room_id: saved.room_id,
          session_id: saved.session_id,
          game_id: saved.game_id,
          ...actionParams,
        };
      }
      if (!game || !gameAction) throw new Error("game_and_gameAction_required");
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
      await persistCedarPlaySession(context, game, gameAction, actionParams, data);
      return compactResult(data);
    }

    default:
      throw new Error(`tool_executor_missing: ${name}`);
  }
}
