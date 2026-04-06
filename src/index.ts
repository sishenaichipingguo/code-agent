import { AgentInitializer } from '@/core/agent/initializer'
import { AgentLoop } from '@/core/agent/loop'
import type { AgentInitOptions } from '@/core/agent/initializer'

export interface AgentInstance {
  run: (message: string) => Promise<string>
  loop: AgentLoop
  init: AgentInitializer
}

export type { AgentInitOptions }

export async function createAgent(opts: AgentInitOptions = {}): Promise<AgentInstance> {
  const init = new AgentInitializer(opts)
  await init.setup()

  const systemPrompt = await init.buildSystemPrompt()
  const loop = init.buildLoop({ permissionMode: 'bypass', systemPrompt })

  init.registerShutdownHandlers(loop)

  return {
    run: (message: string) => loop.run(message),
    loop,
    init
  }
}
