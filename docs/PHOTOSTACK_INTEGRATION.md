# PhotoStack 集成指南

## 📋 概述

本文档介绍如何将 PhotoStack（微信式堆叠照片卡片）集成到 SavePrincessCha 项目中，用于优化多图发送的展示效果。

## 🎯 集成目标

- **原有实现**：多张图片各自占据一个 msg-row，垂直排列
- **新实现**：2张及以上图片使用 PhotoStack 堆叠展示，支持探边、跟手翻页、快甩等交互

## 📦 文件结构

```
savePrincessCha/
├── modules/
│   └── photo-stack-integration.js   # PhotoStack 核心代码 + 集成 API
├── css/
│   └── photo-stack.css              # PhotoStack 样式
└── photo-stack-demo.html            # 演示页面
```

## 🚀 快速开始

### 1. 引入文件

在 `index.html` 中添加：

```html
<!-- 在 <head> 中添加样式 -->
<link rel="stylesheet" href="css/photo-stack.css">

<!-- 在 body 底部，message-renderer.js 之后添加脚本 -->
<script src="modules/photo-stack-integration.js"></script>
```

### 2. 集成到消息渲染

有两种集成方式：

#### 方式 A：完全替换（推荐）

修改 `modules/message-renderer.js`，在 `addMessage` 函数的图片处理部分：

```javascript
// 在 Case 2: has images 部分的开始处添加：
if (imageParts.length >= 2 && window.PhotoStackIntegration) {
  // 使用 PhotoStack 渲染
  return window.PhotoStackIntegration.addMessageWithPhotoStack(
    text, role, createdAt, options, msgId
  );
}

// 原有的单张图片渲染逻辑保持不变...
```

#### 方式 B：可选开关

添加一个用户设置开关，允许用户选择是否使用 PhotoStack：

```javascript
// 在 settings-manager.js 中添加设置项
const defaultSettings = {
  // ... 其他设置
  usePhotoStack: true  // 默认启用
};

// 在 message-renderer.js 中检查设置
if (imageParts.length >= 2 &&
    window.PhotoStackIntegration &&
    window.Settings?.get('usePhotoStack')) {
  // 使用 PhotoStack
}
```

## 🔧 API 使用

### PhotoStack 类

```javascript
const stack = new PhotoStackIntegration.PhotoStack(
  container,  // DOM 元素或选择器
  imageUrls,  // 图片 URL 数组
  {
    width: 220,        // 卡片宽度
    height: 280,       // 卡片高度
    peek: 15,          // 探边距离
    peekStep: 12,      // 每层额外探出距离
    rotStep: 2.2,      // 每层旋转角度
    scaleStep: 0.06,   // 每层缩小比例
    flingVel: 0.4,     // 快甩速度阈值
    counter: true,     // 显示页码角标
    onTap: (index) => {},      // 点击回调
    onChange: (index) => {}    // 翻页回调
  }
);

// API 方法
stack.next();       // 下一张
stack.prev();       // 上一张
stack.goto(2);      // 跳到第3张
stack.index;        // 当前索引（只读）
stack.destroy();    // 销毁实例
```

### 集成辅助函数

```javascript
// 检查是否应该使用 PhotoStack
PhotoStackIntegration.shouldUsePhotoStack(imageParts);

// 创建 PhotoStack 消息元素
PhotoStackIntegration.createPhotoStackMessage(imageParts, role, options);

// 增强版 addMessage（自动检测并使用 PhotoStack）
PhotoStackIntegration.addMessageWithPhotoStack(text, role, createdAt, options, msgId);
```

## 🎨 样式定制

PhotoStack 样式支持主题变量：

```css
/* 在 v2.css 或 style.css 中覆盖 */
.pstack-card {
  border-radius: 14px;              /* 卡片圆角 */
  box-shadow: 0 3px 14px rgba(0, 0, 0, .14);  /* 阴影 */
}

.pstack-badge {
  background: rgba(0, 0, 0, .45);   /* 角标背景 */
  font-size: 11px;                   /* 角标字体 */
}

/* 暗色主题支持 */
[data-theme="dark"] .pstack-badge {
  background: rgba(0, 0, 0, .65);
}
```

## 📱 响应式设计

PhotoStack 已内置响应式支持：

- **桌面端**：220×280px
- **平板**：自适应
- **手机**：根据屏幕宽度自动调整

可以通过媒体查询进一步定制：

```css
@media (max-width: 390px) {
  .pstack-stage {
    /* 小屏幕调整 */
  }
}
```

## 🔗 与现有功能集成

