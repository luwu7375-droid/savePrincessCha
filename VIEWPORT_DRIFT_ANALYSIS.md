# iOS Safari Textarea Focus 横向偏移问题分析

## 问题现象

在 iOS Safari 中，当用户点击 textarea (`#messageInput`) 触发 focus 时，会出现横向参考系不一致：
- **chat 主体区域**（.top-bar, .message-list）保持原位
- **输入框区域**（.input-bar）发生横向偏移
- 两者的横向中心点不再对齐

## 当前架构

### 1. HTML 层级结构
```
<body>
  <div class="layout">                    ← 手机壳容器
    <section class="v2-page--chat">       ← chat 页面
      <div class="chat-shell">            ← flex 容器
        <header class="top-bar">          ← flex-shrink: 0
        <section class="message-list">    ← flex: 1
        <form class="input-bar">          ← flex-shrink: 0, margin: 0 20px var(--dock-gap)
```

### 2. CSS 定位模型

#### .layout (手机壳)
```css
/* 桌面：居中小手机壳 */
.layout {
  width: 100%;
  max-width: min(100%, 430px);
  height: min(var(--app-shell-h, 100dvh), 932px);
  margin: 0 auto;
  position: relative;
}

/* Mobile ≤430px：全屏 + 横向补偿 */
@media (max-width: 430px) {
  .layout {
    width: 100%;
    max-width: 100%;
    /* ⚠️ 这里尝试补偿 visualViewport.offsetLeft */
    transform: translateX(calc(-1 * var(--vv-offset-left, 0px)));
  }
}
```

#### .chat-shell (flex 容器)
```css
.chat-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

#### .input-bar (composer)
```css
.input-bar {
  position: relative;
  flex-shrink: 0;
  margin: 0 20px var(--dock-gap);  /* 左右各 20px margin */
  max-width: calc(100% - 40px);
  width: auto;
  box-sizing: border-box;
}

/* Mobile ≤430px */
@media (max-width: 430px) {
  .input-bar {
    margin-left: 16px;    /* 改为 16px */
    margin-right: 16px;
    max-width: calc(100% - 32px);
  }
}
```

### 3. 横向补偿机制

#### keyboard-viewport.js 的尝试
```javascript
function resetHorizontalViewportDrift(reason) {
  const vv = window.visualViewport;
  const offsetLeft = vv?.offsetLeft || 0;

  // 1. 清除浏览器横向滚动
  if (window.scrollX !== 0) {
    window.scrollTo({ left: 0, top: window.scrollY });
  }

  // 2. 清除 scrollLeft
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;

  // 3. ⚠️ 写入 CSS 变量，供 .layout transform 使用
  root.style.setProperty("--vv-offset-left", `${Math.round(offsetLeft)}px`);

  // 4. 多阶段重试（50ms, 150ms, 300ms, 600ms）
  [50, 150, 300, 600].forEach(t => {
    setTimeout(() => resetHorizontalViewportDrift(`${reason}:${t}`), t);
  });
}
```

## 根本原因分析

### 1. visualViewport.offsetLeft 的本质

iOS Safari 在 textarea focus 时会产生 `visualViewport.offsetLeft` 非零值，这代表：
- **visualViewport** 相对于 **layout viewport** 的横向偏移
- 这是浏览器的"视觉窗口缩放/平移"行为
- **不是** document 的 scrollX（scrollX 可以通过 scrollTo 清零）

### 2. 当前补偿策略的矛盾

#### 策略：对 .layout 整体做反向 transform
```css
.layout {
  transform: translateX(calc(-1 * var(--vv-offset-left, 0px)));
}
```

#### 问题：
1. **参考系冲突**
   - `.layout` 是 `position: relative`（桌面）或无定位（mobile）
   - `transform` 会创建新的 **containing block**
   - 内部所有 absolute/fixed 子元素的参考系都会改变

2. **只移动了容器，没有移动内容的参考系**
   - `.layout` 被向左推了 `-offsetLeft`
   - 但 `.input-bar` 的横向定位仍然基于**原始的 layout 宽度**
   - 结果：.layout 左移，但 .input-bar 的 margin 计算仍基于未移动的坐标

3. **visualViewport 和 layout viewport 的双重标准**
   - `.top-bar` 和 `.message-list` 在 flex 流中，跟随 .layout transform
   - `.input-bar` 也在流中，理论上也应该跟随
   - 但 `margin: 0 20px` 的百分比/calc 计算基准可能不一致

### 3. 为什么会产生横向不一致？

#### 假设场景：
```
初始状态（keyboard 未打开）：
- visualViewport.offsetLeft = 0
- .layout transform = translateX(0)
- .input-bar margin = 0 20px
- 一切对齐 ✓

focus 后（keyboard 打开）：
- visualViewport.offsetLeft = 30px（举例）
- resetHorizontalViewportDrift 被调用
- root.style.setProperty("--vv-offset-left", "30px")
- .layout transform = translateX(-30px)  ← .layout 向左移动

