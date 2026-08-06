export type McpTransport = "streamable_http";

export type RemoteMcpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpConnectionConfig = {
  endpoint: string;
  transport: McpTransport;
  headers?: Record<string, string>;
};

type RpcEnvelope = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

const PROTOCOL_VERSION = "2025-03-26";
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_CHARS = 200_000;

function assertSafeEndpoint(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("mcp_endpoint_must_use_https");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" || host === "0.0.0.0" || host === "::1" ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) throw new Error("mcp_private_endpoint_not_allowed");
  url.hash = "";
  return url.toString();
}

function parseSse(text: string): RpcEnvelope | null {
  const events = text.split(/\r?\n\r?\n/);
  for (const event of events) {
    const data = event.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data) as RpcEnvelope;
      if (parsed.result !== undefined || parsed.error) return parsed;
    } catch {
      // Ignore keep-alives and non-JSON SSE events.
    }
  }
  return null;
}

async function rpc(
  config: McpConnectionConfig,
  method: string,
  params: Record<string, unknown>,
  sessionId?: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ envelope: RpcEnvelope; sessionId?: string }> {
  if (config.transport !== "streamable_http") {
    throw new Error(`unsupported_mcp_transport:${config.transport}`);
  }
  const endpoint = assertSafeEndpoint(config.endpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(config.headers || {}),
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method,
        params,
      }),
    });
    const text = (await response.text()).slice(0, MAX_RESPONSE_CHARS);
    if (!response.ok) throw new Error(`mcp_http_${response.status}:${text.slice(0, 500)}`);
    const contentType = response.headers.get("content-type") || "";
    let envelope: RpcEnvelope | null = null;
    try {
      envelope = contentType.includes("text/event-stream")
        ? parseSse(text)
        : JSON.parse(text) as RpcEnvelope;
    } catch {
      throw new Error("mcp_invalid_json_response");
    }
    if (!envelope) throw new Error("mcp_empty_response");
    if (envelope.error) {
      throw new Error(`mcp_rpc_error:${envelope.error.code || "unknown"}:${envelope.error.message || "unknown"}`);
    }
    return {
      envelope,
      sessionId: response.headers.get("mcp-session-id") || sessionId,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`mcp_timeout_after_${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function initialize(config: McpConnectionConfig) {
  return await rpc(config, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "save-princess-cha", version: "1.0.0" },
  });
}

async function notifyInitialized(config: McpConnectionConfig, sessionId?: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(assertSafeEndpoint(config.endpoint), {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(config.headers || {}),
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
    });
    if (!response.ok && response.status !== 202) {
      throw new Error(`mcp_initialized_notification_http_${response.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverMcpTools(config: McpConnectionConfig): Promise<{
  serverInfo: { name?: string; version?: string };
  tools: RemoteMcpTool[];
}> {
  const init = await initialize(config);
  await notifyInitialized(config, init.sessionId);
  const initResult = (init.envelope.result || {}) as Record<string, unknown>;
  const listed = await rpc(config, "tools/list", {}, init.sessionId);
  const result = (listed.envelope.result || {}) as Record<string, unknown>;
  const tools = Array.isArray(result.tools) ? result.tools : [];
  return {
    serverInfo: (initResult.serverInfo || {}) as { name?: string; version?: string },
    tools: tools.filter((tool): tool is RemoteMcpTool =>
      !!tool && typeof tool === "object" && typeof (tool as RemoteMcpTool).name === "string"
    ),
  };
}

export async function callMcpTool(
  config: McpConnectionConfig,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const init = await initialize(config);
  await notifyInitialized(config, init.sessionId);
  const called = await rpc(config, "tools/call", { name, arguments: args }, init.sessionId);
  return called.envelope.result;
}
