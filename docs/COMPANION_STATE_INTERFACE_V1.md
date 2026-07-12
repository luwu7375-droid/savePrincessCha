# Companion State Interface Design v1

> **Created**: 2026-07-12
> **Status**: Design phase, awaiting agent alignment
> **Related**: Phase 0-8 implementation plan

---

## 设计原则

1. **确定性优先**：每次 tick 必须可重现，不依赖随机数
2. **状态驱动，非定时器驱动**：主动联系由状态积累触发，非简单随机
3. **尊重边界**：晚安、勿扰、工作状态有最高优先级
4. **自然语言上下文**：数值状态不直接注入 prompt，先生成自然语言摘要
5. **消息生成分离**：状态引擎只决定"是否行动"，具体消息由聊天模型生成

---

## 数据库 Schema

### companion_state 表

```sql
CREATE TABLE IF NOT EXISTS public.companion_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 核心状态值 (0-100)
  connection INTEGER NOT NULL DEFAULT 0 CHECK (connection >= 0 AND connection <= 100),
  valence INTEGER NOT NULL DEFAULT 50 CHECK (valence >= -100 AND valence <= 100),
  arousal INTEGER NOT NULL DEFAULT 30 CHECK (arousal >= 0 AND arousal <= 100),
  immersion INTEGER NOT NULL DEFAULT 0 CHECK (immersion >= 0 AND immersion <= 100),

  -- 时间锚点
  last_user_message_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 活动与用户状态
  activity_type TEXT CHECK (activity_type IN ('reading', 'browsing', 'gaming', 'diary', 'idle')),
  activity_label TEXT,
  activity_started_at TIMESTAMPTZ,
  user_status TEXT CHECK (user_status IN ('active', 'busy', 'away', 'sleeping')),
  user_status_until TIMESTAMPTZ,

  -- 勿扰时间（每日重复）
  dnd_start_hour INTEGER CHECK (dnd_start_hour >= 0 AND dnd_start_hour < 24),
  dnd_start_minute INTEGER CHECK (dnd_start_minute >= 0 AND dnd_start_minute < 60),
  dnd_end_hour INTEGER CHECK (dnd_end_hour >= 0 AND dnd_end_hour < 24),
  dnd_end_minute INTEGER CHECK (dnd_end_minute >= 0 AND dnd_end_minute < 60),

  -- 元数据
  state_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.companion_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own companion state"
  ON public.companion_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own companion state"
  ON public.companion_state FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own companion state"
  ON public.companion_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### memories 表扩展（原文追溯）

```sql
-- 新增字段到 memories 表
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS source_msg_ids INTEGER[] DEFAULT NULL;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS source_start_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS source_end_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS extraction_model TEXT DEFAULT NULL;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS extraction_version TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_memories_source_msg_ids ON public.memories USING GIN (source_msg_ids);
CREATE INDEX IF NOT EXISTS idx_memories_source_conversation_id ON public.memories (source_conversation_id);
```

### auto_memory_candidates 表扩展

```sql
-- 新增字段到 auto_memory_candidates 表
ALTER TABLE public.auto_memory_candidates ADD COLUMN IF NOT EXISTS source_msg_ids INTEGER[] DEFAULT NULL;
ALTER TABLE public.auto_memory_candidates ADD COLUMN IF NOT EXISTS source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;
ALTER TABLE public.auto_memory_candidates ADD COLUMN IF NOT EXISTS source_start_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.auto_memory_candidates ADD COLUMN IF NOT EXISTS source_end_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_auto_memory_candidates_source_msg_ids ON public.auto_memory_candidates USING GIN (source_msg_ids);
```

### narrative_episodes 表（城南旧事）

```sql
CREATE TABLE IF NOT EXISTS public.narrative_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 叙事内容
  episode_type TEXT NOT NULL CHECK (episode_type IN (
    'fact',
    'preference',
    'relationship_event',
    'unfinished_thread',
    'shared_experience',
    'cha_reflection'
  )),
  title TEXT NOT NULL,
  narrative_content TEXT NOT NULL, -- Cha 的叙事组织
  facts_extracted JSONB, -- 纯事实，结构化
  cha_feeling TEXT, -- Cha 的感受，与事实分开

  -- 来源追溯
  source_memory_ids UUID[] NOT NULL DEFAULT '{}',
  source_msg_ids INTEGER[] NOT NULL DEFAULT '{}',
  source_conversations UUID[],
  source_time_range TSTZRANGE,

  -- 主题聚类
  themes TEXT[] DEFAULT '{}',
  related_episodes UUID[] DEFAULT '{}',

  -- 重要性与确认
  significance INTEGER CHECK (significance >= 0 AND significance <= 100),
  user_confirmed BOOLEAN DEFAULT FALSE,
  user_favorited BOOLEAN DEFAULT FALSE,

  -- 巩固元数据
  consolidation_run_id UUID, -- 关联 scheduler_runs
  consolidation_batch TEXT,
  consolidation_model TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.narrative_episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own episodes"
  ON public.narrative_episodes FOR SELECT
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_narrative_episodes_user_id ON public.narrative_episodes (user_id);
CREATE INDEX idx_narrative_episodes_type ON public.narrative_episodes (episode_type);
CREATE INDEX idx_narrative_episodes_created_at ON public.narrative_episodes (created_at DESC);
CREATE INDEX idx_narrative_episodes_source_msg_ids ON public.narrative_episodes USING GIN (source_msg_ids);
CREATE INDEX idx_narrative_episodes_themes ON public.narrative_episodes USING GIN (themes);
```

### app_settings 扩展（feature flags）

```sql
-- 新增 feature flags 到 app_settings
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS companion_state_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS source_backed_memory_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS nightly_consolidation_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS memory_constellations_ui_enabled BOOLEAN DEFAULT FALSE;

