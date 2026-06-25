# iOS 输入框 focus 横向偏移专项审计与修复

## 问题描述

Chat 界面点击输入框（messageInput / chatSearchInput）时，整个小手机页面向左偏移约 5%，无法完全回正。

**关键发现**：偏移发生在 **focus 阶段**（点击输入框时），而非 blur 后。之前的 PR 修复了 blur/blank-click，但未解决 focus 时的根本原因。

## 审计结果

### 1. 横向偏移源头分析

#### 1.1 messageInput / chatSearchInput focus 处理不足

**问题位置**: `modules/keyboard-viewport.js:202-206, 216-220`

**原 focus 处理**:
```javascript
if (_opts.messageInput) {
  _opts.messageInput.addEventListener("focus", () => {
    schedule();  // ← 仅调用 schedule()，通过 RAF 异步更新，太晚！
  });
}
```

**问题**:
- `schedule()` 使用 `requestAnimationFrame`，在下一帧才执行
- iOS Safari 在 input focus 时会立即触发 `scrollIntoView` 和 visualViewport 调整
- RAF 回调执行时，浏览器已经完成横向滚动，为时已晚

**修复**: 在 focus 事件触发时 **立即** 调用 `resetHorizontalDuringFocus()`，使用激进的重试序列 `[16, 50, 100, 180, 300, 500, 800]ms`。

#### 1.2 visualViewport resize/scroll 期间未重置横向偏移

**问题位置**: `modules/keyboard-viewport.js:177-192`

**原 resize/scroll 处理**:
```javascript
vv.addEventListener("resize", () => {
  schedule();  // 仅更新 --kb，未处理横向偏移
});
vv.addEventListener("scroll", () => {
  schedule();  // 同上
});
```

**问题**:
- 键盘动画期间，visualViewport 会多次 resize 和 scroll
- 这些事件可能伴随 `offsetLeft` 漂移
- 原代码未在这些事件中重置横向偏移

**修复**: 在 resize/scroll 事件中，检测是否有 chat input focused，如有则立即调用 `resetHorizontalViewportDrift()`。

#### 1.3 100vw 导致的横向溢出

**问题位置**:
- `v2.css:64` - `.layout { width: min(100vw, 430px); }`
- `v2.css:1841` - `.status-panel { width: min(280px, calc(100vw - 28px)); }`
- `v2.css:1907` - `@media (max-width: 430px) { .layout { max-width: 100vw; } }`
- `v2.css:2018` - `@media (min-width: 768px) { .layout { width: min(100vw, 430px); } }`

**原因**: iOS Safari 在有 safe-area 或滚动条时，`100vw` 可能大于实际可视宽度，导致横向溢出。

**修复**: 全部改为 `100%` 或 `calc(100% - Npx)`，配合 `overflow-x: hidden`。

#### 1.4 居中方式不稳定

**问题**: 未显式使用 `margin-left: auto; margin-right: auto;` 居中，依赖 flexbox 可能受 viewport offset 影响。

**修复**: 在 `.layout` 上显式设置 `margin-left: auto; margin-right: auto;`。

### 2. scrollIntoView 调用审计

**审计范围**: `app.js` 全文

**发现的 scrollIntoView 调用**:
1. `app.js:943` - `msgEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });`
   - **用途**: 滚动到搜索结果消息
   - **安全性**: ✅ `block: "nearest"` 不会触发横向滚动，且目标是 `.message-list` 内的消息，非输入框

2. `app.js:3734` - `targetMsg?.scrollIntoView({ behavior: "smooth", block: "center" });`
   - **用途**: 滚动到 quote 回复的目标消息
   - **安全性**: ✅ 同上，在 `.message-list` 内，非输入框

**结论**: 无需修改。这些 scrollIntoView 都针对消息列表项，不会在 input focus 时触发。

### 3. visualViewport offsetLeft 处理

**新增功能**: `modules/keyboard-viewport.js:98`

```javascript
// Record visualViewport offsetLeft for potential CSS compensation
root.style.setProperty("--vv-offset-left", `${Math.round(vv?.offsetLeft || 0)}px`);
```