此时：
- .layout 的物理位置：向左偏移 30px
- .top-bar（flex child）：跟随 .layout 移动，向左 30px ✓
- .message-list（flex child）：跟随 .layout 移动，向左 30px ✓
- .input-bar（flex child）：理论上应该跟随，但...

⚠️ 可能的断点：
- .input-bar 的 margin: 0 20px 是相对于**谁**计算的？
- transform 后，.chat-shell 的 width: 100% 是否重新计算？
- 是否存在 width/max-width 的 calc() 在 transform 后失效？
```

### 4. 关键疑点

#### A. `.input-bar` 的宽度计算
```css
.input-bar {
  margin: 0 20px var(--dock-gap);
  max-width: calc(100% - 40px);  /* ← 这个 100% 是谁的 100%？ */
  width: auto;
}
```

在 `.layout` 被 `transform: translateX(-30px)` 后：
- `.chat-shell` 的 `width: 100%` 仍然是原宽度（390px）
- 但视觉上 `.layout` 已经向左偏移
- `.input-bar` 的 `calc(100% - 40px)` 计算的是 `390px - 40px = 350px`
- **这个 350px 的中心点** 相对于**被 transform 的 .layout** 是否仍然对齐？

#### B. containing block 的影响
`transform` 会创建新的 containing block，影响：
- absolute positioned 子元素
- fixed positioned 子元素
- 可能影响百分比宽度的计算基准

但 `.input-bar` 是 `position: relative` 在 flex 流中，理论上不应该受影响。

#### C. visualViewport 的缩放效果
iOS Safari 的 visualViewport 不仅有 `offsetLeft`，还有：
- `scale`：缩放比例
- `width`：实际可视宽度

如果 focus 时发生了轻微缩放（scale ≠ 1），那么：
- `.layout` 被 transform 移动
- 但浏览器的"视觉中心"可能不在预期位置
- 导致 `.input-bar` 看起来偏移

### 5. scrollTo(0, y) 的局限性

```javascript
window.scrollTo({ left: 0, top: window.scrollY });
```

这只能清除 **layout viewport** 的 scrollX，但无法控制：
- **visualViewport** 的 offsetLeft/offsetTop
- visualViewport 是浏览器内部管理的"视觉窗口"
- 当用户缩放或输入框获得焦点时，浏览器会自动调整 visualViewport
- **我们无法通过 JS 直接控制 visualViewport 的位置**

## 可能的根本原因推测

### 假设 1：transform 和 margin 的计算时序问题
1. iOS Safari focus textarea
2. visualViewport.offsetLeft 变为非零（比如 30px）
3. keyboard-viewport.js 检测到，设置 `--vv-offset-left: 30px`
4. CSS 应用 `.layout { transform: translateX(-30px) }`
5. 浏览器重新布局：
   - `.layout` 向左移动 30px
   - `.chat-shell` 作为子元素，整体向左 30px
   - `.input-bar` 的 `margin: 0 20px` **在 transform 之后重新计算**
   - 但此时百分比/calc 的参考系可能混乱

### 假设 2：visualViewport 和实际渲染的异步
- `visualViewport.offsetLeft` 是浏览器报告的值
- 但 transform 的应用和浏览器的实际滚动/缩放可能不同步
- 导致"我们认为已经补偿了，但实际上浏览器还在移动"

### 假设 3：textarea 的 scrollIntoView 行为
- iOS Safari 在 focus 时会自动调用 `scrollIntoView`
- 这会同时影响：
  - layout viewport 的 scrollY
  - visualViewport 的 offsetLeft/offsetTop
- 我们的 `scrollTo(0, y)` 只清除了 layout scrollX
- 但无法阻止浏览器后续的 scrollIntoView 调整

### 假设 4：.input-bar 的 containing block 不明确
```css
.input-bar {
  position: relative;  /* ← 相对定位，参考系是它原本的流位置 */
  margin: 0 20px;
  max-width: calc(100% - 40px);
}
```

当 `.layout` 被 transform 后：
- `.input-bar` 的"原本流位置"也跟着 transform
- 但 `margin` 和 `max-width` 的计算可能基于**未 transform 的坐标**
- 导致视觉偏移

## 为什么原方案复杂但仍不能完全解决？

### 当前的横向补偿链路：
```
textarea.focus()
  ↓
visualViewport.offsetLeft ≠ 0
  ↓
resetHorizontalViewportDrift()
  ↓
1. scrollTo(0, y)           ← 清除 layout scrollX
2. scrollLeft = 0           ← 清除 document/body scrollLeft
3. layout.style.transform   ← 清除旧的 inline transform
4. --vv-offset-left = X     ← 写入 CSS 变量
  ↓
CSS: .layout { transform: translateX(-X) }
  ↓
