# 当前状态快照（2026-06-04）

## 已通功能

- 历史消息加载（按 conversation_id 过滤，最近 20 条）
- 消息保存（user / assistant 双向写入，含 conversation_id）
- 流式回复（SSE，`<think>` 标签已过滤）
- 会话隔离（conversation_id 存于 localStorage，每个浏览器独立）
- 清空当前会话（只删除当前 conversation_id 的消息）
- 手动记忆库（查看 / 新增 / 禁用，Edge Function 每次读取注入 system prompt）✅ 已测试：新增记忆后模型能遵守记忆内容

## 记忆原则

- 只做人工确认记忆，不做自动总结
- 下一步：整理第一批相处模式记忆种子；之后再做创作记忆

## 技术配置

- 模型：`[浣溪沙]gpt-5.5①`
- 接口：Supabase Edge Function `/functions/v1/chat`
- Base URL fallback：`https://api.fuka.win/v1/chat/completions`
- 前端托管：GitHub Pages
- Edge Function secrets：`OPENROUTER_API_KEY`、`MODEL_NAME`、`DB_URL`、`DB_SERVICE_ROLE_KEY`

## 当前风险

- 会话隔离为 MVP 客户端方案，不是真正用户级安全隔离
- memories / messages 表为 anon 全表读写，正式版需 Auth + RLS
- Edge Function 读取 memories 未配置 DB_URL / DB_SERVICE_ROLE_KEY 时自动跳过，不影响聊天
