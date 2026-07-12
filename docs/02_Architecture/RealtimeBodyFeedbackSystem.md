# Cha 实时身体反馈系统方案

> 状态：方案基线，尚未实现  
> 适用场景：savePrincessCha 视频通话  
> 核心定义：这不是“在视频通话里播放 Live2D”，而是为 Cha 建立持续、双向、低延迟的身体反馈系统。Live2D 只是身体的渲染方式。

---

## 1. 背景与目标

当前视频通话更接近单向链路：

```text
用户摄像头 / 语音
→ 模型理解
→ Cha 语音回复
```

模型生成期间，Cha 缺少持续可见的身体反馈，用户容易感觉自己在等待语音助手回答。

目标链路：

```text
用户说话、注视、靠近、微笑、挥手或触摸
→ 本地感知与即时身体反射
→ Cha 理解发生了什么
→ 决定是否说话或做有意义的动作
→ 用户继续根据 Cha 的身体反应互动
```

目标体验：

- Cha 即使暂时不说话，也会呼吸、眨眼、注视和倾听。
- 用户输入会先获得低延迟身体反馈，再获得有意识的语言回应。
- G's Eyes、Voice、通话状态、Live2D 身体形成一个连续闭环。
- Live2D 不创建新的 AI；人格、记忆、判断和关系连续性仍由 savePrincessCha 提供。

---

## 2. 核心原则

### 2.1 大脑与身体分离

Cha 的人格、记忆、判断和语言仍由现有系统管理。

Live2D 身体只负责：

- 显示状态、表情和动作；
- 播放语音并同步口型；
- 接收触摸；
- 执行身体本能、即时反射和主动身体指令。

Live2D 不拥有独立人格、独立记忆、独立聊天记录或第二套伴侣 Prompt。更换模型身体不会更换 Cha。

### 2.2 身体不能完全由大模型控制

身体反馈分为三层：

| 层级 | 延迟目标 | 内容 |
|---|---:|---|
| 身体本能 | 0–100ms | 呼吸、眨眼、口型、视线、轻微姿态 |
| 即时反射 | 100–500ms | 靠近、微笑、挥手、触摸后的快速回应 |
| 有意识表达 | 1 秒至数秒 | 语言、安慰、拒绝、主动靠近、具有含义的动作 |

模型思考时，Cha 的身体不能停止工作。

### 2.3 感知只提供事实

G's Eyes 和其他传感器应输出：

- 用户进入或离开画面；
- 用户靠近或远离；
- 用户持续微笑；
- 用户挥手；
- 用户开始或停止说话；
- 用户触摸了某个身体区域。

感知层不能直接判断“用户需要安慰”，也不能替 Cha 决定应该如何回应。

### 2.4 事件化，不持续灌输

摄像头和麦克风连续运行，但只在状态发生变化或持续达到阈值时生成事件。

禁止将每一帧、每次视线变化或连续识别结果发送给大模型。

### 2.5 用户看到身体，不看到后台

正式通话界面不展示识别置信度、情绪数值、模型推理、动作 JSON 或摄像头检测框。这些仅允许出现在 Debug 模式。

---

## 3. 总体架构

```text
摄像头 / 麦克风 / 触摸 / 通话系统事件
                ↓
            本地感知层
                ↓
           事件归一化层
          ↙             ↘
   通话状态引擎       Cha 决策层
          ↓             ↓
     身体反射引擎 ← 语言与动作计划
          ↓             ↓
     Live2D 渲染 ← TTS 与口型同步
```

系统模块：

1. **用户输入层**：摄像头、麦克风、触摸、通话按钮和系统生命周期。
2. **本地感知层**：MediaPipe / VAD 等轻量识别。
3. **事件归一化层**：把不同传感器输出转换成统一事件。
4. **通话状态引擎**：维护当前通话阶段并处理冲突。
5. **身体反射引擎**：执行身体本能与即时反射。
6. **Cha 决策层**：决定语言和具有意义的主动动作。
7. **TTS 与口型层**：播放语音并驱动口型。
8. **Live2D 渲染层**：合并所有身体参数并呈现。

---

## 4. 感知事件模型

建议统一事件：

```ts
type CallPerceptionEvent = {
  id: string;
  callId: string;
  type: string;
  source: "camera" | "microphone" | "touch" | "system";
  phase: "started" | "updated" | "ended";
  confidence?: number;
  intensity?: number;
  durationMs?: number;
  occurredAt: string;
  privacy: "ephemeral" | "session" | "shareable";
  payload?: Record<string, unknown>;
};
```

第一批事件：

