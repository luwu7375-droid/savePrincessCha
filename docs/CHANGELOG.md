# Changelog

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
