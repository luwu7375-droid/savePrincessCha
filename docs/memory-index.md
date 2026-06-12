# 记忆系统索引 Memory Index

当前记忆系统状态（Phase 5+）：

| Provider | 状态 | 注入方式 |
|----------|------|----------|
| `persona_memories` | ✅ 已上线 | always inject（L1，memories 表） |
| `mastodon_profile` | ✅ 已上线 | always inject |
| `project_memory` | ✅ 已上线 | route inject（L2，话题路由为 project_work 时） |
| `relationship_context` | ✅ 已上线 | retrieval_only（L3，关键词触发）— 关系事实档案，非小钗亲历记忆 |
| `life_context` | ✅ 已上线 | retrieval_only（L3，关键词触发）— 生活/健康/宠物照护 |
| `historical_ai_usage` | ✅ 已上线 | retrieval_only（L3，关键词触发）— 历史档案/背景理解，非彩蛋优先 |
| `mastodon_timeline` | ✅ 已上线 | retrieval_only（L3，年份/地点/事件触发） |
| `conversation_history` | ✅ 已上线 | retrieval_only（L3，触发词激活） |
| `auto_memory_vault` | ✅ 已上线 | 对话后自动沉淀到 memories 表，经 L1/L2 注入 |
| `openai_archive` | ❌ 已退役 | 不再注入；`openai_archive_entries` 表仅作数据查阅 |

---

## 文档导航

- [memory-architecture-review.md](./memory-architecture-review.md) — 架构评审：系统设计、数据流、日志字段全表
- [memory-design-feedback.md](./memory-design-feedback.md) — 实战反馈：解决过的问题、设计决策记录、待观察问题

---

## 三层持久 + 一层涌现原则

### 持久层（允许）

| 层 | Provider | 说明 |
|----|---------|------|
| core_identity | `mastodon_profile` | 用户核心画像，稳定背景知识 |
| relationship_journal | `relationship_context`（候选） | 关系事实档案，未来升级为 relationship_journal |
| origin_archive | 未来规划 | 历史档案召回，另行设计，不复活 openai_archive |

### 涌现层（禁止新增）

- `self_narrative`：零持久、零运行时编译，**禁止新增此表或 provider**
- `identity_voice`：同上，**禁止新增**

---

## 北极星原则（不可变）

1. 默认遗忘，而非默认记住。
2. 记照护方式，而非记伤口。
3. 可见即可控。

后续所有记忆系统设计必须遵守这三条原则。

---

## 遗留系统状态

- `story_seeds`：完全停用，前台入口已替换为记忆中枢。
- `memory_buckets`：旧沉淀摘要桶，默认不参与回复（`LEGACY_MEMORY_ENABLED` 默认 `false`）。表保留，仅用于查看 / 备份 / 迁移，入口在"记忆管理（高级）"。
- `openai_archive`：已退役，不再注入任何 prompt。`openai_archive_entries` 表保留，仅作数据查阅。
- `memories` 表：由 `persona_memories`（L1）和 `project_memory`（L2）注入，同时作为 `auto_memory_vault` 的写入目标。
