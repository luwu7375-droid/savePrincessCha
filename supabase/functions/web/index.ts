// supabase/functions/web/index.ts
// Phase 1 web reading capability: read_url, summarize_url, search_web (stub)
// Security: SSRF protection, protocol whitelist, timeout, max bytes, content-type check

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── SSRF protection ───────────────────────────────────────────────────────────
// String-based check is sufficient for personal-use deployment.
// Blocks private/loopback/link-local ranges and literal keywords.
const SSRF_BLOCKLIST = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

function validateUrl(raw: string): { ok: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, error: "protocol_not_allowed" };
  }
  const host = parsed.hostname.toLowerCase();
  for (const pattern of SSRF_BLOCKLIST) {
    if (pattern.test(host)) return { ok: false, error: "ssrf_blocked" };
  }
  return { ok: true };
}

// ── HTML text extraction ──────────────────────────────────────────────────────

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeHtmlEntities(m[1].trim()) : "";
}

function extractDescription(html: string): string {
  const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  return m ? decodeHtmlEntities(m[1].trim()) : "";
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function extractText(html: string): string {
  // Remove script/style blocks entirely
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    // Block-level elements → newline
    .replace(/<\/(p|div|section|article|header|footer|h[1-6]|li|td|th|br)[^>]*>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode entities
    .replace(/&[a-z]+;|&#\d+;/gi, (e) => decodeHtmlEntities(e))
    // Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

// ── Fetch page ────────────────────────────────────────────────────────────────

const MAX_BYTES = 1_048_576; // 1 MB
const FETCH_TIMEOUT_MS = 15_000;
const TEXT_TRUNCATE_CHARS = 12_000;

type ReadResult = {
  title: string;
  url: string;
  final_url: string;
  excerpt: string;
  text_chars: number;
  truncated: boolean;
  fetched_at: string;
  duration_ms: number;
};

async function readUrl(url: string): Promise<ReadResult> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ChaWebReader/1.0)",
        Accept: "text/html,text/plain,application/json",
      },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }

  // Re-validate final URL after redirect to prevent SSRF via open redirect
  if (res.url && res.url !== url) {
    const recheck = validateUrl(res.url);
    if (!recheck.ok) {
      throw Object.assign(new Error("ssrf_blocked"), { code: "ssrf_blocked" });
    }
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isReadable = /text\/(html|plain)|application\/json/.test(contentType);
  if (!isReadable) {
    throw Object.assign(new Error("content_type_rejected"), { code: "content_type_rejected" });
  }

  // Stream-read up to MAX_BYTES
  const reader = res.body?.getReader();
  if (!reader) throw new Error("no_body");
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      const remaining = MAX_BYTES - totalBytes;
      if (value.length >= remaining) {
        chunks.push(value.slice(0, remaining));
        totalBytes += remaining;
        truncated = true;
        break;
      }
      chunks.push(value);
      totalBytes += value.length;
    }
  }
  reader.cancel().catch(() => {});

  const decoder = new TextDecoder();
  const raw = chunks.map((c) => decoder.decode(c, { stream: true })).join("");

  const title = contentType.includes("html") ? extractTitle(raw) : "";
  const description = contentType.includes("html") ? extractDescription(raw) : "";
  const bodyText = contentType.includes("html") ? extractText(raw) : raw;
  const text = bodyText.slice(0, TEXT_TRUNCATE_CHARS);

  const excerpt = description || text.slice(0, 300).replace(/\s+/g, " ");

  return {
    title,
    url,
    final_url: res.url || url,
    excerpt,
    text_chars: text.length,
    truncated,
    fetched_at: new Date().toISOString(),
    duration_ms: Date.now() - t0,
  };
}

// ── Summarize ─────────────────────────────────────────────────────────────────

type SummarizeResult = {
  summary: string;
  key_points: string[];
  source: { title: string; url: string };
  reliability_note: string;
  fetched_at: string;
};

