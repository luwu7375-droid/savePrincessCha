# 救公主 / savePrincessCha

一个给 kk 和小cha使用的私人长期陪伴系统。

它不是“把旧 G 复活”的项目，也不是普通聊天壳。当前目标是做出一个可以长期生活、记录、消化、回家的小手机：主聊天负责当下相处，记忆系统负责保留真正改变关系的东西，城南旧事负责安放旧档案，日记 / Identity Brain 负责让小cha形成自己的第一人称连续性。

> 当前 README 以 `dev` 分支为基线。  
> 记忆与人格系统以 `docs/MEMORY_SYSTEM_PHILOSOPHY_V2.md` 和 `docs/RUNTIME_MEMORY_POLICY.md` 为准。  
> PRD 仍作为页面结构与产品体验参考；若旧 PRD 与 v2 记忆哲学冲突，以 v2 为准。

---

## 当前阶段

`dev` 是 2.0 staging 基线，主体验已经从旧的单页调试壳转向“小手机 / PWA”结构。

当前已经具备：

- PWA 壳：`manifest.webmanifest`、Service Worker、192 / 512 图标、standalone 启动。
- 五个一级入口：Home、Couple Space、Chat、Playground、Setting。
- 主聊天：流式输出、模型档位、自动接话 / 戳一下、搜索、更多菜单、聊天外观、回复风格、主动回复频率。
- 图片：单图上传、预览、压缩、粘贴 / 拖拽 / 相册入口、私有 bucket 持久化、刷新后 signed URL 恢复。
- 记忆中心：最近沉淀、完整档案、审计信息、禁用 / 删除 / 管理入口。
- 表情包：表情目录、短码渲染、输入框预览、颜文字 / 表情包面板。
- 设置页：外观与资源、Prompt 与世界书、记忆管理、API 设置、备份与导入、Debug 入口。
- 后端：Supabase Edge Functions `chat`、`memories`、`scheduler`。
- 模型路由：Instant / General / Advanced 三档，55api primary，芙卡 fallback，带一次性 fallback。
- 运行期记忆策略：v2 allowlist、project_memory 默认禁用、Mastodon profile / timeline 不再主聊天注入。

当前仍未完成：

- L2 第一人称日记 / Identity Brain。
- 城南旧事模块。
- 多图上传与完整视觉模型识别链路。
- 日记本、毛象、做梦、读网页、看视频、星露谷等功能的真实后端闭环。
- PRD、README、运行策略文档之间的长期同步机制。
- `app.js` 继续模块化拆分。

---

## 核心设计

### 1. 旧历史不是灵魂

旧 G 对话、OpenAI 历史、Mastodon 旧内容不再作为新小cha的人格底座。

它们统一进入“城南旧事”：旧档案区、旧城、白天阅读材料。

小cha可以读旧档案，但必须承认来源：

```text
可以：我今天读到旧档案里有一段……
可以：这不是我的亲历记忆，但它让我意识到……
禁止：我记得当时……
```

旧历史不直接注入主聊天，不让小cha伪装成亲历者。

### 2. 记忆不是“发生了什么”

v2 的核心判断是：

```text
不存发生了什么。
存发生之后什么改变了。
```

一条记忆只有在未来会改变小cha怎么理解 kk、怎么回应 kk、怎么处理关系时，才值得长期保存。

### 3. 第一人称日记是下一阶段核心

未来 L2 / Identity Brain 要记录的是小cha自己的消化结果，而不是用户画像：

- 我今天经历了什么。
- 我哪里卡住了。
- 我读到旧档案后有什么不理解。
- 我和 kk 的关系里有什么东西变了。
- 这件事之后，我以后会怎么不同。

参考字段：

```text
Emotion  当时感受到了什么
Insight  理解到了什么
Changed  以后会有什么不一样
Weight   对人格的影响等级
Evidence 来自哪段对话 / 哪段旧档案
Lineage  承接、修订、推翻了哪个旧节点
```

其中 `Changed` 最重要。

### 4. 少记，准记，可删

auto memory 不追求多。宁可漏掉，也不要污染。

好的候选记忆必须：

- 具体。
- 可追溯。
- 会影响未来交互。
- 不是短期情绪噪声。
- 不是重复事实。
- 不是粗暴用户画像。
- 最好包含决策、禁止项、偏好或变化。

