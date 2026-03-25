import { appendFile, readFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname } from 'path'

export interface HistoryEntry {
  id: string
  command: string
  timestamp: number
  success: boolean
}

export class HistoryManager {
  private historyFile = '.agent/history.jsonl'
  private cache: HistoryEntry[] = []

  async init() {
    await this.ensureDir()
    await this.load()
  }

  async add(command: string, success: boolean = true) {
    const entry: HistoryEntry = {
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      command,
      timestamp: Date.now(),
      success
    }

    this.cache.push(entry)
    await this.persist(entry)
  }

  async getRecent(limit: number = 10): Promise<HistoryEntry[]> {
    return this.cache.slice(-limit).reverse()
  }

  async search(query: string): Promise<HistoryEntry[]> {
    return this.cache
      .filter(e => e.command.toLowerCase().includes(query.toLowerCase()))
      .slice(-10)
      .reverse()
  }

  private async load() {
    try {
      if (!existsSync(this.historyFile)) return

      const content = await readFile(this.historyFile, 'utf-8')
      const lines = content.trim().split('\n')

      this.cache = lines
        .filter(l => l.trim())
        .map(l => JSON.parse(l))
    } catch {
      this.cache = []
    }
  }

  private async persist(entry: HistoryEntry) {
    try {
      await appendFile(this.historyFile, JSON.stringify(entry) + '\n')
    } catch {}
  }

  private async ensureDir() {
    const dir = dirname(this.historyFile)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
  }
}
