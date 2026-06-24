# First-person Diary Draft MVP - 改动文件清单

## 新增文件 (10个)

### 后端
1. `supabase/migrations/20260624000000_create_xiaocha_diary_entries.sql` - 日记表 migration
2. `supabase/functions/diary/index.ts` - 日记生成 Edge Function
3. `supabase/functions/diary/xiaocha_diary_prompt.md` - 日记生成 prompt
4. `supabase/functions/diary/xiaocha_diary_checker_prompt.md` - 日记校验 prompt

### 前端
5. `modules/diary.js` - 日记展示模块
6. `modules/diary-generation.js` - 日记生成触发模块
7. `css/diary.css` - 日记样式

### 工具与文档
8. `scripts/diary-preflight.sh` - 部署前检查脚本
9. `scripts/diary-test-cases.js` - 三个测试用例
10. `docs/diary-mvp-implementation.md` - 完整实施文档

## 修改文件 (2个)

### 1. index.html
**位置：** Line 7-10 (CSS), Line 574-577 (JS)

**改动：**
```diff
  <link rel="stylesheet" href="v2-bubbles.css?v=cloudflare-0093">
+ <link rel="stylesheet" href="css/diary.css">
  <!-- PWA -->
```

```diff
  document.write('<script src="modules/v2-shell.js?v=' + v + '" charset="utf-8"><\/script>');
+ document.write('<script src="modules/diary.js?v=' + v + '" charset="utf-8"><\/script>');
+ document.write('<script src="modules/diary-generation.js?v=' + v + '" charset="utf-8"><\/script>');
  document.write('<script src="app.js?v=' + v + '" charset="utf-8"><\/script>');
```

### 2. app.js
**位置：** Line 7992+ (文件末尾)

**改动：**
```javascript
// ── Diary Module Initialization ──────────────────────────────────────────────

// Update Home diary card on page load
window.addEventListener("load", () => {
  if (supabaseClient && window.SPDiary) {
    window.SPDiary.updateHomeDiaryCard(supabaseClient, currentUserId || 'default')
      .catch(err => console.error('Failed to update diary card:', err));
  }
});

// Setup diary card click handler
document.addEventListener("DOMContentLoaded", () => {
  const diaryCard = document.querySelector('.diary-card');
  if (diaryCard) {
    diaryCard.addEventListener('click', () => {
      if (window.SPDiary) {
        window.SPDiary.navigateToDiaryList();
      }
    });
  }
});
```

## 部署步骤

### 1. 应用数据库 Migration
```bash
cd /Users/weidian/savePrincessCha
supabase db reset
```

### 2. 部署 Edge Function
```bash
supabase functions deploy diary
```

### 3. 验证部署
```bash
bash scripts/diary-preflight.sh
```

### 4. 前端测试
1. 打开应用首页
2. 查看 Home 日记卡片
3. 点击卡片进入列表页
4. 点击「写今晚日记」生成测试日记
5. 查看详情页

### 5. API 测试
在浏览器 console 加载 `scripts/diary-test-cases.js`，运行：
```javascript
window.diaryTests.runAllTests()
```

## 验收标准

### 功能验收
- [ ] ✅ Preflight 检查全部通过
- [ ] 可以手动生成日记
- [ ] Home 卡片显示最新日记
- [ ] 列表页按时间倒序显示
- [ ] 详情页完整展示内容
- [ ] 三个测试用例全部通过

### 隔离验收
- [ ] 日记不进入 compileMemoryContext
- [ ] 日记不写入 memories 表
- [ ] 不触发 auto promotion

### 质量验收
- [ ] Test A: 普通聊天不硬写成长
- [ ] Test B: 关系卡顿有 stuck_point，不写成留言
- [ ] Test C: 旧档案写「我读到」，不写「我记得当时」

## 确认事项

✅ **已确认不影响现有功能：**
- `compileMemoryContext` 无 diary 注入（已审计）
- afterChat hook 不涉及 diary
- memories 表隔离清晰
- 前端改动仅新增模块，不修改现有逻辑

✅ **已确认符合约束：**
- 不自动 promotion
- 不进入 Identity Brain
- Performed growth 红线（checker 校验）
- 来源诚实（prompt + checker 双重保障）

## Preflight 检查结果

```
🔍 Diary MVP Preflight Check
========================================
✅ All preflight checks passed!
```

全部 10 项检查通过。

---

**实施完成时间：** 2026-06-24
**实施人：** Claude (Kiro)
**详细文档：** `docs/diary-mvp-implementation.md`
