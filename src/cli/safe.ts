import type { Args } from './parser'
import { getTokenTracker } from '@/infra/token-tracker'
import { getMetrics } from '@/infra/metrics'
import { getLogger } from '@/infra/logger'
import { AgentInitializer } from '@/core/agent/initializer'

export async function runSafe(args: Args) {
  const init = new AgentInitializer({
    cwd: process.cwd(),
    configPath: args.config,
    model: args.model,
    disableMemory: true
  })
  await init.setup()

  const { config, sessionManager } = init
  const logger = getLogger()

  logger.info('Starting in Safe mode')

  await sessionManager.createSession('safe', config.model)

  const loop = init.buildLoop({ permissionMode: 'default' })

  init.registerShutdownHandlers(loop)

  const message = args.message || await promptUser()
  await loop.run(message)

  await sessionManager.save()
  getTokenTracker().printSummary()
  getMetrics().printSummary()
}

async function promptUser(): Promise<string> {
  process.stderr.write('Enter your request:\n')
  const decoder = new TextDecoder()
  const buffer = new Uint8Array(1024)
  const n = await Bun.stdin.read(buffer)
  return decoder.decode(buffer.slice(0, n)).trim()
}
