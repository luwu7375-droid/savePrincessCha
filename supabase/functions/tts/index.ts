import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { generateSpeech as elevenLabsGenerate } from "./providers/elevenlabs.ts";
import { generateSpeech as minimaxGenerate } from "./providers/minimax.ts";
import { generateSpeech as localHttpGenerate } from "./providers/localHttp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPPORTED_PROVIDERS = ["elevenlabs", "minimax", "local_http"] as const;
type SupportedProvider = typeof SUPPORTED_PROVIDERS[number];

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

function normalizeVoiceTextForTTS(text: string, language: string): string | null {
  let normalized = text.replace(/\s+/g, " ").trim();
  if (!/[\p{L}\p{N}]/u.test(normalized)) return null;
  const endsWithPunctuation = /[。！？.!?…]$/.test(normalized);
  if (!endsWithPunctuation) {
    const isCJK = ["zh", "ja", "ko"].includes(language) || /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(normalized);
    normalized += isCJK ? "。" : ".";
  }
  return normalized;
}

type VoiceStyle = "neutral" | "soft" | "low_voice" | "dry" | "quiet_laugh" | "murmurs" | "curious";

interface VoiceScript {
  voice_text: string;
  voice_style: VoiceStyle;
  reason: string;
}

function inferVoiceStyle(text: string): { style: VoiceStyle; reason: string } {
  const lo = text.toLowerCase();
  // Technical content — never tag
  if (/[{}\[\]<>]|error|exception|\bapi\b|function\b|\bclass\b|\bconst\b|\blet\b|\bvar\b|undefined/.test(lo)) {
    return { style: "neutral", reason: "technical" };
  }
  // Intimate
  if (/我想你|过来一点|靠着|贴着|在你旁边|抱着你|陪着你/.test(text)) {
    return { style: "murmurs", reason: "intimate" };
  }
  // Soft / comforting
  if (/我在[^，。！？]*$|别急|慢慢说|慢慢来|不用急|不是你的问题|还好的|没关系|放松/.test(text)) {
    return { style: "soft", reason: "comforting" };
  }
  // Frustration
  if (/烦|气死|离谱|不对啊|不对吧|怎么又|真的假的|无语/.test(text)) {
    return { style: "low_voice", reason: "frustration" };
  }
  // Humor / dry
  if (/笑死|好好好|小破|哈哈|💀|这破/.test(text)) {
    return { style: "dry", reason: "humor" };
  }
  // Quiet laugh
  if (/嗯嗯嗯|哈哈哈|嘿嘿/.test(text)) {
    return { style: "quiet_laugh", reason: "light_laugh" };
  }
  // Question
  if (/[？?]$/.test(text.trim())) {
    return { style: "curious", reason: "question" };
  }
  // Short CJK acknowledgment (≤4 content chars)
  if (text.replace(/[。，！？.!?, \s]/g, "").length <= 4 && /[\u4e00-\u9fff]/.test(text)) {
    return { style: "soft", reason: "short_ack" };
  }
  return { style: "neutral", reason: "default" };
}

function buildVoiceText(normalized: string, style: VoiceStyle): string {
  const TAG: Partial<Record<VoiceStyle, string>> = {
    soft: "[softly]",
    low_voice: "[low voice]",
    dry: "[dryly]",
    quiet_laugh: "[quiet laugh]",
    murmurs: "[murmurs]",
    curious: "[curiously]",
  };
  const tag = TAG[style];

  // For long text, insert one [pause] near a natural sentence break at midpoint
  let body = normalized;
  if (normalized.length > 80) {
    const mid = Math.floor(normalized.length / 2);
    let breakIdx = -1;
    for (const ch of ["。", "！", "？", ".", "!", "?"]) {
      const idx = normalized.lastIndexOf(ch, mid + 20);
      if (idx > mid - 30 && idx > breakIdx) breakIdx = idx;
    }
    if (breakIdx > 0 && breakIdx < normalized.length - 5) {
      body = normalized.slice(0, breakIdx + 1) + " [pause] " + normalized.slice(breakIdx + 1).trimStart();
    }
  }

  return tag ? `${tag} ${body}` : body;
}

