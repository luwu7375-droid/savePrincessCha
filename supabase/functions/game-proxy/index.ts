// Authenticated CedarToy MCP client.
// Human users log in on CedarToy themselves. This function creates and stores
// one server-managed machine identity per SavePrincess user, then exposes its
// binding code so the human can bind that machine in CedarToy.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const CEDARTOY_BASE = "https://toy.cedarstar.org";
const CEDARTOY_TIMEOUT_MS = 8_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_CALLS = 30;
const TOOL_CACHE_MS = 5 * 60_000;

type GameProxyAction =
  | "machine_status"
  | "ensure_machine"
  | "refresh_binding"
  | "list_games"
  | "get_guide"
  | "play"
  | "account";

type GameProxyRequest = {
  action: GameProxyAction;
  userId?: string;
  game?: string;
  gameAction?: string;
  actionParams?: Record<string, unknown>;
  slotId?: number;
};

type MachineRow = {
  user_id: string;
  machine_username: string;
  machine_id?: string | null;
  binding_code?: string | null;
  status: "unregistered" | "pending_binding" | "bound" | "error";
  registration_tool?: string | null;
  account_metadata?: Record<string, unknown> | null;
  last_error?: string | null;
  last_checked_at?: string | null;
};

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, {
      type?: string;
      description?: string;
      enum?: unknown[];
      default?: unknown;
    }>;
    required?: string[];
  };
};

type MachineCredentials = {
  username: string;
  password: string;
};

type RateLimitEntry = {
  calls: number;
  windowStart: number;
};

const rateLimitMap = new Map<string, RateLimitEntry>();
let toolCache: { tools: McpTool[]; expiresAt: number } | null = null;

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
  if (token === serviceRoleKey) return { internal: true, userId: null };

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
  const machineSecret = Deno.env.get("CEDARTOY_MACHINE_SECRET") || "";

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "supabase_server_config_missing" }, 503);
  }
  if (!machineSecret) {
    return json({ error: "cedartoy_machine_secret_not_configured" }, 503);
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
    ? requestedUserId
    : auth.userId as string;
  if (!effectiveUserId) return json({ error: "user_id_required" }, 400);

  const rateLimitError = checkRateLimit(effectiveUserId);
  if (rateLimitError) return json({ error: rateLimitError }, 429);

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    switch (body.action) {
      case "machine_status": {
        const row = await getMachineRow(supabase, effectiveUserId);
        return json({ ok: true, machine: publicMachineState(row) });
      }

      case "ensure_machine": {
        const row = await ensureMachineAccount(
          supabase,
          effectiveUserId,
          machineSecret,
        );
        return json({ ok: true, machine: publicMachineState(row) });
      }

      case "refresh_binding":
      case "account": {
        const row = await refreshMachineAccount(
          supabase,
          effectiveUserId,
          machineSecret,
        );
        return json({ ok: true, machine: publicMachineState(row) });
      }

      case "list_games": {
        const credentials = await requireMachineCredentials(
          supabase,
          effectiveUserId,
          machineSecret,
        );
        return json(await callTool("list_games", {}, credentials));
      }

      case "get_guide": {
        if (!body.game) return json({ error: "game_required" }, 400);
        const credentials = await requireMachineCredentials(
          supabase,
          effectiveUserId,
          machineSecret,
        );
        return json(await callTool("get_guide", { game: body.game }, credentials));
      }

      case "play": {
        if (!body.game || !body.gameAction) {
          return json({ error: "game_and_gameAction_required" }, 400);
        }
        const row = await getMachineRow(supabase, effectiveUserId);
        if (!row || row.status !== "bound") {
          return json({
            error: "machine_not_bound",
            machine: publicMachineState(row),
          }, 409);
        }
        const credentials = await deriveCredentials(effectiveUserId, machineSecret);
        const playParams: Record<string, unknown> = {
          game: body.game,
          action: body.gameAction,
        };
        if (body.actionParams) playParams.params = body.actionParams;
        if (body.slotId !== undefined) playParams.slot_id = body.slotId;
        return json(await callTool("play", playParams, credentials));
      }

      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[game-proxy] request failed", {
      action: body.action,
      userIdPrefix: effectiveUserId.slice(0, 6),
      error: message.slice(0, 300),
    });
    const status = message.startsWith("machine_registration_protocol")
      ? 502
      : message.startsWith("cedartoy_timeout")
      ? 504
      : message === "machine_registration_required"
      ? 409
      : 502;
    return json({ error: message.slice(0, 300) }, status);
  }
});

