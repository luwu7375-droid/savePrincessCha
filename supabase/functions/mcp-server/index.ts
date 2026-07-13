// MCP Server for SavePrincessCha
// Exposes MCP capabilities so this project can be recognized as an MCP-capable agent
// This allows registration with services like CedarToy

import { Server } from "https://esm.sh/@modelcontextprotocol/sdk@1.0.4/server/index.js";
import { SSEServerTransport } from "https://esm.sh/@modelcontextprotocol/sdk@1.0.4/server/sse.js";
import { corsHeaders } from "../_shared/cors.ts";

// Create MCP server instance
const server = new Server(
  {
    name: "savePrincessCha",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {},
    },
  },
);

// Define available tools (if needed for CedarToy registration)
server.setRequestHandler("tools/list", async () => {
  return {
    tools: [
      {
        name: "echo",
        description: "Echo back a message",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Message to echo",
            },
          },
          required: ["message"],
        },
      },
    ],
  };
});

server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "echo") {
    return {
      content: [
        {
          type: "text",
          text: `Echo: ${args.message}`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create SSE transport
    const transport = new SSEServerTransport("/message", req);

    // Connect server to transport
    await server.connect(transport);

    // Return SSE response
    return transport.response;
  } catch (error) {
    console.error("MCP Server error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      },
    );
  }
});
