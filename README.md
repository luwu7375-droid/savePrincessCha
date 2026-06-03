# 救公主

## 配置

本项目不会提交真实的 `config.js`，避免公开配置被误提交。

首次使用时，复制示例配置文件：

```bash
cp config.example.js config.js
```

然后打开 `config.js`，把里面的 `YOUR_KEY_HERE` 替换成你的公开前端配置。

需要配置的值包括：

- `MODEL_NAME`
- `CHAT_API_ENDPOINT`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

GitHub Pages 只能托管静态文件，无法直接提供 `/api/chat`。请把 `CHAT_API_ENDPOINT` 配置为你的 Supabase Edge Function Chat URL，让前端通过该地址调用后端代理。

不要把 OpenRouter、DeepSeek 等模型供应商 API Key 放进前端代码、`config.js` 或 GitHub Pages 部署产物。聊天请求应通过 Supabase Edge Function、Cloudflare Worker 或 Vercel Function 代理，并在服务端环境变量中保存私钥。

Supabase 必须开启 RLS。`sql/messages.sql` 默认启用 RLS，并移除匿名裸读写策略；上线前请只添加符合业务权限边界的受控策略。
