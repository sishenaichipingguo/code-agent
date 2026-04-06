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
      const stdout = await this.run(entry, env, JSON.stringify(current))
      if (!stdout?.trim()) continue
      try {
        current = JSON.parse(stdout.trim())
      } catch {
        this.onWarn(`Hook for ${event} returned non-JSON stdout — ignoring`)
      }
    }
    return current
  }

  private async run(entry: HookEntry, extraEnv: Record<string, string>, stdin: string | null): Promise<string | null> {
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      AGENT_CWD: process.cwd(),
      ...extraEnv
    }

    const stdinValue = stdin !== null ? Buffer.from(stdin) : undefined

    const proc = Bun.spawn(['bash', '-c', entry.command], {
      env,
      stdin: stdinValue ?? 'ignore',
      stdout: 'pipe',
      stderr: 'pipe'
    })

    const timeoutHandle = setTimeout(() => {
      try { proc.kill() } catch { /* already exited */ }
    }, entry.timeout)

    let stdout = ''
    let exitCode: number | null = null

    try {
      stdout = await new Response(proc.stdout).text()
      exitCode = await proc.exited
    } finally {
      clearTimeout(timeoutHandle)
    }

    if (exitCode !== 0) {
      const errText = await new Response(proc.stderr).text()
      await this.handleError(entry.onError, entry.command, exitCode, errText.trim())
    }

    return stdout
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
