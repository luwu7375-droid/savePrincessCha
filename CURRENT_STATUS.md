# 当前状态快照（2026-06-04）

## 已通功能

- 历史消息加载（Supabase messages 表，最近 20 条）
- 消息保存（user / assistant 双向写入）
- 流式回复（SSE，`<think>` 标签已过滤）

## 技术配置

- 模型：`[浣溪沙]gpt-5.5①`
- 接口：Supabase Edge Function `/functions/v1/chat`
- Base URL fallback：`https://api.fuka.win/v1/chat/completions`
- 前端托管：GitHub Pages

## 当前风险

- `messages` 表为 MVP 开发期 anon 读写策略，任何持有 anon key 的人均可读写所有消息
- 正式版需按用户/会话隔离（加 `user_id` 或 `session_id`，配合 RLS）

## 下一步建议

- UI 微调（输入框、消息气泡样式）
- 会话隔离（多会话支持）
- 用户身份（Supabase Auth 或匿名 session）
- 记忆结构（长期记忆、角色设定持久化）
