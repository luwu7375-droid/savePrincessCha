-- Cost Log 诊断查询
-- 在 Supabase Dashboard SQL Editor 中运行此查询

-- 1. 检查 cost_log 表是否存在及结构
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'cost_log'
ORDER BY ordinal_position;

-- 2. 检查是否有任何记录
SELECT
  COUNT(*) as total_records,
  MIN(ts) as earliest_record,
  MAX(ts) as latest_record
FROM cost_log;

-- 3. 查看最近 10 条记录（如果有）
SELECT
  ts,
  tier,
  site,
  raw_model,
  in_tokens,
  out_tokens,
  cost_cny,
  usage_source,
  cost_source
FROM cost_log
ORDER BY ts DESC
LIMIT 10;

-- 4. 检查 RLS 策略
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'cost_log';

-- 5. 检查最近的消息记录（确认 chat 有在工作）
SELECT
  id,
  role,
  created_at,
  LENGTH(content) as content_length
FROM messages
ORDER BY created_at DESC
LIMIT 5;
