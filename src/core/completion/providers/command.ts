import type { CompletionProvider, CompletionContext, Completion } from '../engine'

export class CommandCompletionProvider implements CompletionProvider {
  private commands = [
    'create file',
    'create directory',
    'read file',
    'edit file',
    'delete file',
    'list files',
    'search in files',
    'copy file',
    'move file',
    'run command'
  ]

  async getCompletions(context: CompletionContext): Promise<Completion[]> {
    const text = context.beforeCursor.toLowerCase()

    return this.commands
      .filter(cmd => cmd.startsWith(text) || cmd.includes(text))
      .map(cmd => ({
        text: cmd,
        display: cmd,
        type: 'command' as const,
        score: cmd.startsWith(text) ? 90 : 60
      }))
  }
}
