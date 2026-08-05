// Tool calling handler for chat function
// This needs to be added to chat/index.ts after the initial model call

/**
 * Process streaming SSE response and extract tool_calls if present
 */
async function extractToolCallsFromStream(response: Response): Promise<{
  hasToolCalls: boolean;
  toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  assistantMessage: string;
  finishReason: string | null;
}> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  const toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];
  let assistantMessage = "";
  let finishReason: string | null = null;
  let buffer = "";

  if (!reader) {
    return { hasToolCalls: false, toolCalls: [], assistantMessage: "", finishReason: null };
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;

          // Accumulate assistant message
          if (delta?.content) {
            assistantMessage += delta.content;
          }

          // Accumulate tool calls
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index || 0;
              if (!toolCalls[index]) {
                toolCalls[index] = {
                  id: tc.id || "",
                  type: tc.type || "function",
                  function: { name: "", arguments: "" },
                };
              }
              if (tc.id) toolCalls[index].id = tc.id;
              if (tc.function?.name) toolCalls[index].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[index].function.arguments += tc.function.arguments;
            }
          }

          // Capture finish reason
          if (parsed.choices?.[0]?.finish_reason) {
            finishReason = parsed.choices[0].finish_reason;
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    hasToolCalls: toolCalls.length > 0 && finishReason === "tool_calls",
    toolCalls: toolCalls.filter(tc => tc.id && tc.function.name),
    assistantMessage,
    finishReason,
  };
}

/**
 * Execute tool calls and return results as messages
 */
async function executeToolCalls(
  toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }>,
  context: {
    supabaseUrl: string;
    serviceRoleKey: string;
    authorization: string;
    userId?: string;
    conversationId?: string;
    rawUserMessage: string;
  },
): Promise<Array<{ role: string; tool_call_id: string; content: string }>> {
  const results: Array<{ role: string; tool_call_id: string; content: string }> = [];

  for (const call of toolCalls) {
    console.log("[chat] executing tool call:", {
      id: call.id,
      name: call.function.name,
      argsPreview: call.function.arguments.slice(0, 100),
    });

    try {
      const args = JSON.parse(call.function.arguments || "{}");
      const content = await executeMcpTool(call.function.name, args, context);

      results.push({
        role: "tool",
        tool_call_id: call.id,
        content,
      });

      console.log("[chat] tool call succeeded:", {
        id: call.id,
        name: call.function.name,
        resultLength: content.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({ error: errorMessage }),
      });

      console.error("[chat] tool call failed:", {
        id: call.id,
        name: call.function.name,
        error: errorMessage.slice(0, 300),
      });
    }
  }

  return results;
}

// Usage in chat/index.ts after line 2934:
/*
  try {
    // First model call with tools
    const result = await callModelWithFallback(tierProviders, messages, CHAT_TOOLS);

    // Check if model wants to use tools
    const toolInfo = await extractToolCallsFromStream(result.response.clone());

    if (toolInfo.hasToolCalls && supabaseUrl && serviceRoleKey) {
      console.log("[chat] tool_calls detected:", {
        count: toolInfo.toolCalls.length,
        tools: toolInfo.toolCalls.map(tc => tc.function.name),
      });

      // Add assistant message with tool_calls to conversation
      messages.push({
        role: "assistant",
        content: toolInfo.assistantMessage || null,
        tool_calls: toolInfo.toolCalls,
      });

      // Execute tools
      const toolResults = await executeToolCalls(toolInfo.toolCalls, {
        supabaseUrl,
        serviceRoleKey,
        authorization,
        userId: typeof payload.userId === "string" ? payload.userId : undefined,
        conversationId,
        rawUserMessage: lastUserMessage,
      });

      // Add tool results to conversation
      messages.push(...toolResults);

      // Update tool names for header
      toolNames = toolInfo.toolCalls.map(tc => tc.function.name);

      // Call model again with tool results
      const finalResult = await callModelWithFallback(tierProviders, messages, CHAT_TOOLS);

      logRecord.model_call_ms = result.modelCallMs + finalResult.modelCallMs;
      logRecord.model = finalResult.usedModel;
      logRecord.provider = finalResult.usedProvider;
      // ... rest of logging

      return streamResponse(finalResult.response);
    }

    // No tool calls, return original response
    logRecord.model_call_ms = result.modelCallMs;
    // ... rest of original flow
  }
*/
