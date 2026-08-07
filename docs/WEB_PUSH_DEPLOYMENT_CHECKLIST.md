# Web Push 部署检查清单

## ✅ 已完成

### 1. 代码部署
- ✅ `push-send` Edge Function 已部署
- ✅ `chat` Edge Function 已部署（包含 proactive_trigger 支持）
- ✅ Service Worker (`sw.js`) 已更新推送事件处理器
- ✅ 前端模块 (`push-subscription.js`) 已创建
- ✅ UI 界面（"后台与通知"面板）已添加
- ✅ PWA 资源文件已准备（icon-192.png, icon-512.png, badge-72.png）

### 2. 配置文件
- ✅ VAPID 配置支持环境变量（带默认值 fallback）
- ✅ 图标路径已更新为 `/assets/pwa/`

## ⏳ 待完成

### 3. 数据库迁移

**状态：** 需要手动执行

**方法 1：使用数据库密码**
```bash
export SUPABASE_DB_PASSWORD="your-database-password"
supabase db push
```

**方法 2：在 Supabase Dashboard 手动执行**
1. 打开 https://supabase.com/dashboard/project/zbpbkyzisamleqspijnr/sql
2. 粘贴 `supabase/migrations/20260807210000_create_push_subscriptions.sql` 内容
3. 点击 Run

**验证迁移成功：**
```sql
-- 检查表是否存在
SELECT COUNT(*) FROM push_subscriptions;

-- 检查 RLS 策略
SELECT * FROM pg_policies WHERE tablename = 'push_subscriptions';
```

### 4. Supabase Secrets 配置（推荐）

在 Supabase Dashboard 设置环境变量：

**路径：** https://supabase.com/dashboard/project/zbpbkyzisamleqspijnr/settings/functions

添加以下 secrets：

```bash
VAPID_PRIVATE_KEY=MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgPgjwxwkAErrhfO61cPno_8wDTqprhoeCCgj3k8EQH4uhRANCAASk95RE881CfUMNFRxQK-_MIR8KVzr2nvJZzPxBP7a2v0triG4cggB2-G6PfFt-y_mILmD8N4k9Ne27Xq15STZu

VAPID_SUBJECT=mailto:你的真实邮箱@example.com
```

**注意：** 如果不设置这些 secrets，系统会使用代码中的默认值，功能依然可用，但建议设置以提高安全性。

## 步骤 4: 测试推送流程

### 4.1 浏览器支持检查

在浏览器控制台执行：
```javascript
// 检查浏览器支持
window.PushSubscription.isSupported()
// 应返回 true

// 检查通知权限
Notification.permission
// 应返回 'default', 'granted', 或 'denied'
```

### 4.2 订阅流程测试

1. **登录应用**
   - 打开应用并登录
   - 检查控制台：应该看到 `[push] Module initialized for user: xxxxxx`

2. **启用推送通知**
   - 点击右上��"更多"按钮
   - 选择"后台与通知"
   - 点击"Web 推送通知"开关
   - 浏览器会弹出权限请求：点击"允许"
   - 控制台应显示：`[push] New subscription created: https://...`
   - 状态应变为"已开启"

3. **验证数据库记录**
   ```sql
   SELECT
     user_id,
     endpoint,
     enabled,
     created_at,
     user_agent
   FROM push_subscriptions
   WHERE user_id = 'your-user-id';
   ```

### 4.3 推送发送测试

**方法 1：手动触发（推荐用于测试）**

在 Supabase Dashboard SQL Editor 执行：
```sql
-- 调用 push-send Edge Function
SELECT content::json
FROM http((
  'POST',
  'https://zbpbkyzisamleqspijnr.supabase.co/functions/v1/push-send',
  ARRAY[
    http_header('Authorization', 'Bearer ' || current_setting('request.jwt.claims')::json->>'role'),
    http_header('Content-Type', 'application/json')
  ],
  'application/json',
  json_build_object(
    'userId', 'your-user-id',
    'payload', json_build_object(
      'title', '测试通知',
      'body', '这是一条测试推送',
      'tag', 'test',
      'icon', '/assets/pwa/icon-192.png',
      'badge', '/assets/pwa/badge-72.png',
      'data', json_build_object('url', '/')
    )
  )::text
)::http_request);
```

**方法 2：等待主动接话触发**

1. 确保 companion-tick scheduler 已配置（每 5 分钟运行）
2. 等待小 cha 主动接话（根据 connection 状态）
3. 应收到推送通知

**方法 3：使用 curl 测试**

