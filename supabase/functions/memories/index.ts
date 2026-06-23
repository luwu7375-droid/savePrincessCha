import { runAutoMemoryVault, promoteAutoMemoryCandidates } from "../chat/auto_memory_vault.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-memory-admin-token",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MEMORY_PROVIDER_CATEGORIES = [
  "current_context_summary",
  "interaction_preferences",
  "identity_context",
  "project_memory",
  "writing_memory",
  "life_context",
  "relationship_context",
  "historical_ai_usage",
] as const;
type MemoryDomain = typeof MEMORY_PROVIDER_CATEGORIES[number];

const MEMORY_DOMAIN_ALIASES: Record<string, MemoryDomain> = {
  general: "current_context_summary",
  persona: "identity_context",
  work: "project_memory",
  writing: "writing_memory",
  life: "life_context",
  relation: "relationship_context",
  current_context_summary: "current_context_summary",
  interaction_preferences: "interaction_preferences",
  identity_context: "identity_context",
  project_memory: "project_memory",
  writing_memory: "writing_memory",
  life_context: "life_context",
  relationship_context: "relationship_context",
  historical_ai_usage: "historical_ai_usage",
};

function normalizeMemoryDomain(domain: unknown): MemoryDomain {
  return typeof domain === "string" && MEMORY_DOMAIN_ALIASES[domain]
    ? MEMORY_DOMAIN_ALIASES[domain]
    : "current_context_summary";
}

