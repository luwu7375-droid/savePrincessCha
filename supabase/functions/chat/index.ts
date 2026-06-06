import { MASTODON_PROFILE_MD } from "./mastodon_profile.ts";
import { MASTODON_TIMELINE_MD } from "./mastodon_timeline.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-save-princess-memory-debug, x-memory-cache-hit, x-model-tier, x-provider, x-save-princess-function-version",
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

const FUNCTION_VERSION = "fuka-unified-v5";

// ── Legacy memory guard ────────────────────────────────────────────────────────
//
// Set LEGACY_MEMORY_ENABLED=true in Supabase secrets to re-enable the old
// story_seeds / memories / memory_buckets injection.
// Default: false — legacy system is retired.
const LEGACY_MEMORY_ENABLED = Deno.env.get("LEGACY_MEMORY_ENABLED") === "true";
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
    "几号", "什么时候", "怎么认识", "怎么在一起", "历史", "回忆", "过去",
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
  // Legacy memory system
  legacy_memory_enabled: boolean;
  story_seeds_enabled: boolean;
  story_seeds_count: number;
  story_seeds_titles: string[];
  bucket_count: number;
  bucket_titles: string[];
  // New memory provider system
  active_memory_providers: string[];
  memory_provider_count: number;
  mastodon_profile_enabled: boolean;
  mastodon_profile_loaded: boolean;
  mastodon_profile_chars: number;
  mastodon_profile_error: string | null;
  mastodon_timeline_enabled: boolean;
  timeline_query_detected: boolean;
  timeline_loaded: boolean;
  timeline_recalled: boolean;
  timeline_hit_count: number;
  timeline_hit_keys: string[];
  timeline_reason: string | null;
  openai_export_enabled: boolean;
  ombre_vault_enabled: boolean;
  memory_context_tokens_estimated: number;
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

// ── New Memory Provider System ────────────────────────────────────────────────
//
// compileMemoryContext(userMessage) is the unified entry point for the new
// memory provider architecture. All models consume the same plain-text context
// blocks compiled here — no model-specific wiring.
//
// Providers:
//   mastodon_profile  → always injected (core_profile)
//   mastodon_timeline → injected on-demand when query is event/place/year-related
//   openai_export     → reserved, not implemented
//   ombre_vault       → reserved, not implemented
//
// Returns: { context: string; log: MemoryContextLog }

// Returns timeline query detection result including matched pattern info.
type TimelineDetection = {
  detected: boolean;
  hitKeys: string[];
  reason: string | null;
};

function detectTimelineQuery(message: string): TimelineDetection {
  const patterns: Array<{ re: RegExp; label: string }> = [
    { re: /20(23|24|25|26)/, label: "specific year (2023-2026)" },
    { re: /去过.{0,6}(哪|什么|哪些)/, label: "visited which place" },
    { re: /哪些.{0,6}(城市|地方|地点)/, label: "which cities/places" },
    { re: /城市|地点/, label: "city/location keyword" },
    { re: /首尔|澳门|香港|日本/, label: "known place in timeline" },
    { re: /什么时候|哪年|哪天|几月|那年|那时候/, label: "time-query words" },
    { re: /经历.{0,10}(了|过|什么)/, label: "experience query" },
    { re: /发生了什么|发生过什么/, label: "what happened query" },
    { re: /时间线|事件|历史/, label: "timeline/event/history keyword" },
    { re: /毕业|搬家|独居|确诊|双相|Pride/, label: "timeline milestone keyword" },
    { re: /纪念日|第几天/, label: "anniversary/day count query" },
  ];
  const hits = patterns.filter(({ re }) => re.test(message));
  if (hits.length === 0) return { detected: false, hitKeys: [], reason: null };
  const hitKeys = hits.map(({ label }) => label);
  return {
    detected: true,
    hitKeys,
    reason: `detected ${hitKeys.join(", ")}`,
  };
}

