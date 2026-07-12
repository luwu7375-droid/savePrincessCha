# 多图上传功能实现方案

## 📋 当前问题

当前的图片上传实现：
- 使用单个 `pendingImage` 对象
- `<input type="file">` 没有 `multiple` 属性
- `imagePreviewBar` 只显示一张图片缩略图
- 第二次选择图片会覆盖第一张

## 🎯 解决方案

### 方案 A：完全重构为多图支持（推荐）

**优点**：
- 完整的多图上传体验
- 可以一次选择多张图片
- 预览区显示所有图片缩略图
- 可以单独删除某张图片
- 与 PhotoStack 完美配合

**修改内容**：
1. 将 `pendingImage` 改为 `pendingImages` 数组
2. 添加 `multiple` 属性到 file input
3. 重新设计预览区支持多图缩略图
4. 修改上传和发送逻辑

### 方案 B：保持单图，添加"追加"功能（快速方案）

**优点**：
- 改动最小
- 快速实现
- 向后兼容

**修改内容**：
1. 添加 `multiple` 属性
2. 将 `pendingImage` 改为 `pendingImages` 数组
3. 每次选择图片追加到数组
4. 预览区横向滚动显示多张缩略图

## 🚀 推荐实现：方案 A

### 1. 数据结构修改

```javascript
// 从：
let pendingImage = null;

// 改为：
let pendingImages = []; // Array<{ id: string, dataUrl: string|null, loading: boolean, error: string|null, file: File }>
```

### 2. HTML 修改

```html
<!-- 添加 multiple 属性 -->
<input type="file" id="imageInput" accept="image/*" multiple style="display:none">

<!-- 预览区支持多图 -->
<div id="imagePreviewBar" class="image-preview-bar hidden">
  <div class="img-preview-list">
    <!-- 动态插入多个缩略图 -->
  </div>
  <div class="img-preview-counter">
    <span id="imgPreviewCount">0</span> 张图片
  </div>
</div>
```

### 3. CSS 修改

```css
.image-preview-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--bg-deep);
  border-top: 1px solid var(--border);
  overflow-x: auto;
}

.img-preview-list {
  display: flex;
  gap: 8px;
  flex: 1;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.img-preview-item {
  position: relative;
  flex-shrink: 0;
}

.img-preview-thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.img-preview-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  background: var(--bg-raise);
  border: 1px solid var(--border);
  border-radius: 50%;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.img-preview-counter {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}
```

### 4. JavaScript 修改

#### 4.1 修改 handleImageFile

```javascript
async function handleImageFile(file) {
  if (!file) return;
  if (composerEditMode === "edit") return;

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    showError(`文件 ${file.name} 格式不支持`);
    return;
  }

  if (file.size > 20 * 1024 * 1024) {
    showError(`文件 ${file.name} 超过 20MB 限制`);
    return;
  }

  const id = Date.now() + '-' + Math.random().toString(36).slice(2);
  const imageItem = { id, dataUrl: null, loading: true, error: null, file };
  pendingImages.push(imageItem);
  updateAttachmentCard();

  try {
    const dataUrl = await compressImage(file);
    const item = pendingImages.find(img => img.id === id);
    if (item) {
      item.dataUrl = dataUrl;
      item.loading = false;
      updateAttachmentCard();
    }
  } catch (err) {
    const item = pendingImages.find(img => img.id === id);
    if (item) {
      item.error = `压缩失败：${err.message}`;
      item.loading = false;
      updateAttachmentCard();
    }
  }
}

// 处理多文件选择
function handleMultipleImageFiles(files) {
  if (!files || files.length === 0) return;
  Array.from(files).forEach(file => handleImageFile(file));
}
```

#### 4.2 修改 updateAttachmentCard

