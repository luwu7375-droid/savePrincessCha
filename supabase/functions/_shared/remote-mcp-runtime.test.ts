import { selectRemoteMcpRows } from "./remote-mcp-selector.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
}

function row(
  name: string,
  description: string,
  risk: "read" | "write" = "read",
  confirmation = false,
) {
  return {
    remote_name: name,
    description,
    input_schema: { type: "object", properties: {} },
    risk_level: risk,
    requires_confirmation: confirmation,
    connection: {
      id: crypto.randomUUID(),
      endpoint: "https://example.com/mcp",
      transport: "streamable_http" as const,
      headers: {},
      enabled: true,
    },
  };
}

Deno.test("external MCP selector keeps semantic candidates without literal overlap", () => {
  const weather = row("get_weather", "Get the current forecast for a city");
  const selected = selectRemoteMcpRows([weather], "东京今天会下雨吗");
  assertEquals(selected.map((tool) => tool.remote_name), ["get_weather"]);
});

Deno.test("external MCP selector prioritizes literal matches but keeps fallbacks", () => {
  const docs = row("search_docs", "Search product documentation");
  const weather = row("get_weather", "Get the current weather forecast");
  const selected = selectRemoteMcpRows([docs, weather], "weather in Tokyo");
  assertEquals(selected.map((tool) => tool.remote_name), [
    "get_weather",
    "search_docs",
  ]);
});

Deno.test("external MCP selector excludes tools that require confirmation", () => {
  const read = row("lookup", "Look up public data");
  const write = row("create_item", "Create an item", "write", true);
  const confirmedRead = row(
    "private_lookup",
    "Look up private data",
    "read",
    true,
  );
  const selected = selectRemoteMcpRows(
    [write, confirmedRead, read],
    "look this up",
  );
  assertEquals(selected.map((tool) => tool.remote_name), ["lookup"]);
});
