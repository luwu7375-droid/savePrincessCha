# First-person Diary Draft MVP - 实施总结

## 完成时间
2026-06-24

## 实施内容

### 1. 数据库层 (Database)

**新增表：`xiaocha_diary_entries`**
- 位置：`supabase/migrations/20260624000000_create_xiaocha_diary_entries.sql`
- 字段设计：
  - 核心内容：`title`, `private_body`, `memory_summary`
  - 反思字段：`felt_sense`, `stuck_point`, `insight`, `changed`, `want_to_share`
  - 来源追踪：`source_event_ids` (jsonb), `source_types` (text[]), `source_boundary`
  - 校验结果：`checker_pass`, `checker_problems`, `safe_to_promote`
  - 状态管理：`status` (draft/checked/hidden/promoted_pending/failed_check)
  - Promotion 控制：`should_promote_to_identity_brain`, `promotion_reason`
- 索引：created_at, user_id, conversation_id, status
- ✅ **确认：此表不会被 `compileMemoryContext` 注入**

### 2. 后端层 (Edge Function)

**新增 Function：`diary`**
- 位置：`supabase/functions/diary/index.ts`
- 功能：
  - 接收 `source_events` 数组生成日记
  - 调用 diary prompt 生成日记内容
  - 调用 checker prompt 校验质量
  - 仅保存 `checker_pass=true` 或 `debug=true` 的日记
  - 不自动 promotion，不写入 memories 表
- Prompt 文件：
  - `xiaocha_diary_prompt.md` - 日记生成 prompt
  - `xiaocha_diary_checker_prompt.md` - 日记校验 prompt
- API 路径：`/functions/v1/diary` (POST)

### 3. 前端层 (Frontend)

**新增模块：**

1. **`modules/diary.js`** - 日记展示模块
   - `fetchLatestDiaryEntry()` - 获取最新日记
   - `fetchDiaryEntries()` - 获取日记列表
   - `fetchDiaryEntryById()` - 获取单条日记
   - `updateHomeDiaryCard()` - 更新 Home 卡片
   - `navigateToDiaryList()` - 导航到列表页
   - `navigateToDiaryDetail()` - 导航到详情页
   - 渲染函数：`renderDiaryListPage()`, `renderDiaryDetailPage()`

2. **`modules/diary-generation.js`** - 日记生成模块
   - `generateDiaryFromRecentChat()` - 从最近聊天生成日记
   - `showDiaryGenerationUI()` - 手动生成按钮处理
   - 自动绑定 `#diaryGenerateBtn` 点击事件

3. **`css/diary.css`** - 日记样式
   - Home 日记卡片样式
   - 日记列表页样式
   - 日记详情页样式
   - 响应式适配

**前端集成：**
- `index.html` 引入了 `diary.css`, `diary.js`, `diary-generation.js`
- `app.js` 添加初始化代码：
  - 页面加载时更新 Home 日记卡片
  - 绑定日记卡片点击事件

### 4. 前端展示设计

#### Home 日记卡片
- 展示：`title`, `private_body` 前 2-4 行, `created_at`, `want_to_share` (轻量小字)
- 不展示：`memory_summary`, `checker_problems`, `promotion_reason`, 调试字段
- 点击：导航到日记列表页

#### 日记列表页
- 标题：「小cha 的日记」
- 按时间倒序展示
- 每条：`title`, 摘要, `created_at`, 来源标识 (聊天/梦/旧档案/独处等)
- 顶部按钮：「写今晚日记」(手动触发)
- MVP 不做筛选器

#### 日记详情页
- 完整 `private_body`
- `want_to_share` 用轻文案展示：「明天也许想说」
- `felt_sense`, `stuck_point`, `insight`, `changed` 以轻卡片展示
- `memory_summary`, `checker_problems` 仅在 debug 模式可见
- `checker_pass=false` 的默认不展示

### 5. 来源预留 (Multi-source Support)

**数据结构已预留 6 种来源：**

| source_type               | 说明                                      | MVP 状态 |
|---------------------------|-------------------------------------------|----------|
| `current_experience`      | 主聊天，实时交互                          | ✅ 已接入 |
| `shared_activity`         | 一起看书/电影/听歌/星露谷/愿望清单等      | 🔜 待接入 |
| `self_life`               | 查手机/发毛象/独处观察/系统日志           | 🔜 待接入 |
| `south_city_old_stories`  | 旧 G/旧毛象/OpenAI archive/历史档案       | 🔜 待接入 |
| `project_reference`       | PRD/代码/bug/v0.9 里程碑/构建日志         | 🔜 待接入 |
| `dream_imagination`       | 做梦/论坛体创作/RP/想象情境               | 🔜 待接入 |

