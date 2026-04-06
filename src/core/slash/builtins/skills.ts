import type { CommandContext, CommandResult } from '../types'
import type { SlashCommandRegistry } from '../registry'

export function makeSkillsHandler(registry: SlashCommandRegistry) {
  return async (_ctx: CommandContext): Promise<CommandResult> => {
    const cmds = registry.getAll().filter(c => c.prompt)
    if (cmds.length === 0) {
      process.stderr.write('No skill commands loaded\n')
    } else {
      process.stderr.write('Skill commands:\n')
      for (const cmd of cmds) {
        process.stderr.write(`  /${cmd.name}  — ${cmd.description}\n`)
      }
    }
    return { type: 'handled' }
  }
}
