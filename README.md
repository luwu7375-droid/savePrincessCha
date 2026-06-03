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
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

不要把 OpenRouter、DeepSeek 等模型供应商 API Key 放进前端代码、`config.js` 或 GitHub Pages 部署产物。后续聊天请求应通过 `/api/chat` 代理到 Cloudflare Worker、Supabase Edge Function 或 Vercel Function，并在服务端环境变量中保存私钥。

Supabase 必须开启 RLS。`sql/messages.sql` 默认启用 RLS，并移除匿名裸读写策略；上线前请只添加符合业务权限边界的受控策略。
