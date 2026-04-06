import type { CommandContext, CommandResult } from '../types'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export async function memoryHandler(_ctx: CommandContext): Promise<CommandResult> {
  const indexPath = join(process.cwd(), '.claude', 'memory', 'MEMORY.md')
  if (!existsSync(indexPath)) {
    process.stderr.write('No memory index found\n')
  } else {
    process.stderr.write(readFileSync(indexPath, 'utf-8') + '\n')
  }
  return { type: 'handled' }
}
