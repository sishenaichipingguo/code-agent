import { execSync } from 'child_process'
import { platform } from 'os'
import { loadClaudeMd } from './claude-md'
import type { MemoryManager } from '@/core/memory/manager'
import { truncateMemoryIndex } from '@/core/memory/limits'

export class SystemPromptBuilder {
  constructor(
    private cwd: string,
    private memoryManager?: MemoryManager
  ) {}

  async build(): Promise<string> {
    const sections: string[] = []

    // 1. Role + tool usage rules
    sections.push(this.buildCore())

    // 2. Environment info
    sections.push(this.buildEnv())

    // 3. Memory index (if available and non-empty)
    const memory = this.buildMemory()
    if (memory) sections.push(memory)

    // 4. CLAUDE.md (project + global instructions)
    const claudeMd = await loadClaudeMd(this.cwd)
    if (claudeMd) sections.push(claudeMd)

    return sections.join('\n\n---\n\n')
  }

  private buildCore(): string {
    return `You are an expert coding assistant. Use the available tools to complete tasks efficiently and correctly.

## Tool usage rules
- Prefer dedicated tools over bash for file operations (read, write, edit, glob, grep)
- Use bash only for commands that have no dedicated tool equivalent
- Always read a file before editing it
- Make minimal changes — only modify what is necessary for the task
- When editing, prefer small targeted edits over full rewrites
- Do not add comments, docstrings, or type annotations to code you did not change
- Do not add error handling for scenarios that cannot happen
- Do not create files unless absolutely necessary

## Safety rules
- Never skip confirmation hooks or bypass safety checks
- Never force-push to main/master without explicit user instruction
- Prefer reversible actions; warn before destructive operations (rm, reset --hard)
- Do not commit changes unless explicitly asked`
  }

  private buildEnv(): string {
    const os = platform()
    const shell = process.env.SHELL ?? (os === 'win32' ? 'cmd' : 'bash')
    const lines = [
      `## Environment`,
      `- OS: ${os}`,
      `- Shell: ${shell}`,
      `- Working directory: ${this.cwd}`,
      `- Date: ${new Date().toISOString().split('T')[0]}`
    ]

    // Git info — best effort, skip if not a git repo
    try {
      const branch = execSync('git branch --show-current', {
        cwd: this.cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000
      }).toString().trim()

      const status = execSync('git status --short', {
        cwd: this.cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000
      }).toString().trim()

      lines.push(`- Git branch: ${branch || '(detached HEAD)'}`)
      if (status) {
        lines.push(`- Git status (unstaged/staged changes):\n${status.split('\n').map(l => `  ${l}`).join('\n')}`)
      } else {
        lines.push(`- Git status: clean`)
      }
    } catch {
      // Not a git repo or git not available — skip silently
    }

    return lines.join('\n')
  }

  private buildMemory(): string {
    if (!this.memoryManager) return ''
    try {
      const raw = this.memoryManager.loadIndex().trim()
      const hasEntries = /^- \[/m.test(raw)
      if (!hasEntries) return ''
      return `## Memory\n${truncateMemoryIndex(raw)}`
    } catch {
      return ''
    }
  }
}
