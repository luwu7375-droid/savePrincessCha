# 当前状态快照（2026-06-04）

## 已通功能

- 历史消息加载（按 conversation_id 过滤，最近 20 条）
- 消息保存（user / assistant 双向写入，含 conversation_id）
- 流式回复（SSE，`<think>` 标签已过滤）
- 会话隔离（conversation_id 存于 localStorage，每个浏览器独立）
- 清空当前会话（只删除当前 conversation_id 的消息）

## 技术配置

- 模型：`[浣溪沙]gpt-5.5①`
- 接口：Supabase Edge Function `/functions/v1/chat`
- Base URL fallback：`https://api.fuka.win/v1/chat/completions`
- 前端托管：GitHub Pages

## 当前风险

- 会话隔离为 MVP 客户端方案：conversation_id 存于 localStorage，任何人只要知道某个 conversation_id 即可读写其消息
- messages 表仍为 anon 全表读写，不是真正用户级安全隔离
- 正式版需要 Supabase Auth + RLS（按 user_id 隔离），或通过 Edge Function 代理读写

## 下一步建议

- UI 微调（输入框、消息气泡样式）
- 用户身份（Supabase Auth 或匿名 session）
- 记忆结构（长期记忆、角色设定持久化）
