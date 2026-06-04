const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ChatRequest = {
  messages?: unknown;
  model?: string;
  stream?: boolean;
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
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    }
  );
  if (!res.ok) return [];
  const rows = await res.json() as { content: string }[];
  return rows.map((r) => r.content);
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
  let systemContent = "不要输出 <think>、</think>、推理过程、内部思考或分析过程。只输出最终回复。";

  if (supabaseUrl && serviceRoleKey) {
    const memories = await fetchEnabledMemories(supabaseUrl, serviceRoleKey);
    if (memories.length > 0) {
      systemContent += "\n\n以下是长期记忆，请优先遵守：\n" + memories.map((m, i) => `${i + 1}. ${m}`).join("\n");
    }
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

