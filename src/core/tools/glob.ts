import type { Tool } from './registry'
import { glob } from 'glob'

export class GlobTool implements Tool {
  name = 'glob'
  description = 'Find files matching a pattern'
  readonly = true
  inputSchema = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match files'
      }
    },
    required: ['pattern']
  }

  async execute(input: { pattern: string }): Promise<string> {
    try {
      const files = await glob(input.pattern, {
        cwd: process.cwd(),
        ignore: ['node_modules/**', '.git/**']
      })

      return files.join('\n') || 'No files found'
    } catch (error: any) {
      throw new Error(`Glob failed: ${error.message}`)
    }
  }
}
