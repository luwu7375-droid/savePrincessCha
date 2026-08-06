# Autonomous Game Runner — 完整实现文档

## 概述

实现了真正独立运行的 CedarToy 游戏执行器，让 Cha 可以在后台自主玩完多回合游戏，无需用户持续发送"继续"。

**核心能力：**
- ✅ 持久化任务队列：页面刷新、Edge Function 实例销毁后可恢复
- ✅ 原子任务认领：多 worker 并发安全，无重复执行
- ✅ 真实 CedarToy MCP 调用：不模拟、不编造游戏结果
- ✅ 完整状态持久化：每回合保存 room_id、session_id、current_state、last_result
- ✅ 协议驱动决策：根据 CedarToy 真实返回决定下一步，不猜字段
- ✅ 安全限制：最大回合数、总超时、重试次数、指数退避
- ✅ 明确 waiting 处理：区分 AI 回合和等待外部事件
- ✅ 错误验证：空返回、纯标点、不可解析响应全部拒绝
- ✅ 主动回复：完成后写入原 conversation，触发前端消息机制

## 架构

```
用户：去玩这个海龟汤，玩完回来告诉我
  ↓
chat function 检测到 autonomous intent
  ↓
创建 game_tasks 行（status=pending）
  ↓
立即回复："好，我去玩，玩完告诉你"
  ↓
[用户可以做其他事，页面可以刷新]
  ↓
scheduler 每 30 秒调用 game-runner
  ↓
game-runner 原子认领一个 pending 任务
  ↓
循环执行回合：
  - 调用真实 CedarToy MCP
  - 解析响应（room_id, session_id, completion, waiting）
  - 验证响应非空、非标点
  - 保存状态到 game_tasks
  - 记录 action 到 game_sessions
  - 心跳续租防止锁过期
  - 检查安全限制（max_turns, deadline）
  ↓
完成时：
  - 标记 task status=completed/failed
  - 完成 game_session
  - 写入 assistant 消息到原 conversation
  - 前端收到新消息（proactive: true）
```

## 新增文件

### 1. Migration: `supabase/migrations/20260806000000_game_tasks.sql`

**关键表：`game_tasks`**
```sql
CREATE TABLE game_tasks (
  id                UUID PRIMARY KEY,
  user_id           UUID NOT NULL,
  conversation_id   TEXT NOT NULL,
  game_id           TEXT NOT NULL,
  game_name         TEXT NOT NULL,
  room_id           TEXT,               -- CedarToy 房间 ID
  cedar_session_id  TEXT,               -- CedarToy session 标识
  status            TEXT NOT NULL,      -- pending/running/waiting/completed/failed/cancelled
  locked_by         TEXT,               -- worker 实例 id
  locked_at         TIMESTAMPTZ,
  lock_expires_at   TIMESTAMPTZ,        -- 租约过期时间，worker 必须心跳续租
  turn_count        INTEGER NOT NULL DEFAULT 0,
  retry_count       INTEGER NOT NULL DEFAULT 0,
  max_turns         INTEGER NOT NULL DEFAULT 30,
  max_retries       INTEGER NOT NULL DEFAULT 5,
  deadline          TIMESTAMPTZ NOT NULL,
  last_action       TEXT,
  last_result       JSONB,
  current_state     JSONB NOT NULL DEFAULT '{}',
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  game_session_id   UUID REFERENCES game_sessions(id)
);
```

**原子认领函数：`claim_game_task()`**
- 使用 `FOR UPDATE SKIP LOCKED` 确保并发安全
- 原子更新 status=running + 设置租约
- 返回认领到的 task_id 或 NULL

**租约回收函数：`reclaim_expired_game_tasks()`**
- 重置 `lock_expires_at < NOW()` 的任务为 pending
- 标记超过 max_retries 的任务为 failed

**扩展 `game_sessions` 表：**
```sql
ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS room_id       TEXT,
  ADD COLUMN IF NOT EXISTS session_id    TEXT,
  ADD COLUMN IF NOT EXISTS game_id       TEXT,
  ADD COLUMN IF NOT EXISTS task_id       UUID;
```

### 2. Shared Module: `supabase/functions/_shared/game-task-manager.ts`

