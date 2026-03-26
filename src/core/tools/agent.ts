import type { Tool } from './registry'
import { AgentDispatcher } from '../agent/dispatcher'
import type { AgentInput } from '../agent/types'

let dispatcher: AgentDispatcher | null = null

export function initAgentDispatcher() {
  dispatcher = new AgentDispatcher()
}

export function getAgentDispatcher(): AgentDispatcher {
  if (!dispatcher) throw new Error('AgentDispatcher not initialized')
  return dispatcher
}

export class AgentTool implements Tool {
  name = 'agent'
  description = 'Invoke a specialized sub-agent'
  inputSchema = {
    type: 'object',
    properties: {
      subagent_type: {
        type: 'string',
        enum: ['general-purpose', 'explore', 'plan', 'context-gatherer']
      },
      description: { type: 'string' },
      prompt: { type: 'string' },
      run_in_background: { type: 'boolean' }
    },
    required: ['subagent_type', 'description', 'prompt']
  }

  async execute(input: AgentInput): Promise<string> {
    const dispatcher = getAgentDispatcher()

    const result = await dispatcher.dispatch(
      input.subagent_type,
      input.prompt,
      { background: input.run_in_background }
    )

    if (result.status === 'running') {
      return `SubAgent ${result.agentId} started in background`
    } else if (result.status === 'completed') {
      return result.result || 'SubAgent completed'
    } else {
      return `SubAgent failed: ${result.result}`
    }
  }
}

