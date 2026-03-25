import type { Tool } from './registry'
import { copyFile } from 'fs/promises'

export class CpTool implements Tool {
  name = 'cp'
  description = 'Copy a file'
  inputSchema = {
    type: 'object',
    properties: {
      source: { type: 'string' },
      destination: { type: 'string' }
    },
    required: ['source', 'destination']
  }

  async execute(input: { source: string; destination: string }): Promise<string> {
    await copyFile(input.source, input.destination)
    return `Copied ${input.source} to ${input.destination}`
  }
}