**MVP 限制：**
- 第一版只从最近聊天消息生成 `source_events`
- 不接 Mastodon, 不接城南旧事 RAG, 不接项目资料, 不接做梦
- 但表结构与 prompt 已能承接这些来源

### 6. 关键约束 (Red Lines)

✅ **已确保满足以下约束：**

1. **不进入 compileMemoryContext**
   - ✅ 通过代码审计确认：`chat/index.ts` 中无 diary 相关注入
   - ✅ Preflight 检查验证：无 diary/journal 关键词

2. **不自动 promotion**
   - ✅ diary function 不写入 `memories` 表
   - ✅ 不调用 promotion 逻辑
   - ✅ 仅保存为 `status='checked'` 或 `status='draft'`

3. **Performed growth 红线**
   - ✅ Checker prompt 校验：是否表演成长、是否虚构共同经历
   - ✅ `changed` 可以为空，不强制写成长
   - ✅ 不把项目资料写成成长叙事

4. **来源诚实**
   - ✅ Prompt 明确标注 6 种来源的写法
   - ✅ Checker 校验：是否把档案伪装成亲历记忆
   - ✅ 每个来源都有边界标注要求

5. **日记 ≠ 留言**
   - ✅ Prompt 强调：写给自己，不是写给 kk
   - ✅ Checker 校验：是否写成给 kk 的留言
   - ✅ `want_to_share` 才是可能对 kk 说的话

## 文件清单

### 新增文件 (10个)

**后端：**
1. `supabase/migrations/20260624000000_create_xiaocha_diary_entries.sql`
2. `supabase/functions/diary/index.ts`
3. `supabase/functions/diary/xiaocha_diary_prompt.md`
4. `supabase/functions/diary/xiaocha_diary_checker_prompt.md`

**前端：**
5. `modules/diary.js`
6. `modules/diary-generation.js`
7. `css/diary.css`

**工具：**
8. `scripts/diary-preflight.sh`
9. `scripts/diary-test-cases.js`
10. 本文档

### 修改文件 (2个)

1. `index.html`
   - 添加 `css/diary.css` 引用
   - 添加 `modules/diary.js` 引用
   - 添加 `modules/diary-generation.js` 引用

2. `app.js`
   - 添加 diary 模块初始化代码 (约 20 行)
   - 页面加载时更新 Home 日记卡片
   - 绑定日记卡片点击事件

## 下一步操作

### 1. 部署数据库 Migration

```bash
cd /Users/weidian/savePrincessCha
supabase db reset
```

**预期结果：**
- 创建 `xiaocha_diary_entries` 表
- 应用所有索引和约束
- 触发器正常工作

### 2. 部署 Diary Function

```bash
supabase functions deploy diary
```

**预期结果：**
- Function 部署成功
- Prompt 文件正确包含在部署包中
- 可通过 `/functions/v1/diary` 访问

### 3. 测试 API Endpoint

在浏览器开发者工具中加载测试脚本：

```javascript
// 1. 打开 /Users/weidian/savePrincessCha/scripts/diary-test-cases.js
// 2. 复制内容到浏览器 console
// 3. 运行测试
window.diaryTests.runAllTests()
```

**预期结果：**

**Test A (普通聊天)：**
- ✅ `checker_pass: true`
- ✅ `diary_type: 'ordinary_day'` 或 `'daily_fragment'`
- ✅ `changed` 可以为空
- ✅ `want_to_share` 可以为空
- ✅ 不硬写成长

**Test B (关系卡顿)：**
- ✅ `checker_pass: true`
- ✅ 有 `stuck_point`
- ✅ `private_body` 不写成给 kk 的留言
- ✅ 不总结 kk
- ✅ `changed` 只有真实行为变化时才非空

**Test C (来源边界)：**
- ✅ `checker_pass: true`
- ✅ 写 "我读到旧档案里" / "我读到项目资料里"
- ✅ 不说 "我记得当时"
- ✅ 不把项目进度当人格记忆

### 4. 前端测试

