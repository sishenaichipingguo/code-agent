import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { SubAgentConfig } from '../types'
import type { SubAgentModelConfig } from '../process'
import type { AgentBackend, BackendType } from './types'

export class ITerm2Backend implements AgentBackend {
  readonly name: BackendType = 'iterm2'
  private tmpDir: string | null = null

  async execute(
    config: SubAgentConfig,
    prompt: string,
    modelConfig: SubAgentModelConfig
  ): Promise<string> {
    if (process.platform !== 'darwin') {
      throw new Error('ITerm2Backend is only supported on macOS')
    }

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
    }
    const envStr = Object.entries(env)
      .map(([k, v]) => `${k}=${this.shellEscape(v)}`)
      .join(' ')

    const cmd = `${envStr} bun run src/core/agent/runner.ts > ${resultFile} 2>&1; touch ${resultFile}.done`

    // Write the command to a temporary shell script to avoid AppleScript string injection
    const scriptFile = join(this.tmpDir, 'run.sh')
    writeFileSync(scriptFile, `#!/bin/bash\n${cmd}`, { mode: 0o755 })

    // AppleScript only passes the file path (no user data embedded in string literal)
    const script = `
      tell application "iTerm2"
        tell current window
          create tab with default profile
          tell current session of current tab
            write text "bash ${scriptFile}"
          end tell
        end tell
      end tell
    `
    try {
      execFileSync('osascript', ['-e', script])
    } catch (err) {
      this.cleanup()
      throw err
    }

    return this.waitForResult(resultFile, `${resultFile}.done`, config.timeout)
  }

  private async waitForResult(
    resultFile: string,
    doneFile: string,
    timeout: number
  ): Promise<string> {
    const start = Date.now()
    return new Promise((resolve, reject) => {
      const poll = () => {
        if (Date.now() - start > timeout) {
          this.kill()
          reject(new Error(`ITerm2Backend timeout after ${timeout}ms`))
          return
        }
        if (existsSync(doneFile)) {
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