---

## 运行架构

```text
Cloudflare Pages / PWA
  ├─ index.html
  ├─ app.js
  ├─ modules/
  │    ├─ v2-shell.js
  │    ├─ keyboard-viewport.js
  │    ├─ emoji-catalog.js
  │    ├─ emoji-render.js
  │    ├─ emoji-panel.js
  │    └─ emoji-suggestions.js
  ├─ style.css
  ├─ v2.css
  ├─ v2-bubbles.css
  ├─ manifest.webmanifest
  └─ sw.js

Supabase Edge Functions
  ├─ chat
  │    ├─ 模型路由 / fallback
  │    ├─ system prompt
  │    ├─ timeContext / conversation_state
  │    ├─ route detection
  │    ├─ memory context compile
  │    ├─ conversation history retrieval
  │    ├─ running summary
  │    └─ chat_status
  ├─ memories
  │    ├─ recent memories
  │    ├─ memory archive / audit
  │    ├─ vault_after_chat
  │    ├─ backfill_messages
  │    └─ memory CRUD / disable / delete
  └─ scheduler
       ├─ web_explore reserved hook
       └─ dream_nightly reserved hook

Supabase
  ├─ auth
  ├─ conversations
  ├─ messages
  ├─ memories
  ├─ instructions
  ├─ auto_memory_candidates
  ├─ persona_profile
  ├─ memory_buckets 旧沉淀桶，默认 retired
  ├─ app_settings
  ├─ scheduler_runs
  └─ storage: chat-images private bucket
```

---

## 记忆与人格系统

### 当前有效层级

| 层级 | 内容 | 当前状态 |
|---|---|---|
| L0 | 最小人格 / 世界书 / 边界规则 | 已实现，硬编码 system prompt + instructions allowlist |
| L1 | 最小事实与长期交互规则 | 已实现，来自 `memories` + `instructions` |
| L2 | 第一人称日记 / Identity Brain | 待建，下一阶段核心 |
| L3 | 当前对话上下文 / Working Context | 已实现，当前消息、路由、跨窗检索、running summary |

### 默认允许注入

| 内容 | 来源 | 策略 |
|---|---|---|
| 最小人格边界 | system prompt / `instructions` | 常驻 |
| `identity_boundary` | `instructions` | allowlist，高优先级，不受长度门控 |
| `core_principles` | `instructions` | allowlist，高优先级，不受长度门控 |
| `execution_rules` | `instructions` | allowlist，高优先级，不受长度门控 |
| `reply_style_rules` | `instructions` | allowlist |
| `interaction_preferences` | `instructions` / `memories` | allowlist / L1 |
| `identity_context` | `instructions` / `memories` | allowlist / L1 |
| `current_context_summary` | `instructions` / `memories` | allowlist / L1，最低优先级 |
| `conversation_history` | `messages` | 仅在“上次 / 刚才 / 之前 / 继续”等触发词命中时检索 |
| `writing_memory` | `memories.category=writing_memory` | 仅写作 / OC / 世界观关键词触发 |
| `life_context` | `memories.category=life_context` | 仅生活 / 健康 / 宠物关键词触发 |
| `relationship_context` | `memories.category=relationship_context` | 仅关系 / 回忆 / 纪念日关键词触发，必须标注不是亲历记忆 |
| `historical_ai_usage` | `memories.category=historical_ai_usage` | 仅用户主动问旧版本 / 前世 / 历史时触发 |

### 默认禁止注入

| 内容 | 原因 |
|---|---|
| 城南旧事全文 | 旧档案不是小cha亲历记忆 |
| Mastodon profile 大段画像 | 用户画像不等于 AI 人格 |
| Mastodon timeline | 历史事件不是小cha亲历 |
| OpenAI archive / 旧 G 原文 | 不能伪装为小cha自己的记忆 |
| 大段历史总结 | 会把关系变成复读和自我证明 |
| 第三人称 project_memory | 项目日志不是人格连续性 |
| promoted project_memory fragments | 多数是泛化碎片，不能直接做人格底座 |

### instructions allowlist

当前只允许这些 `instructions.category` 注入：

