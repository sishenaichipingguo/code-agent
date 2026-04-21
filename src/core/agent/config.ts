import type { SubAgentConfig, SubAgentType } from './types'

export const SUBAGENT_CONFIGS: Record<SubAgentType, SubAgentConfig> = {
  'general-purpose': {
    type: 'general-purpose',
    allowedTools: ['read', 'write', 'edit', 'glob', 'grep', 'bash', 'ls', 'cp', 'mv', 'rm'],
    maxTokens: 100000,
    timeout: 600000,
    systemPrompt: 'You are a general-purpose task execution agent. Use all available tools to complete complex tasks.'
  },

  'explore': {
    type: 'explore',
    allowedTools: ['read', 'glob', 'grep', 'ls'],
    maxTokens: 500000,
    timeout: 300000,
    systemPrompt: 'You are a codebase exploration expert. Quickly locate relevant files and code using read-only tools.'
  },

  'plan': {
    type: 'plan',
    allowedTools: ['read', 'glob', 'grep', 'ls', 'enter_plan_mode', 'exit_plan_mode'],
    maxTokens: 80000,
    timeout: 480000,
    systemPrompt: 'You are an architecture design expert. Create implementation plans without modifying code.'
  },

  'context-gatherer': {
    type: 'context-gatherer',
    allowedTools: ['read', 'glob', 'grep', 'bash'],
    maxTokens: 60000,
    timeout: 360000,
    systemPrompt: 'You are a context gathering expert. Intelligently identify relevant code and dependencies.'
  }
}
