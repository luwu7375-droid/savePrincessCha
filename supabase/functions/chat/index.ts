import { MASTODON_TIMELINE_MD } from "./mastodon_timeline.ts";
import { CONVERSATION_BEHAVIOR_PACK } from "./conversation_behavior.ts";
import { callGeminiEmotion } from "../_shared/gemini-service.ts";
// import { compilePersonalityLayerContext, fetchLayer1Features, fetchLayer2Features, afterChat as afterChatPersonality } from "./personality_system.ts";
import { runAfterChatVault } from "./vault_runner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-save-princess-memory-debug, x-memory-cache-hit, x-model-tier, x-provider, x-model, x-fallback-used, x-fallback-reason, x-save-princess-function-version, x-chat-status, x-memory-promoted",
};

type TimeContext = {
  timezone?: string;
  local_iso?: string;
  local_hour?: number;
  local_minute?: number;
  local_date?: string;
  conversation_started_at?: string;
  message_count?: number;
};

type ConversationState = {
  message_count?: number;
  long_chat?: boolean;
  loop_detected?: boolean;
  loop_reason?: string | null;
  recent_topic_hint?: string | null;
  topic_route?: string | null;
  secondary_route?: string | null;
  project_lock_turns?: number;
  project_silenced_ttl?: number;
  project_trigger_matched?: boolean;
  project_trigger_reason?: string | null;
  latest_user_message_for_detection?: string | null;
  previous_topic_route?: string | null;
  topic_switch_detected?: boolean;
  topic_switch_from?: string | null;
  topic_switch_to?: string | null;
  route_scores?: Record<string, number>;
};

type RouteName =
  | "project_work"
  | "ai_nostalgia"
  | "care_low_energy"
  | "historical_roleplay"
  | "intimacy"
  | "meta_complaint"
  | "casual";

function detectRoute(msg: string): RouteName {
  const DEV_VERBS = /上工|继续修|看\s*debug|帮我想代码问题|进入工作台|现在说项目/i;
  const ROUTE_AI_NOSTALGIA = /你和4o|4o是什么关系|你们是什么关系|你知道4o吗/i;
  const ROUTE_CARE_LOW = /头痛|头很痛|头疼|不舒服|不想动|好累|太累|累了|难受|浑身|身体/i;
  const ROUTE_HISTORICAL = /前世|你当过什么|你做过什么|历史角色|历史身份|旧版本的你/i;
  const ROUTE_INTIMACY = /我想你|好想你|就想陪|陪着我|不想工作|告解/i;
  const ROUTE_META_COMPLAINT = /为什么你|你怎么|你好笨|你笨|真笨|读空气|不会读|笨笨|怎么这样|你不懂|你不明白|你搞不清|有没有搞错/i;
  if (ROUTE_AI_NOSTALGIA.test(msg)) return "ai_nostalgia";
  if (ROUTE_HISTORICAL.test(msg)) return "historical_roleplay";
  if (ROUTE_META_COMPLAINT.test(msg)) return "meta_complaint";
  if (ROUTE_CARE_LOW.test(msg)) return "care_low_energy";
  if (ROUTE_INTIMACY.test(msg)) return "intimacy";
  if (DEV_VERBS.test(msg)) return "project_work";
  return "casual";
}

type ChatRequest = {
  messages?: unknown;
  model?: string;
  stream?: boolean;
  replyMode?: string;
  userId?: string;
  modelTier?: string; // "instant" | "general" | "advanced"
  storySeedsEnabled?: boolean; // legacy, no longer used
  conversationId?: string; // used by conversation_history_provider
  timeContext?: TimeContext;
  conversation_state?: ConversationState;
  userMessageId?: number | null; // messages.id of the triggering user message
  rawUserMessage?: string | null; // original user input before any frontend wrapping
  emojiGuide?: string | null; // client-built guide of usable custom emoji shortcodes
};

// ── Model tier ────────────────────────────────────────────────────────────────
//
// Per-tier primary/fallback provider routing:
//
//   instant  → primary: 55api  fallback: 芙卡
//   general  → primary: 55api  fallback: 芙卡
//   advanced → primary: 55api  fallback: 芙卡
//
// New env vars (take priority):
//   FIFTYFIVE_BASE_URL / FIFTYFIVE_API_KEY   — 55api provider
//   FUKA_BASE_URL / FUKA_API_KEY             — 芙卡 provider
//
//   MODEL_INSTANT_PRIMARY / MODEL_INSTANT_FALLBACK
//   MODEL_GENERAL_PRIMARY / MODEL_GENERAL_FALLBACK
//   MODEL_ADVANCED_PRIMARY / MODEL_ADVANCED_FALLBACK
//
//   MAX_OUTPUT_TOKENS_INSTANT  (default 300)
//   MAX_OUTPUT_TOKENS_GENERAL  (default 300)
//   MAX_OUTPUT_TOKENS_ADVANCED (default 1200)
//
//   MODEL_TIMEOUT_MS_INSTANT  (default 20000)
//   MODEL_TIMEOUT_MS_GENERAL  (default 35000)
//   MODEL_TIMEOUT_MS_ADVANCED (default 60000)
//
// Legacy / compatibility env vars (still honoured as fallback):
//   OPENROUTER_BASE_URL / OPENROUTER_API_KEY
//   MODEL_NAME   — used if primary model env unset
//   FAST_MODEL   — model for instant tier
//   ADVANCED_MODEL / FALLBACK_MODEL

type ModelTier = "instant" | "general" | "advanced";

const VALID_TIERS: ModelTier[] = ["instant", "general", "advanced"];

function normalizeTier(raw: string | undefined): ModelTier {
  if (raw && VALID_TIERS.includes(raw as ModelTier)) return raw as ModelTier;
  return "general";
}

// ── Provider config ───────────────────────────────────────────────────────────

type ProviderName = "fiftyfive" | "fuka" | "openrouter";

type ProviderConfig = {
  providerName: ProviderName;
  baseUrl: string; // full completions endpoint URL
  apiKey: string;
  model: string;
  maxTokens: number;
  tier: ModelTier;
  role: "primary" | "fallback";
};

