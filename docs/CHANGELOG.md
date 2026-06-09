# Changelog

## auto memory card redesign

**Date:** 2026-06-09
**Commit:** `9423d75`
**Functions deployed:** none
**Migration:** none

### What shipped

**自动记忆卡片重设计（`app.js`, `style.css`）**
- 默认折叠视图：type / status 双 badge + 自动生成标题（content 前 30 字）+ 2 行摘要（前 80 字，CSS line-clamp）
- 展开面板：完整内容、来源预览、置信度 %、敏感度、source_msg_ids、更新时间
- 候选记忆（candidates）和已写入记忆（memories）使用同一套卡片结构
- `buildRecentMemoryItem()` 重构为命名参数对象形式，新增 `confidence` / `sensitivity` / `sourceMsgIds` 字段
- 新增辅助函数 `_mcAutoTitle()`（30 字截断）和 `_mcAutoSummary()`（80 字截断）
- 两处调用方（`renderRecentMemoryUpdatesOptimistic`、`renderRecentMemoryUpdates`）同步更新
- CSS：新增 `.mc-recent-header` / `.mc-recent-badges` / `.mc-recent-badge--type` / `.mc-recent-badge--status` / `.mc-recent-title` / `.mc-recent-summary` / `.mc-recent-details` / `.mc-recent-detail-label` / `.mc-recent-detail-value`；移除旧 meta 行相关类

### 无数据变更
无 schema 变更，无 Edge Function 部署，无运行时逻辑修改。

---

## legacy memory UI rename / memory docs sync

**Date:** 2026-06-09
**Commits:** `dbee7f6`, `83ee23c`
**Functions deployed:** none
**Migration:** none

### What shipped

**UI 文案重命名（`index.html`, `app.js`）**
- 弹窗标题、菜单项、Memory Center 按钮："旧记忆匣" → "记忆管理（高级）"
- memories 区块标题："记忆" → "正式记忆（会参与回复）"，补充说明文字
- memory_buckets 区块标题："沉淀记忆（旧系统 · 不参与回复）" → "旧沉淀记忆（旧系统 · 默认不参与回复）"，补充说明文字
- Memory Center legacy block 描述更新：明确 memories 表经 L1/L2 注入，memory_buckets 仅用于管理和迁移
- 错误提示文案、删除/编辑弹窗标题同步更新

**README 文案更新**
- 架构图注释、章节标题、Memory Center UI 说明、环境变量注释、SQL 文件说明全部对齐新术语

**docs 同步**
- `memory-index.md`：Provider 状态表更新为 7 个 provider（含 auto_memory_vault、conversation_history 等）；遗留系统状态描述修正
- `memory-architecture-review.md`：架构表更新；ombre_vault → auto_memory_vault（已上线）；openai_export → openai_archive；停用系统表修正；变更记录补充
- `NEXT_TASK_MEMORY_CACHE.md`：修正 memory_buckets 仍在读取的过时描述

### 无数据变更
无 schema 变更，无 Edge Function 部署，无运行时逻辑修改。

---

## userMessageId evidence chain / fuka-unified-v8

**Date:** 2026-06-08
**Commit:** `09b2c50`
**Functions deployed:** `chat` (v8, redeployed)
**Migration:** `20260608000000_add_source_msg_ids_to_persona_tables.sql`

### What shipped

**userMessageId evidence chain**
- `app.js`: `callChatAPI()` extracts the DB id of the last user message and sends it as `userMessageId` in the request payload
- `index.ts`: `ChatRequest` type accepts `userMessageId?: number | null`; forwarded to `afterChat()`
- `personality_system.ts`: `AfterChatParams`, `upsertL2Feature()`, `writeExtractionLog()` all carry `userMessageId`
  - Written to `persona_layer2_dynamic_features.source_msg_ids` (bigint[])
  - Written to `persona_extraction_log.source_msg_id` (bigint)
- Each extracted personality feature is now traceable back to the message that produced it

**Migration**
- `memories.source_msg_ids bigint[]` — for future hand-maintained tooling
- `persona_layer1_contexts.source_msg_ids bigint[]` — for future hand-maintained tooling
- `persona_layer2_dynamic_features.source_msg_ids bigint[]` — written by afterChat pipeline
- `persona_extraction_log.source_msg_id bigint` — written per afterChat invocation

**Chat history pagination** (app.js, committed earlier)
- `reloadHistory()` now fetches newest 20 messages on conversation open (was `.limit(500)`)
- New `loadOlderMessages()`: cursor-based fetch via `.lt("created_at", oldestLoadedMessageCreatedAt)`
- Scroll trigger at `scrollTop <= 40` — prepend older messages with scroll position preserved
- State vars: `HISTORY_PAGE_SIZE = 20`, `historyHasMore`, `historyLoadingOlder`, `oldestLoadedMessageCreatedAt`

### Smoke tests
3/3 passed post-deploy.

---

## ombre-brain-phase-c / fuka-unified-v8

**Date:** 2026-06-07
**Commit:** `6ca2379`
**Functions deployed:** `chat` (v8), `personality-decay` (decay-v1)
**Migration:** `20260607200000_personality_system.sql`

### What shipped

**Topic Routing + Project Lock**
- `detectRoute()` classifies messages into 7 routes: `project_work / ai_nostalgia / care_low_energy / historical_roleplay / intimacy / meta_complaint / casual`
- Project memory gate: only opens when `topicRoute === "project_work"` AND `projectSilencedTtl === 0`
- Conversation history filtered by route — coding content suppressed for non-project routes

**Chat Status V2**
- `callGeminiEmotion()` calls Gemini 1.5 Flash to score valence / arousal / connection from last 4 messages
- Result encoded as base64 UTF-8 JSON in `x-chat-status` response header
- 10-minute in-process cache keyed on message content hash

**Ombre Brain: 3-layer personality system**
- L0: Hardcoded identity core in system prompt (unchanged)
- L1: Human-maintained contexts from `persona_layer1_contexts` — always injected
- L2: LLM auto-extracted dynamic features from `persona_layer2_dynamic_features` — injected if `calculated_score > 0.3`
- `afterChat()` fire-and-forget hook: drains background SSE branch → extracts features → confidence gate ≥ 0.7 → upserts to DB → writes `persona_extraction_log`
- Conflict filter: L2 features matching control / therapist / detachment keywords are silently dropped (L0 always wins)

**`personality-decay` function** (decay-v1)
- Daily decay: `Score = Importance × (activation_count^0.3) × e^(-λ×days) × emotion_weight`
- λ = 0.05, archive threshold = 0.3, emotion_weight floor = 0.1
- Resolved features decay at 2× rate
- pg_cron schedule: deferred (run manually or configure when ready)

**Memory providers (all active)**
`persona_memories`, `mastodon_profile`, `mastodon_timeline`, `project_memory`, `openai_archive`, `conversation_history`, `personality_layers`

**Other fixes**
- `x-save-princess-function-version` header added to SSE streaming response path (was previously missing)
- 蘑菇 removed from identity_boundary human-user alias list
- `base64EncodeUtf8()` helper for CJK-safe header encoding

### Smoke tests
6/6 assertions passed. `persona_extraction_log` confirmed receiving new records post-deploy.

### Frozen
Memory / personality / routing layer is now frozen. No new features in these areas until further notice.

---

**Next phase:** P0 — 图片上传与识别体验
