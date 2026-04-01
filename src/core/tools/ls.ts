import type { Tool } from './registry'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'

export class LsTool implements Tool {
  name = 'ls'
  description = 'List files and directories'
  readonly = true
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path (default: current)' },
      detailed: { type: 'boolean', description: 'Show detailed info' }
    }
  }

  async execute(input: { path?: string; detailed?: boolean }): Promise<string> {
    const dirPath = input.path || '.'
    const files = await readdir(dirPath)

    if (!input.detailed) {
      return files.join('\n')
    }

    const details = await Promise.all(
      files.map(async (file) => {
        const filePath = join(dirPath, file)
        const stats = await stat(filePath)
        const type = stats.isDirectory() ? 'd' : 'f'
        const size = stats.size
        return `${type} ${file.padEnd(30)} ${size} bytes`
      })
    )

    return details.join('\n')
  }
}