⚠️ 但 visualViewport.offsetLeft 仍然是 X
⚠️ 浏览器的"视觉中心"没有改变
⚠️ 只是我们把容器向反方向推了
```

### 核心矛盾：
我们试图用 **CSS transform 来对抗浏览器的 visualViewport 偏移**，但：
- visualViewport 是浏览器管理的"相机位置"
- transform 是我们控制的"元素位置"
- 两者的坐标系不完全一致

就像：
- 浏览器把相机向右移了 30px（offsetLeft = 30）
- 我们把舞台向左推了 30px（transform: translateX(-30px)）
- 理论上应该抵消，但实际上：
  - 相机的"中心点"可能不在我们预期的位置
  - 舞台上的演员（.input-bar）的位置计算可能基于旧坐标系

## 可能的验证方向

### 1. 在真机上打印完整的几何信息
```javascript
function debugHorizontalAlignment() {
  const vv = window.visualViewport;
  const layout = document.querySelector(".layout");
  const chatShell = document.querySelector(".chat-shell");
  const topBar = document.querySelector(".top-bar");
  const messageList = document.querySelector(".message-list");
  const inputBar = document.querySelector(".input-bar");

  console.table({
    visualViewport: {
      offsetLeft: vv.offsetLeft,
      width: vv.width,
      scale: vv.scale,
    },
    layout: {
      left: layout.getBoundingClientRect().left,
      right: layout.getBoundingClientRect().right,
      width: layout.getBoundingClientRect().width,
      computedWidth: getComputedStyle(layout).width,
      transform: getComputedStyle(layout).transform,
    },
    chatShell: {
      left: chatShell.getBoundingClientRect().left,
      right: chatShell.getBoundingClientRect().right,
      width: chatShell.getBoundingClientRect().width,
    },
    topBar: {
      left: topBar.getBoundingClientRect().left,
      right: topBar.getBoundingClientRect().right,
      centerX: (topBar.getBoundingClientRect().left + topBar.getBoundingClientRect().right) / 2,
    },
    messageList: {
      left: messageList.getBoundingClientRect().left,
      right: messageList.getBoundingClientRect().right,
      centerX: (messageList.getBoundingClientRect().left + messageList.getBoundingClientRect().right) / 2,
    },
    inputBar: {
      left: inputBar.getBoundingClientRect().left,
      right: inputBar.getBoundingClientRect().right,
      centerX: (inputBar.getBoundingClientRect().left + inputBar.getBoundingClientRect().right) / 2,
      marginLeft: getComputedStyle(inputBar).marginLeft,
      marginRight: getComputedStyle(inputBar).marginRight,
      computedWidth: getComputedStyle(inputBar).width,
      maxWidth: getComputedStyle(inputBar).maxWidth,
    },
  });

  // 计算中心点偏差
  const topBarCenter = (topBar.getBoundingClientRect().left + topBar.getBoundingClientRect().right) / 2;
  const inputBarCenter = (inputBar.getBoundingClientRect().left + inputBar.getBoundingClientRect().right) / 2;
  console.warn("Center offset:", inputBarCenter - topBarCenter, "px");
}
```

### 2. 测试不同的补偿策略

#### 策略 A：不移动 .layout，移动 .chat-shell
```css
.chat-shell {
  transform: translateX(calc(-1 * var(--vv-offset-left, 0px)));
}
```

#### 策略 B：不移动容器，调整 .input-bar margin
```javascript
const offsetLeft = visualViewport.offsetLeft;
inputBar.style.marginLeft = `${20 - offsetLeft}px`;
inputBar.style.marginRight = `${20 + offsetLeft}px`;
```

#### 策略 C：使用 position: fixed 让 composer 脱离流
```css
.input-bar {
  position: fixed;
  left: 20px;
  right: 20px;
  bottom: var(--dock-gap);
}
```

#### 策略 D：完全放弃补偿，接受 iOS 的原生行为
- 不写 --vv-offset-left
- 不 transform .layout
- 让浏览器自然处理 focus 行为
- 只确保所有元素使用**相同的宽度基准**（width: 100%）

## 结论

当前的横向偏移问题可能源于：

1. **坐标系混乱**：visualViewport 的 offsetLeft 和 CSS transform 的参考系不完全一致
2. **计算时序**：transform 应用后，margin/width 的重新计算可能基于旧坐标
3. **浏览器异��**：scrollIntoView 和 visualViewport 调整可能在我们的补偿之后继续发生
4. **containing block**：transform 创建新的 containing block 可能影响子元素的百分比计算

**建议的验证步骤**：
1. 在真机上打印完整几何信息，找出 topBar 和 inputBar 的实际偏差
2. 测试不同的补偿策略（移动 shell vs 调整 margin vs fixed 定位）
3. 考虑是否接受浏览器原生行为，通过统一宽度基准而非对抗 offsetLeft

**不建议的方向**：
- 继续增加 setTimeout 重试次数（已经有 4 轮，仍不够）
- 同时操作 transform + margin + scrollTo（坐标系越来越乱）
- 硬编码像素偏移（不同设备/缩放比例下会失效）
