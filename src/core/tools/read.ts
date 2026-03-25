import type { Tool } from './registry'
import { readFile } from 'fs/promises'

export class ReadTool implements Tool {
  name = 'read'
  description = 'Read the contents of a file'
  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read'
      }
    },
    required: ['path']
  }

  async execute(input: { path: string }): Promise<string> {
    try {
      const content = await readFile(input.path, 'utf-8')
      return content
    } catch (error: any) {
      throw new Error(`Failed to read file: ${error.message}`)
    }
  }
}
