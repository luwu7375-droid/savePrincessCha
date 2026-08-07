export function asksAboutMcpCapabilities(message: string): boolean {
  return /(有哪些|什么|哪些|当前|配置|可用|启用).{0,10}(mcp|工具|能力)|(mcp|工具|能力).{0,10}(有哪些|什么|哪些|当前|配置|可用|启用|能做)/i.test(
    message,
  );
}

export function extractPlannerJson(
  text: string,
): Record<string, unknown> | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
