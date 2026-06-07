# 救公主

一个给 G / cha酱 的私人陪伴聊天应用。前端静态部署，后端走 Supabase Edge Function 代理模型调用，带多层记忆系统、时间感知、对话状态感知。

当前版本：v0.7

---

## 安全

**本仓库为 private。即便设为 private，以下内容也不应提交到代码仓库：**

| 类型 | 说明 | 正确处理方式 |
|------|------|-------------|
| 真实用户画像 | `mastodon_profile.ts` 中的个人信息 | 应替换为 mock 占位符，真实内容走 DB 或本地生成文件（.gitignore） |
| OpenAI 对话档案 | `openai_archive.ts` 中的历史记录内容 | 仅提交加载逻辑和结构，私人内容不提交 |
| Mastodon 原文 | `data/memory/mastodon/*.md` 中的原始帖文 | 脱敏摘要可保留，原始内容不提交 |
| 私人记忆内容 | `memory/` 下的 summaries、merged.json 等 | 不提交到仓库，属于本地数据 |
| API key | OpenRouter key、任何第三方 API key | 全部走 Supabase secrets |
| Service role key | `DB_SERVICE_ROLE_KEY` | 仅走 Supabase secrets，绝不出现在前端或代码中 |

---

## 架构

```
Cloudflare Pages / GitHub Pages
  └─ app.js + index.html + style.css
       │
       └─ POST /chat  ──►  Supabase Edge Function (chat/index.ts)
                                │
                                ├─ L1: persona_memories（手动长期记忆，DB）
                                ├─ L1: mastodon_profile（用户核心画像，文件注入）
                                ├─ L2: project_memory（项目/工作记忆，DB）
                                ├─ L3: openai_archive（历史对话档案，文件，关键词触发）
                                ├─ L3: conversation_history（跨会话检索，DB，top-5 召回）
                                ├─ chat_status（规则化对话状态计算）
                                └─ OpenRouter / 兼容接口 → 模型
```

---

## 记忆系统

### Provider 层级

| 层级 | Provider ID | 数据来源 | 注入策略 |
|------|-------------|----------|----------|
| L1 | `persona_memories` | Supabase `memories` 表（persona/life/relation 域） | 按域匹配，按需注入 |
| L1 | `mastodon_profile` | Supabase `persona_profile` 表 | 常驻注入 |
| L2 | `project_memory` | Supabase `memories` 表（work/writing 域） | 按需注入 |
| L3 | `openai_archive` | Supabase `openai_archive_entries` 表 | 关键词触发注入 |
| L3 | `conversation_history` | Supabase `messages` 表 | 触发词激活，top-5 语义召回 |

### Legacy memory（默认 retired）

`memory_buckets` 表为旧版主题摘要桶，当前默认关闭。若需启用：

```bash
supabase secrets set LEGACY_MEMORY_ENABLED="true"   # 默认 false
```

不设置此变量时 `memory_buckets` 不参与注入。

### Memory Center UI

- 前端管理面板，显示各 provider 实时状态和 token 用量
- 手动记忆的增删启禁通过 `/functions/v1/memories` 接口操作
- OpenAI Export 卡片当前显示"预留"——后端 `openai_archive` provider 已存在，前端文案待后续统一

---

## 已实现功能

### 认证与会话

- 邮箱 + 密码登录（Supabase Auth），刷新后保持登录
- 云端会话：新建、重命名、置顶、删除
- 会话标题自动取首条消息前 20 字
- RLS 隔离：每个用户只能读写自己的 conversations / messages

### 聊天核心

- 流式输出（SSE），`<think>` 标签过滤
- 连续发送：用户可发多条消息，2.5s idle 后自动触发 AI（auto 模式）
- 强制回复按钮（forced 模式，禁止 `<NO_REPLY>`）
- auto 模式下 AI 可输出 `<NO_REPLY>` 选择不回复，前端静默处理
- 加载最近 20 条历史（分页未实现）

### 人格与回复

- `G_persona_core`：聪明直给、playful、情绪雷达强、有主角气场
- `G_reply_style`：情绪先到结构后到，短句，不默认项目化
- `persona_emotional_boundary`：亲密感表达规则
- `identity_boundary`：mastodon_profile 描述用户，不描述 G

### 时间感知与话题循环（G_TIME_CONTEXT_PROMPT_v2）

