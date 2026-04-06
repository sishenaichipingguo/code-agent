import type { ModelAdapter } from '@/core/models/adapter'
import type { MemoryManager } from './manager'
import type { MemoryType } from './types'

interface Message {
  role: 'user' | 'assistant'
  content: any
}

interface ExtractedEntry {
  name: string
  description: string
  type: MemoryType
  content: string
}

export class AutoExtractor {
  constructor(
    private manager: MemoryManager,
    private model: ModelAdapter
  ) {}

  async extract(messages: Message[]): Promise<void> {
    if (messages.length < 2) return

    const existingIndex = this.manager.loadIndex()
    const transcript = messages
      .map(m => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join('\n')

    const prompt = `You are extracting persistent facts from a coding assistant conversation.
Return a JSON array of memory entries to save. Each entry: { name, description, type, content }
- type must be one of: user, feedback, project, reference
- name must be a short kebab-case identifier
- Only extract facts that would be useful across future sessions
- Skip anything already in the existing memory index below
- Return [] if nothing new is worth saving

EXISTING MEMORY INDEX:
${existingIndex}

CONVERSATION:
${transcript}

JSON:`

    const response = await this.model.chat({
      model: this.model.name,
      messages: [{ role: 'user', content: prompt }],
      stream: false
    }, undefined as any)

    if (response.type !== 'text' || !response.content) return

    let entries: ExtractedEntry[]
    try {
      const jsonMatch = response.content.match(/\[[\s\S]*\]/)
      entries = JSON.parse(jsonMatch?.[0] ?? '[]')
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.name || !entry.type || !entry.content) continue
      if (existingIndex.includes(`[${entry.name}]`)) continue
      try {
        this.manager.save({
          name: entry.name,
          description: entry.description ?? '',
          type: entry.type,
          content: entry.content
        })
      } catch {
        // Skip malformed entries silently
      }
    }
  }
}
