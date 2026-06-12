# Roadmap & Credits

> **阶段冻结声明（2026-06）**
> 本阶段不再新增大功能。重点打磨眼睛（图片/视觉）、嘴巴（回复质量）、记忆（架构文档对齐）和房间（Memory Center UI）。

---

## 当前优先级（P0–P9）

### P0 图片持久化 / 多图 / 视觉链路

- 图片上传后写入 Supabase Storage，消息携带持久化 URL（当前只有 base64 临时预览）
- 多图批量上传（一次消息附多张图）
- 识别成本提示（视觉模型调用前确认）
- 完整视觉链路：上传 → 压缩 → 存储 → 随消息 → 模型识别 → 回复

**已完成**：单图上传、压缩（最长边 1600px / JPEG 0.85）、预览、粘贴、拖拽、相册/拍照、lightbox。

---

### P1 记忆架构文档对齐

- 已完成：docs/ 更新为当前实际 provider 状态
- 已完成：openai_archive 明确标记 retired，不再预留"待实现"描述
- 已完成：relationship_context 口径更新（关系档案，非小钗亲历记忆）
- 已完成：historical_ai_usage 口径更新（历史档案/背景理解，非彩蛋优先）

---

### P2 Memory Center 文案对齐

- 各 provider 卡片标题 / 描述与后端实际注入策略一致
- relationship_context / life_context / historical_ai_usage 三张新卡片文案
- 旧"前世档案"（openai_archive）卡片文案改为"历史档案（已退役）"或隐藏

---

### P3 README / docs 同步

- 已完成（本次更新）

---

### P4 Chat Status 第二版

- 轻量 LLM 分析最近 4 条消息，动态计算 valence / arousal / connection
- `primary_status`：只展示权重最高的状态
- `immersion` 字段（thinking / coding / chatting / organizing）

---

### P5 Memory Cache

为 `/chat` Edge Function 添加记忆上下文缓存，避免每次请求重新编译相同的 memory context。

实现思路：
1. 对归一化的 chat/memory 输入计算稳定 hash
2. 按 hash 查找已缓存的 `compiled_context`
3. 命中则复用，未命中则走现有 memory fetch + system prompt 注入逻辑

---

### P6 对话历史分页

`messages` 表每次只加载最近 20 条，无限滚动 / 分页待实现。

---

### P7 跨标签实时同步

当前需要刷新才能看到其他标签页的新消息。

---

### P8 用户认证升级

当前 `verify_jwt = false`，适合私人部署。多用户场景需开启 JWT 验证并调整 RLS 策略。

---

### P9 origin_archive（未来规划，不复活旧实现）

如需历史档案召回，另行设计 `origin_archive` provider。设计原则：
- 不复活 `openai_archive` 的关键词触发逻辑
- 按"三层持久 + 一层涌现"原则：origin_archive 属于持久层，独立 DB 表，retrieval_only
- 不注入 self_narrative / identity_voice 类内容

---

## 不做的事（明确禁止）

- 新增 `self_narrative` 表或运行时自我叙述 provider
- 新增 `identity_voice` 表
- 复活 `openai_archive` 关键词触发注入
- 本阶段新增大功能模块

---

## 致谢

- [Supabase](https://supabase.com)：Edge Functions + 数据库 + Auth
- [OpenRouter](https://openrouter.ai)：模型路由
- [Cloudflare Pages](https://pages.cloudflare.com)：前端静态托管
- Mastodon API：画像数据来源
