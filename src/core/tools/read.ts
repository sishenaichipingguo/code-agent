import { readFile } from 'fs/promises'
import { createTool } from './registry'
import {
  DEFAULT_READ_LINES,
  MAX_OUTPUT_CHARS,
  truncateLine,
  truncateOutput,
} from './output-limit'

export const ReadTool = createTool({
  name: 'read',
  description: 'Read file contents with line numbers',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      offset: { type: 'number', description: 'Start line (0-indexed)' },
      limit: { type: 'number', description: 'Max lines to read' },
    },
    required: ['path'],
  },
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  checkPermissions: () => ({ type: 'allow' as const }),
  async execute(input: {
    path: string
    offset?: number
    limit?: number
  }): Promise<string> {
    try {
      const content = await readFile(input.path, 'utf-8')
      const lines = content.split('\n')

      const start = input.offset || 0
      // Cap output when no explicit limit is given so reading a huge file
      // cannot blow the context window in a single call.
      const limit = input.limit ?? DEFAULT_READ_LINES
      const end = Math.min(start + limit, lines.length)
      const selectedLines = lines.slice(start, end)

      const numbered = selectedLines
        .map(
          (line, i) =>
            `${String(start + i + 1).padStart(5)}→${truncateLine(line)}`
        )
        .join('\n')

      const remaining = lines.length - end
      const notice =
        remaining > 0
          ? `\n... [${remaining} more lines — read again with offset=${end} to continue]`
          : ''

      return truncateOutput(numbered + notice, MAX_OUTPUT_CHARS)
    } catch (error: any) {
      throw new Error(`Failed to read file: ${error.message}`)
    }
  },
})