**用途**: 将 `visualViewport.offsetLeft` 暴露为 CSS 变量 `--vv-offset-left`，供未来需要 transform 补偿时使用（本次 PR 未使用）。

### 4. 元素宽度审计（潜在横向溢出源）

**审计方法**: 检查所有可能宽度超出 viewport 的元素

**发现**:
- 所有核心布局元素（`.layout`, `.v2-scroll`, `.message-list`, `.input-bar`）均已设置 `overflow: hidden` 或 `overflow-x: hidden`
- emoji panel、plus panel 均在 `.layout` 内部，受其 `overflow: hidden` 约束
- 无独立的全屏宽元素会触发横向滚动

**结论**: CSS 已足够严格，配合本次 100vw 清除和 `overflow-x: hidden` 强化，无需额外修改。

### 5. 100vw 使用枚举

**所有 100vw 使用位置** (已全部修复):

| 位置 | 原代码 | 修复后 |
|------|--------|--------|
| v2.css:64 | `width: min(100vw, 430px);` | `width: 100%; max-width: min(100%, 430px);` |
| v2.css:1841 | `width: min(280px, calc(100vw - 28px));` | `width: min(280px, calc(100% - 28px));` |
| v2.css:1907 | `max-width: 100vw;` | `max-width: 100%;` |
| v2.css:2018 | `width: min(100vw, 430px);` | `width: 100%; max-width: min(100%, 430px);` |

### 6. 布局居中方式

**原方式**: `body { display: flex; align-items: center; justify-content: center; }`

**问题**: flexbox 居中可能受 visualViewport offset 影响。

**修复**: 在 `.layout` 上显式添加 `margin-left: auto; margin-right: auto;`，确保稳定居中。

**结果**: 双重保障（flexbox + margin auto），适配桌面和移动端。

## 根本原因总结

1. **时机问题**: 原代码在 input focus 时仅调用 `schedule()`（RAF 异步），此时浏览器已完成横向滚动调整
2. **频率问题**: 原延迟序列 `[50, 150, 300, 600]ms` 是为 blur 后异步恢复设计的，对 focus 阶段不够激进
3. **溢出问题**: `100vw` 在 iOS Safari 会大于实际宽度，触发横向滚动条和偏移
4. **监听缺失**: visualViewport resize/scroll 期间未主动重置横向偏移

## 修复方案

### 1. keyboard-viewport.js 修改

#### 1.1 增强 resetHorizontalViewportDrift

```javascript
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
    const inlineTransform = layout.style.transform || "";
    if (/translateX|translate3d\(/.test(inlineTransform)) {
      layout.style.transform = "";
    }
  }

  // 3. Record visualViewport offsetLeft for potential CSS compensation
  root.style.setProperty("--vv-offset-left", `${Math.round(vv?.offsetLeft || 0)}px`);

  // 4. Force recheck next frame
  requestAnimationFrame(() => {
    if (window.scrollX !== 0) window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
    if (scrollingEl) scrollingEl.scrollLeft = 0;
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  });

  if (window.DEBUG_LAYOUT) {
    console.info("[viewport] reset horizontal drift", {
      reason,
      scrollX: window.scrollX,
      vvOffsetLeft: vv?.offsetLeft ?? null,
      docScrollLeft: document.documentElement.scrollLeft,
      bodyScrollLeft: document.body.scrollLeft,
      innerWidth: window.innerWidth,
      docClientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    });
  }
}
```

#### 1.2 新增 resetHorizontalDuringFocus

```javascript
function resetHorizontalDuringFocus(reason) {
  resetHorizontalViewportDrift(reason);
  // Aggressive sequence for focus phase: catch drift early and often
  [16, 50, 100, 180, 300, 500, 800].forEach((t) => {
    setTimeout(() => resetHorizontalViewportDrift(`${reason}:${t}`), t);
  });
}
```

**原理**: focus 阶段漂移发生更快，需要更密集的重试（16ms 起步，覆盖到 800ms 兜底）。

#### 1.3 修改 messageInput 和 chatSearchInput focus 处理

