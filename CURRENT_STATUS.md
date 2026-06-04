# 当前状态快照（2026-06-04）

## 已通功能

- 历史消息加载（按 conversation_id 过滤，最近 20 条）
- 消息保存（user / assistant 双向写入，含 conversation_id）
- 流式回复（SSE，`<think>` 标签已过滤）
- 会话隔离（conversation_id 存于 localStorage，每个浏览器独立）
- 清空当前会话（只删除当前 conversation_id 的消息）
- 手动记忆库（���看 / 新增 / 禁用，Edge Function 每次读取注入 system prompt）

## 技术配置

- 模型：`[浣溪沙]gpt-5.5①`
- 接口：Supabase Edge Function `/functions/v1/chat`
- Base URL fallback：`https://api.fuka.win/v1/chat/completions`
- 前端托管：GitHub Pages

## 当前风险

- 会话隔离为 MVP 客户端方案，不是真正用户级安全隔离
- memories 表为 anon 全表读写，正式版需 Auth + RLS
- Edge Function 读取 memories 需配置 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY；未配置时记忆注入自动跳过，不影响聊天

## 需在 Supabase 执行的 SQL

执行 `sql/memories.sql` 创建 memories 表及 RLS 策略。

## 需在 Supabase 配置的 Secret

```
SUPABASE_URL=https://zbpbkyzisamleqspijnr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=（在 Supabase Project Settings → API 中获取）
```

## 下一步建议

- UI 微调（记忆面板样式）
- 用户身份（Supabase Auth）
- 自动记忆提取（AI 解析对话写入记忆）
