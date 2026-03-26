export type SubAgentType = 'general-purpose' | 'explore' | 'plan' | 'context-gatherer'

export interface SubAgentConfig {
  type: SubAgentType
  allowedTools: string[]
  maxTokens: number
  timeout: number
  systemPrompt: string
}

export interface AgentResult {
  agentId: string
  status: 'running' | 'completed' | 'failed'
  result?: string
  metadata?: {
    toolsUsed: string[]
    filesAccessed: string[]
    tokensUsed: number
  }
}

export interface AgentInput {
  subagent_type: SubAgentType
  prompt: string
  description: string
  run_in_background?: boolean
  model?: string
}