**核心函数：**
- `createGameTask()` — 创建新任务
- `claimGameTask()` — 原子认领任务
- `getGameTask()` / `getActiveGameTask()` — 查询任务
- `patchGameTask()` — 更新任务状态
- `heartbeatGameTask()` — 续租防止被回收
- `cancelGameTask()` — 用户取消任务
- `reclaimExpiredTasks()` — 回收过期租约
- `writeCompletionMessage()` — 写入 assistant 消息到 conversation

### 3. Worker: `supabase/functions/game-runner/index.ts`

**职责：**
- 每次调用认领并执行**一个**任务
- 循环执行回合直到 completed/failed
- 心跳续租（60s 间隔）
- 解析 CedarToy 响应，验证非空、非标点
- 区分 `completed`（游戏结束）和 `waiting`（等待外部事件）
- 达到 max_turns/deadline 时安全终止
- 完成后写入原 conversation

**关键逻辑：**
```typescript
while (true) {
  // 安全检查
  if (task.turn_count >= task.max_turns) { finish("failed", "max_turns_exceeded"); break; }
  if (deadline passed) { finish("failed", "deadline_exceeded"); break; }

  // 决定下一步
  const action = determineNextAction(task);

  // 执行回合
  const result = await executeTurn(supabaseUrl, serviceRoleKey, task, action);

  // 解析响应
  const parsed = parseGameResult(result);
  if (!parsed.text.trim() || /^[.\s…]+$/.test(parsed.text)) {
    throw new Error("cedartoy_returned_empty_or_invalid_response");
  }

  // 保存状态
  await patchGameTask(supabaseUrl, serviceRoleKey, taskId, {
    turn_count: task.turn_count + 1,
    last_action: action.action,
    last_result: result,
    current_state: newState,
    room_id: parsed.room_id || task.room_id,
    cedar_session_id: parsed.session_id || task.cedar_session_id,
  });

  // 检查完成
  if (parsed.completed) { finish("completed", "success"); break; }
  if (parsed.waiting) { markWaiting(); break; }  // 不空转，下次 scheduler 调用时继续

  // 刷新任务继续下一回合
  task = await getGameTask(supabaseUrl, serviceRoleKey, taskId);
}
```

### 4. Scheduler Extension: `supabase/functions/scheduler/index.ts`

**新增 job：`game_runner`**
```typescript
async function runGameRunner(settings, supabaseUrl, serviceRoleKey): Promise<JobResult> {
  const res = await fetch(`${supabaseUrl}/functions/v1/game-runner`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceRoleKey}` },
  });
  const result = await res.json();
  return {
    job_name: "game_runner",
    status: result.ok ? "succeeded" : "failed",
    reason: result.reason,
    metadata: { task_id: result.task_id, turns_executed: result.turns_executed },
  };
}
```

**更新 `JOBS` 数组：**
```typescript
const JOBS: SchedulerJobName[] = ["companion_tick", "web_explore", "dream_nightly", "game_runner"];
```

### 5. Intent Detector: `supabase/functions/_shared/game-intent-detector.ts`

**检测模式：**
```typescript
const autonomousPatterns = [
  /去玩.*告诉我|去玩.*回来|玩完.*告诉|玩完.*回来/,
  /自己玩.*告诉|自己.*玩完|帮我玩|代玩/,
  /play.*for me|play.*tell me|finish.*game.*tell/,
];
```

**返回：**
```typescript
{ autonomous: boolean, gameId: string | null, gameName: string | null }
```

### 6. Chat Integration: `docs/chat-integration-snippet.ts`

在 `chat/index.ts` 的 `game_invitation` handler 中：
1. 调用 `detectGameIntent(lastUserMessage)`
2. 如果 `autonomous=true`：创建 `game_tasks` 任务，立即回复
3. 如果 `autonomous=false`：保持现有同步 tool-calling 逻辑

### 7. Tests: `tests/game-runner.test.ts`

**测试覆盖：**
- ✅ 创建任务后可以原子认领
- ✅ 认领后任务状态为 running，locked_by 正确
- ✅ 过期租约可以被回收
- ✅ 回收后任务回到 pending，locked_by 清空
- ✅ 无任务时 game-runner 返回 no_work
- ✅ Intent detector 正确识别 autonomous/sync 意图
- ✅ Intent detector 正确提取游戏名称

## 部署顺序

**1. 数据库迁移**
```bash
cd /Users/weidian/savePrincessCha
supabase db push
# 或 apply specific migration
psql $DATABASE_URL -f supabase/migrations/20260806000000_game_tasks.sql
```

**验证：**
```sql
SELECT * FROM game_tasks LIMIT 1;
SELECT claim_game_task('test_worker', 120);
SELECT reclaim_expired_game_tasks();
```

**2. 部署 Edge Functions**
```bash
# 部署 game-runner worker
supabase functions deploy game-runner

