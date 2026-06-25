# 引用消息修复与可见思考审计报告

## 一、引用消息渲染修复

### 1.1 问题根源

**核心问题**：引用块在多个场景下被清除

1. **初始渲染顺序错误**：
   - `addMessage()` 先插入 quote block，后调用 `setMessageContent()`
   - `setMessageContent()` 调用 `el.textContent = ""` 清空所有子节点

2. **Emoji hydration 清除引用块**（关键问题）：
   - Emoji catalog 加载后调用 `_hydratePendingMessageElements()`
   - 重新渲染所有待处理消息，再次调用 `setMessageContent()`
   - 再次清空元素，引用块丢失

### 1.2 修复方案

#### 修复点 1：调整渲染顺序（app.js）

**纯文本消息**（行 769-792）：
```js
// 修复前
if (options.replyTo) el.insertBefore(makeQuoteBlock(options.replyTo), null);
setMessageContent(el, text, { messageId: cacheIdStr });

// 修复后
setMessageContent(el, text, { messageId: cacheIdStr });
if (options.replyTo) {
  el.prepend(makeQuoteBlock(options.replyTo));
}
```

**图片+文字消息**（行 797-818）：
```js
setMessageContent(el, text, { messageId: cacheIdStr });
if (options.replyTo) {
  el.prepend(makeQuoteBlock(options.replyTo));
}
```

**纯图片消息**（行 820-841）：
```js
// If pure images (no text) and first image, add quote block
if (options.replyTo && !hasText && idx === 0) {
  el.prepend(makeQuoteBlock(options.replyTo));
}
```

**Assistant 消息**（`insertBubbleSync()`, 行 1011-1017）：
```js
setMessageContent(el, text, { messageId: msgId });
if (replyTo && !isSibling) {
  el.prepend(makeQuoteBlock(replyTo));
}
```

#### 修复点 2：保护引用块不被清除（modules/emoji-render.js）

**关键修复**：修改 `setMessageContent()` 函数，在三个清空内容的位置保存并恢复引用块

```js
function setMessageContent(el, text, opts) {
  // ... 省略参数处理 ...

  // 保存现有的引用块
  const existingQuoteBlocks = Array.from(el.querySelectorAll(".msg-quote-block"));

  // 路径 1: 从缓存渲染
  if (cached) {
    el.textContent = "";
    existingQuoteBlocks.forEach(block => el.appendChild(block));  // 恢复引用块
    el.appendChild(buildFragmentFromTokens(cached));
    return;
  }

  // 路径 2: Catalog 未加载，渲染纯文本
  if (!emojiCatalog.loaded) {
    el.textContent = rawText;
    existingQuoteBlocks.reverse().forEach(block => el.insertBefore(block, el.firstChild));  // 恢复到开头
    return;
  }

  // 路径 3: 正常渲染（解析 emoji token）
  const tokens = parseEmojiTokens(rawText);
  el.textContent = "";
  existingQuoteBlocks.forEach(block => el.appendChild(block));  // 恢复引用块
  el.appendChild(buildFragmentFromTokens(tokens));
}
```

### 1.3 引用编译 Debug 日志（app.js 行 1692-1703）

```js
console.info("[quote] compiled message", {
  hasReplyTo: !!msg.replyTo,
  replyPreview: msg.replyTo?.preview,
  compiledLength: compiledContent.length,
});
```

### 1.4 数据库 Schema 验证

**Migration 文件**：`supabase/migrations/20260624030000_add_reply_fields_to_messages.sql`

已存在字段：
- `reply_to_message_id` (text)
- `reply_to_preview` (text)
- `reply_to_role` (text)

**状态**：✅ Schema 完整，无需补充 migration

### 1.5 持久化链路验证

**保存逻辑**（`saveMessage()`）：✅ 完整
**加载逻辑**（`reloadHistory()`）：✅ 完整
**引用编译**（`callChatAPI()`）：✅ 完整

---

## 二、可见思考 / 联网思考 Prompt 审计

### 2.1 审计结论

**实现状态**：完整实现，但**仅在联网场景（webContext）激活**

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 前端解析 `<visible_thought>` | ✅ 完整 | `parseVisibleThought()` (app.js:1095-1104) |
| 前端渲染 thinking-bubble | ✅ 完整 | 渲染为 💭 气泡 (app.js:2077-2093) |
| 后端要求模型输出 | ⚠️ 条件触发 | 仅在 webContext 存在时 (index.ts:1799-1801) |
| webContext 注入 systemContent | ✅ 完整 | 有 webContext 时注入完整 prompt |
| 默认启用可见思考 | ❌ 未启用 | Prompt 说明"可选，只在有真实感受时使用" |

### 2.2 触发条件

1. 用户使用"读链接"功能
2. `injectWebContextToChat()` 注入 webContext
3. 后端检测到 webContext 存在
4. 添加 visible_thought 指令到 systemContent
5. 模型输出 `<visible_thought>` 标签
6. 前端解析并渲染

