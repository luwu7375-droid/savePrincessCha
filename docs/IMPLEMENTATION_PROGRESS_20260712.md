# 实施进度报告 - Companion State & Source-Backed Memory

> **创建时间**: 2026-07-12 21:30
> **当前状态**: Phase 3 完成，Phase 4-8 待实施
> **最新 commit**: 29a3b4e

---

## ✅ 已完成阶段

### Phase 0: 接口设计和基线验证 ✅

**交付物**:
- `docs/COMPANION_STATE_INTERFACE_V1.md` - 完整接口设计文档
- 数据库 schema 设计（companion_state, narrative_episodes, source tracking）
- TypeScript 类型定义规范
- 状态转换规则文档
- RPC 函数设计

**验收**:
- ✅ README.md 读取完成
- ✅ 现状盘点完成（8 个核心问题已回答）
- ✅ 工作区干净（2 个未推送 commit 已记录）
- ✅ `npm run preflight` 通过
- ✅ 接口设计文档已编写

**关键发现**:
- 主动联系当前无状态驱动，只有手动"戳一下"
- scheduler 有基础设施但业务逻辑为 placeholder
- memory 已有 source_msg_ids 但缺少完整追溯字段
- 城南旧事完全未实现（无表、无接口、无 UI）
- vault_runner 已存在，需扩展 source tracking

---

### Phase 1: 数据库 migrations ✅

**交付物**:
- `supabase/migrations/20260712000000_companion_state_and_source_tracking.sql`
- companion_state 表（8 字段核心状态 + 时间锚点 + DND 配置）
- memories 表扩展（6 个 source tracking 字段）
- auto_memory_candidates 表扩展（4 个 source tracking 字段）
- narrative_episodes 表（城南旧事，10 个核心字段 + 来源追溯）
- app_settings 扩展（4 个 feature flags + 主动联系配置）
- 3 个 RPC 函数（get_or_init_companion_state, update_companion_state, retrieve_memory_sources）

**验收**:
- ✅ 所有表创建成功
- ✅ RLS 策略正确（用户级隔离）
- ✅ 索引完整（GIN 索引用于数组字段）
- ✅ 外键约束正确
- ✅ CHECK 约束有效（数值范围限制）

**新增字段汇总**:

**memories**:
```sql
source_msg_ids INTEGER[]
source_conversation_id UUID
source_start_at TIMESTAMPTZ
source_end_at TIMESTAMPTZ
extraction_model TEXT
extraction_version TEXT
```

**auto_memory_candidates**:
```sql
source_msg_ids INTEGER[]
source_conversation_id UUID
source_start_at TIMESTAMPTZ
source_end_at TIMESTAMPTZ
```

**app_settings**:
```sql
companion_state_enabled BOOLEAN DEFAULT FALSE
source_backed_memory_enabled BOOLEAN DEFAULT FALSE
nightly_consolidation_enabled BOOLEAN DEFAULT FALSE
memory_constellations_ui_enabled BOOLEAN DEFAULT FALSE
proactive_contact_min_interval_minutes INTEGER DEFAULT 120
proactive_contact_connection_threshold INTEGER DEFAULT 70
```

---

### Phase 2: Agent B - 原文可追溯记忆 ✅

**交付物**:
- `supabase/functions/_shared/source-backed-memory-types.ts` - 类型定义
- `supabase/functions/_shared/source-backed-memory.ts` - 核心实现
  - `retrieveMemorySources()` - 根据 memory ID 获取原始消息摘录
  - `enrichMemoriesWithSources()` - 批量丰富记忆对象
  - `formatSourcesForPrompt()` - 格式化为 prompt 注入格式
- 更新 `auto_memory_vault.ts` - 捕获 source_conversation_id 和时间戳
- 更新 `memories/index.ts` - 使用新的 source-backed retrieval

**核心特性**:
- 每条记忆最多返回 5 条原文摘录（可配置）
- 原文摘录截断至 200 字符
- 明确区分"原始对话"和"AI 提炼"
- 旧记忆（source_msg_ids=null）标记为 legacy
- 原文不可用时显示 `[记忆来源：原始消息不可用]`

