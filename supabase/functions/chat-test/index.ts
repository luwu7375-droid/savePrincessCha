import { corsHeaders, corsOptionsResponse } from "../_shared/cors.ts";

/**
 * chat-test: Proxy a minimal chat/image completion request to an upstream provider.
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

    // Detect if this is an image generation model
    const isImageModel = model.includes("dall-e") ||
                        model.includes("image") ||
                        model.toLowerCase().includes("生图") ||
                        model.includes("flux") ||
                        model.includes("sd-") ||
                        model.includes("stable-diffusion");

    let testUrl = endpoint.replace(/\/+$/, "");
    let requestBody: any;

    if (isImageModel) {
      // Image generation endpoint
      if (!testUrl.endsWith("/images/generations")) {
        testUrl = testUrl.replace(/\/completions$/, "");
        testUrl = testUrl.replace(/\/chat\/completions$/, "");
        if (!testUrl.match(/\/v\d+$/)) testUrl += "/v1";
        testUrl += "/images/generations";
      }

      requestBody = {
        model,
        prompt: "test",
        n: 1,
        size: "256x256", // Use smallest size for testing
      };
    } else {
      // Chat completion endpoint
      if (!testUrl.endsWith("/chat/completions")) {
        testUrl = testUrl.replace(/\/completions$/, "");
        if (!testUrl.match(/\/v\d+$/)) testUrl += "/v1";
        testUrl += "/chat/completions";
      }

      requestBody = {
        model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
        stream: false,
      };
    }

    let upstream: Response;
    try {
      upstream = await fetch(testUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
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