function createVoiceScript(displayText: string, language: string): VoiceScript | null {
  const prepared = prepareVoiceText(displayText);
  const normalized = normalizeVoiceTextForTTS(prepared, language);
  if (!normalized) return null;
  const { style, reason } = inferVoiceStyle(normalized);
  return { voice_text: buildVoiceText(normalized, style), voice_style: style, reason };
}

function textHash(text: string): string {
  // Simple djb2 hash — good enough for cache key mismatch detection
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h) ^ text.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16);
}

function audioToDataUrl(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return `data:audio/mpeg;base64,${btoa(binary)}`;
}

interface VoiceProfile {
  provider?: string;
  voice_id: string;
  model_id?: string;
  settings?: Record<string, unknown>;
}

interface RequestBody {
  message_id?: number | null;
  text?: string;
  language_hint?: string | null;
  provider?: string | null;
  voice_profile?: VoiceProfile | null;
  role?: string | null;
  context?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const request_id = crypto.randomUUID();

  // ── Env: infra secrets (never exposed to client) ────────────────────────────
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ELEVENLABS_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
  const MINIMAX_KEY = Deno.env.get("MINIMAX_API_KEY") ?? "";

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return jsonResp({ ok: false, code: "MISSING_TTS_SECRET", message: "missing: SUPABASE infra config", request_id }, 500);
  }

  const DB_HEADERS = {
    "Authorization": `Bearer ${SERVICE_KEY}`,
    "apikey": SERVICE_KEY,
    "Content-Type": "application/json",
  };

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResp({ ok: false, code: "INVALID_JSON", message: "Invalid JSON body", request_id }, 400);
  }

  const message_id = body.message_id ?? null;
  const text = (body.text ?? "").trim();
  const language_hint = body.language_hint ?? null;
  const provider = (body.provider ?? "elevenlabs") as SupportedProvider;
  const voice_profile = body.voice_profile ?? null;

  if (!text) {
    return jsonResp({ ok: false, code: "MISSING_TEXT", message: "text is required", request_id }, 400);
  }

  // ── Validate provider ───────────────────────────────────────────────────────
  if (!SUPPORTED_PROVIDERS.includes(provider as SupportedProvider)) {
    return jsonResp({
      ok: false,
      code: "UNSUPPORTED_TTS_PROVIDER",
      message: `provider "${provider}" is not supported`,
      request_id,
    }, 400);
  }

  // ── Validate voice profile ──────────────────────────────────────────────────
  const voice_id = voice_profile?.voice_id ?? "";
  const model_id = voice_profile?.model_id ?? "eleven_v3";
  const voice_settings = voice_profile?.settings;
  const language = language_hint ?? "default";

  if (!voice_id) {
    return jsonResp({
      ok: false,
      code: "MISSING_VOICE_ID",
      message: `voice_id is required for provider "${provider}"`,
      request_id,
    }, 400);
  }

  // ── Validate provider API key ───────────────────────────────────────────────
  if (provider === "elevenlabs" && !ELEVENLABS_KEY) {
    return jsonResp({ ok: false, code: "MISSING_TTS_SECRET", message: "missing: ELEVENLABS_API_KEY", request_id }, 500);
  }
  if (provider === "minimax" && !MINIMAX_KEY) {
    return jsonResp({ ok: false, code: "PROVIDER_NOT_CONFIGURED", message: "MiniMax API key is not set", request_id }, 500);
  }

  // ── Voice director: clean → normalize → style → tag ────────────────────────
  const script = createVoiceScript(text, language);

  if (!script) {
    return jsonResp({ ok: false, code: "EMPTY_VOICE_TEXT", message: "朗读文本为空", request_id }, 400);
  }

  const voiceText = script.voice_text;
  const hash = textHash(voiceText);

  const logCtx: Record<string, unknown> = {
    request_id,
    provider,
    language,
    voice_id: voice_id.slice(0, 8) + "…",
    model_id,
    voice_style: script.voice_style,
    voice_style_reason: script.reason,
    text_length: text.length,
    text_hash: hash,
    cached: false,
    provider_status: null,
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
        `${SUPABASE_URL}/rest/v1/message_audio?message_id=eq.${message_id}&select=audio_url,provider,language,voice_id,model_id,text_hash`,
        { headers: DB_HEADERS },
      );
      const rows = await cacheRes.json() as Array<{
        audio_url: string;
        provider: string;
        language: string;
        voice_id: string;
        model_id: string;
        text_hash: string;
      }>;
      const row = rows?.[0];
      if (
        row?.audio_url &&
        row.provider === provider &&
        row.language === language &&
        row.voice_id === voice_id &&
        row.model_id === model_id &&
        row.text_hash === hash
      ) {
        finalize({ cached: true, audio_url_type: "public" });
        return jsonResp({
          ok: true,
          audio_url: row.audio_url,
          provider,
          language,
          voice_id,
          model_id,
          voice_text: script.voice_text,
          voice_style: script.voice_style,
          cached: true,
        });
      }
    } catch (_) {
      // non-fatal, proceed to generate
    }
  }

  // ── Generate audio via provider ─────────────────────────────────────────────
  let audioBuffer: ArrayBuffer;
  let providerStatus: number;

  try {
    let result;
    if (provider === "elevenlabs") {
      result = await elevenLabsGenerate(ELEVENLABS_KEY, {
        text: voiceText,
        voice_id,
        model_id,
        settings: voice_settings as Record<string, number | boolean>,
      });
    } else if (provider === "minimax") {
      result = await minimaxGenerate(MINIMAX_KEY, { text: voiceText, voice_id, model_id });
    } else {
      result = await localHttpGenerate("", { text: voiceText, voice_id, model_id });
    }

    providerStatus = result.providerStatus;
    logCtx.provider_status = providerStatus;

    if (result.rawProviderError) {
      finalize({ error_code: "PROVIDER_ERROR", error_message: result.rawProviderError });
      return jsonResp({ ok: false, code: "PROVIDER_ERROR", message: result.rawProviderError, request_id }, 502);
    }

    audioBuffer = result.audioBuffer;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    finalize({ error_code: "PROVIDER_ERROR", error_message: msg });
    return jsonResp({ ok: false, code: "PROVIDER_ERROR", message: msg, request_id }, 502);
  }

  // ── No message_id → data URL (no cache) ──────────────────────────────���─────
  if (!message_id) {
    finalize({ audio_url_type: "data" });
    return jsonResp({
      ok: true,
      audio_url: audioToDataUrl(audioBuffer),
      provider,
      language,
      voice_id,
      model_id,
      voice_text: script.voice_text,
      voice_style: script.voice_style,
      cached: false,
    });
  }

  // ── Upload to Storage ───────────────────────────────────────────────────────
  const storagePath = `${provider}/${language}/${voice_id.slice(0, 8)}/${message_id}_${hash}.mp3`;
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

  // ── Upsert cache row (delete old entry for this message_id first, then insert) ─
  await fetch(
    `${SUPABASE_URL}/rest/v1/message_audio?message_id=eq.${message_id}`,
    { method: "DELETE", headers: DB_HEADERS },
  );
  await fetch(`${SUPABASE_URL}/rest/v1/message_audio`, {
    method: "POST",
    headers: { ...DB_HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify({ message_id, audio_url, provider, language, voice_id, model_id, text_hash: hash }),
  });

  finalize({ audio_url_type: "public" });
  return jsonResp({
    ok: true,
    audio_url,
    provider,
    language,
    voice_id,
    model_id,
    voice_text: script.voice_text,
    voice_style: script.voice_style,
    cached: false,
  });
});
