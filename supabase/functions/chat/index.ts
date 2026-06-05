const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ChatRequest = {
  messages?: unknown;
  model?: string;
  stream?: boolean;
  replyMode?: string;
  userId?: string;
};

const FUNCTION_VERSION = "env-check-v1";
const MEMORY_DOMAINS = ["persona", "work", "writing", "life", "relation", "general"] as const;
type MemoryDomain = typeof MEMORY_DOMAINS[number];
type MemoryRow = {
  id: string;
  content: string;
  domain?: string | null;
};

const MEMORY_DOMAIN_KEYWORDS: Record<Exclude<MemoryDomain, "persona" | "relation">, string[]> = {
  work: ["救公主", "Codex", "GitHub", "部署", "Guidebook", "app.js", "bug", "报错", "代码", "PRD", "方案"],
  writing: ["OC", "剧情", "角色", "真田", "安彦", "晃", "续写", "文风", "大纲"],
  life: ["吃饭", "睡觉", "猫", "家务", "出门", "身体", "药"],
  general: [],
};

// --- Memory context cache (module-level in-memory, survives across warm requests) ---
//
// Cache key = SHA-256(user_id + "|" + domain_fingerprint), truncated to 16 hex chars.
// user_id is mandatory in the key to prevent cross-user cache contamination.
// conversation_id is intentionally NOT included: memories/buckets are global per user,
// not scoped to a conversation, so two conversations for the same user share the same context.
//
// This is a best-effort cache keyed on *which domains are selected*, not on memory content.
// If memories are updated within the TTL window, the old compiled context may be reused.
// This is acceptable for a short-lived in-process cache; do NOT use this design for a
// persistent or shared cache without adding a content-version fingerprint to the key.
//
// NOTE: hashCacheKey uses only the first 16 hex chars of SHA-256 (64-bit prefix).
// This is sufficient for a 2-minute in-process cache with low cardinality keys.
// If this cache is ever made persistent or cross-process, use the full 64-char hash.
type MemoryCacheEntry = {
  compiledText: string; // compiled memory+bucket text to inject into systemContent
  hitMemoryIds: string[]; // memory row IDs that were included
  ts: number; // Date.now() at cache time
};
const _memCache = new Map<string, MemoryCacheEntry>();
const CACHE_TTL_MS = 120_000; // 2 minutes

async function hashCacheKey(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

function hitDomainsFingerprint(lastUserMessage: string): string {
  const hits = (Object.entries(MEMORY_DOMAIN_KEYWORDS) as [keyof typeof MEMORY_DOMAIN_KEYWORDS, string[]][])
    .filter(([, kws]) => messageHitsKeywords(lastUserMessage, kws))
    .map(([d]) => d)
    .sort();
  return "v1|" + hits.join(",");
}

/** Evict all expired entries from _memCache. Call before writes to prevent unbounded growth. */
function evictExpiredCacheEntries(): void {
  const now = Date.now();
  for (const [key, entry] of _memCache) {
    if (now - entry.ts >= CACHE_TTL_MS) _memCache.delete(key);
  }
}

// --- Safe logging ---
// Never logs user message content or memory content.
// user_id is truncated to first 6 chars to allow correlation without exposing full UUID.
type RequestLog = {
  request_id: string;
  user_id_prefix: string;   // first 6 chars of userId, or "absent"
  has_user_id: boolean;
  memory_cache_hit: boolean;
  memory_count: number;
  hit_memory_ids_count: number;
  memory_fetch_ms: number;   // 0 on cache hit
  memory_compile_ms: number; // 0 on cache hit
  model_call_ms: number;
  total_ms: number;
  error_stage?: string;
};

function makeRequestId(): string {
  // crypto.randomUUID() is available in Deno
  return crypto.randomUUID().slice(0, 8);
}

function safeUserIdPrefix(userId: string): string {
  if (!userId || userId === "anon") return "absent";
  return userId.slice(0, 6);
}

function emitLog(log: RequestLog): void {
  console.log(JSON.stringify({ ...log, fn: "chat", v: FUNCTION_VERSION }));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "x-save-princess-function-version": FUNCTION_VERSION,
    },
  });
}

function normalizeMemoryDomain(domain: string | null | undefined): MemoryDomain {
  return MEMORY_DOMAINS.includes(domain as MemoryDomain) ? domain as MemoryDomain : "general";
}