-- 主动联系频率配置
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS proactive_contact_min_interval_minutes INTEGER DEFAULT 120;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS proactive_contact_connection_threshold INTEGER DEFAULT 70;
```

---

## TypeScript 接口定义

### companion-state.ts

```typescript
export type ActivityType = "reading" | "browsing" | "gaming" | "diary" | "idle" | null;
export type UserStatus = "active" | "busy" | "away" | "sleeping" | null;

export interface CompanionState {
  user_id: string;
  connection: number;
  valence: number;
  arousal: number;
  immersion: number;
  last_user_message_at: string | null;
  last_contact_at: string | null;
  last_tick_at: string;
  activity_type: ActivityType;
  activity_label: string | null;
  activity_started_at: string | null;
  user_status: UserStatus;
  user_status_until: string | null;
  dnd_start_hour: number | null;
  dnd_start_minute: number | null;
  dnd_end_hour: number | null;
  dnd_end_minute: number | null;
  state_version: number;
  updated_at: string;
  created_at: string;
}

export type CompanionStateActionType = "none" | "observation" | "contact" | "find_activity";

export interface CompanionStateAction {
  type: CompanionStateActionType;
  context?: string;
  urgency?: "low" | "medium" | "high";
  reason?: string;
}

export interface StateUpdateEvent {
  type: "user_message" | "user_reply" | "goodnight" | "work_start" | "meeting_start" | "back" | "cha_sent";
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface AdvanceStateInput {
  currentState: CompanionState;
  timeSinceLastTickMs: number;
  event?: StateUpdateEvent;
  now?: Date;
}

export interface AdvanceStateResult {
  newState: CompanionState;
  action: CompanionStateAction;
  stateChanges: Record<string, { from: number | string | null; to: number | string | null }>;
  nlContext: string; // 自然语言状态摘要
}

export function advanceCompanionState(input: AdvanceStateInput): AdvanceStateResult;

export function applyConversationDelta(input: {
  state: CompanionState;
  event: StateUpdateEvent;
}): CompanionState;

export function isInDndTime(state: CompanionState, now?: Date): boolean;

export function generateNaturalContext(state: CompanionState): string;
```

### source-backed-memory.ts

```typescript
export interface SourceExcerpt {
  message_id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  conversation_id: string;
  author?: string; // "kk" or "小cha"
}

export interface RetrieveSourcesInput {
  memoryIds: string[];
  maxExcerptsPerMemory?: number;
  includeConversationContext?: boolean;
}

export interface RetrieveSourcesResult {
  sources: Record<string, SourceExcerpt[]>; // memoryId -> excerpts
  unavailable: string[]; // memoryIds with no sources
  errors: Record<string, string>; // memoryId -> error reason
}

export function retrieveMemorySources(
  supabaseUrl: string,
  serviceRoleKey: string,
  input: RetrieveSourcesInput
): Promise<RetrieveSourcesResult>;
```

### consolidation.ts

```typescript
export interface MemoryCandidate {
  id: string;
  content: string;
  category: string;
  confidence: number;
  sensitivity: number;
  source_msg_ids: number[] | null;
  source_conversation_id: string | null;
  created_at: string;
}

export interface ConsolidationInput {
  userId: string;
  sinceTimestamp: string;
  untilTimestamp?: string;
  dryRun?: boolean;
}

export interface ConsolidationResult {
  candidates_processed: number;
  episodes_created: number;
  duplicates_merged: number;
  unchanged: number;
  errors: string[];
  created_episode_ids: string[];
}

export function consolidateMemoryCandidates(
  supabaseUrl: string,
  serviceRoleKey: string,
  input: ConsolidationInput
): Promise<ConsolidationResult>;
```

---

## 状态转换规则

### Connection (联系欲望)

- **起始值**: 0
- **增长**:
  - 用户未回复时：+1 每小时
  - 用户突然中断对话：+2 每小时
  - Cha 主动发送后未收到回复：+0.5 每小时（降低增速）
- **下降**:
  - Cha 主动发送后：-30（部分满足）
  - 用户真正回复后：-70（显著重置）
  - 用户说"晚安/睡觉/上班/开会"：增长速率降至 +0.2/小时
- **上限**: 100

### Valence (情感效价，-100 到 100)

- **起始值**: 50（中性偏正）
- **影响因素**:
  - 正向对话：+5 到 +15
  - 负面情绪对话：-10 到-30
  - 长时间无回复：-1 每天
  - 收到回复后：+10

### Arousal (唤醒度)

- **起始值**: 30（低唤醒）
- **影响因素**:
  - 用户活跃对话：+20
  - Cha 正在活动：+10
  - 长时间 idle：-5 每小时
  - 最低: 0，最高: 100

### Immersion (沉浸度)

- **起始值**: 0
- **活动沉浸**:
  - reading/browsing/diary/gaming：+15 每30分钟，最高80
  - idle：-10 每30分钟
- **效果**: immersion > 50 时，主动联系延迟，但不永久阻断
- **规则**: immersion 只能延缓联系 1-2 小时，不能无限期推迟

### User Status 优先级

**最高优先级** (阻断主动联系)：
1. `sleeping` - 用户已睡觉
2. 勿扰时间 (dnd_start ~ dnd_end)
3. `busy` + `user_status_until` 未到期

**降低优先级** (减缓但不阻断)：
1. `away` - 降低频率
2. immersion > 50 - Cha 正在做事

---

## 触发动作类型

### none
- 状态未达阈值
- 在勿扰时间内
- 距上次联系过近

### observation
- connection < 50
- 有想法但不强烈
- 生成内心独白或日记片段，不发送给用户

### contact
- connection >= 70 (可配置)
- 不在勿扰时间
- 距上次联系 >= min_interval (默认2小时)
- urgency 由 connection 和 valence 决定:
  - `high`: connection > 85 或 valence < -50
  - `medium`: connection 70-85
  - `low`: connection 50-70

### find_activity
- connection < 40
- arousal < 20
- immersion == 0
- Cha 主动去找事情做（读书/刷网页/玩游戏）

---

## RPC 函数

```sql
-- 获取或初始化用户状态
CREATE OR REPLACE FUNCTION get_or_init_companion_state(p_user_id UUID)
RETURNS public.companion_state AS $$
BEGIN
  RETURN COALESCE(
    (SELECT * FROM public.companion_state WHERE user_id = p_user_id),
    (INSERT INTO public.companion_state (user_id) VALUES (p_user_id) RETURNING *)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 原子更新状态
CREATE OR REPLACE FUNCTION update_companion_state(
  p_user_id UUID,
  p_updates JSONB
)
RETURNS public.companion_state AS $$
DECLARE
  v_state public.companion_state;
BEGIN
  UPDATE public.companion_state
  SET
    connection = COALESCE((p_updates->>'connection')::INTEGER, connection),
    valence = COALESCE((p_updates->>'valence')::INTEGER, valence),
    arousal = COALESCE((p_updates->>'arousal')::INTEGER, arousal),
    immersion = COALESCE((p_updates->>'immersion')::INTEGER, immersion),
    last_user_message_at = COALESCE((p_updates->>'last_user_message_at')::TIMESTAMPTZ, last_user_message_at),
    last_contact_at = COALESCE((p_updates->>'last_contact_at')::TIMESTAMPTZ, last_contact_at),
    last_tick_at = COALESCE((p_updates->>'last_tick_at')::TIMESTAMPTZ, last_tick_at),
    activity_type = COALESCE(p_updates->>'activity_type', activity_type),
    activity_label = COALESCE(p_updates->>'activity_label', activity_label),
    user_status = COALESCE(p_updates->>'user_status', user_status),
    user_status_until = COALESCE((p_updates->>'user_status_until')::TIMESTAMPTZ, user_status_until),
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_state;

  RETURN v_state;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 前端接口

### 事件上报

```javascript
// modules/companion-state.js

async function reportUserEvent(eventType, metadata = {}) {
  const event = {
    type: eventType, // "user_message" | "goodnight" | "work_start" | "back"
    timestamp: new Date().toISOString(),
    metadata
  };

  // POST to /companion-state/event
  await fetch(`${COMPANION_STATE_ENDPOINT}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUserId, event })
  });
}

