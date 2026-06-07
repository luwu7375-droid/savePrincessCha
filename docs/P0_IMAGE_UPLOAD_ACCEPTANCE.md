# P0 图片上传与识别体验验收清单

> 审计日期：2026-06-07
> 审计范围：app.js / index.html / style.css 只读，不涉及 history pagination。

---

## 当前实现

### 图片选择入口

- **桌面端**：工具栏「附图」按钮（`#imageAttachBtn`）点击后触发隐藏的 `<input type="file" accept="image/*">`，打开系统文件选择器（`app.js:2610`）。
- **移动端**（≤820px）：同一按钮点击后调用 `showImageBottomSheet()`，弹出底部工作表，提供「从相册选择」和「拍照」两个选项（`app.js:2560`）。
- **拖拽上传**：`.chat-shell` 区域监听 `dragover` / `drop`，取第一张图片文件（`app.js:2635`）。
- **粘贴上传**：输入框监听 `paste`，检测剪贴板中的图片类型后处理（`app.js:2652`）。

### pendingImage 保存机制

- 全局变量 `let pendingImage = null`（`app.js:33`），结构为：
  ```
  { dataUrl: string|null, loading: boolean, error: string|null, file: File|null }
  ```
- 选图后立即设置 `loading: true`，压缩完成后写入 `dataUrl`，压缩失败写入 `error`（`app.js:2527`）。
- 允许格式：JPEG、PNG、WebP、GIF（`app.js:2513`）。
- 大小硬限制：20MB，超出直接设置错误信息，不进入压缩流程（`app.js:2522`）。
- 压缩参数：最长边 1600px，输出 JPEG 0.85 质量（`app.js:2468`）。

### updateAttachmentCard 展示逻辑

`updateAttachmentCard()`（`app.js:2493`）根据 `pendingImage` 状态切换 `#imagePreviewBar` 的 CSS 类：

| pendingImage 状态 | CSS 类 | 视觉效果 |
|---|---|---|
| null | hidden | 预览栏隐藏 |
| loading: true | loading | 显示骨架屏扫光动画，隐藏缩略图和移除按钮 |
| error 非空 | error | 显示错误文字和重试按钮，隐藏缩略图和移除按钮 |
| dataUrl 就绪 | （无特殊类） | 显示 64×64 缩略图和 ✕ 移除按钮 |

### 发送后用户消息区图片展示

- 发送前将 `pendingImage.dataUrl` 保存为快照，清空 `pendingImage`（`app.js:2685`）。
- 构建 `content` 数组：`[{ type:"text", text }, { type:"image_url", image_url: { url: dataUrl, detail:"low" } }]`（`app.js:2693`）。
- `addMessage()` 遍历 `content` 数组，对 `image_url` 类型创建 `<img class="msg-image">`，data URL 直接作为 `src`（`app.js:494`）。
- 已发送图片可点击触发灯箱全屏查看（`app.js:2539`）。
- 图片 CSS：`max-width:100%`、`max-height:300px`、`border-radius:12px`（`style.css:1121`）。

### 图片内容进入 callChatAPI 的路径

```
handleSubmit()
  → snapshot = pendingImage.dataUrl
  → content = [text_part, image_url_part]   // detail:"low"
  → chatMessages.push({ role:"user", content })
  → triggerReply()
    → callChatAPI(messages, replyMode)       // messages 原样传入，含 image_url
      → fetch(endpoint, { body: JSON.stringify({ messages }) })
```

后端接收到标准 OpenAI vision 格式的 `image_url` 消息体，由后端转发给模型。

### 多图支持

**不支持**。`pendingImage` 是单一对象，file input 无 `multiple` 属性，拖拽和粘贴均只取第一张（`app.js:2620, 2647`）。

### 上传 Loading 状态

有骨架屏动画（`style.css:1135`），在图片压缩期间显示。压缩为同步 canvas 操作，速度快，loading 窗口很短，实际使用中几乎不可见。

### 移除图片按钮

`#imgPreviewRemove`（`index.html:69`），点击后清空 `pendingImage` 并重置 input（`app.js:2625`）。仅在 `dataUrl` 就绪状态下可见，loading/error 状态下被 CSS 隐藏。

### 错误重试按钮

`#imgPreviewRetry`，仅在 error 状态显示，点击后用保存的 `file` 对象重新调用 `handleImageFile()`（`app.js:2631`）。

### 移动端体验

- 底部工作表提供相册和拍照两个入口，有 `safe-area-inset-bottom` 适配（`style.css:1222`）。
- 拍照使用 `capture="environment"` 调起后置摄像头。
- 预览栏在 ≤820px 时 padding 收窄（`style.css:1130`）。
- **已知问题**：见下节。

### Token / 成本提示

前端**无图片 token 成本估算和提示**。现有 token 估算仅用于记忆系统（mastodon profile、memory context），图片消耗由后端处理，不回传前端（`app.js:2902`）。

---

## 当前问题

按严重程度排列，均来自代码审计，未脑补。

### P0 级（阻塞核心体验）

1. **图片不做本地 blob URL 回显**：`msg-image` 的 `src` 是完整 base64 data URL（可达数百 KB），在消息列表中大量存在时会造成 DOM 内存压力，且历史记录加载后 src 为空字符串时图片不可见（`app.js:506` 没有 fallback 处理）。

2. **`detail:"low"` 硬编码**：所有图片均以 `detail:"low"` 发送（`app.js:2698`），识别精度受限，用户无法感知也无法调整。虽然降低了 token 消耗，但对需要文字识别的场景会失败。

3. **移动端预览栏遮挡输入法**：预览栏在输入框上方，移动端键盘弹起时预览栏位置未随视口调整，在某些机型上可能被键盘遮挡，导致用户看不到图片已就绪。

