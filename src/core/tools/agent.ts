import type { Tool } from './registry'
import { AgentDispatcher } from '../agent/dispatcher'
import type { AgentInput } from '../agent/types'
import type { SubAgentModelConfig } from '../agent/process'

let dispatcher: AgentDispatcher | null = null

export function initAgentDispatcher(modelConfig?: SubAgentModelConfig) {
  dispatcher = new AgentDispatcher(modelConfig)
}

export function getAgentDispatcher(): AgentDispatcher {
  if (!dispatcher) {
    // Lazy init with env-based config if not explicitly initialized
    dispatcher = new AgentDispatcher()
  }
  return dispatcher
}

export class AgentTool implements Tool {
  name = 'agent'
  description = 'Invoke a specialized sub-agent to handle a complex task in an isolated process'
  inputSchema = {
    type: 'object',
    properties: {
      subagent_type: {
        type: 'string',
        enum: ['general-purpose', 'explore', 'plan', 'context-gatherer'],
        description: 'Type of sub-agent to invoke'
      },
      description: { type: 'string', description: 'Short description of what the agent will do' },
      prompt: { type: 'string', description: 'Full task prompt for the sub-agent' },
      run_in_background: { type: 'boolean', description: 'Run in background and return agent ID immediately' }
    },
    required: ['subagent_type', 'description', 'prompt']
  }

  async execute(input: AgentInput): Promise<string> {
    const d = getAgentDispatcher()

    const result = await d.dispatch(
      input.subagent_type,
      input.prompt,
      { background: input.run_in_background }
    )

    if (result.status === 'running') {
      return `SubAgent started in background. ID: ${result.agentId}\nUse send_message tool with to: "${result.agentId}" to get the result.`
    } else if (result.status === 'completed') {
      return result.result ?? 'SubAgent completed with no output'
    } else {
      return `SubAgent failed: ${result.result}`
    }
  }
}

export class SendMessageTool implements Tool {
  name = 'send_message'
  description = 'Get the result from a background sub-agent by its agent ID'
  inputSchema = {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Agent ID returned by the agent tool' }
    },
    required: ['to']
  }

  async execute(input: { to: string }): Promise<string> {
    const d = getAgentDispatcher()
    const result = await d.getResult(input.to)
    if (result === null) {
      return `Agent ${input.to} not found. It may have already been collected or the ID is incorrect.`
    }
    return result
  }
}