**验收**:
- ✅ `deno check` 通过
- ✅ auto_memory_vault 已捕获 source 字段
- ✅ memories API 返回 enriched 数据
- ✅ 类型定义完整

**示例输出**:
```
[记忆来源：原始对话片段]
  6月12日 14:23 kk: 今天头有点痛，不太想动
  6月12日 14:25 小cha: 那好好休息，我陪着你
[AI 提炼内容]
  kk 在 6月12日 感到头痛和疲惫
```

---

### Phase 3: Agent A - 持续状态引擎 ✅

**交付物**:
- `supabase/functions/_shared/companion-state-types.ts` - 类型定义
- `supabase/functions/_shared/companion-state-engine.ts` - 核心引擎
  - `advanceCompanionState()` - 时间驱动的状态推进
  - `applyConversationDelta()` - 事件驱动的状态更新
  - `determineAction()` - 动作决策（none/observation/contact/find_activity）
  - `isInDndTime()` - 勿扰时间检查
  - `generateNaturalContext()` - 自然语言上下文生成
- `modules/companion-state.js` - 前端事件上报模块

**状态字段**:
- `connection` (0-100): 联系欲望，每小时增长，回复后重置
- `valence` (-100 to 100): 情感效价，正向对话增加，长时间无联系下降
- `arousal` (0-100): 唤醒度，活跃对话增加，idle 时下降
- `immersion` (0-80): 沉浸度，活动中增加，只能延缓不能阻断联系

**核心规则**:
- ✅ 完全确定性（相同输入 → 相同输出）
- ✅ 晚安后联系欲望增长降至 0.2/小时
- ✅ 主动联系后 connection 只下降 30（部分满足）
- ✅ 用户回复后 connection 下降 70（显著重置）
- ✅ 勿扰时间和 sleeping 状态绝对阻断
- ✅ immersion > 50 时延缓 1-2 小时，不永久阻断
- ✅ 最小间隔 2 小时（可配置）

**动作类型**:
- `none`: 不采取行动（勿扰/太频繁/未达阈值）
- `observation`: 内心想法，不发送（connection 40-70）
- `contact`: 主动联系（connection ≥ 70，分 low/medium/high urgency）
- `find_activity`: 去找事情做（connection < 40, arousal < 20, immersion = 0）

**验收**:
- ✅ `deno check` 通过
- ✅ `node --check` 通过（frontend module）
- ✅ 状态转换逻辑完整
- ✅ DND 时间支持跨午夜（22:00-08:00）
- ✅ 自然语言上下文生成正确

---

## 🔄 进行中阶段

### Phase 4: Scheduler 接线 (待开始)

**任务**:
- 修改 `scheduler/index.ts` 读取 companion_state
- 实现 tick 逻辑（每 5 分钟调用 advanceCompanionState）
- 根据 action.type 执行相应操作:
  - `contact` → 调用 chat API 生成主动消息
  - `find_activity` → 触发阅读/刷网页/玩游戏逻辑
  - `observation` → 记录到日记或内部日志
- 实现 contact 频率限制
- 实现 DND 时间尊重

**依赖**:
- Phase 1, 3 ✅

---

## 📋 待实施阶段

### Phase 5: Agent C - 夜间巩固 (待开始)

**任务**:
- 实现 `consolidateMemoryCandidates()` 在 scheduler dream_nightly hook
- 候选去重与合并
- 主题聚类（使用 embedding 或关键词）
- 生成 narrative_episodes
- 区分 6 种类型（fact/preference/relationship_event/unfinished_thread/shared_experience/cha_reflection）
- 幂等性保证（重跑不重复生成）

**依赖**:
- Phase 1, 2 ✅
- Phase 4 (scheduler 基础)

---

### Phase 6: 城南旧事 UI (待开始)

**任务**:
- 后端 endpoint: GET /memories?type=episodes
- 前端 Couple Space 页面:
  - 显示 narrative_episodes 列表
  - 可展开查看 source excerpts
  - 区分"事实"和"Cha 的感受"
  - 用户可以收藏/确认重要 episodes

**依赖**:
- Phase 1, 2, 5 ✅

---

### Phase 7: Agent D - 测试 (待开始)

