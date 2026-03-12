import { Command } from '@oclif/core';
import { startMcpServer } from '../../mcp/server.js';

export default class Mcp extends Command {
  static override description = 'Start the MCP server for AI agents (stdio transport)';

  static override examples = [
    '<%= config.bin %> mcp',
  ];

  async run(): Promise<void> {
    await startMcpServer();
  }
}