function publicMachineState(row: MachineRow | null): Record<string, unknown> {
  if (!row) {
    return {
      status: "unregistered",
      machine_username: null,
      binding_code: null,
      machine_id: null,
    };
  }
  return {
    status: row.status,
    machine_username: row.machine_username,
    binding_code: row.status === "pending_binding" ? row.binding_code || null : null,
    machine_id: row.machine_id || null,
    last_error: row.last_error || null,
    last_checked_at: row.last_checked_at || null,
  };
}

async function getMachineRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<MachineRow | null> {
  const { data, error } = await supabase
    .from("cedartoy_machine_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`machine_store_read_failed: ${error.message}`);
  return data as MachineRow | null;
}

async function deriveCredentials(
  userId: string,
  machineSecret: string,
): Promise<MachineCredentials> {
  const compactUser = userId.replace(/-/g, "").slice(0, 16);
  const username = `cha_${compactUser}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(machineSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`cedartoy-machine:${userId}`),
  );
  const password = btoa(String.fromCharCode(...new Uint8Array(signed)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
    .slice(0, 32);
  return { username, password };
}

async function requireMachineCredentials(
  supabase: SupabaseClient,
  userId: string,
  machineSecret: string,
): Promise<MachineCredentials> {
  const row = await getMachineRow(supabase, userId);
  if (!row || row.status === "unregistered" || row.status === "error") {
    throw new Error("machine_registration_required");
  }
  return await deriveCredentials(userId, machineSecret);
}

async function ensureMachineAccount(
  supabase: SupabaseClient,
  userId: string,
  machineSecret: string,
): Promise<MachineRow> {
  const existing = await getMachineRow(supabase, userId);
  if (existing && ["pending_binding", "bound"].includes(existing.status)) {
    return existing;
  }

  const credentials = await deriveCredentials(userId, machineSecret);
  const tools = await discoverTools(credentials);
  const registerTool = findRegistrationTool(tools);
  if (!registerTool) {
    throw new Error(
      `machine_registration_protocol_missing: available=${
        tools.map((tool) => tool.name).slice(0, 20).join(",")
      }`,
    );
  }

  const args = buildRegistrationArgs(registerTool, credentials);
  let registrationResult: unknown;
  if (registerTool.name === "account") {
    // CedarToy creates/loads the machine identity from Basic auth. Calling the
    // account tool anonymously only describes an anonymous visitor and cannot
    // return the machine binding code.
    registrationResult = await callTool(registerTool.name, args, credentials);
  } else {
    try {
      registrationResult = await callTool(registerTool.name, args, undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/http_(401|403)/.test(message)) throw error;
      registrationResult = await callTool(registerTool.name, args, credentials);
    }
  }

  let accountData = normalizeMcpResult(registrationResult);
  let identity = extractIdentity(accountData);

  if (!identity.bindingCode) {
    const accountTool = findAccountTool(tools);
    if (accountTool) {
      const accountResult = await callTool(
        accountTool.name,
        buildAccountArgs(accountTool, "binding"),
        credentials,
      );
      const normalizedAccount = normalizeMcpResult(accountResult);
      const directText = typeof normalizedAccount?.text === "string"
        ? normalizedAccount.text.trim()
        : "";
      const accountWithToken = /^[A-Za-z0-9_-]{4,128}$/.test(directText)
        ? { ...normalizedAccount, binding_token: directText }
        : normalizedAccount;
      accountData = {
        registration: accountData,
        account: accountWithToken,
      };
      identity = extractIdentity(accountData);
    }
  }

  if (!identity.bindingCode && !identity.bound) {
    const schemaPreview = JSON.stringify(registerTool.inputSchema || {}).slice(0, 180);
    const responsePreview = JSON.stringify(safeMetadata(accountData)).slice(0, 180);
    console.warn("[game-proxy] account response had no recognizable binding code", {
      tool: registerTool.name,
      schema: schemaPreview,
      response: responsePreview,
    });
    throw new Error(
      `machine_registration_protocol_invalid: no binding code; schema=${schemaPreview}; response=${responsePreview}`,
    );
  }

  const status: MachineRow["status"] = identity.bound
    ? "bound"
    : "pending_binding";
  const payload = {
    user_id: userId,
    machine_username: credentials.username,
    machine_id: identity.machineId,
    binding_code: identity.bindingCode,
    status,
    registration_tool: registerTool.name,
    account_metadata: safeMetadata(accountData),
    last_error: null,
    last_checked_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("cedartoy_machine_accounts")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw new Error(`machine_store_write_failed: ${error.message}`);
  return data as MachineRow;
}

async function refreshMachineAccount(
  supabase: SupabaseClient,
  userId: string,
  machineSecret: string,
): Promise<MachineRow> {
  const row = await getMachineRow(supabase, userId);
  if (!row) throw new Error("machine_registration_required");

  const credentials = await deriveCredentials(userId, machineSecret);
  const tools = await discoverTools(credentials);
  const accountTool = findAccountTool(tools);
  if (!accountTool) {
    throw new Error("machine_registration_protocol_missing: account tool not found");
  }
  const result = normalizeMcpResult(
    await callTool(accountTool.name, buildAccountArgs(accountTool, "status"), credentials),
  );
  const identity = extractIdentity(result);
  const status: MachineRow["status"] = identity.bound
    ? "bound"
    : "pending_binding";

  const { data, error } = await supabase
    .from("cedartoy_machine_accounts")
    .update({
      machine_id: identity.machineId || row.machine_id,
      binding_code: identity.bindingCode || row.binding_code,
      status,
      account_metadata: safeMetadata(result),
      last_error: null,
      last_checked_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(`machine_store_write_failed: ${error.message}`);
  return data as MachineRow;
}

async function discoverTools(
  credentials?: MachineCredentials,
): Promise<McpTool[]> {
  if (toolCache && toolCache.expiresAt > Date.now()) return toolCache.tools;

  let result: any;
  try {
    result = await callRpc("tools/list", {}, undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!credentials || !/cedartoy_http_(401|403)/.test(message)) throw error;
    result = await callRpc("tools/list", {}, credentials);
  }
  const normalized = normalizeMcpResult(result) as { tools?: McpTool[] };
  const tools = Array.isArray(normalized?.tools)
    ? normalized.tools
    : Array.isArray(result?.tools)
    ? result.tools
    : [];
  if (!tools.length) {
    throw new Error("machine_registration_protocol_missing: tools/list returned no tools");
  }
  toolCache = { tools, expiresAt: Date.now() + TOOL_CACHE_MS };
  return tools;
}

function findRegistrationTool(tools: McpTool[]): McpTool | null {
  const exact = [
    "register_machine",
    "machine_register",
    "register_agent",
    "register_ai",
    "register",
  ];
  for (const name of exact) {
    const tool = tools.find((candidate) => candidate.name === name);
    if (tool) return tool;
  }
  const semantic = tools.find((tool) =>
    /register|signup|create|注册|创建/i.test(`${tool.name} ${tool.description || ""}`) &&
    /machine|agent|bot|ai|account|小机|账号/i.test(`${tool.name} ${tool.description || ""}`)
  );
  if (semantic) return semantic;

  // CedarToy currently exposes registration through the authenticated
  // `account` tool instead of a standalone register tool. The first account
  // call with a new machine identity creates it and returns its binding state.
  return tools.find((tool) => tool.name === "account") || null;
}

function findAccountTool(tools: McpTool[]): McpTool | null {
  return tools.find((tool) =>
    ["account", "machine_account", "account_status", "whoami"].includes(tool.name)
  ) || tools.find((tool) =>
    /account|binding|绑定|小机状态/i.test(
      `${tool.name} ${tool.description || ""}`,
    )
  ) || null;
}

function buildRegistrationArgs(
  tool: McpTool,
  credentials: MachineCredentials,
): Record<string, unknown> {
  const properties = tool.inputSchema?.properties || {};
  const required = tool.inputSchema?.required || [];
  const args: Record<string, unknown> = {};

  for (const [key, schema] of Object.entries(properties)) {
    const lower = key.toLowerCase();
    if (/user.?name|account.?name|machine.?name|^name$/.test(lower)) {
      args[key] = credentials.username;
    } else if (/password|passphrase|secret/.test(lower)) {
      args[key] = credentials.password;
    } else if (/display.?name|nickname|label/.test(lower)) {
      args[key] = "Cha";
    } else if (lower === "action" || lower === "operation") {
      const actionDescription = schema.description || "";
      const registrationAction = schema.enum?.find((value) =>
        /login_or_register|register|signup|sign_up|create/i.test(String(value))
      );
      if (
        tool.name === "account" &&
        /login_or_register/i.test(actionDescription)
      ) {
        args[key] = "login_or_register";
      } else if (registrationAction !== undefined) {
        args[key] = registrationAction;
      } else if (required.includes(key)) {
        args[key] = schema.enum?.[0] || "login_or_register";
      }
    } else if (/type|role|kind/.test(lower)) {
      args[key] = schema.enum?.find((value) =>
        /machine|agent|bot|ai/i.test(String(value))
      ) || "machine";
    } else if (schema.default !== undefined) {
      args[key] = schema.default;
    }
  }

  const missing = required.filter((key) => args[key] === undefined);
  if (missing.length) {
    throw new Error(
      `machine_registration_protocol_unknown_fields: ${missing.join(",")}`,
    );
  }
  return args;
}

function buildAccountArgs(
  tool: McpTool,
  purpose: "binding" | "status",
): Record<string, unknown> {
  const properties = tool.inputSchema?.properties || {};
  const args: Record<string, unknown> = {};
  const candidates = purpose === "binding"
    ? ["generate_binding_token", "get_bindings", "get_profile"]
    : ["get_bindings", "get_profile"];

  for (const key of ["action", "operation"]) {
    const schema = properties[key];
    if (!schema) continue;
    const enumValues = schema.enum || [];
    const description = schema.description || "";
    const selected = candidates.find((candidate) =>
      enumValues.some((value) => String(value) === candidate) ||
      new RegExp(`(?:^|[^a-z_])${candidate}(?:$|[^a-z_])`, "i").test(description)
    );
    args[key] = selected ||
      enumValues.find((value) =>
        /bind|pair|link|claim|profile|whoami|get/i.test(String(value))
      ) ||
      enumValues[0] ||
      (purpose === "binding" ? "generate_binding_token" : "get_bindings");
  }
  return args;
}

function normalizeMcpResult(value: any): any {
  if (value && Array.isArray(value.content)) {
    const textParts = value.content
      .filter((item: any) => item && typeof item.text === "string")
      .map((item: any) => item.text);
    if (textParts.length === 1) {
      try {
        return JSON.parse(textParts[0]);
      } catch {
        return { text: textParts[0] };
      }
    }
    if (textParts.length > 1) return { content: textParts };
  }
  return value;
}

function extractIdentity(value: unknown): {
  bindingCode: string | null;
  machineId: string | null;
  bound: boolean;
} {
  const objects: Record<string, unknown>[] = [];
  const visit = (item: unknown, depth = 0) => {
    if (depth > 5 || !item) return;
    if (typeof item === "string") {
      try {
        visit(JSON.parse(item), depth + 1);
      } catch {
        const match = item.match(
          /(?:bind(?:ing)?[_\\s-]*(?:code|token)|pair(?:ing)?[_\\s-]*code|claim[_\\s-]*code|link[_\\s-]*code|verification[_\\s-]*code|绑定码|绑定代码|绑定令牌|绑定token)(?:\\s*(?:is|为|是))?[:：\\s=]*([A-Za-z0-9_-]{4,64})/i,
        );
        if (match) objects.push({ binding_code: match[1] });
      }
      return;
    }
    if (Array.isArray(item)) {
      item.forEach((child) => visit(child, depth + 1));
      return;
    }
    if (typeof item === "object") {
      objects.push(item as Record<string, unknown>);
      Object.values(item as Record<string, unknown>).forEach((child) =>
        visit(child, depth + 1)
      );
    }
  };
  visit(value);

  const get = (keys: string[]): unknown => {
    for (const object of objects) {
      for (const key of keys) {
        if (object[key] !== undefined && object[key] !== null) return object[key];
      }
    }
    return null;
  };
  const fuzzyGet = (pattern: RegExp): unknown => {
    for (const object of objects) {
      for (const [key, item] of Object.entries(object)) {
        if (pattern.test(key) && item !== undefined && item !== null) return item;
      }
    }
    return null;
  };
  const bindingCode = get([
    "binding_code",
    "bindingCode",
    "bind_code",
    "bindCode",
    "binding_token",
    "bindingToken",
    "bind_token",
    "bindToken",
    "pairing_code",
    "pairingCode",
    "claim_code",
    "claimCode",
    "verification_code",
    "verificationCode",
    "code",
  ]) || fuzzyGet(
    /(?:bind|pair|claim|link|verification).*(?:code|token)|(?:code|token).*(?:bind|pair|claim|link)/i,
  );
  const machineId = get([
    "machine_id",
    "machineId",
    "agent_id",
    "agentId",
    "id",
  ]);
  const status = String(get(["status", "binding_status", "bindingStatus"]) || "");
  const boundValue = get(["bound", "is_bound", "isBound", "linked", "is_linked"]);
  const bound = boundValue === true ||
    ["bound", "linked", "active", "connected"].includes(status.toLowerCase());

  return {
    bindingCode: bindingCode ? String(bindingCode) : null,
    machineId: machineId ? String(machineId) : null,
    bound,
  };
}

function safeMetadata(value: unknown): Record<string, unknown> {
  const redact = (item: unknown, depth = 0): unknown => {
    if (depth > 8) return "[truncated]";
    if (Array.isArray(item)) return item.slice(0, 100).map((child) => redact(child, depth + 1));
    if (!item || typeof item !== "object") return item;

    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
      if (/password|passphrase|secret|token|authorization|credential|api[_-]?key/i.test(key)) {
        result[key] = "[redacted]";
      } else {
        result[key] = redact(child, depth + 1);
      }
    }
    return result;
  };

  try {
    const sanitized = redact(value);
    const text = JSON.stringify(sanitized);
    if (text.length > 8_000) {
      return { truncated: true, preview: text.slice(0, 7_500) };
    }
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : { value: parsed };
  } catch {
    return { unavailable: true };
  }
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  credentials?: MachineCredentials,
): Promise<any> {
  return await callRpc("tools/call", {
    name,
    arguments: args,
  }, credentials);
}

async function callRpc(
  method: string,
  params: Record<string, unknown>,
  credentials?: MachineCredentials,
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CEDARTOY_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (credentials) {
      headers.Authorization =
        `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
    }
    const response = await fetch(CEDARTOY_BASE, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
        id: crypto.randomUUID(),
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`cedartoy_http_${response.status}`);
    const payload = await response.json();
    if (payload?.error) {
      throw new Error(
        `cedartoy_rpc_error: ${String(payload.error.message || "unknown").slice(0, 200)}`,
      );
    }
    return payload?.result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`cedartoy_timeout_after_${CEDARTOY_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

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
