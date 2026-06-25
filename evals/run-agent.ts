// Runs the agent as a real subprocess (exactly how a user runs it) and scrapes
// cost/effort signals from its stderr summary. We treat the agent as a black
// box: in goes a prompt + workspace, out comes files, stdout, and metrics.

import { spawn } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type { RunMetrics } from './types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const CLI_PATH = join(PROJECT_ROOT, 'src/cli/index.ts')

const DEFAULT_TIMEOUT_MS = 150_000
const SIGKILL_GRACE_MS = 5_000

export interface AgentRun {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  metrics: RunMetrics
}

// The CLI prints a token summary and a perf summary to stderr on exit. We parse
// those instead of reaching into internals, so the eval stays decoupled.
function parseMetrics(
  stderr: string,
  durationMs: number,
  exitCode: number | null
): RunMetrics {
  const num = (re: RegExp): number | null => {
    const m = stderr.match(re)
    if (!m) return null
    const parsed = Number(m[1].replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }

  return {
    durationMs,
    exitCode,
    cost: num(/Cost:\s*\$([0-9.]+)/),
    totalTokens: num(/Total:\s*([\d,]+) tokens/),
    llmTurns: num(/api-call:.*count:\s*(\d+)/),
    toolCalls: num(/tool-execution:.*count:\s*(\d+)/),
  }
}

export function runAgentForEval(
  prompt: string,
  workDir: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<AgentRun> {
  const startTime = Date.now()

  return new Promise((resolve, reject) => {
    // Default mode is yolo (no permission prompts) — required for unattended runs.
    const proc = spawn('bun', ['run', CLI_PATH, prompt], {
      cwd: workDir,
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      proc.kill('SIGTERM')
      setTimeout(() => proc.kill('SIGKILL'), SIGKILL_GRACE_MS)
    }, timeoutMs)

    proc.stdout?.on('data', d => {
      stdout += d.toString()
    })
    proc.stderr?.on('data', d => {
      stderr += d.toString()
    })

    proc.on('close', code => {
      clearTimeout(timer)
      const durationMs = Date.now() - startTime
      resolve({
        stdout,
        stderr,
        exitCode: code,
        timedOut,
        metrics: parseMetrics(stderr, durationMs, timedOut ? null : code),
      })
    })

    proc.on('error', err => {
      clearTimeout(timer)
      reject(err)
    })
  })
}
