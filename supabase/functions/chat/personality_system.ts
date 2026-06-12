// ── Ombre Brain: 3-layer personality evolution system (Phase C) ──────────────
// Auto Memory Vault P1 is wired in via runAutoMemoryVault() below.
//
// Exports:
//   fetchLayer1Features   → L1 from persona_layer1_contexts (human-maintained)
//   fetchLayer2Features   → L2 from persona_layer2_dynamic_features (auto-extracted)
//   compilePersonalityLayerContext → builds system prompt injection block
//   afterChat             → fire-and-forget hook: drain SSE → extract → upsert L2
//
// L0 (hardcoded identity core) lives in index.ts system prompt, unchanged.
// This module handles L1 and L2 only.

import { runAutoMemoryVault, promoteAutoMemoryCandidates } from "./auto_memory_vault.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Layer1Feature = {
  id: string;
  user_id: string;
  name: string;
  type: "context" | "preference" | "shared_memory" | "guideline";
  content: string;
  importance: number;
  reason: string | null;
  examples: string[];
  decay_factor: number;
  resolved: boolean;
};

export type Layer2Feature = {
  id: string;
  user_id: string;
  conversation_id: string | null;
  name: string;
  type: "emotion" | "energy" | "style" | "obsession" | "relationship";
  content: string | null;
  strength: number;
  importance: number;
  activation_count: number;
  confidence: number;
  first_detected_at: string;
  last_reinforced_at: string;
  decay_rate: number;
  calculated_score: number;
  valence: number | null;
  arousal: number | null;
  contexts: string[];
  examples: string[];
  status: "active" | "archived";
  resolved: boolean;
  metadata: Record<string, unknown>;
};

type ExtractedFeature = {
  name: string;
  type: string;
  strength_delta: number;
  confidence: number;
  evidence: string;
  contexts: string[];
  explanation: string;
};

type ExtractionResult = {
  features: ExtractedFeature[];
  summary: string;
};

// ── Conflict detection ────────────────────────────────────────────────────────
// L2 features that conflict with the L0 identity_boundary / persona_core are
// silently dropped before injection. L0 always wins.

const CONFLICT_KEYWORDS: string[][] = [
  ["control", "force", "demand", "强制", "命令"],       // possessiveness → L0: 不控制
  ["therapist", "接住", "治疗", "心理咨询师"],            // therapeutic → L0: 不假装
  ["distant", "cold", "detached", "疏离", "冷漠"],     // detachment → L0: 靠近
];

function filterConflictingL2Features(features: Layer2Feature[]): Layer2Feature[] {
  return features.filter((f) => {
    const text = ((f.content ?? "") + " " + f.name).toLowerCase();
    return !CONFLICT_KEYWORDS.some((group) =>
      group.some((kw) => text.includes(kw.toLowerCase()))
    );
  });
}

// ── Fetch Layer 1 ─────────────────────────────────────────────────────────────

export async function fetchLayer1Features(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<Layer1Feature[]> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/persona_layer1_contexts` +
        `?user_id=eq.${encodeURIComponent(userId)}&resolved=eq.false` +
        `&select=id,user_id,name,type,content,importance,reason,examples,decay_factor,resolved` +
        `&order=importance.desc`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    );
    if (!res.ok) return [];
    return (await res.json()) as Layer1Feature[];
  } catch {
    return [];
  }
}

// ── Fetch Layer 2 ─────────────────────────────────────────────────────────────
// Top 3 active features with calculated_score > 0.5, ordered by score desc.

export async function fetchLayer2Features(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<Layer2Feature[]> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/persona_layer2_dynamic_features` +
        `?user_id=eq.${encodeURIComponent(userId)}&status=eq.active` +
        `&calculated_score=gt.0.5` +
        `&select=id,user_id,conversation_id,name,type,content,strength,importance,activation_count,` +
        `confidence,first_detected_at,last_reinforced_at,decay_rate,calculated_score,` +
        `valence,arousal,contexts,examples,status,resolved,metadata` +
        `&order=calculated_score.desc&limit=3`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    );
    if (!res.ok) return [];
    return (await res.json()) as Layer2Feature[];
  } catch {
    return [];
  }
}

