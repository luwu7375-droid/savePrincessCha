// _shared/gemini-service.ts
// MCP-ready wrapper for Gemini API calls.
// Currently exposes: callGeminiEmotion (emotion scoring from last-N messages).

// ── Emotion cache (module-level, per-worker-process) ─────────────────────────
type EmotionCacheEntry = {
  valence: number;
  arousal: number;
  connection: number;
  ts: number;
};
const _emotionCache = new Map<string, EmotionCacheEntry>();
const EMOTION_CACHE_TTL_MS = 600_000; // 10 minutes

async function hashCacheKey(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// Analyzes last 4 messages for valence, arousal, connection.
// Returns null on error → caller falls back to rule-based values.
export async function callGeminiEmotion(
  last4: { role: string; content: unknown }[],
  apiKey: string,
): Promise<{ valence: number; arousal: number; connection: number } | null> {
  if (!apiKey || last4.length === 0) return null;
  const contentStr = last4
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
    .join("|");
  const cacheKey = await hashCacheKey(contentStr);
  const cached = _emotionCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < EMOTION_CACHE_TTL_MS) {
    return { valence: cached.valence, arousal: cached.arousal, connection: cached.connection };
  }
  const prompt =
    "分析以下对话片段中用户的情绪状态。只返回 JSON，不要解释：\n" +
    \'{"valence": <-0.1到0.1的小数，正为愉快负为低落>, "arousal": <-0.1到0.1的小数，正为活跃负为安静>, "connection": <-0.2到0.2的小数，正为贴近负为疏远>}\n\n\' +
    "对话片段：\n" +
    last4.map((m) => `${m.role}: ${typeof m.content === "string" ? m.content.slice(0, 200) : "[多媒体内容]"}`).join("\n");
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 64, temperature: 0.1 },
        }),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const valence = typeof parsed.valence === "number" ? parsed.valence : 0;
    const arousal = typeof parsed.arousal === "number" ? parsed.arousal : 0;
    const connection = typeof parsed.connection === "number" ? parsed.connection : 0;
    _emotionCache.set(cacheKey, { valence, arousal, connection, ts: Date.now() });
    return { valence, arousal, connection };
  } catch {
    return null;
  }
}

/** MCP tool definitions for Gemini services (stub — expand when MCP migration begins). */
export function getToolDefinitions() {
  return [];
}
