// src/core/tools/bash.ts
import { spawn } from 'child_process'
import { createTool } from './registry'
import type { PermissionContext } from '@/core/permissions'

// Commands that only read system state — safe to run concurrently
const READONLY_PREFIXES = ['git status', 'git log', 'git diff', 'git show', 'git branch',
  'ls ', 'ls\n', 'cat ', 'head ', 'tail ', 'grep ', 'find ', 'echo ', 'pwd', 'which ',
  'bun test', 'bun run typecheck']

// Commands that modify the filesystem or system state in dangerous ways
const DANGEROUS_PREFIXES = ['rm ', 'rm\n', 'kill ', 'pkill ', 'chmod ', 'chown ',
  'sudo ', 'mkfs', 'dd ', 'curl', 'wget', 'npm install', 'bun install']

function classifyCommand(command: string): 'readonly' | 'dangerous' | 'normal' {
  const cmd = command.trimStart()
  if (READONLY_PREFIXES.some(p => cmd === p.trim() || cmd.startsWith(p))) return 'readonly'
  if (DANGEROUS_PREFIXES.some(p => cmd === p.trim() || cmd.startsWith(p))) return 'dangerous'
  return 'normal'
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
      command:           { type: 'string', description: 'The shell command to execute' },
      timeout:           { type: 'number', description: 'Timeout in ms (default 120000, max 600000)' },
      run_in_background: { type: 'boolean', description: 'Run command in background' },
      description:       { type: 'string', description: 'Description of what the command does' }
    },
    required: ['command']
  },
  isConcurrencySafe: (input: unknown) => {
    const inp = input as { command?: string }
    return typeof inp.command === 'string' && classifyCommand(inp.command) === 'readonly'
  },
  isReadOnly: (input: unknown) => {
    const inp = input as { command?: string }
    return typeof inp.command === 'string' && classifyCommand(inp.command) === 'readonly'
  },
  isDestructive: (input: unknown) => {
    const inp = input as { command?: string }
    return typeof inp.command === 'string' && classifyCommand(inp.command) === 'dangerous'
  },
  checkPermissions: (input: unknown, _ctx: PermissionContext) => {
    const inp = input as { command?: string; description?: string }
    if (typeof inp.command !== 'string') return { type: 'ask' as const, description: 'Run bash command?' }
    if (classifyCommand(inp.command) === 'readonly') return { type: 'allow' as const }
    const desc = inp.description ?? inp.command
    return { type: 'ask' as const, description: `Run: ${desc}` }
  },
  preparePermissionMatcher: (input: unknown) => {
    const inp = input as { command?: string }
    if (typeof inp.command !== 'string') return null
    return { kind: 'bash-prefix' as const, prefix: getPrefix(inp.command) }
  },
  async execute(input: { command: string; timeout?: number; run_in_background?: boolean; description?: string }) {
    const timeout = Math.min(input.timeout ?? 120000, 600000)
    if (input.run_in_background) return executeBackground(input.command)
    return executeForeground(input.command, timeout)
  }
})

function executeForeground(command: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('bash', ['-c', command], { cwd: process.cwd(), env: process.env })
    let stdout = '', stderr = '', killed = false
    const timer = setTimeout(() => {
      killed = true
      proc.kill('SIGTERM')
      setTimeout(() => proc.kill('SIGKILL'), 5000)
    }, timeout)
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
      if (stdout.length > 1048576) stdout = stdout.slice(0, 512000) + '\n... (truncated) ...\n' + stdout.slice(-512000)
    })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code: number | null) => {
      clearTimeout(timer)
      if (killed) reject(new Error(`Command timed out after ${timeout}ms`))
      else if (code !== 0) reject(new Error(`Exit code ${code}\n${stderr}`))
      else resolve(stdout || stderr || 'Command completed')
    })
    proc.on('error', reject)
  })
}

function executeBackground(command: string): Promise<string> {
  const taskId = `bash-${Date.now()}`
  const proc = spawn('bash', ['-c', command], { cwd: process.cwd(), env: process.env, detached: true, stdio: 'ignore' })
  proc.unref()
  return Promise.resolve(`Background task started: ${taskId}`)
}
