// ── vault_runner.ts ───────────────────────────────────────────────────────────
//
// Standalone after-chat hook: drain SSE stream → P1 candidate extraction →
// P2 promotion. Replaces the personality_system.ts afterChat wiring that was
// DISABLED when personality_system was retired.
//
// Called fire-and-forget from index.ts after response.body.tee().
// Never throws — all errors are caught and logged.

import { runAutoMemoryVault, promoteAutoMemoryCandidates } from "./auto_memory_vault.ts";

// ── drainSSEStream ────────────────────────────────────────────────────────────
// Reads an OpenAI-compatible SSE stream and concatenates all delta.content
// tokens into a single string. Returns "" on error or empty stream.

async function drainSSEStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

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
        if (raw === "[DONE]") return fullText;
        try {
          const parsed = JSON.parse(raw);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === "string") fullText += delta;
        } catch {
          // skip malformed SSE chunks
        }
      }
    }
  } catch {
    // ignore read errors — return whatever was accumulated
  }
  return fullText;
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
  } = params;

  try {
    // 1. Drain the background SSE branch to recover the full assistant response text.
    const gResponse = await drainSSEStream(streamBody);
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
