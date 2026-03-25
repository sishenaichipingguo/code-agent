import type { Tool } from './registry'
import { readFile, writeFile } from 'fs/promises'

export class EditTool implements Tool {
  name = 'edit'
  description = 'Edit a file by replacing old text with new text'
  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit'
      },
      old_text: {
        type: 'string',
        description: 'Text to replace'
      },
      new_text: {
        type: 'string',
        description: 'New text to insert'
      }
    },
    required: ['path', 'old_text', 'new_text']
  }

  async execute(input: { path: string; old_text: string; new_text: string }): Promise<string> {
    try {
      const content = await readFile(input.path, 'utf-8')

      if (!content.includes(input.old_text)) {
        throw new Error('Old text not found in file')
      }

      const newContent = content.replace(input.old_text, input.new_text)
      await writeFile(input.path, newContent, 'utf-8')

      return `File edited: ${input.path}`
    } catch (error: any) {
      throw new Error(`Failed to edit file: ${error.message}`)
    }
  }
}
