import { corsHeaders, corsOptionsResponse } from "../_shared/cors.ts";

/**
 * chat-test: Proxy a minimal chat completion request to an upstream provider.
 * Used by the settings page to validate provider/model configurations.
 *
 * Request body: { endpoint, apiKey, model }
 * Sends a tiny completion request and returns success/failure status.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOptionsResponse();

  try {
    const { endpoint, apiKey, model } = await req.json();
    if (!endpoint || !apiKey || !model) {
      return new Response(
        JSON.stringify({ error: "missing endpoint, apiKey, or model" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Normalize endpoint to chat/completions
    let chatUrl = endpoint.replace(/\/+$/, "");
    if (!chatUrl.endsWith("/chat/completions")) {
      chatUrl = chatUrl.replace(/\/completions$/, "");
      if (!chatUrl.match(/\/v\d+$/)) chatUrl += "/v1";
      chatUrl += "/chat/completions";
    }

    let upstream: Response;
    try {
      upstream = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
          stream: false,
        }),
      });
    } catch (fetchErr) {
      // Network-level failure (DNS, connection refused, TLS error, etc.)
      return new Response(
        JSON.stringify({ status: 0, data: null, error: `连接上游失败: ${String(fetchErr)}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const text = await upstream.text();
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      // non-JSON response — wrap raw text
      data = { raw: text.slice(0, 500) };
    }

    return new Response(
      JSON.stringify({ status: upstream.status, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
