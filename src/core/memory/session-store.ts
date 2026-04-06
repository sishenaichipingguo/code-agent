import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ModelAdapter } from '@/core/models/adapter'

interface Message {
  role: 'user' | 'assistant'
  content: any
}

export class SessionStore {
  private memoryDir: string
  private summaryPath: string

  constructor(
    private projectRoot: string,
    private model: ModelAdapter
  ) {
    this.memoryDir = join(projectRoot, '.claude', 'memory')
    this.summaryPath = join(this.memoryDir, 'session_summary.md')
  }

  async save(messages: Message[]): Promise<void> {
    if (messages.length < 2) return

    const transcript = messages
      .map(m => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join('\n')

    const prompt = `You are summarising a conversation for a coding assistant's memory system.
Write 2-5 bullet points capturing the key facts, decisions, and preferences revealed in this session.
Be concise. Focus on information useful to future sessions.

CONVERSATION:
${transcript}

SUMMARY:`

    const response = await this.model.chat({
      model: this.model.name,
      messages: [{ role: 'user', content: prompt }],
      stream: false
    }, undefined as any)

    if (response.type !== 'text' || !response.content) return

    if (!existsSync(this.memoryDir)) mkdirSync(this.memoryDir, { recursive: true })
    writeFileSync(this.summaryPath, `# Last Session Summary\n\n${response.content.trim()}\n`)
  }

  load(): string {
    if (!existsSync(this.summaryPath)) return ''
    try {
      return readFileSync(this.summaryPath, 'utf-8')
    } catch {
      return ''
    }
  }
}
