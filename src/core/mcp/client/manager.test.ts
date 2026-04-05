import { describe, it, expect, mock } from 'bun:test'
import { McpClientManager } from './manager'
import { ToolRegistry } from '@/core/tools/registry'
import type { McpConfig, SdkClientLike } from '../types'

function makeRegistry(): ToolRegistry {
  return new ToolRegistry()
}

function makeClient(toolNames: string[]): SdkClientLike {
  return {
    connect: mock(async () => {}),
    listTools: mock(async () => ({
      tools: toolNames.map(name => ({ name, description: `${name} tool` }))
    })),
    callTool: mock(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
    close: mock(async () => {})
  }
}

describe('McpClientManager', () => {
  it('registers wrapped tools from a stdio server', async () => {
    const mockClient = makeClient(['get_file', 'list_dir'])
    const factory = mock(async () => mockClient)
    const manager = new McpClientManager(factory)
    const registry = makeRegistry()

    await manager.loadTools(registry, {
      servers: {
        myfs: { type: 'stdio', command: 'npx', args: ['some-server'] }
      }
    })

    expect(registry.get('myfs__get_file')).toBeDefined()
    expect(registry.get('myfs__list_dir')).toBeDefined()
  })

  it('skips a server that fails and does not throw', async () => {
    const factory = mock(async () => { throw new Error('connection refused') })
    const manager = new McpClientManager(factory)
    const registry = makeRegistry()

    // verify loadTools does not reject when a server fails to connect
    await manager.loadTools(registry, {
      servers: { failing: { type: 'stdio', command: 'bad', args: [] } }
    })

    expect(registry.get('failing__anything')).toBeUndefined()
  })

  it('loads tools from multiple servers independently', async () => {
    let callCount = 0
    const factory = mock(async () => {
      callCount++
      return makeClient(callCount === 1 ? ['tool_a', 'tool_b'] : ['tool_c'])
    })
    const manager = new McpClientManager(factory)
    const registry = makeRegistry()

    await manager.loadTools(registry, {
      servers: {
        serverA: { type: 'stdio', command: 'a', args: [] },
        serverB: { type: 'http', url: 'http://localhost:3000/sse' }
      }
    })

    expect(registry.get('serverA__tool_a')).toBeDefined()
    expect(registry.get('serverA__tool_b')).toBeDefined()
    expect(registry.get('serverB__tool_c')).toBeDefined()
  })

  it('disconnect closes all active clients', async () => {
    const client1 = makeClient(['tool1'])
    const client2 = makeClient(['tool2'])
    let callCount = 0
    const factory = mock(async () => {
      callCount++
      return callCount === 1 ? client1 : client2
    })
    const manager = new McpClientManager(factory)
    const registry = makeRegistry()

    await manager.loadTools(registry, {
      servers: {
        s1: { type: 'stdio', command: 'a', args: [] },
        s2: { type: 'stdio', command: 'b', args: [] }
      }
    })

    await manager.disconnect()
    expect(client1.close).toHaveBeenCalled()
    expect(client2.close).toHaveBeenCalled()
  })
})
