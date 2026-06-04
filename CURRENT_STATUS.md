# 当前状态快照（v0.6，2026-06-04）

## 已通功能

### 登录 / 认证
- 邮箱 + 密码登录（signInWithPassword，无 Magic Link）
- 刷新后保持登录（Supabase session 持久化）
- 退出登录正常，清空页面消息和会话缓存
- RLS 隔离：每个用户只能读写自己的 conversations / messages

### 云端会话
- 新建、重命名、置顶、删除会话
- 换浏览器登录同账号后能看到同一套会话列表和历史
- 会话标题自动取首条消息前 20 字

### 聊天
- 流式回复（SSE），`<think>` 标签过滤
- 发送后只显示一个 typing indicator，无双头像
- 顶部"正在输入…"状态，回复结束后清空
- 回复失败显示错误气泡，不留空头像
- 每次加载最近 20 条历史

### 记忆
- 手动记忆库（相处协议）：查看 / 新增 / 禁用
- 记忆沉淀：候选弹窗勾选后写入 memory_buckets
- 事件记忆注入：最多 2 条 summary，仅供参考
- system prompt 含节奏规则，短问短答

### UI
- 深色 / 浅色主题切换，持久化
- 浅色主题气泡：用户蓝底白字，AI 白底灰边
- 移动端基本可用，沉淀弹窗有 max-width 保护
- 侧边栏可收起

## 已知限制

- 历史只加载最近 20 条（分页未实现）
- 无实时跨标签同步（刷新才更新）
- 记忆沉淀依赖 Edge Function distill，无自动触发
- 无附件 / 图片支持
- Edge Function 部署需 GitHub Actions 手动触发或 push

## 技术配置

- 模型：由 `MODEL_NAME` 环境变量控制
- 接口：Supabase Edge Function `/functions/v1/chat`
- 记忆接口：`/functions/v1/memories`
- 前端：GitHub Pages（静态）
- DB：Supabase（conversations / messages / memories / memory_buckets）
- Auth：Supabase Auth，email + password，RLS 全开
