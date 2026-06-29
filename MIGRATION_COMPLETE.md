# ✅ Cost Dashboard 修复完成 - 迁移已执行

**执行时间**: 2026-06-29
**分支**: fix/quote-replies-bottom-anchor-longpress
**状态**: ✅ 所有迁移已成功应用

---

## 已执行的迁移

### 1. ✅ 创建 cost_log 表
**文件**: `supabase/migrations/20260626000000_create_cost_log.sql`

创建了基础表结构，包含：
- 基础字段：user_id, ts, tier, site, raw_model
- Token 字段：in_tokens, out_tokens, cache_read_tokens, cache_write_tokens
- 成本字段：cost_cny, chars
- Fallback 字段：is_fallback, fallback_reason
- RLS 策略和索引

### 2. ✅ 添加透明度字段
**文件**: `supabase/migrations/20260629130000_add_cost_log_transparency_fields.sql`

添加了 5 个新字段：
- `usage_source` - 数据来源（upstream_sse_usage / unavailable / estimated）
- `cost_source` - 成本来源（local_price_table / upstream_billing）
- `usage_raw` - 原始 usage 对象（jsonb）
- `cost_precision` - 精度标记（estimated / actual）
- `cache_metric_source` - 缓存指标来源（prompt_tokens_details.cached_tokens / none）

---

## 已修改的代码

### 后端修改

1. **supabase/functions/_shared/model-client.ts**
   ```typescript
   stream_options: { include_usage: true }
   ```

2. **supabase/functions/chat/vault_runner.ts**
   - 更新 writeCostLog() 函数签名
   - 填充新的透明度字段

### 前端修改

3. **modules/cost-dashboard.js**
   - fmtCny() 支持 6 位小数显示
   - 最近调用表增加"usage来源"和"cost来源"列
   - "缓存命中率"改为"上游 Prompt Cache"
   - 新增"记忆缓存命中率"占位
   - 统计卡片添加"(估算)"标注

---

## 验收测试步骤

### ✅ 1. 数据库迁移已完成

```bash
supabase db reset
# ✅ 所有迁移成功应用
```

### 2. 测试 cost_log 表（可选）

