// Shared model client — used by chat, diary, and future edge functions.
// Provider/fallback logic lives here; individual functions import from this module.

export type ModelTier = "instant" | "general" | "advanced";
export type ModelPurpose = "chat" | "diary" | "checker" | "web_search";
export type ProviderName = "fiftyfive" | "fuka" | "openrouter";

export type ProviderConfig = {
  providerName: ProviderName;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  tier: ModelTier;
  role: "primary" | "fallback";
};

export type TierProviders = {
  primary: ProviderConfig;
  fallback: ProviderConfig | null;
};

export type CallResult = {
  response: Response;
  usedModel: string;
  usedProvider: ProviderName;
  fallbackUsed: boolean;
  fallbackModel: string | null;
  fallbackProvider: ProviderName | null;
  fallbackReason: string | null;
  modelCallMs: number;
};

export type TextCallResult = {
  text: string;
  usedProvider: ProviderName;
  usedModel: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  modelCallMs: number;
};

const VALID_TIERS: ModelTier[] = ["instant", "general", "advanced"];

export function normalizeTier(raw: string | undefined): ModelTier {
  if (raw && VALID_TIERS.includes(raw as ModelTier)) return raw as ModelTier;
  return "general";
}

export function toCompletionsUrl(base: string): string {
  if (base.endsWith("/chat/completions")) return base;
  const stripped = base.replace(/\/$/, "");
  if (/\/v\d+$/.test(stripped)) return stripped + "/chat/completions";
  return stripped + "/v1/chat/completions";
}

function assertFiftyfiveModel(model: string, tierName: string): void {
  const FUKA_CHANNEL_PATTERN = /浣溪沙|鸢尾花|百香果|\u2460|\u2461|\u2462|\u2463|\u2464/;
  if (FUKA_CHANNEL_PATTERN.test(model)) {
    console.error(JSON.stringify({
      fn: "resolveProviderForTier",
      event: "config_error_fuka_model_on_fiftyfive",
      tier: tierName,
      model,
      hint: "fuka channel name in fiftyfive primary. Set MODEL_" + tierName.toUpperCase() + "_PRIMARY to a valid 55api model id.",
    }));
    throw new Error(`config_error: fuka channel name in fiftyfive primary for tier ${tierName}: "${model}". Check MODEL_${tierName.toUpperCase()}_PRIMARY secret.`);
  }
}

