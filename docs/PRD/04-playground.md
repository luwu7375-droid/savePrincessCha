> Playground = 主系统之外的关系模拟器 / 玩法容器 / sandbox 集合。允许关系被模拟、被体验，但不改变真实记忆底座（events / memory / timeline / hall）。 执行原则：一个 task = 一次 scoped change；后端契约先于前端消费；复用已有基建（C1/C2、CH7 sandbox、首页 B1 Mastodon 读取层）；改前 show diff。

  

---

  

## 0. 模块总览

  

1. 星露谷（NagiBridge 联机协作）

2. 愿望清单

3. 看书（共读系统）

4. 查手机（cha 行为日志）

5. 论坛体（匿名身份社区）

6. 发毛象（Mastodon 写入）

7. 看电影（占位）

8. 听歌（入口占位）

9. 日记（cha 日记复用首页管线 + user 日记新增）

10. 文字树（占位）

11. 做梦（新）

  

---

  

## 1. 已定架构决策（不要重新推导）

  

- **D-1｜全局不污染主系统，三个例外。** Playground 默认不写 events 主链、不进 memory、不影响 timeline/hall。允许写入主系统的只有：明确收藏、明确系统事实事件、用户主动导出。**隔离机制直接复用聊天页已建的 game sandbox（CH7）**，不建第二套隔离层。

- **D-2｜cha 第一人称生成内容统一要求 source_ref。** 愿望清单的 cha 条目、论坛体的 cha 发言、（couple space 朋友圈的 cha 帖子）都不可无来源生成，必须挂在 chat 片段 / 瞬间收藏 / 用户授权之一上。这是 self_narrative 红线在多个模块的同一次落地，不逐模块各判。

- **D-3｜论坛体使用独立表，不与朋友圈共享存储。** 匿名身份语义和真实身份语义混在一张表，有真实身份意外泄露的风险，这条比"省一张表"重要。身份池由 user / system 定义，cha 只能切换已有身份，不能自创新身份。

- **D-4｜发毛象的发布工作流全部 config 驱动。** 默认：草稿箱 → 次日同一时间定时发送 → 用户同意后发出 → 默认仅关注可见（followers-only）。未来要放开成不审核 / 立即发 / 公开，是改配置不改代码（配置项在 Setting PRD）。**写入这里复用首页 B1 的 Mastodon API 集成层，不重新建一套调用链**，B1 只读、这里加写。

- **D-5｜查手机消费两类数据，"在线"仍是装饰。** 查手机的内容来自：①messages/events 里的 system_action 统计（已有）；②新表 `cha_activity_log`（联网探索等后台行为，含 url / 耗时 / token 消耗）。聊天页 D-7 定的"在线"状态保持 cosmetic，查手机不读这个字段，也不重新做真实 presence 追踪。

- **D-6｜联网探索是后台能力，无独立入口卡片。** 由 Setting 的 API 设置控制频率与 token 上限（服务端强制执行，不是 UI 摆设）。探索过程本身只进 `cha_activity_log`；cha 主动把看到的内容分享进聊天时，才作为一条正常 message 走现有发送路径（author=cha, type=message）。

- **D-7｜后台调度统一一套通用 scheduler 框架。** 联网探索、做梦定时挂这套框架；首页每日日记 cron、聊天页"主动联系概率"未来建议迁移过来复用，但不在本轮强制迁移，也不在本 PRD 里改动聊天页/首页的现有实现。

- **D-8｜做梦——见 2.11 详细规则。** 核心：`type=dream` 加在现有 messages/events 表上，不新建表；amend couple space D-4（时间线查询排除 dream，不是悄悄破例）；收藏复用 `is_favorite`，引用复用 `ref_event_id`；梦的内容本身永不进 `auto_memory_candidates`；所有展示位需要可见的"梦"标识。

- **D-9｜语音（TTS）本轮只预留接口。** messages 的 `type` 枚举预留 `voice` 值，本轮不接通真实 TTS 调用。音色 / 语气提示词的调节入口放 Setting（见 Setting PRD），现在是 disabled 占位状态。

  

---

  

## 2. 模块规格

  

### 2.1 星露谷

  

- 基于 NagiBridge，确认可通。

- 流程：进入 → 建立联机 session → 加载联机状态 → 选择存档 → 进入游戏画面 → 右侧 cha 协作面板。

