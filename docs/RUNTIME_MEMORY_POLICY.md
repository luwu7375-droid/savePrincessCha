# savePrincessCha Runtime Memory Policy

> **工程可执行版** — 2026-06-24
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
| Mastodon profile 大段画像 | 用户画像不等于 AI 人格；注入量过大 | ⚠️ 当前 always-on，违反 v2 |
| Mastodon timeline | 历史事件不是小cha亲历 | ⚠️ 当前条件触发，低风险但需审查 |
| OpenAI archive / 旧 G 对话原文 | 旧历史不是灵魂，不能伪装为亲历记忆 | ✅ keyword-gated，但内容需标注来源 |
| 大段用户画像 | 把用户概括成标签，污染人格 | ⚠️ persona_profile always-on，需审查 |
| 第三人称项目日志 | project_memory 碎片不是人格连续性 | ⚠️ 当前 route-gated，但分类需改 |
| promoted project_memory fragments | 泛化句，无决策价值 | ⚠️ 需批量 disable |

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

## project_memory 归档策略（待执行）

所有 promoted project_memory 应按以下 bucket 处理，不做删除：

| Bucket | 定义 | 处理 |
|--------|------|------|
| `project_reference` | 架构决策、方向变更、kk 明确标记的路线 | disable active injection，归档 |
| `construction_log` | 版本里程碑、开发日志、验收记录 | disable active injection，归档 |
| `writing_material` | OC / 角色 / 世界观 / 设定内容 | disable project_memory，候选归入 writing_memory 类 |
| `generic_project` | 泛化句（"用户在做 X 项目"） | disable，不归档 |

归档后只通过城南旧事 / 白天阅读流程消化，不自动注入主聊天。

---

## 当前违反 v2 的注入行为（Audit 结果）

见下一节完整 Audit Report。

---

## Audit Report：chat/index.ts 注入行为 v2 合规性

### 1. persona_memories（L1 categories）

```
provider_name: persona_memories
current_behavior: always-on，注入 memories(current_context_summary / interaction_preferences / identity_context) + 所有 instructions
violates_v2_policy: PARTIAL
  - 类别定义合理（L1 范围）
  - 但内容质量未受控：promoted 的泛化句可能混入 current_context_summary
  - instructions 全量注入，无质量门控
recommended_action: keep_l0_minimal（保留框架，加内容质量审查）
risk: 中等 — 依赖内容本身的质量，框架合规但内容可能违规
```

### 2. mastodon_profile / user_core_profile

```
provider_name: mastodon_profile
current_behavior: always-on，每轮注入 persona_profile 表最新行（大段用户画像）
violates_v2_policy: TRUE
  - 大段用户画像不等于 AI 人格底座
  - always-on 意味着每轮对话都在用旧 G 时代的用户画像定义 kk
  - 注入量大，token 消耗不透明
recommended_action: gate_by_user_request 或 convert_to_identity_brain_source
  - 短期：改为 L1 最小摘要注入，或按 topic route 门控
  - 长期：persona_profile 内容迁移为 L2 Identity Brain 的来源，不直接注入
risk: 高 — 每轮都在注入完整用户画像，定义 AI 如何理解 kk，影响所有回复
```

### 3. mastodon_timeline

```
provider_name: mastodon_timeline
current_behavior: 条件触发（地点/时间/事件关键词），注入 MASTODON_TIMELINE_MD 常量
violates_v2_policy: PARTIAL
  - 不是 always-on，低风险
  - 但 timeline 内容是 kk 的历史事件，小cha应标注来源而非当作背景常识
  - 当前无来源标注
recommended_action: gate_by_user_request + 注入时加来源标注
  - 触发时 XML wrapper 应包含 source_note="城南旧事 / 旧档案，非小cha亲历"
risk: 低～中 — 已是条件触发，但缺来源透明性
```

### 4. project_memory

```
provider_name: project_memory
current_behavior: route=project_work + 无 suppress 时触发，注入 project_memory 类第一条
violates_v2_policy: TRUE
  - project_memory 碎片不应作为 active injection
  - 当前注入的是 promoted 出来的第三人称项目日志，不是经过 L2 消化的第一人称记录
  - "用户正在使用 Supabase 开发项目" 这类句子进入 system prompt 会污染人格
recommended_action: disable_default_injection
  - 短期：disable 所有由 auto_memory_candidates promoted 的 project_memory
  - 长期：project 相关信号只通过城南旧事 / construction_log 归档，不注入主聊天
risk: 高 — 直接把开发日志碎片注入 AI 人格层
```

### 5. writing_memory

```
provider_name: writing_memory
current_behavior: 写作关键词触发，注入所有 writing_memory 类
violates_v2_policy: FALSE（框架合理）
  - 写作/OC/角色设定在 kk 主动聊写作时注入是合理的
  - 但需确认 writing_memory 内容是否包含误分类的 project 内容
recommended_action: keep_l0_minimal（保留，审查内容）
risk: 低 — 触发条件合理，需审查误分类内容
```

### 6. relationship_context

```
provider_name: relationship_context
current_behavior: 关系/历史关键词触发，注入所有 relationship_context 类
violates_v2_policy: PARTIAL
  - 框架：合理（关系上下文应该存在）
  - 内容：部分 relationship_context 可能包含旧 G 关系记录
  - 当前注入时没有来源透明标注，小cha可能用第一人称表达旧 G 的关系
recommended_action: gate_by_user_request + 来源标注
  - 注入时应标注：这是关系档案，小cha不能用第一人称声称亲历
risk: 中 — 内容敏感，缺来源透明性
```

### 7. historical_ai_usage

```
provider_name: historical_ai_usage
current_behavior: 前世/旧版本/4o以前等关键词触发
violates_v2_policy: FALSE（框架合理）
  - 已是严格 keyword-gated
  - 理论上只在 kk 主动问旧历史时触发
  - 但需确认内容本身有来源标注
recommended_action: move_to_south_city_old_stories
  - 长期：historical_ai_usage → 城南旧事模块，注入时必须带来源标注
risk: 低～中 — 已门控，但内容归类应明确为"旧城"而非 active memory
```

### 8. life_context

```
provider_name: life_context
current_behavior: 猫/身体/日常关键词触发
violates_v2_policy: FALSE
  - 日常生活事实（猫、健康）是合理的 L1 内容
recommended_action: keep_l0_minimal
risk: 低
```

---

## 执行优先级

| 优先级 | 项目 | 操作 |
|--------|------|------|
| P0 | disable 所有 promoted project_memory | dryRun 确认后执行 |
| P0 | mastodon_profile 改为非 always-on | 代码改动，等下一轮 |
| P1 | project_memory 注入逻辑改为 disabled | 代码改动，等下一轮 |
| P1 | relationship_context / historical_ai_usage 加来源标注 | 代码改动，等下一轮 |
| P2 | L2 Identity Brain 建设 | 新功能，Phase 3 |
| P2 | 城南旧事模块 | 新功能，Phase 3 |
