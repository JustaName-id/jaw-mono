import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerRpcTool } from "./handlers/rpc.js";
import { registerConfigTools } from "./handlers/config.js";
import { registerDaemonTools } from "./handlers/daemon.js";
import { registerResources } from "./handlers/resources.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "jaw",
    version: "0.0.1",
  });

  registerRpcTool(server);
  registerConfigTools(server);
  registerDaemonTools(server);
  registerResources(server);

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
