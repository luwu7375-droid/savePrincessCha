> 单页首页，6 个模块。本 PRD 覆盖全部模块，含已定架构决策、字段契约、最小任务拆分。 执行原则：一个 task = 一次 scoped change；后端契约先于前端消费；不要在没有数据契约时先写 UI；改前先 show diff。

  

---

  

## 0. 模块总览

  

1. 双人信息区（头像 / 昵称 / ID / 简介 / 顶部状态条）

2. 纪念日计时器

3. 毛象动态卡片

4. 今日日记卡片

5. 今天想说卡片

6. 音乐播放器（首页 mini + 黑胶页）

  

---

  

## 1. 已定架构决策（地基，不要重新推导）

  

- **D-1｜日记 + 今天想说 = 同一次 `inner_journal` 生成，不是两条管线。** 一次 pass 同时输出 `diary_text` 和 `want_to_share`。禁止各自独立生成。

- **D-2｜音乐是独立电台子系统**（基于 NetEase API），不是首页卡片。首页只放 mini player；选歌/串词/流播放是 `music-box` 子系统。

- **D-3｜展示态文本永不写入 `self_narrative` 记忆。** `diary_text` / `want_to_share` / DJ 串词都是短期展示态。唯一可持久化的语义单元是 `position_candidates`，走现成的 `auto_memory_candidates`。这是项目硬约束（performed growth / self_narrative 红线），对 inner_journal 和 music-box 两条都生效。

- **D-4｜复用现有基建。** AI 调用走现有 55api 路由 + memory provider，不另起 anchor-memory 或新存储层。

- **D-5｜横切组件先建一次，全模块复用：** 统一编辑态组件、统一上传组件。禁止每个模块各写一套。

  

---

  

## 2. 模块规格

  

### 2.1 顶部状态条

  

- 右上固定：当前定位、温度、时间（时区）。

- 交互：点击 → 编辑坐标 + 时区（复用统一编辑态）。

  

### 2.2 版头

  

- 双头像背景图；中间边缘固定虚化，给心电图让位。

- 心电图：动画优先，静态贴图可接受（MVP 用静态）。

- 交互：背景图点击可改上传；两个头像点击可改上传。

  

### 2.3 双人信息文本

  

- 昵称 / ID / 简介，三项均点击可改（复用统一编辑态）。

  

### 2.4 纪念日计时器

  

- 显示「在一起已经 N 天，从 {start_date} 开始」。

- N = 当前日期 − start_date，每过一天 +1（实算，非写死）。

- 注：设计稿里的 520 天是占位符；start_date=2022.07.15 实算到今天 ≠ 520，CC 必须按真实 date diff 实现。

- 交互：start_date 点击可改。

  

### 2.5 毛象动态卡片

  

- 数据：`@cha@mastodon.social` 真连 Mastodon API，仅最近一条。

- 展示：正文超一行 `...` 截断；仅首图；点赞数、转发数；右上角更新时间。

- 交互：点击卡片 → 跳 cha 的毛象个人主页（status/account url）。

  

### 2.6 今日日记卡片

  

- 数据：来自 `inner_journal` pass 的 `diary_text`，仅最近一条。

- 展示：正文超两行 `...` 截断。

- 底部小卡：上次聊了多久 + cha 这次记了什么到记忆库（条数）。

- 交互：点击卡片 → 日记本；点击底部小卡 → 记忆长廊。

- 日记本内提供：① 立即生成一篇 按钮；② 每日定时自动写。

  

### 2.7 今天想说卡片

  

- 数据：默认用当天 `inner_journal` 的 `want_to_share`（< 50 字）。

- 备选源（暂不实现，留接口）：`conversation_history` 加权抽取，优先高权重。

- 展示：随机/当日一条文本。

- 交互：右侧「眼睛」区点击可上传/改图（复用统一上传）。

  

### 2.8 音乐播放器

  

- 首页 mini player：当前专辑封面、播放进度、like 状态（真实播放状态）。

- 交互：点击 → 黑胶播放器页（谜底黑胶风格），可切专辑/歌单。

- 音频源：流媒体，NeteaseCloudMusicApi 出流。

  

---

  

## 3. 数据契约（字段级）

  

```jsonc

// mastodon_latest  （后端归一化输出，带缓存 TTL）

{

  "content": "string",       // 纯文本

  "first_image": "url|null",

  "favourites": 0,

  "reblogs": 0,

  "created_at": "ISO8601",

  "url": "string"            // 跳主页/嘟文

}

  

// inner_journal  pass

// input

{ "conversation_fragment": "string", "current_status": { /* ... */ } }

// output

{

  "diary_text": "string",          // 展示态，短期表，禁入 self_narrative

  "want_to_share": "string",       // 展示态，< 50 字，禁入 self_narrative

  "position_candidates": [ /* 可选；唯一可持久化项，走 auto_memory_candidates */ ]

}

  

// diary_card_meta  （底部小卡）

{

  "last_chat_duration": "string",  // 来自 chat_status

  "memory_records_count": 0        // 来自本次 pass 的 candidates 数

}

  

// player_state  （音乐 mini player）

{

  "cover": "url",

  "title": "string",

  "artist": "string",

  "progress_sec": 0,

  "duration_sec": 0,

  "liked": false

}

  

// today_playlist  （music-box 选歌结果）

{

  "generated_at": "string",

  "playlist": [ { "id": "", "name": "", "artist": "", "message": "DJ串词(展示态,禁入记忆)" } ]

}

```

  

