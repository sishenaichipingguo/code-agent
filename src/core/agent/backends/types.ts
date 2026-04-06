import type { SubAgentConfig } from '../types'
import type { SubAgentModelConfig } from '../process'

export const BACKEND_TYPES = ['in-process', 'tmux', 'iterm2'] as const
export type BackendType = typeof BACKEND_TYPES[number]

export interface AgentBackend {
  /** backend 名称，用于日志 */
  readonly name: BackendType

  /** 执行子 Agent，返回最终文本结果 */
  execute(
    config: SubAgentConfig,
    prompt: string,
    modelConfig: SubAgentModelConfig
  ): Promise<string>

  /** 终止子 Agent */
  kill(): void
}
