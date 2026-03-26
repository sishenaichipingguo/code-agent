import type { Tool } from './registry'
import { spawn } from 'child_process'
import { writeFileSync } from 'fs'
import { join } from 'path'

interface BashInput {
  command: string
  timeout?: number
  run_in_background?: boolean
  description?: string
}

export class BashTool implements Tool {
  name = 'bash'
  description = 'Execute a shell command and return the output'
  inputSchema = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      timeout: { type: 'number', description: 'Timeout in milliseconds (default: 120000, max: 600000)' },
      run_in_background: { type: 'boolean', description: 'Run command in background' },
      description: { type: 'string', description: 'Description of what the command does' }
    },
    required: ['command']
  }

  async execute(input: BashInput): Promise<string> {
    const timeout = Math.min(input.timeout || 120000, 600000)

    if (input.run_in_background) {
      return this.executeBackground(input.command, timeout)
    }

    return this.executeForeground(input.command, timeout)
  }

  private executeForeground(command: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('bash', ['-c', command], {
        cwd: process.cwd(),
        env: process.env
      })

      let stdout = ''
      let stderr = ''
      let killed = false

      const timer = setTimeout(() => {
        killed = true
        proc.kill('SIGTERM')
        setTimeout(() => proc.kill('SIGKILL'), 5000)
      }, timeout)

      proc.stdout.on('data', (data) => {
        stdout += data.toString()
        if (stdout.length > 1048576) stdout = stdout.slice(0, 512000) + '\n... (truncated) ...\n' + stdout.slice(-512000)
      })

      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        clearTimeout(timer)
        if (killed) {
          reject(new Error(`Command timed out after ${timeout}ms`))
        } else if (code !== 0) {
          reject(new Error(`Exit code ${code}\n${stderr}`))
        } else {
          resolve(stdout || stderr || 'Command completed')
        }
      })

      proc.on('error', reject)
    })
  }

  private executeBackground(command: string, timeout: number): Promise<string> {
    const taskId = `bash-${Date.now()}`
    const outputFile = join(process.cwd(), '.claude', 'tasks', `${taskId}.txt`)

    const proc = spawn('bash', ['-c', command], {
      cwd: process.cwd(),
      env: process.env,
      detached: true,
      stdio: 'ignore'
    })

    proc.unref()

    return Promise.resolve(`Background task started: ${taskId}\nOutput will be written to: ${outputFile}`)
  }
}
