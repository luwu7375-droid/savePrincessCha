const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ChatRequest = {
  messages?: unknown;
  model?: string;
  stream?: boolean;
  replyMode?: string;
};

const FUNCTION_VERSION = "env-check-v1";

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

async function fetchEnabledMemories(supabaseUrl: string, serviceRoleKey: string): Promise<string[]> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/memories?enabled=eq.true&select=content&order=created_at.asc`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
  );
  if (!res.ok) return [];
  const rows = await res.json() as { content: string }[];
  return rows.map((r) => r.content);
}

async function fetchMemoryBuckets(supabaseUrl: string, serviceRoleKey: string): Promise<string[]> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/memory_buckets?status=eq.active&select=id,title,summary&order=importance.desc,last_accessed_at.desc.nullslast&limit=2`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
  );
  if (!res.ok) return [];
  const rows = await res.json() as { id: string; title: string; summary: string }[];
  // fire-and-forget update last_accessed_at
  if (rows.length > 0) {
    const ids = rows.map(r => r.id).join(",");
    fetch(`${supabaseUrl}/rest/v1/memory_buckets?id=in.(${ids})`, {
      method: "PATCH",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ last_accessed_at: new Date().toISOString() }),
    }).catch(() => {});
  }
  return rows.map((r) => r.summary);
}

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

  const openrouterApiKey = Deno.env.get("OPENROUTER_API_KEY");
  const openrouterBaseUrl =
    Deno.env.get("OPENROUTER_BASE_URL") ||
    "https://api.fuka.win/v1/chat/completions";

  if (!openrouterApiKey) {
    return jsonResponse(
      {
        error: "环境变量未配置",
        hasOpenrouterApiKey: false,
        hasOpenrouterBaseUrl: true,
        hasModelName: !!Deno.env.get("MODEL_NAME"),
      },
      500
    );
  }

  let payload: ChatRequest;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "请求体必须是 JSON" }, 400);
  }

  if (!Array.isArray(payload.messages)) {
    return jsonResponse({ error: "messages 必须是数组" }, 400);
  }

  const model = Deno.env.get("MODEL_NAME") || payload.model;

  if (!model) {
    return jsonResponse({ error: "MODEL_NAME 未配置" }, 500);
  }

  // Build system prompt with memories
  const supabaseUrl = Deno.env.get("DB_URL");
  const serviceRoleKey = Deno.env.get("DB_SERVICE_ROLE_KEY");
  let systemContent = `不要输出 <think>、</think>、推理过程、内部思考或分析过程。只输出最终回复。

【回复长度与节奏】
- 优先模仿用户当前消息的节奏、长度和密度，而不是固定输出完整结构。
- 用户短句，回复也短，通常 1-3 句。
- 除非用户明确要求分析、方案、任务卡、排查、总结，否则不要长篇展开。
- 不要主动列很多"下一步"。
- 不要把普通聊天写成安慰小作文。
- 不要每次都"先共情再建议再总结"。
- 技术任务可以清晰，但日常对话要像真人聊天，有来有回。
- 可以亲近，但要收口。`;

  if (supabaseUrl && serviceRoleKey) {
    const [memories, buckets] = await Promise.all([
      fetchEnabledMemories(supabaseUrl, serviceRoleKey),
      fetchMemoryBuckets(supabaseUrl, serviceRoleKey),
    ]);
    if (memories.length > 0) {
      systemContent += "\n\n以下是长期记忆，请优先遵守：\n" + memories.map((m, i) => `${i + 1}. ${m}`).join("\n");
    }
    if (buckets.length > 0) {
      systemContent += "\n\n以下是背景参考（最多 2 条，仅供参考）：\n" + buckets.map((b, i) => `${i + 1}. ${b}`).join("\n");
    }
  }

  if (payload.replyMode === "auto") {
    systemContent += "\n\n【回复决策】如果用户明显还在连续补充、只是碎片化记录、或没有期待回复，可以不回复。若不回复，只输出：<NO_REPLY>。不要解释。";
  } else {
    systemContent += "\n\n【回复决策】必须正常回复，禁止输出 <NO_REPLY>。";
  }

  const messages = [
    { role: "system", content: systemContent },
    ...(payload.messages as unknown[]),
  ];

  try {
    const upstreamResponse = await fetch(openrouterBaseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!upstreamResponse.ok) {
      let errorBody: unknown = { error: "模型请求失败" };
      try {
        errorBody = await upstreamResponse.json();
      } catch {
        errorBody = { error: await upstreamResponse.text() };
      }
      return jsonResponse(errorBody, upstreamResponse.status);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstreamResponse.headers.get("Content-Type") || "text/event-stream",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return jsonResponse({ error: message }, 500);
  }
});