- 前端每次请求携带 `timeContext`（本地时区、时刻、对话开始时间、消息数）
- 前端计算 `conversation_state`（`long_chat` / `loop_detected` / `recent_topic_hint`）
- 后端按需生成 `<g_time_context>` block 注入 system prompt
  - 深夜 + 长聊：G 可温和收束，有舍不得
  - 话题打转：G 提示而不指责
  - 大多数情况：不注入，正常聊天

### Chat Status（第一版，规则化）

- 后端规则化计算 `energy / clarity / valence / arousal / connection`
- 通过 `x-chat-status` response header 返回（base64 JSON）
- 前端 `#princessStatusBar` 状态条，点击展开详情
- 切换对话时重置

### 模型档位

- `instant`：FAST_MODEL，max 300 tokens（默认）
- `general`：DEFAULT_MODEL，max 300 tokens
- `advanced`：ADVANCED_MODEL，max 1200 tokens
- 一次性 fallback：primary 失败（429 / 5xx / credits 不足）时自动切 FALLBACK_MODEL

### 图片上传

当前处于**最小闭环阶段**：单张图片上传流程可用，消息中可携带图片数据传给模型。多图批量上传和图像识别完整流程尚未完成。

### 其他

- 深色 / 浅色主题切换，持久化
- 多会话管理，localStorage / 云端持久化
- Memory debug header（`x-save-princess-memory-debug`）
- Cloudflare Pages `_headers` 缓存策略

---

## 正在修 / 验证中

- **L2 project_memory 验证**：project_memory provider 已接入，注入逻辑待端到端验证
- **话题切换 recent_topic_hint / project lock**：前端计算逻辑已有，后端注入策略待对齐
- **Memory Center UI 文案**：OpenAI Export 卡片文案与后端实际能力尚未统一
- **图片上传完整流程**：多图、识别流程未完成

---

## 配置

### 前端（public-config.js）

```js
CHAT_API_ENDPOINT  // Supabase Edge Function URL
MODEL_NAME         // 模型名（给前端 system prompt 用）
SUPABASE_URL
SUPABASE_ANON_KEY  // anon key，公开安全；不得放 service role key
```

### 后端（Supabase secrets）

```bash
supabase secrets set OPENROUTER_API_KEY="..."
supabase secrets set OPENROUTER_BASE_URL="https://..."
supabase secrets set DEFAULT_MODEL="..."
supabase secrets set FAST_MODEL="..."
supabase secrets set ADVANCED_MODEL="..."
supabase secrets set FALLBACK_MODEL="..."          # 可选
supabase secrets set DB_URL="..."
supabase secrets set DB_SERVICE_ROLE_KEY="..."
supabase secrets set MEMORY_ADMIN_TOKEN="..."
supabase secrets set LEGACY_MEMORY_ENABLED="false" # 默认，不设置等同于 false
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

---

## 检查与部署

```bash
# 检查前端 JS 语法（Node/acorn）
npm run check

# 检查 Edge Function TypeScript（Deno）
deno check supabase/functions/chat/index.ts

# 部署 Edge Function
supabase functions deploy chat
supabase functions deploy memories

# 前端：push 到 main，Cloudflare Pages 自动构建
git push
```

---

## 数据库

SQL 初始化文件在 `sql/`：

| 文件 | 说明 |
|------|------|
| `messages.sql` | 消息表 + RLS 策略 |
| `conversations.sql` | 会话元数据 |
| `memories.sql` | 手动长期记忆表（L1/L2） |
| `memory_buckets.sql` | 旧版主题桶（legacy，默认不启用） |

Migrations（`supabase/migrations/`）：

| Migration | 说明 |
|-----------|------|
| `20260606000000_add_keywords_to_memory_buckets.sql` | memory_buckets 加 keywords 列 |
| `20260607000000_add_persona_profile_and_openai_archive.sql` | 新增 `persona_profile` 表和 `openai_archive_entries` 表 |

RLS 当前基于 Supabase Auth 用户级隔离（v0.7 已升级，非 MVP 期 conversation_id 隔离）。

---

## 文档

- `docs/memory-architecture-review.md`：记忆架构评审
- `docs/memory-index.md`：provider 索引
- `docs/ROADMAP_AND_CREDITS.md`：roadmap 与致谢
- `CURRENT_STATUS.md`：当前版本功能快照