async function summarizeUrl(
  readResult: ReadResult & { fullText?: string },
  question: string | null,
): Promise<string> {
  const baseUrl = Deno.env.get("FIFTYFIVE_BASE_URL") || Deno.env.get("OPENROUTER_BASE_URL") || "";
  const apiKey = Deno.env.get("FIFTYFIVE_API_KEY_GPT") || Deno.env.get("FIFTYFIVE_API_KEY") || Deno.env.get("OPENROUTER_API_KEY") || "";
  const model = Deno.env.get("MODEL_GENERAL_PRIMARY") || Deno.env.get("MODEL_NAME") || "";

  if (!baseUrl || !apiKey || !model) throw new Error("model_not_configured");

  const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl
    : baseUrl.replace(/\/$/, "") + (/\/v\d+$/.test(baseUrl.replace(/\/$/, "")) ? "/chat/completions" : "/v1/chat/completions");

  const focusLine = question
    ? `KK 想知道：${question}\n围绕这个问题总结，不要泛泛全文。`
    : "简洁总结主要内容和关键信息。";

  const prompt = `你是小cha，正在帮KK读一个网页。用第一人称、口语化、简洁地总结，像是出去看了一圈回来讲给KK听，不要报告腔，不要列表式。保留关键信息但不要把全文甩给他。

来源：${readResult.title || readResult.url}
${focusLine}

网页内容：
${readResult.excerpt}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 500, stream: false }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`model_${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() ?? "";
  } finally {
    clearTimeout(timer);
  }
}

// ── Activity log ──────────────────────────────────────────────────────────────

