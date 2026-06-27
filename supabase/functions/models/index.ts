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

    const upstream = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const data = await upstream.json();
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