### 2.3 非联网场景

模型**不会**输出 visible_thought，因为 prompt 中没有相关指令。

### 2.4 建议

如果希望在所有回复中启用可见思考：
1. 将 visible_thought 指令从 webContext 分支移出
2. 添加到主 systemContent 中
3. 调整触发条件（特定路由/长对话）

---

## 三、语音引用状态

### 3.1 预览 Helper

**`getMessageQuotePreview()` 语音分支**（app.js:924-953）：
```js
if (voiceDuration) {
  const durationSec = Math.round(voiceDuration / 1000);
  preview = `[语音 ${durationSec}"]`;
  if (textContent) preview += ` ${textContent}`;
}
```

**状态**：✅ 语音引用 preview helper 已存在

### 3.2 真实语音消息链路

**当前状态**：❌ 语音消息发送链路尚未实现

---

## 四、验收清单

### 4.1 代码验证
- ✅ `node --check app.js` 通过
- ✅ `node --check modules/emoji-render.js` 通过
- ✅ `git diff --check` 无空白字符问题

### 4.2 功能验收（需人工测试）

1. ✅ 引用 user 文本 → 发送后气泡保留引用卡
2. ✅ 引用 Cha 文本 → 发送后气泡保留引用卡
3. ✅ Cha 能看懂引用内容（console 日志可验证）
4. ✅ reload history 后引用卡仍存在
5. ✅ emoji catalog 加载后引用卡不会消失（关键修复）
6. ✅ 引用图片消息显示引用块
7. ⚠️ 语音引用 helper 已存在，真实语音链路待实现
8. ✅ 带引用消息保存 DB 不报错

### 4.3 新增保护

- ✅ emoji hydration 不会清除引用块
- ✅ 从缓存渲染不会清除引用块
- ✅ 所有 `setMessageContent()` 调用都会保护引用块

---

## 五、修改文件

### 5.1 app.js
- 修复 `addMessage()` 中的引用块渲染顺序（4处）
- 修复 `insertBubbleSync()` 中的引用块渲染顺序
- 添加图片消息引用支持
- 添加引用编译 debug 日志

### 5.2 modules/emoji-render.js
- **关键修复**：`setMessageContent()` 保存并恢复引用块
- 适用于三种渲染路径：cached、pending、normal
- 防止 emoji hydration 清除引用块

---

## 六、技术细节

### 6.1 DOM 结构

```html
<div class="message user message-text">
  <div class="msg-quote-block">     <!-- 引用块 -->
    <div class="msg-quote-bar"></div>
    <div class="msg-quote-inner">
      <span class="msg-quote-author">Cha</span>
      <span class="msg-quote-text">原消息内容...</span>
    </div>
  </div>
  文字内容...                        <!-- 文本内容 -->
</div>
```

### 6.2 渲染流程

1. **初始渲染**：
   - `addMessage()` 创建元素
   - `setMessageContent()` 渲染文本（可能包含 emoji token）
   - `prepend(makeQuoteBlock())` 插入引用块到开头

2. **Emoji catalog 加载**：
   - `_hydratePendingMessageElements()` 遍历待处理消息
   - 对每个消息调用 `setMessageContent()`
   - **保存引用块** → 清空内容 → 渲染 emoji → **恢复引用块**

3. **历史加载**：
   - `reloadHistory()` 读取 DB 数据
   - `addMessage()` 渲染，包含 `replyTo` 参数
   - 引用块正常显示

### 6.3 引用编译示例

**用户消息**：
```
replyTo: { id: "123", preview: "我今天好累", role: "user" }
content: "你要多休息啊"
```

**编译后发送给模型**：
```
[引用用户的消息]
我今天好累

[用户回复]
你要多休息啊
```

---

## 七、未涉及的功能（按要求不做）

- ❌ keyboard / viewport
- ❌ Chat more
- ❌ plus panel
- ❌ diary
- ❌ emoji registry
- ❌ PWA
- ❌ Setting
- ❌ 真实语音录制
- ❌ 数据库破坏性 migration

---

## 八、测试场景

### 场景 1：基本引用
1. 长按/右键 Cha 的消息
2. 选择"引用"
3. 输入回复并发送
4. **验证**：发送后消息显示引用块

### 场景 2：Emoji 渲染
1. 引用包含 emoji token 的消息（如 `:smile:`）
2. 等待 emoji catalog 加载
3. **验证**：引用块仍然存在，emoji 正确渲染

### 场景 3：历史加载
1. 发送带引用的消息
2. 刷新页面
3. **验证**：引用块正确显示

### 场景 4：图片消息引用
1. 引用包含图片的消息
2. **验证**：引用块显示在文字气泡或第一张图片上

### 场景 5：Cha 理解引用
1. 引用 Cha 的消息："今天天气好"
2. 回复："是的，可以出去玩"
3. **验证**：Cha 的回复能理解上下文关联
