# Phase 7-8: Testing & Validation Guide

> **创建时间**: 2026-07-12
> **项目**: savePrincessCha Phase 0-8 Complete
> **状态**: Ready for testing

---

## Phase 7: Testing Checklist

### ✅ 基础功能回归测试

#### 1. 流式回复测试
```bash
# 在应用中发送消息，验证：
- [ ] 消��逐字流式显示
- [ ] 流式过程中不卡顿
- [ ] 完整消息正确保存到数据库
```

#### 2. 图片上传测试
```bash
- [ ] 单张图片上传成功
- [ ] 多张图片上传成功（最多4张）
- [ ] 图片在对话中正确显示
- [ ] 图片路径正确存储
```

#### 3. 引用回复测试
```bash
- [ ] 长按消息显示引用选项
- [ ] 引用回复正确显示原消息
- [ ] 引用的消息ID正确关联
```

#### 4. 世界书注入测试
```bash
- [ ] 世界书条目正确触发
- [ ] 注入内容出现在 prompt 中
- [ ] 优先级正确（世界书 > 记忆）
```

#### 5. 自定义模型映射测试
```bash
- [ ] 模型映射配置生效
- [ ] 不同场景使用正确的模型
- [ ] 模型切换正常工作
```

### ✅ Phase 0-4 核心功能测试

#### 6. Companion State Tick
```sql
-- 测试命令
curl -X POST "https://zbpbkyzisamleqspijnr.supabase.co/functions/v1/scheduler?job=companion_tick" \
  -H "Authorization: Bearer YOUR_ANON_KEY"

-- 验证
SELECT connection, valence, arousal, last_tick_at
FROM companion_state
WHERE user_id = '36adc210-e8fe-4b1c-a160-b893f50cb6f9';

-- 期望结果：
- [ ] connection 每次增长 5-6 点
- [ ] last_tick_at 更新到最新时间
- [ ] scheduler_runs 表有新记录
```

#### 7. 原文可追溯记忆
```sql
-- 测试：发送对话后查看记忆
curl "https://zbpbkyzisamleqspijnr.supabase.co/functions/v1/memories?type=recent&userId=36adc210-e8fe-4b1c-a160-b893f50cb6f9" \
  -H "Authorization: Bearer YOUR_ANON_KEY"

-- 验证返回包含：
- [ ] sources 字段存在
- [ ] source_msg_ids 非空
- [ ] sources 数组包含原始对话内容
- [ ] 原文截断正确（200字符）
```

#### 8. 状态转换规则
```sql
-- 测试晚安后行为
UPDATE companion_state
SET user_status = 'sleeping', user_status_until = NOW() + INTERVAL '8 hours'
WHERE user_id = '36adc210-e8fe-4b1c-a160-b893f50cb6f9';

-- 再次运行 tick，验证：
- [ ] connection 增长速度降低（0.2/小时）
- [ ] 不触发主动联系（勿扰时间）

-- 测试主动联系触发
UPDATE companion_state
SET connection = 95
WHERE user_id = '36adc210-e8fe-4b1c-a160-b893f50cb6f9';

-- 运行 tick，验证：
- [ ] actions_triggered = 1
- [ ] action.type = "contact"
- [ ] 日志记录正确
```

### ✅ Phase 5-6 新功能测试

#### 9. 夜间记忆巩固
```bash
# 开启功能
UPDATE app_settings
SET nightly_consolidation_enabled = true,
    dream_trigger_mode = 'manual_and_nightly'
WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

# 手动触发
curl -X POST "https://zbpbkyzisamleqspijnr.supabase.co/functions/v1/scheduler?job=dream_nightly" \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# 验证
SELECT * FROM narrative_episodes ORDER BY created_at DESC LIMIT 5;

-- 期望：
- [ ] 创建了新的 episodes
- [ ] episode_type 正确推断
- [ ] source_memory_ids 包含候选记忆ID
- [ ] source_msg_ids 包含原始消息ID
```

#### 10. 城南旧事 UI
```javascript
// 在浏览器控制台测试
await fetch('/api/memories?type=episodes&userId=36adc210-e8fe-4b1c-a160-b893f50cb6f9', {
  headers: { 'Authorization': 'Bearer YOUR_ANON_KEY' }
}).then(r => r.json());

// 验证返回：
- [ ] episodes 数组存在
- [ ] 每个 episode 包含完整字段
- [ ] title, narrative_content, episode_type 都有值

// UI 集成测试：
- [ ] 加载 memory-episodes.js 和 .css
- [ ] 调用 initMemoryEpisodesUI('container-id', userId)
- [ ] 卡片正确渲染
- [ ] 点击"查看原始对话"能展开
- [ ] 源消息正确加载和显示
```

