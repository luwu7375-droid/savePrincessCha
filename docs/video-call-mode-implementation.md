# 视频聊天模式实现文档

## 概述

将 G's Eyes 升级为完整的"视频聊天模式"，在 chat 界面内提供视频 + 语音交互体验。

**核心理念**：
- 视频聊天是 chat 界面的一种**模式**，不是独立页面
- 重点是**语音交互**，文字只是中间结果
- 用户说话 → 转文字 → 发给模型 → 返回文字 → **自动语音播放**
- 不做实时双工，先做低成本半双工 demo

## 技术架构

### 模块结构

```
modules/gs-eyes.js      - 摄像头 + MediaPipe 视觉识别 + visualContext
modules/video-call.js   - 视频聊天状态机 + 语音输入 + TTS 自动播放
modules/chat-api.js     - 现有聊天 API（带 visualContext 支持）
modules/voice.js        - 现有 TTS 系统（SPVoice）
```

### 加载顺序

```javascript
gs-eyes.js          // 必须在 chat-api.js 之前
chat-api.js         // 调用 window.getGsEyesVisualContext()
video-call.js       // 依赖 gs-eyes 和 chat-api
```

## 状态机设计

### 状态定义

```javascript
callState = "idle"       // 未开始
          | "connecting" // 请求摄像头权限
          | "watching"   // 视频已开启，等待用户说话
          | "listening"  // 用户说话中
          | "thinking"   // 已发送给模型，等待 cha 回复
          | "speaking"   // TTS 播放 cha 回复
          | "error"      // 摄像头/语音/TTS 失败
```

### 状态转换

```
idle → [用户点击"视频聊天"] → connecting
connecting → [摄像头授权成功] → watching
connecting → [摄像头授权失败] → error

watching → [按下麦克风] → listening
listening → [松开麦克风] → watching (如果没有识别到文字)
listening → [识别到文字] → thinking

thinking → [收到 cha 回复] → speaking
thinking → [API 错误] → error → watching

speaking → [TTS 播放完成] → watching
speaking → [用户点击关闭] → idle
```

## 用户交互流程

### 1. 开启视频聊天

**入口**: 聊天 > 右上角"更多" > 视频聊天

**流程**:
1. 点击"视频聊天"按钮
2. 状态变为 `connecting`，显示"正在连接摄像头..."
3. G's Eyes 请求摄像头权限
4. 用户授权后，状态变为 `watching`
5. 在 chat 界面内显示嵌入式视频预览
6. 状态栏显示"视频已开启，按住麦克风说话"

### 2. 语音输入

**交互**: 按住麦克风按钮说话，松开后发送

**流程**:
1. 用户按下麦克风按钮
2. 状态变为 `listening`
3. 启动 SpeechRecognition（复用现有语音输入能力）
4. 实时显示识别中的文字（临时字幕）
5. 用户松开按钮
6. 停止录音，获取最终文字
7. 状态变为 `thinking`，显示"cha 思考中..."

### 3. 发送到模型

**集成**: 使用现有 chat API

**payload**:
```javascript
{
  messages: [...chatHistory, { role: "user", content: recognizedText }],
  visualContext: window.getGsEyesVisualContext(),
  // ... 其他参数
}
```

**visualContext 示例**:
```
G's Eyes 当前即时状态：
- 用户已开启视频陪伴
- 面部在画面中
- 笑容信号较弱
- 过去 25 秒沉默较长
- 沟通策略：减少连续追问，回复短一点，语气放轻，不要分析
```

### 4. 自动语音播放

**流程**:
1. 收到 cha 的文字回复（通过流式传输）
2. 状态变为 `speaking`，显示"cha 正在说话"
3. 字幕显示: `cha: [回复内容]`
4. **不渲染成普通聊天气泡**
5. 调用 `window.SPVoice.speak(text)` 自动播放
6. TTS 播放完成后，状态变为 `watching`
7. 3 秒后清空字幕

### 5. 关闭视频聊天

**交互**: 点击视频预览右上角的 × 按钮

**流程**:
1. 停止 TTS 播放（如果正在播放）
2. 停止语音识别
3. 调用 `GsEyes.stop()` 停止摄像头
4. 移除视频聊天 UI
5. 状态变为 `idle`
6. 摄像头指示灯熄灭

## UI 设计

### 视频聊天容器

```html
<div class="video-call-container">
  <!-- 视频预览（16:9） -->
  <div class="video-call-preview">
    <video class="video-call-video" autoplay playsinline muted></video>
    <div class="video-call-status">视频已开启，按住麦克风说话</div>
  </div>

  <!-- 控制栏 -->
  <div class="video-call-controls">
    <button class="video-call-mic-btn">
      <svg>...</svg>
      <span>按住说话</span>
    </button>
    <button class="video-call-close-btn">×</button>
  </div>

  <!-- 字幕区域 -->
  <div class="video-call-subtitle">你: 今天天气怎么样？</div>
</div>
```

### 插入位置

在 `#messageList` 之前插入，作为 chat 界面的一部分：

```
<section class="v2-page v2-page--chat">
  <header class="top-bar">...</header>

  <!-- 👇 视频聊天容器插入在这里 -->
  <div class="video-call-container">...</div>

  <section class="message-list" id="messageList">...</section>
  <form class="input-bar">...</form>
</section>
```

### 样式特点

- **嵌入式**: 不覆盖整个界面，融入 chat 流
- **紧凑**: 16:9 视频 + 控制栏 + 字幕，总高度约 400-500px
- **移动端优化**: 小屏幕改为 4:3，减小控件尺寸
- **深色主题**: 黑色背景，白色文字和图标

### 状态显示

