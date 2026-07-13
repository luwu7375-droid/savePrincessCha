// Game Proxy Edge Function - HTTP-based MCP Client for CedarToy
// Uses direct HTTP calls to communicate with https://toy.cedarstar.org/
// (SSE transport not available in Deno edge functions)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const CEDARTOY_BASE = "https://toy.cedarstar.org";
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_CALLS = 60;

type GameProxyRequest = {
  action: "list_games" | "get_guide" | "play" | "account" | "register";
  userId: string;
  game?: string;
  gameAction?: string;
  actionParams?: Record<string, unknown>;
  slotId?: number;
};

type RateLimitEntry = {
  calls: number;
  windowStart: number;
};

// In-memory rate limiting (per-instance, resets on cold start)
const rateLimitMap = new Map<string, RateLimitEntry>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json() as GameProxyRequest;
    const { action, userId, game, gameAction, actionParams, slotId } = body;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Rate limiting check
    const rateLimitError = checkRateLimit(userId);
    if (rateLimitError) {
      return new Response(
        JSON.stringify({ error: rateLimitError }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get credentials for CedarToy
    const credentials = await getOrCreateCredentials(userId, supabaseClient);

    // Route to appropriate action
    let result;
    switch (action) {
      case "list_games":
        result = await callCedarToyTool("list_games", {}, credentials);
        break;
      case "get_guide":
        if (!game) {
          return new Response(
            JSON.stringify({ error: "game parameter required for get_guide" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        result = await callCedarToyTool("get_guide", { game }, credentials);
        break;
      case "play":
        if (!game || !gameAction) {
          return new Response(
            JSON.stringify({ error: "game and gameAction parameters required for play" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const playParams: Record<string, unknown> = {
          game,
          action: gameAction,
        };
        if (actionParams) {
          playParams.params = actionParams;
        }
        if (slotId !== undefined) {
          playParams.slot_id = slotId;
        }
        result = await callCedarToyTool("play", playParams, credentials);
        break;
      case "account":
        result = await callCedarToyTool("account", {}, credentials);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Game proxy error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

/**
 * Rate limiting: 60 calls per minute per user
 */
function checkRateLimit(userId: string): string | null {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    // Start new window
    rateLimitMap.set(userId, { calls: 1, windowStart: now });
    return null;
  }

  if (entry.calls >= RATE_LIMIT_MAX_CALLS) {
    return `Rate limit exceeded: ${RATE_LIMIT_MAX_CALLS} calls per minute`;
  }

  entry.calls++;
  return null;
}

/**
 * Call CedarToy MCP tool via HTTP POST
 * Uses JSON-RPC 2.0 format for MCP protocol
 */
async function callCedarToyTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
  credentials: { username: string; password: string },
): Promise<unknown> {
  // MCP JSON-RPC 2.0 request format
  const mcpRequest = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: toolName,
      arguments: toolArgs,
    },
    id: Date.now(),
  };

  const response = await fetch(CEDARTOY_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Basic auth for CedarToy
      "Authorization": `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`,
    },
    body: JSON.stringify(mcpRequest),
  });

  if (!response.ok) {
    throw new Error(`CedarToy API error: ${response.status} ${response.statusText}`);
  }

  const mcpResponse = await response.json();

  // Handle JSON-RPC error
  if (mcpResponse.error) {
    throw new Error(`CedarToy tool error: ${mcpResponse.error.message || JSON.stringify(mcpResponse.error)}`);
  }

  return mcpResponse.result;
}

/**
 * Get or create CedarToy credentials for user
 * Stores in a simple JSONB field in app_settings for MVP
 */
async function getOrCreateCredentials(
  userId: string,
  supabaseClient: ReturnType<typeof createClient>,
): Promise<{ username: string; password: string; token?: string }> {
  // For MVP: Use hardcoded credentials from environment or user-provided
  // In production, each user would have their own CedarToy account
  const username = Deno.env.get("CEDARTOY_USERNAME") ?? "KK_";
  const password = Deno.env.get("CEDARTOY_PASSWORD") ?? "1234wmc";

  return { username, password };
}
