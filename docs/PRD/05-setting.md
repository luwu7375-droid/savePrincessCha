> Setting = 救公主系统的神经中枢，控制 cha 如何看世界、记住世界、表达世界、行动世界。本页绝大部分是给已锁定架构包一层可调配置 UI，不是新架构。 执行原则：一个 task = 一次 scoped change；所有配置 live 生效，不需要重新部署；改前 show diff。

  

---

  

## 0. 模块总览

  

1. API 设置

2. 备份

3. 美化

4. Prompt 管理

5. 记忆管理

6. Debug 页面

  

---

  

## 1. 已定架构决策（不要重新推导）

  

- **D-S1｜所有设置项落地为一张可 live 读取的 config 表。** 改了立即生效，不需要重启或重新部署。这是整页的统一实现方式，6 个模块的 UI 都是这张表的不同切面。

- **D-S2｜备份/恢复 = 整库快照（已确认），优先复用 Supabase 原生 PITR/Backup 能力，不自建快照引擎。** 本页只包一层管理 UI（触发/查看/恢复入口），底层操作交给平台。这是"复用基建不重复造轮子"原则在这页的落点。

- **D-S3｜"工具层开关"列表需要修正一处语义。** 原设计里"查手机"被列为一个开关，但它本身是只读视图，没有"启用/禁用功能"的意义；改成"是否记录 cha 行为日志"（控制 `cha_activity_log` 是否写入，关掉后查手机自然没有新数据）。新增"联网探索"开关 + 频率参数 + token 上限参数（Playground PG17 读取这里）。

- **D-S4｜Prompt 管理新增两个场景，对应 Playground 新功能。** "主动联系概率"——本轮要做，真实生效，不是摆设；"做梦模式"——触发频率（手动 / 手动+夜间定时）+ 来源默认权重，对应 Playground 做梦功能（具体权重数值是内容决策，你来调，这里只给开关）。

- **D-S5｜语音（TTS）本轮只占位，归类进"美化"而不是单独模块。** 音色选择 + 语气提示词两个字段，UI 存在但标注"待调试，暂未启用"。归类理由：这本质是"cha 怎么被听到"的表达层，跟视觉表达（主题/图标/气泡）同类，不需要单独开一个一级模块。

- **D-S6｜Debug 页"行为统计"覆盖所有后台 job，复用同一套统计面板。** 联网探索 token 消耗、做梦生成频率，跟现有的 cha 主动率/日记生成频率/收藏触发率/游戏触发率放在一起展示，不为每个新 job 单独建一个统计页。

- **D-S7｜本页是控制面，不等于能力已接通。** 联网探索的 job、做梦的生成 pass、主动联系的发送逻辑，分别在 Playground PRD 和聊天页实现。Setting 这一轮只保证配置项存在、能被正确读取，"主动联系"的实际发送钩子不在本页范围内（见 Playground PRD R5）。

  

---

  

## 2. 模块规格

  

### 2.1 API 设置

  

- 模型层：主模型 / 游戏模式模型 / 日记模式模型，三档可选。

- 工具层开关：发毛象、星露谷、听歌 API、读书系统、论坛系统；**新增**联网探索（频率 + token 上限）；**修正**查手机为"行为日志记录开关"（D-S3）。

- memory 连接层：memory 总开关、长廊索引开关、收藏权重系统开关。

  

### 2.2 备份

  

- 自动备份：每天/定时 snapshot（D-S2，调用平台原生能力）。

- 手动备份：用户主动触发"保存这个世界"。

- 恢复：回滚到某个时间点的完整状态，整库级别。

  

### 2.3 美化

  

- 视觉主题系统：wallpaper（含 memory vortex/eyes 图）、avatar、首页背景、couple space 背景；system 提供默认，user 可逐项替换，不影响数据只影响呈现。

- 图标系统：每个 icon 单独可换（home/chat/heart/star/setting/user/cha/playground），不是换主题包。

- 气泡系统：允许调 color/radius/shadow/padding/font；禁止 layout/animation/position（表达风格可编辑，结构不能破坏）。

