# Roadmap & Credits

## 规划中（未实现）

### Chat Status 第二版

- 轻量 LLM 分析最近 4 条消息，动态计算 valence / arousal / connection
- `pride` 内部字段（不前台展示）
- `immersion` 字段（thinking / coding / chatting / organizing）
- `primary_status`：只展示权重最高的状态

### Memory Cache

为 `/chat` Edge Function 添加记忆上下文缓存，避免每次请求重新编译相同的 memory context。

实现思路：
1. 对归一化的 chat/memory 输入计算稳定 hash
2. 按 hash 查找已缓存的 `compiled_context`
3. 命中则复用，未命中则走现有 memory fetch + system prompt 注入逻辑
4. 记录 `hit memory ids`

相关文件：
- `supabase/functions/chat/index.ts`
- `supabase/config.toml`（如需 function env 调整）

### 图片上传完整流程

- 多图批量上传
- 图像识别（视觉模型调用）

### Memory Center UI

- OpenAI Export 卡片文案与后端 `openai_archive` provider 对齐
- 分页支持（当前只加载最近 20 条历史）

### 对话历史分页

`messages` 表目前每次只加载最近 20 条，无分页或无限滚动。

### 跨标签实时同步

当前需要刷新才能看到其他标签页的新消息。

### 用户认证升级

当前 `verify_jwt = false`，适合私人部署。若多用户场景需要开启 JWT 验证并调整 RLS 策略。

---

## 致谢

- [Supabase](https://supabase.com)：Edge Functions + 数据库 + Auth
- [OpenRouter](https://openrouter.ai)：模型路由
- [Cloudflare Pages](https://pages.cloudflare.com)：前端静态托管
- Mastodon API：画像数据来源
