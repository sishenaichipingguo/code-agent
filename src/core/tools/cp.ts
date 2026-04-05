import { copyFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import { createTool } from './registry'

export const CpTool = createTool({
  name: 'cp',
  description: 'Copy a file',
  inputSchema: {
    type: 'object',
    properties: {
      source:      { type: 'string' },
      destination: { type: 'string' }
    },
    required: ['source', 'destination']
  },
  checkPermissions: () => ({ type: 'allow' as const }),
  async execute(input: { source: string; destination: string }): Promise<string> {
    await mkdir(dirname(input.destination), { recursive: true })
    await copyFile(input.source, input.destination)
    return `Copied ${input.source} to ${input.destination}`
  }
})
