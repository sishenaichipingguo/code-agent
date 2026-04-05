import { unlink } from 'fs/promises'
import { createTool } from './registry'

export const RmTool = createTool({
  name: 'rm',
  description: 'Delete a file',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path']
  },
  isDestructive: () => true,
  checkPermissions: (input: unknown) => {
    const inp = input as { path?: string }
    return { type: 'ask' as const, description: `Permanently delete: ${inp.path}` }
  },
  preparePermissionMatcher: (input: unknown) => {
    const inp = input as { path?: string }
    if (typeof inp.path !== 'string') return null
    return { kind: 'path-glob' as const, glob: inp.path }
  },
  async execute(input: { path: string }): Promise<string> {
    await unlink(input.path)
    return `Deleted ${input.path}`
  }
})
