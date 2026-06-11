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
  raw_candidates_count: number;
  valid_candidates_count: number;
  inserted_count: number;
  duplicate_skipped_count: number;
  check_failed_count: number;
  insert_failed_count: number;
  auto_accept_count: number;
  pending_count: number;
  quarantine_count: number;
  reject_count: number;
};

export type PromotionResult = {
  scanned_count: number;
  eligible_count: number;
  promoted_count: number;
  skipped_count: number;
  duplicate_count: number;
  failed_count: number;
};

type UpsertCandidateResult =
  | { status: "inserted"; id: string }
  | { status: "duplicate"; id?: string }
  | { status: "check_failed"; http_status: number; error: string }
  | { status: "insert_failed"; http_status: number; error: string };

type RawCandidate = {
  candidate_type: string;
  title?: string;
  summary?: string;
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
{"candidates":[{"candidate_type":"fact|preference|relationship|project","title":"6-16字短标题","summary":"一句话摘要，40-80字","content":"完整可注入记忆内容，不超过80字","confidence":0.85,"sensitivity":0.10,"reason":"提取依据一句话"}]}`;

// ── Action matrix ─────────────────────────────────────────────────────────────
// Priority order:
// 1. sensitivity >= 0.70 → quarantine
// 2. fact/project only: confidence >= 0.90 && sensitivity <= 0.30 → auto_accept
// 3. confidence >= 0.65 → pending  (preference 类一律落此，需用户确认)
// 4. else → reject

function computeRecommendedAction(
  confidence: number,
  sensitivity: number,
  candidateType: string,
): "auto_accept" | "pending" | "quarantine" | "reject" {
  if (sensitivity >= 0.70) return "quarantine";
  // preference 类不允许 auto_accept — 交互偏好应由用户主动确认
  const autoAcceptTypes = new Set(["fact", "project"]);
  if (autoAcceptTypes.has(candidateType) && confidence >= 0.90 && sensitivity <= 0.30) return "auto_accept";
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
        max_tokens: 700,
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

const PROMOTION_ALLOWED_TYPES = new Set(["project", "fact", "preference"]);

const SENSITIVE_KEYWORDS = [
  "家人", "家庭", "父母", "妈妈", "爸爸", "兄弟", "姐妹", "孩子",
  "医院", "诊断", "药物", "手术", "病", "症状", "健康",
  "创伤", "抑郁", "焦虑", "自残", "痛苦",
  "性取向", "性别", "信仰", "宗教",
  "公司机密", "薪资", "老板", "同事",
  "前任", "分手", "失恋",
];

const TASK_PATTERNS = [
  "帮我", "请帮", "能不能", "可以吗", "告诉我", "怎么",
  "需要你", "你来", "查一下", "找一下",
];

const PREFERENCE_INTERACTION_PATTERNS = [
  "偏好", "习惯", "喜欢", "不喜欢", "风格", "方式", "命名", "格式",
  "回复", "语气", "语调", "模型", "产品", "界面", "功能",
];

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
}): Promise<UpsertCandidateResult> {
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

  // Dedup check
  const checkRes = await fetch(
    `${supabaseUrl}/rest/v1/auto_memory_candidates` +
      `?user_id=eq.${encodeURIComponent(userId)}` +
      `&content_hash=eq.${encodeURIComponent(contentHash)}` +
      `&select=id&limit=1`,
    { headers },
  );

  if (!checkRes.ok) {
    const errText = await checkRes.text();
    const result: UpsertCandidateResult = {
      status: "check_failed",
      http_status: checkRes.status,
      error: errText.slice(0, 200),
    };
    console.log(JSON.stringify({
      fn: "upsertCandidate",
      event: "check_failed",
      http_status: checkRes.status,
      error_head: errText.slice(0, 200),
      content_hash: contentHash,
    }));
    return result;
  }

  const existing = await checkRes.json() as Array<{ id: string }>;
  if (existing.length > 0) {
    const result: UpsertCandidateResult = { status: "duplicate", id: existing[0].id };
    console.log(JSON.stringify({
      fn: "upsertCandidate",
      event: "duplicate_skipped",
      existing_id: existing[0].id,
      content_hash: contentHash,
    }));
    return result;
  }

  const newId = `amc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const payload = {
    id: newId,
    user_id: userId,
    conversation_id: conversationId ?? null,
    source_msg_ids: userMessageId != null ? [userMessageId] : null,
    candidate_type: candidate.candidate_type,
    title: candidate.title?.trim() || null,
    summary: candidate.summary?.trim() || null,
    content: candidate.content,
    content_hash: contentHash,
    confidence: candidate.confidence,
    sensitivity: candidate.sensitivity,
    recommended_action: recommendedAction,
    status: "new",
    reason: candidate.reason ?? null,
    promoted_memory_id: null,
  };

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/auto_memory_candidates`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    const result: UpsertCandidateResult = {
      status: "insert_failed",
      http_status: insertRes.status,
      error: errText.slice(0, 200),
    };
    console.log(JSON.stringify({
      fn: "upsertCandidate",
      event: "insert_failed",
      http_status: insertRes.status,
      error_head: errText.slice(0, 200),
      payload_keys: Object.keys(payload),
      content_hash: contentHash,
    }));
    return result;
  }

  console.log(JSON.stringify({
    fn: "upsertCandidate",
    event: "inserted",
    id: newId,
    candidate_type: candidate.candidate_type,
    recommended_action: recommendedAction,
    content_hash: contentHash,
  }));
  return { status: "inserted", id: newId };
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
    raw_candidates_count: 0,
    valid_candidates_count: 0,
    inserted_count: 0,
    duplicate_skipped_count: 0,
    check_failed_count: 0,
    insert_failed_count: 0,
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

    result.raw_candidates_count = rawCandidates.length;

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

      const recommendedAction = computeRecommendedAction(confidence, sensitivity, c.candidate_type);

      // Skip reject-classified candidates — no point storing them
      if (recommendedAction === "reject") {
        result.reject_count += 1;
        continue;
      }

      result.valid_candidates_count += 1;

      const contentHash = await hashContent(c.content);

      let upsertResult: UpsertCandidateResult;
      try {
        upsertResult = await upsertCandidate({
          supabaseUrl,
          serviceRoleKey,
          userId,
          conversationId,
          candidate: { ...c, confidence, sensitivity },
          recommendedAction,
          contentHash,
          userMessageId,
        });
      } catch (err) {
        console.error(JSON.stringify({
          fn: "runAutoMemoryVault",
          event: "upsert_exception",
          error: err instanceof Error ? err.message : String(err),
          content_hash: contentHash,
        }));
        result.insert_failed_count += 1;
        continue;
      }

      if (upsertResult.status === "inserted") {
        result.inserted_count += 1;
        if (recommendedAction === "auto_accept") result.auto_accept_count += 1;
        else if (recommendedAction === "pending") result.pending_count += 1;
        else if (recommendedAction === "quarantine") result.quarantine_count += 1;
      } else if (upsertResult.status === "duplicate") {
        result.duplicate_skipped_count += 1;
      } else if (upsertResult.status === "check_failed") {
        result.check_failed_count += 1;
      } else if (upsertResult.status === "insert_failed") {
        result.insert_failed_count += 1;
      }
    }
  } catch (err) {
    console.error(
      "[runAutoMemoryVault] top-level error:",
      err instanceof Error ? err.message : String(err),
    );
  }

  console.log(JSON.stringify({
    fn: "runAutoMemoryVault",
    event: "summary",
    raw_candidates_count: result.raw_candidates_count,
    valid_candidates_count: result.valid_candidates_count,
    inserted_count: result.inserted_count,
    duplicate_skipped_count: result.duplicate_skipped_count,
    check_failed_count: result.check_failed_count,
    insert_failed_count: result.insert_failed_count,
    auto_accept_count: result.auto_accept_count,
    pending_count: result.pending_count,
    quarantine_count: result.quarantine_count,
    reject_count: result.reject_count,
  }));

  return result;
}

// ── mapCandidateTypeToCategory ────────────────────────────────────────────────

function mapCandidateTypeToCategory(
  candidateType: string,
  content: string,
): string | null {
  if (candidateType === "project") return "project_memory";
  if (candidateType === "fact") return "work";
  if (candidateType === "preference") {
    const lower = content.toLowerCase();
    const isInteractionPref = PREFERENCE_INTERACTION_PATTERNS.some((p) =>
      lower.includes(p)
    );
    return isInteractionPref ? "interaction_preferences" : "persona";
  }
  return null;
}

// ── promoteAutoMemoryCandidates ───────────────────────────────────────────────
// P2 promotion flow: moves eligible auto_memory_candidates into memories table.
// Only runs when AUTO_MEMORY_PROMOTION_ENABLED=true.
// Never throws — all errors are caught and logged.

export async function promoteAutoMemoryCandidates(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  conversationId?: string;
  limit?: number;
  dryRun?: boolean;
}): Promise<PromotionResult> {
  const {
    supabaseUrl,
    serviceRoleKey,
    userId,
    limit = 10,
    dryRun = true,
  } = params;

  const result: PromotionResult = {
    scanned_count: 0,
    eligible_count: 0,
    promoted_count: 0,
    skipped_count: 0,
    duplicate_count: 0,
    failed_count: 0,
  };

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  try {
    // 1. Fetch candidates
    const fetchRes = await fetch(
      `${supabaseUrl}/rest/v1/auto_memory_candidates` +
        `?user_id=eq.${encodeURIComponent(userId)}` +
        `&status=eq.new` +
        `&recommended_action=eq.auto_accept` +
        `&confidence=gte.0.85` +
        `&sensitivity=lte.0.30` +
        `&order=created_at.asc` +
        `&limit=${limit}`,
      { headers },
    );

    if (!fetchRes.ok) {
      const errText = await fetchRes.text();
      console.error(JSON.stringify({
        fn: "promoteAutoMemoryCandidates",
        event: "fetch_failed",
        http_status: fetchRes.status,
        error_head: errText.slice(0, 200),
      }));
      return result;
    }

    type CandidateRow = {
      id: string;
      user_id: string;
      candidate_type: string;
      title: string | null;
      summary: string | null;
      content: string;
      confidence: number;
      sensitivity: number;
      source_msg_ids: number[] | null;
      content_hash: string | null;
    };

    const candidates = (await fetchRes.json()) as CandidateRow[];
    result.scanned_count = candidates.length;

    for (const candidate of candidates) {
      // 2. Type whitelist
      if (!PROMOTION_ALLOWED_TYPES.has(candidate.candidate_type)) {
        console.log(JSON.stringify({
          fn: "promoteAutoMemoryCandidates",
          event: "promotion_skipped_type",
          candidate_id: candidate.id,
          candidate_type: candidate.candidate_type,
        }));
        result.skipped_count += 1;
        continue;
      }

      // 3. Sensitive content check
      const contentLower = candidate.content.toLowerCase();
      const hasSensitive = SENSITIVE_KEYWORDS.some((kw) =>
        contentLower.includes(kw)
      );
      if (hasSensitive) {
        console.log(JSON.stringify({
          fn: "promoteAutoMemoryCandidates",
          event: "promotion_skipped_sensitive",
          candidate_id: candidate.id,
          content_head: candidate.content.slice(0, 60),
        }));
        result.skipped_count += 1;
        continue;
      }

      // 4. One-shot task check
      const isTask = TASK_PATTERNS.some((p) => contentLower.includes(p));
      if (isTask) {
        console.log(JSON.stringify({
          fn: "promoteAutoMemoryCandidates",
          event: "promotion_skipped_task_pattern",
          candidate_id: candidate.id,
          content_head: candidate.content.slice(0, 60),
        }));
        result.skipped_count += 1;
        continue;
      }

      // 5. Map to memories category
      const targetCategory = mapCandidateTypeToCategory(
        candidate.candidate_type,
        candidate.content,
      );
      if (!targetCategory) {
        console.log(JSON.stringify({
          fn: "promoteAutoMemoryCandidates",
          event: "promotion_skipped_no_category",
          candidate_id: candidate.id,
          candidate_type: candidate.candidate_type,
          content_head: candidate.content.slice(0, 60),
        }));
        result.skipped_count += 1;
        continue;
      }

      result.eligible_count += 1;

      console.log(JSON.stringify({
        fn: "promoteAutoMemoryCandidates",
        event: "promotion_eligible",
        candidate_id: candidate.id,
        candidate_type: candidate.candidate_type,
        target_category: targetCategory,
        dry_run: dryRun,
      }));

      if (dryRun) {
        continue;
      }

      // 6. Dedup: check if identical content already in memories
      const dedupRes = await fetch(
        `${supabaseUrl}/rest/v1/memories` +
          `?content=eq.${encodeURIComponent(candidate.content)}` +
          `&select=id&limit=1`,
        { headers },
      );

      if (dedupRes.ok) {
        const existing = (await dedupRes.json()) as { id: string }[];
        if (existing.length > 0) {
          console.log(JSON.stringify({
            fn: "promoteAutoMemoryCandidates",
            event: "promotion_duplicate",
            candidate_id: candidate.id,
            existing_memory_id: existing[0].id,
          }));
          result.duplicate_count += 1;
          await fetch(
            `${supabaseUrl}/rest/v1/auto_memory_candidates?id=eq.${encodeURIComponent(candidate.id)}`,
            {
              method: "PATCH",
              headers: { ...headers, Prefer: "return=minimal" },
              body: JSON.stringify({
                status: "ignored",
                promotion_error: "duplicate: content already in memories",
                promotion_target: existing[0].id,
              }),
            },
          );
          continue;
        }
      }

      // 7. Insert into memories
      const insertRes = await fetch(`${supabaseUrl}/rest/v1/memories`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          content: candidate.content,
          title: candidate.title || null,
          summary: candidate.summary || null,
          category: targetCategory,
          enabled: true,
          source_msg_ids: candidate.source_msg_ids ?? null,
          user_id: candidate.user_id ?? null,
        }),
      });

      if (!insertRes.ok) {
        const errText = await insertRes.text();
        console.error(JSON.stringify({
          fn: "promoteAutoMemoryCandidates",
          event: "promotion_failed",
          candidate_id: candidate.id,
          http_status: insertRes.status,
          error_head: errText.slice(0, 200),
        }));
        result.failed_count += 1;
        await fetch(
          `${supabaseUrl}/rest/v1/auto_memory_candidates?id=eq.${encodeURIComponent(candidate.id)}`,
          {
            method: "PATCH",
            headers: { ...headers, Prefer: "return=minimal" },
            body: JSON.stringify({
              promotion_error: `insert_failed: ${insertRes.status} ${errText.slice(0, 100)}`,
            }),
          },
        );
        continue;
      }

      const inserted = (await insertRes.json()) as { id: string }[];
      const newMemoryId = inserted[0]?.id ?? null;
      if (newMemoryId === null) {
        console.error(JSON.stringify({
          fn: "promoteAutoMemoryCandidates",
          event: "promotion_insert_id_missing",
          candidate_id: candidate.id,
          note: "insert succeeded but returned no id",
        }));
      }

      console.log(JSON.stringify({
        fn: "promoteAutoMemoryCandidates",
        event: "promotion_inserted",
        candidate_id: candidate.id,
        memory_id: newMemoryId,
        target_category: targetCategory,
        content_head: candidate.content.slice(0, 60),
      }));

      // 8. Update candidate status
      const patchRes = await fetch(
        `${supabaseUrl}/rest/v1/auto_memory_candidates?id=eq.${encodeURIComponent(candidate.id)}`,
        {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify({
            status: "promoted",
            promoted_memory_id: newMemoryId,
            promoted_at: new Date().toISOString(),
            promotion_target: newMemoryId,
          }),
        },
      );
      if (!patchRes.ok) {
        const patchErr = await patchRes.text();
        console.error(JSON.stringify({
          fn: "promoteAutoMemoryCandidates",
          event: "promotion_status_patch_failed",
          candidate_id: candidate.id,
          memory_id: newMemoryId,
          http_status: patchRes.status,
          error_head: patchErr.slice(0, 200),
        }));
      }

      result.promoted_count += 1;
    }
  } catch (err) {
    console.error(JSON.stringify({
      fn: "promoteAutoMemoryCandidates",
      event: "top_level_error",
      error: err instanceof Error ? err.message : String(err),
    }));
  }

  console.log(JSON.stringify({
    fn: "promoteAutoMemoryCandidates",
    event: "summary",
    dry_run: dryRun,
    scanned_count: result.scanned_count,
    eligible_count: result.eligible_count,
    promoted_count: result.promoted_count,
    skipped_count: result.skipped_count,
    duplicate_count: result.duplicate_count,
    failed_count: result.failed_count,
  }));

  return result;
}
