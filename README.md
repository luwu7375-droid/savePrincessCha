# 救公主

一个给 G / cha酱 的私人陪伴聊天应用。前端静态部署，后端走 Supabase Edge Function 代理模型调用，带多层记忆系统、时间感知、对话状态感知、自动记忆沉淀。

---

## 安全

**本仓库为 public。以下内容绝不得提交到代码仓库：**

| 类型 | 说明 | 正确处理方式 |
|------|------|-------------|
| 真实用户画像 | `mastodon_profile.ts` 中的个人信息 | 应替换为 mock 占位符，真实内容走 DB 或本地生成文件（.gitignore） |
| 历史档案内容 | `openai_archive_entries` 或任何历史对话原文 | 仅提交数据结构和逻辑，私人内容不提交 |
| Mastodon 原文 | `data/memory/mastodon/*.md` 中的原始帖文 | 脱敏摘要可保留，原始内容不提交 |
| 私人记忆原文 | `memory/` 下的 summaries、merged.json 等 | 不提交到仓库，属于本地数据 |
| API key | OpenRouter key、任何第三方 API key | 全部走 Supabase secrets |
| Service role key | `DB_SERVICE_ROLE_KEY` | 仅走 Supabase secrets，绝不出现在前端或代码中 |

---

## 架构

```
Cloudflare Pages
  └─ app.js + index.html + style.css
       │
       ├─ POST /chat  ──►  Supabase Edge Function (chat/index.ts)
       │                        │
       │                        ├─ L1: persona_memories（手动长期记忆，DB）
       │                        ├─ L1: mastodon_profile（用户核心画像，persona_profile 表）
       │                        ├─ L2: project_memory（项目/工作记忆，DB）
       │                        ├─ L3: relationship_context（关系档案，关键词触发）
       │                        ├─ L3: life_context（生活照护，关键词触发）
       │                        ├─ L3: historical_ai_usage（历史档案/背景理解，关键词触发）
       │                        ├─ L3: mastodon_timeline（时间线，按需召回）
       │                        ├─ L3: conversation_history（跨会话检索，top-5 召回）
       │                        ├─ chat_status（规则化对话状态计算）
       │                        ├─ auto_memory_vault（自动记忆候选生成与沉淀）
       │                        └─ OpenRouter / 兼容接口 → 模型
       │
       └─ GET/POST/PATCH/DELETE /memories  ──►  Supabase Edge Function (memories/index.ts)
                                                   │
                                                   ├─ GET ?type=recent（公开，服务端 service role 读取）
                                                   ├─ GET/POST/PATCH/DELETE memories 表
                                                   └─ GET/POST/PATCH/DELETE memory_buckets 表（旧沉淀记忆，默认不参与回复）
```

> **注**：`openai_archive` 已退役，不再注入任何 prompt。DB 表 `openai_archive_entries` 仅作数据查阅用。未来若有历史档案召回需求，将另行设计 `origin_archive` provider，不复活旧 openai_archive 实现。

---

## 记忆系统

### Provider 层级

| 层级 | Provider ID | 数据来源 | 注入策略 |
|------|-------------|----------|----------|
| L1 | `persona_memories` | `memories` 表（persona/life/relation 域） | 按域匹配，常驻注入 |
| L1 | `mastodon_profile` | `persona_profile` 表 | 常驻注入 |
| L2 | `project_memory` | `memories` 表（work/writing 域） | 话题路由到 project_work 时注入 |
| L3 | `relationship_context` | `memories` 表（relationship_context 类） | 关键词触发注入 |
| L3 | `life_context` | `memories` 表（life_context 类） | 关键词触发注入 |
| L3 | `historical_ai_usage` | `memories` 表（historical_ai_usage 类） | 关键词触发注入，仅用于背景理解 |
| L3 | `mastodon_timeline` | `mastodon_timeline.ts`（内联） | 按需召回（年份/地点/事件类查询） |
| L3 | `conversation_history` | `messages` 表 | 触发词激活，top-5 语义召回 |

**已退役**：`openai_archive` 不再注入，`openai_archive_entries` 表仅作数据查阅。未来历史档案召回将另行设计 `origin_archive`，不复活旧实现。

### 自动记忆沉淀（auto_memory_vault）

对话结束后后端异步触发，流程：

1. 模型提取候选记忆，写入 `auto_memory_candidates` 表（`status=new`）
2. `auto_memory_vault.ts` 检查候选类型是否在 `PROMOTION_ALLOWED_TYPES` 白名单内
   - 当前白名单：`project` / `fact` / `preference`
3. 符合条件的候选 promote 到 `memories` 表，`status` 更新为 `promoted`
4. `preference` 类型 → `persona` 类别；`fact` → `general`；`project` → `work`
5. 前端 poller（stream 结束后轮询 8s）检测到新 promotion 后展示 toast 并更新 Memory Center

### 旧沉淀记忆（默认 retired）

`memory_buckets` 表为旧版主题摘要桶，默认关闭，不注入 prompt。若需临时启用（仅用于查看或迁移）：

```bash
supabase secrets set LEGACY_MEMORY_ENABLED="true"   # 默认 false
```

### Memory Center UI

