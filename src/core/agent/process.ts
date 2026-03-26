import { spawn, ChildProcess } from 'child_process'
import type { SubAgentConfig } from './types'

export class SubAgentProcess {
  private process: ChildProcess | null = null
  private outputBuffer: string = ''

  async execute(config: SubAgentConfig, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.process = spawn('bun', ['run', 'src/core/agent/runner.ts'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          SUBAGENT_TYPE: config.type,
          SUBAGENT_PROMPT: Buffer.from(prompt).toString('base64'),
          SUBAGENT_TOOLS: JSON.stringify(config.allowedTools),
          SUBAGENT_SYSTEM: config.systemPrompt
        }
      })

      const timer = setTimeout(() => {
        this.kill()
        reject(new Error(`SubAgent timeout after ${config.timeout}ms`))
      }, config.timeout)

      this.process.stdout?.on('data', (data) => {
        this.outputBuffer += data.toString()
      })

      this.process.stderr?.on('data', (data) => {
        console.error('SubAgent stderr:', data.toString())
      })

      this.process.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) {
          try {
            const result = JSON.parse(this.outputBuffer)
            resolve(result.success ? result.result : result.error)
          } catch {
            resolve(this.outputBuffer)
          }
        } else {
          reject(new Error(`SubAgent exited with code ${code}`))
        }
      })

      this.process.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
  }

  kill() {
    if (this.process) {
      this.process.kill('SIGTERM')
      setTimeout(() => this.process?.kill('SIGKILL'), 5000)
    }
  }
}

