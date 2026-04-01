import type { SubAgentType, AgentResult } from './types'
import { SUBAGENT_CONFIGS } from './config'
import { SubAgentProcess } from './process'
import type { SubAgentModelConfig } from './process'

export class AgentDispatcher {
  private runningAgents: Map<string, SubAgentProcess> = new Map()
  private resultCache: Map<string, Promise<string>> = new Map()
  private modelConfig: SubAgentModelConfig

  constructor(modelConfig?: SubAgentModelConfig) {
    this.modelConfig = modelConfig ?? {
      provider: process.env.SUBAGENT_PROVIDER ?? 'anthropic',
      model: process.env.AGENT_MODEL ?? 'claude-sonnet-4',
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.AGENT_BASE_URL
    }
  }

  async dispatch(
    type: SubAgentType,
    prompt: string,
    options: { background?: boolean } = {}
  ): Promise<AgentResult> {
    const config = SUBAGENT_CONFIGS[type]
    if (!config) throw new Error(`Unknown agent type: ${type}`)

    const agentId = `${type}-${Date.now()}`
    const agent = new SubAgentProcess()

    this.runningAgents.set(agentId, agent)

    const executePromise = agent.execute(config, prompt, this.modelConfig)
      .finally(() => this.runningAgents.delete(agentId))

    if (options.background) {
      // Store the promise so getResult() can await it later
      this.resultCache.set(agentId, executePromise.catch(err => `SubAgent failed: ${err.message}`))
      return { agentId, status: 'running' }
    }

    try {
      const result = await executePromise
      return { agentId, status: 'completed', result }
    } catch (error: any) {
      return { agentId, status: 'failed', result: error.message }
    }
  }

  async getResult(agentId: string): Promise<string | null> {
    const promise = this.resultCache.get(agentId)
    if (!promise) return null
    return promise
  }

  stop(agentId: string) {
    const agent = this.runningAgents.get(agentId)
    if (agent) {
      agent.kill()
      this.runningAgents.delete(agentId)
    }
  }
}