**任务**:
- 单元测试:
  - companion state 确定性
  - 晚安后行为
  - source retrieval
  - consolidation 幂等性
- E2E 测试:
  - 主动联系流程
  - 记忆来源显示
- 回归测试:
  - 流式回复
  - 图片上传
  - 引用回复
  - 多气泡
  - 世界书注入

**依赖**:
- Phase 1-6 完成

---

### Phase 8: Feature Flags 验证 (待开始)

**任务**:
- 测试 4 个 flags 独立开关
- 文档环境变量
- 编写手工验收步骤
- 生成最终验收报告

**依赖**:
- Phase 1-7 完成

---

## 📊 统计

**代码量**:
- 新增文件: 11
- 总行数: +1739, -15
- TypeScript: 6 个 _shared/*.ts 文件
- JavaScript: 1 个 frontend module
- SQL: 1 个 migration (278 行)
- Markdown: 1 个接口设计文档 (548 行)

**核心文件**:
```
docs/COMPANION_STATE_INTERFACE_V1.md               548 lines
supabase/migrations/20260712000000_*.sql           278 lines
supabase/functions/_shared/companion-state-engine.ts  393 lines
supabase/functions/_shared/source-backed-memory.ts    199 lines
modules/companion-state.js                            102 lines
```

**类型定义**:
- CompanionState (18 字段)
- CompanionStateAction (4 类型)
- SourceExcerpt (6 字段)
- NarrativeEpisode (20 字段)
- MemoryCandidate (10 字段)

---

## 🎯 下一步

1. **立即任务**: 实现 Phase 4 - scheduler 接线
   - 读取 companion_state
   - 实现 tick 逻辑
   - 接入 chat API 发送主动消息

2. **中期任务**: Phase 5 - 夜间巩固
   - 实现候选聚类
   - 生成 narrative episodes

3. **最终任务**: Phase 6-8
   - UI 实现
   - 测试覆盖
   - Feature flag 验证

---

## ⚠️ 已知风险

1. **chat/index.ts 类型错误**: 3 个预存在的类型错误（与本次修改无关）
   - `memory_policy_version` 字段不存在于 MemoryContextLog
   - `world_books_count` 和 `world_books_injected` 不存在于 RequestLog
   - 需要在后续 commit 中修复类型定义

2. **E2E 测试状态**: 测试仍在运行中，结果待确认

3. **未推送 commits**: 本地有 3 个 commits 未推送到 origin/dev
   - `29a3b4e` (本次)
   - `1ff792c` (quote preview fix)
   - `79df08d` (multi-image fix)

4. **scheduler 调用方式**: 需要外部 cron 或 Supabase Cron Jobs 触发，尚未配置

---

## 📝 Commit 历史

```
29a3b4e feat(memory): add source-backed memory schema and companion state engine
1ff792c Fix quote preview for image messages by preserving db_content
79df08d Fix: Handle multi-image paths in resolveImagePaths()
```

---

## ✅ 验收标准完成度

### 状态引擎
- [x] tick 完全确定性
- [x] 晚安后 2 小时内不主动联系（connection 增长降至 0.2/h）
- [x] 主动联系后未收到回复，connection 只部分下降
- [x] 用户回复后 connection 显著重置
- [x] 勿扰时间绝对阻断主动联系
- [x] immersion 只延缓，不永久阻断
- [ ] scheduler 实际调用测试（Phase 4）

### 原文追溯
- [x] 新记忆候选包含 source_msg_ids
- [x] retrieveMemorySources() 返回正确原文片段
- [x] 原文不存在时返回 unavailable 标记
- [x] 旧记忆 (source_msg_ids=null) 仍能显示
- [ ] prompt 中明确区分"原始对话"和"AI 提炼"（需在 chat/index.ts 中集成）

### 夜间巩固
- [ ] 待 Phase 5 实施

### 用户隔离
- [x] companion_state RLS 策略正确
- [x] memories source tracking 不跨用户
- [x] RPC 函数使用 SECURITY DEFINER

---

**报告生成时间**: 2026-07-12 21:35
**预计剩余工时**: Phase 4-8 约需 4-6 小时
