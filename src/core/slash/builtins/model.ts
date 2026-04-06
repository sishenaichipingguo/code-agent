import type { CommandContext, CommandResult } from '../types'

export async function modelHandler(ctx: CommandContext): Promise<CommandResult> {
  if (!ctx.args) {
    process.stderr.write(`Current model: ${ctx.config.model}\n`)
  } else {
    process.stderr.write(`Model switching not supported at runtime. Set model in .agent.yml or use --model flag.\n`)
  }
  return { type: 'handled' }
}
