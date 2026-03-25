import { readdir } from 'fs/promises'
import { join, dirname, basename } from 'path'
import type { CompletionProvider, CompletionContext, Completion } from '../engine'

export class FilePathCompletionProvider implements CompletionProvider {
  async getCompletions(context: CompletionContext): Promise<Completion[]> {
    if (!context.isFilePath) return []

    try {
      const partial = context.currentWord
      const dir = dirname(partial) || '.'
      const base = basename(partial)

      const files = await readdir(dir, { withFileTypes: true })

      return files
        .filter(f => f.name.startsWith(base))
        .map(f => ({
          text: join(dir, f.name),
          display: f.name,
          description: f.isDirectory() ? 'directory' : 'file',
          type: 'file' as const,
          score: this.calculateScore(f.name, base)
        }))
    } catch {
      return []
    }
  }

  private calculateScore(name: string, partial: string): number {
    if (name === partial) return 100
    if (name.startsWith(partial)) return 80
    return 50
  }
}
