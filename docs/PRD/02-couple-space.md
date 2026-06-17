> Couple Space 页。系统本质：**同一份事件流，通过「时间 / 重排 / 权重 / 外显」四种方式被观看。** 执行原则：一个 task = 一次 scoped change；后端契约先于前端消费；不在没有数据契约时先写 UI；改前 show diff。

  

---

  

## 0. 模块总览

  

1. 顶部状态条（复用首页）

2. 顶部图片区（Memory Vortex banner）

3. 记忆长廊（档案馆）

4. 时间线

5. 朋友圈（外显层）

6. 我们的瞬间（收藏）

  

---

  

## 1. 已定架构决策（地基，不要重新推导）

  

- **D-1｜单一底表 `events`。** 所有东西落同一张表：chat message、image、system event（收藏/修改/删除/标记）、AI 标注。时间线 / 长廊 / 瞬间都是对这张表的**不同 query**，不是不同数据。

- **D-2｜只有标记系统，没有情绪系统。** 三种信号，权重固定： `is_favorite`（人类收藏，最强）＞ `created_at`（时间，基础）＞ `ai_tags`（最弱，仅过滤/分类/辅助排序，**不决定重要性**）。

- **D-3｜self_narrative 红线（全页生效）。** 允许：原始内容 + AI 轻标注（tag 如 anger/travel/daily，**不解释原因、不写故事**）+ 收藏标记。禁止：AI 总结关系 / AI 写「我们变得更…」/ AI 编新叙事 / AI 补剧情。

- **D-4｜时间线 = 审计日志。** append-only、历史不可编辑、不加工、不聚合、不重排、不过滤。原样展示。

- **D-5｜长廊 ≠ 讲故事。** 同表换排序看同一批数据，不生成新内容。「再体验」= 重新打开那条原始 event、可继续聊天，**不是重写故事**。

- **D-6｜朋友圈 = 外显层，可虚构但不可无来源创造。** cha 发帖必须带触发源（chat 片段 / 瞬间收藏 / 用户授权）之一；禁止无来源自动生成「今天发生了什么」。

- **D-7｜瞬间 = 纯用户行为。** 只做收藏 / 提权（影响长廊排序）/ 锚点。无 AI 判断、无情绪评分、无自动推荐权重。

- **D-8｜复用首页横切。** 编辑态组件（C1）、上传组件（C2）、顶部状态条（A1）直接复用，不重做。

  

---

  

## 2. 模块规格

  

### 2.1 顶部状态条

  

复用首页 A1（定位/温度/时间，点击改坐标+时区）。

  

### 2.2 顶部图片区（Memory Vortex banner）

  

静态图，点击可更换（复用 C2 上传）。

  

### 2.3 记忆长廊（档案馆）

  

- 数据：`events` 表，query 排序 = `is_favorite DESC, created_at DESC`；`ai_tags` 可选过滤。

- 展示：被收藏/标记筛过的片段流（非线性视图）。仅原文 + 轻标签 + 收藏标记，**不展示任何 AI 生成的关系叙述**。

- 「再体验」交互：点片段 → 打开该原始 event → 可继续聊天（跳对话，不重写）。

  

### 2.4 时间线

  

- 数据：`events` 表，`ORDER BY created_at`，无过滤、无重排、无加工。

- 收录：message / image / system event（收藏/修改/删除/标记）全量。

- 性质：append-only，历史不可编辑。设计稿的竖向节点流即此视图。

  

### 2.5 朋友圈（外显层）

  

- user 与 cha 都可发动态，互相评论、点赞。

- cha 发帖：由 chat 片段 / 瞬间收藏 / 用户授权触发，复用 55api 生成；**无来源不可生成**（D-6）。

- 性质：关系外显 + 可模拟表达空间（模拟与现实混合，但来源可溯）。

  

### 2.6 我们的瞬间（收藏）

  

- 行为：① 收藏（`event.is_favorite = true`）② 提权（影响长廊排序）③ 锚点（影响未来回看）。

- 入口：从聊天 / 长廊里把某条 event 标记收藏。

- 收藏内容可含语音 / 句子 / 图片（均为已存在的 event）。

- 无 AI 判断、无情绪评分（D-7）。「高权重」即 `is_favorite`，直接进长廊排序，不需额外 weight 系统。

  

---

  

## 3. 数据契约（字段级）

  