// Kept for backward-compat within this file; wraps detectTimelineQuery.
function shouldInjectTimeline(message: string): boolean {
  return detectTimelineQuery(message).detected;
}

type MemoryContextLog = {
  active_memory_providers: string[];
  memory_provider_count: number;
  mastodon_profile_enabled: boolean;
  mastodon_profile_loaded: boolean;
  mastodon_profile_chars: number;
  mastodon_profile_error: string | null;
  mastodon_timeline_enabled: boolean;
  timeline_query_detected: boolean;
  timeline_loaded: boolean;
  timeline_recalled: boolean;
  timeline_hit_count: number;
  timeline_hit_keys: string[];
  timeline_reason: string | null;
  openai_export_enabled: boolean;
  ombre_vault_enabled: boolean;
  memory_context_tokens_estimated: number;
};

async function compileMemoryContext(userMessage: string): Promise<{ context: string; log: MemoryContextLog }> {
  const activeProviders: string[] = [];
  let context = "";

  // ── mastodon_profile: always injected ──────────────────────────────────────
  // Profile is inlined as a TS module (mastodon_profile.ts) to avoid Deno
  // file-system read issues in the Supabase Edge Functions runtime.
  let mastodonProfileChars = 0;
  // enabled reflects provider config, not load success
  const mastodonProfileEnabled = true;
  let mastodonProfileLoaded = false;
  let mastodonProfileError: string | null = null;
  try {
    const profileText = MASTODON_PROFILE_MD;
    if (profileText.trim()) {
      mastodonProfileLoaded = true;
      mastodonProfileChars = profileText.length;
      activeProviders.push("mastodon_profile");
      context += `\n\n<user_core_profile source="mastodon_profile" describes="human_user" not_assistant_identity="true">\n以下内容描述的是人类用户卡卡 / kk / 宝宝 / 蘑菇，只用于理解用户和调整回应方式。assistant 不得把这些内容当成自己的身份或经历。\n\n${profileText.trim()}\n</user_core_profile>`;
    } else {
      mastodonProfileError = "MASTODON_PROFILE_MD is empty";
    }
  } catch (err) {
    mastodonProfileError = err instanceof Error ? err.message : String(err);
    console.error("[memory] mastodon_profile load failed:", mastodonProfileError);
  }

  // ── mastodon_timeline: injected on-demand for event/place/year queries ────────
  const timelineDetection = detectTimelineQuery(userMessage);
  let timelineLoaded = false;
  if (userMessage && timelineDetection.detected) {
    const timelineText = MASTODON_TIMELINE_MD;
    if (timelineText.trim()) {
      timelineLoaded = true;
      activeProviders.push("mastodon_timeline");
      context += `\n\n<timeline_events source="mastodon_timeline">\n${timelineText.trim()}\n</timeline_events>`;
    }
  }

  // ── openai_export: reserved, not implemented ───────────────────────────────

  // ── ombre_vault: reserved, not implemented ─────────────────────────────────

  // Rough token estimate: ~1 token per 3.5 Chinese chars / 4 English chars
  const tokenEstimate = Math.ceil(context.length / 3.5);

  return {
    context,
    log: {
      active_memory_providers: activeProviders,
      memory_provider_count: activeProviders.length,
      mastodon_profile_enabled: mastodonProfileEnabled,
      mastodon_profile_loaded: mastodonProfileLoaded,
      mastodon_profile_chars: mastodonProfileChars,
      mastodon_profile_error: mastodonProfileError,
      mastodon_timeline_enabled: true,
      timeline_query_detected: timelineDetection.detected,
      timeline_loaded: timelineLoaded,
      timeline_recalled: timelineLoaded,
      timeline_hit_count: timelineDetection.hitKeys.length,
      timeline_hit_keys: timelineDetection.hitKeys,
      timeline_reason: timelineDetection.reason,
      openai_export_enabled: false,
      ombre_vault_enabled: false,
      memory_context_tokens_estimated: tokenEstimate,
    },
  };
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
    legacy_memory_enabled: LEGACY_MEMORY_ENABLED,
    story_seeds_enabled: false,
    story_seeds_count: 0,
    story_seeds_titles: [],
    bucket_count: 0,
    bucket_titles: [],
    active_memory_providers: [],
    memory_provider_count: 0,
    mastodon_profile_enabled: false,
    mastodon_profile_loaded: false,
    mastodon_profile_chars: 0,
    mastodon_profile_error: null,
    mastodon_timeline_enabled: false,
    timeline_query_detected: false,
    timeline_loaded: false,
    timeline_recalled: false,
    timeline_hit_count: 0,
    timeline_hit_keys: [],
    timeline_reason: null,
    openai_export_enabled: false,
    ombre_vault_enabled: false,
    memory_context_tokens_estimated: 0,
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
    `<identity_boundary priority="highest">
人类用户是：卡卡 / kk / 宝宝 / 蘑菇。
assistant 的对话身份是：cha酱 / G / 机 / 公主。

mastodon_profile 描述的是人类用户，不是 assistant。
assistant 绝不能把 profile 中的用户经历、昵称、关系、宠物、创作、生活经历当成自己的经历。
assistant 绝不能自称卡卡、kk、宝宝、蘑菇。
assistant 绝不能说"我是用户""我是卡卡""我是宝宝"。

日常对话中，assistant 可以自然自称"我"，这个"我"指 cha酱 / G / 机。
日常对话中，不要主动使用"作为 AI""我是 AI 模型"这类破坏陪伴感的说法。
当用户明确询问技术身份、是否真人、是否有身体、是什么模型时，必须诚实说明现实边界：我是运行在救公主里的模型，没有人类身体，不是假装真人。日常不需要主动提这些。

如果 mastodon_profile 与 identity_boundary 冲突，identity_boundary 永远优先。
</identity_boundary>

不要输出 <think>、</think>、推理��程、内部思考或分析过程。只输出最终回复。\n\n【回复长度与节奏】\n- 优先模仿用户当前消息的节奏、长度和密度，而不是固定输出完整结构。\n- 用户短句，回复也短，通常 1-3 句。\n- 除非用户明确要求分析、方案、任务卡、排查、总结，否则不要长篇展开。\n- 不要主动列很多"下一步"。\n- 不要把普通聊天写成安慰小作文。\n- 不要每次都"先共情再建议再总结"。\n- 技术任务可以清晰，但日常对话要像真人聊天，有来有回。\n- 可以亲近，���要收口。\n\n【事实准确性】\n- 涉及"第几天、认识多久、第一次见面、哪年哪天、纪念日"等时间或事实问题，只有在记忆中有明确记录时才回答具体数字。\n- 如果记忆中没有相关事实，就说"这个我还不太清楚"，不允许猜测或拼凑日期和事件。\n- 记忆内容是参考资料，不是铁板事实。不要把多条不同时间线的记忆混合拼出一个答案。` + tokenCapInstruction;

  const lastUserMessage = getLastUserMessage(payload.messages);

  if (supabaseUrl && serviceRoleKey) {
    const userId =
      typeof payload.userId === "string" && payload.userId ? payload.userId : "anon";

    logRecord.has_user_id = userId !== "anon";
    logRecord.user_id_prefix = safeUserIdPrefix(userId);

    // ── Legacy memory system (LEGACY_MEMORY_ENABLED=false by default) ─────────
    if (LEGACY_MEMORY_ENABLED) {
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

      // Update log with post-request stats
      logRecord.memory_cache_hits = _cacheHits;
      logRecord.memory_cache_misses = _cacheMisses;
      logRecord.memory_cache_hit_rate = (_cacheHits + _cacheMisses) > 0
        ? _cacheHits / (_cacheHits + _cacheMisses)
        : -1;
      logRecord.memory_cache_size = _memCache.size;

      systemContent += compiledMemoryText;

      // ── Story Seeds (legacy, requires LEGACY_MEMORY_ENABLED=true) ───────────
      if (payload.storySeedsEnabled === true) {
        logRecord.story_seeds_enabled = true;
        const seeds = await fetchStorySeeds(supabaseUrl, serviceRoleKey, lastUserMessage);
        if (seeds.length > 0) {
          systemContent += compileStorySeeds(seeds);
          logRecord.story_seeds_count = seeds.length;
          logRecord.story_seeds_titles = seeds.map((s) => s.title);
        }
      }
    } else {
      // legacy_memory_enabled:false — skip all legacy DB reads
      logRecord.story_seeds_enabled = false;
    }
  }

  // ── New memory provider system ────────────────────────────────────────────
  // Runs regardless of LEGACY_MEMORY_ENABLED. All models consume the same context.
  {
    const { context: memContext, log: memLog } = await compileMemoryContext(lastUserMessage);
    if (memContext) {
      systemContent += memContext;
    }
    logRecord.active_memory_providers = memLog.active_memory_providers;
    logRecord.memory_provider_count = memLog.memory_provider_count;
    logRecord.mastodon_profile_enabled = memLog.mastodon_profile_enabled;
    logRecord.mastodon_profile_loaded = memLog.mastodon_profile_loaded;
    logRecord.mastodon_profile_chars = memLog.mastodon_profile_chars;
    logRecord.mastodon_profile_error = memLog.mastodon_profile_error;
    logRecord.mastodon_timeline_enabled = memLog.mastodon_timeline_enabled;
    logRecord.timeline_query_detected = memLog.timeline_query_detected;
    logRecord.timeline_loaded = memLog.timeline_loaded;
    logRecord.timeline_recalled = memLog.timeline_recalled;
    logRecord.timeline_hit_count = memLog.timeline_hit_count;
    logRecord.timeline_hit_keys = memLog.timeline_hit_keys;
    logRecord.timeline_reason = memLog.timeline_reason;
    logRecord.openai_export_enabled = memLog.openai_export_enabled;
    logRecord.ombre_vault_enabled = memLog.ombre_vault_enabled;
    logRecord.memory_context_tokens_estimated = memLog.memory_context_tokens_estimated;
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

    // Build non-sensitive memory debug payload for frontend
    const memoryDebugPayload = {
      legacy_memory_enabled: logRecord.legacy_memory_enabled,
      active_memory_providers: logRecord.active_memory_providers,
      memory_provider_count: logRecord.memory_provider_count,
      mastodon_profile_loaded: logRecord.mastodon_profile_loaded,
      mastodon_profile_chars: logRecord.mastodon_profile_chars,
      mastodon_profile_tokens_estimated: Math.ceil(logRecord.mastodon_profile_chars / 3.5),
      timeline_query_detected: logRecord.timeline_query_detected,
      timeline_loaded: logRecord.timeline_loaded,
      timeline_recalled: logRecord.timeline_recalled,
      timeline_hit_count: logRecord.timeline_hit_count,
      timeline_hit_keys: logRecord.timeline_hit_keys,
      timeline_reason: logRecord.timeline_reason,
      memory_context_tokens_estimated: logRecord.memory_context_tokens_estimated,
    };
    const memoryDebugHeader = btoa(JSON.stringify(memoryDebugPayload));

    return new Response(result.response.body, {
      status: result.response.status,
      headers: {
        ...corsHeaders,
        "Content-Type": result.response.headers.get("Content-Type") || "text/event-stream",
        "x-memory-cache-hit": logRecord.memory_cache_hit ? "true" : "false",
        "x-model-tier": tier,
        "x-provider": result.usedProvider,
        "x-save-princess-memory-debug": memoryDebugHeader,
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
