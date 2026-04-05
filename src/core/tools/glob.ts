import { glob } from 'glob'
import { createTool } from './registry'

export const GlobTool = createTool({
  name: 'glob',
  description: 'Find files matching a pattern',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match files'
      }
    },
    required: ['pattern']
  },
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  checkPermissions: () => ({ type: 'allow' as const }),
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
})
