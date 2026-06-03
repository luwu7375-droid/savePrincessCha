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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const openrouterApiKey = Deno.env.get("OPENROUTER_API_KEY");
  const openrouterBaseUrl = Deno.env.get("OPENROUTER_BASE_URL");
  const serverModelName = Deno.env.get("MODEL_NAME");

  if (!openrouterApiKey || !openrouterBaseUrl) {
    return jsonResponse(
      { error: "OPENROUTER_API_KEY 或 OPENROUTER_BASE_URL 未配置" },
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

  const model = serverModelName || payload.model;

  if (!model) {
    return jsonResponse({ error: "MODEL_NAME 未配置" }, 500);
  }

  try {
    const upstreamResponse = await fetch(openrouterBaseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: payload.messages,
        stream: true,
      }),
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
        "Content-Type": upstreamResponse.headers.get("Content-Type") ||
          "text/event-stream",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return jsonResponse({ error: message }, 500);
  }
});
