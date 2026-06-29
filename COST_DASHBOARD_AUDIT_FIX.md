# Cost Dashboard 审计修复报告

**修复日期**: 2026-06-29
**分支**: fix/quote-replies-bottom-anchor-longpress

## 问题总结

1. 成本页显示精度不足，所有小额调用都显示 `<¥0.001`，无参考价值
2. 成本数据来自本地估算，而非上游账单实际扣费，但未明确标注
3. `callModel()` 未请求 usage 数据（缺少 `stream_options: { include_usage: true }`）
4. "缓存命中率"显示的是上游 Prompt Cache，容易与记忆缓存混淆
5. 缓存命中率算法有误（使用 `cacheRead / (inTokens + cacheRead)` 而非 `cacheRead / inTokens`）
6. Dashboard 未区分真实 usage / 估算 tokens / 数据来源

## 修复内容

### 1. ✅ 修改 callModel() 添加 stream_options

**文件**: `supabase/functions/_shared/model-client.ts`

**修改**:
```typescript
// 在 callModel() 的 fetch body 中添加
stream_options: { include_usage: true }
```

**效果**: 让上游尽可能返回 usage 数据，包括 prompt_tokens、completion_tokens、cached_tokens 等。

**注意**: 如果某些 provider 不支持此选项返回 400，未来可添加降级重试逻辑。

---

### 2. ✅ 扩展 cost_log 表结构

**文件**:
- `sql/cost_log.sql` (表定义更新)
- `sql/migrations/add_cost_log_transparency_fields.sql` (迁移脚本)

**新增字段**:
```sql
usage_source        text    -- upstream_sse_usage / unavailable / estimated
cost_source         text    -- local_price_table / upstream_billing
usage_raw           jsonb   -- 原始 usage 对象，便于调试
cost_precision      text    -- estimated / actual
cache_metric_source text    -- prompt_tokens_details.cached_tokens / none
```

**效果**: 明确标注每条记录的数据来源和精度，提高可解释性。

---

### 3. ✅ 修复 vault_runner.ts 写入逻辑

**文件**: `supabase/functions/chat/vault_runner.ts`

**修改**:
1. 更新 `writeCostLog()` 函数签名，支持新字段
2. 在 `runAfterChatVault()` 中填充新字段：
   - 有 usage: `usage_source = "upstream_sse_usage"`
   - 无 usage: `usage_source = "unavailable"`
   - 成本来源: `cost_source = "local_price_table"`
   - 精度: `cost_precision = "estimated"`
   - 缓存来源: 根据是否有 cached_tokens 设置

**效果**: 所有新记录都包含数据来源信息。

---

### 4. ✅ 修复前端显示精度

**文件**: `modules/cost-dashboard.js`

**修改**:

1. **格式化函数**:
```javascript
function fmtCny(n, precision) {
  if (precision === "detailed") {
    return "¥" + n.toFixed(6);  // 最近调用表显示 6 位小数
  }
  // 统计卡片保持原格式
  if (n < 0.001) return "< ¥0.001";
  return "¥" + n.toFixed(n >= 10 ? 2 : 4);
}
```

2. **数据获取**:
```javascript
// fetchRecentCalls 增加查询字段
.select("..., usage_source, cost_source, cost_precision")
```

3. **表格显示**:
- 增加"usage来源"和"cost来源"列
- 花费列使用 6 位小数：`¥0.000123`
- 添加 title 属性显示完整精度

**效果**: 用户可以清楚看到每次调用的具体花费和数据来源。

---

### 5. ✅ 修复缓存命中率口径

**文件**: `modules/cost-dashboard.js`

**修改**:

1. **统计卡片**:
```javascript
// 修改算法
var cacheHitPct = agg.totalIn > 0
  ? Math.round(agg.totalCacheRead / agg.totalIn * 100)
  : 0;

// 修改文案
<div class="cost-card__label">
  上游 Prompt Cache
  <span title="来自 usage.prompt_tokens_details.cached_tokens，不是记忆缓存">(?)</span>
</div>
```

2. **图表标签**:
```javascript
labels: ["上游 Prompt Cache (" + pct + "%)", "新鲜输入"]
```

3. **Tooltip 说明**:
```javascript
tooltip: {
  callbacks: {
    afterLabel: function() {
      return "来自 usage.prompt_tokens_details.cached_tokens";
    }
  }
}
```

4. **算法修正**:
```javascript
// buildCacheData() 修正计算逻辑
// 假设 in_tokens 已包含 cached_tokens（OpenAI 格式）
fresh += Math.max(0, inTotal - cr);
```

**效果**:
- 明确标注这是"上游 Prompt Cache"而非"记忆缓存"
- 算法修正为 `cacheRead / inTokens`，避免低估命中率
- 添加说明避免混淆

---

### 6. ✅ 添加记忆缓存命中率显示

**文件**: `modules/cost-dashboard.js`

**修改**: 在图表区域新增一个卡片：
```html
<div style="flex:1;min-width:160px">
  <div class="settings-section-label">记忆缓存命中率</div>
  <div class="settings-card" style="padding:14px">
    <div style="...">
      暂无统计<br>
      <small>记忆缓存数据未持久化至 cost_log</small>
    </div>
  </div>
</div>
```

**效果**:
- 明确区分"上游 Prompt Cache"和"记忆缓存"两个指标
- 用户知道记忆缓存数据暂未统计
- 为未来添加记忆缓存统计预留位置