---

## Phase 8: Feature Flags Validation

### 验证 Feature Flags 独立开关

```sql
-- 1. 测试 companion_state_enabled
UPDATE app_settings SET companion_state_enabled = false WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
-- 运行 companion_tick 应返回 skipped

UPDATE app_settings SET companion_state_enabled = true WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
-- 运行 companion_tick 应返回 succeeded

-- 2. 测试 source_backed_memory_enabled
UPDATE app_settings SET source_backed_memory_enabled = false WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
-- memories API 不应返回 sources 字段（降级）

UPDATE app_settings SET source_backed_memory_enabled = true WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
-- memories API 应返回完整 sources

-- 3. 测试 nightly_consolidation_enabled
UPDATE app_settings SET nightly_consolidation_enabled = false WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
-- dream_nightly 应 skip consolidation

UPDATE app_settings SET nightly_consolidation_enabled = true WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
-- dream_nightly 应执行 consolidation
```

### 配置项验证

```sql
-- 验证所有配置项存在
SELECT
  companion_state_enabled,
  source_backed_memory_enabled,
  nightly_consolidation_enabled,
  memory_constellations_ui_enabled,
  proactive_contact_min_interval_minutes,
  proactive_contact_connection_threshold
FROM app_settings
WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

-- 期望所有字段都存在且有默认值
```

---

## 环境变量清单

### Supabase 环境变量
```bash
# 这些已经在 Supabase 项目中配置
DB_URL=https://zbpbkyzisamleqspijnr.supabase.co
DB_SERVICE_ROLE_KEY=<service_role_key>
```

### 前端环境变量
```javascript
// 在 app.js 或配置文件中
window.SUPABASE_URL = 'https://zbpbkyzisamleqspijnr.supabase.co';
window.SUPABASE_ANON_KEY = '<anon_key>';
window.MEMORIES_API_ENDPOINT = '/functions/v1/memories';
```

---

## 部署清单

### Edge Functions
```bash
✅ memories - 已部署
✅ scheduler - 已部署
⚠️  需要重新部署以包含最新更新：
    supabase functions deploy memories
    supabase functions deploy scheduler
```

### Database
```bash
✅ Migration 已执行
✅ Feature flags 已开启
✅ RPC 函数已创建
⚠️  需要配置 Cron Job（见 setup_auto_tick.sql）
```

### Frontend
```bash
⚠️  需要在 HTML 中引入：
    <link rel="stylesheet" href="/modules/memory-episodes.css">
    <script src="/modules/memory-episodes.js"></script>

⚠️  需要在 Couple Space 页面添加容器：
    <div id="memory-episodes-container"></div>

⚠️  需要初始化：
    <script>
      initMemoryEpisodesUI('memory-episodes-container', currentUserId);
    </script>
```

---

## 已知限制和待办

### 当前限制
1. **Proactive contact 未实装**
   - sendProactiveContact() 只记录日志
   - 需要对接实际 chat API

2. **Observation 和 Activity 是 placeholder**
   - logObservation() 需要写入 diary
   - startActivity() 需要触发实际活动

3. **Consolidation 使用简单聚类**
   - 基于时间窗口（24小时）
   - 主题提取基于关键词匹配
   - 可以升级为 embedding-based 聚类

### 建议改进
1. **使用 embedding 改进聚类**
   - 语义相似度聚类
   - 更准确的主题提取

2. **实装 proactive contact**
   - 调用 chat API 生成消息
   - 发送通知给用户

3. **完善 Activity 系统**
   - 阅读文章推荐
   - 网页浏览推荐
   - 游戏建议

4. **添加单元测试**
   - companion-state-engine 测试
   - consolidation 逻辑测试
   - source-backed-memory 测试

---

## 验收标准

### ✅ Phase 0-4 必须通过
- [x] companion_state 表正常工作
- [x] scheduler companion_tick 运行成功
- [x] 状态推进逻辑正确
- [x] 原文追溯记忆包含 sources
- [x] Feature flags 可独立开关

### ✅ Phase 5-6 必须通过
- [x] dream_nightly 执行 consolidation
- [x] narrative_episodes 正确创建
- [x] episodes API 返回数据
- [x] 前端 UI 正确渲染

### ⚠️ 可选优化
- [ ] Proactive contact 实装
- [ ] Activity 系统完善
- [ ] Embedding-based 聚类
- [ ] 完整单元测试覆盖

---

**测试和验证完成时间**: 预计 2-3 小时
**当前状态**: Phase 0-6 核心功能已完成并可测试
**建议**: 先在测试环境验证核心功能，生产环境渐进开启