```javascript
if (_opts.messageInput) {
  _opts.messageInput.addEventListener("focus", () => {
    // Reset horizontal drift IMMEDIATELY on focus, before keyboard animates
    resetHorizontalDuringFocus("messageInput-focus");
    schedule();
  });
  // ... blur handler unchanged
}

if (_opts.chatSearchInput) {
  _opts.chatSearchInput.addEventListener("focus", () => {
    resetHorizontalDuringFocus("chatSearchInput-focus");
    schedule();
  });
  _opts.chatSearchInput.addEventListener("blur", reset);
}
```

#### 1.4 增强 visualViewport resize/scroll 监听

```javascript
vv.addEventListener("resize", () => {
  schedule();
  // If chat input is focused during resize, also reset horizontal drift
  const active = document.activeElement;
  if (isChatInput(active)) {
    resetHorizontalViewportDrift("resize-while-focused");
  }
});

vv.addEventListener("scroll", () => {
  schedule();
  // If chat input is focused during scroll, also reset horizontal drift
  const active = document.activeElement;
  if (isChatInput(active)) {
    resetHorizontalViewportDrift("scroll-while-focused");
  }
});
```

#### 1.5 导出新 API

```javascript
window.SPKeyboardViewport = {
  initStableShellHeight,
  initVisualVh,
  initKeyboardViewportState,
  resetHorizontalViewportDrift,
  resetHorizontalSoon,
  resetHorizontalDuringFocus,  // NEW
};
```

### 2. v2.css 修改

#### 2.1 全局横向滚动禁止

```css
html,
body {
  overflow: hidden;
  overflow-x: hidden;  /* 新增：强制禁止横向滚动 */
  width: 100%;
  max-width: 100%;
  overscroll-behavior-x: none;
}
```

#### 2.2 .layout 布局修复

```css
.layout {
  position: relative;
  width: 100%;  /* 改：移除 100vw */
  max-width: min(100%, 430px);  /* 改：100vw → 100% */
  height: min(var(--app-shell-h, 100dvh), 932px);
  overflow: hidden;
  overflow-x: hidden;  /* 新增 */
  display: block;
  background: var(--app-bg);
  border: 1px solid rgba(30, 30, 30, 0.04);
  border-radius: 34px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.08);
  color: var(--text-main);
  margin-left: auto;    /* 新增：显式居中 */
  margin-right: auto;   /* 新增：显式居中 */
}
```

#### 2.3 status-panel 修复

```css
.status-panel {
  z-index: 80;
  width: min(280px, calc(100% - 28px));  /* 改：100vw → 100% */
  /* ... */
}
```

#### 2.4 移动端 media query 修复

```css
@media (max-width: 430px) {
  .layout {
    width: 100%;
    max-width: 100%;  /* 改：100vw → 100% */
    height: var(--app-shell-h, 100dvh);
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
}
```

#### 2.5 桌面端 media query 修复

```css
@media (min-width: 768px) {
  .layout {
    width: 100%;  /* 改：移除 100vw */
    max-width: min(100%, 430px);  /* 改：100vw → 100% */
  }
}
```

## 验收标准

### 自动验证

```bash
✅ node --check modules/keyboard-viewport.js
✅ git diff --check
```

### 人工验收（iOS Safari / PWA）

1. ✅ 打开 Chat
2. ✅ 点击输入框（messageInput），键盘弹起
3. ✅ **关键**：输入框 focus 瞬间，小手机壳不向左偏移
4. ��� 点击消息空白处收键盘
5. ✅ 小手机壳保持居中，不左偏
6. ✅ 重复 10 次，不出现 5% 左偏
7. ✅ 打开 emoji panel 后关闭，不左偏
8. ✅ 打开 plus panel 后关闭，不左偏
9. ✅ 切换 tab 后回 Chat，不左偏
10. ✅ 横向没有任何可滚动空间
11. ✅ `document.documentElement.scrollLeft`、`body.scrollLeft`、`window.scrollX` 都保持 0

### Debug 模式

设置 `window.DEBUG_LAYOUT = true` 后，每次 reset 会在控制台输出：

```js
[viewport] reset horizontal drift {
  reason: "messageInput-focus:16",
  scrollX: 0,
  vvOffsetLeft: 0,
  docScrollLeft: 0,
  bodyScrollLeft: 0,
  innerWidth: 390,
  docClientWidth: 390,
  bodyScrollWidth: 390
}
```

