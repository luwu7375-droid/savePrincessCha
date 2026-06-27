import { corsHeaders, corsOptionsResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOptionsResponse();

  try {
    const { endpoint, apiKey } = await req.json();
    if (!endpoint || !apiKey) {
      return new Response(JSON.stringify({ error: "missing endpoint or apiKey" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize endpoint to a /models URL
    let modelsUrl = endpoint.replace(/\/+$/, "")
      .replace(/\/chat\/completions$/, "")
      .replace(/\/completions$/, "");
    if (!modelsUrl.match(/\/v\d+$/)) modelsUrl += "/v1";
    modelsUrl += "/models";

    async function tryFetch(url: string): Promise<Response> {
      return await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://saveprincesscha.pages.dev",
          "X-Title": "SavePrincessCha",
        },
      });
    }

    let upstream: Response;
    try {
      upstream = await tryFetch(modelsUrl);

      // If we got HTML back, the URL is likely wrong.
      // Common case: openrouter.ai/v1/models should be openrouter.ai/api/v1/models
      const ct = upstream.headers.get("content-type") || "";
      if (ct.includes("text/html")) {
        // Try inserting /api before /v1
        const withApi = modelsUrl.replace(/:\/\/([^/]+)\/v/, "://$1/api/v");
        if (withApi !== modelsUrl) {
          upstream = await tryFetch(withApi);
          const ct2 = upstream.headers.get("content-type") || "";
          if (ct2.includes("text/html")) {
            return new Response(
              JSON.stringify({ status: 0, data: null, error: `端点返回 HTML 而非 JSON，请检查 API 地址。尝试了: ${modelsUrl} 和 ${withApi}` }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        } else {
          return new Response(
            JSON.stringify({ status: 0, data: null, error: `端点返回 HTML 而非 JSON，请确认 API 地址正确（如 https://openrouter.ai/api/v1）` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    } catch (fetchErr) {
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
      data = { raw: text.slice(0, 500) };
    }

    return new Response(JSON.stringify({ status: upstream.status, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
