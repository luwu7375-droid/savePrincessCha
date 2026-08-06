# MCP Host v1

SavePrincessCha can connect to user-owned or third-party MCP servers without a
service-specific adapter. v1 supports remote **Streamable HTTP** MCP endpoints.

## Add and verify a server

1. Open **设置 → MCP 能力 → 添加远程 MCP**.
2. Enter a display name and an HTTPS MCP endpoint.
3. If required, add headers as JSON. Example:

   ```json
   { "Authorization": "Bearer replace-me" }
   ```

4. Save, then select **连接并刷新**.
5. A successful connection shows `connected` and the actual `tools/list`
   result. A failed handshake shows the upstream error without enabling tools.

Newly discovered tools are disabled. Classify each tool before enabling it:

- `read`: may be offered to the chat model and executed automatically.
- `write`: visible in settings and manually testable; chat execution is blocked.
- `high_risk`: same v1 behavior as write, reserved for destructive or costly work.

Use **测试**, enter the tool arguments as JSON, and inspect the real
`tools/call` result. This is the self-test path for both mature and self-hosted
MCP servers.

## Runtime behavior

The backend performs `initialize`, `notifications/initialized`, `tools/list`,
and `tools/call`. Credentials stay in server-only tables and are redacted from
settings responses. The chat runtime injects no more than six relevant enabled
read tools for a turn. Tool results are capped before being returned to the
model.

Remote endpoints must use HTTPS. Redirects and literal loopback/private-network
addresses are rejected. Browser code never calls the MCP server directly.

## Current boundary

v1 intentionally does not implement OAuth, legacy HTTP+SSE, stdio, or chat-side
confirmation for writes. The transport is an explicit adapter type so those
can be added without changing connection and tool records or the settings UI.
