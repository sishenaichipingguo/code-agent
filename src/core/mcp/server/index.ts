import type { Config } from '@/core/config/schema'
import type { ToolRegistry } from '@/core/tools/registry'
import { buildListToolsHandler, buildCallToolHandler } from './handlers'
import { connectStdioServerTransport, connectHttpServerTransport } from './transport'

export async function startMcpServer(config: Config, registry: ToolRegistry): Promise<void> {
  const expose = config.mcp?.expose
  if (!expose) {
    throw new Error('MCP server requires mcp.expose to be configured in .agent.yml')
  }

  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js')
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js')

  const restricted = registry.createRestricted(expose.tools)

  const server = new Server(
    { name: 'code-agent', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, buildListToolsHandler(restricted))
  server.setRequestHandler(CallToolRequestSchema, buildCallToolHandler(restricted))

  if (expose.transport === 'stdio') {
    await connectStdioServerTransport(server)
  } else {
    await connectHttpServerTransport(server, expose.port)
  }
}
