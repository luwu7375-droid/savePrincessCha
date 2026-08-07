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

export async function getRemoteMcpToolDefinitions(context: McpToolContext) {
  const rows = selectRemoteMcpRows(
    await enabledRows(context),
    context.rawUserMessage,
  );
  return rows.map((row) => ({
    type: "function",
    function: {
      name: alias(row.connection.id, row.remote_name),
      description: `[用户启用的外部 MCP，只读且可自动调用] ${
        row.description || row.remote_name
      }`,
      parameters: row.input_schema || { type: "object", properties: {} },
    },
  }));
}

export function isRemoteMcpAlias(name: string) {
  return name.startsWith("mcp_");
}

export async function executeRemoteMcpTool(
  name: string,
  args: Record<string, unknown>,
  context: McpToolContext,
) {
  const rows = await enabledRows(context);
  const row = rows.find((candidate) =>
    alias(candidate.connection.id, candidate.remote_name) === name
  );
  if (!row) throw new Error("remote_mcp_tool_not_available");
  if (row.requires_confirmation || row.risk_level !== "read") {
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
