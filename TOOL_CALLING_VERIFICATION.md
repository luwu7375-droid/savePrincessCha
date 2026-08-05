# CedarToy 工具调用完整验证报告

## 部署状态 ✅

- ✅ **chat 函数已部署** - 包含完整 tool calling 循环
- ✅ **game-proxy 函数已部署** - VERSION 16
- ✅ **工具定义已发送给 Claude API** - tools 参数已添加
- ✅ **tool_calls 响应处理已实现** - 提取 → 执行 → 再次生成

## 实现的完整流程

```
用户消息: "选一个游戏并创建房间"
    ↓
Claude API 请求 (包含 tools 参数)
    ↓
Claude 返回: finish_reason="tool_calls"
    tool_calls: [
      { id: "call_1", function: { name: "cedar_list_games", arguments: "{}" }},
      { id: "call_2", function: { name: "cedar_play", arguments: "{...}" }}
    ]
    ↓
extractToolCallsFromStream() 提取 tool_calls
    ↓
executeMcpTool() 执行每个工具:
    - cedar_list_games → 返回游戏列表
    - cedar_play → 调用 game-proxy → CedarToy MCP
    ↓
构造 tool result messages:
    - { role: "assistant", tool_calls: [...] }
    - { role: "tool", tool_call_id: "call_1", content: "..." }
    - { role: "tool", tool_call_id: "call_2", content: "..." }
    ↓
再次调用 Claude API (包含 tool results)
    ↓
Claude 生成最终回复: "好的，我为你创建了海龟汤房间 #1234..."
    ↓
流式返回给前端
```

## 关键代码位置

### 1. 工具定义 (mcp-registry.ts:22-92)
```typescript
const definitions: McpToolDefinition[] = [
  {
    name: "cedar_list_games",
    description: "通过 CedarToy MCP 列出当前支持的游戏...",
    source: "mcp",
    readOnly: true,
    requiresConfirmation: false,
    timeoutMs: 8_000,
    inputSchema: { type: "object", properties: {}, ... },
  },
  {
    name: "cedar_get_guide",
    description: "通过 CedarToy MCP 查询某个游戏的玩法说明...",
    source: "mcp",
    readOnly: true,
    requiresConfirmation: false,
    timeoutMs: 8_000,
    inputSchema: { ... game: string ... },
  },
  {
    name: "cedar_play",
    description: "通过 CedarToy MCP 执行游戏操作（仅限已绑定的小机账号）",
    source: "mcp",
    readOnly: false,
    requiresConfirmation: true,
    timeoutMs: 10_000,
    inputSchema: { ... game, gameAction, actionParams?, slotId? ... },
  },
];
```

### 2. 工具执行器 (mcp-registry.ts:132-214)
```typescript
export async function executeMcpTool(
  name: string,
  args: Record<string, unknown>,
  context: McpToolContext,
): Promise<string> {
  const tool = getMcpTool(name);
  if (!tool) throw new Error(`tool_not_registered: ${name}`);

  switch (name) {
    case "cedar_list_games":
      return compactResult(await fetchJson(
        `${context.supabaseUrl}/functions/v1/game-proxy`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${context.serviceRoleKey}` },
          body: JSON.stringify({ action: "list_games", userId: context.userId })
        }
      ));

    case "cedar_play":
      // 调用 game-proxy action="play"
      // 传递 game, gameAction, actionParams, slotId
      // ...
  }
}
```

### 3. Tool Calling 循环 (chat/index.ts:3011-3126)
```typescript
// 1. 调用模型（带 tools 参数）
const result = await callModelWithFallback(tierProviders, messages, CHAT_TOOLS);

// 2. 检测 tool_calls
const toolInfo = await extractToolCallsFromStream(result.response.clone());

