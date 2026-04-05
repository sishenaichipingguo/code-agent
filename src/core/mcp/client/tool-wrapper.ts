import { createTool } from '@/core/tools/registry'
import type { Tool } from '@/core/tools/registry'
import type { McpToolDefinition, SdkClientLike } from '../types'

export function createMcpTool(
  serverName: string,
  remoteTool: McpToolDefinition,
  client: SdkClientLike
): Tool {
  return createTool({
    name: `${serverName}__${remoteTool.name}`,
    description: remoteTool.description ?? `MCP tool from server: ${serverName}`,
    inputSchema: remoteTool.inputSchema ?? { type: 'object', properties: {} },
    isConcurrencySafe: () => false,
    isReadOnly: () => false,
    isDestructive: () => false,
    checkPermissions: () => ({
      type: 'ask',
      description: `Call external MCP tool: ${serverName}/${remoteTool.name}`
    }),
    preparePermissionMatcher: () => null,
    async execute(input: unknown) {
      const result = await client.callTool({ name: remoteTool.name, arguments: input })
      if (result.isError) {
        const errText = result.content
          .filter(c => c.type === 'text' && c.text)
          .map(c => c.text!)
          .join('\n')
        throw new Error(errText || 'MCP tool returned an error')
      }
      const texts = result.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && typeof c.text === 'string')
        .map(c => c.text)
      return texts.length > 0 ? texts.join('\n') : 'Tool executed successfully'
    }
  })
}