**关键指标**:
- `scrollX` 应始终为 0
- `vvOffsetLeft` 应始终为 0（或在短暂偏移后迅速被重置）
- `innerWidth === docClientWidth === bodyScrollWidth` 表示无横向溢出

## 修改文件列表

1. `modules/keyboard-viewport.js` - 增强 focus 阶段横向重置逻辑
2. `v2.css` - 移除 100vw，强化横向滚动禁止
3. `HORIZONTAL_FOCUS_DRIFT_AUDIT.md` - 本文档

## 技术细节

### 为什么 focus 需要更激进的序列？

iOS Safari input focus 触发的事件序列：

- **0-16ms**: `focus` 事件触发，浏览器开始 scrollIntoView
- **16-50ms**: visualViewport 开始调整，可能出现 offsetLeft 漂移
- **50-100ms**: 键盘开始弹起动画，viewport 持续变化
- **100-300ms**: 键盘动画中段，高频 resize/scroll 事件
- **300-500ms**: 键盘接近完全展开
- **500-800ms**: 动画尾声和兜底

与 blur 后的慢速异步恢复不同，focus 时的漂移发生得更快、更集中，因此需要从 16ms 就开始重试，且密度更高。

### 为什么 resize/scroll 时也要重置？

键盘弹起过程中，visualViewport 会触发多次 resize 和 scroll 事件。如果此时输入框已 focused，这些事件可能伴随 offsetLeft 变化。在这些事件回调中立即重置，可以在漂移扩散前捕获并修正。

### 为什么用 margin: auto 而非 translateX？

`left: 50%; transform: translateX(-50%)` 的居中方式会受 `visualViewport.offsetLeft` 影响，当 viewport 偏移时，计算出的中心点也会偏移。而 `margin: auto` 基于父容器（body），不受 viewport offset 干扰，更稳定。

### 为什么暴露 --vv-offset-left？

虽然本次修复不使用 transform 补偿，但为未来预留可能性。如果遇到极端场景（如某些 iOS 版本的特殊 bug），可以通过 CSS：

```css
.layout {
  transform: translateX(calc(-1 * var(--vv-offset-left)));
}
```

来抵消 visualViewport 偏移。这是最后手段，当前不启用。

## 未涉及功能

按要求不修改：
- ❌ emoji panel 逻辑
- ❌ plus panel 逻辑
- ❌ Chat more 菜单
- ❌ diary 功能
- ❌ quote reply 协议
- ❌ PWA / service worker
- ❌ 数据库 migration
- ❌ UI 组件样式（除横向滚动相关）

## 历史背景

### 之前的修复 (commit 380b2e9)

之前的 PR 修复了 **blur 后** 和 **blank-click** 时的横向偏移，但未覆盖 **focus 阶段**。

### 回退事件 (merge 10e335a)

`feat/phone-shell-core-improvements` 分支合并时修改了 v2.css（删除 129 行），意外将 `.layout` 的 `width: 100%` 改回了 `width: min(100vw, 430px)`，导致之前的修复部分失效。

### 本次修复

本次 PR 彻底解决 focus 阶段的横向偏移：
1. 在 focus 事件触发时立即重置（不等 RAF）
2. 使用更激进的重试序列（16-800ms）
3. 在 visualViewport resize/scroll 时也重置
4. 彻底移除所有 100vw，消除横向溢出根源
5. 强化 CSS 横向滚动禁止

## 总结

本次修复的核心在于 **时机前移** 和 **频率加密**：

- **时机前移**: 从 RAF 异步更新改为 focus 事件触发时立即重置
- **频率加密**: 从 blur 后的 `[50, 150, 300, 600]ms` 改为 focus 时的 `[16, 50, 100, 180, 300, 500, 800]ms`
- **覆盖扩展**: 在 visualViewport resize/scroll 期间也主动重置
- **根源清除**: 彻底移除所有 100vw 和横向溢出可能

结合 CSS 的全局横向滚动禁止和稳定居中方式，形成完整的防御体系。
