# G's Eyes Route 1: PWA + MediaPipe 本地视觉状态 Demo

## 实现概述

G's Eyes 是一个隐私优先的本地视觉陪伴功能，使用 PWA + MediaPipe 在浏览器中进行本地人脸识别，不上传原始视频，只提取低风险的即时沟通策略信号。

## 技术栈

- **前端**: 原生 JavaScript (无构建系统)
- **视觉识别**: MediaPipe Face Landmarker (通过 CDN 加载)
- **摄像头**: Web MediaStream API
- **隐私保护**:
  - 原始视频不上传
  - 识别状态只保存在内存
  - visualContext 只在当前请求注入，不进入长期记忆

## 文件修改

### 新增文件
- `modules/gs-eyes.js` - 核心模块，处理摄像头、MediaPipe 识别、状态提取

### 修改文件
1. `index.html`
   - 在 chat-api.js 之前引入 gs-eyes.js
   - 更新 #phoneVideoScreen 视频通话界面
   - 在聊天 more 面板添加 G's Eyes 入口

2. `modules/phone.js`
   - 添加 initGsEyes() 函数
   - 处理视频通话按钮的开始/结束逻辑

3. `app.js`
   - 在 handleSubmit() 中调用 GsEyes.onUserSpeak() 重置静默计时器
   - 添加 G's Eyes 按钮事件处理
   - 添加状态监控器，每 2 秒更新 UI

4. `style.css`
   - 添加视频通话界面样式
   - 添加 G's Eyes 状态栏样式

## 使用方法

### 方式 1：通过"查手机"
1. 点击 Playground > 查手机
2. 解锁手机（向上滑动或点击）
3. 点击"视频通话"应用
4. 点击"📹 开始"按钮
5. 授权摄像头访问
6. 看到本地摄像头预览，识别开始运行

### 方式 2：通过聊天 More 面板
1. 在聊天界面点击右上角"更多"按钮（三个点）
2. 点击"G's Eyes"选项
3. 自动打开查手机并跳转到视频通话界面

### 关闭 G's Eyes
- 在视频通话界面点击"⏹ 结束"按钮
- 或在聊天 More 面板点击"G's Eyes"再次切换

## 视觉状态信号

G's Eyes 提取以下低风险信号：

### 基础状态
- `camera_on`: 摄像头是否开启
- `face_present`: 是否检测到人脸
- `silence_duration_sec`: 距离上次发消息的秒数

### 表情信号（通过 MediaPipe Blendshapes）
- `attention`: looking / away / unknown（视线方向）
- `smile`: none / slight / clear（笑容程度）
- `fatigue_hint`: low / medium / unknown（疲劳提示）
- `stillness`: normal / long_pause（沉默时长）

### 沟通策略
基于上述信号生成即时策略：
- `normal`: 正常对话
- `reduce_questions`: 减少连续追问，回复短一点
- `lighten_tone`: 语气轻松一点，少追问
- `wait`: 等待用户回到画面

## visualContext 文本格式

返回给模型的 visualContext 示例：

```
G's Eyes 当前即时状态：
- 用户已开启视频陪伴
- 面部在画面中
- 笑容信号较弱
- 过去 20 秒沉默较长
- 沟通策略：减少连续追问，回复短一点，语气放轻，不要分析

注意：这些只是即时视觉信号，不是情绪诊断，不要直接说"我检测到你很累"。
```

## 降级策略

如果 MediaPipe 加载失败：
- 继续运行基础模式
- 保留 camera_on, silence_duration 等基础状态
- face_present, attention, smile 等设为 unknown
- 不影响聊天功能

## 隐私保护

1. **用户主动开启**: 摄像头必须用户点击按钮才会请求权限
2. **默认关闭**: 初始状态 G's Eyes 关闭
3. **不上传视频**: 原始视频流只在浏览器本地处理
4. **内存状态**: 识别状态只保存在 JavaScript 内存中
5. **瞬时注入**: visualContext 只在当前请求注入，不写入 Supabase
6. **完全清理**: 关闭后立即停止所有 tracks，清理 video 元素

## 后端集成

后端已准备完毕：
- `supabase/functions/chat/index.ts` 已支持 `payload.visualContext`
- `modules/chat-api.js` 已调用 `window.getGsEyesVisualContext()`
- visualContext 会被注入到 prompt 中，格式：
  ```xml
  <visual_context source="gs_eyes_v0_1" transient="true">
  [文本内容]
  </visual_context>
  ```

## 验收标准

- [x] 打开查手机 > 视频通话，点击开始，浏览器弹出摄像头授权
- [x] 授权后能看到本地摄像头预览
- [ ] 控制台能看到 GsEyes state 每隔约 1 秒更新
- [ ] 发送一条消息时，chat-api payload 里包含 visualContext
- [ ] chat function 正常返回，不报错
- [ ] cha 不会说"我检测到你"，但回复策略会变短、少追问、语气更轻
- [ ] 关闭 G's Eyes 后，再发消息 visualContext 为 null

## 下一步

1. 测试摄像头授权流程
2. 验证 MediaPipe 加载和识别
3. 测试 visualContext 注入到聊天请求
4. 观察 cha 的回复策略变化
5. 优化识别频率和 CPU 占用

## 技术细节

### MediaPipe 加载
使用 CDN 动态加载，避免构建系统复杂度：
```javascript
https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8
```

### 识别频率
- 约 1 FPS（每秒 1 次）
- 最小化 CPU 占用
- 通过 `setInterval(runDetection, 1000)` 实现

### 状态更新
- 每次识别更新 currentState
- 10% 概率输出控制台日志（避免刷屏）
- UI 状态实时更新

## 已知限制

1. **浏览器兼容性**: 需要支持 MediaStream API 和 WebAssembly
2. **HTTPS 要求**: 摄像头访问需要 HTTPS 或 localhost
3. **性能**: MediaPipe 需要一定的 CPU/GPU 资源
4. **隐私提示**: 首次使用需要用户授权摄像头

## 调试

开启控制台查看日志：
```javascript
// G's Eyes 模块加载
[gs-eyes] Module loaded

// 启动成功
[gs-eyes] Started successfully

// 识别状态（10% 概率输出）
[gs-eyes] State: { face: true, attention: "looking", smile: "slight", ... }
```

## 贡献者

- 实现日期: 2026-07-03
- 版本: v0.1 (Route 1: PWA + MediaPipe)
