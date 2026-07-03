# 视频聊天模式 - 快速启动指南

## 🚀 立即测试

### 1. 启动开发服务器

```bash
cd /Users/weidian/savePrincessCha

# 选项 1: Python
python3 -m http.server 8000

# 选项 2: Node.js
npx serve -p 8000

# 选项 3: PHP
php -S localhost:8000
```

**重要**: 摄像头访问需要 HTTPS 或 localhost

### 2. 打开浏览器

访问: `http://localhost:8000`

### 3. 操作步骤

1. **登录应用**
2. **进入任意聊天**
3. **点击右上角"更多"按钮**（三个点）
4. **点击"视频聊天"**
5. **授权摄像头访问**
6. **看到本地视频预览** ✅
7. **按住麦克风按钮说话**
8. **松开按钮自动发送**
9. **等待 cha 思考**
10. **听 cha 语音回复** 🎵

## 🎯 预期效果

### 开启成功
- ✅ 在 chat 界面内看到嵌入式视频预览
- ✅ 状态显示: "视频已开启，按住麦克风说话"
- ✅ 摄像头指示灯亮起

### 语音交互
- ✅ 按住麦克风 → 按钮变红色 + 脉冲动画
- ✅ 说话时显示: "听你说话中..."
- ✅ 松开后显示: "cha 思考中..."
- ✅ 收到回复后显示: "cha 正在说话"
- ✅ 字幕显示: `cha: [回复内容]`
- ✅ **听到 cha 的语音回复**（不是看文字气泡）

### 关闭
- ✅ 点击 × 按钮
- ✅ 视频预览消失
- ✅ 摄像头指示灯熄灭
- ✅ 返回普通聊天模式

## 🔍 调试技巧

### 打开浏览器控制台

**Chrome/Edge**: `F12` 或 `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)

### 关键日志

```javascript
// 模块加载
[gs-eyes] Module loaded
[video-call] Module loaded

// 视频聊天启动
[video-call] Video call started successfully
[gs-eyes] Started successfully
[gs-eyes] MediaPipe Face Landmarker loaded

// 语音识别
[video-call] Recognized: 今天天气怎么样

// Chat API
[debug] callChatAPI { replyMode: "auto", ... }

// TTS 播放
[voice] Speaking: [回复内容]
```

### 常见问题

**1. 摄像头授权失败**
- 检查浏览器权限设置
- 确保使用 HTTPS 或 localhost
- 尝试其他浏览器（Chrome, Edge 支持最好）

**2. 语音识别不工作**
- 检查浏览器是否支持 SpeechRecognition
- Chrome/Edge 支持最好
- Safari 可能需要特殊设置

**3. TTS 没有声音**
- 检查 `window.SPVoice` 是否存在
- 查看控制台是否有 TTS 错误
- 确认系统音量未静音

**4. MediaPipe 加载慢**
- 首次加载需要下载模型文件（~10MB）
- 后续加载会从缓存读取
- 即使失败也不影响视频聊天（降级到基础模式）

## 📊 性能监控

### 查看 G's Eyes 状态

```javascript
// 在控制台输入
window.GsEyes.getState()

// 输出示例
{
  camera_on: true,
  face_present: true,
  attention: "looking",
  smile: "slight",
  stillness: "normal",
  fatigue_hint: "low",
  silence_duration_sec: 5
}
```

### 查看视频聊天状态

```javascript
window.VideoCall.getState()

// 输出示例
{
  state: "watching",
  error: null
}
```

### 测试 visualContext

```javascript
// 查看当前 visualContext
console.log(window.getGsEyesVisualContext())

// 输出示例
/*
G's Eyes 当前即时状态：
- 用户已开启视频陪伴
- 面部在画面中
- 笑容信号较弱
- 过去 25 秒沉默较长
- 沟通策略：减少连续追问，回复短一点，语气放轻，不要分析
*/
```

## 🎨 UI 检查

### 视频预览
- [ ] 16:9 比例（桌面端）
- [ ] 摄像头画面清晰
- [ ] 状态浮层显示正确

### 麦克风按钮
- [ ] 默认绿色
- [ ] 按下变红色 + 脉冲动画
- [ ] 禁用时变灰色

### 字幕
- [ ] 显示识别中的文字
- [ ] 显示 cha 的回复
- [ ] 播放完成后 3 秒清空

## 📱 移动端测试

### 访问方式
1. 电脑开启开发服务器
2. 获取电脑 IP（如 192.168.1.100）
3. 手机浏览器访问: `http://192.168.1.100:8000`
4. **注意**: HTTP 在移动端可能无法访问摄像头，需要 HTTPS

### 移动端特点
- 视频比例改为 4:3
- 麦克风按钮更小
- 字幕字体更小
- 触摸交互（touchstart/touchend）

## 🔧 故障排查

### 视频聊天无法开启

**检查清单**:
1. `window.VideoCall` 存在？
2. `window.GsEyes` 存在？
3. 浏览器支持 MediaStream API？
4. 摄像头权限已授予？

**解决方案**:
```javascript
// 手动测试摄像头
navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => console.log("摄像头 OK", stream))
  .catch(err => console.error("摄像头错误", err))
```

### 语音识别失败

**检查清单**:
1. 浏览器支持 SpeechRecognition？
2. 麦克风权限已授予？
3. 网络连接正常？（语音识别需要网络）

**解决方案**:
```javascript
// 检查 API 支持
console.log("SpeechRecognition:",
  window.SpeechRecognition || window.webkitSpeechRecognition)
```

### TTS 无声音

**检查清单**:
1. `window.SPVoice` 存在？
2. 系统音量是否静音？
3. TTS 引擎配置正确？

**解决方案**:
```javascript
// 手动测试 TTS
window.SPVoice.speak("测试语音")
  .then(() => console.log("TTS OK"))
  .catch(err => console.error("TTS 错误", err))
```

## 📚 参考文档

- **技术文档**: `docs/video-call-mode-implementation.md`
- **实现总结**: `VIDEO_CALL_MODE_SUMMARY.md`
- **G's Eyes 文档**: `docs/gs-eyes-route1-implementation.md`

## 💬 反馈

测试中遇到问题？请记录：
1. 浏览器和版本
2. 操作系统
3. 错误截图
4. 控制台日志

---

**祝测试顺利！** 🎉

有任何问题随时反馈，我们会持续优化体验。
