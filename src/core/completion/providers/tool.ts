import type { CompletionProvider, CompletionContext, Completion } from '../engine'

export class ToolCompletionProvider implements CompletionProvider {
  private tools = [
    { name: 'bash', description: 'Execute shell command' },
    { name: 'read', description: 'Read file contents' },
    { name: 'write', description: 'Write to file' },
    { name: 'edit', description: 'Edit file' },
    { name: 'glob', description: 'Find files by pattern' },
    { name: 'grep', description: 'Search in files' },
    { name: 'ls', description: 'List directory' },
    { name: 'cp', description: 'Copy file' },
    { name: 'mv', description: 'Move/rename file' },
    { name: 'rm', description: 'Delete file' }
  ]

  async getCompletions(context: CompletionContext): Promise<Completion[]> {
    const word = context.currentWord.toLowerCase()

    return this.tools
      .filter(t => t.name.startsWith(word))
      .map(t => ({
        text: t.name,
        display: t.name,
        description: t.description,
        type: 'tool' as const,
        score: t.name === word ? 100 : 70
      }))
  }
}
