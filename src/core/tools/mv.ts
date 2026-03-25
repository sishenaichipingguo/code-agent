import type { Tool } from './registry'
import { rename } from 'fs/promises'

export class MvTool implements Tool {
  name = 'mv'
  description = 'Move or rename a file'
  inputSchema = {
    type: 'object',
    properties: {
      source: { type: 'string' },
      destination: { type: 'string' }
    },
    required: ['source', 'destination']
  }

  async execute(input: { source: string; destination: string }): Promise<string> {
    await rename(input.source, input.destination)
    return `Moved ${input.source} to ${input.destination}`
  }
}
