export interface Completion {
  text: string
  display: string
  description?: string
  type: 'command' | 'file' | 'tool' | 'history'
  score: number
}

export interface CompletionContext {
  fullText: string
  beforeCursor: string
  afterCursor: string
  currentWord: string
  isFilePath: boolean
}

export interface CompletionProvider {
  getCompletions(context: CompletionContext): Promise<Completion[]>
}

export class CompletionEngine {
  private providers: CompletionProvider[] = []

  registerProvider(provider: CompletionProvider) {
    this.providers.push(provider)
  }

  async complete(input: string, cursorPosition: number): Promise<Completion[]> {
    const context = this.analyzeContext(input, cursorPosition)

    const results = await Promise.all(
      this.providers.map(p => p.getCompletions(context))
    )

    return results
      .flat()
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
  }

  private analyzeContext(input: string, cursor: number): CompletionContext {
    const beforeCursor = input.slice(0, cursor)
    const words = beforeCursor.split(/\s+/)
    const currentWord = words[words.length - 1] || ''

    return {
      fullText: input,
      beforeCursor,
      afterCursor: input.slice(cursor),
      currentWord,
      isFilePath: currentWord.includes('/') || currentWord.includes('\\')
    }
  }
}
