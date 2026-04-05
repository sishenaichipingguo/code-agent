import type { McpServerConfig } from '../types'

/**
 * Creates an SDK-compatible client transport from config.
 * Uses dynamic imports to keep startup fast.
 */
export async function createClientTransport(config: McpServerConfig): Promise<unknown> {
  if (config.type === 'stdio') {
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env
    })
  }

  const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js')
  return new SSEClientTransport(
    new URL(config.url),
    config.headers ? { requestInit: { headers: config.headers } } : undefined
  )
}