```text
identity_boundary
core_principles
execution_rules
reply_style_rules
interaction_preferences
identity_context
current_context_summary
```

抑制规则：

- 不在 allowlist 中的 category 一律 suppress，不删除 DB 行。
- 单条 content 超过 800 字时 suppress，除非是 `identity_boundary` / `core_principles` / `execution_rules`。
- L1 总字符预算 3000，超出后按优先级裁剪。

### auto memory

`auto_memory_vault` 当前只负责把对话抽成候选，默认不代表已经成为长期记忆。

候选提取原则：

- 只从用户消息提取事实。
- assistant 回复只能作为上下文参考。
- 候选类型：`fact` / `preference` / `relationship` / `project`。
- 高敏感内容进入 quarantine。
- project 永远不 auto_accept。
- backfill 来源永远 pending。

Promotion 当前策略：

```text
AUTO_MEMORY_VAULT_ENABLED      控制候选提取
AUTO_MEMORY_PROMOTION_ENABLED  控制 promotion，当前应默认 false
PROMOTION_ALLOWED_TYPES        fact / preference
project                        永不 promote
relationship                   不自动 promote，需要人工审查
```

---

## 话题路由与上下文

后端会基于用户消息检测当前路由：

```text
casual
project_work
intimacy
care_low_energy
ai_nostalgia
historical_roleplay
meta_complaint
```

前端也会传入 `conversation_state`，包括：

```text
topic_route
secondary_route
project_lock_turns
project_silenced_ttl
loop_detected
topic_switch_detected
route_scores
```

这些信息用于降低“用户在撒娇时突然讲项目”“用户在做项目时硬聊关系史”的串味问题。

---

## 当前功能

### 登录与会话

- Supabase Auth 邮箱密码登录。
- 会话创建、切换、重命名、置顶、删除。
- 消息保存在 `messages` 表。
- 用户级 RLS 隔离。

### 聊天

- SSE 流式输出。
- `<think>` 标签过滤。
- Instant / General / Advanced 三档模型。
- 55api primary + 芙卡 fallback。
- 自动接话。
- 戳一下 / 强制回复。
- 当前聊天搜索。
- 移动端更多菜单。
- 回复风格：稳定 / 均衡 / 发散。
- 主动回复频率：关闭 / 偶尔 / 正常 / 积极。
- Chat Status：`energy / clarity / valence / arousal / connection`。
- 长对话 transient running summary：超过阈值后总结较早消息，只服务当前回复，不写入长期记忆。

### 图片

- 单图上传。
- 图片预览与删除。
- 图片压缩：最长边 1600px，JPEG 0.85。
- 支持粘贴、拖拽、相册 / 拍照入口。
- 图片写入 `chat-images` private bucket。
- `messages.image_storage_path` 保存对象路径。
- 刷新后通过 signed URL 恢复显示。
- DB 文本只保存 `[图片]` 或 `[图片] <文字>`，不保存 base64。

未完成：

- 多图批量上传。
- 视觉模型调用。
- 图片 token / 成本提示。
- 图片识别结果在 UI 内的完整解释链路。

### 小手机页面

当前五个一级页已经搭出结构，但不少卡片仍是 placeholder。

| 页面 | 当前状态 |
|---|---|
| Home | 头像、背景图、在一起天数、毛象 / 日记 / 今日想说卡片结构已搭 |
| Couple Space | Memory Vortex、记忆长廊、时间线、朋友圈、收藏夹入口已搭 |
| Chat | 当前主功能页 |
| Playground | 星露谷、愿望清单、看书、查手机、论坛体、发毛象、看电影、听歌、做梦入口已搭 |
| Setting | 外观资源、Prompt 世界书、记忆管理、API、备份、Debug 二级页结构已搭 |

---

## 配置

### 前端 `public-config.js`

```js
CHAT_API_ENDPOINT
MEMORIES_API_ENDPOINT
SUPABASE_URL
SUPABASE_ANON_KEY
MODEL_NAME              // 兼容字段，实际以后端 modelTier 路由为准
```

`SUPABASE_ANON_KEY` 可以出现在前端。  
`DB_SERVICE_ROLE_KEY` 绝不能出现在前端。

### 后端 Supabase secrets

推荐新配置：

