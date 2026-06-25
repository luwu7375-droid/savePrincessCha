import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function detectLang(text: string): "zh" | "en" {
  return /[\u4e00-\u9fff]/.test(text) ? "zh" : "en";
}

function prepareVoiceText(text: string): string {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#{1,6} /g, "")
    .replace(/[*_~]/g, "")
    .trim();
  const paras = cleaned.split(/\n\n+/).filter((p) => p.trim());
  return paras.slice(0, 2).join("\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const request_id = crypto.randomUUID();

  // ── Env vars check ──────────────────────────────────────────────────────────
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ELEVENLABS_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
  const VOICE_ZH = Deno.env.get("VOICE_ID_G_ZH") ?? "";
  const VOICE_EN = Deno.env.get("VOICE_ID_G_EN") ?? "";

  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SERVICE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!ELEVENLABS_KEY) missing.push("ELEVENLABS_API_KEY");
  if (!VOICE_ZH) missing.push("VOICE_ID_G_ZH");
  if (!VOICE_EN) missing.push("VOICE_ID_G_EN");

  if (missing.length > 0) {
    return jsonResp(
      { ok: false, code: "MISSING_TTS_SECRET", message: `missing: ${missing[0]}`, request_id },
      500,
    );
  }

  const DB_HEADERS = {
    "Authorization": `Bearer ${SERVICE_KEY}`,
    "apikey": SERVICE_KEY,
    "Content-Type": "application/json",
  };

  // ── Parse body ──────────────────────────────────────────────────────────────
  let message_id: number | null = null;
  let text: string;
  try {
    const body = await req.json();
    message_id = body.message_id ?? null;
    text = body.text ?? "";
  } catch {
    return jsonResp({ ok: false, code: "INVALID_JSON", message: "Invalid JSON body", request_id }, 400);
  }

  if (!text.trim()) {
    return jsonResp({ ok: false, code: "MISSING_TEXT", message: "text is required", request_id }, 400);
  }

  const lang = detectLang(text);
  const voiceId = lang === "en" ? VOICE_EN : VOICE_ZH;
  const voiceProfile = lang === "en" ? "G2en" : "G2zh";

  // ── Structured log context ──────────────────────────────────────────────────
  const logCtx: Record<string, unknown> = {
    request_id,
    provider: "elevenlabs",
    text_length: text.length,
    language_detected: lang,
    voice_profile: voiceProfile,
    has_elevenlabs_key: !!ELEVENLABS_KEY,
    has_voice_id_zh: !!VOICE_ZH,
    has_voice_id_en: !!VOICE_EN,
    cached: false,
    elevenlabs_status: null,
    storage_upload_status: null,
    audio_url_type: null,
    error_code: null,
    error_message: null,
  };

  function finalize(extra?: Partial<typeof logCtx>) {
    if (extra) Object.assign(logCtx, extra);
    console.log(JSON.stringify(logCtx));
  }

  // ── Cache check ─────────────────────────────────────────────────────────────
  if (message_id) {
    try {
      const cacheRes = await fetch(
        `${SUPABASE_URL}/rest/v1/message_audio?message_id=eq.${message_id}&select=audio_url`,
        { headers: DB_HEADERS },
      );
      const rows = await cacheRes.json() as Array<{ audio_url: string }>;
      if (rows?.[0]?.audio_url) {
        finalize({ cached: true, audio_url_type: "public" });
        return jsonResp({
          ok: true,
          audio_url: rows[0].audio_url,
          provider: "elevenlabs",
          voice_profile: voiceProfile,
          cached: true,
        });
      }
    } catch (_) {
      // non-fatal, proceed to generate
    }
  }

  // ── ElevenLabs request ──────────────────────────────────────────────────────
  const voiceText = prepareVoiceText(text);
  let elRes: Response;
  try {
    elRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: voiceText,
          model_id: "eleven_v3",
          voice_settings: {
            stability: 0.44,
            similarity_boost: 0.78,
            style: 0.32,
            use_speaker_boost: true,
            speed: 1.0,
          },
        }),
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    finalize({ error_code: "ELEVENLABS_NETWORK_ERROR", error_message: msg });
    return jsonResp({ ok: false, code: "ELEVENLABS_NETWORK_ERROR", message: msg, request_id }, 502);
  }

  logCtx.elevenlabs_status = elRes.status;

  if (!elRes.ok) {
    const errText = (await elRes.text()).slice(0, 500);
    finalize({ error_code: "ELEVENLABS_ERROR", error_message: errText });
    return jsonResp({ ok: false, code: "ELEVENLABS_ERROR", message: errText, request_id }, 502);
  }

  const ct = elRes.headers.get("content-type") ?? "";
  if (!ct.includes("audio")) {
    const body = (await elRes.text()).slice(0, 500);
    finalize({ error_code: "ELEVENLABS_BAD_CONTENT_TYPE", error_message: `content-type: ${ct}; body: ${body}` });
    return jsonResp({
      ok: false,
      code: "ELEVENLABS_BAD_CONTENT_TYPE",
      message: `Unexpected content-type: ${ct}`,
      request_id,
    }, 502);
  }

  const audioBuffer = await elRes.arrayBuffer();

  // ── No message_id → data URL fallback ──────────────────────────────────────
  if (!message_id) {
    const bytes = new Uint8Array(audioBuffer);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    const b64 = btoa(binary);
    finalize({ audio_url_type: "data" });
    return jsonResp({
      ok: true,
      audio_url: `data:audio/mpeg;base64,${b64}`,
      provider: "elevenlabs",
      voice_profile: voiceProfile,
      cached: false,
    });
  }

  // ── Upload to Storage ───────────────────────────────────────────────────────
  const storagePath = `${message_id}.mp3`;
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/message-audio/${storagePath}`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "audio/mpeg",
        "x-upsert": "true",
      },
      body: audioBuffer,
    },
  );

  logCtx.storage_upload_status = uploadRes.status;

  if (!uploadRes.ok) {
    const errText = (await uploadRes.text()).slice(0, 500);
    finalize({ error_code: "STORAGE_ERROR", error_message: errText });
    return jsonResp({ ok: false, code: "STORAGE_ERROR", message: "Storage upload failed", request_id }, 502);
  }

  const audio_url = `${SUPABASE_URL}/storage/v1/object/public/message-audio/${storagePath}`;

  // ── Save to cache table ─────────────────────────────────────────────────────
  await fetch(`${SUPABASE_URL}/rest/v1/message_audio`, {
    method: "POST",
    headers: { ...DB_HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify({ message_id, audio_url }),
  });

  finalize({ audio_url_type: "public" });
  return jsonResp({
    ok: true,
    audio_url,
    provider: "elevenlabs",
    voice_profile: voiceProfile,
    cached: false,
  });
});
