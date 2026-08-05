# 验证 CedarToy 工具集成测试

## 目标

验证 `cedar_list_games`, `cedar_get_guide`, `cedar_play` 三个工具是否真正包含在发送给 Claude API 的请求中。

## 测试步骤

### 1. 部署更新后的 chat 函数

```bash
cd ~/savePrincessCha
supabase functions deploy chat
```

### 2. 添加日志输出验证工具数组

在 `supabase/functions/chat/index.ts` 中添加日志，打印实际发送的 tools 数组。

### 3. 发起测试聊天请求

在 SavePrincessCha 界面中发送以下消息：
- "有什么游戏可以玩？"
- "海龟汤怎么玩？"

### 4. 检查函数日志

```bash
supabase functions logs chat --tail
```

查找日志中的：
- `[chat] tool-runtime check` - 确认候选匹配
- `[chat] tool-runtime succeeded` - 确认工具已使用
- `[tool-runtime] tool started` - 确认工具开始执行
- `[tool-runtime] tool succeeded` - 确认工具执行成功

### 5. 验证工具可用性

在新会话中向 Claude 询问：
```
请原样列出你当前可用的所有工具名称（tool names），不要解释，只列出名字。
```

期望输出包含：
- web_read_url
- cedar_list_games
- cedar_get_guide
- cedar_play

## 验收标准

✅ 日志中显示工具成功执行
✅ Claude 能够报告工具名称
✅ 实际调用返回 CedarToy 游戏数据
✅ 没有 tool_not_registered 或 tool_executor_missing 错误

## 代码修改记录

### mcp-registry.ts
添加了 `cedar_play` 工具定义：
- name: "cedar_play"
- description: 执行游戏操作（仅限已绑定账号）
- readOnly: false
- requiresConfirmation: true
- inputSchema: { game, gameAction, actionParams?, slotId? }

添加了 `cedar_play` 执行器：
- 调用 game-proxy action="play"
- 传递 game, gameAction, actionParams, slotId, userId
- 返回游戏操作结果

### tool-runtime.ts
现有代码已支持：
- `cedar_list_games` 直接路由（第80行）
- `cedar_get_guide` 直接路由（第70行）
- 游戏关键词检测（海龟汤、五子棋、狼人杀、你画我猜）
- 规则查询检测

## 注意事项

1. `cedar_play` 需要用户已完成小机绑定，否则返回 409 错误
2. Service role key 用于内部工具调用，不暴露给前端
3. 工具结果限制在 16,000 字符以内
4. 工具调用超时设置：8-10秒
