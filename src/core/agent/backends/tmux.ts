import { execSync } from 'child_process'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { SubAgentConfig } from '../types'
import type { SubAgentModelConfig } from '../process'
import type { AgentBackend, BackendType } from './types'

export class TmuxBackend implements AgentBackend {
  readonly name: BackendType = 'tmux'
  private paneId: string | null = null
  private tmpDir: string | null = null

  async execute(
    config: SubAgentConfig,
    prompt: string,
    modelConfig: SubAgentModelConfig
  ): Promise<string> {
    this.tmpDir = mkdtempSync(join(tmpdir(), 'agent-'))
    const resultFile = join(this.tmpDir, 'result.json')

    const env: Record<string, string> = {
      SUBAGENT_TYPE: config.type,
      SUBAGENT_PROMPT: Buffer.from(prompt).toString('base64'),
      SUBAGENT_TOOLS: JSON.stringify(config.allowedTools),
      SUBAGENT_SYSTEM: config.systemPrompt,
      SUBAGENT_PROVIDER: modelConfig.provider,
      SUBAGENT_MODEL: modelConfig.model,
      SUBAGENT_API_KEY: modelConfig.apiKey ?? '',
      SUBAGENT_BASE_URL: modelConfig.baseUrl ?? '',
      SUBAGENT_MAX_TOKENS: String(modelConfig.maxTokens ?? config.maxTokens ?? 4096),
      MEMORY_NAMESPACE: `sub-${config.type}-${Date.now()}`,
      SUBAGENT_RESULT_FILE: resultFile
    }
    const envStr = Object.entries(env)
      .map(([k, v]) => `${k}=${this.shellEscape(v)}`)
      .join(' ')

    const cmd = `${envStr} bun run src/core/agent/runner.ts > ${resultFile} 2>&1; echo $? >> ${resultFile}.exit`
    const paneOutput = execSync(
      `tmux new-window -P -F "#{pane_id}" -n "agent-${config.type}" -- bash -c ${this.shellEscape(cmd)}`
    ).toString().trim()
    this.paneId = paneOutput

    return this.waitForResult(resultFile, `${resultFile}.exit`, config.timeout)
  }

  private async waitForResult(
    resultFile: string,
    exitFile: string,
    timeout: number
  ): Promise<string> {
    const start = Date.now()

    return new Promise((resolve, reject) => {
      const poll = () => {
        if (Date.now() - start > timeout) {
          this.kill()
          reject(new Error(`TmuxBackend timeout after ${timeout}ms`))
          return
        }
        if (existsSync(exitFile)) {
          try {
            const raw = readFileSync(resultFile, 'utf-8').trim()
            const result = JSON.parse(raw)
            this.cleanup()
            resolve(result.success ? result.result : (result.error ?? 'SubAgent failed'))
          } catch {
            this.cleanup()
            resolve(readFileSync(resultFile, 'utf-8').trim() || 'SubAgent completed with no output')
          }
        } else {
          setTimeout(poll, 500)
        }
      }
      setTimeout(poll, 500)
    })
  }

  kill() {
    if (this.paneId) {
      try {
        execSync(`tmux kill-pane -t ${this.paneId}`)
      } catch { /* pane may already be gone */ }
      this.paneId = null
    }
    this.cleanup()
  }

  private cleanup() {
    if (this.tmpDir && existsSync(this.tmpDir)) {
      try { rmSync(this.tmpDir, { recursive: true }) } catch { /* ignore */ }
      this.tmpDir = null
    }
  }

  private shellEscape(s: string): string {
    return `'${s.replace(/'/g, "'\\''")}'`
  }
}
