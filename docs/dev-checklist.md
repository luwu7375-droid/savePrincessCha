# 开发检查清单

## 提交前必做检查

每次修改前端代码（`app.js`、`modules/*.js`）并提交前，必须运行：

```bash
npm run preflight
```

该命令会：
1. 检查所有 JS 文件语法（`node --check`）
2. 扫描可选链赋值等危险语法模式

### 检查项说明

#### 1. 语法检查（`npm run check`）
- 检查 `app.js` 和 `modules/*.js` 的语法错误
- 如果失败，说明有语法错误，必须修复后才能提交

#### 2. 危险模式扫描（`npm run grep:unsafe`）
- 扫描 `?.property =` 模式（可选链不能作为赋值左值）
- 如果命中，人工确认是否为可选链赋值
- 正确写法：
  ```js
  // ❌ 错误：可选链不能赋值
  element?.style = "display:none"

  // ✅ 正确：显式判断后赋值
  if (element) element.style = "display:none"
  ```

## 常见错误

### 可选链赋值错误
```js
// ❌ 浏览器直接报错
document.scrollingElement?.scrollLeft = 0

// ✅ 改为显式 if
if (document.scrollingElement) {
  document.scrollingElement.scrollLeft = 0;
}
```

### 页面显隐逻辑
- 不要直接修改 `.v2-page` 的 `display` 属性
- 使用 `window.SPV2Shell.showPage(pageName)` 切换页面
- 所有页面切换逻辑已封装在 `modules/v2-shell.js`

### 键盘/视口管理
- 不要手动修改 `--keyboard-inset`、`--app-shell-h`、`--visual-vh`
- 这些变量由 `modules/keyboard-viewport.js` 管理
- 移动端切到 chat 页时不应自动 focus（会弹键盘）

## 快速命令参考

```bash
# 检查所有 JS 语法
npm run check

# 只检查 app.js
npm run check:app

# 只检查模块
npm run check:modules

# 扫描危险语法
npm run grep:unsafe

# 完整提交前检查
npm run preflight
```

## 部署流程

1. 运行 `npm run preflight` 确保通过
2. 提交代码并推送到 dev 分支
3. 部署到 Cloudflare Pages:
   ```bash
   npx wrangler pages deploy . --project-name saveprincesscha --commit-dirty=true
   ```
4. 验收：
   - 五个 tab 切换正常
   - 控制台无 SyntaxError
   - 移动端键盘行为正常
