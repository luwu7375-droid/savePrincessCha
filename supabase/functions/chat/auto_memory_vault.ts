// ── Auto Memory Vault P1: candidate pool writer ───────────────────────────────
//
// Extracts user-centric facts from each conversation turn and writes them
// as candidates to `auto_memory_candidates`. Candidates are NEVER auto-promoted
// to `memories` in P1 — that belongs to a future P2 promotion flow.
//
// Controlled by env var AUTO_MEMORY_VAULT_ENABLED=true (default: off).
//
// Architecture (Option A): called fire-and-forget from afterChat() in
// personality_system.ts, immediately after drainSSEStream() returns gResponse.

// ── Types ─────────────────────────────────────────────────────────────────────

export type AutoMemoryVaultResult = {
  candidates_count: number;
  auto_accept_count: number;
  pending_count: number;
  quarantine_count: number;
  reject_count: number;
};

type RawCandidate = {
  candidate_type: string;
  content: string;
  confidence: number;
  sensitivity: number;
  reason: string;
};

type ExtractionResponse = {
  candidates: RawCandidate[];
};

// ── Extraction system prompt ──────────────────────────────────────────────────
// Only extract user facts from userMessage. gResponse is context reference only.

const VAULT_EXTRACTION_SYSTEM_PROMPT =
  `你是一个「记忆候选提取员」，从对话中提取关于用户（kk）的事实性信息，写入候选记忆池。

【提取来源】
- 只从"用户消息"中提取用户的事实，不从 G（assistant）的回复中推断。
- G 的回复仅作为理解上下文的参考，不作为提取源。

【候选类型】只使用以下 4 类（最多输出 3 个候选）：
1. fact: 关于用户的客观事实（职业、地点、经历、健康状况等）
2. preference: 用户的偏好、喜好、习惯
3. relationship: 用户与他人的关系信号
4. project: 用户正在做的项目/工作/计划

【敏感度规则（sensitivity 字段）】
- medical（医疗/健康/身体症状）→ sensitivity >= 0.70
- family（家庭关系/家人）→ sensitivity >= 0.70
- trauma（创伤/痛苦经历/心理困境）→ sensitivity >= 0.70
- identity（身份认同/性取向/信仰）→ sensitivity >= 0.70
- 一般生活偏好/兴趣/工作 → sensitivity 0.05~0.30

【置信度规则（confidence 字段）】
- 用户明确陈述的事实 → confidence 0.85~0.95
- 用户暗示或侧面提及 → confidence 0.65~0.84
- 模糊、单次提及、可能是玩笑 → confidence < 0.65（不输出）

【过滤规则】
✗ 不输出 confidence < 0.65 的候选
✗ 不输出已是众所周知的通用信息
✗ 不过度解读，不添加假设

【输出格式】只输出 JSON，不要解释：
{"candidates":[{"candidate_type":"fact|preference|relationship|project","content":"简洁的事实描述，不超过60字","confidence":0.85,"sensitivity":0.10,"reason":"提取依据一句话"}]}`;

// ── Action matrix ─────────────────────────────────────────────────────────────
// Priority order:
// 1. sensitivity >= 0.70 → quarantine
// 2. confidence >= 0.85 && sensitivity <= 0.30 → auto_accept
// 3. confidence >= 0.65 → pending
// 4. else → reject

function computeRecommendedAction(
  confidence: number,
  sensitivity: number,
): "auto_accept" | "pending" | "quarantine" | "reject" {
  if (sensitivity >= 0.70) return "quarantine";
  if (confidence >= 0.85 && sensitivity <= 0.30) return "auto_accept";
  if (confidence >= 0.65) return "pending";
  return "reject";
}

// ── Content hash (SHA-256 prefix, 16 hex chars) ───────────────────────────────
// Used for dedup per user_id. Web Crypto API available in Deno.

async function hashContent(content: string): Promise<string> {
  const normalized = content.toLowerCase().trim();
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// ── LLM extraction ────────────────────────────────────────────────────────────

async function extractVaultCandidates(params: {
  userMessage: string;
  gResponse: string;
  route: string | null;
  orBaseUrl: string;
  orApiKey: string;
  fastModel: string;
}): Promise<RawCandidate[]> {
  const { userMessage, gResponse, route, orBaseUrl, orApiKey, fastModel } = params;

  const userContent =
    `用户消息：\n"${userMessage.slice(0, 500)}"\n\n` +
    `G 的回复（仅供参考上下文，不是提取源）：\n"${gResponse.slice(0, 400)}"\n\n` +
    `当前话题路由：${route ?? "casual"}\n\n` +
    `请从用户消息中提取候选记忆。`;

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
          { role: "system", content: VAULT_EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        stream: false,
        max_tokens: 500,
        temperature: 0.1,
      }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.log(JSON.stringify({
        fn: "extractVaultCandidates",
        event: "llm_response",
        status: res.status,
        text_head: text.slice(0, 200),
        candidates_parsed: 0,
        note: "no JSON block found",
      }));
      return [];
    }
    const parsed = JSON.parse(match[0]) as Partial<ExtractionResponse>;
    const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
    console.log(JSON.stringify({
      fn: "extractVaultCandidates",
      event: "llm_response",
      status: res.status,
      text_head: text.slice(0, 200),
      candidates_parsed: candidates.length,
    }));
    return candidates;
  } catch {
    return [];
  }
}

