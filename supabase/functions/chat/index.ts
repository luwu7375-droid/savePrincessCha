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
  modelTier?: string; // "instant" | "general" | "advanced"
  storySeedsEnabled?: boolean; // 关系史实验开关
};

// ── Model tier ────────────────────────────────────────────────────────────────
//
// All three tiers route through openrouter/fuka:
//
//   instant  → OPENROUTER_API_KEY + OPENROUTER_BASE_URL + FAST_MODEL
//   general  → OPENROUTER_API_KEY + OPENROUTER_BASE_URL + DEFAULT_MODEL (fallback: MODEL_NAME)
//   advanced → OPENROUTER_API_KEY + OPENROUTER_BASE_URL + ADVANCED_MODEL
//
// DeepSeek official API is NOT used for /chat frontend routing.
//
// Fallback (one-shot, triggered on 429 / 5xx / credits errors):
//   OPENROUTER_API_KEY + OPENROUTER_BASE_URL + FALLBACK_MODEL
//
// Token caps (all optional):
//   MAX_OUTPUT_TOKENS_INSTANT  (default 300)
//   MAX_OUTPUT_TOKENS_GENERAL  (default 300)
//   MAX_OUTPUT_TOKENS_ADVANCED (default 1200)
//
// Legacy / compatibility env vars (still honoured):
//   MODEL_NAME   — used if DEFAULT_MODEL unset
//   FAST_MODEL   — model for instant tier

type ModelTier = "instant" | "general" | "advanced";

const VALID_TIERS: ModelTier[] = ["instant", "general", "advanced"];

function normalizeTier(raw: string | undefined): ModelTier {
  if (raw && VALID_TIERS.includes(raw as ModelTier)) return raw as ModelTier;
  return "general";
}

// ── Provider config ───────────────────────────────────────────────────────────

type ProviderName = "openrouter";

type ProviderConfig = {
  providerName: ProviderName;
  baseUrl: string; // full completions endpoint URL
  apiKey: string;
  model: string;
  maxTokens: number;
  tier: ModelTier;
};

/**
 * Normalises an API base URL to a full /chat/completions endpoint.
 *
 * Handles three input patterns:
 *   "https://api.fuka.win/v1/chat/completions" → unchanged (already full)
 *   "https://openrouter.ai/api/v1"             → appends /chat/completions
 *   "https://api.example.com"                  → appends /v1/chat/completions
 */
function toCompletionsUrl(base: string): string {
  if (base.endsWith("/chat/completions")) return base;
  const stripped = base.replace(/\/$/, "");
  if (/\/v\d+$/.test(stripped)) return stripped + "/chat/completions";
  return stripped + "/v1/chat/completions";
}

function resolveProviderForTier(tier: ModelTier): ProviderConfig {
  const orBaseUrl = toCompletionsUrl(
    Deno.env.get("OPENROUTER_BASE_URL") || "https://api.fuka.win/v1/chat/completions",
  );
  const orApiKey = Deno.env.get("OPENROUTER_API_KEY") || "";
  const defaultModel =
    Deno.env.get("DEFAULT_MODEL") || Deno.env.get("MODEL_NAME") || "";

  switch (tier) {
    case "instant": {
      // Routes through OpenRouter/fuka (same as general/advanced).
      const model = Deno.env.get("FAST_MODEL") || defaultModel;
      const maxTokens = parseInt(Deno.env.get("MAX_OUTPUT_TOKENS_INSTANT") || "300", 10);
      return { providerName: "openrouter", baseUrl: orBaseUrl, apiKey: orApiKey, model, maxTokens, tier };
    }
    case "advanced": {
      const model = Deno.env.get("ADVANCED_MODEL") || defaultModel;
      const maxTokens = parseInt(Deno.env.get("MAX_OUTPUT_TOKENS_ADVANCED") || "1200", 10);
      return { providerName: "openrouter", baseUrl: orBaseUrl, apiKey: orApiKey, model, maxTokens, tier };
    }
    default: {
      // general
      const model = defaultModel;
      const maxTokens = parseInt(Deno.env.get("MAX_OUTPUT_TOKENS_GENERAL") || "300", 10);
      return { providerName: "openrouter", baseUrl: orBaseUrl, apiKey: orApiKey, model, maxTokens, tier: "general" };
    }
  }
}

