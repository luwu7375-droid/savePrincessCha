# 记忆系统架构评审 Memory Architecture Review

> 状态：已定稿
> 版本：Phase 4 完成后（2026-06）
> 本文件为记忆系统架构的正式评审记录，后续所有架构变更须在此处更新。

---

## 一、当前记忆架构

| 层级 | Provider ID | 注入方式 | 状态 | 说明 |
|------|-------------|----------|------|------|
| 长期记忆 L1 | `persona_memories` | always | ✅ 已上线 | memories 表，persona / life / relation 域每轮注入 |
| 常驻画像 | `mastodon_profile` | always | ✅ 已上线 | 每轮注入，核心用户画像 |
| 项目记忆 L2 | `project_memory` | route inject | ✅ 已上线 | 话题路由为 project_work 时注入，work / writing 域 |
| 时间线档案 | `mastodon_timeline` | retrieval_only | ✅ 已上线 | 按需召回，事件 / 地点 / 年份类查询触发 |
| 历史对话 L3 | `conversation_history` | retrieval_only | ✅ 已上线 | 触发词激活，跨会话语义检索，top-5 召回 |
| 自动记忆库 | `auto_memory_vault` | — | ✅ 已上线 | 对话后自动提取候选并沉淀到 memories 表，经 L1/L2 注入 |
| OpenAI 导出 | `openai_archive` | retrieval_only | 🔵 预留 | 未来导入历史对话记录，未实现 |

---

## 二、各层详细说明

### mastodon_profile — 常驻画像

- **数据来源**：`supabase/functions/chat/mastodon_profile.ts`（TypeScript 模块内联，避免 Deno 文件系统问题）
- **原始文件**：`data/memory/mastodon/profile.md`
- **注入时机**：每轮请求，无条件注入
- **XML 包装**：`<user_core_profile source="mastodon_profile">…</user_core_profile>`
- **日志字段**：`mastodon_profile_loaded`、`mastodon_profile_chars`、`mastodon_profile_error`
- **设计原则**：用于理解用户，不用于复述来源；profile 全文不暴露给前端

### mastodon_timeline — 时间线档案

- **数据来源**：`supabase/functions/chat/mastodon_timeline.ts`（内联）
- **原始文件**：`data/memory/mastodon/timeline.md`
- **注入时机**：`shouldInjectTimeline(userMessage)` 返回 true 时按需注��
- **触发模式**：年份关键词（2023–2026）、地点、时间类问题、具体里程碑事件词汇
- **XML 包装**：`<timeline_events source="mastodon_timeline">…</timeline_events>`
- **日志字段**：`timeline_loaded`、`timeline_query_detected`、`timeline_recalled`、`timeline_hit_count`、`timeline_hit_keys`、`timeline_reason`

### openai_archive — 预留

- 未来从 OpenAI conversations.json 导入对话记忆
- 注入方式：retrieval_only，需实现独立的关键词或向量召回

### auto_memory_vault — 自动记忆库

- 对话结束后自动提取候选记忆（project / fact / preference 类型白名单）
- 符合条件的候选沉淀到 `memories` 表，经 `persona_memories`（L1）和 `project_memory`（L2）注入后续回复
- 可在 Memory Center"最近更新"区域查看、禁用、删除
- 写入须可审计、可撤销

---

## 三、已停用的遗留系统

以下系统已完全停用，代码保留但不再参与任何注入：

| 系统 | 停用原因 |
|------|----------|
| `story_seeds` | 硬编码关系叙事，不符合"默认遗忘"原则 |
| `memory_buckets` 注入 | 盲注污染风险高，已由 provider 架构替代；表保留，仅用于查看 / 迁移 |
| 前台"关系史"入口 | 已替换为"记忆中枢" |

**环境变量开关**：`LEGACY_MEMORY_ENABLED`（默认 `false`）。生产环境不得开启。旧沉淀记忆管理入口保留为"记忆管理（高级）"，不参与回复。

---

## 四、数据流

```
用户消息
    │
    ▼
getLastUserMessage()
    │
    ├─── mastodon_profile（always）
    │         └── <user_core_profile> 注入 systemContent
    │
    └─── shouldInjectTimeline(message)?
              ├── YES → mastodon_timeline → <timeline_events> 注入 systemContent
              └── NO  → 跳过
```

---

## 五、北极星原则（不可变）

1. **默认遗忘，而非默认记住。** 任何新记忆层必须是 retrieval_only，不得无条件常驻。
2. **记照护方式，而非记伤口。** 敏感内容（创伤、诊断、家庭关系）只能存在于 profile，不得自动沉淀到 vault。
3. **可见即可控。** 所有记忆层状态必须在 Memory Center 中可见；计划中的 vault 必须支持用户删除。

---

## 六、日志字段全表

所有字段均由 `RequestLog` 类型保证，通过 `emitLog()` 输出到 Supabase 函数日志。

```
legacy_memory_enabled          // 遗留系统是否开启（应始终为 false）
active_memory_providers        // 本轮激活的 provider 列表
memory_provider_count          // provider 数量
mastodon_profile_loaded        // profile 是否成功加载
mastodon_profile_chars         // profile 字符数
mastodon_profile_error         // 加载失败原因（如有）
mastodon_timeline_enabled      // timeline provider 是否启用
timeline_loaded                // 本轮是否注入了 timeline
timeline_query_detected        // 是否检测到时间线类查询（Phase 5 新增）
timeline_recalled              // timeline 是否实际提供了有效内容（Phase 5）
timeline_hit_count             // 命中关键词数（Phase 5）
timeline_hit_keys              // 命中的关键词列表（Phase 5）
timeline_reason                // 召回原因文字说明（Phase 5）
openai_export_enabled          // 始终 false（预留）
ombre_vault_enabled            // 始终 false（规划中）
memory_context_tokens_estimated // 本轮记忆上下文 token 估算值
```

---

## 七、变更记录

| 日期 | 变更 |
|------|------|
| 2026-06 | Phase 4 完成：mastodon_profile 常驻、mastodon_timeline 按需、遗留系统停用 |
| 2026-06 | Memory Center UI 第一版上线（四张 provider 卡片 + Debug 区域） |
| 2026-06 | 架构文档固化入 docs/ |
| 2026-06 | persona_memories / project_memory / conversation_history / auto_memory_vault 上线；memories 表经 L1/L2 注入；Memory Center 更新为 6 张卡片 |
| 2026-06 | UI 文案更新："记忆管理（高级）"替换"旧记忆匣"，明确正式记忆与旧沉淀记忆的区别 |
