import { rename } from 'fs/promises'
import { createTool } from './registry'

export const MvTool = createTool({
  name: 'mv',
  description: 'Move or rename a file',
  inputSchema: {
    type: 'object',
    properties: {
      source:      { type: 'string' },
      destination: { type: 'string' }
    },
    required: ['source', 'destination']
  },
  checkPermissions: (input: unknown) => {
    const inp = input as { source?: string; destination?: string }
    return { type: 'ask' as const, description: `Move ${inp.source} → ${inp.destination}` }
  },
  preparePermissionMatcher: (input: unknown) => {
    const inp = input as { source?: string }
    if (typeof inp.source !== 'string') return null
    return { kind: 'path-glob' as const, glob: inp.source }
  },
  async execute(input: { source: string; destination: string }): Promise<string> {
    await rename(input.source, input.destination)
    return `Moved ${input.source} to ${input.destination}`
  }
})
