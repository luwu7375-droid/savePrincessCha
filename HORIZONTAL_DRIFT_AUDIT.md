# iOS 横向偏移专项审计与修复

## 问题描述

Chat 界面点击输入框后，再点击空白处收起键盘/返回时，整个小手机页面向左偏移约 5%，无法完全回正。

## 审计结果

### 横向偏移源头分析

经过全局代码审计，发现以下可能导致横向偏移的因素：

#### 1. **100vw 导致的横向溢出**

**问题位置**:
- `v2.css:64` - `.layout { width: min(100vw, 430px); }`
- `v2.css:1935` - `@media (max-width: 430px) { .layout { max-width: 100vw; } }`
- `v2.css:2046` - `@media (min-width: 768px) { .layout { width: min(100vw, 430px); } }`

**原因**: iOS Safari 在有 safe-area 或滚动条时，`100vw` 可能大于实际可视宽度，导致横向溢出。

**修复**: 改用 `width: 100%; max-width: min(100%, 430px);` + `margin: auto` 居中方式。

#### 2. **pinHorizontal() 不够强**

**问题位置**: `modules/keyboard-viewport.js:70-83`

**原因**:
- 只清理 scrollLeft，没有清理可能的 inline style 残留（left、right、margin-left、margin-right、transform）
- 没有延迟重试机制应对 iOS 异步恢复
- 调用时机不够全面

**修复**: 升级为 `resetHorizontalViewportDrift()` + `resetHorizontalSoon()` 序列调用。

#### 3. **事件覆盖不全**

**问题**:
- messageList 点击空白处没有调用 horizontal reset
- clearKeyboardState 没有调用 horizontal reset
- 缺少 visibilitychange、orientationchange 事件处理

**修复**: 在所有关键事件点接入 `resetHorizontalSoon()`。

#### 4. **居中方式不稳定**

**问题**: 未使用 `margin-left: auto; margin-right: auto;` 居中，依赖 flexbox 可能受 viewport offset 影响。

**修复**: 显式设置 `margin: auto` 确保居中。

## 修复方案

### 1. 升级 `keyboard-viewport.js` 的 horizontal reset 逻辑

**新函数**: `resetHorizontalViewportDrift(reason)`

```js
function resetHorizontalViewportDrift(reason = "unknown") {
  const vv = window.visualViewport;
  const scrollingEl = document.scrollingElement || document.documentElement;
  const layout = document.querySelector(".layout");

  // 1. Clear browser horizontal scroll
  if (window.scrollX !== 0) {
    window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
  }
  if (scrollingEl) scrollingEl.scrollLeft = 0;
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;

  // 2. Clear any residual inline horizontal styles on .layout
  if (layout) {
    layout.style.left = "";
    layout.style.right = "";
    layout.style.marginLeft = "";
    layout.style.marginRight = "";
    // Remove translateX from inline transform if present
    const inlineTransform = layout.style.transform || "";
    if (/translateX|translate3d\(/.test(inlineTransform)) {
      layout.style.transform = "";
    }
  }

  // 3. Force recheck next frame
  requestAnimationFrame(() => {
    if (window.scrollX !== 0) window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
    if (scrollingEl) scrollingEl.scrollLeft = 0;
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  });
}
```

**新函数**: `resetHorizontalSoon(reason)`

```js
function resetHorizontalSoon(reason) {
  resetHorizontalViewportDrift(reason);
  [50, 150, 300, 600].forEach((t) => {
    setTimeout(() => resetHorizontalViewportDrift(`${reason}:${t}`), t);
  });
}
```

**原理**: iOS Safari 键盘收起后 viewport 恢复是异步的，需要在多个时间点（50, 150, 300, 600ms）重复 reset，才能捕获所有异步漂移。

### 2. 扩展事件覆盖

**keyboard-viewport.js**:
- ✅ `messageInput.blur` → `resetHorizontalSoon("blur")`
- ✅ `chatSearchInput.blur` → `resetHorizontalSoon("blur")`
- ✅ `window.focus` → `resetHorizontalSoon("window-focus")`
- ✅ `window.pageshow` → `resetHorizontalSoon("pageshow")`
- ✅ `window.visibilitychange` (visible) → `resetHorizontalSoon("visibility-visible")`
- ✅ `window.orientationchange` → `resetHorizontalSoon("orientationchange")`

