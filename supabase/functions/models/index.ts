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

    // Normalize endpoint
    let modelsUrl = endpoint.replace(/\/+$/, "")
      .replace(/\/chat\/completions$/, "")
      .replace(/\/completions$/, "");
    if (!modelsUrl.match(/\/v\d+$/)) modelsUrl += "/v1";
    modelsUrl += "/models";

    let upstream: Response;
    try {
      upstream = await fetch(modelsUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://saveprincesscha.pages.dev",
          "X-Title": "SavePrincessCha",
        },
      });
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
