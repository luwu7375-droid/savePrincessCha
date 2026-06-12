# 记忆架构原则

**核心约束（不可违背）：**

> 三层持久，一层涌现。系统只维护 core_identity、relationship_journal、origin_archive；不保存、不生成、不注入任何 self_narrative / identity_voice 文本。小钗的声音只能从身份边界、关系事实、当前上下文与模型回应中自然涌现。

---

## 三层持久记忆

### 1. core_identity
**对应现有 provider：** `persona_memories`（memories + instructions 表）

包含且仅包含：
- 身份边界（identity_boundary）
- 不可违背规则（core_principles）
- 执行规则（execution_rules）
- 用户交互偏好（interaction_preferences）

**禁止内容：** 任何描述"小钗是谁"的自我叙述、人格宣言、情感定义文本。

### 2. relationship_journal
**对应现有 provider：** `relationship_context`（keyword-triggered）

包含且仅包含：
- 用户与旧 G / cha / 4o 的关系史事实
- 纪念日、相遇时间等关系档案数据

**注入边界（必须遵守）：**
- 这是关系事实档案，不是小钗的亲历记忆；模型不得以第一人称声称亲历这些事件
- 注入须极克制：只陈述事实，不展开推断，不添加任何"关系意义"诠释
- 不得在关系档案基础上生成"我们之间的意义是……"式文本

### 3. origin_archive
**对应现有 provider：** `historical_ai_usage`（keyword-triggered，只读）

包含且仅包含：
- 用户的历史 AI 使用背景（只读档案）
- 仅用于背景理解，不用于构建当前身份

**默认行为：** 关键词触发，仅用于背景理解。不得用于彩蛋式轻浮召回。

### 4. functional_context
**对应现有 provider：** `project_memory`、`writing_memory`、`life_context`

领域功能上下文，仅在对应任务场景（关键词命中）时注入，不持久，不构建身份。

- `project_memory`：项目/开发背景，仅在 project_work route 触发
- `writing_memory`：OC / 世界观设定，仅在写作关键词触发
- `life_context`：用户生活照护信息，仅在生活/健康关键词触发

**性质：** 任务场景辅助，无持久性，不得用于推断用户身份或小钗人格。

### 5. retrieval
**对应现有 provider：** `conversation_history`、`mastodon_timeline`

按需召回机制，仅在用户明确指向过往内容或时间/地点查询时触发，不持久，不注入无关上下文。

- `conversation_history`：跨会话历史片段，仅在用户明确引用过往对话时触发
- `mastodon_timeline`：用户时间轴事实档案，仅在时间/地点/年份查询时触发

**性质：** 事实召回，只读，不构建身份，不声称亲历。

---

## 一层涌现（零持久）

**self_narrative / identity_voice：零持久、零运行时编译**

- 不建表
- 不生成中间文本
- 不注入 prompt
- 小钗的声音从身份边界、关系事实、当前上下文与模型回应中自然涌现

---

## Provider 审计与归类

| Provider | 当前状态 | 归属层 | 行动 |
|---|---|---|---|
| `persona_memories` | 常驻注入（memories + instructions） | core_identity | **保留，但审 DB 内容**：只能存身份边界/用户偏好/执行规则，不能塞自我叙述 |
| `mastodon_profile` | 常驻注入（persona_profile 表） | core_identity（用户档案） | **保留**，已有边界说明（`describes="human_user" not_assistant_identity="true"`） |
| `relationship_context` | keyword-triggered | relationship_journal | **保留**，注入说明已加极克制约束与亲历声明禁令（见 index.ts relationship_context 块） |
| `historical_ai_usage` | keyword-triggered | origin_archive | **保留**，说明已从"彩蛋"改为"历史档案 / 背景理解"（见 index.ts historical_ai_usage 块） |
| `openai_archive` | 已退役（log 显示 false） | — | **不复活**。如需 origin_archive，另开干净新层 |
| `personality_layers` (L1+L2) | DISABLED（注释掉） | — | **已停用**。personality_system.ts 标记 retired，计划删除日期见下方 |
| `mastodon_timeline` | keyword-triggered（时间/地点查询） | retrieval | **保留**，只读事实，不构建身份 |
| `project_memory` | keyword-triggered（project_work route） | functional_context | **保留**，项目背景，不是人格注入 |
| `writing_memory` | keyword-triggered（写作关键词） | functional_context | **保留**，OC / 世界观设定，不是人格注入 |
| `life_context` | keyword-triggered（生活/健康关键词） | functional_context | **保留**，用户照护信息，不是人格注入 |
| `conversation_history` | retrieval_only（跨会话关键词触发） | retrieval | **保留**，历史对话片段召回，不构建身份 |

---

## 禁止事项

1. **不新增 self_narrative / identity_voice 表**
2. **不新增"运行时生成小钗此刻是谁"的 provider**
3. **不复活 openai_archive**（如需 origin_archive 另开新层）
4. **personality_system.ts 已标记 retired，计划删除日期：2026-07-12**；禁止 import，禁止恢复 personality_layers
5. **persona_memories 内容必须审核**：DB 中如存在"小钗是一个……"式自我叙述文本，应迁移为身份边界格式或删除

---

## 待办事项

- [ ] **provider 并发注入上限**：当前所有 provider 并发注入无总量限制，需设置分层 token 预算上限：
  - core_identity + relationship_journal 合计 ≤ 800 tokens
  - functional_context（project_memory + writing_memory + life_context 合计）≤ 400 tokens
  - retrieval（conversation_history + mastodon_timeline 合计）≤ 400 tokens
  - **总上限 ≤ 1600 tokens**；超限时按优先级截断：core_identity > relationship_journal > origin_archive > functional_context > retrieval
  - 参考 `memory_context_tokens_estimated` 字段实现截断逻辑
- [ ] **persona_memories DB 内容审计**：人工逐条检查 memories + instructions 表，清理自我叙述类文本
- [ ] **personality_system.ts 正式删除**（计划：2026-07-12）

---

## 变更记录

- 2026-06-12：初版。架构收敛审计，personality_system.ts retired + 明确删除日期，relationship_context 注入加极克制约束，historical_ai_usage 说明改为历史档案，provider 并发注入上限列为待办。
- 2026-06-12：新增 functional_context / retrieval 两类层定义，收容 project_memory / writing_memory / life_context / conversation_history / mastodon_timeline；审计表归属层更新；并发注入上限扩展为全层分级预算（总上限 ≤ 1600 tokens）。