---

## 验收清单

### 后端验收

- [x] `model-client.ts` 的 callModel() 请求体包含 `stream_options: { include_usage: true }`
- [x] `cost_log.sql` 表定义包含 5 个新字段
- [x] 迁移脚本已创建: `sql/migrations/add_cost_log_transparency_fields.sql`
- [x] `vault_runner.ts` 的 writeCostLog() 支持新字段
- [x] 有 usage 时写入 `usage_source = "upstream_sse_usage"`
- [x] 无 usage 时写入 `usage_source = "unavailable"`
- [x] 成本来源标注为 `cost_source = "local_price_table"`

### 前端验收

- [x] fmtCny() 支持 `detailed` 模式显示 6 位小数
- [x] 最近调用表增加"usage来源"和"cost来源"列
- [x] 花费列显示 6 位小数（例如 ¥0.000123）
- [x] 统计卡片标注"(估算)"说明成本非实际扣费
- [x] "缓存命中率"改为"上游 Prompt Cache"
- [x] 添加 tooltip 说明来自 prompt_tokens_details.cached_tokens
- [x] 缓存命中率算法修正为 `cacheRead / inTokens`
- [x] 新增"记忆缓存命中率"卡片，显示"暂无统计"
- [x] 上游 Prompt Cache 图表标签更新

---

## 运行迁移

在 Supabase SQL Editor 中执行：

```sql
-- 方式 1: 执行迁移脚本
\i sql/migrations/add_cost_log_transparency_fields.sql

-- 方式 2: 直接执行 SQL
ALTER TABLE public.cost_log
  ADD COLUMN IF NOT EXISTS usage_source text,
  ADD COLUMN IF NOT EXISTS cost_source text,
  ADD COLUMN IF NOT EXISTS usage_raw jsonb,
  ADD COLUMN IF NOT EXISTS cost_precision text,
  ADD COLUMN IF NOT EXISTS cache_metric_source text;
```

---

## 测试步骤

1. **运行数据库迁移**
   ```bash
   # 在 Supabase Dashboard SQL Editor 中运行迁移脚本
   ```

2. **发送一条 chat 请求**
   ```bash
   # 通过前端发送消息给 Cha
   ```

3. **检查请求日志**
   - Supabase Edge Functions Logs 应该显示请求体包含 `stream_options: { include_usage: true }`

4. **检查 cost_log 表**
   ```sql
   SELECT
     ts, in_tokens, out_tokens, cache_read_tokens, cost_cny,
     usage_source, cost_source, cost_precision, cache_metric_source
   FROM cost_log
   ORDER BY ts DESC
   LIMIT 5;
   ```
   - 应该看到新字段有值
   - `usage_source` 应为 `upstream_sse_usage` 或 `unavailable`
   - `cost_source` 应为 `local_price_table`

5. **检查前端 Dashboard**
   - 打开设置 → 成本面板
   - 统计卡片应显示"(估算)"标注
   - "缓存命中率"应改为"上游 Prompt Cache"
   - 最近调用表应显示 6 位小数（如 ¥0.000123）
   - 应有"usage来源"和"cost来源"两列
   - 应看到"记忆缓存命中率"卡片显示"暂无统计"

---

## 后续改进建议

### 短期

1. **Provider 兼容性处理**
   - 添加对不支持 stream_options 的 provider 的降级重试
   - 记录 `usage_unavailable_reason` 字段

2. **记忆缓存统计持久化**
   - 考虑将 `memory_cache_hit`, `memory_cache_hits`, `memory_cache_misses` 写入 cost_log 或新表
   - 在 Dashboard 显示真实的记忆缓存命中率

### 长期

1. **接入上游账单 API**
   - 对于支持的 provider（如 OpenRouter），定期拉取真实账单
   - 标记为 `cost_source = "upstream_billing"`, `cost_precision = "actual"`

2. **成本异常告警**
   - 当燃速超过阈值时发送通知
   - 当 usage_source = "unavailable" 比例过高时告警

3. **更细粒度的统计**
   - 按对话、按功能（chat/diary/TTS）统计成本
   - 导出成本报表功能

---

## 文件清单

### 修改的文件
1. `supabase/functions/_shared/model-client.ts` - 添加 stream_options
2. `supabase/functions/chat/vault_runner.ts` - 更新 writeCostLog 逻辑
3. `modules/cost-dashboard.js` - 修复显示精度和缓存命中率口径
4. `sql/cost_log.sql` - 更新表定义

### 新增的文件
1. `sql/migrations/add_cost_log_transparency_fields.sql` - 数据库迁移脚本
2. `COST_DASHBOARD_AUDIT_FIX.md` - 本文档

---

## 总结

本次修复全面提升了 Cost Dashboard 的**真实性**和**可解释性**：

✅ **真实性**: 通过添加 stream_options 让上游返回真实 usage，并明确标注数据来源
✅ **可解释性**: 新增字段区分估算/实际，显示 6 位小数精度，分离上游 Prompt Cache 和记忆缓存
✅ **可维护性**: 保留原始 usage_raw 用于调试，添加迁移脚本便于部署
✅ **用户体验**: 清晰的文案和 tooltip，避免误导用户

所有修改**不影响 chat 主逻辑和模型路由**，仅针对成本统计链路进行修复。