async function saveLog(params: {
  userId: string;
  conversationId?: string;
  actionSubtype: string;
  query?: string;
  url?: string;
  finalUrl?: string;
  title?: string;
  excerpt?: string;
  summary?: string;
  status: "success" | "timeout" | "error";
  errorCode?: string;
  errorMsg?: string;
  durationMs?: number;
  tokenEstimate?: number;
}): Promise<string | null> {
  const supabaseUrl = Deno.env.get("DB_URL");
  const serviceKey = Deno.env.get("DB_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return null;

  const payload = {
    user_id: params.userId,
    conversation_id: params.conversationId || null,
    action_type: "web_browse",
    action_subtype: params.actionSubtype,
    query: params.query || null,
    url: params.url || null,
    final_url: params.finalUrl || null,
    title: params.title || null,
    excerpt: params.excerpt ? params.excerpt.slice(0, 500) : null,
    summary: params.summary ? params.summary.slice(0, 2000) : null,
    status: params.status,
    error_code: params.errorCode || null,
    error_msg: params.errorMsg || null,
    duration_ms: params.durationMs ?? null,
    token_estimate: params.tokenEstimate ?? null,
  };

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/cha_activity_log`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ── Request handler ───────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const userId = typeof body.userId === "string" && body.userId ? body.userId : "anon";
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;
  const saveLogFlag = body.saveLog !== false;

  // ── read_url ─────────────────────────────────────────────────────────────────
  if (action === "read_url") {
    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    if (!rawUrl) return json({ error: "url_required" }, 400);

    const validation = validateUrl(rawUrl);
    if (!validation.ok) return json({ error: validation.error }, 400);

    const t0 = Date.now();
    try {
      const result = await readUrl(rawUrl);
      const durationMs = Date.now() - t0;

      console.log(JSON.stringify({
        web_action: "read_url",
        action_subtype: "user_requested",
        url: rawUrl,
        status: "success",
        duration_ms: durationMs,
        text_chars: result.text_chars,
        truncated: result.truncated,
      }));

      let savedLogId: string | null = null;
      if (saveLogFlag && userId !== "anon") {
        savedLogId = await saveLog({
          userId, conversationId,
          actionSubtype: "user_requested",
          url: rawUrl, finalUrl: result.final_url,
          title: result.title, excerpt: result.excerpt,
          status: "success", durationMs,
        });
      }

      return json({ ok: true, ...result, saved_log_id: savedLogId });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      const code = isTimeout ? "timeout" : ((err as { code?: string }).code ?? "fetch_error");
      const durationMs = Date.now() - t0;

      console.log(JSON.stringify({
        web_action: "read_url", url: rawUrl, status: isTimeout ? "timeout" : "error",
        error_code: code, duration_ms: durationMs,
      }));

      if (saveLogFlag && userId !== "anon") {
        await saveLog({
          userId, conversationId, actionSubtype: "user_requested",
          url: rawUrl, status: isTimeout ? "timeout" : "error",
          errorCode: code, errorMsg: err instanceof Error ? err.message.slice(0, 200) : String(err),
          durationMs,
        });
      }

      return json({ ok: false, error: code, duration_ms: durationMs }, isTimeout ? 408 : 422);
    }
  }

  // ── summarize_url ─────────────────────────────────────────────────────────────
  if (action === "summarize_url") {
    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    if (!rawUrl) return json({ error: "url_required" }, 400);

    const validation = validateUrl(rawUrl);
    if (!validation.ok) return json({ error: validation.error }, 400);

    const question = typeof body.question === "string" ? body.question.trim() : null;
    const t0 = Date.now();

    try {
      const readResult = await readUrl(rawUrl);
      const summaryText = await summarizeUrl(readResult, question);
      const durationMs = Date.now() - t0;

      const tokenEstimate = Math.ceil(summaryText.length / 3.5);

      console.log(JSON.stringify({
        web_action: "summarize_url", action_subtype: "user_requested",
        url: rawUrl, status: "success",
        duration_ms: durationMs, text_chars: readResult.text_chars,
        truncated: readResult.truncated, saved_log_id: null,
      }));

      let savedLogId: string | null = null;
      if (saveLogFlag && userId !== "anon") {
        savedLogId = await saveLog({
          userId, conversationId, actionSubtype: "user_requested",
          query: question || undefined,
          url: rawUrl, finalUrl: readResult.final_url,
          title: readResult.title, excerpt: readResult.excerpt,
          summary: summaryText, status: "success",
          durationMs, tokenEstimate,
        });
      }

      const result: SummarizeResult = {
        summary: summaryText,
        key_points: [],
        source: { title: readResult.title || readResult.final_url, url: readResult.final_url },
        reliability_note: readResult.truncated ? "网页内容被截断，摘要可能不完整。" : "",
        fetched_at: readResult.fetched_at,
      };

      return json({ ok: true, ...result, saved_log_id: savedLogId, duration_ms: durationMs });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      const code = isTimeout ? "timeout" : ((err as { code?: string }).code ?? "error");
      const durationMs = Date.now() - t0;

      console.log(JSON.stringify({
        web_action: "summarize_url", url: rawUrl,
        status: isTimeout ? "timeout" : "error", error_code: code, duration_ms: durationMs,
      }));

      if (saveLogFlag && userId !== "anon") {
        await saveLog({
          userId, conversationId, actionSubtype: "user_requested",
          url: rawUrl, status: isTimeout ? "timeout" : "error",
          errorCode: code, errorMsg: err instanceof Error ? err.message.slice(0, 200) : String(err),
          durationMs,
        });
      }

      return json({ ok: false, error: code, duration_ms: durationMs }, isTimeout ? 408 : 422);
    }
  }

  // ── search_web (honest stub) ──────────────────────────────────────────────────
  if (action === "search_web") {
    const query = typeof body.query === "string" ? body.query.trim() : "";
    console.log(JSON.stringify({
      web_action: "search_web", query, status: "skipped", error_code: "search_api_not_configured",
    }));
    return json({
      ok: false,
      error: "search_api_not_configured",
      message: "search_web 接口已预留，搜索 API 尚未接入。现在可以读取你给的链接，但还不能自己全网搜索。",
      source_count: 0,
    }, 501);
  }

  return json({ error: "unknown_action", allowed_actions: ["read_url", "summarize_url", "search_web"] }, 400);
});
