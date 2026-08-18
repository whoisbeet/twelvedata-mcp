import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { callTool, toolDefs } from './core.js';

export const sessions = new Map<string, SSEServerTransport>();

export function createServer() {
  const server = new Server(
    { name: 'twelvedata-mcp', version: '4.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefs as any }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    try {
      const data = await callTool(
        name,
        args as Record<string, unknown>,
        { env: process.env }
      );
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error instanceof Error ? error.message : 'Tool failed' }]
      };
    }
  });
  return server;
}