- 表情包系统：user 上传、cha 可用、system 提供默认包；适用范围覆盖 chat/朋友圈/论坛/日记/playground。

- 视觉资产系统：memory vortex、eyes 图、couple space banner，属于"系统视觉锚点"，system 提供默认、user 可替换。

- **语音表达系统（新，占位，D-S5）**：音色选择 + 语气提示词两个字段，disabled 状态，文案提示"待调试"。

  

### 2.4 Prompt 管理

  

- 分场景 prompt：chat 模式、游戏模式、日记模式、发帖模式（朋友圈/毛象）。

- 关键控制项：回复长度（short/medium/long 或 token cap）、回复风格（温柔/克制/活泼/冷淡/陪伴型/NPC 游戏风）、主动性频率（cha 主动联系概率 0~1，**本轮真实生效**，D-S4）、自动日记频率（每天/每事件/手动）、收藏提示策略（是否提示收藏、频率）。

- **做梦模式（新）**：触发频率（手动 / 手动+夜间定时）、来源默认权重（最近收藏/最近聊天/随机记忆/完全随机的默认比例，具体数值你来定）。

  

### 2.5 记忆管理

  

- 三层结构说明：时间线（事实层，不可改）、长廊（体验层，重排不生成新内容）、瞬间（权重层，user 收藏）。

- 控制项：自动记忆 on/off；触发规则（情绪强/重复出现/用户强调/AI 标签命中）；cha 是否能主动记忆（仅"建议"，不能"决定"，跟权限矩阵一致）；可编辑性（删除/禁用/锁定）。

  

### 2.6 Debug 页面

  

- 回复来源链：为什么回复这句、用了哪个 prompt、是否触发记忆。

- memory 注入：注入哪些记忆、权重、来源（收藏/长廊/AI）。

- prompt 状态：当前模式、版本、override 情况。

- 完整链路：input → memory retrieval → prompt build → model call → output。

- 行为统计：cha 主动率、日记生成频率、收藏触发率、游戏触发率、**做梦生成频率**、**联网探索 token 消耗趋势**（新增两项，D-S6）。

  

---

  

## 3. 数据契约（字段级）

  

```jsonc

// app_settings（单表，所有设置项的统一落点，D-S1）

{

  "model_main": "string",

  "model_game": "string",

  "model_diary": "string",

  

  "tool_mastodon_enabled": true,

  "tool_stardew_enabled": true,

  "tool_music_enabled": true,

  "tool_reading_enabled": true,

  "tool_forum_enabled": true,

  "tool_web_explore_enabled": false,

  "tool_web_explore_frequency": "string",   // 读取方 = Playground PG17

  "tool_web_explore_token_cap": 0,          // 服务端强制，非 UI 摆设

  "cha_activity_log_enabled": true,         // 原"查手机开关"语义修正（D-S3）

  

  "memory_enabled": true,

  "hall_index_enabled": true,

  "favorite_weight_enabled": true,

  

  "theme_wallpaper": "url", "theme_avatar_user": "url", "theme_avatar_cha": "url",

  "theme_home_bg": "url", "theme_couple_space_bg": "url",

  "icon_overrides": { "home": "url", "chat": "url", "...": "url" },

  "bubble_css": { "color": "", "radius": "", "shadow": "", "padding": "", "font": "" },

  "sticker_pack_default": "string",

  

  "voice_enabled": false,            // D-S5，本轮占位

  "voice_tone_prompt": "",           // 待你调试

  "voice_id": "",                    // 待你调试

  

  "reply_length": "short|medium|long",

  "reply_style": "string",

  "proactive_chat_probability": 0.0,  // 0~1，本轮生效（实际发送钩子在聊天页，D-S7）

  "diary_auto_frequency": "daily|per_event|manual",

  "favorite_prompt_strategy": "string",

  

  "dream_trigger_mode": "manual|manual_and_nightly",

  "dream_source_default_weights": { "recent_favorite": 0, "recent_chat": 0, "random_memory": 0, "fully_random": 0 },

  

  "mastodon_post_needs_approval": true,

  "mastodon_post_delay": "next_day_same_time",

  "mastodon_post_audience": "followers_only"

}

  

// backup_snapshot（元数据，实际快照走平台原生能力，D-S2）

{ "id": "uuid", "type": "auto|manual", "created_at": "ISO8601", "restore_point_ref": "string" }

```

  