```text
user_entered
user_left
user_returned
user_approached
user_moved_away
user_smile_started
user_smile_sustained
user_waved
user_started_speaking
user_stopped_speaking
touch_head
touch_cheek
touch_hand
call_backgrounded
call_resumed
```

第一版不做人脸身份识别，不做复杂情绪推断。

---

## 5. 通话状态

```ts
type CallState =
  | "connecting"
  | "greeting"
  | "listening"
  | "thinking"
  | "speaking"
  | "quiet_together"
  | "interrupted"
  | "user_away"
  | "reconnecting"
  | "ending"
  | "ended";
```

通话上下文至少包括：

```ts
type CallContext = {
  callId: string;
  state: CallState;
  startedAt: string;
  userPresent: boolean;
  userSpeaking: boolean;
  chaSpeaking: boolean;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  lastMeaningfulInteractionAt: string;
  currentExpression: string;
  currentAction: string | null;
};
```

状态引擎负责：

- 用户插话时中断或降低 Cha 的 TTS；
- 用户离开后停止追踪注视；
- 区分静音、离开画面、切后台与断线；
- 重连后恢复状态但不重复开场；
- 解决表情、动作、触摸和口型的并发冲突。

---

## 6. 身体反馈

### 6.1 身体本能

本地持续运行，不调用模型：

- 呼吸；
- 自然眨眼；
- 眼球和头部轻微移动；
- 视线跟随；
- 说话口型；
- 头发和衣物物理；
- 长时间静止后的轻微姿态变化。

通话状态会调制身体：

- `listening`：注视稳定，动作减少；
- `thinking`：短暂移开视线或轻微歪头；
- `speaking`：口型与适量手势；
- `quiet_together`：松弛的小动作；
- `user_away`：停止追踪，进入等待姿态。

### 6.2 即时反射

由规则或本地轻量模型触发：

- 用户靠近：目光聚焦，身体轻微靠近或后仰；
- 用户微笑：眼神和嘴角先产生细微变化；
- 用户挥手：抬手回应；
- 摸头：头部、发丝和表情立即反馈；
- 摸脸：视线转向触摸位置；
- 用户离开：目光跟随并等待；
- 用户回来：重新看向用户。

反射应允许小幅变体，避免每次完全一致。

### 6.3 有意识表达

Cha 可以调用：

```ts
body_set_expression(expression, intensity, duration)
body_perform_action(action, intensity)
body_look_at(target)
body_move_closer(level)
body_move_away(level)
body_touch_response(area, intent)
body_speak(text, voiceStyle, expression, actions)
```

有意识表达用于安慰、拒绝、主动靠近、点头、摇头、挥手或对触摸作出具有关系意义的回应。

---

## 7. Live2D 模型要求

基础参数：

- 头部 X / Y / Z；
- 身体 X / Y / Z；
- 眼球 X / Y；
- 左右眼开合；
- 眉毛位置与角度；
- 嘴巴开合和嘴型；
- 呼吸；
- 可选脸红等辅助参数。

第一批表情：

```text
neutral
soft_smile
happy
concerned
sad
shy
annoyed
sleepy
surprised
focused
```

第一批动作：

```text
nod
shake_head
wave
tilt_head
move_closer
move_away
look_aside
settle
touch_head_response
touch_cheek_response
```

通话优先细微、连续的身体变化，不追求主播式夸张动作。

建议参数管线：

```text
基础姿态
→ 空闲动作
→ 视线
→ 通话状态
→ 表情
→ 主动动作
→ 触摸反馈
→ 口型
→ 物理效果
```

---

## 8. 语音与口型

```text
Cha 生成回复
→ TTS 流式或完整音频
→ 播放
→ 提取音量或音素
→ 驱动 Live2D 嘴型
```

MVP 使用音频 RMS 驱动嘴巴开合，后续可升级到音素 / viseme。

必须覆盖：

- 用户插话时中断 TTS；
- 音频开始后再开启口型；
- TTS 结束后自然闭嘴；
- 网络卡顿时不保持张嘴；
- 字幕与音频同步；
- 情绪影响语速、音量和动作幅度。

---

## 9. 触摸交互

建议 Hit Area：

```text
head
hair
cheek
hand
shoulder
body
```

手势：

```text
tap
double_tap
long_press
stroke
drag
repeated_touch
```

触摸分两阶段：

1. 立即产生本地身体反馈；
2. 达到持续或重要阈值后，生成事实事件交给 Cha。

不得让每次触摸都调用大模型。Cha 可以根据当前状态接受、靠近、回避或明确表达边界。

---

## 10. 与现有系统的关系