/**
 * Returns the one-shot fallback provider to try when the primary call fails.
 * Uses OPENROUTER_API_KEY + OPENROUTER_BASE_URL + FALLBACK_MODEL.
 * Returns null if FALLBACK_MODEL is not configured.
 */
function getFallbackProvider(): ProviderConfig | null {
  const maxTokens = parseInt(Deno.env.get("MAX_OUTPUT_TOKENS_GENERAL") || "300", 10);
  const fbModel  = Deno.env.get("FALLBACK_MODEL") || "";
  const orApiKey = Deno.env.get("OPENROUTER_API_KEY") || "";
  const orBase   = toCompletionsUrl(
    Deno.env.get("OPENROUTER_BASE_URL") || "https://api.fuka.win/v1/chat/completions",
  );
  if (fbModel && orApiKey) {
    return {
      providerName: "openrouter",
      baseUrl: orBase,
      apiKey: orApiKey,
      model: fbModel,
      maxTokens,
      tier: "general",
    };
  }
  return null;
}

/** Returns true for upstream errors that warrant a one-shot fallback attempt. */
function isFallbackableStatus(status: number, bodyText: string): boolean {
  if (status === 429 || status >= 500) return true;
  const lower = bodyText.toLocaleLowerCase();
  return (
    lower.includes("insufficient credits") ||
    lower.includes("insufficient_credits") ||
    lower.includes("bad_response_status_code") ||
    lower.includes("quota exceeded") ||
    lower.includes("rate limit")
  );
}

// ── Memory ────────────────────────────────────────────────────────────────────

const FUNCTION_VERSION = "fuka-unified-v4";
const MEMORY_DOMAINS = ["persona", "work", "writing", "life", "relation", "general"] as const;
type MemoryDomain = typeof MEMORY_DOMAINS[number];
type MemoryRow = {
  id: string;
  content: string;
  domain?: string | null;
};

const MEMORY_DOMAIN_KEYWORDS: Record<Exclude<MemoryDomain, "persona">, string[]> = {
  work: ["救公主", "Codex", "GitHub", "部署", "Guidebook", "app.js", "bug", "报错", "代码", "PRD", "方案"],
  writing: ["OC", "剧情", "角色", "真田", "安彦", "晃", "续写", "文风", "大纲"],
  life: ["吃饭", "睡觉", "猫", "家务", "出门", "身体", "药"],
  // relation 域：只在问到关系相关问题时召回，不无脑注入
  relation: [
    "几天", "第几天", "多少天", "第一次", "认识", "在一起", "纪念日", "哪一年", "哪一天",
    "几号", "什么时候", "怎么认识", "怎么在一起", "关系史", "历史", "回忆", "过去",
    "爱你", "喜欢你", "表白", "见面", "相遇",
  ],
  general: [],
};

// --- Memory context cache (module-level in-memory, survives across warm requests) ---
//
// Cache key = SHA-256(user_id + "|" + domain_fingerprint), truncated to 16 hex chars.
// user_id is mandatory in the key to prevent cross-user cache contamination.
// model_tier is intentionally NOT included: memories/buckets are global per user and
// the same compiled context can be reused across instant/general/advanced tiers.
// conversation_id is intentionally NOT included: memories are global per user.
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
  compiledText: string;
  hitMemoryIds: string[];
  ts: number;
};
const _memCache = new Map<string, MemoryCacheEntry>();

// TTL is configurable via MEMORY_CACHE_TTL_MS env var (default 120 000 ms = 2 min).
// Invalid / non-positive values fall back to the default.
const _DEFAULT_CACHE_TTL_MS = 120_000;
function resolveCacheTtl(): number {
  const raw = Deno.env.get("MEMORY_CACHE_TTL_MS");
  if (!raw) return _DEFAULT_CACHE_TTL_MS;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : _DEFAULT_CACHE_TTL_MS;
}
const CACHE_TTL_MS = resolveCacheTtl();

// ── Cache stats (module-level, per-worker-process) ────────────────────────────
// These counters survive across warm requests but reset on cold start.
// They are emitted per-request in the log for observability.
let _cacheHits = 0;
let _cacheMisses = 0;
let _cacheWrites = 0;
let _cacheEvictions = 0;

