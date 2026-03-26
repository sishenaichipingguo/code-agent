import type { SubAgentType, AgentResult } from './types'
import { SUBAGENT_CONFIGS } from './config'
import { SubAgentProcess } from './process'
import { writeFileSync } from 'fs'
import { join } from 'path'

export class AgentDispatcher {
  private runningAgents: Map<string, SubAgentProcess> = new Map()
  private resultCache: Map<string, string> = new Map()

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

    try {
      if (options.background) {
        agent.execute(config, prompt).then(result => {
          this.resultCache.set(agentId, result)
          this.runningAgents.delete(agentId)
        }).catch(() => this.runningAgents.delete(agentId))

        return { agentId, status: 'running' }
      } else {
        const result = await agent.execute(config, prompt)
        this.runningAgents.delete(agentId)
        return { agentId, status: 'completed', result }
      }
    } catch (error: any) {
      this.runningAgents.delete(agentId)
      return { agentId, status: 'failed', result: error.message }
    }
  }

  stop(agentId: string) {
    const agent = this.runningAgents.get(agentId)
    if (agent) {
      agent.kill()
      this.runningAgents.delete(agentId)
    }
  }
}

