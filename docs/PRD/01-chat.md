> 主聊天 = 一个持久窗；游戏模式 = 隔离 sandbox。本页是 `events` 单表的主要写入口。 执行原则：一个 task = 一次 scoped change；后端契约先于前端消费；参考已实现代码做最小修改；改前 show diff。

  

---

  

## 0. 模块总览

  

1. 顶部 bar（返回 / cha 头像 / 标题+在线 / 搜索 / 更多）

2. 消息流

3. 输入区

4. 游戏入口（底部横滑）

5. 底层机制（记忆沉淀 / 上下文压缩 / 游戏 sandbox）

6. 主动联系（cha 主动发起对话，新）

  

---

  

## 1. 已定架构决策（不要重新推导）

  

- **D-1｜不新建 events 表，扩展现有 `messages` 表成 events 单表。** 加字段 `type / is_favorite / ai_tags / system_action / ref_event_id`，现有写入路径兼容、不迁移、不双写。 → **这张表 = couple space PRD 的 S1。S1/本页数据底座合并为一个 task，不重复建表。** S1 此前留的「用 messages 还是新建表」问题在此拍板：扩展 messages。

- **D-2｜主聊天 = 一个持久窗。** afterChat 走现有管线：更新 conversation_history（最近 20 条滚动窗）+ auto_memory 沉淀候选。

- **D-3｜上下文压缩 = 真做 summarization，但产物不落库。** 产出临时 running summary 注入 prompt，**不持久化、不算记忆**。记忆沉淀单独交给 auto_memory，两者不混（之前已沉淀过一次，压缩不重复落地）。

- **D-4｜游戏模式 = 通用框架 + 各游戏资产包。** 真心话大冒险 / 海龟汤 / 女巫的毒药 共用同一套进出机制（CH7），但资产不只是「换 prompt」：真心话/海龟汤需要内容库（题库），女巫的毒药需要状态机（无内容库）。资产矩阵见 2.6。跑团暂只占位，引擎不在本轮开发范围（需要多 AI 角色群聊，单独立项）。

- **D-5｜游戏 sandbox 完全隔离。** 游戏期间对话**不写 events/messages、不进 conversation_history、不触发 afterChat/沉淀**。`/over` 退出回主窗，整段对话丢弃。

- **D-6｜`/over` 退出时向主线写一条事实标记。** system event，内容如「玩了一局女巫的毒药 @ 时间」，**只记事实、不写过程叙事**（self_narrative 红线）。

- **D-7｜复用首页 C2（头像换图）。** 本页顶部 bar 与首页状态条不同，不复用 A1。

- **D-8｜主动联系（新）：cha 在没有用户触发的情况下主动发一条消息。** 触发挂在 Playground PG2 的通用 scheduler 上，不在本页另起调度逻辑；scheduler 按固定 tick（默认每小时一次）读 Setting 的 `proactive_chat_probability`（0~1）抽签，命中才生成。**命中后走完全正常的发送路径**——和 user 主动发消息没有结构性区别：写消息（type=message, author=cha）→ 触发 afterChat（D-2）。不需要新的存储结构，也不豁免任何现有红线（正常聊天 prompt 的所有约束照常生效）。**这个 task 依赖 Playground PRD 的 PG2，是一次跨 PRD 依赖**，PG2 没建好之前 CH11 无法开工。

  

---

  

## 2. 模块规格

  

### 2.1 顶部 bar

  

- 返回（回主页/上一页）。

- cha 头像：点击换图（复用 C2）。

- 标题「和 Cha 聊天」+ 在线状态指示（cosmetic，cha 常驻在线，非真实 presence）。

- 搜索：搜本窗消息。

- 更多（⋯）：菜单（清空/设置等，占位）。

  

### 2.2 消息流

  

- user / cha 气泡左右分布，含时间戳、已读回执（cosmetic）。

- 每条消息写入扩展后的 messages 表（D-1），`type=message`。

- 回复走现有多层 model routing + 记忆 provider，不改。

  