Deno.serve(async (req) => {
  const _url = new URL(req.url);
  console.log("memories hit", { method: req.method, search: _url.search });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");

  const supabaseUrl = Deno.env.get("DB_URL");
  const serviceKey = Deno.env.get("DB_SERVICE_ROLE_KEY");

  // ── recent updates: read-only, no admin token required ───────────────────
  if (type === "recent" && req.method === "GET") {
    if (!supabaseUrl || !serviceKey) return json({ error: "DB not configured" }, 500);
    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };
    const userId = url.searchParams.get("userId");

    // Helper: fetch source_preview from messages table for first id in array
    async function fetchSourcePreview(sourceIds: number[] | null): Promise<string | null> {
      if (!sourceIds || sourceIds.length === 0) return null;
      const firstId = sourceIds[0];
      const res = await fetch(
        `${supabaseUrl}/rest/v1/messages?select=content&id=eq.${firstId}&limit=1`,
        { headers: dbHeaders }
      );
      if (!res.ok) return null;
      const rows = await res.json() as { content: string }[];
      if (!Array.isArray(rows) || rows.length === 0) return null;
      const text = rows[0].content || "";
      return text.length > 80 ? text.slice(0, 80) + "…" : text;
    }

    // Step 1: memories table, filtered by user_id
    const memUrl = userId
      ? `${supabaseUrl}/rest/v1/memories?select=id,content,category,created_at,source_msg_ids&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=3`
      : `${supabaseUrl}/rest/v1/memories?select=id,content,category,created_at,source_msg_ids&order=created_at.desc&limit=3`;
    const memRes = await fetch(memUrl, { headers: dbHeaders });
    if (memRes.ok) {
      const memRows = await memRes.json() as { id: string; content: string; category: string; created_at: string; source_msg_ids: number[] | null }[];
      if (Array.isArray(memRows) && memRows.length > 0) {
        const rowsWithPreview = await Promise.all(memRows.map(async (mem) => ({
          ...mem,
          source_preview: await fetchSourcePreview(mem.source_msg_ids),
        })));
        return json({ source: "memories", rows: rowsWithPreview }, 200);
      }
    }

    // Step 2: fallback to auto_memory_candidates filtered by userId
    if (userId) {
      const candRes = await fetch(
        `${supabaseUrl}/rest/v1/auto_memory_candidates?select=id,content,status,candidate_type,created_at,user_id,source_msg_ids&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=3`,
        { headers: dbHeaders }
      );
      if (candRes.ok) {
        const candRows = await candRes.json() as { source_msg_ids: number[] | null; [key: string]: unknown }[];
        if (Array.isArray(candRows) && candRows.length > 0) {
          const rowsWithPreview = await Promise.all(candRows.map(async (c) => ({
            ...c,
            source_preview: await fetchSourcePreview(c.source_msg_ids),
          })));
          return json({ source: "candidates", rows: rowsWithPreview }, 200);
        }
        return json({ source: "candidates", rows: [] }, 200);
      }
    }

    return json({ source: "memories", rows: [] }, 200);
  }

  // ── vault_after_chat: frontend-triggered P1+P2, user auth required ──────────
  // POST ?type=vault_after_chat
  // Body: { userId, conversationId?, userMessage, assistantMessage, userMessageId?, route? }
  // Requires Authorization: Bearer <user_access_token> header.
  // Validates user identity via JWT, then writes with service role key.
  // Returns JSON summary; errors are ok:false, never throws.

  if (type === "vault_after_chat" && req.method === "POST") {
    if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "DB not configured" }, 500);

    // ── auth: verify user JWT from Authorization header ──────────────────────
    const authHeader = req.headers.get("authorization");
    let authenticatedUserId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const userToken = authHeader.slice(7);
      try {
        // Verify JWT with service role key
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const supabaseAdmin = createClient(supabaseUrl, serviceKey);
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(userToken);

        if (authError || !user) {
          console.warn("[vault_after_chat] auth failed:", authError?.message ?? "no user");
          return json({ ok: false, error: "unauthorized", reason: "invalid or expired token" }, 401);
        }

        authenticatedUserId = user.id;
        console.log("[vault_after_chat] authenticated user:", authenticatedUserId.slice(0, 8));
      } catch (err) {
        console.error("[vault_after_chat] auth verification error:", err);
        return json({ ok: false, error: "unauthorized", reason: "token verification failed" }, 401);
      }
    } else {
      console.warn("[vault_after_chat] missing Authorization header");
      return json({ ok: false, error: "unauthorized", reason: "missing Authorization header" }, 401);
    }

    const vaultEnabled = Deno.env.get("AUTO_MEMORY_VAULT_ENABLED") === "true";
    if (!vaultEnabled) {
      return json({ ok: false, reason: "AUTO_MEMORY_VAULT_ENABLED not set" }, 200);
    }

    let body: {
      userId?: string;
      conversationId?: string;
      userMessage?: string;
      assistantMessage?: string;
      userMessageId?: number | null;
      route?: string | null;
    };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, reason: "invalid JSON body" }, 400);
    }

    const { userId, conversationId, userMessage, assistantMessage, userMessageId, route } = body;

    // Validate userId matches authenticated user
    if (!userId || typeof userId !== "string" || !userId.trim()) {
      return json({ ok: false, reason: "userId required" }, 400);
    }
    if (userId !== authenticatedUserId) {
      console.warn("[vault_after_chat] userId mismatch:", { provided: userId.slice(0, 8), authenticated: authenticatedUserId.slice(0, 8) });
      return json({ ok: false, error: "forbidden", reason: "userId must match authenticated user" }, 403);
    }

    if (!userMessage || typeof userMessage !== "string" || !userMessage.trim()) {
      return json({ ok: false, reason: "userMessage required" }, 400);
    }
    if (!assistantMessage || typeof assistantMessage !== "string") {
      return json({ ok: false, reason: "assistantMessage required" }, 400);
    }

    // ── Resolve LLM provider (mirrors chat/index.ts instant tier) ────────────
    const rawBaseUrl =
      Deno.env.get("FIFTYFIVE_BASE_URL") ||
      Deno.env.get("OPENROUTER_BASE_URL") ||
      "";
    // Normalise to full /chat/completions endpoint (same logic as toCompletionsUrl in chat/index.ts)
    function toCompletionsUrl(base: string): string {
      if (base.endsWith("/chat/completions")) return base;
      const stripped = base.replace(/\/$/, "");
      if (/\/v\d+$/.test(stripped)) return stripped + "/chat/completions";
      return stripped + "/v1/chat/completions";
    }
    const orBaseUrl = rawBaseUrl ? toCompletionsUrl(rawBaseUrl) : "";
    // instant tier uses FIFTYFIVE_API_KEY_GEMINI first, then generic key, then OpenRouter
    const legacyFiftyfiveKey = Deno.env.get("FIFTYFIVE_API_KEY") || "";
    const orApiKey =
      Deno.env.get("FIFTYFIVE_API_KEY_GEMINI") ||
      legacyFiftyfiveKey ||
      Deno.env.get("FIFTYFIVE_API_KEY_GPT") ||
      Deno.env.get("FIFTYFIVE_API_KEY_CLAUDE") ||
      Deno.env.get("OPENROUTER_API_KEY") ||
      "";
    const fastModel =
      Deno.env.get("MODEL_INSTANT_PRIMARY") ||
      Deno.env.get("FAST_MODEL") ||
      Deno.env.get("MODEL_NAME") ||
      "";

    console.log(JSON.stringify({
      fn: "vault_after_chat",
      event: "provider_gate",
      raw_base_url: rawBaseUrl.slice(0, 60),
      resolved_base_url: orBaseUrl.slice(0, 80),
      has_orBaseUrl: Boolean(orBaseUrl),
      has_orApiKey: Boolean(orApiKey),
      has_fastModel: Boolean(fastModel),
      fastModel,
      user_id_prefix: userId.slice(0, 6),
    }));

    if (!orBaseUrl || !orApiKey || !fastModel) {
      return json({ ok: false, reason: "LLM provider env vars not configured" }, 500);
    }

    try {
      // P1 — extract candidates into auto_memory_candidates
      const p1 = await runAutoMemoryVault({
        supabaseUrl,
        serviceRoleKey: serviceKey,
        userId,
        conversationId: conversationId || undefined,
        userMessage,
        gResponse: assistantMessage,
        route: route ?? null,
        orBaseUrl,
        orApiKey,
        fastModel,
        userMessageId: typeof userMessageId === "number" ? userMessageId : null,
      });

      // P2 — promote eligible auto_accept candidates into memories
      const promotionEnabled = Deno.env.get("AUTO_MEMORY_PROMOTION_ENABLED") === "true";
      let p2 = null;
      if (promotionEnabled) {
        p2 = await promoteAutoMemoryCandidates({
          supabaseUrl,
          serviceRoleKey: serviceKey,
          userId,
          conversationId: conversationId || undefined,
          limit: 10,
          dryRun: false,
        });
      }

      return json({
        ok: true,
        p1,
        p2,
        promoted_count: p2?.promoted_count ?? 0,
        debug: {
          has_auth: true,
          user_id: authenticatedUserId,
          userMessage_len: userMessage.trim().length,
          userMessage_head: userMessage.trim().slice(0, 30),
          assistantMessage_len: assistantMessage.length,
          has_provider_base_url: Boolean(orBaseUrl),
          has_provider_api_key: Boolean(orApiKey),
          model: fastModel,
          p1_raw_candidates_count: p1.raw_candidates_count,
          p1_inserted_count: p1.inserted_count,
          p1_pending_count: p1.pending_count,
          p1_auto_accept_count: p1.auto_accept_count,
          extraction_event: p1.extraction_debug_event ?? null,
          extraction_text_head: p1.extraction_text_head ?? null,
          extraction_error: p1.extraction_empty_reason ?? null,
        },
      }, 200);
    } catch (err) {
      console.error(JSON.stringify({
        fn: "vault_after_chat",
        event: "error",
        error: err instanceof Error ? err.message : String(err),
        user_id_prefix: userId.slice(0, 6),
      }));
      return json({ ok: false, reason: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  // ── backfill_messages: batch-extract candidates from historical messages ─────
  // POST ?type=backfill_messages
  // Body: { userId, conversationId?, limit?, cursor?, dryRun?, promote?, since?, until? }
  // Requires x-memory-admin-token. Never writes memories or instructions directly.
  // Only populates auto_memory_candidates. promote is reserved but ignored in v1.
  if (type === "backfill_messages" && req.method === "POST") {
    const bfAdminToken = Deno.env.get("MEMORY_ADMIN_TOKEN");
    if (!bfAdminToken || req.headers.get("x-memory-admin-token") !== bfAdminToken) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "DB not configured" }, 500);

    let bfBody: {
      userId?: string;
      conversationId?: string | null;
      limit?: number;
      cursor?: string | null;
      dryRun?: boolean;
      promote?: boolean;
      since?: string | null;
      until?: string | null;
    };
    try {
      bfBody = await req.json();
    } catch {
      return json({ ok: false, error: "invalid JSON body" }, 400);
    }

    const bfUserId = bfBody.userId;
    if (!bfUserId || typeof bfUserId !== "string" || !bfUserId.trim()) {
      return json({ ok: false, error: "userId required" }, 400);
    }

    const bfConversationId = bfBody.conversationId ?? null;
    const rawLimit = typeof bfBody.limit === "number" ? bfBody.limit : 20;
    const bfLimit = Math.max(1, Math.min(50, rawLimit));
    const bfCursor = bfBody.cursor ?? null;
    const bfDryRun = bfBody.dryRun !== false; // default true
    const bfSince = bfBody.since ?? null;
    const bfUntil = bfBody.until ?? null;
    // promote is reserved; v1 always false
    // const bfPromote = bfBody.promote === true;

    const bfDbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // ── Step 1: fetch user messages ──────────────────────────────────────────
    // We fetch user-role messages in ascending created_at order starting from cursor.
    // We fetch limit*3 to allow for pairing with assistant messages without extra roundtrips.
    const fetchBatch = bfLimit * 3;
    let msgQuery = `${supabaseUrl}/rest/v1/messages?select=id,role,content,conversation_id,created_at,image_storage_path&user_id=eq.${encodeURIComponent(bfUserId)}&role=in.(user,assistant)&order=created_at.asc&limit=${fetchBatch}`;
    if (bfConversationId) {
      msgQuery += `&conversation_id=eq.${encodeURIComponent(bfConversationId)}`;
    }
    if (bfCursor) {
      // cursor is an ISO timestamp; fetch rows strictly after it
      msgQuery += `&created_at=gt.${encodeURIComponent(bfCursor)}`;
    }
    if (bfSince) {
      msgQuery += `&created_at=gte.${encodeURIComponent(bfSince)}`;
    }
    if (bfUntil) {
      msgQuery += `&created_at=lte.${encodeURIComponent(bfUntil)}`;
    }

    const msgRes = await fetch(msgQuery, { headers: bfDbHeaders });
    if (!msgRes.ok) {
      const errBody = await msgRes.json().catch(() => ({}));
      return json({ ok: false, error: "failed to fetch messages", detail: errBody }, 500);
    }
    const allMsgs = await msgRes.json() as {
      id: number;
      role: string;
      content: string;
      conversation_id: string;
      created_at: string;
      image_storage_path: string | null;
    }[];

    // ── Step 2: pair user → assistant turns ─────────────────────────────────
    // Walk the sorted array: when we see a user message, the next assistant message
    // in the same conversation forms the turn.
    const turns: {
      userMessageId: number;
      assistantMessageId: number | null;
      conversationId: string;
      userMessage: string;
      assistantMessage: string;
      created_at: string;
    }[] = [];

    for (let i = 0; i < allMsgs.length; i++) {
      const msg = allMsgs[i];
      if (msg.role !== "user") continue;

      // find the very next assistant message in same conversation
      let assistantMsg: typeof allMsgs[number] | null = null;
      for (let j = i + 1; j < allMsgs.length; j++) {
        if (allMsgs[j].conversation_id !== msg.conversation_id) continue;
        if (allMsgs[j].role === "user") break; // next user msg came before assistant
        if (allMsgs[j].role === "assistant") {
          assistantMsg = allMsgs[j];
          break;
        }
      }

      turns.push({
        userMessageId: msg.id,
        assistantMessageId: assistantMsg?.id ?? null,
        conversationId: msg.conversation_id,
        userMessage: msg.content,
        assistantMessage: assistantMsg?.content ?? "",
        created_at: msg.created_at,
      });

      // Only collect up to bfLimit turns
      if (turns.length >= bfLimit) break;
    }

    const scanned_turns = turns.length;
    // nextCursor is the created_at of the last user message we collected
    const nextCursor = turns.length > 0 ? turns[turns.length - 1].created_at : null;

    // ── Step 3: find already-processed userMessageIds ────────────────────────
    // Query auto_memory_candidates for any rows whose source_msg_ids overlap
    // with our userMessageIds — first-layer dedup.
    const turnUserIds = turns.map((t) => t.userMessageId);
    let alreadySourcedIds = new Set<number>();
    if (turnUserIds.length > 0) {
      // PostgREST: use cs (contains) filter or @> operator on arrays.
      // Simplest approach: fetch candidates with source_msg_ids that overlap.
      // We use the overlap operator &&: source_msg_ids.ov.(id1,id2,...)
      // But PostgREST exposes array overlap via `ov` only in newer versions;
      // fall back to fetching all candidates for this user and filtering in-process.
      const candCheckRes = await fetch(
        `${supabaseUrl}/rest/v1/auto_memory_candidates?select=source_msg_ids&user_id=eq.${encodeURIComponent(bfUserId)}&source_msg_ids=not.is.null`,
        { headers: bfDbHeaders }
      );
      if (candCheckRes.ok) {
        const candRows = await candCheckRes.json() as { source_msg_ids: number[] | null }[];
        for (const row of candRows) {
          if (!Array.isArray(row.source_msg_ids)) continue;
          for (const sid of row.source_msg_ids) {
            alreadySourcedIds.add(sid);
          }
        }
      }
    }

    // ── Step 4: filter & skip rules ──────────────────────────────────────────
    const skipped = { short: 0, no_assistant: 0, duplicate_source: 0 };
    const eligible: typeof turns = [];

    for (const turn of turns) {
      // skip: user message < 8 chars
      if (turn.userMessage.trim().length < 8) {
        skipped.short += 1;
        continue;
      }
      // skip: no assistant message
      if (!turn.assistantMessage || turn.assistantMessage.trim().length === 0) {
        skipped.no_assistant += 1;
        continue;
      }
      // skip: pure image message (no text, has image path)
      // We detect this: content is empty or just whitespace but we already checked < 8 chars above.
      // Additional guard: if content is blank and image_storage_path exists — already caught by < 8.
      // skip: already in candidates
      if (alreadySourcedIds.has(turn.userMessageId)) {
        skipped.duplicate_source += 1;
        continue;
      }
      eligible.push(turn);
    }

    // ── Step 5: dryRun early return ───────────────────────────────────────────
    if (bfDryRun) {
      const samples = eligible.slice(0, 5).map((t) => ({
        userMessageId: t.userMessageId,
        conversationId: t.conversationId,
        userMessagePreview: t.userMessage.trim().slice(0, 80),
        assistantPreview: t.assistantMessage.trim().slice(0, 40),
        created_at: t.created_at,
      }));
      return json({
        ok: true,
        dryRun: true,
        userId: bfUserId,
        conversationId: bfConversationId ?? null,
        scanned_turns,
        eligible_turns: eligible.length,
        skipped,
        nextCursor,
        samples,
      }, 200);
    }

    // ── Step 6: resolve LLM provider env vars ─────────────────────────────────
    function toCompletionsUrl(base: string): string {
      if (base.endsWith("/chat/completions")) return base;
      const stripped = base.replace(/\/$/, "");
      if (/\/v\d+$/.test(stripped)) return stripped + "/chat/completions";
      return stripped + "/v1/chat/completions";
    }
    const rawBaseUrl =
      Deno.env.get("FIFTYFIVE_BASE_URL") ||
      Deno.env.get("OPENROUTER_BASE_URL") ||
      "";
    const orBaseUrl = rawBaseUrl ? toCompletionsUrl(rawBaseUrl) : "";
    const orApiKey =
      Deno.env.get("FIFTYFIVE_API_KEY_GEMINI") ||
      Deno.env.get("FIFTYFIVE_API_KEY") ||
      Deno.env.get("FIFTYFIVE_API_KEY_GPT") ||
      Deno.env.get("FIFTYFIVE_API_KEY_CLAUDE") ||
      Deno.env.get("OPENROUTER_API_KEY") ||
      "";
    const fastModel =
      Deno.env.get("MODEL_INSTANT_PRIMARY") ||
      Deno.env.get("FAST_MODEL") ||
      Deno.env.get("MODEL_NAME") ||
      "";

    if (!orBaseUrl || !orApiKey || !fastModel) {
      return json({ ok: false, error: "LLM provider env vars not configured" }, 500);
    }

    // ── Step 7: process each eligible turn ────────────────────────────────────
    const stats = {
      raw_candidates_count: 0,
      valid_candidates_count: 0,
      inserted_count: 0,
      duplicate_skipped_count: 0,
      pending_count: 0,
      auto_accept_count: 0,
      quarantine_count: 0,
      errors: 0,
    };
    const samples: {
      userMessageId: number;
      userMessagePreview: string;
      inserted_count: number;
      extraction_event: string;
    }[] = [];

    for (const turn of eligible) {
      try {
        const vaultResult = await runAutoMemoryVault({
          supabaseUrl,
          serviceRoleKey: serviceKey,
          userId: bfUserId,
          conversationId: turn.conversationId,
          userMessage: turn.userMessage,
          gResponse: turn.assistantMessage,
          route: null,
          orBaseUrl,
          orApiKey,
          fastModel,
          userMessageId: turn.userMessageId,
          source: "backfill",
        });

        stats.raw_candidates_count += vaultResult.raw_candidates_count;
        stats.valid_candidates_count += vaultResult.valid_candidates_count;
        stats.inserted_count += vaultResult.inserted_count;
        stats.duplicate_skipped_count += vaultResult.duplicate_skipped_count;
        stats.pending_count += vaultResult.pending_count;
        stats.auto_accept_count += vaultResult.auto_accept_count;
        stats.quarantine_count += vaultResult.quarantine_count;

        if (samples.length < 10) {
          samples.push({
            userMessageId: turn.userMessageId,
            userMessagePreview: turn.userMessage.trim().slice(0, 80),
            inserted_count: vaultResult.inserted_count,
            extraction_event: vaultResult.extraction_debug_event ?? (vaultResult.raw_candidates_count === 0 ? "empty" : "ok"),
          });
        }
      } catch (err) {
        stats.errors += 1;
        console.error(JSON.stringify({
          fn: "backfill_messages",
          event: "turn_error",
          userMessageId: turn.userMessageId,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    }

    return json({
      ok: true,
      dryRun: false,
      userId: bfUserId,
      conversationId: bfConversationId ?? null,
      scanned_turns,
      processed_turns: eligible.length,
      skipped,
      raw_candidates_count: stats.raw_candidates_count,
      valid_candidates_count: stats.valid_candidates_count,
      inserted_count: stats.inserted_count,
      duplicate_skipped_count: stats.duplicate_skipped_count,
      pending_count: stats.pending_count,
      auto_accept_count: stats.auto_accept_count,
      quarantine_count: stats.quarantine_count,
      errors: stats.errors,
      nextCursor,
      samples,
    }, 200);
  }

  // ── backfill_cleanup: fix existing dirty candidates ──────────────────────────
  // POST ?type=backfill_cleanup
  // Body: { action, userId, dryRun? }
  // action: "report" | "demote_project_auto_accept" | "disable_project_memories"
  if (type === "backfill_cleanup" && req.method === "POST") {
    const cleanAdminToken = Deno.env.get("MEMORY_ADMIN_TOKEN");
    if (!cleanAdminToken || req.headers.get("x-memory-admin-token") !== cleanAdminToken) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "DB not configured" }, 500);

    let cleanBody: { action?: string; userId?: string; dryRun?: boolean };
    try { cleanBody = await req.json(); } catch { return json({ ok: false, error: "invalid JSON body" }, 400); }

    const cleanUserId = cleanBody.userId;
    if (!cleanUserId) return json({ ok: false, error: "userId required" }, 400);
    const cleanDryRun = cleanBody.dryRun !== false;
    const action = cleanBody.action ?? "report";

    const cleanHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // ── report: group candidates by canonical key ─────────────────────────────
    if (action === "report") {
      const candRes = await fetch(
        `${supabaseUrl}/rest/v1/auto_memory_candidates?select=id,candidate_type,content,recommended_action,status,confidence,source_msg_ids,created_at&user_id=eq.${encodeURIComponent(cleanUserId)}&order=created_at.asc&limit=500`,
        { headers: cleanHeaders }
      );
      if (!candRes.ok) return json({ ok: false, error: "fetch failed" }, 500);
      const cands = await candRes.json() as {
        id: string; candidate_type: string; content: string;
        recommended_action: string; status: string; confidence: number;
        source_msg_ids: number[] | null; created_at: string;
      }[];

      function canonicalKey(type: string, content: string): string {
        const c = content.toLowerCase();
        if (type === "project") {
          if (/救公主|saveprincess|小手机|新家/.test(c)) return "project:savePrincessCha";
          if (/nagibridge|星露谷|stardew/.test(c)) return "project:nagibridge_stardew";
          if (/api.*(调通|连通|provider|token)|provider.*api|token.*api/.test(c)) return "project:api_connectivity";
          if (/记忆|memory|候选|vault|backfill/.test(c)) return "project:memory_system";
          if (/ui|界面|前端|frontend/.test(c)) return "project:ui";
          return "project:other";
        }
        return `${type}:misc`;
      }

      const groups: Record<string, typeof cands> = {};
      for (const c of cands) {
        const key = canonicalKey(c.candidate_type, c.content);
        if (!groups[key]) groups[key] = [];
        groups[key].push(c);
      }

      const report = Object.entries(groups).map(([key, rows]) => ({
        canonical_key: key,
        count: rows.length,
        auto_accept_count: rows.filter(r => r.recommended_action === "auto_accept").length,
        pending_count: rows.filter(r => r.recommended_action === "pending").length,
        samples: rows.slice(0, 3).map(r => ({
          id: r.id,
          recommended_action: r.recommended_action,
          status: r.status,
          content: r.content.slice(0, 100),
          created_at: r.created_at,
        })),
      })).sort((a, b) => b.count - a.count);

      return json({
        ok: true, action: "report", dryRun: true,
        total_candidates: cands.length,
        type_breakdown: {
          project: cands.filter(c => c.candidate_type === "project").length,
          fact: cands.filter(c => c.candidate_type === "fact").length,
          preference: cands.filter(c => c.candidate_type === "preference").length,
          relationship: cands.filter(c => c.candidate_type === "relationship").length,
          other: cands.filter(c => !["project","fact","preference","relationship"].includes(c.candidate_type)).length,
        },
        action_breakdown: {
          auto_accept: cands.filter(c => c.recommended_action === "auto_accept").length,
          pending: cands.filter(c => c.recommended_action === "pending").length,
          quarantine: cands.filter(c => c.recommended_action === "quarantine").length,
        },
        by_canonical_key: report,
      }, 200);
    }

    // ── demote_project_auto_accept: project auto_accept → pending ─────────────
    if (action === "demote_project_auto_accept") {
      const fetchRes = await fetch(
        `${supabaseUrl}/rest/v1/auto_memory_candidates?select=id,content&user_id=eq.${encodeURIComponent(cleanUserId)}&candidate_type=eq.project&recommended_action=eq.auto_accept`,
        { headers: cleanHeaders }
      );
      if (!fetchRes.ok) return json({ ok: false, error: "fetch failed" }, 500);
      const todemote = await fetchRes.json() as { id: string; content: string }[];

      if (cleanDryRun) {
        return json({
          ok: true, action, dryRun: true,
          would_demote: todemote.length,
          samples: todemote.slice(0, 5).map(r => ({ id: r.id, content: r.content.slice(0, 80) })),
        }, 200);
      }

      let demoted = 0;
      for (const row of todemote) {
        const patchRes = await fetch(
          `${supabaseUrl}/rest/v1/auto_memory_candidates?id=eq.${encodeURIComponent(row.id)}`,
          {
            method: "PATCH",
            headers: { ...cleanHeaders, Prefer: "return=minimal" },
            body: JSON.stringify({ recommended_action: "pending" }),
          }
        );
        if (patchRes.ok) demoted += 1;
      }
      return json({ ok: true, action, dryRun: false, demoted, total: todemote.length }, 200);
    }

    // ── disable_project_memories: disable memories promoted from project candidates ──
    if (action === "disable_project_memories") {
      const promRes = await fetch(
        `${supabaseUrl}/rest/v1/auto_memory_candidates?select=id,promoted_memory_id,content&user_id=eq.${encodeURIComponent(cleanUserId)}&candidate_type=eq.project&status=eq.promoted&promoted_memory_id=not.is.null`,
        { headers: cleanHeaders }
      );
      if (!promRes.ok) return json({ ok: false, error: "fetch candidates failed" }, 500);
      const promoted = await promRes.json() as { id: string; promoted_memory_id: string; content: string }[];

      if (cleanDryRun) {
        return json({
          ok: true, action, dryRun: true,
          would_disable_memories: promoted.length,
          samples: promoted.slice(0, 5).map(r => ({
            candidate_id: r.id, promoted_memory_id: r.promoted_memory_id,
            content: r.content.slice(0, 80),
          })),
        }, 200);
      }

      let disabled = 0;
      for (const row of promoted) {
        const patchRes = await fetch(
          `${supabaseUrl}/rest/v1/memories?id=eq.${encodeURIComponent(row.promoted_memory_id)}`,
          {
            method: "PATCH",
            headers: { ...cleanHeaders, Prefer: "return=minimal" },
            body: JSON.stringify({ enabled: false }),
          }
        );
        if (patchRes.ok) disabled += 1;
      }
      return json({ ok: true, action, dryRun: false, disabled, total: promoted.length }, 200);
    }

    return json({ ok: false, error: `unknown action: ${action}` }, 400);
  }

  // ── candidates_list: fetch candidate pool for review ─────────────────────────
  // POST ?type=candidates_list
  // Body: { userId, limit? }
  // Requires x-memory-admin-token. Returns candidates excluding status=rejected.
  if (type === "candidates_list" && req.method === "POST") {
    const clAdminToken = Deno.env.get("MEMORY_ADMIN_TOKEN");
    if (!clAdminToken || req.headers.get("x-memory-admin-token") !== clAdminToken) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "DB not configured" }, 500);

    let clBody: { userId?: string; limit?: number };
    try { clBody = await req.json(); } catch { return json({ ok: false, error: "invalid JSON body" }, 400); }

    const clUserId = clBody.userId;
    if (!clUserId || typeof clUserId !== "string" || !clUserId.trim()) {
      return json({ ok: false, error: "userId required" }, 400);
    }
    const rawClLimit = typeof clBody.limit === "number" ? clBody.limit : 200;
    const clLimit = Math.max(1, Math.min(500, rawClLimit));

    const clHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    const candRes = await fetch(
      `${supabaseUrl}/rest/v1/auto_memory_candidates` +
        `?user_id=eq.${encodeURIComponent(clUserId)}` +
        `&status=neq.rejected` +
        `&select=id,candidate_type,title,summary,content,confidence,sensitivity,recommended_action,status,reason,source_msg_ids,created_at` +
        `&order=created_at.desc` +
        `&limit=${clLimit}`,
      { headers: clHeaders }
    );
    if (!candRes.ok) {
      const errBody = await candRes.json().catch(() => ({}));
      return json({ ok: false, error: "fetch failed", detail: errBody }, 500);
    }
    const candidates = await candRes.json();
    return json({ ok: true, candidates }, 200);
  }

  // ── candidate_patch: review action on a single candidate ─────────────────────
  // POST ?type=candidate_patch
  // Body: { userId, candidateId, patch: { recommended_action?, status? } }
  // Requires x-memory-admin-token.
  if (type === "candidate_patch" && req.method === "POST") {
    const cpAdminToken = Deno.env.get("MEMORY_ADMIN_TOKEN");
    if (!cpAdminToken || req.headers.get("x-memory-admin-token") !== cpAdminToken) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "DB not configured" }, 500);

    let cpBody: { userId?: string; candidateId?: string; patch?: Record<string, unknown> };
    try { cpBody = await req.json(); } catch { return json({ ok: false, error: "invalid JSON body" }, 400); }

    const cpUserId = cpBody.userId;
    if (!cpUserId || typeof cpUserId !== "string" || !cpUserId.trim()) {
      return json({ ok: false, error: "userId required" }, 400);
    }
    const cpCandidateId = cpBody.candidateId;
    if (!cpCandidateId || typeof cpCandidateId !== "string" || !cpCandidateId.trim()) {
      return json({ ok: false, error: "candidateId required" }, 400);
    }
    const cpPatch = cpBody.patch;
    if (!cpPatch || typeof cpPatch !== "object" || Array.isArray(cpPatch)) {
      return json({ ok: false, error: "patch object required" }, 400);
    }

    // Whitelist patchable fields
    const allowedFields = new Set(["recommended_action", "status"]);
    const validPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cpPatch)) {
      if (allowedFields.has(k)) validPatch[k] = v;
    }
    if (Object.keys(validPatch).length === 0) {
      return json({ ok: false, error: "no valid patch fields provided" }, 400);
    }

    const cpHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/auto_memory_candidates` +
        `?id=eq.${encodeURIComponent(cpCandidateId)}` +
        `&user_id=eq.${encodeURIComponent(cpUserId)}`,
      {
        method: "PATCH",
        headers: { ...cpHeaders, Prefer: "return=minimal" },
        body: JSON.stringify(validPatch),
      }
    );
    if (!patchRes.ok) {
      const errText = await patchRes.text().catch(() => "");
      return json({ ok: false, error: "patch failed", detail: errText.slice(0, 200) }, 500);
    }
    return json({ ok: true }, 200);
  }

  // ── Helper: verify user auth and get userId ──────────────���───────────────────
  async function verifyUserAuth(req: Request): Promise<{ userId: string | null; error?: Response }> {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return { userId: null, error: json({ error: "unauthorized", reason: "missing Authorization header" }, 401) };
    }

    const userToken = authHeader.slice(7);
    try {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(userToken);

      if (authError || !user) {
        return { userId: null, error: json({ error: "unauthorized", reason: "invalid or expired token" }, 401) };
      }

      return { userId: user.id };
    } catch (err) {
      console.error("[auth] verification error:", err);
      return { userId: null, error: json({ error: "unauthorized", reason: "token verification failed" }, 401) };
    }
  }

  // ── audit route (read-only, admin token required) ────────────────────────
  // GET ?type=audit
  // Requires x-memory-admin-token for cross-user admin operations.

  if (type === "audit" && req.method === "GET") {
    // Require admin token for audit
    const adminToken = Deno.env.get("MEMORY_ADMIN_TOKEN");
    if (!adminToken || req.headers.get("x-memory-admin-token") !== adminToken) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!supabaseUrl || !serviceKey) return json({ error: "DB not configured" }, 500);

    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };
    async function dbGet(path: string): Promise<unknown[]> {
      const res = await fetch(`${supabaseUrl}${path}`, { headers: dbHeaders });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }

    // ── origin inference helpers ──────────────────────────────────────────────

    // Keywords strongly associated with old-G / pre-cha era
    const OLD_G_KEYWORDS = [
      "4o", "gpt-4o", "旧版本", "前世", "黑历史", "白月光", "前任",
      "那时候", "以前的你", "早年", "老师", "专家", "RP", "4o以前",
      "以前的G", "旧G", "旧 G", "旧的G",
    ];

    function hitsOldGKeywords(text: string): boolean {
      const lower = text.toLowerCase();
      return OLD_G_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
    }

    // source_msg_ids threshold: messages after 2026-06-04 are in current_chacha era
    const CURRENT_ERA_CUTOFF = "2026-06-04T00:00:00.000Z";

    // Fetch min created_at for a set of message ids to verify era.
    // Returns null if ids empty or fetch fails.
    async function fetchEarliestMessageDate(msgIds: number[]): Promise<string | null> {
      if (msgIds.length === 0) return null;
      const ids = msgIds.slice(0, 5).join(","); // sample up to 5
      const res = await fetch(
        `${supabaseUrl}/rest/v1/messages?select=created_at&id=in.(${ids})&order=created_at.asc&limit=1`,
        { headers: dbHeaders }
      );
      if (!res.ok) return null;
      const rows = await res.json() as { created_at: string }[];
      return rows[0]?.created_at ?? null;
    }

    type OriginGuess = "current_chacha" | "old_g_archive" | "imported_user_profile" | "manual_seed_pending_review" | "unknown";

    interface MemoryRow {
      id: string;
      category: string;
      enabled: boolean;
      created_at: string;
      title: string | null;
      summary: string | null;
      source_msg_ids: number[] | null;
      content: string;
    }

    async function guessMemoryOrigin(row: MemoryRow): Promise<{ origin_guess: OriginGuess; origin_guess_reason: string }> {
      const cat = row.category ?? "";
      const contentText = [row.content, row.title ?? "", row.summary ?? ""].join(" ");

      // Rule 1: historical_ai_usage → old_g_archive
      if (cat === "historical_ai_usage") {
        return { origin_guess: "old_g_archive", origin_guess_reason: "category=historical_ai_usage maps to old-G era彩蛋" };
      }

      // Rule 2: relationship_context — check content for old-G keywords
      if (cat === "relationship_context") {
        if (hitsOldGKeywords(contentText)) {
          return { origin_guess: "old_g_archive", origin_guess_reason: "relationship_context contains old-G keywords: " + OLD_G_KEYWORDS.filter((k) => contentText.toLowerCase().includes(k.toLowerCase())).join(", ") };
        }
        return { origin_guess: "unknown", origin_guess_reason: "relationship_context but no old-G keywords found; needs manual review" };
      }

      // Rule 3: has source_msg_ids → check message era
      if (row.source_msg_ids && row.source_msg_ids.length > 0) {
        const earliest = await fetchEarliestMessageDate(row.source_msg_ids);
        if (earliest && earliest >= CURRENT_ERA_CUTOFF) {
          return { origin_guess: "current_chacha", origin_guess_reason: `source_msg_ids present; earliest source message ${earliest} >= cutoff ${CURRENT_ERA_CUTOFF}` };
        }
        if (earliest && earliest < CURRENT_ERA_CUTOFF) {
          return { origin_guess: "unknown", origin_guess_reason: `source_msg_ids present but earliest source message ${earliest} < cutoff ${CURRENT_ERA_CUTOFF}; pre-dates current_chacha era` };
        }
        // messages table lookup failed / ids not found
        return { origin_guess: "unknown", origin_guess_reason: "source_msg_ids present but could not verify message era (messages not found or fetch failed)" };
      }

      // Rule 4: no source_msg_ids — check for old-G keywords in content
      if (hitsOldGKeywords(contentText)) {
        return { origin_guess: "old_g_archive", origin_guess_reason: "source_msg_ids=null with old-G keyword hit: " + OLD_G_KEYWORDS.filter((k) => contentText.toLowerCase().includes(k.toLowerCase())).join(", ") };
      }

      // Rule 5: everything else with no source is unknown
      return { origin_guess: "unknown", origin_guess_reason: "source_msg_ids=null; no old-G keywords; category=" + cat };
    }

    // ── memories ─────────────────────────────────────────────────────────────
    const memoriesRaw = await dbGet(
      "/rest/v1/memories?select=id,category,enabled,created_at,title,summary,source_msg_ids,content&order=created_at.asc&limit=1000"
    ) as MemoryRow[];

    // Run origin inference for all rows (batched to avoid too many parallel fetches)
    const memoriesWithOrigin: (MemoryRow & { origin_guess: OriginGuess; origin_guess_reason: string })[] = [];
    for (const row of memoriesRaw) {
      const { origin_guess, origin_guess_reason } = await guessMemoryOrigin(row);
      memoriesWithOrigin.push({ ...row, origin_guess, origin_guess_reason });
    }

    type CategoryStat = {
      count: number;
      earliest: string;
      latest: string;
      with_source: number;
      without_source: number;
      origin_distribution: Record<string, number>;
      samples: unknown[];
    };
    const memoryCategoryMap: Record<string, CategoryStat> = {};
    for (const row of memoriesWithOrigin) {
      const cat = row.category ?? "null";
      if (!memoryCategoryMap[cat]) {
        memoryCategoryMap[cat] = { count: 0, earliest: row.created_at, latest: row.created_at, with_source: 0, without_source: 0, origin_distribution: {}, samples: [] };
      }
      const c = memoryCategoryMap[cat];
      c.count++;
      if (row.created_at < c.earliest) c.earliest = row.created_at;
      if (row.created_at > c.latest) c.latest = row.created_at;
      if (row.source_msg_ids && row.source_msg_ids.length > 0) c.with_source++; else c.without_source++;
      c.origin_distribution[row.origin_guess] = (c.origin_distribution[row.origin_guess] ?? 0) + 1;
      if (c.samples.length < 3) {
        c.samples.push({
          id: row.id,
          category: row.category,
          created_at: row.created_at,
          title: row.title,
          summary: row.summary,
          source_msg_ids: row.source_msg_ids,
          content_preview: row.content.slice(0, 120),
          origin_guess: row.origin_guess,
          origin_guess_reason: row.origin_guess_reason,
        });
      }
    }

    // ── instructions ─────────────────────────────────────────────────────────
    const instructionsAll = await dbGet(
      "/rest/v1/instructions?select=id,category,enabled,created_at,source_msg_ids,content&order=created_at.asc&limit=500"
    ) as { id: string; category: string; enabled: boolean; created_at: string; source_msg_ids: number[] | null; content: string }[];

    // All instructions are migrated from memories — origin is manual_seed_pending_review
    const instructionCategoryMap: Record<string, { count: number; origin_guess: string; samples: unknown[] }> = {};
    for (const row of instructionsAll) {
      const cat = row.category ?? "null";
      if (!instructionCategoryMap[cat]) instructionCategoryMap[cat] = { count: 0, origin_guess: "manual_seed_pending_review", samples: [] };
      instructionCategoryMap[cat].count++;
      if (instructionCategoryMap[cat].samples.length < 3) {
        instructionCategoryMap[cat].samples.push({
          id: row.id,
          category: row.category,
          created_at: row.created_at,
          source_msg_ids: row.source_msg_ids,
          content_preview: row.content.slice(0, 120),
          origin_guess: "manual_seed_pending_review",
          origin_guess_reason: "instructions table is a migrated rule layer; origin requires manual review",
        });
      }
    }

    // ── openai_archive_entries ────────────────────────────────────────────────
    const archiveAll = await dbGet(
      "/rest/v1/openai_archive_entries?select=id,entry_id,triggers,enabled,can_easter_egg,created_at&order=created_at.asc&limit=200"
    ) as { id: string; entry_id: string; triggers: string[]; enabled: boolean; can_easter_egg: boolean; created_at: string }[];

    const archiveSamples = archiveAll.slice(0, 5).map((r) => ({
      id: r.id,
      entry_id: r.entry_id,
      triggers: r.triggers,
      can_easter_egg: r.can_easter_egg,
      enabled: r.enabled,
      created_at: r.created_at,
      origin_guess: "old_g_archive",
      origin_guess_reason: "openai_archive_entries stores historical roleplay/AI-usage easter eggs triggered by 前世/黑历史/旧版本 etc.",
    }));

    // ── persona_profile ───────────────────────────────────────────────────────
    const profileAll = await dbGet(
      "/rest/v1/persona_profile?select=id,enabled,note,created_at,updated_at,content&order=created_at.asc&limit=50"
    ) as { id: string; enabled: boolean; note: string | null; created_at: string; updated_at: string; content: string }[];

    const profileSummary = profileAll.map((r) => ({
      id: r.id,
      enabled: r.enabled,
      note: r.note,
      created_at: r.created_at,
      updated_at: r.updated_at,
      content_preview: r.content.slice(0, 120),
      origin_guess: "imported_user_profile",
      origin_guess_reason: "persona_profile is user-written profile import, not a shared memory or conversation artifact",
    }));

    return json({
      generated_at: new Date().toISOString(),
      origin_rules_applied: {
        current_chacha: "source_msg_ids present AND earliest source message >= 2026-06-04",
        old_g_archive: "category=historical_ai_usage, OR relationship_context with old-G keywords, OR source_msg_ids=null with old-G keyword hit in content",
        imported_user_profile: "persona_profile table (all rows)",
        manual_seed_pending_review: "instructions table (all rows — migrated rule layer)",
        unknown: "everything else",
      },
      memories: {
        total: memoriesRaw.length,
        by_category: memoryCategoryMap,
      },
      instructions: {
        total: instructionsAll.length,
        by_category: instructionCategoryMap,
      },
      openai_archive_entries: {
        total: archiveAll.length,
        enabled_count: archiveAll.filter((r) => r.enabled).length,
        origin_guess: "old_g_archive",
        samples: archiveSamples,
      },
      persona_profile: {
        total: profileAll.length,
        enabled_count: profileAll.filter((r) => r.enabled).length,
        origin_guess: "imported_user_profile",
        rows: profileSummary,
      },
    });
  }

  // ── instructions routes ───────────────────────────────────────────────────
  // Requires user auth via Authorization Bearer token

  if (type === "instructions") {
    // Verify user authentication
    const { userId: authUserId, error: authError } = await verifyUserAuth(req);
    if (authError) return authError;

    if (!supabaseUrl || !serviceKey) return json({ error: "DB not configured" }, 500);

    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    if (req.method === "GET") {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/instructions?select=id,content,category,enabled,user_id&user_id=eq.${encodeURIComponent(authUserId!)}&order=created_at.asc`,
        { headers: dbHeaders }
      );
      if (!res.ok) return json(await res.json(), 500);
      const rows = await res.json() as { id: string; content: string; category: string; enabled: boolean }[];
      return json(rows.map(r => ({ ...r, domain: r.category || "general" })), 200);
    }

    if (req.method === "PATCH" && id) {
      const body = await req.json() as { enabled?: unknown; content?: unknown };
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
      if (typeof body.content === "string" && body.content.trim()) patch.content = body.content.trim();
      const res = await fetch(`${supabaseUrl}/rest/v1/instructions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(authUserId!)}`, {
        method: "PATCH",
        headers: { ...dbHeaders, Prefer: "return=representation" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return json(await res.json(), 500);
      const rows = await res.json() as unknown[];
      if (!rows.length) return json({ error: "instruction not found" }, 404);
      return json(rows[0], 200);
    }

    if (req.method === "DELETE" && id) {
      const res = await fetch(`${supabaseUrl}/rest/v1/instructions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(authUserId!)}`, {
        method: "DELETE",
        headers: { ...dbHeaders, Prefer: "return=minimal" },
      });
      return new Response(null, { status: res.ok ? 204 : 500, headers: corsHeaders });
    }
  }

  // ── memories routes ───────────────────────────────────────────────────────
  // Requires user auth via Authorization Bearer token

  // Verify user authentication for all memory operations
  const { userId: authUserId, error: authError } = await verifyUserAuth(req);
  if (authError) return authError;

  if (!supabaseUrl || !serviceKey) return json({ error: "DB not configured" }, 500);

  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  if (req.method === "GET") {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/memories?select=id,content,category,enabled,title,summary,created_at,updated_at,user_id&user_id=eq.${encodeURIComponent(authUserId!)}&order=created_at.asc`,
      { headers: dbHeaders }
    );
    if (!res.ok) return json(await res.json(), 500);
    const rows = await res.json() as { id: string; content: string; category: string; enabled: boolean }[];
    return json(rows.map(r => ({ ...r, domain: r.category || "general" })), 200);
  }

  if (req.method === "POST") {
    const { content, domain } = await req.json();
    if (!content?.trim()) return json({ error: "content required" }, 400);
    const res = await fetch(`${supabaseUrl}/rest/v1/memories`, {
      method: "POST",
      headers: { ...dbHeaders, Prefer: "return=representation" },
      body: JSON.stringify({
        content: content.trim(),
        category: normalizeMemoryDomain(domain),
        user_id: authUserId,
      }),
    });
    return json(await res.json(), res.ok ? 201 : 500);
  }

  if (req.method === "PATCH") {
    if (!id) return json({ error: "id required" }, 400);
    const body = await req.json() as { enabled?: unknown; content?: unknown; domain?: unknown };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.enabled === "boolean") {
      patch.enabled = body.enabled;
    }

    if (body.content !== undefined) {
      if (typeof body.content !== "string") return json({ error: "content must be a string" }, 400);
      const content = body.content.trim();
      if (!content) return json({ error: "content required" }, 400);
      patch.content = content;
    }

    if (body.domain !== undefined) {
      patch.category = normalizeMemoryDomain(body.domain);
    }

    if (Object.keys(patch).length === 1) return json({ error: "no fields to update" }, 400);

    const res = await fetch(`${supabaseUrl}/rest/v1/memories?id=eq.${id}&user_id=eq.${encodeURIComponent(authUserId!)}&select=id,content,category,enabled`, {
      method: "PATCH",
      headers: { ...dbHeaders, Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return json(await res.json(), 500);
    const rows = await res.json() as { id: string; content: string; category: string; enabled: boolean }[];
    if (!rows.length) return json({ error: "memory not found" }, 404);
    const updated = rows[0];
    return json({ ...updated, domain: updated.category || "general" }, 200);
  }

  if (req.method === "DELETE") {
    if (!id) return json({ error: "id required" }, 400);
    const res = await fetch(`${supabaseUrl}/rest/v1/memories?id=eq.${id}&user_id=eq.${encodeURIComponent(authUserId!)}`, {
      method: "DELETE",
      headers: { ...dbHeaders, Prefer: "return=minimal" },
    });
    return new Response(null, { status: res.ok ? 204 : 500, headers: corsHeaders });
  }

  return json({ error: "Method not allowed" }, 405);
});
