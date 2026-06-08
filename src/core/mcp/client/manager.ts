import type { ToolRegistry } from '@/core/tools/registry'
import type { McpConfig, SdkClientLike, ClientFactory } from '../types'
import type { Logger } from '@/infra/logger'
import { createMcpTool } from './tool-wrapper'
import { createClientTransport } from './transport'

async function defaultClientFactory(
  transport: unknown
): Promise<SdkClientLike> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const client = new Client({ name: 'code-agent', version: '1.0.0' })
  await client.connect(
    transport as Parameters<InstanceType<typeof Client>['connect']>[0]
  )
  return client as unknown as SdkClientLike
}

export class McpClientManager {
  private clients: SdkClientLike[] = []

  constructor(private clientFactory: ClientFactory = defaultClientFactory) {}

  async loadTools(registry: ToolRegistry, config: McpConfig): Promise<void> {
    const servers = config.servers ?? {}
    let logger: Logger | null = null
    try {
      const { getLogger } = await import('@/infra/logger')
      logger = getLogger()
    } catch {
      /* logger not yet initialized */
    }

    for (const [serverName, serverConfig] of Object.entries(servers)) {
      try {
        const transport = await createClientTransport(serverConfig)
        const client = await this.clientFactory(transport)
        this.clients.push(client)

        const { tools } = await client.listTools()
        for (const remoteTool of tools) {
          registry.register(createMcpTool(serverName, remoteTool, client))
        }
        logger?.info(`MCP server connected: ${serverName}`, {
          tools: tools.length,
        })
        process.stderr.write(
          `MCP server "${serverName}" connected (${tools.length} tools)\n`
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger?.warn(`MCP server failed: ${serverName}`, {
          error: message,
        })
        process.stderr.write(
          `MCP server "${serverName}" failed to connect: ${message}\n`
        )
      }
    }
  }

  async disconnect(): Promise<void> {
    await Promise.all(this.clients.map(c => c.close().catch(() => {})))
    this.clients = []
  }
}