export function resolveProviderForTier(tier: ModelTier): TierProviders {
  const fiftyfiveBaseUrl = toCompletionsUrl(
    Deno.env.get("FIFTYFIVE_BASE_URL") ||
    Deno.env.get("OPENROUTER_BASE_URL") ||
    "https://api.openai.com/v1/chat/completions",
  );

  const legacyFiftyfiveKey = Deno.env.get("FIFTYFIVE_API_KEY") || "";
  const fiftyfiveKeyGemini = Deno.env.get("FIFTYFIVE_API_KEY_GEMINI") || legacyFiftyfiveKey;
  const fiftyfiveKeyGpt   = Deno.env.get("FIFTYFIVE_API_KEY_GPT")   || legacyFiftyfiveKey;
  const fiftyfiveKeyClaude = Deno.env.get("FIFTYFIVE_API_KEY_CLAUDE") || legacyFiftyfiveKey;

  const fukaBaseUrl = toCompletionsUrl(
    Deno.env.get("FUKA_BASE_URL") ||
    Deno.env.get("OPENROUTER_BASE_URL") ||
    "https://api.fuka.win/v1/chat/completions",
  );
  const fukaApiKey =
    Deno.env.get("FUKA_API_KEY") ||
    Deno.env.get("OPENROUTER_API_KEY") ||
    "";

  const legacyDefault = Deno.env.get("DEFAULT_MODEL") || Deno.env.get("MODEL_NAME") || "";

  switch (tier) {
    case "instant": {
      const maxTokens = parseInt(Deno.env.get("MAX_OUTPUT_TOKENS_INSTANT") || "300", 10);
      const primaryModel =
        Deno.env.get("MODEL_INSTANT_PRIMARY") || Deno.env.get("FAST_MODEL") || legacyDefault;
      assertFiftyfiveModel(primaryModel, "instant");
      const fallbackModel =
        Deno.env.get("MODEL_INSTANT_FALLBACK") || Deno.env.get("FALLBACK_MODEL") || "";
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
        Deno.env.get("MODEL_ADVANCED_PRIMARY") || Deno.env.get("ADVANCED_MODEL") || legacyDefault;
      assertFiftyfiveModel(primaryModel, "advanced");
      const fallbackModel =
        Deno.env.get("MODEL_ADVANCED_FALLBACK") || Deno.env.get("FALLBACK_MODEL") || "";
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
      const maxTokens = parseInt(Deno.env.get("MAX_OUTPUT_TOKENS_GENERAL") || "300", 10);
      const primaryModel = Deno.env.get("MODEL_GENERAL_PRIMARY") || legacyDefault;
      assertFiftyfiveModel(primaryModel, "general");
      const fallbackModel =
        Deno.env.get("MODEL_GENERAL_FALLBACK") || Deno.env.get("FALLBACK_MODEL") || "";
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

export function isFallbackableStatus(status: number, bodyText: string): boolean {
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

const TIER_TIMEOUT_MS: Record<ModelTier, number> = {
  instant: 20_000,
  general: 35_000,
  advanced: 60_000,
};

export function getTimeoutMs(tier: ModelTier): number {
  const envKey = `MODEL_TIMEOUT_MS_${tier.toUpperCase()}` as
    | "MODEL_TIMEOUT_MS_INSTANT"
    | "MODEL_TIMEOUT_MS_GENERAL"
    | "MODEL_TIMEOUT_MS_ADVANCED";
  const fromEnv = parseInt(Deno.env.get(envKey) || "", 10);
  return isNaN(fromEnv) ? TIER_TIMEOUT_MS[tier] : fromEnv;
}

/** Streaming call — used by chat. */
export async function callModel(
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
      headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: provider.model, messages, stream: true, max_tokens: provider.maxTokens, stream_options: { include_usage: true } }),
      signal: controller.signal,
    });
    return { res, ms: Date.now() - t };
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
    if (isTimeout) {
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

/** Streaming call with one-shot fallback — used by chat. */
export async function callModelWithFallback(
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
    const errMsg = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : "unknown";
    console.error(JSON.stringify({
      fn: "callModelWithFallback", event: "primary_fetch_error",
      primary_error_name: errName, primary_error_message: errMsg.slice(0, 300),
      primary_providerName: primary.providerName, primary_model: primary.model,
      has_fallback: Boolean(fallback),
    }));
    if (!fallback) throw err;
    const fallbackReason = `primary_error: ${errMsg.slice(0, 120)}`;
    try {
      const fb = await callModel(fallback, messages);
      return {
        response: fb.res, usedModel: fallback.model, usedProvider: fallback.providerName,
        fallbackUsed: true, fallbackModel: fallback.model, fallbackProvider: fallback.providerName,
        fallbackReason, modelCallMs: fb.ms,
      };
    } catch (fbErr) {
      const fbMsg = fbErr instanceof Error ? fbErr.message : String(fbErr);
      console.error(JSON.stringify({
        fn: "callModelWithFallback", event: "fallback_fetch_error",
        fallback_error_message: fbMsg.slice(0, 300), fallback_model: fallback.model,
      }));
      throw fbErr;
    }
  }

  if (primaryRes.ok) {
    return {
      response: primaryRes, usedModel: primary.model, usedProvider: primary.providerName,
      fallbackUsed: false, fallbackModel: null, fallbackProvider: null,
      fallbackReason: null, modelCallMs: primaryMs,
    };
  }

  const bodyText = await primaryRes.text();
  if (!fallback || !isFallbackableStatus(primaryRes.status, bodyText)) {
    return {
      response: new Response(bodyText, { status: primaryRes.status, headers: primaryRes.headers }),
      usedModel: primary.model, usedProvider: primary.providerName,
      fallbackUsed: false, fallbackModel: null, fallbackProvider: null,
      fallbackReason: null, modelCallMs: primaryMs,
    };
  }

  const bodySnippet = bodyText.slice(0, 120).replace(/[\r\n]+/g, " ");
  const fallbackReason = `primary_${primaryRes.status}: ${bodySnippet}`;
  const { res: fallbackRes, ms: fallbackMs } = await callModel(fallback, messages);
  return {
    response: fallbackRes, usedModel: fallback.model, usedProvider: fallback.providerName,
    fallbackUsed: true, fallbackModel: fallback.model, fallbackProvider: fallback.providerName,
    fallbackReason, modelCallMs: primaryMs + fallbackMs,
  };
}

/** Non-streaming text call — used by chat (summaries) and diary. */
export async function callModelText(
  provider: ProviderConfig,
  messages: unknown[],
  maxTokens: number,
  temperature?: number,
): Promise<string> {
  const timeoutMs = getTimeoutMs(provider.tier);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body: Record<string, unknown> = {
      model: provider.model, messages, stream: false, max_tokens: maxTokens,
    };
    if (temperature !== undefined) body.temperature = temperature;
    const res = await fetch(provider.baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`model_${res.status}: ${text.slice(0, 160)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
    return typeof text === "string" ? text.trim() : "";
  } finally {
    clearTimeout(timer);
  }
}

/** Non-streaming text call with fallback — used by diary/checker. */
export async function callModelTextWithFallback(
  tierProviders: TierProviders,
  messages: unknown[],
  opts: { maxTokens: number; temperature?: number; purpose?: string },
): Promise<TextCallResult> {
  const { primary, fallback } = tierProviders;
  const t = Date.now();

  try {
    const start = Date.now();
    const text = await callModelText(primary, messages, opts.maxTokens, opts.temperature);
    return {
      text, usedProvider: primary.providerName, usedModel: primary.model,
      fallbackUsed: false, fallbackReason: null, modelCallMs: Date.now() - start,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      fn: "callModelTextWithFallback", event: "primary_error",
      purpose: opts.purpose ?? "unknown", error: errMsg.slice(0, 300),
      provider: primary.providerName, model: primary.model,
    }));
    if (!fallback) throw err;
    const fallbackReason = `primary_error: ${errMsg.slice(0, 120)}`;
    const fbText = await callModelText(fallback, messages, opts.maxTokens, opts.temperature);
    return {
      text: fbText, usedProvider: fallback.providerName, usedModel: fallback.model,
      fallbackUsed: true, fallbackReason, modelCallMs: Date.now() - t,
    };
  }
}