# 重新部署 scheduler（包含 game_runner job）
supabase functions deploy scheduler

# 如果修改了 chat function，重新部署
supabase functions deploy chat
```

**3. 配置 Scheduler 定时任务**

在 Vercel/AWS/Supabase 中配置 cron job：
```
*/30 * * * *  curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/scheduler?job=game_runner \
              -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

建议频率：30 秒 - 1 分钟（根据负载调整）

**4. 刷新 PostgREST Schema Cache**

Migration 自动执行了 `NOTIFY pgrst, 'reload schema'`，但如果需要手动刷新：
```sql
NOTIFY pgrst, 'reload schema';
```

## 验证步骤

### 1. Migration 验证
```sql
-- 检查表存在
\d game_tasks

-- 检查函数存在
\df claim_game_task
\df reclaim_expired_game_tasks

-- 检查 game_sessions 新列
\d game_sessions
-- 应该看到 room_id, session_id, game_id, task_id
```

### 2. 任务生命周期测试
```sql
-- 创建测试任务
INSERT INTO game_tasks (user_id, conversation_id, game_id, game_name)
VALUES ('YOUR_USER_ID', 'test_conv', 'turtle_soup', '海龟汤')
RETURNING id;

-- 认领任务
SELECT claim_game_task('test_worker', 120);

-- 查看任务状态
SELECT id, status, locked_by, turn_count FROM game_tasks WHERE conversation_id = 'test_conv';

-- 模拟过期租约
UPDATE game_tasks SET lock_expires_at = NOW() - INTERVAL '1 hour' WHERE conversation_id = 'test_conv';

-- 回收过期任务
SELECT reclaim_expired_game_tasks();

-- 验证任务回到 pending
SELECT status, locked_by FROM game_tasks WHERE conversation_id = 'test_conv';
```

### 3. Runner 端到端测试
```bash
# 手动触发 game-runner（无任务时应返回 no_work）
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/game-runner \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"

# 创建测试任务后再次触发
# 应该看到任务被认领并执行
```

### 4. Chat 集成测试

在前端对话中发送：
```
去玩个海龟汤，玩完告诉我
```

**预期行为：**
1. Chat 立即回复："好，我去玩海龟汤，玩完告诉你"
2. 查询数据库，应该有新的 `game_tasks` 行（status=pending）
3. 等待 scheduler 触发（30s - 1min）
4. 任务 status 变为 running，turn_count 增加
5. 游戏完成后，status=completed
6. 原 conversation 收到新 assistant 消息（metadata.proactive=true）

### 5. Concurrent Worker 测试

同时运行多个 game-runner 实例（模拟高负载）：
```bash
for i in {1..5}; do
  curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/game-runner \
    -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" &
done
wait
```

**验证：**
- 每个任务只被一个 worker 认领
- 没有重复执行
- 所有任务最终都完成

### 6. Lease Expiry 测试

1. 创建任务并认领
2. 手动设置 `lock_expires_at` 为过去时间
3. 调用 `reclaim_expired_game_tasks()`
4. 验证任务回到 pending
5. 再次触发 runner，任务应被重新认领

## 风险与限制

### 已解决的风险

✅ **并发执行：** 原子 claim 函数使用 `FOR UPDATE SKIP LOCKED`
✅ **无限循环：** max_turns (30), deadline (2h), max_retries (5)
✅ **租约过期：** 心跳机制 + 自动回收
✅ **空响应判断：** 严格验证非空、非标点
✅ **waiting 死循环：** 标记为 waiting 状态，不空转
✅ **编造结果：** 只使用真实 CedarToy 返回

### 仍存在的风险

⚠️ **CedarToy 协议变更：** 如果 CedarToy 改变响应格式，需要更新 `parseGameResult()`
⚠️ **游戏特定逻辑：** `determineNextAction()` 目前是简化版，复杂游戏需要更智能的决策
⚠️ **费用控制：** max_turns 限制了单次任务，但如果用户创建大量任务仍可能超支
⚠️ **Scheduler 频率：** 30s 间隔意味着任务响应延迟最多 30s
⚠️ **前端 realtime：** 完成消息写入后，前端需要轮询或 WebSocket 才能实时收到

