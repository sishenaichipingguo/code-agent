import type { CommandContext, CommandResult } from '../types'

export async function sessionHandler(ctx: CommandContext): Promise<CommandResult> {
  const session = ctx.sessionManager.getCurrentSession()
  if (!session) {
    process.stderr.write('No active session\n')
  } else {
    process.stderr.write(`Session: ${session.id}\n  Messages: ${session.messages.length}\n  Model: ${session.metadata.model}\n`)
  }
  return { type: 'handled' }
}
