# 救公主

## 配置

GitHub Pages 会公开仓库里的静态文件，包括 `public-config.js`。

`public-config.js` 只能放前端公开配置，例如 Supabase URL、Supabase anon key、Supabase Edge Function URL 和模型名：

- `CHAT_API_ENDPOINT`
- `MODEL_NAME`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

GitHub Pages 只能托管静态文件，无法直接提供 `/api/chat`。请把 `CHAT_API_ENDPOINT` 配置为你的 Supabase Edge Function Chat URL，让前端通过该地址调用后端代理。

不要把 OpenRouter、DeepSeek 等模型供应商 API Key 放进前端代码、`config.js`、`public-config.js` 或 GitHub Pages 部署产物。聊天请求应通过 Supabase Edge Function、Cloudflare Worker 或 Vercel Function 代理，并在服务端环境变量中保存私钥。

`config.js`、`config.local.js`、`.env`、`.env.local` 保留为本地私有配置备用，并由 `.gitignore` 忽略。

Supabase 必须开启 RLS。`sql/messages.sql` 默认启用 RLS，并移除匿名裸读写策略；上线前请只添加符合业务权限边界的受控策略。
