import type { SubAgentType, AgentResult } from './types'
import type { BackendType } from './backends/types'
import { SUBAGENT_CONFIGS } from './config'
import { BackendFactory } from './backends/factory'
import type { AgentBackend } from './backends/types'
import type { SubAgentModelConfig } from './process'

export class AgentDispatcher {
  private runningAgents: Map<string, AgentBackend> = new Map()
  private resultCache: Map<string, Promise<string>> = new Map()
  private modelConfig: SubAgentModelConfig
  readonly backendType: BackendType

  constructor(modelConfig?: SubAgentModelConfig, backendType?: BackendType) {
    this.modelConfig = modelConfig ?? {
      provider: process.env.SUBAGENT_PROVIDER ?? 'anthropic',
      model: process.env.AGENT_MODEL ?? 'claude-sonnet-4',
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.AGENT_BASE_URL
    }
    const detected = BackendFactory.detect()
    this.backendType = backendType ?? detected.name
  }

  async dispatch(
    type: SubAgentType,
    prompt: string,
    options: { background?: boolean; backend?: BackendType } = {}
  ): Promise<AgentResult> {
    const config = SUBAGENT_CONFIGS[type]
    if (!config) throw new Error(`Unknown agent type: ${type}`)

    const agentId = `${type}-${Date.now()}`
    const backend = options.backend
      ? BackendFactory.create(options.backend)
      : BackendFactory.create(this.backendType)

    this.runningAgents.set(agentId, backend)

    const executePromise = backend.execute(config, prompt, this.modelConfig)
      .finally(() => this.runningAgents.delete(agentId))

    if (options.background) {
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
    const backend = this.runningAgents.get(agentId)
    if (backend) {
      backend.kill()
      this.runningAgents.delete(agentId)
    }
  }
}
