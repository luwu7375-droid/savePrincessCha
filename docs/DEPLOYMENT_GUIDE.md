# Companion State & Source-Backed Memory 部署指南

> **创建时间**: 2026-07-12
> **项目**: savePrincessCha
> **远程项目**: zbpbkyzisamleqspijnr (Mumbai)

---

## ✅ 已完成部署

### Edge Functions (已部署)
- ✅ `memories` - 部署成功 (103.4kB)
- ✅ `scheduler` - 部署成功 (15.97kB)

查看部署: https://supabase.com/dashboard/project/zbpbkyzisamleqspijnr/functions

---

## 📋 待手动执行的步骤

### 步骤 1: 执行数据库 Migration

1. 打开 Supabase Dashboard
   - URL: https://supabase.com/dashboard/project/zbpbkyzisamleqspijnr/sql

2. 点击 "SQL Editor" → "New Query"

3. 复制并执行以下文件的完整内容:
   ```
   supabase/migrations/20260712000000_companion_state_and_source_tracking.sql
   ```

   这个 migration 会创建：
   - `companion_state` 表 (持续状态引擎)
   - `narrative_episodes` 表 (城南旧事)
   - `memories` 表的 source tracking 字段
   - `auto_memory_candidates` 表的 source tracking 字段
   - `app_settings` 表的 4 个 feature flags
   - 3 个 RPC 函数

4. 点击 "Run" 执行

---

### 步骤 2: 开启 Feature Flags

在 SQL Editor 中执行：

```sql
UPDATE app_settings
SET
  companion_state_enabled = true,
  source_backed_memory_enabled = true,
  proactive_contact_min_interval_minutes = 120,
  proactive_contact_connection_threshold = 70
WHERE id = 'singleton';
```

---

### 步骤 3: 验证部署

#### 3.1 检查新表是否创建成功

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('companion_state', 'narrative_episodes')
ORDER BY table_name;
```

**预期结果：**
```
companion_state
narrative_episodes
```

#### 3.2 检查 memories 表新增字段

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'memories'
  AND column_name LIKE 'source%'
ORDER BY column_name;
```

**预期结果：**
```
source_conversation_id  | uuid
source_end_at           | timestamp with time zone
source_msg_ids          | ARRAY
source_start_at         | timestamp with time zone
```

#### 3.3 检查 Feature Flags

```sql
SELECT
  companion_state_enabled,
  source_backed_memory_enabled,
  proactive_contact_min_interval_minutes,
  proactive_contact_connection_threshold
FROM app_settings
WHERE id = 'singleton';
```

**预期结果：**
```
companion_state_enabled: true
source_backed_memory_enabled: true
proactive_contact_min_interval_minutes: 120
proactive_contact_connection_threshold: 70
```

---

## 🧪 功能测试

### 测试 1: Companion State Tick

在 Supabase Dashboard → Functions → scheduler 页面：

1. 点击 "Invoke" 按钮
2. 在 Query Parameters 添加: `job=companion_tick`
3. 点击 "Send request"

**预期返回：**
```json
{
  "ok": true,
  "scheduler_version": "pg3-v1",
  "results": [{
    "job_name": "companion_tick",
    "status": "succeeded",
    "reason": "processed 0 users, 0 contacts sent",
    "metadata": {
      "users_processed": 0,
      "actions_triggered": 0,
      "contacts_sent": 0,
      "observations_logged": 0,
      "activities_started": 0,
      "errors_count": 0
    }
  }]
}
```

**验证执行记录：**
```sql
SELECT * FROM scheduler_runs
WHERE job_name = 'companion_tick'
ORDER BY started_at DESC
LIMIT 5;
```

### 测试 2: 原文可追溯记忆

**前提条件：** 需要有对话记录和记忆数据

在 Functions → memories 页面测试：

1. 添加 Query Parameters: `userId=YOUR_USER_ID`
2. 点击 "Send request"

**预期返回：** 记忆列表包含 `sources` 字段，显示原始对话片段

### 测试 3: 使用 curl 命令行测试

```bash
# 获取项目信息
PROJECT_URL="https://zbpbkyzisamleqspijnr.supabase.co"
ANON_KEY="你的_ANON_KEY"  # 从 Settings → API 获取

# 测试 scheduler
curl -X POST "${PROJECT_URL}/functions/v1/scheduler?job=companion_tick" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json"

# 测试 memories (需要替换 USER_ID)
curl "${PROJECT_URL}/functions/v1/memories?userId=YOUR_USER_ID" \
  -H "Authorization: Bearer ${ANON_KEY}"
```

---

## 🔧 配置自动 Tick (可选)

在 Supabase Dashboard → Database → Cron Jobs 执行：

```sql
-- 每 5 分钟执行一次 companion_tick
SELECT cron.schedule(
  'companion-tick-job',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://zbpbkyzisamleqspijnr.supabase.co/functions/v1/scheduler?job=companion_tick',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      )
    );
  $$
);

-- 查看已配置的 cron jobs
SELECT * FROM cron.job;
```

---

## 📊 部署清单

### 已完成 ✅
- [x] Git commits 推送到 dev 分支
- [x] Edge Functions 部署 (memories, scheduler)

### 待手动执行 ⏳
- [ ] 在 Supabase Dashboard 执行 migration SQL
- [ ] 开启 feature flags
- [ ] 验证表结构和字段
- [ ] 测试 scheduler endpoint
- [ ] 测试 memories endpoint

### 可选配置 ⚙️
- [ ] 配置 Cron Jobs 自动执行 tick
- [ ] 为测试用户初始化 companion_state

---

## ⚠️ 当前限制

1. **Proactive contact 未实装**
   - `sendProactiveContact()` 只记录日志，不会实际发送消息
   - 需要在 Phase 5-8 中完善

2. **Phase 5-8 功能未完成**
   - 夜间记忆巩固 (consolidateMemoryCandidates)
   - 城南旧事 UI (Couple Space 页面)
   - 完整测试覆盖
   - Feature flags 验证文档

3. **需要真实数据测试**
   - Source-backed memory 需要有对话记录才能看到效果
   - Companion state 需要用户状态才能观察变化

---

## 🚀 下一步

完成部署后，可以选择：

### 选项 A: 先验证当前功能
1. 执行上述所有步骤
2. 测试 scheduler 和 memories API
3. 观察数据变化
4. 收集反馈后再继续 Phase 5-8

### 选项 B: 继续实施 Phase 5-8
1. Phase 5: 夜间记忆巩固
2. Phase 6: 城南旧事 UI
3. Phase 7: 测试覆盖
4. Phase 8: Feature flags 验证

---

**部署指南生成时间**: 2026-07-12
**项目 ID**: zbpbkyzisamleqspijnr
**Region**: South Asia (Mumbai)
