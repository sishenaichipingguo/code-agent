import type { CommandContext, CommandResult } from '../types'

export async function compactHandler(ctx: CommandContext): Promise<CommandResult> {
  await ctx.loop.compact(ctx.loop.getMessages())
  return { type: 'handled' }
}