```bash
curl -X POST \
  'https://zbpbkyzisamleqspijnr.supabase.co/functions/v1/push-send' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "your-user-id",
    "payload": {
      "title": "测试通知",
      "body": "这是一条测试推送",
      "tag": "test",
      "icon": "/assets/pwa/icon-192.png",
      "badge": "/assets/pwa/badge-72.png",
      "data": {
        "url": "/"
      }
    }
  }'
```

### 4.4 验证推送接收

**成功标志：**
- ✅ 浏览器显示通知
- ✅ 通知标题："测试通知"（或"小钗"）
- ✅ 通知内容："这是一条测试推送"（或"有新消息"）
- ✅ 点击通知打开应用
- ✅ 控制台显示：`[sw] push event received`
- ✅ 控制台显示：`[sw] notification shown: ...`

**故障排查：**
- 通知未显示 → 检查浏览器权限设置
- 推送失败 → 检查 Edge Function 日志：`supabase functions logs push-send`
- 订阅失败 → 检查控制台错误，确认 Service Worker 已注册

### 4.5 取消订阅测试

1. 关闭"Web 推送通知"开关
2. 控制台应显示：`[push] Unsubscribed from push`
3. 数据库验证：
   ```sql
   SELECT enabled FROM push_subscriptions WHERE user_id = 'your-user-id';
   -- 应为空（记录已删除）
   ```

## 生产环境监控

### 查看推送统计

```sql
-- 活跃订阅数
SELECT COUNT(*) as active_subscriptions
FROM push_subscriptions
WHERE enabled = true;

-- 按用户统计
SELECT
  user_id,
  COUNT(*) as device_count,
  MAX(last_success_at) as last_push
FROM push_subscriptions
WHERE enabled = true
GROUP BY user_id;

-- 推送成功率
SELECT
  COUNT(*) FILTER (WHERE last_success_at IS NOT NULL) as successful,
  COUNT(*) FILTER (WHERE failure_count > 0) as failed,
  AVG(failure_count) as avg_failures
FROM push_subscriptions
WHERE enabled = true;
```

### Edge Function 日志

```bash
# 实时查看日志
supabase functions logs push-send --tail

# 查看最近错误
supabase functions logs push-send --level error
```

### 清理失效订阅

```sql
-- 查看失效订阅
SELECT user_id, endpoint, failure_count, last_success_at
FROM push_subscriptions
WHERE enabled = false OR failure_count >= 3;

-- 清理 30 天未使用的失效订阅
DELETE FROM push_subscriptions
WHERE enabled = false
  AND (last_success_at IS NULL OR last_success_at < NOW() - INTERVAL '30 days');
```

## iOS 特别说明

**iOS 限制：**
- iOS 16.4+ 支持 Web Push
- **仅限 PWA 模式**（必须"添加到主屏幕"）
- Safari 普通标签页不支持

**iOS 测试流程：**
1. 在 Safari 中打开应用
2. 点击"分享" → "添加到主屏幕"
3. 从主屏幕打开应用
4. 启用推送通知
5. 退出应用（保持后台运行）
6. 触发推送 → 应收到通知

## 故障排查

### 常见问题

**1. 订阅时提示"浏览器不支持"**
- 检查 HTTPS（必需，localhost 除外）
- 检查浏览器版本
- iOS 检查是否从 PWA 启动

**2. 权限被拒绝无法恢复**
- Chrome: 地址栏左侧锁图标 → 权限 → 通知 → 允许
- Safari: 系统设置 → Safari → 网站 → 通知

**3. 推送发送返回 401 Unauthorized**
- 检查 VAPID_PRIVATE_KEY 是否正确
- 检查 VAPID_PUBLIC_KEY 是否匹配

**4. 推送发送返回 410 Gone**
- 订阅已过期，系统会自动禁用
- 用户需要重新订阅

**5. Service Worker 未注册**
- 检查是否在开发环境（localhost 会禁用 SW）
- 检查浏览器控制台 Application → Service Workers

## 完成检查清单

部署完成后，请确认：

- [ ] 数据库迁移已执行（push_subscriptions 表存在）
- [ ] Supabase Secrets 已配置（推荐）
- [ ] 至少一个浏览器成功订阅
- [ ] 手动推送测试通过
- [ ] 主动接话推送测试通过
- [ ] 通知点击跳转正常
- [ ] 取消订阅功能正常
- [ ] Edge Function 日志无错误

## 下一步

功能上线后：
1. 监控推送成功率（目标 >95%）
2. 收集用户反馈
3. 考虑添加推送内容个性化
4. 考虑添加多设备管理界面
5. 考虑添加推送频率控制

---

**参考文档：**
- 完整配置指南：`docs/WEB_PUSH_SETUP.md`
- API 文档：MDN Web Push API
- Supabase Dashboard：https://supabase.com/dashboard/project/zbpbkyzisamleqspijnr