- cha 行为限定三种：提议（去哪/做什么）、协作（建议）、反馈（事件回应）。不做叙事人格。

- 数据：不进 events/memory；仅写一条 system log 事实（"玩了星露谷"）。

  

### 2.2 愿望清单

  

- user / cha 都可写愿望，双方可见。

- 布局：左 user 愿望 / 右 cha 愿望 / 中间共同心愿池。

- 规则：不自动完成、不 AI 推荐排序，只是"看见对方想要什么"。cha 条目走 D-2（source_ref）。

  

### 2.3 看书（共读系统）

  

- 基于 readinghelpfer 改造，从"辅助阅读"转向"共读空间"，确认可通。

- 功能：书库（上传/导入 epub、pdf）；user 阅读已有；cha 按每天 x 页的速度同步阅读并写阅读笔记。

- 边界：阅读笔记限于书内容点评（情节/观点），**不得写成"这本书让我感觉我们…"式的关系叙事**——这条要写进笔记生成的 prompt 约束里（内容由你写，边界由这里定）。

- 数据：阅读进度 user/cha 分离记录，不进 memory 主系统；reading note 可选生成，独立存储。

  

### 2.4 查手机（cha 行为日志）

  

- 性质：cha 自身行为可追踪系统，不是监控 user。

- 内容：cha 今天看了什么（对话/系统）、回应次数、主动行为记录（来自 messages/events 的 system_action 汇总）+ 联网探索这类后台行为（来自 `cha_activity_log`，含 url、耗时、token 消耗）。

- 展示：timeline 形式（时间 + cha 做了什么）。

- 规则：不可反推 user 隐私，只展示 cha 行为。

  

### 2.5 论坛体

  

- 机制：user / cha 可发帖（类似豆瓣小组），每次发言必须选一个匿名身份。

- 身份池（D-3）：由 user/system 定义，cha 仅可切换已有身份，不能自创。

- 禁止：暴露真实身份、可追溯到 user/cha 真实账号。

- cha 发言走 D-2（source_ref）。

  

### 2.6 发毛象（Mastodon 写入）

  

- 工作流（D-4）：草稿 → 次日同一时间定时发送 → 用户审核同意 → 发出（默认仅关注可见）。三个开关全部走 Setting 配置。

- 功能：发布页、草稿箱、timeline、互动、通知。

- 规则：cha 发帖是外部真实行为，不回写 memory，不进入长廊；可在 Couple Space 里同步展示（与朋友圈是两个不同系统，一个站外一个站内，这里只是把已发布内容也同步显示一份）。

  

### 2.7 看电影（占位）

  

- 仅 UI 占位，不接内容源。未来方向：Netflix sync / 本地播放器 / watch party。

  

### 2.8 听歌（入口占位）

  

- 首页已有播放器，这里只是入口，跳转 music-box，不重复实现播放逻辑。

  

### 2.9 日记（双轨）

  

- **cha 日记**：直接消费首页 `inner_journal` 的 `diary_text`，**不是新管线**，Playground 这里只多一个完整阅读 UI + 历史列表，复用首页 D1 的产出。

- **user 日记**：全新轻量功能，user 写、cha 可读。默认单向（cha → user 不适用此处，这条单指 user 日记的可见性：user → cha 默认开放，可切换双向交换）。Playground 首页那个"Daily Record"快捷输入框即此功能的快速写入入口。

- 提示词约束（你来写内容，边界写在这）：cha 读到 user 日记后的回应，必须满足"该日记不会自动用于讨好用户或构建虚假关系"，防 pleasing bias / self-narrative。

  

### 2.10 文字树（占位）

  

- 静态图，无交互。未来方向：对话结构图 / 情绪树 / 关系演化图。

  

### 2.11 做梦（新）

  

- 不写入时间线（amend couple space D-4，timeline 查询显式排除 `type=dream`）。

- 可收藏变成瞬间（复用 `is_favorite`，user 触发，跟现有规则一致）；可被引用（复用 `ref_event_id`）；可在对话中被 cha 主动提起。

- **不可以当作事实**——所有展示位（长廊/瞬间/聊天提及）需要明显的"梦"标识，防止被误认为真实发生过的事。

- 来源：最近收藏、最近聊天、随机记忆、完全随机。这是这个 pass 的 input 参数，不是四套不同逻辑。