if (toolInfo.hasToolCalls && supabaseUrl && serviceRoleKey) {
  // 3. 添加 assistant message with tool_calls
  messages.push({
    role: "assistant",
    content: toolInfo.assistantContent,
    tool_calls: toolInfo.toolCalls,
  });

  // 4. 执行工具
  for (const call of toolInfo.toolCalls) {
    const content = await executeMcpTool(call.function.name, args, toolContext);
    toolResults.push({ role: "tool", tool_call_id: call.id, content });
  }

  // 5. 添加 tool results
  messages.push(...toolResults);

  // 6. 再次调用模型生成最终回复
  const finalResult = await callModelWithFallback(tierProviders, messages, CHAT_TOOLS);

  // 7. 返回最终响应
  return new Response(finalResult.response.body, { ... });
}
```

## 验证步骤

### 1. 检查函数日志

```bash
supabase functions logs chat --tail
```

### 2. 在 SavePrincessCha 中发送测试消息

**测试用例**：
```
选一个游戏并创建房间
```

**期望日志输出**：
```
[chat] tool-runtime check: ...
[chat] rawToolMessage: { preview: "选一个游戏并创建房间" }
[chat] tool_calls detected: { count: 2, tools: ["cedar_get_guide", "cedar_play"] }
[chat] executing tool: { id: "call_1", name: "cedar_get_guide" }
[tool-runtime] tool started: { name: "cedar_get_guide" }
[tool-runtime] tool succeeded: { name: "cedar_get_guide", resultLength: 1234 }
[chat] tool succeeded: { id: "call_1", name: "cedar_get_guide" }
[chat] executing tool: { id: "call_2", name: "cedar_play" }
[tool-runtime] tool started: { name: "cedar_play" }
[tool-runtime] tool succeeded: { name: "cedar_play", resultLength: 567 }
[chat] tool succeeded: { id: "call_2", name: "cedar_play" }
[chat] calling model with tool results
```

**期望前端显示**：
```
好的！我为你创建了一个海龟汤房间。

房间号：#1234
游戏规则：...
当前状态：等待其他玩家加入

你可以：
1. 分享房间号让朋友加入
2. 开始游戏
3. 查看游戏指南
```

### 3. 验证 CedarToy 服务端状态

在 https://toy.cedarstar.org/ 登录后检查：
- ✅ 房间已创建
- ✅ 房间号匹配
- ✅ 状态正确

## 双重工具触发机制

当前实现了**两种**工具触发方式：

### 方式 1: 直接路由（已有，tool-runtime.ts）
- **触发条件**：关键词匹配（海龟汤、游戏列表等）
- **工作方式**：服务端直接执行工具，结果注入 system message
- **优势**：更快，兼容非 Claude 模型
- **限制**：只支持 `cedar_list_games` 和 `cedar_get_guide`

### 方式 2: Tool Calling 循环（新增，chat/index.ts）
- **触发条件**：模型主动生成 tool_calls
- **工作方式**：标准 OpenAI tool calling 协议
- **优势**：模型可主动调用任何工具，支持 `cedar_play`
- **工具**：所有三个工具（list_games, get_guide, play）

**两种方式可以共存**：
- 如果关键词匹配 → 直接路由先执行
- 如果模型生成 tool_calls → tool calling 循环执行

## 已知限制

### 1. cedar_play 需要已绑定账号
如果用户未完成小机绑定，工具返回：
```json
{
  "error": "machine_not_bound",
  "machine": { "status": "unregistered" }
}
```

**解决方案**：模型会看到错误并告知用户先完成绑定。

### 2. 工具确认机制
`cedar_play` 设置了 `requiresConfirmation: true`，但当前实现**直接执行**。
如需真正的确认流程，需要：
- 检测 requiresConfirmation 工具
- 返回确认提示给前端
- 前端用户确认后再执行

### 3. 工具调用次数限制
当前无限制，模型可以连续调用多个工具。
建议添加限制：
```typescript
const MAX_TOOL_CALLS_PER_TURN = 5;
if (toolInfo.toolCalls.length > MAX_TOOL_CALLS_PER_TURN) {
  // 截断或拒绝
}
```

## 错误排查

### 如果看到 "tool_not_registered"
- 检查工具名称拼写
- 确认工具已在 mcp-registry.ts 的 definitions 数组中

### 如果看到 "tool_executor_missing"
- 确认 executeMcpTool 的 switch 语句中有该 case

### 如果工具执行成功但模型没有回复
- 检查日志中是否有 "calling model with tool results"
- 检查第二次模型调用是否成功
- 检查是否返回了正确的流式响应

### 如果 game-proxy 返回 409
- 用户需要先在游戏中心完成小机绑定
- 检查 cedartoy_machine_accounts 表中的状态

## 下一步测试

1. **发送消息**："选一个游戏并创建房间"
2. **观察日志**：确认 tool_calls detected 和 tool succeeded
3. **查看回复**：模型应该告知房间号和游戏状态
4. **验证服务端**：在 CedarToy 检查房间是否真实创建
5. **报告结果**：工具是否被调用？模型是否生成了回复？

## 成功标准 ✅

- [ ] 日志显示 `[chat] tool_calls detected`
- [ ] 日志显示 `[chat] executing tool: cedar_play`
- [ ] 日志显示 `[chat] tool succeeded`
- [ ] 日志显示 `[chat] calling model with tool results`
- [ ] 前端收到模型回复（包含房间号和游戏状态）
- [ ] CedarToy 服务端有真实的房间或游戏状态

**如果所有条件满足，工具集成完全成功！**
