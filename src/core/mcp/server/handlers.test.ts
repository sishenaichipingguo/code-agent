import { describe, it, expect, beforeAll } from 'bun:test'
import { buildListToolsHandler, buildCallToolHandler } from './handlers'
import { ToolRegistry, createTool } from '@/core/tools/registry'
import { initLogger } from '@/infra/logger'
import { loadConfig } from '@/core/config/loader'

function makeRegistry(tools: Array<{ name: string; result: any }> = []): ToolRegistry {
  const registry = new ToolRegistry()
  for (const { name, result } of tools) {
    registry.register(createTool({
      name,
      description: `${name} tool`,
      inputSchema: { type: 'object', properties: {} },
      execute: async () => result,
      checkPermissions: () => ({ type: 'allow' })
    }))
  }
  return registry
}

beforeAll(async () => {
  await loadConfig()
  initLogger({ level: 'error', file: '/dev/null' })
})

describe('buildListToolsHandler', () => {
  it('returns all tools with camelCase inputSchema', async () => {
    const registry = makeRegistry([
      { name: 'read', result: '' },
      { name: 'grep', result: '' }
    ])
    const handler = buildListToolsHandler(registry)
    const result = await handler({})
    expect(result.tools).toHaveLength(2)
    expect(result.tools[0].name).toBe('read')
    expect(result.tools[0]).toHaveProperty('inputSchema')
    expect(result.tools[0]).not.toHaveProperty('input_schema')
  })

  it('returns empty array for empty registry', async () => {
    const handler = buildListToolsHandler(makeRegistry())
    const result = await handler({})
    expect(result.tools).toHaveLength(0)
  })
})

describe('buildCallToolHandler', () => {
  it('executes a tool and returns text content', async () => {
    const registry = makeRegistry([{ name: 'echo', result: 'hello world' }])
    const handler = buildCallToolHandler(registry)
    const result = await handler({ params: { name: 'echo', arguments: {} } })
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toBe('hello world')
    expect(result.isError).toBeFalsy()
  })

  it('serializes non-string results to JSON', async () => {
    const registry = makeRegistry([{ name: 'info', result: { key: 'value' } }])
    const handler = buildCallToolHandler(registry)
    const result = await handler({ params: { name: 'info', arguments: {} } })
    expect(result.content[0].text).toBe('{"key":"value"}')
  })

  it('returns isError: true and error message for unknown tool', async () => {
    const handler = buildCallToolHandler(makeRegistry())
    const result = await handler({ params: { name: 'ghost', arguments: {} } })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Error')
  })

  it('returns isError: true when tool execution throws', async () => {
    const registry = new ToolRegistry()
    registry.register(createTool({
      name: 'broken',
      description: 'broken tool',
      inputSchema: {},
      execute: async () => { throw new Error('tool crashed') },
      checkPermissions: () => ({ type: 'allow' })
    }))
    const handler = buildCallToolHandler(registry)
    const result = await handler({ params: { name: 'broken', arguments: {} } })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('tool crashed')
  })
})