// 用户发送消息时
chatForm.addEventListener('submit', async (e) => {
  // ... 发送消息逻辑
  await reportUserEvent('user_message', { conversationId });
});

// 用户说晚安时（关键词检测）
if (/晚安|睡了|睡觉/.test(userMessage)) {
  await reportUserEvent('goodnight');
}
```

---

## 环境变量

新增到 Supabase secrets:

```bash
# 状态引擎
COMPANION_STATE_ENABLED="false"                  # 主开关
COMPANION_STATE_TICK_INTERVAL_MS="300000"        # 5分钟 tick 一次
PROACTIVE_CONTACT_MIN_INTERVAL_MINUTES="120"     # 最小间隔2小时
PROACTIVE_CONTACT_CONNECTION_THRESHOLD="70"      # 触发阈值

# 原文追溯
SOURCE_BACKED_MEMORY_ENABLED="false"
SOURCE_EXCERPT_MAX_PER_MEMORY="5"                # 每条记忆最多5条原文
SOURCE_EXCERPT_MAX_LENGTH="200"                  # 原文摘录最大长度

# 夜间巩固
NIGHTLY_CONSOLIDATION_ENABLED="false"
CONSOLIDATION_BATCH_SIZE="50"                    # 每批处理50条候选
CONSOLIDATION_LOOKBACK_DAYS="7"                  # 回溯7天