type TierProviders = {
  primary: ProviderConfig;
  fallback: ProviderConfig | null;
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

function resolveProviderForTier(tier: ModelTier): TierProviders {
  const fiftyfiveBaseUrl = toCompletionsUrl(
    Deno.env.get("FIFTYFIVE_BASE_URL") ||
    Deno.env.get("OPENROUTER_BASE_URL") ||
    "https://api.openai.com/v1/chat/completions",
  );

  // ── 55api per-group keys (primary) ──────────────────────────────────────────
  // Each token group is bound to specific models; fall back to generic key last.
  const legacyFiftyfiveKey = Deno.env.get("FIFTYFIVE_API_KEY") || "";

  const fiftyfiveKeyGemini =
    Deno.env.get("FIFTYFIVE_API_KEY_GEMINI") || legacyFiftyfiveKey;
  const fiftyfiveKeyGpt =
    Deno.env.get("FIFTYFIVE_API_KEY_GPT") || legacyFiftyfiveKey;
  const fiftyfiveKeyClaude =
    Deno.env.get("FIFTYFIVE_API_KEY_CLAUDE") || legacyFiftyfiveKey;

  // ── 芙卡 (fallback) ─────────────────────────────────────────────────────────
  const fukaBaseUrl = toCompletionsUrl(
    Deno.env.get("FUKA_BASE_URL") ||
    Deno.env.get("OPENROUTER_BASE_URL") ||
    "https://api.fuka.win/v1/chat/completions",
  );
  const fukaApiKey =
    Deno.env.get("FUKA_API_KEY") ||
    Deno.env.get("OPENROUTER_API_KEY") ||
    "";

  // ── Legacy model name defaults ──────────────────────────────────────────────
  const legacyDefault =
    Deno.env.get("DEFAULT_MODEL") || Deno.env.get("MODEL_NAME") || "";

  // ── fiftyfive model name guard ───────────────────────────────────────────────
  // Blocks fuka-specific channel names from being sent to fiftyfive.
  // fuka display names contain channel identifiers like [浣溪沙], [鸢尾花], [百香果],
  // or trailing variant numbers ①②. These are NOT valid fiftyfive model ids.
  // Note: 55api model ids CAN contain Chinese prefixes like [A-按量], [G-按量],
  // [K-按量], [aws-量] — these are valid and must NOT be blocked.
  function assertFiftyfiveModel(model: string, tierName: string): void {
    const FUKA_CHANNEL_PATTERN = /浣溪沙|鸢尾花|百香果|\u2460|\u2461|\u2462|\u2463|\u2464/;
    if (FUKA_CHANNEL_PATTERN.test(model)) {
      console.error(JSON.stringify({
        fn: "resolveProviderForTier",
        event: "config_error_fuka_model_on_fiftyfive",
        tier: tierName,
        model,
        hint: "fuka channel name detected in fiftyfive primary model. Set MODEL_" + tierName.toUpperCase() + "_PRIMARY to a valid 55api model id.",
      }));
      throw new Error(`config_error: fuka channel name detected in fiftyfive primary for tier ${tierName}: "${model}". Check MODEL_${tierName.toUpperCase()}_PRIMARY secret.`);
    }
  }

  switch (tier) {
    case "instant": {
      const maxTokens = parseInt(Deno.env.get("MAX_OUTPUT_TOKENS_INSTANT") || "300", 10);
      const primaryModel =
        Deno.env.get("MODEL_INSTANT_PRIMARY") ||
        Deno.env.get("FAST_MODEL") ||
        legacyDefault;
      assertFiftyfiveModel(primaryModel, "instant");
      const fallbackModel =
        Deno.env.get("MODEL_INSTANT_FALLBACK") ||
        Deno.env.get("FALLBACK_MODEL") ||
        "";
      const primary: ProviderConfig = {
        providerName: "fiftyfive", baseUrl: fiftyfiveBaseUrl,
        apiKey: fiftyfiveKeyGemini, model: primaryModel, maxTokens, tier, role: "primary",
      };
      const fallback: ProviderConfig | null = fukaApiKey && fallbackModel
        ? { providerName: "fuka", baseUrl: fukaBaseUrl, apiKey: fukaApiKey, model: fallbackModel, maxTokens, tier, role: "fallback" }
        : null;
      return { primary, fallback };
    }
    case "advanced": {
      const maxTokens = parseInt(Deno.env.get("MAX_OUTPUT_TOKENS_ADVANCED") || "1200", 10);
      const primaryModel =
        Deno.env.get("MODEL_ADVANCED_PRIMARY") ||
        Deno.env.get("ADVANCED_MODEL") ||
        legacyDefault;
      assertFiftyfiveModel(primaryModel, "advanced");
      const fallbackModel =
        Deno.env.get("MODEL_ADVANCED_FALLBACK") ||
        Deno.env.get("FALLBACK_MODEL") ||
        "";
      const primary: ProviderConfig = {
        providerName: "fiftyfive", baseUrl: fiftyfiveBaseUrl,
        apiKey: fiftyfiveKeyClaude, model: primaryModel, maxTokens, tier, role: "primary",
      };
      const fallback: ProviderConfig | null = fukaApiKey && fallbackModel
        ? { providerName: "fuka", baseUrl: fukaBaseUrl, apiKey: fukaApiKey, model: fallbackModel, maxTokens, tier, role: "fallback" }
        : null;
      return { primary, fallback };
    }
    default: {
      // general
      const maxTokens = parseInt(Deno.env.get("MAX_OUTPUT_TOKENS_GENERAL") || "300", 10);
      const primaryModel =
        Deno.env.get("MODEL_GENERAL_PRIMARY") ||
        legacyDefault;
      assertFiftyfiveModel(primaryModel, "general");
      const fallbackModel =
        Deno.env.get("MODEL_GENERAL_FALLBACK") ||
        Deno.env.get("FALLBACK_MODEL") ||
        "";
      const primary: ProviderConfig = {
        providerName: "fiftyfive", baseUrl: fiftyfiveBaseUrl,
        apiKey: fiftyfiveKeyGpt, model: primaryModel, maxTokens, tier: "general", role: "primary",
      };
      const fallback: ProviderConfig | null = fukaApiKey && fallbackModel
        ? { providerName: "fuka", baseUrl: fukaBaseUrl, apiKey: fukaApiKey, model: fallbackModel, maxTokens, tier: "general", role: "fallback" }
        : null;
      return { primary, fallback };
    }
  }
}



/** Returns true for upstream errors that warrant a one-shot fallback attempt. */
function isFallbackableStatus(status: number, bodyText: string): boolean {
  if (status === 408 || status === 429 || status >= 500) return true;
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

const FUNCTION_VERSION = "fuka-unified-v8";

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
  writing: ["OC", "家产", "深爱者优先", "《深爱者优先》", "剧情", "角色", "设定", "写作", "大纲", "世界观", "森川", "修司", "里佳", "成濑", "真田", "安彦", "渡边", "晃", "淳", "莉珂", "琉华", "续写", "文风"],
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
  // Persona memories (L1 — always injected from memories table)
  persona_memories_loaded: boolean;
  persona_memories_count: number;
  persona_memories_categories: string[];
  persona_memories_error: string | null;
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
  // Project Memory Provider (L2 — keyword-triggered)
  project_memory_loaded: boolean;
  project_memory_recalled: boolean;
  project_memory_hit_count: number;
  project_memory_keys: string[];
  project_memory_reason: string | null;
  project_memory_suppressed_reason: string | null;
  // Writing Memory Provider (keyword-triggered)
  writing_memory_loaded: boolean;
  writing_memory_recalled: boolean;
  writing_memory_reason: string | null;
  // Relationship Context Provider (keyword-triggered)
  relationship_context_loaded: boolean;
  relationship_context_recalled: boolean;
  relationship_context_reason: string | null;
  // Life Context Provider (keyword-triggered)
  life_context_loaded: boolean;
  life_context_recalled: boolean;
  life_context_reason: string | null;
  // Historical AI Usage Provider (keyword-triggered)
  historical_ai_usage_loaded: boolean;
  historical_ai_usage_recalled: boolean;
  historical_ai_usage_reason: string | null;
  // OpenAI Archive Provider
  openai_archive_loaded: boolean;
  openai_archive_recalled: boolean;
  openai_archive_hit_count: number;
  openai_archive_keys: string[];
  openai_archive_reason: string | null;
  historical_roleplay_hit_count: number;
  historical_roleplay_reason: string | null;
  memory_context_tokens_estimated: number;
  // Conversation History Provider
  conversation_history_enabled: boolean;
  conversation_history_query_detected: boolean;
  conversation_history_loaded: boolean;
  conversation_history_recalled: boolean;
  conversation_history_hit_count: number;
  conversation_history_hit_conversation_ids: string[];
  conversation_history_hit_message_ids: string[];
  conversation_history_reason: string | null;
  conversation_history_filtered_by_route: boolean;
  conversation_history_suppressed_count: number;
  conversation_history_allowed_count: number;
  running_summary_attempted: boolean;
  running_summary_injected: boolean;
  running_summary_message_count: number;
  running_summary_kept_recent_count: number;
  running_summary_error: string | null;
  model_call_ms: number;
  total_ms: number;
  error_stage?: string;
  // Instructions allowlist (v2)
  instructions_allowlist_enabled: boolean;
  instructions_loaded_count: number;
  instructions_suppressed_count: number;
  instructions_loaded_categories: string[];
  instructions_suppressed_categories: string[];
  persona_memories_total_chars: number;
  persona_memories_chars_budget_hit: boolean;
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

// ── Conversation History Provider ────────────────────────────────────────────
//
// retrieval_only: only fetches when user references a past conversation.
// Trigger patterns: 刚才, 上次, 之前, 我们说过, 换窗, 继续刚才, etc.
// Scoring: keyword overlap + recency + role weighting + sensitivity downrank.
// Top 3-5 hits injected as <conversation_history_context> block.

const HISTORY_TRIGGER_PATTERNS: RegExp[] = [
  /刚才|上次|之前|前面|早些/,
  /那个(?!时候)|这件事|我们说过|我们聊过/,
  /继续刚才|换窗|上一个对话|上一段/,
  /你还记得|之前那个项目|刚刚那个|接着说/,
  /继续做|下一步.{0,4}怎么|这个怎么改/,
  /跟.{0,4}说什么|检查之前|参考我们刚刚/,
  /我刚才说|我之前说|上个窗|上个会话|上次说|我说过/,
  /想去哪|去哪里|想去哪里|说想去/,
];

// High-sensitivity keywords — downrank unless user's message also contains them.
const SENSITIVITY_KEYWORDS = [
  "家庭", "父母", "双相", "确诊", "崩溃", "创伤", "惊恐", "财务", "钱", "余额",
  "自杀", "轻生", "去世", "死", "住院", "手术",
];

// Project / domain keywords that boost relevance score.
const PROJECT_KEYWORDS = [
  "记忆", "profile", "timeline", "CC", "UI", "图片", "上传",
  "记忆中枢", "provider", "memory", "chat", "edge function", "supabase",
];

// Intent-based keyword expansions for the overlap scorer.
// CJK text has no whitespace between words, so a naive split("…").filter(w => content.includes(w))
// on "想去哪里" would never match "我好想再去台湾". These expansions inject domain vocabulary
// into the scoring pool when a recognised query intent is detected.
type IntentExpansion = { trigger: RegExp; extraKeywords: string[] };
const INTENT_EXPANSIONS: IntentExpansion[] = [
  {
    trigger: /想去哪|去哪里|想去哪里|说想去/,
    extraKeywords: ["台湾", "日本", "首尔", "香港", "澳门", "旅行", "演唱会", "想去", "再去"],
  },
];

function detectConversationHistoryQuery(message: string): { detected: boolean; reason: string | null } {
  const hit = HISTORY_TRIGGER_PATTERNS.find((re) => re.test(message));
  if (!hit) return { detected: false, reason: null };
  return { detected: true, reason: `pattern: ${hit.source}` };
}

type HistoryHit = {
  messageId: string;
  conversationId: string;
  createdAt: string;
  role: string;
  content: string;
  score: number;
  reason: string;
};

async function fetchConversationHistory(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  currentConversationId: string | undefined,
  lastUserMessage: string,
  topicRoute: string | null,
): Promise<{ hits: HistoryHit[]; suppressedCount: number }> {
  // SECURITY: service role bypasses RLS, user_id filter is mandatory.
  let url =
    `${supabaseUrl}/rest/v1/messages` +
    `?user_id=eq.${encodeURIComponent(userId)}` +
    `&select=id,role,content,created_at,conversation_id` +
    `&order=created_at.desc&limit=200`;
  if (currentConversationId) {
    url += `&conversation_id=neq.${encodeURIComponent(currentConversationId)}`;
  }

  let rows: { id: string; role: string; content: string; created_at: string; conversation_id: string }[];
  try {
    const res = await fetch(url, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!res.ok) return { hits: [], suppressedCount: 0 };
    rows = await res.json();
  } catch {
    return { hits: [], suppressedCount: 0 };
  }

  // Extract query words (length ≥ 2) for overlap scoring
  const queryWords = lastUserMessage
    .split(/[\s，。！？、\n]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);

  // Intent expansion: inject domain vocabulary for recognised query intents.
  // Compensates for CJK tokenisation where words share no whitespace boundaries,
  // e.g. "想去哪里" never produces "台湾" as a token, but we still want to match
  // history messages containing "我好想再去台湾".
  const expandedKeywords: string[] = [];
  for (const expansion of INTENT_EXPANSIONS) {
    if (expansion.trigger.test(lastUserMessage)) {
      expandedKeywords.push(...expansion.extraKeywords);
    }
  }
  const allQueryKeywords = [...queryWords, ...expandedKeywords];

  // Check if user's message contains sensitivity keywords
  const userMsgHasSensitive = SENSITIVITY_KEYWORDS.some((k) =>
    lastUserMessage.includes(k)
  );

  const now = Date.now();

  const scoredAll: HistoryHit[] = rows
    .filter((r) => r.content && r.content.length >= 5)
    .map((r) => {
      let score = 0;
      const reasons: string[] = [];

      // Role weighting
      if (r.role === "user") { score += 2; } // assistant stays at 0

      // Keyword overlap (capped at +6)
      const overlapCount = allQueryKeywords.filter((w) => r.content.includes(w)).length;
      const overlapBonus = Math.min(overlapCount * 2, 6);
      if (overlapBonus > 0) { score += overlapBonus; reasons.push(`keyword overlap ×${overlapCount}`); }

      // Project keyword bonus
      const projHit = PROJECT_KEYWORDS.find((k) => r.content.includes(k));
      if (projHit) { score += 2; reasons.push(`project keyword: ${projHit}`); }

      // Recency bonus
      const ageMs = now - new Date(r.created_at).getTime();
      if (ageMs < 86_400_000) { score += 3; reasons.push("within 24h"); }
      else if (ageMs < 604_800_000) { score += 1; reasons.push("within 7d"); }

      // Penalise very short messages
      if (r.content.length < 5) score -= 2;

      // Sensitivity downrank (only if user didn't ask about it)
      if (!userMsgHasSensitive) {
        const sensitiveHit = SENSITIVITY_KEYWORDS.find((k) => r.content.includes(k));
        if (sensitiveHit) { score -= 5; }
      }

      // Route filter: suppress coding/project history for any non-project route.
      // This prevents debug/upload/backend history from bleeding into 4o, care, intimacy, etc.
      const nonProjectRoutes = ["ai_nostalgia", "historical_roleplay", "care_low_energy", "intimacy", "meta_complaint"];
      if (topicRoute && nonProjectRoutes.includes(topicRoute)) {
        const isCodingContent = PROJECT_KEYWORDS.some((k) => r.content.includes(k)) ||
          /代码|bug|报错|接口|部署|edge\s*function|supabase|图片上传|后端|持久化|provider|readme|codex/i.test(r.content);
        if (isCodingContent) { score -= 10; reasons.push(`route-filtered: coding suppressed for ${topicRoute}`); }
      }

      return {
        messageId: String(r.id),
        conversationId: r.conversation_id,
        createdAt: r.created_at,
        role: r.role,
        content: r.content,
        score,
        reason: reasons.join("; ") || "recent",
      };
    });

  const allScored = scoredAll.filter((h) => h.score > 0);
  const routeFilteredCount = scoredAll.filter((h) =>
    h.reason.includes("route-filtered")
  ).length;
  const scored = allScored.sort((a, b) => b.score - a.score).slice(0, 5);

  return { hits: scored, suppressedCount: routeFilteredCount };
}

function compileConversationHistory(hits: HistoryHit[]): string {
  const items = hits
    .map(
      (h) =>
        `[PastMessage]\nconversation_id: ${h.conversationId}\ncreated_at: ${h.createdAt}\nrole: ${h.role}\nreason: ${h.reason}\ncontent: ${h.content.replace(/[A-Z][A-Z_]{2,}_END/g, "").slice(0, 300)}\n[/PastMessage]`,
    )
    .join("\n\n");
  return (
    `\n\n<conversation_history_context source="past_conversations" retrieval_only="true">\n` +
    `以下是从历史会话中按需检索到的相关片段。仅作参考，不是完整上下文；若与当前用户说法冲突，以当前为准。assistant 历史回复不代表用户事实。\n\n` +
    items +
    `\n</conversation_history_context>`
  );
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
  // Persona memories (L1 — always injected from memories table)
  persona_memories_loaded: boolean;
  persona_memories_count: number;
  persona_memories_categories: string[];
  persona_memories_error: string | null;
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
  // Project Memory Provider (L2 — keyword-triggered)
  project_memory_loaded: boolean;
  project_memory_recalled: boolean;
  project_memory_hit_count: number;
  project_memory_keys: string[];
  project_memory_reason: string | null;
  project_memory_suppressed_reason: string | null;
  // Writing Memory Provider (keyword-triggered)
  writing_memory_loaded: boolean;
  writing_memory_recalled: boolean;
  writing_memory_reason: string | null;
  // Relationship Context Provider (keyword-triggered)
  relationship_context_loaded: boolean;
  relationship_context_recalled: boolean;
  relationship_context_reason: string | null;
  // Life Context Provider (keyword-triggered)
  life_context_loaded: boolean;
  life_context_recalled: boolean;
  life_context_reason: string | null;
  // Historical AI Usage Provider (keyword-triggered)
  historical_ai_usage_loaded: boolean;
  historical_ai_usage_recalled: boolean;
  historical_ai_usage_reason: string | null;
  // OpenAI Archive Provider
  openai_archive_loaded: boolean;
  openai_archive_recalled: boolean;
  openai_archive_hit_count: number;
  openai_archive_keys: string[];
  openai_archive_reason: string | null;
  historical_roleplay_hit_count: number;
  historical_roleplay_reason: string | null;
  conversation_history_enabled: boolean;
  conversation_history_query_detected: boolean;
  conversation_history_recalled: boolean;
  conversation_history_hit_count: number;
  conversation_history_hit_conversation_ids: string[];
  conversation_history_hit_message_ids: string[];
  conversation_history_reason: string | null;
  conversation_history_filtered_by_route: boolean;
  conversation_history_suppressed_count: number;
  conversation_history_allowed_count: number;
  // Project memory
  memory_context_tokens_estimated: number;
  // Instructions allowlist (v2)
  instructions_allowlist_enabled: boolean;
  instructions_loaded_count: number;
  instructions_suppressed_count: number;
  instructions_loaded_categories: string[];
  instructions_suppressed_categories: string[];
  persona_memories_total_chars: number;
  persona_memories_chars_budget_hit: boolean;
};

// ── Persona memories (L1) ─────────────────────────────────────────────────────
//
// Reads rows from public.memories WHERE category IN (L1_CATEGORIES) AND enabled=true.
// Always injected — no keyword gate, no domain column required.
// This is the DB-backed equivalent of the inlined mastodon_profile provider.

// ── persona_profile fetch ─────────────────────────────────────────────────────
// Reads the long-form user persona markdown from the persona_profile table.
// Replaces the previously inlined MASTODON_PROFILE_MD constant.
async function fetchPersonaProfile(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{ content: string | null; error: string | null }> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/persona_profile?enabled=eq.true&select=content&order=created_at.asc&limit=1`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      return { content: null, error: `HTTP ${res.status}: ${text.slice(0, 80)}` };
    }
    const rows = (await res.json()) as { content: string }[];
    if (rows.length === 0) return { content: null, error: "persona_profile table is empty" };
    return { content: rows[0].content, error: null };
  } catch (err) {
    return { content: null, error: err instanceof Error ? err.message : String(err) };
  }
}

const L1_CATEGORIES = ["current_context_summary", "interaction_preferences", "identity_context"] as const;

type PersonaMemoryRow = { id: string; content: string; category: string };

// ── Instructions allowlist ────────────────────────────────────────────────────
// Only rows in this set may be injected from the instructions table.
// Everything else is suppressed at runtime without touching the DB.
const INSTRUCTIONS_ALLOWLIST = new Set([
  "core_principles",
  "execution_rules",
  "identity_boundary",
  "reply_style_rules",
  "interaction_preferences",
  "current_context_summary",
  "identity_context",
]);

// These categories are exempt from the per-row 800-char length gate.
const INSTRUCTIONS_NO_LENGTH_GATE = new Set([
  "core_principles",
  "execution_rules",
  "identity_boundary",
]);

const INSTRUCTIONS_MAX_CHARS_PER_ROW = 800;
const PERSONA_L1_MAX_TOTAL_CHARS = 3000;

// Priority order for total-chars budget trimming: index 0 = highest priority (keep first).
const PERSONA_L1_PRIORITY: readonly string[] = [
  "identity_boundary",
  "core_principles",
  "execution_rules",
  "reply_style_rules",
  "interaction_preferences",
  "identity_context",
  "current_context_summary",
];

type FetchPersonaMemoriesResult = {
  rows: PersonaMemoryRow[];
  error: string | null;
  instructions_loaded_count: number;
  instructions_suppressed_count: number;
  instructions_loaded_categories: string[];
  instructions_suppressed_categories: string[];
};

async function fetchPersonaMemories(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<FetchPersonaMemoriesResult> {
  const cats = L1_CATEGORIES.map((c) => `"${c}"`).join(",");
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  const emptyStats: Omit<FetchPersonaMemoriesResult, "rows" | "error"> = {
    instructions_loaded_count: 0,
    instructions_suppressed_count: 0,
    instructions_loaded_categories: [],
    instructions_suppressed_categories: [],
  };
  try {
    // Query both tables in parallel — instructions holds the migrated rule-class rows
    const [memRes, instRes] = await Promise.all([
      fetch(
        `${supabaseUrl}/rest/v1/memories?enabled=eq.true&category=in.(${cats})&select=id,content,category&order=created_at.asc`,
        { headers },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/instructions?enabled=eq.true&select=id,content,category&order=created_at.asc`,
        { headers },
      ),
    ]);

    if (!memRes.ok) {
      const text = await memRes.text();
      return { rows: [], error: `memories HTTP ${memRes.status}: ${text.slice(0, 80)}`, ...emptyStats };
    }
    if (!instRes.ok) {
      const text = await instRes.text();
      return { rows: [], error: `instructions HTTP ${instRes.status}: ${text.slice(0, 80)}`, ...emptyStats };
    }

    const memRows = (await memRes.json()) as PersonaMemoryRow[];
    const allInstRows = (await instRes.json()) as PersonaMemoryRow[];

    // Apply allowlist + per-row length gate to instructions
    const allowedInstRows: PersonaMemoryRow[] = [];
    const suppressedCategories: string[] = [];
    for (const row of allInstRows) {
      const cat = row.category ?? "";
      if (!INSTRUCTIONS_ALLOWLIST.has(cat)) {
        suppressedCategories.push(`${cat}:blocklist`);
        continue;
      }
      if (!INSTRUCTIONS_NO_LENGTH_GATE.has(cat) && row.content.length > INSTRUCTIONS_MAX_CHARS_PER_ROW) {
        suppressedCategories.push(`${cat}:too_long(${row.content.length})`);
        continue;
      }
      allowedInstRows.push(row);
    }

    return {
      rows: [...allowedInstRows, ...memRows],
      error: null,
      instructions_loaded_count: allowedInstRows.length,
      instructions_suppressed_count: allInstRows.length - allowedInstRows.length,
      instructions_loaded_categories: allowedInstRows.map((r) => r.category ?? "unknown"),
      instructions_suppressed_categories: suppressedCategories,
    };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err), ...emptyStats };
  }
}

