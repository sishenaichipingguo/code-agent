import { describe, it, expect, mock } from 'bun:test'
import { createMcpTool } from './tool-wrapper'
import type { McpToolDefinition, SdkClientLike } from '../types'

function makeMockClient(callResult: string): SdkClientLike {
  return {
    connect: mock(async () => {}),
    listTools: mock(async () => ({ tools: [] })),
    callTool: mock(async () => ({
      content: [{ type: 'text', text: callResult }]
    })),
    close: mock(async () => {})
  }
}

describe('createMcpTool', () => {
  it('prefixes tool name with server name using double underscore', () => {
    const tool = createMcpTool('myserver', { name: 'get_file' }, makeMockClient('ok'))
    expect(tool.name).toBe('myserver__get_file')
  })

  it('uses remote tool description', () => {
    const tool = createMcpTool('myserver', { name: 'get_file', description: 'Read a file' }, makeMockClient('ok'))
    expect(tool.description).toBe('Read a file')
  })

  it('falls back to generated description when none provided', () => {
    const tool = createMcpTool('myserver', { name: 'get_file' }, makeMockClient('ok'))
    expect(tool.description).toContain('myserver')
  })

  it('checkPermissions returns ask with server and tool name in description', () => {
    const tool = createMcpTool('myserver', { name: 'get_file' }, makeMockClient('ok'))
    const ctx = { mode: 'default' as const, allowRules: [], strippedRules: [] }
    const result = tool.checkPermissions({}, ctx)
    expect(result.type).toBe('ask')
    if (result.type === 'ask') {
      expect(result.description).toContain('myserver')
      expect(result.description).toContain('get_file')
    }
  })

  it('isConcurrencySafe returns false', () => {
    const tool = createMcpTool('myserver', { name: 'do_thing' }, makeMockClient('ok'))
    expect(tool.isConcurrencySafe({})).toBe(false)
  })

  it('execute delegates to client.callTool with original tool name (no prefix)', async () => {
    const client = makeMockClient('result text')
    const tool = createMcpTool('myserver', { name: 'do_thing' }, client)
    await tool.execute({ foo: 'bar' })
    expect(client.callTool).toHaveBeenCalledWith({
      name: 'do_thing',
      arguments: { foo: 'bar' }
    })
  })

  it('execute returns text content from result', async () => {
    const client = makeMockClient('result text')
    const tool = createMcpTool('myserver', { name: 'do_thing' }, client)
    const result = await tool.execute({})
    expect(result).toBe('result text')
  })

  it('execute joins multiple text content items with newline', async () => {
    const client: SdkClientLike = {
      ...makeMockClient(''),
      callTool: mock(async () => ({
        content: [
          { type: 'text', text: 'line 1' },
          { type: 'text', text: 'line 2' }
        ]
      }))
    }
    const tool = createMcpTool('myserver', { name: 'do_thing' }, client)
    expect(await tool.execute({})).toBe('line 1\nline 2')
  })

  it('execute returns fallback message when no text content', async () => {
    const client: SdkClientLike = {
      ...makeMockClient(''),
      callTool: mock(async () => ({
        content: [{ type: 'image', url: 'http://example.com/img.png' }]
      }))
    }
    const tool = createMcpTool('myserver', { name: 'do_thing' }, client)
    expect(await tool.execute({})).toBe('Tool executed successfully')
  })

  it('execute throws when isError is true in response', async () => {
    const client: SdkClientLike = {
      ...makeMockClient(''),
      callTool: mock(async () => ({
        content: [{ type: 'text', text: 'something went wrong' }],
        isError: true
      }))
    }
    const tool = createMcpTool('myserver', { name: 'do_thing' }, client)
    await expect(tool.execute({})).rejects.toThrow('something went wrong')
  })
})
