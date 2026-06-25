import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ELEVENLABS_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const VOICE_ZH = Deno.env.get("VOICE_ID_G_ZH")!;
const VOICE_EN = Deno.env.get("VOICE_ID_G_EN")!;

const DB_HEADERS = {
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "apikey": SERVICE_KEY,
  "Content-Type": "application/json",
};

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

  let message_id: number | null = null;
  let text: string;
  try {
    const body = await req.json();
    message_id = body.message_id ?? null;
    text = body.text ?? "";
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!text.trim()) {
    return new Response(JSON.stringify({ error: "text required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Check cache
  if (message_id) {
    const cached = await fetch(
      `${SUPABASE_URL}/rest/v1/message_audio?message_id=eq.${message_id}&select=audio_url`,
      { headers: DB_HEADERS }
    );
    const rows = await cached.json() as Array<{ audio_url: string }>;
    if (rows?.[0]?.audio_url) {
      return new Response(JSON.stringify({ audio_url: rows[0].audio_url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const voiceId = detectLang(text) === "en" ? VOICE_EN : VOICE_ZH;
  const voiceText = prepareVoiceText(text);

  const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
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
  });

  if (!elRes.ok) {
    const err = await elRes.text();
    console.error("ElevenLabs error:", elRes.status, err);
    return new Response(JSON.stringify({ error: "TTS generation failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const audioBuffer = await elRes.arrayBuffer();

  if (!message_id) {
    // No cache key — return audio as base64 data URL
    const bytes = new Uint8Array(audioBuffer);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    const b64 = btoa(binary);
    return new Response(JSON.stringify({ audio_url: `data:audio/mpeg;base64,${b64}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Upload to Supabase Storage
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
    }
  );

  if (!uploadRes.ok) {
    console.error("Storage upload failed:", await uploadRes.text());
    return new Response(JSON.stringify({ error: "Storage upload failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const audio_url = `${SUPABASE_URL}/storage/v1/object/public/message-audio/${storagePath}`;

  // Save to cache table
  await fetch(`${SUPABASE_URL}/rest/v1/message_audio`, {
    method: "POST",
    headers: { ...DB_HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify({ message_id, audio_url }),
  });

  return new Response(JSON.stringify({ audio_url }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