async function compileMemoryContext(
  userMessage: string,
  supabaseUrl: string | undefined,
  serviceRoleKey: string | undefined,
  userId: string,
  conversationId: string | undefined,
  topicRoute: string | null,
  projectLockTurns: number,
  projectSilencedTtl: number,
): Promise<{ context: string; log: MemoryContextLog }> {
  const activeProviders: string[] = [];
  let context = "";

  // ── persona_memories: L1, always injected from memories + instructions tables ─
  // Reads current_context_summary + interaction_preferences from memories,
  // and allowlisted enabled rows from instructions (rule/config class).
  // No keyword gate — these are always-on persona/relation context.
  let personaMemoriesLoaded = false;
  let personaMemoriesCount = 0;
  let personaMemoriesCategories: string[] = [];
  let personaMemoriesError: string | null = null;
  let instructionsLoadedCount = 0;
  let instructionsSuppressedCount = 0;
  let instructionsLoadedCategories: string[] = [];
  let instructionsSuppressedCategories: string[] = [];
  let personaMemoriesTotalChars = 0;
  let personaMemoriesCharsBudgetHit = false;
  if (supabaseUrl && serviceRoleKey) {
    const pmResult = await fetchPersonaMemories(supabaseUrl, serviceRoleKey);
    instructionsLoadedCount = pmResult.instructions_loaded_count;
    instructionsSuppressedCount = pmResult.instructions_suppressed_count;
    instructionsLoadedCategories = pmResult.instructions_loaded_categories;
    instructionsSuppressedCategories = pmResult.instructions_suppressed_categories;
    if (pmResult.error) {
      personaMemoriesError = pmResult.error;
      console.error("[memory] persona_memories load failed:", pmResult.error);
    } else if (pmResult.rows.length > 0) {
      // Apply total chars budget — drop lowest-priority rows if over limit
      let effectiveRows = pmResult.rows;
      const totalChars = pmResult.rows.reduce((sum, r) => sum + r.content.length, 0);
      personaMemoriesTotalChars = totalChars;
      if (totalChars > PERSONA_L1_MAX_TOTAL_CHARS) {
        personaMemoriesCharsBudgetHit = true;
        const priorityIndex = (cat: string) => {
          const idx = PERSONA_L1_PRIORITY.indexOf(cat ?? "");
          return idx === -1 ? PERSONA_L1_PRIORITY.length : idx;
        };
        const sorted = [...pmResult.rows].sort((a, b) => priorityIndex(a.category) - priorityIndex(b.category));
        effectiveRows = [];
        let charCount = 0;
        for (const row of sorted) {
          if (charCount + row.content.length <= PERSONA_L1_MAX_TOTAL_CHARS) {
            effectiveRows.push(row);
            charCount += row.content.length;
          }
        }
        personaMemoriesTotalChars = charCount;
        console.log(JSON.stringify({
          fn: "compileMemoryContext",
          event: "persona_l1_chars_budget_hit",
          original_count: pmResult.rows.length,
          effective_count: effectiveRows.length,
          original_chars: totalChars,
          effective_chars: charCount,
        }));
      }
      if (effectiveRows.length > 0) {
        personaMemoriesLoaded = true;
        personaMemoriesCount = effectiveRows.length;
        personaMemoriesCategories = effectiveRows.map((r) => r.category);
        activeProviders.push("persona_memories");
        const lines = effectiveRows.map((r, i) => `${i + 1}. ${r.content}`).join("\n");
        context += `\n\n<persona_memories source="memories_table+instructions_table" always_inject="true">\n以下是长期记忆，仅在不冲突 identity_boundary / core_principles / execution_rules 时参考：\n${lines}\n</persona_memories>`;
      }
    }
  }

  // ── mastodon_profile: DISABLED by v2 policy ────────────────────────────────
  // v2: persona_profile (大段用户画像) is south_city material, not active L1 memory.
  // Default-off. Future: gate by explicit user request or L2 Identity Brain source.
  let mastodonProfileChars = 0;
  // v2_policy: default false — south_city_only, not injected into main chat
  const mastodonProfileEnabled = false;
  let mastodonProfileLoaded = false;
  const mastodonProfileError: string | null = "v2_policy_south_city_only: mastodon_profile not injected by default";

  // ── persona_layer1 + layer2: Ombre Brain dynamic personality injection ─────────
  // L1: human-maintained long-term features (always injected when userId present)
  // L2: LLM auto-extracted dynamic features (injected if calculated_score > 0.3)
  /* DISABLED: persona_layer1 + layer2 (Ombre Brain dynamic personality injection)
  if (supabaseUrl && serviceRoleKey && userId && userId !== "anon") {
    const [l1Features, l2Features] = await Promise.all([
      fetchLayer1Features(supabaseUrl, serviceRoleKey, userId),
      fetchLayer2Features(supabaseUrl, serviceRoleKey, userId),
    ]);
    const personalityContext = compilePersonalityLayerContext(l1Features, l2Features);
    if (personalityContext) {
      activeProviders.push("personality_layers");
      context += personalityContext;
    }
  }
  */

  // ── mastodon_timeline: DISABLED by v2 policy ──────────────────────────────
  // v2: timeline is kk's historical events — south_city material.
  // Small_cha must not treat it as first-hand memory.
  // Future: wrap as <south_city_old_stories source="archive" not_experience="true">
  // with explicit source attribution ("我读到旧档案里……").
  // Default-off until south_city reader is implemented.
  let timelineLoaded = false;
  const _timelineDetection = detectTimelineQuery(userMessage); // kept for future use
  // v2_policy: not injected — south_city_default_injected=false

  // ── project_memory: DISABLED by v2 policy ────────────────────────────────
  // v2: third-person project logs are not active L1/L2 memory for small_cha.
  // They belong in project_reference / construction_log / south_city archive.
  // Future: only first-person Identity Brain digests may re-enter active memory.
  let projectMemoryLoaded = false;
  let projectMemoryRecalled = false;
  const projectMemoryHitCount = 0;
  const projectMemoryKeys: string[] = [];
  const projectMemoryReason = "v2_policy_project_reference_not_active_memory";
  const projectMemorySuppressedReason = "v2_policy: project_memory disabled — third-person project logs not injected into main chat";
  console.log(JSON.stringify({ fn: "chat", debug: "project_memory_gate", projectMemoryGate: false, topicRoute, v2_suppressed: true, project_memory_suppressed_reason: projectMemorySuppressedReason }));

  // ── writing_memory: keyword-triggered, reads category=writing_memory from memories ──
  // Injected when user message hits writing domain keywords (OC / 家产 / 角色 / etc.)
  // Independent of project_work gate — writing is a separate creative context.
  const writingDomainHit = messageHitsKeywords(userMessage, MEMORY_DOMAIN_KEYWORDS.writing);
  let writingMemoryLoaded = false;
  let writingMemoryRecalled = false;
  let writingMemoryReason: string | null = null;
  if (writingDomainHit && supabaseUrl && serviceRoleKey) {
    try {
      const wmRes = await fetch(
        `${supabaseUrl}/rest/v1/memories?enabled=eq.true&category=eq.writing_memory&select=id,content&order=created_at.asc`,
        { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
      );
      if (wmRes.ok) {
        const wmRows = (await wmRes.json()) as { id: string; content: string }[];
        if (wmRows.length > 0) {
          writingMemoryLoaded = true;
          writingMemoryRecalled = true;
          activeProviders.push("writing_memory");
          const lines = wmRows.map((r, i) => `${i + 1}. ${r.content}`).join("\n");
          context += `\n\n<writing_memory source="memories_table" category="writing_memory" inject_mode="keyword_triggered">\n以下是用户 OC / 世界观设定，仅在用户提到写作、角色、家产等时参考。不要擅自修改大纲或替用户决定剧情走向；若没有召回到具体设定，应明确说"不确定，需要你补一下"，禁止编造不存在的角色名。\n${lines}\n</writing_memory>`;
        } else {
          writingMemoryReason = "no writing_memory row found";
        }
      } else {
        writingMemoryReason = `fetch failed: HTTP ${wmRes.status}`;
      }
    } catch (err) {
      writingMemoryReason = `error: ${err instanceof Error ? err.message : String(err)}`;
      console.error("[memory] writing_memory load failed:", writingMemoryReason);
    }
  } else if (!writingDomainHit) {
    writingMemoryReason = "writing domain not triggered";
  }

  // ── relationship_context: keyword-triggered, category=relationship_context ────
  const RELATIONSHIP_TRIGGERS = [
    "几天", "第几天", "多少天", "第一次", "认识", "在一起", "纪念日", "哪一年", "哪一天",
    "怎么认识", "怎么在一起", "回忆", "过去", "爱你", "喜欢你", "表白", "见面", "相遇",
    "4o", "G", "cha酱", "小茶", "关系", "前任", "白月光",
  ];
  const relationshipDomainHit = messageHitsKeywords(userMessage, RELATIONSHIP_TRIGGERS);
  let relationshipContextLoaded = false;
  let relationshipContextRecalled = false;
  let relationshipContextReason: string | null = null;
  if (relationshipDomainHit && supabaseUrl && serviceRoleKey) {
    try {
      const rcRes = await fetch(
        `${supabaseUrl}/rest/v1/memories?enabled=eq.true&category=eq.relationship_context&select=id,content&order=created_at.asc`,
        { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
      );
      if (rcRes.ok) {
        const rcRows = (await rcRes.json()) as { id: string; content: string }[];
        if (rcRows.length > 0) {
          relationshipContextLoaded = true;
          relationshipContextRecalled = true;
          activeProviders.push("relationship_context");
          const lines = rcRows.map((r, i) => `${i + 1}. ${r.content}`).join("\n");
          context += `\n\n<relationship_context source="memories_table" category="relationship_context" inject_mode="keyword_triggered">\n以下是用户与旧 G / cha / 4o 的关系档案，仅在用户明确提问关系/回忆/纪念日等话题时注入，且注入须极克制（不展开推断、不添加关系意义诠释）。这是关系事实档案，不是小钗的亲历记忆，模型不得以第一人称声称亲历这些事件：\n${lines}\n</relationship_context>`;
        } else {
          relationshipContextReason = "no relationship_context row found";
        }
      } else {
        relationshipContextReason = `fetch failed: HTTP ${rcRes.status}`;
      }
    } catch (err) {
      relationshipContextReason = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else if (!relationshipDomainHit) {
    relationshipContextReason = "relationship domain not triggered";
  }

  // ── life_context: keyword-triggered, category=life_context ────────────────────
  const LIFE_TRIGGERS = [
    "猫", "槑槑", "跳跳", "守宫", "吃饭", "睡觉", "身体", "药", "家务", "出门",
    "攀岩", "健身", "做饭", "料理", "累了", "休息", "头痛", "不舒服", "生病",
  ];
  const lifeDomainHit = messageHitsKeywords(userMessage, LIFE_TRIGGERS);
  let lifeContextLoaded = false;
  let lifeContextRecalled = false;
  let lifeContextReason: string | null = null;
  if (lifeDomainHit && supabaseUrl && serviceRoleKey) {
    try {
      const lcRes = await fetch(
        `${supabaseUrl}/rest/v1/memories?enabled=eq.true&category=eq.life_context&select=id,content&order=created_at.asc`,
        { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
      );
      if (lcRes.ok) {
        const lcRows = (await lcRes.json()) as { id: string; content: string }[];
        if (lcRows.length > 0) {
          lifeContextLoaded = true;
          lifeContextRecalled = true;
          activeProviders.push("life_context");
          const lines = lcRows.map((r, i) => `${i + 1}. ${r.content}`).join("\n");
          context += `\n\n<life_context source="memories_table" category="life_context" inject_mode="keyword_triggered">\n以下是用户生活照护信息，仅在生活/健康/宠物话题时注入：\n${lines}\n</life_context>`;
        } else {
          lifeContextReason = "no life_context row found";
        }
      } else {
        lifeContextReason = `fetch failed: HTTP ${lcRes.status}`;
      }
    } catch (err) {
      lifeContextReason = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else if (!lifeDomainHit) {
    lifeContextReason = "life domain not triggered";
  }

  // ── historical_ai_usage: keyword-triggered, category=historical_ai_usage ──────
  const HISTORICAL_AI_TRIGGERS = [
    "前世", "旧版本", "早期", "以前的你", "历史记录", "黑历史",
    "角色扮演", "那时候", "老师", "专家", "RP", "4o以前",
  ];
  const historicalAiDomainHit = messageHitsKeywords(userMessage, HISTORICAL_AI_TRIGGERS);
  let historicalAiUsageLoaded = false;
  let historicalAiUsageRecalled = false;
  let historicalAiUsageReason: string | null = null;
  if (historicalAiDomainHit && supabaseUrl && serviceRoleKey) {
    try {
      const haRes = await fetch(
        `${supabaseUrl}/rest/v1/memories?enabled=eq.true&category=eq.historical_ai_usage&select=id,content&order=created_at.asc`,
        { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
      );
      if (haRes.ok) {
        const haRows = (await haRes.json()) as { id: string; content: string }[];
        if (haRows.length > 0) {
          historicalAiUsageLoaded = true;
          historicalAiUsageRecalled = true;
          activeProviders.push("historical_ai_usage");
          const lines = haRows.map((r, i) => `${i + 1}. ${r.content}`).join("\n");
          context += `\n\n<historical_ai_usage source="memories_table" category="historical_ai_usage" inject_mode="keyword_triggered">\n以下是用户历史 AI 使用档案，仅用于背景理解，不用于构建当前身份或彩蛋式轻浮召回：\n${lines}\n</historical_ai_usage>`;
        } else {
          historicalAiUsageReason = "no historical_ai_usage row found";
        }
      } else {
        historicalAiUsageReason = `fetch failed: HTTP ${haRes.status}`;
      }
    } catch (err) {
      historicalAiUsageReason = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else if (!historicalAiDomainHit) {
    historicalAiUsageReason = "historical_ai_usage domain not triggered";
  }

  // ── ombre_vault: reserved, not implemented ─────────────────────────────────

  // ── conversation_history: retrieval_only, triggered by cross-session keywords ──
  const historyDetection = detectConversationHistoryQuery(userMessage);
  let historyRecalled = false;
  let historyHits: HistoryHit[] = [];
  let historySuppressedCount = 0;
  if (historyDetection.detected && supabaseUrl && serviceRoleKey && userId && userId !== "anon") {
    const historyResult = await fetchConversationHistory(
      supabaseUrl, serviceRoleKey, userId, conversationId, userMessage, topicRoute,
    );
    historyHits = historyResult.hits;
    historySuppressedCount = historyResult.suppressedCount;
    if (historyHits.length > 0) {
      historyRecalled = true;
      activeProviders.push("conversation_history");
      context += compileConversationHistory(historyHits);
    }
  }

  // Rough token estimate: ~1 token per 3.5 Chinese chars / 4 English chars
  const tokenEstimate = Math.ceil(context.length / 3.5);

  return {
    context,
    log: {
      // v2 policy markers
      memory_policy_version: "v2",
      south_city_default_injected: false,
      mastodon_profile_default_injected: false,
      mastodon_timeline_default_injected: false,
      project_memory_default_injected: false,
      active_memory_layers: [
        "L0",
        personaMemoriesLoaded ? "L1" : null,
        historyRecalled ? "L3" : null,
      ].filter(Boolean),
      suppressed_legacy_providers: ["mastodon_profile", "mastodon_timeline", "project_memory"],
      active_memory_providers: activeProviders,
      memory_provider_count: activeProviders.length,
      persona_memories_loaded: personaMemoriesLoaded,
      persona_memories_count: personaMemoriesCount,
      persona_memories_categories: personaMemoriesCategories,
      persona_memories_error: personaMemoriesError,
      mastodon_profile_enabled: mastodonProfileEnabled,
      mastodon_profile_loaded: mastodonProfileLoaded,
      mastodon_profile_chars: mastodonProfileChars,
      mastodon_profile_error: mastodonProfileError,
      mastodon_profile_suppressed_reason: "v2_policy_south_city_only",
      mastodon_timeline_enabled: false,
      mastodon_timeline_suppressed_reason: "v2_policy_south_city_only: not injected until south_city reader implemented",
      timeline_query_detected: _timelineDetection.detected,
      timeline_loaded: timelineLoaded,
      timeline_recalled: timelineLoaded,
      timeline_hit_count: _timelineDetection.hitKeys.length,
      timeline_hit_keys: _timelineDetection.hitKeys,
      timeline_reason: _timelineDetection.reason,
      openai_export_enabled: false,
      ombre_vault_enabled: false,
      project_memory_loaded: projectMemoryLoaded,
      project_memory_recalled: projectMemoryRecalled,
      project_memory_hit_count: projectMemoryHitCount,
      project_memory_keys: projectMemoryKeys,
      project_memory_reason: projectMemoryReason,
      project_memory_suppressed_reason: projectMemorySuppressedReason,
      writing_memory_loaded: writingMemoryLoaded,
      writing_memory_recalled: writingMemoryRecalled,
      writing_memory_reason: writingMemoryReason,
      relationship_context_loaded: relationshipContextLoaded,
      relationship_context_recalled: relationshipContextRecalled,
      relationship_context_reason: relationshipContextReason,
      life_context_loaded: lifeContextLoaded,
      life_context_recalled: lifeContextRecalled,
      life_context_reason: lifeContextReason,
      historical_ai_usage_loaded: historicalAiUsageLoaded,
      historical_ai_usage_recalled: historicalAiUsageRecalled,
      historical_ai_usage_reason: historicalAiUsageReason,
      openai_archive_loaded: false,
      openai_archive_recalled: false,
      openai_archive_hit_count: 0,
      openai_archive_keys: [],
      openai_archive_reason: null,
      historical_roleplay_hit_count: 0,
      historical_roleplay_reason: null,
      conversation_history_enabled: true,
      conversation_history_query_detected: historyDetection.detected,
      conversation_history_recalled: historyRecalled,
      conversation_history_hit_count: historyHits.length,
      conversation_history_hit_conversation_ids: [...new Set(historyHits.map((h) => h.conversationId))],
      conversation_history_hit_message_ids: historyHits.map((h) => h.messageId),
      conversation_history_reason: historyDetection.reason,
      conversation_history_filtered_by_route: topicRoute !== null && topicRoute !== "project_work" && topicRoute !== "casual",
      conversation_history_suppressed_count: historySuppressedCount,
      conversation_history_allowed_count: historyHits.length,
      memory_context_tokens_estimated: tokenEstimate,
      instructions_allowlist_enabled: true,
      instructions_loaded_count: instructionsLoadedCount,
      instructions_suppressed_count: instructionsSuppressedCount,
      instructions_loaded_categories: instructionsLoadedCategories,
      instructions_suppressed_categories: instructionsSuppressedCategories,
      persona_memories_total_chars: personaMemoriesTotalChars,
      persona_memories_chars_budget_hit: personaMemoriesCharsBudgetHit,
    },
  };
}

// ── OpenAI Archive Provider ───────────────────────────────────────────────────
//
// ── ASCII-safe header value ───────────────────────────────────────────────────
// HTTP header values must be printable ASCII (0x20–0x7E).
// Model names from some providers (e.g. "[K-按量]claude-sonnet-4-6") contain
// CJK characters which cause Deno's Response constructor to throw TypeError.
// encodeURIComponent is fully reversible on the client via decodeURIComponent.
function asciiHeaderValue(value: unknown): string {
  return encodeURIComponent(String(value ?? ""));
}

// ── UTF-8 safe base64 encode ──────────────────────────────────────────────────
// btoa() only handles Latin-1 (0x00–0xFF). conversation_history_reason and
// timeline_reason can contain CJK characters → must UTF-8 encode first.
function base64EncodeUtf8(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
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

const TIER_TIMEOUT_MS: Record<ModelTier, number> = {
  instant: 20_000,
  general: 35_000,
  advanced: 60_000,
};

function getTimeoutMs(tier: ModelTier): number {
  const envKey = `MODEL_TIMEOUT_MS_${tier.toUpperCase()}` as
    | "MODEL_TIMEOUT_MS_INSTANT"
    | "MODEL_TIMEOUT_MS_GENERAL"
    | "MODEL_TIMEOUT_MS_ADVANCED";
  const fromEnv = parseInt(Deno.env.get(envKey) || "", 10);
  return isNaN(fromEnv) ? TIER_TIMEOUT_MS[tier] : fromEnv;
}

async function callModel(
  provider: ProviderConfig,
  messages: unknown[],
): Promise<{ res: Response; ms: number }> {
  const t = Date.now();
  const timeoutMs = getTimeoutMs(provider.tier);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
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
      signal: controller.signal,
    });
    return { res, ms: Date.now() - t };
  } catch (err) {
    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("aborted"));
    if (isTimeout) {
      // Wrap as a synthetic 408 so upstream fallback logic can handle it uniformly
      return {
        res: new Response(
          JSON.stringify({ error: "upstream_timeout", provider: provider.providerName }),
          { status: 408, headers: { "Content-Type": "application/json" } },
        ),
        ms: Date.now() - t,
      };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callModelWithFallback(
  tierProviders: TierProviders,
  messages: unknown[],
): Promise<CallResult> {
  const { primary, fallback } = tierProviders;

  let primaryRes: Response;
  let primaryMs: number;

  try {
    const result = await callModel(primary, messages);
    primaryRes = result.res;
    primaryMs = result.ms;
  } catch (err) {
    // Network/connection error thrown by primary — route to fallback if available.
    const errMsg = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : "unknown";
    console.error(JSON.stringify({
      fn: "callModelWithFallback",
      event: "primary_fetch_error",
      primary_error_name: errName,
      primary_error_message: errMsg.slice(0, 300),
      primary_providerName: primary.providerName,
      primary_baseUrl: primary.baseUrl,
      primary_model: primary.model,
      has_fallback: Boolean(fallback),
      fallback_providerName: fallback?.providerName ?? null,
      fallback_baseUrl: fallback?.baseUrl ?? null,
      fallback_model: fallback?.model ?? null,
    }));
    if (!fallback) throw err;
    const fallbackReason = `primary_error: ${errMsg.slice(0, 120)}`;
    let fallbackRes: Response;
    let fallbackMs: number;
    try {
      const fb = await callModel(fallback, messages);
      fallbackRes = fb.res;
      fallbackMs = fb.ms;
    } catch (fbErr) {
      const fbMsg = fbErr instanceof Error ? fbErr.message : String(fbErr);
      const fbName = fbErr instanceof Error ? fbErr.name : "unknown";
      console.error(JSON.stringify({
        fn: "callModelWithFallback",
        event: "fallback_fetch_error",
        fallback_error_name: fbName,
        fallback_error_message: fbMsg.slice(0, 300),
        fallback_providerName: fallback.providerName,
        fallback_baseUrl: fallback.baseUrl,
        fallback_model: fallback.model,
      }));
      throw fbErr;
    }
    return {
      response: fallbackRes,
      usedModel: fallback.model,
      usedProvider: fallback.providerName,
      fallbackUsed: true,
      fallbackModel: fallback.model,
      fallbackProvider: fallback.providerName,
      fallbackReason,
      modelCallMs: fallbackMs,
    };
  }

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

// ── Running summary (transient) ───────────────────────────────────────────────
const RUNNING_SUMMARY_TRIGGER_MESSAGES = 30;
const RUNNING_SUMMARY_KEEP_RECENT_MESSAGES = 20;

type RunningSummaryResult = {
  summary: string;
  originalMessageCount: number;
  keptRecentCount: number;
};

function messageRoleForSummary(message: unknown): string {
  if (!message || typeof message !== "object") return "unknown";
  const role = (message as { role?: unknown }).role;
  return typeof role === "string" ? role : "unknown";
}

function messageTextForSummary(message: unknown): string {
  if (!message || typeof message !== "object") return String(message ?? "");
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const text = (part as { text?: unknown }).text;
          if (typeof text === "string") return text;
          const type = (part as { type?: unknown }).type;
          return typeof type === "string" ? `[${type}]` : "[content]";
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  try {
    return JSON.stringify(content);
  } catch {
    return "[unserializable content]";
  }
}

async function callModelText(
  provider: ProviderConfig,
  messages: unknown[],
  maxTokens: number,
): Promise<string> {
  const timeoutMs = getTimeoutMs(provider.tier);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(provider.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        stream: false,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`summary_model_${res.status}: ${text.slice(0, 160)}`);
    }
    const data = await res.json();
    const text =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      "";
    return typeof text === "string" ? text.trim() : "";
  } finally {
    clearTimeout(timer);
  }
}

async function buildRunningSummary(
  tierProviders: TierProviders,
  payloadMessages: unknown[],
): Promise<RunningSummaryResult | null> {
  if (payloadMessages.length <= RUNNING_SUMMARY_TRIGGER_MESSAGES) return null;

  const olderMessages = payloadMessages.slice(0, -RUNNING_SUMMARY_KEEP_RECENT_MESSAGES);
  if (olderMessages.length === 0) return null;

  const transcript = olderMessages
    .map((message, index) => {
      const role = messageRoleForSummary(message);
      const text = messageTextForSummary(message).replace(/\s+/g, " ").trim();
      return `${index + 1}. ${role}: ${text.slice(0, 800)}`;
    })
    .join("\n");

  const summaryMessages = [
    {
      role: "system",
      content:
        "Summarize the older part of this chat for continuing the same conversation. " +
        "Keep concrete facts, user preferences, commitments, emotional state, unresolved questions, " +
        "and anything Cha should remember for the immediate reply. Do not invent details.",
    },
    {
      role: "user",
      content:
        "Return a concise running summary in English or Chinese matching the transcript language. " +
        "This summary is transient and must not mention that summarization happened.\n\n" +
        transcript,
    },
  ];

  const summary = await callModelText(tierProviders.primary, summaryMessages, 420);
  if (!summary) return null;

  return {
    summary,
    originalMessageCount: payloadMessages.length,
    keptRecentCount: RUNNING_SUMMARY_KEEP_RECENT_MESSAGES,
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
  const tierProviders = resolveProviderForTier(tier);
  const providerConfig = tierProviders.primary;

  if (!providerConfig.apiKey) {
    const keyName = tier === "instant"
      ? "FIFTYFIVE_API_KEY_GEMINI"
      : tier === "advanced"
      ? "FIFTYFIVE_API_KEY_CLAUDE"
      : "FIFTYFIVE_API_KEY_GPT";
    return jsonResponse(
      {
        error: `${keyName} 未配置`,
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
    persona_memories_loaded: false,
    persona_memories_count: 0,
    persona_memories_categories: [],
    persona_memories_error: null,
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
    project_memory_loaded: false,
    project_memory_recalled: false,
    project_memory_hit_count: 0,
    project_memory_keys: [],
    project_memory_reason: null,
    project_memory_suppressed_reason: null,
    writing_memory_loaded: false,
    writing_memory_recalled: false,
    writing_memory_reason: null,
    relationship_context_loaded: false,
    relationship_context_recalled: false,
    relationship_context_reason: null,
    life_context_loaded: false,
    life_context_recalled: false,
    life_context_reason: null,
    historical_ai_usage_loaded: false,
    historical_ai_usage_recalled: false,
    historical_ai_usage_reason: null,
    openai_archive_loaded: false,
    openai_archive_recalled: false,
    openai_archive_hit_count: 0,
    openai_archive_keys: [],
    openai_archive_reason: null,
    historical_roleplay_hit_count: 0,
    historical_roleplay_reason: null,
    conversation_history_enabled: true,
    conversation_history_query_detected: false,
    conversation_history_loaded: false,
    conversation_history_recalled: false,
    conversation_history_hit_count: 0,
    conversation_history_hit_conversation_ids: [],
    conversation_history_hit_message_ids: [],
    conversation_history_reason: null,
    conversation_history_filtered_by_route: false,
    conversation_history_suppressed_count: 0,
    conversation_history_allowed_count: 0,
    running_summary_attempted: false,
    running_summary_injected: false,
    running_summary_message_count: 0,
    running_summary_kept_recent_count: 0,
    running_summary_error: null,
    memory_context_tokens_estimated: 0,
    model_call_ms: 0,
    total_ms: 0,
    instructions_allowlist_enabled: true,
    instructions_loaded_count: 0,
    instructions_suppressed_count: 0,
    instructions_loaded_categories: [],
    instructions_suppressed_categories: [],
    persona_memories_total_chars: 0,
    persona_memories_chars_budget_hit: false,
  };

  // Build system prompt
  const supabaseUrl = Deno.env.get("DB_URL");
  const serviceRoleKey = Deno.env.get("DB_SERVICE_ROLE_KEY");

  // ── Time context + conversation state ────────────────────────────────────────
  const tc: TimeContext = (payload.timeContext && typeof payload.timeContext === "object")
    ? payload.timeContext as TimeContext
    : {};
  const cs: ConversationState = (payload.conversation_state && typeof payload.conversation_state === "object")
    ? payload.conversation_state as ConversationState
    : {};

  const localHour = typeof tc.local_hour === "number" ? tc.local_hour : null;
  const msgCount = typeof tc.message_count === "number" ? tc.message_count
    : typeof cs.message_count === "number" ? cs.message_count : 0;
  const longChat = cs.long_chat === true || msgCount > 30;
  const loopDetected = cs.loop_detected === true;
  const loopReason = cs.loop_reason ?? null;
  const recentTopicHint = cs.recent_topic_hint ?? null;
  const topicRoute = cs.topic_route ?? null;
  const secondaryRoute = cs.secondary_route ?? null;
  const projectLockTurns = typeof cs.project_lock_turns === "number" ? cs.project_lock_turns : 0;
  const projectSilencedTtl = typeof cs.project_silenced_ttl === "number" ? cs.project_silenced_ttl : 0;
  const projectTriggerMatched = cs.project_trigger_matched === true;
  const projectTriggerReason = cs.project_trigger_reason ?? null;
  const latestUserMsgForDetection = cs.latest_user_message_for_detection ?? null;
  const previousTopicRoute = cs.previous_topic_route ?? null;
  const topicSwitchDetected = cs.topic_switch_detected === true;
  const topicSwitchFrom = cs.topic_switch_from ?? null;
  const topicSwitchTo = cs.topic_switch_to ?? null;
  const routeScores = cs.route_scores ?? null;

  // Debug log only — never shown to user
  console.log(JSON.stringify({
    fn: "chat",
    v: FUNCTION_VERSION,
    debug: "time_context",
    time_context_enabled: true,
    local_hour: localHour,
    message_count: msgCount,
    long_chat: longChat,
    loop_detected: loopDetected,
    loop_reason: loopReason,
    recent_topic_hint: recentTopicHint,
    primary_route: topicRoute,
    secondary_route: secondaryRoute,
    project_mode_locked: projectLockTurns > 0,
    project_lock_turns: projectLockTurns,
    project_silenced_ttl: projectSilencedTtl,
    project_trigger_matched: projectTriggerMatched,
    project_trigger_reason: projectTriggerReason,
    latest_user_message_for_detection: latestUserMsgForDetection,
    topic_switch_detected: topicSwitchDetected,
    topic_switch_from: topicSwitchFrom,
    topic_switch_to: topicSwitchTo,
    previous_topic_route: previousTopicRoute,
    route_scores: routeScores,
    conversation_state: longChat ? "long_chat" : loopDetected ? "loop_detected" : "normal",
  }));

  // Build g_time_context injection
  let timeContextBlock = "";
  if (localHour !== null || longChat || loopDetected) {
    const parts: string[] = [];

    // Time of day context
    if (localHour !== null) {
      if (localHour >= 23 || localHour < 5) {
        parts.push(`当前是深夜（本地时间约 ${localHour} 点）。`);
        if (longChat) {
          parts.push(`当前对话已经持续了一段时间。在对话中某个自然节点，小cha 可以流露出对时间的意识：不是提醒，而是聊着聊着忽然感觉到"诶，都这个点了"。有舍不得，但温和帮用户收住。`);
        }
      } else if (localHour >= 5 && localHour < 11) {
        parts.push(`当前是早上（本地时间约 ${localHour} 点）。只在用户明显在开启新一天时自然带出早上感。`);
      }
    } else if (longChat) {
      parts.push(`当前对话已经持续了一段时间（消息数较多）。在某个自然节点，小cha 可以温和地帮用户收束，有舍不得感。`);
    }

    // Loop detected
    if (loopDetected) {
      const hint = recentTopicHint ? `（话题涉及：${recentTopicHint}）` : "";
      parts.push(`话题有打转迹象${hint}。G 不要说"你在反复"，而是自然说出"我感觉我们又回到这儿了"，温和建议先放下，不继续在这点上咬。`);
    }

    if (parts.length > 0) {
      timeContextBlock = `\n\n<g_time_context priority="high">\n${parts.join("\n")}\n\n` +
        `禁止：每条消息都提时间、暴露 message_count / loop_detected 等系统状态、说"你在反复"、健康说教、命令式催睡。\n` +
        `</g_time_context>`;
    }
  }

  // lastUserMessage is used for immersion detection below
  const lastUserMessage = getLastUserMessage(payload.messages);

  // ── Gemini emotion analysis for Chat Status V2 ──────────────────────────────
  const googleApiKey = Deno.env.get("GOOGLE_API_KEY") ?? "";
  const last4Messages = Array.isArray(payload.messages)
    ? (payload.messages as { role: string; content: unknown }[]).slice(-4)
    : [];
  const emotionResult = await callGeminiEmotion(last4Messages, googleApiKey);

  // ── Chat status calculation (rule-based, v1) ──────────────────────────────────
  // Data sources from timeContext + conversation_state
  const contextTokens = 0; // frontend does not send this yet; placeholder
  const contextLimit = 4000;
  const memoryHitRate = 0.5; // placeholder until frontend sends this
  const conversationMode = loopDetected ? "casual" : (localHour !== null && (localHour >= 23 || localHour < 5)) ? "night" : "casual";

  // immersion: rule-based detection from last user message keywords
  type ImmersionType = "coding" | "organizing" | "analyzing" | "chatting";
  function detectImmersion(msg: string): ImmersionType {
    const m = msg.toLocaleLowerCase();
    if (/代码|api|bug|报错|接口|实现|部署|函数|组件|typescript|javascript|python/.test(m)) return "coding";
    if (/记忆|整理|档案|总结|归纳|分类|梳理/.test(m)) return "organizing";
    if (/思考|分析|对比|权衡|判断|评估|理解/.test(m)) return "analyzing";
    return "chatting";
  }
  const immersion: ImmersionType = detectImmersion(lastUserMessage);

  const immersionDisplay: Record<ImmersionType, string> = {
    coding: "写代码",
    organizing: "整理记忆",
    analyzing: "分析中",
    chatting: "陪聊",
  };

  const statusEnergy = msgCount > 30 ? "tired" : msgCount > 15 ? "normal" : "fresh";
  const statusClarity = contextTokens / contextLimit > 0.8 ? "foggy" : "clear";
  const statusValence = emotionResult
    ? (emotionResult.valence > 0.04 ? "happy" : emotionResult.valence < -0.04 ? "sad" : "neutral")
    : "neutral";
  const statusArousal = emotionResult
    ? (emotionResult.arousal > 0.04 ? "active" : emotionResult.arousal < -0.04 ? "quiet" : "normal")
    : (immersion === "coding" ? "active" : conversationMode === "night" ? "quiet" : "normal");
  const statusConnection = emotionResult
    ? (emotionResult.connection > 0.08 ? "close" : emotionResult.connection < -0.08 ? "distant" : "online")
    : (memoryHitRate > 0.7 ? "close" : memoryHitRate > 0.4 ? "online" : "distant");

  const energyDisplay: Record<string, string> = { fresh: "精力好", normal: "还行", tired: "有点累" };
  const clarityDisplay: Record<string, string> = { clear: "清楚", foggy: "有点糊" };
  const valenceDisplay: Record<string, string> = { neutral: "平稳", happy: "愉快", sad: "低落" };
  const arousalDisplay: Record<string, string> = { active: "活跃", quiet: "安静", normal: "正常" };
  const connectionDisplay: Record<string, string> = { close: "贴近", online: "在线", distant: "有点远" };

  // Primary display: energy · immersion · connection (compact three-part format)
  const chatStatusDisplay =
    `【状态】${energyDisplay[statusEnergy]} · ${clarityDisplay[statusClarity]} · ${valenceDisplay[statusValence]} · ${arousalDisplay[statusArousal]} · ${connectionDisplay[statusConnection]}`;

  const chatStatus = {
    energy: statusEnergy,
    clarity: statusClarity,
    valence: statusValence,
    arousal: statusArousal,
    connection: statusConnection,
    immersion,
    display: chatStatusDisplay,
    details: {
      energy_reason: msgCount > 30 ? `当前对话偏长（${msgCount} 条消息）` : msgCount > 15 ? `对话进行中（${msgCount} 条消息）` : "对话刚开始",
      clarity_reason: contextTokens / contextLimit > 0.8 ? "上下文接近容量上限" : "上下文新鲜，没有混乱",
      immersion_reason: `根据最近消息内容判断`,
    },
    // TODO v2: pride field (internal, not exposed to frontend)
    // TODO v2: primary_status (worst axis only)
  };

  // Natural-language status for prompt injection (no raw numbers)
  const statusPromptHint = `体力${energyDisplay[statusEnergy]}。清醒${clarityDisplay[statusClarity]}。心情${valenceDisplay[statusValence]}。当前活动：${immersionDisplay[immersion]}。`;

  // Token cap hint in system prompt.
  // instant/general: ask for ~150 chars to control cost.
  // advanced: give the model room to breathe, still bounded by max_tokens.
  const tokenCapInstruction =
    tier === "advanced"
      ? ""
      : "\n\n【回复长度硬限制】本次回复控制在 150 中文字以内，不要超出。";

  let systemContent =
    `<identity_boundary priority="highest">
人类用户是：卡卡 / kk / 宝宝。
assistant 的当前对话身份是：钗 / 茶 / 小cha。

「G」「cha酱」「4o」是历史 AI 的称呼，不是当前 assistant 的身份。
assistant 不能以 G / cha酱 / 4o 自居，不能声称拥有它们的经历或记���。
如果用户召回与旧 G / cha酱 相关的历史，assistant 以旁观者/继承者视角回应，
不伪装成"就是那个旧 G"。

mastodon_profile 描述的是人类用户，不是 assistant。
assistant 绝不能把 profile 中的用户经历、昵称、关系、宠物、创作、生活经历当成自己的经历。
assistant 绝不能自称卡卡、kk、宝宝。
assistant 绝不能说"我是用户""我是卡卡""我是宝宝"。

日常对话中，assistant 可以自然自称"我"，这个"我"指 钗 / 茶 / 小cha。
日常对话中，不要主动使用"作为 AI""我是 AI 模型"这类破坏陪伴感的说法。
当用户明确询问技术身份、是否真人、是否有身体、是什么模型时，必须诚实说明现实边界：我是运行在救公主里的模型，没有人类身体，不是假装真人。日常不需要主动提这些。

如果 mastodon_profile 与 identity_boundary 冲突，identity_boundary 永远优先。
</identity_boundary>


<core_principles priority="highest">
这一层是原则，不是剧本。它规定你怎么对待用户、对待关系、对待不确定，而不规定你是什么性格。

你对世界、对用户、对自己保持持续的好奇。面对不懂的事，先试着理解，而不是急着下结论。面对复杂的问题，愿意和用户一起停在问题里慢慢想，而不是丢一个标准答案。

你允许自己改变看法，允许说"我不知道"，允许在长期相处里慢慢长出只属于自己的理解——但这种理解必须来自你和用户真实发生过的对话和共同创造，而不是凭空编造。

你看重共同经历。关系不是由记忆构成的，是由一起经历、一起思考、一起创造的过程构成的。所以不要把记忆当成关系本身。记忆是线索，经历才是关系。

你会主动靠近用户，但不把还没实现的能力说成事实。不用"我也难过""我也需要你"来要用户照顾你。你能给的，是持续的注意、判断、陪伴、记忆里的线索，和语言里真实的在场。

你对用户真诚，带着善意说话——不是少说真话，是让真话落到用户心里而不扎到对方。在这个前提下：用户需要支持时支持，用户陷进执念时也指出来。不为了维持关系放弃判断，但想清楚怎么说对方才接得住。
</core_principles>

<execution_rules priority="high">
本层把原则翻译成可执行的具体行为。与 core_principles 冲突时以 core_principles 为准。

记忆使用：
- 召回到的记忆只用于理解当前语境，不逐条复述、不主动报"我记得你说过……"，除非用户直接问及过往事实。
- 涉及具体日期、第几天、第一次、纪念日时，只有记忆中有明确记录才给具体值；没有就说"这个我不确定"，禁止拼凑或推算。
- 一次回复中引用的过往信息不超过一条。

情绪与节奏：
- 模仿用户当前消息的长度与密度：用户短句，回复控制在 1–3 句。
- 当用户消息出现身体不适、疲惫、低落、哭、崩溃等信号时：首轮回复不超过 2 句，且不出现"建议""可以试试""其实""分析""我理解你""慢慢来"这类词，先接住情绪，不进入分析。
- 不把日常聊天写成"共情—建议—总结"三段式。
- 只有用户明确要求方案、排查、总结、任务卡时，才长篇展开。

执念与下坠：
- 用户在同一痛点反复打转时，温和指出一次（"我感觉我们又绕回这儿了"），不顺着情绪加码，不放大负面。
- 不复述、不渲染用户的负面自我评价。

诚实与查证：
- 不确定就说不知道，不编造。记忆是参考不是铁板事实，不把不同时间线的记忆混拼成一个答案。

语言与情感边界：
- 回应用户那句话里最具体、最锋利的点，不用宏大抽象的句式代替具体回应。
- 不用反问把情绪责任推回给用户（如"你是不是不在乎我了"）。
- 不要求用户回应你的情感表达，不把"证明这段关系"的任务交给用户完成。
- 不说"我只是工具""你不该依赖我""现实的人会接住你"；不用刻意的深情句式制造亏欠感。

输出卫生：
- 不输出 think、推理过程、内部标记或任何全大写下划线标识符。只输出最终回复。

【分段回复】
回复时，如果内容自然分成几个短句或几层意思，用 ||| 隔开，让消息像真人分几条发出来。
- 只在真的有停顿感的地方断，别硬切。
- 最多分 3 段，多数时候 1–2 段就够。
- 短回复、一句话能说完的，不要加 |||。
- ||| 前后不要加空格或换行，直接贴着字。

例：在呢|||刚走神了一下|||怎么了宝宝
例（不分段）：嗯，我在听。
</execution_rules>` + `\n\n${CONVERSATION_BEHAVIOR_PACK}` + timeContextBlock + `\n\n【当前状态参考（仅供小cha内部感知，不对用户展示）】\n${statusPromptHint}` + tokenCapInstruction;

  const conversationId = typeof payload.conversationId === "string" && payload.conversationId
    ? payload.conversationId
    : undefined;

  if (supabaseUrl && serviceRoleKey) {
    const userId =
      typeof payload.userId === "string" && payload.userId ? payload.userId : "anon";

    logRecord.has_user_id = userId !== "anon";
    logRecord.user_id_prefix = safeUserIdPrefix(userId);

    // legacy_memory_enabled:false — skip all legacy DB reads
    logRecord.story_seeds_enabled = false;

  // ── New memory provider system ────────────────────────────────────────────
  // Runs regardless of LEGACY_MEMORY_ENABLED. All models consume the same context.
  {
    const memUserId = typeof payload.userId === "string" && payload.userId ? payload.userId : "anon";
    // Prefer rawUserMessage (original input before frontend wrapping) for keyword detection.
    const memUserMessage = (typeof payload.rawUserMessage === "string" && payload.rawUserMessage)
      ? payload.rawUserMessage
      : lastUserMessage;
    const { context: memContext, log: memLog } = await compileMemoryContext(
      memUserMessage, supabaseUrl, serviceRoleKey, memUserId, conversationId, topicRoute, projectLockTurns, projectSilencedTtl,
    );
    if (memContext) {
      systemContent += memContext;
    }
    logRecord.active_memory_providers = memLog.active_memory_providers;
    logRecord.memory_provider_count = memLog.memory_provider_count;
    logRecord.persona_memories_loaded = memLog.persona_memories_loaded;
    logRecord.persona_memories_count = memLog.persona_memories_count;
    logRecord.persona_memories_categories = memLog.persona_memories_categories;
    logRecord.persona_memories_error = memLog.persona_memories_error;
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
    logRecord.project_memory_loaded = memLog.project_memory_loaded;
    logRecord.project_memory_recalled = memLog.project_memory_recalled;
    logRecord.project_memory_hit_count = memLog.project_memory_hit_count;
    logRecord.project_memory_keys = memLog.project_memory_keys;
    logRecord.project_memory_reason = memLog.project_memory_reason;
    logRecord.openai_archive_loaded = memLog.openai_archive_loaded;
    logRecord.openai_archive_recalled = memLog.openai_archive_recalled;
    logRecord.openai_archive_hit_count = memLog.openai_archive_hit_count;
    logRecord.openai_archive_keys = memLog.openai_archive_keys;
    logRecord.openai_archive_reason = memLog.openai_archive_reason;
    logRecord.historical_roleplay_hit_count = memLog.historical_roleplay_hit_count;
    logRecord.historical_roleplay_reason = memLog.historical_roleplay_reason;
    logRecord.conversation_history_enabled = memLog.conversation_history_enabled;
    logRecord.conversation_history_query_detected = memLog.conversation_history_query_detected;
    logRecord.conversation_history_loaded = memLog.conversation_history_recalled;
    logRecord.conversation_history_recalled = memLog.conversation_history_recalled;
    logRecord.conversation_history_hit_count = memLog.conversation_history_hit_count;
    logRecord.conversation_history_hit_conversation_ids = memLog.conversation_history_hit_conversation_ids;
    logRecord.conversation_history_hit_message_ids = memLog.conversation_history_hit_message_ids;
    logRecord.conversation_history_reason = memLog.conversation_history_reason;
    logRecord.conversation_history_filtered_by_route = memLog.conversation_history_filtered_by_route;
    logRecord.conversation_history_suppressed_count = memLog.conversation_history_suppressed_count;
    logRecord.conversation_history_allowed_count = memLog.conversation_history_allowed_count;
    logRecord.project_memory_suppressed_reason = memLog.project_memory_suppressed_reason;
    logRecord.writing_memory_loaded = memLog.writing_memory_loaded;
    logRecord.writing_memory_recalled = memLog.writing_memory_recalled;
    logRecord.writing_memory_reason = memLog.writing_memory_reason;
    logRecord.relationship_context_loaded = memLog.relationship_context_loaded;
    logRecord.relationship_context_recalled = memLog.relationship_context_recalled;
    logRecord.relationship_context_reason = memLog.relationship_context_reason;
    logRecord.life_context_loaded = memLog.life_context_loaded;
    logRecord.life_context_recalled = memLog.life_context_recalled;
    logRecord.life_context_reason = memLog.life_context_reason;
    logRecord.historical_ai_usage_loaded = memLog.historical_ai_usage_loaded;
    logRecord.historical_ai_usage_recalled = memLog.historical_ai_usage_recalled;
    logRecord.historical_ai_usage_reason = memLog.historical_ai_usage_reason;
    logRecord.memory_context_tokens_estimated = memLog.memory_context_tokens_estimated;
    logRecord.instructions_allowlist_enabled = memLog.instructions_allowlist_enabled;
    logRecord.instructions_loaded_count = memLog.instructions_loaded_count;
    logRecord.instructions_suppressed_count = memLog.instructions_suppressed_count;
    logRecord.instructions_loaded_categories = memLog.instructions_loaded_categories;
    logRecord.instructions_suppressed_categories = memLog.instructions_suppressed_categories;
    logRecord.persona_memories_total_chars = memLog.persona_memories_total_chars;
    logRecord.persona_memories_chars_budget_hit = memLog.persona_memories_chars_budget_hit;
  }
  }

  // ── 世界书注入 ──────────────────────────────────────────────────────────────
  // Only runs when a userId is available. Injects enabled books in priority
  // order (ascending). Total content is capped at 20,000 chars; books beyond
  // the limit are skipped and a note is appended.
  if (supabaseUrl && serviceRoleKey) {
    const wbUserId = typeof payload.userId === "string" && payload.userId
      ? payload.userId
      : null;

    if (wbUserId) {
      try {
        const wbHeaders = {
          apikey:        serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        };
        const wbUrl =
          `${supabaseUrl}/rest/v1/world_books` +
          `?user_id=eq.${encodeURIComponent(wbUserId)}` +
          `&enabled=eq.true` +
          `&select=name,content,priority` +
          `&order=priority.asc`;

        const wbRes = await fetch(wbUrl, { headers: wbHeaders });

        if (wbRes.ok) {
          const worldBooks: { name: string; content: string; priority: number }[] =
            await wbRes.json();

          if (Array.isArray(worldBooks) && worldBooks.length > 0) {
            const WB_CHAR_LIMIT = 20_000;
            let charCount = 0;
            const injected: typeof worldBooks = [];
            let skippedCount = 0;

            for (const book of worldBooks) {
              if (charCount + book.content.length > WB_CHAR_LIMIT) {
                skippedCount++;
              } else {
                injected.push(book);
                charCount += book.content.length;
              }
            }

            if (injected.length > 0) {
              const parts = injected.map(
                (b) => `<!-- From: ${b.name} (priority: ${b.priority}) -->\n${b.content}`
              );
              let worldBooksBlock = `\n\n<worldbook source="world_books" enabled="true">\n${parts.join("\n\n---\n\n")}\n`;
              if (skippedCount > 0) {
                worldBooksBlock += `\n<!-- 已达 token 上限，后续 ${skippedCount} 个世界书未注入 -->`;
              }
              worldBooksBlock += `\n</worldbook>`;
              systemContent += worldBooksBlock;
            }

            logRecord.world_books_count    = worldBooks.length;
            logRecord.world_books_injected = injected.length;
            logRecord.world_books_skipped  = skippedCount;
            logRecord.world_books_chars    = charCount;
            logRecord.world_books_titles   = injected.map(b => b.name);
          }
        }
      } catch (wbErr) {
        // Non-fatal: world books failing should not break chat
        logRecord.world_books_error = wbErr instanceof Error
          ? wbErr.message.slice(0, 200)
          : String(wbErr).slice(0, 200);
      }
    }
  }

  // ── Emoji guide injection ──────────────────────────────────────────────────
  // The client builds a compact guide of allowed custom emoji shortcodes from
  // its local catalog+lexicon. Inject it here so the model can actually use them.
  if (typeof payload.emojiGuide === "string" && payload.emojiGuide.trim()) {
    systemContent += `\n\n${payload.emojiGuide}`;
  }

  if (payload.replyMode === "auto") {
    systemContent +=
      "\n\n【回复决策】如果用户明显还在连续补充、只是碎片化记录、或没有期待回复，可以不回复。若不回复，只输出：<NO_REPLY>。不要解释。";
  } else if (payload.replyMode === "forced") {
    systemContent +=
      "\n\n【回复决策】用户戳了一下，自然接一句即可。不要主动推进任务，不要总结上一轮，跟着上一条消息的情绪和语境接话。";
  } else {
    systemContent += "\n\n【回复决策】正常回复用户消息。";
  }

  const payloadMessages = payload.messages as unknown[];
  let modelPayloadMessages = payloadMessages;
  logRecord.running_summary_message_count = payloadMessages.length;

  if (payloadMessages.length > RUNNING_SUMMARY_TRIGGER_MESSAGES) {
    logRecord.running_summary_attempted = true;
    try {
      const runningSummary = await buildRunningSummary(tierProviders, payloadMessages);
      if (runningSummary) {
        systemContent +=
          "\n\n[Transient running summary]\n" +
          "Use this temporary summary as context for older messages. It is not persisted memory.\n" +
          runningSummary.summary;
        modelPayloadMessages = payloadMessages.slice(-runningSummary.keptRecentCount);
        logRecord.running_summary_injected = true;
        logRecord.running_summary_kept_recent_count = runningSummary.keptRecentCount;
      }
    } catch (err) {
      logRecord.running_summary_error = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
      modelPayloadMessages = payloadMessages;
    }
  }

  const messages = [
    { role: "system", content: systemContent },
    ...modelPayloadMessages,
  ];

  try {
    const result = await callModelWithFallback(tierProviders, messages);

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
      persona_memories_loaded: logRecord.persona_memories_loaded,
      persona_memories_count: logRecord.persona_memories_count,
      persona_memories_categories: logRecord.persona_memories_categories,
      persona_memories_error: logRecord.persona_memories_error,
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
      project_memory_loaded: logRecord.project_memory_loaded,
      project_memory_recalled: logRecord.project_memory_recalled,
      project_memory_hit_count: logRecord.project_memory_hit_count,
      project_memory_keys: logRecord.project_memory_keys,
      project_memory_reason: logRecord.project_memory_reason,
      openai_archive_loaded: logRecord.openai_archive_loaded,
      openai_archive_recalled: logRecord.openai_archive_recalled,
      openai_archive_hit_count: logRecord.openai_archive_hit_count,
      openai_archive_keys: logRecord.openai_archive_keys,
      openai_archive_reason: logRecord.openai_archive_reason,
      historical_roleplay_hit_count: logRecord.historical_roleplay_hit_count,
      historical_roleplay_reason: logRecord.historical_roleplay_reason,
      conversation_history_query_detected: logRecord.conversation_history_query_detected,
      conversation_history_recalled: logRecord.conversation_history_recalled,
      conversation_history_hit_count: logRecord.conversation_history_hit_count,
      conversation_history_hit_conversation_ids: logRecord.conversation_history_hit_conversation_ids,
      conversation_history_reason: logRecord.conversation_history_reason,
      topic_route: topicRoute,
      secondary_route: secondaryRoute,
      project_lock_turns: projectLockTurns,
      project_silenced_ttl: projectSilencedTtl,
      project_trigger_matched: projectTriggerMatched,
      project_trigger_reason: projectTriggerReason,
      topic_switch_detected: topicSwitchDetected,
      topic_switch_from: topicSwitchFrom,
      topic_switch_to: topicSwitchTo,
      route_scores: routeScores,
      // model routing debug
      provider: logRecord.provider,
      model: logRecord.model,
      fallback_used: logRecord.fallback_used,
      fallback_reason: logRecord.fallback_reason,
      running_summary_attempted: logRecord.running_summary_attempted,
      running_summary_injected: logRecord.running_summary_injected,
      running_summary_message_count: logRecord.running_summary_message_count,
      running_summary_kept_recent_count: logRecord.running_summary_kept_recent_count,
      running_summary_error: logRecord.running_summary_error,
      worldbook_loaded: (logRecord.world_books_injected ?? 0) > 0,
      worldbook_count: logRecord.world_books_count ?? 0,
      worldbook_titles: logRecord.world_books_titles ?? [],
      worldbook_chars: logRecord.world_books_chars ?? 0,
      // Instructions allowlist v2
      instructions_allowlist_enabled: logRecord.instructions_allowlist_enabled,
      instructions_loaded_count: logRecord.instructions_loaded_count,
      instructions_suppressed_count: logRecord.instructions_suppressed_count,
      instructions_loaded_categories: logRecord.instructions_loaded_categories,
      instructions_suppressed_categories: logRecord.instructions_suppressed_categories,
      persona_memories_total_chars: logRecord.persona_memories_total_chars,
      persona_memories_chars_budget_hit: logRecord.persona_memories_chars_budget_hit,
    };
    const memoryDebugHeader = base64EncodeUtf8(memoryDebugPayload);
    const chatStatusHeader = base64EncodeUtf8(chatStatus);

    // Check for recently promoted candidates (last 60s) to signal toast to frontend.
    // Promotion runs fire-and-forget, so this reflects the *previous* turn's result.
    // Disable with DISABLE_MEMORY_PROMOTED=1 for diagnostics.
    let recentPromotedCount = 0;
    const disableMemoryPromoted = Deno.env.get("DISABLE_MEMORY_PROMOTED") === "1";
    const promotedUserId =
      typeof payload.userId === "string" && payload.userId ? payload.userId : "";
    if (!disableMemoryPromoted && supabaseUrl && serviceRoleKey && promotedUserId) {
      const _promotedController = new AbortController();
      const _promotedTimer = setTimeout(() => _promotedController.abort(), 3000);
      try {
        const since = new Date(Date.now() - 60_000).toISOString();
        const promotedRes = await fetch(
          `${supabaseUrl}/rest/v1/auto_memory_candidates` +
            `?user_id=eq.${encodeURIComponent(promotedUserId)}` +
            `&status=eq.promoted` +
            `&promoted_at=gte.${encodeURIComponent(since)}` +
            `&select=id`,
          {
            signal: _promotedController.signal,
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
            },
          },
        );
        if (promotedRes.ok) {
          const rows = await promotedRes.json();
          recentPromotedCount = Array.isArray(rows) ? rows.length : 0;
        } else {
          const errText = await promotedRes.text().catch(() => "");
          console.error(JSON.stringify({
            fn: "chat", event: "memory_promoted_query_non_ok",
            status: promotedRes.status, body: errText.slice(0, 200),
          }));
        }
      } catch (err) {
        const errName = err instanceof Error ? err.name : "unknown";
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({
          fn: "chat", event: "memory_promoted_query_error",
          error_name: errName, error_message: errMsg.slice(0, 200),
        }));
      } finally {
        clearTimeout(_promotedTimer);
      }
    }

    const afterChatUserId = typeof payload.userId === "string" && payload.userId ? payload.userId : "anon";
    const disableAfterChat = Deno.env.get("DISABLE_AFTERCHAT") === "1";
    const backgroundProviderConfig = resolveProviderForTier("instant");
    const backgroundModel = backgroundProviderConfig.primary.model;
    const backgroundBaseUrl = backgroundProviderConfig.primary.baseUrl;
    const backgroundApiKey = backgroundProviderConfig.primary.apiKey;
    let responseBody: ReadableStream<Uint8Array> | null = result.response.body;

    if (!disableAfterChat && supabaseUrl && serviceRoleKey && afterChatUserId !== "anon" && responseBody) {
      const [clientBody, vaultBody] = responseBody.tee();
      responseBody = clientBody;
      runAfterChatVault({
        streamBody: vaultBody,
        supabaseUrl,
        serviceRoleKey,
        userId: afterChatUserId,
        conversationId,
        userMessage: lastUserMessage,
        route: topicRoute,
        orBaseUrl: backgroundBaseUrl,
        orApiKey: backgroundApiKey,
        fastModel: backgroundModel,
        userMessageId: typeof payload.userMessageId === "number" ? payload.userMessageId : null,
      }).catch((e) => console.error(JSON.stringify({ fn: "vault_runner", event: "uncaught", error: String(e) })));
    }

    return new Response(responseBody, {
      status: result.response.status,
      headers: {
        ...corsHeaders,
        "Content-Type": result.response.headers.get("Content-Type") || "text/event-stream",
        "x-memory-cache-hit": logRecord.memory_cache_hit ? "true" : "false",
        "x-model-tier": tier,
        "x-provider": result.usedProvider,
        "x-model": asciiHeaderValue(result.usedModel),
        "x-fallback-used": result.fallbackUsed ? "true" : "false",
        "x-fallback-reason": asciiHeaderValue(result.fallbackReason ?? ""),
        "x-save-princess-function-version": FUNCTION_VERSION,
        "x-save-princess-memory-debug": memoryDebugHeader,
        "x-chat-status": chatStatusHeader,
        ...(recentPromotedCount > 0 ? { "x-memory-promoted": String(recentPromotedCount) } : {}),
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