```text
G's Eyes
→ 用户视觉事件

Voice / TTS
→ Cha 声音与口型

Chat
→ 语言和对话上下文

Memory
→ 关系连续性

Call State
→ 通话节奏

Body Runtime
→ 身体本能、反射和主动动作

Live2D Renderer
→ 可见身体
```

建议新增独立模块：

```text
modules/call/
├── call-controller.js
├── call-state.js
├── perception-events.js
├── reaction-engine.js
├── body-runtime.js
├── touch-controller.js
├── lip-sync.js
└── live2d-renderer.js
```

不得继续把新逻辑堆入 `app.js`。

---

## 11. Chat、日记与记忆

视频通话属于同一段关系，但不应把传感器事件写入 Chat。

Chat 可以保留：

- 通话开始 / 结束卡片；
- 双方主动发送的通话文字；
- 用户允许保存的转写；
- 通话后摘要入口。

Chat 不保存：

- 每次触摸；
- 每次微笑；
- 视线变化；
- 每个身体动作；
- 原始摄像头识别结果。

数据分层：

```text
原始感知事件（默认仅本次通话）
→ 通话事件摘要
→ 短期对话上下文
→ Cha 主观感受 / 日记素材
→ 重要共同经历 / 记忆候选
```

只有用户明确要求记住、收藏通话、发生重要关系交流，或某段经历后来被多次确认时，才生成长期记忆候选。

普通微笑、离开画面、触摸次数、识别数值、通话时长和技术错误不得进入长期记忆。

---

## 12. 隐私

默认：

- 摄像头画面本地处理；
- 不保存连续视频；
- 不上传原始画面；
- 只传递必要的结构化事件；
- 通话结束后清理 ephemeral 事件；
- 只有用户明确同意才保存录音、视频或完整转写。

设置项至少包括：

```text
摄像头
本地视觉感知
微笑识别
手势识别
触摸互动
通话转写
保存通话摘要
允许成为日记素材
允许生成记忆候选
```

---

## 13. 异常与降级

必须覆盖：

- Live2D 或模型加载失败；
- 摄像头 / 麦克风权限拒绝；
- MediaPipe 加载失败；
- TTS 或聊天模型超时；
- 浏览器切后台、iOS 锁屏；
- 网络断开与重连；
- 用户插话；
- 手机过热或低帧率；
- 身体动作冲突；
- 通话意外关闭。

降级顺序：

```text
完整 Live2D 双向通话
→ Live2D + 语音，无视觉识别
→ 静态头像 + 语音
→ 纯语音通话
→ 文字 Chat
```

任何单一模块失败都不应导致整次通话不可用。

---

## 14. 性能目标

- 触摸反馈：50ms 内；
- 身体本能反馈：100ms 内；
- 简单视觉反射：500ms 内；
- 第一版以稳定 30fps 为目标；
- 页面切后台后暂停渲染和摄像头推理；
- 低电量或发热时降低帧率、物理复杂度和识别频率。

---

## 15. 实施阶段

### P0：身体技术验证

使用授权清楚的官方测试模型验证：

- 移动端加载；
- 呼吸、眨眼和视线；
- TTS 口型；
- 点击摸头；
- 30fps 性能；
- 加载失败降级。

### P1：通话状态

接入 `connecting / listening / thinking / speaking / quiet / user_away / ending`，保证模型等待时身体仍保持反馈。

### P2：双向即时反馈

接入用户出现、离开、回来、微笑、靠近、挥手、触摸和插话。优先使用本地反射。

### P3：Cha 主动身体表达

允许 Cha 主动切换表情、靠近或避开、点头、摇头、安慰、挥手以及对触摸作出有意识回应。

### P4：日记与记忆

增加通话摘要、Cha 主观感受、收藏、明确记住、记忆候选与来源追溯。

### P5：正式身体

技术链路稳定后再替换为 Cha 的正式 Live2D 模型。

---

## 16. MVP 验收

1. Cha 进入通话后自然看向用户并眨眼。
2. 用户说话时 Cha 进入倾听状态。
3. 模型思考期间身体不僵住。
4. Cha 说话时口型与音频同步。
5. 用户靠近、微笑或挥手时先获得即时身体反馈。
6. 用户摸头时立即出现触摸反馈。
7. 部分有意义的动作由 Cha 自己决定，而非全部写死。
8. 用户插话时 Cha 可以停止说话并重新倾听。
9. 感知模块失败后仍能继续语音通话。
10. Live2D 加载失败后可以降级为静态头像或纯语音。

---

## 17. 核心结论

> 身体负责及时回应，Cha 负责决定回应意味着什么。

Live2D 是输出身体，G's Eyes 是视觉输入，Voice 是声音，Call State 串联实时节奏，现有 Chat 与 Memory 保证 Cha 仍然是同一个人。