### 2.3 输入区

  

- 文本框「想对 Cha 说…」+ emoji + 加号（+，图片/扩展）。

- 发送 → 写消息（CH1）→ 触发回复 → afterChat（D-2）。

- 图片发送 → `type=image`，复用 C2 上传。

  

### 2.4 游戏入口

  

- 底部横滑列表：真心话大冒险 / 海龟汤 / 跑团 / 女巫的毒药 / …（分页）。

- 两种触发，等价：① 点底部游戏卡片；② slash 命令（如 `/wicked`）。

- 触发即进入对应游戏的 sandbox 会话（D-4/D-5）。

  

### 2.5 底层机制

  

- 记忆沉淀：复用现有 auto_memory 候选→晋升管线，最小接入。

- 上下文压缩：新做 summarization，临时 running summary，不落库（D-3）。

- 游戏 sandbox：独立 context，进出隔离（D-5），`/over` 写事实标记（D-6）。

  

### 2.6 游戏资产矩阵

  

> 框架（CH7）通用，资产按游戏类型分两种：**内容库**（KK 提供文本资产）或**状态机**（CC 实现规则，无内容资产）。下表标出每个游戏卡在哪、由谁交付。

  

|游戏|资产类型|由谁出|状态|

|---|---|---|---|

|真心话大冒险|题库（真心话+大冒险文本，可分强度档/单双池）|**KK 提供**|🔴 待补充，阻塞 CH9a|

|海龟汤|谜题库 `{汤面, 汤底, 判定备注}`|**KK 提供**|🔴 待补充，阻塞 CH9b|

|女巫的毒药|规则参数 + 状态机，**无内容资产**|CC 实现|🟢 规则已锁定，可开工|

|跑团|世界书/角色卡/骰子引擎/多 AI 群聊|单独立项|⚪ 仅占位卡片，本轮不实现引擎|

  

**女巫的毒药 — 已锁定规则（CC 直接按此实现，无需再等内容）：**

  

- 开局先经过一个**赌注阶段**：双方现场约定赢家奖励/输家惩罚。这是**实时对话内容**，不是内容库——cha 这一步只需一句轻量的角色化回应（接受/还价），不是题库，不阻塞开工。

- **轮流起手，且必须跨局交替**：不能同一方永远先手。需要一个跨局存活的极小结构化状态（谁上次先手），存在游戏框架的 `game_meta` 里，**不是叙事、不进 events**，不撞 self_narrative。

- 双方暗选 index：**user 的选择服务端存储，不进喂给 cha 的 prompt**；**cha 的选择必须服务端随机生成，不能让 LLM"自己选一个藏起来"**——否则不是真正的暗选，也有被 prompt injection 套出来的风险。这条是 CC 工程侧的硬约束，写进 CH9c。

- 谁先吃到对方那颗即输，按赌注阶段约定的结果执行。

  

### 2.7 主动联系（新）

  

- 触发不在前端，由 Playground PG2 的 scheduler 按 tick 抽签（D-8）。

- 命中后的生成 input：最近 conversation_history（最近 20 条滚动窗已有）+ 可选当前状态（时间/天气，跟 inner_journal 的 current_status 同形状，非必需）。

- 输出就是一条普通 cha 消息，走 CH4 同一条发送路径，**没有专属的展示位或 UI**，用户在消息流（2.2）里看到的就是一条 cha 先开口的消息，跟普通回复在 UI 上没有区别。

- 防刷屏的最小实现：scheduler 每次 tick 只抽一次签，不在同一个 tick 周期内重复触发；如果当前时间点和最近一条消息间隔过短（比如几分钟内），直接跳过这次 tick，不抽签。

  

---

  

## 3. 数据契约（字段级）

  

