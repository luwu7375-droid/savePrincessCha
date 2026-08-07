import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callMcpTool } from "./mcp-client.ts";
import type { McpToolContext } from "./mcp-registry.ts";
import { selectRemoteMcpRows } from "./remote-mcp-selector.ts";

type ToolRow = {
  remote_name: string;
  description: string;
  input_schema: Record<string, unknown>;
  risk_level: "read" | "write" | "high_risk";
  requires_confirmation: boolean;
  connection: {
    id: string;
    endpoint: string;
    transport: "streamable_http";
    headers: Record<string, string>;
    enabled: boolean;
  };
};

const MAX_REMOTE_RESULT_CHARS = 16_000;
const APPROVAL_TTL_MS = 5 * 60 * 1000;

function alias(connectionId: string, remoteName: string) {
  const safe = remoteName.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(
    0,
    38,
  );
  return `mcp_${connectionId.replace(/-/g, "").slice(0, 10)}_${safe}`.slice(
    0,
    64,
  );
}

async function enabledRows(context: McpToolContext): Promise<ToolRow[]> {
  if (!context.userId) return [];
  const db = createClient(context.supabaseUrl, context.serviceRoleKey);
  const { data, error } = await db.from("mcp_connection_tools")
    .select(
      "remote_name,description,input_schema,risk_level,requires_confirmation,connection:mcp_connections!inner(id,endpoint,transport,headers,enabled,user_id)",
    )
    .eq("enabled", true)
    .eq("connection.enabled", true)
    .eq("connection.user_id", context.userId);
  if (error) throw error;
  return (data || []) as unknown as ToolRow[];
}

export async function getRemoteMcpTools(
  context: McpToolContext,
  options: { includeConfirmationRequired?: boolean } = {},
) {
  return selectRemoteMcpRows(
    await enabledRows(context),
    context.rawUserMessage,
    options,
  ).map((row) => ({
    name: alias(row.connection.id, row.remote_name),
    remoteName: row.remote_name,
    description: row.description || row.remote_name,
    inputSchema: row.input_schema || { type: "object", properties: {} },
    riskLevel: row.risk_level,
    requiresConfirmation: row.requires_confirmation || row.risk_level !== "read",
  }));
}

export async function getRemoteMcpToolDefinitions(context: McpToolContext) {
  const tools = await getRemoteMcpTools(context);
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: `[用户启用的外部 MCP，只读且可自动调用] ${tool.description}`,
      parameters: tool.inputSchema,
    },
  }));
}

export function isRemoteMcpAlias(name: string) {
  return name.startsWith("mcp_");
}

export async function createRemoteMcpApproval(
  name: string,
  args: Record<string, unknown>,
  context: McpToolContext,
) {
  if (!context.userId || !context.conversationId) {
    throw new Error("remote_mcp_approval_requires_user_and_conversation");
  }
  const rows = await enabledRows(context);
  const row = rows.find((candidate) =>
    alias(candidate.connection.id, candidate.remote_name) === name
  );
  if (!row) throw new Error("remote_mcp_tool_not_available");
  if (!row.requires_confirmation && row.risk_level === "read") {
    throw new Error("remote_mcp_tool_does_not_require_confirmation");
  }
  const db = createClient(context.supabaseUrl, context.serviceRoleKey);
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS).toISOString();
  const { data, error } = await db.from("mcp_tool_approvals").insert({
    user_id: context.userId,
    conversation_id: context.conversationId,
    tool_alias: name,
    remote_name: row.remote_name,
    arguments: args,
    risk_level: row.risk_level,
    expires_at: expiresAt,
  }).select("id").single();
  if (error) throw error;
  return {
    id: data.id as string,
    toolName: row.remote_name,
    description: row.description || row.remote_name,
    arguments: args,
    riskLevel: row.risk_level,
    expiresAt,
  };
}

export async function executeApprovedRemoteMcpTool(
  approvalId: string,
  context: McpToolContext,
) {
  if (!context.userId || !context.conversationId) {
    throw new Error("remote_mcp_approval_requires_user_and_conversation");
  }
  const db = createClient(context.supabaseUrl, context.serviceRoleKey);
  const now = new Date().toISOString();
  const { data, error } = await db.from("mcp_tool_approvals")
    .update({ status: "executing", claimed_at: now })
    .eq("id", approvalId)
    .eq("user_id", context.userId)
    .eq("conversation_id", context.conversationId)
    .eq("status", "pending")
    .gt("expires_at", now)
    .select("tool_alias,remote_name,arguments,risk_level")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("remote_mcp_approval_invalid_expired_or_used");

  try {
    const content = await executeRemoteMcpTool(
      data.tool_alias,
      data.arguments || {},
      context,
      true,
    );
    await db.from("mcp_tool_approvals").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", approvalId).eq("status", "executing");
    return { name: data.remote_name as string, content };
  } catch (error) {
    await db.from("mcp_tool_approvals").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
    }).eq("id", approvalId).eq("status", "executing");
    throw error;
  }
}

export async function executeRemoteMcpTool(
  name: string,
  args: Record<string, unknown>,
  context: McpToolContext,
  confirmed = false,
) {
  const rows = await enabledRows(context);
  const row = rows.find((candidate) =>
    alias(candidate.connection.id, candidate.remote_name) === name
  );
  if (!row) throw new Error("remote_mcp_tool_not_available");
  if (!confirmed && (row.requires_confirmation || row.risk_level !== "read")) {
    throw new Error("remote_mcp_tool_requires_user_confirmation");
  }
  const result = await callMcpTool(
    {
      endpoint: row.connection.endpoint,
      transport: row.connection.transport,
      headers: row.connection.headers || {},
    },
    row.remote_name,
    args,
  );
  const text = typeof result === "string" ? result : JSON.stringify(result);
  return text.length > MAX_REMOTE_RESULT_CHARS
    ? `${text.slice(0, MAX_REMOTE_RESULT_CHARS)}\n[远程 MCP 结果过长，已截断]`
    : text;
}