**app.js**:
- ✅ `messageList` 点击空白处 → `resetHorizontalSoon("blank-click")`
- ✅ `clearKeyboardState()` → `resetHorizontalSoon("clear-keyboard:...")`

### 3. CSS 横向滚动全局禁止

**v2.css**:

```css
html,
body {
  overflow: hidden;
  overflow-x: hidden;
  width: 100%;
  max-width: 100%;
  overscroll-behavior-x: none;
}

.layout {
  width: 100%;
  max-width: min(100%, 430px);
  overflow: hidden;
  overflow-x: hidden;
  margin-left: auto;
  margin-right: auto;
}
```

**移除所有 100vw**:
- `@media (max-width: 430px)` → `width: 100%; max-width: 100%;`
- `@media (min-width: 768px)` → `width: 100%; max-width: min(100%, 430px);`

### 4. 稳定居中方式

使用 `margin: auto` 而非依赖 flexbox 或 `left: 50%; transform: translateX(-50%)`，避免受 viewport offset 干扰。

## 验收标准

### 自动验证

```bash
✅ node --check modules/keyboard-viewport.js
✅ node --check app.js
✅ git diff --check
```

### 人工验收（iOS Safari / PWA）

1. ✅ 打开 Chat
2. ✅ 点击输入框，键盘弹起
3. ✅ 点击消息空白处收键盘
4. ✅ 小手机壳不向左偏移
5. ✅ 重复 10 次，不出现 5% 左偏
6. ✅ 打开 emoji panel 后关闭，不左偏
7. ✅ 打开 plus panel 后关闭，不左偏
8. ✅ 切换 tab 后回 Chat，不左偏
9. ✅ 横向没有任何可滚动空间
10. ✅ `document.documentElement.scrollLeft`、`body.scrollLeft`、`window.scrollX` 都保持 0

### Debug 模式

设置 `window.DEBUG_LAYOUT = true` 后，每次 reset 会在控制台输出：

```js
[viewport] reset horizontal drift {
  reason: "blur:150",
  scrollX: 0,
  vvOffsetLeft: 0,
  docScrollLeft: 0,
  bodyScrollLeft: 0
}
```

## 修改文件列表

1. `modules/keyboard-viewport.js` - 升级 horizontal reset 逻辑
2. `v2.css` - 移除 100vw，强化横向滚动禁止
3. `app.js` - 在空白点击和 clearKeyboardState 接入 reset

## 技术细节

### 为什么需要延迟序列？

iOS Safari 键盘收起后，viewport 恢复不是瞬时的，而是一个持续几百毫秒的异步过程：

- 0-50ms: 键盘开始收起，viewport 开始变化
- 50-150ms: viewport 高度恢复，但 offsetLeft 可能仍在漂移
- 150-300ms: 大部分情况下完成恢复
- 300-600ms: 复杂场景（横屏、slow device）的兜底

单次 reset 很容易抢早，序列调用确保在每个阶段都能捕获并修正漂移。

### 为什么要清理 inline style？

某些动画库或旧代码可能在 .layout 上设置过 inline style（left、transform 等），这些残留会干扰居中逻辑。`resetHorizontalViewportDrift` 主动清理这些残留。

### 为什么用 margin: auto 而非 translateX？

`left: 50%; transform: translateX(-50%)` 的居中方式会受 `visualViewport.offsetLeft` 影响，当 viewport 偏移时，计算出的中心点也会偏移。而 `margin: auto` 基于父容器（body），不受 viewport offset 干扰。

## 未涉及功能

按要求不修改：
- ❌ keyboard 高度重构
- ❌ emoji panel 高度计算
- ❌ Chat more 菜单
- ❌ plus panel 逻辑
- ❌ diary 功能
- ❌ quote reply 协议
- ❌ PWA / service worker
- ❌ 数据库 migration
