import type { SlashCommand, CommandContext, CommandResult } from './types'

export class SlashCommandRegistry {
  private commands = new Map<string, { cmd: SlashCommand; priority: number }>()

  register(cmd: SlashCommand, priority = 0) {
    const existing = this.commands.get(cmd.name)
    if (!existing || priority >= existing.priority) {
      this.commands.set(cmd.name, { cmd, priority })
    }
  }

  async dispatch(rawMessage: string, ctx: CommandContext): Promise<CommandResult> {
    if (!rawMessage.startsWith('/')) return { type: 'unknown' }

    const spaceIdx = rawMessage.indexOf(' ')
    const name = spaceIdx === -1
      ? rawMessage.slice(1)
      : rawMessage.slice(1, spaceIdx)
    const args = spaceIdx === -1 ? '' : rawMessage.slice(spaceIdx + 1).trim()

    const entry = this.commands.get(name)
    if (!entry) {
      process.stderr.write(`Unknown command: /${name}. Run /help for available commands.\n`)
      return { type: 'unknown' }
    }

    const cmdCtx: CommandContext = { ...ctx, args }

    if (entry.cmd.handler) {
      try {
        return await entry.cmd.handler(cmdCtx)
      } catch (err: any) {
        process.stderr.write(`Error running /${name}: ${err.message}\n`)
        return { type: 'handled' }
      }
    }

    if (entry.cmd.prompt) {
      const message = entry.cmd.prompt.replace(/\{\{args\}\}/g, args)
      return { type: 'inject', message }
    }

    return { type: 'handled' }
  }

  getAll(): SlashCommand[] {
    return Array.from(this.commands.values())
      .sort((a, b) => b.priority - a.priority)
      .map(e => e.cmd)
  }
}
