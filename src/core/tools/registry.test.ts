import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { ToolRegistry, createTool } from './registry'
import type { Tool } from './registry'
import type { PermissionContext } from '@/core/permissions'
import { initLogger } from '@/infra/logger'
import { loadConfig } from '@/core/config/loader'

// Bootstrap singletons required by registry.execute
async function bootstrap() {
  await loadConfig()
  initLogger({ level: 'error', file: '/dev/null' })
}

const BYPASS: PermissionContext = { mode: 'bypass', allowRules: [], strippedRules: [] }
const DEFAULT: PermissionContext = { mode: 'default', allowRules: [], strippedRules: [] }

function makeTool(name: string, result: any = 'ok'): Tool {
  return createTool({
    name,
    description: `${name} tool`,
    inputSchema: {},
    execute: mock(async (_input: any) => result),
    checkPermissions: () => ({ type: 'allow' }),
  })
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry

  beforeEach(async () => {
    await bootstrap()
    registry = new ToolRegistry()
  })

  describe('register / get', () => {
    it('registers and retrieves a tool by name', () => {
      const tool = makeTool('read')
      registry.register(tool)
      expect(registry.get('read')).toBe(tool)
    })

    it('returns undefined for unknown tool', () => {
      expect(registry.get('nonexistent')).toBeUndefined()
    })

    it('overwrites a tool registered with the same name', () => {
      const t1 = makeTool('read')
      const t2 = makeTool('read')
      registry.register(t1)
      registry.register(t2)
      expect(registry.get('read')).toBe(t2)
    })
  })

  describe('toSchema', () => {
    it('returns array of tool schemas', () => {
      registry.register(makeTool('bash'))
      registry.register(makeTool('read'))
      const schema = registry.toSchema()
      expect(schema).toHaveLength(2)
      expect(schema[0]).toHaveProperty('name')
      expect(schema[0]).toHaveProperty('description')
      expect(schema[0]).toHaveProperty('input_schema')
    })

    it('returns empty array when no tools registered', () => {
      expect(registry.toSchema()).toEqual([])
    })
  })

  describe('createRestricted', () => {
    it('creates a registry with only allowed tools', () => {
      registry.register(makeTool('bash'))
      registry.register(makeTool('read'))
      registry.register(makeTool('write'))

      const restricted = registry.createRestricted(['bash', 'read'])
      expect(restricted.get('bash')).toBeDefined()
      expect(restricted.get('read')).toBeDefined()
      expect(restricted.get('write')).toBeUndefined()
    })

    it('ignores names not in the parent registry', () => {
      registry.register(makeTool('bash'))
      const restricted = registry.createRestricted(['bash', 'nonexistent'])
      expect(restricted.toSchema()).toHaveLength(1)
    })
  })

  describe('execute', () => {
    it('executes a registered tool in bypass mode', async () => {
      const tool = makeTool('read', 'file contents')
      registry.register(tool)
      const result = await registry.execute('read', { path: 'foo.ts' }, BYPASS)
      expect(result).toBe('file contents')
    })

    it('throws AgentError with TOOL_NOT_FOUND for unknown tool', async () => {
      await expect(registry.execute('ghost', {}, BYPASS)).rejects.toMatchObject({
        code: 'TOOL_NOT_FOUND'
      })
    })

    it('throws PERMISSION_DENIED when tool returns deny', async () => {
      const tool = createTool({
        name: 'restricted',
        description: 'restricted',
        inputSchema: {},
        execute: async () => 'ok',
        checkPermissions: () => ({ type: 'deny', reason: 'not allowed' })
      })
      registry.register(tool)
      await expect(registry.execute('restricted', {}, DEFAULT)).rejects.toMatchObject({
        code: 'PERMISSION_DENIED'
      })
    })

    it('wraps unexpected errors in AgentError with TOOL_EXECUTION_FAILED', async () => {
      const tool = createTool({
        name: 'broken',
        description: 'broken',
        inputSchema: {},
        execute: async () => { throw new Error('unexpected crash') },
        checkPermissions: () => ({ type: 'allow' })
      })
      registry.register(tool)
      await expect(registry.execute('broken', {}, BYPASS)).rejects.toMatchObject({
        code: 'TOOL_EXECUTION_FAILED'
      })
    })

    it('re-throws AgentError as-is', async () => {
      const { AgentError, ErrorCode } = await import('@/infra/errors')
      const tool = createTool({
        name: 'failing',
        description: 'failing',
        inputSchema: {},
        execute: async () => {
          throw new AgentError(ErrorCode.PERMISSION_DENIED, 'denied')
        },
        checkPermissions: () => ({ type: 'allow' })
      })
      registry.register(tool)
      await expect(registry.execute('failing', {}, BYPASS)).rejects.toMatchObject({
        code: 'PERMISSION_DENIED'
      })
    })

    it('executes slow tool that completes within default timeout', async () => {
      const slow = createTool({
        name: 'slow',
        description: 'slow',
        inputSchema: {},
        execute: () => new Promise(resolve => setTimeout(() => resolve('done'), 500)),
        checkPermissions: () => ({ type: 'allow' })
      })
      registry.register(slow)
      const result = await registry.execute('slow', {}, BYPASS)
      expect(result).toBe('done')
    }, 2000)
  })
})