---

  

## 4. 任务拆分（最小粒度，按依赖排序）

  

> 类型：`[BE]` 后端 / `[FE]` 前端。每个 task = CC 一次 session。除 ST1 外全部只依赖 ST1，可并行。

  

### 第 0 层：配置底座

  

|ID|类型|目标|验收|

|---|---|---|---|

|ST1|[BE]|建 `app_settings` 表 + live 读取层；所有字段给合理默认值|改配置立即生效；新字段不因为没人设置过而导致依赖它的功能报错|

  

### 第 1 层：模块 UI（均依赖 ST1，互相并行）

  

|ID|类型|目标|依赖|验收|

|---|---|---|---|---|

|ST2|[FE]|API 设置 UI：模型层/工具开关/memory 连接层/联网探索频率+token 上限/行为日志记录开关|ST1|各项可改，立即生效|

|ST3|[FE+BE]|备份 UI：自动/手动触发 + 恢复入口，底层调用平台原生 PITR/snapshot API|ST1|触发后产出 snapshot 记录；恢复可执行|

|ST4|[FE]|美化 UI：主题/图标/气泡/表情包/视觉资产 五个子系统，复用 C2 上传组件|ST1, C2|各项可逐一替换，气泡 CSS 范围受限|

|ST5|[FE]|美化-语音表达占位 UI：音色 + 语气提示词字段，disabled 状态|ST1|UI 可见但标注未启用，不影响其他功能|

|ST6|[FE]|Prompt 管理 UI：分场景 prompt + 控制项 + 主动联系概率（生效）+ 做梦模式配置|ST1|各项可调；主动联系概率写入后可被读取（发送逻辑见聊天页，本任务不含）|

|ST7|[FE]|记忆管理 UI：三层结构说明 + 控制项|ST1|各项可调，与权限矩阵一致（cha 仅"建议"）|

|ST8|[BE+FE]|Debug 页面：回复链路/memory 注入/prompt 状态/完整链路/行为统计（含做梦生成频率、联网探索 token 消耗）|ST1|链路可视化；统计含新增两项|

  

---

  

## 5. 风险（记录，不阻塞当前任务）

  

- **R1｜备份"整库恢复"如果不是纯平台层操作，工作量会远超预期。** 动手前先确认 Supabase 套餐是否支持原生 PITR/定期备份；如果不支持，ST3 的范围需要重新评估，不要默认自建快照引擎。

- **R2｜`app_settings` 是单点配置，新字段没默认值会让依赖它的功能直接异常。** ST1 必须给所有字段写合理默认，尤其是 Playground 那边会读取的字段（联网探索频率/token 上限、做梦触发模式）。

- **R3｜语音占位字段是空值，不能让空值导致其他功能崩溃。** ST5 的字段在被真正接通前必须保持"读到空值=功能跳过"，不能因为空字符串报错。

- **R4｜本页很多"开关"暂时只是控制面，不代表能力已存在。** 主动联系概率（ST6）调到再高，没有聊天页的发送钩子也不会真的发消息——这条在 ST6 验收时容易被误判成"功能没生效"，其实是预期内的范围边界（D-S7）。

  

---

  

## 6. 建议执行顺序

  

ST1 →（ST2 · ST3 · ST4 · ST5 · ST6 · ST7 · ST8 全部并行）

  

**ST1 是唯一的依赖瓶颈**，建好之后 7 个模块 UI 互不相关，可以任意顺序或同时推进。真正的"能力是否生效"取决于 Playground PRD 和聊天页那边的实现进度，不取决于 Setting 页本身。