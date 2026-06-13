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

  // ── vault_after_chat: frontend-triggered P1+P2, admin token required ────────
  // POST ?type=vault_after_chat
  // Body: { userId, conversationId?, userMessage, assistantMessage, userMessageId?, route? }
  // Requires x-memory-admin-token header (same token as other admin routes).
  // Returns JSON summary; errors are ok:false, never throws.

  if (type === "vault_after_chat" && req.method === "POST") {
    // ── auth: require admin token ────────────────────────────────────────────
    const vaultAdminToken = Deno.env.get("MEMORY_ADMIN_TOKEN");
    if (!vaultAdminToken || req.headers.get("x-memory-admin-token") !== vaultAdminToken) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "DB not configured" }, 500);

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
    if (!userId || typeof userId !== "string" || !userId.trim()) {
      return json({ ok: false, reason: "userId required" }, 400);
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

  // ── all other routes require admin token ─────────────────────────────────
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

  // ── audit route (read-only, admin token required) ────────────────────────
  // GET ?type=audit
  // Returns origin-audit snapshot with per-row origin_guess.
  // No writes. No data mutations.
  //
  // origin_guess values:
  //   current_chacha           — has source_msg_ids AND source message created after 2026-06-04
  //   old_g_archive            — category=historical_ai_usage, or relationship_context with old-G keywords,
  //                              or source_msg_ids=null with strong old-G keyword hit in content
  //   imported_user_profile    — persona_profile table (user-written, not a shared memory)
  //   manual_seed_pending_review — instructions table (migrated rule layer, origin unclear)
  //   unknown                  — everything else

  if (type === "audit" && req.method === "GET") {
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

  if (type === "instructions") {
    if (req.method === "GET") {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/instructions?select=id,content,category,enabled&order=created_at.asc`,
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
      const res = await fetch(`${supabaseUrl}/rest/v1/instructions?id=eq.${encodeURIComponent(id)}`, {
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
      const res = await fetch(`${supabaseUrl}/rest/v1/instructions?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { ...dbHeaders, Prefer: "return=minimal" },
      });
      return new Response(null, { status: res.ok ? 204 : 500, headers: corsHeaders });
    }
  }

  // ── memories routes ───────────────────────────────────────────────────────

  if (req.method === "GET") {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/memories?select=id,content,category,enabled,title,summary,created_at,updated_at&order=created_at.asc`,
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
      body: JSON.stringify({ content: content.trim(), category: normalizeMemoryDomain(domain) }),
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

    const res = await fetch(`${supabaseUrl}/rest/v1/memories?id=eq.${id}&select=id,content,category,enabled`, {
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
    const res = await fetch(`${supabaseUrl}/rest/v1/memories?id=eq.${id}`, {
      method: "DELETE",
      headers: { ...dbHeaders, Prefer: "return=minimal" },
    });
    return new Response(null, { status: res.ok ? 204 : 500, headers: corsHeaders });
  }

  return json({ error: "Method not allowed" }, 405);
});
