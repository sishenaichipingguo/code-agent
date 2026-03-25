import type { CompletionProvider, CompletionContext, Completion } from '../engine'
import type { HistoryManager } from '@/core/history/manager'

export class HistoryCompletionProvider implements CompletionProvider {
  constructor(private history: HistoryManager) {}

  async getCompletions(context: CompletionContext): Promise<Completion[]> {
    const results = await this.history.search(context.beforeCursor)

    return results.map(h => ({
      text: h.command,
      display: h.command,
      description: this.formatTime(h.timestamp),
      type: 'history' as const,
      score: 85
    }))
  }

  private formatTime(timestamp: number): string {
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }
}