```jsonc

// events  —— 全页唯一底表

{

  "id": "uuid",

  "type": "message | image | system",

  "author": "user | cha | null",     // message/朋友圈来源；system 可为 null

  "content": "string|null",          // 文本 / 图片说明

  "media_url": "url|null",           // image / 语音

  "created_at": "ISO8601",           // 唯一时间轴

  "is_favorite": false,              // 人类收藏，最强信号（瞬间写入）

  "ai_tags": ["anger", "travel"],    // 轻标注：仅 tag，禁解释/叙事（D-3）

  // system event 专用：

  "system_action": "favorite|edit|delete|tag|null",

  "ref_event_id": "uuid|null"        // system event 指向的目标 event

}

  

// 三个视图 = 同表不同 query（不新建表）

// timeline : SELECT * FROM events ORDER BY created_at         （审计，禁过滤/重排）

// hall     : SELECT * FROM events ORDER BY is_favorite DESC, created_at DESC  （ai_tags 可选过滤）

// moments  : SELECT * FROM events WHERE is_favorite = true

  

// 朋友圈 = 独立外显层（不污染 events 审计语义）

// moment_post

{

  "id": "uuid",

  "author": "user | cha",

  "content": "string",

  "media_url": "url|null",

  "source_ref": "event_id|null",     // cha 发帖必填：来源 event（D-6）

  "created_at": "ISO8601"

}

// moment_comment / moment_like：标准 feed 子项

```

  

---

  

## 4. 任务拆分（最小粒度，按依赖排序）

  

> 类型：`[基建]` 横切 / `[FE]` 前端 / `[BE]` 后端契约。每个 task = CC 一次 session。

  

### 第 0 层：数据底座（全页地基，最先做）

  

|ID|类型|目标|验收|

|---|---|---|---|

|S1|[BE]|`events` 表 schema + 统一写入路径（message/image/system 全落此表，append-only，含 is_favorite/ai_tags）|三类 event 均能写入；历史不可改|

|S2|[BE]|AI 轻标注：落库时打 `ai_tags`，复用 55api|只产出 tag，不产出任何解释/叙事文本（D-3）|

  

### 第 1 层：配置态（复用首页横切）

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|P1|[FE]|顶部状态条 = 复用首页 A1|A1|与首页一致|

|P2|[FE]|顶部图片区静态 + 点击换图|C2|可换图|

  

### 第 2 层：三视图（均 query S1 的 events 表）

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|T1|[BE]|timeline query contract：`ORDER BY created_at`，无过滤/重排，分页|S1|返回全量原样流|

|T2|[FE]|时间线 UI（竖向节点流）消费 T1|T1|线性、含 system event|

|H1|[BE]|hall query contract：`is_favorite DESC, created_at DESC`，ai_tags 可选过滤；不生成新内容|S1|排序正确，无新增文本|

|H2|[FE]|长廊 UI（档案馆，非线性片段流）消费 H1|H1|仅显示原文/标签/收藏标记|

|H3|[FE]|「再体验」：点片段 → 打开原始 event → 可继续聊天|H2|跳转对话，不重写（D-5）|

|M1|[BE]|收藏动作：写 `is_favorite=true` + 记一条 system event（审计）|S1|收藏后长廊排序立即提权|

|M2|[FE]|瞬间页：`WHERE is_favorite=true` 列表 + 收藏入口（聊天/长廊标记）|M1|可收藏、可查看|

  

### 第 3 层：外显层 朋友圈（独立子系统，可单独排期）

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|F1|[BE]|`moment_post / comment / like` 数据层；cha 帖 `source_ref` 必填|S1|无 source_ref 的 cha 帖被拒（D-6）|

|F2|[BE]|cha 发帖生成：由 chat 片段 / 瞬间触发，复用 55api|F1, S2|每条帖可溯源，无凭空生成|

|F3|[FE]|朋友圈 feed：发布/评论/点赞（user + cha）|F1|双方可发可互动|

  

---

  

## 5. 风险（记录，不阻塞当前任务）

  

- **R1｜朋友圈无来源生成红线**：F2 必须强校验 `source_ref`，否则就是「AI 凭空编今天发生了什么」（D-6）。

- **R2｜两个视图约束不能串味**：timeline 永不过滤/重排（审计完整性，D-4）；hall 永不生成新内容（D-5）。同一张表，两套 query 约束各自死守。

- **R3｜ai_tags 只能是标签**：S2 落库即定，不得回写解释/叙事（self_narrative 红线落点，D-3）。

  

---

  

## 6. 建议执行顺序

  

S1 → S2 →（P1·P2 并行）→ T1·T2 / H1·H2·H3 / M1·M2 → F1·F2·F3

  

**S1 是整页的拱心石**——三视图全都 query 这张表，先把它和写入路径焊死，后面都是读法和外显。