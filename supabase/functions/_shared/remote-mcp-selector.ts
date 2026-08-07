export type SelectableRemoteMcpTool = {
  remote_name: string;
  description: string;
  risk_level: "read" | "write" | "high_risk";
  requires_confirmation: boolean;
};

// Keep the list bounded for provider compatibility, but let the chat model see
// every tool for normal-sized user configurations. Previously tools with no
// literal token overlap were dropped entirely, which made cross-language and
// paraphrased requests impossible to route.
const MAX_REMOTE_TOOLS_PER_TURN = 24;

function tokens(value: string) {
  return value.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) || [];
}

function relevance(tool: SelectableRemoteMcpTool, message: string) {
  const haystack = new Set(tokens(`${tool.remote_name} ${tool.description}`));
  return tokens(message).reduce(
    (score, token) => score + (haystack.has(token) ? 2 : 0),
    0,
  );
}

export function selectRemoteMcpRows<T extends SelectableRemoteMcpTool>(
  rows: T[],
  message: string,
): T[] {
  return rows
    .filter((row) => row.risk_level === "read" && !row.requires_confirmation)
    .map((row, index) => ({ row, index, score: relevance(row, message) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_REMOTE_TOOLS_PER_TURN)
    .map(({ row }) => row);
}