### 1. Lightbox 集成

在 `onTap` 回调中调用现有的图片查看器：

```javascript
onTap: (index) => {
  if (window.showLightbox) {
    window.showLightbox(imageUrls[index], imageUrls, index);
  }
}
```

### 2. 引用回复集成

PhotoStack 支持引用回复显示：

```javascript
createPhotoStackMessage(imageParts, role, {
  replyTo: options.replyTo  // 传入引用信息
});
```

### 3. 长按菜单集成

需要在消息操作菜单中支持 PhotoStack：

```javascript
// 在 message-actions.js 中添加检测
const hasPhotoStack = row.querySelector(".message-photostack");
if (hasPhotoStack) {
  const stack = hasPhotoStack._photoStackInstance;
  const currentIndex = stack ? stack.index : 0;
  const imageUrl = stack.images[currentIndex];
  // 添加保存、引用等操作
}
```

### 4. 已读回执

PhotoStack 消息支持已读回执，样式与单图消息一致。

## 🐛 调试技巧

### 查看 PhotoStack 实例

```javascript
// 在控制台中
const photoStackEl = document.querySelector('.message-photostack');
const instance = photoStackEl?._photoStackInstance;
console.log('当前页码:', instance?.index);
console.log('总图片数:', instance?.images.length);
```

### 常见问题

**Q: PhotoStack 不显示？**
- 检查 CSS 文件是否正确引入
- 检查图片 URL 是否有效
- 查看控制台是否有错误

**Q: 触摸手势不生效？**
- 确保 `touch-action: pan-y` 已应用
- 检查是否有其他元素阻止了指针事件

**Q: 图片加载慢？**
- 使用 `loading="lazy"` 属性（已内置）
- 考虑添加占位符或加载动画

## 📊 性能优化

PhotoStack 已内置性能优化：

1. **硬件加速**：使用 `will-change` 和 `backface-visibility`
2. **懒加载**：图片使用 `loading="lazy"`
3. **CSS 动画**：松手后使用 CSS transition，由浏览器合成器处理
4. **最小重排**：拖拽时只更新 transform，不触发 layout

## 🔄 迁移路径

### 阶段 1：并行运行（推荐）

- 添加用户设置开关
- 默认关闭，用户可选择启用
- 收集用户反馈

### 阶段 2：A/B 测试

- 随机为部分用户启用
- 对比使用数据和用户反馈

### 阶段 3：全面启用

- 设为默认选项
- 保留关闭开关供高级用户

## 📝 代码示例

### 完整集成示例

```javascript
// 在 message-renderer.js 的 addMessage 函数中

function addMessage(text, role, createdAt = new Date().toISOString(), options = {}, msgId = null) {
  // ... 原有代码 ...

  const isArray = Array.isArray(text);
  const imageParts = isArray ? text.filter(p => p.type === "image_url" && p.image_url?.url) : [];

  // ✨ 新增：检查是否使用 PhotoStack
  if (imageParts.length >= 2 &&
      window.PhotoStackIntegration &&
      window.Settings?.get('usePhotoStack', true)) {
    return window.PhotoStackIntegration.addMessageWithPhotoStack(
      text, role, createdAt, options, msgId
    );
  }

  // ... 原有的单图/多图逐条渲染逻辑 ...
}
```

## 🎉 效果预览

访问 `photo-stack-demo.html` 查看交互效果：

```bash
# 在项目目录下启动本地服务器
python -m http.server 8000
# 或
npx serve

# 访问 http://localhost:8000/photo-stack-demo.html
```

## 📚 参考资源

- **原项目**：[Wren036/PhotoStack](https://github.com/Wren036/PhotoStack)
- **设计规格**：逐帧观察测量自微信原版
- **许可证**：PolyForm Noncommercial 1.0.0（非商业使用免费）

## ⚖️ 许可声明

PhotoStack 组件基于 Wren036/PhotoStack 项目：
- 个人学习、研究与非商业用途免费
- **商业使用需事先取得作者书面授权**
- SavePrincessCha 作为非商业个人项目，可以免费使用

## 🤝 贡献

如有改进建议或发现问题：

1. 在 savePrincessCha 项目中提 issue
2. 提交 PR 改进集成代码
3. 分享使用体验和反馈

---

**集成完成后的效果**：
- ✅ 2张及以上图片自动使用堆叠展示
- ✅ 支持触摸/鼠标手势翻页
- ✅ 保持与现有消息样式一致
- ✅ 兼容引用回复、已读回执等功能
- ✅ 支持亮色/暗色���题切换
