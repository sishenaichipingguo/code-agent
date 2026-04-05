import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname } from 'path'
import { createTool } from './registry'

export const WriteTool = createTool({
  name: 'write',
  description: 'Write content to a file',
  inputSchema: {
    type: 'object',
    properties: {
      path:    { type: 'string', description: 'Path to the file to write' },
      content: { type: 'string', description: 'Content to write to the file' }
    },
    required: ['path', 'content']
  },
  isDestructive: (input: unknown) => {
    const inp = input as { path?: string }
    return typeof inp.path === 'string' && existsSync(inp.path)
  },
  checkPermissions: (input: unknown) => {
    const inp = input as { path?: string }
    const isOverwrite = typeof inp.path === 'string' && existsSync(inp.path)
    return {
      type: 'ask' as const,
      description: isOverwrite
        ? `Overwrite existing file: ${inp.path}`
        : `Write new file: ${inp.path}`
    }
  },
  preparePermissionMatcher: (input: unknown) => {
    const inp = input as { path?: string }
    if (typeof inp.path !== 'string') return null
    return { kind: 'path-glob' as const, glob: inp.path }
  },
  async execute(input: { path: string; content: string }): Promise<string> {
    try {
      await mkdir(dirname(input.path), { recursive: true })
      await writeFile(input.path, input.content, 'utf-8')
      return `File written: ${input.path}`
    } catch (error: any) {
      throw new Error(`Failed to write file: ${error.message}`)
    }
  }
})