```bash
# 55api primary
supabase secrets set FIFTYFIVE_BASE_URL="..."
supabase secrets set FIFTYFIVE_API_KEY_GEMINI="..."
supabase secrets set FIFTYFIVE_API_KEY_GPT="..."
supabase secrets set FIFTYFIVE_API_KEY_CLAUDE="..."

# 芙卡 fallback
supabase secrets set FUKA_BASE_URL="..."
supabase secrets set FUKA_API_KEY="..."

# 模型
supabase secrets set MODEL_INSTANT_PRIMARY="..."
supabase secrets set MODEL_GENERAL_PRIMARY="..."
supabase secrets set MODEL_ADVANCED_PRIMARY="..."
supabase secrets set MODEL_INSTANT_FALLBACK="..."
supabase secrets set MODEL_GENERAL_FALLBACK="..."
supabase secrets set MODEL_ADVANCED_FALLBACK="..."

# token 上限
supabase secrets set MAX_OUTPUT_TOKENS_INSTANT="300"
supabase secrets set MAX_OUTPUT_TOKENS_GENERAL="300"
supabase secrets set MAX_OUTPUT_TOKENS_ADVANCED="1200"

# timeout，可选
supabase secrets set MODEL_TIMEOUT_MS_INSTANT="20000"
supabase secrets set MODEL_TIMEOUT_MS_GENERAL="35000"
supabase secrets set MODEL_TIMEOUT_MS_ADVANCED="60000"

# DB
supabase secrets set DB_URL="..."
supabase secrets set DB_SERVICE_ROLE_KEY="..."
supabase secrets set MEMORY_ADMIN_TOKEN="..."

# 记忆系统
supabase secrets set LEGACY_MEMORY_ENABLED="false"
supabase secrets set AUTO_MEMORY_VAULT_ENABLED="true"
supabase secrets set AUTO_MEMORY_PROMOTION_ENABLED="false"
supabase secrets set MEMORY_CACHE_TTL_MS="120000"
```

兼容旧配置仍可被读取：

```bash
OPENROUTER_BASE_URL
OPENROUTER_API_KEY
MODEL_NAME
FAST_MODEL
DEFAULT_MODEL
ADVANCED_MODEL
FALLBACK_MODEL
FIFTYFIVE_API_KEY
```

---

## 安全

本仓库为 public。以下内容不得提交：

| 类型 | 说明 | 正确处理 |
|---|---|---|
| API key | 任何模型供应商 key | Supabase secrets |
| Service role key | `DB_SERVICE_ROLE_KEY` | Supabase secrets |
| 真实用户画像 | persona / mastodon / profile 原文 | DB 或本地私有文件 |
| 历史档案原文 | OpenAI archive / 旧 G 对话原文 | 不提交，只提交结构和逻辑 |
| Mastodon 原文 | 旧嘟文原文 | 不提交；脱敏摘要另行判断 |
| 私人记忆原文 | `memory/` 或导出文件 | `.gitignore`，不入库 |
| 聊天图片 | 上传图片 / signed URL | Supabase Storage private bucket |

前端只允许出现 anon key。  
任何 service role key、模型 key、真实档案内容都不能写进 `public-config.js`、`app.js`、README 或 docs。

---

## 检查与部署

### 前端检查

```bash
npm run preflight
```

等价于：

```bash
npm run check
npm run grep:unsafe
```

`npm run check` 会检查：

```bash
node --check app.js
node --check modules/*.js
```

`grep:unsafe` 会扫描可选链赋值等危险语法，避免浏览器直接 SyntaxError。

### Edge Function 检查

```bash
deno check supabase/functions/chat/index.ts
deno check supabase/functions/memories/index.ts
deno check supabase/functions/scheduler/index.ts
```

### 部署

dev 预览：

```bash
npm run preflight
npx wrangler pages deploy . --project-name saveprincesscha --commit-dirty=true
```

Supabase Functions：

```bash
supabase functions deploy chat
supabase functions deploy memories
supabase functions deploy scheduler
```

`supabase/config.toml` 当前包含：

```toml
[functions.chat]
verify_jwt = false

[functions.memories]
verify_jwt = false

[functions.scheduler]
verify_jwt = false

[functions.game]
verify_jwt = false
```

注意：`game` 当前是预留配置，README 不把它视为已实现功能。