function getLastUserMessage(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as { role?: unknown; content?: unknown };
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .map((part) => typeof part === "string" ? part : (part && typeof part === "object" && "text" in part ? String((part as { text?: unknown }).text || "") : ""))
        .join("\n");
    }
  }
  return "";
}

function messageHitsKeywords(message: string, keywords: string[]): boolean {
  const lowerMessage = message.toLocaleLowerCase();
  return keywords.some((keyword) => lowerMessage.includes(keyword.toLocaleLowerCase()));
}

function selectContextualMemoryRows(rows: MemoryRow[], lastUserMessage: string): MemoryRow[] {
  const hitDomains = new Set<MemoryDomain>();
  for (const [domain, keywords] of Object.entries(MEMORY_DOMAIN_KEYWORDS) as [keyof typeof MEMORY_DOMAIN_KEYWORDS, string[]][]) {
    if (messageHitsKeywords(lastUserMessage, keywords)) hitDomains.add(domain);
  }

  const hasAnyKeywordHit = hitDomains.size > 0;
  return rows.filter((row) => {
    const domain = normalizeMemoryDomain(row.domain);
    if (domain === "persona") return true;
    if (domain === "general") return hasAnyKeywordHit;
    return hitDomains.has(domain);
  });
}

async function fetchEnabledMemories(
  supabaseUrl: string,
  serviceRoleKey: string,
  lastUserMessage: string,
): Promise<{ lines: string[]; ids: string[] }> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/memories?enabled=eq.true&select=id,content,domain&order=created_at.asc`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!res.ok) return { lines: [], ids: [] };
  const rows = await res.json() as MemoryRow[];
  const selected = selectContextualMemoryRows(rows, lastUserMessage);
  return { lines: selected.map((r) => r.content), ids: selected.map((r) => r.id) };
}

async function fetchMemoryBuckets(supabaseUrl: string, serviceRoleKey: string): Promise<string[]> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/memory_buckets?status=eq.active&select=id,title,summary&order=importance.desc,last_accessed_at.desc.nullslast&limit=2`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!res.ok) return [];
  const rows = await res.json() as { id: string; title: string; summary: string }[];
  // fire-and-forget update last_accessed_at
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id).join(",");
    fetch(`${supabaseUrl}/rest/v1/memory_buckets?id=in.(${ids})`, {
      method: "PATCH",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ last_accessed_at: new Date().toISOString() }),
    }).catch(() => {});
  }
  return rows.map((r) => r.summary);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders, "x-save-princess-function-version": FUNCTION_VERSION },
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const t0 = Date.now();
  const requestId = makeRequestId();

  const openrouterApiKey = Deno.env.get("OPENROUTER_API_KEY");
  const openrouterBaseUrl =
    Deno.env.get("OPENROUTER_BASE_URL") ||
    "https://api.fuka.win/v1/chat/completions";

  if (!openrouterApiKey) {
    return jsonResponse(
      {
        error: "环境变量未配置",
        hasOpenrouterApiKey: false,
        hasOpenrouterBaseUrl: true,
        hasModelName: !!Deno.env.get("MODEL_NAME"),
      },
      500,
    );
  }

  let payload: ChatRequest;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "请求体必须是 JSON" }, 400);
  }

  if (!Array.isArray(payload.messages)) {
    return jsonResponse({ error: "messages 必须是数组" }, 400);
  }

  const model = Deno.env.get("MODEL_NAME") || payload.model;

  if (!model) {
    return jsonResponse({ error: "MODEL_NAME 未配置" }, 500);
  }

  // Initialise log record — populated incrementally below
  const logRecord: RequestLog = {
    request_id: requestId,
    user_id_prefix: "absent",
    has_user_id: false,
    memory_cache_hit: false,
    memory_count: 0,
    hit_memory_ids_count: 0,
    memory_fetch_ms: 0,
    memory_compile_ms: 0,
    model_call_ms: 0,
    total_ms: 0,
  };

  // Build system prompt with memories
  const supabaseUrl = Deno.env.get("DB_URL");
  const serviceRoleKey = Deno.env.get("DB_SERVICE_ROLE_KEY");
  let systemContent = `不要输出 <think>、</think>、推理过程、内部思考或分析过程。只输出最终回复。

【回复长度与节奏】
- 优先模仿用户当前消息的节奏、长度和密度，而不是固定输出完整结构。
- 用户短句，回复也短，通常 1-3 句。
- 除非用户明确要求分析、方案、任务卡、排查、总结，否则不要长篇展开。
- 不要主动列很多"下一步"。
- 不要把普通聊天写成安慰小作文。
- 不要每次都"先共情再建议再总结"。
- 技术任务可以清晰，但日常对话要像真人聊天，有来有回。
- 可以亲近，但要收口。`;

  if (supabaseUrl && serviceRoleKey) {
    const lastUserMessage = getLastUserMessage(payload.messages);
    // user_id is required in the cache key to prevent cross-user cache contamination.
    // Fall back to "anon" only as a safety net; in practice the frontend always sends userId.
    const userId = typeof payload.userId === "string" && payload.userId ? payload.userId : "anon";

    logRecord.has_user_id = userId !== "anon";
    logRecord.user_id_prefix = safeUserIdPrefix(userId);

    const cacheKey = await hashCacheKey(userId + "|" + hitDomainsFingerprint(lastUserMessage));
    const cached = _memCache.get(cacheKey);

    let compiledMemoryText: string;

    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      // cache hit: skip DB fetches
      compiledMemoryText = cached.compiledText;
      logRecord.memory_cache_hit = true;
      logRecord.memory_count = cached.hitMemoryIds.length;
      logRecord.hit_memory_ids_count = cached.hitMemoryIds.length;
    } else {
      // cache miss: fetch and compile
      const tFetch = Date.now();
      const [{ lines: memories, ids: memoryIds }, buckets] = await Promise.all([
        fetchEnabledMemories(supabaseUrl, serviceRoleKey, lastUserMessage),
        fetchMemoryBuckets(supabaseUrl, serviceRoleKey),
      ]);
      logRecord.memory_fetch_ms = Date.now() - tFetch;

      const tCompile = Date.now();
      let compiled = "";
      if (memories.length > 0) {
        compiled += "\n\n以下是长期记忆，请优先遵守：\n" + memories.map((m, i) => `${i + 1}. ${m}`).join("\n");
      }
      if (buckets.length > 0) {
        compiled += "\n\n以下是背景参考（最多 2 条，仅供参考）：\n" + buckets.map((b, i) => `${i + 1}. ${b}`).join("\n");
      }
      logRecord.memory_compile_ms = Date.now() - tCompile;

      logRecord.memory_count = memories.length;
      logRecord.hit_memory_ids_count = memoryIds.length;

      compiledMemoryText = compiled;
      // Only cache when at least one fetch returned data, to avoid caching a fetch failure
      // as an empty context and silently serving stale "no memories" for up to TTL_MS.
      if (memories.length > 0 || buckets.length > 0) {
        evictExpiredCacheEntries();
        _memCache.set(cacheKey, { compiledText: compiled, hitMemoryIds: memoryIds, ts: Date.now() });
      }
    }

    systemContent += compiledMemoryText;
  }

  if (payload.replyMode === "auto") {
    systemContent += "\n\n【回复决策】如果用户明显还在连续补充、只是碎片化记录、或没有期待回复，可以不回复。若不回复，只输出：<NO_REPLY>。不要解释。";
  } else {
    systemContent += "\n\n【回复决策】必须正常回复，禁止输出 <NO_REPLY>。";
  }

  const messages = [
    { role: "system", content: systemContent },
    ...(payload.messages as unknown[]),
  ];

  try {
    const tModel = Date.now();
    const upstreamResponse = await fetch(openrouterBaseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, stream: true }),
    });
    logRecord.model_call_ms = Date.now() - tModel;

    if (!upstreamResponse.ok) {
      let errorBody: unknown = { error: "模型请求失败" };
      try {
        errorBody = await upstreamResponse.json();
      } catch {
        errorBody = { error: await upstreamResponse.text() };
      }
      logRecord.error_stage = "model_upstream";
      logRecord.total_ms = Date.now() - t0;
      emitLog(logRecord);
      return jsonResponse(errorBody, upstreamResponse.status);
    }

    logRecord.total_ms = Date.now() - t0;
    emitLog(logRecord);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstreamResponse.headers.get("Content-Type") || "text/event-stream",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    logRecord.error_stage = "model_fetch";
    logRecord.total_ms = Date.now() - t0;
    emitLog(logRecord);
    return jsonResponse({ error: message }, 500);
  }
});
