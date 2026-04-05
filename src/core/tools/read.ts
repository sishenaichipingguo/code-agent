import { readFile } from 'fs/promises'
import { createTool } from './registry'

export const ReadTool = createTool({
  name: 'read',
  description: 'Read file contents with line numbers',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      offset: { type: 'number', description: 'Start line (0-indexed)' },
      limit: { type: 'number', description: 'Max lines to read' }
    },
    required: ['path']
  },
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  checkPermissions: () => ({ type: 'allow' as const }),
  async execute(input: { path: string; offset?: number; limit?: number }): Promise<string> {
    try {
      const content = await readFile(input.path, 'utf-8')
      const lines = content.split('\n')

      const start = input.offset || 0
      const end = input.limit ? start + input.limit : lines.length
      const selectedLines = lines.slice(start, end)

      const numbered = selectedLines.map((line, i) =>
        `${String(start + i + 1).padStart(5)}→${line}`
      ).join('\n')

      return numbered
    } catch (error: any) {
      throw new Error(`Failed to read file: ${error.message}`)
    }
  }
})