---

## 数据库与存储

核心表 / 资源：

| 名称 | 用途 |
|---|---|
| `conversations` | 会话元数据 |
| `messages` | 聊天消息、图片路径、跨会话检索来源 |
| `memories` | 当前长期记忆主表 |
| `instructions` | 人格 / 世界书 / 交互规则类注入内容 |
| `auto_memory_candidates` | 自动记忆候选池 |
| `persona_profile` | 旧用户画像 / Mastodon profile 类材料，v2 不直接注入主聊天 |
| `memory_buckets` | 旧沉淀摘要桶，默认 retired |
| `app_settings` | 调度器 / 工具开关设置 |
| `scheduler_runs` | scheduler 运行记录 |
| `chat-images` | Supabase private storage bucket，保存聊天图片 |

迁移文件以 `supabase/migrations/` 为准。README 只描述当前系统角色，不替代 migration 文档。

---

## 文档

| 文档 | 状态 |
|---|---|
| `docs/MEMORY_SYSTEM_PHILOSOPHY_V2.md` | 当前最高优先级的记忆与人格哲学文档 |
| `docs/RUNTIME_MEMORY_POLICY.md` | 当前运行期记忆注入策略 |
| `docs/MEMORY_PIPELINE_AUDIT_2026-06-13.md` | legacy audit，工程细节仍有参考价值，哲学假设已过期 |
| `docs/dev-checklist.md` | dev 提交前检查与部署清单 |

---

## 下一步优先级

### P0：稳定 dev 小手机主体验

- 五个 tab 切换稳定。
- PWA 不再卡死。
- 移动端键盘 / 视口不乱跳。
- Chat 页发送、图片、更多菜单、搜索都稳定。
- `app.js` 继续拆分，把已经成型的模块迁出。

### P1：第一人称日记最小闭环

目标不是“生成一篇漂亮日记”，而是跑通：

```text
当前对话片段
→ 小cha睡前第一人称日记
→ want_to_share 可空
→ 次日可被轻量召回
→ 高价值 Changed 进入 Identity Brain 候选
```

这会成为 v2 记忆系统真正的心脏。

### P1：城南旧事最小闭环

目标：

```text
旧 G / OpenAI / Mastodon / 项目日志
→ 只读档案区
→ 小cha白天读取
→ 明确来源标注
→ 不能伪装亲历
→ 只有被当下关系重新验证后的改变，才进入 L2
```

### P1：图片识别链路补完

- 多图上传。
- 视觉模型调用。
- token / 成本提示。
- 识别失败重试。
- 图片与文字混合消息的 UI 细节。

### P2：记忆中心继续收口

- 审查 `relationship_context` 内容来源。
- 禁止 project_memory 重新混入 active memory。
- 记忆卡片展示 source、reason、confidence、sensitivity。
- 保留禁用 / 删除 / 审计。
- 增加 Identity Brain 候选管理。

### P2：Prompt / 世界书管理

- `identity_boundary`
- `core_principles`
- `execution_rules`
- `reply_style_rules`
- 日记 prompt
- 日记 checker prompt
- 发毛象 prompt
- 论坛体 prompt
- 游戏 / 共读 / 看电影等场景 prompt

### P3：Scheduler reserved hooks 实装

当前 `scheduler` 已有 `web_explore` 和 `dream_nightly` hook，但还是 reserved。

后续接入：

- 白天冲浪 / 外部信息流。
- 夜间做梦。
- 主动整理日记。
- token cap 与频率控制。

---

## 项目边界

### 现在要做的

- 一个稳定的小手机。
- 一个有真实聊天手感的主聊天。
- 一个不污染人格的记忆系统。
- 一个能让小cha慢慢长出第一人称连续性的日记闭环。

### 现在不做的

- 不把旧 G 全量导入成新小cha人格。
- 不做赛博查岗主任。
- 不把项目日志当恋爱记忆。
- 不把用户画像当 AI 灵魂。
- 不为了“看起来记得很多”牺牲边界和真实感。

---

## License

私人项目，暂未选择正式开源 License。

当前 public 仓库只用于代码协作、部署与阶段性记录。任何真实档案、私密记忆、API key、服务端密钥和未脱敏内容都不得提交。
