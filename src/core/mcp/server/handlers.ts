import type { ToolRegistry } from '@/core/tools/registry'
import type { PermissionContext } from '@/core/permissions'

const BYPASS_CTX: PermissionContext = { mode: 'bypass', allowRules: [], strippedRules: [] }

export function buildListToolsHandler(registry: ToolRegistry) {
  return async (_request: unknown) => {
    const tools = registry.toSchema().map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.input_schema
    }))
    return { tools }
  }
}

export function buildCallToolHandler(registry: ToolRegistry) {
  return async (request: { params: { name: string; arguments?: unknown } }) => {
    const { name, arguments: args } = request.params
    try {
      const result = await registry.execute(name, args ?? {}, BYPASS_CTX)
      const text = typeof result === 'string' ? result : JSON.stringify(result)
      return { content: [{ type: 'text' as const, text }] }
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
        isError: true
      }
    }
  }
}