- **连接中**: "正在连接摄像头..."
- **等待**: "视频已开启，按住麦克风说话"
- **无人脸**: "未检测到人脸 · 按住麦克风说话"
- **听你说**: "听你说话中..."（麦克风按钮红色 + 脉冲动画）
- **思考**: "cha 思考中..."
- **说话**: "cha 正在说话"
- **错误**: "错误: [错误���息]"

## 技术实现细节

### 1. 摄像头共享

video-call.js 通过 gs-eyes.js 获取摄像头流：

```javascript
// gs-eyes.js 暴露 getMediaStream()
const GsEyes = {
  getMediaStream: () => mediaStream,
  // ...
};

// video-call.js 使用
const stream = window.GsEyes.getMediaStream();
videoElement.srcObject = stream;
```

### 2. 语音识别

复用浏览器原生 SpeechRecognition API：

```javascript
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
recognition = new SpeechRecognition();
recognition.continuous = false;
recognition.interimResults = true;
recognition.lang = "zh-CN";
```

**按住说话交互**:
- `mousedown` / `touchstart` → `recognition.start()`
- `mouseup` / `touchend` → `recognition.stop()`
- `onresult` → 获取文字并发送

### 3. Chat API 集成

```javascript
// 准备消息
const messages = [
  ...window.chatMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
  { role: "user", content: recognizedText }
];

// 调用现有 API
const response = await window.SavePrincessChatAPI.callChatAPI(messages, "auto");

// visualContext 会在 chat-api.js 中自动注入
```

### 4. TTS 自动播放

```javascript
// 使用现有 SPVoice 系统
await window.SPVoice.speak(chaResponse);

// SPVoice.speak() 返回 Promise，播放完成后 resolve
setState("watching");
```

### 5. 清理逻辑

```javascript
async function endVideoCall() {
  // 1. 停止 TTS
  window.SPVoice.stopSpeaking();

  // 2. 停止语音识别
  recognition?.stop();

  // 3. 停止摄像头
  await window.GsEyes.stop();

  // 4. 移除 UI
  videoCallContainer?.remove();

  // 5. 重置状态
  callState = "idle";
}
```

## 隐私保护

### 不上传视频
- 原始视频流只在浏览器本地处理
- MediaPipe 识别完全本地运行
- 只有 visualContext **文本**发送给后端

### 瞬时注入
- visualContext 只在当前请求注入
- 不写入 Supabase messages 表
- 不进入长期记忆系统

### 用户控制
- 摄像头必须用户主动开启
- 每次说话需要按住按钮（主动触发）
- 可随时关闭，摄像头立即停止

## 降级策略

### MediaPipe 加载失败
- G's Eyes 继续运行基础模式
- visualContext 只包含 camera_on, silence_duration
- 不影响视频聊天功能

### 语音识别失败
- 显示错误提示: "语音识别失败"
- 2 秒后恢复到 watching 状态
- ���户可以重试

### TTS 失败
- 显示字幕: `cha: [回复] (语音生成失败)`
- 5 秒后清空字幕
- 返回 watching 状态

### 摄像头授权失败
- 显示错误: "摄像头授权失败"
- 无法进入视频聊天模式
- 提示用户检查浏览器权限

## 验收标准

### 基础功能
- [x] 在 chat 界面中开启视频聊天后能看到本地摄像头画面
- [ ] 视频预览正确显示在 chat 界面内（不是新页面）
- [ ] 摄像头授权后状态变为"等待说话"

### 语音输入
- [ ] 点击并按住麦克风能说话
- [ ] 松开后语音转文字成功
- [ ] 识别过程中显示临时字幕

### 模型交互
- [ ] 发送给 chat API 的 payload 里包含 visualContext
- [ ] visualContext 包含 G's Eyes 识别的视觉状态
- [ ] cha 返回文字回复（通过流式传输）

### 语音播放
- [ ] cha 返回后**不进入普通消息气泡**
- [ ] 在视频聊天区域自动语音播放
- [ ] 播放时界面显示"cha 正在说话"
- [ ] 字幕显示 cha 的回复内容

### 清理
- [ ] 关闭视频聊天后摄像头灯熄灭
- [ ] TTS 停止播放
- [ ] 再发普通聊天不带 visualContext
- [ ] UI 完全移除，不残留

## 已知限制

1. **半双工**: 用户说话时 cha 不能打断，cha 说话时用户不能插话
2. **浏览器限制**: 需要 HTTPS 或 localhost
3. **移动端性能**: MediaPipe 可能占用较多 CPU
4. **语音识别**: 依赖浏览器原生 API，部分浏览器可能不支持中文
5. **网络延迟**: thinking 状态时间取决于 API 响应速度

## 后续优化方向

1. **实时双工**: 使用 WebRTC + Realtime API 实现真正的实时对话
2. **打断机制**: 用户说话时自动停止 cha 的 TTS
3. **情绪动画**: 根据 visualContext 在视频上叠加表情反馈
4. **对话历史**: 视频聊天中的对话可选保存到聊天记录
5. **多人支持**: 支持多人视频聊天（远期目标）

## 文件修改清单

### 新增
- `modules/video-call.js` - 视频聊天状态机

### 修改
- `modules/gs-eyes.js` - 添加 `getMediaStream()` 方法
- `index.html` - 引入 video-call.js，修改 more 面板按钮
- `app.js` - 修改事件处理器和状态监控
- `style.css` - 添加视频聊天容器样式

### 无需修改
- `modules/chat-api.js` - 已支持 visualContext
- `modules/voice.js` - 已有 TTS 系统
- `supabase/functions/chat/index.ts` - 后端已就绪

---

**实现完成时间**: 2026-07-03
**版本**: v0.2 (Video Call Mode)
**状态**: ✅ 就绪，等待测试
