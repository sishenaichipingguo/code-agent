// src/core/slash/types.ts
import type { AgentLoop } from '@/core/agent/loop'
import type { Config } from '@/core/config/schema'
import type { TokenTracker } from '@/infra/token-tracker'
import type { SessionManager } from '@/core/session/manager'

export interface SlashCommand {
  name: string
  description: string
  args?: 'required' | 'optional' | 'none'
  handler?: (ctx: CommandContext) => Promise<CommandResult>
  prompt?: string
}

export interface CommandContext {
  args: string
  loop: AgentLoop
  config: Config
  tokenTracker: TokenTracker
  sessionManager: SessionManager
}

export type CommandResult =
  | { type: 'handled' }
  | { type: 'inject'; message: string }
  | { type: 'unknown' }