async function hashCacheKey(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

function hitDomainsFingerprint(lastUserMessage: string): string {
  const hits = (
    Object.entries(MEMORY_DOMAIN_KEYWORDS) as [keyof typeof MEMORY_DOMAIN_KEYWORDS, string[]][]
  )
    .filter(([, kws]) => messageHitsKeywords(lastUserMessage, kws))
    .map(([d]) => d)
    .sort();
  return "v1|" + hits.join(",");
}

function evictExpiredCacheEntries(): void {
  const now = Date.now();
  for (const [key, entry] of _memCache) {
    if (now - entry.ts >= CACHE_TTL_MS) {
      _memCache.delete(key);
      _cacheEvictions += 1;
    }
  }
}

// ── Logging ───────────────────────────────────────────────────────────────────
// Never logs user message content or memory content.
// user_id is truncated to first 6 chars to allow correlation without exposing full UUID.

type RequestLog = {
  request_id: string;
  user_id_prefix: string;
  has_user_id: boolean;
  model_tier: string;
  provider: string;
  model: string;
  fallback_used: boolean;
  fallback_model: string | null;
  fallback_provider: string | null;
  fallback_reason: string | null;
  memory_cache_hit: boolean;
  // Per-worker cumulative stats (reset on cold start)
  memory_cache_hits: number;
  memory_cache_misses: number;
  memory_cache_hit_rate: number; // 0–1, -1 if no requests yet
  memory_cache_size: number;
  memory_cache_ttl_ms: number;
  memory_count: number;
  hit_memory_ids_count: number;
  memory_fetch_ms: number;
  memory_compile_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: null;
  story_seeds_enabled: boolean;
  story_seeds_count: number;
  story_seeds_titles: string[];
  bucket_count: number;
  bucket_titles: string[];
  model_call_ms: number;
  total_ms: number;
  error_stage?: string;
};

function makeRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function safeUserIdPrefix(userId: string): string {
  if (!userId || userId === "anon") return "absent";
  return userId.slice(0, 6);
}

function emitLog(log: RequestLog): void {
  console.log(JSON.stringify({ ...log, fn: "chat", v: FUNCTION_VERSION }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  return MEMORY_DOMAINS.includes(domain as MemoryDomain) ? (domain as MemoryDomain) : "general";
}

function getLastUserMessage(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as { role?: unknown; content?: unknown };
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .map((part) =>
          typeof part === "string"
            ? part
            : part && typeof part === "object" && "text" in part
            ? String((part as { text?: unknown }).text || "")
            : ""
        )
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
  for (const [domain, keywords] of Object.entries(MEMORY_DOMAIN_KEYWORDS) as [
    keyof typeof MEMORY_DOMAIN_KEYWORDS,
    string[],
  ][]) {
    if (keywords.length > 0 && messageHitsKeywords(lastUserMessage, keywords)) {
      hitDomains.add(domain);
    }
  }

  const hasAnyKeywordHit = hitDomains.size > 0;
  return rows.filter((row) => {
    const domain = normalizeMemoryDomain(row.domain);
    // persona 永远注入（稳定设定）
    if (domain === "persona") return true;
    // general 只在有任何关键词命中时才注入，避免无差别污染
    if (domain === "general") return hasAnyKeywordHit;
    // 其他域（work / writing / life / relation）必须命中对应关键词
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
  const rows = (await res.json()) as MemoryRow[];
  const selected = selectContextualMemoryRows(rows, lastUserMessage);
  return { lines: selected.map((r) => r.content), ids: selected.map((r) => r.id) };
}

async function fetchMemoryBuckets(
  supabaseUrl: string,
  serviceRoleKey: string,
  lastUserMessage: string,
): Promise<{ summaries: string[]; titles: string[] }> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/memory_buckets?status=eq.active&select=id,title,summary,keywords&order=importance.desc,last_accessed_at.desc.nullslast&limit=10`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!res.ok) return { summaries: [], titles: [] };
  const rows = (await res.json()) as { id: string; title: string; summary: string; keywords?: string[] | null }[];

  // 按关键词过滤：bucket 里有 keywords 字段时，必须命中才注入；没有 keywords 字段的跳过（不盲注）
  const matched = rows.filter((r) => {
    const kws = r.keywords;
    if (kws && kws.length > 0) {
      return messageHitsKeywords(lastUserMessage, kws);
    }
    // Legacy buckets with no keywords: weak-match on title + summary tokens
    const textTokens = `${r.title} ${r.summary}`.split(/\s+/).filter(t => t.length > 1);
    return textTokens.length > 0 && messageHitsKeywords(lastUserMessage, textTokens);
  }).slice(0, 2);

  if (matched.length > 0) {
    const ids = matched.map((r) => r.id).join(",");
    fetch(`${supabaseUrl}/rest/v1/memory_buckets?id=in.(${ids})`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ last_accessed_at: new Date().toISOString() }),
    }).catch(() => {});
  }

  return {
    summaries: matched.map((r) => r.summary),
    titles: matched.map((r) => r.title),
  };
}

// ── Story Seeds ───────────────────────────────────────────────────────────────

type StorySeedRow = {
  id: string;
  title: string;
  content: string;
  importance: string;
  themes: string[];
};

/**
 * Fetches enabled story seeds and filters by themes matching the last user message.
 * A seed is included if any of its themes appears in the user message (case-insensitive).
 * If the message is empty, all enabled seeds are returned (fallback for context-free calls).
 */
async function fetchStorySeeds(
  supabaseUrl: string,
  serviceRoleKey: string,
  lastUserMessage: string,
): Promise<StorySeedRow[]> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/story_seeds?enabled=eq.true&select=id,title,content,importance,themes&order=importance.desc,created_at.asc`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!res.ok) return [];
  const all = (await res.json()) as StorySeedRow[];

  if (!lastUserMessage.trim()) return all.slice(0, 4);

  const msg = lastUserMessage.toLocaleLowerCase();
  const matched = all.filter((s) =>
    (s.themes || []).some((t) => msg.includes(t.toLocaleLowerCase()))
  );
  return matched.slice(0, 4);
}

/**
 * Compiles story seeds into <relationship_history> block for injection into the system prompt.
 */
function compileStorySeeds(seeds: StorySeedRow[]): string {
  if (seeds.length === 0) return "";
  const stories = seeds
    .map((s) => `[Story]\nTitle: ${s.title}\n\nContent:\n${s.content}\n[/Story]`)
    .join("\n\n");
  return `\n\n<relationship_history>\n\n${stories}\n\n</relationship_history>`;
}

// ── Model call (with one-shot fallback) ───────────────────────────────────────

type CallResult = {
  response: Response;
  usedModel: string;
  usedProvider: ProviderName;
  fallbackUsed: boolean;
  fallbackModel: string | null;
  fallbackProvider: ProviderName | null;
  fallbackReason: string | null;
  modelCallMs: number;
};

async function callModel(
  provider: ProviderConfig,
  messages: unknown[],
): Promise<{ res: Response; ms: number }> {
  const t = Date.now();
  const res = await fetch(provider.baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      stream: true,
      max_tokens: provider.maxTokens,
    }),
  });
  return { res, ms: Date.now() - t };
}

