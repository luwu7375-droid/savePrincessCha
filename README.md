# 救公主

## 已打通链路

```
GitHub Pages → Supabase Edge Function /chat → 浣溪沙模型 → Supabase messages 表
                                             ↑
                                    memories 表（手动记忆库注入）
```

## 配置

GitHub Pages 会公开仓库里的静态文件，包括 `public-config.js`。

`public-config.js` 只能放前端公开配置，例如 Supabase URL、Supabase anon key、Supabase Edge Function URL 和模型名：

- `CHAT_API_ENDPOINT`
- `MODEL_NAME`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

GitHub Pages 只能托管静态文件，无法直接提供 `/api/chat`。请把 `CHAT_API_ENDPOINT` 配置为你的 Supabase Edge Function Chat URL，让前端通过该地址调用后端代理。

`CHAT_API_ENDPOINT` 应填写：

```text
https://<project-ref>.supabase.co/functions/v1/chat
```

不要把 OpenRouter、DeepSeek 等模型供应商 API Key 放进前端代码、`config.js`、`public-config.js` 或 GitHub Pages 部署产物。聊天请求应通过 Supabase Edge Function、Cloudflare Worker 或 Vercel Function 代理，并在服务端环境变量中保存私钥。

`config.js`、`config.local.js`、`.env`、`.env.local` 保留为本地私有配置备用，并由 `.gitignore` 忽略。

Supabase 必须开启 RLS。`sql/messages.sql` 启用 RLS，并提供 MVP 开发期匿名读写策略（anon 可 select/insert/delete，insert 限 role in ('user','assistant')）。**注意：这是 MVP 开发期策略，基于 localStorage 的 conversation_id 做客户端会话隔离，不是真正用户级安全隔离。正式版需要 Supabase Auth + RLS 或 Edge Function 代理读写。**

## Supabase Edge Function

聊天代理函数位于 `supabase/functions/chat/index.ts`。部署后，需要在 Supabase secrets 中配置：

```bash
supabase secrets set OPENROUTER_API_KEY="你的 OpenRouter Key"
supabase secrets set OPENROUTER_BASE_URL="OpenRouter 兼容接口地址"
supabase secrets set MODEL_NAME="模型名称"
```

部署 `chat` function 时需关闭 JWT 校验，或在 Supabase config 中设置 `verify_jwt = false`。本仓库已在 `supabase/config.toml` 中为 `functions.chat` 配置：

```toml
[functions.chat]
verify_jwt = false
```

OpenRouter / DeepSeek 私钥只能保存在 Supabase Edge Function 的服务端环境变量中，不能写进前端文件或 GitHub Pages 部署产物。
