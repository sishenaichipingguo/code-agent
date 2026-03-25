import type { Tool } from './registry'
import { unlink } from 'fs/promises'

export class RmTool implements Tool {
  name = 'rm'
  description = 'Delete a file (requires confirmation in safe mode)'
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string' }
    },
    required: ['path']
  }

  async execute(input: { path: string }): Promise<string> {
    await unlink(input.path)
    return `Deleted ${input.path}`
  }
}