### 监控建议

**关键指标：**
- `SELECT COUNT(*) FROM game_tasks WHERE status='pending'` — 待处理队列长度
- `SELECT COUNT(*) FROM game_tasks WHERE status='running' AND lock_expires_at < NOW()` — 过期租约数量
- `SELECT AVG(turn_count) FROM game_tasks WHERE status='completed'` — 平均回合数
- `SELECT COUNT(*) FROM game_tasks WHERE status='failed'` — 失败任务数

**日志监控：**
- `game-runner` 的 `claimed_task`, `turn_start`, `task_finished` 事件
- `cedartoy_returned_empty_or_invalid_response` 错误
- `max_turns_exceeded`, `deadline_exceeded` 限制触发

## 下一步改进

**Phase 2 优先级：**
1. **智能决策引擎：** 使用 LLM 分析 last_result 决定下一步 action（而非硬编码）
2. **多游戏支持：** 为每个游戏类型定制 action 序列
3. **用户进度查询：** 前端支持"游戏进行到哪了？"查询
4. **取消/暂停：** 前端按钮取消正在运行的任务
5. **费用预算：** 按用户限制每日游戏任务数/回合数
6. **Realtime 推送：** 使用 Supabase Realtime 或 WebSocket 立即通知前端

**Phase 3 扩展：**
- 多 worker 分布式调度（Kubernetes/Lambda）
- 任务优先级队列
- 游戏录像回放
- 社交分享（分享游戏结果到社区）

## 总结

### 根因
现有 CedarToy 集成只能在单次 chat 请求中临时调用工具（最多 4 轮），无法让 Cha 独立玩完多回合游戏。用户必须不断发送"继续"来推进。

### 实际架构
**持久化任务队列 + 独立 worker + 定时唤醒**
- `game_tasks` 表保存任务状态
- `claim_game_task()` 原子认领防并发
- `game-runner` worker 循环执行回合
- `scheduler` 定时触发 worker（30s）
- 完成后写入 assistant 消息到原 conversation

### 修改文件
**新增：**
- `supabase/migrations/20260806000000_game_tasks.sql`
- `supabase/functions/_shared/game-task-manager.ts`
- `supabase/functions/_shared/game-intent-detector.ts`
- `supabase/functions/game-runner/index.ts`
- `tests/game-runner.test.ts`
- `docs/chat-integration-snippet.ts`

**修改：**
- `supabase/functions/scheduler/index.ts` — 添加 game_runner job
- `supabase/functions/_shared/scheduler_types.ts` — 添加 game_runner 类型
- `supabase/functions/chat/index.ts` — 需集成 intent detector（见 snippet）

### 数据库 Migration
执行 `20260806000000_game_tasks.sql`：
- 创建 `game_tasks` 表
- 扩展 `game_sessions` 表（room_id, session_id, game_id, task_id）
- 创建 `claim_game_task()` 和 `reclaim_expired_game_tasks()` 函数
- 刷新 PostgREST schema cache

### 部署顺序
1. 执行 migration（`supabase db push`）
2. 部署 `game-runner` function
3. 重新部署 `scheduler` function
4. 配置 cron job 每 30s 调用 `/scheduler?job=game_runner`
5. （可选）修改 `chat` function 集成 intent detector
6. 验证：创建测试任务 → 查看日志 → 确认完成消息

### 验证步骤
1. SQL：验证表、函数、索引存在
2. 创建测试任务 → 手动触发 runner → 查看状态变化
3. 前端：发送"去玩海龟汤，玩完告诉我" → 等待 → 收到完成消息
4. 并发：多 worker 同时认领任务，无重复执行
5. 租约过期：模拟过期 → 回收 → 重新认领

### 仍存在的风险
- **CedarToy 协议变更：** 需更新 `parseGameResult()`
- **费用控制：** 需按用户限制任务数
- **前端 realtime：** 需 WebSocket 或轮询才能实时收到完成消息
- **游戏特定逻辑：** 简化版决策引擎，复杂游戏需 LLM 辅助

**所有代码已完成，migration 和测试准备就绪。** 🎉
