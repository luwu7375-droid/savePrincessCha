// ── vault_runner.ts ───────────────────────────────────────────────────────────
//
// Standalone after-chat hook: drain SSE stream → P1 candidate extraction →
// P2 promotion. Replaces the personality_system.ts afterChat wiring that was
// DISABLED when personality_system was retired.
//
// Called fire-and-forget from index.ts after response.body.tee().
// Never throws — all errors are caught and logged.

import { runAutoMemoryVault, promoteAutoMemoryCandidates } from "./auto_memory_vault.ts";
import { calculateCostCny } from "../_shared/cost-calculator.ts";

// ── drainSSEStream ────────────────────────────────────────────────────────────
// Reads an OpenAI-compatible SSE stream, concatenates delta.content tokens,
// and captures the final usage object (last chunk with usage field).

interface SSEDrainResult {
  text: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  } | null;
}

async function drainSSEStream(body: ReadableStream<Uint8Array>): Promise<SSEDrainResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";
  let lastUsage: SSEDrainResult["usage"] = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") return { text: fullText, usage: lastUsage };
        try {
          const parsed = JSON.parse(raw);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === "string") fullText += delta;
          // Capture usage — typically on the last non-DONE chunk
          if (parsed?.usage) lastUsage = parsed.usage;
        } catch {
          // skip malformed SSE chunks
        }
      }
    }
  } catch {
    // ignore read errors — return whatever was accumulated
  }
  return { text: fullText, usage: lastUsage };
}

// ── writeCostLog ──────────────────────────────────────────────────────────────

async function writeCostLog(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  tier: string;
  site: string;
  rawModel: string;
  inTokens: number;
  outTokens: number;
  cacheRead: number;
  cacheWrite: number;
  costCny: number;
  isFallback: boolean;
  fallbackReason: string | null;
}): Promise<void> {
  const {
    supabaseUrl, serviceRoleKey, userId, tier, site, rawModel,
    inTokens, outTokens, cacheRead, cacheWrite, costCny, isFallback, fallbackReason,
  } = params;
  try {
    await fetch(`${supabaseUrl}/rest/v1/cost_log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        tier,
        site,
        raw_model: rawModel,
        in_tokens: inTokens,
        out_tokens: outTokens,
        cache_read_tokens: cacheRead,
        cache_write_tokens: cacheWrite,
        cost_cny: costCny,
        is_fallback: isFallback,
        fallback_reason: fallbackReason ?? null,
      }),
    });
  } catch (err) {
    // Non-critical — log but don't surface
    console.error(JSON.stringify({
      fn: "writeCostLog",
      event: "insert_error",
      error: err instanceof Error ? err.message : String(err),
    }));
  }
}

// ── runAfterChatVault ─────────────────────────────────────────────────────────

export type AfterChatVaultParams = {
  streamBody: ReadableStream<Uint8Array>;
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  conversationId: string | undefined;
  userMessage: string;
  route: string | null;
  orBaseUrl: string;
  orApiKey: string;
  fastModel: string;
  userMessageId: number | null;
  // cost tracking
  tier: string;
  site: string;
  rawModel: string;
  isFallback: boolean;
  fallbackReason: string | null;
};

export async function runAfterChatVault(params: AfterChatVaultParams): Promise<void> {
  const {
    streamBody,
    supabaseUrl,
    serviceRoleKey,
    userId,
    conversationId,
    userMessage,
    route,
    orBaseUrl,
    orApiKey,
    fastModel,
    userMessageId,
    tier,
    site,
    rawModel,
    isFallback,
    fallbackReason,
  } = params;

  try {
    // 1. Drain the background SSE branch to recover the full assistant response text
    //    and the usage object from the final SSE chunk.
    const { text: gResponse, usage } = await drainSSEStream(streamBody);

    // 1a. Write cost_log row (fire-and-forget — does not block vault logic)
    if (usage && supabaseUrl && serviceRoleKey && userId) {
      const inTokens   = usage.prompt_tokens ?? 0;
      const outTokens  = usage.completion_tokens ?? 0;
      const cacheRead  = usage.prompt_tokens_details?.cached_tokens ?? 0;
      const cacheWrite = 0; // OpenAI-compat streams don't expose cache_creation_tokens
      const costCny = calculateCostCny(site, rawModel, inTokens, outTokens, cacheRead, cacheWrite);
      writeCostLog({
        supabaseUrl, serviceRoleKey, userId, tier, site, rawModel,
        inTokens, outTokens, cacheRead, cacheWrite, costCny, isFallback, fallbackReason,
      }).catch(() => {});
    }

    if (!gResponse.trim()) {
      console.log(JSON.stringify({
        fn: "runAfterChatVault",
        event: "skip_empty_response",
        user_id_prefix: userId.slice(0, 6),
      }));
      return;
    }

    const vaultEnabled = Deno.env.get("AUTO_MEMORY_VAULT_ENABLED") === "true";
    console.log(JSON.stringify({
      fn: "runAfterChatVault",
      event: "gate_check",
      vault_enabled: vaultEnabled,
      user_id_prefix: userId.slice(0, 6),
      userMessage_len: userMessage.length,
      gResponse_len: gResponse.length,
      route,
    }));

    if (!vaultEnabled) return;

    // 2. P1 — extract candidates into auto_memory_candidates.
    const vaultResult = await runAutoMemoryVault({
      supabaseUrl,
      serviceRoleKey,
      userId,
      conversationId,
      userMessage,
      gResponse,
      route,
      orBaseUrl,
      orApiKey,
      fastModel,
      userMessageId,
    });

    console.log(JSON.stringify({
      fn: "runAfterChatVault",
      event: "p1_done",
      ...vaultResult,
    }));

    // 3. P2 — promote eligible auto_accept candidates into memories.
    const promotionEnabled = Deno.env.get("AUTO_MEMORY_PROMOTION_ENABLED") === "true";
    if (!promotionEnabled) return;

    const promotionResult = await promoteAutoMemoryCandidates({
      supabaseUrl,
      serviceRoleKey,
      userId,
      conversationId,
      limit: 10,
      dryRun: false,
    });

    console.log(JSON.stringify({
      fn: "runAfterChatVault",
      event: "p2_done",
      ...promotionResult,
    }));
  } catch (err) {
    console.error(JSON.stringify({
      fn: "runAfterChatVault",
      event: "top_level_error",
      error: err instanceof Error ? err.message : String(err),
      user_id_prefix: userId.slice(0, 6),
    }));
  }
}
