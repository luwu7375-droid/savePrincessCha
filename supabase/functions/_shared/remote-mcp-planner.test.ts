import {
  asksAboutMcpCapabilities,
  extractPlannerJson,
} from "./remote-mcp-planner-utils.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test(
  "MCP capability questions are recognized without guessing config visibility",
  () => {
    assert(
      asksAboutMcpCapabilities("你现在有哪些 MCP 能力？"),
      "Chinese MCP question missed",
    );
    assert(
      asksAboutMcpCapabilities("当前启用了什么工具"),
      "tool question missed",
    );
    assert(
      !asksAboutMcpCapabilities("帮我查一下东京天气"),
      "ordinary lookup misclassified",
    );
  },
);

Deno.test("planner JSON parser accepts fenced JSON and rejects prose", () => {
  const parsed = extractPlannerJson(
    '```json\n{"calls":[{"name":"mcp_weather","arguments":{"city":"Tokyo"}}]}\n```',
  );
  assert(Array.isArray(parsed?.calls), "valid planner JSON was not parsed");
  assert(
    extractPlannerJson("I would use the weather tool") === null,
    "prose must be rejected",
  );
});
