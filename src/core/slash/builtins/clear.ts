import type { CommandContext, CommandResult } from '../types'

export async function clearHandler(ctx: CommandContext): Promise<CommandResult> {
  ctx.loop.clearMessages()
  process.stderr.write('✓ Conversation history cleared\n')
  return { type: 'handled' }
}
