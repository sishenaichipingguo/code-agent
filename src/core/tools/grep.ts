import { spawn } from 'child_process'
import { createTool } from './registry'
import { truncateOutput } from './output-limit'

// Directories that produce huge, useless grep output and should never be searched.
const EXCLUDED_DIRS = ['node_modules', '.git', 'dist', 'build']

export const GrepTool = createTool({
  name: 'grep',
  description: 'Search for text in files',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Text pattern to search for',
      },
      path: {
        type: 'string',
        description: 'Path to search in (default: current directory)',
      },
    },
    required: ['pattern'],
  },
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  checkPermissions: () => ({ type: 'allow' as const }),
  async execute(input: { pattern: string; path?: string }): Promise<string> {
    return new Promise((resolve, reject) => {
      const searchPath = input.path || '.'
      const excludeArgs = EXCLUDED_DIRS.map(d => `--exclude-dir=${d}`)
      const proc = spawn(
        'grep',
        ['-r', '-n', ...excludeArgs, input.pattern, searchPath],
        { cwd: process.cwd() }
      )

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', data => {
        stdout += data.toString()
      })

      proc.stderr.on('data', data => {
        stderr += data.toString()
      })

      proc.on('close', code => {
        if (code === 0) {
          resolve(truncateOutput(stdout) || 'No matches found')
        } else if (code === 1) {
          resolve('No matches found')
        } else {
          reject(new Error(`Grep failed: ${stderr}`))
        }
      })
      proc.on('error', err => reject(err))
    })
  },
})