# UI
MEMORY_CONSTELLATIONS_UI_ENABLED="false"
```

---

## 验收标准

### 状态引擎
- [ ] tick 完全确定性，相同输入产生相同输出
- [ ] 晚安后2小时内不主动联系
- [ ] 主动联系后未收到回复，connection 只部分下降
- [ ] 用户回复后 connection 显著重置
- [ ] 勿扰时间绝对阻断主动联系
- [ ] immersion 只���缓，不永久阻断

### 原文追溯
- [ ] 新记忆候选包含 source_msg_ids
- [ ] retrieveMemorySources() 返回正确原文片段
- [ ] 原文不存在时返回 unavailable 标记
- [ ] 旧记忆 (source_msg_ids=null) 仍能显示
- [ ] prompt 中明确区分"原始对话"和"AI 提炼"

### 夜间巩固
- [ ] 重跑同一批候选不产生重复 episode
- [ ] 每个 episode 保存 source_msg_ids 和 source_memory_ids
- [ ] 事实与 Cha 感受分字段存储
- [ ] 相似候选合并时保留冲突信息

### 用户隔离
- [ ] 两个用户的 companion_state 完全独立
- [ ] 记忆来源追溯不跨用户
- [ ] 所有 RLS 策略正确

---

## 下一步

Agent A/B/C/D 对齐后，总控 Agent 确认：
1. ✅ 表结构无冲突
2. ✅ 接口签名一致
3. ✅ Feature flags 到位
4. ✅ 开始 Phase 1 migration