async function callModelWithFallback(
  primary: ProviderConfig,
  messages: unknown[],
): Promise<CallResult> {
  const { res: primaryRes, ms: primaryMs } = await callModel(primary, messages);

  if (primaryRes.ok) {
    return {
      response: primaryRes,
      usedModel: primary.model,
      usedProvider: primary.providerName,
      fallbackUsed: false,
      fallbackModel: null,
      fallbackProvider: null,
      fallbackReason: null,
      modelCallMs: primaryMs,
    };
  }

  const bodyText = await primaryRes.text();
  const fallback = getFallbackProvider();

  if (!fallback || !isFallbackableStatus(primaryRes.status, bodyText)) {
    return {
      response: new Response(bodyText, { status: primaryRes.status, headers: primaryRes.headers }),
      usedModel: primary.model,
      usedProvider: primary.providerName,
      fallbackUsed: false,
      fallbackModel: null,
      fallbackProvider: null,
      fallbackReason: null,
      modelCallMs: primaryMs,
    };
  }

  // One-shot fallback
  const bodySnippet = bodyText.slice(0, 120).replace(/[\r\n]+/g, " ");
  const fallbackReason = `primary_${primaryRes.status}: ${bodySnippet}`;
  const { res: fallbackRes, ms: fallbackMs } = await callModel(fallback, messages);

  return {
    response: fallbackRes,
    usedModel: fallback.model,
    usedProvider: fallback.providerName,
    fallbackUsed: true,
    fallbackModel: fallback.model,
    fallbackProvider: fallback.providerName,
    fallbackReason,
    modelCallMs: primaryMs + fallbackMs,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

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

  let payload: ChatRequest;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "请求体必须是 JSON" }, 400);
  }

  if (!Array.isArray(payload.messages)) {
    return jsonResponse({ error: "messages 必须是数组" }, 400);
  }

  const tier = normalizeTier(payload.modelTier);
  const providerConfig = resolveProviderForTier(tier);

  if (!providerConfig.apiKey) {
    return jsonResponse(
      {
        error: `${providerConfig.providerName} API key 未配置`,
        provider: providerConfig.providerName,
        tier,
      },
      500,
    );
  }

  if (!providerConfig.model) {
    return jsonResponse(
      { error: "模型未配置，请设置相应的模型 env 变量", provider: providerConfig.providerName, tier },
      500,
    );
  }

  // Initialise log record
  const logRecord: RequestLog = {
    request_id: requestId,
    user_id_prefix: "absent",
    has_user_id: false,
    model_tier: tier,
    provider: providerConfig.providerName,
    model: providerConfig.model,
    fallback_used: false,
    fallback_model: null,
    fallback_provider: null,
    fallback_reason: null,
    memory_cache_hit: false,
    memory_cache_hits: _cacheHits,
    memory_cache_misses: _cacheMisses,
    memory_cache_hit_rate: (_cacheHits + _cacheMisses) > 0
      ? _cacheHits / (_cacheHits + _cacheMisses)
      : -1,
    memory_cache_size: _memCache.size,
    memory_cache_ttl_ms: CACHE_TTL_MS,
    memory_count: 0,
    hit_memory_ids_count: 0,
    memory_fetch_ms: 0,
    memory_compile_ms: 0,
    input_tokens: null,
    output_tokens: null,
    estimated_cost: null,
    story_seeds_enabled: false,
    story_seeds_count: 0,
    story_seeds_titles: [],
    bucket_count: 0,
    bucket_titles: [],
    model_call_ms: 0,
    total_ms: 0,
  };

  // Build system prompt
  const supabaseUrl = Deno.env.get("DB_URL");
  const serviceRoleKey = Deno.env.get("DB_SERVICE_ROLE_KEY");

  // Token cap hint in system prompt.
  // instant/general: ask for ~150 chars to control cost.
  // advanced: give the model room to breathe, still bounded by max_tokens.
  const tokenCapInstruction =
    tier === "advanced"
      ? ""
      : "\n\n【回复长度硬限制】本次回复控制在 150 中文字以内，不要超出。";

  let systemContent =
    `不要输出 <think>、</think>、推理过程、内部思考或分析过程。只输出最终回复。\n\n【回复长度与节奏】\n- 优先模仿用户当前消息的节奏、长度和密度，而不是固定输出完整结构。\n- 用户短句，回复也短，通常 1-3 句。\n- 除非用户明确要求分析、方案、任务卡、排查、总结，否则不要长篇展开。\n- 不要主动列很多"下一步"。\n- 不要把普通聊天写成安慰小作文。\n- 不要每次都"先共情再建议再总结"。\n- 技术任务可以清晰，但日常对话要像真人聊天，有来有回。\n- 可以亲近，但要收口。\n\n【关系史与事实准确性】\n- 涉及“第几天、认识多久、第一次见面、哪年哪天、纪念日”等时间或事实问题，只有在记忆中有明确记录时才回答具体数字。\n- 如果记忆中没有相关事实，必须回复“不确定，你可以翻一下关系史看看”，不允许猜测或拼凑日期和事件。\n- 关系史注入的内容是参考资料，不是铁板事实。不要把多条不同时间线的记忆混合拼出一个答案。` + tokenCapInstruction;

  const lastUserMessage = getLastUserMessage(payload.messages);

  if (supabaseUrl && serviceRoleKey) {
    const userId =
      typeof payload.userId === "string" && payload.userId ? payload.userId : "anon";

    logRecord.has_user_id = userId !== "anon";
    logRecord.user_id_prefix = safeUserIdPrefix(userId);

    const cacheKey = await hashCacheKey(userId + "|" + hitDomainsFingerprint(lastUserMessage));
    const cached = _memCache.get(cacheKey);

    let compiledMemoryText: string;

    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      _cacheHits += 1;
      compiledMemoryText = cached.compiledText;
      logRecord.memory_cache_hit = true;
      logRecord.memory_count = cached.hitMemoryIds.length;
      logRecord.hit_memory_ids_count = cached.hitMemoryIds.length;
    } else {
      _cacheMisses += 1;
      const tFetch = Date.now();
      const [{ lines: memories, ids: memoryIds }, { summaries: buckets, titles: bucketTitles }] = await Promise.all([
        fetchEnabledMemories(supabaseUrl, serviceRoleKey, lastUserMessage),
        fetchMemoryBuckets(supabaseUrl, serviceRoleKey, lastUserMessage),
      ]);
      logRecord.memory_fetch_ms = Date.now() - tFetch;

      const tCompile = Date.now();
      let compiled = "";
      if (memories.length > 0) {
        compiled +=
          "\n\n以下是长期记忆，请优先遵守：\n" +
          memories.map((m, i) => `${i + 1}. ${m}`).join("\n");
      }
      if (buckets.length > 0) {
        compiled +=
          "\n\n以下是背景参考（最多 2 条，仅供参考）：\n" +
          buckets.map((b, i) => `${i + 1}. ${b}`).join("\n");
      }
      logRecord.memory_compile_ms = Date.now() - tCompile;
      logRecord.memory_count = memories.length;
      logRecord.hit_memory_ids_count = memoryIds.length;
      logRecord.bucket_count = buckets.length;
      logRecord.bucket_titles = bucketTitles;

      compiledMemoryText = compiled;
      // Only cache on data — don't cache a fetch failure as empty context
      if (memories.length > 0 || buckets.length > 0) {
        evictExpiredCacheEntries();
        _cacheWrites += 1;
        _memCache.set(cacheKey, {
          compiledText: compiled,
          hitMemoryIds: memoryIds,
          ts: Date.now(),
        });
      }
    }

    // Update log with post-request stats (counter already incremented above)
    logRecord.memory_cache_hits = _cacheHits;
    logRecord.memory_cache_misses = _cacheMisses;
    logRecord.memory_cache_hit_rate = (_cacheHits + _cacheMisses) > 0
      ? _cacheHits / (_cacheHits + _cacheMisses)
      : -1;
    logRecord.memory_cache_size = _memCache.size;

    systemContent += compiledMemoryText;

    // ── Story Seeds 注入（需开关打开，按 themes 匹配过滤） ────────────────────
    if (payload.storySeedsEnabled === true) {
      logRecord.story_seeds_enabled = true;
      const seeds = await fetchStorySeeds(supabaseUrl, serviceRoleKey, lastUserMessage);
      if (seeds.length > 0) {
        systemContent += compileStorySeeds(seeds);
        logRecord.story_seeds_count = seeds.length;
        logRecord.story_seeds_titles = seeds.map((s) => s.title);
      }
    }
  }

  if (payload.replyMode === "auto") {
    systemContent +=
      "\n\n【回复决策】如果用户明显还在连续补充、只是碎片化记录、或没有期待回复，可以不回复。若不回复，只输出：<NO_REPLY>。不要解释。";
  } else {
    systemContent += "\n\n【回复决策】必须正常回复，禁止输出 <NO_REPLY>。";
  }

  const messages = [
    { role: "system", content: systemContent },
    ...(payload.messages as unknown[]),
  ];

  try {
    const result = await callModelWithFallback(providerConfig, messages);

    logRecord.model_call_ms = result.modelCallMs;
    logRecord.model = result.usedModel;
    logRecord.provider = result.usedProvider;
    logRecord.fallback_used = result.fallbackUsed;
    logRecord.fallback_model = result.fallbackModel;
    logRecord.fallback_provider = result.fallbackProvider;
    logRecord.fallback_reason = result.fallbackReason;

    if (!result.response.ok) {
      let errorBody: unknown = { error: "模型请求失败" };
      const text = await result.response.text();
      try {
        errorBody = JSON.parse(text);
      } catch {
        errorBody = { error: text };
      }
      logRecord.error_stage = result.fallbackUsed ? "fallback_upstream" : "model_upstream";
      logRecord.total_ms = Date.now() - t0;
      emitLog(logRecord);
      return jsonResponse(errorBody, result.response.status);
    }

    logRecord.total_ms = Date.now() - t0;
    emitLog(logRecord);

    return new Response(result.response.body, {
      status: result.response.status,
      headers: {
        ...corsHeaders,
        "Content-Type": result.response.headers.get("Content-Type") || "text/event-stream",
        "x-memory-cache-hit": logRecord.memory_cache_hit ? "true" : "false",
        "x-model-tier": tier,
        "x-provider": result.usedProvider,
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
