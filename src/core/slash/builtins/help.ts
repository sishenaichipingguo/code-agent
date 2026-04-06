import type { CommandContext, CommandResult } from '../types'
import type { SlashCommandRegistry } from '../registry'

export function makeHelpHandler(registry: SlashCommandRegistry) {
  return async (_ctx: CommandContext): Promise<CommandResult> => {
    const cmds = registry.getAll()
    process.stderr.write('Available commands:\n')
    for (const cmd of cmds) {
      const argHint = cmd.args === 'required' ? ' <args>' : cmd.args === 'optional' ? ' [args]' : ''
      process.stderr.write(`  /${cmd.name}${argHint}  — ${cmd.description}\n`)
    }
    return { type: 'handled' }
  }
}
