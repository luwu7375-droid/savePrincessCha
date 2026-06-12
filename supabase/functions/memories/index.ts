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

const MEMORY_DOMAINS = ["persona", "work", "writing", "life", "relation", "general"] as const;
type MemoryDomain = typeof MEMORY_DOMAINS[number];

function normalizeMemoryDomain(domain: unknown): MemoryDomain {
  return typeof domain === "string" && MEMORY_DOMAINS.includes(domain as MemoryDomain)
    ? domain as MemoryDomain
    : "general";
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