4. **压缩失败无法触发重试的场景**：错误重试依赖 `pendingImage.file`，但 20MB 超限时 `file` 被置为 `null`（`app.js:2524`），导致重试按钮点击后无反应（调用 `handleImageFile(null)`）。

### P1 级（体验瑕疵）

5. **拖拽时无视觉反馈关闭**：`drag-leave` 事件未清除 `drag-over` 类的情况 —— 代码中有 `dragover` 添加类，但未确认 `dragleave` 也移除该类（`app.js:2635`）。

6. **GIF 支持不完整**：允许格式包含 GIF（`app.js:2513`），但 canvas 压缩会将 GIF 转为静态 JPEG，动图信息丢失，用户无感知。

7. **历史消息中图片无法再次进入灯箱**：灯箱事件绑定逻辑需确认是否对历史加载时动态添加的图片也做了委托监听（代码中为直接绑定 `addMessage` 时创建的 img，reload history 后未确认）。

8. **无图片尺寸/格式信息展示**：预览卡片只有缩略图，用户不知道压缩后大小和格式。

---

## P0 必做

本阶段目标：单图端到端闭环，能选、能预览、能删、能发、能识别、失败有提示、移动端可用。

- **单图选择**：桌面文件选择器 + 移动端底部工作表，已实现。
- **发送前预览**：缩略图展示 + 骨架屏 loading，已实现。需验证压缩完成前后状态切换正确。
- **可移除**：✕ 按钮已实现。需修复 20MB 超限时重试按钮无效的问题（`error` 状态不显示移除按钮，需确认 error 状态下可以通过某路径重选）。
- **发送后用户消息区立即显示图片**：data URL 直接渲染，已实现，视觉上即时出现。
- **assistant 能识别图片**：content 数组以标准 vision 格式传入 API，路径已通。需端到端测试确认后端 model 支持 vision。
- **失败时有提示**：格式不支持、大小超限有错误文字，压缩失败有 error 状态。需确认 API 返回 vision 错误时前端是否有对应提示。
- **移动端可用**：底部工作表已实现。需验证键盘弹起时预览栏可见性。

---

## P0 不做

本阶段明确暂缓，不纳入验收：

- 多图上传
- 图片压缩策略可配置（quality、maxPx 调整）
- 图片历史图库 / 附件管理
- OCR 专项（文档扫描、表格识别）
- 成本统计精算（per-image token 计算、月度用量统计）
- 外链图片抓取（URL 转 base64）
- detail 级别切换（auto / high / low）
- 图片注释 / 标注

---

## 验收用例

以下为手动验收 case，在浏览器中逐一执行。

| # | 前置条件 | 操作 | 预期结果 |
|---|---|---|---|
| 1 | 桌面端，新对话 | 点击附图按钮，选择一张 <1MB 的 JPEG | 输入框上方出现缩略图预览，✕ 按钮可见，输入框可正常输入文字 |
| 2 | 有缩略图预览 | 点击 ✕ 移除按钮 | 预览栏消失，再次点击附图可重新选图 |
| 3 | 有缩略图预览 | 输入文字后点击发送 | 用户消息气泡中图片立即显示（在文字上方或下方），图片无破图，assistant 回复内容涉及图片内容 |
| 4 | 无附图，仅文字 | 正常发送文字消息 | 功能不受影响，图片相关 UI 不显示 |
| 5 | 桌面端 | 将图片文件拖入聊天区域 | 预览栏出现，缩略图展示，与按钮选图行为一致 |
| 6 | 桌面端，输入框聚焦 | 粘贴图片（Cmd+V 或 Ctrl+V） | 预览栏出现，缩略图展示，与按钮选图行为一致 |
| 7 | 任意状态 | 选择一张 >20MB 的图片 | 预览区显示错误提示「图片超过 20MB 限制」，不可发送 |
| 8 | 任意状态 | 选择一个非图片文件（如 .pdf） | 文件选择器已通过 `accept="image/*"` 过滤，若绕过则前端检测格式后显示错误提示 |
| 9 | 移动端（iOS/Android） | 点击附图按钮 | 底部工作表弹出，显示「从相册选择」和「拍照」两个选项 |
| 10 | 移动端，选图后 | 弹出键盘输入文字 | 预览栏仍可见，不被键盘完全遮挡，可正常发送 |

---

## 后续 P1/P2

| 优先级 | 功能 | 说明 |
|---|---|---|
| P1 | 多图上传 | 支持一次发送多张图片，`pendingImage` 改为数组，UI 横向滚动预览 |
| P1 | detail 级别切换 | 提供 auto/low/high 选项或自动根据图片内容选择，改善文字识别精度 |
| P1 | 图片 token 成本提示 | 估算单张图片的 token 用量（low ≈ 85 tokens，high 按分块计算），在预览卡片或发送时展示 |
| P1 | 移动端键盘适配优化 | 监听 `visualViewport` resize，确保预览栏在键盘弹出时不被遮挡 |
| P2 | 图片压缩可配置 | 提供质量/尺寸滑块，或按 Tier 自动选择压缩策略 |
| P2 | 历史附件管理 | 对话历史中的图片可集中查看，支持下载 |
| P2 | blob URL 替换 data URL | 在消息 DOM 中使用 `URL.createObjectURL()` 替代内联 base64，降低 DOM 内存占用 |
| P2 | GIF 支持说明 | 动图上传时提示「GIF 将转为静态图片」或保留原始 GIF 不压缩 |
| P2 | OCR 专项模式 | 针对文档/截图场景强制 `detail:"high"`，提供「识别文字」快捷指令 |
| P2 | 外链图片支持 | 允许粘贴图片 URL，后端抓取转 base64 |
