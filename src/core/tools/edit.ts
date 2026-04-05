import { readFile, writeFile } from 'fs/promises'
import { createTool } from './registry'

export const EditTool = createTool({
  name: 'edit',
  description: 'Edit a file by replacing old text with new text',
  inputSchema: {
    type: 'object',
    properties: {
      path:     { type: 'string' },
      old_text: { type: 'string', description: 'Text to replace' },
      new_text: { type: 'string', description: 'New text to insert' }
    },
    required: ['path', 'old_text', 'new_text']
  },
  checkPermissions: (input: unknown) => {
    const inp = input as { path?: string }
    return { type: 'ask' as const, description: `Edit file: ${inp.path}` }
  },
  preparePermissionMatcher: (input: unknown) => {
    const inp = input as { path?: string }
    if (typeof inp.path !== 'string') return null
    return { kind: 'path-glob' as const, glob: inp.path }
  },
  async execute(input: { path: string; old_text: string; new_text: string }): Promise<string> {
    try {
      const content = await readFile(input.path, 'utf-8')
      if (!content.includes(input.old_text)) throw new Error('Old text not found in file')
      await writeFile(input.path, content.replace(input.old_text, input.new_text), 'utf-8')
      return `File edited: ${input.path}`
    } catch (error: any) {
      throw new Error(`Failed to edit file: ${error.message}`)
    }
  }
})
