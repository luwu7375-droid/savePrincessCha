# 记忆系统索引 Memory Index

当前记忆系统状态（Phase 4）：

| Provider | 状态 | 注入方式 |
|----------|------|----------|
| `mastodon_profile` | ✅ 已上线 | always inject |
| `mastodon_timeline` | ✅ 已上线 | retrieval_only |
| `openai_export` | 🔵 预留 | retrieval_only（未实现） |
| `ombre_vault` | 🟡 规划中 | retrieval_only（未实现） |

---

## 文档导航

- [memory-architecture-review.md](./memory-architecture-review.md) — 架构评审：系统设计、数据流、日志字段全表
- [memory-design-feedback.md](./memory-design-feedback.md) — 实战反馈：解决过的问题、设计决策记录、待观察问题

---

## 北极星原则（不可变）

1. 默认遗忘，而非默认记住。
2. 记照护方式，而非记伤口。
3. 可见即可控。

后续所有记忆系统设计必须遵守这三条原则。

---

## 遗留系统状态

- `story_seeds`：完全停用，前台入口已替换为记忆中枢。
- `memory_buckets`：完全停用，`LEGACY_MEMORY_ENABLED` 默认 `false`。
- `memories` 表：保留用于 distill 工作流，不再注入 system prompt。