在 Supabase Studio (http://127.0.0.1:54323) 中运行测试脚本：

```bash
# 打开 SQL Editor 并执行
cat sql/test_cost_log_migration.sql
```

### 3. 测试前端 Dashboard

1. 访问 http://127.0.0.1:54321 （或你的前端地址）
2. 发送一条聊天消息
3. 打开设置 → 成本面板
4. 验证：
   - ✅ 统计卡片显示"(估算)"
   - ✅ "上游 Prompt Cache"替代了"缓存命中率"
   - ✅ 有"记忆缓存命中率"卡片显示"暂无统计"
   - ✅ 最近调用表显示 6 位小数（如 ¥0.000123）
   - ✅ 表格有"usage来源"和"cost来源"列

### 4. 验证 usage 数据获取

检查 Edge Functions 日志：

```bash
supabase functions logs chat --local
```

查找包含 `stream_options: { include_usage: true }` 的请求。

### 5. 验证数据写入

查询 cost_log 表：

```sql
SELECT
  ts, in_tokens, out_tokens, cost_cny,
  usage_source, cost_source, cost_precision
FROM cost_log
ORDER BY ts DESC
LIMIT 5;
```

应该看到：
- `usage_source` 为 `upstream_sse_usage` 或 `unavailable`
- `cost_source` 为 `local_price_table`
- `cost_precision` 为 `estimated`

---

## 文件清单

### 修改的文件
- ✅ `supabase/functions/_shared/model-client.ts`
- ✅ `supabase/functions/chat/vault_runner.ts`
- ✅ `modules/cost-dashboard.js`
- ✅ `sql/cost_log.sql`

### 新增的文件
- ✅ `supabase/migrations/20260626000000_create_cost_log.sql`
- ✅ `supabase/migrations/20260629130000_add_cost_log_transparency_fields.sql`
- ✅ `sql/test_cost_log_migration.sql`
- ✅ `COST_DASHBOARD_AUDIT_FIX.md`
- ✅ `MIGRATION_COMPLETE.md` (本文件)

---

## 部署到生产环境

当准备部署到生产时：

### 方式 1: 使用 Supabase CLI

```bash
# 推送迁移到远程数据库
supabase db push

# 或者链接到远程项目后重置
supabase link --project-ref your-project-ref
supabase db push
```

### 方式 2: 在 Supabase Dashboard 手动执行

1. 登录 Supabase Dashboard
2. 进入 SQL Editor
3. 依次执行：
   - `supabase/migrations/20260626000000_create_cost_log.sql`
   - `supabase/migrations/20260629130000_add_cost_log_transparency_fields.sql`

### 方式 3: 使用迁移历史

如果生产环境已经有 cost_log 表（通过 sql/cost_log.sql 手动创建），只需执行透明度字段迁移：

```sql
-- 在生产环境 SQL Editor 中执行
ALTER TABLE public.cost_log
  ADD COLUMN IF NOT EXISTS usage_source text,
  ADD COLUMN IF NOT EXISTS cost_source text,
  ADD COLUMN IF NOT EXISTS usage_raw jsonb,
  ADD COLUMN IF NOT EXISTS cost_precision text,
  ADD COLUMN IF NOT EXISTS cache_metric_source text;

COMMENT ON COLUMN public.cost_log.usage_source IS 'Source of usage data: upstream_sse_usage / unavailable / estimated';
COMMENT ON COLUMN public.cost_log.cost_source IS 'Source of cost calculation: local_price_table / upstream_billing';
COMMENT ON COLUMN public.cost_log.usage_raw IS 'Raw usage object from upstream for debugging and auditing';
COMMENT ON COLUMN public.cost_log.cost_precision IS 'Precision level: estimated / actual';
COMMENT ON COLUMN public.cost_log.cache_metric_source IS 'Source of cache metrics: prompt_tokens_details.cached_tokens / none';
```

---

## 回滚方案（如需要）

如果需要回滚透明度字段：

```sql
ALTER TABLE public.cost_log
  DROP COLUMN IF EXISTS usage_source,
  DROP COLUMN IF EXISTS cost_source,
  DROP COLUMN IF EXISTS usage_raw,
  DROP COLUMN IF EXISTS cost_precision,
  DROP COLUMN IF EXISTS cache_metric_source;
```

但请注意：
- 回滚后端代码需要同时移除 vault_runner.ts 中的新字段
- 回滚前端代码需要移除 cost-dashboard.js 中的新列显示

---

## 后续工作建议

### 短期

1. **监控 usage 获取成功率**
   ```sql
   SELECT
     usage_source,
     count(*) as count,
     round(count(*) * 100.0 / sum(count(*)) over(), 2) as percentage
   FROM cost_log
   WHERE ts > now() - interval '7 days'
   GROUP BY usage_source;
   ```

2. **添加 provider 兼容性处理**
   - 如果某些 provider 不支持 stream_options 返回 400
   - 添加降级重试逻辑

### 长期

1. **记忆缓存统计持久化**
   - 将 memory_cache_hit 数据写入 cost_log 或新表
   - 在 Dashboard 显示真实记忆缓存命中率

2. **接入上游账单 API**
   - 对于 OpenRouter 等 provider，定期拉取真实账单
   - 标记为 `cost_source = "upstream_billing"`

3. **成本异常告警**
   - 燃速超过阈值时发送通知
   - usage_source = "unavailable" 比例过高时告警

---

## 总结

✅ **迁移状态**: 所有迁移已成功应用到本地开发数据库
✅ **代码修改**: 后端和前端代码已更新
✅ **测试脚本**: 已创建验证脚本
✅ **文档**: 完整的修复报告和迁移文档已创建

所有修改都遵循了原始要求：
- ✅ 不改 chat 主逻辑
- ✅ 不改模型路由
- ✅ 仅修复成本统计链路
- ✅ 提升真实性和可解释性

准备好部署到生产环境！
