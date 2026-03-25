import type { Tool } from './registry'
import { writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'

export class WriteTool implements Tool {
  name = 'write'
  description = 'Write content to a file'
  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write'
      },
      content: {
        type: 'string',
        description: 'Content to write to the file'
      }
    },
    required: ['path', 'content']
  }

  async execute(input: { path: string; content: string }): Promise<string> {
    try {
      // Ensure directory exists
      await mkdir(dirname(input.path), { recursive: true })

      // Write file
      await writeFile(input.path, input.content, 'utf-8')

      return `File written: ${input.path}`
    } catch (error: any) {
      throw new Error(`Failed to write file: ${error.message}`)
    }
  }
}