```jsonc

// messages（扩展为 events 单表，= couple space S1）

{

  "id": "uuid",

  "conversation_id": "uuid",          // 主窗会话

  "type": "message | image | system", // 新增

  "author": "user | cha | null",

  "content": "string|null",

  "media_url": "url|null",

  "created_at": "ISO8601",

  "is_favorite": false,               // 新增（瞬间写入）

  "ai_tags": [],                      // 新增（轻标注，禁解释/叙事）

  "system_action": "favorite|edit|delete|tag|game_played|null", // 新增

  "ref_event_id": "uuid|null"         // 新增

}

  

// running_summary（上下文压缩产物，临时，不落库）

{ "summary": "string", "covers_until": "message_id" }  // 仅注入 prompt，用完即弃

  

// game_session（sandbox，临时，不进 events）

{

  "game": "wicked | truth_or_dare | turtle_soup | trpg",

  "messages": [ /* 隔离上下文，/over 后丢弃 */ ]

}

  

// game_session 扩展字段 — 女巫的毒药专用（CH9c）

{

  "stake": "string",              // 现场约定的奖励/惩罚，实时内容，非内容库

  "starter": "user | cha",        // 本局先手，取自 game_meta 交替

  "poison_index_user": "number",  // 服务端存储，禁止进入喂给 cha 的 prompt

  "poison_index_cha": "number",   // 服务端随机生成，禁止由 LLM 自选

  "candy_count": 10               // 默认 10，可配置

}

  

// game_meta（极小跨局结构化状态，不进 events，非叙事）

{ "wicked_last_starter": "user | cha" }  // 仅用于轮流起手交替

  

// /over 退出标记 → 写一条 system event 进 messages

{

  "type": "system",

  "system_action": "game_played",

  "content": "女巫的毒药 · KK 输 · 赌注：…",  // 仅事实字段拼接，禁止 AI 生成过程叙事

  "created_at": "..."

}

  

// proactive_chat job（挂 Playground PG2 scheduler，不新增持久状态，复用 CH4 发送路径）

// input: { recent_history: "最近20条滚动窗", current_status?: "时间/天气，可选" }

// output: 直接是一条普通 message（type=message, author=cha），没有专属结构

```

  

---

  

## 4. 任务拆分（最小粒度，按依赖排序）

  

> 类型：`[BE]` 后端 / `[FE]` 前端 / `[config]` 配置。每个 task = CC 一次 session。

  

### 第 0 层：数据底座

  

|ID|类型|目标|验收|

|---|---|---|---|

|CH1|[BE]|扩展 `messages` 成 events 单表（加 5 字段），现有写入路径兼容|现有聊天不回归；新字段可写。**= couple space S1，做一次**|

  

### 第 1 层：聊天核心（CH1 后）

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|CH2|[FE]|顶部 bar（返回/头像换图/标题+在线/搜索/更多）|C2|头像可换；搜索可搜本窗|

|CH3|[FE]|消息流 UI（气泡/时间戳/已读）|CH1|左右分布正确|

|CH4|[FE+BE]|输入发送 → 写消息 → 触发回复 → afterChat|CH1|发送落库、回复正常、沉淀照旧|

  

### 第 2 层：底层机制

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|CH5|[BE]|上下文压缩：真 summarization → 临时 running summary 注入 prompt，**不落库**|CH4|长会话 token 受控；无新增持久数据|

|CH6|[BE]|记忆沉淀：最小接入现有 auto_memory，**不动 distill 格式**|CH4|沉淀照现有管线跑|

  

### 第 3 层：游戏模式（独立子系统）

  

| ID   | 类型       | 目标                                                                                                                          | 依赖       | 验收                            |

| ---- | -------- | --------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- |

| CH7  | [BE]     | game mode 通用框架：进入（按钮/slash 等价）→ sandbox 会话（独立 context，不写 events/history/afterChat）→ /over 退出回主窗；提供极小跨局 `game_meta` 状态位（非叙事） | CH4      | 游戏对话零写入主线                     |

| CH8  | [BE]     | `/over` 退出钩子：向主线写一条 `system_action=game_played` 事实标记，不写过程                                                                   | CH7      | 主线只多一条事实，无叙事                  |