```javascript
function updateAttachmentCard() {
  if (!imagePreviewBar) return;

  if (pendingImages.length === 0) {
    imagePreviewBar.classList.add("hidden");
    if (window.updateComposerState) {
      window.updateComposerState({ hasImage: false });
    }
    return;
  }

  imagePreviewBar.classList.remove("hidden");

  const listContainer = imagePreviewBar.querySelector(".img-preview-list");
  if (!listContainer) return;

  listContainer.innerHTML = '';

  pendingImages.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = 'img-preview-item';
    itemEl.dataset.id = item.id;

    if (item.loading) {
      itemEl.innerHTML = `<div class="img-preview-skeleton"></div>`;
    } else if (item.error) {
      itemEl.innerHTML = `
        <div class="img-preview-error">
          <span>❌</span>
        </div>
      `;
      itemEl.title = item.error;
    } else if (item.dataUrl) {
      itemEl.innerHTML = `
        <img class="img-preview-thumb" src="${item.dataUrl}" alt="预览">
        <button type="button" class="img-preview-remove" data-id="${item.id}" aria-label="删除">✕</button>
      `;
    }

    listContainer.appendChild(itemEl);
  });

  // 绑定删除按钮事件
  listContainer.querySelectorAll('.img-preview-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      removeImage(id);
    });
  });

  // 更新计数
  const counter = imagePreviewBar.querySelector('#imgPreviewCount');
  if (counter) {
    counter.textContent = pendingImages.length;
  }

  // 更新 composer 状态
  const hasValidImages = pendingImages.some(img => img.dataUrl && !img.error);
  if (window.updateComposerState) {
    window.updateComposerState({ hasImage: hasValidImages });
  }
}

function removeImage(id) {
  pendingImages = pendingImages.filter(img => img.id !== id);
  updateAttachmentCard();
}

function clearAllImages() {
  pendingImages = [];
  updateAttachmentCard();
  if (imageInput) imageInput.value = "";
}
```

#### 4.3 修改事件监听器

```javascript
imageInput?.addEventListener("change", () => {
  const files = imageInput.files;
  imageInput.value = "";
  if (files && files.length > 0) {
    handleMultipleImageFiles(files);
  }
});

// 修改 bottom sheet 也支持多选
function showImageBottomSheet() {
  // ...前面的代码保持不变...

  const albumInput = document.createElement("input");
  albumInput.type = "file";
  albumInput.accept = "image/*";
  albumInput.multiple = true; // 添加 multiple
  albumInput.style.display = "none";
  albumInput.addEventListener("change", () => {
    const files = albumInput.files;
    if (files && files.length > 0) {
      handleMultipleImageFiles(files);
    }
  });

  // camera input 保持单选
  // ...
}
```

#### 4.4 修改发送消息逻辑

```javascript
// 在 sendMessage 函数中
async function sendMessage() {
  const text = messageInput.value.trim();
  const hasText = text.length > 0;
  const hasImages = pendingImages.length > 0 && pendingImages.some(img => img.dataUrl && !img.error);

  if (!hasText && !hasImages) return;

  // 准备消息内容
  const content = [];

  if (hasText) {
    content.push({ type: "text", text });
  }

  if (hasImages) {
    const validImages = pendingImages.filter(img => img.dataUrl && !img.error);
    for (const img of validImages) {
      // 上传图片到 Supabase
      const imageUrl = await uploadImageToSupabase(img.dataUrl, img.file);
      if (imageUrl) {
        content.push({ type: "image_url", image_url: { url: imageUrl } });
      }
    }
  }

  // 清空输入和图片
  messageInput.value = "";
  clearAllImages();

  // 发送消息
  // ...
}
```

## 📝 实现步骤

1. **备份现有代码**
2. **修改 HTML** - 添加 multiple 属性和新的预览区结构
3. **修改 CSS** - 添加多图预览样式
4. **修改 JavaScript** - 实现多图数组和相关函数
5. **测试功能** - 选择多图、删除单图、发送多图
6. **验证 PhotoStack** - 确保发送多图后正确使用 PhotoStack 展示

## 🧪 测试清单

- [ ] 一次选择多张图片
- [ ] 预览区显示所有图片缩略图
- [ ] 可以单独删除某张图片
- [ ] 删除所有图片后预览区隐藏
- [ ] 图片压缩和加载状态正确
- [ ] 发送包含多图的消息
- [ ] 多图消息使用 PhotoStack 展示
- [ ] 移动端 bottom sheet 支持多选
- [ ] 拖拽多文件上传

## ⚠️ 注意事项

1. **最大图片数量限制** - 建议限制最多 9 张图片
2. **内存管理** - 大量图片可能占用较多内存
3. **上传进度** - 考虑显示上传进度
4. **错误处理** - 单张图片失败不应影响其他图片
5. **用户体验** - 加载状态要清晰

## 🔄 向后兼容

- 现有的单图消息继续正常显示
- 历史消息不受影响
- 可以逐步迁移到新实现

---

**建议**：先实现方案 A 的基础版本（支持多图选择和预览），然后再添加高级功能（拖拽排序、图片编辑等）。
