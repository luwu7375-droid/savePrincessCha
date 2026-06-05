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

  const adminToken = Deno.env.get("MEMORY_ADMIN_TOKEN");
  if (!adminToken || req.headers.get("x-memory-admin-token") !== adminToken) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("DB_URL");
  const serviceKey = Deno.env.get("DB_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "DB not configured" }, 500);

  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");

  // ── memory_buckets routes ─────────────────────────────────────────────────

  if (type === "buckets") {
    if (req.method === "GET") {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/memory_buckets?status=eq.active&select=id,title,summary,content,domain,importance,status,created_at,updated_at,last_accessed_at&order=importance.desc,last_accessed_at.desc.nullslast&limit=20`,
        { headers: dbHeaders }
      );
      return json(await res.json(), res.ok ? 200 : 500);
    }

    if (req.method === "POST") {
      const body = await req.json();
      const res = await fetch(`${supabaseUrl}/rest/v1/memory_buckets`, {
        method: "POST",
        headers: { ...dbHeaders, Prefer: "return=representation" },
        body: JSON.stringify(body),
      });
      return json(await res.json(), res.ok ? 201 : 500);
    }

    if (req.method === "PATCH" && id) {
      const body = await req.json();
      const res = await fetch(`${supabaseUrl}/rest/v1/memory_buckets?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...dbHeaders, Prefer: "return=representation" },
        body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) return json(await res.json(), 500);
      const rows = await res.json() as unknown[];
      if (!rows.length) return json({ error: "bucket not found" }, 404);
      return json(rows[0], 200);
    }

    if (req.method === "DELETE" && id) {
      const res = await fetch(`${supabaseUrl}/rest/v1/memory_buckets?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...dbHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({ status: "deleted", updated_at: new Date().toISOString() }),
      });
      return new Response(null, { status: res.ok ? 204 : 500, headers: corsHeaders });
    }
  }

  // ── distill route ─────────────────────────────────────────────────────────

  if (type === "distill" && req.method === "POST") {
    const { messages } = await req.json() as { messages: { role: string; content: string }[] };
    if (!Array.isArray(messages) || messages.length === 0) return json({ error: "messages required" }, 400);

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    const baseUrl = Deno.env.get("OPENROUTER_BASE_URL") || "https://api.fuka.win/v1/chat/completions";
    const model = Deno.env.get("MODEL_NAME");
    if (!apiKey || !model) return json({ error: "model not configured" }, 500);

    const recent = messages.slice(-20).map(m => `${m.role === "user" ? "用户" : "AI"}：${m.content}`).join("\n");

    const prompt = `以下是一段对话记录：\n\n${recent}\n\n请从这段对话中提取 1-3 条值得长期记忆的事件或认知，以 JSON 数组返回，每条格式：{"title":"简短标题","summary":"一句话摘要","domain":"general|persona|work|writing|life|relation"}。只返回 JSON 数组，不要其他文字。`;

    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], stream: false }),
    });

    if (!res.ok) return json({ error: "model call failed" }, 500);

    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content?.trim() || "[]";
    try {
      const candidates = JSON.parse(raw.replace(/^```json\n?/, "").replace(/\n?```$/, ""));
      return json({ candidates });
    } catch {
      return json({ error: "failed to parse model response", raw }, 500);
    }
  }

  // ── memories routes (existing) ────────────────────────────────────────────

  if (req.method === "GET") {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/memories?select=id,content,category,enabled&order=created_at.asc`,
      { headers: dbHeaders }
    );
    if (!res.ok) return json(await res.json(), 500);
    const rows = await res.json() as { id: string; content: string; category: string; enabled: boolean }[];
    // Expose category as domain so the frontend API stays stable
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
