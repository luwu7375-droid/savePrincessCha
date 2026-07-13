// Game Proxy Edge Function - authenticated HTTP MCP client for CedarToy.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const CEDARTOY_BASE = "https://toy.cedarstar.org";
const CEDARTOY_TIMEOUT_MS = 8_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_CALLS = 30;

type GameProxyRequest = {
  action: "list_games" | "get_guide" | "play" | "account";
  userId?: string;
  game?: string;
  gameAction?: string;
  actionParams?: Record<string, unknown>;
  slotId?: number;
};

type RateLimitEntry = {
  calls: number;
  windowStart: number;
};

const rateLimitMap = new Map<string, RateLimitEntry>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearerToken(req: Request): string {
  const auth = req.headers.get("Authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

async function authenticate(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{ internal: boolean; userId: string | null } | Response> {
  const token = bearerToken(req);
  if (!token) return json({ error: "unauthorized" }, 401);

  // Chat calls this function server-to-server with the service role key.
  if (token === serviceRoleKey) {
    return { internal: true, userId: null };
  }

  const client = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.id) return json({ error: "unauthorized" }, 401);
  return { internal: false, userId: data.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("DB_URL") || Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey =
    Deno.env.get("DB_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "";
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "supabase_server_config_missing" }, 503);
  }

  const auth = await authenticate(req, supabaseUrl, serviceRoleKey);
  if (auth instanceof Response) return auth;

  let body: GameProxyRequest;
  try {
    body = await req.json() as GameProxyRequest;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const requestedUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!auth.internal && requestedUserId && requestedUserId !== auth.userId) {
    return json({ error: "forbidden" }, 403);
  }
  const effectiveUserId = auth.internal
    ? (requestedUserId || "server")
    : auth.userId as string;

  const rateLimitError = checkRateLimit(effectiveUserId);
  if (rateLimitError) return json({ error: rateLimitError }, 429);

  const username = Deno.env.get("CEDARTOY_USERNAME") || "";
  const password = Deno.env.get("CEDARTOY_PASSWORD") || "";
  if (!username || !password) {
    return json({ error: "cedartoy_credentials_not_configured" }, 503);
  }
  const credentials = { username, password };

  try {
    let result: unknown;
    switch (body.action) {
      case "list_games":
        result = await callCedarToyTool("list_games", {}, credentials);
        break;

      case "get_guide":
        if (!body.game) return json({ error: "game_required" }, 400);
        result = await callCedarToyTool("get_guide", { game: body.game }, credentials);
        break;

      case "play": {
        if (!body.game || !body.gameAction) {
          return json({ error: "game_and_gameAction_required" }, 400);
        }
        const playParams: Record<string, unknown> = {
          game: body.game,
          action: body.gameAction,
        };
        if (body.actionParams) playParams.params = body.actionParams;
        if (body.slotId !== undefined) playParams.slot_id = body.slotId;
        result = await callCedarToyTool("play", playParams, credentials);
        break;
      }

      case "account":
        result = await callCedarToyTool("account", {}, credentials);
        break;

      default:
        return json({ error: "unknown_action" }, 400);
    }

    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[game-proxy] CedarToy call failed", {
      action: body.action,
      error: message.slice(0, 300),
    });
    const timeout = message.startsWith("cedartoy_timeout");
    return json({ error: timeout ? "cedartoy_timeout" : "cedartoy_upstream_error" }, timeout ? 504 : 502);
  }
});

function checkRateLimit(userId: string): string | null {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userId, { calls: 1, windowStart: now });
    return null;
  }
  if (entry.calls >= RATE_LIMIT_MAX_CALLS) {
    return `rate_limit_exceeded_${RATE_LIMIT_MAX_CALLS}_per_minute`;
  }
  entry.calls += 1;
  return null;
}

async function callCedarToyTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
  credentials: { username: string; password: string },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CEDARTOY_TIMEOUT_MS);
  try {
    const response = await fetch(CEDARTOY_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: toolName, arguments: toolArgs },
        id: crypto.randomUUID(),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`cedartoy_http_${response.status}`);
    }
    const mcpResponse = await response.json();
    if (mcpResponse?.error) {
      throw new Error(
        `cedartoy_rpc_error: ${String(mcpResponse.error.message || "unknown").slice(0, 200)}`,
      );
    }
    return mcpResponse?.result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`cedartoy_timeout_after_${CEDARTOY_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