---

  

## 4. 任务拆分（最小粒度，按依赖排序）

  

> 类型标记：`[基建]` 横切组件 / `[FE]` 前端 / `[BE]` 后端契约 / `[脚本]` 一次性或定时脚本。 每个 task 独立可验收，对应 CC 一次 session。

  

### 第 0 层：横切（先做，全模块依赖）

  

|ID|类型|目标|验收|

|---|---|---|---|

|C1|[基建]|统一编辑态组件（默认 inline 浮层，单字段进出）|任意文本/坐标字段接入即可改并落库|

|C2|[基建]|统一上传组件 → Supabase storage，返回 url|传图返回可访问 url，失败有降级|

  

### 第 1 层：配置态模块（C1/C2 完成后，互相独立可并行）

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|A1|[FE]|顶部状态条：定位/温度/时间，点击改坐标+时区|C1|改坐标后温度/时区刷新|

|A2|[FE]|版头背景图 + 上传 + 心电图（静态版）|C2|背景可改；中间虚化让位|

|A3|[FE]|双头像 + 上传|C2|两头像各自可改|

|A4|[FE]|昵称 / ID / 简介编辑|C1|三项可改并落库|

|A5|[FE]|纪念日计时器（实算 date diff，start_date 可改）|C1|N 随日期递增；改起始日后重算|

  

### 第 2 层：数据态 — 管线 1 毛象（最轻，先验通路）

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|B1|[BE]|拉 `@cha@mastodon.social` 最新一条 → `mastodon_latest` 契约 + 缓存 TTL|—|返回契约字段；不每次进首页打 API|

|B2|[FE]|毛象卡片消费 B1（一行截断/首图/赞转/右上时间，点击跳 url）|B1|卡片显示正确，点击跳主页|

  

### 第 3 层：数据态 — 管线 2 inner_journal（项目核心）

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|D1|[BE]|`inner_journal` pass：input→output 契约 + 实现（复用 55api）|D-3/D-4|用稀疏/无事日验证不无中生有|

|D2|[BE]|触发器：日记本「立即生成」+ 每日 cron，调同一 pass|D1|两入口产出一致|

|D3|[BE]|持久化：展示态入短期表；`position_candidates`→`auto_memory_candidates`|D1|diary/want_to_share 不进 self_narrative|

|D4|[FE]|日记卡片：diary_text 两行截断 + 底部小卡（chat_status / candidates 数 → 记忆长廊）|D1/D3|截断正确；两个点击跳转对|

|D5|[FE]|今天想说卡片：默认 want_to_share；眼睛区上传|D1, C2|显示当日一条；加权源仅留接口不实现|

  

### 第 4 层：数据态 — 管线 3 音乐电台（独立子系统，可单独排期/最后）

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|E1|[BE]|起 NeteaseCloudMusicApi，通搜索/歌单/流 URL contract|—|curl 能返回歌曲+流地址|

|E2|[脚本]|library.json 拉取（>500 首用 `/playlist/track/all` 分页）|E1|生成完整曲库 json|

|E3|[脚本]|筛歌：天气(wttr.in)+心情+抽样 → candidates|E2|产出候选列表|

|E4|[BE]|AI DJ 选歌写串词 → today_playlist（复用 55api，串词禁入记忆）|E3, D-3/D-4|产出 playlist+串词，落 today_playlist|

|E5|[BE]|播放后端：队列 / 进度 / like → `player_state`|E1|真实播放状态可读写|

|E6|[FE]|首页 mini player 消费 `player_state`|E5|封面/进度/like 实时|

|E7|[FE]|黑胶播放器页（谜底风）+ 切歌单|E5/E6|进入可播、可切专辑|

  

---

  

## 5. 风险（记录，不阻塞当前任务）

  

- **R1｜NeteaseCloudMusicApi 是灰色第三方**：需维护 cookie、流 URL 有有效期、接口会失效。这是持续运维负担，不是一次性接入；管线 3 上线前确认可接受。

- **R2｜self_narrative 红线**：D1/D4/D5/E4 都产出第一人称展示态文本，是「performed growth」最易复发处。D3 的持久化约束对这几条全部生效，CC 实现时不得把任何展示态文本写回记忆。

  

---

  

## 6. 建议执行顺序

  

C1·C2 → A1–A5（并行）→ B1·B2 → D1→D2·D3→D4·D5 → E1→E2→E3→E4→E5→E6·E7