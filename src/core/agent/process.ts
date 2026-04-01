import { spawn, ChildProcess } from 'child_process'
import type { SubAgentConfig } from './types'

export interface SubAgentModelConfig {
  provider: string
  model: string
  apiKey?: string
  baseUrl?: string
  maxTokens?: number
}

export class SubAgentProcess {
  private process: ChildProcess | null = null
  private outputBuffer: string = ''

  async execute(config: SubAgentConfig, prompt: string, modelConfig: SubAgentModelConfig): Promise<string> {
    return new Promise((resolve, reject) => {
      this.process = spawn('bun', ['run', 'src/core/agent/runner.ts'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          SUBAGENT_TYPE: config.type,
          SUBAGENT_PROMPT: Buffer.from(prompt).toString('base64'),
          SUBAGENT_TOOLS: JSON.stringify(config.allowedTools),
          SUBAGENT_SYSTEM: config.systemPrompt,
          // Model configuration
          SUBAGENT_PROVIDER: modelConfig.provider,
          SUBAGENT_MODEL: modelConfig.model,
          SUBAGENT_API_KEY: modelConfig.apiKey ?? '',
          SUBAGENT_BASE_URL: modelConfig.baseUrl ?? '',
          SUBAGENT_MAX_TOKENS: String(modelConfig.maxTokens ?? config.maxTokens ?? 4096)
        }
      })

      const timer = setTimeout(() => {
        this.kill()
        reject(new Error(`SubAgent timeout after ${config.timeout}ms`))
      }, config.timeout)

      // stdout: only the final JSON result
      this.process.stdout?.on('data', (data) => {
        this.outputBuffer += data.toString()
      })

      // stderr: subagent diagnostic output — forward to parent stderr
      this.process.stderr?.on('data', (data) => {
        process.stderr.write(data)
      })

      this.process.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0 || this.outputBuffer.trim()) {
          try {
            const result = JSON.parse(this.outputBuffer.trim())
            resolve(result.success ? result.result : (result.error ?? 'SubAgent failed'))
          } catch {
            resolve(this.outputBuffer.trim() || 'SubAgent completed with no output')
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
