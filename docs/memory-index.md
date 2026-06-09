# 记忆系统索引 Memory Index

当前记忆系统状态（Phase 4+）：

| Provider | 状态 | 注入方式 |
|----------|------|----------|
| `persona_memories` | ✅ 已上线 | always inject（L1，memories 表） |
| `mastodon_profile` | ✅ 已上线 | always inject |
| `project_memory` | ✅ 已上线 | route inject（L2，话题路由为 project_work 时） |
| `mastodon_timeline` | ✅ 已上线 | retrieval_only |
| `conversation_history` | ✅ 已上线 | retrieval_only（L3，触发词激活） |
| `auto_memory_vault` | ✅ 已上线 | 对话后自动沉淀到 memories 表，经 L1/L2 注入 |
| `openai_archive` | 🔵 预留 | retrieval_only（未实现） |

---

## 文档导航

- [memory-architecture-review.md](./memory-architecture-review.md) — 架构评审：系统设计、数据流、日志字段全表
- [memory-design-feedback.md](./memory-design-feedback.md) — 实战反馈：解决过的问题、设计决策记录、待观察问题

---

## 北极星原则（不可变）

1. 默认遗忘，而非默认记住。
2. 记照护方式，而非记伤口。
3. 可见即可控。

后续所有记忆系统设���必须遵守这三条原则。

---

## 遗留系统状态

- `story_seeds`：完全停用，前台入口已替换为记忆中枢。
- `memory_buckets`：旧沉淀摘要桶，默认不参与回复（`LEGACY_MEMORY_ENABLED` 默认 `false`）。表保留，仅用于查看 / 备份 / 迁移，入口在"记忆管理（高级）"。
- `memories` 表：由 `persona_memories`（L1）和 `project_memory`（L2）注入，同时作为 `auto_memory_vault` 的写入目标。