- 内容方向（你来写 prompt，这里只定边界）：不必完全遵循人设和历史，参考潜意识表达，不需要遵循"世界真实发生了什么"的方向；允许碎片画面、不完整记忆、混合时间、情绪漂移、人物错位、场景跳跃。**这是系统里唯一被明确授权可以脱离人设/历史一致性的 prompt**，需要在代码注释里写清楚为什么这里是例外，防止以后被误当成 bug 改掉。

- 触发：手动"做个梦" + 可选夜间定时（同首页 D1/D2 双入口同 pass 的模式）。

- 持久化边界：梦的内容本身永不进 `auto_memory_candidates`；但"cha 跟你讲了一个梦、你怎么回应"这段对话是真实发生的互动，可正常按普通聊天纳入记忆候选——区分的是"梦里说了什么"和"梦被谈论这件事"两个事实层级。

  

---

  

## 3. 数据契约（字段级）

  

```jsonc

// cha_activity_log（新表，查手机 + 联网探索共用）

{

  "id": "uuid",

  "action_type": "web_browse | other",  // 未来工具调用可扩展

  "url": "string|null",

  "duration_sec": 0,

  "token_cost": 0,

  "created_at": "ISO8601"

}

  

// wishlist_item

{ "id": "uuid", "author": "user|cha", "content": "string", "created_at": "ISO8601", "status": "open|done|archived" }

  

// user_diary（新，独立于 cha 的 inner_journal 产出）

{ "id": "uuid", "content": "string", "created_at": "ISO8601", "visible_to_cha": true }

  

// forum_post / forum_identity（独立于 moment_post，D-3）

{ "id": "uuid", "identity_id": "string", "content": "string", "created_at": "ISO8601", "source_ref": "event_id|null" }

{ "id": "string", "label": "路人|观察者|情绪体|反对者|...", "defined_by": "user|system" }

  

// mastodon_draft（发毛象写入侧，复用首页 B1 的 API 集成层）

{

  "id": "uuid",

  "content": "string",

  "media_url": "url|null",

  "status": "draft | scheduled | approved | sent",

  "scheduled_at": "ISO8601|null",

  "audience": "followers_only | public",   // 默认 followers_only（D-4）

  "created_at": "ISO8601"

}

  

// messages（沿用 events 单表，新增 dream 相关字段）

{

  // ...已有字段（type/author/content/media_url/created_at/is_favorite/ai_tags/system_action/ref_event_id）

  "type": "message | image | system | dream | voice",  // 新增 dream（本轮实现）和 voice（D-9，本轮仅占位）

  "source_type": "recent_favorite | recent_chat | random_memory | fully_random | null"  // 仅 type=dream 时使用

}

  

// timeline query（amend couple space D-4）

// SELECT * FROM messages WHERE type != 'dream' ORDER BY created_at

```

  

---

  

## 4. 任务拆分（最小粒度，按依赖排序）

  

> 类型：`[BE]` 后端 / `[FE]` 前端。每个 task = CC 一次 session。

  

### 第 0 层：共享基础设施

  

|ID|类型|目标|验收|

|---|---|---|---|

|PG1|[BE]|建 `cha_activity_log` 表|查手机/联网探索均可写读|

|PG2|[BE]|通用 scheduler 框架，挂联网探索 job + 做梦定时 job|job 按配置周期触发；预留挂载点供首页日记/聊天主动联系未来迁移|

  

### 第 1 层：占位/桥接（最轻，先做）

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|PG3|[FE]|看电影占位卡片 + 文字树占位卡片（静态图）+ 听歌入口跳转 music-box|—|三入口可见，前两个不接内容源，后者正确跳转|

  

### 第 2 层：轻量 CRUD（互相独立，可并行）

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|PG4|[BE+FE]|愿望清单数据层 + UI（左右+共同池）；cha 条目走 source_ref|D-2|双方可写可见；cha 条目无 source_ref 被拒|

|PG5|[BE+FE]|user 日记新 CRUD（写/可见性切换）+ Playground 首页 Daily Record 快捷入口|—|可写、可切换双向、首页入口可直达|

|PG6|[FE]|cha 日记完整阅读 UI，消费首页 inner_journal 的 diary_text|首页 D1|历史列表 + 完整阅读，无新增生成逻辑|

  

### 第 3 层：查手机

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|PG7|[BE+FE]|查手机视图：汇总 system_action 统计 + cha_activity_log，渲染 timeline 形式|PG1|仅展示 cha 行为，不可反推用户隐私|

  

