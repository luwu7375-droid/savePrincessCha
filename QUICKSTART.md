# 🚀 PhotoStack 快速启动指南

## 立即体验

### 方式 1：查看演示页面（推荐新手）

```bash
cd /Users/weidian/savePrincessCha

# 启动本地服务器（选择其一）
python3 -m http.server 8000
# 或
python -m http.server 8000
# 或
npx serve

# 然后在浏览器访问：
# http://localhost:8000/photo-stack-demo.html
```

**演示页面功能**：
- 查看堆叠照片效果
- 测试拖拽翻页交互
- 了解功能特性
- 无需完整启动应用

### 方式 2：在实际应用中测试

```bash
cd /Users/weidian/savePrincessCha

# 1. 确保所有文件已就绪
ls modules/photo-stack-integration.js
ls css/photo-stack.css

# 2. 启动应用（按照项目原有方式）
# 例如：
open index.html
# 或启动开发服务器

# 3. 测试多图发送
# - 选择 2 张或更多图片
# - 发送消息
# - 观察堆叠展示效果
```

## 已集成的更改

✅ **文件已创建**：
- `modules/photo-stack-integration.js` - 核心代码
- `css/photo-stack.css` - 样式文件
- `photo-stack-demo.html` - 演示页面

✅ **文件已修改**：
- `index.html` - 已添加 CSS 和 JS 引用
- `modules/message-renderer.js` - 已添加 PhotoStack 检测

✅ **文档已创建**：
- `PHOTOSTACK_README.md` - 快速说明
- `docs/PHOTOSTACK_INTEGRATION.md` - 详细文档

## 工作原理

```
用户发送多张图片
        ↓
message-renderer.js 检测到 2+ 张图片
        ↓
调用 PhotoStackIntegration.addMessageWithPhotoStack()
        ↓
创建 PhotoStack 实例，堆叠展示
        ↓
用户可以拖拽、点击、翻页
```

## 关键代码位置

### 1. 检测和调用 (message-renderer.js:23-28)
```javascript
// ── PhotoStack Integration: Use stacked photo card for multiple images ──
if (imageParts.length >= 2 && window.PhotoStackIntegration) {
  return window.PhotoStackIntegration.addMessageWithPhotoStack(
    text, role, createdAt, options, msgId
  );
}
```

### 2. 样式引入 (index.html:11)
```html
<!-- PhotoStack Integration -->
<link rel="stylesheet" href="css/photo-stack.css">
```

### 3. 脚本引入 (index.html:1017)
```html
// PhotoStack Integration (must load after message-renderer.js)
document.write('<script src="modules/photo-stack-integration.js?v=' + v + '" charset="utf-8"><\/script>');
```

## 测试清单

- [ ] 演示页面是否正常显示
- [ ] 能否拖拽翻页
- [ ] 点击能否打开大图
- [ ] 页码角标是否显示
- [ ] 在实际应用中发送 2+ 张图片
- [ ] 堆叠效果是否生效
- [ ] 触摸/鼠标交互是否流畅
- [ ] 边界情况（首张/末张）是否正常

## 回滚方法

如果需要回滚到之前的版本：

```bash
cd /Users/weidian/savePrincessCha

# 查看 git 状态
git status

# 撤销对 index.html 的更改
git checkout -- index.html

# 撤销对 message-renderer.js 的更改
git checkout -- modules/message-renderer.js

# 删除新增文件
rm modules/photo-stack-integration.js
rm css/photo-stack.css
rm photo-stack-demo.html
rm PHOTOSTACK_README.md
rm docs/PHOTOSTACK_INTEGRATION.md
```

## 调试技巧

### 检查集成是否成功

在浏览器控制台运行：

```javascript
// 检查 PhotoStack 是否加载
console.log(window.PhotoStackIntegration);
// 应该输出对象，包含 PhotoStack, shouldUsePhotoStack 等

// 检查样式是否加载
console.log(getComputedStyle(document.querySelector('.pstack-stage')));
```

### 查看当前页码

```javascript
// 找到页面上的 PhotoStack 实例
const photoStackEl = document.querySelector('.message-photostack');
if (photoStackEl && photoStackEl._photoStackInstance) {
  console.log('当前页码:', photoStackEl._photoStackInstance.index);
  console.log('总图片数:', photoStackEl._photoStackInstance.images.length);
}
```

### 手动控制翻页

```javascript
const photoStackEl = document.querySelector('.message-photostack');
const stack = photoStackEl?._photoStackInstance;
if (stack) {
  stack.next();  // 下一张
  stack.prev();  // 上一张
  stack.goto(0); // 跳到第一张
}
```

## 获取帮助

- 📖 查看完整文档：`docs/PHOTOSTACK_INTEGRATION.md`
- 📝 查看总结说明：`PHOTOSTACK_README.md`
- 🎨 查看演示页面：`photo-stack-demo.html`
- 💻 查看源代码：
  - `modules/photo-stack-integration.js`
  - `css/photo-stack.css`

## 下一步

1. ✅ 集成已完成
2. 👉 **启动演示页面测试**
3. 👉 **在实际应用中测试多图发送**
4. 📝 收集反馈和优化建议
5. 🎨 根据需要定制样式

---

**准备就绪！** 现在可以开始测试 PhotoStack 集成效果了 🎉
