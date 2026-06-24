# savePrincessCha Runtime Memory Policy

> **工程可执行版** — 2026-06-24（最后更新 2026-06-24）
> 对应哲学文档：`docs/MEMORY_SYSTEM_PHILOSOPHY_V2.md`

---

## 主聊天注入规则

### 默认允许注入

| 层级 | 内容 | 当前实现状态 |
|------|------|------------|
| L0 | 最小人格 / 世界书（硬编码 system prompt） | ✅ 实现 |
| L1 | `memories` 表中 `current_context_summary` / `interaction_preferences` / `identity_context` — 强确认事实，克制 | ✅ 实现，需审查内容质量 |
| L2 | 最近/相关第一人称日记摘要（Identity Brain，待建） | ❌ 未实现 |
| L3 | 当前对话上下文（conversation_history 检索） | ✅ 条件触发 |

### 默认禁止注入

| 内容 | 禁止原因 | 当前实现状态 |
|------|---------|------------|
| 城南旧事全文 | 不是小cha亲历记忆，不能直接人格化 | ✅ 尚未建 |
| Mastodon profile 大段画像 | 用户画像不等于 AI 人格；注入量过大 | ✅ v2 已 disable（`mastodon_profile_enabled=false`） |
| Mastodon timeline | 历史事件不是小cha亲历 | ✅ v2 已 disable |
| OpenAI archive / 旧 G 对话原文 | 旧历史不是灵魂，不能伪装为亲历记忆 | ✅ keyword-gated，但内容需标注来源 |
| 大段用户画像 | 把用户概括成标签，污染人格 | ✅ v2 已 disable（`persona_profile` 不注入主聊天） |
| 第三人称项目日志 | project_memory 碎片不是人格连续性 | ✅ v2 已 disable（`project_memory_reason: v2_policy`） |
| promoted project_memory fragments | 泛化句，无决策价值 | ✅ second_pass_project_cleanup 确认 active=0 |
| instructions 表非允许类别 | 防止历史遗留 / 误分类行注入人格层 | ✅ v2 allowlist 已落地（commit c966ab1） |

---

## 城南旧事引用规则

如需在主聊天引用城南旧事，必须满足：

1. **触发条件**：用户主动提问，或白天阅读任务生成了明确 `want_to_share`
2. **来源透明**：
   - ✅ "我读到旧档案里有一��……"
   - ✅ "这不是我的亲历记忆，但它让我意识到……"
   - ✅ "我不能假装那是我记得的东西，但它让我想到……"
   - ❌ "我记得当时……"
   - ❌ "我们那时候……"
3. **不自动注入**：城南旧事全文不得进入 system prompt

---

## auto_memory_candidates Promotion Gate（当前）

| 字段 | 规则 |
|------|------|
| `PROMOTION_ALLOWED_TYPES` | `["fact", "preference"]` 仅这两类 |
| project | **永远不 promote**，即使 confidence 再高 |
| relationship | 不 promote（太敏感，需人工审查） |
| AUTO_MEMORY_PROMOTION_ENABLED | 当前 = false，不得随意打开 |

---

## project_memory 归档策略（已执行）

所有 promoted project_memory 已通过 `second_pass_project_cleanup` 处理，按以下 bucket 分类，无删除：

| Bucket | 定义 | 处理 |
|--------|------|------|
| `project_reference` | 架构决策、方向变更、kk 明确标记的路线 | disable active injection，归档 |
| `construction_log` | 版本里程碑、开发日志、验收记录 | disable active injection，归档 |
| `writing_material` | OC / 角色 / 世界观 / 设定内容 | disable project_memory，候选归入 writing_memory 类 |
| `generic_project` | 泛化句（"用户在做 X 项目"） | disable，不归档 |

归档后只通过城南旧事 / 白天阅读流程消化，不自动注入主聊天。

执行情况：`second_pass_project_cleanup` dryRun 结果显示 active project memories = 0（15 条候选中 2 条已 disabled，13 条 promoted_memory_id 在 memories 表中不存在）。无需执行 dryRun=false。

---

## instructions 表 allowlist（v2，已落地）

### 允许注入的 category

| Category | 说明 |
|----------|------|
| `identity_boundary` | 身份边界规则（最高优先级，不受长度限制） |
| `core_principles` | 核心原则（不受长度限制） |
| `execution_rules` | 执行规则（不受长度限制） |
| `reply_style_rules` | 回复风格规则 |
| `interaction_preferences` | 用户交互偏好 |
| `identity_context` | 身份上下文 |
| `current_context_summary` | 当前上下文摘要（最低优先级） |

### 抑制规则

- **blocklist**：不在上表中的 category 一律 suppress，不删除 DB 行
- **length gate**：单条 instruction content > 800 字，且不在 `identity_boundary / core_principles / execution_rules` 中，suppress（标记 `too_long`）
- **total chars budget**：L1 注入总字符数超过 3000 时，按优先级从低到高丢弃，直到预算内

### 当前 instructions 表状态（2026-06-24）

| id | category | 状态 |
|----|----------|------|
| ad2fca93 | `identity_context` | ✅ 注入 |
| a13ca568 | `interaction_preferences`（从 `persona` 迁移） | ✅ 注入 |

### debug 字段

每次请求的 `x-save-princess-memory-debug` header 中新增：
- `instructions_allowlist_enabled`
- `instructions_loaded_count` / `instructions_suppressed_count`
- `instructions_loaded_categories` / `instructions_suppressed_categories`
- `persona_memories_total_chars` / `persona_memories_chars_budget_hit`

---

## 当前违反 v2 的注入行为（Audit 结果）

