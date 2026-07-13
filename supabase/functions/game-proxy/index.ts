// Game Proxy Edge Function - MCP Client for CedarToy
// Handles all communication with https://toy.cedarstar.org/
// Provides: list_games, get_guide, play, account operations

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

    // Get or create MCP token for this user
    const mcpToken = await getOrCreateMCPToken(userId, supabaseClient);

    // Route to appropriate action
    let result;
    switch (action) {
      case "list_games":
        result = await listGames(mcpToken);
        break;
      case "get_guide":
        if (!game) {
          return new Response(
            JSON.stringify({ error: "game parameter required for get_guide" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        result = await getGuide(mcpToken, game);
        break;
      case "play":
        if (!game || !gameAction) {
          return new Response(
            JSON.stringify({ error: "game and gameAction parameters required for play" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        result = await playGame(mcpToken, game, gameAction, actionParams, slotId);
        break;
      case "account":
        result = await getAccount(mcpToken);
        break;
      case "register":
        result = await registerAccount(mcpToken);
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
 * Get or create MCP token for user
 * Stores token in user_metadata for persistence across sessions
 */
async function getOrCreateMCPToken(
  userId: string,
  supabaseClient: ReturnType<typeof createClient>,
): Promise<string> {
  // Try to get existing token from user metadata
  const { data: userData, error: userError } = await supabaseClient.auth.admin.getUserById(userId);

  if (userError) {
    console.error("Error fetching user:", userError);
    throw new Error("Failed to fetch user data");
  }

  const existingToken = userData.user.user_metadata?.cedartoy_mcp_token as string | undefined;

  if (existingToken) {
    return existingToken;
  }

  // Generate new token by registering with CedarToy
  const newToken = await registerNewToken();

  // Store in user metadata
  const { error: updateError } = await supabaseClient.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...userData.user.user_metadata,
      cedartoy_mcp_token: newToken,
    },
  });

  if (updateError) {
    console.error("Error storing MCP token:", updateError);
    throw new Error("Failed to store MCP token");
  }

  return newToken;
}

/**
 * Register new account with CedarToy and get token
 */
async function registerNewToken(): Promise<string> {
  const response = await fetch(`${CEDARTOY_BASE}/api/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to register with CedarToy: ${response.status}`);
  }

  const data = await response.json();
  return data.token as string;
}

/**
 * List all available games
 */
async function listGames(token: string): Promise<unknown> {
  const response = await fetch(`${CEDARTOY_BASE}/api/${token}/list_games`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`Failed to list games: ${response.status}`);
  }

  return await response.json();
}

/**
 * Get game guide
 */
async function getGuide(token: string, game: string): Promise<unknown> {
  const response = await fetch(`${CEDARTOY_BASE}/api/${token}/get_guide`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ game }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get guide: ${response.status}`);
  }

  return await response.json();
}

/**
 * Play game action
 */
async function playGame(
  token: string,
  game: string,
  action: string,
  params?: Record<string, unknown>,
  slotId?: number,
): Promise<unknown> {
  const body: Record<string, unknown> = {
    game,
    action,
  };

  if (params) {
    body.params = params;
  }

  if (slotId !== undefined) {
    body.slot_id = slotId;
  }

  const response = await fetch(`${CEDARTOY_BASE}/api/${token}/play`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to play game: ${response.status}`);
  }

  return await response.json();
}

/**
 * Get account info
 */
async function getAccount(token: string): Promise<unknown> {
  const response = await fetch(`${CEDARTOY_BASE}/api/${token}/account`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get account: ${response.status}`);
  }

  return await response.json();
}

/**
 * Register account (alternative flow)
 */
async function registerAccount(token: string): Promise<unknown> {
  const response = await fetch(`${CEDARTOY_BASE}/api/${token}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to register account: ${response.status}`);
  }

  return await response.json();
}
