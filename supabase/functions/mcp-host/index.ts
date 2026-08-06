import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";
import { callMcpTool, discoverMcpTools, type McpTransport } from "../_shared/mcp-client.ts";

type RequestBody = {
  action?: "list" | "save" | "delete" | "discover" | "set_tool" | "test_tool";
  id?: string;
  name?: string;
  endpoint?: string;
  transport?: McpTransport;
  headers?: Record<string, string>;
  enabled?: boolean;
  toolName?: string;
  riskLevel?: "read" | "write" | "high_risk";
  requiresConfirmation?: boolean;
  arguments?: Record<string, unknown>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "X-MCP-Host-Version": "2026-08-06-v1" },
  });
}

function token(req: Request) {
  const value = req.headers.get("Authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

function cleanHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-z0-9-]{1,64}$/i.test(key) || typeof raw !== "string" || raw.length > 4096) continue;
    if (/^(host|content-length|mcp-session-id)$/i.test(key)) continue;
    output[key] = raw;
  }
  return output;
}

async function ownedConnection(db: SupabaseClient, userId: string, id: string) {
  const { data, error } = await db.from("mcp_connections").select("*")
    .eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("mcp_connection_not_found");
  return data;
}

function publicConnection(row: Record<string, unknown>, tools: unknown[] = []) {
  const headers = row.headers && typeof row.headers === "object" ? row.headers as Record<string, unknown> : {};
  return {
    id: row.id, name: row.name, endpoint: row.endpoint, transport: row.transport,
    enabled: row.enabled, status: row.status, server_name: row.server_name,
    server_version: row.server_version, last_error: row.last_error,
    last_connected_at: row.last_connected_at, header_names: Object.keys(headers), tools,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const supabaseUrl = Deno.env.get("DB_URL") || Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("DB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "server_config_missing" }, 503);
  const accessToken = token(req);
  const db = createClient(supabaseUrl, serviceKey);
  const { data: auth, error: authError } = await db.auth.getUser(accessToken);
  if (authError || !auth.user?.id) return json({ error: "unauthorized" }, 401);
  const userId = auth.user.id;
  let body: RequestBody;
  try { body = await req.json() as RequestBody; } catch { return json({ error: "invalid_json" }, 400); }

  try {
    if (body.action === "list") {
      const { data: connections, error } = await db.from("mcp_connections").select("*")
        .eq("user_id", userId).order("created_at");
      if (error) throw error;
      const ids = (connections || []).map((row) => row.id);
      const { data: tools, error: toolError } = ids.length
        ? await db.from("mcp_connection_tools").select("*").in("connection_id", ids).order("remote_name")
        : { data: [], error: null };
      if (toolError) throw toolError;
      return json({ ok: true, connections: (connections || []).map((row) =>
        publicConnection(row, (tools || []).filter((tool) => tool.connection_id === row.id))
      ) });
    }

    if (body.action === "save") {
      const name = String(body.name || "").trim();
      const endpoint = String(body.endpoint || "").trim();
      if (!name || !endpoint) return json({ error: "name_and_endpoint_required" }, 400);
      const existing = body.id ? await ownedConnection(db, userId, body.id) : null;
      const suppliedHeaders = cleanHeaders(body.headers);
      const headers = body.headers !== undefined ? suppliedHeaders : (existing?.headers || {});
      const values = {
        user_id: userId, name, endpoint,
        transport: body.transport || "streamable_http", headers,
        enabled: body.enabled !== false, status: "unverified", updated_at: new Date().toISOString(),
      };
      const query = existing
        ? db.from("mcp_connections").update(values).eq("id", existing.id).eq("user_id", userId).select("*").single()
        : db.from("mcp_connections").insert(values).select("*").single();
      const { data, error } = await query;
      if (error) throw error;
      return json({ ok: true, connection: publicConnection(data) });
    }

    if (!body.id) return json({ error: "connection_id_required" }, 400);
    const connection = await ownedConnection(db, userId, body.id);

    if (body.action === "delete") {
      const { error } = await db.from("mcp_connections").delete().eq("id", connection.id).eq("user_id", userId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "discover") {
      try {
        const discovered = await discoverMcpTools({
          endpoint: connection.endpoint, transport: connection.transport, headers: connection.headers || {},
        });
        for (const tool of discovered.tools) {
          const { error } = await db.from("mcp_connection_tools").upsert({
            connection_id: connection.id, remote_name: tool.name,
            description: tool.description || "", input_schema: tool.inputSchema || { type: "object", properties: {} },
            discovered_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }, { onConflict: "connection_id,remote_name", ignoreDuplicates: false });
          if (error) throw error;
        }
        await db.from("mcp_connections").update({
          status: "connected", server_name: discovered.serverInfo.name || null,
          server_version: discovered.serverInfo.version || null, last_error: null,
          last_connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", connection.id);
        return json({ ok: true, server: discovered.serverInfo, tools: discovered.tools });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await db.from("mcp_connections").update({ status: "error", last_error: message.slice(0, 1000) }).eq("id", connection.id);
        throw error;
      }
    }

    if (body.action === "set_tool") {
      const toolName = String(body.toolName || "").trim();
      if (!toolName) return json({ error: "tool_name_required" }, 400);
      const { data, error } = await db.from("mcp_connection_tools").update({
        enabled: body.enabled === true,
        risk_level: body.riskLevel || "write",
        requires_confirmation: body.riskLevel === "read" ? body.requiresConfirmation === true : true,
        updated_at: new Date().toISOString(),
      }).eq("connection_id", connection.id).eq("remote_name", toolName).select("*").single();
      if (error) throw error;
      return json({ ok: true, tool: data });
    }

    if (body.action === "test_tool") {
      const toolName = String(body.toolName || "").trim();
      const { data: tool, error } = await db.from("mcp_connection_tools").select("*")
        .eq("connection_id", connection.id).eq("remote_name", toolName).single();
      if (error || !tool) return json({ error: "tool_not_found" }, 404);
      const result = await callMcpTool({
        endpoint: connection.endpoint, transport: connection.transport, headers: connection.headers || {},
      }, toolName, body.arguments && typeof body.arguments === "object" ? body.arguments : {});
      return json({ ok: true, result });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("[mcp-host]", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
