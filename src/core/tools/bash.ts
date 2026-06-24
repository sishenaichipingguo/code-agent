// src/core/tools/bash.ts
import { spawn } from 'child_process'
import { openSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createTool } from './registry'
import type { PermissionContext } from '@/core/permissions'

// Grace period between SIGTERM and SIGKILL when a command exceeds its timeout.
const SIGKILL_GRACE_MS = 2000

// Commands that only read system state — safe to run concurrently
const READONLY_PREFIXES = [
  'git status',
  'git log',
  'git diff',
  'git show',
  'git branch',
  'ls ',
  'ls\n',
  'cat ',
  'head ',
  'tail ',
  'grep ',
  'find ',
  'echo ',
  'pwd',
  'which ',
  'bun test',
  'bun run typecheck',
]

// Commands that modify the filesystem or system state in dangerous ways
const DANGEROUS_PREFIXES = [
  'rm ',
  'rm\n',
  'kill ',
  'pkill ',
  'chmod ',
  'chown ',
  'sudo ',
  'mkfs',
  'dd ',
  'curl',
  'wget',
  'npm install',
  'bun install',
]

// Constructs that embed or redirect commands — a readonly-looking outer command
// can still cause side effects through these, so they never get the readonly fast-path.
const SUBSTITUTION_PATTERN = /\$\(|`|<\(/
const REDIRECT_PATTERN = /[<>]/

// Split a command line into atomic command segments, also extracting the bodies
// of command substitutions so a dangerous command hidden inside `$(...)`/`...`/<(...) is seen.
function extractSegments(command: string): string[] {
  const normalized = command
    .replace(/\$\(/g, ';')
    .replace(/<\(/g, ';')
    .replace(/[`)]/g, ';')
  return normalized
    .split(/\|\||&&|;|\||\n|&|>|</)
    .map(s => s.trim())
    .filter(Boolean)
}

function classifyAtomic(segment: string): 'readonly' | 'dangerous' | 'normal' {
  const cmd = segment.trimStart()
  if (!cmd) return 'readonly'
  if (DANGEROUS_PREFIXES.some(p => cmd === p.trim() || cmd.startsWith(p)))
    return 'dangerous'
  if (READONLY_PREFIXES.some(p => cmd === p.trim() || cmd.startsWith(p)))
    return 'readonly'
  return 'normal'
}

export function classifyCommand(
  command: string
): 'readonly' | 'dangerous' | 'normal' {
  const trimmed = command.trimStart()
  const classes = extractSegments(trimmed).map(classifyAtomic)

  // Any dangerous segment (including ones hidden in substitutions) dominates.
  if (classes.includes('dangerous')) return 'dangerous'

  // Substitution/redirection can hide side effects → never fast-path as readonly.
  if (SUBSTITUTION_PATTERN.test(trimmed) || REDIRECT_PATTERN.test(trimmed))
    return 'normal'

  // Only treat as readonly when every segment is independently readonly.
  return classes.length > 0 && classes.every(c => c === 'readonly')
    ? 'readonly'
    : 'normal'
}

function getPrefix(command: string): string {
  return command.trimStart().split(/\s+/)[0] ?? command.trimStart()
}

export const BashTool = createTool({
  name: 'bash',
  description: 'Execute a shell command and return the output',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      timeout: {
        type: 'number',
        description: 'Timeout in ms (default 120000, max 600000)',
      },
      run_in_background: {
        type: 'boolean',
        description: 'Run command in background',
      },
      description: {
        type: 'string',
        description: 'Description of what the command does',
      },
    },
    required: ['command'],
  },
  isConcurrencySafe: (input: unknown) => {
    const inp = input as { command?: string }
    return (
      typeof inp.command === 'string' &&
      classifyCommand(inp.command) === 'readonly'
    )
  },
  isReadOnly: (input: unknown) => {
    const inp = input as { command?: string }
    return (
      typeof inp.command === 'string' &&
      classifyCommand(inp.command) === 'readonly'
    )
  },
  isDestructive: (input: unknown) => {
    const inp = input as { command?: string }
    return (
      typeof inp.command === 'string' &&
      classifyCommand(inp.command) === 'dangerous'
    )
  },
  checkPermissions: (input: unknown, _ctx: PermissionContext) => {
    const inp = input as { command?: string; description?: string }
    if (typeof inp.command !== 'string')
      return { type: 'ask' as const, description: 'Run bash command?' }
    if (classifyCommand(inp.command) === 'readonly')
      return { type: 'allow' as const }
    const desc = inp.description ?? inp.command
    return { type: 'ask' as const, description: `Run: ${desc}` }
  },
  preparePermissionMatcher: (input: unknown) => {
    const inp = input as { command?: string }
    if (typeof inp.command !== 'string') return null
    return { kind: 'bash-prefix' as const, prefix: getPrefix(inp.command) }
  },
  async execute(input: {
    command: string
    timeout?: number
    run_in_background?: boolean
    description?: string
  }) {
    const timeout = Math.min(input.timeout ?? 120000, 600000)
    if (input.run_in_background) return executeBackground(input.command)
    return executeForeground(input.command, timeout)
  },
})

function executeForeground(command: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('bash', ['-c', command], {
      cwd: process.cwd(),
      env: process.env,
    })
    let stdout = '',
      stderr = '',
      killed = false
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
      killed = true
      proc.kill('SIGTERM')
      killTimer = setTimeout(() => proc.kill('SIGKILL'), SIGKILL_GRACE_MS)
    }, timeout)
    const clearTimers = () => {
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
    }
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
      if (stdout.length > 1048576)
        stdout =
          stdout.slice(0, 512000) +
          '\n... (truncated) ...\n' +
          stdout.slice(-512000)
    })
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on('close', (code: number | null) => {
      clearTimers()
      if (killed) reject(new Error(`Command timed out after ${timeout}ms`))
      else if (code !== 0) reject(new Error(`Exit code ${code}\n${stderr}`))
      else resolve(stdout || stderr || 'Command completed')
    })
    proc.on('error', (err: Error) => {
      clearTimers()
      reject(err)
    })
  })
}

function executeBackground(command: string): Promise<string> {
  const taskId = `bash-${Date.now()}`
  // Stream output to a log file so the result is actually retrievable later,
  // instead of being discarded with stdio: 'ignore'.
  const logPath = join(tmpdir(), `${taskId}.log`)
  const logFd = openSync(logPath, 'a')
  const proc = spawn('bash', ['-c', command], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  })
  proc.unref()
  return Promise.resolve(
    `Background task ${taskId} started (pid ${proc.pid}). ` +
      `Output is streaming to ${logPath} — read it with: cat ${logPath}`
  )
}
