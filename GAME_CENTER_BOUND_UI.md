# 游戏中心绑定后 UI 修改

## 修改内容

当 CedarToy 小机状态为「已绑定」时，游戏中心界面现在显示更简洁的状态栏，而不是完整的绑定卡片。

## 功能特性

### 已绑定状态（status === "bound"）
- ✅ 隐藏完整的「Cha 的小机」设置卡片
- ✅ 显示紧凑状态栏：「🎮 小 Cha 已加入 CedarToy · 已绑定」
- ✅ 提供「管理」按钮，可以展开查看完整绑定信息
- ✅ 绑定成功后立即切换 UI，无需手动刷新
- ✅ 重新进入页面时保持已绑定视图

### 其他状态（未创建/等待绑定/错误）
- ✅ 维持现有流程不变
- ✅ 显示完整绑定卡片和操作按钮

## 修改文件

### 1. `index.html`
添加紧凑状态栏元素：

```html
<!-- Compact status bar for bound state -->
<div id="cedartoyBoundStatusBar" class="cedartoy-bound-status" hidden>
  <span class="cedartoy-bound-status__text">🎮 小 Cha 已加入 CedarToy · 已绑定</span>
  <button type="button" id="cedartoyManageBtn" class="text-btn">管理</button>
</div>
```

### 2. `modules/game-center.js`

#### 修改 `renderMachine()` 函数
```javascript
function renderMachine(machine) {
  const bindingCard = document.getElementById("cedartoyBindingCard");
  const boundStatusBar = document.getElementById("cedartoyBoundStatusBar");
  // ...

  const status = machine?.status || "unregistered";

  // When bound: hide binding card, show compact status bar
  if (status === "bound") {
    if (bindingCard) bindingCard.hidden = true;
    if (boundStatusBar) boundStatusBar.hidden = false;
    return;
  }

  // For other states: show binding card, hide status bar
  if (bindingCard) bindingCard.hidden = false;
  if (boundStatusBar) boundStatusBar.hidden = true;

  // ... existing logic for other states
}
```

#### 新增 `showBindingCard()` 函数
```javascript
function showBindingCard() {
  const bindingCard = document.getElementById("cedartoyBindingCard");
  const boundStatusBar = document.getElementById("cedartoyBoundStatusBar");
  if (bindingCard) bindingCard.hidden = false;
  if (boundStatusBar) boundStatusBar.hidden = true;
}
```

#### 添加管理按钮事件监听器
```javascript
document.getElementById("cedartoyManageBtn")
  ?.addEventListener("click", showBindingCard);
```

### 3. `v2.css`
添加紧凑状态栏样式：

```css
.cedartoy-bound-status {
  margin: 0 16px 12px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--surface-card, #fff);
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cedartoy-bound-status[hidden] {
  display: none;
}

.cedartoy-bound-status__text {
  color: var(--text-primary);
  font-size: 14px;
  flex: 1;
}

.cedartoy-bound-status .text-btn {
  color: var(--accent-primary, #007aff);
  font-size: 13px;
  padding: 4px 8px;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s;
}

.cedartoy-bound-status .text-btn:hover {
  background: rgba(0, 122, 255, 0.1);
}

.cedartoy-bound-status .text-btn:active {
  background: rgba(0, 122, 255, 0.15);
}
```

## 用户体验流程

### 首次创建小机
1. 用户点击「为 Cha 创建小机」
2. `createMachine()` 调用 game-proxy API
3. 返回 `status: "pending_binding"` 和 `binding_code`
4. `renderMachine()` 显示绑定码和操作说明

### 完成绑定
1. 用户在 CedarToy 完成绑定后点击「我已绑定，刷新状态」
2. `loadMachineStatus(true)` 调用 game-proxy 刷新
3. 返回 `status: "bound"`
4. `renderMachine()` 自动切换到紧凑状态栏视图

### 管理功能
1. 用户点击「管理」按钮
2. `showBindingCard()` 展开完整绑定卡片
3. 用户可以查看详细信息（机器名、绑定状态等）

### 页面重新加载
1. `showGameCenter()` 自动调用 `loadMachineStatus()`
2. 根据服务端返回的状态自动渲染正确视图
3. 已绑定用户看到紧凑状态栏，未绑定用户看到完整卡片

## 技术要点

1. **自动更新**：`renderMachine()` 在所有 API 调用后自动执行，确保 UI 立即反映状态变化
2. **持久化**：状态存储在服务端数据库，页面刷新后自动恢复
3. **渐进增强**：使用 `hidden` 属性控制显示，支持所有浏览器
4. **无侵入性**：未修改未绑定流程，保持向后兼容

## 测试要点

- [ ] 首次访问游戏中心显示正确状态
- [ ] 创建小机后显示绑定码和说明
- [ ] 绑定完成后自动切换到紧凑视图
- [ ] 点击「管理」按钮可以展开完整卡片
- [ ] 页面刷新后保持正确状态
- [ ] 移动端和桌面端样式正常
- [ ] 深色/浅色主题样式正常

## 部署

修改仅涉及前端代码，无需重新部署 Edge Function。推送到 dev 分支后自动部署到 https://dev.saveprincesscha.pages.dev/
