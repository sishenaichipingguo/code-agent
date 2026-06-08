// Returns an SDK-compatible server transport from config.
// Uses dynamic imports to keep startup fast.

import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

export async function connectStdioServerTransport(
  server: Server
): Promise<void> {
  const { StdioServerTransport } =
    await import('@modelcontextprotocol/sdk/server/stdio.js')
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('MCP server running on stdio\n')
  // process stays alive because stdin is open
}

export async function connectHttpServerTransport(
  server: Server,
  port: number
): Promise<void> {
  const { SSEServerTransport } =
    await import('@modelcontextprotocol/sdk/server/sse.js')
  const { createServer } = await import('node:http')

  const transports = new Map<string, SSEServerTransport>()

  const httpServer = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method === 'GET' && req.url === '/sse') {
        const transport = new SSEServerTransport('/messages', res)
        transports.set(transport.sessionId, transport)
        res.on('close', () => transports.delete(transport.sessionId))
        await server.connect(transport)
      } else if (req.method === 'POST' && req.url?.startsWith('/messages')) {
        const url = new URL(req.url, `http://localhost:${port}`)
        const sessionId = url.searchParams.get('sessionId')
        const t = sessionId ? transports.get(sessionId) : null
        if (t) {
          await t.handlePostMessage(req, res)
        } else {
          res.writeHead(404).end()
        }
      } else {
        res.writeHead(404).end()
      }
    }
  )

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, () => {
      process.stderr.write(
        `MCP server running on http://localhost:${port}/sse\n`
      )
      resolve()
    })
    httpServer.on('error', reject)
  })
  // httpServer.listen keeps the event loop alive
}