### 第 4 层：论坛体

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|PG8|[BE]|forum_post + 身份池数据层（独立表，D-3）|—|匿名内容与真实身份完全隔离存储|

|PG9|[FE]|论坛 UI：帖子列表/楼层/匿名身份选择|PG8|每次发言强制选身份；cha 发言走 source_ref|

  

### 第 5 层：发毛象写入

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|PG10|[BE]|Mastodon 写入数据层：draft/scheduled/approved/sent 状态机，三开关 config 驱动|首页 B1|复用 B1 API 层；默认值符合 D-4|

|PG11|[FE]|发毛象 UI：草稿箱/timeline/互动/通知|PG10|审核通过才真实发出|

  

### 第 6 层：做梦（核心新功能）

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|PG12|[BE]|messages 加 `type=dream` 字段；timeline 查询排除 dream（amend D-4）|—|时间线不出现梦；schema 兼容现有写入|

|PG13|[BE]|做梦生成 pass：I/O 契约 + 实现，四种来源，手动触发，复用 55api|PG12|四种来源均可产出 dream 内容|

|PG14|[BE]|做梦夜间定时触发，挂 PG2 scheduler|PG2, PG13|定时产出且不重复|

|PG15|[BE]|auto_memory_candidates 显式跳过 dream 内容本身|PG13|梦内容不进 position；"谈论梦"的真实互动仍可正常候选|

|PG16|[FE]|"梦"标识 UI，贯穿长廊/瞬间/聊天提及三处|PG12|任意展示位都可见且不会被误认为事实|

  

### 第 7 层：联网探索

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|PG17|[BE]|联网探索后台 job：挂 scheduler，读取 Setting 配置的频率/token 上限（服务端强制），写 cha_activity_log|PG1, PG2, Setting ST2|超出 token 上限即停止，不是仅 UI 提示|

|PG18|[BE]|cha 主动分享浏览链接：走正常 message 写入路径|PG17|分享内容进主线，浏览过程不进主线|

  

### 第 8 层：外部集成（确认可通，可单独排期）

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|PG19|[BE+FE]|NagiBridge 集成：进入/加载/选存档/进入游戏画面/cha 协作面板|—|仅写 system log 事实，零进 events/memory|

|PG20|[BE+FE]|看书系统改造（基于 readinghelpfer）：书库上传 + cha 按页速度阅读+写笔记 + 进度分离记录|—|笔记限书内容点评，不进 memory 主系统|

  

### 第 9 层：语音预留

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|PG21|[BE]|messages 的 `type` 枚举预留 `voice` 值，本轮不接通真实 TTS|—|字段存在、未被使用，不影响现有写入|

  

---

  

## 5. 风险（记录，不阻塞当前任务）

  

- **R1｜做梦的"梦"标识是最容易漏的一环。** 长廊/瞬间/聊天提及三处任何一处漏掉标识，用户都可能把虚构内容当成真实历史，这是本页最高优先级的验收点。

- **R2｜论坛与朋友圈分表是为了防真实身份泄露，不要为了省事合并。** 即使后续有人提议"复用同一套 feed 组件"，存储层必须保持隔离。

- **R3｜发毛象一旦发出不可撤回。** 默认的审核+延迟+仅关注可见三层防护，在后续放开配置前不要绕过，这是本页唯一有真实不可逆世界后果的动作。

- **R4｜联网探索的 token 上限必须服务端强制。** 如果只在前端显示"已用 X / 上限 Y"而不在 job 执行时硬卡，配置形同摆设。

- **R5｜"主动联系概率"的实际发送逻辑不在本 PRD 范围内。** PG2 的 scheduler 框架预留了挂载点，但把它接到聊天页真实发送一条消息，是聊天页的任务，需要单独排期，这里不做。

  

---

  

## 6. 建议执行顺序

  

PG1·PG2 →（PG3 / PG4·PG5·PG6 / 并行）→ PG7 → PG8·PG9 → PG10·PG11 → PG12→PG13→PG14·PG15·PG16 → PG17·PG18 → PG19·PG20（可单独排期）→ PG21（随时可挂）

  

**PG1·PG2 是本页地基**——查手机、联网探索、做梦定时都建在它们上面。做梦（PG12–16）是本轮概念上最重的新功能，建议紧跟在基础设施之后做，不要拖到最后。外部集成（PG19/PG20）和占位/语音预留一样，可以整体往后挪，不影响其他模块验收。