见下一节完整 Audit Report。

---

## Audit Report：chat/index.ts 注入行为 v2 合规性

### 1. persona_memories（L1 categories）

```
provider_name: persona_memories
current_behavior: always-on，注入 memories(current_context_summary / interaction_preferences / identity_context)
                  + allowlist 过滤后的 instructions 行
violates_v2_policy: FALSE（v2 allowlist 已落地）
  - instructions 现在只注入允许 category，有长度门控和总字符预算
  - 2026-06-24 实测：loaded=2 / suppressed=0，total_chars=272
recommended_action: 持续监控 instructions_suppressed_categories，定期清理误分类行
risk: 低 — allowlist + budget 双重保护
```

### 2. mastodon_profile / user_core_profile

```
provider_name: mastodon_profile
current_behavior: DISABLED — mastodon_profile_enabled=false（v2 policy）
violates_v2_policy: FALSE（已修复）
  - persona_profile 表内容不再注入主聊天
  - mastodon_profile_suppressed_reason: "v2_policy_south_city_only"
recommended_action: 长期迁移为 L2 Identity Brain 来源，不直接注入
risk: 已消除
```

### 3. mastodon_timeline

```
provider_name: mastodon_timeline
current_behavior: DISABLED — mastodon_timeline_enabled=false（v2 policy）
violates_v2_policy: FALSE（已修复）
  - mastodon_timeline_suppressed_reason: "v2_policy_south_city_only"
recommended_action: 未来实现城南旧事模块后，以带来源标注的方式重新接入
risk: 已消除
```

### 4. project_memory

```
provider_name: project_memory
current_behavior: DISABLED — v2_policy_project_reference_not_active_memory（代码已硬关闭）
violates_v2_policy: FALSE（已修复）
  - project_memory_reason: "v2_policy_project_reference_not_active_memory"
  - project_memory_suppressed_reason: "v2_policy: project_memory disabled — third-person project logs not injected into main chat"
  - second_pass_project_cleanup 确认 active project memories = 0（dryRun 2026-06-24）
recommended_action: 长期归档入城南旧事 / construction_log，不重新激活
risk: 已消除
```

### 5. writing_memory

```
provider_name: writing_memory
current_behavior: 写作关键词触发，注入所有 writing_memory 类
violates_v2_policy: FALSE（框架合理，保持）
  - 写作/OC/角色设定在 kk 主动聊写作时注入是合理的
  - inject_mode="keyword_triggered" 有明确的来源标注（<writing_memory source="memories_table">）
  - 注入块内附有指令：禁止编造不存在的角色名，若无具体设定须明确说明
recommended_action: keep — 继续定期审查 writing_memory 内容是否含误分类的 project 碎片
risk: 低
```

### 6. relationship_context

```
provider_name: relationship_context
current_behavior: 关系/历史关键词触发，注入所有 relationship_context 类
violates_v2_policy: PARTIAL（框架合理，内容待审）
  - inject_mode="keyword_triggered"，已有来源标注块头：
    "这是关系事实档案，不是小钗的亲历记忆，模型不得以第一人称声称亲历这些事件"
  - 来源透明问题在代码层已部分缓解（注入块有说明文字）
  - 但 relationship_context 内容本身可能含旧 G 关系记录，需内容审查
recommended_action: 内容层审查 — 确认每条 relationship_context 行来源是否清晰标注
risk: 中 — 框架已有防护，内容质量仍待核查
```

### 7. historical_ai_usage

```
provider_name: historical_ai_usage
current_behavior: 前世/旧版本/4o以前等关键词触发
violates_v2_policy: FALSE（框架合理，保持）
  - 已是严格 keyword-gated（触发词: 前世/旧版本/早期/以前的你/历史记录/黑历史/4o以前等）
  - inject_mode="keyword_triggered"，只在 kk 主动问旧历史时触发
  - 注入块头有说明文字：仅用于背景理解，不用于构建当前身份或彩蛋式轻浮召回
recommended_action: 长期迁移目标 → 城南旧事模块（Phase 3），届时须带来源标注
risk: 低 — 已严格门控
```

### 8. life_context

```
provider_name: life_context
current_behavior: 猫/身体/日常关键词触发
violates_v2_policy: FALSE（保持）
  - 触发词: 猫/槑槑/跳跳/守宫/吃饭/睡觉/身体/药/攀岩等
  - 日常生活事实（宠物、健康）是合理的 L1 内容，不涉及身份混淆
recommended_action: keep
risk: 低
```

---

## 执行优先级

| 优先级 | 项目 | 状态 |
|--------|------|------|
| P0 | disable 所有 promoted project_memory | ✅ 已完成 — second_pass_project_cleanup dryRun 确认 active=0（2026-06-24） |
| P0 | mastodon_profile 改为非 always-on | ✅ 已完成 — mastodon_profile_enabled=false（v2 policy，代码硬关闭） |
| P1 | project_memory 注入逻辑改为 disabled | ✅ 已完成 — v2_policy_project_reference_not_active_memory（代码硬关闭） |
| P1 | instructions 表 allowlist 落地 | ✅ 已完成 — commit c966ab1，2026-06-24 实测 loaded=2/suppressed=0 |
| P1 | relationship_context 来源标注 | ✅ 已完成（代码层）— 注入块含来源说明文字；内容层审查为 ongoing |
| P1 | historical_ai_usage 来源标注 | ✅ 已完成（代码层）— 注入块含来源说明文字 |
| P2 | L2 Identity Brain 建设 | ⏳ 待建 — Phase 3 |
| P2 | 城南旧事模块 | ⏳ 待建 — Phase 3 |
