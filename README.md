# 救公主

一个给 G / cha酱 的私人陪伴聊天应用。前端静态部署，后端走 Supabase Edge Function 代理模型调用，带记忆系统、时间感知、对话状态感知。

## 架构

```
Cloudflare Pages / GitHub Pages
  └─ app.js + index.html + style.css
       │
       └─ POST /chat  ──►  Supabase Edge Function (chat)
                                │
                                ├─ OpenRouter / fuka 兼容接口 → 模型
                                ├─ memories 表（长期记忆）
                                ├─ messages 表（对话历史）
                                ├─ mastodon_profile.ts（用户画像，内联）
                                ├─ mastodon_timeline.ts（时间线档案，按需注入）
                                └─ conversation_history_provider（跨会话检索）
```

## 已实现功能

**人格与回复**
- `G_persona_core`：聪明直给、playful、情绪雷达强、有主角气场，不是咨询师也不是冷静监管者
- `G_reply_style`：情绪先到结构后到，短句，可以直接判断，不默认项目化
- `persona_emotional_boundary`：亲密感表达规则，禁止"接住你"等表达
- `identity_boundary`：身份边界，mastodon_profile 只描述用户不描述 G

**时间感知与话题循环（G_TIME_CONTEXT_PROMPT_v2）**
- 前端每次请求携带 `timeContext`（本地时区、时刻、对话开始时间、消息数）
- 前端计算 `conversation_state`（long_chat、loop_detected、recent_topic_hint）
- 后端按需生成 `<g_time_context>` block 注入 system prompt
  - 深夜 + 长聊：G 可在自然节点流露时间意识，温和收束，有舍不得
  - 话题打转：G 说"我感觉我们又回到这儿了"，不说"你在反复"
  - 大多数时候：什么都不注入，正常聊天

**Chat Status 第一版**
- 后端规则化计算 `energy / clarity / valence / arousal / connection`
- 通过 `x-chat-status` response header 返回（base64 JSON）
- 前端 `#princessStatusBar` 状态条，显示在 top-bar 下方
- 默认一行：`【状态】体力：精力好｜清醒：清楚｜心情：平稳｜兴致：正常｜连结：在线`
- 点击展开详情（为什么体力好？为什么清楚？）
- 切换对话时重置

**记忆系统**
- `mastodon_profile`：用户核心画像，常驻注入
- `mastodon_timeline`：时间线档案，按时间/地点/年份查询时按需注入
- `memories` 表：手动长期记忆，按域（persona/work/writing/life/relation/general）分类按需注入
- `memory_buckets` 表：主题摘要，按关键词匹配注入
- `conversation_history_provider`：跨会话检索，触发词触发后 top-5 召回注入
- Memory Center UI：前端管理面板，显示各 provider 实时状态

**模型档位**
- `instant`：FAST_MODEL，max 300 tokens
- `general`：DEFAULT_MODEL，max 300 tokens
- `advanced`：ADVANCED_MODEL，max 1200 tokens
- 一次性 fallback：primary 失败（429 / 5xx / credits 不足）时自动切 FALLBACK_MODEL

**其他**
- 流式输出（SSE）
- 多会话管理，localStorage 持久化
- 自动接话模式（auto replyMode）
- 强制回复按钮
- 图片附件上传
- Memory debug header（`x-save-princess-memory-debug`）
- Cloudflare Pages `_headers` 缓存策略

## 配置

### 前端（public-config.js）

```js
CHAT_API_ENDPOINT  // Supabase Edge Function URL
MODEL_NAME         // 模型名（主要给前端 system prompt 用）
SUPABASE_URL
SUPABASE_ANON_KEY
```

这个文件是公开的，不能放任何私钥。

### 后端（Supabase secrets）

```bash
supabase secrets set OPENROUTER_API_KEY="..."
supabase secrets set OPENROUTER_BASE_URL="https://api.fuka.win/v1/chat/completions"
supabase secrets set DEFAULT_MODEL="..."
supabase secrets set FAST_MODEL="..."          # instant 档位
supabase secrets set ADVANCED_MODEL="..."      # advanced 档位
supabase secrets set FALLBACK_MODEL="..."      # 可选，失败时回退
supabase secrets set DB_URL="..."              # Supabase project URL
supabase secrets set DB_SERVICE_ROLE_KEY="..."
supabase secrets set MEMORY_ADMIN_TOKEN="..."  # 记忆管理面板口令
```

可选 token 上限：

```bash
supabase secrets set MAX_OUTPUT_TOKENS_INSTANT="300"
supabase secrets set MAX_OUTPUT_TOKENS_GENERAL="300"
supabase secrets set MAX_OUTPUT_TOKENS_ADVANCED="1200"
```

### supabase/config.toml

```toml
[functions.chat]
verify_jwt = false

[functions.memories]
verify_jwt = false
```

## 部署

```bash
# 检查语法
npm run check

# 部署 Edge Function
supabase functions deploy chat
supabase functions deploy memories

# 前端：push 到 main，Cloudflare Pages 自动构建
git push
```

## 数据库

SQL 初始化文件在 `sql/`：
- `messages.sql`：消息表 + RLS 策略
- 其余表（memories、memory_buckets、conversations）按需初始化

RLS 当前为 MVP 开发期策略，基于 localStorage conversation_id 做客户端会话隔离，不是用户级安全隔离。正式上线需要 Supabase Auth + 用户级 RLS。

## Chat Status 第二版（预留，未实现）

- 轻量 LLM 分析最近 4 条消息，动态计算 valence/arousal/connection
- `pride` 内部字段（不前台展示）
- `immersion` 字段（thinking / coding / chatting / organizing）
- `primary_status`：只展示权重最高的那个状态