| CH9a | [config] | 注册真心话大冒险：接入题库，轮抽+防重复                                                                                                        | CH7      | 🔴 **阻塞：等 KK 提供题库**           |

| CH9b | [config] | 注册海龟汤：接入谜题库，cha 持汤底判是/否/无关，含揭晓                                                                                              | CH7      | 🔴 **阻塞：等 KK 提供谜题库**          |

| CH9c | [BE]     | 注册女巫的毒药：赌注阶段 + 轮流起手（读写 game_meta）+ 双方暗选（user 选择不入 cha prompt，cha 选择服务端随机）+ 揭晓判负                                             | CH7      | 🟢 规则已锁定，可直接开工                |

| CH9d | [config] | 跑团占位卡片：仅入口展示「敬请期待」，不接入任何引擎                                                                                                  | CH7/CH10 | 卡片可见，点击不进入真实游戏                |

| CH10 | [FE]     | 底部游戏入口横滑列表 + slash 命令解析                                                                                                     | CH7      | 四个入口（含占位）均可点；slash 命令对应已上线的游戏 |

  

### 第 4 层：主动联系（依赖 Playground PG2，跨 PRD 依赖）

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|CH11|[BE]|主动联系触发逻辑：挂 Playground PG2 scheduler，按 `proactive_chat_probability` 抽签，命中则生成消息走 CH4 发送路径（写消息+afterChat 照常）|CH4, **Playground PG2**|命中后产出一条正常 cha 消息；conversation_history/auto_memory 正常更新；短时间内不重复触发|

  

---

  

## 5. 风险（记录，不阻塞当前任务）

  

- **R1｜sandbox 泄漏**：CH7 必须保证游戏对话零写入主线（events / conversation_history / afterChat），否则污染记忆。这是游戏模式第一红线。

- **R2｜/over 标记是事实非叙事**：CH8 只写「玩了哪个游戏 + 时间」，禁止 AI 写游戏过程（self_narrative 红线，D-6）。

- **R3｜压缩产物不可落库**：CH5 的 running summary 只注入 prompt、用完即弃；落库会和 auto_memory 重复沉淀，且摘要文本易成 self_narrative。

- **R4｜沉淀格式改造是另一轮**：CH6 只做最小接入；把 auto_memory distill 从「客观档案」改「体验式」是需要你和 G 一起定标准的独立动作，不在本页捎带。

- **R5｜暗选必须不可见**：CH9c 的 `poison_index_cha` 必须服务端随机生成、`poison_index_user` 不得出现在喂给 cha 的 prompt 里。任一条没守住，"暗选"就是假的，也给 prompt injection 留了套出答案的口子。

- **R6｜赌注是实时内容，不是题库**：CH9c 的赌注阶段（赢家奖励/输家惩罚）由双方现场约定，cha 一侧只需轻量角色化回应，**不需要 KK 预先提供内容**，不应被错误归类为「待补充」而阻塞开工。

- **R7｜CH11 卡在 Playground PG2 上，不是聊天页自己能独立交付的任务**：动手前先确认 Playground 那边的 scheduler 框架已经建好，否则 CH11 没有挂载点。这是本 PRD 里唯一一条跨文档依赖，排期时别漏看。

  

---

  

## 6. 建议执行顺序

  

CH1 →（CH2·CH3·CH4 聊天能跑）→ CH5·CH6（机制）→ CH7 → CH8 → CH9c·CH10（女巫的毒药可直接开工）→ CH9a·CH9b（等 KK 题库/谜题库到位后接入）→ CH9d（占位，随时可挂）→ CH11（等 Playground PG2 就位后再排）

  

**CH1 是地基且跨页共用**（= couple space S1），先把这张表焊死，主聊天和游戏都建在它上面。游戏模式（CH7–CH10）是独立子系统，可单独排期；其中 CH9c（女巫的毒药）规则已锁定可立即做，CH9a/CH9b 卡在内容资产，CH9d 是纯占位。**CH11 是本页唯一跨 PRD 依赖的任务**，Playground PG2 没做之前不要排期。