# 消息原生选择/保存/共享禁用修复验收

## 修复内容

### 1. CSS 禁用原生选择和触摸菜单

**文件**: `v2.css`

- `.msg-row` 和 `.msg-row *`: 禁用所有消息内容的文本选择和触摸菜单
- `.message`: 增强禁用，添加 `-webkit-tap-highlight-color: transparent`
- `.msg-image`: 禁用图片选择、拖拽、触摸菜单
- `.input-bar textarea`: 确保输入框可以正常选择文字（!important）

### 2. 图片消息增强处理

**文件**: `app.js` (行 824-841)

- 设置 `img.draggable = false` 和属性
- 添加内联样式禁用选择和触摸菜单
- 添加 `contextmenu` 和 `dragstart` 事件拦截

### 3. 事件层捕获阶段拦截

**文件**: `app.js` (行 2696-2723)

- `messageList.addEventListener("contextmenu", ..., { capture: true })`
- 在捕获阶段拦截原生右键菜单，防止 iOS/Safari callout

### 4. 长按与点击冲突处理

**文件**: `app.js` (行 4391-4410, 2608-2616)

- 长按打开菜单后设置 `longPressOpened = true`
- 图片点击事件检查 `longPressOpened`，如果为 true 则阻止 lightbox
- 菜单关闭时延迟 100ms 重置 `longPressOpened`

### 5. 简化自定义菜单

**文件**: `app.js` (行 2638-2671)

- 移除"重新生成"按钮
- 只保留：复制 / 引用 / 编辑
- 编辑仅对最后一条 user 消息可用

## 验收测试

### iOS Safari / PWA 测试

1. ✅ 长按 user 文字消息 → 不出现系统文本选择菜单
2. ✅ 长按 Cha 文字消息 → 不出现系统文本选择菜单
3. ✅ 长按图片消息 → 不出现系统保存/分享图片菜单
4. ✅ 长按图片消息 → 出现自定义菜单（复制/引用）
5. ✅ 短按图片 → 打开 lightbox
6. ✅ 长按后手指抬起 → 不打开 lightbox

### 桌面浏览器测试

1. ✅ 右键文字消息 → 不出现浏览器原生菜单
2. ✅ 右键图片消息 → 不出现浏览器原生菜单
3. ✅ 右键消息 → 出现自定义菜单

### 输入控件测试

1. ✅ messageInput 可以正常选择文字
2. ✅ messageInput 可以正常复制/粘贴
3. ✅ Setting 输入框可以正常选择文字
4. ✅ Debug 输入框可以正常选择文字

### 菜单功能测试

1. ✅ 复制按钮正常工作
2. ✅ 引用按钮正常工作
3. ✅ 编辑按钮仅在最后一条 user 消息显示
4. ✅ Cha 消息只显示复制/引用
5. ✅ 不再显示"重新生成"按钮

### 交互测试

1. ✅ 滚动消息列表 → 取消长按，不打开菜单
2. ✅ 长按中移动手指 >10px → 取消长按
3. ✅ 390px 窄屏下菜单正常显示
4. ✅ 430px 宽屏下菜单正常显示

## 技术细节

### CSS 优先级

```css
/* 全局禁用消息选择 */
.msg-row * {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

/* 输入框强制启用（!important） */
input, textarea {
  -webkit-user-select: text !important;
  user-select: text !important;
  -webkit-touch-callout: default !important;
}
```

### 图片禁用

```js
img.draggable = false;
img.style.webkitTouchCallout = "none";
img.addEventListener("contextmenu", e => e.preventDefault());
img.addEventListener("dragstart", e => e.preventDefault());
```

### 捕获阶段拦截

```js
messageList.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  e.stopPropagation();
}, { capture: true });  // 关键：capture 阶段拦截
```

### 防止 lightbox 误触

```js
messageList.addEventListener("click", (e) => {
  if (longPressOpened) {
    e.preventDefault();
    e.stopPropagation();
    longPressOpened = false;
    return;
  }
  // ... 正常点击逻辑
});
```

## 修改文件

- `v2.css`: CSS 禁用选择和触摸菜单
- `app.js`: 图片处理、事件拦截、菜单简化

## 未涉及的功能

按要求不修改：
- ❌ 引用协议
- ❌ keyboard / viewport
- ❌ emoji panel
- ❌ Chat more
- ❌ plus panel
- ❌ diary
- ❌ PWA / service worker
- ❌ 数据库 migration
