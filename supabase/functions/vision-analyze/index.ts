import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/response-helpers.ts";
import { toCompletionsUrl } from "../_shared/model-client.ts";

type NullableBool = boolean | null;

type VisionAnalyzeResponse = {
  camera_preview_ready: true;
  detection_ready: boolean;
  detector_type: "server-vision";
  face_present: NullableBool;
  smiling: NullableBool;
  head_down_or_away: NullableBool;
  visual_summary: string;
  confidence?: number | null;
  last_detection_at: string;
  error_reason: string | null;
};

type RequestBody = {
  image_base64?: string;
  mode?: string;
  user_id?: string | null;
  conversation_id?: string | null;
  width?: number;
  height?: number;
};

function getVisionProvider() {
  const baseUrl = Deno.env.get("VISION_BASE_URL") || Deno.env.get("FIFTYFIVE_BASE_URL") || Deno.env.get("OPENROUTER_BASE_URL") || "";
  const apiKey = Deno.env.get("VISION_API_KEY") || Deno.env.get("FIFTYFIVE_API_KEY_GPT") || Deno.env.get("FIFTYFIVE_API_KEY") || Deno.env.get("OPENROUTER_API_KEY") || "";
  const model = Deno.env.get("VISION_MODEL") || Deno.env.get("MODEL_VISION_PRIMARY") || Deno.env.get("MODEL_GENERAL_PRIMARY") || Deno.env.get("MODEL_NAME") || "";
  return { endpoint: baseUrl ? toCompletionsUrl(baseUrl) : "", apiKey, model };
}

function normalizeDataUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)) {
    return `data:image/jpeg;base64,${trimmed.replace(/\s+/g, "")}`;
  }
  return null;
}

function clampNullableBool(value: unknown): NullableBool {
  return typeof value === "boolean" ? value : null;
}

function clampConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function normalizeVisionPayload(raw: Record<string, unknown> | null): VisionAnalyzeResponse {
  const now = new Date().toISOString();
  if (!raw) {
    return {
      camera_preview_ready: true,
      detection_ready: false,
      detector_type: "server-vision",
      face_present: null,
      smiling: null,
      head_down_or_away: null,
      visual_summary: "服务端视觉识别已返回，但结果格式不稳定；当前只知道摄像头预览可用。",
      confidence: null,
      last_detection_at: now,
      error_reason: "invalid_model_json",
    };
  }

  const summary = typeof raw.visual_summary === "string" && raw.visual_summary.trim()
    ? raw.visual_summary.trim().slice(0, 180)
    : "服务端视觉识别完成，但没有生成明确的视觉摘要。";

  return {
    camera_preview_ready: true,
    detection_ready: true,
    detector_type: "server-vision",
    face_present: clampNullableBool(raw.face_present),
    smiling: clampNullableBool(raw.smiling),
    head_down_or_away: clampNullableBool(raw.head_down_or_away),
    visual_summary: summary,
    confidence: clampConfidence(raw.confidence),
    last_detection_at: typeof raw.last_detection_at === "string" ? raw.last_detection_at : now,
    error_reason: null,
  };
}

async function callVisionModel(imageDataUrl: string): Promise<string> {
  const { endpoint, apiKey, model } = getVisionProvider();
  if (!endpoint || !apiKey || !model) throw new Error("vision_model_not_configured");

  const prompt = `你在为一个陪伴聊天应用分析一帧用户本地摄像头快照。只输出严格 JSON，不要 Markdown，不要解释。

字段要求：
{
  "face_present": true/false/null,
  "smiling": true/false/null,
  "head_down_or_away": true/false/null,
  "visual_summary": "一句自然中文，不要说我检测到/系统检测到。只描述可供回复语气参考的状态。",
  "confidence": 0到1之间的数字或null
}

判断规则：
- 看不清、遮挡、画面不确定时用 null，不要猜。
- 不做人脸身份识别，不推断身份、年龄、性别、种族等敏感属性。
- visual_summary 应简短温和，例如："用户在镜头前，状态看起来平静。" / "镜头里暂时没有看到用户。" / "用户在镜头前，可能低头或没有看向屏幕。"`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: false,
        max_tokens: 220,
        temperature: 0.1,
        messages: [
          { role: "system", content: "You are a careful vision state classifier. Return only strict JSON." },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`vision_model_${response.status}: ${text.slice(0, 180)}`);
    }
    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: "INVALID_JSON", error_reason: "invalid json body" }, 400);
  }

  if (body.mode !== "camera_snapshot") {
    return json({ ok: false, code: "INVALID_MODE", error_reason: "mode must be camera_snapshot" }, 400);
  }

  const imageDataUrl = body.image_base64 ? normalizeDataUrl(body.image_base64) : null;
  if (!imageDataUrl) {
    return json({ ok: false, code: "MISSING_IMAGE", error_reason: "image_base64 is required" }, 400);
  }

  if (imageDataUrl.length > 1_600_000) {
    return json({ ok: false, code: "IMAGE_TOO_LARGE", error_reason: "compressed image is too large" }, 413);
  }

  try {
    const modelText = await callVisionModel(imageDataUrl);
    const parsed = extractJsonObject(modelText);
    return json(normalizeVisionPayload(parsed));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ fn: "vision-analyze", event: "vision_failed", error: message.slice(0, 300) }));
    return json({
      camera_preview_ready: true,
      detection_ready: false,
      detector_type: "server-vision",
      face_present: null,
      smiling: null,
      head_down_or_away: null,
      visual_summary: "摄像头预览已开启，但这次服务端视觉识别失败；当前没有新的视觉状态。",
      confidence: null,
      last_detection_at: new Date().toISOString(),
      error_reason: message,
    });
  }
});
