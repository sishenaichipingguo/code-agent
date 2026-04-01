import type { Tool } from './registry'
import { spawn } from 'child_process'

export class GrepTool implements Tool {
  name = 'grep'
  description = 'Search for text in files'
  readonly = true
  inputSchema = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Text pattern to search for'
      },
      path: {
        type: 'string',
        description: 'Path to search in (default: current directory)'
      }
    },
    required: ['pattern']
  }

  async execute(input: { pattern: string; path?: string }): Promise<string> {
    return new Promise((resolve, reject) => {
      const searchPath = input.path || '.'
      const proc = spawn('grep', ['-r', '-n', input.pattern, searchPath], {
        cwd: process.cwd()
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout || 'No matches found')
        } else if (code === 1) {
          resolve('No matches found')
        } else {
          reject(new Error(`Grep failed: ${stderr}`))
        }
      })
    })
  }
}