// ── Valid candidate types ─────────────────────────────────────────────────────

const VALID_CANDIDATE_TYPES = new Set(["fact", "preference", "relationship", "event", "emotion", "project"]);

// ── Upsert candidate (dedup by content_hash) ─────────────────────────────────

async function upsertCandidate(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  conversationId: string | undefined;
  candidate: RawCandidate;
  recommendedAction: "auto_accept" | "pending" | "quarantine" | "reject";
  contentHash: string;
  userMessageId: number | null;
}): Promise<void> {
  const {
    supabaseUrl,
    serviceRoleKey,
    userId,
    conversationId,
    candidate,
    recommendedAction,
    contentHash,
    userMessageId,
  } = params;

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  // Dedup check: if a candidate with the same content_hash already exists for
  // this user (any status), skip insertion.
  const checkRes = await fetch(
    `${supabaseUrl}/rest/v1/auto_memory_candidates` +
      `?user_id=eq.${encodeURIComponent(userId)}` +
      `&content_hash=eq.${encodeURIComponent(contentHash)}` +
      `&select=id&limit=1`,
    { headers },
  );

  if (!checkRes.ok) return;
  const existing = await checkRes.json() as Array<{ id: string }>;
  if (existing.length > 0) return; // duplicate, skip

  const newId = `amc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/auto_memory_candidates`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({
      id: newId,
      user_id: userId,
      conversation_id: conversationId ?? null,
      source_msg_ids: userMessageId != null ? [userMessageId] : null,
      candidate_type: candidate.candidate_type,
      content: candidate.content,
      content_hash: contentHash,
      confidence: candidate.confidence,
      sensitivity: candidate.sensitivity,
      recommended_action: recommendedAction,
      status: "new",
      reason: candidate.reason ?? null,
      promoted_memory_id: null,
    }),
  });
  if (!insertRes.ok) {
    const errText = await insertRes.text();
    console.error(
      "[upsertCandidate] insert failed:",
      insertRes.status,
      errText.slice(0, 300),
    );
  }
}

// ── runAutoMemoryVault ────────────────────────────────────────────────────────
// Orchestrates extraction → action classification → dedup → insert.
// All errors are caught and logged — never rethrows.

export async function runAutoMemoryVault(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  conversationId: string | undefined;
  userMessage: string;
  gResponse: string;
  route: string | null;
  orBaseUrl: string;
  orApiKey: string;
  fastModel: string;
  userMessageId: number | null;
}): Promise<AutoMemoryVaultResult> {
  const {
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
  } = params;

  const result: AutoMemoryVaultResult = {
    candidates_count: 0,
    auto_accept_count: 0,
    pending_count: 0,
    quarantine_count: 0,
    reject_count: 0,
  };

  try {
    console.log(JSON.stringify({
      fn: "runAutoMemoryVault",
      event: "start",
      user_id_prefix: userId.slice(0, 6),
      userMessage_len: userMessage.trim().length,
      has_orBaseUrl: Boolean(orBaseUrl),
      has_orApiKey: Boolean(orApiKey),
      fastModel_name: fastModel,
    }));

    // Skip if user message is trivially short (< 8 chars)
    if (userMessage.trim().length < 8) return result;

    const rawCandidates = await extractVaultCandidates({
      userMessage,
      gResponse,
      route,
      orBaseUrl,
      orApiKey,
      fastModel,
    });

    console.log(JSON.stringify({
      fn: "runAutoMemoryVault",
      event: "extraction_done",
      raw_candidates_count: rawCandidates.length,
    }));

    if (rawCandidates.length === 0) return result;

    for (const c of rawCandidates) {
      // Validate required fields
      if (
        typeof c.content !== "string" ||
        !c.content.trim() ||
        typeof c.confidence !== "number" ||
        typeof c.sensitivity !== "number" ||
        !VALID_CANDIDATE_TYPES.has(c.candidate_type)
      ) {
        continue;
      }

      // Clamp to valid range
      const confidence = Math.max(0, Math.min(1, c.confidence));
      const sensitivity = Math.max(0, Math.min(1, c.sensitivity));

      // Confidence gate: skip low-confidence candidates
      if (confidence < 0.65) {
        result.reject_count += 1;
        continue;
      }

      const recommendedAction = computeRecommendedAction(confidence, sensitivity);

      // Skip reject-classified candidates — no point storing them
      if (recommendedAction === "reject") {
        result.reject_count += 1;
        continue;
      }

      const contentHash = await hashContent(c.content);

      await upsertCandidate({
        supabaseUrl,
        serviceRoleKey,
        userId,
        conversationId,
        candidate: { ...c, confidence, sensitivity },
        recommendedAction,
        contentHash,
        userMessageId,
      }).catch((err) =>
        console.error(
          "[runAutoMemoryVault] upsert error:",
          err instanceof Error ? err.message : String(err),
        )
      );

      result.candidates_count += 1;
      if (recommendedAction === "auto_accept") result.auto_accept_count += 1;
      else if (recommendedAction === "pending") result.pending_count += 1;
      else if (recommendedAction === "quarantine") result.quarantine_count += 1;
    }
  } catch (err) {
    console.error(
      "[runAutoMemoryVault] top-level error:",
      err instanceof Error ? err.message : String(err),
    );
  }

  return result;
}
