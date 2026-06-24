# 📋 Diary MVP 手动部署指南

## 前置条件

1. **启动 Docker/OrbStack**
   - 打开 OrbStack 应用
   - 等待 Docker daemon 启动完成

2. **检查 Supabase CLI**
   ```bash
   supabase --version
   ```
   如未安装：`brew install supabase/tap/supabase`

## 部署步骤

### Step 1: 启动 Supabase 服务

```bash
cd /Users/weidian/savePrincessCha
supabase start
```

### Step 2: 应用数据库 Migration

```bash
supabase db reset
```

这将创建 `xiaocha_diary_entries` 表及所有索引。

**验证：**
```bash
supabase db diff --schema public
```
应该看到 `xiaocha_diary_entries` 表已创建。

### Step 3: 部署 Diary Function

**选项 A: 本地测试（推荐先测试）**
```bash
supabase functions serve diary
```
访问：`http://localhost:54321/functions/v1/diary`

**选项 B: 部署到远程**
```bash
supabase functions deploy diary
```

### Step 4: 前端测试

1. **打开应用**
   - 在浏览器访问应用 URL
   - 确保登录成功

2. **查看 Home 日记卡片**
   - 应该看到占位符内容（如果还没有日记）
   - 点击卡片，应导航到列表页

3. **手动生成日记**
   - 先在主聊天进行几轮对话
   - 导航到日记列表页
   - 点击「写今晚日记」按钮
   - 等待生成完成（按钮显示「生成成功 ✓」）

4. **查看日记详情**
   - 点击生成的日记卡片
   - 应看到完整的 `private_body`
   - 如果有 `want_to_share`，应以轻文案展示

### Step 5: API 测试

1. **打开开发者工具 Console**

2. **加载测试脚本**
   - 打开 `/Users/weidian/savePrincessCha/scripts/diary-test-cases.js`
   - 复制全部内容
   - 粘贴到 Console 并回车

3. **运行测试**
   ```javascript
   window.diaryTests.runAllTests()
   ```

4. **检查结果**

   **Test A (普通聊天)：**
   - ✅ `checker_pass: true`
   - ✅ `changed` 可以为空
   - ✅ 不硬写成长

   **Test B (关系卡顿)：**
   - ✅ `checker_pass: true`
   - ✅ 有 `stuck_point`
   - ✅ `private_body` 不写成给 kk 的留言

   **Test C (来源边界)：**
   - ✅ `checker_pass: true`
   - ✅ 写「我读到旧档案里」
   - ✅ 不写「我记得当时」

### Step 6: 验收

**功能验收：**
- [ ] 可以手动生成日记
- [ ] 日记保存到数据库
- [ ] Home 卡片显示最新日记
- [ ] 列表页按时间倒序显示
- [ ] 详情页完整展示内容
- [ ] Checker 校验正常工作

**隔离验收：**
- [ ] 打开主聊天，进行对话
- [ ] 检查聊天上下文中是否出现日记内容（应该没有）
- [ ] 查询 `memories` 表，确认没有日记内容
- [ ] 日记仅保存在 `xiaocha_diary_entries` 表

**质量验收：**
- [ ] Test A, B, C 全部通过
- [ ] Checker 能正确识别 performed growth
- [ ] 来源边界标注正确

## 故障排查

### 问题 1: Docker daemon 未运行
```
Error: Cannot connect to the Docker daemon
```
**解决：** 打开 OrbStack，等待 Docker 启动完成

### 问题 2: Migration 失败
```
Error: relation "xiaocha_diary_entries" already exists
```
**解决：** 表已存在，可以跳过或使用 `supabase db reset --force`

### 问题 3: Function 部署失败
```
Error: Failed to deploy function
```
**解决：**
1. 检查 prompt 文件是否存在于 `supabase/functions/diary/` 目录
2. 检查 `index.ts` 语法错误
3. 查看完整错误日志

### 问题 4: 前端日记卡片不显示
**检查：**
1. 浏览器 Console 是否有错误
2. `modules/diary.js` 是否正确加载
3. `window.SPDiary` 是否存在

**调试：**
```javascript
// 在 Console 运行
console.log(window.SPDiary);
window.SPDiary.fetchLatestDiaryEntry(supabaseClient, 'default')
  .then(entry => console.log('Latest entry:', entry));
```

### 问题 5: Checker 总是失败
**检查：**
1. Checker prompt 文件是否正确部署
2. LLM API 配置是否正确（`FIFTYFIVE_BASE_URL` 等）
3. 查看 Function 日志：`supabase functions logs diary`

## 快速命令参考

```bash
# 启动 Supabase
supabase start

# 应用 migration
supabase db reset

# 本地测试 function
supabase functions serve diary

# 部署 function 到远程
supabase functions deploy diary

# 查看 function 日志
supabase functions logs diary

# 查看数据库状态
supabase db diff

# 停止 Supabase
supabase stop
```

## 文档位置

- **完整文档：** `docs/diary-mvp-implementation.md`
- **改动清单：** `DIARY_MVP_CHANGES.md`
- **测试脚本：** `scripts/diary-test-cases.js`
- **自动部署：** `scripts/deploy-diary-mvp.sh`

---

**部署完成后，记得：**
1. ✅ 运行三个测试用例
2. ✅ 验证日记不进入主聊天上下文
3. ✅ 确认 Checker 工作正常
