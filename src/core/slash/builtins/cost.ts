import type { CommandContext, CommandResult } from '../types'

export async function costHandler(ctx: CommandContext): Promise<CommandResult> {
  ctx.tokenTracker.printSummary()
  return { type: 'handled' }
}