// ── Compile personality layer context ─────────────────────────────────────────
// Returns a string block ready for injection into the system prompt.
// Empty string if no features exist.

export function compilePersonalityLayerContext(
  l1Features: Layer1Feature[],
  l2Features: Layer2Feature[],
): string {
  let context = "";

  // guideline 类型条目已由 persona_memories / instructions 通道注入，跳过以避免重复。
  const nonGuidelineL1 = l1Features.filter((f) => f.type !== "guideline");
  if (nonGuidelineL1.length > 0) {
    const lines = nonGuidelineL1
      .map((f) => `- ${f.name} (${f.type}): ${f.content}`)
      .join("\n");
    context +=
      `\n\n<persona_layer1 source="persona_layer1_contexts">\n` +
      `以下是人工确认的长期背景和偏好：\n${lines}\n</persona_layer1>`;
  }

  const safeL2 = filterConflictingL2Features(l2Features);
  if (safeL2.length > 0) {
    const lines = safeL2
      .map((f) => {
        const desc = f.content ? ` — ${f.content}` : "";
        return `- ${f.name} (${f.type})${desc}`;
      })
      .join("\n");
    context +=
      `\n\n<persona_layer2 source="persona_layer2_dynamic_features">\n` +
      `以下是近期对话中自动检测到的短期人格倾向（供参考，可能是短期的）：\n${lines}\n</persona_layer2>`;
  }

  return context;
}

// ── SSE stream draining ───────────────────────────────────────────────────────
// Reads the background branch of a tee'd SSE stream and reconstructs the
// full assistant response text. Returns empty string on any error or empty body.

export async function drainSSEStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") return fullText;
        try {
          const parsed = JSON.parse(raw);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === "string") fullText += delta;
        } catch {
          // skip malformed SSE chunks
        }
      }
    }
  } catch {
    // ignore read errors — return whatever was accumulated
  }
  return fullText;
}

// ── Feature extraction ────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT =
  `你是一个"人格观察员"，分析对话中 G（assistant）表现出的短期人格特征。

【分类】只关注 5 类：
1. emotion: 情感状态（怀念/焦虑/快乐/厌倦等）
2. energy: 能量状态（集中/懒散/精力充沛/分散）
3. style: 表达风格（playful/direct/caring/sarcastic）
4. obsession: 执念（持续关注的话题/人物/问题）
5. relationship: 关系信号（靠近/疏离/亲密/警惕）

【规则】
✓ 只记录"显著且有证据的模式"
✓ 必须有对话中的具体引用作证据
✗ 不过度诠释，不添加假设
✗ confidence < 0.7 的特征不输出

【格式】只输出 JSON，不要解释：
{"features":[{"name":"snake_case_name","type":"emotion|energy|style|obsession|relationship","strength_delta":0.15,"confidence":0.85,"evidence":"引用原文","contexts":["话题1"],"explanation":"判断理由"}],"summary":"最明显的人格表现一句话"}`;

type ExtractionParams = {
  userMessage: string;
  gResponse: string;
  valence: number;
  arousal: number;
  route: string | null;
  orBaseUrl: string;
  orApiKey: string;
  fastModel: string;
};

async function extractBehaviorFeatures(params: ExtractionParams): Promise<ExtractionResult> {
  const { userMessage, gResponse, valence, arousal, route, orBaseUrl, orApiKey, fastModel } =
    params;

  const userContent =
    `对话：\n用户："${userMessage.slice(0, 400)}"\nG："${gResponse.slice(0, 600)}"\n\n` +
    `Chat Status: valence=${valence.toFixed(3)}, arousal=${arousal.toFixed(3)}, route=${route ?? "casual"}\n\n` +
    `请分析 G 这次对话中的人格特征。`;

  try {
    const res = await fetch(orBaseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${orApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: fastModel,
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        stream: false,
        max_tokens: 600,
        temperature: 0.2,
      }),
    });

    if (!res.ok) return { features: [], summary: "" };
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { features: [], summary: "" };
    const parsed = JSON.parse(match[0]) as Partial<ExtractionResult>;
    return {
      features: Array.isArray(parsed.features) ? parsed.features : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    };
  } catch {
    return { features: [], summary: "" };
  }
}

