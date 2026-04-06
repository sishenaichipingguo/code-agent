import { spawn } from 'child_process'
import type { HookEvent, HookEntry, HooksConfig, OnError } from './types'

export class HookManager {
  constructor(
    private config: HooksConfig,
    private onWarn: (msg: string) => void = (msg) => process.stderr.write(`⚠️  Hook warning: ${msg}\n`)
  ) {}

  async fire(event: HookEvent, env: Record<string, string>): Promise<void> {
    const entries = this.config[event]
    if (!entries?.length) return
    for (const entry of entries) {
      await this.run(entry, env, null)
    }
  }

  async transform<T>(event: HookEvent, payload: T, env: Record<string, string>): Promise<T> {
    const entries = this.config[event]
    if (!entries?.length) return payload
    let current = payload
    for (const entry of entries) {
      const result = await this.run(entry, env, JSON.stringify(current))
      if (result === null || !result.trim()) continue
      try {
        current = JSON.parse(result.trim())
      } catch {
        this.onWarn(`Hook for ${event} returned non-JSON stdout — ignoring`)
      }
    }
    return current
  }

  private run(entry: HookEntry, extraEnv: Record<string, string>, stdin: string | null): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const env: Record<string, string> = {
        ...(Object.fromEntries(
          Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
        )),
        AGENT_CWD: process.cwd(),
        ...extraEnv
      }

      const proc = spawn('bash', ['-c', entry.command], {
        cwd: process.cwd(),
        env,
        stdio: stdin !== null ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''
      let killed = false

      const timer = setTimeout(() => {
        killed = true
        proc.kill('SIGTERM')
        setTimeout(() => { try { proc.kill('SIGKILL') } catch { /* already gone */ } }, 3000)
      }, entry.timeout)

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

      if (stdin !== null && proc.stdin) {
        proc.stdin.write(stdin)
        proc.stdin.end()
      }

      proc.on('close', (code: number | null) => {
        clearTimeout(timer)
        if (killed) {
          this.handleError(entry.onError, entry.command, null, 'timed out')
            .then(() => resolve(null))
            .catch(reject)
          return
        }
        if (code !== 0) {
          this.handleError(entry.onError, entry.command, code, stderr.trim())
            .then(() => resolve(null))  // on warn/ignore, return null so transform keeps original
            .catch(reject)              // on abort, reject propagates the error
          return
        }
        resolve(stdout)
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        this.handleError(entry.onError, entry.command, null, err.message)
          .then(() => resolve(null))
          .catch(reject)
      })
    })
  }

  private async handleError(onError: OnError, command: string, code: number | null, stderr: string): Promise<void> {
    const msg = `Hook command failed (exit ${code}): ${command}${stderr ? ` — ${stderr}` : ''}`
    if (onError === 'ignore') return
    if (onError === 'warn') {
      this.onWarn(msg)
      return
    }
    throw new Error(msg)
  }
}

export function createHookManager(config: HooksConfig | undefined): HookManager | undefined {
  if (!config || Object.keys(config).length === 0) return undefined
  return new HookManager(config)
}
