import type { Tool } from './registry'
import { spawn } from 'child_process'

export class BashTool implements Tool {
  name = 'bash'
  description = 'Execute a shell command and return the output'
  inputSchema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute'
      }
    },
    required: ['command']
  }

  async execute(input: { command: string }): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('bash', ['-c', input.command], {
        cwd: process.cwd(),
        env: process.env
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
        if (code !== 0) {
          reject(new Error(`Command failed with code ${code}\n${stderr}`))
        } else {
          resolve(stdout || stderr || 'Command completed')
        }
      })

      proc.on('error', (error) => {
        reject(error)
      })
    })
  }
}