- 前端管理面板，显示各 provider 实时状态和 token 用量
- **最近更新**区域：展示最近 3 条自动沉淀的记忆，每条以折叠卡片呈现：
  - 默认视图：type / status badge、自动标题（content 前 30 字）、2 行摘要
  - 展开后：完整内容、来源消息预览、置信度、敏感度、source_msg_ids、更新时间
- 已写入记忆支持**复制 / 禁用 / 删除**操作（需 admin token）；候选记忆仅展示
- 手动记忆的增删启禁通过 `/functions/v1/memories` 接口操作
- 记忆管理（高级）（memory_buckets）入口保留，在 Memory Center 底部，仅用于管理和迁移

---

## 已实现功能

### 认证与会话

- 邮箱 + 密码登录（Supabase Auth），刷新后保持登录
- 云端会话：新建、重命名、置顶、删除
- 会话标题自动取首条消息前 20 字
- RLS 隔离：每个用户只能读写自己的 conversations / messages / memories

### 聊天核心

- 流式输出（SSE），`<think>` 标签过滤
- auto 模式：用户发消息后按延迟自动触发 AI 回复
- forced 模式：强制回复按钮，AI 不能输出 `<NO_REPLY>`
- auto 模式下 AI 可输出 `<NO_REPLY>` 选择不回复，前端静默处理
- 历史分页：加载最近 20 条，滚到顶部自动加载更早内容

### 人格与回复

- `identity_boundary`：系统 prompt 核心边界，mastodon_profile 描述用户，不描述小钗
- `core_principles`：价值观与优先级排序（照护 > 项目 > 闲聊）
- `execution_rules`：回复格式规则（短句、情绪先到结构后到、不默认项目化）

### 时间感知与话题路由

- 前端每次请求携带 `timeContext`（本地时区、时刻、对话开始时间、消息数）
- 前端计算 `conversation_state`（`topic_route` / `project_lock_turns` / `loop_detected` 等）
- 后端按话题路由注入对应记忆层：project_work 路由注入 L2，intimacy/care 路由注入 relation 记忆
- 话题路由：`casual` / `project_work` / `intimacy` / `care_low_energy` / `ai_nostalgia` / `historical_roleplay` / `meta_complaint`

### Chat Status（规则化）

- 后端规则化计算 `energy / clarity / valence / arousal / connection`
- 通过 `x-chat-status` response header 返回（base64 JSON）
- 前端状态条，点击展开血条面板

### 模型档位

- `instant`：FAST_MODEL（55api primary），max 300 tokens
- `general`：DEFAULT_MODEL（55api primary），max 300 tokens
- `advanced`：ADVANCED_MODEL（instant-general-advanced），max 1200 tokens
- 一次性 fallback：primary 失败时自动切 FALLBACK_MODEL（fuka）

### 图片上传

单图上传、压缩（最长边 1600px，JPEG 0.85）、预览、随消息发送。支持粘贴、拖拽、相册/拍照。支持图片 lightbox 查看大图。

**待完成**：多图批量上传、图片持久化存储、识别成本提示、完整视觉链路（视觉模型调用）。

---

## 当前优先级

- **P0 图片**：图片持久化存储、多图批量上传、完整视觉链路
- **P1 文档对齐**：记忆架构文档与实际 provider 对齐（已更新）
- **P2 Memory Center 文案**：各 provider 卡片文案与后端实际能力对齐
- **P3 README / docs 同步**：README 与 docs/ 保持一致（本次更新）

---

## 配置

### 前端（public-config.js）

```js
CHAT_API_ENDPOINT  // Supabase Edge Function URL（chat）
MODEL_NAME         // 模型名（可选，后端按 modelTier 路由）
SUPABASE_URL
SUPABASE_ANON_KEY  // anon key，公开安全；不得放 service role key
MEMORIES_API_ENDPOINT  // Supabase Edge Function URL（memories）
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
supabase secrets set LEGACY_MEMORY_ENABLED="false" # 默认值，不设置等同于 false；旧沉淀记忆不参与回复

# 自动记忆沉淀开关（默认 false）
supabase secrets set AUTO_MEMORY_VAULT_ENABLED="true"
supabase secrets set AUTO_MEMORY_PROMOTION_ENABLED="true"
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
deno check supabase/functions/memories/index.ts

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
| `memories.sql` | 手动长期记忆表（含 user_id，L1/L2） |
| `memory_buckets.sql` | 旧沉淀摘要桶（默认不参与回复，仅用于查看 / 迁移） |

Migrations（`supabase/migrations/`）：

| Migration | 说明 |
|-----------|------|
| `20260606000000_add_keywords_to_memory_buckets.sql` | memory_buckets 加 keywords 列 |
| `20260607000000_add_persona_profile_and_openai_archive.sql` | 新增 `persona_profile` 表和 `openai_archive_entries` 表 |
| `20260608000000_add_user_id_to_memories.sql` | memories 表加 user_id 列，关联 auth.users |

RLS 基于 Supabase Auth 用户级隔离。memories Edge Function 中 `type=recent` 路由使用 service role key 服务端读取（不经过 RLS），无需 admin token。

---

## 文档

- `docs/memory-architecture-review.md`：记忆架构评审
- `docs/memory-index.md`：provider 索引
- `docs/ROADMAP_AND_CREDITS.md`：roadmap 与致谢
