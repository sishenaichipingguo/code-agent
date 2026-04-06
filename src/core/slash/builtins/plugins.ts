import type { CommandContext, CommandResult } from '../types'

export function makePluginsHandler(pluginManager: { getLoaded(): Array<{ name: string; version: string }> }) {
  return async (_ctx: CommandContext): Promise<CommandResult> => {
    const plugins = pluginManager.getLoaded()
    if (plugins.length === 0) {
      process.stderr.write('No plugins loaded\n')
    } else {
      process.stderr.write('Loaded plugins:\n')
      for (const p of plugins) {
        process.stderr.write(`  ${p.name}@${p.version}\n`)
      }
    }
    return { type: 'handled' }
  }
}