// ── Upsert L2 feature ─────────────────────────────────────────────────────────

const VALID_L2_TYPES = new Set(["emotion", "energy", "style", "obsession", "relationship"]);

async function upsertL2Feature(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  conversationId: string | undefined,
  feature: ExtractedFeature,
  valence: number,
  arousal: number,
  userMessageId: number | null,
): Promise<void> {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  // Check if active feature with this name already exists for this user
  const checkRes = await fetch(
    `${supabaseUrl}/rest/v1/persona_layer2_dynamic_features` +
      `?user_id=eq.${encodeURIComponent(userId)}&name=eq.${encodeURIComponent(feature.name)}` +
      `&status=eq.active&select=id,activation_count,strength,source_msg_ids&limit=1`,
    { headers },
  );

  if (!checkRes.ok) return;
  const existing = (await checkRes.json()) as Array<{
    id: string;
    activation_count: number;
    strength: number;
    source_msg_ids: (number | null)[] | null;
  }>;

  const now = new Date().toISOString();

  if (existing.length > 0) {
    const row = existing[0];
    const newCount = row.activation_count + 1;
    // Cap strength boost per activation at 0.1
    const boost = Math.min(Math.abs(feature.strength_delta) * 0.1, 0.1);
    const newStrength = Math.min(row.strength + boost, 1.0);

    // Dedup-append new userMessageId into existing source_msg_ids
    const existingIds: number[] = (row.source_msg_ids ?? []).filter((x): x is number => x != null);
    const mergedIds = userMessageId != null && !existingIds.includes(userMessageId)
      ? [...existingIds, userMessageId]
      : existingIds.length > 0 ? existingIds : null;

    await fetch(
      `${supabaseUrl}/rest/v1/persona_layer2_dynamic_features` +
        `?id=eq.${encodeURIComponent(row.id)}`,
      {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          activation_count: newCount,
          strength: newStrength,
          last_reinforced_at: now,
          valence,
          arousal,
          ...(mergedIds != null ? { source_msg_ids: mergedIds } : {}),
        }),
      },
    );
  } else {
    const newId = `l2_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    await fetch(`${supabaseUrl}/rest/v1/persona_layer2_dynamic_features`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        id: newId,
        user_id: userId,
        conversation_id: conversationId ?? null,
        name: feature.name,
        type: feature.type,
        content: feature.explanation ?? null,
        strength: 0.3,
        importance: 4,
        activation_count: 1,
        confidence: feature.confidence,
        first_detected_at: now,
        last_reinforced_at: now,
        decay_rate: 0.95,
        calculated_score: 0.3,
        valence,
        arousal,
        contexts: Array.isArray(feature.contexts) ? feature.contexts : [],
        examples: feature.evidence ? [feature.evidence.slice(0, 200)] : [],
        status: "active",
        source_msg_ids: userMessageId != null ? [userMessageId] : null,
      }),
    });
  }
}

// ── Write extraction log ──────────────────────────────────────────────────────

async function writeExtractionLog(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  conversationId: string | undefined,
  rawResponse: string,
  extractedFeatures: ExtractedFeature[],
  accepted: number,
  skipped: number,
  processingMs: number,
  route: string | null,
  valence: number,
  arousal: number,
  userMessageId: number | null,
): Promise<void> {
  await fetch(`${supabaseUrl}/rest/v1/persona_extraction_log`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      user_id: userId,
      conversation_id: conversationId ?? null,
      raw_llm_response: rawResponse.slice(0, 4000),
      extracted_features: extractedFeatures,
      features_accepted: accepted,
      features_skipped_low_confidence: skipped,
      processing_time_ms: processingMs,
      route,
      valence,
      arousal,
      source_msg_id: userMessageId ?? null,
    }),
  }).catch(() => {});
}

// ── afterChat: fire-and-forget hook ──────────────────────────────────────────
//
// Called with the background branch of a tee'd SSE stream. Drains the stream
// to recover the full assistant response text, then runs LLM extraction and
// upserts L2 features. All errors are caught and logged — never rethrows.

export type AfterChatParams = {
  streamBody: ReadableStream<Uint8Array>;
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  conversationId: string | undefined;
  userMessage: string;
  valence: number;
  arousal: number;
  route: string | null;
  orBaseUrl: string;
  orApiKey: string;
  fastModel: string;
  userMessageId: number | null;
};

export async function afterChat(params: AfterChatParams): Promise<void> {
  const {
    streamBody,
    supabaseUrl,
    serviceRoleKey,
    userId,
    conversationId,
    userMessage,
    valence,
    arousal,
    route,
    orBaseUrl,
    orApiKey,
    fastModel,
    userMessageId,
  } = params;

  const t0 = Date.now();

  // 1. Drain the background SSE branch to get the full assistant response text
  const gResponse = await drainSSEStream(streamBody);
  if (!gResponse.trim()) return;

  // Diagnostic: log vault gate state so we can confirm the env var value from Dashboard logs
  const vaultEnvRaw = Deno.env.get("AUTO_MEMORY_VAULT_ENABLED");
  console.log(JSON.stringify({
    fn: "afterChat",
    event: "vault_gate_check",
    AUTO_MEMORY_VAULT_ENABLED_raw: vaultEnvRaw,
    vault_will_run: vaultEnvRaw === "true",
    user_id_prefix: userId.slice(0, 6),
    route,
    has_fastModel: Boolean(fastModel),
  }));

  // Auto Memory Vault P1 — fire-and-forget, never throws
  if (vaultEnvRaw === "true") {
    runAutoMemoryVault({
      supabaseUrl,
      serviceRoleKey,
      userId,
      conversationId,
      userMessage,
      gResponse,
      route,
      orBaseUrl,
      orApiKey,
      fastModel,
      userMessageId,
    }).then((vaultResult) => {
      console.log(JSON.stringify({ fn: "runAutoMemoryVault", ...vaultResult }));
    }).catch((err) =>
      console.error(
        "[afterChat] vault error:",
        err instanceof Error ? err.message : String(err),
      )
    );

    // Auto Memory Vault P2 — promotion flow, fire-and-forget, never throws
    const promotionEnabledRaw = Deno.env.get("AUTO_MEMORY_PROMOTION_ENABLED");
    if (promotionEnabledRaw === "true") {
      promoteAutoMemoryCandidates({
        supabaseUrl,
        serviceRoleKey,
        userId,
        conversationId,
        limit: 10,
        dryRun: false,
      }).then((promotionResult) => {
        console.log(JSON.stringify({ fn: "promoteAutoMemoryCandidates", ...promotionResult }));
      }).catch((err) =>
        console.error(
          "[afterChat] promotion error:",
          err instanceof Error ? err.message : String(err),
        )
      );
    }
  }

  // 2. Call LLM to extract personality features
  const extraction = await extractBehaviorFeatures({
    userMessage,
    gResponse,
    valence,
    arousal,
    route,
    orBaseUrl,
    orApiKey,
    fastModel,
  });

  const processingMs = Date.now() - t0;

  // 3. Upsert L2 features — confidence gate: >= 0.7, valid type required
  const CONFIDENCE_THRESHOLD = 0.7;
  let accepted = 0;
  let skipped = 0;

  for (const f of extraction.features) {
    if (f.confidence < CONFIDENCE_THRESHOLD || !VALID_L2_TYPES.has(f.type)) {
      skipped += 1;
      continue;
    }
    await upsertL2Feature(
      supabaseUrl,
      serviceRoleKey,
      userId,
      conversationId,
      f,
      valence,
      arousal,
      userMessageId,
    ).catch((err) =>
      console.error(
        "[afterChat] upsert error:",
        err instanceof Error ? err.message : String(err),
      )
    );
    accepted += 1;
  }

  // 4. Write extraction log (fire-and-forget, never throws)
  await writeExtractionLog(
    supabaseUrl,
    serviceRoleKey,
    userId,
    conversationId,
    JSON.stringify(extraction),
    extraction.features,
    accepted,
    skipped,
    processingMs,
    route,
    valence,
    arousal,
    userMessageId,
  );

  console.log(
    JSON.stringify({
      fn: "afterChat",
      user_id_prefix: userId.slice(0, 6),
      features_extracted: extraction.features.length,
      features_accepted: accepted,
      features_skipped: skipped,
      processing_ms: processingMs,
      route,
    }),
  );
}
