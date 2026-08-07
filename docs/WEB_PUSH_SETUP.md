# Web Push 配置指南

## 概述

本项目已集成 Web Push 推送通知功能。当小 cha 主动接话时，会自动向所有已订阅的设备发送推送通知。

## 部署前配置

### 1. 设置 Supabase Secrets（必需）

在 Supabase Dashboard 中添加以下环境变量：

**路径：** Project Settings → Edge Functions → Secrets

添加三个 secrets：

#### a) VAPID_PUBLIC_KEY（可选，已有默认值）
```
BKT3lETzzUJ9Qw0VHFAr78whHwpXOvae8lnM_EE_tra_S2uIbhyCAHb4bo98W37L-YguYPw3iT017bterXlJNm4
```

#### b) VAPID_PRIVATE_KEY（推荐设置）
```
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgPgjwxwkAErrhfO61cPno_8wDTqprhoeCCgj3k8EQH4uhRANCAASk95RE881CfUMNFRxQK-_MIR8KVzr2nvJZzPxBP7a2v0triG4cggB2-G6PfFt-y_mILmD8N4k9Ne27Xq15STZu
```

**安全说明：** 虽然代码中保留了默认值（便于开发），但生产环境强烈建议通过 Secrets 设置，避免私钥泄露。

#### c) VAPID_SUBJECT（推荐设置）
```
mailto:your-actual-email@example.com
```

**RFC 8292 要求：** 必须是有效的 mailto: 或 https: URL，用于推送服务联系你。

### 2. 运行数据库迁移

确保 `push_subscriptions` 表已创建：

```bash
cd supabase
supabase db push
```

检查迁移文件：`supabase/migrations/20260807210000_create_push_subscriptions.sql`

### 3. 确认 PWA 资源文件

已包含的文件：
- ✅ `/assets/pwa/icon-192.png` - 通知图标
- ✅ `/assets/pwa/icon-512.png` - PWA 大图标
- ✅ `/assets/pwa/badge-72.png` - 通知徽章（自动生成）
- ✅ `/manifest.webmanifest` - PWA manifest

## 生成新的 VAPID 密钥对（可选）

如果需要生成全新的 VAPID 密钥对：

```bash
# 使用 Node.js web-push 库
npm install -g web-push
web-push generate-vapid-keys
```

输出示例：
```
Public Key:
BKT3lETzzUJ...

Private Key:
MIGHAgEAMBMGB...
```

**注意：** 如果更换密钥对，需要同时更新：
1. Supabase Secrets 中的 `VAPID_PUBLIC_KEY` 和 `VAPID_PRIVATE_KEY`
2. `push-subscription.js` 中的 `VAPID_PUBLIC_KEY` 常量

## 用户使用流程

1. **用户登录** → 自动初始化 PushSubscription 模块
2. **打开"更多 → 后台与通知"** → 看到"Web 推送通知"开关
3. **首次启用** → 浏览器请求通知权限
4. **允许权限** → 订阅成功，保存到 `push_subscriptions` 表
5. **小 cha 主动接话** → 收到推送通知
6. **点击通知** → 打开应用聊天页面

## 技术架构

### 前端
- `push-subscription.js` - 订阅管理模块
- `sw.js` - Service Worker，接收 push 事件
- `app.js` - UI 交互逻辑

### 后端
- `supabase/functions/push-send/` - 推送发送 Edge Function
- `supabase/functions/_shared/companion-tick.ts` - 主动性触发集成
- `push_subscriptions` 表 - 订阅存储

### 协议
- **VAPID (RFC 8292)** - 身份验证
- **Web Push Encryption (RFC 8291)** - 消息加密（ECDH + HKDF + AES-128-GCM）

## 浏览器支持

### 完全支持
- Chrome 50+
- Firefox 44+
- Edge 17+
- Opera 37+
- Samsung Internet 5+

### 部分支持
- **Safari 16+ (macOS 13+)** - 完全支持
- **iOS Safari 16.4+** - 仅支持"添加到主屏幕"的 PWA，普通标签页不支持

### 不支持
- iOS Safari 16.3 及以下

## 故障排查

### 1. 推送通知未显示

**检查列表：**
- [ ] 浏览器支持检查（控制台：`window.PushSubscription.isSupported()`）
- [ ] 通知权限状态（控制台：`Notification.permission`）
- [ ] Service Worker 已注册（控制台：`navigator.serviceWorker.controller`）
- [ ] 订阅状态（控制台：`await window.PushSubscription.isSubscribed()`）
- [ ] 数据库中有订阅记录（查询 `push_subscriptions` 表）

### 2. 订阅失败

**常见原因：**
- 用户拒绝了通知权限 → 引导用户到浏览器设置中允许
- HTTPS 要求 → 确保站点使用 HTTPS（localhost 除外）
- Service Worker 注册失败 → 检查控制台错误

### 3. 推送发送失败

**检查 Edge Function 日志：**
```bash
supabase functions logs push-send
```

**常见错误：**
- `410 Gone` → 订阅已过期，自动禁用
- `404 Not Found` → 订阅不存在，自动禁用
- `401 Unauthorized` → VAPID 配置错误，检查密钥对

### 4. iOS 无法订阅

**iOS 限制：**
- 普通浏览器标签页不支持 Web Push
- 必须"添加到主屏幕"才能订阅
- 检测 iOS：`/iPad|iPhone|iPod/.test(navigator.userAgent)`

## 监控和维护

### 查看订阅统计

```sql
-- 活跃订阅数
SELECT COUNT(*) FROM push_subscriptions WHERE enabled = true;

-- 按用户统计
SELECT user_id, COUNT(*) as device_count
FROM push_subscriptions
WHERE enabled = true
GROUP BY user_id;

-- 失败率统计
SELECT
  COUNT(*) FILTER (WHERE failure_count > 0) as failed,
  COUNT(*) FILTER (WHERE failure_count = 0) as healthy,
  AVG(failure_count) as avg_failures
FROM push_subscriptions
WHERE enabled = true;
```

### 清理失效订阅

系统会自动禁用失效订阅（410/404 响应），但不会删除。手动清理：

```sql
-- 删除 30 天未成功推送的订阅
DELETE FROM push_subscriptions
WHERE enabled = false
  AND (last_success_at IS NULL OR last_success_at < NOW() - INTERVAL '30 days');
```

## 安全注意事项

1. **VAPID 私钥保护**
   - ✅ 通过 Supabase Secrets 存储
   - ❌ 不要提交到 Git
   - ❌ 不要在客户端代码中暴露

2. **订阅验证**
   - 使用 RLS 策略确保用户只能管理自己的订阅
   - Service Role 可以读取和更新所有订阅（用于推送发送）

3. **推送内容**
   - 推送消息经过加密（RFC 8291）
   - 推送服务无法读取消息内容
   - 仅端到端加密通信

## 成本估算

- **免费额度：** 大多数推送服务提供免费额度
- **Supabase Edge Function：** 按调用次数计费
- **数据库存储：** push_subscriptions 表约 200 bytes/订阅

**示例：**
- 100 用户，每人 2 设备 = 200 订阅
- 每天 10 次主动接话 = 2000 次推送/天
- 月成本约：$0-1 (取决于 Supabase 套餐)

## 参考资料

- [Web Push Protocol (RFC 8030)](https://datatracker.ietf.org/doc/html/rfc8030)
- [VAPID (RFC 8292)](https://datatracker.ietf.org/doc/html/rfc8292)
- [Message Encryption (RFC 8291)](https://datatracker.ietf.org/doc/html/rfc8291)
- [MDN: Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [Can I Use: Push API](https://caniuse.com/push-api)