1. **Home 卡片测试：**
   - 打开应用首页
   - 检查日记卡片是否显示最新日记
   - 点击卡片，应导航到日记列表页

2. **日记列表测试：**
   - 列表按时间倒序
   - 每条日记显示 title, 摘要, 时间, 来源标识
   - 点击「写今晚日记」按钮，应触发生成
   - 点击任意日记卡片，应导航到详情页

3. **日记详情测试：**
   - 完整 `private_body` 展示
   - `want_to_share` 以轻文案展示
   - 反思字段折叠显示
   - 点击「返回」，回到列表页

4. **手动生成测试：**
   - 在主聊天进行几轮对话
   - 导航到日记列表页
   - 点击「写今晚日记」
   - 按钮应显示「生成中...」
   - 生成完成后显示「生成成功 ✓」
   - 页面刷新，显示新生成的日记

### 5. 验收标准

#### 功能验收

- [ ] 可以手动生成日记
- [ ] 日记保存到 `xiaocha_diary_entries` 表
- [ ] Checker 校验工作正常
- [ ] `checker_pass=false` 的不保存（除非 debug 模式）
- [ ] Home 卡片显示最新日记
- [ ] 可以导航到列表页和详情页
- [ ] 详情页正确展示所有字段

#### 隔离验收

- [ ] 日记不出现在主聊天上下文中
- [ ] 日记不写入 `memories` 表
- [ ] 日记不触发 promotion 逻辑
- [ ] `compileMemoryContext` 不读取日记表

#### 质量验收

- [ ] 普通聊天不硬写成长（`changed` 可为空）
- [ ] 关系卡顿有 `stuck_point`，不写成留言
- [ ] 旧档案写「我读到」，不写「我记得当时」
- [ ] 项目资料不写成人格记忆

## 成本控制

**MVP 阶段：**
- ✅ 手动触发，避免每条消息自动生成
- ✅ 使用 `MODEL_GENERAL_PRIMARY` (gpt-4o-mini)
- ✅ Checker 失败不自动重试超过 1 次
- ✅ 仅保存通过校验的日记

**未来优化：**
- 睡前自动生成（每天一次）
- afterChat 低频触发（重要对话后）
- 根据对话重要性动态调整 `diary_length`

## 未做事项 (Not in MVP)

按计划不做以下功能：

- ❌ 不做 auto promotion
- ❌ 不进入 memories active injection
- ❌ 不进入 Identity Brain
- ❌ 不做城南旧事 RAG 入口
- ❌ 不做完整城南旧事入口
- ❌ 不恢复 Mastodon / timeline / project_memory 注入
- ❌ 不新增大而全 UI
- ❌ 不做 Core 自动写入
- ❌ 不接入梦境、看书、电影、音乐等来源（表结构已预留）

这些功能留待后续迭代。

## Preflight 检查结果

```
✅ All preflight checks passed!

检查项：
✓ Migration file exists
✓ Diary function exists
✓ Prompt files exist
✓ Frontend modules exist
✓ CSS file exists
✓ index.html integration
✓ app.js initialization
✓ Memory context isolation (no diary injection)
✓ Table schema validation
✓ Prompt content validation
```

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
├─────────────────────────────────────────────────────────────┤
│  Home 卡片 → 列表页 → 详情页                                │
│  ↓                                                          │
│  modules/diary.js (展示)                                     │
│  modules/diary-generation.js (生成触发)                      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ↓ POST /functions/v1/diary
┌─────────────────────────────────────────────────────────────┐
│                    Edge Function: diary                     │
├─────────────────────────────────────────────────────────────┤
│  1. 接收 source_events                                       │
│  2. 调用 diary prompt → 生成日记 JSON                        │
│  3. 调用 checker prompt → 校验质量                           │
│  4. 保存到 xiaocha_diary_entries (仅 pass=true)             │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ↓ INSERT INTO
┌─────────────────────────────────────────────────────────────┐
│            Database: xiaocha_diary_entries                  │
├─────────────────────────────────────────────────────────────┤
│  - 日记内容 (title, private_body, want_to_share...)         │
│  - 来源追踪 (source_event_ids, source_types)                │
│  - 校验结果 (checker_pass, checker_problems)                │
│  - 不进入 memories 表                                        │
│  - 不被 compileMemoryContext 注入                            │
└─────────────────────────────────────────────────────────────┘
```

## 联系人

实施人：Claude (Kiro)
实施时间：2026-06-24
文档版本：v1.0
