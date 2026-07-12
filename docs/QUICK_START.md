# 快速开始 - Companion State 测试

## 🎯 3 步完成部署

### 1️⃣ 执行 Migration (5 分钟)

打开: https://supabase.com/dashboard/project/zbpbkyzisamleqspijnr/sql

复制粘贴文件内容并执行:
```
supabase/migrations/20260712000000_companion_state_and_source_tracking.sql
```

### 2️⃣ 开启功能 (30 秒)

在 SQL Editor 执行:
```sql
UPDATE app_settings
SET companion_state_enabled = true,
    source_backed_memory_enabled = true
WHERE id = 'singleton';
```

### 3️⃣ 测试运行 (1 分钟)

打开: https://supabase.com/dashboard/project/zbpbkyzisamleqspijnr/functions/scheduler

点击 "Invoke" → 添加参数 `job=companion_tick` → 发送

**成功标志:** 返回 `"ok": true`

---

## ✅ 验证部署

执行这个 SQL 确认一切正常:

```sql
-- 应该返回 2 行
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('companion_state', 'narrative_episodes');

-- 应该返回 true
SELECT companion_state_enabled FROM app_settings WHERE id = 'singleton';
```

---

## 📚 完整文档

详细步骤和测试指南: `docs/DEPLOYMENT_GUIDE.md`

---

## ⚡ Edge Functions 状态

✅ 已部署:
- `memories` - 原文可追溯记忆
- `scheduler` - 持续状态引擎

查看: https://supabase.com/dashboard/project/zbpbkyzisamleqspijnr/functions
