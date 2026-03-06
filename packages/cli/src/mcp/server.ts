import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerRpcTool } from "./handlers/rpc.js";
import { registerConfigTools } from "./handlers/config.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "jaw",
    version: "0.1.0",
  });

  registerRpcTool(server);
  registerConfigTools(server);

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
