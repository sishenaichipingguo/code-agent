import type { CommandContext, CommandResult } from '../types'
import { getCheckpointManager } from '@/core/checkpoint/manager'

export async function undoHandler(
  _ctx: CommandContext
): Promise<CommandResult> {
  const result = await getCheckpointManager().undo()

  if (!result) {
    process.stderr.write('Nothing to undo — no file changes recorded\n')
    return { type: 'handled' }
  }

  const parts: string[] = []
  if (result.restored.length > 0) {
    parts.push(`restored ${result.restored.join(', ')}`)
  }
  if (result.deleted.length > 0) {
    parts.push(`removed ${result.deleted.join(', ')}`)
  }
  const detail = parts.length > 0 ? `: ${parts.join('; ')}` : ''
  process.stderr.write(`✓ Undid "${result.label}"${detail}\n`)
  return { type: 'handled' }
}
